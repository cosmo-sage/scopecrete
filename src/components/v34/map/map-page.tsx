"use client";
/**
 * The Map page (Claude Design 11, design_handoff_map; Coy, 2026-10-08: "add the
 * map page to the main menu on desktop; toolbox on mobile. And I want to be
 * able to push the snipits from the map into the takeoffs tool to do the
 * measurements on satellite images. That can replace the current satellite page
 * in the plan room.").
 *
 * Every job and vendor with an address as a pin (/api/map/pins), in eight
 * layers with job filters; one search for addresses and records; a card per
 * pin; and Clip for takeoff — frame any spot on satellite, pick the job, and it
 * becomes a scaled sheet in that job's Takeoffs (POST /api/jobs/[id]/aerial
 * with the frame's size, src/lib/map.ts clipPlan). Takeoffs' Satellite tab
 * opens here with ?clip=<job>.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { T, F, disp, strong, clip as clipText, nums, formatPhone } from "@/lib/v34/tokens";
import { PageHeader, MenuButton, SlideDrawer } from "@/components/v34/primitives";
import { useWide } from "@/lib/v34/use-wide";
import {
  LAYERS, LAYER, DEFAULT_FILTERS, cleanFilters, visiblePins, layerCounts, cities, clusterPins, clusterSize,
  scaleReadout, feetPerPixel, clipPlan, nearestJobs, distanceLabel, fromWorldPx, worldPx,
  type LayerId, type MapFilters, type MapPin, type MapPinsResponse, type PickJob,
} from "@/lib/map";
import type { AddressSuggestion } from "@/lib/aerial";
import { MapView, ZoomButtons, fitView, type View } from "./map-view";

const FILTERS_KEY = "sc.map.filters";
const HOME: View = { lat: 30.4515, lng: -91.1371, zoom: 10 }; // Baton Rouge, until there are pins
const TYPES: Array<[string, string]> = [["residential", "Residential"], ["commercial", "Commercial"], ["public", "Government"]];

async function call(url: string, method = "GET", body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onDoubleClick: (e: React.MouseEvent) => e.stopPropagation() };
const btn = (primary?: boolean, dark?: boolean): React.CSSProperties => ({
  height: 32, padding: "0 12px", borderRadius: 3, fontFamily: disp, fontSize: 12.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap",
  background: primary ? T.hiviz : dark ? "rgba(255,255,255,.08)" : T.card, color: primary ? T.onHiviz : dark ? "#fff" : T.ink,
  border: `1px solid ${primary ? T.hiviz : dark ? "rgba(255,255,255,.25)" : T.hairStrong}`,
});

function Switch({ on, onChange, label, small }: { on: boolean; onChange: (v: boolean) => void; label: string; small?: boolean }) {
  const w = small ? 28 : 34, h = small ? 16 : 20, d = h - 4;
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className="relative rounded-full shrink-0" style={{ width: w, height: h, background: on ? T.ink : T.hairStrong, transition: "background .15s", cursor: "pointer" }}>
      <span className="absolute rounded-full" style={{ width: d, height: d, top: 2, left: 2, background: "#fff", transform: on ? `translateX(${w - h}px)` : "none", transition: "transform .15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
    </button>
  );
}

function Dot({ l, size = 9, dim }: { l: LayerId; size?: number; dim?: boolean }) {
  const L = LAYER.get(l)!;
  return <span aria-hidden style={{ width: size, height: size, flexShrink: 0, background: L.color, borderRadius: L.square ? 1 : 999, transform: L.square ? "rotate(45deg) scale(.85)" : undefined, opacity: dim ? 0.4 : 1 }} />;
}

/* ------------------------------------------------------------ layers */

