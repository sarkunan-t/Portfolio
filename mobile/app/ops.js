/* ===== Operations: portfolio heatmap (treemap) =====
   Every open stock is a tile — size = market value (or cost / equal weight), colour = today's move
   (or total return). Tiles are grouped by sector, industry, market, wallet or currency; tap a group
   header (or a row in the table below) to zoom in, tap a tile to open the stock.
   Sector / industry come from Yahoo (Edge Function stock-analysis {action:'profile'}), cached on this
   device for 30 days. If the function hasn't been redeployed with 'profile' yet, it falls back to the
   older {action:'data'} call one stock at a time. */
(function(){
const H=App.h, C=App.calc;

/* ---------- preferences (remembered on this device) ---------- */
const PREF_KEY='ops_prefs', PROF_KEY='ops_prof_v1', TTL=30*24*3600*1000;
const st={group:'sector',size:'value',color:'day',market:'all',zoom:null};
try{Object.assign(st,JSON.parse(localStorage.getItem(PREF_KEY)||'{}'));st.zoom=null;}catch(e){}
const save=()=>{try{const {zoom,...p}=st;localStorage.setItem(PREF_KEY,JSON.stringify(p));}catch(e){}};

/* ---------- sector / industry profiles ---------- */
let prof={};
try{prof=JSON.parse(localStorage.getItem(PROF_KEY)||'{}')||{};}catch(e){prof={};}
const saveProf=()=>{try{localStorage.setItem(PROF_KEY,JSON.stringify(prof));}catch(e){}};
const pending=new Set(), failed=new Set();
let profErr=null;
const fresh=s=>prof[s]&&Date.now()-(prof[s].t||0)<TTL;

async function viaProfile(list){
  const out={};
  for(let i=0;i<list.length;i+=40){
    const {data,error}=await sb.functions.invoke('stock-analysis',{body:{action:'profile',symbols:list.slice(i,i+40)}});
    if(error||!data||data.error)throw new Error((error&&error.message)||(data&&data.error)||'profile failed');
    Object.assign(out,data);
  }
  return out;
}
async function viaData(list){   // fallback for an older deployment of stock-analysis
  const out={};
  for(let i=0;i<list.length;i+=4){
    await Promise.all(list.slice(i,i+4).map(async s=>{
      try{const {data}=await sb.functions.invoke('stock-analysis',{body:{action:'data',symbol:s}});
        const x=data&&data.stats||{};out[s]={sector:x.sector||null,industry:x.industry||null,name:x.name||null};}
      catch(e){out[s]={error:String(e)};}
    }));
  }
  return out;
}
async function ensure(syms){
  const need=syms.filter(s=>!fresh(s)&&!pending.has(s)&&!failed.has(s));
  if(!need.length)return;
  need.forEach(s=>pending.add(s));
  let res={};
  try{res=await viaProfile(need);}
  catch(e){try{res=await viaData(need);}catch(e2){profErr=String(e2.message||e2);}}
  need.forEach(s=>{
    pending.delete(s);
    const r=res[s];
    if(r&&!r.error&&(r.sector||r.industry))prof[s]={s:r.sector||null,i:r.industry||null,n:r.name||null,t:Date.now()};
    else if(r&&!r.error)prof[s]={s:null,i:null,n:r.name||null,t:Date.now()-TTL+24*3600*1000};  // retry tomorrow
    else failed.add(s);
  });
  saveProf();
  if(App.state.tab==='home'&&App.state.seg.home==='ops')App.refreshView();
}

/* ---------- colours (finviz-style) ---------- */
const STOPS=[[-3,[246,53,56]],[-2,[191,64,69]],[-1,[139,68,78]],[0,[65,69,84]],[1,[53,118,78]],[2,[47,158,79]],[3,[48,204,90]]];
function heat(v,scale){
  if(v==null||!isFinite(v))return 'rgb(80,86,98)';
  const x=Math.max(-3,Math.min(3,v/scale));
  for(let i=1;i<STOPS.length;i++){
    const [a,ca]=STOPS[i-1],[b,cb]=STOPS[i];
    if(x<=b){const t=(x-a)/(b-a);return `rgb(${ca.map((c,j)=>Math.round(c+(cb[j]-c)*t)).join(',')})`;}
  }
  return 'rgb(48,204,90)';
}
const scaleOf=()=>st.color==='day'?1:10;     // today: ±3% full colour · total return: ±30%
const metric=x=>st.color==='day'?x.dayPct:x.pnlPct;

/* ---------- data: one row per stock (wallets merged unless grouping by wallet) ---------- */
const GROUPS=[
  {id:'sector',label:'Sector'},{id:'industry',label:'Industry'},{id:'market',label:'Market'},
  {id:'wallet',label:'Wallet'},{id:'ccy',label:'Currency'},{id:'none',label:'None'}];
const SIZES=[{id:'value',label:'Market value'},{id:'cost',label:'Cost'},{id:'equal',label:'Equal'}];
const COLORS=[{id:'day',label:'Today %'},{id:'pnl',label:'Total return %'}];
const MARKETS=[{id:'all',label:'All'},{id:'Bursa',label:'Bursa'},{id:'US',label:'US'}];

const mkt=p=>p.market==='Bursa'?'Bursa':'US';
const sectorOf=p=>(prof[p.sym]&&prof[p.sym].s)||(pending.has(p.sym)?'Loading…':'Unclassified');
const industryOf=p=>(prof[p.sym]&&prof[p.sym].i)||(pending.has(p.sym)?'Loading…':'Unclassified');

function rows(){
  const byWallet=st.group==='wallet';
  const map={};
  C.positions().forEach(p=>{
    if(st.market!=='all'&&mkt(p)!==st.market)return;
    const k=byWallet?p.sym+'|'+p.wallet:p.sym;
    const r=map[k]||(map[k]={sym:p.sym,ticker:p.ticker,market:p.market,ccy:p.ccy,label:p.label,subl:p.subl,
      wallets:new Set(),units:0,cost:0,costN:0,value:0,priced:true,dayAmt:0,dayBase:0,dayOk:false,price:p.price});
    r.wallets.add(p.wallet);
    r.units+=p.units; r.costN+=p.cost;
    r.cost+=C.toMyr(p.ccy,p.cost)||0;
    if(p.value!=null)r.value+=C.toMyr(p.ccy,p.value)||0; else{r.priced=false;r.value+=C.toMyr(p.ccy,p.cost)||0;}
    if(p.dayAmt!=null){r.dayOk=true;r.dayAmt+=C.toMyr(p.ccy,p.dayAmt)||0;r.dayBase+=C.toMyr(p.ccy,p.units*p.prevClose)||0;}
  });
  return Object.values(map).map(r=>{
    r.wallet=[...r.wallets].join(', ');
    r.avg=r.units?r.costN/r.units:null;
    r.pnlN=r.priced&&r.price!=null?r.units*r.price-r.costN:null;
    r.dayPct=r.dayOk&&r.dayBase?r.dayAmt/r.dayBase*100:null;
    r.pnl=r.priced?r.value-r.cost:null;
    r.pnlPct=r.priced&&r.cost?r.pnl/r.cost*100:null;
    r.v=st.size==='equal'?1:st.size==='cost'?r.cost:r.value;
    return r;
  }).filter(r=>r.v>0);
}
const keyOf=(r,g)=>g==='sector'?sectorOf(r):g==='industry'?industryOf(r):g==='market'?mkt(r):g==='wallet'?r.wallet:g==='ccy'?r.ccy:'All holdings';

/* group stats (MYR) */
function agg(list){
  const a={n:list.length,v:0,value:0,cost:0,pnlCost:0,pnl:0,dayAmt:0,dayBase:0,priced:0};
  list.forEach(r=>{a.v+=r.v;a.value+=r.value;a.cost+=r.cost;if(r.pnl!=null){a.pnl+=r.pnl;a.pnlCost+=r.cost;a.priced++;}
    if(r.dayPct!=null){a.dayAmt+=r.dayAmt;a.dayBase+=r.dayBase;}});
  a.dayPct=a.dayBase?a.dayAmt/a.dayBase*100:null;
  a.pnlPct=a.pnlCost?a.pnl/a.pnlCost*100:null;
  return a;
}

/* tree: sector grouping nests industries inside sectors (like finviz) */
function tree(list){
  const g=st.group;
  const by=(arr,fn)=>{const m={};arr.forEach(r=>{const k=fn(r);(m[k]=m[k]||[]).push(r);});return m;};
  const node=(name,items,kids)=>({name,items,a:agg(items),kids});
  if(g==='none')return node('All holdings',list,null);
  const top=by(list,r=>keyOf(r,g==='industry'?'sector':g));
  return node('All',list,Object.entries(top).map(([k,items])=>{
    if(g==='industry'){
      const sub=by(items,industryOf);
      return node(k,items,Object.entries(sub).map(([k2,it2])=>node(k2,it2,null)));
    }
    return node(k,items,null);
  }));
}

/* ---------- squarified treemap ---------- */
function squarify(items,x,y,w,h){
  const total=items.reduce((s,i)=>s+i.v,0);
  if(!total||w<=0||h<=0){items.forEach(i=>i.r={x,y,w:0,h:0});return;}
  const sc=w*h/total, nodes=items.map(i=>({i,a:i.v*sc}));
  let rect={x,y,w,h}, row=[], k=0;
  const worst=(r,s)=>{let sum=0,mx=0,mn=Infinity;r.forEach(n=>{sum+=n.a;mx=Math.max(mx,n.a);mn=Math.min(mn,n.a);});
    return Math.max(s*s*mx/(sum*sum),(sum*sum)/(s*s*mn));};
  const place=(r,R)=>{const sum=r.reduce((s,n)=>s+n.a,0);
    if(R.w>=R.h){const cw=sum/R.h;let cy=R.y;r.forEach(n=>{const hh=n.a/cw;n.i.r={x:R.x,y:cy,w:cw,h:hh};cy+=hh;});return {x:R.x+cw,y:R.y,w:R.w-cw,h:R.h};}
    const rh=sum/R.w;let cx=R.x;r.forEach(n=>{const ww=n.a/rh;n.i.r={x:cx,y:R.y,w:ww,h:rh};cx+=ww;});return {x:R.x,y:R.y+rh,w:R.w,h:R.h-rh};};
  while(k<nodes.length){
    const n=nodes[k], side=Math.min(rect.w,rect.h);
    if(!row.length||worst(row.concat(n),side)<=worst(row,side)){row.push(n);k++;}
    else{rect=place(row,rect);row=[];}
  }
  if(row.length)place(row,rect);
}

const px=v=>Math.round(v*10)/10+'px';
const esc=H.esc;
const pxDec=r=>r.market==='Bursa'?3:2;
const pnlTxt=(r,short)=>r.pnlN==null?'—':`${r.pnlN>=0?'+':'−'}${r.ccy} ${fmt(Math.abs(r.pnlN),short||Math.abs(r.pnlN)>=1e4?0:2)}`;
function tileHtml(r,R){
  const m=metric(r), w=R.w, h=R.h, area=w*h;
  const fs=Math.max(9,Math.min(30,Math.sqrt(area)/5.2)), ps=Math.max(9,fs*.62);
  const name=r.market==='Bursa'?r.label:r.ticker;
  const show=w>34&&h>20, showPct=w>40&&h>fs*1.9+6;
  // key stats (price in → now, qty, P&L) when the tile has room
  const sf=Math.max(10,Math.min(13,fs*.45)), statsH=sf*1.3*3+8;
  const showStats=showPct&&w>118&&h>fs*1.15+ps*1.2+statsH+10;
  const d=pxDec(r);
  const tip=`${r.label}${r.market==='Bursa'?' ('+r.ticker+')':' · '+(r.subl||'')}\nPrice in: ${r.avg==null?'—':r.ccy+' '+fmt(r.avg,d)}   Now: ${r.price==null?'—':r.ccy+' '+fmt(r.price,d)}\nQty: ${fmt(r.units,0)}${r.wallet?'  ('+r.wallet+')':''}\nP&L: ${App.state.hide?'••••':pnlTxt(r)} (${r.pnlPct==null?'—':(r.pnlPct>=0?'+':'')+fmt(r.pnlPct)+'%'})\nValue: ${App.state.hide?'MYR ••••':'MYR '+fmt(r.value)}\nToday: ${r.dayPct==null?'—':(r.dayPct>=0?'+':'')+fmt(r.dayPct)+'%'}\nSector: ${sectorOf(r)}\nIndustry: ${industryOf(r)}`;
  const stats=showStats?`<span class="tm-st" style="font-size:${px(sf)}">
      <span><i>In</i>${r.avg==null?'—':fmt(r.avg,d)}<i class="arr">→</i>${r.price==null?'—':fmt(r.price,d)}</span>
      <span><i>Qty</i>${fmt(r.units,0)}</span>
      <span><i>P&amp;L</i>${pnlTxt(r,w<230)}${r.pnlPct==null||w<175?'':` <b>(${r.pnlPct>=0?'+':''}${fmt(r.pnlPct,w<230?0:1)}%)</b>`}</span></span>`:'';
  return `<button class="tm-tile" style="left:${px(R.x)};top:${px(R.y)};width:${px(w)};height:${px(h)};background:${heat(m,scaleOf())}"
    title="${esc(tip)}" onclick="App.holdings.openStock('${esc(r.ticker)}','${esc(r.market)}')">
    ${show?`<span class="tm-n" style="font-size:${px(fs)}">${esc(name)}</span>`:''}
    ${showPct?`<span class="tm-p" style="font-size:${px(ps)}">${m==null?'—':(m>=0?'+':'')+fmt(m,2)+'%'}</span>`:''}
    ${stats}
  </button>`;
}
function drawNode(n,R,depth,out){
  if(!n.kids){   // leaf group → tiles
    const items=n.items.slice().sort((a,b)=>b.v-a.v);
    squarify(items,R.x,R.y,R.w,R.h);
    items.forEach(r=>out.push(tileHtml(r,r.r)));
    return;
  }
  const kids=n.kids.map(k=>({...k,v:k.a.v})).sort((a,b)=>b.v-a.v);
  squarify(kids,R.x,R.y,R.w,R.h);
  kids.forEach(k=>{
    const r=k.r, hdr=(depth===0?19:15);
    const showHdr=r.h>hdr+14&&r.w>46;
    const zoomable=depth===0&&st.group!=='none';
    out.push(`<div class="tm-grp d${depth}" style="left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(r.h)}">${showHdr?
      `<div class="tm-h" style="height:${hdr}px" ${zoomable?`data-zoom="${esc(k.name)}"`:''} title="${esc(k.name)} · ${k.a.n} stock${k.a.n!==1?'s':''}">
        <span>${esc(k.name)}</span>${r.w>140&&k.a.dayPct!=null&&st.color==='day'?`<em class="${k.a.dayPct>=0?'u':'d'}">${k.a.dayPct>=0?'+':''}${fmt(k.a.dayPct,2)}%</em>`:
        r.w>140&&k.a.pnlPct!=null&&st.color==='pnl'?`<em class="${k.a.pnlPct>=0?'u':'d'}">${k.a.pnlPct>=0?'+':''}${fmt(k.a.pnlPct,1)}%</em>`:''}</div>`:''}</div>`);
    const pad=1, top=showHdr?hdr:pad;
    drawNode(k,{x:r.x+pad,y:r.y+top,w:Math.max(0,r.w-pad*2),h:Math.max(0,r.h-top-pad)},depth+1,out);
  });
}

/* ---------- screen ---------- */
const chipRow=(label,key,opts)=>`<div class="ops-ctl"><span class="ops-lbl">${label}</span><div class="ops-seg">${
  opts.map(o=>`<button class="${st[key]===o.id?'on':''}" data-ops="${key}" data-v="${o.id}">${o.label}</button>`).join('')}</div></div>`;

function legend(){
  const sc=scaleOf(), vals=[-3,-2,-1,0,1,2,3];
  return `<div class="tm-legend">${vals.map(v=>`<span style="background:${heat(v*sc,sc)}">${v>0?'+':''}${v*sc}%</span>`).join('')}</div>`;
}

let lastW=0, ro=null;
App.ops={
  render(el){
    if(!App.state.sharesLoaded){el.innerHTML=`<div class="skel" style="height:420px;border-radius:16px"></div>`;return;}
    const all=rows();
    if(['sector','industry'].includes(st.group))ensure([...new Set(all.map(r=>r.sym))]);
    const T=tree(all);
    let view=T, crumbs='';
    if(st.zoom&&T.kids){const z=T.kids.find(k=>k.name===st.zoom);if(z){view=z.kids?{...z,name:'All',kids:z.kids}:{name:'All',items:z.items,a:z.a,kids:[z]};
      crumbs=`<div class="ops-crumb"><button data-ops="zoom" data-v="">← All ${GROUPS.find(g=>g.id===st.group).label.toLowerCase()}s</button><b>${esc(st.zoom)}</b></div>`;}
      else st.zoom=null;}
    const wide=App.wide();
    const A=T.a;
    const loadingN=all.filter(r=>pending.has(r.sym)).length;

    const kpi=`<div class="grid ops-kpi" style="margin-bottom:14px">
      <div class="stat"><div class="lbl">Holdings shown</div><div class="val">${A.n}</div><div class="sub">${T.kids?T.kids.length+' group'+(T.kids.length!==1?'s':''):'not grouped'}</div></div>
      <div class="stat"><div class="lbl">Market value</div><div class="val">MYR ${fmt(A.value)}</div><div class="sub">USD converted to MYR</div></div>
      <div class="stat"><div class="lbl">Today</div><div class="val">${A.dayPct==null?'—':H.money('MYR',A.dayAmt,true)}</div><div class="sub">${A.dayPct==null?'no prices yet':H.pct(A.dayPct)}</div></div>
      <div class="stat"><div class="lbl">Unrealised P&amp;L</div><div class="val">${A.priced?H.money('MYR',A.pnl,true):'—'}</div><div class="sub">${A.pnlPct==null?'':H.pct(A.pnlPct)+' on cost'}</div></div>
    </div>`;

    const ctl=`<div class="ops-ctls">${chipRow('Group by','group',GROUPS)}${chipRow('Size','size',SIZES)}${chipRow('Colour','color',COLORS)}${chipRow('Market','market',MARKETS)}</div>`;

    const note=(loadingN?`<div class="tiny" style="margin:8px 2px 0">Looking up sector &amp; industry for ${loadingN} stock${loadingN!==1?'s':''}…</div>`:'')+
      (profErr&&['sector','industry'].includes(st.group)?`<div class="notice warn">Couldn't fetch sectors (${esc(profErr)}). Redeploy the <b>stock-analysis</b> Edge Function from <code>mobile/supabase/stock-analysis/index.ts</code>.</div>`:'');

    // table: groups (or the stocks inside a zoomed group)
    let table='';
    if(T.kids){
      const gl=GROUPS.find(g=>g.id===st.group).label;
      const zoomLeaf=st.zoom&&!(view.kids&&view.kids.length&&view.kids[0].kids===null&&st.group==='industry');
      const ent=zoomLeaf
        ?view.items.slice().sort((a,b)=>b.value-a.value).map(r=>({name:r.market==='Bursa'?r.label:r.ticker,sub:r.market==='Bursa'?r.ticker:(r.subl||''),a:agg([r]),
            on:`App.holdings.openStock('${esc(r.ticker)}','${esc(r.market)}')`}))
        :st.group==='industry'&&!st.zoom
        ?(view.kids||[]).flatMap(sec=>(sec.kids||[]).map(g=>({name:g.name,sub:sec.name,a:g.a,
            on:`App.ops.zoom(${JSON.stringify(sec.name).replace(/"/g,'&quot;')})`}))).sort((a,b)=>b.a.value-a.a.value)
        :(view.kids||[]).slice().sort((a,b)=>b.a.value-a.a.value).map(g=>({name:g.name,sub:`${g.a.n} stock${g.a.n!==1?'s':''}`,a:g.a,
            on:st.zoom?null:`App.ops.zoom(${JSON.stringify(g.name).replace(/"/g,'&quot;')})`}));
      const base=st.zoom?(view.a||agg(view.items)):A, tot=base.value||1;
      const indFlat=st.group==='industry'&&!st.zoom;
      const head=zoomLeaf?'Stock':gl;
      const title=zoomLeaf?`Stocks in ${esc(st.zoom)}`:`By ${gl.toLowerCase()}${st.zoom?' · '+esc(st.zoom):''}`;
      const sw=a=>heat(st.color==='day'?a.dayPct:a.pnlPct,scaleOf());
      const amt=v=>H.money('MYR',v,true).replace('MYR ','');
      if(wide){
        table=`<div class="sec"><h2>${title}</h2><span class="note">MYR${zoomLeaf?' · tap a stock to open':st.zoom?'':indFlat?' · tap a row to zoom into its sector':' · tap a row to zoom'}</span></div>`+H.table(
          [{k:'g',label:head},{k:'n',label:zoomLeaf?'Wallet':'Stocks',cls:zoomLeaf?'':'n'},{k:'v',label:'Value',cls:'n'},{k:'w',label:'Weight',cls:'n'},
           {k:'d',label:'Today',cls:'n'},{k:'da',label:'Today MYR',cls:'n'},{k:'p',label:'Unrealised',cls:'n'},{k:'pp',label:'Return',cls:'n'}],
          ent.map(e=>({on:e.on,cells:{
            g:`<span class="ops-sw" style="background:${sw(e.a)}"></span><span class="t-main">${esc(e.name)}</span>${zoomLeaf||indFlat?` <span class="t-sub" style="display:inline">${esc(e.sub)}</span>`:''}`,
            n:zoomLeaf?esc((view.items.find(r=>(r.market==='Bursa'?r.label:r.ticker)===e.name)||{}).wallet||''):e.a.n,
            v:fmt(e.a.value),w:`<span class="ops-bar"><i style="width:${Math.min(100,e.a.value/tot*100)}%"></i></span>${fmt(e.a.value/tot*100,1)}%`,
            d:H.pill(e.a.dayPct),da:e.a.dayPct==null?'—':amt(e.a.dayAmt),
            p:e.a.priced?amt(e.a.pnl):'—',pp:H.pct(e.a.pnlPct)}})),
          {foot:{g:'<b>Total</b>',n:zoomLeaf?'':base.n,v:fmt(base.value),w:'100%',d:H.pill(base.dayPct),da:base.dayPct==null?'—':amt(base.dayAmt),
            p:base.priced?amt(base.pnl):'—',pp:H.pct(base.pnlPct)}});
      }else{
        table=`<div class="sec"><h2>${title}</h2><span class="note">${zoomLeaf?'tap to open':st.zoom?'':'tap to zoom'}</span></div><div class="list">`+
          ent.map(e=>`<button class="lrow" ${e.on?`onclick="${e.on}"`:''}>
            <div class="ico" style="background:${sw(e.a)};color:#fff;font-size:12px">${zoomLeaf?(e.a.dayPct==null?'·':(e.a.dayPct>=0?'▲':'▼')):e.a.n}</div>
            <div class="main-col"><div class="t1">${esc(e.name)}</div><div class="t2">MYR ${fmt(e.a.value)} · ${fmt(e.a.value/tot*100,1)}%${zoomLeaf||indFlat?' · '+esc(e.sub):''}</div></div>
            <div class="end">${H.pill(e.a.dayPct)}<div class="s">${e.a.pnlPct==null?'':'Return '+H.pct(e.a.pnlPct,1)}</div></div></button>`).join('')+`</div>`;
      }
    }

    el.innerHTML=`${kpi}${ctl}${crumbs}<div class="tm-wrap"><div class="tm" id="tm"></div></div>${legend()}${note}${table}
      <div class="tiny" style="margin:16px 2px 0">Tile size = ${SIZES.find(s=>s.id===st.size).label.toLowerCase()} in MYR (USD at today's rate). Colour = ${st.color==='day'?'move vs previous close':'unrealised return on cost'}.
      ${st.group==='wallet'?'':'The same stock held in several wallets is merged into one tile.'} Sector &amp; industry from Yahoo Finance, refreshed every 30 days ·
      <a class="link" href="javascript:App.ops.resetProfiles()">refresh now</a>.</div>`;

    const box=H.$('#tm',el);
    const draw=()=>{
      const w=box.clientWidth; if(!w)return;
      lastW=w;
      const h=wide?Math.max(460,Math.min(680,Math.round(w*0.52))):Math.max(360,Math.round(w*1.05));
      box.style.height=h+'px';
      if(!all.length){box.innerHTML='<div class="tm-empty">No open positions match.</div>';return;}
      const out=[];
      drawNode(view.kids?view:{kids:[view]},{x:0,y:0,w,h},0,out);
      box.innerHTML=out.join('');
      App.applyPrivacy(box);
    };
    draw();
    if(ro)ro.disconnect();
    if(window.ResizeObserver){ro=new ResizeObserver(()=>{if(box.isConnected&&Math.abs(box.clientWidth-lastW)>4)draw();});ro.observe(box);}
  },
  zoom(name){st.zoom=name||null;App.render(false);},
  set(key,v){
    if(key==='zoom'){st.zoom=v||null;}
    else{st[key]=v;if(key==='group'||key==='market')st.zoom=null;save();}
    App.render(false);
  },
  resetProfiles(){prof={};failed.clear();profErr=null;saveProf();App.render(false);},
  profile:sym=>prof[sym]||null
};
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-ops]');
  if(b){App.ops.set(b.dataset.ops,b.dataset.v);return;}
  const z=e.target.closest('[data-zoom]');
  if(z){App.ops.zoom(z.dataset.zoom);}
});
})();
