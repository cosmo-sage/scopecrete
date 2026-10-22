"use client";

/**
 * New Space (Claude Design "Dusty Home" frame 18; Coy, 2026-10-18). Two steps:
 *   1. the kind — Job · Customer · Vendor · Collection;
 *   2. slides to a searchable list of that kind, ticked several at a time (Coy: "it should
 *      slide to the next selection window (providing a back button at the top left) … I am
 *      able to select multiple vendors, and multiple customers and multiple jobs"):
 *      - Jobs, customers, vendors → each one ticked goes on the rail (`spaces_pins`, an open
 *        job already there is put back if it was taken off); + New makes one (a job opens the
 *        New job form; a customer or vendor is made through + New customer's / + Vendor's route).
 *      - Collection → a name, any number of jobs, customers and vendors (`spaces_col_members`,
 *        their people put on its thread, migration 073), and the tools and channels to keep
 *        beside them (`spaces_collections`).
 * On a phone it is the whole screen, × at the top right. No migration.
 */

import React, { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SpaceSilhouette } from "@/components/v34/spaces/space-silhouette";
import { usePref } from "@/lib/v34/prefs";
import { PAGE } from "@/lib/v34/pages";
import {
  SPACE_KINDS, CHANNELS, pickSections, addPin, cleanPins, cleanCollectionPicks, cleanMembers, monogram, setPicks, setMembers,
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
const SHAPE: Record<Kind, "job" | "contact" | "vendor" | "collection"> = { job: "job", customer: "contact", vendor: "vendor", collection: "collection" };
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

export function NewSpaceDialog({ onClose, onMade, pages, openJobs = [] }: {
  onClose: () => void; onMade: () => void; pages: string[];
  /** The open jobs already on the rail by default. */
  openJobs?: string[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [back, setBack] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<SpacePin[]>([]);
  const [picks, setPickList] = useState<string[]>([]);
  const [showTools, setShowTools] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pinsRaw, setPins] = usePref<unknown>("spaces_pins", []);
  const pins = useMemo(() => cleanPins(pinsRaw), [pinsRaw]);
  const [colRaw, setCol] = usePref<unknown>("spaces_collections", {});
  const [memRaw, setMem] = usePref<unknown>("spaces_col_members", {});
  const [railRaw, setRail] = usePref<unknown>("spaces_rail", {});
  const rail = useMemo(() => cleanRail(railRaw), [railRaw]);

  const goBack = () => { setBack(true); setKind(null); setPicked([]); setErr(null); };
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

  const create = async () => {
    if (!kind) return;
    setErr(null);
    setBusy(true);
    try {
      if (kind === "collection") {
        const contact_ids = await peopleOf(picked);
        const r = await fetch("/api/threads/custom", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), source: "manual", contact_ids }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.thread) throw new Error(j.error ?? "Couldn't make it.");
        const id = j.thread.id as string;
        if (picks.length) setCol(setPicks(cleanCollectionPicks(colRaw), id, picks));
        if (picked.length) setMem(setMembers(cleanMembers(memRaw), id, picked));
        onMade(); onClose(); router.push(`/dashboard/messages?t=${id}`);
        return;
      }
      // Jobs, customers, vendors: every one ticked goes on the rail.
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't make it.");
    } finally {
      setBusy(false);
    }
  };

  const meta = kind ? SPACE_KINDS.find((k) => k.kind === kind)! : null;
  const canCreate = kind === "collection" ? !!name.trim() : picked.length > 0;
  const n = picked.length;
  const goLabel = busy ? "Working…" : kind === "collection"
    ? `Create Work Space${n ? ` · ${n}` : ""}`
    : n === 1 ? `Add ${picked[0].name} to the rail` : `Add ${n || ""} ${NOUN[(kind ?? "job") as ItemKind][n === 1 ? 0 : 1]} to the rail`.replace("  ", " ");

  return (
    <div className="sc-newspace-scrim" onClick={onClose}>
      <div className="sc-newspace" role="dialog" aria-modal="true" aria-label="New Work Space" onClick={(e) => e.stopPropagation()}>
        {!kind ? (
          <div key="kind" className="sc-newspace-step" data-from={back ? "left" : undefined}>
            <div className="sc-newspace-head">
              <span className="sc-newspace-title">New Work Space</span>
              <button type="button" className="sc-newspace-x" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="sc-newspace-kinds" role="list" aria-label="What kind of Work Space">
              {SPACE_KINDS.map((k) => (
                <button key={k.kind} type="button" role="listitem" className="sc-newspace-kind"
                  onClick={() => { setBack(false); setKind(k.kind); setPicked([]); setErr(null); }}>
                  <SpaceSilhouette kind={SHAPE[k.kind]} color={COLOR[k.kind]} initials={monogram(k.label)} size={40} />
                  <span className="sc-newspace-kl">{k.label}</span>
                  <span className="sc-newspace-ks">{k.shelves}</span>
                </button>
              ))}
            </div>
            <p className="sc-newspace-blurb">Pick what kind of Work Space, then pick one or several to put on the rail.</p>
          </div>
        ) : (
          <div key={kind} className="sc-newspace-step" data-from="right">
            <div className="sc-newspace-head">
              <button type="button" className="sc-newspace-back" onClick={goBack} aria-label="Back">‹ Back</button>
              <span className="sc-newspace-title">
                <SpaceSilhouette kind={SHAPE[kind]} color={COLOR[kind]} initials={monogram(name || meta!.label)} size={22} />
                {kind === "collection" ? "Your own Work Space" : `${meta!.label} Work Spaces`}
              </span>
              <button type="button" className="sc-newspace-x" onClick={onClose} aria-label="Close">×</button>
            </div>
            {kind === "collection" ? (
              <>
                <label className="sc-newspace-field">
                  <span>Name</span>
                  <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Fort Polk crew" />
                </label>
                <div className="sc-newspace-field sc-newspace-grow">
                  <span>Jobs, customers and vendors in it</span>
                  <ItemPicker kinds={["job", "customer", "vendor"]} picked={picked} onChange={setPicked} />
                </div>
                <div className="sc-newspace-field">
                  <button type="button" className="sc-newspace-fold" onClick={() => setShowTools(!showTools)} aria-expanded={showTools}>
                    {showTools ? "▾" : "▸"} Tools &amp; people{picks.length ? ` · ${picks.length}` : ""}
                  </button>
                  {showTools && <PickList pages={pages} picks={picks} onChange={setPickList} />}
                </div>
              </>
            ) : (
              <div className="sc-newspace-field sc-newspace-grow">
                <ItemPicker kinds={[kind]} picked={picked} onChange={setPicked} onRail={onRail} onNew={(k, q) => void onNew(k, q)} />
              </div>
            )}
            {err && <p className="sc-newspace-err">{err}</p>}
            <div className="sc-newspace-foot">
              {n > 0 && <span className="sc-newspace-count">{n} picked</span>}
              <span style={{ flex: 1 }} />
              <button type="button" className="sc-space-more" onClick={onClose}>Cancel</button>
              <button type="button" className="sc-newspace-go" disabled={!canCreate || busy} onClick={() => void create()}>{goLabel}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
