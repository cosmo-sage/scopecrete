"use client";

/**
 * The bid request composer (migration 091; Claude Design, Vendors v2 · V2/P2).
 * One composer, two doors: the Vendors page (start from who — the vendors Coy
 * ticked) and a job (start from what — the job filled in, vendors suggested by
 * trade). Since 2026-10-15 (Coy: "needs a revamp completely") the scope is the
 * bid document itself, as the vendor will see it (bid-document.tsx, laid out
 * like the proposal): each section with its takeoffs on the sheet, its SF and
 * SY, thickness, LF or count, the job's totals, ticks for what goes in and who
 * supplies the material. Beside it: which job · who gets it · what else they
 * see · how they price it. For a labor sub (Luis — laborVendor()) every labor
 * line is ticked to start and nothing else (defaultPick()); costs and the
 * days on a line are never shown, here or to the vendor.
 *
 * Send makes one link per vendor (POST /api/bid-requests), then texts each one
 * through Quo (/api/texts — this tap is Coy's, §6) and leaves email to his own
 * mail app, one tap per vendor (§10: ScopeCrete sends no email).
 */

import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { T, F, disp, eyebrow, clip, formatPhone } from "@/lib/v34/tokens";
import { Drawer, OrgNameContext } from "@/components/v34/primitives";
import { InitialsBox } from "@/components/v34/thread-list";
import { call } from "@/components/v34/cost-cards";
import { waitForDelivery } from "@/components/v34/bids/delivery";
import { REQUIREMENTS, bidText, defaultPick, groupOf, laborVendor, pickFromShown, shownScopes, suppliedByDefault, type ComposeScope, type ShownScope } from "@/lib/bids";
import { useWide } from "@/lib/v34/use-wide";
import { BidDocument, type DocScope } from "@/components/v34/bids/bid-document";
import { AreaMap, areaVisuals, mapPicture, type AreaVisual } from "@/components/v34/proposal/area-visuals";
import { sendBytes } from "@/components/v34/files-panel";
import type { PlansData } from "@/components/v34/plan-room/shared";

export interface BidVendor {
  id: string; name: string | null; company_name?: string | null; phone: string | null; email: string | null; subtype?: string | null;
  trades?: string[]; bids?: { sent: number; answered: number; label: string; speed: string | null; median_hours: number | null };
}
interface JobLite { id: string; title: string | null; address: string | null; status: string | null }
interface PacketFile { id: string; name: string; kind: "photo" | "plan" | "aerial"; section?: string | null }
interface ComposeJob { id: string; title: string | null; address: string | null; street: string | null; scopes: ComposeScope[]; files: PacketFile[]; access: string | null }
type Ch = "text" | "email" | "both";
interface Made { id: string; contact_id: string; name: string | null; phone: string | null; email: string | null; channel: Ch; url: string; text: string; email_parts: { subject: string; body: string }; new?: boolean }
/** A request already sent, opened to edit (migration 124): its job, ticks, packet and words. */
export interface EditBid {
  id: string; job_id: string; price_mode: string; price_by: string | null; pour_date: string | null; note: string | null; scopes: ShownScope[];
  packet: { address?: string | null; dates?: boolean; quantities?: boolean; files?: Array<{ id: string; kind: string; name?: string }>; requirements?: string[] } | null;
  recipients: Array<{ contact_id: string; name: string; answered_at: string | null; revoked_at: string | null }>;
}

const vname = (v: Pick<BidVendor, "name" | "company_name" | "phone">) => v.name?.trim() || v.company_name || formatPhone(v.phone) || "Vendor";
const MODES: Array<[string, string, string]> = [
  ["lump", "Lump sum", "Each sub sends one number for the scopes ticked."],
  ["per_item", "Per item", "Each sub prices every line: per SF, per LF, per EA."],
  ["their_rates", "Their rates", "Their prices from their last answers are filled in; they change them or just send."],
];
const defaultCh = (v: BidVendor): Ch => (v.phone ? (v.email ? "both" : "text") : "email");

function Check({ on, onClick, label, size = 18 }: { on: boolean; onClick: () => void; label: string; size?: number }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} role="checkbox" aria-checked={on} aria-label={label} className="shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, borderRadius: 3, border: `1.5px solid ${on ? T.green : T.hairStrong}`, background: on ? T.green : "transparent", color: "#fff", fontSize: 12, lineHeight: 1, cursor: "pointer" }}>
      {on ? "✓" : ""}
    </button>
  );
}

const stepHead = (n: number, t: string, sub?: string) => (
  <div className="flex items-baseline gap-2 mb-2">
    <span className="flex items-center justify-center" style={{ width: 20, height: 20, borderRadius: 10, background: T.ink, color: T.card, fontSize: 11, fontWeight: 700 }}>{n}</span>
    <span style={{ fontFamily: disp, fontWeight: 700, fontSize: F.md, textTransform: "uppercase", letterSpacing: ".06em" }}>{t}</span>
    {sub && <span style={{ fontSize: F.xs, color: T.ink3 }}>{sub}</span>}
  </div>
);
export const chip = (on: boolean, dis?: boolean): React.CSSProperties => ({
  height: 28, padding: "0 10px", borderRadius: 3, border: `1px solid ${on ? T.ink : T.hairStrong}`, background: on ? T.ink : T.card, color: on ? T.card : T.ink2,
  fontSize: F.xs, fontWeight: 600, cursor: dis ? "not-allowed" : "pointer", opacity: dis ? 0.4 : 1, whiteSpace: "nowrap",
});
const field: React.CSSProperties = { height: 32, border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontSize: F.sm, borderRadius: 3, padding: "0 8px" };

