"use client";
/**
 * A plan under one of Dusty's answers (src/lib/dusty/plan.ts): the steps in plain
 * words, and Apply — Coy's tap, run through the ordinary APIs
 * (src/lib/dusty/apply-plan.ts). Dusty changes nothing himself. Budget steps need
 * the job open; Price book and assembly steps and archive / delete / restore
 * steps (migration 066) don't — the last list
 * the real names they touch, read from the database — not Dusty's label.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { T, F, disp, eyebrow } from "@/lib/v34/tokens";
import { CUST_KEY, VEND_KEY, describe, needsJob as stepNeedsJob, outline, RECORD_STEPS, type PlanAction } from "@/lib/dusty/plan";
import { applyPlan, applyRecords, applyVendors, byRef, loadLookup, type PlanLookup, type StepResult } from "@/lib/dusty/apply-plan";

export function PlanCard({ jobId, actions, dropped, done }: { jobId: string | null; actions: PlanAction[]; dropped: number; done: boolean }) {
  const [look, setLook] = useState<PlanLookup | null>(null);
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const router = useRouter();
  // A result to look at (an email draft): opens its page; on a phone the chat steps aside so it shows.
  const openResult = (href: string) => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) window.dispatchEvent(new Event("sc:dusty-close"));
    router.push(href);
  };
  const [results, setResults] = useState<StepResult[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  // Coy may change the words of a text or a proposal before he sends it; what he changed is kept for Dusty to learn from.
  const [edits, setEdits] = useState<Record<number, string>>({});
  const budgetSteps = actions.filter((a) => !RECORD_STEPS.has(a.do));
  const recordSteps = actions.filter((a) => RECORD_STEPS.has(a.do));
  useEffect(() => {
    if (!done || !budgetSteps.length) return;
    let off = false;
    loadLookup(jobId).then((l) => { if (!off) setLook(l); }).catch((e) => { if (!off) setErr(String(e?.message ?? e)); });
    return () => { off = true; };
  }, [jobId, done, budgetSteps.length]);
  const recKey = recordSteps.map((a) => (a.do === "archive" || a.do === "restore" ? `${a.kind}:${a.ids.join(",")}` : a.do === "set_address" ? `${a.kind}:${a.id}` : a.do === "new_job" ? (CUST_KEY.test(a.contact) ? "" : `contact:${a.contact}`) : a.do === "text" ? `contact:${a.contact}` : a.do === "appointment" ? [a.job && !/^job\d/.test(a.job) ? `job:${a.job}` : "", a.contact ? `contact:${a.contact}` : ""].filter(Boolean).join("|") : a.do === "send_proposal" ? [`job:${a.job}`, a.contact ? `contact:${a.contact}` : ""].filter(Boolean).join("|")
    : a.do === "set_name" ? `${a.kind}:${a.id}` : a.do === "new_customer" ? (a.contact ? `contact:${a.contact}` : "")
    : a.do === "new_contact" ? (!a.customer || CUST_KEY.test(a.customer) ? "" : `customer:${a.customer}`)
    : a.do === "attach_contact" ? [`contact:${a.contact}`, CUST_KEY.test(a.customer) ? "" : `customer:${a.customer}`].filter(Boolean).join("|")
    : a.do === "file" ? [`file:${a.files.join(",")}`, /^(cust|job)\d/.test(a.id) ? "" : `${a.kind}:${a.id}`].filter(Boolean).join("|")
    : a.do === "file_email" ? [`email:${a.email}`, /^(cust|job)\d/.test(a.id) ? "" : `${a.kind}:${a.id}`].filter(Boolean).join("|") : ""))
    // Whose price a Price book step carries (a vendor's page: their call or quote).
    .concat(budgetSteps.map((a) => (a.do === "vendor_price" && !VEND_KEY.test(a.vendor) ? `contact:${a.vendor}` : a.do === "new_item" && a.vendor && !VEND_KEY.test(a.vendor) ? `contact:${a.vendor}` : "")))
    .concat(recordSteps.map((a) => (a.do === "new_vendor" && a.contact ? `contact:${a.contact}` : a.do === "new_vendor" && a.from === "file" ? `file:${a.source}` : "")))
    .filter(Boolean).join("|");
  useEffect(() => {
    if (!done || !recKey) return;
    let off = false;
    const byKind = new Map<string, string[]>();
    for (const part of recKey.split("|")) { const [k, ids] = part.split(":"); byKind.set(k, [...(byKind.get(k) ?? []), ...ids.split(",")]); }
    Promise.all([...byKind].map(([k, ids]) => fetch(`/api/archive/names?kind=${k}&ids=${[...new Set(ids)].slice(0, 500).join(",")}`).then((r) => r.json())))
      .then((all) => { if (!off) setNames(Object.assign({}, ...all.map((x) => x.names ?? {}))); }).catch(() => {});
    return () => { off = true; };
  }, [done, recKey]);
  if (!actions.length && !dropped) return null;
  const needsJob = budgetSteps.some(stepNeedsJob);
  // Main steps numbered, the items that go on them lettered under them (Coy, 2026-10-15).
  const steps: { label: string; sub: boolean }[] = [];
  outline(actions).forEach((o, n) => { steps[o.main] = { label: `${n + 1}.`, sub: false }; o.subs.forEach((k, m) => { steps[k] = { label: `${String.fromCharCode(97 + (m % 26))}.`, sub: true }; }); });
  const texts = actions.filter((a) => a.do === "text" || (a.do === "send_proposal" && a.via === "text")).length;
  const sends = actions.filter((a) => a.do === "text" || a.do === "send_proposal").length;
  const drafts = actions.filter((a) => a.do === "email").length;
  const verb = sends && sends === actions.length ? (sends === 1 ? "Send" : `Send ${sends}`) : drafts && drafts === actions.length ? (drafts === 1 ? "Save draft" : `Save ${drafts} drafts`) : "Apply";
  const ready = budgetSteps.length ? !!look : done;
  const nm = {
    area: (r: string | null) => {
      if (r === null) return "the whole job";
      const made = actions.find((x) => x.do === "new_area" && x.key === r);
      if (made && made.do === "new_area") return `the new area “${made.name}”`;
      return look ? byRef(look.sections, r)?.name ?? `area ${r} (not on this job)` : `area ${r}`;
    },
    takeoff: (r: string) => (look ? byRef(look.takeoff, r)?.name ?? null : null),
    line: (r: string) => (look ? byRef(look.lines ?? [], r)?.name ?? null : r),
    item: (r: string) => {
      const made = actions.find((x) => x.do === "new_item" && x.key === r);
      if (made && made.do === "new_item") return `the new item “${made.name}”`;
      return look ? byRef(look.items, r)?.name ?? null : r;
    },
    vendor: (id: string) => {
      const made = actions.find((x) => x.do === "new_vendor" && x.key === id);
      if (made && made.do === "new_vendor") return `the new vendor ${made.name}`;
      return names[id] ?? null;
    },
    assembly: (r: string) => {
      const made = actions.find((x) => x.do === "new_assembly" && x.key === r);
      if (made && made.do === "new_assembly") return `the new assembly “${made.name}”`;
      return look ? byRef(look.assemblies, r)?.name ?? null : r;
    },
  };
  const run = async () => {
    if (!ready) return;
    setState("running"); setErr(null);
    try {
      // Vendors first, so the Price book steps can carry their prices (vend1).
      const v = recordSteps.some((x) => x.do === "new_vendor") ? await applyVendors(recordSteps) : { results: [], made: new Map<string, string>() };
      const a = budgetSteps.length && look ? await applyPlan(jobId, budgetSteps, look, null, v.made) : [];
      const edited = recordSteps.map((a) => {
        const i = actions.indexOf(a);
        const words = edits[i];
        if (a.do === "send_proposal") return { ...a, body: words?.trim() ? words.trim() : a.body, draft: a.body };
        if (a.do === "text" && words?.trim()) return { ...a, body: words.trim() };
        return a;
      });
      const b = recordSteps.length ? await applyRecords(edited) : [];
      const all = [...v.results, ...a, ...b];
      setResults(all); setState("done");
      // Dusty's emblem plays "done" for a finished write; the chat's status line says what it did.
      const ok = all.filter((r) => r.ok);
      window.dispatchEvent(new CustomEvent("sc:dusty-done", { detail: { ok: ok.length > 0,
        note: ok.length === 1 ? ok[0].text : ok.length ? `applied ${ok.length} of ${all.length} steps` : all[0]?.text ?? "nothing applied" } }));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setState("idle"); }
  };
  return (
    <div className="mt-3 rounded" style={{ border: `1px solid ${T.hiviz}`, background: T.card }}>
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.hair}` }}>
        <span style={{ ...eyebrow, color: T.hivizText }}>Dusty&apos;s plan · {actions.length} step{actions.length === 1 ? "" : "s"}</span>
        <span className="flex-1" />
        {state !== "done" && (
          <button onClick={() => void run()} disabled={!ready || state === "running" || !actions.length}
            className="rounded px-3" style={{ height: 30, background: T.hiviz, color: T.onHiviz, fontFamily: disp, fontSize: F.xs, textTransform: "uppercase", letterSpacing: ".06em", cursor: "pointer", opacity: !ready || state === "running" ? 0.5 : 1 }}>
            {state === "running" ? (verb === "Apply" ? "Applying…" : "Sending…") : verb}
          </button>
        )}
      </div>
      <ol className="px-3 py-2 flex flex-col gap-1" style={{ fontSize: F.sm, listStyle: "none", paddingLeft: 8 }}>
        {actions.map((a, i) => (
          <li key={i} className="flex gap-1.5" style={{ paddingLeft: steps[i].sub ? 20 : 0, color: steps[i].sub ? T.ink2 : undefined, fontWeight: steps[i].sub ? 400 : 600 }}>
            <span style={{ flex: "none", minWidth: 18, color: T.ink3, fontWeight: 600, ...{ fontVariantNumeric: "tabular-nums" } }}>{steps[i].label}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
            {(a.do === "text" || a.do === "send_proposal") && state !== "done"
              ? <>
                  <div>{a.do === "text" ? "Text them through Quo:" : a.via === "email" ? "Email the proposal (opens in your mail app):" : "Text the proposal through Quo:"}</div>
                  {a.do === "send_proposal" && a.subject && <div style={{ fontSize: F.xs, color: T.ink2 }}>Subject: {a.subject}</div>}
                  <textarea value={edits[i] ?? a.body} onChange={(e) => setEdits((m) => ({ ...m, [i]: e.target.value }))} rows={Math.min(6, Math.max(2, Math.ceil((edits[i] ?? a.body).length / 48)))}
                    aria-label="The words — change them before you send" className="w-full rounded mt-1 px-2 py-1"
                    style={{ border: `1px solid ${T.hair}`, background: T.card, color: T.ink, fontSize: F.sm, lineHeight: 1.4, resize: "vertical", fontFamily: "inherit" }} />
                  {a.do === "send_proposal" && <div style={{ fontSize: F.xs, color: T.ink3 }}>{"{link}"} becomes the proposal&apos;s link{/\{first\}/.test(edits[i] ?? a.body) ? ", {first} their first name" : ""}.</div>}
                </>
              : describe(a, nm)}
            {(a.do === "set_address" || a.do === "new_job") && (
              <div style={{ fontSize: F.xs, color: T.ink2 }}>{a.do === "new_job" && CUST_KEY.test(a.contact) ? "for the new customer above"
                : (a.do === "new_job" ? "for " : "") + (names[a.do === "new_job" ? a.contact : a.id] ?? (Object.keys(names).length ? "not found — skipped" : "…"))}</div>
            )}
            {(a.do === "set_name" || (a.do === "new_customer" && a.contact)) && (
              <div style={{ fontSize: F.xs, color: T.ink2 }}>{a.do === "set_name" ? "now " : ""}{names[a.do === "set_name" ? a.id : a.contact as string] ?? (Object.keys(names).length ? "not found — skipped" : "…")}</div>
            )}
            {a.do === "attach_contact" && (
              <div style={{ fontSize: F.xs, color: T.ink2 }}>{names[a.contact] ?? (Object.keys(names).length ? "not found — skipped" : "…")} → {CUST_KEY.test(a.customer) ? "the new customer above" : names[a.customer] ?? (Object.keys(names).length ? "not found — skipped" : "…")}</div>
            )}
            {a.do === "appointment" && (a.job || a.contact) && (
              <div style={{ fontSize: F.xs, color: T.ink2 }}>{[a.job ? (/^job\d/.test(a.job) ? "the new job above" : names[a.job] ?? "…") : "", a.contact ? `with ${names[a.contact] ?? "…"}` : ""].filter(Boolean).join(" · ")}</div>
            )}
            {a.do === "text" && (
              <div style={{ fontSize: F.xs, color: T.ink2 }}>to {names[a.contact] ?? (Object.keys(names).length ? "not found — skipped" : "…")}</div>
            )}
            {a.do === "send_proposal" && (
              <div style={{ fontSize: F.xs, color: T.ink2 }}>{names[a.job] ?? (Object.keys(names).length ? "job not found — skipped" : "…")} · to {a.contact ? names[a.contact] ?? "…" : "the job's person"}</div>
            )}
            {a.do === "file" && (
              <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.45 }}>
                {a.files.slice(0, 12).map((id) => names[id] ?? (Object.keys(names).length ? "not found — skipped" : "…")).join(" · ")}
                {a.files.length > 12 ? ` · +${a.files.length - 12} more` : ""}
                {!/^(cust|job)\d/.test(a.id) && <> → {names[a.id] ?? (Object.keys(names).length ? "not found — skipped" : "…")}</>}
              </div>
            )}
            {a.do === "file_email" && (
              <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.45 }}>
                {names[a.email] ?? (Object.keys(names).length ? "email not found — skipped" : "…")}
                {!/^(cust|job)\d/.test(a.id) && <> → {names[a.id] ?? (Object.keys(names).length ? "not found — skipped" : "…")}</>}
              </div>
            )}
            {a.do === "new_vendor" && a.from !== "web" && (
              <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                {a.from === "file" ? <>From {names[a.source] ?? "a document in Files"}</> : <>From {a.source === "Coy's words" ? "your words" : a.source}</>}
                {a.contact && <> · their thread: {names[a.contact] ?? "…"}</>}
                {a.website && <> · <a href={a.website} target="_blank" rel="noopener noreferrer nofollow" style={{ color: T.hivizText, textDecoration: "underline" }}>their site</a></>}
              </div>
            )}
            {a.do === "new_vendor" && a.from === "web" && (
              <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                From the web: <a href={a.source} target="_blank" rel="noopener noreferrer nofollow" style={{ color: T.hivizText, textDecoration: "underline" }}>{a.source.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}</a>
                {a.website && a.website !== a.source && <> · <a href={a.website} target="_blank" rel="noopener noreferrer nofollow" style={{ color: T.hivizText, textDecoration: "underline" }}>their site</a></>}
              </div>
            )}
            {(a.do === "archive" || a.do === "restore") && (
              <div style={{ fontSize: F.xs, color: T.ink2, lineHeight: 1.45 }}>
                {a.ids.slice(0, 12).map((id) => names[id] ?? (Object.keys(names).length ? "not found — skipped" : "…")).join(" · ")}
                {a.ids.length > 12 ? ` · +${a.ids.length - 12} more` : ""}
              </div>
            )}
            </div>
          </li>
        ))}
      </ol>
      {dropped > 0 && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>{dropped} step{dropped === 1 ? "" : "s"} didn&apos;t make sense and were left out.</div>}
      {needsJob && !jobId && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>Steps that touch a budget need the job open — they&apos;ll be skipped here. Open the job and ask there.</div>}
      {recordSteps.some((x) => x.do === "archive" || x.do === "restore") && state !== "done" && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>Archived threads come back if they call or text again; deleted things can be restored. Nothing is erased.</div>}
      {actions.some((x) => x.do === "new_vendor") && state !== "done" && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>{actions.some((x) => x.do === "new_vendor" && x.from === "web") ? "Found on the web — open the link and check the number before you call. " : "Check the number against the document before you call. "}If their number is already a contact, that contact is filed as the vendor and filled in. Once they&apos;re added, a call to that number lands on their thread with its recording.</div>}
      {drafts > 0 && state !== "done" && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>Saved as a draft in the email&apos;s thread in Threads — open it, change anything, and tap Send there. Nothing goes out from here.</div>}
      {sends > 0 && state !== "done" && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.ink3 }}>{texts ? "Texts go through Quo from your line; " : ""}{sends > texts ? "an email opens in your mail app for you to send; " : ""}nothing goes out until you tap {verb}. Change the words first if you like — Dusty learns from what you change.</div>}
      {state === "done" && (
        <div className="px-3 py-2" style={{ borderTop: `1px solid ${T.hair}`, fontSize: F.xs }}>
          {results.map((r, i) => (
            <div key={i} style={{ color: r.ok ? T.green : T.red }}>
              {r.ok ? "✓" : "✗"} {r.text}
              {r.href && (
                <button type="button" onClick={() => openResult(r.href!)}
                  style={{ marginLeft: 6, fontWeight: 700, color: T.ink, textDecoration: "underline", cursor: "pointer", background: "none" }}>{r.hrefLabel ?? "Open ›"}</button>
              )}
            </div>
          ))}
        </div>
      )}
      {err && <div className="px-3 pb-2" style={{ fontSize: F.xs, color: T.red }}>{err}</div>}
    </div>
  );
}
