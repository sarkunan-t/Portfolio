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
        elsewhere this transparently returns everything).
        Supports multi-select filters (assets/multiselect.js) and plain <select>s. ---- */
function getFilteredTx(){
  const pick=id=>{
    if(window.MS&&MS.exists(id))return MS.values(id).map(String);   // [] = All
    const el=document.getElementById(id);
    return el&&el.value?[String(el.value)]:[];
  };
  const mkt=pick('filterMarket'),cds=pick('filterCDS'),typ=pick('filterType'),yr=pick('filterYear'),stk=pick('filterStock');
  const inF=(arr,v)=>!arr.length||arr.includes(String(v));
  const f=transactions.filter(t=>
    inF(mkt,t.market)&&inF(cds,t.cds_account)&&inF(typ,t.tx_type)&&
    inF(yr,new Date(t.tx_date).getFullYear())&&inF(stk,t.ticker));
  return {list:f,active:!!(mkt.length||cds.length||typ.length||yr.length||stk.length),yrF:yr,stkF:stk};
}

/* ---- KPI tiles ---- */
function injectKPIs(){
  const host=document.getElementById('kpiHost');
  if(!host)return;
  host.innerHTML=`
    <div class="summary-grid">
      <div class="tile"><div class="tile-label">Total Invested</div><div class="tile-value" id="kpiInvested">—</div></div>
      <div class="tile"><div class="tile-label">Market Value</div><div class="tile-value" id="kpiValue">—</div><div class="tile-sub" id="kpiValueSub"></div></div>
      <div class="tile"><div class="tile-label">Unrealised P&amp;L</div><div class="tile-value" id="kpiUnreal">—</div><div class="tile-sub" id="kpiUnrealPct"></div></div>
      <div class="tile"><div class="tile-label">Realised P&amp;L</div><div class="tile-value" id="kpiReal">—</div></div>
      <div class="tile"><div class="tile-label">Total Dividends</div><div class="tile-value" id="kpiDiv">—</div></div>
      <div class="tile"><div class="tile-label">Net P&amp;L (incl. Div)</div><div class="tile-value" id="kpiNet">—</div></div>
    </div>
    <div id="kpiFilterNote" style="display:none;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#00a19c;margin:-8px 0 14px;">&#9679; Filtered view — figures reflect active transaction filters</div>`;
}

function updateKPIs(){
  if(!document.getElementById('kpiInvested'))return;
  const {list,active,yrF,stkF}=getFilteredTx();
  const holdings=calcHoldings(list);
  let totalInvested=0,realised=0,totalEstVal=0,priced=0;
  holdings.forEach(h=>{
    realised+=h.realised;
    if(h.qty>0.001) totalInvested+=h.totalCost;
    const cached=priceCache[toYahoo(h)];
    if(cached&&cached!=='err'&&h.qty>0.001){totalEstVal+=h.qty*cached.price;priced++;}
  });
  const unrealised=totalEstVal-totalInvested;
  const divs=dividends.filter(d=>{
    if(yrF.length&&!yrF.includes(String(new Date(d.payout_date).getFullYear())))return false;
    if(stkF.length&&!stkF.includes(d.ticker))return false;
    return true;
  });
  const totalDiv=divs.reduce((s,d)=>s+Number(d.amount),0);
  const netPL=realised+(totalEstVal>0?unrealised:0)+totalDiv;
  const badge=document.getElementById('kpiFilterNote');
  if(badge)badge.style.display=active?'block':'none';

  setText('kpiInvested',totalInvested>0?'MYR '+fmt(totalInvested):'—');
  setText('kpiValue',priced?'MYR '+fmt(totalEstVal):'—');
  setText('kpiValueSub',priced?`${priced} priced`:'');
  setHTML('kpiUnreal',priced?`<span class="${unrealised>=0?'up':'down'}">${unrealised>=0?'+':''}MYR ${fmt(unrealised)}</span>`:'—');
  setHTML('kpiUnrealPct',totalInvested>0&&priced?`<span class="${unrealised>=0?'up':'down'}">${unrealised>=0?'+':''}${fmt((unrealised/totalInvested)*100)}%</span>`:'');
  setHTML('kpiReal',`<span class="${realised>=0?'up':'down'}">${realised>=0?'+':''}MYR ${fmt(realised)}</span>`);
  setText('kpiDiv','MYR '+fmt(totalDiv));
  setHTML('kpiNet',`<span class="${netPL>=0?'up':'down'}">${netPL>=0?'+':''}MYR ${fmt(netPL)}</span>`);
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
  const holdings=calcHoldings().filter(h=>h.qty>0.001);
  await fetchPrices(holdings.map(toYahoo));
  if(window.onPricesUpdated)window.onPricesUpdated();
  updateKPIs();
  setText('priceNote',`Prices updated ${new Date().toLocaleTimeString()}`);
}
async function refreshPrices(){
  priceCache={};
  if(window.onPricesUpdated)window.onPricesUpdated();
  await fetchAllPrices();
}
