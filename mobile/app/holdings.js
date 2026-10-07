/* ===== Holdings: open positions · wallets · all stocks ===== */
(function(){
const H=App.h, C=App.calc;
const FK='holdings';
App.holdings={};

function filters(){return App.state.filters[FK]||{};}
function filterGroups(){
  const lots=positionEngine().open, stocks={};
  lots.forEach(l=>{stocks[l.ticker]=H.stockLabel(l.ticker,l.market,l.name);});
  const years=[...new Set(lots.map(l=>new Date(l.tx.tx_date).getFullYear()).filter(y=>!isNaN(y)))].sort((a,b)=>b-a);
  return [
    {id:'ccy',label:'Currency',options:['MYR','USD'].map(v=>({value:v}))},
    {id:'wallet',label:'Wallet',options:C.WALLETS.map(w=>({value:w.key}))},
    {id:'stock',label:'Stock',options:Object.entries(stocks).sort((a,b)=>a[1].localeCompare(b[1])).map(([v,l])=>({value:v,label:l}))},
    {id:'year',label:'Year bought',options:years.map(v=>({value:String(v)}))}
  ];
}

/* analyst target / upside (App.pt, filled by the price-target Edge Function) */
const tgt=p=>App.pt?App.pt.get(p.sym):null;
const upside=p=>App.pt?App.pt.upside(p.sym,p.price):null;
function tgtLine(p){const t=tgt(p),u=upside(p);if(!t)return '';
  return `<div class="pos-meta" style="margin-top:3px">Analyst target ${p.ccy} ${fmt(t.mean,p.market==='Bursa'?3:2)} · <span class="${u>=0?'up':'down'}">${u>=0?'+':'−'}${fmt(Math.abs(u),1)}% upside</span>${t.analysts?` · ${t.analysts} analysts`:''}</div>`;}
/* pre-market / after-hours (US only, App.ext in analysis.js) */
function extCell(p){
  if(p.market==='Bursa'||!App.ext)return '<span class="dim">—</span>';
  const v=App.ext.view(p.sym);
  if(!v)return App.ext.busy&&!(p.sym in App.ext.cache)?'<span class="spin-i"></span>':'<span class="dim">—</span>';
  return `${fmt(v.price,2)} <span class="${v.pct>=0?'up':'down'}" style="font-weight:700">${v.pct>=0?'+':'−'}${fmt(Math.abs(v.pct||0),2)}%</span><div class="t-sub">${v.kind==='pre'?'Pre':'After'} ${App.ext.time(v.time)}${v.live?' · live':''}</div>`;
}
function extLine(p){
  if(p.market==='Bursa'||!App.ext)return '';
  const v=App.ext.view(p.sym);if(!v)return '';
  return `<div class="pos-meta" style="margin-top:4px">${App.ext.label(v)} <b>${p.ccy} ${fmt(v.price,2)}</b> <span class="${v.pct>=0?'up':'down'}" style="font-weight:700">${v.pct>=0?'+':'−'}${fmt(Math.abs(v.pct||0),2)}%</span> · ${App.ext.time(v.time)}${v.live?' <span class="tag usd">live</span>':''}</div>`;
}
function posCard(p,grand){
  const usd=p.ccy==='USD', my=C.toMyr(p.ccy,p.value), w=grand&&my!=null?my/grand*100:null;
  const val=p.state==='loading'?'<span class="spin-i"></span>':p.value==null?'—':H.money(p.ccy,p.value);
  return `<button class="pos tap ${usd?'usd':''}" onclick="App.holdings.openStock('${p.ticker}','${p.market}')">
    <div class="pos-top">
      <div style="min-width:0"><div class="pos-name">${H.esc(p.label)} ${H.wtag(p.ticker,p.market)}</div>
        <div class="pos-meta">${H.esc(p.subl)} · <span class="tag ${usd?'usd':'myr'}">${p.wallet}</span></div></div>
      ${H.pill(p.dayPct)}
    </div>
    <div class="pos-meta" style="margin-top:8px">${fmt(p.units,p.units%1?4:0)} units · avg ${p.ccy} ${fmt(p.avg,p.market==='Bursa'?3:2)} · now ${p.price==null?'—':p.ccy+' '+fmt(p.price,p.market==='Bursa'?3:2)}</div>
    ${extLine(p)}${tgtLine(p)}
    <div class="pos-bot">
      <div><div class="pos-val">${val}</div>${usd&&p.value!=null&&H.fx()?`<div class="tiny">${H.eqMyr('USD',p.value)}</div>`:''}</div>
      <div class="pos-pl">${p.pnl==null?'—':H.money(p.ccy,p.pnl,true)}<div>${H.pct(p.pnlPct)}</div></div>
    </div>
    ${w!=null?`<div class="wbar"><i style="width:${Math.min(w,100)}%"></i></div><div class="tiny" style="margin-top:4px">${fmt(w,1)}% of portfolio</div>`:''}
  </button>`;
}

function summaryCard(T,c){
  const r=H.fx(), mv=T.MYR.value||0, uv=r?(T.USD.value||0)*r:0, tot=mv+uv, mix=tot>0?mv/tot*100:0;
  return `<div class="card">
    <div class="dhead"><div><div class="lbl">Market value${App.filterActive(filters())?' · filtered':''}</div>
      <div class="big" style="font-size:28px;margin-top:3px">${c.value==null?'—':'MYR '+fmt(c.value)}</div>
      <div class="sub">${c.pnl==null?'':`${H.money('MYR',c.pnl,true)} (${H.pct(c.pnlPct)}) unrealised`}</div></div>
      <div style="text-align:right">${c.dayPct!=null?H.pill(c.dayPct)+'<div class="tiny" style="margin-top:4px">today</div>':''}</div></div>
    <div class="grid g2" style="gap:8px">
      <div><div class="lbl">MYR holdings · ${T.MYR.n}</div><div style="font-weight:800">${T.MYR.value==null?'—':H.money('MYR',T.MYR.value)}</div><div class="tiny">cost ${H.money('MYR',T.MYR.cost)} · ${T.MYR.pnl==null?'—':H.pct(T.MYR.pnlPct)}</div></div>
      <div><div class="lbl">USD holdings · ${T.USD.n}</div><div style="font-weight:800">${T.USD.value==null?'—':H.money('USD',T.USD.value)}</div><div class="tiny">${T.USD.value!=null&&r?H.eqMyr('USD',T.USD.value)+' · ':''}${T.USD.pnl==null?'—':H.pct(T.USD.pnlPct)}</div></div>
    </div>
    ${tot>0&&T.MYR.n&&T.USD.n?`<div class="mix"><i style="width:${mix}%;background:#00a19c"></i><i style="flex:1;background:#6a4fd1"></i></div>
      <div class="mix-lbl"><span>MYR ${fmt(mix,1)}%</span><span>USD ${fmt(100-mix,1)}%</span></div>`:''}
  </div>`;
}

function renderOpen(el){
  const pos=C.positions(filters()), {by,T,c}=C.combined(pos);
  if(App.pt&&pos.length)App.pt.ensure(pos.map(p=>p.sym));
  if(App.ext&&pos.length)App.ext.ensure(pos.filter(p=>p.market!=='Bursa').map(p=>p.sym));
  let html=App.filterChips(FK)+summaryCard(T,c);
  if(!pos.length){el.innerHTML=html+`<div class="empty">No open positions${App.filterActive(filters())?' match these filters':''}.</div>`;return;}
  const sortV=l=>[...l].sort((a,b)=>(C.toMyr(b.ccy,b.value)||0)-(C.toMyr(a.ccy,a.value)||0)||b.cost-a.cost);
  if(App.wide()){el.innerHTML=html+openTables(by,T,c.value);return;}
  ['MYR','USD'].forEach(ccy=>{
    const l=by[ccy]; if(!l.length)return; const t=T[ccy];
    html+=`<div class="sec"><h2>${ccy==='MYR'?'Bursa · MYR':'US · USD'}</h2><span class="note">${t.n} position${t.n!==1?'s':''} · ${t.value==null?'—':H.money(ccy,t.value)}</span></div>
      <div class="grid gw2 gw3">${sortV(l).map(p=>posCard(p,c.value)).join('')}</div>`;
  });
  if(r0())html+=`<div class="tiny" style="margin:14px 2px 0">One card per stock per wallet. Cost is each wallet's average cost over its full history. USD converted to MYR at ${fmt(H.fx(),4)}.</div>`;
  el.innerHTML=html;
}
const r0=()=>H.fx();

/* ---- desktop tables (web site) ---- */
const hs={col:'value',dir:'desc'};
App.holdings.sort=k=>{hs.dir=hs.col===k&&hs.dir==='desc'?'asc':'desc';hs.col=k;App.render(false);};
const SORTV={stock:p=>p.label.toLowerCase(),wallet:p=>p.wallet,units:p=>p.units,avg:p=>p.avg,price:p=>p.price??-1e18,day:p=>p.dayPct??-1e18,
  ext:p=>{const v=App.ext&&App.ext.view(p.sym);return v&&v.pct!=null?v.pct:-1e18;},
  cost:p=>p.cost,value:p=>C.toMyr(p.ccy,p.value)??-1e18,pnl:p=>p.pnl??-1e18,pct:p=>p.pnlPct??-1e18,up:p=>upside(p)??-1e18};
function openTables(by,T,grand){
  const f=SORTV[hs.col]||SORTV.value, d=hs.dir==='asc'?1:-1;
  const cols=[{k:'stock',label:'Stock',sort:1},{k:'units',label:'Units',cls:'n',sort:1},
    {k:'price',label:'Price',cls:'n',sort:1},{k:'day',label:'Today',cls:'n',sort:1,hide:1},{k:'ext',label:'Pre / after'+H.tip('ta.ext'),cls:'n',sort:1},{k:'value',label:'Value',cls:'n',sort:1},
    {k:'pnl',label:'P&amp;L',cls:'n',sort:1},{k:'up',label:'Upside'+H.tip('w.upside'),cls:'n',sort:1},{k:'w',label:'Weight',cls:'n'}];
  return ['MYR','USD'].map(ccy=>{
    const l=by[ccy];if(!l.length)return '';const t=T[ccy];
    const rows=[...l].sort((a,b)=>{const x=f(a),y=f(b);return x<y?-d:x>y?d:0;}).map(p=>{
      const my=C.toMyr(p.ccy,p.value),w=grand&&my!=null?my/grand*100:null,dp=p.market==='Bursa'?3:2;
      return {on:`App.holdings.openStock('${p.ticker}','${p.market}')`,cells:{
        stock:`<div class="t-main">${H.esc(p.label)} ${H.wtag(p.ticker,p.market)}</div><div class="t-sub"><span class="t-nm" title="${H.esc(p.subl)}">${H.esc(p.subl)}</span> <span class="tag ${p.ccy==='USD'?'usd':'myr'}">${p.wallet}</span></div>`,
        up:(()=>{const t=tgt(p),u=upside(p);return t&&u!=null?`<b class="${u>=0?'up':'down'}">${u>=0?'+':'−'}${fmt(Math.abs(u),0)}%</b><div class="t-sub">${fmt(t.mean,dp)}${t.analysts?' · '+t.analysts:''}</div>`:
          App.pt&&App.pt.busy&&!App.pt.get(p.sym)&&!(p.sym in App.pt.cache&&App.pt.cache[p.sym])?'<span class="spin-i"></span>':'<span class="dim">—</span>';})(),
        units:`${fmt(p.units,p.units%1?4:0)}<div class="t-sub">avg ${fmt(p.avg,dp)}</div>`,price:p.price==null?(p.state==='loading'?'<span class="spin-i"></span>':'—'):`${fmt(p.price,dp)}<div class="t-sub" style="margin-top:3px">${H.pill(p.dayPct)}</div>`,ext:extCell(p),value:`${p.value==null?'—':`<b>${fmt(p.value)}</b>`}<div class="t-sub">cost ${fmt(p.cost)}</div>`,pnl:p.pnl==null?'—':`${H.money(p.ccy,p.pnl,true).replace(p.ccy+' ','')}<div class="t-sub">${H.pct(p.pnlPct)}</div>`,w:w==null?'—':`<div class="wcell"><div class="wbar"><i style="width:${Math.min(w*2,100)}%"></i></div>${fmt(w,1)}%</div>`}};});
    return `<div class="dt-note"><h2>${ccy==='MYR'?'Bursa · MYR':'US · USD'}</h2><span class="note">${t.n} position${t.n!==1?'s':''} · ${t.value==null?'—':H.money(ccy,t.value)}${ccy==='USD'&&t.value!=null&&H.fx()?' · '+H.eqMyr('USD',t.value):''}</span></div>`+
      H.table(cols.filter(c=>!c.hide&&(ccy!=='MYR'||c.k!=='ext')),rows,{sort:hs,onSort:'App.holdings.sort',foot:{stock:'Total',value:`${t.value==null?'—':fmt(t.value)}<div class="t-sub">cost ${fmt(t.cost)}</div>`,pnl:t.pnl==null?'—':`${H.money(ccy,t.pnl,true).replace(ccy+' ','')}<div class="t-sub">${H.pct(t.pnlPct)}</div>`}});
  }).join('')+`<div class="tiny" style="margin:14px 2px 0">One row per stock per wallet. Cost is each wallet's average cost over its full history. Click a row for details, or a column heading to sort. Upside = average Wall Street analyst target vs today's price (via Yahoo Finance)${App.pt&&App.pt.state==='missing'?' — deploy the price-target Edge Function to see it':''}.${H.fx()?` USD converted to MYR at ${fmt(H.fx(),4)}.`:''}</div>`;
}

function walletCard(w,list,grand){
  const t=C.totals(list), usd=w.ccy==='USD';
  const my=C.toMyr(w.ccy,t.value), share=grand&&my!=null?my/grand*100:null;
  if(!t.n)return `<div class="card muted-card"><div class="pos-top"><div><div class="pos-name">${w.key}</div><div class="pos-meta">${C.CDS_NAME[w.cds]} · ${w.ccy}</div></div></div><div class="tiny" style="margin-top:8px">No active holdings</div></div>`;
  const top=[...list].filter(p=>p.value!=null).sort((a,b)=>b.value-a.value)[0];
  return `<button class="pos tap ${usd?'usd':''}" onclick="App.holdings.openWallet('${w.key}')">
    <div class="pos-top"><div><div class="pos-name">${w.key}</div><div class="pos-meta">${C.CDS_NAME[w.cds]} · ${w.ccy} · ${t.n} position${t.n!==1?'s':''}</div></div>${H.ccyTag(w.ccy)}</div>
    <div class="pos-bot"><div><div class="pos-val">${t.value==null?(t.loading?'<span class="spin-i"></span>':'—'):H.money(w.ccy,t.value)}</div>
      <div class="tiny">cost ${H.money(w.ccy,t.cost)}${usd&&t.value!=null&&H.fx()?' · '+H.eqMyr('USD',t.value):''}</div></div>
      <div class="pos-pl">${t.pnl==null?'—':H.money(w.ccy,t.pnl,true)}<div>${H.pct(t.pnlPct)}</div></div></div>
    ${share!=null?`<div class="wbar"><i style="width:${Math.min(share,100)}%"></i></div>`:''}
    <div class="tiny" style="margin-top:4px">${share!=null?fmt(share,1)+'% of portfolio':''}${top&&t.value?` · largest ${H.esc(top.label)} ${fmt(top.value/t.value*100,0)}%`:''}${t.priced<t.n&&!t.loading?` · ${t.priced}/${t.n} priced`:''}</div>
  </button>`;
}
function renderWallets(el){
  const f=filters(), pos=C.positions(f), {c}=C.combined(pos);
  let html=App.filterChips(FK);
  ['MYR','USD'].forEach(ccy=>{
    if(f.ccy&&f.ccy.length&&!f.ccy.includes(ccy))return;
    const ws=C.WALLETS.filter(w=>w.ccy===ccy&&(!f.wallet||!f.wallet.length||f.wallet.includes(w.key)));
    if(!ws.length)return;
    const list=pos.filter(p=>p.ccy===ccy), t=C.totals(list);
    html+=`<div class="sec"><h2>${ccy} wallets</h2><span class="note">${t.value==null?'—':H.money(ccy,t.value)}</span></div>
      <div class="grid gw2 gw3">${ws.map(w=>walletCard(w,list.filter(p=>p.wallet===w.key),c.value)).join('')}</div>`;
  });
  html+=`<div class="tiny" style="margin:14px 2px 0">Cash balances and settlements are under Insights → Cash.</div>`;
  el.innerHTML=html;
}

function renderStocks(el){
  const rows=C.summary(), fx=H.fx();
  const tot={buy:{MYR:0,USD:0},sell:{MYR:0,USD:0},pnl:{MYR:0,USD:0},est:{MYR:0,USD:0},div:0};
  rows.forEach(h=>{const c=h.ccy==='USD'?'USD':'MYR';tot.buy[c]+=h.nettBuy;tot.sell[c]+=h.nettSell;tot.pnl[c]+=h.realised;if(h.est)tot.est[c]+=h.est;tot.div+=h.divTot;});
  const openN=rows.filter(h=>h.open).length;
  let html=`<div class="card"><div class="grid g2 ${App.wide()?'g4':''}" style="gap:12px">
    <div><div class="lbl">Realised P&amp;L (all time)</div><div class="val">${H.money('MYR',tot.pnl.MYR,true)}</div>${tot.pnl.USD?`<div class="tiny">${H.money('USD',tot.pnl.USD,true)}</div>`:''}</div>
    <div><div class="lbl">Dividends (all time)</div><div class="val gold">${fmt(tot.div)}</div><div class="tiny">as recorded (MYR, USD rows as-is)</div></div>
    <div><div class="lbl">Nett bought</div><div style="font-weight:800">MYR ${fmt(tot.buy.MYR)}</div>${tot.buy.USD?`<div class="tiny">USD ${fmt(tot.buy.USD)}</div>`:''}</div>
    <div><div class="lbl">Nett sold</div><div style="font-weight:800">MYR ${fmt(tot.sell.MYR)}</div>${tot.sell.USD?`<div class="tiny">USD ${fmt(tot.sell.USD)}</div>`:''}</div>
  </div></div>`;
  const row=h=>`<button class="lrow" onclick="App.holdings.openStock('${h.ticker}','${h.market}')">
    <div class="ico ${h.open?(h.ccy==='USD'?'usd':'myr'):''}" style="${h.open?'':'background:#eef2f1;color:var(--dim)'}">${h.open?(h.ccy==='USD'?'$':'RM'):'—'}</div>
    <div class="main-col"><div class="t1">${H.esc(h.label)} ${H.wtag(h.ticker,h.market)}</div>
      <div class="t2">${h.ticker} · ${h.open?`${fmt(h.qty,0)} units @ ${fmt(h.avg,h.market==='Bursa'?4:2)}`:'fully sold'}${h.divTot?` · div ${fmt(h.divTot)}`:''}</div></div>
    <div class="end"><div class="v">${h.est!=null?fmt(h.est):h.open?(h.state==='loading'?'<span class="spin-i"></span>':'—'):''}</div>
      <div class="s">${H.money(h.ccy,h.realised,true)} <span class="dim" style="font-weight:600">realised</span></div></div>
    ${H.icon.chev}</button>`;
  if(App.wide()){
    const cols=[{k:'s',label:'Stock'},{k:'q',label:'Units held',cls:'n'},{k:'a',label:'Avg cost',cls:'n'},{k:'e',label:'Est. value',cls:'n'},
      {k:'b',label:'Nett bought',cls:'n'},{k:'sl',label:'Nett sold',cls:'n'},{k:'r',label:'Realised P&amp;L',cls:'n'},{k:'d',label:'Dividends',cls:'n'}];
    const tr=h=>({on:`App.holdings.openStock('${h.ticker}','${h.market}')`,cells:{
      s:`<div class="t-main">${H.esc(h.label)} ${H.wtag(h.ticker,h.market)}</div><div class="t-sub">${h.ticker} ${H.ccyTag(h.ccy==='USD'?'USD':'MYR')}</div>`,
      q:h.open?fmt(h.qty,0):'<span class="dim">sold</span>',a:h.open?fmt(h.avg,h.market==='Bursa'?4:2):'',e:h.est!=null?fmt(h.est):h.open?(h.state==='loading'?'<span class="spin-i"></span>':'—'):'',
      b:fmt(h.nettBuy),sl:fmt(h.nettSell),r:H.money(h.ccy,h.realised,true).replace(h.ccy+' ',''),d:h.divTot?`<span class="gold">${fmt(h.divTot)}</span>`:'<span class="dim">—</span>'}});
    html+=`<div class="dt-note"><h2>Holding</h2><span class="note">${openN} stocks</span></div>`+H.table(cols,rows.filter(h=>h.open).map(tr));
    const cl=rows.filter(h=>!h.open);
    if(cl.length)html+=`<div class="dt-note"><h2>Sold</h2><span class="note">${cl.length} stocks</span></div>`+H.table(cols,cl.map(tr));
    el.innerHTML=html;return;
  }
  html+=`<div class="sec"><h2>Holding</h2><span class="note">${openN} stocks</span></div><div class="list">${rows.filter(h=>h.open).map(row).join('')||'<div class="empty">None</div>'}</div>`;
  const closed=rows.filter(h=>!h.open);
  if(closed.length)html+=`<div class="sec"><h2>Sold</h2><span class="note">${closed.length} stocks</span></div><div class="list">${closed.map(row).join('')}</div>`;
  el.innerHTML=html;
}

/* ---- detail sheet for one stock (all wallets) ---- */
App.holdings.openStock=(ticker,market)=>{
  const s=C.summary().find(h=>h.ticker===ticker&&h.market===market);
  const pos=C.positions().filter(p=>p.ticker===ticker&&p.market===market);
  const sym=market==='Bursa'?ticker+'.KL':ticker, q=C.quote(sym), ccy=s?s.ccy:(market==='Bursa'?'MYR':'USD');
  const dp=market==='Bursa'?3:2, day=C.dayPct(q);
  let body=`<div class="dhead"><div><div class="dprice">${q?ccy+' '+fmt(q.price,dp):'—'}</div>
      <div class="sub">${q&&q.prevClose?`prev close ${ccy} ${fmt(q.prevClose,dp)}`:'no live price'}</div></div>
      <div style="text-align:right">${H.pill(day)}</div></div>`;
  if(pos.length){
    const t=C.totals(pos);
    body+=`<div class="card" style="box-shadow:none"><div class="kv b"><span>Market value</span><span>${t.value==null?'—':H.money(ccy,t.value)}</span></div>
      ${ccy==='USD'&&t.value!=null?`<div class="eq">${H.eqMyr('USD',t.value)}</div>`:''}
      <div class="kv"><span>Cost</span><span>${H.money(ccy,t.cost)}</span></div>
      <div class="kv"><span>Unrealised P&amp;L</span><span>${t.pnl==null?'—':H.money(ccy,t.pnl,true)} ${t.pnlPct==null?'':'('+H.pct(t.pnlPct)+')'}</span></div>
      <div class="kv"><span>Today</span><span>${t.dayBase?H.money(ccy,t.day,true):'—'}</span></div>
      ${(()=>{const pt=App.pt&&App.pt.get(sym),u=App.pt&&q?App.pt.upside(sym,q.price):null;return pt?`<div class="kv"><span>${H.lt('Analyst target','w.target')}</span><span>${ccy} ${fmt(pt.mean,dp)} <span class="${u>=0?'up':'down'}">(${u>=0?'+':'−'}${fmt(Math.abs(u||0),1)}%)</span>${pt.analysts?` <span class="dim">· ${pt.analysts} analysts</span>`:''}</span></div>`:'';})()}</div>`;
    body+=`<div class="form-sec">By wallet</div>`+pos.map(p=>`<div class="card" style="box-shadow:none;margin-top:8px">
      <div class="pos-top"><div class="pos-name">${p.wallet}</div><span class="tiny">since ${H.date(p.since)}${p.lots>1?` · ${p.lots} buy lots`:''}</span></div>
      <div class="kv" style="margin-top:6px"><span>Shares</span><span>${fmt(p.units,p.units%1?4:0)}</span></div>
      <div class="kv"><span>Avg cost</span><span>${ccy} ${fmt(p.avg,dp)}</span></div>
      <div class="kv"><span>Cost</span><span>${H.money(ccy,p.cost)}</span></div>
      <div class="kv"><span>Value</span><span>${p.value==null?'—':H.money(ccy,p.value)}</span></div>
      <div class="kv"><span>Unrealised</span><span>${p.pnl==null?'—':H.money(ccy,p.pnl,true)} ${p.pnlPct==null?'':'('+H.pct(p.pnlPct)+')'}</span></div></div>`).join('');
  }
  if(s){
    body+=`<div class="form-sec">Lifetime</div><div class="card" style="box-shadow:none">
      <div class="kv"><span>Units held</span><span>${fmt(s.qty,0)}</span></div>
      <div class="kv"><span>Nett bought</span><span>${H.money(ccy,s.nettBuy)}</span></div>
      <div class="kv"><span>Nett sold</span><span>${H.money(ccy,s.nettSell)}</span></div>
      <div class="kv b"><span>Realised P&amp;L</span><span>${H.money(ccy,s.realised,true)}</span></div>
      <div class="kv"><span>Dividends</span><span class="gold">${fmt(s.divTot)}</span></div></div>`;
    const yrs=Object.keys(s.divByYear).sort((a,b)=>b-a);
    if(yrs.length){const mx=Math.max(...yrs.map(y=>s.divByYear[y]));
      body+=`<div class="form-sec">Dividends by year</div><div class="yr-bars">`+yrs.map(y=>`<div class="yb"><b>${y}</b><div><div class="bar" style="width:${s.divByYear[y]/mx*100}%"></div></div><span>${fmt(s.divByYear[y])}</span></div>`).join('')+`</div>`;}
  }
  const txs=transactions.filter(t=>t.ticker===ticker&&t.market===market).slice(0,8);
  if(txs.length)body+=`<div class="form-sec">Recent trades</div><div class="list">`+txs.map(App.activity.tradeRow).join('')+`</div>
    <button class="btn btn-s" style="width:100%;margin-top:10px" onclick="App.activity.showStock('${ticker}')">All trades for this stock</button>`;
  App.openSheet({title:H.stockLabel(ticker,market,s&&s.company_name),sub:`${ticker} · ${market==='Bursa'?'Bursa Malaysia':'US'} ${H.wtag(ticker,market)}`,body,
    foot:`<button class="btn btn-s" onclick="App.forms.trade(null,{ticker:'${ticker}',market:'${market}',type:'Sell'})">▼ Sell</button><button class="btn btn-p" onclick="App.forms.trade(null,{ticker:'${ticker}',market:'${market}',type:'Buy'})">▲ Buy more</button>`});
};
App.holdings.openWallet=key=>{
  const [cds,ccy]=key.split('-'), pos=C.positions({wallet:[key]}), t=C.totals(pos);
  const body=`<div class="card" style="box-shadow:none">
      <div class="kv b"><span>Market value</span><span>${t.value==null?'—':H.money(ccy,t.value)}</span></div>${ccy==='USD'&&t.value!=null?`<div class="eq">${H.eqMyr('USD',t.value)}</div>`:''}
      <div class="kv"><span>Cost</span><span>${H.money(ccy,t.cost)}</span></div>
      <div class="kv"><span>Unrealised P&amp;L</span><span>${t.pnl==null?'—':H.money(ccy,t.pnl,true)} (${H.pct(t.pnlPct)})</span></div></div>
    <div class="form-sec">Positions</div><div class="list">`+
    pos.sort((a,b)=>(b.value||0)-(a.value||0)).map(p=>`<button class="lrow" onclick="App.holdings.openStock('${p.ticker}','${p.market}')">
      <div class="main-col"><div class="t1">${H.esc(p.label)} ${H.wtag(p.ticker,p.market)}</div><div class="t2">${fmt(p.units,0)} @ ${fmt(p.avg,p.market==='Bursa'?3:2)}</div></div>
      <div class="end"><div class="v">${p.value==null?'—':fmt(p.value)}</div><div class="s">${H.pct(p.pnlPct)}</div></div></button>`).join('')+`</div>`;
  App.openSheet({title:key,sub:`${C.CDS_NAME[cds]} · ${ccy}`,body});
};

App.screens.holdings={
  title:'Holdings',
  segs:[{id:'open',label:'Open positions'},{id:'wallets',label:'Wallets'},{id:'stocks',label:'All stocks'}],
  actions:seg=>seg==='stocks'?[]:[{id:'filter',active:App.filterActive(filters())}],
  openFilter(){App.openFilterSheet({title:'Filter holdings',groups:filterGroups(),state:filters(),
    onApply:w=>{App.state.filters[FK]=w;App.render(true);}});},
  fab:()=>({label:'Trade',onClick:()=>App.forms.trade()}),
  render(el,seg){
    if(!App.state.sharesLoaded){el.innerHTML=App.skeleton(5);return;}
    if(seg==='wallets')renderWallets(el); else if(seg==='stocks')renderStocks(el); else renderOpen(el);
  }
};
})();
