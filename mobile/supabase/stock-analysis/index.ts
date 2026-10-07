// ===== UnicornHunter / Markets Suite — stock-analysis Edge Function =====
// Powers More → Quote lookup → Chart & analysis.
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → name it  stock-analysis
//         → paste this file → Deploy. Keep "Verify JWT" ON (only signed-in you can call it).
//
// 1) { action: "data", symbol: "NVDA" }
//    → { symbol, bars: [[t, open, high, low, close, volume], ...]  (5 years, daily),
//        bench: { symbol: "^GSPC" | "^KLSE", points: [[t, close], ...] },
//        meta: { currency, exchange, name, price, prevClose, high52, low52 },
//        stats: { marketCap, pe, forwardPe, peg, eps, divYield, beta, profitMargin, revenueGrowth, earningsGrowth,
//                 debtToEquity, roe, sector, industry, earningsDate, target, targetHigh, targetLow, analysts, rating, ... } }
//
// 3) { action: "ext", symbols: ["NVDA","AAPL"] }   (US stocks; max 40)
//    → { NVDA: { state: "PRE"|"REGULAR"|"POST"|"CLOSED"…, prevClose, regular, regularTime,
//                pre: { price, change, pct, time } | null, post: { price, change, pct, time } | null }, … }
//    Pre-market (4:00–9:30 am New York) and after-hours (4:00–8:00 pm) prices for Open positions.
//
// 4) { action: "search", q: "MAYBANK", market: "KL" | "US" | "" }
//    → { results: [{ symbol: "1155.KL", name: "MAYBANK", longName: "Malayan Banking Berhad", exchange: "KLS" }, …] }
//    Finds the Yahoo symbol for a Bursa short name (MAYBANK → 1155.KL) or a company name (nvidia → NVDA).
//
// 2) { action: "ai", symbol: "NVDA", facts: { ... } }   (facts = the numbers the app already computed)
//    → { text: "…markdown-ish analysis…", model }
//    Needs the secret ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets). Without it the reply is
//    { error: "AI not set up" } and the app simply shows its own rule-based read.

const MODEL = "claude-sonnet-5-5";   // swap for "claude-haiku-4-5-20251001" for a cheaper, shorter read
const SYMBOL = /^[A-Z0-9.\-=^]{1,20}$/;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- price history (Yahoo chart API, no key needed) ----------
async function chart(symbol: string, q: string) {
  for (const host of ["query1", "query2"]) {
    const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${q}${q.includes("includePrePost") ? "" : "&includePrePost=false"}&events=div%2Csplit`,
      { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!r.ok) { await r.body?.cancel(); continue; }
    const d = await r.json();
    const res = d?.chart?.result?.[0];
    if (res) return res;
  }
  throw new Error("No price history for " + symbol);
}

async function history(symbol: string) {
  const res = await chart(symbol, "range=5y&interval=1d");
  const ts: number[] = res.timestamp || [];
  const qd = res.indicators?.quote?.[0] || {};
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  const bars: number[][] = [];
  ts.forEach((t, i) => {
    const c = qd.close?.[i];
    if (c == null || !isFinite(c)) return;
    const o = qd.open?.[i] ?? c, h = qd.high?.[i] ?? c, l = qd.low?.[i] ?? c, v = qd.volume?.[i] ?? 0;
    bars.push([t, r4(o), r4(h), r4(l), r4(c), Math.round(v || 0)]);
  });
  const m = res.meta || {};
  return {
    bars,
    meta: {
      currency: m.currency ?? null, exchange: m.fullExchangeName ?? m.exchangeName ?? null,
      name: m.longName ?? m.shortName ?? null, price: m.regularMarketPrice ?? null,
      prevClose: m.chartPreviousClose ?? m.previousClose ?? null,
      high52: m.fiftyTwoWeekHigh ?? null, low52: m.fiftyTwoWeekLow ?? null,
      marketTime: m.regularMarketTime ?? null,
    },
  };
}

async function benchmark(symbol: string) {
  const res = await chart(symbol, "range=5y&interval=1d");
  const ts: number[] = res.timestamp || [];
  const c: (number | null)[] = res.indicators?.quote?.[0]?.close || [];
  const points: [number, number][] = [];
  ts.forEach((t, i) => { const v = c[i]; if (v != null && isFinite(v)) points.push([t, Math.round(v * 100) / 100]); });
  return { symbol, points };
}

// ---------- fundamentals (Yahoo quoteSummary needs cookie + crumb) ----------
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

async function stats(symbol: string, retry = true): Promise<Record<string, unknown>> {
  const s = await getSession();
  const mods = "summaryDetail,defaultKeyStatistics,financialData,assetProfile,calendarEvents,price";
  const r = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${mods}&crumb=${encodeURIComponent(s.crumb)}`,
    { headers: { "User-Agent": UA, cookie: s.cookie, Accept: "application/json" } });
  if ((r.status === 401 || r.status === 403) && retry) { await getSession(true); return stats(symbol, false); }
  if (!r.ok) { await r.body?.cancel(); return { error: `Yahoo ${r.status}` }; }
  const d = await r.json();
  const x = d?.quoteSummary?.result?.[0];
  if (!x) return { error: "No fundamentals" };
  const sd = x.summaryDetail || {}, ks = x.defaultKeyStatistics || {}, fd = x.financialData || {}, ap = x.assetProfile || {},
    ce = x.calendarEvents || {}, pr = x.price || {};
  const ed = ce.earnings?.earningsDate?.[0];
  return {
    name: pr.longName ?? pr.shortName ?? null,
    marketCap: raw(sd.marketCap) ?? raw(pr.marketCap), pe: raw(sd.trailingPE), forwardPe: raw(sd.forwardPE) ?? raw(ks.forwardPE),
    peg: raw(ks.pegRatio), eps: raw(ks.trailingEps), forwardEps: raw(ks.forwardEps), pb: raw(ks.priceToBook),
    divYield: raw(sd.dividendYield), payout: raw(sd.payoutRatio), beta: raw(sd.beta) ?? raw(ks.beta),
    avgVolume: raw(sd.averageVolume), avgVolume10d: raw(sd.averageVolume10days),
    profitMargin: raw(fd.profitMargins) ?? raw(ks.profitMargins), grossMargin: raw(fd.grossMargins), opMargin: raw(fd.operatingMargins),
    revenueGrowth: raw(fd.revenueGrowth), earningsGrowth: raw(fd.earningsGrowth), roe: raw(fd.returnOnEquity),
    debtToEquity: raw(fd.debtToEquity), freeCashflow: raw(fd.freeCashflow), totalCash: raw(fd.totalCash), totalDebt: raw(fd.totalDebt),
    shortPctFloat: raw(ks.shortPercentOfFloat), heldInstitutions: raw(ks.heldPercentInstitutions), heldInsiders: raw(ks.heldPercentInsiders),
    target: raw(fd.targetMeanPrice), targetHigh: raw(fd.targetHighPrice), targetLow: raw(fd.targetLowPrice),
    analysts: raw(fd.numberOfAnalystOpinions), rating: fd.recommendationKey ?? null, ratingMean: raw(fd.recommendationMean),
    sector: ap.sector ?? null, industry: ap.industry ?? null, country: ap.country ?? null, employees: raw(ap.fullTimeEmployees),
    summary: ap.longBusinessSummary ? String(ap.longBusinessSummary).slice(0, 600) : null,
    earningsDate: raw(ed) ?? null,
  };
}


