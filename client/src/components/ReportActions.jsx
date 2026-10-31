import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { downloadReport } from "../api";
export default function ReportActions({ sessionId }) {
  const [loading, setLoading] = useState(""),
    [error, setError] = useState("");
  async function download(format) {
    setError("");
    setLoading(format);
    try {
      await downloadReport(sessionId, format);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading("");
    }
  }
  return (
    <div className="report-actions">
      <button
        className="button secondary"
        disabled={Boolean(loading)}
        onClick={() => download("markdown")}
      >
        {loading === "markdown" ? (
          <LoaderCircle size={15} className="spin" />
        ) : (
          <Download size={15} />
        )}
        Markdown
      </button>
      <button
        className="button primary"
        disabled={Boolean(loading)}
        onClick={() => download("pdf")}
      >
        {loading === "pdf" ? (
          <LoaderCircle size={15} className="spin" />
        ) : (
          <Download size={15} />
        )}
        Download PDF
      </button>
      {error && (
        <p className="export-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
