"use client";

/**
 * A receipt, invoice or quote → the vendor and their prices (migration 051).
 * Coy, 2026-09-29: "upload images of actual receipts from vendors … my
 * invoice from my concrete supplier, Angelle Materials … the AI can extract
 * the vendor information and the pricing … per cubic yard with the taxes."
 *
 *   1. A photo (camera) or a file (PDF, JPEG, PNG). With no vendor chosen it
 *      is saved unfiled; Dusty reads it in the background (read-files): the
 *      priced lines, who issued it, and the tax as printed.
 *   2. Who it's from: Dusty's vendor block matched to Coy's vendors (phone,
 *      email, name — src/lib/vendor-match.ts). No match → "New vendor" with
 *      the details as printed and ONE tap to create; nothing is made without
 *      it. Then the file is filed on that vendor.
 *   3. The prices: repeated ticket lines folded to one row per item. Each row
 *      is matched to a Price book item (their item #, the name, a close name
 *      with the same numbers) and says what importing it does — a price
 *      change, this vendor's price ADDED to an item (the merge Coy asked
 *      for), or a new item — with "Make default" (the price budgets use).
 *      Coy can point any row at another item or none.
 *   4. Import writes those vendor prices (/api/price-book/import), stamped
 *      with the file; Undo is in the Price book's recent imports.
 *
 * A suggestion until Coy imports it (DECISIONS §2b). A price is kept only if
 * it is written on the document; from a photo there is nothing to check
 * against, and the screen says so.
 */

import React, { useEffect, useMemo, useState } from "react";
import { T, F, disp, eyebrow, nums, clip, money, formatPhone } from "@/lib/v34/tokens";
import { Drawer } from "@/components/v34/primitives";
import { useWide } from "@/lib/v34/use-wide";
import { COST_TYPES, COST_TYPE_LABEL, QTY_RULES, QTY_RULE_LABEL, defaultTaxable, type CostType, type QtyRule } from "@/lib/cost-cards";
import { ruleFromUnit } from "@/lib/price-import";
import { collapseLines, matchItem, matchVendor, taxRateFrom, type PriceLine } from "@/lib/vendor-match";
import { call } from "@/components/v34/cost-cards";
import { sendBytes } from "@/components/v34/files-panel";

type Stage = "pick" | "reading" | "vendor" | "preview";
type Kind = "receipt" | "invoice" | "quote";
const KIND_LABEL: Record<Kind, string> = { receipt: "Receipt", invoice: "Invoice", quote: "Quote" };
const READ_POLL_MS = 5000;
const READ_GIVE_UP_MS = 5 * 60_000;

interface RFile {
  id: string; name: string; contact_id: string | null; read_state: string | null; read_error: string | null;
  summary: string | null; created_at: string; facts: Record<string, unknown> | null; category: string | null;
}
export interface VendorRow {
  id: string; name: string | null; company_name: string | null; subtype: string | null; phone: string | null;
  email: string | null; address: string | null; service_area: string | null;
}
interface Item {
  id: string; name: string; unit: string; unit_cost: number | null; cost_type: CostType; cost_group_id: string | null;
  vendor_contact_id: string | null; vendor_sku: string | null; default_source_id: string | null; active: boolean;
  vendor_source?: { id: string; unit_cost: number | null; vendor_sku: string | null } | null;
}
interface Group { id: string; name: string }
interface Details { name?: string; phone?: string; email?: string; address?: string }

const FEE = /\b(fee|surcharge|charge|delivery|freight|haul|standby|washout|environmental|env)\b/i;

