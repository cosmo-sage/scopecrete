"use client";
/**
 * Proposals in Threads (Coy, 2026-10-05: "a smooth way to send it inside of
 * threads or open the link and preview in threads").
 *
 *  - ProposalChip: under a text that carries a proposal link — which job and
 *    version, whether it is still live, how often it was opened — and Preview.
 *  - ProposalPeek: the customer's page itself, in a sheet over the thread
 *    (opening it while signed in isn't counted as a view).
 *  - ProposalSendSheet: from the composer — pick the job's proposal, Text or
 *    Email, the words (starting from how Coy sent the last one), Preview, Send.
 *    Sending is src/lib/v34/send-proposal.ts, the same road as the Preview and
 *    Dusty's plan.
 */
import React, { useEffect, useState } from "react";
import { T, F, disp, eyebrow, formatPhone } from "@/lib/v34/tokens";
import { findProposalToken, firstName, startingWords, type SendExample, type Via } from "@/lib/proposal-send";
import { proposalLink, sendProposal, wordsFor, type LinkReply } from "@/lib/v34/send-proposal";
import { segments } from "@/lib/texting";

/** The customer's page in a sheet. `url` is a /p/ link (any host — the page is read on this one). */
export function ProposalPeek({ token, title, onClose }: { token: string; title?: string | null; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 sc-drawer z-[75] flex items-stretch justify-center" style={{ background: "rgba(10,12,14,.55)" }} onClick={onClose}>
      <div className="flex flex-col w-full" style={{ maxWidth: 760, background: T.card, margin: "12px", borderRadius: 8, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3" style={{ height: 44, borderBottom: `1px solid ${T.hair}` }}>
          <span style={{ ...eyebrow, color: T.ink }}>{title ? `${title} · ` : ""}what the customer sees</span>
          <span className="flex-1" />
          <a href={`/p/${token}`} target="_blank" rel="noreferrer" style={{ fontSize: F.xs, color: T.chalk }}>Open in a tab ↗</a>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card, color: T.ink2, fontSize: 17, cursor: "pointer" }}>×</button>
        </div>
        <iframe src={`/p/${token}`} title="The proposal as the customer sees it" style={{ flex: 1, border: 0, width: "100%", background: "#fff" }} />
        <div className="px-3 py-1.5" style={{ fontSize: F.xs, color: T.ink3, borderTop: `1px solid ${T.hairSoft}` }}>You&apos;re signed in, so opening it here isn&apos;t counted as the customer viewing it.</div>
      </div>
    </div>
  );
}

type TokenInfo = { job_title: string | null; number: string; live: boolean; state: string; views: string } | null;
const tokenCache = new Map<string, Promise<TokenInfo>>();
function tokenInfo(token: string): Promise<TokenInfo> {
  let p = tokenCache.get(token);
  if (!p) {
    p = fetch(`/api/proposals?token=${token}`).then((r) => r.json()).then((b) => (b?.link ?? null) as TokenInfo).catch(() => null);
    tokenCache.set(token, p);
  }
  return p;
}

/** Under a text with a proposal link in it. Nothing when the link isn't one of ours. */
export function ProposalChip({ text, isOut }: { text: string | null | undefined; isOut: boolean }) {
  const token = findProposalToken(text);
  const [info, setInfo] = useState<TokenInfo>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (token) void tokenInfo(token).then(setInfo); }, [token]);
  if (!token || !info) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-1.5 w-full text-left rounded px-2 py-1.5"
        style={{ background: isOut ? "rgba(18,22,26,0.07)" : T.card, border: `1px solid ${T.hair}`, color: "inherit", cursor: "pointer" }}>
        <div style={{ fontSize: 11.5, fontWeight: 600 }}>Proposal {info.number}{info.job_title ? ` · ${info.job_title}` : ""}</div>
        <div style={{ fontSize: 10.5, opacity: 0.8 }}>{info.live ? info.views : info.state} · <span style={{ textDecoration: "underline" }}>Preview</span></div>
      </button>
      {open && <ProposalPeek token={token} title={info.job_title} onClose={() => setOpen(false)} />}
    </>
  );
}

interface Sendable {
  job_id: string; job_title: string | null; contact_id: string | null; number: string; version: number; status: "draft" | "final"; total: number | null;
  link: { id: string; url: string; token: string; sent_at: string | null; views: string } | null;
}

