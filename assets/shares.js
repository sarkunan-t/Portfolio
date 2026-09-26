/* ===== Markets Suite — shares module =====
   Loaded by all Share Holdings pages (and the dashboard).
   Handles data loading, holdings math, KPI tiles, live prices.
   Pages can define these optional hooks:
     window.onSharesData()    — called after transactions+dividends load
     window.onPricesUpdated() — called after live prices arrive
   PRICES: now fetched via the Supabase Edge Function "quote" (no CORS proxies). */

const BURSA_STOCKS=[
  {code:'1155',name:'MAYBANK'},{code:'7113',name:'TOPGLV'},{code:'0163',name:'CAREPLS'},
  {code:'3182',name:'GENTING'},{code:'1023',name:'CIMB'},{code:'5099',name:'AIRASIA'},
  {code:'7081',name:'PHARMA'},{code:'9059',name:'TSH'},{code:'7803',name:'RUBBEREX'},
  {code:'8583',name:'MAHSENG'},{code:'5238',name:'AAX'},{code:'5235SS',name:'KLCC'},
  {code:'4715',name:'GENM'},{code:'2089',name:'UTDPLT'},{code:'5227',name:'IGBREIT'},
  {code:'5347',name:'TENAGA'},{code:'0072',name:'AT'},{code:'4456',name:'DNEX'},
  {code:'6633',name:'LHI'},{code:'5199',name:'HIBISCS'},{code:'1295',name:'PBBANK'},
  {code:'1818',name:'BURSA'},{code:'6888',name:'AXIATA'},{code:'5218',name:'SAPNRG'},
  {code:'3662',name:'MFLOUR'},{code:'4677',name:'YTL'},{code:'7277',name:'DIALOG'}
];
const US_STOCKS=[
  {code:'GOOGL',name:'Alphabet Inc. Class A'},{code:'GOOG',name:'Alphabet Inc. Class C'},
  {code:'VTRS',name:'Viatris Inc.'},{code:'NVDA',name:'NVIDIA Corporation'},
  {code:'AMZN',name:'Amazon.com Inc.'}
];
const TICKER_NAME={};
[...BURSA_STOCKS,...US_STOCKS].forEach(s=>TICKER_NAME[s.code]=s.name);
let DIV_YEARS=[];
function computeDivYears(){
  const now=new Date().getFullYear();
  const ys=dividends.map(d=>new Date(d.payout_date).getFullYear()).filter(y=>!isNaN(y));
  if(!ys.length)return [now];
  const min=Math.min(...ys), max=Math.max(Math.max(...ys),now);
  const out=[];for(let y=min;y<=max;y++)out.push(y);
  return out;
}

let transactions=[], dividends=[], priceCache={};

/* one code per CDS account — older rows may say "Rakuten" / "Maybank" */
const CDS_ALIAS={Rakuten:'RKT',RAKUTEN:'RKT',rakuten:'RKT',Maybank:'MYB',MAYBANK:'MYB',maybank:'MYB'};
function normCds(c){return CDS_ALIAS[c]||c;}

/* ---- data load ---- */
async function loadShares(){
  const [txRes,divRes]=await Promise.all([
    sb.from('transactions').select('*').order('tx_date',{ascending:false}),
    sb.from('dividends').select('*').order('payout_date',{ascending:false})
  ]);
  transactions=txRes.data||[];
  dividends=divRes.data||[];
  DIV_YEARS=computeDivYears();
  if(window.onSharesData)window.onSharesData();
  updateKPIs();
  fetchAllPrices();
}

/* ---- holdings math ---- */
function calcHoldings(txList){
  const map={};
  const src=txList||transactions;
  const sorted=[...src].sort((a,b)=>{
    const d=new Date(a.tx_date)-new Date(b.tx_date);
    if(d!==0)return d;
    return (a.tx_type==='Buy'?0:1)-(b.tx_type==='Buy'?0:1);   // same-day: Buys first
  });
  sorted.forEach(t=>{
    const key=t.ticker+'|'+t.market;
    if(!map[key]) map[key]={ticker:t.ticker,market:t.market,company_name:t.company_name||'',
      currency:t.currency,cds_accounts:new Set(),qty:0,totalCost:0,nettBuy:0,nettSell:0,realised:0};
    const h=map[key];
    h.cds_accounts.add(t.cds_account);
    if(t.tx_type==='Buy'){
      h.totalCost+=t.net_amount; h.qty+=t.quantity; h.nettBuy+=t.net_amount;
    } else {
      const avg=h.qty>0?h.totalCost/h.qty:0;
      h.realised+=t.net_amount-avg*t.quantity;   // proceeds − avg cost of units sold
      h.totalCost-=avg*t.quantity; h.qty-=t.quantity; h.nettSell+=t.net_amount;
    }
  });
  return Object.values(map);
}

