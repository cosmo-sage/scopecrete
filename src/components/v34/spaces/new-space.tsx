"use client";

/**
 * New Work Space (Coy, 2026-10-22: "every new space will be a blank space whether I click a button
 * or chat with dusty"). No kinds to pick: a name and Create makes a blank Work Space of your own
 * (a thread, migration 073, with nobody on it); its drawer opens on + Add, where jobs, customers,
 * vendors, tools and threads go in, onto shelves you name (by area, by phase …). Or **Build it with
 * Dusty**: he asks what it is for and answers with a work_space plan step Coy applies.
 * Pinning one job, customer or vendor to the rail stays, as a smaller second step (the old picker:
 * searched, ticked several at a time, + New). On a phone it is the whole screen, × at the top
 * right. No migration.
 */

import React, { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SpaceSilhouette } from "@/components/v34/spaces/space-silhouette";
import { usePref } from "@/lib/v34/prefs";
import { PAGE } from "@/lib/v34/pages";
import {
  SPACE_KINDS, CHANNELS, pickSections, addPin, cleanPins, monogram,
  togglePick, toggleItem, cleanRail, showTile, stageColor, stageLabel, type SpacePin,
} from "@/lib/v34/spaces";

/** The tools and channels a collection can hold, ticked in the order they were picked. */
export function PickList({ pages, picks, onChange }: { pages: string[]; picks: string[]; onChange: (v: string[]) => void }) {
  const box = (k: string, label: string) => (
    <label key={k} className="sc-shelf-tick">
      <input type="checkbox" checked={picks.includes(k)} onChange={(e) => onChange(togglePick(picks, k, e.target.checked))} />
      {label}
    </label>
  );
  return (
    <div className="sc-newspace-picks">
      {pickSections(pages.filter((k) => PAGE.has(k))).map((sec) => (
        <Fragment key={sec.title}>
          <span className="sc-shelf-edit-h">{sec.title}</span>
          {sec.keys.map((k) => box(k, CHANNELS.find((c) => c.key === k)?.label ?? PAGE.get(k)!.label))}
        </Fragment>
      ))}
    </div>
  );
}

type Kind = (typeof SPACE_KINDS)[number]["kind"];
type ItemKind = SpacePin["kind"];
interface Option { kind: ItemKind; id: string; name: string; sub: string; status?: string | null }

const COLOR: Record<Kind, string> = {
  job: "var(--sc-hiviz)", customer: "var(--sc-chalk)", vendor: "var(--sc-bucket-vendor)", collection: "var(--sc-violet)",
};
const NOUN: Record<ItemKind, [string, string]> = { job: ["job", "jobs"], customer: ["customer", "customers"], vendor: ["vendor", "vendors"] };

