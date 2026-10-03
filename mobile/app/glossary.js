/* ===== Glossary + ⓘ tips (app and web site) =====
   H.tip('key')          → small ⓘ that explains a metric (tap on phone/tablet, hover or click on desktop)
   data-tip="key" on any element (e.g. a signal tag) does the same.
   App.glossary.sheet()  → full "How to read the scanner" guide in a sheet.
   Add or edit explanations in G below — they show everywhere the key is used. */
(function(){
const H=App.h;
const G=App.gloss={
  /* ---- signals ---- */
  'cls.Emerging':{t:'Emerging',d:'Fundamentals are improving (revenue growing 15%+, growth speeding up, or losses shrinking) AND the price has just started to turn up — above its 50-day average, recently crossed it, or the 50-day average is starting to rise.',
    g:'The earliest stage. Research these before a sustained breakout; expect more false starts than with Confirmed.'},
  'cls.Confirmed':{t:'Confirmed',d:'An established uptrend backed by growth: price above a rising 50-day and 200-day average, beating the NASDAQ over 3 months, revenue growing 20%+, and a score of 70 or more.',
    g:'Strong trend with business growth behind it. Less upside surprise than Emerging, but more evidence.'},
  'cls.Extended':{t:'Extended',d:'A strong performer that may have run too far, too fast: 25%+ above its 50-day average, 60%+ above its 200-day, RSI 80+, or valuation more than double its sector.',
    g:'Not a sell signal — but buying here carries more risk of a pullback. Often better to wait for a rest or dip toward the 50-day average.'},
  'cls.Deteriorating':{t:'Deteriorating',d:'At least two warning signs: revenue shrinking, growth slowing sharply, price below a falling 200-day average, lagging the NASDAQ by 10+ points, score down 15+ in a month, or losses widening.',
    g:'Re-check the thesis on anything you hold or watch that turns Deteriorating.'},
  'discovery':{t:'Discovery',d:'Smaller companies ($50M–$2B market cap) whose fundamentals score 60+ but whose momentum score is still under 50 — the business is improving but the share price hasn\'t reacted yet.',
    g:'Higher risk, higher potential. Look for the price to start turning up (an Emerging signal) before committing.'},
  /* ---- scores ---- */
  'score':{t:'Score (0–100)',d:'Overall rank from 8 criteria: revenue growth, earnings growth, financial strength, relative strength, price trend, volume, valuation and growth acceleration. Analyst revisions and institutional buying aren\'t scored yet, so the rest are scaled up to 100.',
    g:'60+ = qualified, 70+ strong, 80+ exceptional. Use it to decide what to research first — not as a buy signal.'},
  'fund':{t:'Fundamentals score',d:'The business side only (0–100): revenue and earnings growth, cash flow and runway, valuation vs growth, and whether growth is speeding up. From SEC filings.',
    g:'60+ means the business is genuinely growing. High fundamentals with low momentum = the market may not have noticed yet.'},
  'mom':{t:'Momentum score',d:'The price side only (0–100): price trend vs the 50- and 200-day averages, 3- and 6-month performance vs the NASDAQ, and buying volume on up days.',
    g:'70+ strong uptrend · 50–70 uptrend building · under 50 weak or no uptrend.'},
  'chg1m':{t:'Score change, 1 month',d:'Today\'s score minus the score about 4 weeks ago. Not the price change.',
    g:'Rising = the stock is getting stronger on fundamentals and/or price. A drop of 15+ is a warning sign.'},
  'chg3m':{t:'Score change, 3 months',d:'Today\'s score minus the score about 3 months ago. Not the price change.',
    g:'A score climbing from 55 to 75 often says more than a stock sitting at 80. This is what "Score rising" sorts by.'},
  'hist':{t:'Score history',d:'Every scan\'s score for this stock. The dashed line is 60, the qualify mark. Hollow points were rebuilt from past prices and filings rather than scanned live.',
    g:'Look for a steady climb, not one jump.'},
  /* ---- scan tiles & views ---- */
  'screened':{t:'Screened',d:'NASDAQ-listed common stocks checked in the last scan (no ETFs, warrants or preferreds). "Scored" = those that passed the filters for liquidity, dilution, cash runway, late filings and SPACs.'},
  'qualified':{t:'Qualified',d:'Stocks scoring 60 or more in the last scan.'},
  'newsig':{t:'New signals',d:'Stocks that crossed 60 since the previous scan, or newly moved into Emerging or Confirmed.',g:'A good daily starting point.'},
  'view.top':{t:'Top 20',d:'The 20 highest scores at or above your minimum score.'},
  'view.rising':{t:'Score rising',d:'Up to 50 stocks (score 50+) whose score rose most over 3 months.'},
  'view.discovery':{t:'Discovery',d:'Small caps with strong fundamentals but little price momentum yet. Sorted by fundamentals score.'},
  'view.all':{t:'All qualified',d:'Every stock at or above your minimum score.'},
  'signal':{t:'Signal',d:'Where the stock sits in its growth cycle: Emerging → Confirmed → Extended, or Deteriorating. Blank means none of the patterns fit.',g:'Tap a signal tag anywhere to see what it means.'},
  /* ---- score breakdown ---- */
  'crit.revenue_growth':{t:'Revenue growth (15 pts)',d:'Average of 12-month and latest-quarter revenue growth vs a year earlier. 20% growth earns half marks, 50%+ full marks.'},
  'crit.earnings_growth':{t:'Earnings growth (10 pts)',d:'Net income growth over 12 months. Turning profitable earns full marks; loss-makers can earn up to 60% for losses shrinking — they aren\'t excluded.'},
  'crit.financial_strength':{t:'Financial strength (10 pts)',d:'Positive and improving free cash flow scores best. Cash-burning companies are scored on runway: 3+ years of cash is good, under 12 months is risky.'},
  'crit.relative_strength':{t:'Relative strength (10 pts)',d:'Share price performance minus the NASDAQ Composite over 3 months (70%) and 6 months (30%). 25 points ahead of the index over 3 months = full marks.'},
  'crit.price_trend':{t:'Price trend (10 pts)',d:'Above the 50-day average (4), above the 200-day (4), and 50-day above 200-day (2) — the classic uptrend check.'},
  'crit.volume':{t:'Volume / accumulation (10 pts)',d:'An up day in the last 2 weeks on 1.5× normal volume (better near a 52-week high), plus more volume on up days than down days over 50 days — signs of big buyers.'},
  'crit.valuation':{t:'Valuation vs growth (10 pts)',d:'Price-to-sales divided by growth rate (cheaper per unit of growth scores higher), and price-to-sales vs the sector median. Profitable at P/E under 20 gets at least half marks.'},
  'crit.growth_catalyst':{t:'Growth acceleration (10 pts)',d:'Is quarterly revenue growth speeding up vs the previous quarter (+10 points = full), and is gross margin widening? A stand-in for a catalyst until AI research is added.'},
  'crit.analyst_revisions':{t:'Analyst revisions',d:'Not scored yet — needs a paid data source for analyst estimates.'},
  'crit.institutional':{t:'Institutional activity',d:'Not scored yet — needs 13F ownership data.'},
  /* ---- research page numbers ---- */
  'm.rev':{t:'Revenue (12 months)',d:'Total sales over the last four reported quarters, and the change vs the four quarters before.'},
  'm.revq':{t:'Latest quarter vs year ago',d:'The most recent quarter\'s revenue vs the same quarter last year. "Previous" is that figure one quarter earlier.',g:'Latest above previous = growth accelerating.'},
  'm.ni':{t:'Net income (12 months)',d:'Profit after all costs over the last four quarters. "Was" = the 12 months before.'},
  'm.fcf':{t:'Free cash flow (12 months)',d:'Cash from operations minus capital spending — the cash the business actually generates.',g:'Positive and rising is ideal. Negative is normal for young growth companies if runway is long.'},
  'm.cash':{t:'Cash & runway',d:'Cash plus short-term investments. Runway = months of cash left at the current burn rate (only shown if free cash flow is negative).',g:'Under 12 months: likely to raise money (dilution). Under 6: excluded from the scan.'},
  'm.gm':{t:'Gross margin',d:'Revenue minus direct costs, as a % of revenue.',g:'Widening margins often signal pricing power or scale.'},
  'm.dil':{t:'Share count, 1 year',d:'Change in diluted shares vs a year ago.',g:'Over 10% eats into your stake; over 25% is excluded from the scan.'},
  'm.mcap':{t:'Market cap',d:'Share price × shares outstanding — what the market values the whole company at.'},
  'm.ps':{t:'Price / sales',d:'Market cap ÷ 12-month revenue, with the sector median for comparison.',g:'Fast growers deserve a higher P/S — judge it against growth, not alone.'},
  'm.pe':{t:'Price / earnings',d:'Market cap ÷ 12-month net income. Only shown when profitable.'},
  'm.ret':{t:'Returns',d:'Share price change over 1, 3, 6 and 12 months.'},
  'm.rs':{t:'vs NASDAQ, 3 months',d:'The stock\'s 3-month return minus the NASDAQ Composite\'s, in percentage points.',g:'Positive = beating the market, not just rising with it.'},
  'm.ma':{t:'vs 50-day / 200-day average',d:'How far the price is above (+) or below (−) its average closing price over the last 50 and 200 trading days.',g:'Both positive = uptrend. 25%+ above the 50-day = stretched.'},
  'm.hi':{t:'52-week high',d:'Highest close in the last year, and how far below it the price is now.',g:'Strong stocks tend to trade near their highs.'},
  'm.rsi':{t:'RSI (14 day)',d:'Relative Strength Index: compares recent up days with down days on a 0–100 scale.',g:'50–70 healthy · above 70 strong · above 80 overheated · below 30 oversold.'},
  'm.vol':{t:'Best up-day volume',d:'The highest volume on a rising day in the last 2 weeks, compared with the 50-day average.',g:'1.5× or more suggests institutions buying.'},
  'm.dv':{t:'Avg traded value / day',d:'Average dollars traded per day over 20 days. Below $1M a day is excluded as too illiquid.'},
  /* ---- triage & confirmation ---- */
  'w.triage':{t:'Triage',d:'Stocks you\'ve tagged to research: read the filings, check the story, write your thesis in the notes.',g:'Promote to Confirmation when the research checks out — or remove it.'},
  'w.confirmation':{t:'Confirmation',d:'Research done; waiting for the setup to confirm — e.g. an Emerging signal turning Confirmed, a breakout on volume, or the next earnings report.',g:'Write in the notes exactly what would make you act, and what would make you drop it.'},
  'w.since':{t:'Since tagged',d:'Price change since the day you added the stock — a quick check on whether your instinct was early or late.'},
  'w.score':{t:'Score now vs then',d:'Latest scan score, with the score on the day you tagged it.'}
};

/* ---------- ⓘ markup ---------- */
H.tip=(key,label)=>G[key]?`<span class="tip" role="button" tabindex="0" data-tip="${key}" aria-label="What is ${H.esc(label||G[key].t)}?">i</span>`:'';
H.lt=(label,key)=>`<span class="lt">${label}${H.tip(key,label)}</span>`;   // label + ⓘ

/* ---------- popover ---------- */
let pop=null,cur=null,hoverT=null;
function close(){if(pop){pop.remove();pop=null;cur=null;}}
function show(el){
  const g=G[el.dataset.tip];if(!g)return;
  if(cur===el){close();return;}
  close();cur=el;
  pop=document.createElement('div');pop.className='tip-pop';pop.setAttribute('role','tooltip');
  pop.innerHTML=`<b>${H.esc(g.t)}</b><p>${H.esc(g.d)}</p>${g.g?`<p class="tip-g">${H.esc(g.g)}</p>`:''}`;
  document.body.appendChild(pop);
  const r=el.getBoundingClientRect(),pw=pop.offsetWidth,ph=pop.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;
  let x=Math.min(Math.max(8,r.left+r.width/2-pw/2),vw-pw-8);
  let y=r.bottom+8;if(y+ph>vh-8)y=Math.max(8,r.top-ph-8);
  pop.style.left=x+'px';pop.style.top=y+'px';
}
// capture phase: a tap on a tip never also opens the row or sorts the column it sits in
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-tip]');
  if(t){e.preventDefault();e.stopPropagation();show(t);return;}
  if(pop&&!e.target.closest('.tip-pop'))close();
},true);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')close();
  if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('.tip')){e.preventDefault();show(e.target);}
});
window.addEventListener('scroll',close,true);
window.addEventListener('resize',close);
window.addEventListener('hashchange',close);
// desktop: hover shows the tip too
if(window.matchMedia('(hover:hover) and (pointer:fine)').matches){
  document.addEventListener('mouseover',e=>{const t=e.target.closest('[data-tip]');if(!t||t===cur)return;clearTimeout(hoverT);hoverT=setTimeout(()=>show(t),250);});
  document.addEventListener('mouseout',e=>{const t=e.target.closest('[data-tip]');if(!t)return;clearTimeout(hoverT);
    if(!e.relatedTarget||!e.relatedTarget.closest||!e.relatedTarget.closest('.tip-pop'))setTimeout(()=>{if(cur===t&&!document.querySelector('.tip-pop:hover'))close();},150);});
}

