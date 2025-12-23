export async function summarizePdf(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("http://localhost:8000/summarize", {
    method: "POST",
    body: formData,
  });

  return response.json();
}