/* ---- transaction filters (present only on the transactions page;
        elsewhere everything passes).
        Supports multi-select filters (assets/multiselect.js) and plain <select>s. ---- */
function txFilterState(){
  const pick=id=>{
    if(window.MS&&MS.exists(id))return MS.values(id).map(String);   // [] = All
    const el=document.getElementById(id);
    return el&&el.value?[String(el.value)]:[];
  };
  const F={mkt:pick('filterMarket'),cds:pick('filterCDS'),typ:pick('filterType'),yr:pick('filterYear'),stk:pick('filterStock')};
  const inF=(arr,v)=>!arr.length||arr.includes(String(v));
  F.pass=t=>inF(F.mkt,t.market)&&inF(F.cds,normCds(t.cds_account))&&inF(F.typ,t.tx_type)&&
            inF(F.yr,new Date(t.tx_date).getFullYear())&&inF(F.stk,t.ticker);
  F.active=!!(F.mkt.length||F.cds.length||F.typ.length||F.yr.length||F.stk.length);
  return F;
}
function getFilteredTx(){
  const F=txFilterState();
  return {list:transactions.filter(F.pass),active:F.active,yrF:F.yr,stkF:F.stk,mktF:F.mkt,cdsF:F.cds};
}

/* ---- position engine ----
   Each position = one stock in one CDS account (e.g. 1155 in RHB is separate from 1155 in MYB),
   always worked out on its FULL history, so filters never distort the cost basis.
   Average-cost method:
     • every Sell  → one realised item: net proceeds − avg cost × units sold
     • open units  → traced back (FIFO) to the Buy lots they came from; each open lot is
                     valued at the position's average cost.
   Filters then only choose which items to show: a realised item belongs to its Sell row,
   an open lot belongs to its Buy row.                                                    */
function positionEngine(){
  const groups={};
  transactions.forEach(t=>{const k=t.ticker+'|'+t.market+'|'+normCds(t.cds_account);(groups[k]=groups[k]||[]).push(t);});
  const realised=[], open=[];
  Object.values(groups).forEach(list=>{
    list.sort((a,b)=>{const d=new Date(a.tx_date)-new Date(b.tx_date);return d||((a.tx_type==='Buy'?0:1)-(b.tx_type==='Buy'?0:1));});
    const t0=list[0];
    const pos={ticker:t0.ticker,market:t0.market,name:t0.company_name||t0.ticker,
               cds:normCds(t0.cds_account),ccy:t0.currency||(t0.market==='Bursa'?'MYR':'USD')};
    let qty=0,cost=0; const lots=[];
    list.forEach(t=>{
      const q=Number(t.quantity)||0, net=Number(t.net_amount)||0;
      if(t.tx_type==='Buy'){qty+=q;cost+=net;lots.push({tx:t,left:q});}
      else{
        const avg=qty>0?cost/qty:0;
        realised.push(Object.assign({},pos,{tx:t,units:q,avg,proceeds:net,costSold:avg*q,pnl:net-avg*q,noCost:qty<=0}));
        cost-=avg*q; qty-=q;
        let r=q; while(r>1e-9&&lots.length){const l=lots[0],take=Math.min(l.left,r);l.left-=take;r-=take;if(l.left<=1e-9)lots.shift();}
      }
    });
    if(qty>0.001){
      const avg=cost/qty;
      lots.forEach(l=>{if(l.left>1e-9)open.push(Object.assign({},pos,{tx:l.tx,units:l.left,avg,cost:l.left*avg}));});
    }
  });
  return {realised,open};
}

/* ---- KPI tiles ----
   Every figure is totalled per currency (MYR / USD), then combined at the live USD/MYR rate.
   Each tile shows: the combined MYR value · the combined USD value · the MYR | USD split.  */
const FX_SYMBOL='USDMYR=X';
let kpiFx=null, kpiFxSrc='';            // MYR per 1 USD

