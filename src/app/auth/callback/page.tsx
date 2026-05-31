"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Processing...");

  useEffect(() => {
    const handleCallback = async () => {
      const { searchParams } = new URL(window.location.href);
      const code = searchParams.get("code");
      const next = searchParams.get("next") || "/dashboard";

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          router.replace(next);
          return;
        }
        setStatus(`Error: ${error.message}`);
      } else {
        setStatus("No auth code found");
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F6F7FB" }}>
      <div className="text-center">
        <div className="text-3xl mb-3 animate-pulse">⚙️</div>
        <h2 className="text-lg font-bold" style={{ color: "#1F2937" }}>{status}</h2>
      </div>
    </div>
  );
}