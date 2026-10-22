/**
 * What Dusty made in a chat, for the artifacts column beside him (Coy, 2026-10-19: "selecting the
 * Dusty Home in the rail should open up dusty chat in the main window with the right panel becoming
 * an artifacts panel"). Read off the chat itself — nothing is stored apart from the conversation:
 * each plan he wrote, the words he boxed for a page, every table, the files that came with a
 * question, and the links in his answers. Pure — tests/dusty-artifacts.test.mjs runs it.
 */
import { parsePlan } from "./plan.ts";
import { splitUse } from "./use-block.ts";
import { parseDrawing } from "./drawing.ts";

export type ArtifactKind = "plan" | "words" | "table" | "drawing" | "file" | "link";
export interface Artifact {
  /** Stable within the chat: "<turn>:<kind>:<n>". */
  key: string;
  kind: ArtifactKind;
  /** The turn it came from, for "Show it in the chat". */
  turn: number;
  title: string;
  /** One line under the title. */
  sub: string;
  /** Markdown shown when it is opened (a table, the boxed words, the plan's steps by kind). */
  body?: string;
  /** Where a file or link opens. */
  href?: string;
  /** A file's picture, when it has one. */
  thumb?: string | null;
}

type Turn = { role: "user" | "assistant"; content: string; files?: Array<{ id: string; name: string; kind?: string; url: string | null }> };

const STEP_WORDS: Record<string, string> = {
  add: "budget line", add_group: "group on the budget", new_item: "new item", update_item: "item change", new_group: "new group",
  new_area: "new section", retire_item: "item retired", rename_group: "group renamed", remove_group: "group removed",
  new_assembly: "new assembly", add_to_assembly: "assembly item", remove_from_assembly: "assembly item removed",
  load_assembly: "assembly loaded", set_tax: "tax rate", vendor_price: "vendor price", new_vendor: "new vendor",
  archive: "archive", restore: "restore", set_address: "address", new_job: "new job", new_customer: "new customer",
  attach_contact: "person on a customer", new_contact: "new contact", set_name: "name", file: "file filed",
  file_email: "email filed", text: "text", email: "email draft", send_proposal: "proposal to send",
  appointment: "appointment", update_appointment: "appointment change", work_space: "Work Space",
};

/** "budget line ×3 · new item" — what a plan holds, by kind of step. */
export function planSummary(dos: string[]): string {
  const n = new Map<string, number>();
  for (const d of dos) n.set(d, (n.get(d) ?? 0) + 1);
  return [...n].map(([d, c]) => `${STEP_WORDS[d] ?? d.replace(/_/g, " ")}${c > 1 ? ` ×${c}` : ""}`).join(" · ");
}

/** Markdown tables in an answer: a header row, its rule, and the rows under them. */
export function tablesIn(text: string): string[] {
  const out: string[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\s*\|.*\|\s*$/.test(lines[i]) || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    let j = i + 2;
    while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) j++;
    out.push(lines.slice(i, j).join("\n"));
    i = j - 1;
  }
  return out;
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.replace(/\*\*/g, "").trim());

/** Links in an answer: web pages and the app's own pages, each once, with the words they were linked by. */
export function linksIn(text: string): Array<{ href: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ href: string; label: string }> = [];
  const put = (href: string, label: string) => {
    const h = href.replace(/[).,;:!?'"]+$/, "");
    if (seen.has(h)) return;
    seen.add(h);
    out.push({ href: h, label: label.trim() || h });
  };
  const md = /\[([^\]]{1,120})\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = md.exec(text))) put(m[2], m[1]);
  const bare = text.replace(md, " ");
  const url = /\bhttps?:\/\/[^\s<>()\]]+/g;
  while ((m = url.exec(bare))) put(m[0], hostOf(m[0]));
  return out;
}
const hostOf = (u: string) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, "") + (x.pathname.length > 1 ? x.pathname : ""); } catch { return u; } };

/** Every artifact in a chat, newest first. A turn still streaming is left out. */
export function artifactsOf(items: Turn[], opts: { streaming?: number | null } = {}): Artifact[] {
  const out: Artifact[] = [];
  items.forEach((it, i) => {
    if (i === opts.streaming) return;
    if (it.role === "user") {
      for (const f of it.files ?? []) {
        out.push({ key: `${i}:file:${f.id}`, kind: "file", turn: i, title: f.name, sub: f.kind === "image" ? "Photo you sent" : "File you sent",
          href: `/dashboard/files?file=${f.id}`, thumb: f.kind === "image" ? f.url : null });
      }
      return;
    }
    const p = parsePlan(it.content);
    if (p.actions.length) {
      const dos = p.actions.map((a) => a.do);
      out.push({ key: `${i}:plan:0`, kind: "plan", turn: i, title: `Plan · ${dos.length} step${dos.length === 1 ? "" : "s"}`, sub: planSummary(dos),
        body: dos.map((d, n) => `${n + 1}. ${STEP_WORDS[d] ?? d.replace(/_/g, " ")}`).join("\n") });
    }
    const u = splitUse(p.shown);
    if (u.box) {
      const first = u.box.split("\n").find((l) => l.trim()) ?? "";
      out.push({ key: `${i}:words:0`, kind: "words", turn: i, title: "Words for the page", sub: first.replace(/^[-*•]\s*/, "").slice(0, 90), body: u.box });
    }
    // Drawings (a ```drawing block of plain SVG shapes), taken out before tables and links so a
    // drawing's xmlns never lands in Links.
    const DRAW = /```(?:drawing|svg)[^\n]*\n([\s\S]*?)```/g;
    let nd = 0;
    for (const m of p.shown.matchAll(DRAW)) {
      const d = parseDrawing(m[1]);
      if (!d) continue;
      out.push({ key: `${i}:drawing:${nd++}`, kind: "drawing", turn: i, title: d.title, sub: "Drawing", body: "```drawing\n" + m[1] + "\n```" });
    }
    const prose = p.shown.replace(DRAW, " ");
    tablesIn(prose).forEach((t, n) => {
      const rows = t.split("\n");
      const head = cells(rows[0]).filter(Boolean);
      out.push({ key: `${i}:table:${n}`, kind: "table", turn: i, title: head.slice(0, 3).join(" · ") || "Table",
        sub: `${rows.length - 2} row${rows.length - 2 === 1 ? "" : "s"}`, body: t });
    });
    linksIn(prose).forEach((l, n) => {
      const app = l.href.startsWith("/");
      out.push({ key: `${i}:link:${n}`, kind: "link", turn: i, title: l.label, sub: app ? "In ScopeCrete" : hostOf(l.href).split("/")[0], href: l.href });
    });
  });
  return out.reverse();
}

export const ARTIFACT_KINDS: Array<{ k: "all" | ArtifactKind; label: string }> = [
  { k: "all", label: "All" }, { k: "plan", label: "Plans" }, { k: "table", label: "Tables" },
  { k: "drawing", label: "Drawings" },
  { k: "words", label: "Words" }, { k: "file", label: "Files" }, { k: "link", label: "Links" },
];