export function ReceiptImport({ open, onClose, vendorId, onDone }: {
  open: boolean; onClose: () => void; vendorId?: string | null; onDone: (msg: string) => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [kind, setKind] = useState<Kind>("receipt");
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [vendor, setVendor] = useState<string>(vendorId ?? "");
  const [file, setFile] = useState<RFile | null>(null);
  const [waiting, setWaiting] = useState<RFile[]>([]);
  const [pct, setPct] = useState<number | null>(null);
  const [readSince, setReadSince] = useState(0);
  const [readTick, setReadTick] = useState(0);
  const [slow, setSlow] = useState(false);
  const [draft, setDraft] = useState<{ name: string; phone: string; email: string; address: string; service_area: string; subtype: string } | null>(null);
  const [existing, setExisting] = useState<{ id: string; name: string | null; bucket: string | null } | null>(null);
  const [fillBlanks, setFillBlanks] = useState(true);
  const [matchHow, setMatchHow] = useState<"phone" | "email" | "name" | null>(null);
  const [nameDraft, setNameDraft] = useState("");          // a name for a matched vendor who has none
  const [newName, setNewName] = useState<Record<number, string>>({});
  const [info, setInfo] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pick, setPick] = useState<Record<number, string>>({});       // row → item id, or "new"
  const [makeDefault, setMakeDefault] = useState<Record<number, boolean>>({});
  const [off, setOff] = useState<Record<number, boolean>>({});
  const [newType, setNewType] = useState<Record<number, CostType>>({});
  const [newRule, setNewRule] = useState<Record<number, QtyRule>>({});
  const [newGroup, setNewGroup] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [measure, wide] = useWide<HTMLDivElement>(760);

  const reset = () => {
    setStage("pick"); setVendor(vendorId ?? ""); setFile(null); setPct(null); setDraft(null); setExisting(null); setFillBlanks(true);
    setMatchHow(null); setNameDraft(""); setNewName({}); setInfo(false); setRenaming(null);
    setPick({}); setMakeDefault({}); setOff({}); setNewType({}); setNewRule({}); setNewGroup({}); setErr(null); setSlow(false);
  };
  const close = () => { reset(); onClose(); };

  // ---- vendors, and receipts already read but not yet filed or imported
  useEffect(() => {
    if (!open) return;
    let gone = false;
    Promise.all([call("/api/vendors", "GET"), call(vendorId ? `/api/files?contact_id=${vendorId}` : "/api/files?inbox=1", "GET")])
      .then(([v, f]) => {
        if (gone) return;
        setVendors((v.vendors ?? []) as VendorRow[]);
        setWaiting(((f.files ?? []) as RFile[]).filter((x) => (x.category === "receipt" || x.category === "vendor_quote") && x.read_state !== "skipped"));
      }).catch((e) => { if (!gone) setErr(String(e?.message ?? e)); });
    return () => { gone = true; };
  }, [open, vendorId]);

  const facts = file?.facts ?? {};
  const details = (facts.vendor_details ?? null) as Details | null;
  const lines = useMemo(() => collapseLines(Array.isArray(facts.price_lines) ? (facts.price_lines as PriceLine[]) : []), [facts.price_lines]);
  const fromPhoto = facts.price_lines_from_photo === true;
  const vendorName = (id: string | null | undefined) => {
    const v = vendors.find((x) => x.id === id);
    return v ? v.name || v.company_name || formatPhone(v.phone) : null;
  };
  // A vendor's NAME only — never their number in a title or summary (Coy, 2026-09-29).
  const vendorTitle = (id: string | null | undefined) => {
    const v = vendors.find((x) => x.id === id);
    return v ? v.name || v.company_name || null : null;
  };

  // ---- the prices
  const loadItems = async (vid: string) => {
    setBusy(true); setErr(null);
    try {
      const [all, theirs] = await Promise.all([call("/api/cost-items", "GET"), call(`/api/cost-items?vendor=${vid}`, "GET")]);
      const src = new Map(((theirs.items ?? []) as Item[]).filter((i) => i.vendor_source).map((i) => [i.id, i.vendor_source!]));
      const list = ((all.items ?? []) as Item[]).map((i) => ({ ...i, unit_cost: i.unit_cost === null ? null : Number(i.unit_cost), vendor_source: src.get(i.id) ?? null }));
      setItems(list);
      setGroups((all.groups ?? []) as Group[]);
      setPick({}); setMakeDefault({}); setOff({});
      setStage("preview");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  // ---- after a read: who it's from
  const afterRead = (f: RFile) => {
    setFile(f);
    const priced = Array.isArray(f.facts?.price_lines) && (f.facts?.price_lines as unknown[]).length > 0;
    if (f.read_state !== "read" || !priced) { setStage("reading"); return; }
    const d = (f.facts?.vendor_details ?? {}) as Details;
    setNameDraft(titleCase(d.name ?? ""));
    // Already on a vendor: straight to the prices — unless that vendor has no
    // name and the document prints one, which is worth one question first.
    if (f.contact_id) {
      setVendor(f.contact_id);
      const v = vendors.find((x) => x.id === f.contact_id);
      if (v && !v.name && !v.company_name && d.name) {
        setMatchHow(null);
        setDraft({ name: titleCase(d.name), phone: d.phone ?? "", email: d.email ?? "", address: d.address ?? "", service_area: "", subtype: "supplier" });
        setStage("vendor");
        return;
      }
      void loadItems(f.contact_id); return;
    }
    const m = matchVendor({ name: d.name, phone: d.phone, email: d.email }, vendors);
    setVendor(m?.id ?? ""); setMatchHow(m?.how ?? null);
    setDraft({ name: titleCase(d.name ?? ""), phone: d.phone ?? "", email: d.email ?? "", address: d.address ?? "", service_area: "", subtype: "supplier" });
    setStage("vendor");
  };

  // ---- waiting on Dusty
  useEffect(() => {
    if (stage !== "reading" || !file || file.read_state === "read" || file.read_state === "skipped" || file.read_state === "failed") return;
    let gone = false;
    const t = setTimeout(() => {
      call(file.contact_id ? `/api/files?contact_id=${file.contact_id}` : "/api/files?inbox=1", "GET").then((b) => {
        if (gone) return;
        const f = ((b.files ?? []) as RFile[]).find((x) => x.id === file.id);
        if (f && ["read", "skipped", "failed"].includes(f.read_state ?? "")) afterRead(f);
        else { setSlow(Date.now() - readSince > READ_GIVE_UP_MS); setReadTick((n) => n + 1); }
      }).catch(() => { if (!gone) setReadTick((n) => n + 1); });
    }, READ_POLL_MS);
    return () => { gone = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, file, readTick, readSince]);

  const send = async (f: File) => {
    setErr(null); setBusy(true); setPct(0);
    try {
      const made = await call("/api/files", "POST", {
        name: f.name, mime: f.type, size: f.size, category: kind === "quote" ? "vendor_quote" : "receipt", ...(vendor ? { contact_id: vendor } : {}),
      });
      await sendBytes(made.upload.signed_url, f, setPct);
      const done = await call(`/api/files/${made.file.id}/done`, "POST");
      setFile(done.file as RFile); setReadSince(Date.now()); setSlow(false); setStage("reading");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); setPct(null); }
  };

  const rename = async () => {
    if (!file || renaming === null) return;
    const n = renaming.trim();
    setRenaming(null);
    if (!n || n === file.name) return;
    try { const b = await call(`/api/files/${file.id}`, "PATCH", { name: n }); setFile({ ...file, name: (b.file as RFile).name }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  // ---- the vendor: pick one, or create the one Dusty read
  const fileOn = async (id: string) => {
    if (!file) return;
    if (!file.contact_id) {
      const b = await call(`/api/files/${file.id}`, "PATCH", { contact_id: id });
      setFile({ ...(b.file as RFile) });
    }
    const v = vendors.find((x) => x.id === id);
    // A vendor with no name takes the one Coy confirmed here (Dusty's reading of the document, edited).
    if (v && !v.name && !v.company_name && nameDraft.trim()) {
      await call(`/api/vendors/${id}`, "PATCH", { name: nameDraft.trim(), company_name: nameDraft.trim() });
      setVendors((vs) => vs.map((x) => (x.id === id ? { ...x, name: nameDraft.trim(), company_name: nameDraft.trim() } : x)));
    }
    if (v && fillBlanks && details) {
      const add: Record<string, string> = {};
      if (!v.phone && details.phone) add.phone = details.phone;
      if (!v.email && details.email) add.email = details.email;
      if (!v.address && details.address) add.address = details.address;
      if (Object.keys(add).length) await call(`/api/vendors/${id}`, "PATCH", add).catch(() => {});
    }
    setVendor(id);
    await loadItems(id);
  };
  const createVendor = async () => {
    if (!draft) return;
    setBusy(true); setErr(null); setExisting(null);
    try {
      const r = await fetch("/api/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const b = await r.json().catch(() => ({}));
      if (r.status === 409 && b.existing) { setExisting(b.existing); return; }
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      const v = b.vendor as VendorRow & { contact_subtype?: string | null };
      setVendors((vs) => [...vs, { ...v, subtype: v.contact_subtype ?? null }]);
      await fileOn(v.id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const fileExistingAsVendor = async () => {
    if (!existing) return;
    setBusy(true); setErr(null);
    try {
      if (existing.bucket !== "vendor") await call(`/api/contacts/${existing.id}/bucket`, "PATCH", { bucket: "vendor", subtype: draft?.subtype || "supplier" });
      const v = await call("/api/vendors", "GET");
      setVendors((v.vendors ?? []) as VendorRow[]);
      await fileOn(existing.id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  // Dusty's match for each row (their item #, the name, a close name) until Coy picks another.
  const auto = useMemo(() => {
    const like = items.map((i) => ({ id: i.id, name: i.name, vendor_sku: i.vendor_sku, active: i.active,
      sources: i.vendor_source ? [{ vendor_contact_id: vendor, vendor_sku: i.vendor_source.vendor_sku }] : [] }));
    return lines.map((l) => matchItem(l, like, vendor || null)?.id ?? "new");
  }, [items, lines, vendor]);
  const pickOf = (n: number) => pick[n] ?? auto[n] ?? "new";
  type Row = { n: number; l: (typeof lines)[number]; item: Item | null; status: "new" | "add" | "change" | "same"; dflt: boolean };
  const rows: Row[] = lines.map((l, n) => {
    const item = pickOf(n) !== "new" ? items.find((i) => i.id === pickOf(n)) ?? null : null;
    const theirs = item?.vendor_source ?? null;
    const status: Row["status"] = !item ? "new" : !theirs ? "add" : theirs.unit_cost === l.unit_cost ? "same" : "change";
    // Make default: ticked for a new item or one with no default vendor yet.
    const dflt = makeDefault[n] ?? (!item || !item.default_source_id);
    return { n, l, item, status, dflt };
  });
  const on = (r: Row) => !off[r.n] && (r.status !== "same" || (r.dflt && r.item?.default_source_id !== r.item?.vendor_source?.id));
  const chosen = rows.filter(on);

  const submit = async () => {
    if (!file || !vendor) return;
    setBusy(true); setErr(null);
    try {
      const payload = chosen.map((r) => r.item
        ? { action: "change", card_id: r.item.id, unit_cost: r.l.unit_cost, vendor_sku: r.l.sku, unit: r.l.unit, make_default: r.dflt }
        : {
            action: "new", name: (newName[r.n] ?? titleCase(r.l.name.replace(/_/g, " "))).trim() || r.l.name, cost_type: typeOf(r), unit: r.l.unit ?? "EA", unit_cost: r.l.unit_cost,
            taxable: defaultTaxable(typeOf(r)), vendor_contact_id: vendor, vendor_sku: r.l.sku, qty_rule: newRule[r.n] ?? ruleFromUnit(r.l.unit),
            rule_params: {}, group: newGroup[r.n] || null, make_default: r.dflt,
          });
      const printed = typeof facts.tax_pct === "number" ? (facts.tax_pct as number) : null;
      const b = await call("/api/price-book/import", "POST", {
        kind: "vendor_quote", price_source: kind, file_name: file.name, source: KIND_LABEL[kind].toLowerCase(), source_file_id: file.id,
        vendor_contact_id: vendor, tax_pct_seen: printed, rows: payload,
        unchanged: rows.filter((r) => r.status === "same").length, skipped: rows.length - payload.length - rows.filter((r) => r.status === "same").length,
      });
      const i = b.import as { created: number; updated: number };
      onDone(`${vendorName(vendor) ?? "Vendor"}: ${i.created} new item${i.created === 1 ? "" : "s"}, ${i.updated} price${i.updated === 1 ? "" : "s"} added or changed — from ${file.name}.`);
      reset(); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const typeOf = (r: Row): CostType => newType[r.n] ?? (FEE.test(r.l.name.replace(/_/g, " ")) ? "other" : "material");

  // ---- look
  const field: React.CSSProperties = { height: 34, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, borderRadius: 4, padding: "0 8px", minWidth: 0, width: "100%" };
  const btn = (primary: boolean): React.CSSProperties => ({ height: 38, padding: "0 14px", borderRadius: 4, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase",
    letterSpacing: ".06em", background: primary ? T.ink : T.card, color: primary ? T.card : T.ink, border: primary ? "none" : `1px solid ${T.hair}`, cursor: "pointer" });
  const STATUS: Record<Row["status"], [string, string]> = { new: ["New item", T.green], add: ["Add their price", T.chalk], change: ["Price change", T.hiviz], same: ["Same", T.ink3] };
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const taxWorked = taxRateFrom(facts.subtotal as number | undefined, facts.tax_amount as number | undefined);

  return (
    <Drawer open={open} onClose={close} wide title={file ? file.name : "Add a receipt or quote"}
      sub={file ? vendorTitle(vendor) ?? undefined : "A photo or a PDF — Dusty reads the vendor and the prices, you check them"}
      right={file && renaming === null ? (
        <button onClick={() => setRenaming(file.name)} aria-label="Rename the document" title="Rename"
          style={{ color: T.ink3, fontSize: 16, cursor: "pointer", padding: "0 6px" }}>✎</button>) : undefined}>
      <div ref={measure} className="px-4 py-3 mx-auto" style={{ maxWidth: 1180 }}>
        {file && renaming !== null && (
          <div className="flex gap-2 items-center mb-2">
            <input value={renaming} autoFocus onChange={(e) => setRenaming(e.target.value)} aria-label="Document name"
              onKeyDown={(e) => { if (e.key === "Enter") void rename(); if (e.key === "Escape") setRenaming(null); }} style={{ ...field, flex: 1 }} />
            <button onClick={() => void rename()} style={btn(true)}>Save</button>
            <button onClick={() => setRenaming(null)} style={btn(false)}>Cancel</button>
          </div>
        )}
        {err && <div className="mb-2 rounded px-3 py-2" style={{ fontSize: F.sm, color: T.red, background: T.redDim }}>{err}</div>}

        {stage === "pick" && (
          <div className="flex flex-col gap-3" style={{ maxWidth: 560 }}>
            <div className="flex gap-1" role="radiogroup" aria-label="What it is">
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className="rounded px-3"
                  style={{ height: 32, background: kind === k ? T.ink : T.card, color: kind === k ? T.card : T.ink2, border: `1px solid ${kind === k ? T.ink : T.hair}`,
                    fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer" }}>{KIND_LABEL[k]}</button>
              ))}
            </div>
            {!vendorId && (
              <label className="block"><span style={eyebrow}>Vendor</span>
                <select value={vendor} onChange={(e) => setVendor(e.target.value)} style={field} aria-label="Vendor">
                  <option value="">Dusty will read who it&apos;s from</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name || v.company_name || formatPhone(v.phone)}</option>)}
                </select></label>
            )}
            <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="flex items-center justify-center rounded" style={{ ...btn(true), height: 48, opacity: busy ? 0.5 : 1 }}>
                {pct !== null ? `Uploading… ${pct}%` : "Take a photo"}
                <input type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" aria-label="Take a photo" disabled={busy}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f); }} />
              </label>
              <label className="flex items-center justify-center rounded" style={{ ...btn(false), height: 48, opacity: busy ? 0.5 : 1 }}>
                Choose a file
                <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" aria-label="Receipt file" disabled={busy}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f); }} />
              </label>
            </div>
            <p style={{ fontSize: F.xs, color: T.ink3, lineHeight: 1.5 }}>
              A PDF from the vendor reads best: every price is checked against its text. A photo works too (JPEG or PNG — on an iPhone set the camera to
              &quot;Most Compatible&quot;), but there&apos;s nothing to check a photo&apos;s prices against, so you&apos;ll check them.
            </p>
            {waiting.length > 0 && (
              <div>
                <div style={{ ...eyebrow, color: T.ink }}>{vendorId ? "Their receipts and quotes" : "Waiting to be filed"}</div>
                {waiting.map((f) => (
                  <button key={f.id} onClick={() => { setReadSince(Date.now()); afterRead(f); }} className="w-full text-left flex items-baseline gap-2 py-1.5"
                    style={{ borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: F.sm, ...clip }}>{f.name}</span>
                    <span style={{ fontSize: F.xs, color: T.ink3 }}>
                      {f.read_state === "read" ? `${Array.isArray(f.facts?.price_lines) ? (f.facts?.price_lines as unknown[]).length : 0} prices` : f.read_state === "failed" ? "couldn't read" : "reading…"}
                      {" · "}{new Date(f.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span style={{ ...eyebrow, color: T.chalk }}>Open</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {stage === "reading" && file && (
          <div className="flex flex-col gap-3" style={{ maxWidth: 560 }}>
            {file.read_state === "read" ? (
              <div style={{ fontSize: F.sm, color: T.ink2, lineHeight: 1.5 }}>Dusty read it but found no prices on it{file.summary ? `: ${file.summary}` : "."}</div>
            ) : file.read_state === "skipped" || file.read_state === "failed" ? (
              <div style={{ fontSize: F.sm, color: T.red, lineHeight: 1.5 }}>
                Dusty couldn&apos;t read it: {file.read_error ?? "no reason given"}.{file.read_state === "failed" ? " He'll try again in 30 minutes." : ""}
              </div>
            ) : (
              <div className="flex items-center gap-2" style={{ fontSize: F.sm, color: T.ink2 }}>
                <span className="rounded-full animate-pulse" style={{ width: 10, height: 10, background: T.hiviz }} />
                Dusty is reading {file.name}…{slow ? " Still going. You can close this — it'll be under “Waiting to be filed” when he's done." : " Usually under a minute."}
              </div>
            )}
            <div><button onClick={() => { setFile(null); setStage("pick"); }} style={btn(false)}>Back</button></div>
          </div>
        )}

        {stage === "vendor" && file && draft && (
          <div className="flex flex-col gap-3" style={{ maxWidth: 620 }}>
            <div className="rounded px-3 py-2" style={{ background: T.slab, fontSize: F.sm, lineHeight: 1.5 }}>
              <div style={{ ...eyebrow, color: T.ink }}>On the {KIND_LABEL[kind].toLowerCase()}</div>
              {details ? (
                <>
                  <div style={{ fontWeight: 600 }}>{details.name ?? "No name printed"}</div>
                  <div style={{ color: T.ink2 }}>{[details.phone, details.email, details.address].filter(Boolean).join(" · ") || "No phone, email or address printed"}</div>
                </>
              ) : <div style={{ color: T.ink2 }}>Dusty didn&apos;t find who issued it.</div>}
            </div>

            {vendor ? (
              <div className="flex flex-col gap-2">
                <div style={{ fontSize: F.sm, lineHeight: 1.45 }}>
                  {vendorTitle(vendor) ? <>From <b>{vendorTitle(vendor)}</b></> : <>From your contact <b>{vendorName(vendor)}</b></>}
                  <span style={{ color: T.ink3 }}>
                    {matchHow === "phone" ? " — matched by the phone number on it" : matchHow === "email" ? " — matched by the email on it" : matchHow === "name" ? " — matched by name" : ""}
                  </span>
                </div>
                {!vendorTitle(vendor) && (
                  <label className="block"><span style={eyebrow}>Their name{details?.name ? " · from the " + KIND_LABEL[kind].toLowerCase() : ""}</span>
                    <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Name this vendor" style={field} aria-label="Vendor name" /></label>
                )}
                <label className="block"><span style={eyebrow}>Not them? Pick another</span>
                  <select value={vendor} onChange={(e) => { setVendor(e.target.value); setMatchHow(null); }} style={field} aria-label="Vendor">
                    <option value="">— none of these: a new vendor</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name || v.company_name || formatPhone(v.phone)}</option>)}
                  </select></label>
                {details && (
                  <label className="flex items-center gap-2" style={{ fontSize: F.xs, color: T.ink2 }}>
                    <input type="checkbox" checked={fillBlanks} onChange={(e) => setFillBlanks(e.target.checked)} style={{ width: 16, height: 16, accentColor: T.chalk }} />
                    Add the phone, email and address from it where their page has none
                  </label>
                )}
                <div><button onClick={() => void fileOn(vendor).catch((e) => setErr(String(e?.message ?? e)))} disabled={busy} style={{ ...btn(true), opacity: busy ? 0.5 : 1 }}>
                  {busy ? "…" : "Next: the prices"}</button></div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div style={{ ...eyebrow, color: T.green }}>New vendor</div>
                <div className="grid gap-2" style={{ gridTemplateColumns: wide ? "1fr 1fr" : "1fr" }}>
                  {([["name", "Name"], ["phone", "Phone"], ["email", "Email"], ["address", "Address"], ["service_area", "Where they deliver"]] as const).map(([k, label]) => (
                    <label key={k} className="block"><span style={eyebrow}>{label}</span>
                      <input value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} style={field} aria-label={label}
                        placeholder={k === "service_area" ? "e.g. Baton Rouge, north Ascension" : ""} /></label>
                  ))}
                  <label className="block"><span style={eyebrow}>Kind</span>
                    <select value={draft.subtype} onChange={(e) => setDraft({ ...draft, subtype: e.target.value })} style={field} aria-label="Kind of vendor">
                      <option value="supplier">Supplier</option><option value="equipment">Equipment rental</option><option value="subcontractor">Subcontractor</option>
                    </select></label>
                </div>
                {existing && (
                  <div className="rounded px-3 py-2" style={{ background: T.hivizDim, fontSize: F.sm }}>
                    That {draft.email && !draft.phone ? "email" : "number"} is already {existing.name ?? "one of your contacts"}{existing.bucket && existing.bucket !== "vendor" ? ` (filed ${existing.bucket})` : ""}.{" "}
                    <button onClick={() => void fileExistingAsVendor()} style={{ color: T.chalk, fontWeight: 600, cursor: "pointer" }}>
                      {existing.bucket === "vendor" ? `Use ${existing.name ?? "them"}` : `File ${existing.name ?? "them"} as a vendor and use them`}</button>
                  </div>
                )}
                <div className="flex gap-2 flex-wrap items-center">
                  <button onClick={() => void createVendor()} disabled={busy || !draft.name.trim()} style={{ ...btn(true), opacity: busy || !draft.name.trim() ? 0.5 : 1 }}>
                    {busy ? "Creating…" : "Create vendor"}</button>
                  <span style={{ fontSize: F.xs, color: T.ink3 }}>Nobody is added until you tap it. Or pick one:</span>
                  <select value="" onChange={(e) => { if (e.target.value) setVendor(e.target.value); }} style={{ ...field, width: 220 }} aria-label="Pick an existing vendor">
                    <option value="">An existing vendor…</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name || v.company_name || formatPhone(v.phone)}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {stage === "preview" && file && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 items-baseline" style={{ fontSize: F.sm }}>
              <span>{vendorTitle(vendor) && <><b>{vendorTitle(vendor)}</b> · </>}{lines.length} item{lines.length === 1 ? "" : "s"}</span>
              {typeof facts.tax_pct === "number" ? (
                <span style={{ color: T.ink2 }}>Tax {facts.tax_pct as number}% (printed)</span>
              ) : taxWorked !== null ? (
                <span style={{ color: T.ink2 }}>Tax {money(facts.tax_amount as number)} on {money(facts.subtotal as number)} — works out to {taxWorked}% <span style={{ color: T.ink3 }}>(worked out; no rate printed)</span></span>
              ) : null}
              <button onClick={() => setInfo((x) => !x)} aria-expanded={info} aria-label="What these mean" title="What these mean"
                className="rounded-full" style={{ width: 20, height: 20, border: `1px solid ${info ? T.ink : T.hair}`, background: info ? T.ink : T.card,
                  color: info ? T.card : T.ink2, fontSize: 11, fontWeight: 700, fontStyle: "italic", lineHeight: "18px", cursor: "pointer", alignSelf: "center" }}>i</button>
            </div>
            {fromPhoto && (
              <div className="rounded px-3 py-2" style={{ fontSize: F.sm, background: T.hivizDim }}>
                Read from a photo, so there was no text to check these prices against. Check each one against the {KIND_LABEL[kind].toLowerCase()} before importing.
              </div>
            )}
            {info && (
              <div className="rounded px-3 py-2" style={{ fontSize: F.xs, color: T.ink2, background: T.slab, lineHeight: 1.5 }}>
                <div><b style={{ color: T.green }}>New item</b> — not in your Price book yet; it&apos;s added with their price. Edit the name first.</div>
                <div><b style={{ color: T.chalk }}>Add their price</b> — the item is in your Price book; their price is added to it.</div>
                <div><b style={{ color: T.hiviz }}>Price change</b> — they already price it; old → new.</div>
                <div><b style={{ color: T.ink3 }}>Same</b> — nothing to change.</div>
                <div>Find the right item in the box on each row if the match is wrong — next time their item # matches it on its own.</div>
                <div><b>Make default</b> — their price becomes the one budgets use for that item.</div>
                <div>The same item on several tickets is one row, quantities added. Tax isn&apos;t a price: your tax rate stays in Cost settings.</div>
              </div>
            )}

            <div className="flex flex-col">
              {rows.map((r) => {
                const [label, color] = STATUS[r.status];
                const theirs = r.item?.vendor_source ?? null;
                const isDefault = !!r.item && !!theirs && r.item.default_source_id === theirs.id;
                return (
                  <div key={r.n} className="py-2" style={{ borderTop: `1px solid ${T.hairSoft}`, opacity: on(r) ? 1 : 0.55 }}>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={!off[r.n]} aria-label={`Import ${r.l.name}`} onChange={(e) => setOff((o) => ({ ...o, [r.n]: !e.target.checked }))}
                        style={{ width: 18, height: 18, marginTop: 2, accentColor: T.chalk }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-baseline gap-2">
                          {r.item ? <span style={{ fontSize: F.sm, fontWeight: 600, flex: 1, minWidth: 0, ...clip }}>{r.l.name}</span>
                            : <input value={newName[r.n] ?? titleCase(r.l.name.replace(/_/g, " "))} onChange={(e) => setNewName((x) => ({ ...x, [r.n]: e.target.value }))}
                                aria-label={`Name of the new item for ${r.l.name}`} title={`On the ${KIND_LABEL[kind].toLowerCase()}: ${r.l.name}`}
                                style={{ ...field, height: 30, fontWeight: 600, flex: 1 }} />}
                          <span style={{ ...nums, fontSize: F.sm }}>
                            {r.status === "change" && theirs && <span style={{ color: T.ink3, textDecoration: "line-through", marginRight: 4 }}>{theirs.unit_cost === null ? "blank" : money(theirs.unit_cost)}</span>}
                            {money(r.l.unit_cost)}<span style={{ fontSize: 10, color: T.ink3 }}>/{r.l.unit ?? "?"}</span>
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: T.ink3, ...clip }}>
                          <span style={{ color, fontWeight: 600 }}>{label}</span>
                          {!r.item && (newName[r.n] ?? titleCase(r.l.name.replace(/_/g, " "))) !== r.l.name ? ` · "${r.l.name}"` : ""}
                          {r.l.sku ? ` · #${r.l.sku}` : ""}{r.l.qty !== null ? ` · ${r.l.qty} ${r.l.unit ?? ""}` : ""}{r.l.times > 1 ? ` on ${r.l.times} tickets` : ""}
                          {r.item && !theirs && r.item.unit_cost !== null ? ` · now ${money(r.item.unit_cost)}${r.item.vendor_contact_id ? ` from ${vendorName(r.item.vendor_contact_id) ?? "another vendor"}` : ""}` : ""}
                        </div>
                        <div className="grid gap-2 mt-1 items-center" style={{ gridTemplateColumns: wide ? "minmax(0, 2fr) auto" : "minmax(0, 1fr)" }}>
                          <ItemSearch items={items} groupName={groupName} value={r.item} label={r.l.name}
                            onPick={(id) => {
                              setPick((p) => ({ ...p, [r.n]: id }));
                              setMakeDefault((d) => { const x = { ...d }; delete x[r.n]; return x; });
                            }} />
                          <label className="flex items-center gap-1.5" style={{ fontSize: F.xs, whiteSpace: "nowrap" }}>
                            <input type="checkbox" checked={isDefault || r.dflt} disabled={isDefault}
                              onChange={(e) => setMakeDefault((d) => ({ ...d, [r.n]: e.target.checked }))} style={{ width: 16, height: 16, accentColor: T.chalk }} />
                            {isDefault ? "Default already" : "Make default"}
                          </label>
                        </div>
                        {!r.item && (
                          <div className="grid gap-2 mt-1" style={{ gridTemplateColumns: wide ? "repeat(3, minmax(0, 1fr))" : "minmax(0, 1fr)" }}>
                            <label className="block"><span style={{ ...eyebrow, fontSize: 9 }}>Type{!newType[r.n] ? " · guess" : ""}</span>
                              <select value={typeOf(r)} onChange={(e) => setNewType((t) => ({ ...t, [r.n]: e.target.value as CostType }))} style={{ ...field, height: 30 }} aria-label={`Type for ${r.l.name}`}>
                                {COST_TYPES.map((t) => <option key={t} value={t}>{COST_TYPE_LABEL[t]}</option>)}
                              </select></label>
                            <label className="block"><span style={{ ...eyebrow, fontSize: 9 }}>Counted on a job{!newRule[r.n] && ruleFromUnit(r.l.unit) !== "manual" ? " · guess" : ""}</span>
                              <select value={newRule[r.n] ?? ruleFromUnit(r.l.unit)} onChange={(e) => setNewRule((x) => ({ ...x, [r.n]: e.target.value as QtyRule }))} style={{ ...field, height: 30 }} aria-label={`How ${r.l.name} is counted`}>
                                {QTY_RULES.map((q) => <option key={q} value={q}>{QTY_RULE_LABEL[q]}</option>)}
                              </select></label>
                            <label className="block"><span style={{ ...eyebrow, fontSize: 9 }}>Group</span>
                              <select value={newGroup[r.n] ?? ""} onChange={(e) => setNewGroup((g) => ({ ...g, [r.n]: e.target.value }))} style={{ ...field, height: 30 }} aria-label={`Group for ${r.l.name}`}>
                                <option value="">No group</option>
                                {groups.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
                              </select></label>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sticky bottom-0 flex gap-2 items-center py-2 flex-wrap" style={{ background: T.card, borderTop: `1px solid ${T.hair}` }}>
              <button onClick={() => setStage(draft ? "vendor" : "pick")} style={btn(false)}>Back</button>
              <button onClick={() => void submit()} disabled={busy || chosen.length === 0} style={{ ...btn(true), opacity: busy || chosen.length === 0 ? 0.5 : 1 }}>
                {busy ? "Importing…" : `Import ${chosen.length}`}</button>
              <span style={{ fontSize: F.xs, color: T.ink3 }}>
                {rows.filter((r) => on(r) && r.status === "new").length} new · {rows.filter((r) => on(r) && r.status === "add").length} added to an item · {rows.filter((r) => on(r) && r.status === "change").length} changed · {rows.filter((r) => r.status === "same").length} the same
              </span>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}

/** "ANGELLE CONCRETE GROUP, LLC" → "Angelle Concrete Group, LLC" — a suggestion Coy can edit. */
function titleCase(s: string): string {
  if (!s || s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Llc|Inc|Co|Lp|Llp)\b/g, (w) => w.toUpperCase());
}

/**
 * Find the item a line is (Coy, 2026-09-29: "the item list is not searchable,
 * and there's hundreds of items"). A search box over the Price book — every
 * word must be in the name, group or item # ("4000 psi", "rebar #4") — with
 * New item first; at most 30 shown, under their groups.
 */
function ItemSearch({ items, groupName, value, label, onPick }: {
  items: Array<{ id: string; name: string; unit: string; cost_group_id: string | null; vendor_sku: string | null; active: boolean; unit_cost: number | null }>;
  groupName: Map<string, string>; value: { id: string; name: string; unit: string } | null; label: string; onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const words = q.toLowerCase().replace(/(\d),(\d{3})/g, "$1$2").split(/\s+/).filter(Boolean);
  const hits = open ? items.filter((i) => i.active && words.every((w) =>
    `${i.name} ${groupName.get(i.cost_group_id ?? "") ?? ""} ${i.vendor_sku ?? ""}`.toLowerCase().replace(/(\d),(\d{3})/g, "$1$2").includes(w)))
    .sort((a, b) => (groupName.get(a.cost_group_id ?? "") ?? "~").localeCompare(groupName.get(b.cost_group_id ?? "") ?? "~") || a.name.localeCompare(b.name)).slice(0, 30) : [];
  const box: React.CSSProperties = { height: 30, border: `1px solid ${T.hair}`, background: T.card, fontSize: F.sm, borderRadius: 4, padding: "0 8px", minWidth: 0, width: "100%" };
  const choose = (id: string) => { onPick(id); setOpen(false); setQ(""); };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label={`Item for ${label}`} className="text-left flex items-center gap-2" style={{ ...box, cursor: "pointer" }}>
        <span style={{ flex: 1, minWidth: 0, ...clip, color: value ? T.ink : T.green }}>{value ? `${value.name} · ${value.unit}` : "New item"}</span>
        <span style={{ fontSize: 10, color: T.chalk, whiteSpace: "nowrap" }}>Change ▾</span>
      </button>
    );
  }
  const gOf = (i: (typeof hits)[number]) => groupName.get(i.cost_group_id ?? "") ?? "Not in a group";
  return (
    <div className="rounded" style={{ border: `1px solid ${T.ink}`, background: T.card }}>
      <input value={q} autoFocus onChange={(e) => setQ(e.target.value)} placeholder="Find in your Price book: 4000 psi, rebar, 8006…"
        aria-label={`Find the item for ${label}`} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        style={{ ...box, border: "none", borderBottom: `1px solid ${T.hair}`, borderRadius: 0, height: 34 }} />
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        <button onClick={() => choose("new")} className="w-full text-left px-2 py-1.5" style={{ fontSize: F.sm, color: T.green, cursor: "pointer", borderBottom: `1px solid ${T.hairSoft}` }}>
          + New item
        </button>
        {hits.map((i, k) => {
          const g = gOf(i);
          const head = k === 0 || gOf(hits[k - 1]) !== g;
          return (
            <React.Fragment key={i.id}>
              {head && <div className="px-2 pt-1.5" style={{ ...eyebrow, fontSize: 9, color: T.ink3 }}>{g}</div>}
              <button onClick={() => choose(i.id)} className="w-full text-left px-2 py-1 flex items-baseline gap-2" style={{ fontSize: F.sm, cursor: "pointer" }}>
                <span style={{ flex: 1, minWidth: 0, ...clip }}>{i.name}</span>
                <span style={{ fontSize: 10, color: T.ink3, ...nums }}>{i.unit_cost === null ? "" : money(i.unit_cost)}/{i.unit}</span>
              </button>
            </React.Fragment>
          );
        })}
        {q && hits.length === 0 && <div className="px-2 py-1.5" style={{ fontSize: F.xs, color: T.ink3 }}>Nothing in your Price book matches &ldquo;{q}&rdquo;.</div>}
        {!q && <div className="px-2 py-1.5" style={{ fontSize: F.xs, color: T.ink3 }}>Type to find an item — words, sizes or their item #.</div>}
      </div>
      <button onClick={() => setOpen(false)} className="w-full py-1" style={{ ...eyebrow, color: T.ink2, borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer" }}>Close</button>
    </div>
  );
}