/** Send a proposal from a thread: to this person, by text through Quo or by email from Coy's mail app. */
export function ProposalSendSheet({ contactId, name, phone, email, via: startVia, onClose, onSent }: {
  contactId: string; name: string | null; phone: string | null; email?: string | null; via: Via; onClose: () => void; onSent?: () => void;
}) {
  const [list, setList] = useState<Sendable[] | null>(null);
  const [examples, setExamples] = useState<SendExample[]>([]);
  const [org, setOrg] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [via, setVia] = useState<Via>(startVia);
  // Coy's own words once he types; until then, what the send starts from.
  const [typed, setWords] = useState<string | null>(null);
  const [typedSubject, setSubject] = useState<string | null>(null);
  const [link, setLink] = useState<LinkReply | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [peek, setPeek] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    fetch(`/api/proposals?contact=${contactId}`).then((r) => r.json()).then((b) => {
      if (off) return;
      if (b.error) { setErr(b.error); setList([]); return; }
      setList(b.proposals ?? []); setExamples(b.examples ?? []); setOrg(b.org ?? null);
      setJobId((b.proposals ?? [])[0]?.job_id ?? null);
    }).catch((e) => { if (!off) { setErr(String(e)); setList([]); } });
    return () => { off = true; };
  }, [contactId]);

  const job = list?.find((p) => p.job_id === jobId) ?? null;
  // The words start from how Coy sent the last one by this channel; {link} stays a placeholder until the link exists.
  const start = job ? startingWords(examples, via, { first: firstName(name), title: job.job_title, url: job.link?.url ?? "{link}", org }) : null;
  const words = typed ?? start?.body ?? "";
  const subject = typedSubject ?? start?.subject ?? "";
  const learned = !!start?.learned && typed === null;
  const pickJob = (id: string) => { setJobId(id); setLink(null); setWords(null); setSubject(null); setMsg(null); };
  const pickVia = (v: Via) => { setVia(v); setWords(null); setSubject(null); setMsg(null); };

  const ensure = async () => {
    if (link) return link;
    if (!job) throw new Error("Pick a proposal.");
    setBusy(job.status === "draft" ? `Freezing ${job.number} and making its link…` : "Making the link…");
    try { const r = await proposalLink(job.job_id); setLink(r); return r; } finally { setBusy(null); }
  };
  const preview = async () => {
    setMsg(null);
    try { await ensure(); setPeek(true); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
  };
  const send = async () => {
    if (!job) return;
    setMsg(null);
    try {
      const r = await ensure();
      setBusy(via === "text" ? "Sending through Quo…" : "Opening your mail…");
      const out = await sendProposal({ jobId: job.job_id, via, body: words, subject, contactId, contactName: name, email: email ?? null, link: r });
      setMsg(out);
      if (out.ok) { onSent?.(); if (via === "text") setTimeout(onClose, 1800); }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(null); }
  };

  const shown = link ? wordsFor(words, link, name) : words;
  const canText = !!phone;
  const seg = (on: boolean): React.CSSProperties => ({ height: 28, padding: "0 12px", fontFamily: disp, fontSize: F.xs, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", background: on ? T.ink : T.card, color: on ? T.card : T.ink2, border: "none", cursor: "pointer" });
  const btn = (main: boolean, on = true): React.CSSProperties => ({ height: 34, padding: "0 14px", borderRadius: 4, fontFamily: disp, fontSize: F.xs, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase",
    background: main ? T.hiviz : T.card, color: main ? T.onHiviz : T.ink, border: main ? "none" : `1px solid ${T.hairStrong}`, cursor: on ? "pointer" : "default", opacity: on ? 1 : 0.5 });

  return (
    <div className="fixed inset-0 sc-drawer z-[70] flex items-end lg:items-center justify-center" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div className="w-full lg:w-[520px] rounded-t-lg lg:rounded-lg flex flex-col" style={{ background: T.card, maxHeight: "92dvh" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Send a proposal">
        <div className="flex items-center gap-2 px-3" style={{ height: 46, borderBottom: `1px solid ${T.hair}` }}>
          <span style={{ ...eyebrow, color: T.ink }}>Send a proposal to {name || formatPhone(phone) || "them"}</span>
          <span className="flex-1" />
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card, color: T.ink2, fontSize: 17, cursor: "pointer" }}>×</button>
        </div>
        <div className="overflow-y-auto px-3 py-3 flex flex-col gap-3">
          {list === null ? <div style={{ fontSize: F.sm, color: T.ink3 }}>Finding their proposals…</div>
            : !list.length ? <div style={{ fontSize: F.sm, color: T.ink2 }}>{err ?? "None of their jobs has a proposal yet. Make one on the job's Proposal tab, then send it from here."}</div>
            : <>
                <label className="flex flex-col gap-1">
                  <span style={{ ...eyebrow, color: T.ink3 }}>Proposal</span>
                  <select value={jobId ?? ""} onChange={(e) => pickJob(e.target.value)} style={{ height: 34, border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card, color: T.ink, fontSize: F.sm, padding: "0 6px" }}>
                    {list.map((p) => (
                      <option key={p.job_id} value={p.job_id}>
                        {p.job_title ?? "Untitled job"} · {p.number} {p.status === "draft" ? "(draft — freezes when sent)" : ""}{p.total !== null ? ` · $${p.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : ""}
                      </option>
                    ))}
                  </select>
                  {job?.link && <span style={{ fontSize: F.xs, color: T.ink3 }}>{job.link.sent_at ? `Sent ${new Date(job.link.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ` : "Link made, not sent · "}{job.link.views}</span>}
                </label>
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded overflow-hidden" style={{ border: `1px solid ${T.hairStrong}` }}>
                    <button type="button" onClick={() => pickVia("text")} style={seg(via === "text")} aria-pressed={via === "text"}>Text</button>
                    <button type="button" onClick={() => pickVia("email")} style={{ ...seg(via === "email"), borderLeft: `1px solid ${T.hair}` }} aria-pressed={via === "email"}>Email</button>
                  </span>
                  <span style={{ fontSize: F.xs, color: T.ink3 }}>
                    {via === "text" ? (canText ? `Through Quo to ${formatPhone(phone)}` : "They have no number to text") : email ? `Opens your mail to ${email}` : "Opens your mail — no email on file"}
                  </span>
                </div>
                {via === "email" && (
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject"
                    style={{ height: 34, border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card, color: T.ink, fontSize: F.sm, padding: "0 8px" }} />
                )}
                <label className="flex flex-col gap-1">
                  <span style={{ ...eyebrow, color: T.ink3 }}>The words{learned ? " · from how you sent the last one" : ""}</span>
                  <textarea value={shown} onChange={(e) => setWords(e.target.value)} rows={5}
                    style={{ border: `1px solid ${T.hair}`, borderRadius: 4, background: T.card, color: T.ink, fontSize: F.sm, lineHeight: 1.4, padding: "6px 8px", resize: "vertical", fontFamily: "inherit" }} />
                  <span style={{ fontSize: F.xs, color: T.ink3 }}>
                    {link ? "" : "{link} becomes the proposal's link. "}
                    {via === "text" ? `${segments(shown.replace("{link}", "https://scopecrete.ai/p/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"))} segment(s). ` : ""}Your changes are kept — the next one starts from them, and Dusty learns your way.
                  </span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => void send()} disabled={!!busy || (via === "text" && !canText)} style={btn(true, !busy && (via === "email" || canText))}>
                    {via === "text" ? "Send text" : "Email it"}
                  </button>
                  <button type="button" onClick={() => void preview()} disabled={!!busy} style={btn(false, !busy)}>Preview</button>
                  {link && <button type="button" onClick={() => void navigator.clipboard.writeText(link.link.url).catch(() => {})} style={btn(false)}>Copy link</button>}
                </div>
                {job?.status === "draft" && !link && <div style={{ fontSize: F.xs, color: T.ink3 }}>{job.number} is a draft: Preview or Send freezes it as that version, as the proposal&apos;s own Preview does.</div>}
                {busy && <div style={{ fontSize: F.xs, color: T.ink2 }}>{busy}</div>}
                {msg && <div style={{ fontSize: F.xs, color: msg.ok ? T.green : T.red }}>{msg.text}</div>}
              </>}
        </div>
      </div>
      {peek && link && <ProposalPeek token={link.link.token} title={job?.job_title} onClose={() => setPeek(false)} />}
    </div>
  );
}