function LayerPanel({ data, f, setF }: { data: MapPinsResponse | null; f: MapFilters; setF: (f: MapFilters) => void }) {
  const counts = useMemo(() => layerCounts(data?.pins ?? [], f), [data, f]);
  const cityList = useMemo(() => cities(data?.pins ?? []), [data]);
  const on = new Set(f.layers);
  const set = (id: LayerId, v: boolean) => setF({ ...f, layers: v ? [...f.layers, id] : f.layers.filter((x) => x !== id) });
  const head: React.CSSProperties = { fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: T.ink3 };
  const filtered = f.jobTypes.length > 0 || !!f.city || f.created !== "any";
  return (
    <div className="p-3 flex flex-col gap-1" style={{ fontSize: F.sm }}>
      <div className="flex items-center justify-between" style={{ padding: "2px 2px 6px" }}>
        <span style={head}>Layers</span>
        <button type="button" onClick={() => setF({ ...f, layers: LAYERS.map((l) => l.id) })} style={{ fontSize: 12, color: T.chalk, fontWeight: 600, cursor: "pointer" }}>All on</button>
      </div>
      {LAYERS.map((l) => {
        const isOn = on.has(l.id);
        return (
          <div key={l.id}>
            <div className="flex items-center gap-2.5" style={{ minHeight: 46, borderTop: `1px solid ${T.hairSoft}` }}>
              <Dot l={l.id} dim={!isOn} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: isOn ? T.ink : T.ink3, ...clipText }}>{l.label}</div>
                <div style={{ fontSize: 11, color: T.ink3, ...clipText }}>{l.sub}</div>
              </div>
              <span style={{ ...nums, color: T.ink2, fontSize: 12.5, minWidth: 18, textAlign: "right" }}>{counts[l.id]}</span>
              <Switch on={isOn} onChange={(v) => set(l.id, v)} label={l.label} />
            </div>
            {isOn && counts[l.id] === 0 && data && (
              <div style={{ margin: "0 0 8px 20px", padding: "6px 8px", border: `1px dashed ${T.hairStrong}`, borderRadius: 3, fontSize: 11.5, color: T.ink3 }}>
                No {l.label.toLowerCase()} — nothing to show on the map.
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between" style={{ padding: "16px 2px 6px", borderTop: `1px solid ${T.hairSoft}` }}>
        <span style={head}>Filters · jobs</span>
        {filtered && <button type="button" onClick={() => setF({ ...f, jobTypes: [], city: "", created: "any" })} style={{ fontSize: 12, color: T.chalk, fontWeight: 600, cursor: "pointer" }}>Clear</button>}
      </div>
      <div style={{ fontSize: 11.5, color: T.ink2, marginBottom: 4 }}>Job type</div>
      <div className="flex gap-1.5 flex-wrap">
        {TYPES.map(([k, label]) => {
          const sel = f.jobTypes.includes(k);
          return (
            <button key={k} type="button" aria-pressed={sel} onClick={() => setF({ ...f, jobTypes: sel ? f.jobTypes.filter((x) => x !== k) : [...f.jobTypes, k] })}
              className="rounded-full" style={{ height: 28, padding: "0 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", background: sel ? T.ink : T.card, color: sel ? T.card : T.ink2, border: `1px solid ${sel ? T.ink : T.hairStrong}` }}>{label}</button>
          );
        })}
      </div>
      <label style={{ fontSize: 11.5, color: T.ink2, marginTop: 10 }}>City
        <select value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} style={{ display: "block", width: "100%", height: 32, marginTop: 3, border: `1px solid ${T.hairStrong}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: F.sm, padding: "0 6px" }}>
          <option value="">Every city</option>
          {cityList.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label style={{ fontSize: 11.5, color: T.ink2, marginTop: 8 }}>Created
        <select value={f.created} onChange={(e) => setF({ ...f, created: e.target.value as MapFilters["created"] })} style={{ display: "block", width: "100%", height: 32, marginTop: 3, border: `1px solid ${T.hairStrong}`, borderRadius: 3, background: T.card, color: T.ink, fontSize: F.sm, padding: "0 6px" }}>
          <option value="any">Any time</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="1y">Last year</option>
        </select>
      </label>
      <div style={{ fontSize: 11, color: T.ink3, marginTop: 10 }}>Vendors show whatever the job filters say. Where each one delivers isn&apos;t drawn yet — their delivery area is a line of text.</div>
    </div>
  );
}

/* -------------------------------------------------------------- card */

function PinCard({ pin, onClose, onClip }: { pin: MapPin; onClose: () => void; onClip: (p: MapPin) => void }) {
  const L = LAYER.get(pin.layer)!;
  const dirs = `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`;
  const a: React.CSSProperties = { ...btn(), height: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" };
  const job = pin.kind === "job";
  return (
    <div {...stop} style={{ fontSize: F.sm, color: T.ink }}>
      <div className="flex items-start gap-2">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: strong, fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>{pin.name}</div>
          <div style={{ fontSize: 12, color: T.ink2, marginTop: 1 }}>{job ? pin.customer ?? "" : pin.vendorKind}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" style={{ width: 28, height: 28, color: T.ink2, fontSize: 18, cursor: "pointer" }}>×</button>
      </div>
      <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 6 }}>{pin.addr}</div>
      <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 8 }}>
        <span style={{ fontFamily: disp, fontSize: 10.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", background: L.color, color: "#fff", padding: "2px 7px", borderRadius: 3 }}>{job ? pin.stage : "Vendor"}</span>
        {job && pin.type && <span style={{ fontSize: 12, color: T.ink2 }}>{TYPES.find(([k]) => k === pin.type)?.[1] ?? pin.type}</span>}
        {pin.note && <span style={{ fontSize: 12, color: pin.urgent ? T.red : T.ink2, fontWeight: pin.urgent ? 600 : 400 }}>{pin.note}</span>}
        {!job && pin.phone && <span style={{ fontSize: 12, color: T.ink2 }}>{formatPhone(pin.phone)}</span>}
      </div>
      {!job && pin.deliverLabel && <div style={{ fontSize: 12, color: T.ink3, marginTop: 4 }}>{pin.deliverLabel}</div>}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 12 }}>
        {job ? <>
          <Link href={`/dashboard/scope/${pin.id}`} style={{ ...a, background: T.ink, color: T.card, borderColor: T.ink }}>Open job ›</Link>
          <a href={dirs} target="_blank" rel="noreferrer" style={a}>Directions</a>
          {pin.phone ? <a href={`tel:${pin.phone}`} style={a}>Call</a> : <span style={{ ...a, opacity: 0.45, cursor: "default" }} title="No phone on this job's person">Call</span>}
          <button type="button" onClick={() => onClip(pin)} style={{ ...a, ...btn(true), height: 40 }}>Send to Takeoffs</button>
        </> : <>
          <Link href={`/dashboard/vendors/${pin.id}`} style={{ ...a, background: T.ink, color: T.card, borderColor: T.ink }}>Vendor page ›</Link>
          {pin.phone ? <a href={`tel:${pin.phone}`} style={a}>Call</a> : <span style={{ ...a, opacity: 0.45 }}>Call</span>}
          <a href={dirs} target="_blank" rel="noreferrer" style={a}>Directions</a>
          {pin.email ? <a href={`mailto:${pin.email}`} style={a}>Email</a> : <span style={{ ...a, opacity: 0.45 }}>Email</span>}
        </>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ search */

function SearchBox({ pins, view, onAddress, onPin }: {
  pins: MapPin[]; view: View;
  onAddress: (p: { lat: number; lng: number; label: string }) => void; onPin: (p: MapPin) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [addrs, setAddrs] = useState<AddressSuggestion[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const near = useRef(view);
  useEffect(() => { near.current = view; }, [view]);
  useEffect(() => {
    const text = q.trim();
    const t = setTimeout(async () => {
      if (text.length < 3) { setAddrs([]); return; }
      try {
        const r = await fetch(`/api/aerial/suggest?q=${encodeURIComponent(text)}&lat=${near.current.lat}&lng=${near.current.lng}`);
        const b = r.ok ? await r.json() : null;
        setAddrs(Array.isArray(b?.suggestions) ? b.suggestions.slice(0, 5) : []);
      } catch { setAddrs([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const recs = words.length ? pins.filter((p) => { const h = `${p.name} ${p.customer ?? ""} ${p.addr}`.toLowerCase(); return words.every((w) => h.includes(w)); }).slice(0, 6) : [];
  const pick = async (s: AddressSuggestion) => {
    setOpen(false); setQ(s.label); setErr(null);
    if (typeof s.lat === "number" && typeof s.lng === "number") { onAddress({ lat: s.lat, lng: s.lng, label: s.label }); return; }
    if (!s.key) return;
    const r = await fetch(`/api/aerial/suggest?text=${encodeURIComponent(s.label)}&key=${encodeURIComponent(s.key)}`).then((x) => x.json()).catch(() => null);
    if (r?.found) onAddress(r.found); else setErr("Couldn't place that address.");
  };
  const find = async () => {
    if (recs[0]) { setOpen(false); onPin(recs[0]); return; }
    if (addrs[0]) { void pick(addrs[0]); return; }
    if (q.trim().length < 3) return;
    const r = await fetch(`/api/aerial/suggest?find=${encodeURIComponent(q.trim())}`).then((x) => x.json()).catch(() => null);
    if (r?.found) { setOpen(false); onAddress(r.found); } else setErr(`Couldn't find "${q.trim()}".`);
  };
  const sec: React.CSSProperties = { fontFamily: disp, fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: T.ink3, padding: "8px 12px 4px" };
  const showing = open && (addrs.length > 0 || recs.length > 0);
  const bold = (label: string) => {
    const t = q.trim();
    return t && label.toLowerCase().startsWith(t.toLowerCase()) ? <><b>{label.slice(0, t.length)}</b>{label.slice(t.length)}</> : label;
  };
  return (
    <div {...stop} className="relative" style={{ width: "100%" }}>
      <form onSubmit={(e) => { e.preventDefault(); void find(); }}
        className="flex items-center gap-2 rounded" style={{ height: 44, background: T.card, padding: "0 6px 0 12px", boxShadow: open ? `0 0 0 2px ${T.hiviz}, 0 4px 14px rgba(0,0,0,.18)` : "0 2px 10px rgba(0,0,0,.18)", border: `1px solid ${T.hairStrong}` }}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke={T.ink3} strokeWidth="1.8" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4.5 4.5" /></svg>
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setErr(null); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setOpen(false); } }}
          placeholder="Search an address, customer, job or vendor" aria-label="Search the map" autoComplete="off"
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.ink, fontSize: 14 }} />
        {q && <button type="button" onClick={() => { setQ(""); setAddrs([]); }} aria-label="Clear" style={{ width: 28, height: 28, color: T.ink2, fontSize: 18, cursor: "pointer" }}>×</button>}
      </form>
      {showing && (
        <div className="absolute left-0 right-0 rounded overflow-hidden" style={{ top: 48, background: T.card, border: `1px solid ${T.hairStrong}`, boxShadow: "0 8px 22px rgba(0,0,0,.2)", zIndex: 20, maxHeight: "55vh", overflowY: "auto" }}>
          {addrs.length > 0 && <div style={sec}>Addresses</div>}
          {addrs.map((s, i) => (
            <button key={`a${i}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void pick(s)} className="flex items-center gap-2 w-full text-left"
              style={{ minHeight: 38, padding: "4px 12px", fontSize: 13, color: T.ink, cursor: "pointer", borderTop: i ? `1px solid ${T.hairSoft}` : "none" }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={T.ink3} strokeWidth="1.6" aria-hidden="true"><path d="M10 18s6-5.6 6-10A6 6 0 0 0 4 8c0 4.4 6 10 6 10z" /><circle cx="10" cy="8" r="2" /></svg>
              <span style={{ ...clipText }}>{bold(s.label)}</span>
            </button>
          ))}
          {recs.length > 0 && <div style={{ ...sec, borderTop: addrs.length ? `1px solid ${T.hair}` : "none" }}>Your records</div>}
          {recs.map((p) => {
            const L = LAYER.get(p.layer)!;
            return (
              <button key={`${p.kind}:${p.id}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); setQ(p.name); onPin(p); }}
                className="flex items-center gap-2 w-full text-left" style={{ minHeight: 42, padding: "4px 12px", cursor: "pointer", borderTop: `1px solid ${T.hairSoft}` }}>
                <span className="flex items-center justify-center rounded shrink-0" style={{ width: 24, height: 24, background: L.color, color: "#fff", fontSize: 11, fontWeight: 700 }}>{p.kind === "vendor" ? "V" : "J"}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.ink, ...clipText }}>{p.name}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: T.ink3, ...clipText }}>{[p.customer, p.addr].filter(Boolean).join(" · ")}</span>
                </span>
                <span style={{ fontFamily: disp, fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: L.color }}>{p.kind === "vendor" ? "Vendor" : p.stage}</span>
              </button>
            );
          })}
        </div>
      )}
      {err && <div className="rounded" style={{ marginTop: 4, padding: "4px 8px", background: T.card, color: T.red, fontSize: 12 }}>{err}</div>}
    </div>
  );
}

