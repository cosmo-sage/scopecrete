"use client";

/**
 * Phone lines — every number of yours, what runs it, and what a call to it
 * means. Quo today; another provider or your own AI answering stack later
 * sits on the same schema (migration 035). A contact is the other person's
 * number, so one person calling two of your lines is still one thread; each
 * message carries the line it came in on.
 *
 * "Lead source" is for tracking numbers: if a number is printed only on the
 * website, a new job from a call to it starts as a website lead.
 */

import React, { useEffect, useState } from "react";
import { T, F, disp, eyebrow, nums, formatPhone } from "@/lib/v34/tokens";
import { EmptyState } from "@/components/v34/primitives";
import { LEAD_SOURCES } from "@/lib/jobs/stages";
import { PROVIDERS } from "@/lib/lines";

interface Line {
  id: string; phone_e164: string; label: string | null; is_primary: boolean; active: boolean;
  provider: string | null; provider_number_id: string | null; default_lead_source: string | null;
  ai_enabled: boolean | null; messages: number;
}

export default function LinesScreen() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    fetch("/api/lines")
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`); return b; })
      .then((b) => { if (!off) setLines(b.lines ?? []); })
      .catch((e) => { if (!off) setError(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, []);

  async function save(id: string, field: string, value: string) {
    setSaving(id); setError(null);
    try {
      const r = await fetch(`/api/lines/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setLines((ls) => ls && ls.map((l) => (l.id === id ? { ...l, ...b.line } : l)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  const select: React.CSSProperties = { height: 32, fontSize: F.sm, border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card, color: T.ink, padding: "0 6px", width: "100%" };

  return (
    <div style={{ color: T.ink }}>
      <div className="px-3 pt-3 pb-2" style={{ background: T.card, borderBottom: `1px solid ${T.hair}` }}>
        <div style={{ fontFamily: disp, fontSize: F.xl, fontWeight: 600, lineHeight: 1.05 }}>Phone lines</div>
        <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 2 }}>
          Every number of yours, what runs it, and what a call to it means. One person calling two lines is still one thread.
        </div>
        {error && <div style={{ fontSize: F.xs, color: T.red, marginTop: 4 }}>{error}</div>}
      </div>
      {lines === null && !error && <div className="p-3" style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div>}
      {lines?.length === 0 && <EmptyState title="No lines on file" detail="org_phone_numbers has no rows for this organisation." />}
      {lines?.map((l) => (
        <div key={l.id} className="px-3 py-3" style={{ background: T.card, borderBottom: `1px solid ${T.hair}`, opacity: saving === l.id ? 0.6 : 1 }}>
          <div className="flex items-baseline gap-2">
            <span style={{ fontFamily: disp, fontSize: F.lg, fontWeight: 600, ...nums }}>{formatPhone(l.phone_e164)}</span>
            {l.is_primary && <span style={{ ...eyebrow, color: T.hiviz }}>Primary</span>}
            {!l.active && <span style={{ ...eyebrow, color: T.ink3 }}>Inactive</span>}
            <span className="flex-1" />
            <span style={{ fontSize: F.xs, color: T.ink3, ...nums }}>{l.messages.toLocaleString()} messages</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" style={{ marginTop: 8 }}>
            <label>
              <div style={{ ...eyebrow, color: T.ink3 }}>Name</div>
              <input defaultValue={l.label ?? ""} placeholder="e.g. Main, Website"
                onBlur={(e) => { if (e.target.value.trim() !== (l.label ?? "")) void save(l.id, "label", e.target.value); }}
                style={{ ...select, padding: "0 8px" }} />
            </label>
            <label>
              <div style={{ ...eyebrow, color: T.ink3 }}>Provider</div>
              <select value={l.provider ?? ""} onChange={(e) => void save(l.id, "provider", e.target.value)} style={select}>
                <option value="">Not set</option>
                {PROVIDERS.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
              </select>
            </label>
            <label>
              <div style={{ ...eyebrow, color: T.ink3 }}>A new caller here is a…</div>
              <select value={l.default_lead_source ?? ""} onChange={(e) => void save(l.id, "default_lead_source", e.target.value)} style={select}>
                <option value="">No default source</option>
                {LEAD_SOURCES.map((s) => <option key={s.k} value={s.k}>{s.label} lead</option>)}
              </select>
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
