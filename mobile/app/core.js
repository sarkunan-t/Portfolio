/* ===== UnicornHunter app — core: state, router, sheet, filters, helpers ===== */
(function(){
const App=window.App={
  screens:{},
  state:{
    tab:'home',
    seg:{holdings:'open',activity:'trades',insights:'pnl',more:'menu'},
    filters:{},            // per list: {groupId:[values]}  (empty = all)
    funds:[],fundsStatus:'loading',
    alerts:[],alertsStatus:'loading',
    sharesLoaded:false,pricesAt:null,loadingPrices:false
  }
};

/* ---------- helpers ---------- */
const H=App.h={};
H.$=(s,r=document)=>r.querySelector(s);
H.esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
H.fx=()=>(typeof kpiFx!=='undefined'&&kpiFx)?kpiFx:null;
H.n=(v,d=2)=>fmt(v,d);
H.money=(ccy,v,signed,d=2)=>{
  if(v==null||isNaN(v))return '—';
  if(!signed)return `${ccy} ${fmt(v,d)}`;
  return `<span class="${v>=0?'up':'down'}">${v>=0?'+':'−'}${ccy} ${fmt(Math.abs(v),d)}</span>`;
};
H.pct=(v,d=2)=>v==null||!isFinite(v)?'—':`<span class="${v>=0?'up':'down'}">${v>=0?'+':'−'}${fmt(Math.abs(v),d)}%</span>`;
H.pill=(v)=>v==null||!isFinite(v)?'<span class="pill-chg flat">—</span>':
  `<span class="pill-chg ${Math.abs(v)<0.005?'flat':v>0?'up':'down'}">${v>0?'▲':v<0?'▼':''} ${fmt(Math.abs(v),2)}%</span>`;
/* short money for tiles: MYR 12.3k */
H.k=v=>{const a=Math.abs(v),s=v<0?'−':'';return a>=1e6?s+(a/1e6).toFixed(2)+'M':a>=1e4?s+(a/1e3).toFixed(1)+'k':s+fmt(a,0);};
H.date=d=>d?new Date(d+(String(d).length===10?'T00:00:00':'')).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
H.dateShort=d=>d?new Date(d+(String(d).length===10?'T00:00:00':'')).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}):'—';
H.month=d=>new Date(d+'T00:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
H.today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
H.stockLabel=(ticker,market,name)=>market==='Bursa'?(name&&name!==ticker?name:(TICKER_NAME[ticker]||ticker)):ticker;
H.stockSub=(ticker,market,name)=>market==='Bursa'?ticker:(TICKER_NAME[ticker]||name||'');
H.ccyTag=c=>`<span class="tag ${c==='USD'?'usd':'myr'}">${c}</span>`;
H.eqMyr=(ccy,v,signed)=>{const r=H.fx();return ccy==='USD'&&v!=null&&r?`≈ ${signed?H.money('MYR',v*r,true):H.money('MYR',v*r)}`:'';};
H.icon={
  home:'<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  holdings:'<svg viewBox="0 0 24 24"><path d="M21 12A9 9 0 1 1 12 3"/><path d="M21 12h-9V3a9 9 0 0 1 9 9z"/></svg>',
  activity:'<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
  insights:'<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  more:'<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
  refresh:'<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  filter:'<svg viewBox="0 0 24 24"><path d="M3 5h18M6 12h12M10 19h4"/></svg>',
  chev:'<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  bell:'<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  gold:'<svg viewBox="0 0 24 24"><path d="M4 19l3-8h10l3 8z"/><path d="M8 11l2-5h4l2 5"/></svg>',
  unit:'<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3"/></svg>',
  out:'<svg viewBox="0 0 24 24"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l-5-5 5-5M5 12h11"/></svg>',
  trash:'<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  fx:'<svg viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>'
};

/* ---------- navigation ---------- */
const TABS=[
  {id:'home',label:'Home'},{id:'holdings',label:'Holdings'},{id:'activity',label:'Activity'},
  {id:'insights',label:'Insights'},{id:'more',label:'More'}
];
App.go=(tab,seg)=>{
  const h='#'+tab+(seg?'/'+seg:'');
  if(location.hash===h)App.render(true); else location.hash=h;
};
function parseHash(){
  const [t,s]=(location.hash||'#home').slice(1).split('/');
  const tab=App.screens[t]?t:'home';
  App.state.tab=tab;
  if(s&&App.screens[tab].segs&&App.screens[tab].segs.some(x=>x.id===s))App.state.seg[tab]=s;
}
function renderNav(){
  H.$('#nav').innerHTML=`<div class="logo-mark rail-logo"><svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="23" fill="#00332F"/><circle cx="50" cy="52" r="30" fill="none" stroke="#00A19C" stroke-width="5"/><path d="M50 16V25M50 79V88M14 52H23M77 52H86" stroke="#00A19C" stroke-width="5" stroke-linecap="round"/><g transform="rotate(35 50 52)"><path d="M42 70L50 22L58 70Z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M43.7 60L55.3 54M45.7 48L53.3 42M47.7 36L51.3 30" stroke="#00332F" stroke-width="2.5" stroke-linecap="round"/></g><path d="M79 13L81 19L87 21L81 23L79 29L77 23L71 21L77 19Z" fill="#E8B04A"/></svg></div>`+TABS.map(t=>
    `<a href="#${t.id}" class="${App.state.tab===t.id?'on':''}" aria-label="${t.label}"><span class="pill"></span>${H.icon[t.id]}<span>${t.label}</span></a>`).join('');
}
App.render=(resetScroll)=>{
  const sc=App.screens[App.state.tab];
  renderNav();
  const seg=App.state.seg[App.state.tab];
  H.$('#title').textContent=typeof sc.title==='function'?sc.title(seg):sc.title;
  H.$('#sub').innerHTML=sc.sub?sc.sub(seg):App.priceNote();
  // segments
  H.$('#segs').innerHTML=(sc.segs||[]).map(s=>`<button class="seg ${s.id===seg?'on':''}" data-seg="${s.id}">${s.label}</button>`).join('');
  H.$('#segs').hidden=!(sc.segs&&sc.segs.length)||!!sc.hideSegs;
  // header actions
  const acts=(sc.actions?sc.actions(seg):[]).concat(['refresh']);
  H.$('#actions').innerHTML=acts.map(a=>{
    if(a==='refresh')return `<button class="icon-btn ${App.state.loadingPrices?'spin':''}" data-act="refresh" aria-label="Refresh prices">${H.icon.refresh}</button>`;
    if(a.id==='filter')return `<button class="icon-btn" data-act="filter" aria-label="Filter">${H.icon.filter}${a.active?'<span class="dot"></span>':''}</button>`;
    return '';
  }).join('');
  // FAB
  const fab=sc.fab?sc.fab(seg):null;
  H.$('#fab').hidden=!fab;
  if(fab){H.$('#fabLbl').textContent=fab.label;H.$('#fab').onclick=fab.onClick;}
  const y=window.scrollY;
  sc.render(H.$('#view'),seg);
  if(resetScroll)window.scrollTo(0,0); else window.scrollTo(0,y);
};
App.refreshView=()=>{if(!H.$('#shell').hidden)App.render(false);};
App.priceNote=()=>{
  if(App.state.loadingPrices)return 'Updating prices…';
  const r=H.fx();
  return App.state.pricesAt?`Prices ${App.state.pricesAt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}${r?` · USD/MYR ${fmt(r,4)}`:''}`:'Loading prices…';
};

document.addEventListener('click',e=>{
  const s=e.target.closest('[data-seg]');
  if(s){App.go(App.state.tab,s.dataset.seg);return;}
  const a=e.target.closest('[data-act]');
  if(a){
    if(a.dataset.act==='refresh')App.refreshPrices();
    if(a.dataset.act==='filter'){const sc=App.screens[App.state.tab];sc.openFilter&&sc.openFilter(App.state.seg[App.state.tab]);}
  }
});
window.addEventListener('hashchange',()=>{parseHash();App.closeSheet(true);App.render(true);});
App.initRouter=()=>{parseHash();App.render(true);};

/* ---------- sheet ---------- */
let sheetOpen=false, sheetOnClose=null;
App.openSheet=({title,sub='',body='',foot='',full=false,onClose=null})=>{
  H.$('#shTitle').textContent=title||'';
  H.$('#shSub').innerHTML=sub;
  H.$('#shBody').innerHTML=body;
  H.$('#shFoot').innerHTML=foot;
  H.$('#shFoot').hidden=!foot;
  H.$('#sheet').classList.toggle('full',!!full);
  H.$('#shBody').scrollTop=0;
  if(!sheetOpen)history.pushState({sheet:1},'');
  sheetOpen=true; sheetOnClose=onClose;
  H.$('#sheetBack').classList.add('on'); H.$('#sheet').classList.add('on');
  return H.$('#sheet');
};
App.closeSheet=(fromNav)=>{
  if(!sheetOpen)return;
  sheetOpen=false;
  H.$('#sheetBack').classList.remove('on'); H.$('#sheet').classList.remove('on');
  const cb=sheetOnClose; sheetOnClose=null; if(cb)cb();
  if(!fromNav&&history.state&&history.state.sheet)history.back();
};
App.sheetIsOpen=()=>sheetOpen;
H.$('#sheetBack').onclick=()=>App.closeSheet();
H.$('#shClose').onclick=()=>App.closeSheet();
window.addEventListener('popstate',()=>{if(sheetOpen)App.closeSheet(true);});

/* ---------- generic multi-select filter sheet ----------
   groups: [{id,label,options:[{value,label}]}] · state: {id:[values]} (empty = all) */
App.filterActive=st=>!!st&&Object.values(st).some(v=>v&&v.length);
App.openFilterSheet=({title='Filter',groups,state,onApply,extra=''})=>{
  const work=JSON.parse(JSON.stringify(state||{}));
  const draw=()=>groups.map(g=>`<div class="form-sec">${H.esc(g.label)}</div><div class="chips">`+
    g.options.map(o=>{const v=String(o.value);const on=(work[g.id]||[]).includes(v);
      return `<button class="chip ${on?'on':''}" data-g="${g.id}" data-v="${H.esc(v)}">${H.esc(o.label??o.value)}</button>`;}).join('')+
    (g.options.length?'':'<span class="tiny">No options</span>')+`</div>`).join('')+extra;
  const sh=App.openSheet({title,body:draw(),full:true,
    foot:`<button class="btn btn-s" id="fClear">Clear all</button><button class="btn btn-p" id="fApply">Show results</button>`});
  const body=H.$('#shBody');
  body.onclick=e=>{
    const c=e.target.closest('.chip[data-g]'); if(!c)return;
    const g=c.dataset.g, v=c.dataset.v, arr=work[g]=work[g]||[];
    const i=arr.indexOf(v); if(i>=0)arr.splice(i,1); else arr.push(v);
    c.classList.toggle('on');
  };
  H.$('#fClear').onclick=()=>{groups.forEach(g=>work[g.id]=[]);body.querySelectorAll('.chip.on[data-g]').forEach(c=>c.classList.remove('on'));};
  H.$('#fApply').onclick=()=>{onApply(work,body);App.closeSheet();};
  return sh;
};
/* chips row showing active filters (tap × to clear everything) */
App.filterChips=(key,labels={})=>{
  const st=App.state.filters[key]; if(!App.filterActive(st))return '';
  const parts=[];
  Object.entries(st).forEach(([g,vals])=>(vals||[]).forEach(v=>parts.push(`<span class="fchip">${H.esc((labels[g]&&labels[g][v])||v)}</span>`)));
  return `<div class="fchips">${parts.join('')}<button class="fchip clear" data-clearf="${key}">Clear ×</button></div>`;
};
document.addEventListener('click',e=>{
  const c=e.target.closest('[data-clearf]'); if(!c)return;
  App.state.filters[c.dataset.clearf]={}; App.render(false);
});
App.fPass=(key,g,v)=>{const a=(App.state.filters[key]||{})[g];return !a||!a.length||a.includes(String(v));};

/* ---------- data ---------- */
App.loadFunds=async()=>{
  App.state.fundsStatus='loading';
  const {data,error}=await sb.from('funds').select('*').order('txn_date',{ascending:false});
  if(error){console.error('funds',error);App.state.funds=[];App.state.fundsStatus='error';}
  else{App.state.funds=(data||[]).sort((a,b)=>String(b.txn_date).localeCompare(String(a.txn_date)));App.state.fundsStatus='ok';}
  App.refreshView();
};
App.loadAlerts=async()=>{
  const {data,error}=await sb.from('price_alerts').select('*').order('created_at',{ascending:false}).limit(100);
  App.state.alerts=error?[]:(data||[]); App.state.alertsStatus=error?'error':'ok';
  App.refreshView();
};
App.reloadShares=()=>{priceCache={};App.state.loadingPrices=true;App.refreshView();loadShares();};
App.refreshPrices=async()=>{
  if(App.state.loadingPrices)return;
  App.state.loadingPrices=true;App.refreshView();
  if(App.metals&&App.metals.status==='ok')App.metals.loadSpot();
  await refreshPrices();
};
App.reloadAll=()=>{App.reloadShares();App.loadFunds();App.loadAlerts();App.metals&&App.metals.load();};

/* shares.js hooks */
window.onSharesData=()=>{App.state.sharesLoaded=true;App.state.loadingPrices=true;App.refreshView();};
window.onPricesUpdated=()=>{
  const settled=Object.values(priceCache).every(v=>v!==null);
  if(settled&&Object.keys(priceCache).length){App.state.loadingPrices=false;App.state.pricesAt=new Date();}
  App.refreshView();
};

/* skeleton while data loads */
App.skeleton=(n=4)=>Array.from({length:n},()=>'<div class="skel" style="margin-bottom:10px"></div>').join('');
})();
