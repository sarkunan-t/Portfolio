// ===== Markets Suite — price-alerts Edge Function =====
// Called every 15 min (Mon–Fri) by pg_cron. It pushes alerts to the Android app for:
//   1. Holdings      — live price vs previous close  <= -3%  or  >= +5%
//   2. Watchlists    — Observation / Triage / Confirmation stocks you don't hold:
//                      the same -3% / +5% moves, plus "target reached" when the price
//                      gets to the average analyst target (at most once per 30 days)
//   3. Scan changes  — signal / score changes the nightly scanner logged with pushed = false
// Each stock alerts at most once per trading day per direction (price_alerts table).
// Needs mobile/supabase/watch-alerts.sql to have been run once.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   CRON_SECRET          random string, must match the x-cron-secret header in the cron job
//   FCM_SERVICE_ACCOUNT  full JSON of the Firebase service-account key
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// POST body options:  {}  normal run   |   {"test":true}  send a test push to every device

const DROP_PCT = -3;   // alert when change vs previous close is at or below this
const RISE_PCT = 5;    // alert when change vs previous close is at or above this
const FRESH_MIN = 30;  // only alert on prices traded in the last 30 min (market open)
const WATCH_DROP_PCT = -3;   // same rule for watchlist stocks (change here if you want it looser)
const WATCH_RISE_PCT = 5;
const TARGET_REPEAT_DAYS = 30; // "target reached" at most once per 30 days per stock
const LIST_ROUTE: Record<string, string> = { observation: "#more/observe", triage: "#more/triage", confirmation: "#more/triage" };
const LIST_LABEL: Record<string, string> = { observation: "Observation", triage: "Triage", confirmation: "Confirmation" };

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o, null, 2), { status, headers: { "Content-Type": "application/json" } });

// ---------- Supabase REST (service role, bypasses RLS) ----------
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`REST ${path} → ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

type Holding = { ticker: string; market: string; name: string; qty: number; symbol: string };

async function currentHoldings(): Promise<Holding[]> {
  const rows: any[] = await rest("transactions?select=ticker,market,tx_type,quantity,company_name&limit=10000");
  const map: Record<string, Holding> = {};
  for (const t of rows) {
    const k = `${t.ticker}|${t.market}`;
    const h = (map[k] ??= {
      ticker: t.ticker, market: t.market, name: t.company_name || t.ticker, qty: 0,
      symbol: t.market === "Bursa" ? `${t.ticker}.KL` : t.ticker,
    });
    if (t.company_name) h.name = t.company_name;
    const q = Number(t.quantity) || 0;
    if (t.tx_type === "Buy") h.qty += q;
    else if (t.tx_type === "Sell") h.qty -= q;
  }
  return Object.values(map).filter((h) => h.qty > 0.001);
}

// ---------- Yahoo quote ----------
async function quote(symbol: string) {
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
        { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36" } },
      );
      if (!r.ok) continue;
      const m = (await r.json())?.chart?.result?.[0]?.meta;
      if (!m?.regularMarketPrice) continue;
      return {
        price: m.regularMarketPrice as number,
        prev: (m.chartPreviousClose ?? m.previousClose) as number,
        time: m.regularMarketTime as number,           // unix seconds of last trade
        tz: (m.exchangeTimezoneName ?? "UTC") as string,
        ccy: (m.currency ?? "") as string,
      };
    } catch (_) { /* try next host */ }
  }
  return null;
}

// ---------- FCM HTTP v1 ----------
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function fcmAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = enc({ alg: "RS256", typ: "JWT" }) + "." + enc({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  });
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(sig)}` }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("FCM auth failed: " + JSON.stringify(d));
  return d.access_token;
}

async function pushAll(title: string, body: string, route = "#holdings/open") {
  const saRaw = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (!saRaw) throw new Error("FCM_SERVICE_ACCOUNT secret is not set");
  const sa = JSON.parse(saRaw);
  const tokens: { token: string }[] = await rest("push_tokens?select=token");
  if (!tokens.length) return { sent: 0, note: "no devices registered — open the app and allow notifications" };
  const access = await fcmAccessToken(sa);
  let sent = 0;
  const errors: string[] = [];
  for (const { token } of tokens) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: { route },
          android: { priority: "HIGH", notification: { channel_id: "price-alerts", color: "#0AA79F" } },
        },
      }),
    });
    if (r.ok) { sent++; continue; }
    const txt = await r.text();
    // device uninstalled / token expired → forget it
    if (r.status === 404 || txt.includes("UNREGISTERED")) {
      await rest(`push_tokens?token=eq.${encodeURIComponent(token)}`, { method: "DELETE" });
    } else errors.push(`${r.status} ${txt.slice(0, 200)}`);
  }
  return { sent, errors };
}

