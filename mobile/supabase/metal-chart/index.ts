// ===== UnicornHunter — metal-chart Edge Function =====
// Price history for the Metals → Market charts (Yahoo Finance, same source as prices).
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → Via editor →
//         name it  metal-chart  → paste this file → Deploy. Keep "Verify JWT" ON.
// Call:   sb.functions.invoke('metal-chart', { body: { symbols: ['GC=F','USDMYR=X'], range: '2y' } })
// Reply:  { "GC=F": { points: [[unixSeconds, close], ...], currency, price, prevClose, high52, low52 }, ... }

const ALLOWED = new Set(["GC=F", "SI=F", "PL=F", "PA=F", "USDMYR=X"]);
const INTERVAL: Record<string, string> = { "1mo": "1d", "6mo": "1d", "1y": "1d", "2y": "1d", "5y": "1wk", "10y": "1mo", "max": "1mo" };
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function history(symbol: string, range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=${INTERVAL[range]}&includePrePost=false&events=div%2Csplit`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (UnicornHunter)", "Accept": "application/json" } });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const d = await r.json();
  const res = d?.chart?.result?.[0];
  if (!res) throw new Error(d?.chart?.error?.description || "No data");
  const ts: number[] = res.timestamp || [];
  const close: (number | null)[] = res.indicators?.quote?.[0]?.close || [];
  const points: [number, number][] = [];
  ts.forEach((t, i) => { const c = close[i]; if (c != null && isFinite(c)) points.push([t, Math.round(c * 10000) / 10000]); });
  const m = res.meta || {};
  return {
    points,
    currency: m.currency ?? null,
    price: m.regularMarketPrice ?? null,
    prevClose: m.chartPreviousClose ?? m.previousClose ?? null,
    high52: m.fiftyTwoWeekHigh ?? null,
    low52: m.fiftyTwoWeekLow ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { symbols = [], range = "2y" } = await req.json();
    if (!INTERVAL[range]) return json({ error: "Unsupported range" }, 400);
    const list = [...new Set((symbols as string[]).map((s) => String(s).toUpperCase()))].filter((s) => ALLOWED.has(s)).slice(0, 5);
    if (!list.length) return json({ error: "No supported symbols" }, 400);
    const out: Record<string, unknown> = {};
    await Promise.all(list.map(async (s) => {
      try { out[s] = await history(s, range); } catch (e) { out[s] = { error: String((e as Error).message || e) }; }
    }));
    return json(out);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
