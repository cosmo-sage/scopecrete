"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        setError("Invalid credentials");
        setLoading(false);
      }
    } catch {
      setError("Connection error");
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#0a0a0a" }}
    >
      <div
        className="w-full max-w-sm p-8 rounded-2xl"
        style={{ background: "#111827", border: "1px solid #1e293b", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-1 mb-8">
          <div className="relative flex items-end" style={{ paddingBottom: 2 }}>
            <svg width="54" height="22" viewBox="0 0 54 22" fill="none">
              <rect x="0" y="0" width="52" height="18" rx="9" fill="#2457F5" />
              <path d="M1 14 L-3 20 L8 14 Z" fill="#2457F5" />
              <text x="26" y="13" textAnchor="middle" fill="white" fontSize="11" fontFamily="sans-serif" fontWeight="400" letterSpacing="0.3">Scope</text>
            </svg>
          </div>
          <span style={{ color: "#6b7280", fontWeight: 800, fontSize: "18px", letterSpacing: "-0.02em" }}>Crete</span>
          <span style={{ color: "#e5e7eb", fontSize: "14px", fontWeight: 400, marginLeft: 2 }}>.ai</span>
        </div>

        <h1 className="text-xl font-bold text-center mb-2" style={{ color: "#e5e7eb" }}>Contractor Dashboard</h1>
        <p className="text-sm text-center mb-8" style={{ color: "#6b7280" }}>Enter your credentials to access</p>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
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

        <div className="mt-6 text-center">
          <a href="/" className="text-sm" style={{ color: "#6b7280" }}>
            ← Back to home
          </a>
        </div>
      </div>
    </div>
  );
}