/* ---------- full guide ---------- */
App.glossary={sheet(){
  const sec=(h,keys)=>`<div class="form-sec">${h}</div>`+keys.map(k=>{const g=G[k];return `<div class="gl-item"><b>${H.esc(g.t)}</b><p>${H.esc(g.d)}</p>${g.g?`<p class="tip-g">${H.esc(g.g)}</p>`:''}</div>`;}).join('');
  App.openSheet({title:'How to read the scanner',sub:'Signals, scores and what to look for',full:true,body:
    `<div class="notice info" style="margin-top:0">For an upward price trend look at the <b>Momentum score</b> (60+), <b>vs 50-day / 200-day</b> (both positive) and <b>vs NASDAQ</b> (positive). For business quality look at the <b>Fundamentals score</b>.</div>`+
    sec('Signals',['cls.Emerging','cls.Confirmed','cls.Extended','cls.Deteriorating','discovery'])+
    sec('Scores',['score','fund','mom','chg1m','chg3m'])+
    sec('Score breakdown',['crit.revenue_growth','crit.earnings_growth','crit.financial_strength','crit.relative_strength','crit.price_trend','crit.volume','crit.valuation','crit.growth_catalyst'])+
    sec('Price & momentum',['m.ret','m.rs','m.ma','m.hi','m.rsi','m.vol'])+
    sec('Fundamentals & valuation',['m.rev','m.revq','m.fcf','m.cash','m.gm','m.dil','m.ps','m.pe'])+
    sec('Triage & confirmation',['w.triage','w.confirmation'])+
    `<p class="tiny" style="margin-top:16px">Scores rank stocks for research — they are not buy recommendations.</p>`});
}};
})();
