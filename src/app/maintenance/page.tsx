"use client";

import Link from "next/link";
import { Lightning } from "@phosphor-icons/react";

export default function MaintenancePage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{ background: "#09090b" }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 60%, rgba(232,93,4,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Logo */}
      <div className="flex items-center gap-2 mb-12">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "#e85d04" }}
        >
          <Lightning size={20} weight="fill" color="white" />
        </div>
        <span className="text-2xl font-bold tracking-tight" style={{ color: "#fafafa" }}>
          Scope<span style={{ color: "#e85d04" }}>Crete</span>
        </span>
      </div>

      {/* Construction icon */}
      <div className="mb-8">
        <svg
          width="80"
          height="80"
          viewBox="0 0 80 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Hard hat */}
          <ellipse cx="40" cy="52" rx="22" ry="6" fill="#27272a" />
          <path
            d="M20 48c0-11.046 8.954-20 20-20s20 8.954 20 20"
            fill="#e85d04"
            opacity="0.9"
          />
          <rect x="16" y="47" width="48" height="6" rx="3" fill="#e85d04" />
          <ellipse cx="40" cy="47" rx="26" ry="4" fill="#f97316" opacity="0.4" />
          {/* Cone */}
          <polygon
            points="40,62 32,74 48,74"
            fill="#71717a"
          />
          <rect x="30" y="74" width="20" height="3" rx="1.5" fill="#52525b" />
          {/* Stripes on cone */}
          <line x1="36" y1="66" x2="38" y2="70" stroke="#fafafa" strokeWidth="1.5" opacity="0.4" />
          <line x1="42" y1="66" x2="44" y2="70" stroke="#fafafa" strokeWidth="1.5" opacity="0.4" />
        </svg>
      </div>

      {/* Heading */}
      <h1
        className="text-4xl font-bold tracking-tight text-center mb-4"
        style={{ color: "#fafafa" }}
      >
        Under Construction
      </h1>
      <p
        className="text-base text-center max-w-[320px] leading-relaxed mb-10"
        style={{ color: "#71717a" }}
      >
        We&apos;re building something powerful. Check back soon for the contractor dashboard.
      </p>

      {/* Login button */}
      <Link
        href="/dashboard-login"
        className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
        style={{
          background: "#e85d04",
          color: "#09090b",
        }}
      >
        Login
      </Link>

      {/* Footer note */}
      <p
        className="text-xs mt-12"
        style={{ color: "#3f3f46" }}
      >
        ScopeCrete &copy; 2026
      </p>
    </div>
  );
}