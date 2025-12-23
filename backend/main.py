from fastapi import FastAPI, HTTPException, UploadFile, File
# FastAPI        → framework backend
# HTTPException  → untuk mengirim error HTTP ke client
# UploadFile     → menangani file upload (PDF)
# File           → dependency upload file


from PyPDF2 import PdfReader
# PdfReader → membaca & mengekstrak teks dari PDF

from dotenv import load_dotenv
# load_dotenv → membaca environment variable dari file .env

from fastapi.middleware.cors import CORSMiddleware
# CORSMiddleware → agar frontend (Next.js) bisa akses backend

import requests
# requests → kirim HTTP request ke Hugging Face API

import os
import shutil
import tempfile
# os        → operasi file (hapus, cek path)
# shutil   → copy file upload
# tempfile → membuat file sementara yang aman


load_dotenv()
# Memuat variabel dari file .env

HF_API_TOKEN = os.getenv("HF_API_TOKEN")
# Ambil token Hugging Face dari environment variable

HF_MODEL = "facebook/bart-large-cnn"
# Model AI untuk summarization

HF_API_URL = f"https://router.huggingface.co/hf-inference/models/{HF_MODEL}"
# Endpoint Hugging Face Inference API

headers = {
    "Authorization": f"Bearer {HF_API_TOKEN}",
    # Token untuk autentikasi ke Hugging Face
    "Content-Type": "application/json"
}


app = FastAPI(title="PDF Summarizer API (Hugging Face)")
# Membuat instance aplikasi FastAPI

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    # Izinkan frontend Next.js (port 3000) mengakses backend

    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    # Endpoint untuk cek apakah backend berjalan
    return {"status": "Backend jalan (Hugging Face)"}

def summarize_with_hf(text: str, chunk_size: int = 3000):

    def call_hf(prompt_text: str):

        payload = {
            "inputs": prompt_text,

            "parameters": {
                "max_length": 220,   # Panjang maksimum ringkasan
                "min_length": 60,    # Panjang minimum ringkasan
                "do_sample": False  # Output stabil (tidak random)
            }
        }

        # Kirim request ke Hugging Face API
        response = requests.post(HF_API_URL, headers=headers, json=payload)

        # Jika Hugging Face error
        if response.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"HuggingFace error: {response.text}"
            )

        # Parsing response secara aman
        try:
            data = response.json()
        except ValueError:
            # Jika response bukan JSON
            return response.text

        # Handle berbagai format response Hugging Face
        if isinstance(data, list):
            if data and isinstance(data[0], dict) and "summary_text" in data[0]:
                return data[0]["summary_text"]
            if data and isinstance(data[0], str):
                return data[0]

        if isinstance(data, dict):
            if "summary_text" in data:
                return data["summary_text"]
            if "generated_text" in data:
                return data["generated_text"]

        # Jika format tidak dikenali
        raise HTTPException(
            status_code=500,
            detail="Unexpected HuggingFace response format"
        )

    # JIKA TEKS PENDEK

    if len(text) <= chunk_size:
        prompt = (
            "Please summarize the following document in clear, concise paragraphs. "
            "Highlight key ideas and structure the summary for readability.\n\n"
            f"{text}"
        )
        return call_hf(prompt)
    

    # JIKA TEKS PANJANG (CHUNKING)
    summaries = []

    # Potong teks jadi beberapa bagian
    for i in range(0, len(text), chunk_size):
        chunk = text[i:i + chunk_size]

        prompt = (
            "Please summarize the following document chunk in clear, concise paragraphs. "
            "Highlight key ideas and structure the summary for readability.\n\n"
            f"{chunk}"
        )

        summaries.append(call_hf(prompt))

    # Gabungkan ringkasan sementara
    combined = "\n".join(summaries)

    # Ringkas ulang hasil gabungan
    final_prompt = (
        "Please summarize the following combined summaries into one concise summary, "
        "preserving key ideas and structure:\n\n"
        + combined
    )

    return call_hf(final_prompt)


# ENDPOINT: SUMMARIZE PDF


@app.post("/summarize-pdf")
async def summarize_pdf(file: UploadFile = File(...)):
    temp_path = None
    try:
        # Ambil ekstensi file (misal .pdf)
        suffix = os.path.splitext(file.filename)[1] or ".pdf"

        # Simpan file upload ke file sementara yang aman
        with tempfile.NamedTemporaryFile(
            prefix="upload_",
            suffix=suffix,
            delete=False
        ) as tmp:
            shutil.copyfileobj(file.file, tmp)
            temp_path = tmp.name

        # Baca PDF
        reader = PdfReader(temp_path)
        text = ""

        # Ambil teks dari setiap halaman
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"

        # Jika PDF tidak mengandung teks
        if not text.strip():
            raise HTTPException(
                status_code=400,
                detail="PDF tidak mengandung teks"
            )

        # Ringkas teks PDF
        summary = summarize_with_hf(text)

        return {"summary": summary}

    except HTTPException:
        # Biarkan HTTPException lewat apa adanya
        raise

    except Exception as e:
        # Tangani error tak terduga
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Pastikan file sementara dihapus
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass