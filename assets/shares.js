/* ===== Markets Suite — shares module =====
   Loaded by all Share Holdings pages (and the dashboard).
   Handles data loading, holdings math, KPI tiles, live prices.
   Pages can define these optional hooks:
     window.onSharesData()    — called after transactions+dividends load
     window.onPricesUpdated() — called after live prices arrive */

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
const DIV_YEARS=[2020,2021,2022,2023,2024,2025];

let transactions=[], dividends=[], priceCache={};

/* ---- data load ---- */
async function loadShares(){
  const [txRes,divRes]=await Promise.all([
    sb.from('transactions').select('*').order('tx_date',{ascending:false}),
    sb.from('dividends').select('*').order('payout_date',{ascending:false})
  ]);
  transactions=txRes.data||[];
  dividends=divRes.data||[];
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
        elsewhere this transparently returns everything) ---- */
function getFilteredTx(){
  const g=id=>{const el=document.getElementById(id);return el?el.value:'';};
  const mktF=g('filterMarket'),cdsF=g('filterCDS'),typF=g('filterType'),yrF=g('filterYear'),stkF=g('filterStock');
  const f=transactions.filter(t=>{
    if(mktF&&t.market!==mktF)return false;
    if(cdsF&&t.cds_account!==cdsF)return false;
    if(typF&&t.tx_type!==typF)return false;
    if(yrF&&new Date(t.tx_date).getFullYear()!=yrF)return false;
    if(stkF&&t.ticker!==stkF)return false;
    return true;
  });
  return {list:f,active:!!(mktF||cdsF||typF||yrF||stkF),yrF,stkF};
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
    const symbol=h.market==='Bursa'?h.ticker+'.KL':h.ticker;
    const cached=priceCache[symbol];
    if(cached&&cached!=='err'&&h.qty>0.001){totalEstVal+=h.qty*cached.price;priced++;}
  });
  const unrealised=totalEstVal-totalInvested;
  const divs=dividends.filter(d=>{
    if(yrF&&new Date(d.payout_date).getFullYear()!=yrF)return false;
    if(stkF&&d.ticker!==stkF)return false;
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

/* ---- live prices ---- */
const PROXIES=[
  url=>`https://corsproxy.io/?${encodeURIComponent(url)}`,
  url=>`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url=>`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];
async function fetchPrice(symbol){
  if(priceCache[symbol]!==undefined)return;
  priceCache[symbol]=null;
  const base=`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  for(const proxy of PROXIES){
    try{
      const ctrl=new AbortController();
      const t=setTimeout(()=>ctrl.abort(),8000);
      const res=await fetch(proxy(base),{signal:ctrl.signal});
      clearTimeout(t);
      if(!res.ok)continue;
      const data=await res.json();
      const meta=data?.chart?.result?.[0]?.meta;
      if(!meta?.regularMarketPrice)continue;
      priceCache[symbol]={price:meta.regularMarketPrice,currency:meta.currency};
      return;
    }catch{continue;}
  }
  priceCache[symbol]='err';
}
async function fetchAllPrices(){
  const holdings=calcHoldings().filter(h=>h.qty>0.001);
  const symbols=holdings.map(h=>h.market==='Bursa'?h.ticker+'.KL':h.ticker);
  await Promise.all([...new Set(symbols)].map(s=>fetchPrice(s)));
  if(window.onPricesUpdated)window.onPricesUpdated();
  updateKPIs();
  setText('priceNote',`Prices updated ${new Date().toLocaleTimeString()}`);
}
async function refreshPrices(){
  priceCache={};
  if(window.onPricesUpdated)window.onPricesUpdated();
  await fetchAllPrices();
}
