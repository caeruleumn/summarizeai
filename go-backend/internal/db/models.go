package db

import "time"

type PdfFile struct {
	ID           string
	OriginalName string
	StoredPath   string
	SizeBytes    int64
	MimeType     string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type PdfSummary struct {
	ID            string
	PdfID         string
	SummaryText   *string
	Status        string
	ProcessTimeMs *int
	ErrorMessage  *string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
