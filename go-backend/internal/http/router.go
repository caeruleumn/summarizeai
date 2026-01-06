package http

import ("net/http"
		"strings"
)

func NewRouter(handler *Handler) *http.ServeMux {
	mux := http.NewServeMux()
	
	mux.HandleFunc("/api/pdfs", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			handler.UploadPDF(w, r)
			return
		}
		if r.Method == http.MethodGet {
			handler.ListPDFs(w, r)
			return
		}
		w.WriteHeader(http.StatusMethodNotAllowed)
	})

	mux.HandleFunc("/api/pdfs/preview", func(w http.ResponseWriter, r *http.Request) {
		handler.PreviewPDF(w, r)
	})

	mux.HandleFunc("/api/download/txt", func(w http.ResponseWriter, r *http.Request) {
		handler.DownloadSummaryTXT(w, r)
	})

	mux.HandleFunc("/api/download/pdf", func(w http.ResponseWriter, r *http.Request) {
		handler.DownloadSummaryPDF(w, r)
	})

	mux.HandleFunc("/api/pdfs/", func(w http.ResponseWriter, r *http.Request) {
		// /api/pdfs/{id}/summary
		if strings.HasSuffix(r.URL.Path, "/summary") {
			if r.Method == http.MethodPost || r.Method == http.MethodOptions {
				handler.RegenerateSummary(w, r)
				return
			}
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		// /api/pdfs/{id}
		if r.Method == http.MethodOptions {
			// let DeletePDF handle CORS preflight
			handler.DeletePDF(w, r)
			return
		}

		if r.Method == http.MethodGet {
			handler.GetPDF(w, r)
			return
		}
		if r.Method == http.MethodDelete {
			handler.DeletePDF(w, r)
			return
		}
		w.WriteHeader(http.StatusMethodNotAllowed)
	})
	return mux
}
