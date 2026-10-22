/**
 * Bulk edit and delete on the list pages (Coy, 2026-10-22: "i need to be able to
 * bulk edit / delete vendors, customers, jobs and contacts"). Pure — tested in
 * tests/bulk.test.mjs.
 *
 * An edit is the same one-record PATCH the record's own page sends, run for each
 * ticked row a few at a time; a delete is one /api/archive call (restorable, Undo).
 */

export interface BulkResult { ok: string[]; failed: Array<{ id: string; error: string }> }

/** Run `fn` for every id, `limit` at a time; a failure is kept with its reason, never stops the rest. */
export async function runEach(ids: string[], fn: (id: string) => Promise<unknown>, limit = 4, onStep?: (done: number) => void): Promise<BulkResult> {
  const out: BulkResult = { ok: [], failed: [] };
  let next = 0, done = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try { await fn(id); out.ok.push(id); }
      catch (e) { out.failed.push({ id, error: e instanceof Error ? e.message : String(e) }); }
      done++; onStep?.(done);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, ids.length)) }, worker));
  return out;
}

/** "Set 4 customers to Commercial" · "Set 3 of 4 … — 1 couldn't be changed: …". */
export function bulkLabel(r: BulkResult, what: [string, string], did: string): string {
  const n = r.ok.length + r.failed.length;
  const noun = (k: number) => (k === 1 ? what[0] : what[1]);
  if (!r.failed.length) return `${did.replace("{n}", `${n} ${noun(n)}`)}`;
  const head = did.replace("{n}", `${r.ok.length} of ${n} ${noun(n)}`);
  return `${head} — ${r.failed.length} couldn't be changed: ${r.failed[0].error}`;
}

/** A vendor's trades with one added or taken off (case kept as the list has it). */
export function withTrade(trades: string[] | null | undefined, trade: string, on: boolean): string[] {
  const list = (trades ?? []).filter((t) => t.toLowerCase() !== trade.toLowerCase());
  return on ? [...list, trade] : list;
}
