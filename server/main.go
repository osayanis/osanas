// OsaNAS — interface 2026 pour un D-Link DNS-320 sous Alt-F.
// Un seul binaire (ARMv5, statique) : il sert l'interface (embarquée) et l'API sur :8080.
package main

import (
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const Version = "2.2.1"

//go:embed www
var webFS embed.FS

var (
	root    string // racine du volume partagé (Volume_1)
	confDir string // réglages d'OsaNAS (mot de passe), hors de portée des invités SMB
)

func main() {
	addr := flag.String("addr", ":8080", "adresse d'écoute")
	flag.StringVar(&root, "root", "/mnt/sda2", "racine du volume à servir")
	flag.Parse()
	root = filepath.Clean(root)
	confDir = filepath.Join(root, ".osanas", "conf")
	if err := os.MkdirAll(confDir, 0o700); err != nil {
		log.Printf("conf: %v", err)
	}
	os.Chmod(filepath.Join(root, ".osanas"), 0o700)
	os.Chmod(confDir, 0o700)

	loadSessions()
	go sampler()
	go smartLoop()

	sub, _ := fs.Sub(webFS, "www")
	static := http.FileServer(http.FS(sub))
	mux := http.NewServeMux()
	mux.HandleFunc("/api", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Frame-Options", "DENY")
		api(w, r)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || strings.HasSuffix(r.URL.Path, ".html") {
			w.Header().Set("Cache-Control", "no-cache")
		} else {
			w.Header().Set("Cache-Control", "public, max-age=3600")
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		static.ServeHTTP(w, r)
	})

	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 15 * time.Second,
		IdleTimeout:       120 * time.Second,
		// pas de Read/WriteTimeout : envois et téléchargements de plusieurs Go
	}
	log.Printf("OsaNAS %s — %s sur %s", Version, root, *addr)
	log.Fatal(srv.ListenAndServe())
}
