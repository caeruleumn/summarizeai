package http

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	dbrepo "pdfai/go-backend/internal/db"
	"pdfai/go-backend/internal/summarizer"

	"github.com/google/uuid"
)

type Handler struct {
	MaxUploadBytes int64
	Repo           *dbrepo.Repository
	Summarizer     *summarizer.Client
}

func NewHandler(dbConn *sql.DB) *Handler {
	maxMBEnv := os.Getenv("MAX_UPLOAD_MB")
	maxMB, err := strconv.Atoi(maxMBEnv)
	if err != nil || maxMB <= 0 {
		maxMB = 10
	}

	return &Handler{
		MaxUploadBytes: int64(maxMB) * 1024 * 1024,
		Repo:           dbrepo.NewRepository(dbConn),
		Summarizer:     summarizer.NewClient(),
	}
}

func (h *Handler) UploadPDF(w http.ResponseWriter, r *http.Request) {
	// CORS
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, h.MaxUploadBytes)

	if err := r.ParseMultipartForm(h.MaxUploadBytes); err != nil {
		log.Printf("parse form error: %v", err)
		maxMB := h.MaxUploadBytes / (1024 * 1024)
		http.Error(w, fmt.Sprintf("file too large (max %dMB) or invalid form", maxMB), http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if header.Size > h.MaxUploadBytes {
		maxMB := h.MaxUploadBytes / (1024 * 1024)
		http.Error(w, fmt.Sprintf("file too large (max %dMB)", maxMB), http.StatusRequestEntityTooLarge)
		return
	}

	ext := filepath.Ext(header.Filename)
	if ext != ".pdf" {
		http.Error(w, "only PDF files are allowed", http.StatusBadRequest)
		return
	}

	id := uuid.New()
	storageDir := "storage/pdfs"
	if err := os.MkdirAll(storageDir, 0o755); err != nil {
		log.Printf("mkdir error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	storedPath := filepath.Join(storageDir, fmt.Sprintf("%s.pdf", id.String()))
	out, err := os.Create(storedPath)
	if err != nil {
		log.Printf("create file error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	defer out.Close()

	size, err := io.Copy(out, file)
	if err != nil {
		log.Printf("copy file error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	log.Printf("uploaded file %s (%d bytes) to %s", header.Filename, size, storedPath)

	ctx := context.Background()
	pdfID := id.String()

	fileRecord := dbrepo.PdfFile{
		ID:           pdfID,
		OriginalName: header.Filename,
		StoredPath:   storedPath,
		SizeBytes:    size,
		MimeType:     "application/pdf",
	}

	if err := h.Repo.CreatePdfFile(ctx, fileRecord); err != nil {
		log.Printf("insert pdf_files error: %v", err)
		http.Error(w, "failed to save metadata", http.StatusInternalServerError)
		return
	}

	summaryID := uuid.New().String()
	summaryRecord := dbrepo.PdfSummary{
		ID:     summaryID,
		PdfID:  pdfID,
		Status: "pending",
	}

	if err := h.Repo.CreatePdfSummaryPending(ctx, summaryRecord); err != nil {
		log.Printf("insert pdf_summaries error: %v", err)
		http.Error(w, "failed to save summary record", http.StatusInternalServerError)
		return
	}

	// Call summarizer service asynchronously (for now still blocking this request)
	go func(pdfID, storedPath string) {
		absPath, err := filepath.Abs(storedPath)
		if err != nil {
			log.Printf("failed to get absolute path: %v", err)
			_ = h.Repo.UpdateSummaryFailed(context.Background(), pdfID, "failed to resolve file path")
			return
		}

		// read optional JSON body: {"mode": "short|detailed|bullet"}
		var body struct {
			Mode string `json:"mode"`
		}
		if r.Body != nil {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err.Error() != "EOF" {
				log.Printf("decode regenerate body error: %v", err)
			}
		}

		resp, err := h.Summarizer.Summarize(absPath, body.Mode)
		if err != nil {
			log.Printf("summarizer error: %v", err)
			_ = h.Repo.UpdateSummaryFailed(context.Background(), pdfID, err.Error())
			return
		}

		if err := h.Repo.UpdateSummarySuccess(context.Background(), pdfID, resp.Summary, resp.ProcessTimeMs); err != nil {
			log.Printf("update summary success error: %v", err)
		}
	}(pdfID, storedPath)

	type uploadResponse struct {
		ID           string `json:"id"`
		OriginalName string `json:"original_name"`
		SizeBytes    int64  `json:"size_bytes"`
		StoredPath   string `json:"stored_path"`
		UploadedAt   string `json:"uploaded_at"`
	}

	resp := uploadResponse{
		ID:           id.String(),
		OriginalName: header.Filename,
		SizeBytes:    size,
		StoredPath:   storedPath,
		UploadedAt:   time.Now().Format(time.RFC3339),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("encode upload response error: %v", err)
	}
}

func (h *Handler) ListPDFs(w http.ResponseWriter, r *http.Request) {
	// CORS
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	ctx := r.Context()
	items, err := h.Repo.ListPdfFiles(ctx)
	if err != nil {
		log.Printf("list pdfs error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	type itemResponse struct {
		ID           string `json:"id"`
		OriginalName string `json:"original_name"`
		SizeBytes    int64  `json:"size_bytes"`
		CreatedAt    string `json:"created_at"`
		Status       string `json:"summary_status"`
		ProcessMs    int    `json:"process_time_ms"`
	}

	resp := make([]itemResponse, 0, len(items))
	for _, it := range items {
		status := ""
		if it.Status.Valid {
			status = it.Status.String
		}
		process := 0
		if it.ProcessTimeMs.Valid {
			process = int(it.ProcessTimeMs.Int32)
		}
		created := ""
		if it.CreatedAt.Valid {
			created = it.CreatedAt.Time.Format(time.RFC3339)
		}

		resp = append(resp, itemResponse{
			ID:           it.ID,
			OriginalName: it.OriginalName,
			SizeBytes:    it.SizeBytes,
			CreatedAt:    created,
			Status:       status,
			ProcessMs:    process,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("encode list response error: %v", err)
	}
}

func (h *Handler) GetPDF(w http.ResponseWriter, r *http.Request) {
	// CORS
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// path: /api/pdfs/{id}
	path := r.URL.Path
	parts := strings.Split(strings.TrimPrefix(path, "/api/pdfs"), "/")
	if len(parts) < 2 || parts[1] == "" {
		http.NotFound(w, r)
		return
	}
	id := parts[1]

	ctx := r.Context()
	detail, err := h.Repo.GetPdfWithSummary(ctx, id)
	if err != nil {
		log.Printf("get pdf error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if detail == nil {
		http.NotFound(w, r)
		return
	}

	type fileResp struct {
		ID           string `json:"id"`
		OriginalName string `json:"original_name"`
		StoredPath   string `json:"stored_path"`
		SizeBytes    int64  `json:"size_bytes"`
		MimeType     string `json:"mime_type"`
		CreatedAt    string `json:"created_at"`
		UpdatedAt    string `json:"updated_at"`
	}

	type summaryResp struct {
		Status       string `json:"status"`
		SummaryText  string `json:"summary_text"`
		ProcessMs    int    `json:"process_time_ms"`
		ErrorMessage string `json:"error_message"`
	}

	type response struct {
		File    fileResp    `json:"file"`
		Summary summaryResp `json:"summary"`
	}

	f := detail.File
	s := detail.Summary

	summaryText := ""
	if s.SummaryText != nil {
		summaryText = *s.SummaryText
	}
	process := 0
	if s.ProcessTimeMs != nil {
		process = *s.ProcessTimeMs
	}
	errorMsg := ""
	if s.ErrorMessage != nil {
		errorMsg = *s.ErrorMessage
	}

	resp := response{
		File: fileResp{
			ID:           f.ID,
			OriginalName: f.OriginalName,
			StoredPath:   f.StoredPath,
			SizeBytes:    f.SizeBytes,
			MimeType:     f.MimeType,
			CreatedAt:    f.CreatedAt.Format(time.RFC3339),
			UpdatedAt:    f.UpdatedAt.Format(time.RFC3339),
		},
		Summary: summaryResp{
			Status:       s.Status,
			SummaryText:  summaryText,
			ProcessMs:    process,
			ErrorMessage: errorMsg,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("encode detail response error: %v", err)
	}
}

func (h *Handler) DeletePDF(w http.ResponseWriter, r *http.Request) {
	// CORS
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	path := r.URL.Path
	parts := strings.Split(strings.TrimPrefix(path, "/api/pdfs"), "/")
	if len(parts) < 2 || parts[1] == "" {
		http.NotFound(w, r)
		return
	}
	id := parts[1]

	ctx := r.Context()
	storedPath, err := h.Repo.DeletePdf(ctx, id)
	if err != nil {
		log.Printf("delete pdf error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if storedPath == "" {
		http.NotFound(w, r)
		return
	}

	// best-effort remove file
	if err := os.Remove(storedPath); err != nil && !os.IsNotExist(err) {
		log.Printf("failed to remove file %s: %v", storedPath, err)
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) PreviewPDF(w http.ResponseWriter, r *http.Request) {
	// CORS
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, h.MaxUploadBytes)

	if err := r.ParseMultipartForm(h.MaxUploadBytes); err != nil {
		http.Error(w, "file too large or invalid form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ext := filepath.Ext(header.Filename)
	if ext != ".pdf" {
		http.Error(w, "only PDF files are allowed", http.StatusBadRequest)
		return
	}

	// Create temporary file for preview
	tempFile, err := os.CreateTemp("", "preview_*.pdf")
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	defer os.Remove(tempFile.Name())
	defer tempFile.Close()

	if _, err := io.Copy(tempFile, file); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	// Call summarizer for preview
	resp, err := h.Summarizer.GetPreview(tempFile.Name())
	if err != nil {
		log.Printf("preview error: %v", err)
		http.Error(w, "failed to generate preview", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]string{
		"preview_text": resp,
	}); err != nil {
		log.Printf("encode preview response error: %v", err)
	}
}

func (h *Handler) DownloadSummaryTXT(w http.ResponseWriter, r *http.Request) {
	// CORS
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	var body struct {
		Summary string `json:"summary"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Content-Disposition", "attachment; filename=summary.txt")
	w.Write([]byte(body.Summary))
}

func (h *Handler) DownloadSummaryPDF(w http.ResponseWriter, r *http.Request) {
	// CORS
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	var body struct {
		Summary string `json:"summary"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	// Call Python backend for PDF generation
	resp, err := h.Summarizer.GeneratePDF(body.Summary)
	if err != nil {
		http.Error(w, "failed to generate PDF", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", "attachment; filename=summary.pdf")
	w.Write(resp)
}

func (h *Handler) RegenerateSummary(w http.ResponseWriter, r *http.Request) {
	// CORS
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	// expected path: /api/pdfs/{id}/summary
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/pdfs/")
	parts := strings.Split(trimmed, "/")
	if len(parts) < 2 || parts[0] == "" || parts[1] != "summary" {
		http.NotFound(w, r)
		return
	}
	id := parts[0]

	ctx := r.Context()
	detail, err := h.Repo.GetPdfWithSummary(ctx, id)
	if err != nil {
		log.Printf("get pdf for regenerate error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if detail == nil {
		http.NotFound(w, r)
		return
	}

	absPath, err := filepath.Abs(detail.File.StoredPath)
	if err != nil {
		log.Printf("failed to get absolute path: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	// optional JSON body: {"mode": "short|detailed|bullet"}
	var body struct {
		Mode string `json:"mode"`
	}
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err.Error() != "EOF" {
			log.Printf("decode regenerate body error: %v", err)
		}
	}

	resp, err := h.Summarizer.Summarize(absPath, body.Mode)
	if err != nil {
		log.Printf("summarizer regenerate error: %v", err)
		if err2 := h.Repo.UpdateSummaryFailed(ctx, id, err.Error()); err2 != nil {
			log.Printf("update summary failed error: %v", err2)
		}
		http.Error(w, "failed to generate summary", http.StatusInternalServerError)
		return
	}

	if err := h.Repo.UpdateSummarySuccess(ctx, id, resp.Summary, resp.ProcessTimeMs); err != nil {
		log.Printf("update summary success error: %v", err)
		http.Error(w, "failed to save summary", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"pdf_id":          id,
		"summary_text":    resp.Summary,
		"process_time_ms": resp.ProcessTimeMs,
	}); err != nil {
		log.Printf("encode regenerate response error: %v", err)
	}
}
