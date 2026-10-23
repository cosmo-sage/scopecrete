"use client";

/**
 * A job's bids (migration 091; Vendors v2 · V3, the what-first door): every
 * bid request sent on this job, each vendor's answer side by side, and Get
 * bids — the composer with this job filled in and vendors suggested, subs and
 * best responders first. On the job's Summary. A request taps open (Coy,
 * 2026-10-09: "resend a bid request or check on the status by clicking into
 * a bid request from the summary page"): each vendor's sent / delivered /
 * opened / answered, and Resend · Email · Copy link · Their page.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { T, F, eyebrow, nums, clip, money, formatPhone } from "@/lib/v34/tokens";
import { call } from "@/components/v34/cost-cards";
import { Drawer } from "@/components/v34/primitives";
import { InitialsBox } from "@/components/v34/thread-list";
import { BidComposer, chip } from "@/components/v34/bids/bid-composer";
import { waitForDelivery } from "@/components/v34/bids/delivery";
import { GROUP_LABEL, budgetUnitCost, compareBids, hoursLabel, type PriceLine, type ShownScope } from "@/lib/bids";

interface Rec {
  id: string; contact_id: string; name: string; url: string; sent_at: string | null; opened_at: string | null; view_count: number;
  answered_at: string | null; price_total: number | null; price_lines: PriceLine[] | null; answer_note: string | null; revoked_at: string | null;
  sent_via?: string[] | null; last_viewed_at?: string | null;
}
interface Req { id: string; price_mode: string; price_by: string | null; scopes: ShownScope[]; created_at: string; recipients: Rec[] }

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const lineSum = (ls: PriceLine[] | null) => (ls ?? []).reduce((t, l) => t + (l.qty ?? 1) * l.price, 0);

export function JobBids({ jobId, card }: { jobId: string; card: React.CSSProperties }) {
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const openReq = reqs?.find((r) => r.id === openId) ?? null;
  useEffect(() => {
    let off = false;
    call(`/api/bid-requests?job=${jobId}`, "GET").then((b) => { if (!off) { setReqs(b.requests as Req[]); setMissing(b.missing ?? null); } }).catch(() => { if (!off) setReqs([]); });
    return () => { off = true; };
  }, [jobId, tick]);

  return (
    <section aria-label="Bids" className="px-3 py-2.5" style={card}>
      <div className="flex items-baseline gap-2">
        <span style={eyebrow}>Bids from subs &amp; suppliers</span>
        <span className="flex-1" />
        <button onClick={() => setComposing(true)} style={{ ...eyebrow, color: T.chalk, cursor: "pointer" }}>Get bids →</button>
      </div>
      {missing && <div style={{ fontSize: F.xs, color: T.sun, marginTop: 4 }}>{missing}</div>}
      {note && <div className="rounded px-2 py-1 mt-2 flex gap-2" style={{ fontSize: F.xs, background: T.greenDim }}><span style={{ flex: 1 }}>{note}</span><button onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {reqs === null ? <div className="rounded animate-pulse mt-2" style={{ height: 32, background: T.hairSoft }} />
        : reqs.length === 0 ? (
          <div style={{ fontSize: F.sm, color: T.ink2, marginTop: 6, lineHeight: 1.5 }}>
            None sent.
          </div>
        ) : reqs.map((r) => (
          <div key={r.id} role="button" tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(r.id); } }}
            className="mt-2 pt-2" style={{ borderTop: `1px solid ${T.hairSoft}`, cursor: "pointer" }} title="Open this bid request">
            <div className="flex items-baseline gap-2">
              <div style={{ fontSize: F.xs, color: T.ink3, flex: 1, minWidth: 0, ...clip }}>
                {day(r.created_at)} · {r.scopes.map((s) => s.title).join(" · ")}{r.price_by ? ` · price by ${day(`${r.price_by}T12:00:00`)}` : ""}
              </div>
              <span style={{ fontSize: F.xs, color: T.chalk, fontWeight: 600, whiteSpace: "nowrap" }}>Status · Resend ›</span>
            </div>
            {[...r.recipients].sort((a, b) => Number(!!b.answered_at) - Number(!!a.answered_at) || (a.price_total ?? Infinity) - (b.price_total ?? Infinity)).map((x) => {
              const total = x.price_total !== null ? Number(x.price_total) : x.price_lines ? lineSum(x.price_lines) : null;
              const st = x.revoked_at ? "link off" : x.answered_at ? `answered${x.sent_at ? ` in ${hoursLabel((Date.parse(x.answered_at) - Date.parse(x.sent_at)) / 3_600_000)}` : ""}`
                : x.sent_at ? (x.opened_at ? "opened · no price yet" : "sent · not opened") : "not sent";
              return (
                <div key={x.id} className="flex items-center gap-2 py-1">
                  <Link href={`/dashboard/vendors/${x.contact_id}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: F.sm, fontWeight: 600, color: T.ink, flex: 1, minWidth: 0, ...clip }}>{x.name}</Link>
                  <span style={{ fontSize: F.xs, color: x.answered_at ? T.green : T.ink3, whiteSpace: "nowrap" }}>{st}</span>
                  <span style={{ ...nums, fontSize: F.sm, fontWeight: 600, width: 96, textAlign: "right", color: total !== null ? T.ink : T.ink3 }}>{total !== null && x.answered_at ? money(total) : "—"}</span>
                </div>
              );
            })}
          </div>
        ))}
      {openReq && <RequestSheet jobId={jobId} req={openReq} onClose={() => setOpenId(null)} onChanged={() => setTick((n) => n + 1)} />}
      {composing && <BidComposer open jobId={jobId} from="Started from the job" onClose={() => setComposing(false)} onDone={(m) => { setNote(m); setTick((n) => n + 1); }} />}
    </section>
  );
}

// ------------------------------------------------------------------ one request

interface Resend { phone: string | null; email: string | null; url: string; text: string; email_parts: { subject: string; body: string }; delivered: { to: string | null; at: string } | null }

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

function RequestSheet({ jobId, req, onClose, onChanged }: { jobId: string; req: Req; onClose: () => void; onChanged: () => void }) {
  const [info, setInfo] = useState<Record<string, Resend | { error: string }>>({});
  const [live, setLive] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    for (const x of req.recipients) {
      call(`/api/bid-requests/recipients/${x.id}`, "GET")
        .then((b) => { if (!off) setInfo((m) => ({ ...m, [x.id]: b as Resend })); })
        .catch((e) => { if (!off) setInfo((m) => ({ ...m, [x.id]: { error: e instanceof Error ? e.message : String(e) } })); });
    }
    return () => { off = true; };
  }, [req]);

  const say = (id: string, t: string) => setLive((m) => ({ ...m, [id]: t }));
  // Coy's tap: the same words and link, through Quo, then wait for Quo's delivery.
  const resend = async (x: Rec, r: Resend) => {
    setBusy(x.id); say(x.id, "Texting…");
    try {
      const t = await call("/api/texts", "POST", { contact_id: x.contact_id, body: r.text });
      await call(`/api/bid-requests/recipients/${x.id}`, "PATCH", { sent: "text" }).catch(() => null);
      const to = formatPhone((t.to as string | null) ?? r.phone);
      say(x.id, `Sent again to ${to} · waiting for Quo to deliver…`);
      onChanged();
      if (typeof t.quo_id === "string") {
        void waitForDelivery(t.quo_id).then((ok) => say(x.id, ok ? `Delivered to ${to} ✓` : `Quo took it but hasn't delivered it to ${to} — check the number on their page`));
      }
    } catch (e) { say(x.id, `Text failed: ${e instanceof Error ? e.message : String(e)}`); } finally { setBusy(null); }
  };
  const mail = (x: Rec, r: Resend) => {
    window.location.assign(`mailto:${encodeURIComponent(r.email ?? "")}?subject=${encodeURIComponent(r.email_parts.subject)}&body=${encodeURIComponent(r.email_parts.body)}`);
    void call(`/api/bid-requests/recipients/${x.id}`, "PATCH", { sent: "email" }).then(() => { say(x.id, "Email opened ✓"); onChanged(); }).catch(() => {});
  };

  const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.hair}`, borderRadius: 4, padding: "10px 12px" };
  const line = (t: string, color: string = T.ink2) => <div style={{ fontSize: F.xs, color, lineHeight: 1.45 }}>{t}</div>;
  return (
    <Drawer open onClose={onClose} title="Bid request" sub={`${day(req.created_at)} · ${req.recipients.length} vendor${req.recipients.length === 1 ? "" : "s"}`} wide>
      <div className="p-4 flex flex-col gap-2" style={{ maxWidth: 760 }}>
        <div style={{ fontSize: F.sm, color: T.ink2 }}>
          {req.scopes.map((s) => `${s.title}${s.size ? ` (${s.size})` : ""}`).join(" · ")}{req.price_by ? ` · price by ${day(`${req.price_by}T12:00:00`)}` : ""}
        </div>
        {req.recipients.some((x) => x.answered_at && !x.revoked_at) && <CompareBids jobId={jobId} req={req} />}
        {req.recipients.map((x) => {
          const r = info[x.id];
          const ok = r && !("error" in r) ? r : null;
          const total = x.price_total !== null ? Number(x.price_total) : x.price_lines ? lineSum(x.price_lines) : null;
          const via = (x.sent_via ?? []).join(" and ");
          return (
            <div key={x.id} className="flex flex-col gap-1.5" style={card}>
              <div className="flex items-center gap-2">
                <InitialsBox name={x.name} size={28} />
                <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: F.sm, ...clip }}>{x.name}</div>
                {x.answered_at && total !== null && <span style={{ ...nums, fontSize: F.sm, fontWeight: 700, color: T.green }}>{money(total)}</span>}
              </div>
              {x.revoked_at && line(`Link turned off ${when(x.revoked_at)} — they see that it's off.`, T.red)}
              {line(x.sent_at ? `Sent ${when(x.sent_at)}${via ? ` by ${via}` : ""}` : "Not sent yet", x.sent_at ? T.ink2 : T.sun)}
              {ok && x.sent_at && (x.sent_via ?? []).includes("text") && line(
                ok.delivered ? `Delivered to ${formatPhone(ok.delivered.to ?? "")} ✓ ${when(ok.delivered.at)}` : "No delivered text from Quo yet — check their number before resending",
                ok.delivered ? T.green : T.sun)}
              {line(x.opened_at ? `Opened ${x.view_count || 1} time${(x.view_count || 1) === 1 ? "" : "s"} · first ${when(x.opened_at)}${x.last_viewed_at && x.view_count > 1 ? ` · last ${when(x.last_viewed_at)}` : ""}` : "Not opened yet")}
              {x.answered_at && line(`Answered ${when(x.answered_at)}${x.sent_at ? ` (in ${hoursLabel((Date.parse(x.answered_at) - Date.parse(x.sent_at)) / 3_600_000)})` : ""}${x.answer_note ? ` — “${x.answer_note}”` : ""}`, T.green)}
              {r && "error" in r && line(r.error, T.red)}
              {live[x.id] && line(live[x.id], live[x.id].startsWith("Delivered") ? T.green : live[x.id].startsWith("Text failed") || live[x.id].startsWith("Quo took") ? T.red : T.ink)}
              <div className="flex gap-1.5 flex-wrap mt-0.5">
                {!x.revoked_at && <button disabled={!ok?.phone || busy === x.id} onClick={() => ok && void resend(x, ok)} title={ok && !ok.phone ? "No phone on their page" : `Text ${ok?.phone ? formatPhone(ok.phone) : ""} the same link through Quo`} style={chip(true, !ok?.phone || busy === x.id)}>{x.sent_at ? "Resend text" : "Send text"}{ok?.phone ? ` · ${formatPhone(ok.phone)}` : ""}</button>}
                {!x.revoked_at && ok?.email && <button onClick={() => mail(x, ok)} style={chip(false)}>Email ↗</button>}
                <button onClick={() => void navigator.clipboard?.writeText(ok?.url ?? x.url).then(() => say(x.id, "Link copied"))} style={chip(false)}>Copy link</button>
                <a href={ok?.url ?? x.url} target="_blank" rel="noreferrer" style={{ ...chip(false), display: "inline-flex", alignItems: "center", textDecoration: "none" }}>See their page</a>
                <Link href={`/dashboard/vendors/${x.contact_id}`} style={{ ...chip(false), display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Vendor ›</Link>
              </div>
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------ side by side

/**
 * The answers side by side (Claude Design "Bid requests" 1f): every line with each vendor's price per
 * unit and what it comes to, a missing price red, a price under 60% of the others' marked LOW; each
 * section's total per vendor, tapped to pick that vendor for it (the cheapest complete one to start); and
 * **Fill the budget** — the picked vendors' prices become those lines' unit costs on the Proposed budget,
 * on Coy's two taps. Nothing is written before that.
 */
