"use client";

/**
 * The ScopeCrete admin (migration 092; Coy, 2026-10-08, the Claude Design
 * "Super Admin" package). Ten screens over every company on ScopeCrete:
 * Pulse · Companies (and one company's eight tabs) · Pipelines · Dusty ·
 * Usage · Feedback · Releases · Costs · Admin log.
 *
 * Counts, not content (DECISIONS §7): the sc_admin_* functions return numbers,
 * states, dates and pipeline errors — never a customer's name, text or file.
 * What isn't recorded yet (AI cost per call, app errors, page views, deploy
 * history, billing) says so instead of showing made-up numbers, and the
 * design's Pause, View as, feature switches and AI caps aren't built.
 *
 * The writes — Replay, Publish / Not planned, New company — each ask for a
 * reason and land in the admin log (admin_audit).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader, OrgNameContext, MenuButton, SlideDrawer } from "@/components/v34/primitives";
import { useWide } from "@/lib/v34/use-wide";
import {
  alarms as findAlarms, companyStatus, companyHealth, riskLine, setupCount, stepDone, workerState, workerLimitMin,
  SETUP_STEPS, SCREENS, STATUS_LABEL, PARTS, RANGES, WORKER_LABEL, PLAN_LIMITS,
  readRange, readScreen, planLabel, bytes, ago, day, dayGap, dropPct,
  type AdminCompany, type AdminRange, type AdminScreen, type AdminWorker, type Alarm, type PlatformUse,
} from "@/lib/admin";
import { BOARD, statusLabel, type RoadmapItem } from "@/lib/roadmap";
import {
  ICONS, Ico, Panel, Tile, Dot, Tag, Bar, Spark, DayBars, Conveyor, Empty, BarRow, Confirm, NewCompany, OwnerLink, useToast,
  type ConfirmAsk,
} from "./admin-ui";
import "@/styles/admin.css";

// ------------------------------------------------------------------ data shapes

interface Pipelines {
  quo: { received: number; filed: number; errors: number; median_ms: number | null };
  messages: number; drift: number; defects: number; read_contacts: number;
  email: { events: number; event_errors: number; stored: number; exact: number; suggested: number; by_hand: number; unfiled: number; quarantined: number };
  bids: { opened: number; filed: number; not_a_bid: number; in_flight: number; undone: number; median_s: number | null };
  stuck: Array<{ id: string; org_id: string; state: string; error: string | null; attempts: number | null; since: string }>;
  files: { waiting: number; read: number; skipped: number; failed: number; uploaded: number; from_email: number; from_texts: number };
  skip_reasons: Array<{ reason: string; n: number }>;
  reader: Array<{ org_id: string; runs: number; named: number; suggested: number; unchanged: number; errors: number; median_s: number | null; queue: number }>;
  workers: AdminWorker[];
}
interface Failure { at: string; org_id: string | null; pipeline: string; error: string | null; replay_id: string | null }
interface DustyData {
  agreement: Array<{ org_id: string; bucket: string; guesses: number; agreed: number; streak: number }>;
  auto_moved: number; auto_filed: number; names_kept: number; names_undone: number;
  questions: number; answers: number; chats: number; askers: number;
  by_context: Array<{ kind: string; n: number }>; per_org: Array<{ org_id: string; questions: number }>;
  reader_errors: number; reader_runs: number; files_read: number; dreams: number;
}
type Made = Record<string, number> & { org_id: string };
interface UsageData {
  made: Made[];
  funnel: { inbound: number; customers: number; jobs: number; priced: number; sent: number; opened: number; won: number };
  active: Array<{ role: string; active: number; total: number }>;
}
interface Platform extends PlatformUse { migrations: Array<{ version: string; name: string | null }> }
interface LogRow { id: string; at: string; admin: string | null; action: string; org_id: string | null; detail: string | null; reason: string | null }
interface People {
  members: Array<{ name: string; email: string; role: string; joined: string; last_sign_in: string | null; last_question: string | null; questions_30d: number }>;
  invites: Array<{ email: string; role: string; sent: string; expires: string }>;
}
interface Build { env: string; branch: string | null; sha: string | null; message: string | null; url: string | null }
interface Data {
  companies?: AdminCompany[]; people?: People; pipelines?: Pipelines; failures?: Failure[]; dusty?: DustyData;
  usage?: UsageData; platform?: Platform; log?: LogRow[]; build?: Build; missing?: boolean;
}

async function call(url: string, method = "GET", body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
  return b;
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const plural = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString()} ${k === 1 ? one : many}`;
const FUNNEL_STEPS: Array<[keyof UsageData["funnel"], string]> = [
  ["inbound", "People who called or texted"], ["customers", "Filed as customer"], ["jobs", "Jobs made"],
  ["priced", "Budgets priced"], ["sent", "Proposals sent"], ["opened", "Proposals opened"], ["won", "Won"],
];
const MADE_COLS: Array<[string, string]> = [
  ["threads_filed", "People filed"], ["texts_sent", "Texts sent"], ["jobs", "Jobs"], ["takeoffs", "Takeoffs"],
  ["budget_lines", "Budget lines"], ["proposals", "Proposals"], ["proposals_sent", "Sent"], ["price_book", "Price book edits"],
  ["vendors", "Vendors"], ["files", "Uploads"], ["dusty", "Dusty"], ["notes", "Notes"], ["customers", "Customers"], ["feedback", "Feedback"],
];
const ROLE: Record<string, string> = { owner: "Owners", member: "Members", field: "Onsite estimators", billing: "Billing" };

// ------------------------------------------------------------------ the app

export function AdminApp() {
  const [screen, setScreen] = useState<AdminScreen>("pulse");
  const [co, setCo] = useState<string>("all");
  const [detail, setDetail] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [range, setRange] = useState<AdminRange>("today");
  const [data, setData] = useState<Data | null>(null);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [items, setItems] = useState<RoadmapItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [ask, setAsk] = useState<ConfirmAsk | null>(null);
  const [newCo, setNewCo] = useState(false);
  const [ownerFor, setOwnerFor] = useState<{ org: string; name: string; email: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const [ready, setReady] = useState(false);
  const [toast, say] = useToast();
  const [measure, wide] = useWide<HTMLDivElement>(900);
  const now = useMemo(() => new Date(), [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // The address carries the view, so a screen can be linked and survives a reload.
  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => {
      if (off) return;
      const sp = new URLSearchParams(window.location.search);
      setScreen(readScreen(sp.get("s")));
      if (sp.get("co")) setCo(sp.get("co")!);
      if (sp.get("id")) setDetail(sp.get("id"));
      if (sp.get("tab")) setTab(sp.get("tab")!);
      setRange(readRange(sp.get("range")));
      setReady(true);
    });
    return () => { off = true; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const sp = new URLSearchParams();
    if (screen !== "pulse") sp.set("s", screen);
    if (co !== "all") sp.set("co", co);
    if (screen === "company" && detail) { sp.set("id", detail); if (tab !== "overview") sp.set("tab", tab); }
    if (range !== "today") sp.set("range", range);
    const q = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  }, [ready, screen, co, detail, tab, range]);

  const org = screen === "company" ? detail : co !== "all" ? co : null;
  useEffect(() => {
    if (!ready) return;
    let off = false;
    const parts = PARTS[screen];
    const qs = new URLSearchParams({ parts: parts.join(","), range });
    if (org) qs.set("org", org);
    Promise.resolve().then(() => { if (!off) setLoading(true); });
    fetch(`/api/admin?${qs}`).then(async (r) => {
      const b = await r.json().catch(() => ({}));
      if (off) return;
      if (r.status === 403) { setForbidden(true); setLoading(false); return; }
      if (!r.ok) throw new Error(b?.error || `HTTP ${r.status}`);
      setData(b as Data); setErr(null); setLoading(false);
      if (Array.isArray(b.companies)) setCompanies(b.companies as AdminCompany[]);
    }).catch((e) => { if (!off) { setErr(e instanceof Error ? e.message : String(e)); setLoading(false); } });
    return () => { off = true; };
  }, [ready, screen, org, range, tick]);

  // Feedback comes from the Roadmap's own reads (084); an admin sees every item.
  const needItems = screen === "pulse" || screen === "feedback" || (screen === "company" && tab === "feedback");
  useEffect(() => {
    if (!needItems) return;
    let off = false;
    call("/api/roadmap").then((b) => { if (!off) setItems((b.items ?? []) as RoadmapItem[]); }).catch(() => { if (!off) setItems([]); });
    return () => { off = true; };
  }, [needItems, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const go = useCallback((s: AdminScreen, id?: string | null) => {
    setScreen(s); setMenu(false);
    if (s === "company" && id) { setDetail(id); setTab("overview"); }
    else if (id) setCo(id);
    window.scrollTo(0, 0);
  }, []);

  const coName = useCallback((id: string | null | undefined) => companies.find((c) => c.id === id)?.name ?? (id ? "A company" : "Platform"), [companies]);
  const scoped = co === "all" ? companies : companies.filter((c) => c.id === co);
  const al = useMemo(() => data ? findAlarms(screen === "company" ? companies.filter((c) => c.id === detail) : scoped,
    data.pipelines?.workers ?? [], data.platform ?? null, now) : [], [data, scoped, companies, detail, screen, now]);
  const [redCount, setRedCount] = useState(0);
  useEffect(() => {
    if (screen !== "pulse" || !data?.companies) return;
    const r = al.filter((a) => a.sev === "r").length;
    Promise.resolve().then(() => setRedCount(r));
  }, [al, screen, data]);

  const replay = (f: Failure) => setAsk({
    title: "Replay this event?", ok: "Replay",
    what: <>Files the {f.pipeline.toLowerCase()} event again through the projection. The dedupe index stops a second message.</>,
    who: coName(f.org_id),
    run: async (reason) => {
      const r = await call("/api/admin", "POST", { action: "replay", event: f.replay_id, reason });
      reload();
      return r.ok ? "Replayed — it filed this time" : `Replayed — still failing: ${r.error}`;
    },
  });
  const decide = (it: RoadmapItem, status: "considering" | "declined") => setAsk({
    title: status === "declined" ? "Mark not planned?" : "Publish to the Roadmap?",
    ok: status === "declined" ? "Not planned" : "Publish", danger: status === "declined",
    what: status === "declined" ? <>&ldquo;{it.title}&rdquo; leaves the inbox; nobody but the writer sees it.</>
      : <>&ldquo;{it.title}&rdquo; goes on the board under Under consideration, for every company to see and vote on. Reword it on the Roadmap first if it names a customer.</>,
    who: it.org_name ?? "—",
    run: async (reason) => {
      await call("/api/admin", "POST", { action: "feedback", item: it.id, status, reason });
      reload();
      return status === "declined" ? "Marked not planned" : "Published";
    },
  });

  if (forbidden) {
    return (
      <div className="adm" style={{ padding: 16 }}>
        <Empty title="Only a ScopeCrete admin can open this">This page shows every company on ScopeCrete. It is for the people who run ScopeCrete itself.</Empty>
      </div>
    );
  }

  const meta = screen === "company" ? { label: "Company", q: "" } : SCREENS.find((s) => s.k === screen)!;
  const navOn = (k: string) => screen === k || (screen === "company" && k === "companies");
  const showPicker = screen !== "company" && screen !== "releases";
  const showRange = !["company", "releases", "costs", "log", "feedback"].includes(screen) || (screen === "company" && ["overview", "pipelines", "dusty", "usage"].includes(tab));
  const controls = (
    <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
      {showPicker && (
        <label className="pick" title="Show one company">
          <select aria-label="Company" value={co} onChange={(e) => setCo(e.target.value)}
            style={{ border: 0, background: "none", font: "inherit", color: "inherit", outline: 0, maxWidth: 180, cursor: "pointer" }}>
            <option value="all">All companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      {showRange && (
        <div className="seg" role="group" aria-label="Time range">
          {RANGES.map((r) => <button key={r.k} className={range === r.k ? "on" : ""} onClick={() => setRange(r.k)}>{r.label}</button>)}
        </div>
      )}
    </div>
  );

  const nav = SCREENS.map((s) => (
    <button key={s.k} className={wide ? `ri${navOn(s.k) ? " on" : ""}` : navOn(s.k) ? "on" : ""} onClick={() => go(s.k)} aria-current={navOn(s.k) ? "page" : undefined}>
      <Ico d={ICONS[s.k]} />{s.label}
      {s.k === "pulse" && redCount > 0 && <span className="bd">{redCount}</span>}
    </button>
  ));

  const d = data ?? {};
  let body: React.ReactNode;
  if (err) body = <Empty title="Couldn't load">{err}</Empty>;
  else if (d.missing) body = (
    <Empty title="Waiting for migration 092">
      The admin reads every company through named database functions that check you are a ScopeCrete admin. They&apos;re in
      migrations/092_platform_admin.sql — say &ldquo;apply 092&rdquo; and this page fills in.
    </Empty>
  );
  else if (!data || (loading && !data.build)) body = <div className="spin">Loading…</div>;
  else if (screen === "pulse") body = <Pulse d={d} cos={scoped} alarms={al} items={items} range={range} now={now} go={go} coName={coName} />;
  else if (screen === "companies") body = <Companies cos={companies} now={now} go={go} onNew={() => setNewCo(true)} />;
  else if (screen === "company") {
    const c = companies.find((x) => x.id === detail);
    body = c ? <Company c={c} d={d} tab={tab} setTab={setTab} alarms={al} items={items} now={now} go={go} coName={coName} replay={replay} decide={decide}
      ownerLink={(email) => setOwnerFor({ org: c.id, name: c.name, email })} />
      : <Empty title="No such company">It may have been removed. <a href="#" onClick={(e) => { e.preventDefault(); go("companies"); }}>All companies ›</a></Empty>;
  }
  else if (screen === "pipelines") body = <PipelinesView d={d} cos={scoped} now={now} go={go} coName={coName} replay={replay} />;
  else if (screen === "dusty") body = <DustyView d={d} cos={scoped} />;
  else if (screen === "usage") body = <UsageView d={d} cos={scoped} />;
  else if (screen === "feedback") body = <FeedbackView items={items} cos={scoped} all={co === "all"} decide={decide} />;
  else if (screen === "releases") body = <Releases d={d} />;
  else if (screen === "costs") body = <Costs d={d} cos={scoped} />;
  else body = <LogView rows={d.log ?? []} go={go} coName={coName} />;

  return (
    <OrgNameContext.Provider value="ScopeCrete">
      <div className="adm" ref={measure}>
        <PageHeader dusty={false} title={meta.label} sub={meta.q || undefined}
          menu={wide ? undefined : <MenuButton onClick={() => setMenu(true)} label="Admin screens" />}
          actions={wide ? controls : undefined}>
          {!wide && (showPicker || showRange) && <div style={{ marginTop: 8 }}>{controls}</div>}
        </PageHeader>
        {!wide && (
          <SlideDrawer open={menu} onClose={() => setMenu(false)} width={260} label="Admin screens">
            <div className="adm"><div className="adm-drawer-list">{nav}</div></div>
          </SlideDrawer>
        )}
        <div className="adm-wrap">
          {wide && <nav className="adm-rail" aria-label="Admin screens">{nav}</nav>}
          <div className="adm-body" style={{ opacity: loading && data ? 0.7 : 1 }}>{body}</div>
        </div>
        {ask && <Confirm ask={ask} admin="you" onClose={(msg) => { setAsk(null); if (msg) say(msg); }} />}
        {newCo && <NewCompany onClose={() => setNewCo(false)} post={(b) => call("/api/admin", "POST", b)}
          onCreated={(c) => { say(`${c.name} is made`); reload(); }} />}
        {ownerFor && <OwnerLink {...ownerFor} onClose={() => { setOwnerFor(null); reload(); }} post={(b) => call("/api/admin", "POST", b)} />}
        {toast}
      </div>
    </OrgNameContext.Provider>
  );
}

// ------------------------------------------------------------------ shared bits

type Go = (s: AdminScreen, id?: string | null) => void;

function StatusTag({ c, now }: { c: AdminCompany; now: Date }) {
  const [l, k] = STATUS_LABEL[companyStatus(c, now)];
  return <Tag c={k}>{l}</Tag>;
}

function Alarms({ list, go, coName, empty = "All systems normal" }: { list: Alarm[]; go: Go; coName: (id: string | null) => string; empty?: string }) {
  if (!list.length) return <div className="ok"><Ico d={ICONS.check} />{empty}<span>companies, pipelines, workers and plan limits</span></div>;
  return (
    <div className="alarms">
      {list.map((a, i) => (
        <div key={i} className={`alarm${a.sev === "a" ? " warn" : ""}`}>
          <span className="t">{a.title}</span>
          <span className="m">{a.msg}</span>
          <span className="f">
            {a.org_id ? <a href="#" onClick={(e) => { e.preventDefault(); go("company", a.org_id); }}>{coName(a.org_id)}</a> : <span className="mut">Platform</span>}
            {" · "}<a href="#" onClick={(e) => { e.preventDefault(); go(a.link, a.org_id && a.link !== "companies" ? a.org_id : null); }}>Open ›</a>
            {a.at && <span className="ago">{ago(a.at, new Date())}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

const rangeLong = (r: AdminRange) => RANGES.find((x) => x.k === r)?.long ?? "";

function sum(cos: AdminCompany[], k: keyof AdminCompany) { return cos.reduce((a, c) => a + n(c[k]), 0); }

// ------------------------------------------------------------------ Pulse

function Pulse({ d, cos, alarms, items, range, now, go, coName }: {
  d: Data; cos: AdminCompany[]; alarms: Alarm[]; items: RoadmapItem[] | null; range: AdminRange; now: Date; go: Go; coName: (id: string | null) => string;
}) {
  const active = cos.filter((c) => companyStatus(c, now) === "active").length;
  const setting = cos.filter((c) => companyStatus(c, now) === "setup").length;
  const fresh = (items ?? []).filter((i) => i.status === "new").slice(0, 4);
  const b = d.build;
  return (
    <>
      <section><span className="lbl">Alarms</span><div style={{ height: 8 }} /><Alarms list={alarms} go={go} coName={coName} /></section>
      <section>
        <span className="lbl">{rangeLong(range)}</span><div style={{ height: 8 }} />
        <div className="tiles">
          <Tile label="Active companies" value={active} sub={`of ${cos.length}${setting ? ` · ${setting} setting up` : ""}`} />
          <Tile label="Calls + texts in" value={sum(cos, "inbound").toLocaleString()} sub={`${sum(cos, "outbound").toLocaleString()} out`} />
          <Tile label="Emails in" value={sum(cos, "emails")} />
          <Tile label="Bids filed" value={sum(cos, "bids_filed")} />
          <Tile label="Dusty questions" value={<span className="ai">{sum(cos, "dusty_questions")}</span>} />
          <Tile label="Jobs made" value={sum(cos, "jobs_made")} sub={`${sum(cos, "jobs_open")} open`} />
          <Tile label="Proposals sent" value={sum(cos, "proposals_sent")} />
          <Tile label="Proposals opened" value={sum(cos, "proposals_opened")} />
          <Tile label="AI spend" value="Not logged yet" na sub={<a href="#" onClick={(e) => { e.preventDefault(); go("dusty"); }}>Why ›</a>} />
          <Tile label="App errors" value="No error collector" na sub={<a href="#" onClick={(e) => { e.preventDefault(); go("releases"); }}>Why ›</a>} />
        </div>
      </section>
      <Panel title="Company health" right={<>{plural(cos.length, "company", "companies")} · <a href="#" onClick={(e) => { e.preventDefault(); go("companies"); }}>Table ›</a></>}>
        <div className="hgrid">
          {cos.map((c) => {
            const h = companyHealth(c, now);
            return (
              <button key={c.id} className={`hc ${h}`} onClick={() => go("company", c.id)}>
                <span className="n"><Dot h={h} />{c.name}</span>
                <span className="m">{c.members} member{c.members === 1 ? "" : "s"} · setup {setupCount(c.setup)} of 9</span>
                <span className="m">Last active {ago(c.last_active, now)}</span>
              </button>
            );
          })}
        </div>
      </Panel>
      <div className="grid gc">
        <Panel title="Latest feedback" right={<a href="#" onClick={(e) => { e.preventDefault(); go("feedback"); }}>Inbox ›</a>}>
          {items === null ? <span className="mut">Loading…</span> : fresh.length ? fresh.map((f) => (
            <div key={f.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid var(--sc-hair-soft)", fontSize: 12.5 }}>
              <span style={{ flex: "none" }}><Tag c={f.kind === "bug" ? "r" : f.kind === "idea" ? "b" : ""}>{f.kind === "bug" ? "Wrong" : f.kind}</Tag></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title}</span>
                <span className="mut" style={{ fontSize: 11 }}>{f.org_name ?? "—"}{f.page ? ` · ${f.page.replace("/dashboard", "") || "/"}` : ""} · {ago(f.created_at, now)}</span>
              </span>
            </div>
          )) : <span className="mut">Nothing new</span>}
        </Panel>
        <Panel title="Live build" right={b?.env === "production" ? <Tag c="g">Production</Tag> : <Tag>{b?.env ?? "—"}</Tag>}>
          <BuildFacts b={b} />
          <div style={{ marginTop: 8 }}><a href="#" onClick={(e) => { e.preventDefault(); go("releases"); }}>Migrations ›</a></div>
        </Panel>
      </div>
    </>
  );
}

function BuildFacts({ b }: { b?: Build }) {
  return (
    <dl className="kv">
      <dt>Branch</dt><dd>{b?.branch ?? <span className="mut">not on Vercel</span>}</dd>
      <dt>Commit</dt><dd>{b?.sha ? <><code>{b.sha}</code> {b.message}</> : <span className="mut">—</span>}</dd>
      <dt>Errors since</dt><dd><span className="mut">no error collector yet</span></dd>
    </dl>
  );
}

// ------------------------------------------------------------------ Companies

type SortKey = "name" | "plan" | "status" | "members" | "last_active" | "inbound" | "dusty_questions" | "jobs_open" | "proposals_30d" | "setup" | "created_at";

function Companies({ cos, now, go, onNew }: { cos: AdminCompany[]; now: Date; go: Go; onNew: () => void }) {
  const [q, setQ] = useState("");
  const [st, setSt] = useState<string | null>(null);
  const [hl, setHl] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState(1);
  const val = (c: AdminCompany, k: SortKey): string | number => {
    if (k === "status") return companyStatus(c, now);
    if (k === "setup") return setupCount(c.setup);
    if (k === "last_active" || k === "created_at") return Date.parse(c[k] ?? "") || 0;
    const v = c[k];
    return typeof v === "number" ? v : String(v ?? "").toLowerCase();
  };
  const rows = cos.filter((c) => (!q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.slug ?? "").includes(q.toLowerCase()))
    && (!st || companyStatus(c, now) === st) && (!hl || companyHealth(c, now) === hl))
    .sort((a, b) => { const x = val(a, sort), y = val(b, sort); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir; });
  const th = (k: SortKey, l: string, r?: boolean) => (
    <th className={`sortable${r ? " r" : ""}${sort === k ? ` s${dir > 0 ? " asc" : ""}` : ""}`}
      onClick={() => { if (sort === k) setDir(-dir); else { setSort(k); setDir(typeof val(cos[0] ?? ({} as AdminCompany), k) === "number" ? -1 : 1); } }}>{l}</th>
  );
  const chip = (on: boolean, l: string, set: () => void) => <button className={`chip${on ? " on" : ""}`} onClick={set}>{l}</button>;
  return (
    <>
      <div className="filters">
        <label className="search"><Ico d={ICONS.search} size={14} /><input placeholder="Search company or address" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {(["active", "setup", "quiet", "risk"] as const).map((k) => <React.Fragment key={k}>{chip(st === k, STATUS_LABEL[k][0], () => setSt(st === k ? null : k))}</React.Fragment>)}
        <span className="hide-phone" style={{ width: 1, height: 20, background: "var(--sc-hair)" }} />
        {chip(hl === "g", "● Healthy", () => setHl(hl === "g" ? null : "g"))}
        {chip(hl === "a", "● Warning", () => setHl(hl === "a" ? null : "a"))}
        {chip(hl === "r", "● Broken", () => setHl(hl === "r" ? null : "r"))}
        <span style={{ flex: 1 }} />
        <button className="ib pri" onClick={onNew}><Ico d={ICONS.plus} />New company</button>
      </div>
      <div className="panel">
        <div className="tbl-c tscroll">
          <table className="t">
            <thead><tr>
              {th("name", "Company")}{th("plan", "Plan")}{th("status", "Status")}<th>Owner</th>{th("members", "Members", true)}
              {th("last_active", "Last active")}{th("inbound", "Calls + texts in", true)}{th("dusty_questions", "Dusty", true)}
              {th("jobs_open", "Jobs open", true)}{th("proposals_30d", "Proposals 30 d", true)}{th("setup", "Setup", true)}
            </tr></thead>
            <tbody>
              {rows.map((c) => {
                const h = companyHealth(c, now), risk = riskLine(c, now), s = setupCount(c.setup);
                return (
                  <tr key={c.id} className="row" onClick={() => go("company", c.id)}>
                    <td>
                      <span className="nm" style={{ display: "flex", alignItems: "center", gap: 8 }}><Dot h={h} /><span>{c.name}<small>{c.slug}.app.scopecrete.ai</small></span></span>
                      {risk && <div style={{ fontSize: 11, color: companyStatus(c, now) === "risk" ? "var(--a-red)" : "var(--a-amber)", whiteSpace: "normal", maxWidth: 220 }}>{risk}</div>}
                    </td>
                    <td>{planLabel(c.plan)}</td>
                    <td><StatusTag c={c} now={now} /></td>
                    <td>{c.owner ?? <span className="mut">no owner yet</span>}</td>
                    <td className="r tn">{c.members}{c.invited ? <span className="mut"> +{c.invited} invited</span> : null}</td>
                    <td className={/d ago|never/.test(ago(c.last_active, now)) ? "dn" : ""}>{ago(c.last_active, now)}</td>
                    <td className="r"><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Spark data={c.spark ?? []} color={h === "r" ? "var(--a-red)" : undefined} /><span className="tn">{c.inbound}</span></span></td>
                    <td className="r tn ai">{c.dusty_questions}</td>
                    <td className="r tn">{c.jobs_open}</td>
                    <td className="r tn">{c.proposals_30d}</td>
                    <td className="r"><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Bar pct={(s / 9) * 100} c={s < 9 ? "a" : ""} width={50} /><span className="tn">{s} of 9</span></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="cards" style={{ padding: 8 }}>
          {rows.map((c) => {
            const h = companyHealth(c, now), risk = riskLine(c, now);
            return (
              <button key={c.id} className="ccard" onClick={() => go("company", c.id)}>
                <span className="tp"><Dot h={h} /><span className="nm" style={{ flex: 1 }}>{c.name}</span><StatusTag c={c} now={now} /></span>
                <span className="st">
                  <span>Last active<b style={{ fontSize: 12, fontFamily: "var(--sc-font-body)" }}>{ago(c.last_active, now)}</b></span>
                  <span>Calls + texts<b>{c.inbound}</b></span>
                  <span>Setup<b>{setupCount(c.setup)}/9</b></span>
                </span>
                {risk && <span style={{ fontSize: 11, color: "var(--a-amber)" }}>{risk}</span>}
              </button>
            );
          })}
        </div>
        {!rows.length && <div className="pb mut">No company matches.</div>}
      </div>
      <div className="mut" style={{ fontSize: 11.5 }}>
        {rows.length} of {cos.length} companies · click a column to sort · &ldquo;At risk&rdquo; = nobody signed in or asked Dusty for 7 days; &ldquo;Setting up&rdquo; = under 30 days old with setup steps left; red = calls, texts or bids that didn&apos;t get through.
      </div>
    </>
  );
}

// ------------------------------------------------------------------ one company

const TABS: Array<[string, string]> = [
  ["overview", "Overview"], ["setup", "Setup checklist"], ["people", "People"], ["pipelines", "Pipelines"],
  ["dusty", "Dusty"], ["usage", "Usage"], ["feedback", "Feedback"], ["log", "Admin log"],
];

function Company({ c, d, tab, setTab, alarms, items, now, go, coName, replay, decide, ownerLink }: {
  c: AdminCompany; d: Data; tab: string; setTab: (t: string) => void; alarms: Alarm[]; items: RoadmapItem[] | null; now: Date; go: Go;
  coName: (id: string | null) => string; replay: (f: Failure) => void; decide: (it: RoadmapItem, s: "considering" | "declined") => void;
  ownerLink: (email: string) => void;
}) {
  const h = companyHealth(c, now);
  const done = setupCount(c.setup);
  const days = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() - (6 - i) * 864e5));
  let body: React.ReactNode = null;
  if (tab === "overview") body = (
    <>
      <div className="grid gc">
        <Panel title="Calls and texts · last 7 days">
          <DayBars data={(c.spark ?? []).map(n)} labels={days.map((x) => x.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Chicago" }))} />
          <div className="mut" style={{ fontSize: 11.5, marginTop: 6 }}>{(c.spark ?? []).reduce((a, b) => a + n(b), 0)} in and out this week.</div>
        </Panel>
        <div className="col">
          <Panel title="Key counts">
            <div className="tiles" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Tile label="Members" value={c.members} sub={c.invited ? `${c.invited} invited` : ""} />
              <Tile label="Jobs open" value={c.jobs_open} />
              <Tile label="Proposals · 30 d" value={c.proposals_30d} />
              <Tile label="Files stored" value={bytes(n(c.file_bytes))} />
            </div>
          </Panel>
          <Panel title="Alarms"><Alarms list={alarms} go={go} coName={coName} empty="Nothing to fix" /></Panel>
        </div>
      </div>
      <div className="note"><b>Counts, not content</b>This page shows numbers only — no customer names, texts, transcripts or files.</div>
      <div className="note"><b>Not built yet</b>The design&apos;s Pause, View as (read-only), feature switches and AI spending cap. Each needs its own switch in the app first.</div>
    </>
  );
  else if (tab === "setup") {
    const next = SETUP_STEPS.find((s) => stepDone(c.setup, s.k) === null);
    body = (
      <>
        <Panel title="Setup checklist" right={<span className="tn">{done} of 9</span>}>
          {SETUP_STEPS.map((s) => {
            const w = stepDone(c.setup, s.k);
            return (
              <div key={s.k} className={`ck${w ? " d" : ""}`}>
                <span className="bx">{w ? <Ico d={ICONS.check} size={12} /> : null}</span>
                <span>{s.label}</span>
                <span className="w">{w === true ? "done" : w ? `done ${day(w)}` : "not done"}</span>
              </div>
            );
          })}
        </Panel>
        {next && <div className="note"><b>Next nudge</b>They haven&apos;t {next.nudge} yet. Company is {Math.floor(dayGap(c.created_at, now.toISOString()) ?? 0)} days old.</div>}
      </>
    );
  }
  else if (tab === "people") {
    const p = d.people;
    body = !p ? <div className="spin">Loading…</div> : (
      <>
        <Panel title="Members" right={`${p.members.length}`} pad={false}>
          <div className="tscroll"><table className="t">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Last sign-in</th><th>Last Dusty question</th><th className="r">Questions · 30 d</th></tr></thead>
            <tbody>{p.members.map((m) => (
              <tr key={m.email}>
                <td className="nm">{m.name}</td><td className="mut">{m.email}</td><td>{ROLE[m.role]?.replace(/s$/, "") ?? m.role}</td>
                <td>{day(m.joined)}</td><td className={/d ago|never/.test(ago(m.last_sign_in, now)) ? "dn" : ""}>{ago(m.last_sign_in, now)}</td>
                <td>{ago(m.last_question, now)}</td><td className="r tn">{m.questions_30d}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {!p.members.length && <div className="pb mut">Nobody has joined yet.</div>}
        </Panel>
        {p.invites.length > 0 && (
          <Panel title="Invited, not yet joined" right={`${p.invites.length}`} pad={false}>
            <div className="tscroll"><table className="t"><tbody>{p.invites.map((i) => (
              <tr key={i.email + i.sent}><td>{i.email}</td><td>{ROLE[i.role]?.replace(/s$/, "") ?? i.role}</td><td className="mut">sent {day(i.sent)}</td>
                <td className={Date.parse(i.expires) < now.getTime() ? "dn" : "mut"}>{Date.parse(i.expires) < now.getTime() ? "expired" : `expires ${day(i.expires)}`}</td></tr>
            ))}</tbody></table></div>
          </Panel>
        )}
      </>
    );
  }
  else if (tab === "pipelines") body = <PipelinesView d={d} cos={[c]} now={now} go={go} coName={coName} replay={replay} one />;
  else if (tab === "dusty") body = <DustyView d={d} cos={[c]} />;
  else if (tab === "usage") body = <UsageView d={d} cos={[c]} />;
  else if (tab === "feedback") body = <Inbox list={(items ?? []).filter((i) => i.org_name === c.name)} decide={decide} loading={items === null} />;
  else body = <LogView rows={d.log ?? []} go={go} coName={coName} />;

  return (
    <>
      <div className="chead">
        <div>
          <h2><Dot h={h} />{c.name}</h2>
          <div className="meta">
            <span><b>{c.slug}</b>.app.scopecrete.ai</span><span>Plan <b>{planLabel(c.plan)}</b></span>
            <span>Created <b>{day(c.created_at)}</b></span><span>Owner <b>{c.owner ?? "not joined"}</b></span><StatusTag c={c} now={now} />
          </div>
        </div>
        <button className="ib" onClick={() => ownerLink(d.people?.invites.find((i) => i.role === "owner")?.email ?? "")}
          title="A fresh invite link for the owner — the old one stops working">New owner link</button>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {body}
    </>
  );
}

// ------------------------------------------------------------------ Pipelines

function PipelinesView({ d, cos, now, go, coName, replay, one }: {
  d: Data; cos: AdminCompany[]; now: Date; go: Go; coName: (id: string | null) => string; replay: (f: Failure) => void; one?: boolean;
}) {
  const p = d.pipelines;
  if (!p) return <div className="spin">Loading…</div>;
  const ids = new Set(cos.map((c) => c.id));
  const q = p.quo, e = p.email, b = p.bids, f = p.files;
  const ok = (bad: boolean, l = "OK") => bad ? <Tag c="r">{l}</Tag> : <Tag c="g">OK</Tag>;
  const failures = (d.failures ?? []).filter((x) => !x.org_id || ids.has(x.org_id) || !one);
  const topSkip = p.skip_reasons[0];
  return (
    <>
      <Panel title="Calls & texts" right={ok(p.drift > 0 || q.errors > 0, p.drift ? `Drift ${p.drift}` : `${q.errors} errors`)}>
        <Conveyor stages={[
          { l: "Quo webhook", v: n(q.received), s: q.errors ? `${q.errors} failed to file` : "0 failures", bad: q.errors > 0, c: q.errors ? "r" : "" },
          { l: "Filed", v: n(q.filed), s: q.median_ms != null ? `median ${Math.round(q.median_ms)} ms` : "" },
          { l: "Messages", v: n(p.messages), s: p.drift ? `${p.drift} never became messages` : "0 drift", bad: p.drift > 0, c: p.drift ? "r" : "" },
          { l: "People read by Dusty", v: n(p.read_contacts), s: p.defects ? `${plural(p.defects, "note")} on Logs` : "" },
        ]} />
      </Panel>
      <Panel title="Email" right={ok(e.event_errors > 0, `${e.event_errors} errors`)}>
        <Conveyor stages={[
          { l: "Webhook", v: n(e.events), s: e.event_errors ? `${e.event_errors} didn't parse` : "0 failures", bad: e.event_errors > 0, c: e.event_errors ? "r" : "" },
          { l: "Stored", v: n(e.stored) },
          { l: "Filed", v: n(e.exact) + n(e.suggested) + n(e.by_hand), s: `${e.exact} exact · ${e.suggested} suggested · ${e.by_hand} by hand` },
          { l: "Unfiled", v: n(e.unfiled), c: e.unfiled ? "a" : "" },
          { l: "Quarantined", v: n(e.quarantined), s: "sender not a forwarder", c: e.quarantined ? "a" : "n" },
        ]} />
      </Panel>
      <Panel title="Bids" right={ok(p.stuck.length > 0, `${p.stuck.length} stuck`)}>
        <Conveyor stages={[
          { l: "Bid emails", v: n(b.opened) },
          { l: "In flight", v: n(b.in_flight), c: b.in_flight ? "a" : "n" },
          { l: "Job filed", v: n(b.filed), s: b.median_s != null ? `median ${Math.round(b.median_s)} s` : "" },
          { l: "Not a bid", v: n(b.not_a_bid), c: "n" },
          { l: "Undone", v: n(b.undone), c: "n" },
        ]} />
        {p.stuck.length > 0 && (
          <div className="tscroll" style={{ marginTop: 10 }}><table className="t">
            <thead><tr><th>Stuck since</th><th>Company</th><th>Step</th><th>Tries</th><th>Error</th></tr></thead>
            <tbody>{p.stuck.map((s) => (
              <tr key={s.id}><td className="mut">{ago(s.since, now)}</td><td><a href="#" onClick={(ev) => { ev.preventDefault(); go("company", s.org_id); }}>{coName(s.org_id)}</a></td>
                <td>{s.state}</td><td className="tn">{s.attempts ?? "—"}</td><td className="w dn">{s.error ?? "—"}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
      <div className="col">
        <Panel title="File reader">
          <Conveyor stages={[
            { l: "Waiting", v: n(f.waiting), c: "n" },
            { l: "Read", v: n(f.read), s: `${f.uploaded} uploaded · ${f.from_email} email · ${f.from_texts} texts` },
            { l: "Skipped", v: n(f.skipped), s: topSkip ? `${topSkip.n}× ${topSkip.reason}` : "", c: f.skipped ? "a" : "" },
            { l: "Failed", v: n(f.failed), s: f.failed ? "after 3 tries" : "", bad: f.failed > 0, c: f.failed ? "r" : "" },
          ]} />
        </Panel>
        <Panel title="Contact reader" pad={false}>
          <div className="tscroll"><table className="t">
            <thead><tr><th>Company</th><th className="r">Queue</th><th className="r">Reads</th><th className="r">Named</th><th className="r">Suggested</th><th className="r">Unchanged</th><th className="r">Errors</th><th className="r">Median</th></tr></thead>
            <tbody>{p.reader.filter((r) => ids.has(r.org_id) || !one).map((r) => (
              <tr key={r.org_id}><td className="nm">{coName(r.org_id)}</td><td className="r tn">{r.queue}</td><td className="r tn">{r.runs}</td><td className="r tn">{r.named}</td>
                <td className="r tn">{r.suggested}</td><td className="r tn">{r.unchanged}</td><td className={`r tn${r.errors ? " dn" : ""}`}>{r.errors}</td>
                <td className="r tn">{r.median_s != null ? `${Math.round(r.median_s)} s` : "—"}</td></tr>
            ))}</tbody>
          </table></div>
          {!p.reader.length && <div className="pb mut">No reads in this range.</div>}
        </Panel>
      </div>
      {!one && (
        <Panel title="Workers">
          <div className="wk">
            {p.workers.map((w) => {
              const st = workerState(w, now);
              const dot = st === "ok" ? "g" : st === "not_configured" ? "n" : "r";
              return (
                <div key={w.worker} className="wc">
                  <span className="n"><Dot h={dot} />{WORKER_LABEL[w.worker] ?? w.worker}<span style={{ marginLeft: "auto" }}><Tag c={st === "ok" ? "g" : st === "not_configured" ? "" : "r"}>{st.replace("_", " ")}</Tag></span></span>
                  <span className="m">ran {ago(w.at, now)} · expected every {workerLimitMin(w.worker) >= 60 ? "2 h" : "few min"}</span>
                  {w.detail && <span className={st === "ok" ? "m" : "e"}>{w.detail}</span>}
                </div>
              );
            })}
          </div>
        </Panel>
      )}
      <Panel title="Last failures across all pipelines" right={`${failures.length} shown`} pad={false}>
        <div className="tscroll"><table className="t">
          <thead><tr><th>When</th><th>Company</th><th>Pipeline</th><th>Error</th><th /></tr></thead>
          <tbody>{failures.map((x, i) => (
            <tr key={i}><td className="mut">{ago(x.at, now)}</td>
              <td>{x.org_id ? <a href="#" onClick={(ev) => { ev.preventDefault(); go("company", x.org_id); }}>{coName(x.org_id)}</a> : "—"}</td>
              <td>{x.pipeline}</td><td className="w">{x.error ?? "—"}</td>
              <td className="r">{x.replay_id && <button className="ib sm" onClick={() => replay(x)}>Replay</button>}</td></tr>
          ))}</tbody>
        </table></div>
        {!failures.length && <div className="pb mut">No failures on record.</div>}
      </Panel>
    </>
  );
}

// ------------------------------------------------------------------ Dusty

const CONTEXT: Record<string, string> = { cold: "Cold (footer)", contact: "A person", job: "A job", customer: "A customer", cash: "Price book & money", activity: "Catch-up", vendor: "A vendor" };

function DustyView({ d, cos }: { d: Data; cos: AdminCompany[] }) {
  const x = d.dusty;
  if (!x) return <div className="spin">Loading…</div>;
  const ids = new Set(cos.map((c) => c.id));
  const name = (id: string) => cos.find((c) => c.id === id)?.name ?? "A company";
  const agreement = x.agreement.filter((a) => ids.has(a.org_id));
  const ctxMax = Math.max(1, ...x.by_context.map((c) => n(c.n)));
  const per = x.per_org.filter((p) => ids.has(p.org_id)).sort((a, b) => n(b.questions) - n(a.questions));
  const perMax = Math.max(1, ...per.map((p) => n(p.questions)));
  const undonePct = x.names_kept + x.names_undone ? Math.round((x.names_undone / (x.names_kept + x.names_undone)) * 100) : null;
  return (
    <>
      <Empty title="No AI cost data yet: model calls aren't logged">
        Dusty&apos;s model calls don&apos;t record tokens, cost, latency or model. A model_calls row per call (company, person, feature, model, tokens in/out, cost, ms, ok) fills spend per company, by feature, response time and timeouts — easiest while moving Dusty to the model API directly. What&apos;s below comes from tables that already exist.
      </Empty>
      <div className="tiles">
        <Tile label="Questions" value={<span className="ai">{x.questions}</span>} sub={`${x.askers} ${x.askers === 1 ? "person" : "people"} asking`} />
        <Tile label="Answers" value={x.answers} sub={x.questions > x.answers ? <span className="wn">{x.questions - x.answers} without one</span> : ""} />
        <Tile label="Chats" value={x.chats} />
        <Tile label="Contact reads" value={x.reader_runs} sub={x.reader_errors ? <span className="dn">{x.reader_errors} model errors</span> : "0 model errors"} />
        <Tile label="Files read" value={x.files_read} />
        <Tile label="Dreams" value={x.dreams} />
      </div>
      <div className="grid g2">
        <Panel title="Sorting accuracy · Dusty's guesses vs how the owner filed" pad={false}>
          <div className="tscroll"><table className="t">
            <thead><tr>{cos.length > 1 && <th>Company</th>}<th>Bucket</th><th className="r">Agreed / total</th><th /><th className="r">Streak</th></tr></thead>
            <tbody>{agreement.map((a, i) => (
              <tr key={i}>{cos.length > 1 && <td className="nm">{name(a.org_id)}</td>}<td>{a.bucket}</td>
                <td className="r tn">{a.guesses ? `${a.agreed} / ${a.guesses}` : "—"}</td>
                <td><Bar pct={a.guesses ? (a.agreed / a.guesses) * 100 : 0} c={a.guesses && a.agreed / a.guesses < 0.85 ? "a" : "v"} /></td>
                <td className="r tn">{a.streak}</td></tr>
            ))}</tbody>
          </table></div>
          {!agreement.length && <div className="pb mut">Nobody filed against a guess yet.</div>}
        </Panel>
        <div className="col">
          <Panel title="Names written automatically · 30 d">
            <div className="tiles" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Tile label="Kept" value={x.names_kept} />
              <Tile label="Undone by owner" value={x.names_undone} sub={undonePct != null ? <span className={undonePct > 10 ? "wn" : ""}>{undonePct}%</span> : ""} />
            </div>
          </Panel>
          <Panel title="Filed by Dusty · 30 d">
            <div className="tiles" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Tile label="Auto-filed" value={x.auto_filed} />
              <Tile label="Moved back by owner" value={x.auto_moved} sub={x.auto_filed ? `${Math.round((x.auto_moved / Math.max(1, x.auto_filed)) * 100)}%` : ""} />
            </div>
          </Panel>
          <Panel title="Plan cards"><Empty title="Not stored yet">Plan cards proposed vs applied need a row per plan — its steps, whether Coy applied it, which steps failed.</Empty></Panel>
        </div>
      </div>
      <div className="grid g2">
        <Panel title="Where people ask">
          <div className="bars">{x.by_context.map((c) => <BarRow key={c.kind} label={CONTEXT[c.kind] ?? c.kind} value={n(c.n)} max={ctxMax} />)}</div>
          {!x.by_context.length && <span className="mut">No questions in this range.</span>}
        </Panel>
        {cos.length > 1 && (
          <Panel title="Questions by company">
            <div className="bars">{per.map((p) => <BarRow key={p.org_id} label={name(p.org_id)} value={n(p.questions)} max={perMax} />)}</div>
            {!per.length && <span className="mut">No questions in this range.</span>}
          </Panel>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Usage

function UsageView({ d, cos }: { d: Data; cos: AdminCompany[] }) {
  const u = d.usage;
  if (!u) return <div className="spin">Loading…</div>;
  const ids = new Set(cos.map((c) => c.id));
  const made = u.made.filter((m) => ids.has(m.org_id));
  const name = (id: string) => cos.find((c) => c.id === id)?.name ?? "A company";
  const colMax = Object.fromEntries(MADE_COLS.map(([k]) => [k, Math.max(1, ...made.map((m) => n(m[k])))]));
  const dead = MADE_COLS.filter(([k]) => made.every((m) => !n(m[k]))).map(([, l]) => l);
  const fun = FUNNEL_STEPS.map(([k, l]) => [l, n(u.funnel[k])] as const);
  const fMax = Math.max(1, fun[0][1]);
  return (
    <>
      <Panel title="What each company made in this range" pad={false}>
        <div className="matrix"><table>
          <thead><tr><th className="rh">Company</th>{MADE_COLS.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
          <tbody>{made.map((m) => (
            <tr key={m.org_id}><td className="rh">{name(m.org_id)}</td>
              {MADE_COLS.map(([k]) => {
                const v = n(m[k]), p = v / colMax[k];
                return <td key={k}><span className="cell" style={v ? { background: `color-mix(in srgb, var(--sc-ink) ${Math.round(8 + p * 60)}%, transparent)`, color: p > 0.6 ? "var(--sc-slab)" : "var(--sc-ink)" } : undefined}>{v || "—"}</span></td>;
              })}</tr>
          ))}</tbody>
        </table></div>
        {dead.length > 0 && <div className="pb" style={{ fontSize: 12, color: "var(--a-amber)" }}>Nobody touched: {dead.join(", ")}.</div>}
      </Panel>
      <Panel title="The money funnel" right={fun[0][1] ? `${Math.round((fun[6][1] / fMax) * 100)}% in → won` : ""}>
        <div className="funnel">
          {fun.map(([l, v], i) => {
            const drop = i ? dropPct(fun[i - 1][1], v) : null;
            return (
              <div key={l} className="fs">
                <span className="v">{v}</span>
                <span className="bk" style={{ height: Math.max(4, (v / fMax) * 90) }} />
                <span className="l">{l}</span>
                {drop != null && drop > 0 && <span className="dr">−{drop}%</span>}
              </div>
            );
          })}
        </div>
        <div className="mut" style={{ fontSize: 11.5, marginTop: 8 }}>Counts in this range at each step, not one group of people followed through. Medians between steps need a cohort — not built.</div>
      </Panel>
      <Panel title="Time to first value" pad={false}>
          <div className="tscroll"><table className="t">
            <thead><tr><th>Company</th><th className="r">First call in</th><th className="r">First job</th><th className="r">First proposal</th></tr></thead>
            <tbody>{cos.map((c) => {
              const g = (iso: string | null) => { const x = dayGap(c.created_at, iso); return x == null ? <span className="wn">not yet</span> : `day ${x}`; };
              return <tr key={c.id}><td className="nm">{c.name}</td><td className="r tn">{g(c.first_inbound)}</td><td className="r tn">{g(c.first_job)}</td><td className="r tn">{g(c.setup?.proposal ?? null)}</td></tr>;
            })}</tbody>
          </table></div>
          <div className="pb mut" style={{ fontSize: 11.5 }}>Days from the company being made. History from before ScopeCrete counts as day 0.</div>
        </Panel>
      <div className="grid g2">
        <Panel title="Active people">
          <div className="bars">{u.active.map((a) => <BarRow key={a.role} label={ROLE[a.role] ?? a.role} value={n(a.active)} max={Math.max(1, n(a.total))} c="k" text={`${a.active} / ${a.total}`} />)}</div>
          <div className="mut" style={{ fontSize: 11.5, marginTop: 8 }}>Active = signed in or asked Dusty in this range. Phone vs desktop isn&apos;t recorded.</div>
        </Panel>
        <Panel title="Pages ranked"><Empty title="Page views aren't recorded">Needs a small usage_events table (company, person, page or feature, time) — no customer content in it.</Empty></Panel>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Feedback

function Inbox({ list, decide, loading }: { list: RoadmapItem[]; decide: (it: RoadmapItem, s: "considering" | "declined") => void; loading?: boolean }) {
  const now = new Date();
  if (loading) return <div className="spin">Loading…</div>;
  const kind: Record<string, [string, string]> = { bug: ["Something's wrong", "r"], idea: ["Idea", "b"], other: ["Other", ""] };
  return (
    <div className="panel">
      {list.length ? list.map((f) => (
        <div key={f.id} className="fb">
          <span className="k"><Tag c={kind[f.kind]?.[1]}>{kind[f.kind]?.[0] ?? f.kind}</Tag></span>
          <span className="c">
            <span className="m">{f.org_name ?? "—"}{f.author_name ? ` · ${f.author_name}` : ""}{f.page ? <> · from <b>{f.page.replace("/dashboard", "") || "/"}</b></> : null} · {ago(f.created_at, now)}
              {f.status !== "new" && <> · <Tag c={f.status === "declined" ? "" : "g"}>{statusLabel(f.status)}</Tag></>}</span>
            <p><b>{f.title}</b>{f.body && f.body !== f.title ? `\n${f.body}` : ""}</p>
            <span className="a">
              {f.status === "new" && <>
                <button className="ib sm pri" onClick={() => decide(f, "considering")}>Publish</button>
                <Link className="ib sm" href={`/dashboard/roadmap?item=${f.id}`}>Reword</Link>
                <button className="ib sm" onClick={() => decide(f, "declined")}>Not planned</button>
              </>}
            </span>
          </span>
        </div>
      )) : <div className="pb mut">Nothing here.</div>}
    </div>
  );
}

function FeedbackView({ items, cos, all, decide }: { items: RoadmapItem[] | null; cos: AdminCompany[]; all: boolean; decide: (it: RoadmapItem, s: "considering" | "declined") => void }) {
  if (items === null) return <div className="spin">Loading…</div>;
  const names = new Set(cos.map((c) => c.name));
  const mine = all ? items : items.filter((i) => i.org_name && names.has(i.org_name));
  const inbox = mine.filter((i) => i.status === "new").sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const board = items.filter((i) => BOARD.includes(i.status));
  const top = [...board].filter((i) => i.status !== "released").sort((a, b) => b.votes - a.votes).slice(0, 5);
  const talked = [...board].sort((a, b) => b.comments - a.comments).filter((i) => i.comments).slice(0, 5);
  const row = (t: string, v: number, id: string) => (
    <div key={id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderTop: "1px solid var(--sc-hair-soft)", fontSize: 12.5 }}>
      <span>{t}</span><b className="tn">{v}</b>
    </div>
  );
  return (
    <>
      <div className="grid gc">
        <div><span className="lbl">Inbox · {inbox.length} new</span><div style={{ height: 8 }} /><Inbox list={inbox} decide={decide} /></div>
        <div className="col">
          <Panel title="Top voted">{top.length ? top.map((t) => row(t.title, t.votes, t.id)) : <span className="mut">No votes yet.</span>}</Panel>
          <Panel title="Most talked about">{talked.length ? talked.map((t) => row(t.title, t.comments, t.id)) : <span className="mut">No comments yet.</span>}</Panel>
        </div>
      </div>
      <span className="lbl">Board · <Link href="/dashboard/roadmap">open the Roadmap ›</Link></span>
      <div className="grid g4" style={{ marginTop: -8 }}>
        {BOARD.map((s) => {
          const col = board.filter((i) => i.status === s).sort((a, b) => b.votes - a.votes);
          return (
            <Panel key={s} title={statusLabel(s)} right={<span className="tn">{col.length}</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {col.map((i) => (
                  <Link key={i.id} href={`/dashboard/roadmap?item=${i.id}`} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12.5, color: "var(--sc-ink)" }}>
                    <span>{i.title}</span>
                    <span style={{ fontSize: 11, color: "var(--sc-ink3)" }}><b className="tn" style={{ color: "var(--sc-ink2)" }}>{i.votes}</b> votes · {i.comments} comments</span>
                  </Link>
                ))}
                {!col.length && <span className="mut">—</span>}
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Releases

function Releases({ d }: { d: Data }) {
  const m = d.platform?.migrations ?? [];
  return (
    <div className="grid gc">
      <div className="col">
        <Panel title="Database migrations applied" right="newest 12">
          <div className="tl">
            {m.map((x) => (
              <div key={x.version} className="tli">
                <span className="tm tn">{/^\d{14}$/.test(x.version) ? `${x.version.slice(4, 6)}/${x.version.slice(6, 8)} ${x.version.slice(8, 10)}:${x.version.slice(10, 12)}` : x.version}</span>
                <span className="pt" />
                <span><code>{x.name ?? x.version}</code></span>
              </div>
            ))}
          </div>
          {!m.length && <span className="mut">None recorded.</span>}
          <div className="mut" style={{ fontSize: 11.5, marginTop: 8 }}>Times in UTC. Some early migrations were applied in pieces and aren&apos;t listed here — the files in migrations/ are the record.</div>
        </Panel>
        <Empty title="Deploy history and errors per deploy aren't recorded">
          Each deploy with its errors in the hour before and after needs an error collector (Sentry or Vercel&apos;s log drain) and the deploy list from Vercel. Feature switches per company aren&apos;t built either.
        </Empty>
      </div>
      <Panel title="Live now" right={d.build?.env === "production" ? <Tag c="g">Production</Tag> : <Tag>{d.build?.env ?? "—"}</Tag>}>
        <BuildFacts b={d.build} />
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ Costs

function Costs({ d, cos }: { d: Data; cos: AdminCompany[] }) {
  const p = d.platform;
  if (!p) return <div className="spin">Loading…</div>;
  const store = p.storage.reduce((a, b) => a + n(b.bytes), 0);
  const limits: Array<[string, number, number]> = [["Database size", n(p.db_bytes), PLAN_LIMITS.db_bytes], ["Storage", store, PLAN_LIMITS.storage_bytes]];
  const sMax = Math.max(1, ...p.storage.map((s) => n(s.bytes)));
  const fMax = Math.max(1, ...cos.map((c) => n(c.file_bytes)));
  const services: Array<[string, string]> = [
    ["Database and storage (Supabase)", "Free plan · egress isn't readable from here — see Supabase → Usage"],
    ["Web app (Vercel)", "Not pulled in yet"], ["AI (OpenRouter via Hermes)", "Model calls aren't logged"],
    ["Web search (Tavily)", "Not pulled in yet"], ["Email inbox (AgentMail)", "Not pulled in yet"],
    ["Maps (Mapbox) · Tax (TaxLocus) · Texts (Quo)", "Not pulled in yet"],
  ];
  return (
    <>
      <div className="grid gc">
        <Panel title="Usage against plan limits" right="Supabase free plan">
          <div className="bars">
            {limits.map(([l, v, t]) => {
              const pct = (v / t) * 100;
              return <BarRow key={l} label={l} value={v} max={t} c={pct >= 80 ? "a" : "k"} text={<span className={pct >= 80 ? "wn" : ""}>{bytes(v)} / {bytes(t)}</span>} />;
            })}
          </div>
          <div className="mut" style={{ fontSize: 11.5, marginTop: 10 }}>Amber at 80%. Egress (5 GB a month, the one that ran over in October) isn&apos;t readable from the database.</div>
        </Panel>
        <Panel title="Storage by bucket">
          <div className="bars">{p.storage.map((s) => <BarRow key={s.bucket} label={s.bucket} value={n(s.bytes)} max={sMax} c="k" text={bytes(n(s.bytes))} />)}</div>
        </Panel>
      </div>
      <div className="grid g2">
        <Panel title="Files stored per company">
          <div className="bars">{[...cos].sort((a, b) => n(b.file_bytes) - n(a.file_bytes)).map((c) => <BarRow key={c.id} label={c.name} value={n(c.file_bytes)} max={fMax} c="k" text={bytes(n(c.file_bytes))} />)}</div>
        </Panel>
        <Panel title="Platform costs" pad={false}>
          <div className="tscroll"><table className="t">
            <thead><tr><th>Service</th><th>This month</th></tr></thead>
            <tbody>{services.map(([s, v]) => <tr key={s}><td>{s}</td><td className="w mut">{v}</td></tr>)}</tbody>
          </table></div>
        </Panel>
      </div>
      <Panel title="Revenue and margin per company">
        <Empty title="Billing isn't connected yet">MRR, companies by plan, trials, past due, churn and each company&apos;s margin appear once billing (Stripe) and AI cost logging land. Plans recorded on companies are labels, not invoices.</Empty>
      </Panel>
    </>
  );
}

// ------------------------------------------------------------------ Admin log

function LogView({ rows, go, coName }: { rows: LogRow[]; go: Go; coName: (id: string | null) => string }) {
  const now = new Date();
  return (
    <>
      <div className="filters"><span style={{ flex: 1 }} /><span className="mut" style={{ fontSize: 11.5 }}>Append-only · nobody can edit or delete a row</span></div>
      <div className="panel">
        <div className="tscroll"><table className="t">
          <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Company</th><th>Detail</th><th>Reason</th></tr></thead>
          <tbody>{rows.map((l) => (
            <tr key={l.id}><td className="mut" title={l.at}>{ago(l.at, now)}</td><td>{l.admin ?? "—"}</td><td><b style={{ fontWeight: 500 }}>{l.action}</b></td>
              <td>{l.org_id ? <a href="#" onClick={(e) => { e.preventDefault(); go("company", l.org_id); }}>{coName(l.org_id)}</a> : "—"}</td>
              <td className="w">{l.detail ?? ""}</td><td className="w mut">{l.reason ?? "—"}</td></tr>
          ))}</tbody>
        </table></div>
        {!rows.length && <div className="pb mut">No admin actions yet. Replay, Publish, Not planned and New company each land here with their reason.</div>}
      </div>
    </>
  );
}

