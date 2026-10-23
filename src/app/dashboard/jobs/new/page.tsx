"use client";

// New job — one page, easy to reach (the rail's New job tile, the Jobs header's + New job). Coy,
// 2026-10-23: "a page to create a job with a customer that is really easy to get to. And it will create
// a new space for the job with all the pages". The customer is picked from Customers or made here
// (POST /api/customers), the job is made on it (POST /api/jobs, then PATCH {customer_id} for a picked
// customer, which puts its primary on the job), and the job opens on its Summary. An open job is a
// Work Space on the rail by itself, with its Job shelf (Summary, Takeoffs, Budget …) and its Contacts.

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { T, F, disp, eyebrow, clip } from "@/lib/v34/tokens";
import { PageHeader } from "@/components/v34/primitives";
import { JOB_TYPE_LABEL } from "@/lib/jobs/stages";

interface Cust { id: string; name: string; customer_type: string | null; person: string | null; phone: string | null; city: string | null }

const input: React.CSSProperties = { height: 42, width: "100%", border: `1px solid ${T.hair}`, borderRadius: 4, padding: "0 10px", fontSize: 16, background: T.card, color: T.ink };

export default function NewJobPage() {
  const router = useRouter();
  const [list, setList] = useState<Cust[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Cust | null>(null);
  const [making, setMaking] = useState(false);
  const [nc, setNc] = useState({ name: "", person: "", phone: "", email: "" });
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    fetch("/api/customers").then((r) => (r.ok ? r.json() : null)).then((b) => {
      if (!off) setList(Array.isArray(b?.customers) ? b.customers.filter((c: Cust) => c.name) : []);
    }).catch(() => { if (!off) setList([]); });
    return () => { off = true; };
  }, []);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase(), d = n.replace(/\D/g, "");
    return (list ?? []).filter((c) => !n || c.name.toLowerCase().includes(n) || (c.person ?? "").toLowerCase().includes(n)
      || (d.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(d))).slice(0, 8);
  }, [list, q]);

  const pick = (c: Cust) => {
    setPicked(c); setMaking(false); setQ("");
    if (!type && c.customer_type && JOB_TYPE_LABEL[c.customer_type]) setType(c.customer_type);
  };
  const hasCustomer = !!picked || (making && nc.name.trim().length > 0);
  const ready = hasCustomer && !!type && !busy;

  async function create() {
    setBusy(true); setErr(null);
    try {
      const j = async (url: string, method: string, body: unknown) => {
        const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
        return b;
      };
      let contactId: string | null = null;
      if (making) {
        const b = await j("/api/customers", "POST", {
          name: nc.name.trim(), customer_type: type, person: nc.person.trim() || undefined,
          phone: nc.phone.trim() || undefined, email: nc.email.trim() || undefined,
        });
        contactId = b.customer?.contact_id ?? null;
      }
      const made = await j("/api/jobs", "POST", {
        ...(contactId ? { contact_id: contactId } : {}), job_type: type,
        ...(title.trim() ? { title: title.trim().slice(0, 200) } : {}),
        ...(address.trim() ? { address: address.trim().slice(0, 300) } : {}),
      });
      const id = made.job.id as string;
      if (picked) await j(`/api/jobs/${id}`, "PATCH", { customer_id: picked.id });
      // Files Dusty was handed with nothing open come onto the job (PDFs into Takeoffs).
      const fileIds = (new URLSearchParams(window.location.search).get("files") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 8);
      for (const fid of fileIds) {
        const f = await j(`/api/files/${fid}`, "PATCH", { file_to: { kind: "job", id } }).catch(() => null);
        if (f?.file && /pdf/i.test(`${f.file.mime_type ?? ""} ${f.file.name ?? ""}`)) await j(`/api/files/${fid}`, "PATCH", { in_plan_room: true }).catch(() => null);
      }
      if (fileIds.length) { window.dispatchEvent(new Event("sc:spaces-reload")); router.push(`/dashboard/scope/${id}/files`); return; }
      window.dispatchEvent(new Event("sc:spaces-reload"));
      router.push(`/dashboard/scope/${id}/summary`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const step = (n: number, label: string) => (
    <div style={{ ...eyebrow, color: T.ink3, margin: "18px 0 6px" }}>{n} · {label}</div>
  );

  return (
    <div style={{ minHeight: "100%" }}>
      <PageHeader title="New job" sub="Pick or add the customer, name the job, and it opens with its Summary, Takeoffs, Budget, Proposal, Files and Contacts." />
      <div className="px-3 pb-10" style={{ maxWidth: 560 }}>
        {step(1, "Customer")}
        {picked ? (
          <div className="flex items-center gap-2 rounded px-3" style={{ minHeight: 48, border: `1px solid ${T.ink}`, background: T.card }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: disp, fontWeight: 600, fontSize: F.md, ...clip }}>{picked.name}</div>
              <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{[picked.person !== picked.name ? picked.person : null, picked.city].filter(Boolean).join(" · ")}</div>
            </div>
            <button onClick={() => setPicked(null)} style={{ ...eyebrow, color: T.chalk, background: "none", border: 0, cursor: "pointer" }}>Change</button>
          </div>
        ) : making ? (
          <div className="space-y-2">
            <input style={input} value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="Customer name (household or business)" autoFocus />
            <input style={input} value={nc.person} onChange={(e) => setNc({ ...nc, person: e.target.value })} placeholder="Contact person (optional)" />
            <div className="flex gap-2">
              <input style={input} value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} placeholder="Phone" inputMode="tel" />
              <input style={input} value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} placeholder="Email" inputMode="email" />
            </div>
            <button onClick={() => setMaking(false)} style={{ fontSize: F.sm, color: T.chalk, background: "none", border: 0, cursor: "pointer", padding: 0 }}>‹ Pick an existing customer instead</button>
          </div>
        ) : (
          <>
            <input style={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers by name or number" autoFocus />
            <button onClick={() => { setMaking(true); setNc({ ...nc, name: q.trim() }); }} className="w-full rounded mt-2"
              style={{ height: 42, border: `1px dashed ${T.ink3}`, background: T.card, fontFamily: disp, fontSize: F.sm, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer", color: T.ink }}>
              + New customer{q.trim() ? ` “${q.trim()}”` : ""}
            </button>
            {list === null && <div style={{ fontSize: F.sm, color: T.ink3, marginTop: 8 }}>Loading customers…</div>}
            <div className="mt-2">
              {shown.map((c) => (
                <button key={c.id} onClick={() => pick(c)} className="w-full text-left px-3 py-2"
                  style={{ borderTop: `1px solid ${T.hairSoft}`, background: T.card, cursor: "pointer", color: T.ink }}>
                  <div style={{ fontFamily: disp, fontWeight: 600, fontSize: F.md, ...clip }}>{c.name}</div>
                  <div style={{ fontSize: F.xs, color: T.ink3, ...clip }}>{[c.person !== c.name ? c.person : null, c.city].filter(Boolean).join(" · ") || "Customer"}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {step(2, "Job")}
        <div className="space-y-2">
          <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job name, e.g. Parking lot replacement" />
          <input style={input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Job site address" />
        </div>

        {step(3, "Type")}
        <div className="flex gap-2 flex-wrap">
          {Object.entries(JOB_TYPE_LABEL).map(([k, l]) => (
            <button key={k} onClick={() => setType(k)} style={{
              height: 38, padding: "0 14px", borderRadius: 4, fontFamily: disp, fontSize: F.sm, textTransform: "uppercase", letterSpacing: ".04em", cursor: "pointer",
              border: `1px solid ${type === k ? T.ink : T.hair}`, background: type === k ? T.ink : T.card, color: type === k ? T.card : T.ink2,
            }}>{l}</button>
          ))}
        </div>

        {err && <div style={{ fontSize: F.sm, color: T.red, marginTop: 12 }}>{err}</div>}
        <button disabled={!ready} onClick={() => void create()} className="w-full rounded mt-5"
          style={{ height: 46, background: ready ? T.hiviz : T.hair, color: T.onHiviz, fontFamily: disp, fontSize: F.md, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", cursor: ready ? "pointer" : "default", border: 0 }}>
          {busy ? "Creating…" : !hasCustomer ? "Pick or add a customer" : !type ? "Pick a type" : "Create the job"}
        </button>
        <div style={{ fontSize: F.xs, color: T.ink3, marginTop: 8 }}>
          The job opens on its Summary and shows up on the rail. Add plans next in its Files.
        </div>
      </div>
    </div>
  );
}
