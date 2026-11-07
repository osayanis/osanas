package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"time"
)

type apiErr struct {
	code int
	msg  string
}

func (e apiErr) Error() string        { return e.msg }
func fail(code int, msg string) error { return apiErr{code, msg} }

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

type args map[string]any

func (a args) str(k string) string {
	if v, ok := a[k].(string); ok {
		return v
	}
	return ""
}
func (a args) list(k string) []string {
	var out []string
	if v, ok := a[k].([]any); ok {
		for _, x := range v {
			if s, ok := x.(string); ok {
				out = append(out, s)
			}
		}
	}
	return out
}

func api(w http.ResponseWriter, r *http.Request) {
	act := r.URL.Query().Get("a")
	var res any
	err := func() error {
		// Les actions qui modifient : POST + en-tête X-Osa (un autre site ne peut pas l'envoyer).
		write := act != "me" && act != "status" && act != "disks" && act != "ls" && act != "get"
		if write && (r.Method != http.MethodPost || r.Header.Get("X-Osa") == "") {
			return fail(403, "Requête refusée")
		}
		if act != "me" && act != "login" && !loggedIn(r) {
			return fail(401, "Connexion requise")
		}
		a := args{}
		if r.Method == http.MethodPost && strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&a)
		}
		for k, v := range r.URL.Query() {
			if _, ok := a[k]; !ok && len(v) > 0 {
				a[k] = v[0]
			}
		}
		switch act {
		case "me":
			if !loggedIn(r) {
				res = map[string]any{"user": nil}
			} else {
				res = map[string]any{"user": "admin", "admin": true, "defaultPassword": loadAuth() == nil}
			}
		case "login":
			throttle()
			if !checkPassword(a.str("pass")) {
				noteFail()
				time.Sleep(700 * time.Millisecond)
				return fail(401, "Mot de passe incorrect")
			}
			newSession(w)
			res = map[string]any{"user": "admin", "admin": true, "defaultPassword": loadAuth() == nil}
		case "logout":
			endSession(w, r)
			res = map[string]any{"ok": true}
		case "password":
			if !checkPassword(a.str("current")) {
				noteFail()
				return fail(401, "Mot de passe actuel incorrect")
			}
			if len(a.str("next")) < 6 {
				return fail(400, "6 caractères minimum")
			}
			if err := setPassword(a.str("next")); err != nil {
				return fail(500, "Écriture impossible")
			}
			sessMu.Lock() // les autres appareils devront se reconnecter
			sessions = map[string]time.Time{}
			sessMu.Unlock()
			newSession(w)
			res = map[string]any{"ok": true}
		case "status":
			res = status()
		case "disks":
			res = map[string]any{"disks": disks()}
		case "ls":
			return list(w, a)
		case "get":
			return get(w, r, a)
		case "mkdir":
			dir, err := absDir(a.str("path"))
			if err != nil {
				return err
			}
			name, err := validName(a.str("name"))
			if err != nil {
				return err
			}
			p := filepath.Join(dir, name)
			if exists(p) {
				return fail(400, "Ce nom existe déjà")
			}
			if os.Mkdir(p, 0o777) != nil {
				return fail(500, "Impossible de créer le dossier")
			}
			os.Chmod(p, 0o777)
			res = map[string]any{"ok": true}
		case "rename":
			rel, err := cleanRel(a.str("path"))
			if err != nil || rel == "" {
				return fail(400, "Chemin invalide")
			}
			src, err := abs(rel)
			if err != nil {
				return err
			}
			name, err := validName(a.str("name"))
			if err != nil {
				return err
			}
			dst := filepath.Join(filepath.Dir(src), name)
			if !exists(src) {
				return fail(404, "Introuvable")
			}
			if exists(dst) {
				return fail(400, "Ce nom existe déjà")
			}
			if os.Rename(src, dst) != nil {
				return fail(500, "Impossible de renommer")
			}
			res = map[string]any{"ok": true}
		case "move":
			to, err := absDir(a.str("to"))
			if err != nil {
				return err
			}
			for _, rp := range a.list("paths") {
				rel, err := cleanRel(rp)
				if err != nil || rel == "" {
					continue
				}
				src, err := abs(rel)
				if err != nil {
					return err
				}
				dst := filepath.Join(to, filepath.Base(src))
				if strings.HasPrefix(to+"/", src+"/") {
					return fail(400, "Impossible de déplacer un dossier dans lui-même")
				}
				if exists(dst) {
					return fail(400, "« "+filepath.Base(src)+" » existe déjà à destination")
				}
				if os.Rename(src, dst) != nil {
					return fail(500, "Impossible de déplacer « "+filepath.Base(src)+" »")
				}
			}
			res = map[string]any{"ok": true}
		case "delete":
			for _, rp := range a.list("paths") {
				rel, err := cleanRel(rp)
				if err != nil {
					return err
				}
				if rel == "" {
					return fail(400, "Impossible de supprimer la racine")
				}
				p, err := abs(rel)
				if err != nil {
					return err
				}
				if os.RemoveAll(p) != nil {
					return fail(500, "Impossible de supprimer « "+filepath.Base(p)+" »")
				}
				os.Remove(filepath.Join(filepath.Dir(p), "._"+filepath.Base(p))) // fourche de ressources laissée par macOS via SMB
			}
			res = map[string]any{"ok": true}
		case "upload":
			v, err := upload(r)
			if err != nil {
				return err
			}
			res = v
		case "power":
			what := a.str("what")
			cmd := map[string]string{"restart": "/sbin/reboot", "shutdown": "/usr/sbin/poweroff"}[what]
			if cmd == "" {
				return fail(400, "Action inconnue")
			}
			go func() { time.Sleep(time.Second); exec.Command(cmd).Run() }()
			res = map[string]any{"ok": true}
		default:
			return fail(404, "Action inconnue")
		}
		return nil
	}()
	if err != nil {
		var e apiErr
		if errors.As(err, &e) {
			if act == "get" {
				http.Error(w, e.msg, e.code)
				return
			}
			writeJSON(w, e.code, map[string]string{"error": e.msg})
			return
		}
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	if res != nil {
		writeJSON(w, 200, res)
	}
}

