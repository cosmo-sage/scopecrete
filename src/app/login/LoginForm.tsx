"use client";

import { useState } from "react";
import { signInWithGoogle } from "@/lib/auth";

export default function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGoogle = async () => {
    setLoading(true);
    setError("");
    const { error: googleError } = await signInWithGoogle();
    if (googleError) {
      setError(googleError.message);
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA" }}>
          {error}
        </div>
      )}

      {/* Google sign-in only */}
      <button
        onClick={handleGoogle}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: "#1F2937", color: "white", border: "1px solid #1F2937" }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
        {loading ? "Signing in..." : "Sign in with Google"}
      </button>
    </>
  );
}