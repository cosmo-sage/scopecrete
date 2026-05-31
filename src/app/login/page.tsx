"use client";

import LoginForm from "./LoginForm";

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#F6F7FB" }}
    >
      <div
        className="w-full max-w-sm p-8 rounded-2xl"
        style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}
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
          <span className="font-extrabold text-lg tracking-tight leading-none" style={{ color: "#6B7280" }}>Crete</span>
          <span className="text-sm font-normal ml-0.5" style={{ color: "#1F2937" }}>.ai</span>
        </div>

        <h1 className="text-xl font-bold text-center mb-2" style={{ color: "#1F2937" }}>Sign in to your dashboard</h1>
        <p className="text-sm text-center mb-8" style={{ color: "#6B7280" }}>Contractor portal</p>

        <LoginForm />
      </div>
    </div>
  );
}