// ---------- pre-market / after-hours (Yahoo v7 quote with crumb; chart API as fallback) ----------
async function extQuotes(symbols: string[], retry = true): Promise<Record<string, unknown>> {
  const s = await getSession();
  const fields = "marketState,regularMarketPrice,regularMarketTime,regularMarketPreviousClose,preMarketPrice,preMarketChange,preMarketChangePercent,preMarketTime,postMarketPrice,postMarketChange,postMarketChangePercent,postMarketTime";
  const r = await fetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}&fields=${fields}&crumb=${encodeURIComponent(s.crumb)}`,
    { headers: { "User-Agent": UA, cookie: s.cookie, Accept: "application/json" } });
  if ((r.status === 401 || r.status === 403) && retry) { await getSession(true); return extQuotes(symbols, false); }
  if (!r.ok) { await r.body?.cancel(); throw new Error(`Yahoo ${r.status}`); }
  const d = await r.json();
  const out: Record<string, unknown> = {};
  for (const q of d?.quoteResponse?.result || []) {
    const side = (p: string) => q[p + "Price"] != null
      ? { price: q[p + "Price"], change: q[p + "Change"] ?? null, pct: q[p + "ChangePercent"] ?? null, time: q[p + "Time"] ?? null } : null;
    out[q.symbol] = { state: q.marketState ?? null, prevClose: q.regularMarketPreviousClose ?? null, regular: q.regularMarketPrice ?? null,
      regularTime: q.regularMarketTime ?? null, pre: side("preMarket"), post: side("postMarket") };
  }
  return out;
}
// fallback for one symbol: today's 5-minute bars including pre/post, split by the trading periods
async function extFromChart(symbol: string) {
  const res = await chart(symbol, "range=1d&interval=5m&includePrePost=true");
  const m = res.meta || {}, tp = m.currentTradingPeriod || {}, ts: number[] = res.timestamp || [], c = res.indicators?.quote?.[0]?.close || [];
  const prev = m.chartPreviousClose ?? m.previousClose ?? null, reg = tp.regular || {};
  const lastIn = (a: number, b: number) => { for (let i = ts.length - 1; i >= 0; i--) if (ts[i] >= a && ts[i] < b && c[i] != null) return [ts[i], c[i]]; return null; };
  const mk = (x: number[] | null, base: number | null) => x && base ? { price: x[1], change: x[1] - base, pct: (x[1] / base - 1) * 100, time: x[0] } : null;
  const now = Date.now() / 1000;
  const regClose = m.regularMarketPrice ?? null;
  const state = now < (reg.start ?? 0) ? "PRE" : now < (reg.end ?? 0) ? "REGULAR" : "POST";
  return { state, prevClose: prev, regular: regClose, regularTime: m.regularMarketTime ?? null,
    pre: mk(lastIn(tp.pre?.start ?? 0, reg.start ?? 0), prev), post: state === "POST" ? mk(lastIn(reg.end ?? 0, tp.post?.end ?? 0), regClose) : null };
}


// ---------- symbol search (Bursa short names → numeric codes, company names → tickers) ----------
async function search(q: string, market: string) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0&enableFuzzyQuery=true`;
  let r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) { await r.body?.cancel(); r = await fetch(url.replace("query2", "query1"), { headers: { "User-Agent": UA, Accept: "application/json" } }); }
  if (!r.ok) throw new Error(`Yahoo search ${r.status}`);
  const d = await r.json();
  let list = ((d?.quotes || []) as any[]).filter((x) => x.symbol && /EQUITY|ETF|REIT|CRYPTOCURRENCY|MUTUALFUND/i.test(x.quoteType || "EQUITY"));
  if (market === "KL") list = list.filter((x) => /\.KL$/.test(x.symbol));
  else if (market === "US") list = list.filter((x) => !/\./.test(x.symbol) && /NMS|NYQ|NGM|NCM|ASE|PCX|BTS|NAS|NYS/i.test(x.exchange || "NMS"));
  return list.slice(0, 10).map((x) => ({ symbol: x.symbol, name: x.shortname ?? x.longname ?? x.symbol, longName: x.longname ?? null, exchange: x.exchDisp ?? x.exchange ?? null }));
}