function injectKPIs(){
  const host=document.getElementById('kpiHost');
  if(!host)return;
  const tile=(id,label,extra='')=>`<div class="tile"><div class="tile-label">${label}</div>
    <div class="tile-value" id="${id}">—</div>
    <div class="tile-sub" id="${id}Usd"></div>
    <div class="tile-sub" id="${id}Split" style="font-size:10px;"></div>${extra}</div>`;
  host.innerHTML=`
    <div class="summary-grid">
      ${tile('kpiInvested','Total Invested')}
      ${tile('kpiValue','Market Value','<div class="tile-sub" id="kpiValueSub" style="font-size:10px;"></div>')}
      ${tile('kpiUnreal','Unrealised P&amp;L','<div class="tile-sub" id="kpiUnrealPct"></div>')}
      ${tile('kpiReal','Realised P&amp;L')}
      ${tile('kpiDiv','Total Dividends')}
      ${tile('kpiNet','Net P&amp;L (incl. Div)')}
    </div>
    <div id="kpiFxNote" style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ink-dim);margin:-8px 0 6px;"></div>
    <div id="kpiFilterNote" style="display:none;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#00a19c;margin:0 0 14px;">&#9679; Filtered view — figures reflect active transaction filters</div>`;
}

/* live USD/MYR: Edge Function quote first, ECB (Frankfurter) latest as fallback */
async function loadKpiFx(){
  const c=priceCache[FX_SYMBOL];
  if(c&&c!=='err'&&c.price){kpiFx=c.price;kpiFxSrc='live';return;}
  try{
    const r=await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=MYR');
    if(r.ok){const j=await r.json();if(j&&j.rates&&j.rates.MYR){kpiFx=j.rates.MYR;kpiFxSrc='ECB '+j.date;}}
  }catch(e){}
}

function kpiCcy(h){return h.currency||(h.market==='Bursa'?'MYR':'USD');}

function updateKPIs(){
  if(!document.getElementById('kpiInvested'))return;
  const F=txFilterState();
  const {realised,open}=positionEngine();
  const tickMkt={};transactions.forEach(t=>{tickMkt[t.ticker]=t.market;});   // dividend → market via its ticker
  const Z=()=>({MYR:0,USD:0});
  const inv=Z(), val=Z(), cost=Z(), real=Z(), div=Z();
  const openPos=new Set(), pricedPos=new Set();
  realised.forEach(r=>{if(F.pass(r.tx)&&(r.ccy==='MYR'||r.ccy==='USD'))real[r.ccy]+=r.pnl;});
  open.forEach(l=>{
    if(!F.pass(l.tx)||(l.ccy!=='MYR'&&l.ccy!=='USD'))return;
    const pk=l.ticker+'|'+l.market+'|'+l.cds; openPos.add(pk);
    inv[l.ccy]+=l.cost;
    const q=priceCache[toYahoo(l)];
    if(q&&q!=='err'){val[l.ccy]+=l.units*q.price;cost[l.ccy]+=l.cost;pricedPos.add(pk);}   // unrealised only over priced lots
  });
  dividends.forEach(d=>{
    if(F.yr.length&&!F.yr.includes(String(new Date(d.payout_date).getFullYear())))return;
    if(F.stk.length&&!F.stk.includes(d.ticker))return;
    if(F.mkt.length&&!F.mkt.includes(String(tickMkt[d.ticker]||'Bursa')))return;
    if(F.cds.length&&d.cds_account&&!F.cds.includes(String(normCds(d.cds_account))))return;
    if(F.typ.length===1&&F.typ[0]==='Buy')return;                           // "Buy" view = open positions only
    const c=d.currency==='USD'?'USD':'MYR';                                  // dividends are recorded in MYR unless marked USD
    div[c]+=Number(d.amount)||0;
  });
  const open_=openPos.size, priced=pricedPos.size;
  const unr={MYR:val.MYR-cost.MYR,USD:val.USD-cost.USD};
  const net={MYR:real.MYR+unr.MYR+div.MYR,USD:real.USD+unr.USD+div.USD};

  const fx=kpiFx;
  const toMyr=o=>fx?o.MYR+o.USD*fx:null;
  const toUsd=o=>fx?o.USD+o.MYR/fx:null;
  const sg=(v,signed)=>signed?`<span class="${v>=0?'up':'down'}">${v>=0?'+':'−'}`:'<span>';
  const abs=(v,signed)=>signed?Math.abs(v):v;
  const show=(id,o,signed,hasData=true)=>{
    if(!hasData){setText(id,'—');setText(id+'Usd','');setText(id+'Split','');return;}
    const m=toMyr(o), u=toUsd(o);
    if(m==null){
      setHTML(id,`${sg(o.MYR,signed)}MYR ${fmt(abs(o.MYR,signed))}</span>`);
      setHTML(id+'Usd',`${sg(o.USD,signed)}USD ${fmt(abs(o.USD,signed))}</span> <span style="color:var(--ink-dim);">(rate pending)</span>`);
      setText(id+'Split','');return;
    }
    setHTML(id,`${sg(m,signed)}MYR ${fmt(abs(m,signed))}</span>`);
    setHTML(id+'Usd',`≈ ${sg(u,signed)}USD ${fmt(abs(u,signed))}</span>`);
    setText(id+'Split',(o.MYR||o.USD)?`MYR ${fmt(o.MYR)} | USD ${fmt(o.USD)}`:'');
  };

  show('kpiInvested',inv,false,open_>0);
  show('kpiValue',val,false,priced>0);
  setText('kpiValueSub',open_?`${priced} of ${open_} positions priced`:'');
  show('kpiUnreal',unr,true,priced>0);
  const cm=toMyr(cost), um=toMyr(unr);
  setHTML('kpiUnrealPct',priced&&cm?`${sg(um,true)}${fmt(Math.abs(um/cm*100))}%</span>`:'');
  show('kpiReal',real,true);
  show('kpiDiv',div,false);
  show('kpiNet',net,true);

  setText('kpiFxNote',fx?`USD/MYR ${fmt(fx,4)} (${kpiFxSrc}) · MYR and USD totals are combined at this rate`:'Fetching USD/MYR rate…');
  const badge=document.getElementById('kpiFilterNote');
  if(badge){
    badge.style.display=F.active?'block':'none';
    badge.innerHTML='&#9679; Filtered view — sold rows count their realised P&amp;L, bought rows count what is still held from them (cost basis always uses full history)';
  }
}

