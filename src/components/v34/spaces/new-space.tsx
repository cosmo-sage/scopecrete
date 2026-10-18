"use client";

/**
 * New Space (Claude Design "Dusty Home" frame 18; Coy, 2026-10-18: "creating a new space
 * starts a new job. But that is wrong. A space can currently be 1 of 4 different things").
 * Pick the kind — Job · Customer · Vendor · Collection — give it a name, and start it from
 * one already on file or blank:
 *   - Job → the New job form (`/dashboard/scope?new=1`), as before.
 *   - Customer / Vendor → an existing one, or a new one made through + New customer's or
 *     + Vendor's own route; either way it is pinned to the rail (`spaces_pins`).
 *   - Collection → a thread Coy makes (migration 073), which the rail already shows.
 * No migration.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SpaceSilhouette } from "@/components/v34/spaces/space-silhouette";
import { usePref } from "@/lib/v34/prefs";
import { SPACE_KINDS, addPin, cleanPins, monogram, type SpacePin } from "@/lib/v34/spaces";

type Kind = (typeof SPACE_KINDS)[number]["kind"];
interface Option { id: string; name: string }

const COLOR: Record<Kind, string> = {
  job: "var(--sc-hiviz)", customer: "var(--sc-chalk)", vendor: "var(--sc-bucket-vendor)", collection: "var(--sc-violet)",
};
const SHAPE: Record<Kind, "job" | "contact" | "vendor" | "collection"> = { job: "job", customer: "contact", vendor: "vendor", collection: "collection" };

export function NewSpaceDialog({ onClose, onMade }: { onClose: () => void; onMade: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("job");
  const [name, setName] = useState("");
  const [from, setFrom] = useState<string>("blank");
  const [opts, setOpts] = useState<Record<string, Option[]>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pinsRaw, setPins] = usePref<unknown>("spaces_pins", []);
  const pins = useMemo(() => cleanPins(pinsRaw), [pinsRaw]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  // Customers and vendors on file, for "Start with".
  useEffect(() => {
    if ((kind !== "customer" && kind !== "vendor") || opts[kind]) return;
    let off = false;
    fetch(kind === "customer" ? "/api/customers" : "/api/vendors").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (off || !j) return;
      const list: Option[] = kind === "customer"
        ? (j.customers ?? []).map((c: { id: string; name: string | null }) => ({ id: c.id, name: c.name ?? "" }))
        : (j.vendors ?? []).map((v: { id: string; name: string | null; company_name?: string | null }) => ({ id: v.id, name: v.company_name || v.name || "" }));
      setOpts((o) => ({ ...o, [kind]: list.filter((x) => x.name).sort((a, b) => a.name.localeCompare(b.name)) }));
    }).catch(() => {});
    return () => { off = true; };
  }, [kind, opts]);

  const list = opts[kind] ?? [];
  const q = name.trim().toLowerCase();
  const matches = q ? list.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 8) : list.slice(0, 8);
  const picked = list.find((o) => o.id === from) ?? null;
  const label = SPACE_KINDS.find((k) => k.kind === kind)!.label;
  const canCreate = kind === "job" || !!picked || !!name.trim();

  const pin = (p: SpacePin) => setPins(addPin(pins, p));

  const create = async () => {
    setErr(null);
    if (kind === "job") { onClose(); router.push("/dashboard/scope?new=1"); return; }
    setBusy(true);
    try {
      if (kind === "collection") {
        const r = await fetch("/api/threads/custom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), source: "manual" }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.thread) throw new Error(j.error ?? "Couldn't make it.");
        onMade(); onClose(); router.push(`/dashboard/messages?t=${j.thread.id}`);
        return;
      }
      let id = picked?.id ?? null, shown = picked?.name ?? name.trim();
      if (!id) {
        const r = await fetch(kind === "customer" ? "/api/customers" : "/api/vendors", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }),
        });
        const j = await r.json().catch(() => ({}));
        const made = kind === "customer" ? j.customer : j.vendor;
        if (!r.ok || !made?.id) throw new Error(j.error ?? "Couldn't make it.");
        id = made.id as string; shown = (made.name as string) ?? shown;
      }
      pin({ kind, id: id!, name: shown });
      onClose();
      router.push(kind === "customer" ? `/dashboard/customers/${id}` : `/dashboard/vendors/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't make it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sc-newspace-scrim" onClick={onClose}>
      <div className="sc-newspace" role="dialog" aria-modal="true" aria-label="New Space" onClick={(e) => e.stopPropagation()}>
        <div className="sc-newspace-head">
          <span>New Space</span>
          <button type="button" className="sc-shelf-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="sc-newspace-kinds" role="radiogroup" aria-label="What kind of Space">
          {SPACE_KINDS.map((k) => (
            <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className="sc-newspace-kind"
              data-on={kind === k.kind ? "" : undefined} onClick={() => { setKind(k.kind); setFrom("blank"); setErr(null); }}>
              <SpaceSilhouette kind={SHAPE[k.kind]} color={COLOR[k.kind]} initials={monogram(name || k.label)} size={40} on={kind === k.kind} />
              <span className="sc-newspace-kl">{k.label}</span>
              <span className="sc-newspace-ks">{k.shelves}</span>
            </button>
          ))}
        </div>
        <p className="sc-newspace-blurb">{SPACE_KINDS.find((k) => k.kind === kind)!.blurb}</p>
        {kind !== "job" && (
          <label className="sc-newspace-field">
            <span>Name</span>
            <input autoFocus value={name} maxLength={80} onChange={(e) => { setName(e.target.value); if (from !== "blank") setFrom("blank"); }}
              placeholder={kind === "collection" ? "Fort Polk crew" : kind === "customer" ? "Art Apartments" : "Casco"}
              onKeyDown={(e) => { if (e.key === "Enter" && canCreate && !busy) void create(); }} />
          </label>
        )}
        {(kind === "customer" || kind === "vendor") && (
          <div className="sc-newspace-field">
            <span>Start with</span>
            <div className="sc-newspace-opts">
              <button type="button" className="sc-newspace-opt" data-on={from === "blank" ? "" : undefined} onClick={() => setFrom("blank")}>
                Blank{name.trim() ? ` — a new ${label.toLowerCase()} named “${name.trim()}”` : ""}
              </button>
              {opts[kind] === undefined && <span className="sc-space-empty">Loading…</span>}
              {matches.map((o) => (
                <button key={o.id} type="button" className="sc-newspace-opt" data-on={from === o.id ? "" : undefined} onClick={() => setFrom(o.id)}>
                  {o.name}{pins.some((p) => p.kind === kind && p.id === o.id) ? " · on the rail" : ""}
                </button>
              ))}
            </div>
          </div>
        )}
        {err && <p className="sc-newspace-err">{err}</p>}
        <div className="sc-newspace-foot">
          <button type="button" className="sc-space-more" onClick={onClose}>Cancel</button>
          <button type="button" className="sc-newspace-go" disabled={!canCreate || busy} onClick={() => void create()}>
            {busy ? "Making it…" : kind === "job" ? "Open the New job form" : picked ? `Add ${picked.name} to the rail` : `Create ${label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
