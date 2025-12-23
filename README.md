# PDF Summarizer AI

Website sederhana untuk meringkas file PDF menggunakan AI.
Project ini saya buat untuk belajar integrasi **frontend**, **backend**, dan **API** dalam satu aplikasi menggunakan **Next.js**, **FastAPI** dan model AI **Bart** dari Hugging Face.

## 🔍 Gambaran Umum

Aplikasi ini memungkinkan user untuk:

* Upload file PDF
* Meringkas isi PDF secara otomatis menggunakan AI

## ✨ Fitur Utama

* Upload file PDF 
* Ringkasan otomatis menggunakan AI
* Loading saat proses berjalan
* Tampilan sederhana dan responsif
* Bisa menangani PDF yang cukup panjang (teks dibagi per bagian)

## 🛠️ Teknologi yang Digunakan

### Frontend

* Next.js
* React
* Tailwind CSS
* JavaScript

### Backend

* FastAPI
* PyPDF2
* Hugging Face API
* Python-dotenv
* Uvicorn

### AI Model

* `facebook/bart-large-cnn` (model summarization)

## 🚀 Cara Instalasi dan Menjalankan

### Persiapan

* Node.js minimal versi 18
* Python minimal versi 3.8
* Token API dari Hugging Face

---

### 1. Clone Repository

```bash
git clone <repository-url>
cd pdf-summarizer-ai
```

---

### 2. Setup Backend

```bash
cd backend

python -m venv venv

# Aktifkan virtual environment
# Windows
venv\Scripts\activate

# Linux / Mac
source venv/bin/activate

pip install fastapi uvicorn PyPDF2 python-dotenv requests
```

Buat file `.env` di folder backend:

```env
HF_API_TOKEN=token_huggingface_kamu
```

---

### 3. Setup Frontend

```bash
cd frontend
npm install
```

---

### 4. Cara Mendapatkan Hugging Face Token

1. Daftar di website Hugging Face
2. Masuk ke menu **Settings > Access Tokens**
3. Buat token baru dengan permission **Read**
4. Copy token ke file `.env`

---

## ▶️ Menjalankan Aplikasi

### Jalankan Backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Backend berjalan di:

```
http://localhost:8000
```

### Jalankan Frontend

```bash
cd frontend
npm run dev
```

Frontend berjalan di:

```
http://localhost:3000
```

---

## 📖 Cara Menggunakan Aplikasi

1. Buka browser dan masuk ke `http://localhost:3000`
2. Upload file PDF
3. Klik tombol **Summarize PDF**
4. Tunggu proses berjalan
5. Hasil ringkasan akan tampil di layar

---

## 📁 Struktur Folder

```
pdf-summarizer-ai/
├── backend/
│   ├── main.py
│   ├── .env
│   └── venv/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── services/
│   ├── package.json
│   └── next.config.mjs
└── README.md
```

---

## 🔗 Endpoint API

### Backend

* `GET /` → cek server
* `POST /summarize-pdf` → upload dan ringkas PDF

Output berupa JSON:

```json
{
  "summary": "hasil ringkasan"
}
```

---

## ⚙️ Konfigurasi AI

* Model: `facebook/bart-large-cnn`
* Panjang ringkasan disesuaikan agar tidak terlalu pendek
* Teks PDF dibagi menjadi beberapa bagian jika terlalu panjang

---

## 🧩 Rencana Pengembangan

* Memilih bahasa untuk output dari ringkasan
* Mampu menangani file dengan jumlah kata yang lebih besar 
* Menggunakan tipe dokumen selain PDF
* Download hasil ringkasan 

---

## 📌 Catatan

Project ini dibuat untuk:

* Latihan fullstack
* Memahami cara kerja API AI

Masih banyak kekurangan dan terbuka untuk dikembangkan lebih lanjut.

---