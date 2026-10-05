import { mergeResults, type WebResult } from "@/lib/dusty/web";

/**
 * A web search for Dusty (src/lib/dusty/web.ts), run by the app — never by the
 * model. Server only; the key never reaches a browser.
 *
 *   TAVILY_API_KEY        — Tavily (tavily.com; 1,000 free searches a month), preferred
 *   BRAVE_SEARCH_API_KEY  — Brave Search API, used when Tavily's key isn't set
 *
 * Only the search words leave the app — never a customer's name, number or words.
 */

const TIMEOUT_MS = 12_000;

export function webSearchConfigured(): boolean {
  return !!(process.env.TAVILY_API_KEY || process.env.BRAVE_SEARCH_API_KEY);
}

async function tavily(q: string, key: string): Promise<WebResult[]> {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: q, search_depth: "basic", max_results: 8, include_answer: false, country: "united states" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Tavily refused the key" : r.status === 429 || r.status === 432 ? "Tavily's monthly searches are used up" : `Tavily answered ${r.status}`);
  const b = (await r.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (b.results ?? []).filter((x) => x.url).map((x) => ({ title: x.title ?? x.url!, url: x.url!, text: x.content ?? "" }));
}

async function brave(q: string, key: string): Promise<WebResult[]> {
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10&country=us`, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Brave refused the key" : r.status === 429 ? "Brave's searches are used up" : `Brave answered ${r.status}`);
  const b = (await r.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string; extra_snippets?: string[] }> } };
  const strip = (s: string) => s.replace(/<[^>]+>/g, "");
  return (b.web?.results ?? []).filter((x) => x.url).map((x) => ({
    title: strip(x.title ?? x.url!), url: x.url!, text: strip([x.description ?? "", ...(x.extra_snippets ?? [])].join(" ")),
  }));
}

/** Runs each query; the results merged, one per page. An error names what Coy can do about it. */
export async function searchWeb(queries: string[]): Promise<{ results: WebResult[]; error: string | null; provider: string | null }> {
  const tk = process.env.TAVILY_API_KEY, bk = process.env.BRAVE_SEARCH_API_KEY;
  if (!tk && !bk) {
    return { results: [], provider: null, error: "web search isn't switched on yet — it needs a search key in Vercel: TAVILY_API_KEY (free at tavily.com) or BRAVE_SEARCH_API_KEY." };
  }
  const run = tk ? (q: string) => tavily(q, tk) : (q: string) => brave(q, bk!);
  const settled = await Promise.allSettled(queries.map(run));
  const lists = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  const failed = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
  if (!lists.length && failed) {
    const why = failed.reason instanceof Error ? (failed.reason.name === "TimeoutError" ? "the search took too long" : failed.reason.message) : "the search failed";
    console.error("web search", why);
    return { results: [], provider: tk ? "tavily" : "brave", error: why };
  }
  return { results: mergeResults(lists, 12), provider: tk ? "tavily" : "brave", error: null };
}
