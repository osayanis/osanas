package main

// Relais vers le pont HomeKit OsaHome, qui tourne à côté sur le NAS et n'écoute
// que sur 127.0.0.1:8091 : OsaNAS ajoute la connexion obligatoire devant.

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

var homeClient = &http.Client{Timeout: 8 * time.Second}

func homeProxy(w http.ResponseWriter, method, path string, body any) error {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, "http://127.0.0.1:8091"+path, rd)
	req.Header.Set("Content-Type", "application/json")
	resp, err := homeClient.Do(req)
	if err != nil {
		return fail(503, "Le pont OsaHome ne répond pas")
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, io.LimitReader(resp.Body, 1<<20))
	return nil
}
