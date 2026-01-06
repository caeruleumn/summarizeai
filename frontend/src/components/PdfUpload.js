import { useEffect, useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [summary, setSummary] = useState("");
  const [takeaways, setTakeaways] = useState([]);
  const [stats, setStats] = useState(null);
  const [mode, setMode] = useState("detailed");
  const [loading, setLoading] = useState(false);
  const [loadingView, setLoadingView] = useState(null); // 'upload' | 'library' | null
  const [showPreview, setShowPreview] = useState(false);
  const [processTime, setProcessTime] = useState(null);
  const [pdfs, setPdfs] = useState([]);
  const [selectedPdfId, setSelectedPdfId] = useState(null);
  const [listLoading, setListLoading] = useState(false);

  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regeneratePdfId, setRegeneratePdfId] = useState(null);
  const [regenerateMode, setRegenerateMode] = useState("detailed");
  const [metadata, setMetadata] = useState(null);
  const [view, setView] = useState("upload"); // 'upload' or 'library'
  const [selectedPdfDetail, setSelectedPdfDetail] = useState(null);
  const [summaryHistory, setSummaryHistory] = useState([]);

  // =====================
  // HANDLE FILE UPLOAD
  // =====================
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setSummary("");
    setPreview("");
    setTakeaways([]);
    setStats(null);
    setMetadata(null);
    setShowPreview(false);

    if (!selectedFile) return;

    const maxSizeBytes = 10 * 1024 * 1024;
    if (selectedFile.size > maxSizeBytes) {
      alert(`File terlalu besar! Maksimal 10MB, file Anda ${(selectedFile.size / 1024 / 1024).toFixed(1)}MB`);
      setFile(null);
      e.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch("http://localhost:8080/api/pdfs/preview", {
        method: "POST",
        body: formData,
        credentials: "omit",
      });
      
      if (!res.ok) {
        console.error("Preview failed with status:", res.status);
        return;
      }
      
      const data = await res.json();
      setPreview(data.preview_text);
      setShowPreview(true);
    } catch (error) {
      console.error("Preview gagal:", error);
    }
  };

  // =====================
  // LOAD PDF LIST
  // =====================
  const loadPdfs = async () => {
    setListLoading(true);
    try {
      const res = await fetch("http://localhost:8080/api/pdfs", {
        credentials: "omit",
      });
      if (!res.ok) return;
      const data = await res.json();
      setPdfs(data || []);
    } catch (e) {
      console.error("Gagal memuat daftar PDF", e);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    loadPdfs();
  }, []);

  // =====================
  // SUBMIT PDF
  // =====================
  const handleSubmit = async () => {
    if (!file) {
      alert("Pilih file PDF dulu");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", mode);

    setLoadingView("upload");
    setLoading(true);
    setSummary("");
    setTakeaways([]);
    setStats(null);
    setMetadata(null);
    setProcessTime(null);

    try {
      const res = await fetch("http://localhost:8080/api/pdfs", {
        method: "POST",
        body: formData,
        credentials: "omit",
      });

      const contentType = res.headers.get("content-type") || "";
      let data = null;
      let rawText = "";
      try {
        if (contentType.includes("application/json")) {
          data = await res.json();
        } else {
          rawText = await res.text();
        }
      } catch (e) {
        try {
          rawText = await res.text();
        } catch (_) {
          rawText = "";
        }
      }

      if (!res.ok) {
        let errorMsg = "Terjadi error";
        if (res.status === 413) {
          errorMsg = "File terlalu besar! Maksimal 10MB diperbolehkan.";
        } else if (res.status === 400 && data && data.detail?.includes("too large")) {
          errorMsg = "File terlalu besar! Maksimal 10MB diperbolehkan.";
        } else if (data && data.detail) {
          errorMsg = data.detail;
        } else if (rawText) {
          errorMsg = rawText;
        } else {
          errorMsg = `Request gagal (status ${res.status})`;
        }
        alert(errorMsg);
        return;
      }

      const id = data && data.id;
      if (!id) {
        alert("Upload berhasil, tapi ID tidak ditemukan.");
        return;
      }

      let attempts = 0;
      let detail = null;
      while (attempts < 30) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const detailRes = await fetch(`http://localhost:8080/api/pdfs/${id}`, {
          credentials: "omit",
        });

        if (!detailRes.ok) {
          break;
        }

        const detailContentType = detailRes.headers.get("content-type") || "";
        if (!detailContentType.includes("application/json")) {
          break;
        }

        const detailData = await detailRes.json();
        const s = detailData.summary || {};
        if (s.status && s.status !== "pending") {
          detail = detailData;
          break;
        }

        attempts += 1;
      }

      if (detail && detail.summary) {
        setSummary(detail.summary.summary_text || "");
        setProcessTime(detail.summary.process_time_ms || null);
        setTakeaways(detail.summary.takeaways || []);
        
        if (detail.summary.pages || detail.summary.words || detail.summary.reading_time_minutes) {
          setStats({
            pages: detail.summary.pages || 0,
            words: detail.summary.words || 0,
            reading_time_minutes: detail.summary.reading_time_minutes || 0,
          });
        } else {
          setStats(null);
        }
        
        setMetadata({
          created_at: detail.summary.created_at || null,
          updated_at: detail.summary.updated_at || null,
          language: detail.summary.language || null,
          status: detail.summary.status || null,
        });
        
        setSelectedPdfId(id);
        await loadPdfs();
      } else {
        alert("Upload berhasil, ringkasan masih diproses. Silakan cek lagi beberapa saat.");
      }
    } catch (e) {
      console.error("Summarize error:", e);
      alert(`Gagal terhubung ke backend: ${e?.message || e}`);
    } finally {
      setLoading(false);
      setLoadingView(null);
    }
  };

  // =====================
  // LOAD DETAIL BY ID (VIEW)
  // =====================
  const normalizePdfDetail = (data) => {
    if (!data) return null;
    if (data.file) {
      return {
        ...data.file,
        summary: data.summary || {},
      };
    }
    return data;
  };

  const loadHistory = async (id) => {
    try {
      const res = await fetch(`http://localhost:8080/api/pdfs/${id}/history`, {
        credentials: "omit",
      });
      if (!res.ok) return [];
      const data = await res.json();
      const history = Array.isArray(data?.history) ? data.history : [];
      const sorted = [...history].sort((a, b) => (b.version || 0) - (a.version || 0));
      return sorted.map((h, idx) => ({
        id: h.id,
        version: h.version,
        mode: h.mode,
        created_at: h.created_at,
        summary_text: h.summary_text,
        status: h.status,
        process_time_ms: h.process_time_ms,
        pages: h.pages,
        words: h.words,
        reading_time_minutes: h.reading_time_minutes,
        takeaways: h.takeaways,
        language: h.language,
        is_latest: idx === 0,
      }));
    } catch (e) {
      console.error("Gagal memuat history ringkasan", e);
      return [];
    }
  };

  const loadDetail = async (id) => {
    setLoadingView("library");
    setLoading(true);
    setView("library");
    try {
      const [detailRes, history] = await Promise.all([
        fetch(`http://localhost:8080/api/pdfs/${id}`, { credentials: "omit" }),
        loadHistory(id),
      ]);
      if (!detailRes.ok) return;
      const rawDetail = await detailRes.json();
      const detail = normalizePdfDetail(rawDetail);

      setSelectedPdfDetail(detail);

      const s = detail?.summary || {};
      setSummary(s.summary_text || "");
      setProcessTime(s.process_time_ms || null);
      setTakeaways(s.takeaways || []);
      
      if (s.pages || s.words || s.reading_time_minutes) {
        setStats({
          pages: s.pages || 0,
          words: s.words || 0,
          reading_time_minutes: s.reading_time_minutes || 0,
        });
      } else {
        setStats(null);
      }
      
      setMetadata({
        created_at: s.created_at || null,
        updated_at: s.updated_at || null,
        language: s.language || null,
        status: s.status || null,
      });

      setSummaryHistory(history);
      
      setSelectedPdfId(id);
    } catch (e) {
      console.error("Gagal memuat detail PDF", e);
    } finally {
      setLoading(false);
      setLoadingView(null);
    }
  };

  // =====================
  // REGENERATE SUMMARY
  // =====================
  const openRegenerateModal = (id) => {
    setRegeneratePdfId(id);
    setRegenerateMode(mode);
    setShowRegenerateModal(true);
  };

  const confirmRegenerate = () => {
    if (!regeneratePdfId) return;
    setShowRegenerateModal(false);
    handleRegenerate(regeneratePdfId, regenerateMode);
  };

  const handleRegenerate = async (id, modeToUse) => {
    if (!id) return;
    const finalMode = modeToUse || mode;
    setView("library");
    setLoadingView("library");
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8080/api/pdfs/${id}/summary`, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: finalMode }),
      });
      if (!res.ok) {
        alert("Gagal generate ulang ringkasan");
        return;
      }
      const data = await res.json();
      await loadPdfs();
      await loadDetail(id);
    } catch (e) {
      console.error("Gagal regenerate summary", e);
      alert("Terjadi kesalahan saat regenerate summary");
    } finally {
      setLoading(false);
      setLoadingView(null);
    }
  };

  // =====================
  // DELETE PDF
  // =====================
  const handleDelete = async (id) => {
    if (!id) return;
    if (!window.confirm("Yakin ingin menghapus file ini?")) return;
    try {
      const res = await fetch(`http://localhost:8080/api/pdfs/${id}`, {
        method: "DELETE",
        credentials: "omit",
      });
      if (res.status === 204) {
        await loadPdfs();
        if (selectedPdfId === id) {
          setSelectedPdfId(null);
          setSelectedPdfDetail(null);
          setSummary("");
          setStats(null);
          setProcessTime(null);
          setSummaryHistory([]);
          setView("upload");
        }
      } else {
        alert("Gagal menghapus file");
      }
    } catch (e) {
      console.error("Gagal menghapus PDF", e);
      alert("Terjadi kesalahan saat menghapus file");
    }
  };

  // =====================
  // DOWNLOADS
  // =====================
  const download = async (url, filename) => {
    if (!selectedPdfId) {
      alert("Pilih / lihat salah satu PDF dulu sebelum download");
      return;
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdf_id: selectedPdfId }),
    });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // =====================
  // UI
  // =====================
  return (
    <div className="min-h-screen bg-transparent">
      {/* HEADER */}
      <div className="bg-slate-950/40 backdrop-blur-md border-b border-slate-800/60 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-slate-900/70 border border-slate-700/60 p-3 rounded-2xl shadow-lg">
                <svg className="w-7 h-7 text-sky-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100 tracking-tight">PDF Summarizer AI</h1>
                <p className="text-slate-300 text-sm mt-0.5">Ringkas dokumen Anda dengan AI dalam sekejap</p>
              </div>
            </div>
            
            {/* Navigation Tabs */}
            <div className="flex gap-2 bg-slate-900/50 p-1 rounded-xl border border-slate-800/60">
              <button
                onClick={() => setView("upload")}
                className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${
                  view === "upload"
                    ? "bg-slate-800/80 text-slate-100 shadow-md"
                    : "text-slate-300 hover:text-slate-100"
                }`}
              >
                Upload & Summarize
              </button>
              <button
                onClick={() => setView("library")}
                className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${
                  view === "library"
                    ? "bg-slate-800/80 text-slate-100 shadow-md"
                    : "text-slate-300 hover:text-slate-100"
                }`}
              >
                Library ({pdfs.length})
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {view === "upload" ? (
          // =====================
          // UPLOAD VIEW
          // =====================
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT - UPLOAD SECTION */}
            <div className="space-y-6">
              <div className="bg-slate-950/35 rounded-3xl shadow-xl border border-slate-800/60 overflow-hidden">
                <div className="bg-slate-900/40 px-6 py-4 border-b border-slate-800/60">
                  <h2 className="text-lg font-semibold text-slate-100">Upload Dokumen PDF</h2>
                </div>

                <div className="p-6 space-y-5">
                  {/* File Upload Area */}
                  <label className="group relative flex flex-col items-center justify-center h-44 border-2 border-dashed border-slate-700/70 rounded-2xl cursor-pointer bg-slate-900/30 hover:bg-slate-900/45 transition-all duration-300">
                    <div className="text-center px-6">
                      <div className="mx-auto w-14 h-14 bg-slate-900/70 border border-slate-700/60 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shadow-lg">
                        {file ? (
                          <svg className="w-7 h-7 text-sky-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-7 h-7 text-sky-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        )}
                      </div>
                      <p className="text-slate-100 font-semibold mb-1.5">{file ? file.name : "Pilih file PDF"}</p>
                      <p className="text-xs text-slate-300">
                        {file ? `✓ File siap diproses (${(file.size / 1024 / 1024).toFixed(1)}MB)` : "Klik atau drag & drop file di sini (Maks. 10MB)"}
                      </p>
                    </div>
                    <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
                  </label>

                  {/* Mode Selector */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-100">Pilih Mode Ringkasan</label>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                      className="w-full p-3 border border-slate-700/70 rounded-xl bg-slate-950/40 text-slate-100 font-medium focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/50 outline-none transition-all shadow-sm text-sm"
                    >
                      <option value="short">⚡ Singkat - Ringkasan cepat & padat</option>
                      <option value="detailed">📋 Detail - Penjelasan lengkap & komprehensif</option>
                      <option value="bullet">🎯 Bullet Points - Poin-poin penting</option>
                    </select>
                  </div>

                  {/* Submit Button */}
                  {file && (
                    <button
                      onClick={handleSubmit}
                      disabled={loading}
                      className="w-full bg-sky-600/90 hover:bg-sky-600 disabled:bg-slate-700/70 text-white py-3.5 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Memproses...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Summarize Sekarang
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Preview Card */}
              {preview && (
                <div className="bg-slate-950/35 rounded-3xl shadow-xl border border-slate-800/60 overflow-hidden">
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="w-full bg-slate-900/40 px-6 py-3 flex items-center justify-between hover:bg-slate-900/55 transition-all border-b border-slate-800/60"
                  >
                    <h3 className="font-semibold text-slate-100 flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-sky-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Preview Dokumen
                    </h3>
                    <svg className={`w-4 h-4 text-slate-200 transition-transform ${showPreview ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showPreview && (
                    <div className="p-6">
                      <div className="bg-slate-900/30 rounded-xl p-5 text-xs max-h-60 overflow-y-auto text-slate-200/90 leading-relaxed border border-slate-800/60">
                        {preview}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT - RESULTS SECTION */}
            <div className="lg:sticky lg:top-24 h-fit">
              <div className="bg-slate-950/35 rounded-3xl shadow-xl border border-slate-800/60 overflow-hidden">
                <div className="bg-slate-900/40 px-6 py-4 border-b border-slate-800/60">
                  <h2 className="text-lg font-semibold text-slate-100">Hasil Ringkasan</h2>
                </div>

                <div className="p-6 min-h-[500px] max-h-[calc(100vh-180px)] overflow-y-auto">
                  {loading && loadingView === "upload" ? (
                    <div className="flex flex-col items-center justify-center h-full py-16">
                      <svg className="w-16 h-16 text-sky-400 animate-spin mb-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <p className="text-slate-100 font-semibold">Sedang menganalisis dokumen...</p>
                      <p className="text-xs text-slate-300 mt-1.5">Proses ini membutuhkan beberapa saat</p>
                    </div>
                  ) : summary ? (
                    <div className="space-y-6">
                      {/* Stats */}
                      {stats && (
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-800/60 text-center">
                            <div className="text-3xl font-bold text-sky-200 mb-1">{stats.pages}</div>
                            <div className="text-[10px] text-slate-300 font-semibold uppercase tracking-wide">Halaman</div>
                          </div>
                          <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-800/60 text-center">
                            <div className="text-3xl font-bold text-sky-200 mb-1">{stats.words}</div>
                            <div className="text-[10px] text-slate-300 font-semibold uppercase tracking-wide">Kata</div>
                          </div>
                          <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-800/60 text-center">
                            <div className="text-3xl font-bold text-sky-200 mb-1">{stats.reading_time_minutes}</div>
                            <div className="text-[10px] text-slate-300 font-semibold uppercase tracking-wide">Menit</div>
                          </div>
                        </div>
                      )}

                      {/* Summary */}
                      <div className="bg-slate-900/30 rounded-xl p-5 border border-slate-800/60">
                        <h3 className="font-bold text-slate-100 mb-3 flex items-center gap-2 text-sm">
                          <svg className="w-5 h-5 text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Ringkasan Dokumen
                        </h3>
                        <p className="whitespace-pre-wrap text-slate-100/90 leading-relaxed text-sm">{summary}</p>
                      </div>

                      {/* Takeaways */}
                      {takeaways.length > 0 && (
                        <div className="bg-slate-900/30 rounded-xl p-5 border border-slate-800/60">
                          <h3 className="font-bold text-slate-100 mb-4 flex items-center gap-2 text-sm">
                            <svg className="w-5 h-5 text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                            Poin-Poin Penting
                          </h3>
                          <ul className="space-y-3">
                            {takeaways.map((t, i) => (
                              <li key={i} className="flex gap-3 text-slate-100/90 text-sm">
                                <span className="flex-shrink-0 w-6 h-6 bg-slate-900/70 border border-slate-700/60 text-sky-200 rounded-lg flex items-center justify-center text-xs font-bold shadow-md">{i + 1}</span>
                                <span className="flex-1 leading-relaxed pt-0.5">{t}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Download Buttons */}
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <button onClick={() => download("http://localhost:8080/api/download/txt", "summary.txt")} className="bg-slate-900/60 hover:bg-slate-900/80 border border-slate-700/60 text-slate-100 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 text-sm">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          TXT
                        </button>
                        <button onClick={() => download("http://localhost:8080/api/download/pdf", "summary.pdf")} className="bg-sky-600/90 hover:bg-sky-600 text-white py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 text-sm">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          PDF
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-16 text-slate-400">
                      <svg className="w-20 h-20 mb-5 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-lg font-semibold text-slate-200/80 mb-1.5">Belum ada ringkasan</p>
                      <p className="text-xs text-slate-400/80">Upload PDF dan klik tombol Summarize</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT - PDF LIST */}
            <div className="lg:col-span-1">
              <div className="bg-slate-950/35 rounded-3xl shadow-xl border border-slate-800/60 overflow-hidden">
                <div className="bg-slate-900/40 px-6 py-4 flex items-center justify-between border-b border-slate-800/60">
                  <h2 className="text-lg font-semibold text-slate-100">Daftar PDF</h2>
                  {listLoading && <span className="text-xs text-slate-300">Memuat...</span>}
                </div>
                <div className="p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
                  {pdfs.length === 0 ? (
                    <div className="text-center py-12">
                      <svg className="w-16 h-16 mx-auto mb-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-slate-300 text-sm">Belum ada file yang diupload.</p>
                      <button onClick={() => setView("upload")} className="mt-3 text-xs text-sky-200 hover:text-sky-100 font-medium">
                        Upload PDF pertama Anda →
                      </button>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {pdfs.map((p) => (
                        <li key={p.id} className={`border border-slate-800/60 rounded-2xl p-3 bg-slate-900/25 hover:bg-slate-900/40 transition-all cursor-pointer ${selectedPdfId === p.id ? "ring-2 ring-sky-500/40 bg-slate-900/45" : ""}`} onClick={() => loadDetail(p.id)}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-100 text-sm line-clamp-2">{p.original_name}</p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${p.summary_status === "success" ? "bg-emerald-500/15 text-emerald-100 border-emerald-500/25" : p.summary_status === "pending" ? "bg-amber-500/15 text-amber-100 border-amber-500/25" : "bg-rose-500/15 text-rose-100 border-rose-500/25"}`}>
                                  {p.summary_status || "pending"}
                                </span>
                                <span className="text-[10px] text-slate-400">ID: {p.id?.slice(0, 8)}...</span>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT - DETAIL VIEW */}
            <div className="lg:col-span-2">
              {loading && loadingView === "library" ? (
                <div className="bg-slate-950/35 rounded-3xl shadow-xl border border-slate-800/60 overflow-hidden">
                  <div className="p-12 text-center">
                    <svg className="w-16 h-16 mx-auto mb-5 text-sky-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-slate-100 font-semibold">Memuat detail & history...</p>
                    <p className="text-xs text-slate-300 mt-1.5">Tunggu sebentar</p>
                  </div>
                </div>
              ) : selectedPdfDetail ? (
                <div className="space-y-6">
                  {/* PDF Info Card */}
                  <div className="bg-slate-950/35 rounded-3xl shadow-xl border border-slate-800/60 overflow-hidden">
                    <div className="bg-slate-900/40 px-6 py-4 flex items-center justify-between border-b border-slate-800/60">
                      <h2 className="text-lg font-semibold text-slate-100">Informasi Dokumen</h2>
                      <div className="flex gap-2">
                        <button onClick={() => openRegenerateModal(selectedPdfId)} className="text-xs px-3 py-1.5 rounded-lg bg-slate-900/50 hover:bg-slate-900/70 border border-slate-700/60 text-slate-100 font-medium transition-all">
                          Regenerate
                        </button>
                        <button onClick={() => handleDelete(selectedPdfId)} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white font-medium transition-all">
                          Hapus
                        </button>
                      </div>
                    </div>

                    <div className="p-6 space-y-4">
                      {/* File Name */}
                      <div className="bg-slate-900/30 rounded-xl p-4 border border-slate-800/60">
                        <div className="text-xs text-slate-300 font-semibold mb-1">Nama File</div>
                        <div className="text-slate-100 font-medium">{selectedPdfDetail.original_name}</div>
                      </div>

                      {/* Metadata Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-900/30 rounded-xl p-4 border border-slate-800/60">
                          <div className="text-xs text-slate-300 font-semibold mb-1">PDF ID</div>
                          <div className="text-slate-100 font-mono text-xs">{selectedPdfDetail.id}</div>
                        </div>

                        {stats && (
                          <>
                            <div className="bg-slate-900/30 rounded-xl p-4 border border-slate-800/60">
                              <div className="text-xs text-slate-300 font-semibold mb-1">Waktu Baca</div>
                              <div className="text-slate-100 font-bold text-lg">{stats.reading_time_minutes} <span className="text-sm font-normal text-slate-300">menit</span></div>
                            </div>
                            <div className="bg-slate-900/30 rounded-xl p-4 border border-slate-800/60">
                              <div className="text-xs text-slate-300 font-semibold mb-1">Jumlah Halaman</div>
                              <div className="text-slate-100 font-bold text-lg">{stats.pages} <span className="text-sm font-normal text-slate-300">halaman</span></div>
                            </div>
                            <div className="bg-slate-900/30 rounded-xl p-4 border border-slate-800/60">
                              <div className="text-xs text-slate-300 font-semibold mb-1">Jumlah Kata</div>
                              <div className="text-slate-100 font-bold text-lg">{stats.words.toLocaleString()} <span className="text-sm font-normal text-slate-300">kata</span></div>
                            </div>
                          </>
                        )}

                        {metadata?.language && (
                          <div className="bg-slate-900/30 rounded-xl p-4 border border-slate-800/60">
                            <div className="text-xs text-slate-300 font-semibold mb-1">Bahasa</div>
                            <div className="text-slate-100 font-medium">{metadata.language === "id" ? "Indonesia" : "English"}</div>
                          </div>
                        )}

                        {metadata?.created_at && (
                          <div className="bg-slate-900/30 rounded-xl p-4 border border-slate-800/60">
                            <div className="text-xs text-slate-300 font-semibold mb-1">Tanggal Upload</div>
                            <div className="text-slate-100/90 text-xs">{new Date(metadata.created_at).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                          </div>
                        )}

                        {metadata?.updated_at && (
                          <div className="bg-slate-900/30 rounded-xl p-4 border border-slate-800/60">
                            <div className="text-xs text-slate-300 font-semibold mb-1">Terakhir Diupdate</div>
                            <div className="text-slate-100/90 text-xs">{new Date(metadata.updated_at).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                          </div>
                        )}

                        {processTime && (
                          <div className="bg-slate-900/30 rounded-xl p-4 border border-slate-800/60">
                            <div className="text-xs text-slate-300 font-semibold mb-1">Waktu Proses</div>
                            <div className="text-slate-100 font-bold text-lg">{(processTime / 1000).toFixed(2)} <span className="text-sm font-normal text-slate-300">detik</span></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Summary History */}
                  <div className="bg-slate-950/35 rounded-3xl shadow-xl border border-slate-800/60 overflow-hidden">
                    <div className="bg-slate-900/40 px-6 py-4 border-b border-slate-800/60">
                      <h2 className="text-lg font-semibold text-slate-100">Ringkasan & History</h2>
                    </div>

                    <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto">
                      {summaryHistory.map((hist) => (
                        <div key={hist.id} className={`border rounded-2xl overflow-hidden ${hist.is_latest ? "border-sky-500/40 bg-slate-900/30" : "border-slate-800/60 bg-slate-950/20"}`}>
                          <div className="bg-slate-900/40 px-5 py-3 flex items-center justify-between border-b border-slate-800/60">
                            <div className="flex items-center gap-3">
                              {hist.is_latest && (
                                <span className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-100 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wide">Latest</span>
                              )}
                              <span className="text-xs font-semibold text-slate-100">
                                Mode: {hist.mode === "short" ? "⚡ Singkat" : hist.mode === "bullet" ? "🎯 Bullet" : "📋 Detail"}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {new Date(hist.created_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>

                          <div className="p-5">
                            <div className="bg-slate-900/30 rounded-xl p-4 mb-4 border border-slate-800/60">
                              <h4 className="text-xs font-bold text-slate-100 mb-2 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Ringkasan
                              </h4>
                              <p className="text-sm text-slate-100/90 leading-relaxed whitespace-pre-wrap">{hist.summary_text}</p>
                            </div>

                            {Array.isArray(hist.takeaways) && hist.takeaways.length > 0 && (
                              <div className="bg-slate-900/30 rounded-xl p-4 border border-slate-800/60">
                                <h4 className="text-xs font-bold text-slate-100 mb-3 flex items-center gap-2">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                  </svg>
                                  Poin-Poin Penting
                                </h4>
                                <ul className="space-y-2">
                                  {hist.takeaways.map((t, i) => (
                                    <li key={i} className="flex gap-2 text-xs text-slate-100/90">
                                      <span className="flex-shrink-0 w-5 h-5 bg-slate-900/70 border border-slate-700/60 text-sky-200 rounded-lg flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                                      <span className="flex-1 leading-relaxed pt-0.5">{t}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {summaryHistory.length === 0 && (
                        <div className="text-center py-8 text-slate-400">
                          <p className="text-sm">Belum ada history ringkasan</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950/35 rounded-3xl shadow-xl border border-slate-800/60 overflow-hidden">
                  <div className="p-12 text-center">
                    <svg className="w-20 h-20 mx-auto mb-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-slate-200/80 text-lg mb-2">Pilih PDF dari daftar</p>
                    <p className="text-xs text-slate-400/80">Klik salah satu PDF untuk melihat detailnya</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Regenerate Modal */}
      {showRegenerateModal && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-slate-950/70 rounded-2xl shadow-2xl border border-slate-800/60 w-full max-w-md p-6 m-4">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">Pilih Mode Ringkasan</h3>
            <p className="text-sm text-slate-300 mb-4">Tentukan gaya ringkasan yang ingin digunakan untuk file ini.</p>
            <select value={regenerateMode} onChange={(e) => setRegenerateMode(e.target.value)} className="w-full p-3 border border-slate-700/70 rounded-xl bg-slate-950/40 text-slate-100 font-medium focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/50 outline-none transition-all shadow-sm mb-6">
              <option value="short">⚡ Singkat - Ringkasan cepat & padat</option>
              <option value="detailed">📋 Detail - Penjelasan lengkap</option>
              <option value="bullet">🎯 Bullet Points - Poin-poin penting</option>
            </select>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRegenerateModal(false)} className="px-4 py-2 rounded-xl border border-slate-700/70 text-slate-200 text-sm hover:bg-slate-900/40 transition-all">
                Batal
              </button>
              <button onClick={confirmRegenerate} className="px-4 py-2 rounded-xl bg-sky-600/90 text-white text-sm font-semibold hover:bg-sky-600 transition-all">
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}