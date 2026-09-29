/* ===== Crypto: coins bought, sold and earned =====
   Table "crypto" (mobile/supabase/crypto.sql): one row per Buy / Sell / Reward.
   Average-cost method per coin. Value = quantity × live price (Yahoo "<COIN>-USD") × USD/MYR. */
(function(){
const H=App.h, $=id=>document.getElementById(id);
const COINS=[['BTC','Bitcoin'],['ETH','Ethereum'],['SOL','Solana'],['XRP','XRP'],['BNB','BNB'],['ADA','Cardano'],['DOGE','Dogecoin'],
  ['USDT','Tether'],['USDC','USD Coin'],['TRX','TRON'],['DOT','Polkadot'],['AVAX','Avalanche'],['LINK','Chainlink'],['LTC','Litecoin'],['SHIB','Shiba Inu'],['POL','Polygon']];
const EXCH=['Luno','Tokenize','Binance','MX Global','Hata','Sinegy','Coinbase','OKX','Bybit','Hardware wallet'];
const coinName=c=>(COINS.find(x=>x[0]===c)||[c,c])[1];
const ysym=c=>String(c||'').toUpperCase()+'-USD';
const TYPES=[['Buy','▲ Buy'],['Sell','▼ Sell'],['Reward','★ Reward']];

const X=App.crypto={rows:[],status:'loading',err:'',spot:{},spotAt:null,spotStatus:'idle',view:'mine'};

/* ---------- data ---------- */
X.load=async()=>{
  X.status='loading';
  const {data,error}=await sb.from('crypto').select('*').order('txn_date',{ascending:false}).order('created_at',{ascending:false});
  if(error){console.error('crypto',error);X.rows=[];X.err=error.message||'';X.status=/does not exist|schema cache|relation/i.test(X.err)?'missing':'error';}
  else{X.rows=data||[];X.status='ok';}
  App.refreshView();
  if(X.status==='ok'&&X.rows.length)X.loadSpot();
};
X.coins=()=>[...new Set(X.rows.map(r=>r.coin))];
X.loadSpot=async()=>{
  const syms=X.coins().map(ysym);if(!syms.length)return;
  X.spotStatus='loading';App.refreshView();
  try{const d=await invokeQuote({symbols:syms});
    syms.forEach(s=>{const q=d&&(d[s]||d[s.toUpperCase()]);X.spot[s]=q&&!q.error&&q.price!=null?{usd:Number(q.price),prev:q.prevClose!=null?Number(q.prevClose):null}:null;});
    X.spotAt=new Date();X.spotStatus='ok';}
  catch(e){console.error('crypto spot',e);X.spotStatus='error';}
  App.refreshView();
};
X.sym=ysym;
X.priceMyr=c=>{const s=X.spot[ysym(c)],r=H.fx();return s&&r?s.usd*r:null;};
X.dayPct=c=>{const s=X.spot[ysym(c)];return s&&s.prev?(s.usd-s.prev)/s.prev*100:null;};

X.positions=()=>{
  const by={};
  [...X.rows].sort((a,b)=>String(a.txn_date).localeCompare(String(b.txn_date))||String(a.created_at).localeCompare(String(b.created_at)))
  .forEach(r=>{
    const p=by[r.coin]||(by[r.coin]={coin:r.coin,name:r.coin_name||coinName(r.coin),qty:0,cost:0,realised:0,rewards:0,n:0});
    const q=Number(r.quantity)||0,amt=Number(r.amount_myr)||0;p.n++;
    if(r.tx_type==='Sell'){const avg=p.qty>0?p.cost/p.qty:0,take=Math.min(q,p.qty),co=avg*take;p.realised+=amt-co;p.cost-=co;p.qty-=take;}
    else{p.qty+=q;p.cost+=amt;if(r.tx_type==='Reward')p.rewards+=q;}
  });
  return Object.values(by).map(p=>{
    if(p.qty<1e-12){p.qty=0;p.cost=0;}
    const px=X.priceMyr(p.coin);
    p.value=px!=null?p.qty*px:null;p.pnl=p.value!=null?p.value-p.cost:null;
    p.pnlPct=p.pnl!=null&&p.cost>0?p.pnl/p.cost*100:null;p.avg=p.qty>0?p.cost/p.qty:null;p.px=px;
    return p;
  }).sort((a,b)=>(b.value??b.cost)-(a.value??a.cost));
};
X.totals=()=>{
  const ps=X.positions(),t={cost:0,value:0,pnl:0,realised:0,atCost:false,n:ps.filter(p=>p.qty>0).length};
  ps.forEach(p=>{t.cost+=p.cost;t.realised+=p.realised;if(p.value!=null){t.value+=p.value;t.pnl+=p.pnl;}else{t.value+=p.cost;if(p.qty>0)t.atCost=true;}});
  t.pnlPct=t.cost>0?t.pnl/t.cost*100:null;return t;
};
X.menuSub=()=>X.status==='missing'?'Tap to set up':X.status!=='ok'?'loading…':!X.rows.length?'Bitcoin, Ethereum & more — none recorded yet':`MYR ${fmt(X.totals().value)} · ${X.totals().n} coin${X.totals().n!==1?'s':''}`;

/* ---------- screen ---------- */
const qf=q=>{const a=Math.abs(q);return fmt(q,a>=100?2:a>=1?4:8).replace(/(\.\d*?[1-9])0+$|\.0+$/,'$1');};
const pf=v=>v==null?'—':`MYR ${fmt(v,Math.abs(v)<1?4:2)}`;
const ico=c=>`<div class="ico usd" style="font-size:${c.length>3?11:13}px">${H.esc(c.slice(0,4))}</div>`;
function posRow(p){
  return `<div class="lrow">${ico(p.coin)}
    <div class="main-col"><div class="t1">${H.esc(p.name)} <span class="dim" style="font-weight:700">${H.esc(p.coin)}</span></div>
      <div class="t2">${qf(p.qty)} ${H.esc(p.coin)}${p.avg!=null?` · avg ${pf(p.avg)}`:''}${p.px!=null?` · now ${pf(p.px)}`:''}</div></div>
    <div class="end"><div class="v">MYR ${fmt(p.value!=null?p.value:p.cost)}</div>
      <div class="s">${p.pnl!=null?`${H.money('MYR',p.pnl,true)} · ${H.pct(p.pnlPct)}`:'<span class="dim">at cost</span>'}</div></div></div>`;
}
X.row=r=>{
  const t=r.tx_type,q=Number(r.quantity),per=q>0&&Number(r.amount_myr)>0?Number(r.amount_myr)/q:null;
  return `<button class="lrow" onclick="App.crypto.open('${r.id}')">
    <div class="ico ${t==='Sell'?'sell':t==='Reward'?'div':'buy'}">${t==='Sell'?'▼':t==='Reward'?'★':'▲'}</div>
    <div class="main-col"><div class="t1">${t} ${qf(q)} ${H.esc(r.coin)}</div>
      <div class="t2">${H.dateShort(r.txn_date)}${r.exchange?' · '+H.esc(r.exchange):''}${per!=null?` · ${pf(per)} each`:''}</div></div>
    <div class="end"><div class="v ${t==='Buy'?'':'up'}">${t==='Buy'?'−':t==='Sell'?'+':''}MYR ${fmt(r.amount_myr)}</div>
      <div class="s dim">${t}</div></div></button>`;
};
function renderMine(el){
  if(X.status==='loading'){el.innerHTML=App.skeleton(4);return;}
  if(X.status==='missing'){el.innerHTML=`<div class="card"><div class="val">One-time setup</div>
    <p class="sub" style="margin-top:8px;font-size:14px">The <b>crypto</b> table isn't in Supabase yet. Supabase → SQL Editor → paste <b>mobile/supabase/crypto.sql</b> → Run. Then tap Retry.</p>
    <button class="btn btn-p" style="width:100%;margin-top:14px" onclick="App.crypto.load()">Retry</button></div>`;return;}
  if(X.status==='error'){el.innerHTML=`<div class="notice warn">Couldn't load crypto: ${H.esc(X.err)}</div><button class="btn btn-s" style="width:100%;margin-top:12px" onclick="App.crypto.load()">Retry</button>`;return;}
  const ps=X.positions(),held=ps.filter(p=>p.qty>0),t=X.totals();
  let html='';
  if(X.rows.length){
    const top=held[0];
    html+=`<div class="card hero"><div class="lbl">Crypto value</div><div class="big">MYR ${fmt(t.value)}</div>
      <div class="sub">${t.atCost?'Part at cost — prices loading':'At live prices'} · cost MYR ${fmt(t.cost)}</div>
      <div class="hero-split">
        <div><span class="lbl">Unrealised P&amp;L</span><b>${t.atCost&&!t.pnl?'—':`${t.pnl>=0?'+':'−'}MYR ${fmt(Math.abs(t.pnl))}`}</b><span class="lbl">${t.pnlPct==null||t.atCost?'':`${t.pnlPct>=0?'+':'−'}${fmt(Math.abs(t.pnlPct))}%`}</span></div>
        ${top&&t.value>0&&top.value!=null?`<div><span class="lbl">Largest</span><b>${H.esc(top.coin)} ${fmt(top.value/t.value*100,0)}%</b><span class="lbl">of crypto</span></div>`:''}
        ${t.realised?`<div><span class="lbl">Realised P&amp;L</span><b>${t.realised>=0?'+':'−'}MYR ${fmt(Math.abs(t.realised))}</b><span class="lbl">from sales</span></div>`:''}
      </div></div>`;
    if(held.length)html+=`<div class="sec"><h2>Prices</h2><span class="note">${X.spotAt?X.spotAt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):''}</span></div>
      <div class="grid g3">${held.slice(0,6).map(p=>`<div class="stat"><div class="lbl">${H.esc(p.coin)} · per coin</div><div class="val">${p.px!=null?pf(p.px):'<span class="dim">loading…</span>'}</div>
        <div class="sub">${X.spot[ysym(p.coin)]?`US$ ${fmt(X.spot[ysym(p.coin)].usd,X.spot[ysym(p.coin)].usd<1?4:2)} `:''}${H.pill(X.dayPct(p.coin))}</div></div>`).join('')}</div>
      ${X.spotStatus==='error'?'<div class="notice warn">Prices unavailable right now — holdings shown at cost.</div>':''}`;
    if(held.length)html+=`<div class="sec"><h2>Holdings</h2><span class="note">by coin</span></div><div class="list">${held.map(posRow).join('')}</div>`;
  }
  html+=`<div class="sec"><h2>Buys, sells &amp; rewards</h2><span class="note">${X.rows.length} record${X.rows.length!==1?'s':''}</span></div>`;
  html+=X.rows.length?`<div class="list">${X.rows.map(X.row).join('')}</div>`:
    `<div class="card muted-card"><div class="empty" style="padding:22px 8px">No crypto recorded yet.<br>Tap <b>+ Add</b> to log your first purchase.</div></div>`;
  html+=`<div class="tiny" style="margin-top:10px">Prices from Yahoo Finance (COIN-USD), converted at the app's USD/MYR rate. Crypto is volatile — values can move sharply within a day.</div>`;
  el.innerHTML=html;
}
X.render=el=>{
  const tabs=`<div class="opts" style="margin-bottom:14px"><button type="button" data-cv="mine" class="${X.view==='mine'?'on':''}">My crypto</button><button type="button" data-cv="market" class="${X.view==='market'?'on':''}">Market &amp; outlook</button></div>`;
  if(X.view==='market'){el.innerHTML=tabs+App.cryptoMarket.render(el);App.cryptoMarket.after(el);}
  else{renderMine(el);el.insertAdjacentHTML('afterbegin',tabs);}
  el.querySelectorAll('[data-cv]').forEach(b=>b.onclick=()=>{X.view=b.dataset.cv;App.render(true);});
};

/* ---------- detail ---------- */
X.open=id=>{
  const r=X.rows.find(x=>x.id===id);if(!r)return;
  const q=Number(r.quantity),px=X.priceMyr(r.coin);
  const kv=(k,v)=>`<div class="kv"><span>${k}</span><span>${v}</span></div>`;
  App.openSheet({title:`${r.tx_type} ${qf(q)} ${r.coin}`,sub:`${coinName(r.coin)} · ${H.date(r.txn_date)}`,
    body:`<div class="card" style="margin:0">${kv('Coin',`${H.esc(r.coin_name||coinName(r.coin))} (${H.esc(r.coin)})`)}${kv('Quantity',qf(q))}
      ${kv(r.tx_type==='Sell'?'Received':r.tx_type==='Reward'?'Value when received':'Paid',`MYR ${fmt(r.amount_myr)}`)}${q>0&&Number(r.amount_myr)>0?kv('Per coin',pf(r.amount_myr/q)):''}
      ${px!=null?kv('Worth today',`MYR ${fmt(q*px)}`):''}${kv('Exchange / wallet',H.esc(r.exchange||'—'))}${r.notes?kv('Notes',H.esc(r.notes)):''}</div>`,
    foot:`<button class="btn btn-d" onclick="App.crypto.del('${r.id}')">Delete</button><button class="btn btn-p" onclick="App.crypto.form('${r.id}')">Edit</button>`});
};
X.del=async id=>{
  const r=X.rows.find(x=>x.id===id);if(!r)return;
  if(!confirm(`Delete this ${r.coin} ${r.tx_type.toLowerCase()} on ${r.txn_date}?`))return;
  const {error}=await sb.from('crypto').delete().eq('id',id);
  if(error){showToast('Delete failed — '+error.message);return;}
  App.closeSheet();showToast('Deleted ✓');X.load();
};

/* ---------- add / edit ---------- */
X.form=id=>{
  const r=id?X.rows.find(x=>x.id===id):null;
  const ex=[...new Set([...X.rows.map(x=>x.exchange).filter(Boolean),...EXCH])];
  const cur=r?r.tx_type:'Buy';
  const body=`
    <div class="opts" data-opt="ctype">${TYPES.map(([v,l])=>`<button type="button" data-v="${v}" class="${v===cur?'on '+(v==='Buy'?'buy':v==='Sell'?'sell':''):''}">${l}</button>`).join('')}</div>
    <div class="frow" style="margin-top:14px">
      <label class="fld"><span>Coin</span><input id="cCoin" list="cList" autocapitalize="characters" autocomplete="off" placeholder="e.g. BTC" value="${H.esc(r?r.coin:'')}"></label>
      <label class="fld"><span>Date</span><input type="date" id="cDate" value="${r?r.txn_date:H.today()}"></label>
    </div><datalist id="cList">${COINS.map(([c,n])=>`<option value="${c}">${n}</option>`).join('')}</datalist>
    <div class="tiny" id="cName" style="margin:-8px 0 12px"></div>
    <label class="fld"><span>Quantity (coins)</span><input type="number" inputmode="decimal" id="cQty" step="any" min="0" placeholder="e.g. 0.015" value="${r?Number(r.quantity):''}"></label>
    <label class="fld"><span id="cAmtLbl">Total paid (MYR)</span><input type="number" inputmode="decimal" id="cAmt" step="any" min="0" placeholder="0.00" value="${r?r.amount_myr:''}">
      <div class="hint" id="cAmtHint">Include the exchange fee.</div></label>
    <div class="netbox"><span>PER COIN</span><b id="cPer">—</b></div>
    <div class="tiny" id="cCmp" style="margin-top:8px"></div>
    <label class="fld" style="margin-top:14px"><span>Exchange / wallet</span><input id="cEx" list="cExl" placeholder="e.g. Luno" value="${H.esc(r?r.exchange||'':'')}"></label>
    <datalist id="cExl">${ex.map(e=>`<option value="${H.esc(e)}">`).join('')}</datalist>
    <label class="fld"><span>Notes (optional)</span><input id="cNotes" placeholder="e.g. order ID, staking" value="${H.esc(r?r.notes||'':'')}"></label>
    <div class="form-err" id="cErr"></div>`;
  App.openSheet({title:r?'Edit crypto record':'Add crypto',sub:r?`${r.coin} · ${H.date(r.txn_date)}`:'',body,full:true,
    foot:`<button class="btn btn-s" onclick="App.closeSheet()">Cancel</button><button class="btn btn-p" id="cSave">${r?'Save changes':'Save'}</button>`});
  const type=()=>{const b=document.querySelector('.opts[data-opt="ctype"] button.on');return b?b.dataset.v:'Buy';};
  const coin=()=>$('cCoin').value.trim().toUpperCase();
  const calc=()=>{
    const t=type(),q=parseFloat($('cQty').value)||0,a=parseFloat($('cAmt').value)||0,c=coin();
    $('cAmtLbl').textContent=t==='Sell'?'Total received (MYR)':t==='Reward'?'Value when received (MYR, optional)':'Total paid (MYR)';
    $('cAmtHint').textContent=t==='Reward'?'Staking, airdrop or referral coins. Leave 0 if you count them as free.':t==='Sell'?'After the exchange fee.':'Include the exchange fee.';
    $('cName').textContent=c?coinName(c)+(COINS.some(x=>x[0]===c)?'':' — make sure '+c+'-USD exists on Yahoo Finance'):'';
    $('cPer').textContent=q>0&&a>0?pf(a/q):'—';
    const px=X.priceMyr(c);
    $('cCmp').textContent=px!=null&&q>0?`Worth MYR ${fmt(q*px)} at today's price (MYR ${fmt(px,px<1?4:2)} per ${c}).`:'';
  };
  document.querySelectorAll('.opts[data-opt="ctype"] button').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('.opts[data-opt="ctype"] button').forEach(x=>x.className='');
    b.className='on '+(b.dataset.v==='Buy'?'buy':b.dataset.v==='Sell'?'sell':'');calc();});
  ['cCoin','cQty','cAmt'].forEach(i=>$(i).addEventListener('input',calc));
  calc();
  $('cSave').onclick=async()=>{
    const err=$('cErr');err.textContent='';
    const t=type(),c=coin(),q=parseFloat($('cQty').value),a=parseFloat($('cAmt').value||'0'),d=$('cDate').value;
    if(!/^[A-Z0-9]{1,12}$/.test(c)){err.textContent='Enter the coin symbol, e.g. BTC.';return;}
    if(!d){err.textContent='Select a date.';return;}
    if(!(q>0)){err.textContent='Enter the quantity.';return;}
    if(isNaN(a)||a<0||(t!=='Reward'&&!(a>0))){err.textContent=t==='Sell'?'Enter the amount received.':'Enter the amount paid.';return;}
    if(t==='Sell'){const p=X.positions().find(x=>x.coin===c),have=(p?p.qty:0)+(r&&r.tx_type==='Sell'&&r.coin===c?Number(r.quantity):0);
      if(q>have+1e-12&&!confirm(`You're selling ${qf(q)} ${c} but only ${qf(have)} is recorded. Save anyway?`))return;}
    const payload={tx_type:t,txn_date:d,coin:c,coin_name:coinName(c)!==c?coinName(c):null,quantity:q,amount_myr:parseFloat(a.toFixed(2)),
      exchange:$('cEx').value.trim()||null,notes:$('cNotes').value.trim()||null,updated_at:new Date().toISOString()};
    const btn=$('cSave');btn.disabled=true;btn.textContent='Saving…';
    const {error}=r?await sb.from('crypto').update(payload).eq('id',r.id):await sb.from('crypto').insert(payload);
    btn.disabled=false;btn.textContent=r?'Save changes':'Save';
    if(error){err.textContent=error.message;return;}
    App.closeSheet();showToast(`${c} ${t.toLowerCase()} saved ✓`);X.load();
  };
};

/* ---------- market view ---------- */
App.cryptoMarket=App.makeMarket({name:'cryptoMarket',first:'BTC',
  assets:()=>{const o={BTC:'BTC-USD',ETH:'ETH-USD'};X.coins().forEach(c=>{if(!['USDT','USDC'].includes(c))o[c]=ysym(c);});return o;},
  perUnit:1,usdLbl:'US$',myrLbl:'MYR',unitNote:'',outlookFile:'data/crypto-outlook.json'});
})();