/* ---- live prices (via Supabase Edge Function "quote") ----
   priceCache[symbol]:
     undefined = never requested
     null      = loading (page shows spinner)
     'err'     = failed (page shows —)
     {price,currency,change,prevClose} = OK                     */
const PRICE_TIMEOUT_MS=15000;

function toYahoo(h){return h.market==='Bursa'?h.ticker+'.KL':h.ticker;}

async function invokeQuote(body){
  const call=sb.functions.invoke('quote',{body});
  const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('Price request timed out')),PRICE_TIMEOUT_MS));
  const {data,error}=await Promise.race([call,timeout]);
  if(error)throw error;
  return data;
}

function toCacheEntry(q){
  return (q&&!q.error&&q.price!=null)
    ?{price:q.price,currency:q.currency,change:q.change,prevClose:q.prevClose}
    :'err';
}

async function fetchPrices(symbols){
  const todo=[...new Set(symbols.filter(Boolean))].filter(s=>priceCache[s]===undefined);
  if(!todo.length)return;
  todo.forEach(s=>priceCache[s]=null);
  try{
    const data=await invokeQuote({symbols:todo});
    todo.forEach(s=>{priceCache[s]=toCacheEntry(data?.[s]||data?.[s.toUpperCase()]);});
    const failed=todo.filter(s=>priceCache[s]==='err');
    if(failed.length)console.warn('No price for:',failed.join(', '));
  }catch(e){
    console.error('Price fetch failed:',e);
    todo.forEach(s=>priceCache[s]='err');
    showToast('Price fetch failed — check console (F12)');
  }
}

/* kept for any page that still calls fetchPrice(symbol) directly */
async function fetchPrice(symbol){await fetchPrices([symbol]);}

async function fetchAllPrices(){
  const syms=new Set(calcHoldings().filter(h=>h.qty>0.001).map(toYahoo));
  positionEngine().open.forEach(l=>syms.add(toYahoo(l)));          // every account that still holds units
  await fetchPrices([...syms,FX_SYMBOL]);
  await loadKpiFx();
  if(window.onPricesUpdated)window.onPricesUpdated();
  updateKPIs();
  setText('priceNote',`Prices updated ${new Date().toLocaleTimeString()}`);
}
async function refreshPrices(){
  priceCache={};kpiFx=null;
  if(window.onPricesUpdated)window.onPricesUpdated();
  await fetchAllPrices();
}
