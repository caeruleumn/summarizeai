from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response

from PyPDF2 import PdfReader
from dotenv import load_dotenv
from langdetect import detect, DetectorFactory

from reportlab.platypus import SimpleDocTemplate, Paragraph
from reportlab.lib.styles import getSampleStyleSheet

from io import BytesIO
from datetime import datetime
import google.generativeai as genai
import tempfile
import shutil
import os
import re
import json
import time

# =====================
# ENV & GEMINI CONFIG
# =====================

load_dotenv()
DetectorFactory.seed = 0

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY belum diset")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")

# =====================
# FASTAPI APP
# =====================

app = FastAPI(title="PDF Summarizer API – Step 1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================
# STORAGE
# =====================

SUMMARY_FILE = "storage/summaries.json"

def save_summary(data: dict):
    os.makedirs("storage", exist_ok=True)

    summaries = []
    if os.path.exists(SUMMARY_FILE):
        with open(SUMMARY_FILE, "r") as f:
            summaries = json.load(f)

    summaries.append({
        **data,
        "created_at": datetime.now().isoformat()
    })

    with open(SUMMARY_FILE, "w") as f:
        json.dump(summaries, f, indent=2)

# =====================
# UTILITIES
# =====================

def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def detect_language(text: str) -> str:
    try:
        lang = detect(text[:3000])
        return lang if lang in ["id", "en"] else "en"
    except:
        return "en"

def _extract_text_from_pdf_path(path: str) -> tuple[str, int]:
    reader = PdfReader(path)
    text = ""

    for page in reader.pages:
        if page.extract_text():
            text += page.extract_text() + " "

    if not text.strip():
        raise HTTPException(status_code=400, detail="PDF tidak mengandung teks")

    return clean_text(text), len(reader.pages)


def extract_text_from_pdf(file: UploadFile) -> tuple[str, int]:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        path = tmp.name

    try:
        return _extract_text_from_pdf_path(path)
    finally:
        if os.path.exists(path):
            os.remove(path)

# =====================
# GEMINI FUNCTIONS
# =====================

def summarize_with_gemini(text: str, language: str, mode: str) -> str:
    instructions = {
        "id": {
            "short": "Ringkas maksimal 150 kata. Jawab sepenuhnya dalam bahasa Indonesia.",
            "bullet": "Ringkas dalam 5–8 bullet points. Jawab sepenuhnya dalam bahasa Indonesia.",
            "detailed": "Ringkas maksimal 300–400 kata. Jawab sepenuhnya dalam bahasa Indonesia."
        },
        "en": {
            "short": "Summarize to a maximum of 150 words. Answer fully in English.",
            "bullet": "Summarize in 5–8 bullet points. Answer fully in English.",
            "detailed": "Summarize to 300–400 words. Answer fully in English."
        }
    }

    prompt = f"""
{instructions[language][mode]}

Rules:
- Fokus pada ide utama
- Jangan menyalin teks asli

Document:
{text}
"""

    res = model.generate_content(prompt)
    return res.text.strip()

def generate_takeaways(text: str, language: str) -> list:
    prompt = (
        "Buat 5 poin kesimpulan terpenting dalam bahasa Indonesia:"
        if language == "id"
        else "Create 5 key takeaways in English:"
    )
    res = model.generate_content(prompt + "\n" + text)
    return [l.strip("-• ") for l in res.text.split("\n") if l.strip()][:5]

def document_stats(text: str, pages: int):
    words = len(text.split())
    return {
        "pages": pages,
        "words": words,
        "reading_time_minutes": max(1, words // 200)
    }

# =====================
# ENDPOINTS
# =====================

@app.post("/preview-pdf")
async def preview_pdf(file: UploadFile = File(...)):
    text, _ = extract_text_from_pdf(file)
    return {"preview_text": text[:1000]}

@app.post("/summarize-pdf")
async def summarize_pdf(
    file: UploadFile = File(...),
    mode: str = "detailed"
):
    start = time.time()

    text, pages = extract_text_from_pdf(file)
    summary_input = text[:15000]
    language = detect_language(summary_input)

    summary = summarize_with_gemini(summary_input, language, mode)
    takeaways = generate_takeaways(summary_input, language)
    stats = document_stats(text, pages)

    process_time_ms = int((time.time() - start) * 1000)

    save_summary({
        "filename": file.filename,
        "mode": mode,
        "language": language,
        "summary": summary,
        "process_time_ms": process_time_ms,
        "stats": stats
    })

    return {
        "preview_text": text[:1000],
        "summary": summary,
        "takeaways": takeaways,
        "stats": stats,
        "process_time_ms": process_time_ms
    }


@app.post("/summarize")
async def summarize_existing_pdf(payload: dict = Body(...)):
    file_path = payload.get("file_path")
    mode = payload.get("mode", "detailed")

    if not file_path:
        raise HTTPException(status_code=400, detail="file_path is required")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="file not found")

    start = time.time()

    text, pages = _extract_text_from_pdf_path(file_path)
    summary_input = text[:15000]
    language = detect_language(summary_input)

    summary = summarize_with_gemini(summary_input, language, mode)
    stats = document_stats(text, pages)

    process_time_ms = int((time.time() - start) * 1000)

    return {
        "summary": summary,
        "process_time_ms": process_time_ms,
        "stats": stats,
        "language": language,
    }


@app.post("/download-summary-txt")
async def download_summary_txt(data: dict = Body(...)):
    summary = data.get("summary", "")
    return Response(
        content=summary,
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=summary.txt"}
    )

@app.post("/download-summary-pdf")
async def download_summary_pdf(data: dict = Body(...)):
    summary = data.get("summary", "")

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer)
    styles = getSampleStyleSheet()

    elements = [Paragraph(line, styles["Normal"]) for line in summary.split("\n")]
    doc.build(elements)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=summary.pdf"}
    )

