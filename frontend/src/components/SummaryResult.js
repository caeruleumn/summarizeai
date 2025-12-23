export default function SummaryResult({ summary }) {
  if (!summary) return null;

  return (
    <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100 text-sm text-slate-800">
      <h2 className="font-semibold mb-2 text-blue-800">Summary</h2>
      <p className="whitespace-pre-line">{summary}</p>
    </div>
  );
} 
