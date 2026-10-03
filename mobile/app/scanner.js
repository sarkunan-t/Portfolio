/* ===== More → Growth scanner: daily NASDAQ scan (scanner/ GitHub Action → Supabase scan_* tables) =====
   Lists: Top 20 · Score rising (3-month change) · Discovery (small caps, fundamentals first) · All qualified.
   Detail sheet: score breakdown, why it's classified, score history, 1-year price, key numbers, filings.
   Market data only — nothing personal — so the view is marked data-nomask (hide-amounts leaves it alone). */
(function(){
const H=App.h;
H.icon.radar='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="1"/></svg>';
const LIST_COLS='symbol,name,sector,price,chg_pct,market_cap,score,score_chg_1m,score_chg_3m,classification,discovery,fund_score,mom_score';
const CLASSES=['Emerging','Confirmed','Extended','Deteriorating'];
const VIEWS=[['top','Top 20'],['rising','Score rising'],['discovery','Discovery'],['all','All qualified']];
const MINS=[50,60,70,80,90];
const S=App.scanner={status:'idle',at:0,run:null,rows:[],err:'',view:'top',min:60,detail:{},hist:{},px:{}};
App.state.filters.scanner=App.state.filters.scanner||{};

/* ---------- data ---------- */
const isMissing=e=>e&&(e.code==='42P01'||e.code==='PGRST205'||/does not exist|schema cache/i.test(e.message||''));
S.load=async(force)=>{
  if(S.status==='loading')return;
  if(!force&&S.status==='ok'&&Date.now()-S.at<30*60*1000)return;
  S.status='loading';App.refreshView();
  try{
    const r=await sb.from('scan_runs').select('*').eq('status','ok').order('scan_date',{ascending:false}).limit(1);
    if(r.error)throw r.error;
    if(!r.data.length){S.status='empty';S.run=null;S.rows=[];App.refreshView();return;}
    S.run=r.data[0];
    const q=await sb.from('scan_scores').select(LIST_COLS).eq('scan_date',S.run.scan_date).order('score',{ascending:false}).limit(3000);
    if(q.error)throw q.error;
    S.rows=q.data||[];S.at=Date.now();S.status='ok';S.detail={};
  }catch(e){console.error('scanner',e);S.err=e.message||String(e);S.status=isMissing(e)?'missing':'error';}
  App.refreshView();
};
async function loadDetail(sym){
  if(S.detail[sym])return S.detail[sym];
  const {data,error}=await sb.from('scan_scores').select('*').eq('scan_date',S.run.scan_date).eq('symbol',sym).maybeSingle();
  if(error)throw error;
  return S.detail[sym]=data;
}
async function loadHistory(sym){
  if(S.hist[sym])return S.hist[sym];
  const from=new Date(Date.now()-400*864e5).toISOString().slice(0,10);
  const {data,error}=await sb.from('scan_history').select('scan_date,score,classification,backfilled').eq('symbol',sym).gte('scan_date',from).order('scan_date',{ascending:true});
  if(error)throw error;
  return S.hist[sym]=data||[];
}
async function loadPrice(sym){
  if(S.px[sym])return S.px[sym];
  const call=sb.functions.invoke('metal-chart',{body:{symbols:[sym],range:'1y'}});
  const to=new Promise((_,rej)=>setTimeout(()=>rej(new Error('Timed out')),20000));
  const {data,error}=await Promise.race([call,to]);
  if(error)throw error;
  const d=data&&data[sym];
  if(!d||d.error||!d.points||!d.points.length)throw new Error((d&&d.error)||'No price history');
  return S.px[sym]=d.points;
}

/* ---------- helpers ---------- */
const held=()=>{try{return new Set(App.calc.positions().filter(p=>p.market==='US').map(p=>String(p.ticker).toUpperCase()));}catch(e){return new Set();}};
const usd=(v,d)=>v==null||!isFinite(v)?'—':`$${fmt(v,d!=null?d:(Math.abs(v)<10?3:2))}`;
const big=v=>{if(v==null||!isFinite(v))return '—';const a=Math.abs(v),s=v<0?'−':'';
  return a>=1e12?`${s}$${(a/1e12).toFixed(2)}T`:a>=1e9?`${s}$${(a/1e9).toFixed(2)}B`:a>=1e6?`${s}$${(a/1e6).toFixed(1)}M`:a>=1e3?`${s}$${(a/1e3).toFixed(0)}k`:`${s}$${fmt(a,0)}`;};
const pc=(v,d=0)=>v==null||!isFinite(v)?'<span class="dim">—</span>':`<span class="${v>=0?'up':'down'}">${v>=0?'+':'−'}${fmt(Math.abs(v*100),d)}%</span>`;
const pts=(v,d=0)=>v==null||!isFinite(v)?'<span class="dim">—</span>':`<span class="${v>=0?'up':'down'}">${v>=0?'+':'−'}${fmt(Math.abs(v),d)}</span>`;
const band=s=>s>=80?'hi':s>=60?'ok':s>=45?'mid':'lo';
const clsTag=c=>c?`<span class="tag cls-${c.toLowerCase()}">${c}</span>`:'';
const chg3=r=>r.score_chg_3m==null?'':`<span class="${r.score_chg_3m>=0?'up':'down'}">${r.score_chg_3m>=0?'▲':'▼'}${Math.abs(r.score_chg_3m)}</span> <span class="dim">3m</span>`;
const dateTxt=d=>d?new Date(d+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'}):'—';

function filtered(){
  const f=App.state.filters.scanner||{};
  const pass=(g,v)=>!f[g]||!f[g].length||f[g].includes(String(v));
  let list=S.rows.filter(r=>pass('sector',r.sector||'Other')&&pass('cls',r.classification||'None'));
  if(S.view==='discovery')return list.filter(r=>r.discovery).sort((a,b)=>b.fund_score-a.fund_score);
  if(S.view==='rising')return list.filter(r=>r.score>=Math.min(S.min,50)&&r.score_chg_3m!=null&&r.score_chg_3m>0)
    .sort((a,b)=>b.score_chg_3m-a.score_chg_3m||b.score-a.score).slice(0,50);
  list=list.filter(r=>r.score>=S.min);
  return S.view==='top'?list.slice(0,20):list;
}

/* ---------- list ---------- */
function row(r,hs){
  const disc=S.view==='discovery';
  const sub=disc?`Fund ${r.fund_score} · Mom ${r.mom_score} · ${H.esc(r.name||'')}`:`${H.esc(r.name||'')} · ${H.esc(r.sector||'')}`;
  return `<button class="lrow sc-row" data-sym="${H.esc(r.symbol)}">
    <div class="sc-badge ${band(r.score)}">${r.score}</div>
    <div class="main-col"><div class="t1">${H.esc(r.symbol)} ${clsTag(r.classification)}${r.discovery&&!disc?'<span class="tag gold">Discovery</span>':''}${hs.has(r.symbol)?'<span class="tag myr">Held</span>':''}${App.watch?App.watch.tag(r.symbol):''}</div>
      <div class="t2">${sub}</div></div>
    <div class="end"><div class="v">${usd(r.price)}</div><div class="s">${S.view==='rising'?chg3(r):H.pill(r.chg_pct)}</div></div></button>`;
}
function table(list,hs){
  const cols=[{k:'sc',label:'Score',cls:'n',w:'64px'},{k:'s',label:'Stock'},{k:'sec',label:'Sector'},{k:'c',label:'Signal'},{k:'p',label:'Price',cls:'n'},
    {k:'d',label:'Today',cls:'n'},{k:'m1',label:'Score 1m',cls:'n'},{k:'m3',label:'Score 3m',cls:'n'},{k:'f',label:'Fund / Mom',cls:'n'},{k:'mc',label:'Market cap',cls:'n'}];
  const ch=v=>v==null?'<span class="dim">—</span>':pts(v);
  return H.table(cols,list.map(r=>({on:`App.scanner.open('${H.esc(r.symbol)}')`,cells:{
    sc:`<span class="sc-badge sm ${band(r.score)}">${r.score}</span>`,
    s:`<div class="t-main">${H.esc(r.symbol)}${hs.has(r.symbol)?' <span class="tag myr">Held</span>':''} ${App.watch?App.watch.tag(r.symbol):''}</div><div class="t-sub">${H.esc(r.name||'')}</div>`,
    sec:H.esc(r.sector||''),c:clsTag(r.classification)+(r.discovery?' <span class="tag gold">Discovery</span>':''),
    p:usd(r.price),d:H.pill(r.chg_pct),m1:ch(r.score_chg_1m),m3:ch(r.score_chg_3m),f:`${r.fund_score} / ${r.mom_score}`,mc:big(r.market_cap)}})));
}
S.render=el=>{
  if(S.status==='idle'){S.load();}
  if(S.status==='idle'||S.status==='loading'){el.innerHTML=App.skeleton(6);return;}
  if(S.status==='missing'){el.innerHTML=`<div class="card muted-card"><div class="val">Growth scanner — not set up yet</div>
    <p class="sub" style="margin-top:8px;font-size:14px;line-height:1.5">Run <b>mobile/supabase/scanner.sql</b> in Supabase → SQL Editor, add the three GitHub secrets, then run the <b>NASDAQ growth scanner</b> workflow once from the Actions tab.</p></div>`;return;}
  if(S.status==='error'){el.innerHTML=`<div class="notice warn">Couldn't load the scanner: ${H.esc(S.err)}</div><button class="btn btn-s" style="margin-top:12px" onclick="App.scanner.load(true)">Try again</button>`;return;}
  if(S.status==='empty'){el.innerHTML=`<div class="card muted-card"><div class="val">No scan yet</div><p class="sub" style="margin-top:8px;font-size:14px">The scan runs every weekday after the US close (about 6:40 am Malaysia time). You can also start it from GitHub → Actions → NASDAQ growth scanner → Run workflow.</p></div>`;return;}
  const run=S.run, list=filtered(), hs=held();
  const views=VIEWS.map(([id,l])=>`<button class="chip ${S.view===id?'on':''}" data-scv="${id}">${l}</button>`).join('');
  const mins=S.view==='discovery'||S.view==='rising'?'':`<div class="sc-mins"><span class="lbl">Min score</span>${MINS.map(m=>`<button class="chip sm ${S.min===m?'on':''}" data-scm="${m}">${m}</button>`).join('')}</div>`;
  const ex=run.excluded||{}, exN=Object.values(ex).reduce((a,b)=>a+b,0);
  const intro=S.view==='discovery'?'Smaller companies ($50M–$2B) with improving fundamentals that the market hasn\'t rewarded yet. Sorted by fundamentals score.':
    S.view==='rising'?'Stocks whose score climbed the most over the last 3 months. A rising score can matter more than a high one.':'';
  el.innerHTML=`<div data-nomask>
    <div class="grid g3 sc-stats">
      <div class="stat"><div class="lbl">Screened</div><div class="val">${fmt(run.screened,0)}</div><div class="sub">${fmt(run.scored,0)} scored</div></div>
      <div class="stat"><div class="lbl">Qualified</div><div class="val">${fmt(run.qualified,0)}</div><div class="sub">score ${run.model&&run.model.qualify_score||60}+</div></div>
      <div class="stat"><div class="lbl">New signals</div><div class="val">${fmt(run.new_signals,0)}</div><div class="sub">since last scan</div></div>
    </div>
    <div class="tiny" style="margin:10px 2px 0">Scan of ${dateTxt(run.scan_date)} close · ${exN?`${fmt(exN,0)} filtered out (illiquid, dilution, late filings…)`:''}</div>
    <div class="chips sc-views">${views}</div>${mins}
    ${App.filterChips('scanner')}
    ${intro?`<div class="notice info">${intro}</div>`:''}
    ${list.length?(App.wide()?`<div style="margin-top:14px">${table(list,hs)}</div>`:`<div class="list" style="margin-top:12px">${list.map(r=>row(r,hs)).join('')}</div>`):
      `<div class="empty">${S.view==='rising'?'No score history yet — it builds up with each daily scan (or run a backfill).':'Nothing matches these filters.'}</div>`}
    <p class="tiny sc-foot">Scores rank stocks for research — they are not buy recommendations, and a high score doesn't mean a stock can multiply. Free data: prices from Yahoo (end of day), financials from SEC filings. Analyst revisions and institutional activity aren't scored yet.</p>
  </div>`;
  el.querySelectorAll('[data-scv]').forEach(b=>b.onclick=()=>{S.view=b.dataset.scv;App.render(false);});
  el.querySelectorAll('[data-scm]').forEach(b=>b.onclick=()=>{S.min=+b.dataset.scm;App.render(false);});
  el.querySelectorAll('[data-sym]').forEach(b=>b.onclick=()=>S.open(b.dataset.sym));
};
S.openFilter=()=>{
  const sectors=[...new Set(S.rows.map(r=>r.sector||'Other'))].sort();
  App.openFilterSheet({title:'Filter scanner',state:App.state.filters.scanner,
    groups:[{id:'cls',label:'Classification',options:CLASSES.map(c=>({value:c,label:c})).concat([{value:'None',label:'Unclassified'}])},
            {id:'sector',label:'Sector',options:sectors.map(s=>({value:s,label:s}))}],
    onApply:w=>{App.state.filters.scanner=w;App.render(false);}});
};

/* ---------- charts ---------- */
function scoreChart(h,W){
  const Hh=170,pl=8,pr=34,pt=10,pb=24,w=W-pl-pr,ht=Hh-pt-pb;
  const t=h.map(x=>new Date(x.scan_date+'T00:00:00').getTime()),t0=t[0],t1=t[t.length-1];
  const X=v=>pl+(t1===t0?w/2:(v-t0)/(t1-t0)*w),Y=v=>pt+(1-v/100)*ht;
  let g='';[0,20,40,60,80,100].forEach(v=>{g+=`<line x1="${pl}" x2="${pl+w}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v===60?'#9fd8d4':'#eef3f2'}" ${v===60?'stroke-dasharray="4 3"':''}/><text x="${pl+w+6}" y="${Y(v)+4}" font-size="10.5" fill="#67807c">${v}</text>`;});
  const line=h.map((x,i)=>`${i?'L':'M'}${X(t[i]).toFixed(1)},${Y(x.score).toFixed(1)}`).join('');
  const dots=h.length<=60?h.map((x,i)=>`<circle cx="${X(t[i]).toFixed(1)}" cy="${Y(x.score).toFixed(1)}" r="${i===h.length-1?4:2.5}" fill="${x.backfilled?'#fff':'#0aa79f'}" stroke="#0aa79f" stroke-width="1.5"/>`).join(''):'';
  const fx=v=>new Date(v).toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
  return `<svg class="mchart-svg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" aria-label="Score history">${g}
    <path d="${line}" fill="none" stroke="#0aa79f" stroke-width="2" stroke-linejoin="round"/>${dots}
    <text x="${pl}" y="${Hh-6}" font-size="10.5" fill="#67807c">${fx(t0)}</text><text x="${pl+w}" y="${Hh-6}" font-size="10.5" fill="#67807c" text-anchor="end">${fx(t1)}</text></svg>`;
}
function priceChart(p,W){
  const Hh=200,pl=6,pr=56,pt=12,pb=24,w=W-pl-pr,ht=Hh-pt-pb;
  const ma=p.map((x,i)=>i>=49?p.slice(i-49,i+1).reduce((a,y)=>a+y[1],0)/50:null);
  let mn=Math.min(...p.map(x=>x[1])),mx=Math.max(...p.map(x=>x[1]));const pad=(mx-mn)*0.08||mx*0.02;mn-=pad;mx+=pad;
  const t0=p[0][0],t1=p[p.length-1][0],X=t=>pl+(t-t0)/((t1-t0)||1)*w,Y=v=>pt+(1-(v-mn)/(mx-mn))*ht;
  const line=p.map((x,i)=>`${i?'L':'M'}${X(x[0]).toFixed(1)},${Y(x[1]).toFixed(1)}`).join('');
  const mline=p.map((x,i)=>ma[i]==null?'':`${ma[i-1]==null?'M':'L'}${X(x[0]).toFixed(1)},${Y(ma[i]).toFixed(1)}`).join('');
  let g='';for(let i=0;i<=3;i++){const v=mn+(mx-mn)*i/3;g+=`<line x1="${pl}" x2="${pl+w}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#eef3f2"/><text x="${pl+w+6}" y="${(Y(v)+4).toFixed(1)}" font-size="10.5" fill="#67807c">${fmt(v,v<10?2:0)}</text>`;}
  const fx=t=>new Date(t*1000).toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
  return `<svg class="mchart-svg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" aria-label="1-year price">${g}
    <path d="${mline}" fill="none" stroke="#e8b04a" stroke-width="1.5" stroke-dasharray="4 3"/>
    <path d="${line}" fill="none" stroke="#0aa79f" stroke-width="2" stroke-linejoin="round"/>
    <text x="${pl}" y="${Hh-6}" font-size="10.5" fill="#67807c">${fx(t0)}</text><text x="${pl+w}" y="${Hh-6}" font-size="10.5" fill="#67807c" text-anchor="end">${fx(t1)}</text></svg>
    <div class="chart-legend sc-legend"><span><i style="background:#0aa79f"></i>Price</span><span><i style="background:#e8b04a"></i>50-day average</span></div>`;
}
const short=v=>{const a=Math.abs(v||0),sg=v<0?'−':'';return a>=1e9?sg+(a/1e9).toFixed(a>=1e10?0:1)+'B':a>=1e6?sg+(a/1e6).toFixed(0)+'M':sg+(a/1e3).toFixed(0)+'k';};
function revBars(q){
  if(!q||q.length<2)return '';
  const mx=Math.max(...q.map(x=>Math.abs(x[1]||0)))||1;
  return `<div class="form-sec">Quarterly revenue</div><div class="sc-rev">${q.map(([e,v])=>`<div class="sc-rev-c"><div class="sc-rev-b" style="height:${Math.max(4,Math.abs(v)/mx*70)}px"></div><span>${short(v)}</span><em>${new Date(e+'T00:00:00').toLocaleDateString('en-GB',{month:'short',year:'2-digit'})}</em></div>`).join('')}</div>`;
}

/* ---------- detail sheet ---------- */
const LABELS={revenue_growth:'Revenue growth',earnings_growth:'Earnings growth',financial_strength:'Financial strength',relative_strength:'Relative strength',
  price_trend:'Price trend',volume:'Volume / accumulation',analyst_revisions:'Analyst revisions',institutional:'Institutional activity',valuation:'Valuation vs growth',growth_catalyst:'Growth acceleration'};
function breakdownHTML(b){
  const keys=Object.keys(b||{}).filter(k=>k[0]!=='_');
  return keys.map(k=>{const x=b[k];const na=x.pts==null;const w=na?0:x.pts/x.max*100;
    return `<div class="sc-bd ${na?'na':''}"><div class="sc-bd-h"><span>${LABELS[k]||k}</span><b>${na?'n/a':`${fmt(x.pts,1)}<span class="dim">/${x.max}</span>`}</b></div>
      <div class="wbar"><i style="width:${w}%"></i></div><div class="tiny">${H.esc(x.note||'')}</div></div>`;}).join('')+
    (b&&b._scale&&b._scale!==1?`<div class="tiny" style="margin-top:10px">Points shown out of each criterion's weight. Criteria marked n/a have no data source yet, so the total is scaled ×${fmt(b._scale,2)} to stay out of 100.</div>`:'');
}
function metricsHTML(m,r){
  const kv=(k,v)=>`<div class="kv"><span>${k}</span><span>${v}</span></div>`;
  const ccy=m.ccy&&m.ccy!=='USD'?` <span class="dim">${H.esc(m.ccy)}</span>`:'';
  const fin=[
    kv('Revenue (12 months)',`${big(m.rev_ttm)}${ccy} ${m.rev_growth!=null?'· '+pc(m.rev_growth):''}`),
    kv('Latest quarter vs year ago',`${pc(m.rev_q_yoy)} <span class="dim">(previous ${m.rev_q_yoy_prev!=null?(m.rev_q_yoy_prev>=0?'+':'−')+fmt(Math.abs(m.rev_q_yoy_prev*100),0)+'%':'—'})</span>`),
    kv('Net income (12 months)',`${big(m.ni_ttm)} <span class="dim">(was ${big(m.ni_ttm_prev)})</span>`),
    kv('Free cash flow (12 months)',`${big(m.fcf_ttm)} <span class="dim">(was ${big(m.fcf_ttm_prev)})</span>`),
    kv('Cash & short-term investments',big(m.cash)+(m.runway_m!=null?` · <span class="${m.runway_m<12?'down':''}">${fmt(m.runway_m,0)} mo runway</span>`:'')),
    m.gm!=null?kv('Gross margin',`${fmt(m.gm*100,1)}%${m.gm_prev!=null?` <span class="dim">(was ${fmt(m.gm_prev*100,1)}%)</span>`:''}`):'',
    m.dilution!=null?kv('Share count, 1 year',pc(m.dilution,1)):'',
    kv('Financials to',m.period_end?H.date(m.period_end)+(m.quarterly?'':' (annual)'):'—')].join('');
  const val=[kv('Market cap',big(r.market_cap)),kv('Price / sales',m.ps!=null?`${fmt(m.ps,1)}${m.sector_ps?` <span class="dim">· sector ${fmt(m.sector_ps,1)}</span>`:''}`:'—'),
    kv('Price / earnings',m.pe!=null?fmt(m.pe,1):'—')].join('');
  const mom=[kv('Return 1m / 3m',`${pc(m.ret_1m)} / ${pc(m.ret_3m)}`),kv('Return 6m / 12m',`${pc(m.ret_6m)} / ${pc(m.ret_12m)}`),
    kv('vs NASDAQ, 3 months',m.rs_3m!=null?pts(m.rs_3m)+' pts':'—'),
    kv('vs 50-day / 200-day avg',`${pc(m.vs_ma50)} / ${pc(m.vs_ma200)}`),
    kv('52-week high',`${usd(m.high_52w)} <span class="dim">(${m.off_high==null?'—':m.off_high>-0.005?'at the high':'−'+fmt(Math.abs(m.off_high*100),0)+'% below'})</span>`),
    kv('RSI (14 day)',m.rsi14!=null?fmt(m.rsi14,0):'—'),
    kv('Best up-day volume',m.vol_ratio!=null?fmt(m.vol_ratio,1)+'× average':'—'),
    kv('Avg traded value / day',big(m.dollar_vol_20d))].join('');
  return `<div class="card"><div class="form-sec">Fundamentals</div>${fin}${revBars(m.rev_quarters)}</div>
    <div class="card"><div class="form-sec">Valuation</div>${val}</div>
    <div class="card"><div class="form-sec">Price & momentum</div>${mom}</div>`;
}
function sinceLast(h){
  if(!h||h.length<2)return '';
  const a=h[h.length-2],b=h[h.length-1],d=b.score-a.score;
  const cls=a.classification!==b.classification?` · ${a.classification||'Unclassified'} → <b>${b.classification||'Unclassified'}</b>`:'';
  return `<div class="tiny" style="margin-top:8px">Since ${H.dateShort(a.scan_date)}: score ${d===0?'unchanged':pts(d)}${cls}</div>`;
}
/* Triage & confirmation buttons in the research sheet footer */
function watchFoot(sym){
  const W=App.watch;if(!W)return '';
  const st=W.stageOf(sym);
  if(!st)return `<button class="btn btn-p" id="scWatch" data-act2="add">＋ Add to Triage</button>`;
  return `<button class="btn btn-s" id="scWatchOpen">${st==='triage'?'In Triage':'In Confirmation'} · manage</button>`+
    (st==='triage'?`<button class="btn btn-p" id="scWatch" data-act2="confirm">Move to Confirmation ›</button>`:'');
}
function bindWatchFoot(sym){
  const b=H.$('#scWatch'),o=H.$('#scWatchOpen');
  if(o)o.onclick=()=>App.watch.open(sym);
  if(b)b.onclick=async()=>{b.disabled=true;
    if(b.dataset.act2==='add')await App.watch.add(sym);else await App.watch.move(sym,'confirmation');
    if(App.sheetIsOpen()&&H.$('#shTitle').textContent===sym){H.$('#shFoot').innerHTML=watchFoot(sym);bindWatchFoot(sym);}};
}
S.open=async sym=>{
  const r=S.rows.find(x=>x.symbol===sym);if(!r)return;
  const head=`<div data-nomask><div class="dhead"><div><div class="dprice">${usd(r.price)}</div>
      <div class="sub">${H.esc(r.sector||'')} · ${big(r.market_cap)} market cap</div></div>${H.pill(r.chg_pct)}</div>
    <div class="chips" style="gap:6px;margin-bottom:12px">${clsTag(r.classification)}${r.discovery?'<span class="tag gold">Discovery</span>':''}${held().has(sym)?'<span class="tag myr">You hold this</span>':''}${App.watch?App.watch.tag(sym):''}</div>`;
  App.openSheet({title:sym,sub:H.esc(r.name||''),full:true,body:head+App.skeleton(4)+'</div>',foot:watchFoot(sym)});
  bindWatchFoot(sym);
  let d=null,err='';
  try{d=await loadDetail(sym);}catch(e){err=e.message;}
  if(!App.sheetIsOpen()||H.$('#shTitle').textContent!==sym)return;
  if(!d){H.$('#shBody').innerHTML=head+`<div class="notice warn">${H.esc(err||'No detail for this stock')}</div></div>`;return;}
  const m=d.metrics||{};
  const reasons=(d.reasons||[]).length?`<div class="card"><div class="form-sec">${d.classification?'Why '+H.esc(d.classification):'Signals'}</div>
      <ul class="olist">${d.reasons.map(x=>`<li><span class="${d.classification==='Deteriorating'||d.classification==='Extended'?'down':'up'}">${d.classification==='Deteriorating'?'▼':'▲'}</span>${H.esc(x)}</li>`).join('')}</ul></div>`:'';
  const flags=(d.flags||[]).length?`<div class="notice due">${d.flags.map(H.esc).join('<br>')}</div>`:'';
  const cik=d.cik?String(d.cik).replace(/^0+/,''):'';
  H.$('#shBody').innerHTML=head+`
    <div class="card sc-scorecard"><div class="sc-big"><div class="sc-badge xl ${band(d.score)}">${d.score}</div>
      <div><div class="lbl">Score out of 100</div><div class="sub">1 month ${d.score_chg_1m!=null?pts(d.score_chg_1m):'<span class="dim">—</span>'} · 3 months ${d.score_chg_3m!=null?pts(d.score_chg_3m):'<span class="dim">—</span>'}</div>
      <div class="sc-sub2"><span>Fundamentals <b>${d.fund_score}</b></span><span>Momentum <b>${d.mom_score}</b></span></div></div></div>
      <div id="scHist" class="mc-wrap">${App.skeleton(1)}</div></div>
    ${reasons}${flags}
    <div class="card"><div class="form-sec">Score breakdown</div>${breakdownHTML(d.breakdown)}</div>
    <div class="card"><div class="form-sec">Price, 1 year</div><div id="scPx" class="mc-wrap">${App.skeleton(1)}</div></div>
    ${metricsHTML(m,d)}
    <div class="btn-row" style="margin-top:14px">
      ${cik?`<a class="btn btn-s" href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-&dateb=&owner=include&count=40" target="_blank" rel="noopener">SEC filings</a>`:''}
      <button class="btn btn-s" id="scQuote">Live quote</button></div>
    <p class="tiny sc-foot">Research aid only, not a recommendation. Financials from SEC filings up to ${m.period_end?H.date(m.period_end):'—'}; prices end of day ${H.date(S.run.scan_date)}.</p></div>`;
  const qb=H.$('#scQuote');if(qb)qb.onclick=()=>{App.closeSheet();App.go('more','quote');setTimeout(()=>App.more.lookup(sym,''),50);};
  const W=Math.max(280,(H.$('#shBody').clientWidth||360)-34);
  loadHistory(sym).then(h=>{const el=H.$('#scHist');if(!el)return;
    el.innerHTML=h.length>=2?scoreChart(h,W)+sinceLast(h)+(h.some(x=>x.backfilled)?'<div class="tiny">Hollow points are rebuilt from past data, not live scans.</div>':''):'<div class="tiny">Score history builds up with each daily scan.</div>';})
    .catch(e=>{const el=H.$('#scHist');if(el)el.innerHTML=`<div class="tiny">History unavailable: ${H.esc(e.message)}</div>`;});
  loadPrice(sym).then(p=>{const el=H.$('#scPx');if(el)el.innerHTML=priceChart(p,W);})
    .catch(e=>{const el=H.$('#scPx');if(el)el.innerHTML=`<div class="tiny">Price chart unavailable: ${H.esc(e.message)}</div>`;});
};
S.menuSub=()=>S.status==='ok'&&S.run?`${fmt(S.run.qualified,0)} qualified · ${H.dateShort(S.run.scan_date)}`:'Daily NASDAQ scan for emerging growth';
})();
