"use client";

import { useState } from "react";

export default function DashboardLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [debug, setDebug] = useState("");
  const [phase, setPhase] = useState<"idle" | "clicked" | "loading" | "done">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase("clicked");
    setError("");
    setDebug(`Starting... username="${username}"`);

    // Small delay so user can see the "clicked" state
    await new Promise(r => setTimeout(r, 200));
    setPhase("loading");

    try {
      const body = JSON.stringify({ username, password });
      setDebug(`Body: ${body}`);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "include",
      });

      setDebug(`Response status: ${res.status}`);
      const data = await res.json();
      setDebug(`Response data: ${JSON.stringify(data)}`);

      if (res.ok) {
        setPhase("done");
        window.location.href = "/dashboard";
      } else {
        setError(data.error || "Login failed");
        setPhase("idle");
      }
    } catch (err: unknown) {
      setError(`Error: ${String(err)}`);
      setDebug(`Error: ${String(err)}`);
      setPhase("idle");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#0a0a0a", padding: "16px" }}
    >
      <div
        className="w-full max-w-sm p-6 sm:p-8 rounded-2xl"
        style={{ background: "#1a1a1a", border: "1px solid #2d3748", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}
      >
        {/* Logo mark */}
        <div className="flex justify-center mb-8">
          <svg width="80" height="60" viewBox="0 0 80 60" fill="none">
            <rect x="0" y="0" width="80" height="60" rx="8" fill="#2d3748"/>
            <text x="17" y="44" fontFamily="Inter, system-ui, sans-serif" fontSize="38" fontWeight="900" fill="#e85d04" style={{ filter: "drop-shadow(0 0 8px #e85d04)" }}>S</text>
            <text x="47" y="44" fontFamily="Inter, system-ui, sans-serif" fontSize="38" fontWeight="900" fill="#e85d04" style={{ filter: "drop-shadow(0 0 8px #e85d04)" }}>C</text>
          </svg>
        </div>

        <h1 className="text-xl font-bold text-center mb-2" style={{ color: "#ffffff" }}>Contractor Dashboard</h1>
        <p className="text-sm text-center mb-8" style={{ color: "#6b7280" }}>Enter your credentials to access</p>

        <div className="mb-2 p-2 rounded-lg text-xs text-center" style={{ background: phase === "idle" ? "#1a1a1a" : phase === "clicked" ? "rgba(232,93,4,0.15)" : phase === "loading" ? "rgba(232,93,4,0.25)" : "rgba(34,197,94,0.15)", color: phase === "idle" ? "#6b7280" : "#e85d04", fontFamily: "monospace" }}>
          {phase === "idle" ? "Ready" : phase === "clicked" ? "Click detected" : phase === "loading" ? "Sending request..." : "Success!"}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </div>
        )}

        {debug && (
          <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: "#0a0a0a", color: "#6b7280", fontFamily: "monospace" }}>
            {debug}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              required
              autoComplete="username"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ background: "#0a0a0a", border: "1px solid #2d3748", color: "#e5e7eb" }}
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ background: "#0a0a0a", border: "1px solid #2d3748", color: "#e5e7eb" }}
            />
          </div>
          <button
            type="submit"
            disabled={phase === "clicked" || phase === "loading"}
            className="w-full px-4 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#e85d04", color: "#0a0a0a" }}
          >
            {phase === "clicked" || phase === "loading" ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a href="/" className="text-sm" style={{ color: "#6b7280" }}>
            ← Back to home
          </a>
        </div>
      </div>
    </div>
  );
}