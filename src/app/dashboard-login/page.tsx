"use client";

import { useState } from "react";

export default function DashboardLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debug, setDebug] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setDebug("");

    const payload = JSON.stringify({ username, password });
    setDebug(`Payload: ${payload}`);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        credentials: "include",
      });

      setDebug(`Status: ${res.status}`);
      const data = await res.json();
      setDebug(`Response: ${JSON.stringify(data)}`);

      if (res.ok) {
        window.location.href = "/dashboard";
      } else {
        setError(data.error || "Login failed");
        setLoading(false);
      }
    } catch (err) {
      setError(`Error: ${String(err)}`);
      setDebug(`Error: ${String(err)}`);
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setDebug("Testing...");
    try {
      const res = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
      const data = await res.json();
      setDebug(`Test route: ${JSON.stringify(data)}`);
    } catch (err) {
      setDebug(`Test error: ${String(err)}`);
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
            disabled={loading}
            className="w-full px-4 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#e85d04", color: "#0a0a0a" }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {/* Test button */}
        <button
          onClick={handleTest}
          className="mt-4 w-full px-4 py-2 rounded-xl text-xs"
          style={{ background: "#2d3748", color: "#6b7280", border: "1px solid #3d4a5c" }}
        >
          Test API
        </button>

        <div className="mt-6 text-center">
          <a href="/" className="text-sm" style={{ color: "#6b7280" }}>
            ← Back to home
          </a>
        </div>
      </div>
    </div>
  );
}