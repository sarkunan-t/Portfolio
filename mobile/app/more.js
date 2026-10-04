/* ===== More: quote lookup · price alerts · growth scanner · metals · ASNB · account ===== */
(function(){
const H=App.h, C=App.calc;
App.more={};
const LIST_LBL={observation:'Observation',triage:'Triage',confirmation:'Confirmation'};
App.more.alertRow=a=>{
  const down=a.direction==='down', cur=a.currency==='MYR'?'RM ':a.currency==='USD'?'US$':(a.currency||'')+' ';
  const kl=a.market==='Bursa', dp=kl?3:2;
  const name=kl?(TICKER_NAME[a.ticker]||a.ticker):a.ticker||a.symbol;
  const lst=a.list?` <span class="tag">${LIST_LBL[a.list]||H.esc(a.list)}</span>`:'';
  const on=`App.more.alertOpen('${H.esc(a.symbol||'')}','${H.esc(a.ticker||'')}','${H.esc(a.market||'')}','${H.esc(a.list||'')}','${H.esc(a.route||'')}')`;
  if(a.direction==='target'||a.direction==='signal'||a.direction==='score'){
    const ic={target:'🎯',signal:'⇄',score:'±'}[a.direction];
    const end=a.direction==='score'&&a.pct!=null?`<span class="pill-chg ${a.pct>0?'up':'down'}">${a.pct>0?'▲':'▼'} ${Math.abs(Math.round(a.pct))} pts</span>`:
      a.direction==='target'?'<span class="tag">Target</span>':'<span class="tag">Signal</span>';
    return `<button class="lrow" onclick="${on}">
      <div class="ico note">${ic}</div>
      <div class="main-col"><div class="t1">${H.esc(name)}${lst}</div><div class="t2" style="white-space:normal">${H.esc(String(a.message||'').replace(/^[^:·]+:\s*/,'').replace(/^\S+ hit target · /,'Target reached · ').replace(/ · (Observation|Triage|Confirmation)$/,''))}<br>${H.date(a.alert_date)}</div></div>
      <div class="end">${end}</div></button>`;
  }
  return `<button class="lrow" onclick="${on}">
    <div class="ico ${down?'sell':'buy'}">${down?'▼':'▲'}</div>
    <div class="main-col"><div class="t1">${H.esc(name)}${lst}</div><div class="t2">${H.date(a.alert_date)} · ${cur}${fmt(a.price,dp)} (prev ${fmt(a.prev_close,dp)})</div></div>
    <div class="end">${H.pill(Number(a.pct))}</div></button>`;
};
/* tapping an alert: watchlist stock → its sheet (or its list), holding → the stock */
App.more.alertOpen=(sym,ticker,market,list,route)=>{
  if(list){
    if(App.watch&&App.watch.get&&App.watch.get(sym))return App.watch.open(sym);
    location.hash=route||(list==='observation'?'#more/observe':'#more/triage');return;
  }
  if(ticker)App.holdings.openStock(ticker,market);
};

/* ---- quote lookup (uses the same "quote" Edge Function as prices) ---- */
const EXCH=[['','US'],['.KL','Bursa'],['.SI','SGX'],['.HK','HK'],['.L','London'],['.AX','ASX'],['-USD','Crypto']];
let qState={exch:'.KL',last:null,err:'',busy:false};
const recents=()=>{try{return JSON.parse(localStorage.getItem('ql_recents')||'[]');}catch(e){return [];}};
const saveRecent=(sym,ex)=>{try{let r=recents().filter(x=>x.symbol!==sym);r.unshift({symbol:sym,exchange:ex});localStorage.setItem('ql_recents',JSON.stringify(r.slice(0,10)));}catch(e){}};
async function lookup(raw,ex){
  let t=String(raw||'').trim().toUpperCase();if(!t)return;
  const sym=ex==='-USD'?(t.endsWith('-USD')?t:t+'-USD'):(ex&&!t.endsWith(ex)?t+ex:t);
  qState={...qState,busy:true,err:'',last:null,exch:ex,input:t};App.render(false);
  try{
    const data=await invokeQuote({symbols:[sym]});
    const q=data&&(data[sym]||data[sym.toUpperCase()]);
    if(!q||q.error||q.price==null)throw new Error(q&&q.error?q.error:'No price found for '+sym);
    qState.last={sym,...q};saveRecent(t.replace(ex,''),ex);
  }catch(e){qState.err=e.message||'Lookup failed';}
  qState.busy=false;App.render(false);
}
App.more.lookup=lookup;
function renderQuote(el){
  const q=qState.last, dp=q&&q.prevClose?((q.price-q.prevClose)/q.prevClose*100):null;
  let html=`<div class="card"><form id="qForm"><label class="fld"><span>Ticker</span>
      <input id="qT" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. 1155, AAPL, BTC" value="${H.esc(qState.input||'')}"></label>
    <div class="lbl" style="margin-bottom:6px">Exchange</div>
    <div class="chips">${EXCH.map(([v,l])=>`<button type="button" class="chip ${qState.exch===v?'on':''}" data-ex="${v}">${l}</button>`).join('')}</div>
    <button class="btn btn-p" style="width:100%;margin-top:14px" type="submit">${qState.busy?'<span class="spin-i"></span> Looking up…':'Get price'}</button></form>
    ${qState.exch==='.KL'?'<div class="tiny" style="margin-top:8px">Bursa uses numeric codes — e.g. 1155 Maybank, 5347 Tenaga.</div>':''}</div>`;
  if(qState.err)html+=`<div class="notice warn">${H.esc(qState.err)}</div>`;
  if(q){const cur=q.currency||'';
    html+=`<div class="card"><div class="dhead"><div><div class="lbl">${H.esc(q.sym)} ${/^[A-Z0-9.\-]+$/.test(q.sym)&&!/\.|-USD/.test(q.sym)?H.wtag(q.sym,"US"):""}</div><div class="dprice">${cur} ${fmt(q.price,q.price<10?3:2)}</div>
      <div class="sub">${q.prevClose?`prev close ${fmt(q.prevClose,q.price<10?3:2)}`:''}</div></div>${H.pill(dp)}</div>
      <div class="tiny">Yahoo Finance · about 15 min delayed · ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div></div>`;}
  const r=recents();
  if(r.length)html+=`<div class="sec"><h2>Recent</h2></div><div class="chips">${r.map(x=>`<button class="chip" data-rs="${H.esc(x.symbol)}" data-rx="${H.esc(x.exchange||'')}">${H.esc(x.symbol)}${x.exchange?`<span class="dim">${H.esc(x.exchange)}</span>`:''}</button>`).join('')}</div>`;
  el.innerHTML=html;
  const f=document.getElementById('qForm');
  f.onsubmit=e=>{e.preventDefault();lookup(document.getElementById('qT').value,qState.exch);};
  f.querySelectorAll('[data-ex]').forEach(b=>b.onclick=()=>{qState.exch=b.dataset.ex;qState.input=document.getElementById('qT').value;App.render(false);});
  el.querySelectorAll('[data-rs]').forEach(b=>b.onclick=()=>lookup(b.dataset.rs,b.dataset.rx));
}

function renderAlerts(el){
  const a=App.state.alerts;
  if(App.state.alertsStatus==='loading'){el.innerHTML=App.skeleton(4);return;}
  el.innerHTML=`<div class="notice info" style="margin-top:0">You're alerted when a <b>holding</b> or a stock on <b>Observation / Triage &amp; confirmation</b> moves <b>−3%</b> or <b>+5%</b> vs its previous close (checked every 15 min in Bursa and US hours, once per stock per day each way). Watched stocks also alert when they <b>reach their average analyst target</b> (once per 30 days), and after the nightly scan when their <b>signal changes</b> or their <b>score moves 10+ points</b>.</div>`+
    (a.length?`<div class="list" style="margin-top:12px">${a.map(App.more.alertRow).join('')}</div>`:'<div class="empty">No alerts yet.</div>');
}
const placeholder=(title,text,cols)=>`<div class="card muted-card"><div class="val">${title} — coming soon</div><p class="sub" style="margin-top:8px;font-size:14px">${text}</p>
  <p class="tiny" style="margin-top:10px">To switch it on we'll add a <b>${cols[0]}</b> table in Supabase (${cols[1]}) and wire it up like Share Holdings.</p></div>`;

function renderMenu(el){
  const r=H.fx();
  const item=(href,ico,cls,t1,t2)=>`<a class="lrow" href="${href}" style="text-decoration:none;color:inherit"><div class="ico ${cls}">${ico}</div><div class="main-col"><div class="t1">${t1}</div><div class="t2">${t2}</div></div>${H.icon.chev}</a>`;
  const wide=App.wide();
  el.innerHTML=(wide?'':`<div class="list menu">
      ${item('#more/quote',H.icon.search,'myr','Quote lookup','Any stock, Bursa, US, SGX, HK, crypto')}
      ${item('#more/alerts',H.icon.bell,'div','Price alerts',`${App.state.alerts.length} recent · moves, targets, signals`)}
    </div>
    <div class="sec"><h2>Research</h2></div>
    <div class="list menu">
      ${item('#more/scanner',H.icon.radar,'buy','Growth scanner',App.scanner.menuSub())}
      ${item('#more/triage',H.icon.flag,'div','Triage &amp; confirmation',App.watch.menuSub())}
      ${item('#more/observe',H.icon.eye,'usd','Observation',App.watch.obsSub())}
    </div>
    <div class="sec"><h2>Other assets</h2></div>
    <div class="list menu">
      ${item('#more/metals',H.icon.gold,'div','Metals',App.metals.menuSub())}
      ${item('#more/crypto',H.icon.coin,'usd','Crypto',App.crypto.menuSub())}
      ${item('#more/asnb',H.icon.unit,'xf','ASNB',App.asnb.menuSub())}
    </div>`)+`<div class="sec" ${wide?'style="margin-top:4px"':''}><h2>Data</h2></div>
    <div class="list menu">
      <div class="lrow"><div class="ico usd">${H.icon.fx}</div><div class="main-col"><div class="t1">USD / MYR</div><div class="t2">${r?`${fmt(r,4)} · ${kpiFxSrc}`:'loading…'}</div></div></div>
      <button class="lrow" onclick="App.reloadAll();showToast('Reloading data…')"><div class="ico myr">${H.icon.refresh}</div><div class="main-col"><div class="t1">Reload all data</div><div class="t2">${App.priceNote()}</div></div></button>
    </div>
    <div class="sec"><h2>Account</h2></div>
    <div class="list menu">
      <button class="lrow" onclick="App.more.signOut()"><div class="ico" style="background:#eef2f1">${H.icon.out}</div><div class="main-col"><div class="t1">Sign out</div><div class="t2" id="whoami"></div></div></button>
      <button class="lrow" onclick="App.more.reset()"><div class="ico sell">${H.icon.trash}</div><div class="main-col"><div class="t1" style="color:var(--down)">Reset data</div><div class="t2">Delete ALL transactions and dividends</div></div></button>
    </div>
    <div class="tiny" style="text-align:center;margin-top:20px">${App.web?'Markets Suite web · same data as the UnicornHunter app':'UnicornHunter app · same data as the web version'}</div>`;
  sb.auth.getSession().then(({data:{session}})=>{const w=document.getElementById('whoami');if(w&&session)w.textContent=session.user.email;});
}
App.more.signOut=async()=>{if(!confirm('Sign out of '+App.brand+'?'))return;await sb.auth.signOut();location.hash='';location.reload();};
App.more.reset=async()=>{
  if(!confirm('This will permanently delete ALL transactions and dividends.\n\nContinue?'))return;
  const word=prompt('Final check — type RESET to confirm:');
  if(word===null)return;
  if(word.trim().toUpperCase()!=='RESET'){showToast('Reset cancelled');return;}
  const [a,b]=await Promise.all([sb.from('transactions').delete().not('id','is',null),sb.from('dividends').delete().not('id','is',null)]);
  if(a.error||b.error){showToast('Reset failed — check connection');return;}
  showToast('All data cleared ✓');App.reloadShares();
};

const TITLES={menu:'More',scanner:'Growth scanner',triage:'Triage & confirmation',observe:'Observation',quote:'Quote lookup',alerts:'Price alerts',metals:'Metals',crypto:'Crypto',asnb:'ASNB'};
App.screens.more={
  title:seg=>TITLES[seg]||'More',
  segs:[{id:'menu'},{id:'quote'},{id:'alerts'},{id:'scanner'},{id:'triage'},{id:'observe'},{id:'metals'},{id:'crypto'},{id:'asnb'}],
  hideSegs:true,
  actions:seg=>seg==='scanner'&&App.scanner.status==='ok'?[{id:'filter',active:App.filterActive(App.state.filters.scanner)}]:[],
  openFilter:seg=>{if(seg==='scanner')App.scanner.openFilter();},
  fab:seg=>seg==='triage'&&App.watch.status==='ok'?{label:'Add',onClick:()=>App.watch.form()}:
    seg==='observe'&&App.watch.status==='ok'?{label:'Add',onClick:()=>App.watch.form('observation')}:
    seg==='metals'&&App.metals.view!=='market'&&App.metals.status==='ok'?{label:'Add',onClick:()=>App.metals.form()}:
    seg==='crypto'&&App.crypto.view!=='market'&&App.crypto.status==='ok'?{label:'Add',onClick:()=>App.crypto.form()}:
    seg==='asnb'&&App.asnb.status==='ok'?{label:'Add',onClick:()=>App.asnb.form()}:null,
  sub:seg=>seg==='menu'?App.priceNote():`<a class="link" href="#more/menu">‹ More</a>`,
  render(el,seg){
    if(seg==='quote')renderQuote(el);
    else if(seg==='alerts')renderAlerts(el);
    else if(seg==='scanner')App.scanner.render(el);
    else if(seg==='triage')App.watch.render(el);
    else if(seg==='observe')App.watch.renderObs(el);
    else if(seg==='metals')App.metals.render(el);
    else if(seg==='crypto')App.crypto.render(el);
    else if(seg==='asnb')App.asnb.render(el);
    else renderMenu(el);
  }
};
})();
