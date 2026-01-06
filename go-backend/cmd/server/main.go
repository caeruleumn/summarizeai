package main

import (
	"log"
	"net/http"

	"pdfai/go-backend/internal/db"
	httpapi "pdfai/go-backend/internal/http"
)

func main() {
	dbConn := db.New()
	defer dbConn.Close()

	handler := httpapi.NewHandler(dbConn)
	mux := httpapi.NewRouter(handler)

	addr := ":8080"
	log.Printf("Go API listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}