// ---------- AI read (Anthropic Messages API) ----------
async function aiRead(symbol: string, facts: unknown) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { error: "AI not set up" };
  const factsTxt = JSON.stringify(facts).slice(0, 12000);
  const system =
    "You are a careful equity technical analyst writing for a retail investor in Malaysia who holds US and Bursa Malaysia stocks. " +
    "Use ONLY the numbers provided; never invent prices, news or events. If something is missing, say so briefly. " +
    "Write plain English, no hype. Use these short sections with markdown '### ' headings: " +
    "Trend, Momentum, Key levels, Volume & relative strength, Fundamentals & analysts, What would change the picture, Bottom line. " +
    "Keep each section to 1–3 sentences or bullets; total under 300 words. In Bottom line give a balanced tilt " +
    "(e.g. constructive / neutral / cautious) with the main reason and the main risk — not a buy or sell instruction. " +
    "End with one line in italics: 'Educational read of price data, not financial advice.'";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1000, system,
      messages: [{ role: "user", content: `Stock: ${symbol}\nData (JSON):\n${factsTxt}` }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { error: d?.error?.message || `AI ${r.status}` };
  const text = (d.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
  return { text, model: d.model || MODEL, usage: d.usage || null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "search") {
      const q = String(body.q || "").trim().slice(0, 60);
      if (!q) return json({ results: [] });
      try { return json({ results: await search(q, String(body.market || "")) }); }
      catch (e) { return json({ results: [], error: String((e as Error).message || e) }); }
    }
    if (body.action === "ext") {
      const list = [...new Set(((body.symbols || []) as string[]).map((x) => String(x).toUpperCase().trim()))]
        .filter((x) => SYMBOL.test(x) && !/\.KL$|-USD$|^\^|=/.test(x)).slice(0, 40);
      if (!list.length) return json({});
      let out: Record<string, unknown> = {};
      try { out = await extQuotes(list); } catch (_) { out = {}; }
      const missing = list.filter((x) => !out[x]);
      for (let i = 0; i < missing.length; i += 6) {
        await Promise.all(missing.slice(i, i + 6).map(async (x) => {
          try { out[x] = await extFromChart(x); } catch (e) { out[x] = { error: String((e as Error).message || e) }; }
        }));
      }
      return json(out);
    }
    const symbol = String(body.symbol || "").toUpperCase().trim();
    if (!SYMBOL.test(symbol)) return json({ error: "Bad symbol" }, 400);

    if (body.action === "ai") return json(await aiRead(symbol, body.facts || {}));

    const benchSym = /\.KL$/.test(symbol) ? "^KLSE" : /-USD$/.test(symbol) ? "BTC-USD" : "^GSPC";
    const [h, b, s] = await Promise.all([
      history(symbol),
      symbol === benchSym ? Promise.resolve(null) : benchmark(benchSym).catch(() => null),
      /-USD$|^\^|=/.test(symbol) ? Promise.resolve({ error: "No fundamentals for this type" }) : stats(symbol).catch((e) => ({ error: String(e) })),
    ]);
    return json({ symbol, ...h, bench: b, stats: s });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