/* ---------- chemins ---------- */

// Masqués à la racine : réglages, dossiers système D-Link/Alt-F.
var hiddenRoot = map[string]bool{"Nas_Prog": true, "Ajaxpf": true, "lost+found": true, "fun_plug": true,
	"Alt-F": true, "ffp": true, "alt-f.log": true, "alt-f.log-previous": true, "aquota.user": true, "aquota.group": true}

func hidden(name string, atRoot bool) bool {
	if name == "" || name[0] == '.' {
		return true
	}
	return atRoot && (hiddenRoot[name] || strings.HasPrefix(name, "osanas-"))
}

func cleanRel(rel string) (string, error) {
	rel = strings.ReplaceAll(rel, "\\", "/")
	var parts []string
	for i, p := range strings.Split(rel, "/") {
		if p == "" || p == "." {
			continue
		}
		if p == ".." || strings.ContainsRune(p, 0) {
			return "", fail(403, "Chemin interdit")
		}
		if hidden(p, len(parts) == 0) {
			_ = i
			return "", fail(404, "Introuvable")
		}
		parts = append(parts, p)
	}
	return strings.Join(parts, "/"), nil
}

// Chemin absolu sous root, sans suivre de lien symbolique qui sortirait du volume.
func abs(rel string) (string, error) {
	rel, err := cleanRel(rel)
	if err != nil {
		return "", err
	}
	p := filepath.Join(root, filepath.FromSlash(rel))
	if real, err := filepath.EvalSymlinks(p); err == nil {
		if real != root && !strings.HasPrefix(real, root+"/") {
			return "", fail(403, "Chemin interdit")
		}
	}
	return p, nil
}
func absDir(rel string) (string, error) {
	p, err := abs(rel)
	if err != nil {
		return "", err
	}
	if fi, err := os.Stat(p); err != nil || !fi.IsDir() {
		return "", fail(404, "Dossier introuvable")
	}
	return p, nil
}
func validName(n string) (string, error) {
	n = strings.TrimSpace(n)
	switch {
	case n == "" || n == "." || n == ".." || strings.ContainsAny(n, "/\x00"):
		return "", fail(400, "Nom invalide")
	case n[0] == '.':
		return "", fail(400, "Les noms commençant par un point sont réservés")
	case len(n) > 240:
		return "", fail(400, "Nom trop long")
	}
	return n, nil
}
func exists(p string) bool { _, err := os.Lstat(p); return err == nil }

/* ---------- liste, téléchargement, envoi ---------- */

func list(w http.ResponseWriter, a args) error {
	rel, err := cleanRel(a.str("path"))
	if err != nil {
		return err
	}
	dir, err := absDir(rel)
	if err != nil {
		return err
	}
	ents, err := os.ReadDir(dir)
	if err != nil {
		return fail(500, "Lecture impossible")
	}
	items := []map[string]any{}
	for _, e := range ents {
		if hidden(e.Name(), rel == "") {
			continue
		}
		fi, err := os.Stat(filepath.Join(dir, e.Name())) // suit les liens
		if err != nil {
			continue
		}
		it := map[string]any{"name": e.Name(), "dir": fi.IsDir(), "mtime": fi.ModTime().Unix()}
		if fi.IsDir() {
			it["size"] = nil
		} else {
			it["size"] = fi.Size()
		}
		items = append(items, it)
	}
	writeJSON(w, 200, map[string]any{"path": rel, "items": items})
	return nil
}

