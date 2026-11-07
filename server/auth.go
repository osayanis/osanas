package main

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Un seul compte. Tant qu'aucun mot de passe n'est choisi, c'est « admin »
// et l'interface invite à le changer. Hash : PBKDF2-SHA256 salé.

const (
	pwIter     = 60000
	sessionTTL = 14 * 24 * time.Hour
	cookieName = "osanas"
)

type authConf struct {
	Salt string `json:"salt"`
	Iter int    `json:"iter"`
	Hash string `json:"hash"`
}

var (
	sessMu   sync.Mutex
	sessions = map[string]time.Time{}
	failMu   sync.Mutex
	fails    int
	lastFail time.Time
)

func authFile() string { return filepath.Join(confDir, "auth.json") }

func loadAuth() *authConf {
	b, err := os.ReadFile(authFile())
	if err != nil {
		return nil
	}
	var c authConf
	if json.Unmarshal(b, &c) != nil || c.Hash == "" {
		return nil
	}
	return &c
}

func derive(pw string, salt []byte, iter int) []byte {
	k, _ := pbkdf2.Key(sha256.New, pw, salt, iter, 32)
	return k
}

func checkPassword(pw string) bool {
	c := loadAuth()
	if c == nil {
		return subtle.ConstantTimeCompare([]byte(pw), []byte("admin")) == 1
	}
	salt, _ := hex.DecodeString(c.Salt)
	want, _ := hex.DecodeString(c.Hash)
	return subtle.ConstantTimeCompare(derive(pw, salt, c.Iter), want) == 1
}

func setPassword(pw string) error {
	salt := make([]byte, 16)
	rand.Read(salt)
	c := authConf{Salt: hex.EncodeToString(salt), Iter: pwIter, Hash: hex.EncodeToString(derive(pw, salt, pwIter))}
	b, _ := json.Marshal(c)
	os.MkdirAll(confDir, 0o700)
	tmp := authFile() + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, authFile())
}

// Frein aux essais en rafale : délai croissant après chaque échec (remis à zéro après 15 min calmes).
func throttle() {
	failMu.Lock()
	if time.Since(lastFail) > 15*time.Minute {
		fails = 0
	}
	n := fails
	failMu.Unlock()
	if n > 2 {
		d := time.Duration(n-2) * time.Second
		if d > 10*time.Second {
			d = 10 * time.Second
		}
		time.Sleep(d)
	}
}
func noteFail() {
	failMu.Lock()
	fails++
	lastFail = time.Now()
	failMu.Unlock()
}

// Sessions gardées sur disque : un redémarrage du NAS ou une mise à jour ne déconnecte personne.
func sessFile() string { return filepath.Join(confDir, "sessions.json") }

func loadSessions() {
	b, err := os.ReadFile(sessFile())
	if err != nil {
		return
	}
	sessMu.Lock()
	json.Unmarshal(b, &sessions)
	sessMu.Unlock()
}

// appelé avec sessMu verrouillé
func saveSessionsLocked() {
	b, _ := json.Marshal(sessions)
	tmp := sessFile() + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		os.Rename(tmp, sessFile())
	}
}

func newSession(w http.ResponseWriter, r *http.Request) {
	b := make([]byte, 24)
	rand.Read(b)
	tok := hex.EncodeToString(b)
	sessMu.Lock()
	now := time.Now()
	for k, exp := range sessions { // ménage
		if now.After(exp) {
			delete(sessions, k)
		}
	}
	sessions[tok] = now.Add(sessionTTL)
	saveSessionsLocked()
	sessMu.Unlock()
	// Secure seulement derrière HTTPS (nas.osalabs.fr) : en local, le panneau est en HTTP
	secure := r.Header.Get("X-Forwarded-Proto") == "https"
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: tok, Path: "/", MaxAge: int(sessionTTL.Seconds()), HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode})
}

func loggedIn(r *http.Request) bool {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return false
	}
	sessMu.Lock()
	defer sessMu.Unlock()
	exp, ok := sessions[c.Value]
	if !ok || time.Now().After(exp) {
		return false
	}
	sessions[c.Value] = time.Now().Add(sessionTTL) // glissant
	return true
}

func endSession(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		sessMu.Lock()
		delete(sessions, c.Value)
		saveSessionsLocked()
		sessMu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
}