// ---------- main ----------
const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const ccyLabel = (c: string) => (c === "MYR" ? "RM " : c === "USD" ? "US$" : c + " ");

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "forbidden" }, 403);
  const opts = await req.json().catch(() => ({}));

  try {
    if (opts.test) {
      return json(await pushAll("✅ UnicornHunter alerts are on",
        `You'll be alerted when a holding or watched stock moves ${DROP_PCT}% or +${RISE_PCT}% vs previous close, hits its analyst target, or changes signal.`));
    }

    const holdings = await currentHoldings();
    const nowSec = Date.now() / 1000;
    const checked: any[] = [];
    const alerts: string[] = [];

    // insert one alert row; returns false when it was already logged (same symbol/direction/day)
    const logAlert = async (row: Record<string, unknown>) => {
      const inserted: any[] = await rest("price_alerts?on_conflict=symbol,direction,alert_date", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify(row),
      });
      return !!inserted?.length;
    };
    const dayOf = (q: { time: number; tz: string }) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: q.tz }).format(new Date(q.time * 1000));

    // ---- 1. holdings ----
    for (const h of holdings) {
      const q = await quote(h.symbol);
      if (!q || !q.prev) { checked.push({ symbol: h.symbol, status: "no quote" }); continue; }
      const pct = ((q.price - q.prev) / q.prev) * 100;
      const fresh = nowSec - q.time < FRESH_MIN * 60;
      checked.push({ symbol: h.symbol, price: q.price, prev: q.prev, pct: +pct.toFixed(2), open: fresh });
      if (!fresh) continue;

      const direction = pct <= DROP_PCT ? "down" : pct >= RISE_PCT ? "up" : null;
      if (!direction) continue;

      // trading day in the exchange's own timezone → once per day per direction
      const ok = await logAlert({
        symbol: h.symbol, ticker: h.ticker, market: h.market, direction,
        pct: +pct.toFixed(2), price: q.price, prev_close: q.prev, currency: q.ccy, alert_date: dayOf(q),
        route: "#holdings/open",
      });
      if (!ok) continue; // already alerted today

      const label = h.market === "Bursa" ? `${h.name} (${h.ticker})` : h.ticker;
      const title = direction === "down" ? `▼ ${label} ${pct.toFixed(1)}%` : `▲ ${label} +${pct.toFixed(1)}%`;
      const body = `${ccyLabel(q.ccy)}${fmt(q.price, h.market === "Bursa" ? 3 : 2)} · prev close ${ccyLabel(q.ccy)}${fmt(q.prev, h.market === "Bursa" ? 3 : 2)} · you hold ${fmt(h.qty, 0)}`;
      await pushAll(title, body, "#holdings/open");
      alerts.push(title);
    }

    // ---- 2. watchlists (stocks you don't hold) ----
    const held = new Set(holdings.map((h) => h.symbol));
    let watch: any[] = [];
    try {
      watch = await rest("scan_watch?select=symbol,name,stage,target_mean,target_ccy&limit=500");
    } catch (_) { watch = []; } // table missing → skip
    for (const w of watch) {
      if (held.has(w.symbol)) continue;
      const kl = /\.KL$/.test(w.symbol);
      const ticker = kl ? w.symbol.replace(/\.KL$/, "") : w.symbol;
      const market = kl ? "Bursa" : "US";
      const q = await quote(w.symbol);
      if (!q || !q.prev) { checked.push({ symbol: w.symbol, list: w.stage, status: "no quote" }); continue; }
      const pct = ((q.price - q.prev) / q.prev) * 100;
      const fresh = nowSec - q.time < FRESH_MIN * 60;
      checked.push({ symbol: w.symbol, list: w.stage, price: q.price, pct: +pct.toFixed(2), open: fresh });
      if (!fresh) continue;

      const route = LIST_ROUTE[w.stage] ?? "#more/triage";
      const listLbl = LIST_LABEL[w.stage] ?? "Watchlist";
      const label = kl && w.name ? `${w.name} (${ticker})` : ticker;
      const dp = kl ? 3 : 2;
      const base = { symbol: w.symbol, ticker, market, price: q.price, prev_close: q.prev, currency: q.ccy,
        alert_date: dayOf(q), list: w.stage, route };

      const direction = pct <= WATCH_DROP_PCT ? "down" : pct >= WATCH_RISE_PCT ? "up" : null;
      if (direction) {
        const title = direction === "down" ? `▼ ${label} ${pct.toFixed(1)}%` : `▲ ${label} +${pct.toFixed(1)}%`;
        if (await logAlert({ ...base, direction, pct: +pct.toFixed(2), message: `${listLbl}: ${title}` })) {
          await pushAll(title, `${listLbl} · ${ccyLabel(q.ccy)}${fmt(q.price, dp)} · prev close ${ccyLabel(q.ccy)}${fmt(q.prev, dp)}`, route);
          alerts.push(title);
        }
      }

      const tgt = Number(w.target_mean);
      if (tgt > 0 && q.price >= tgt) {
        const since = new Date(Date.now() - TARGET_REPEAT_DAYS * 86400000).toISOString().slice(0, 10);
        const recent: any[] = await rest(
          `price_alerts?select=id&symbol=eq.${encodeURIComponent(w.symbol)}&direction=eq.target&alert_date=gte.${since}&limit=1`);
        if (!recent.length) {
          const title = `🎯 ${label} reached its analyst target`;
          const msg = `${ccyLabel(q.ccy)}${fmt(q.price, dp)} ≥ avg target ${ccyLabel(q.ccy)}${fmt(tgt, dp)}`;
          if (await logAlert({ ...base, direction: "target", pct: +(((q.price - tgt) / tgt) * 100).toFixed(2),
                               message: `${label} hit target · ${msg}` })) {
            await pushAll(title, `${listLbl} · ${msg} — time to re-check the thesis`, route);
            alerts.push(title);
          }
        }
      }
    }

    // ---- 3. scan changes logged by the nightly scanner ----
    let pending: any[] = [];
    try {
      pending = await rest("price_alerts?select=id,symbol,ticker,direction,message,route,list&pushed=eq.false&order=created_at.asc&limit=30");
    } catch (_) { pending = []; } // columns missing → watch-alerts.sql not run yet
    for (const p of pending) {
      const title = p.direction === "signal" ? `📡 ${p.ticker || p.symbol} signal changed`
        : p.direction === "score" ? `📊 ${p.ticker || p.symbol} score moved` : `${p.ticker || p.symbol}`;
      await pushAll(title, p.message || "", p.route || "#more/triage");
      await rest(`price_alerts?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify({ pushed: true }) });
      alerts.push(title);
    }

    return json({ holdings: holdings.length, watch: watch.length, pendingSent: pending.length, alerts, checked });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