var inlineTypes = map[string]string{
	".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".log": "text/plain; charset=utf-8",
	".json": "text/plain; charset=utf-8", ".csv": "text/plain; charset=utf-8", ".svg": "text/plain; charset=utf-8",
	".mkv": "video/x-matroska", ".mov": "video/quicktime", ".heic": "image/heic", ".flac": "audio/flac", ".m4a": "audio/mp4",
}

func get(w http.ResponseWriter, r *http.Request, a args) error {
	p, err := abs(a.str("path"))
	if err != nil {
		return err
	}
	f, err := os.Open(p)
	if err != nil {
		return fail(404, "Introuvable")
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil || fi.IsDir() {
		return fail(404, "Introuvable")
	}
	name := fi.Name()
	ext := strings.ToLower(path.Ext(name))
	ct := inlineTypes[ext]
	if ct == "" {
		ct = mime.TypeByExtension(ext)
	}
	if ct == "" {
		ct = "application/octet-stream"
	}
	inline := a.str("inline") == "1"
	if !inline && ext == ".svg" {
		ct = "image/svg+xml"
	}
	disp := "attachment"
	if inline {
		disp = "inline"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "sandbox") // un fichier servi ne peut pas exécuter de script dans l'origine
	w.Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"; filename*=UTF-8''%s`, disp, strings.ReplaceAll(name, `"`, ""), url.PathEscape(name)))
	http.ServeContent(w, r, name, fi.ModTime(), f) // gère Range (lecture vidéo, reprise)
	return nil
}

// Envoi en flux : le fichier est écrit directement sur le disque, sans tampon en mémoire ni limite de taille.
func upload(r *http.Request) (any, error) {
	mr, err := r.MultipartReader()
	if err != nil {
		return nil, fail(400, "Envoi invalide")
	}
	fields := map[string]string{}
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			return nil, fail(400, "Aucun fichier reçu")
		}
		if err != nil {
			return nil, fail(400, "Envoi interrompu")
		}
		if part.FormName() != "file" {
			b, _ := io.ReadAll(io.LimitReader(part, 4096))
			fields[part.FormName()] = string(b)
			continue
		}
		dir, err := absDir(fields["path"])
		if err != nil {
			return nil, err
		}
		fname := fields["name"]
		if fname == "" {
			fname = part.FileName()
		}
		name, err := validName(path.Base(strings.ReplaceAll(fname, "\\", "/")))
		if err != nil {
			return nil, err
		}
		// dossier glissé : relpath = a/b/fichier → crée a/b
		if sub, err := cleanRel(fields["relpath"]); err == nil && strings.Contains(sub, "/") {
			for _, s := range strings.Split(path.Dir(sub), "/") {
				if _, err := validName(s); err != nil {
					return nil, err
				}
				dir = filepath.Join(dir, s)
				if !exists(dir) {
					os.Mkdir(dir, 0o777)
					os.Chmod(dir, 0o777)
				}
			}
		}
		dst := filepath.Join(dir, name)
		if fields["overwrite"] != "1" {
			dst = uniqueName(dir, name)
		}
		rb := make([]byte, 6)
		rand.Read(rb)
		tmp := filepath.Join(dir, ".osanas-up-"+hex.EncodeToString(rb))
		f, err := os.OpenFile(tmp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o666)
		if err != nil {
			return nil, fail(500, "Écriture impossible sur le disque")
		}
		_, cerr := io.CopyBuffer(f, part, make([]byte, 256<<10))
		ferr := f.Close()
		if cerr != nil || ferr != nil {
			os.Remove(tmp)
			return nil, fail(500, "Envoi interrompu")
		}
		os.Chmod(tmp, 0o666)
		if os.Rename(tmp, dst) != nil {
			os.Remove(tmp)
			return nil, fail(500, "Écriture impossible sur le disque")
		}
		return map[string]any{"ok": true, "name": filepath.Base(dst)}, nil
	}
}

func uniqueName(dir, name string) string {
	if !exists(filepath.Join(dir, name)) {
		return filepath.Join(dir, name)
	}
	ext := path.Ext(name)
	base := strings.TrimSuffix(name, ext)
	if base == "" {
		base, ext = name, ""
	}
	for i := 2; ; i++ {
		p := filepath.Join(dir, fmt.Sprintf("%s %d%s", base, i, ext))
		if !exists(p) {
			return p
		}
	}
}
