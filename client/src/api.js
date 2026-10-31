export async function api(path, options = {}) {
  let response;
  const { timeoutMs = 20000, ...requestOptions } = options;
  try {
    response = await fetch(`/api${path}`, {
      ...requestOptions,
      signal: options.signal || AbortSignal.timeout(timeoutMs),
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch (error) {
    throw new Error(
      error.name === "TimeoutError"
        ? "The request timed out. Check the server connection and retry."
        : "Cannot reach the Apollo server. Check that the API is running.",
    );
  }
  const data = await response
    .json()
    .catch(() => ({ error: "The server returned an unreadable response." }));
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

export async function downloadReport(sessionId, format) {
  let response;
  try {
    response = await fetch(
      `/api/sessions/${sessionId}/report/export?format=${format}`,
    );
  } catch {
    throw new Error("Cannot reach the export service.");
  }
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: "Report export failed." }));
    throw new Error(data.error);
  }
  const blob = await response.blob(),
    url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `apollo-report-${sessionId}.${format === "pdf" ? "pdf" : "md"}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
