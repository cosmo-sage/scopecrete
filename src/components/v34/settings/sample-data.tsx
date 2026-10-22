"use client";

/**
 * Settings → Account → Sample data (migration 119): put a sample customer, two sample jobs and a
 * few Price book items in, or take them out (archived and retired — nothing is deleted). Owners
 * only; everyone else sees whether it is in.
 */

import React, { useCallback, useEffect, useState } from "react";
import { T, F } from "@/lib/v34/tokens";

interface State { ready: boolean; active: boolean; job_id: string | null; rows: number; can_edit: boolean }

export function SampleData() {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/sample-data").then((r) => (r.ok ? r.json() : null)).then((d) => setS(d)).catch(() => setS(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (action: "add" | "remove") => {
    if (action === "remove" && !window.confirm("Take the sample customer, jobs and Price book items out? They're archived, not deleted.")) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/sample-data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach the server." };
    setBusy(false);
    if (!r?.ok) { setMsg(d?.error ?? "That didn't work."); return; }
    setMsg(action === "add" ? "Sample data is in. Each record says \"sample\"." : "Sample data taken out.");
    load();
  };

  if (!s) return <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div>;
  if (!s.ready) return <div style={{ fontSize: F.sm, color: T.ink3 }}>Waiting for migration 119.</div>;
  const btn: React.CSSProperties = { height: 34, padding: "0 12px", borderRadius: 8, border: `1px solid ${T.hair}`, background: T.card, color: T.ink, fontSize: F.sm, cursor: busy ? "wait" : "pointer" };
  return (
    <div className="flex flex-col gap-2">
      <div style={{ fontSize: F.sm, color: T.ink2 }}>
        {s.active
          ? <>In: a sample customer, two sample jobs and a few Price book items ({s.rows} records).{s.job_id && <> <a href={`/dashboard/scope/${s.job_id}/summary`} style={{ color: T.chalk }}>Open the sample job ›</a></>}</>
          : "None in. A sample customer, two sample jobs and a few Price book items give a new company something to click."}
      </div>
      {s.can_edit
        ? <div>
            {s.active
              ? <button type="button" disabled={busy} onClick={() => void act("remove")} style={btn}>Remove sample data</button>
              : <button type="button" disabled={busy} onClick={() => void act("add")} style={{ ...btn, borderColor: T.hiviz }}>Add sample data</button>}
          </div>
        : <div style={{ fontSize: F.xs, color: T.ink3 }}>Only an owner can add or remove it.</div>}
      {msg && <div style={{ fontSize: F.xs, color: T.ink3 }}>{msg}</div>}
    </div>
  );
}
