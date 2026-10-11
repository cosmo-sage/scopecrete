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

async function tavily(q: string, key: string, domain?: string | null): Promise<WebResult[]> {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: q, search_depth: "basic", max_results: 8, include_answer: false, country: "united states", ...(domain ? { include_domains: [domain] } : {}) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Tavily refused the key" : r.status === 429 || r.status === 432 ? "Tavily's monthly searches are used up" : `Tavily answered ${r.status}`);
  const b = (await r.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (b.results ?? []).filter((x) => x.url).map((x) => ({ title: x.title ?? x.url!, url: x.url!, text: x.content ?? "" }));
}

async function brave(q: string, key: string, domain?: string | null): Promise<WebResult[]> {
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(domain ? `${q} site:${domain}` : q)}&count=10&country=us`, {
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

/** Runs each query (a query may be kept to one site); the results merged, one per page. An error names what Coy can do about it. */
export async function searchWeb(queries: Array<string | { q: string; domain: string | null }>, cap = 12): Promise<{ results: WebResult[]; error: string | null; provider: string | null }> {
  const tk = process.env.TAVILY_API_KEY, bk = process.env.BRAVE_SEARCH_API_KEY;
  if (!tk && !bk) {
    return { results: [], provider: null, error: "web search isn't switched on yet — it needs a search key in Vercel: TAVILY_API_KEY (free at tavily.com) or BRAVE_SEARCH_API_KEY." };
  }
  const run = (x: string | { q: string; domain: string | null }) => {
    const { q, domain } = typeof x === "string" ? { q: x, domain: null } : x;
    return tk ? tavily(q, tk, domain) : brave(q, bk!, domain);
  };
  const settled = await Promise.allSettled(queries.map(run));
  const lists = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  const failed = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
  if (!lists.length && failed) {
    const why = failed.reason instanceof Error ? (failed.reason.name === "TimeoutError" ? "the search took too long" : failed.reason.message) : "the search failed";
    console.error("web search", why);
    return { results: [], provider: tk ? "tavily" : "brave", error: why };
  }
  return { results: mergeResults(lists, cap), provider: tk ? "tavily" : "brave", error: null };
}

/** Reads pages with Tavily Extract (the same TAVILY_API_KEY). Only the links leave the app. */
export async function readPages(urls: string[]): Promise<{ pages: Array<{ url: string; text: string }>; failed: Array<{ url: string; error: string }>; error: string | null }> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return { pages: [], failed: [], error: "reading websites needs TAVILY_API_KEY in Vercel (free at tavily.com)." };
  if (!urls.length) return { pages: [], failed: [], error: null };
  try {
    const r = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ urls, extract_depth: "basic", format: "markdown", include_images: false }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      const why = r.status === 401 || r.status === 403 ? "Tavily refused the key" : r.status === 429 || r.status === 432 ? "Tavily's monthly credits are used up" : `Tavily answered ${r.status}`;
      return { pages: [], failed: [], error: why };
    }
    const b = (await r.json()) as { results?: Array<{ url?: string; raw_content?: string }>; failed_results?: Array<{ url?: string; error?: string }> };
    return {
      pages: (b.results ?? []).filter((x) => x.url).map((x) => ({ url: x.url!, text: x.raw_content ?? "" })),
      failed: (b.failed_results ?? []).filter((x) => x.url).map((x) => ({ url: x.url!, error: (x.error ?? "no text").slice(0, 120) })),
      error: null,
    };
  } catch (e) {
    const why = e instanceof Error && e.name === "TimeoutError" ? "the site took too long" : "reading the site failed";
    console.error("web extract", why);
    return { pages: [], failed: [], error: why };
  }
}
