// ===== UnicornHunter — metal-chart Edge Function (price history) =====
// Daily/weekly price history from Yahoo Finance for:
//   • Metals → Market charts   { symbols: ['GC=F','USDMYR=X'], range: '2y' }
//   • Home → Net worth trend    { symbols: ['1155.KL','AAPL','GC=F','USDMYR=X', ...], from: <unix seconds> }
// Deploy: Supabase Dashboard → Edge Functions → metal-chart → Code → paste this file → Deploy. Keep "Verify JWT" ON.
// Reply:  { "GC=F": { points: [[unixSeconds, close], ...], currency, price, prevClose, high52, low52 }, ... }

const SYMBOL = /^[A-Z0-9.\-=^]{1,20}$/;
const MAX_SYMBOLS = 60;
const INTERVAL: Record<string, string> = { "1mo": "1d", "6mo": "1d", "1y": "1d", "2y": "1d", "5y": "1wk", "10y": "1mo", "max": "1mo" };
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function history(symbol: string, q: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${q}&includePrePost=false`;
  let r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (UnicornHunter)", "Accept": "application/json" } });
  if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 1200)); r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (UnicornHunter)" } }); }
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
    const { symbols = [], range = "2y", from } = await req.json();
    let q: string;
    if (from != null) {
      const p1 = Math.max(0, Math.floor(Number(from)));
      if (!isFinite(p1)) return json({ error: "Bad from" }, 400);
      q = `period1=${p1}&period2=${Math.floor(Date.now() / 1000) + 86400}&interval=1d`;
    } else {
      if (!INTERVAL[range]) return json({ error: "Unsupported range" }, 400);
      q = `range=${range}&interval=${INTERVAL[range]}`;
    }
    const list = [...new Set((symbols as string[]).map((s) => String(s).toUpperCase().trim()))].filter((s) => SYMBOL.test(s)).slice(0, MAX_SYMBOLS);
    if (!list.length) return json({ error: "No valid symbols" }, 400);
    const out: Record<string, unknown> = {};
    // a few at a time so Yahoo doesn't rate-limit us
    for (let i = 0; i < list.length; i += 6) {
      await Promise.all(list.slice(i, i + 6).map(async (s) => {
        try { out[s] = await history(s, q); } catch (e) { out[s] = { error: String((e as Error).message || e) }; }
      }));
    }
    return json(out);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
