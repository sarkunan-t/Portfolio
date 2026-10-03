/* ===== Activity: trades · dividends · funds ===== */
(function(){
const H=App.h, C=App.calc;
App.activity={};
const LIMIT_STEP=60;
const limits={trades:LIMIT_STEP,dividends:LIMIT_STEP,funds:LIMIT_STEP};
const sortState={trades:{col:'tx_date',dir:'desc'}};

/* ---------------- TRADES ---------------- */
const TK='trades';
function tradeGroups(){
  const st=App.state.filters[TK]||{};
  const pass=(t,skip)=>['market','cds','type','year','stock'].every(g=>g===skip||App.fPass(TK,g,tf(t,g)));
  const opts=g=>{const rows=transactions.filter(t=>pass(t,g));
    if(g==='stock')return [...new Map(rows.map(t=>[t.ticker,{value:t.ticker,label:`${t.ticker} · ${t.company_name||t.ticker}`}])).values()].sort((a,b)=>a.value.localeCompare(b.value));
    const v=[...new Set(rows.map(t=>tf(t,g)))];return (g==='year'?v.sort((a,b)=>b-a):v.sort()).map(x=>({value:x}));};
  return [{id:'market',label:'Market',options:opts('market')},{id:'cds',label:'CDS account',options:opts('cds')},
    {id:'type',label:'Type',options:opts('type')},{id:'year',label:'Year',options:opts('year')},{id:'stock',label:'Stock',options:opts('stock')}];
}
function tf(t,g){return {market:t.market,cds:normCds(t.cds_account),type:t.tx_type,year:String(new Date(t.tx_date).getFullYear()),stock:t.ticker}[g];}
App.activity.tradePass=t=>['market','cds','type','year','stock'].every(g=>App.fPass(TK,g,tf(t,g)));

App.activity.tradeRow=t=>{
  const buy=t.tx_type==='Buy', st=txSettle(t), ccy=t.currency||(t.market==='Bursa'?'MYR':'USD');
  return `<button class="lrow" onclick="App.activity.openTrade('${t.id}')">
    <div class="ico ${buy?'buy':'sell'}">${buy?'▲':'▼'}</div>
    <div class="main-col"><div class="t1">${H.esc(t.company_name||t.ticker)}${t.is_contra?'<span class="tag gold">contra</span>':''}</div>
      <div class="t2">${H.dateShort(t.tx_date)} · ${normCds(t.cds_account)} · ${fmt(t.quantity,0)} @ ${fmt(t.price,t.market==='Bursa'?3:2)}</div></div>
    <div class="end"><div class="v ${buy?'':'up'}">${buy?'−':'+'}${ccy} ${fmt(t.net_amount)}</div>
      ${st.cross?`<div class="s dim">settled ${st.ccy} ${fmt(st.amt)}</div>`:`<div class="s dim">${buy?'Buy':'Sell'}</div>`}</div></button>`;
};
function renderTrades(el){
  const list=transactions.filter(App.activity.tradePass);
  const s=sortState.trades, dir=s.dir==='asc'?1:-1;
  list.sort((a,b)=>{let av=a[s.col],bv=b[s.col];
    if(s.col==='tx_date'){av=a.tx_date;bv=b.tx_date;}
    else if(typeof av==='string'){av=av.toLowerCase();bv=(bv||'').toLowerCase();}
    return av<bv?-dir:av>bv?dir:0;});
  // totals per currency
  const T={};
  list.forEach(t=>{const c=t.currency||(t.market==='Bursa'?'MYR':'USD'),n=v=>Number(v)||0;
    const a=T[c]=T[c]||{n:0,gross:0,broker:0,stax:0,stamp:0,clearing:0,net:0,buyN:0,buy:0,sellN:0,sell:0};
    a.n++;a.gross+=n(t.gross_amount);a.broker+=n(t.broker_fee);a.stax+=n(t.stax);a.stamp+=n(t.stamp_duty);a.clearing+=n(t.clearing_fee);a.net+=n(t.net_amount);
    if(t.tx_type==='Buy'){a.buyN++;a.buy+=n(t.net_amount);}else{a.sellN++;a.sell+=n(t.net_amount);}});
  const wide=App.wide();
  let html=App.filterChips(TK);
  if(wide)html+='<div class="grid g2">';
  html+=Object.keys(T).sort().map(c=>{const a=T[c],flow=a.sell-a.buy;return `<div class="card" style="margin-bottom:${wide?0:10}px">
    <div class="pos-top"><div class="lbl">${c} · ${a.n} trade${a.n!==1?'s':''}</div>${H.ccyTag(c)}</div>
    <div class="grid g3" style="gap:10px;margin-top:8px">
      <div><div class="tiny">Bought (${a.buyN})</div><div style="font-weight:800">${c} ${fmt(a.buy)}</div></div>
      <div><div class="tiny">Sold (${a.sellN})</div><div style="font-weight:800">${c} ${fmt(a.sell)}</div></div>
      <div><div class="tiny">Cash flow (sell − buy)</div><div style="font-weight:800">${H.money(c,flow,true)}</div></div></div>
    <details class="more-dt"><summary>Fees &amp; gross</summary>
      <div class="kv" style="margin-top:6px"><span>Gross</span><span>${c} ${fmt(a.gross)}</span></div>
      <div class="kv"><span>Broker</span><span>${fmt(a.broker)}</span></div><div class="kv"><span>SST</span><span>${fmt(a.stax)}</span></div>
      <div class="kv"><span>Stamp duty</span><span>${fmt(a.stamp)}</span></div><div class="kv"><span>Clearing</span><span>${fmt(a.clearing)}</span></div>
      <div class="kv b"><span>Net total</span><span>${c} ${fmt(a.net)}</span></div></details></div>`;}).join('');
  if(wide)html+='</div>';
  if(!list.length){el.innerHTML=html+'<div class="empty">No trades found.</div>';return;}
  if(wide){
    const n=v=>Number(v)||0, dp=t=>t.market==='Bursa'?3:2;
    const cols=[{k:'tx_date',label:'Date',sort:1},{k:'ticker',label:'Stock',sort:1},{k:'tx_type',label:'Type',sort:1},{k:'cds_account',label:'Wallet',sort:1},
      {k:'quantity',label:'Units',cls:'n',sort:1},{k:'price',label:'Price',cls:'n',sort:1},{k:'gross_amount',label:'Gross',cls:'n',sort:1},
      {k:'fees',label:'Fees',cls:'n'},{k:'net_amount',label:'Net amount',cls:'n',sort:1},{k:'notes',label:'Notes'}];
    const rows=list.slice(0,limits.trades).map(t=>{const buy=t.tx_type==='Buy',ccy=t.currency||(t.market==='Bursa'?'MYR':'USD'),st=txSettle(t);
      const fees=n(t.broker_fee)+n(t.stax)+n(t.stamp_duty)+n(t.clearing_fee);
      return {on:`App.activity.openTrade('${t.id}')`,cells:{tx_date:H.date(t.tx_date),
        ticker:`<div class="t-main">${H.esc(t.company_name||t.ticker)}${t.is_contra?' <span class="tag gold">contra</span>':''}</div><div class="t-sub">${H.esc(t.ticker)} · ${t.market}</div>`,
        tx_type:`<span class="tag ${buy?'buy':'sell'}">${buy?'BUY':'SELL'}</span>`,cds_account:`<span class="tag ${ccy==='USD'?'usd':'myr'}">${normCds(t.cds_account)}-${ccy}</span>`,
        quantity:fmt(t.quantity,t.quantity%1?4:0),price:fmt(t.price,dp(t)),gross_amount:fmt(t.gross_amount),fees:fmt(fees),
        net_amount:`<b class="${buy?'':'up'}">${buy?'−':'+'}${ccy} ${fmt(t.net_amount)}</b>${st.cross?`<div class="t-sub">settled ${st.ccy} ${fmt(st.amt)}</div>`:''}`,
        notes:t.notes?`<span class="t-sub" title="${H.esc(t.notes)}" style="display:inline-block;max-width:220px;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom">${H.esc(t.notes)}</span>`:''}};});
    html+=`<div class="dt-note"><h2>${list.length} trade${list.length!==1?'s':''}</h2><span class="note">Click a column heading to sort · a row to view, edit or delete</span></div>`+
      H.table(cols,rows,{sort:s,onSort:'App.activity.sortBy'});
    if(list.length>limits.trades)html+=`<button class="btn btn-s" style="margin-top:12px" onclick="App.activity.more('trades')">Show ${Math.min(LIMIT_STEP,list.length-limits.trades)} more (${list.length-limits.trades} left)</button>`;
    el.innerHTML=html;return;
  }
  html+=`<div class="sec" style="margin-top:14px"><h2>${list.length} trade${list.length!==1?'s':''}</h2>
    <button class="link" onclick="App.activity.sortSheet()">Sort: ${{tx_date:'Date',ticker:'Stock',net_amount:'Amount',quantity:'Units',cds_account:'CDS'}[s.col]||s.col} ${s.dir==='asc'?'↑':'↓'}</button></div>`;
  html+=groupedList(list.slice(0,limits.trades),t=>t.tx_date,App.activity.tradeRow,s.col==='tx_date');
  if(list.length>limits.trades)html+=`<button class="btn btn-s" style="width:100%;margin-top:12px" onclick="App.activity.more('trades')">Show more (${list.length-limits.trades} left)</button>`;
  el.innerHTML=html;
}
function groupedList(list,dateOf,rowFn,byMonth){
  if(!byMonth)return `<div class="list">${list.map(rowFn).join('')}</div>`;
  let html='<div class="list">',cur='';
  list.forEach(x=>{const m=String(dateOf(x)).slice(0,7);if(m!==cur){cur=m;html+=`<div class="lhead"><span>${H.month(m+'-01')}</span></div>`;}html+=rowFn(x);});
  return html+'</div>';
}
App.activity.more=k=>{limits[k]+=LIMIT_STEP;App.render(false);};
App.activity.sortBy=k=>{const s=sortState.trades;s.dir=s.col===k&&s.dir==='desc'?'asc':'desc';s.col=k;App.render(false);};
App.activity.sortSheet=()=>{
  const s=sortState.trades;
  const cols=[['tx_date','Date'],['ticker','Stock'],['net_amount','Net amount'],['quantity','Units'],['cds_account','CDS account']];
  App.openSheet({title:'Sort trades',body:`<div class="form-sec">Sort by</div><div class="chips">${cols.map(([c,l])=>`<button class="chip ${s.col===c?'on':''}" data-sc="${c}">${l}</button>`).join('')}</div>
    <div class="form-sec">Order</div><div class="opts"><button data-sd="desc" class="${s.dir==='desc'?'on':''}">↓ Descending</button><button data-sd="asc" class="${s.dir==='asc'?'on':''}">↑ Ascending</button></div>`,
    foot:`<button class="btn btn-p" id="sortApply">Apply</button>`});
  let col=s.col,dir=s.dir;
  H.$('#shBody').onclick=e=>{const c=e.target.closest('[data-sc]'),d=e.target.closest('[data-sd]');
    if(c){col=c.dataset.sc;H.$('#shBody').querySelectorAll('[data-sc]').forEach(b=>b.classList.toggle('on',b===c));}
    if(d){dir=d.dataset.sd;H.$('#shBody').querySelectorAll('[data-sd]').forEach(b=>b.classList.toggle('on',b===d));}};
  H.$('#sortApply').onclick=()=>{sortState.trades={col,dir};App.closeSheet();App.render(false);};
};
App.activity.showStock=ticker=>{App.state.filters[TK]={stock:[ticker]};App.closeSheet(true);App.go('activity','trades');};

App.activity.openTrade=id=>{
  const t=transactions.find(x=>x.id===id);if(!t)return;
  const ccy=t.currency||(t.market==='Bursa'?'MYR':'USD'), st=txSettle(t), buy=t.tx_type==='Buy';
  const body=`<div class="dhead"><div><div class="dprice ${buy?'':'up'}">${buy?'−':'+'}${ccy} ${fmt(t.net_amount)}</div>
      <div class="sub">${buy?'Bought':'Sold'} ${fmt(t.quantity,0)} units @ ${ccy} ${fmt(t.price,t.market==='Bursa'?3:2)}</div></div>
      <span class="tag ${buy?'buy':'sell'}">${buy?'BUY':'SELL'}</span></div>
    <div class="card" style="box-shadow:none">
      <div class="kv"><span>Date</span><span>${H.date(t.tx_date)}</span></div>
      <div class="kv"><span>Stock</span><span>${H.esc(t.ticker)} · ${H.esc(t.company_name||'')}</span></div>
      <div class="kv"><span>Market</span><span>${t.market}</span></div>
      <div class="kv"><span>CDS account</span><span>${normCds(t.cds_account)}</span></div>
      <div class="kv"><span>Contra</span><span>${t.is_contra?'Yes':'No'}</span></div></div>
    <div class="form-sec">Amounts</div><div class="card" style="box-shadow:none">
      <div class="kv"><span>Gross</span><span>${ccy} ${fmt(t.gross_amount)}</span></div>
      <div class="kv"><span>Broker fee</span><span>${fmt(t.broker_fee)}</span></div>
      <div class="kv"><span>SST</span><span>${fmt(t.stax)}</span></div>
      <div class="kv"><span>Stamp duty</span><span>${fmt(t.stamp_duty)}</span></div>
      <div class="kv"><span>Clearing fee</span><span>${fmt(t.clearing_fee)}</span></div>
      <div class="kv b"><span>Net amount</span><span>${ccy} ${fmt(t.net_amount)}</span></div>
      ${st.cross?`<div class="kv"><span>Settled</span><span>${st.ccy} ${fmt(st.amt)}${t.fx_rate?' @ '+fmt(t.fx_rate,4):''}</span></div>`:''}</div>
    ${t.notes?`<div class="form-sec">Notes</div><div class="card" style="box-shadow:none">${H.esc(t.notes)}</div>`:''}`;
  App.openSheet({title:t.company_name||t.ticker,sub:`${t.ticker} · ${H.date(t.tx_date)}`,body,
    foot:`<button class="btn btn-d" onclick="App.activity.delTrade('${t.id}')">Delete</button><button class="btn btn-p" onclick="App.forms.trade('${t.id}')">Edit</button>`});
};
App.activity.delTrade=async id=>{
  const t=transactions.find(x=>x.id===id);
  if(!confirm(`Delete ${t.tx_type} of ${t.ticker} on ${t.tx_date}?`))return;
  const {error}=await sb.from('transactions').delete().eq('id',id);
  if(error){showToast('Delete failed');return;}
  App.closeSheet();showToast('Deleted ✓');App.reloadShares();
};

/* ---------------- DIVIDENDS ---------------- */
const DK='dividends';
const dvField=(l,g)=>({year:l.year,wallet:l.wallet,dest:l.dest,ccy:l.ccy,stock:l.ticker}[g]);
const dvPass=(l,skip)=>['year','wallet','dest','ccy','stock'].every(g=>g===skip||App.fPass(DK,g,dvField(l,g)));
App.activity.divFiltered=()=>C.divLines().filter(l=>dvPass(l)).sort((a,b)=>b.date.localeCompare(a.date)||a.ticker.localeCompare(b.ticker));
function divGroups(){
  const lines=C.divLines();
  const opts=g=>{const rows=lines.filter(l=>dvPass(l,g));
    if(g==='stock')return [...new Map(rows.map(l=>[l.ticker,{value:l.ticker,label:`${l.ticker} · ${l.name}`}])).values()].sort((a,b)=>a.value.localeCompare(b.value));
    const v=[...new Set(rows.map(l=>dvField(l,g)))];return (g==='year'?v.sort((a,b)=>b-a):v.sort()).map(x=>({value:x}));};
  return [{id:'year',label:'Year',options:opts('year')},{id:'wallet',label:'Wallet',options:opts('wallet')},
    {id:'dest',label:'Paid to',options:opts('dest')},{id:'ccy',label:'Currency',options:opts('ccy')},{id:'stock',label:'Stock',options:opts('stock')}];
}
const divRow=l=>`<button class="lrow" onclick="App.activity.openDiv('${l.id}')">
  <div class="ico div">%</div>
  <div class="main-col"><div class="t1">${H.esc(l.name)}${l.auto&&l.cds?`<span class="tag">auto${Number(l.div.amount)!==l.amount?' split':''}</span>`:''}</div>
    <div class="t2">${H.dateShort(l.date)} · ${l.wallet} → ${l.dest==='CDS wallet'?'wallet':l.dest}</div></div>
  <div class="end"><div class="v gold">${l.ccy} ${fmt(l.amount)}</div>${l.ccy==='USD'&&H.fx()?`<div class="s dim">${H.eqMyr('USD',l.amount)}</div>`:''}</div></button>`;
function renderDivs(el){
  const list=App.activity.divFiltered(), s=C.divStats(list);
  let html=App.filterChips(DK);
  html+=`<div class="grid g3">
    <div class="stat"><div class="lbl">Total${App.filterActive(App.state.filters[DK])?' (filtered)':''}</div><div class="val gold">MYR ${fmt(s.total)}</div><div class="sub">wallets ${H.k(s.toWal)} · savings ${H.k(s.toSav)}</div></div>
    <div class="stat"><div class="lbl">This year</div><div class="val">MYR ${fmt(s.byYear[s.now]||0)}</div><div class="sub">${s.now}</div></div>
    <div class="stat"><div class="lbl">Last year</div><div class="val">MYR ${fmt(s.byYear[s.now-1]||0)}</div><div class="sub">${s.now-1}</div></div></div>`;
  if(!list.length){el.innerHTML=html+'<div class="empty">No dividends found.</div>';return;}
  const T={};list.forEach(l=>{const t=T[l.ccy]=T[l.ccy]||{n:0,all:0};t.n++;t.all+=l.amount;});
  html+=`<div class="${App.wide()?'dt-note':'sec'}"><h2>${list.length} payout${list.length!==1?'s':''}</h2><span class="note">${Object.keys(T).sort().map(c=>`${c} ${fmt(T[c].all)}`).join(' · ')}</span></div>`;
  if(App.wide())html+=H.table([{k:'d',label:'Date'},{k:'s',label:'Stock'},{k:'w',label:'Wallet'},{k:'p',label:'Paid to'},{k:'a',label:'Amount',cls:'n'},{k:'m',label:'≈ MYR',cls:'n'}],
    list.slice(0,limits.dividends).map(l=>({on:`App.activity.openDiv('${l.id}')`,cells:{d:H.date(l.date),
      s:`<div class="t-main">${H.esc(l.name)}${l.auto&&l.cds?` <span class="tag">auto${Number(l.div.amount)!==l.amount?' split':''}</span>`:''}</div><div class="t-sub">${H.esc(l.ticker)}</div>`,
      w:`<span class="tag ${l.ccy==='USD'?'usd':'myr'}">${l.wallet}</span>`,p:l.dest==='CDS wallet'?'CDS wallet':H.esc(l.dest),
      a:`<b class="gold">${l.ccy} ${fmt(l.amount)}</b>`,m:l.ccy==='USD'?(H.fx()?fmt(l.amount*H.fx()):'—'):fmt(l.amount)}})));
  else html+=groupedList(list.slice(0,limits.dividends),l=>l.date,divRow,true);
  if(list.length>limits.dividends)html+=`<button class="btn btn-s" style="width:100%;margin-top:12px" onclick="App.activity.more('dividends')">Show more</button>`;
  if(s.pending)html+=`<div class="tiny" style="margin-top:10px">${s.pending} USD payout(s) waiting for the exchange rate.</div>`;
  el.innerHTML=html;
}
App.activity.openDiv=id=>{
  const d=dividends.find(x=>x.id===id);if(!d)return;
  const lines=C.divLines().filter(l=>l.id===id), ccy=d.currency==='USD'?'USD':'MYR';
  const body=`<div class="dhead"><div><div class="dprice gold">${ccy} ${fmt(d.amount)}</div><div class="sub">${H.date(d.payout_date)}</div></div><span class="tag gold">DIVIDEND</span></div>
    <div class="card" style="box-shadow:none">
      <div class="kv"><span>Stock</span><span>${H.esc(d.ticker)} · ${H.esc(d.stock_name||'')}</span></div>
      <div class="kv"><span>Wallet on record</span><span>${d.cds_account?normCds(d.cds_account)+'-'+ccy:'Auto (from holdings)'}</span></div>
      ${d.banked_to?`<div class="kv"><span>Note</span><span>${H.esc(d.banked_to)}</span></div>`:''}</div>
    <div class="form-sec">Paid to</div><div class="list">${lines.map(l=>`<div class="lrow"><div class="main-col"><div class="t1">${l.wallet}</div>
      <div class="t2">${l.dest==='CDS wallet'?'into '+l.wallet+' wallet':l.dest}${l.auto?' · worked out from units held':''}</div></div>
      <div class="end"><div class="v">${l.ccy} ${fmt(l.amount)}</div></div></div>`).join('')}</div>`;
  App.openSheet({title:d.stock_name||d.ticker,sub:'Dividend payout',body,
    foot:`<button class="btn btn-d" onclick="App.activity.delDiv('${id}')">Delete</button><button class="btn btn-p" onclick="App.forms.dividend('${id}')">Edit</button>`});
};
App.activity.delDiv=async id=>{
  if(!confirm('Delete this dividend entry?'))return;
  const {error}=await sb.from('dividends').delete().eq('id',id);
  if(error){showToast('Delete failed');return;}
  App.closeSheet();showToast('Deleted ✓');App.reloadShares();
};

/* ---------------- FUNDS ---------------- */
const FK='funds';
const wk=(cds,ccy)=>(cds||'—')+'-'+(ccy||'MYR');
const fdField=(f,g)=>({ccy:f.currency||'MYR',year:String(new Date(f.txn_date).getFullYear()),wallet:wk(f.cds_account,f.currency),type:f.txn_type}[g]);
const fdPass=f=>['ccy','year','wallet','type'].every(g=>App.fPass(FK,g,fdField(f,g)));
function fundGroups(){
  const funds=App.state.funds;
  return [{id:'ccy',label:'Currency',options:['MYR','USD'].map(v=>({value:v}))},
    {id:'year',label:'Year',options:[...new Set(funds.map(f=>fdField(f,'year')))].sort((a,b)=>b-a).map(v=>({value:v}))},
    {id:'wallet',label:'Wallet',options:C.WALLETS.map(w=>({value:w.key}))},
    {id:'type',label:'Type',options:['Deposit','Withdraw','Transfer In','Transfer Out'].map(v=>({value:v}))}];
}
function fundDetail(f){
  const ccy=f.currency||'MYR', fx=(ccy==='USD'&&f.fx_rate)?` · MYR ${fmt(f.amount*f.fx_rate)} @ ${fmt(f.fx_rate,4)}`:'';
  if(f.txn_type==='Deposit')return 'from '+(f.bank_account||'bank')+fx;
  if(f.txn_type==='Withdraw')return 'to '+(f.bank_account||'bank')+fx;
  const pair=f.transfer_group?App.state.funds.find(x=>x.transfer_group===f.transfer_group&&x.id!==f.id):null;
  const other=pair?wk(pair.cds_account,pair.currency):'—';
  const rate=(pair&&(pair.currency||'MYR')!==ccy&&f.fx_rate)?` @ ${fmt(f.fx_rate,4)}`:'';
  return (f.txn_type==='Transfer In'?'from ':'to ')+other+rate;
}
const fundRow=f=>{
  const ccy=f.currency||'MYR', plus=(f.txn_type==='Deposit'||f.txn_type==='Transfer In'), xf=!!f.transfer_group||f.txn_type.startsWith('Transfer');
  return `<button class="lrow" onclick="App.activity.openFund('${f.id}')">
    <div class="ico ${xf?'xf':plus?'buy':'sell'}">${xf?'⇄':plus?'↓':'↑'}</div>
    <div class="main-col"><div class="t1">${f.txn_type} · ${wk(f.cds_account,ccy)}</div><div class="t2">${H.dateShort(f.txn_date)} · ${H.esc(fundDetail(f))}</div></div>
    <div class="end"><div class="v ${plus?'up':'down'}">${plus?'+':'−'}${ccy} ${fmt(f.amount)}</div>${f.notes?`<div class="s dim" style="max-width:140px;overflow:hidden;text-overflow:ellipsis">${H.esc(f.notes)}</div>`:''}</div></button>`;
};
function renderFunds(el){
  if(App.state.fundsStatus==='loading'){el.innerHTML=App.skeleton(5);return;}
  if(App.state.fundsStatus==='error'){el.innerHTML='<div class="notice warn">Could not load fund movements. Pull to refresh or sign in again.</div>';return;}
  const list=App.state.funds.filter(fdPass);
  const t={};list.forEach(f=>{const c=f.currency||'MYR',a=Number(f.amount)||0;t[c]=t[c]||{inn:0,out:0,n:0};
    if(f.txn_type==='Deposit'||f.txn_type==='Transfer In')t[c].inn+=a;else t[c].out+=a;t[c].n++;});
  let html=App.filterChips(FK)+`<div class="grid g2">`+['MYR','USD'].filter(c=>t[c]).map(c=>{const net=t[c].inn-t[c].out;
    return `<div class="stat"><div class="lbl">${c} net in · ${t[c].n} rows</div><div class="val">${H.money(c,net,true)}</div>
      <div class="sub">in ${H.k(t[c].inn)} · out ${H.k(t[c].out)}${c==='USD'&&H.fx()?' · '+H.eqMyr('USD',net):''}</div></div>`;}).join('')+`</div>`;
  if(!list.length){el.innerHTML=html+'<div class="empty">No movements found.</div>';return;}
  html+=`<div class="${App.wide()?'dt-note':'sec'}"><h2>${list.length} movement${list.length!==1?'s':''}</h2><a class="link" href="#insights/capital">Balances →</a></div>`;
  if(App.wide())html+=H.table([{k:'d',label:'Date'},{k:'t',label:'Type'},{k:'w',label:'Wallet'},{k:'x',label:'Detail'},{k:'a',label:'Amount',cls:'n'},{k:'n',label:'Notes'}],
    list.slice(0,limits.funds).map(f=>{const ccy=f.currency||'MYR',plus=(f.txn_type==='Deposit'||f.txn_type==='Transfer In'),xf=!!f.transfer_group||f.txn_type.startsWith('Transfer');
      return {on:`App.activity.openFund('${f.id}')`,cells:{d:H.date(f.txn_date),t:`<span class="tag ${xf?'usd':plus?'buy':'sell'}">${H.esc(f.txn_type)}</span>`,
        w:`<span class="tag ${ccy==='USD'?'usd':'myr'}">${wk(f.cds_account,ccy)}</span>`,x:H.esc(fundDetail(f)),
        a:`<b class="${plus?'up':'down'}">${plus?'+':'−'}${ccy} ${fmt(f.amount)}</b>`,n:f.notes?`<span class="t-sub" title="${H.esc(f.notes)}" style="display:inline-block;max-width:260px;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom">${H.esc(f.notes)}</span>`:''}};}));
  else html+=groupedList(list.slice(0,limits.funds),f=>f.txn_date,fundRow,true);
  if(list.length>limits.funds)html+=`<button class="btn btn-s" style="width:100%;margin-top:12px" onclick="App.activity.more('funds')">Show more</button>`;
  el.innerHTML=html;
}
App.activity.openFund=id=>{
  const f=App.state.funds.find(x=>x.id===id);if(!f)return;
  const ccy=f.currency||'MYR', plus=(f.txn_type==='Deposit'||f.txn_type==='Transfer In');
  const pair=f.transfer_group?App.state.funds.find(x=>x.transfer_group===f.transfer_group&&x.id!==f.id):null;
  const body=`<div class="dhead"><div><div class="dprice ${plus?'up':'down'}">${plus?'+':'−'}${ccy} ${fmt(f.amount)}</div><div class="sub">${H.date(f.txn_date)}</div></div><span class="tag">${f.txn_type.toUpperCase()}</span></div>
    <div class="card" style="box-shadow:none">
      <div class="kv"><span>Wallet</span><span>${wk(f.cds_account,ccy)}</span></div>
      ${f.bank_account?`<div class="kv"><span>Bank</span><span>${H.esc(f.bank_account)}</span></div>`:''}
      ${pair?`<div class="kv"><span>${f.txn_type==='Transfer In'?'From':'To'}</span><span>${wk(pair.cds_account,pair.currency)} · ${pair.currency||'MYR'} ${fmt(pair.amount)}</span></div>`:''}
      ${f.fx_rate&&(ccy==='USD'||pair&&(pair.currency||'MYR')!==ccy)?`<div class="kv"><span>Rate (MYR per USD)</span><span>${fmt(f.fx_rate,4)}</span></div>`:''}
      ${f.notes?`<div class="kv"><span>Notes</span><span>${H.esc(f.notes)}</span></div>`:''}</div>
    ${pair?'<div class="tiny" style="margin-top:10px">This is one side of a transfer — editing or deleting changes both sides.</div>':''}`;
  App.openSheet({title:f.txn_type,sub:wk(f.cds_account,ccy),body,
    foot:`<button class="btn btn-d" onclick="App.activity.delFund('${id}')">Delete</button><button class="btn btn-p" onclick="${f.transfer_group?`App.forms.funds(null,'${f.transfer_group}')`:`App.forms.funds('${f.id}')`}">Edit</button>`});
};
App.activity.delFund=async id=>{
  const f=App.state.funds.find(x=>x.id===id);if(!f)return;
  let error;
  if(f.transfer_group){
    if(!confirm('Delete this transfer? Both sides (out and in) will be removed.'))return;
    ({error}=await sb.from('funds').delete().eq('transfer_group',f.transfer_group));
  }else{
    if(!confirm(`Delete ${f.txn_type} of ${f.currency||'MYR'} ${fmt(f.amount)} on ${f.txn_date}?`))return;
    ({error}=await sb.from('funds').delete().eq('id',id));
  }
  if(error){showToast('Delete failed');return;}
  App.closeSheet();showToast('Deleted ✓');App.loadFunds();
};

/* ---------------- screen ---------------- */
const KEY={trades:TK,dividends:DK,funds:FK};
App.screens.activity={
  title:'Activity',
  segs:[{id:'trades',label:'Trades'},{id:'dividends',label:'Dividends'},{id:'funds',label:'Funds'}],
  actions:seg=>[{id:'filter',active:App.filterActive(App.state.filters[KEY[seg]])}],
  openFilter(seg){
    const groups=seg==='trades'?tradeGroups():seg==='dividends'?divGroups():fundGroups();
    App.openFilterSheet({title:'Filter '+seg,groups,state:App.state.filters[KEY[seg]]||{},
      onApply:w=>{App.state.filters[KEY[seg]]=w;limits[seg]=LIMIT_STEP;App.render(true);}});
  },
  fab:seg=>({label:seg==='trades'?'Trade':seg==='dividends'?'Dividend':'Movement',
    onClick:()=>seg==='trades'?App.forms.trade():seg==='dividends'?App.forms.dividend():App.forms.funds()}),
  render(el,seg){
    if(!App.state.sharesLoaded&&seg!=='funds'){el.innerHTML=App.skeleton(6);return;}
    if(seg==='dividends')renderDivs(el); else if(seg==='funds')renderFunds(el); else renderTrades(el);
  }
};
})();
