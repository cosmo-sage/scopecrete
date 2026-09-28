/**
 * One non-streamed question to Hermes (DECISIONS §8), server side only — for
 * the small structured jobs, like turning a dictated note into section fields.
 * /api/dusty keeps its own streaming call. HERMES_API_KEY is never logged.
 */

const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

export async function hermesJson(system: string, user: string, timeoutMs = 45_000):
  Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; code: "not_connected" | "upstream"; error: string }> {
  const base = process.env.HERMES_URL?.replace(/\/+$/, "");
  const key = process.env.HERMES_API_KEY;
  if (!base || !key) return { ok: false, code: "not_connected", error: "Dusty isn't connected (HERMES_URL / HERMES_API_KEY)." };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}/v1/chat/completions`, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.HERMES_MODEL || DEFAULT_MODEL, stream: false, temperature: 0, max_tokens: 600,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!r.ok) return { ok: false, code: "upstream", error: r.status === 401 || r.status === 403 ? "Hermes rejected the key" : `Hermes returned ${r.status}` };
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const m = (j.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, code: "upstream", error: "Dusty's answer had no JSON in it" };
    return { ok: true, json: JSON.parse(m[0]) as Record<string, unknown> };
  } catch (e) {
    return { ok: false, code: "upstream", error: (e as Error).name === "AbortError" ? "Hermes took too long" : "couldn't reach Hermes" };
  } finally {
    clearTimeout(timer);
  }
}
