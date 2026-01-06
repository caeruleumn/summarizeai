# PDF Summarizer AI

Website untuk meringkas file PDF menggunakan AI.
Project ini menggunakan arsitektur microservices dengan **Next.js** (frontend), **Go** (API gateway), **FastAPI** (AI summarizer), dan **PostgreSQL** (database).

## 🔍 Gambaran Umum

Aplikasi ini memungkinkan user untuk:

* Upload file PDF
* Meringkas isi PDF secara otomatis menggunakan AI
* Menyimpan riwayat PDF dan ringkasan
* Download hasil ringkasan dalam format TXT atau PDF
* Preview teks PDF sebelum diringkas

## ✨ Fitur Utama

* Upload file PDF (max 10MB)
* Ringkasan otomatis menggunakan AI dengan mode: short, detailed, bullet
* Regenerate ringkasan dengan mode berbeda
* Download ringkasan (TXT/PDF)
* Preview teks PDF
* Riwayat PDF tersimpan di database
* Loading state saat proses berjalan
* Tampilan responsif

## 🏗️ Arsitektur

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│  Go API     │────▶│  Summarizer │
│  (Next.js)  │     │  (Gateway)  │     │  (FastAPI)  │
│  :3000      │     │  :8080      │     │  :8000      │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                    ┌─────▼─────┐
                    │ PostgreSQL│
                    │  :5433    │
                    └───────────┘
```

## �️ Treknologi yang Digunakan

### Frontend
* Next.js
* React
* Tailwind CSS

### Go Backend (API Gateway)
* Go 1.24
* PostgreSQL driver (pgx)
* UUID generation

### Python Backend (Summarizer)
* FastAPI
* PyPDF2
* Google Gemini API
* ReportLab (PDF generation)

### Database
* PostgreSQL 16

### AI Model
* Google Gemini Flash 2.5 

## 🚀 Cara Menjalankan

### Menggunakan Docker (Recommended)

```bash
# Clone repository
git clone <repository-url>
cd pdf-summarizer-ai

# Jalankan semua services
docker-compose up --build
```

Services akan berjalan di:
* Frontend: http://localhost:3000
* Go API: http://localhost:8080
* Summarizer: http://localhost:8000
* PostgreSQL: localhost:5433

### Manual Setup

#### 1. Setup Database
```bash
# Jalankan PostgreSQL (atau gunakan docker)
docker run -d --name pdfai-postgres \
  -e POSTGRES_DB=pdfai \
  -e POSTGRES_USER=pdfai \
  -e POSTGRES_PASSWORD=pdfai \
  -p 5433:5432 postgres:16
```

#### 2. Setup Go Backend
```bash
cd go-backend
go mod download

# Set environment variables
export DATABASE_URL="postgres://pdfai:pdfai@localhost:5433/pdfai?sslmode=disable"
export SUMMARIZER_URL="http://localhost:8000/summarize"
export MAX_UPLOAD_MB="10"

go run cmd/main.go
```

#### 3. Setup Python Summarizer
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Buat file .env
echo "GEMINI_API_KEY=api_key_gemini_kamu" > .env

uvicorn main:app --reload --port 8000
```

#### 4. Setup Frontend
```bash
cd frontend
npm install
npm run dev
```

## 🔗 API Endpoints

### Go API (Port 8080)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/upload` | Upload PDF dan mulai summarize |
| GET | `/api/pdfs` | List semua PDF |
| GET | `/api/pdfs/{id}` | Detail PDF dengan summary |
| DELETE | `/api/pdfs/{id}` | Hapus PDF |
| POST | `/api/pdfs/{id}/summary` | Regenerate summary |
| POST | `/api/preview` | Preview teks PDF |
| POST | `/api/download/txt` | Download summary sebagai TXT |
| POST | `/api/download/pdf` | Download summary sebagai PDF |

### Summarizer API (Port 8000)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/` | Health check |
| POST | `/summarize` | Summarize PDF file |
| POST | `/preview` | Extract preview text |
| POST | `/generate-pdf` | Generate PDF dari text |

## 📁 Struktur Folder

```
pdf-summarizer-ai/
├── backend/                 # Python Summarizer Service
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── go-backend/              # Go API Gateway
│   ├── cmd/
│   │   └── main.go
│   ├── internal/
│   │   ├── db/              # Database models & repository
│   │   ├── http/            # HTTP handlers
│   │   └── summarizer/      # Summarizer client
│   ├── migrations/          # SQL migrations
│   └── Dockerfile
├── frontend/                # Next.js Frontend
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── services/
│   └── Dockerfile
├── storage/                 # PDF storage
├── docker-compose.yml
└── README.md
```

## ⚙️ Environment Variables

### Go Backend
| Variable | Default | Deskripsi |
|----------|---------|-----------|
| DATABASE_URL | - | PostgreSQL connection string |
| SUMMARIZER_URL | - | URL ke summarizer service |
| MAX_UPLOAD_MB | 10 | Max upload size dalam MB |

### Python Summarizer
| Variable | Default | Deskripsi |
|----------|---------|-----------|
| GEMINI_API_KEY | - | Google Gemini API key |

## 📖 Cara Menggunakan

1. Buka http://localhost:3000
2. Upload file PDF
3. Tunggu proses summarization
4. Lihat hasil ringkasan
5. Download dalam format TXT atau PDF
6. Regenerate dengan mode berbeda jika diperlukan

## 🧩 Rencana Pengembangan

* [ ] Multi-language output
* [ ] User authentication
* [ ] Mengelola antrean menggunakan RabbitMQ
