"use client";

import { useState, useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Log to console so we can see it from curl
    console.error("[Admin Error Boundary]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#09090b",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "#18181b",
          border: "1px solid #27272a",
          borderRadius: "16px",
          padding: "32px",
          maxWidth: "480px",
          width: "100%",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "rgba(234, 88, 4, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <span style={{ fontSize: "24px" }}>⚠</span>
        </div>

        <h1
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "#fafafa",
            marginBottom: "8px",
          }}
        >
          Admin Dashboard Error
        </h1>

        <p
          style={{
            fontSize: "14px",
            color: "#a1a1aa",
            marginBottom: "24px",
            lineHeight: 1.5,
          }}
        >
          {error?.message || "An unexpected error occurred while loading the admin dashboard."}
        </p>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{
              background: "#e85d04",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>

        {error?.digest && (
          <p
            style={{
              fontSize: "11px",
              color: "#52525b",
              marginTop: "16px",
            }}
          >
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}