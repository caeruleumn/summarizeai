package db

import (
	"context"
	"database/sql"
)

type Repository struct {
	DB *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{DB: db}
}

func (r *Repository) CreatePdfFile(ctx context.Context, f PdfFile) error {
	_, err := r.DB.ExecContext(ctx, `
		insert into pdf_files (id, original_name, stored_path, size_bytes, mime_type)
		values ($1, $2, $3, $4, $5)
	`, f.ID, f.OriginalName, f.StoredPath, f.SizeBytes, f.MimeType)
	return err
}

func (r *Repository) CreatePdfSummaryPending(ctx context.Context, s PdfSummary) error {
	_, err := r.DB.ExecContext(ctx, `
		insert into pdf_summaries (id, pdf_id, status)
		values ($1, $2, $3)
	`, s.ID, s.PdfID, s.Status)
	return err
}

type PdfWithSummary struct {
	ID            string
	OriginalName  string
	SizeBytes     int64
	CreatedAt     sql.NullTime
	Status        sql.NullString
	ProcessTimeMs sql.NullInt32
}

func (r *Repository) ListPdfFiles(ctx context.Context) ([]PdfWithSummary, error) {
	rows, err := r.DB.QueryContext(ctx, `
		select f.id, f.original_name, f.size_bytes, f.created_at,
		       s.status, s.process_time_ms
		from pdf_files f
		left join pdf_summaries s on s.pdf_id = f.id
		order by f.created_at desc
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []PdfWithSummary
	for rows.Next() {
		var p PdfWithSummary
		if err := rows.Scan(&p.ID, &p.OriginalName, &p.SizeBytes, &p.CreatedAt, &p.Status, &p.ProcessTimeMs); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

type PdfDetail struct {
	File    PdfFile
	Summary PdfSummary
}

func (r *Repository) GetPdfWithSummary(ctx context.Context, id string) (*PdfDetail, error) {
	row := r.DB.QueryRowContext(ctx, `
		select f.id, f.original_name, f.stored_path, f.size_bytes, f.mime_type, f.created_at, f.updated_at,
		       s.id, s.pdf_id, s.summary_text, s.status, s.process_time_ms, s.error_message, s.created_at, s.updated_at
		from pdf_files f
		left join pdf_summaries s on s.pdf_id = f.id
		where f.id = $1
	`, id)

	var (
		f PdfFile
		s PdfSummary
	)
	var (
		summaryText   sql.NullString
		status       sql.NullString
		processTime  sql.NullInt32
		errorMessage sql.NullString
	)

	if err := row.Scan(
		&f.ID, &f.OriginalName, &f.StoredPath, &f.SizeBytes, &f.MimeType, &f.CreatedAt, &f.UpdatedAt,
		&s.ID, &s.PdfID, &summaryText, &status, &processTime, &errorMessage, &s.CreatedAt, &s.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	if summaryText.Valid {
		text := summaryText.String
		s.SummaryText = &text
	}
	if status.Valid {
		st := status.String
		s.Status = st
	}
	if processTime.Valid {
		v := int(processTime.Int32)
		s.ProcessTimeMs = &v
	}
	if errorMessage.Valid {
		msg := errorMessage.String
		s.ErrorMessage = &msg
	}

	return &PdfDetail{File: f, Summary: s}, nil
}

func (r *Repository) UpdateSummarySuccess(ctx context.Context, pdfID string, summary string, processTimeMs int) error {
	_, err := r.DB.ExecContext(ctx, `
		update pdf_summaries
		set summary_text = $1,
		    status = 'success',
		    process_time_ms = $2,
		    error_message = null,
		    updated_at = now()
		where pdf_id = $3
	`, summary, processTimeMs, pdfID)
	return err
}

func (r *Repository) UpdateSummaryFailed(ctx context.Context, pdfID string, errorMessage string) error {
	_, err := r.DB.ExecContext(ctx, `
		update pdf_summaries
		set status = 'failed',
		    error_message = $1,
		    updated_at = now()
		where pdf_id = $2
	`, errorMessage, pdfID)
	return err
}

// DeletePdf deletes a pdf_file (and its summaries via cascade) and returns the stored_path.
func (r *Repository) DeletePdf(ctx context.Context, id string) (string, error) {
	var storedPath string
	err := r.DB.QueryRowContext(ctx, `
		select stored_path from pdf_files where id = $1
	`, id).Scan(&storedPath)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}

	if _, err := r.DB.ExecContext(ctx, `delete from pdf_files where id = $1`, id); err != nil {
		return "", err
	}
	return storedPath, nil
}
