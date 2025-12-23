// Import useState untuk menyimpan state di React
import { useState } from "react";

export default function Home() {

  // ====== STATE ======

  // Menyimpan file PDF yang di-upload
  const [file, setFile] = useState(null);

  // Menyimpan teks hasil ekstraksi PDF (opsional, hanya preview)
  const [pdfText, setPdfText] = useState("");

  // Menyimpan hasil ringkasan dari backend
  const [summary, setSummary] = useState("");

  // Menandakan proses sedang berjalan atau tidak
  const [loading, setLoading] = useState(false);

  // ====== HANDLE FILE UPLOAD ======
  const handleFileChange = async (e) => {
    // Ambil file pertama dari input
    const selectedFile = e.target.files[0];

    // Simpan file ke state
    setFile(selectedFile);

    // Reset teks & summary lama
    setPdfText("");
    setSummary("");

    // Kalau file ada
    if (selectedFile) {
      try {
        // Baca file sebagai ArrayBuffer
        const arrayBuffer = await selectedFile.arrayBuffer();

        // Ubah ke Uint8Array (byte PDF)
        const uint8Array = new Uint8Array(arrayBuffer);

        // Coba ekstrak teks secara sederhana
        const text = extractTextFromPDF(uint8Array);

        // Simpan hasil ekstraksi
        setPdfText(text);
      } catch (err) {
        console.error("Gagal membaca PDF:", err);
      }
    }
  };

  // ====== EKSTRAK TEKS PDF (SANGAT SEDERHANA) ======
  const extractTextFromPDF = (data) => {
    // Decode byte ke teks biasa
    const text = new TextDecoder().decode(data);

    // Regex untuk mengambil teks di dalam tanda ()
    // (PDF menyimpan teks dengan format aneh)
    const regex = /\(([^)]+)\)/g;

    let matches = [];
    let match;

    // Ambil semua teks yang cocok
    while ((match = regex.exec(text)) !== null) {
      matches.push(match[1]);
    }

    // Gabungkan teks dan batasi 5000 karakter
    return matches.join(" ").slice(0, 5000)
      || "Teks tidak dapat diekstrak dari PDF ini.";
  };

  // ====== KIRIM PDF KE BACKEND ======
  const handleSubmit = async () => {

    // Validasi: file harus ada
    if (!file) {
      alert("Pilih file PDF dulu");
      return;
    }

    // Gunakan FormData karena mengirim file
    const formData = new FormData();
    formData.append("file", file);

    // Set loading
    setLoading(true);
    setSummary("");

    try {
      // Kirim request ke FastAPI
      const res = await fetch("http://localhost:8000/summarize-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      // Kalau backend error
      if (!res.ok) {
        alert(data.detail || "Terjadi error");
        return;
      }

      // Simpan hasil ringkasan
      setSummary(data.summary);

    } catch (err) {
      alert("Gagal terhubung ke backend");
    } finally {
      // Matikan loading
      setLoading(false);
    }
  };

  // ====== UI ======
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Judul */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-900 mb-2">
            PDF Summarizer AI
          </h1>
          <p className="text-blue-600">
            Unggah PDF dan dapatkan ringkasan instan
          </p>
        </div>

        {/* Layout 2 kolom */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ====== CARD KIRI: UPLOAD ====== */}
          <div className="bg-white rounded-2xl shadow-lg p-6 flex flex-col">
            <h2 className="text-xl font-semibold text-blue-900 mb-4">
              Unggah File PDF
            </h2>

            {/* Area upload */}
            <label className="flex flex-col items-center justify-center w-full h-32
              border-2 border-dashed border-blue-300 rounded-xl cursor-pointer
              bg-blue-50 hover:bg-blue-100 transition-colors mb-4">

              <p className="text-sm text-blue-600 font-medium">
                {file ? file.name : "Klik untuk upload PDF"}
              </p>

              {/* Input file disembunyikan */}
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {/* Tombol summarize */}
            {file && (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-blue-500 hover:bg-blue-600
                  disabled:bg-blue-300 text-white font-medium py-3
                  rounded-xl transition-colors mb-4"
              >
                {loading ? "Memproses..." : "Summarize PDF"}
              </button>
            )}
          </div>

          {/* ====== CARD KANAN: HASIL ====== */}
          <div className="bg-white rounded-2xl shadow-lg p-6 flex flex-col">
            <h2 className="text-xl font-semibold text-blue-900 mb-4">
              Hasil Ringkasan
            </h2>

            <div className="flex-1 bg-gradient-to-br from-blue-50 to-indigo-50
              rounded-xl p-4 overflow-y-auto">

              {/* Loading */}
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-200
                      border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-blue-600 font-medium">
                      Sedang membuat ringkasan...
                    </p>
                  </div>
                </div>

              ) : summary ? (
                // Jika ada summary
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {summary}
                  </p>
                </div>

              ) : (
                // Default
                <div className="flex items-center justify-center h-full">
                  <p className="text-blue-600 text-center">
                    Ringkasan akan muncul di sini setelah proses selesai
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
