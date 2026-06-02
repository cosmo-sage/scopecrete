"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ background: "#09090b", color: "#fafafa", fontFamily: "system-ui", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Something went wrong</h1>
          <p style={{ color: "#a1a1aa", marginBottom: 24 }}>{error?.message || "An unexpected error occurred"}</p>
          <button
            onClick={reset}
            style={{ background: "#e85d04", color: "white", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}