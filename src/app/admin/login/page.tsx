"use client";

import { useState } from "react";

export default function AdminLoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = e.currentTarget;
    const username = (form.elements.namedItem("username") as HTMLInputElement)?.value || "";
    const password = (form.elements.namedItem("password") as HTMLInputElement)?.value || "";

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        window.location.href = "/admin/dashboard";
      } else {
        setError("Invalid credentials");
      }
    } catch {
      setError("Connection error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#09090b", padding: "16px" }}>
      <div className="w-full max-w-sm p-8 rounded-2xl" style={{ background: "#18181b", border: "1px solid #27272a", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <svg width="80" height="60" viewBox="0 0 80 60" fill="none">
            <rect width="80" height="60" rx="8" fill="#27272a"/>
            <text x="17" y="44" fontFamily="Inter, system-ui, sans-serif" fontSize="38" fontWeight="900" fill="#e85d04" style={{ filter: "drop-shadow(0 0 8px #e85d04)" }}>S</text>
            <text x="47" y="44" fontFamily="Inter, system-ui, sans-serif" fontSize="38" fontWeight="900" fill="#e85d04" style={{ filter: "drop-shadow(0 0 8px #e85d04)" }}>C</text>
          </svg>
        </div>

        <h1 className="text-xl font-bold text-center mb-1" style={{ color: "#fafafa" }}>Admin Portal</h1>
        <p className="text-sm text-center mb-8" style={{ color: "#71717a" }}>Sign in to manage ScopeCrete</p>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              name="username"
              placeholder="Username"
              required
              className="w-full text-sm px-4 py-2.5 rounded-xl outline-none"
              style={{ background: "#09090b", color: "#fafafa", border: "1px solid #27272a" }}
            />
          </div>
          <div>
            <input
              type="password"
              name="password"
              placeholder="Password"
              required
              className="w-full text-sm px-4 py-2.5 rounded-xl outline-none"
              style={{ background: "#09090b", color: "#fafafa", border: "1px solid #27272a" }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: "#e85d04", color: "white", border: "none", cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a href="/dashboard" className="text-xs hover:underline" style={{ color: "#71717a" }}>
            ← Back to contractor dashboard
          </a>
        </div>
      </div>
    </div>
  );
}