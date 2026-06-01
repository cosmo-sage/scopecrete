"use client";

import { useState } from "react";

export default function DashboardLoginPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("scopecrete2026");
  const [result, setResult] = useState<string>("");

  const handleSubmit = async () => {
    setResult("Starting fetch...");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });
      const data = await res.json();
      setResult(`Status: ${res.status}, Data: ${JSON.stringify(data)}`);
      if (res.ok) {
        window.location.href = "/dashboard";
      }
    } catch (err: unknown) {
      setResult(`Error: ${String(err)}`);
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

        {result && (
          <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: "#0a0a0a", color: "#6b7280", fontFamily: "monospace" }}>
            {result}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
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
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ background: "#0a0a0a", border: "1px solid #2d3748", color: "#e5e7eb" }}
            />
          </div>
          <button
            onClick={handleSubmit}
            className="w-full px-4 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#e85d04", color: "#0a0a0a" }}
          >
            Sign in
          </button>
        </div>

        <div className="mt-6 text-center">
          <a href="/" className="text-sm" style={{ color: "#6b7280" }}>
            ← Back to home
          </a>
        </div>
      </div>
    </div>
  );
}