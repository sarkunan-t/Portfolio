// ===== UnicornHunter / Markets Suite — price-target Edge Function =====
// Wall Street analyst consensus for US stocks (the same kind of data TradingView shows on its Forecast page),
// from Yahoo Finance's quoteSummary "financialData" module. Used by More → Triage & confirmation.
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → name it  price-target
//         → paste this file → Deploy. Keep "Verify JWT" ON.
// Call:   { symbols: ['NVDA','PLTR'] }   (max 25)
// Reply:  { "NVDA": { mean, median, high, low, analysts, rating, ratingMean, currency, price }, ... }
//         or { "XYZ": { error: "..." } } — e.g. no analyst coverage.

const SYMBOL = /^[A-Z0-9.\-]{1,12}$/;
const MAX_SYMBOLS = 25;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Yahoo's quoteSummary needs a session cookie + "crumb". Cached while the function instance is warm.
let session: { cookie: string; crumb: string; at: number } | null = null;
async function getSession(force = false) {
  if (!force && session && Date.now() - session.at < 30 * 60 * 1000) return session;
  const r1 = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": UA }, redirect: "manual" });
  const cookies = (r1.headers.getSetCookie?.() ?? [r1.headers.get("set-cookie") ?? ""])
    .map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  await r1.body?.cancel();
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, cookie: cookies } });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.length > 40 || crumb.includes("<")) throw new Error(`Yahoo session failed (${r2.status})`);
  session = { cookie: cookies, crumb, at: Date.now() };
  return session;
}

const raw = (v: any) => (v && typeof v === "object" ? v.raw ?? null : v ?? null);

async function target(symbol: string, retry = true): Promise<Record<string, unknown>> {
  const s = await getSession();
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    `?modules=financialData&crumb=${encodeURIComponent(s.crumb)}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, cookie: s.cookie, Accept: "application/json" } });
  if ((r.status === 401 || r.status === 403) && retry) { await getSession(true); return target(symbol, false); }
  if (r.status === 404) return { error: "Unknown symbol" };
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const d = await r.json();
  const f = d?.quoteSummary?.result?.[0]?.financialData;
  if (!f) return { error: d?.quoteSummary?.error?.description || "No data" };
  const out = {
    mean: raw(f.targetMeanPrice), median: raw(f.targetMedianPrice), high: raw(f.targetHighPrice), low: raw(f.targetLowPrice),
    analysts: raw(f.numberOfAnalystOpinions), rating: f.recommendationKey ?? null, ratingMean: raw(f.recommendationMean),
    currency: f.financialCurrency ?? null, price: raw(f.currentPrice),
  };
  if (out.mean == null) return { ...out, error: "No analyst price target" };
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { symbols = [] } = await req.json();
    const list = [...new Set((symbols as string[]).map((s) => String(s).toUpperCase().trim()))]
      .filter((s) => SYMBOL.test(s)).slice(0, MAX_SYMBOLS);
    if (!list.length) return json({ error: "No valid symbols" }, 400);
    const out: Record<string, unknown> = {};
    for (let i = 0; i < list.length; i += 5) {          // a few at a time so Yahoo doesn't rate-limit us
      await Promise.all(list.slice(i, i + 5).map(async (s) => {
        try { out[s] = await target(s); } catch (e) { out[s] = { error: String((e as Error).message || e) }; }
      }));
    }
    return json(out);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