function CompareBids({ jobId, req }: { jobId: string; req: Req }) {
  const answered = req.recipients.filter((x) => x.answered_at && !x.revoked_at);
  const cmp = React.useMemo(() => compareBids(req.scopes, answered.map((x) => ({
    id: x.id, name: x.name, lines: x.price_lines, total: x.price_total !== null ? Number(x.price_total) : null,
  }))), [req.scopes, answered]);
  const [picks, setPicks] = useState<Record<string, number>>(() =>
    Object.fromEntries(cmp.sections.filter((s) => s.low !== null).map((s) => [s.key, s.low as number])));
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const wide = cmp.vendors.length;
  const chosen = cmp.sections.filter((s) => picks[s.key] !== undefined && s.totals[picks[s.key]] !== null);
  const pickTotal = chosen.reduce((t, s) => t + (s.totals[picks[s.key]] ?? 0), 0);
  const nLines = chosen.reduce((t, s) => t + s.lines.filter((l) => l.cells[picks[s.key]].unit !== null).length, 0);

  const fill = async () => {
    setBusy(true); setMsg(null);
    try {
      // The budget lines' own quantities, for a line sent with no quantity (days, one price).
      const job = await call(`/api/bid-requests/compose?job=${jobId}`, "GET").catch(() => null);
      const qty = new Map<string, number | null>(((job?.job?.scopes ?? []) as Array<{ lines: Array<{ id: string; qty: number | null }> }>).flatMap((s) => s.lines.map((l) => [l.id, l.qty] as [string, number | null])));
      let done = 0, gone = 0;
      for (const s of chosen) {
        const i = picks[s.key];
        for (const l of s.lines) {
          const u = l.cells[i].unit;
          if (u === null) continue;
          try { await call(`/api/jobs/${jobId}/budget/lines/${l.key}`, "PATCH", { unit_cost: budgetUnitCost(l, u, qty.get(l.key) ?? null) }); done += 1; } catch { gone += 1; }
        }
      }
      setMsg({ text: `${done} budget line${done === 1 ? "" : "s"} now carry the picked vendors' prices${gone ? ` · ${gone} couldn't be changed (taken off the budget since)` : ""}. Open the Proposed budget to see them.`, bad: done === 0 });
      setAsking(false);
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }); } finally { setBusy(false); }
  };

  const th: React.CSSProperties = { padding: "6px 8px", fontSize: F.xs, textAlign: "right", whiteSpace: "nowrap", borderBottom: `1px solid ${T.hair}` };
  const td: React.CSSProperties = { padding: "5px 8px", fontSize: F.xs, textAlign: "right", whiteSpace: "nowrap", borderTop: `1px solid ${T.hairSoft}`, ...nums };
  const first: React.CSSProperties = { textAlign: "left", position: "sticky", left: 0, background: T.card, zIndex: 1, minWidth: 180, maxWidth: 260, whiteSpace: "normal" };
  return (
    <section style={{ background: T.card, border: `1px solid ${T.hair}`, borderRadius: 4 }}>
      <div className="flex items-baseline gap-2 px-3 pt-2.5 pb-1">
        <span style={eyebrow}>Side by side</span>
        <span style={{ fontSize: F.xs, color: T.ink3, flex: 1 }}>Tap a section&apos;s total to pick that vendor for it</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: 260 + wide * 130 }}>
          <thead>
            <tr>
              <th style={{ ...th, ...first, zIndex: 2 }}>Line</th>
              <th style={th}>Qty</th>
              {cmp.vendors.map((v, i) => <th key={v.id} style={{ ...th, fontWeight: 700, color: T.ink }}>{v.name}{!cmp.perLine[i] ? <div style={{ fontWeight: 400, color: T.ink3 }}>one number</div> : null}</th>)}
            </tr>
          </thead>
          <tbody>
            {cmp.sections.map((s) => {
              let lastGroup: string | null = null;
              return (
                <React.Fragment key={s.key}>
                  <tr>
                    <td colSpan={2} style={{ ...td, ...first, background: T.sunk, fontWeight: 700, fontSize: F.sm, color: T.ink }}>{s.title}{s.size ? <span style={{ fontWeight: 400, color: T.ink3 }}> · {s.size}</span> : null}</td>
                    {cmp.vendors.map((v, i) => {
                      const t = s.totals[i], on = picks[s.key] === i;
                      return (
                        <td key={v.id} style={{ ...td, background: on ? T.hivizDim : T.sunk, padding: 0 }}>
                          <button disabled={t === null} onClick={() => setPicks({ ...picks, [s.key]: i })} title={t === null ? undefined : `Pick ${v.name} for ${s.title}`}
                            style={{ width: "100%", padding: "6px 8px", textAlign: "right", fontWeight: 700, fontSize: F.sm, color: t === null ? T.ink3 : T.ink, cursor: t === null ? "default" : "pointer", background: "none", border: on ? `1.5px solid ${T.hiviz}` : "1.5px solid transparent", ...nums }}>
                            {on ? "✓ " : ""}{t === null ? "—" : money(t)}
                            {t !== null && !s.full[i] && <div style={{ fontWeight: 400, fontSize: 10.5, color: T.red }}>not every line</div>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                  {s.lines.map((l) => {
                    const band = l.group && l.group !== lastGroup ? l.group : null;
                    lastGroup = l.group;
                    return (
                      <React.Fragment key={l.key}>
                        {band && <tr><td colSpan={2 + wide} style={{ ...td, ...first, maxWidth: "none", fontFamily: "var(--sc-font-disp)", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: T.ink3, fontSize: 10.5 }}>{GROUP_LABEL[band]}</td></tr>}
                        <tr>
                          <td style={{ ...td, ...first, color: l.supplied ? T.ink3 : T.ink }}>{l.name}{l.supplied ? " · we supply" : ""}</td>
                          <td style={{ ...td, color: T.ink3 }}>{l.qty !== null ? `${l.qty.toLocaleString("en-US")} ${l.unit ?? ""}` : "one price"}</td>
                          {l.cells.map((c, i) => (
                            <td key={i} style={{ ...td, background: c.missing ? T.redDim : c.low ? T.hivizDim : undefined }}>
                              {c.unit === null ? <span style={{ color: c.missing ? T.red : T.ink3 }}>{c.missing ? "missing" : l.supplied ? "" : "—"}</span> : (
                                <>
                                  <div style={{ fontWeight: 600 }}>{money(c.ext as number)}{c.low && <span style={{ marginLeft: 4, fontSize: 9.5, fontWeight: 700, color: T.hivizText }}>LOW</span>}</div>
                                  {l.qty !== null && <div style={{ color: T.ink3, fontSize: 10.5 }}>{money(c.unit)}/{l.unit ?? "ea"}</div>}
                                </>
                              )}
                            </td>
                          ))}
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
            <tr>
              <td colSpan={2} style={{ ...td, ...first, fontWeight: 700, fontSize: F.sm, borderTop: `2px solid ${T.ink}` }}>Whole bid</td>
              {cmp.totals.map((t, i) => <td key={i} style={{ ...td, fontWeight: 700, fontSize: F.sm, borderTop: `2px solid ${T.ink}`, color: cmp.low === i ? T.green : T.ink }}>{t === null ? "—" : money(t)}{cmp.low === i ? " · low" : ""}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 flex-wrap px-3 py-2.5" style={{ borderTop: `1px solid ${T.hair}` }}>
        <span style={{ fontSize: F.sm, flex: 1, minWidth: 180 }}>
          {chosen.length ? <>Your picks: <b style={nums}>{money(pickTotal)}</b> · {chosen.map((s) => `${s.title} → ${cmp.vendors[picks[s.key]].name}`).join(" · ")}</> : "No section priced by line yet — a one-number bid can't fill budget lines."}
        </span>
        {asking ? (
          <>
            <span style={{ fontSize: F.xs, color: T.ink2 }}>Their prices become the unit cost on {nLines} budget line{nLines === 1 ? "" : "s"}.</span>
            <button disabled={busy} onClick={() => void fill()} style={{ ...chip(true, busy), background: T.hiviz, borderColor: T.hiviz, color: T.onHiviz }}>{busy ? "Filling…" : "Yes, fill them"}</button>
            <button onClick={() => setAsking(false)} style={chip(false)}>Not yet</button>
          </>
        ) : (
          <button disabled={!nLines} onClick={() => setAsking(true)} style={chip(true, !nLines)}>Fill the Proposed budget</button>
        )}
      </div>
      {msg && <div className="px-3 pb-2.5" style={{ fontSize: F.xs, color: msg.bad ? T.red : T.green }}>{msg.text}</div>}
    </section>
  );
}