// The lists, read once per visit and shared by every picker on the page.
const cache: Partial<Record<ItemKind, Promise<Option[]>>> = {};
function loadList(kind: ItemKind): Promise<Option[]> {
  if (cache[kind]) return cache[kind]!;
  const url = kind === "job" ? "/api/jobs" : kind === "customer" ? "/api/customers" : "/api/vendors";
  const p = fetch(url).then((r) => (r.ok ? r.json() : null)).then((j): Option[] => {
    if (!j) throw new Error("load");
    if (kind === "job") {
      return ((j.jobs ?? []) as Array<{ id: string; title: string | null; status: string | null; contact_name: string | null; city: string | null }>)
        .map((x) => ({ kind, id: x.id, name: x.title?.trim() || "Untitled job", status: x.status, sub: [stageLabel(x.status ?? ""), x.contact_name, x.city].filter(Boolean).join(" · ") }));
    }
    if (kind === "customer") {
      return ((j.customers ?? []) as Array<{ id: string; name: string | null; city?: string | null; customer_type?: string | null }>)
        .filter((c) => c.name).map((c) => ({ kind, id: c.id, name: c.name!, sub: [c.customer_type, c.city].filter(Boolean).join(" · ") }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return ((j.vendors ?? []) as Array<{ id: string; name: string | null; company_name?: string | null; subtype?: string | null }>)
      .map((v) => ({ kind, id: v.id, name: v.company_name || v.name || "", sub: v.company_name && v.name && v.name !== v.company_name ? v.name : (v.subtype ?? "") }))
      .filter((v) => v.name).sort((a, b) => a.name.localeCompare(b.name));
  });
  cache[kind] = p;
  p.catch(() => { delete cache[kind]; });
  return p;
}

function useLists(kinds: ItemKind[]) {
  const [lists, setLists] = useState<Partial<Record<ItemKind, Option[] | "error">>>({});
  const key = kinds.join(",");
  useEffect(() => {
    let off = false;
    for (const k of key.split(",") as ItemKind[]) {
      loadList(k).then((l) => { if (!off) setLists((o) => ({ ...o, [k]: l })); }).catch(() => { if (!off) setLists((o) => ({ ...o, [k]: "error" })); });
    }
    return () => { off = true; };
  }, [key]);
  return lists;
}

/**
 * A searchable list of jobs, customers and vendors, ticked several at a time. Used by New Space
 * and by a collection's drawer to change what it holds.
 */
export function ItemPicker({ kinds, picked, onChange, onNew, onRail }: {
  kinds: ItemKind[]; picked: SpacePin[]; onChange: (v: SpacePin[]) => void;
  /** "+ New …" at the top of the list, given the words typed. */
  onNew?: (kind: ItemKind, q: string) => void;
  /** Already on the rail, said beside its name. */
  onRail?: (kind: ItemKind, id: string) => boolean;
}) {
  const lists = useLists(kinds);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<ItemKind | "all">(kinds.length > 1 ? "all" : kinds[0]);
  const showKinds = only === "all" ? kinds : [only];
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const isOn = (o: Option) => picked.some((p) => p.kind === o.kind && p.id === o.id);
  const rows: Option[] = [];
  for (const k of showKinds) {
    const l = lists[k];
    if (!Array.isArray(l)) continue;
    rows.push(...l.filter((o) => words.every((w) => `${o.name} ${o.sub}`.toLowerCase().includes(w))));
  }
  const loading = showKinds.some((k) => lists[k] === undefined);
  const failed = showKinds.filter((k) => lists[k] === "error");
  const MAX = 200;
  return (
    <div className="sc-newspace-pick">
      <input className="sc-newspace-search" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${kinds.length > 1 ? "jobs, customers and vendors" : NOUN[kinds[0]][1]}`} aria-label="Search" />
      {kinds.length > 1 && (
        <div className="sc-newspace-chips" role="radiogroup" aria-label="Show">
          {(["all", ...kinds] as Array<ItemKind | "all">).map((k) => {
            const n = k === "all" ? picked.length : picked.filter((p) => p.kind === k).length;
            return (
              <button key={k} type="button" role="radio" aria-checked={only === k} data-on={only === k ? "" : undefined} onClick={() => setOnly(k)}>
                {k === "all" ? "All" : NOUN[k][1][0].toUpperCase() + NOUN[k][1].slice(1)}{n ? ` · ${n}` : ""}
              </button>
            );
          })}
        </div>
      )}
      <div className="sc-newspace-list" role="listbox" aria-multiselectable="true">
        {onNew && showKinds.length === 1 && (
          <button type="button" className="sc-newspace-row sc-newspace-new" onClick={() => onNew(showKinds[0], q.trim())}>
            <span className="sc-newspace-plus">+</span>
            <span className="sc-newspace-rn">
              {showKinds[0] === "job" ? "New job — open the New job form" : `New ${NOUN[showKinds[0]][0]}${q.trim() ? ` named “${q.trim()}”` : "…"}`}
            </span>
          </button>
        )}
        {rows.slice(0, MAX).map((o) => {
          const on = isOn(o);
          return (
            <label key={`${o.kind}:${o.id}`} className="sc-newspace-row" data-on={on ? "" : undefined} role="option" aria-selected={on}>
              <input type="checkbox" checked={on} onChange={(e) => onChange(toggleItem(picked, { kind: o.kind, id: o.id, name: o.name }, e.target.checked))} />
              <SpaceSilhouette kind={o.kind === "customer" ? "contact" : o.kind} size={26} initials={monogram(o.name)}
                color={o.kind === "job" ? stageColor(o.status ?? "") : o.kind === "customer" ? "var(--sc-chalk)" : "var(--sc-bucket-vendor)"} />
              <span className="sc-newspace-rn">
                <b>{o.name}</b>
                <small>{[kinds.length > 1 && only === "all" ? NOUN[o.kind][0] : "", o.sub, onRail?.(o.kind, o.id) ? "on the rail" : ""].filter(Boolean).join(" · ")}</small>
              </span>
            </label>
          );
        })}
        {rows.length > MAX && <div className="sc-space-empty">{rows.length - MAX} more — search to narrow.</div>}
        {loading && <div className="sc-space-empty">Loading…</div>}
        {failed.length > 0 && <div className="sc-space-empty">Couldn&apos;t load the {failed.map((k) => NOUN[k][1]).join(" or ")}.</div>}
        {!loading && rows.length === 0 && failed.length === 0 && <div className="sc-space-empty">{words.length ? "Nothing matches." : "None yet."}</div>}
      </div>
    </div>
  );
}

/** The people a collection's thread should hold for these jobs, customers and vendors. */
export async function peopleOf(items: SpacePin[]): Promise<string[]> {
  const ids = new Set(items.filter((i) => i.kind === "vendor").map((i) => i.id));
  const asks = items.filter((i) => i.kind !== "vendor").slice(0, 40).map((i) =>
    fetch(`/api/threads/custom?${i.kind === "job" ? "job" : "customer"}=${i.id}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { for (const p of (j?.preview ?? []) as Array<{ id: string }>) ids.add(p.id); }).catch(() => {}));
  await Promise.all(asks);
  return [...ids].slice(0, 500);
}

export function NewSpaceDialog({ onClose, onMade, openJobs = [] }: {
  onClose: () => void; onMade: () => void; pages?: string[];
  /** The open jobs already on the rail by default. */
  openJobs?: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<"name" | "pin">("name");
  const [back, setBack] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<SpacePin[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pinsRaw, setPins] = usePref<unknown>("spaces_pins", []);
  const pins = useMemo(() => cleanPins(pinsRaw), [pinsRaw]);
  const [railRaw, setRail] = usePref<unknown>("spaces_rail", {});
  const rail = useMemo(() => cleanRail(railRaw), [railRaw]);

  const goBack = () => { setBack(true); setStep("name"); setPicked([]); setErr(null); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const onRail = (k: ItemKind, id: string) => {
    const key = `${k}:${id}`;
    if (rail.hidden.includes(key)) return false;
    return pins.some((p) => p.kind === k && p.id === id) || (k === "job" && openJobs.includes(id));
  };

  const makeRecord = async (k: "customer" | "vendor", n: string): Promise<SpacePin> => {
    const r = await fetch(k === "customer" ? "/api/customers" : "/api/vendors", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }),
    });
    const j = await r.json().catch(() => ({}));
    const made = k === "customer" ? j.customer : j.vendor;
    if (!r.ok || !made?.id) throw new Error(j.error ?? `Couldn't make that ${k}.`);
    loadList(k).then((l) => l.push({ kind: k, id: made.id, name: made.name ?? n, sub: "new" })).catch(() => {});
    return { kind: k, id: made.id as string, name: (made.name as string) ?? n };
  };

  const onNew = async (k: ItemKind, q: string) => {
    setErr(null);
    if (k === "job") { onClose(); router.push("/dashboard/scope?new=1"); return; }
    const n = q || window.prompt(`Name the new ${k}`)?.trim() || "";
    if (!n) return;
    setBusy(true);
    try { const p = await makeRecord(k, n); setPicked((v) => toggleItem(v, p, true)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't make it."); }
    finally { setBusy(false); }
  };

  /** A blank Work Space: a thread with nobody on it, named. Its drawer opens on + Add. */
  const createBlank = async () => {
    if (!name.trim()) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/threads/custom", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), source: "manual", contact_ids: [] }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.thread) throw new Error(j.error ?? "Couldn't make it.");
      onMade(); onClose(); router.push(`/dashboard/messages?t=${j.thread.id as string}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't make it.");
    } finally {
      setBusy(false);
    }
  };

  const withDusty = () => {
    const n = name.trim();
    onClose();
    window.dispatchEvent(new Event("sc:dusty-open"));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("sc:dusty-draft", { detail: {
      text: `Help me build a new Work Space${n ? ` called "${n}"` : ""}. Ask me what it's for, then suggest the jobs, customers, vendors and tools to put in it and the shelves to group them on (by area, by phase …), as a work_space step I can apply.`,
      send: true,
    } })), 250);
  };

  const pinThem = () => {
    let next = pins;
    let nextRail = rail;
    for (const p of picked) {
      nextRail = showTile(nextRail, `${p.kind}:${p.id}`);
      if (!(p.kind === "job" && openJobs.includes(p.id))) next = addPin(next, p);
    }
    if (next !== pins) setPins(next);
    if (nextRail !== rail) setRail(nextRail);
    onMade(); onClose();
    if (picked.length === 1) {
      const p = picked[0];
      router.push(p.kind === "job" ? `/dashboard/scope/${p.id}/summary` : p.kind === "customer" ? `/dashboard/customers/${p.id}` : `/dashboard/vendors/${p.id}`);
    }
  };

  const n = picked.length;
  return (
    <div className="sc-newspace-scrim" onClick={onClose}>
      <div className="sc-newspace" role="dialog" aria-modal="true" aria-label="New Work Space" onClick={(e) => e.stopPropagation()}>
        {step === "name" ? (
          <div key="name" className="sc-newspace-step" data-from={back ? "left" : undefined}>
            <div className="sc-newspace-head">
              <span className="sc-newspace-title">
                <SpaceSilhouette kind="collection" color={COLOR.collection} initials={monogram(name || "New")} size={22} />
                New Work Space
              </span>
              <button type="button" className="sc-newspace-x" onClick={onClose} aria-label="Close">×</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void createBlank(); }} style={{ display: "contents" }}>
              <label className="sc-newspace-field">
                <span>Name</span>
                <input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="North shore customers" />
              </label>
              <p className="sc-newspace-blurb">It starts blank. Put jobs, customers, vendors and tools in it with + Add, and group them on shelves of your own.</p>
              {err && <p className="sc-newspace-err">{err}</p>}
              <div className="sc-newspace-foot">
                <button type="button" className="sc-space-more" onClick={withDusty} title="Dusty asks what it's for and builds it out">
                  <span aria-hidden>✦</span> Build it with Dusty
                </button>
                <span style={{ flex: 1 }} />
                <button type="submit" className="sc-newspace-go" disabled={!name.trim() || busy}>{busy ? "Working…" : "Create"}</button>
              </div>
            </form>
            <button type="button" className="sc-newspace-fold" onClick={() => { setBack(false); setStep("pin"); setErr(null); }}>
              Or pin a job, customer or vendor to the rail ›
            </button>
          </div>
        ) : (
          <div key="pin" className="sc-newspace-step" data-from="right">
            <div className="sc-newspace-head">
              <button type="button" className="sc-newspace-back" onClick={goBack} aria-label="Back">‹ Back</button>
              <span className="sc-newspace-title">Pin to Rail</span>
              <button type="button" className="sc-newspace-x" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="sc-newspace-field sc-newspace-grow">
              <ItemPicker kinds={["job", "customer", "vendor"]} picked={picked} onChange={setPicked} onRail={onRail} onNew={(k, q) => void onNew(k, q)} />
            </div>
            {err && <p className="sc-newspace-err">{err}</p>}
            <div className="sc-newspace-foot">
              {n > 0 && <span className="sc-newspace-count">{n} picked</span>}
              <span style={{ flex: 1 }} />
              <button type="button" className="sc-space-more" onClick={onClose}>Cancel</button>
              <button type="button" className="sc-newspace-go" disabled={!n || busy} onClick={pinThem}>
                {busy ? "Working…" : n === 1 ? `Pin ${picked[0].name} to Rail` : `Pin ${n || ""} to Rail`.replace("  ", " ")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