/* -------------------------------------------------------------- page */

type Clip = null | { step: "frame" | "job"; jobId: string | null };
type Saved = { jobId: string; jobTitle: string; sheetId: string; c: { lat: number; lng: number }; z: number; w: number; h: number; n: number };

export function MapPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [wideRef, wide] = useWide<HTMLDivElement>(900);
  const [data, setData] = useState<MapPinsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setFState] = useState<MapFilters>(DEFAULT_FILTERS);
  const [view, setView] = useState<View>(HOME);
  const [mode, setMode] = useState<"map" | "sat">("map");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sel, setSel] = useState<MapPin | null>(null);
  const [plain, setPlain] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [clip, setClip] = useState<Clip>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [toast, setToast] = useState<Saved | null>(null);
  const fitted = useRef(false);
  // The ground at the frame's centre when "Use this frame" is tapped, kept centred as the frame moves for the job list.
  const pendingCentre = useRef<{ lat: number; lng: number } | null>(null);

  // Filters remembered on the device (the design's sc.map.filters).
  useEffect(() => {
    const t = setTimeout(() => { try { const s = localStorage.getItem(FILTERS_KEY); if (s) setFState(cleanFilters(JSON.parse(s))); } catch { /* none kept */ } }, 0);
    return () => clearTimeout(t);
  }, []);
  const setF = (n: MapFilters) => { setFState(n); try { localStorage.setItem(FILTERS_KEY, JSON.stringify(n)); } catch { /* not kept */ } };

  const load = useCallback(() => call("/api/map/pins").then((d) => { setData(d as MapPinsResponse); setErr(null); }).catch((e) => setErr(e instanceof Error ? e.message : String(e))), []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => visiblePins(data?.pins ?? [], f), [data, f]);

  // Open on the pins (once), unless a clip asked for a job.
  const clipJob = sp.get("clip");
  useEffect(() => {
    if (fitted.current || !data || !size.w || clipJob) return;
    fitted.current = true;
    const v = fitView(shown, size.w, size.h, 56, 15);
    if (v) setTimeout(() => setView(v), 0);
  }, [data, size, shown, clipJob]);

  // ?clip=<job>: Takeoffs' Satellite — frame that job's site on satellite.
  useEffect(() => {
    if (!clipJob || !data || fitted.current) return;
    fitted.current = true;
    const j = data.jobs.find((x) => x.id === clipJob);
    setTimeout(() => {
      setMode("sat"); setClip({ step: "frame", jobId: clipJob });
      if (j?.lat != null && j.lng != null) setView({ lat: j.lat, lng: j.lng, zoom: 19 });
    }, 0);
    if (j?.lat != null && j.lng != null) return;
    call(`/api/jobs/${clipJob}/aerial`).then((b) => { if (b?.found) setView({ lat: b.found.lat, lng: b.found.lng, zoom: 19 }); }).catch(() => {});
  }, [clipJob, data]);

  const counts = data ? data.pins.length : 0;
  const goPin = (p: MapPin) => { setSel(p); setPlain(null); setView((v) => ({ lat: p.lat, lng: p.lng, zoom: Math.max(v.zoom, 15) })); };
  const startClip = (p?: MapPin) => {
    setSel(null); setMode("sat"); setLayersOpen(false);
    setClip({ step: "frame", jobId: p && p.kind === "job" ? p.id : null });
    setView((v) => (p ? { lat: p.lat, lng: p.lng, zoom: Math.max(19, v.zoom) } : { ...v, zoom: Math.max(18, v.zoom) }));
  };
  const endClip = () => {
    setClip(null);
    if (clipJob) router.replace("/dashboard/map", { scroll: false });
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key !== "Escape") return; if (clip) endClip(); else setSel(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);

  // The clip frame: fixed on the screen, the map moves under it.
  const frame = useMemo(() => {
    if (!clip || !size.w) return null;
    if (wide) {
      const w = Math.min(960, size.w - (clip.step === "job" ? 440 : 80)), h = Math.min(680, size.h - 110);
      const cx = clip.step === "job" ? (size.w - 400) / 2 : size.w / 2;
      return { x: cx - w / 2, y: (size.h - h) / 2, w, h };
    }
    const w = size.w - 32;
    const h = clip.step === "job" ? Math.min(220, size.h * 0.32) : Math.min(360, size.h - 210);
    return { x: 16, y: clip.step === "job" ? 64 : Math.max(64, (size.h - h) / 2 - 20), w, h };
  }, [clip, size, wide]);
  // The frame's centre on the ground (the clip's centre).
  const frameCentre = useMemo(() => {
    if (!frame) return null;
    const c = worldPx(view.lat, view.lng, view.zoom);
    return fromWorldPx(c.x + frame.x + frame.w / 2 - size.w / 2, c.y + frame.y + frame.h / 2 - size.h / 2, view.zoom);
  }, [frame, view, size]);
  const plan = frame ? clipPlan(frame.w, frame.h, view.zoom) : null;
  // Moving to the job step shrinks the frame (phone) or shifts it (desktop): keep the same ground centred in it.
  const toJobStep = () => {
    if (!frame || !frameCentre) return;
    setClip((c) => (c ? { ...c, step: "job" } : c));
  };
  useEffect(() => {
    if (!clip || clip.step !== "job" || !frame || !pendingCentre.current) return;
    const g = pendingCentre.current; pendingCentre.current = null;
    const w = worldPx(g.lat, g.lng, view.zoom);
    const c = fromWorldPx(w.x - (frame.x + frame.w / 2 - size.w / 2), w.y - (frame.y + frame.h / 2 - size.h / 2), view.zoom);
    setView((v) => ({ ...v, lat: c.lat, lng: c.lng }));
  }, [clip, frame, size, view.zoom]);

  const overlay = (place: (lat: number, lng: number) => { x: number; y: number }, s: { w: number; h: number }) => {
    const items: React.ReactNode[] = [];
    // Clips put in Takeoffs this visit: a dashed box with its tag.
    for (const c of saved) {
      const k = 2 ** (view.zoom - c.z), p = place(c.c.lat, c.c.lng);
      const w = c.w * k, h = c.h * k;
      items.push(
        <div key={`clip${c.sheetId}`} style={{ position: "absolute", left: p.x - w / 2, top: p.y - h / 2, width: w, height: h, border: "2px dashed #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.4)", pointerEvents: "none" }}>
          <span style={{ position: "absolute", left: 4, top: 4, background: "rgba(20,22,20,.78)", color: "#fff", fontSize: 11, padding: "2px 6px", borderRadius: 3, whiteSpace: "nowrap" }}>Aerial {c.n} · in Takeoffs</span>
        </div>,
      );
    }
    if (!clip) {
      for (const cl of clusterPins(shown, view.zoom)) {
        const c = worldPx(view.lat, view.lng, view.zoom);
        const x = cl.x - c.x + s.w / 2, y = cl.y - c.y + s.h / 2;
        if (x < -60 || y < -60 || x > s.w + 60 || y > s.h + 60) continue;
        if (cl.pins.length > 1) {
          const d = clusterSize(cl.pins.length);
          items.push(
            <button key={cl.key} type="button" aria-label={`${cl.pins.length} pins — zoom in`} onClick={() => {
              const g = fromWorldPx(cl.x, cl.y, view.zoom);
              setView({ lat: g.lat, lng: g.lng, zoom: Math.min(view.zoom + 2, 16) });
            }} className="flex items-center justify-center rounded-full"
              style={{ position: "absolute", left: x - d / 2, top: y - d / 2, width: d, height: d, background: T.ink, color: T.card, fontFamily: strong, fontSize: 13, fontWeight: 600, border: "2px solid #fff", boxShadow: "0 2px 6px rgba(0,0,0,.3)", cursor: "pointer" }}>
              {cl.pins.length}
            </button>,
          );
          continue;
        }
        const p = cl.pins[0], L = LAYER.get(p.layer)!;
        const on = sel?.id === p.id && sel.kind === p.kind;
        const d = on ? 22 : 16;
        items.push(
          <button key={cl.key} type="button" aria-label={p.name} title={p.name} onClick={() => { setSel(p); setPlain(null); }}
            style={{ position: "absolute", left: x - d / 2, top: y - d / 2, width: d, height: d, background: L.color, border: `${on ? 3 : 2}px solid #fff`, borderRadius: L.square ? 2 : 999,
              transform: L.square ? "rotate(45deg)" : undefined, boxShadow: on ? "0 0 0 6px rgba(42,42,42,.25), 0 2px 6px rgba(0,0,0,.35)" : "0 1px 4px rgba(0,0,0,.35)", cursor: "pointer", zIndex: on ? 3 : 2 }} />,
        );
        if (view.zoom >= 13) items.push(
          <span key={`${cl.key}-l`} aria-hidden style={{ position: "absolute", left: x + 12, top: y - 8, fontFamily: strong, fontSize: 11, fontWeight: 600, color: mode === "sat" ? "#fff" : T.ink, whiteSpace: "nowrap", pointerEvents: "none",
            textShadow: mode === "sat" ? "0 0 3px #000, 0 0 2px #000" : "0 0 3px #fff, 0 0 2px #fff, 0 0 1px #fff" }}>{p.name}</span>,
        );
      }
      if (plain) {
        const p = place(plain.lat, plain.lng);
        items.push(
          <svg key="plain" width="26" height="34" viewBox="0 0 26 34" aria-label={plain.label} style={{ position: "absolute", left: p.x - 13, top: p.y - 33, pointerEvents: "none", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))" }}>
            <path d="M13 33s11-11.2 11-20A11 11 0 0 0 2 13c0 8.8 11 20 11 20z" fill={T.ink} stroke="#fff" strokeWidth="2" /><circle cx="13" cy="13" r="4" fill="#fff" />
          </svg>,
        );
      }
      // The selected pin's card, anchored to it on a desktop.
      if (sel && wide) {
        const p = place(sel.lat, sel.lng);
        const left = Math.max(12, Math.min(s.w - 372, p.x - 180));
        const above = p.y > 330;
        items.push(
          <div key="card" className="rounded" style={{ position: "absolute", left, top: above ? undefined : p.y + 18, bottom: above ? s.h - p.y + 18 : undefined, width: 360, padding: 14, background: T.card, border: `1px solid ${T.hair}`, boxShadow: "0 10px 30px rgba(0,0,0,.22)", zIndex: 8 }}>
            <PinCard pin={sel} onClose={() => setSel(null)} onClip={startClip} />
          </div>,
        );
      }
    }
    return items;
  };

  const layersBody = <LayerPanel data={data} f={f} setF={setF} />;
  const legend = LAYERS.filter((l) => f.layers.includes(l.id) && l.id !== "done" && l.id !== "lost");
  const ink = clip ? "#fff" : T.ink;
  const mapControls = (
    <>
                <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${T.hairStrong}`, boxShadow: "0 2px 8px rgba(0,0,0,.15)" }}>
                  {([["map", "Map"], ["sat", "Satellite"]] as const).map(([k, label]) => (
                    <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}
                      style={{ height: 30, padding: "0 10px", fontFamily: disp, fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", background: mode === k ? T.ink : T.card, color: mode === k ? T.card : T.ink2, cursor: "pointer" }}>{label}</button>
                  ))}
                </div>
                {!wide && (
                  <button type="button" aria-label="Where I am" title="Where I am" onClick={() => navigator.geolocation?.getCurrentPosition((p) => setView({ lat: p.coords.latitude, lng: p.coords.longitude, zoom: 16 }), () => {})}
                    className="flex items-center justify-center rounded" style={{ width: 36, height: 36, background: T.card, border: `1px solid ${T.hairStrong}`, boxShadow: "0 2px 8px rgba(0,0,0,.15)", cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke={T.ink} strokeWidth="1.7" aria-hidden="true"><circle cx="10" cy="10" r="4.5" /><path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" /></svg>
                  </button>
                )}
    </>
  );

  return (
    <div ref={wideRef} className="sc-pinned flex flex-col" style={{ background: T.slab }}>
      {!clip ? (
        <PageHeader title="Map" count={data ? `${counts} pinned${data.unmapped.customers ? ` · ${data.unmapped.customers} unmapped` : ""}` : ""}
          sub="Every job and vendor with an address. Frame any spot on satellite and send it to a job's Takeoffs to measure."
          menu={<MenuButton onClick={() => setLayersOpen(true)} label="Layers" />}
          actions={<div className="flex items-center gap-2">
            {!wide && <button type="button" onClick={() => setLayersOpen(true)} style={btn()}>Layers</button>}
            <button type="button" onClick={() => startClip()} style={btn(true)}>{wide ? "Clip for takeoff" : "Clip"}</button>
          </div>} />
      ) : (
        <div className="flex items-center gap-2" style={{ minHeight: 48, padding: "6px 12px", background: "#1a1c1a", color: "#fff" }}>
          <button type="button" onClick={() => (clip.step === "job" ? setClip({ ...clip, step: "frame" }) : endClip())} style={{ ...btn(false, true), height: 30 }}>‹ Back</button>
          <span style={{ fontFamily: disp, fontSize: 15, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", flex: 1, textAlign: "center" }}>Clip for takeoff</span>
          <button type="button" onClick={endClip} style={{ ...btn(false, true), height: 30 }}>Cancel</button>
        </div>
      )}

      <div className="flex-1 flex" style={{ minHeight: 0, position: "relative", overflow: "hidden" }}>
        {wide && (
          <aside style={{ width: 300, flexShrink: 0, background: T.card, borderRight: `1px solid ${T.hair}`, overflowY: "auto", opacity: clip ? 0.45 : 1, pointerEvents: clip ? "none" : undefined }} aria-hidden={!!clip}>
            {layersBody}
          </aside>
        )}
        <div className="flex-1 relative" style={{ minWidth: 0 }}>
          <MapView view={view} onView={(v) => { setView(v); }} mode={clip ? "sat" : mode} overlay={overlay} onSize={setSize}
            onBackgroundTap={() => { if (!clip) setSel(null); }}>
            {/* Search (top left) */}
            {!clip && (
              <div className="absolute flex flex-col gap-2" style={{ left: 10, top: 10, right: wide ? undefined : 10, width: wide ? 440 : undefined, maxWidth: wide ? "calc(100% - 200px)" : undefined, zIndex: 10 }}>
                <SearchBox pins={data?.pins ?? []} view={view} onPin={goPin} onAddress={(a) => { setSel(null); setPlain(a); setView({ lat: a.lat, lng: a.lng, zoom: 17 }); }} />
                {err && <div {...stop} className="rounded" style={{ padding: "6px 10px", background: T.card, color: T.red, fontSize: 12.5 }}>{err} <button onClick={() => void load()} style={{ color: T.chalk, fontWeight: 600 }}>Try again</button></div>}
                {data && !data.stored && <div {...stop} className="rounded" style={{ padding: "4px 10px", background: T.card, color: T.ink3, fontSize: 11.5 }}>Addresses are looked up on each visit until migration 090 is applied.</div>}
                {!wide && <div {...stop} className="flex items-start justify-end gap-2" style={{ alignSelf: "flex-end" }}>{mapControls}</div>}
              </div>
            )}
            {/* Map · Satellite (top right on a desktop; under the search on a phone, so the banner never hides it) */}
            {!clip && wide && (
              <div {...stop} className="absolute flex flex-col items-end gap-2" style={{ right: 10, top: 10, zIndex: 9 }}>{mapControls}</div>
            )}
            {/* Legend (bottom left) */}
            {!clip && legend.length > 0 && (
              <div {...stop} className="absolute rounded" style={{ left: 10, bottom: 16, zIndex: 6, background: T.card, border: `1px solid ${T.hair}`, boxShadow: "0 2px 8px rgba(0,0,0,.12)", minWidth: 120 }}>
                <button type="button" onClick={() => setLegendOpen((o) => !o)} aria-expanded={legendOpen} className="flex items-center gap-1.5 w-full" style={{ height: 28, padding: "0 10px", fontFamily: disp, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: T.ink2, cursor: "pointer" }}>
                  Legend <span style={{ marginLeft: "auto" }}>{legendOpen ? "▾" : "▸"}</span>
                </button>
                {legendOpen && <div style={{ padding: "0 10px 8px" }}>
                  {legend.map((l) => <div key={l.id} className="flex items-center gap-2" style={{ fontSize: 11, color: T.ink2, height: 18 }}><Dot l={l.id} />{l.label}</div>)}
                </div>}
              </div>
            )}
            {!clip && <ZoomButtons view={view} onView={setView} bottom={wide ? 16 : 76} />}
            {!clip && !wide && (
              <button {...stop} type="button" onClick={() => startClip()} className="absolute flex items-center gap-1.5 rounded"
                style={{ right: 12, bottom: 16, height: 44, padding: "0 14px", zIndex: 6, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: 13, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", boxShadow: "0 4px 14px rgba(0,0,0,.25)", cursor: "pointer" }}>
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 6V2h4M14 2h4v4M18 14v4h-4M6 18H2v-4" /></svg>
                Clip for takeoff
              </button>
            )}
            {/* The phone's pin card: a sheet from the bottom. */}
            {!clip && sel && !wide && (
              <div className="absolute left-0 right-0 bottom-0" style={{ zIndex: 12, background: T.card, borderRadius: "12px 12px 0 0", boxShadow: "0 -8px 26px rgba(0,0,0,.22)", padding: "6px 14px 14px" }}>
                <div aria-hidden style={{ width: 36, height: 4, borderRadius: 99, background: T.hairStrong, margin: "0 auto 8px" }} />
                <PinCard pin={sel} onClose={() => setSel(null)} onClip={startClip} />
              </div>
            )}

            {clip && frame && <ClipFrame frame={frame} view={view} size={size} plan={plan} centre={frameCentre} step={clip.step} wide={wide}
              onUse={() => { pendingCentre.current = frameCentre; toJobStep(); }} />}
            {clip && clip.step === "job" && frameCentre && plan && (
              <JobPicker wide={wide} jobs={data?.jobs ?? []} at={frameCentre} pre={clip.jobId} plan={plan} view={view}
                onDone={(s) => {
                  setSaved((l) => [...l, s]); setToast(s); setClip(null); setMode("sat");
                  if (clipJob) router.replace("/dashboard/map", { scroll: false });
                  void load();
                }} />
            )}
            {toast && (
              <div {...stop} role="status" className="absolute flex items-center gap-2 rounded" style={{ left: "50%", transform: "translateX(-50%)", bottom: wide ? 24 : 80, zIndex: 20, background: T.ink, color: T.card, padding: "10px 12px", boxShadow: "0 8px 24px rgba(0,0,0,.3)", fontSize: 13, maxWidth: "calc(100% - 24px)" }}>
                <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 20, height: 20, background: T.green, color: "#fff", fontSize: 12 }}>✓</span>
                <span style={{ minWidth: 0 }}>Aerial added to <b>{toast.jobTitle}</b></span>
                <Link href={`/dashboard/scope/${toast.jobId}/plans?step=takeoff&sheet=${toast.sheetId}`} style={{ color: T.hivizSoft, fontWeight: 600, whiteSpace: "nowrap" }}>Measure it ›</Link>
              </div>
            )}
          </MapView>
        </div>
        {!wide && (
          <SlideDrawer open={layersOpen} onOpen={() => setLayersOpen(true)} onClose={() => setLayersOpen(false)} width={310} label="Layers">
            <div className="flex items-center justify-between" style={{ padding: "12px 14px 0" }}>
              <span style={{ fontFamily: disp, fontSize: 15, fontWeight: 600, letterSpacing: ".1em", color: ink }}>LAYERS</span>
              <button type="button" onClick={() => setLayersOpen(false)} style={btn()}>Done</button>
            </div>
            {layersBody}
          </SlideDrawer>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- clip frame */

function ClipFrame({ frame, view, size, plan, centre, step, wide, onUse }: {
  frame: { x: number; y: number; w: number; h: number }; view: View; size: { w: number; h: number };
  plan: { z: number; w: number; h: number } | null; centre: { lat: number; lng: number } | null; step: "frame" | "job"; wide: boolean; onUse: () => void;
}) {
  const lat = centre?.lat ?? view.lat;
  const bar = 50 / feetPerPixel(lat, view.zoom);
  const corner = (l: boolean, t: boolean): React.CSSProperties => ({ position: "absolute", width: 16, height: 16, [l ? "left" : "right"]: -3, [t ? "top" : "bottom"]: -3,
    [`border${t ? "Top" : "Bottom"}`]: "4px solid #fff", [`border${l ? "Left" : "Right"}`]: "4px solid #fff" });
  return (
    <>
      <div aria-hidden style={{ position: "absolute", left: frame.x, top: frame.y, width: frame.w, height: frame.h, border: "2px solid #fff", boxShadow: "0 0 0 2000px rgba(0,0,0,.46)", pointerEvents: "none", zIndex: 4 }}>
        {[1, 2].map((i) => <div key={`v${i}`} style={{ position: "absolute", left: `${(i * 100) / 3}%`, top: 0, bottom: 0, borderLeft: "1px solid rgba(255,255,255,.35)" }} />)}
        {[1, 2].map((i) => <div key={`h${i}`} style={{ position: "absolute", top: `${(i * 100) / 3}%`, left: 0, right: 0, borderTop: "1px solid rgba(255,255,255,.35)" }} />)}
        <span style={corner(true, true)} /><span style={corner(false, true)} /><span style={corner(true, false)} /><span style={corner(false, false)} />
        <div style={{ position: "absolute", left: 8, top: 8, background: "rgba(20,22,20,.78)", color: "#fff", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, display: "flex", alignItems: "center", gap: 8 }}>
          <span>{scaleReadout(lat, view.zoom)}</span>
          {bar > 8 && bar < frame.w - 120 && <span className="flex items-center gap-1"><span style={{ width: bar, height: 6, borderLeft: "2px solid #fff", borderRight: "2px solid #fff", borderBottom: "2px solid #fff" }} />50 ft</span>}
        </div>
        <div style={{ position: "absolute", right: 6, bottom: 4, color: "#fff", fontSize: 9.5, textShadow: "0 0 2px #000" }}>Mapbox Satellite · imagery date not known</div>
      </div>
      {step === "frame" && (
        <div {...stop} className="absolute flex flex-col items-center gap-2" style={{ left: 0, right: 0, top: Math.min(size.h - 110, frame.y + frame.h + 12), zIndex: 6, padding: "0 16px" }}>
          <div style={{ color: "#fff", fontSize: 12.5, textShadow: "0 1px 3px #000", textAlign: "center" }}>
            {plan ? (wide ? "Drag the map to move what's inside the frame. Scroll to zoom." : "Drag the map to move what's inside the frame. Pinch to zoom.") : "Zoom in closer to clip — street level or nearer (zoom 16)."}
          </div>
          <button type="button" disabled={!plan} onClick={onUse} style={{ ...btn(true), height: 44, padding: "0 22px", fontSize: 14, opacity: plan ? 1 : 0.5, width: wide ? undefined : "100%", maxWidth: 420 }}>Use this frame ›</button>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------- which job */

function JobPicker({ wide, jobs, at, pre, plan, view, onDone }: {
  wide: boolean; jobs: PickJob[]; at: { lat: number; lng: number }; pre: string | null; plan: { z: number; w: number; h: number }; view: View;
  onDone: (s: Saved) => void;
}) {
  const near = useMemo(() => nearestJobs(jobs, at), [jobs, at]);
  const [pick, setPick] = useState<string | null>(() => pre ?? (near[0]?.mi != null && near[0].mi < 0.03 ? near[0].id : null));
  const [q, setQ] = useState("");
  const [here, setHere] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    fetch(`/api/aerial/suggest?at=${at.lat},${at.lng}`).then((r) => r.json()).then((b) => { if (!off) setHere(typeof b?.address === "string" ? b.address : null); }).catch(() => {});
    return () => { off = true; };
  }, [at]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = (words.length ? near.filter((j) => { const h = `${j.title} ${j.customer ?? ""} ${j.addr ?? ""}`.toLowerCase(); return words.every((w) => h.includes(w)); }) : near).slice(0, wide ? 40 : 12);
  const preRow = pre && !list.some((j) => j.id === pre) ? near.find((j) => j.id === pre) : null;
  const rows = preRow ? [preRow, ...list] : list;

  const put = async () => {
    if (!pick) return;
    setErr(null);
    try {
      let jobId = pick, title = near.find((j) => j.id === pick)?.title ?? "the job";
      if (pick === "new") {
        if (!here) throw new Error("No street address found at this spot — pick a job, or make one on the Jobs board.");
        setBusy("Starting the job…");
        const street = here.split(",")[0].trim();
        const j = await call("/api/jobs", "POST", { title: street, address: here });
        jobId = j.id ?? j.job?.id; title = street;
        if (!jobId) throw new Error("The job wasn't made.");
      }
      setBusy("Putting it in Takeoffs…");
      const label = (here ?? "").split(",")[0].trim();
      const r = await call(`/api/jobs/${jobId}/aerial`, "POST", { provider: "mapbox", lat: at.lat, lng: at.lng, z: plan.z, w: plan.w, h: plan.h, label });
      const sheet = r.sheet as { id: string; number: string | null };
      const n = Number(/(\d+)$/.exec(sheet.number ?? "")?.[1] ?? 1);
      onDone({ jobId, jobTitle: title, sheetId: sheet.id, c: at, z: plan.z, w: plan.w, h: plan.h, n });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const fpp = feetPerPixel(at.lat, view.zoom);
  const radio = (on: boolean, dashed?: boolean): React.CSSProperties => ({ width: 18, height: 18, borderRadius: 999, flexShrink: 0, border: `2px ${dashed ? "dashed" : "solid"} ${on ? T.hiviz : T.hairStrong}`, boxShadow: on ? `inset 0 0 0 3px ${T.card}` : undefined, background: on ? T.hiviz : T.card });
  return (
    <div {...stop} className="absolute flex flex-col" style={wide
      ? { right: 16, top: 16, bottom: 16, width: 380, zIndex: 12, background: T.card, borderRadius: 6, boxShadow: "0 10px 30px rgba(0,0,0,.3)" }
      : { left: 0, right: 0, bottom: 0, top: 290, zIndex: 12, background: T.card, borderRadius: "12px 12px 0 0", boxShadow: "0 -8px 26px rgba(0,0,0,.25)" }}>
      <div style={{ padding: "14px 16px 8px" }}>
        <div style={{ fontFamily: "var(--sc-font-light, 'Inter', system-ui, sans-serif)", fontWeight: 300, fontSize: 22, color: T.ink }}>Which job?</div>
        <div style={{ fontSize: 12, color: T.ink3 }}>Nearest to this spot first</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a job" aria-label="Find a job"
          style={{ width: "100%", height: 34, marginTop: 8, border: `1px solid ${T.hairStrong}`, borderRadius: 3, padding: "0 10px", background: T.card, color: T.ink, fontSize: F.sm }} />
      </div>
      <div className="flex-1" style={{ overflowY: "auto", minHeight: 0 }}>
        {rows.map((j) => {
          const on = pick === j.id;
          return (
            <button key={j.id} type="button" onClick={() => setPick(j.id)} className="flex items-center gap-3 w-full text-left"
              style={{ minHeight: 52, padding: "6px 16px 6px 13px", borderLeft: `3px solid ${on ? T.hiviz : "transparent"}`, background: on ? T.slab : "transparent", borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
              <span style={radio(on)} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: T.ink, ...clipText }}>{j.title}</span>
                <span style={{ display: "block", fontSize: 11.5, color: T.ink3, ...clipText }}>{[j.customer, j.addr, j.stage].filter(Boolean).join(" · ")}</span>
              </span>
              <span style={{ ...nums, fontSize: 11.5, color: T.ink2 }}>{j.mi != null ? distanceLabel(j.mi) : "no address"}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => setPick("new")} className="flex items-center gap-3 w-full text-left"
          style={{ minHeight: 52, padding: "6px 16px 6px 13px", borderLeft: `3px solid ${pick === "new" ? T.hiviz : "transparent"}`, background: pick === "new" ? T.slab : "transparent", borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
          <span style={radio(pick === "new", true)} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: T.chalk }}>+ New job here</span>
            <span style={{ display: "block", fontSize: 11.5, color: T.ink3, ...clipText }}>{here ? `Starts a job at ${here.split(",")[0]}` : "Finding the address here…"}</span>
          </span>
        </button>
      </div>
      <div style={{ padding: "10px 16px 14px", borderTop: `1px solid ${T.hair}` }}>
        <div className="rounded" style={{ background: T.dustyTint, color: T.dustyText, padding: "8px 10px", fontSize: 12, lineHeight: 1.4, marginBottom: 10 }}>
          A sheet named <b>Aerial</b> goes into the job&apos;s Takeoffs at 1 in ≈ {Math.round(fpp * 96)} ft, with the imagery source and &ldquo;imagery date not known&rdquo; printed in its corner. You confirm the map&apos;s scale with one tap before measuring.
        </div>
        {err && <div style={{ fontSize: 12, color: T.red, marginBottom: 8 }}>{err}</div>}
        <button type="button" disabled={!pick || !!busy} onClick={() => void put()} style={{ ...btn(true), width: "100%", height: 44, fontSize: 14, opacity: !pick || busy ? 0.55 : 1 }}>
          {busy ?? "Put it in Takeoffs"}
        </button>
      </div>
    </div>
  );
}
