package summarizer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Response struct {
	Summary       string `json:"summary"`
	ProcessTimeMs int    `json:"process_time_ms"`
}

type Client struct {
	BaseURL string
	Client  *http.Client
}

func NewClient() *Client {
	url := os.Getenv("SUMMARIZER_URL")
	if url == "" {
		url = "http://localhost:8000/summarize"
	}
	return &Client{
		BaseURL: url,
		Client:  &http.Client{Timeout: 120 * time.Second},
	}
}

func (c *Client) Summarize(filePath string, mode string) (*Response, error) {
	if mode == "" {
		mode = "detailed"
	}

	body, err := json.Marshal(map[string]string{
		"file_path": filePath,
		"mode":      mode,
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, c.BaseURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("summarizer returned status %d", resp.StatusCode)
	}

	var out Response
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) GetPreview(filePath string) (string, error) {
	previewURL := strings.Replace(c.BaseURL, "/summarize", "/preview-pdf", 1)
	
	// Create multipart form
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	
	file, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()
	
	part, err := writer.CreateFormFile("file", filepath.Base(filePath))
	if err != nil {
		return "", err
	}
	
	if _, err := io.Copy(part, file); err != nil {
		return "", err
	}
	
	if err := writer.Close(); err != nil {
		return "", err
	}
	
	req, err := http.NewRequest(http.MethodPost, previewURL, &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	
	resp, err := c.Client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("preview service returned status %d", resp.StatusCode)
	}
	
	var result struct {
		PreviewText string `json:"preview_text"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	
	return result.PreviewText, nil
}

func (c *Client) GeneratePDF(summary string) ([]byte, error) {
	pdfURL := strings.Replace(c.BaseURL, "/summarize", "/download-summary-pdf", 1)
	
	body, err := json.Marshal(map[string]string{
		"summary": summary,
	})
	if err != nil {
		return nil, err
	}
	
	req, err := http.NewRequest(http.MethodPost, pdfURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("PDF generation service returned status %d", resp.StatusCode)
	}
	
	return io.ReadAll(resp.Body)
}