export function BidComposer({ open, onClose, vendors: start, jobId: startJob, from, onDone, edit }: {
  open: boolean; onClose: () => void;
  /** Vendors already picked (the Vendors page's selection). */
  vendors?: BidVendor[];
  /** A job already picked (the job page's Get bids). */
  jobId?: string | null;
  /** "Started from Vendors · 3 flatwork subs" */
  from?: string;
  onDone?: (msg: string) => void;
  /** A request already sent — the composer opens on it, and Save changes it in place, every link kept. */
  edit?: EditBid;
}) {
  const org = useContext(OrgNameContext);
  const [jobs, setJobs] = useState<JobLite[] | null>(null);
  const [jobQ, setJobQ] = useState("");
  const [jobId, setJobId] = useState<string | null>(edit?.job_id ?? startJob ?? null);
  const [job, setJob] = useState<ComposeJob | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Coy's ticks over the starting pick (defaultPick), so the pick follows the vendors until he changes it.
  const [scopeTicks, setScopeTicks] = useState<Record<string, boolean>>({});
  const [lineTicks, setLineTicks] = useState<Record<string, boolean>>({});
  const [laborPick, setLaborPick] = useState<boolean | null>(null);
  const [visuals, setVisuals] = useState<Record<string, AreaVisual>>({});
  const [wideRef, wide] = useWide<HTMLDivElement>(1060);
  const [supplied, setSupplied] = useState<Record<string, boolean>>({});
  const [pk, setPk] = useState(() => {
    const p = edit?.packet;
    if (!p) return { address: true, dates: true, quantities: true, photos: true, aerial: true };
    const kinds = new Set((p.files ?? []).map((f) => f.kind));
    return { address: p.address != null, dates: p.dates !== false, quantities: p.quantities !== false, photos: kinds.has("photo"), aerial: kinds.has("aerial") };
  });
  const [plans, setPlans] = useState<Record<string, boolean>>({});
  // Each photo on its own (Coy, 2026-10-23: texted screenshots that had nothing to do with the job
  // went out with "Site photos" and there was no way to take them off): false leaves one out.
  const [photoPick, setPhotoPick] = useState<Record<string, boolean>>({});
  const [photosOpen, setPhotosOpen] = useState(false);
  // Photos from elsewhere (Coy, 2026-10-23: "pull from the job or organization files or uploading my
  // own photos"): any photo in the company's Files, or one uploaded here (filed on the job).
  const [extra, setExtra] = useState<PacketFile[]>([]);
  const [orgOpen, setOrgOpen] = useState(false);
  const [orgQ, setOrgQ] = useState("");
  const [orgList, setOrgList] = useState<Array<{ id: string; name: string; url: string | null; job_id: string | null }> | null>(null);
  const [upMsg, setUpMsg] = useState<string | null>(null);
  const upRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState(edit?.price_mode ?? "lump");
  const [priceBy, setPriceBy] = useState(edit?.price_by ?? "");
  const [pour, setPour] = useState(edit?.pour_date ?? "");
  const [note, setNote] = useState(edit?.note ?? "");
  const [reqs, setReqs] = useState<string[]>(edit?.packet?.requirements ?? []);
  // Editing: the vendors already on it keep their link; tell them it changed (a text each, this tap).
  const already = useMemo(() => (edit?.recipients ?? []).filter((r) => !r.revoked_at), [edit]);
  const [tellOld, setTellOld] = useState(true);
  // The request as opened — read once when its job loads (the parent passes a new object each render).
  const editRef = useRef(edit);
  const [reqOwn, setReqOwn] = useState("");
  const [follow, setFollow] = useState(true);
  const [pool, setPool] = useState<BidVendor[]>(start ?? []);
  const [who, setWho] = useState<Record<string, Ch>>(() => Object.fromEntries((start ?? []).map((v) => [v.id, defaultCh(v)])));
  const [adding, setAdding] = useState(false);
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<Made[] | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let off = false;
    call("/api/bid-requests/compose", "GET").then((b) => { if (!off) setJobs(b.jobs as JobLite[]); }).catch((e) => { if (!off) setErr(String(e?.message ?? e)); });
    // Every vendor, for + Add vendor and the suggestions.
    call("/api/vendors", "GET").then((b) => { if (!off) setPool(b.vendors as BidVendor[]); }).catch(() => {});
    return () => { off = true; };
  }, [open]);

  useEffect(() => {
    if (!open || !jobId) return;
    let off = false;
    call(`/api/bid-requests/compose?job=${jobId}`, "GET").then((b) => {
      if (off) return;
      const j = b.job as ComposeJob;
      setJob(j); setErr(null);
      // Every scope with lines ticked; materials supplied by default (suppliedByDefault); every plan in.
      setScopeTicks({}); setLineTicks({}); setSupplied({}); setVisuals({});
      setPlans(Object.fromEntries(j.files.filter((f) => f.kind === "plan").map((f) => [f.id, true])));
      setPhotoPick({}); setExtra([]); setOrgOpen(false);
      const edit = editRef.current;
      if (edit && edit.job_id === j.id) {
        // Open on what was sent: its sections, lines, who supplies and its plans.
        const was = pickFromShown(j.scopes, edit.scopes ?? []);
        setScopeTicks(was.scopes); setLineTicks(was.lines); setSupplied(was.supplied); setLaborPick(false);
        const sent = new Set((edit.packet?.files ?? []).map((f) => f.id));
        setPlans(Object.fromEntries(j.files.filter((f) => f.kind === "plan").map((f) => [f.id, sent.has(f.id)])));
        // A photo that wasn't sent stays out (one taken off before, or added to the job since).
        if ((edit.packet?.files ?? []).some((f) => f.kind === "photo")) setPhotoPick(Object.fromEntries(j.files.filter((f) => f.kind === "photo").map((f) => [f.id, sent.has(f.id)])));
        // Photos it sent from the company's Files (not on the job) come back as extras.
        const onJob = new Set(j.files.map((f) => f.id));
        setExtra((edit.packet?.files ?? []).filter((f) => f.kind === "photo" && !onJob.has(f.id)).map((f) => ({ id: f.id, name: f.name ?? "Photo", kind: "photo" as const, section: null })));
      }
      // Each section's takeoffs on its sheet, drawn like the proposal's.
      call(`/api/jobs/${j.id}/plans`, "GET").then((d: PlansData) => { if (!off) setVisuals(areaVisuals(d, j.scopes.map((s) => s.key))); }).catch(() => {});
    }).catch((e) => { if (!off) setErr(String(e?.message ?? e)); });
    return () => { off = true; };
  }, [open, jobId]);

  const picked = useMemo(() => pool.filter((v) => who[v.id]), [pool, who]);
  // Labor subs only (Luis): every labor line to start, the materials left out.
  const laborAuto = picked.length > 0 && picked.every(laborVendor);
  const laborOnly = laborPick ?? laborAuto;
  const startPick = useMemo(() => (job ? defaultPick(job.scopes, laborOnly) : { scopes: {}, lines: {} }), [job, laborOnly]);
  const scopes = useMemo(() => ({ ...startPick.scopes, ...scopeTicks }), [startPick, scopeTicks]);
  const lines = useMemo(() => ({ ...startPick.lines, ...lineTicks }), [startPick, lineTicks]);
  const shown = useMemo(() => (job ? shownScopes(job.scopes, { scopes, lines, supplied, quantities: pk.quantities }) : []), [job, scopes, lines, supplied, pk.quantities]);
  const docScopes = useMemo<DocScope[]>(() => (job?.scopes ?? []).map((s) => {
    const v = visuals[s.key];
    return {
      key: s.key, title: s.title, size: pk.quantities ? s.size : null, measure: pk.quantities ? s.measure ?? null : null, on: !!scopes[s.key],
      lines: s.lines.map((l) => ({ key: l.id, name: l.name, qty: pk.quantities ? l.qty : null, unit: l.unit, supplied: supplied[l.id] ?? suppliedByDefault(l), on: lines[l.id] !== false, group: groupOf(l.cost_type) })),
      map: v?.map ? <AreaMap map={v.map} height={150} /> : undefined,
    };
  }), [job, scopes, lines, supplied, pk.quantities, visuals]);
  const files = useMemo(() => {
    const own = (job?.files ?? []).filter((f) => (f.kind === "photo" ? pk.photos && photoPick[f.id] !== false : f.kind === "aerial" ? pk.aerial : plans[f.id]));
    const ids = new Set(own.map((f) => f.id));
    return [...own, ...extra.filter((f) => !ids.has(f.id))];
  }, [job, pk, plans, photoPick, extra]);
  // The company's photos, searched by any word or name (the Files page's own search).
  useEffect(() => {
    if (!orgOpen) return;
    let off = false;
    const t = setTimeout(() => {
      call(`/api/files/search?kind=image${orgQ.trim() ? `&q=${encodeURIComponent(orgQ.trim())}` : ""}`, "GET")
        .then((b) => { if (!off) setOrgList(((b.files ?? []) as Array<{ id: string; name: string; url: string | null; job_id: string | null }>).slice(0, 60)); })
        .catch(() => { if (!off) setOrgList([]); });
    }, 250);
    return () => { off = true; clearTimeout(t); };
  }, [orgOpen, orgQ]);
  const addPhoto = (f: { id: string; name: string }) => {
    if ((job?.files ?? []).some((x) => x.id === f.id)) { setPk({ ...pk, photos: true }); setPhotoPick({ ...photoPick, [f.id]: true }); return; }
    if (!extra.some((x) => x.id === f.id)) setExtra([...extra, { id: f.id, name: f.name, kind: "photo", section: null }]);
  };
  const upload = async (list: FileList | null) => {
    const picked = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (!job || !picked.length) return;
    const added: PacketFile[] = [];
    for (const [i, file] of picked.entries()) {
      setUpMsg(`Uploading ${i + 1} of ${picked.length}…`);
      try {
        const made = await call("/api/files", "POST", { name: file.name, mime: file.type, size: file.size, job_id: job.id, category: "photo" });
        await sendBytes(made.upload.signed_url, file, () => {});
        const done = await call(`/api/files/${made.file.id}/done`, "POST");
        added.push({ id: done.file.id as string, name: done.file.name as string, kind: "photo", section: null });
      } catch (e) {
        setUpMsg(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
        setExtra((x) => [...x, ...added]);
        return;
      }
    }
    setExtra((x) => [...x, ...added]); setUpMsg(null);
  };
  const photoFiles = (job?.files ?? []).filter((f) => f.kind === "photo");
  const photosOn = photoFiles.filter((f) => photoPick[f.id] !== false).length;
  const photosN = photoFiles.length, aerialN = (job?.files ?? []).filter((f) => f.kind === "aerial").length;
  const texts = picked.filter((v) => who[v.id] !== "email" && v.phone).length;
  const emails = picked.filter((v) => who[v.id] !== "text" && v.email).length;
  // Suggestions from the job door: subs first, best responders first.
  const suggest = useMemo(() => pool.filter((v) => !who[v.id] && !already.some((r) => r.contact_id === v.id) && (!find.trim() || [v.name, v.company_name, ...(v.trades ?? [])].some((x) => (x ?? "").toLowerCase().includes(find.trim().toLowerCase()))))
    .sort((a, b) => Number(b.subtype === "subcontractor") - Number(a.subtype === "subcontractor") || (b.bids?.answered ?? 0) - (a.bids?.answered ?? 0) || vname(a).localeCompare(vname(b)))
    .slice(0, 8), [pool, who, find, already]);
  const tradeHint = useMemo(() => {
    const t = new Set(picked.flatMap((v) => v.trades ?? []));
    return t.size ? [...t].slice(0, 3).join(", ") : null;
  }, [picked]);

  const preview = picked[0] ? bidText({ name: vname(picked[0]), org, job: job?.title ?? null, scopes: shown.map((s) => s.title),
    size: shown.length === 1 ? shown[0].size : null, street: pk.address ? job?.street ?? null : null, pour: pk.dates ? pour || null : null,
    priceBy: pk.dates ? priceBy || null : null, url: "scopecrete.ai/b/…" }) : null;

  // Checks at 4, 10, 20 and 40 s whether Quo's webhook brought the text back
  // delivered (GET /api/texts?quo_id=). None → the number is likely wrong.
  const confirmDelivery = async (rid: string, quoId: string, to: string) => {
    const ok = await waitForDelivery(quoId);
    setStatus((s) => ({ ...s, [rid]: ok ? `Delivered to ${to} ✓` : `Quo took it but hasn't delivered it to ${to} — check the number on their page` }));
  };

  const send = async () => {
    if (!jobId) return;
    setBusy(true); setErr(null);
    try {
      const b = await call(edit ? `/api/bid-requests/${edit.id}` : "/api/bid-requests", edit ? "PATCH" : "POST", {
        job_id: jobId, pick: { scopes, lines, supplied }, maps: shown.filter((x) => visuals[x.key]?.map).map((x) => x.key), price_mode: mode, price_by: priceBy || null, pour_date: pour || null, note: note.trim() || null,
        follow_up: follow, packet: { files: files.map((f) => f.id), quantities: pk.quantities, address: pk.address, dates: pk.dates, requirements: reqs },
        recipients: picked.map((v) => ({ contact_id: v.id, channel: who[v.id] })),
      });
      const rows = b.recipients as Made[];
      // The takeoff maps go up before any text, so the link has them when it opens.
      const ups = (b.uploads ?? []) as Array<{ key: string; signed_url: string }>;
      for (const u of ups) {
        const map = visuals[u.key]?.map;
        if (!map) continue;
        try { await sendBytes(u.signed_url, new File([await mapPicture(map)], "map.jpg", { type: "image/jpeg" }), () => {}); } catch { /* the section shows without its map */ }
      }
      setMade(rows);
      // Texts go now, one by one, through Quo — this tap is Coy's.
      const st: Record<string, string> = {};
      let sentN = 0;
      for (const r of rows) {
        if (r.channel === "email") continue;
        if (r.new === false && !tellOld) { st[r.id] = "Not told — same link, it shows the changes"; continue; }
        if (!r.phone) { st[r.id] = "No phone — email it"; continue; }
        st[r.id] = "Texting…"; setStatus({ ...st });
        try {
          const t = await call("/api/texts", "POST", { contact_id: r.contact_id, body: r.text });
          await call(`/api/bid-requests/recipients/${r.id}`, "PATCH", { sent: "text" }).catch(() => null);
          // Quo taking the text isn't it arriving: say the number it went to, then wait
          // for Quo's delivery to come back before saying it was delivered.
          const to = formatPhone((t.to as string | null) ?? r.phone);
          st[r.id] = `Sent to ${to} · waiting for Quo to deliver…`; sentN += 1;
          if (typeof t.quo_id === "string") void confirmDelivery(r.id, t.quo_id, to);
        } catch (e) { st[r.id] = `Text failed: ${e instanceof Error ? e.message : String(e)}`; }
        setStatus({ ...st });
      }
      const n = sentN;
      if (edit) { onDone?.(`Bid request updated · every link shows the changes${n ? ` · ${n} text${n === 1 ? "" : "s"} sent` : ""}.`); return; }
      onDone?.(`Bid request saved for ${rows.length} vendor${rows.length === 1 ? "" : "s"}${n ? ` · ${n} text${n === 1 ? "" : "s"} sent` : ""}. Answers land on their page and the job's Summary.`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const mail = (r: Made) => {
    window.location.assign(`mailto:${encodeURIComponent(r.email ?? "")}?subject=${encodeURIComponent(r.email_parts.subject)}&body=${encodeURIComponent(r.email_parts.body)}`);
    void call(`/api/bid-requests/recipients/${r.id}`, "PATCH", { sent: "email" }).then(() => setStatus((s) => ({ ...s, [`${r.id}:e`]: "Email opened ✓" }))).catch(() => {});
  };

  if (!open) return null;
  const ready = !!jobId && shown.length > 0 && (picked.length > 0 || !!edit) && picked.every((v) => (who[v.id] === "text" ? !!v.phone : who[v.id] === "email" ? !!v.email : !!v.phone || !!v.email));
  const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.hair}`, borderRadius: 4, padding: 12 };

  return (
    <Drawer open={open} onClose={onClose} title={edit ? "Edit bid request" : "Bid request"} sub={made ? (edit ? "Updated · same links" : "Sent · one link per vendor") : edit ? "Every vendor keeps their link — it shows the new version" : from ?? "Draft"} drop>
      {made ? (
        <div className="p-4 flex flex-col gap-2" style={{ maxWidth: 760 }}>
          <div style={{ fontSize: F.sm, color: T.ink2 }}>{edit ? "Saved. Every vendor's link now shows the new version. " : ""}Each vendor has their own link. Their answer lands in their thread (as a note), on their page and on the job&apos;s Summary.</div>
          {made.map((r) => (
            <div key={r.id} className="flex items-center gap-2 flex-wrap" style={{ ...card, padding: "8px 10px" }}>
              <InitialsBox name={r.name} size={28} />
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 600, fontSize: F.sm }}>{r.name ?? "Vendor"}</div>
                <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{status[r.id] ?? (r.channel === "email" ? "Email it below" : "")}{status[`${r.id}:e`] ? ` · ${status[`${r.id}:e`]}` : ""}</div>
              </div>
              {r.channel !== "text" && r.email && <button onClick={() => mail(r)} style={chip(false)}>Email ↗</button>}
              <button onClick={() => void navigator.clipboard?.writeText(r.url).then(() => setStatus((s) => ({ ...s, [`${r.id}:e`]: "Link copied" })))} style={chip(false)}>Copy link</button>
              <a href={r.url} target="_blank" rel="noreferrer" style={{ ...chip(false), display: "inline-flex", alignItems: "center", textDecoration: "none" }}>See their page</a>
            </div>
          ))}
          <div className="flex justify-end mt-2"><button onClick={onClose} style={{ ...chip(true), height: 36, padding: "0 16px" }}>Done</button></div>
        </div>
      ) : (
        <div className="p-3 lg:p-4 flex flex-col gap-3" style={{ background: T.slab, minHeight: "100%" }}>
          {err && <div className="rounded px-3 py-2" style={{ fontSize: F.sm, color: T.red, background: T.redDim }}>{err}</div>}

          <div ref={wideRef} className={wide ? "grid gap-3 items-start" : "flex flex-col gap-3"} style={wide ? { gridTemplateColumns: "minmax(320px, 400px) minmax(0, 1fr)" } : undefined}>
          <div className="flex flex-col gap-3" style={{ minWidth: 0 }}>
          {/* 1 · job */}
          <section style={card}>
            {stepHead(1, "Which job")}
            {edit ? <div style={{ fontSize: F.sm }}><b>{job?.title ?? "…"}</b><span style={{ color: T.ink3 }}> · the job stays the same when editing</span></div>
            : jobs === null ? <div style={{ fontSize: F.sm, color: T.ink3 }}>Loading…</div> : jobs.length === 0 ? <div style={{ fontSize: F.sm, color: T.ink3 }}>No open jobs.</div> : (() => {
              // Find a job by its name or address (Coy, 2026-10-10).
              const all = jobId && !jobs.some((j) => j.id === jobId) && job ? [{ id: job.id, title: job.title, address: job.address, status: null }, ...jobs] : jobs;
              const words = jobQ.toLowerCase().split(/\s+/).filter(Boolean);
              const hit = words.length ? all.filter((j) => { const h = `${j.title ?? ""} ${j.address ?? ""}`.toLowerCase(); return words.every((w) => h.includes(w)); }) : all;
              return (
                <>
                  <input value={jobQ} onChange={(e) => setJobQ(e.target.value)} placeholder="Search jobs by name or address" aria-label="Search jobs"
                    className="w-full rounded mb-2" style={{ height: 34, padding: "0 10px", border: `1px solid ${T.hairStrong}`, background: T.card, color: T.ink, fontSize: 14 }} />
                  {hit.length === 0 ? <div style={{ fontSize: F.sm, color: T.ink3 }}>No job matches “{jobQ}”.</div> : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {hit.slice(0, 24).map((j) => (
                        <button key={j.id} onClick={() => setJobId(j.id)} className="text-left rounded shrink-0 px-3 py-2"
                          style={{ width: 200, border: `1.5px solid ${j.id === jobId ? T.hiviz : T.hair}`, background: j.id === jobId ? T.card : "transparent", cursor: "pointer" }}>
                          <div style={{ fontWeight: 600, fontSize: F.sm, ...clip }}>{j.title ?? "Untitled job"}</div>
                          <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{j.address ?? "no address"}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </section>

          {/* 2 · who */}
          <section style={card}>
            <div className="flex items-center">
              <div style={{ flex: 1 }}>{stepHead(2, "Who gets it", tradeHint ?? undefined)}</div>
              <button onClick={() => setAdding(!adding)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>{adding ? "Done adding" : "+ Add vendor"}</button>
            </div>
            {already.length > 0 && (
              <div className="mb-2">
                {already.map((r) => (
                  <div key={r.contact_id} className="flex items-center gap-2 py-1.5" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                    <InitialsBox name={r.name} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: F.sm, ...clip }}>{r.name}</div>
                      <div style={{ fontSize: F.xs, color: T.ink3 }}>Has the link{r.answered_at ? " · answered — they'll be asked to check their price" : ""}</div>
                    </div>
                  </div>
                ))}
                <label className="flex items-center gap-1.5 mt-1" style={{ fontSize: F.sm }}>
                  <Check on={tellOld} onClick={() => setTellOld(!tellOld)} label="Text them that it changed" />
                  <span>Text {already.length === 1 ? "them" : `these ${already.length}`} that it changed (same link)</span>
                </label>
              </div>
            )}
            {picked.length === 0 && !adding && !edit && <div style={{ fontSize: F.sm, color: T.ink3, marginBottom: 6 }}>Nobody yet — pick from the vendors below.</div>}
            {picked.map((v) => {
              const cur = who[v.id];
              return (
                <div key={v.id} className="flex items-center gap-2 py-1.5 flex-wrap" style={{ borderTop: `1px solid ${T.hairSoft}` }}>
                  <InitialsBox name={vname(v)} size={26} />
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <div style={{ fontWeight: 600, fontSize: F.sm, ...clip }}>{vname(v)}</div>
                    <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{[v.phone ? formatPhone(v.phone) : "no phone", v.email ?? "no email on file"].join(" · ")}</div>
                  </div>
                  {(["text", "email", "both"] as Ch[]).map((k) => {
                    const dis = (k !== "email" && !v.phone) || (k !== "text" && !v.email);
                    return <button key={k} disabled={dis} onClick={() => setWho({ ...who, [v.id]: k })} style={chip(cur === k, dis)}>{k === "text" ? "Text" : k === "email" ? "Email" : "Both"}</button>;
                  })}
                  <button onClick={() => { const n = { ...who }; delete n[v.id]; setWho(n); }} aria-label={`Take off ${vname(v)}`} style={{ color: T.ink3, fontSize: 18, width: 24 }}>×</button>
                </div>
              );
            })}
            {(adding || (picked.length === 0 && !edit)) && (
              <div className="mt-2">
                <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a vendor or trade" aria-label="Find a vendor" style={{ ...field, width: "100%" }} />
                <div className="flex flex-col mt-1">
                  {suggest.map((v) => (
                    <button key={v.id} onClick={() => setWho({ ...who, [v.id]: defaultCh(v) })} className="flex items-center gap-2 py-1.5 text-left" style={{ borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
                      <InitialsBox name={vname(v)} size={24} />
                      <span style={{ fontSize: F.sm, fontWeight: 600, ...clip }}>{vname(v)}</span>
                      <span style={{ fontSize: F.xs, color: T.ink3, flex: 1, minWidth: 0, ...clip }}>{[...(v.trades ?? []), v.bids?.sent ? v.bids.label : null, v.bids?.speed].filter(Boolean).join(" · ")}</span>
                      <span style={{ fontSize: F.xs, color: T.chalk }}>+ Add</span>
                    </button>
                  ))}
                  {!suggest.length && <div style={{ fontSize: F.xs, color: T.ink3, padding: "6px 0" }}>No other vendors match. Add one on the Vendors page.</div>}
                </div>
              </div>
            )}
            {preview && (
              <div className="mt-3 rounded p-2.5" style={{ background: T.sunk, fontSize: F.sm, lineHeight: 1.45 }}>
                <div style={{ ...eyebrow, marginBottom: 4 }}>Text · each vendor gets their own link</div>
                {preview}
                <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 4 }}>Email carries the same words and link, from your own mail app.</div>
              </div>
            )}
          </section>

          {/* 3 · packet */}
          <section style={card}>
            {stepHead(3, "What else they see", "from the job, your files or new photos")}
            <div className="flex flex-wrap gap-1.5">
              {([["address", "Address & access", job?.address ?? "no address"], ["dates", "Pour date & price-by", null], ["quantities", "Quantities", null]] as const).map(([k, l, d]) => (
                <button key={k} onClick={() => setPk({ ...pk, [k]: !pk[k] })} style={chip(pk[k])} title={d ?? undefined}>{pk[k] ? "✓ " : ""}{l}</button>
              ))}
              {aerialN > 0 && <button onClick={() => setPk({ ...pk, aerial: !pk.aerial })} style={chip(pk.aerial)}>{pk.aerial ? "✓ " : ""}Aerial{aerialN > 1 ? ` · ${aerialN}` : ""}</button>}
              {photosN > 0 && <button onClick={() => setPk({ ...pk, photos: !pk.photos })} style={chip(pk.photos)}>{pk.photos ? "✓ " : ""}Site photos · {pk.photos && photosOn < photosN ? `${photosOn} of ${photosN}` : photosN}</button>}
              {photosN > 0 && pk.photos && <button onClick={() => setPhotosOpen(!photosOpen)} style={{ ...chip(false), borderStyle: "dashed" }}>{photosOpen ? "Done picking ▴" : "Pick photos ▾"}</button>}
              {(job?.files ?? []).filter((f) => f.kind === "plan").map((f) => (
                <button key={f.id} onClick={() => setPlans({ ...plans, [f.id]: !plans[f.id] })} style={{ ...chip(!!plans[f.id]), maxWidth: 240, ...clip }}>{plans[f.id] ? "✓ " : ""}{f.name}</button>
              ))}
            </div>
            {photosOpen && pk.photos && photosN > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: F.xs, color: T.ink3, marginBottom: 4 }}>Tap a photo to leave it out of this bid request. It stays on the job.</div>
                <div className="flex flex-wrap gap-1.5">
                  {photoFiles.map((f) => {
                    const on = photoPick[f.id] !== false;
                    return <button key={f.id} onClick={() => setPhotoPick({ ...photoPick, [f.id]: !on })} style={{ ...chip(on), maxWidth: 260, ...clip, textDecoration: on ? undefined : "line-through" }} title={f.name}>{on ? "✓ " : ""}{f.name}</button>;
                  })}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8, alignItems: "center" }}>
              <span style={{ fontSize: F.xs, color: T.ink3 }}>More photos:</span>
              <button onClick={() => setOrgOpen(!orgOpen)} style={{ ...chip(false), borderStyle: "dashed" }}>{orgOpen ? "Done ▴" : "From your files ▾"}</button>
              <button onClick={() => upRef.current?.click()} disabled={!job} style={{ ...chip(false), borderStyle: "dashed" }}>↑ Upload photos</button>
              <input ref={upRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
              {extra.map((f) => (
                <span key={f.id} style={{ ...chip(true), maxWidth: 260, ...clip, display: "inline-flex", alignItems: "center", gap: 4 }} title={f.name}>
                  ✓ {f.name}
                  <button aria-label={`Take ${f.name} off`} onClick={() => setExtra(extra.filter((x) => x.id !== f.id))} style={{ border: 0, background: "none", cursor: "pointer", color: "inherit", padding: 0 }}>×</button>
                </span>
              ))}
            </div>
            {upMsg && <div style={{ fontSize: F.xs, color: upMsg.includes(":") ? T.red : T.ink3, marginTop: 4 }}>{upMsg}</div>}
            {orgOpen && (
              <div style={{ marginTop: 8 }}>
                <input value={orgQ} onChange={(e) => setOrgQ(e.target.value)} placeholder="Search your photos — a word, a job, a customer"
                  style={{ width: "100%", fontSize: 16, padding: "6px 10px", border: `1px solid ${T.hair}`, borderRadius: 8, background: T.card, color: T.ink }} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 6, marginTop: 6, maxHeight: 320, overflowY: "auto" }}>
                  {orgList === null && <div style={{ fontSize: F.xs, color: T.ink3 }}>Loading…</div>}
                  {orgList?.length === 0 && <div style={{ fontSize: F.xs, color: T.ink3 }}>No photos found.</div>}
                  {orgList?.map((f) => {
                    const on = extra.some((x) => x.id === f.id) || (pk.photos && (job?.files ?? []).some((x) => x.id === f.id) && photoPick[f.id] !== false);
                    return (
                      <button key={f.id} onClick={() => (on ? setExtra(extra.filter((x) => x.id !== f.id)) : addPhoto(f))} title={f.name}
                        style={{ padding: 0, border: `2px solid ${on ? T.hiviz : T.hair}`, borderRadius: 8, overflow: "hidden", background: T.sunk, cursor: "pointer", textAlign: "left" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                        {f.url ? <img src={f.url} alt="" style={{ width: "100%", height: 72, objectFit: "cover", display: "block" }} /> : <div style={{ height: 72 }} />}
                        <div style={{ fontSize: 10, padding: "2px 4px", color: T.ink2, ...clip }}>{on ? "✓ " : ""}{f.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* 4 · pricing */}
          <section style={card}>
            {stepHead(4, "How they price it")}
            <div className="flex flex-wrap gap-1.5 items-center">
              {MODES.map(([k, l]) => <button key={k} onClick={() => setMode(k)} style={chip(mode === k)}>{l}</button>)}
              <span style={{ fontSize: F.xs, color: T.ink3 }}>{MODES.find((m) => m[0] === mode)?.[2]}</span>
            </div>
            <div className="flex flex-wrap gap-3 items-end mt-2">
              <label><span style={eyebrow}>Price by</span><br /><input type="date" value={priceBy} onChange={(e) => setPriceBy(e.target.value)} style={field} /></label>
              <label><span style={eyebrow}>Pour</span><br /><input type="date" value={pour} onChange={(e) => setPour(e.target.value)} style={field} /></label>
              <label className="flex items-center gap-1.5" style={{ fontSize: F.sm, height: 32 }}>
                <Check on={follow} onClick={() => setFollow(!follow)} label="Remind me to follow up" />
                <span>Remind me {priceBy ? "on the price-by date" : "in 3 days"} if they haven&apos;t answered</span>
              </label>
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="A note for them (optional)" aria-label="Note for the vendors"
              style={{ ...field, height: "auto", width: "100%", padding: 8, marginTop: 8 }} />
            {/* What they send with the bid — ticked onto the page as "With your bid, send". */}
            <div style={{ ...eyebrow, marginTop: 10, marginBottom: 4 }}>With their bid</div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {[...REQUIREMENTS, ...reqs.filter((r) => !(REQUIREMENTS as readonly string[]).includes(r))].map((r) => {
                const on = reqs.includes(r);
                return <button key={r} onClick={() => setReqs(on ? reqs.filter((x) => x !== r) : [...reqs, r].slice(0, 8))} style={chip(on)}>{on ? "✓ " : ""}{r}</button>;
              })}
              <input value={reqOwn} onChange={(e) => setReqOwn(e.target.value)} placeholder="+ Your own" aria-label="Add something they send with the bid" maxLength={80}
                onKeyDown={(e) => { const t = reqOwn.trim(); if (e.key === "Enter" && t) { e.preventDefault(); if (!reqs.some((x) => x.toLowerCase() === t.toLowerCase())) setReqs([...reqs, t].slice(0, 8)); setReqOwn(""); } }}
                style={{ ...field, height: 28, width: 140 }} />
            </div>
          </section>

          </div>

          {/* The bid as they'll see it — tick what goes in, right on the page. */}
          <div style={{ minWidth: 0, ...(wide ? { position: "sticky", top: 8 } : {}) }}>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span style={{ ...eyebrow }}>What they see</span>
              <span style={{ fontSize: F.xs, color: T.ink3, flex: 1, minWidth: 160 }}>Tick sections and lines · your costs and the days on a line never show</span>
              {job && (
                <button onClick={() => { setLaborPick(!laborOnly); setLineTicks({}); setScopeTicks({}); }} style={chip(laborOnly)} title={laborAuto ? "Picked for a labor sub" : undefined}>
                  {laborOnly ? "✓ " : ""}Labor items only
                </button>
              )}
            </div>
            {laborOnly && laborAuto && laborPick === null && (
              <div style={{ fontSize: F.xs, color: T.ink2, marginBottom: 6 }}>
                {picked.length === 1 ? vname(picked[0]) : "They"} price{picked.length === 1 ? "s" : ""} labor, so every labor line is ticked and the materials are left out.
              </div>
            )}
            {!jobId ? <div style={{ ...card, fontSize: F.sm, color: T.ink3 }}>Pick the job first.</div>
              : !job ? <div style={{ ...card, fontSize: F.sm, color: T.ink3 }}>Loading…</div>
              : job.scopes.length === 0 ? <div style={{ ...card, fontSize: F.sm, color: T.ink3 }}>This job has no sections yet. Add them on the job first.</div>
              : (
                <div style={{ background: "var(--sc-doc-ground, #E9E4DA)", borderRadius: 4, padding: wide ? 14 : 6 }}>
                  <BidDocument narrow={!wide} edits={{
                    scope: (k, on) => setScopeTicks((t) => ({ ...t, [k]: on })),
                    line: (k, on) => setLineTicks((t) => ({ ...t, [k]: on })),
                    supplied: (k, on) => setSupplied((t) => ({ ...t, [k]: on })),
                    group: (keys, on) => setLineTicks((t) => ({ ...t, ...Object.fromEntries(keys.map((k) => [k, on])) })),
                  }} vm={{
                    org, jobTitle: job.title, forName: picked.length === 1 ? vname(picked[0]).split(/\s+/)[0] : null,
                    address: pk.address ? job.address : null, priceBy: pk.dates ? priceBy || null : null, pourDate: pk.dates ? pour || null : null,
                    note: note.trim() || null, scopes: docScopes, requirements: reqs,
                  }} />
                </div>
              )}
          </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap sticky bottom-0 py-2" style={{ background: T.slab }}>
            <span style={{ fontSize: F.sm, color: T.ink2, flex: 1, minWidth: 180 }}>
              {texts} text{texts === 1 ? "" : "s"} · {emails} email{emails === 1 ? "" : "s"} · {shown.length} scope{shown.length === 1 ? "" : "s"} · {files.length} file{files.length === 1 ? "" : "s"}
            </span>
            <button onClick={() => void send()} disabled={!ready || busy}
              style={{ height: 40, padding: "0 18px", borderRadius: 4, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.md, textTransform: "uppercase", letterSpacing: ".06em",
                cursor: ready && !busy ? "pointer" : "not-allowed", opacity: ready && !busy ? 1 : 0.5 }}>
              {busy ? (edit ? "Saving…" : "Sending…") : edit ? `Save changes${picked.length ? ` · send ${picked.length} new` : ""}` : `Send ${picked.length} bid request${picked.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

