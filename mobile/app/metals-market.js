/* ===== Market view (shared by Metals and Crypto): price chart, key data, trend snapshot, outlook =====
   Price history: Edge Function "metal-chart" (mobile/supabase/metal-chart/index.ts).
   Outlook: data/<name>-outlook.json on GitHub Pages (edit + push to update — no app rebuild),
            with the copy bundled in the app as a fallback.
   App.makeMarket(cfg) → one market view. cfg: {name, assets()→{label:yahooSymbol}, perUnit (USD price ÷ this → MYR unit),
   usdLbl, myrLbl, unitNote, outlookFile, ratio:{a,b,label,sub}, first} */
(function(){
const H=App.h;
const FXS='USDMYR=X';
const RANGES=[['1M',31],['6M',183],['1Y',366],['2Y',731],['5Y',0]];
const PAGES='https://sarkunan-t.github.io/Portfolio/';
App.makeMarket=function(cfg){
const SYMF=()=>cfg.assets(), OZ=cfg.perUnit||1, NS='App.'+cfg.name;
const K={metal:cfg.first,unit:'usd',range:'1Y',
  h2:null,h2Status:'idle',h2At:0,h2Key:'',h5:null,h5Status:'idle',err:'',outlook:null,outlookStatus:'idle'};

/* ---------- data ---------- */
async function invokeChart(range){
  const call=sb.functions.invoke('metal-chart',{body:{symbols:[...Object.values(SYMF()),FXS],range}});
  const to=new Promise((_,rej)=>setTimeout(()=>rej(new Error('Timed out')),20000));
  const {data,error}=await Promise.race([call,to]);
  if(error){let msg=error.message||String(error);
    try{if(error.context&&error.context.status===404)msg='not-deployed';}catch(e){}
    throw new Error(msg);}
  return data;
}
K.load=async(force)=>{
  if(K.h2Status==='loading')return;
  const key=Object.values(SYMF()).sort().join(',');
  if(!force&&K.h2&&K.h2Key===key&&Date.now()-K.h2At<15*60*1000)return;
  K.h2Key=key;
  K.h2Status='loading';App.refreshView();
  try{K.h2=await invokeChart('2y');K.h2At=Date.now();K.h2Status='ok';
    const s0=Object.values(SYMF())[0];if(!K.h2||!K.h2[s0]||K.h2[s0].error)throw new Error((K.h2&&K.h2[s0]&&K.h2[s0].error)||'No data');}
  catch(e){console.error('metal-chart',e);K.err=e.message;K.h2Status=/not-deployed|not found|404/i.test(e.message)?'missing':'error';}
  K.h5=null;K.h5Status='idle';
  App.refreshView();
};
async function load5y(){
  if(K.h5Status==='loading'||K.h5)return;
  K.h5Status='loading';App.refreshView();
  try{K.h5=await invokeChart('5y');K.h5Status='ok';}catch(e){K.h5Status='error';}
  App.refreshView();
}
K.loadOutlook=async()=>{
  if(K.outlookStatus!=='idle')return;
  K.outlookStatus='loading';
  const get=async url=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),8000);
    try{const r=await fetch(url,{signal:c.signal,cache:'no-store'});if(!r.ok)throw 0;return await r.json();}finally{clearTimeout(t);}};
  const res=await Promise.allSettled([get(PAGES+cfg.outlookFile+'?t='+Date.now()),get(cfg.outlookFile)]);
  const ok=res.filter(r=>r.status==='fulfilled'&&r.value&&(r.value.metals||r.value.assets)).map(r=>r.value);
  K.outlook=ok.sort((a,b)=>String(b.updated).localeCompare(String(a.updated)))[0]||null;
  K.outlookStatus=K.outlook?'ok':'error';App.refreshView();
};

/* ---------- series maths ---------- */
function fxLookup(fxPts){
  let i=0;
  return t=>{while(i+1<fxPts.length&&fxPts[i+1][0]<=t+43200)i++;return fxPts.length?fxPts[i][1]:null;};
}
/* [[tSec, value]] in the chosen unit */
function series(src,metal,unit){
  const s=src&&src[SYMF()[metal]];if(!s||s.error||!s.points)return [];
  if(unit==='usd')return s.points.slice();
  const fx=src[FXS]&&src[FXS].points||[];if(!fx.length)return [];
  const at=fxLookup(fx);
  return s.points.map(([t,c])=>{const r=at(t);return [t,r?c*r/OZ:null];}).filter(p=>p[1]!=null);
}
const DAY=86400;
function valueAtOrBefore(pts,t){let v=null;for(const p of pts){if(p[0]<=t)v=p;else break;}return v;}
function chgSince(pts,days){if(pts.length<2)return null;const last=pts[pts.length-1],base=valueAtOrBefore(pts,last[0]-days*DAY);return base?(last[1]-base[1])/base[1]*100:null;}
function sma(pts,n){if(pts.length<n)return null;let s=0;for(let i=pts.length-n;i<pts.length;i++)s+=pts[i][1];return s/n;}
function vol30(pts){if(pts.length<32)return null;const r=[];for(let i=pts.length-30;i<pts.length;i++)r.push(Math.log(pts[i][1]/pts[i-1][1]));
  const m=r.reduce((a,b)=>a+b,0)/r.length,v=r.reduce((a,b)=>a+(b-m)*(b-m),0)/(r.length-1);return Math.sqrt(v)*Math.sqrt(252)*100;}
function stats(pts){
  if(pts.length<2)return null;
  const last=pts[pts.length-1], prev=pts[pts.length-2], yr=pts.filter(p=>p[0]>=last[0]-365*DAY);
  const hi=yr.reduce((a,p)=>p[1]>a[1]?p:a,yr[0]), lo=yr.reduce((a,p)=>p[1]<a[1]?p:a,yr[0]);
  const all=pts.reduce((a,p)=>p[1]>a[1]?p:a,pts[0]);
  const y0=new Date(last[0]*1000).getFullYear(), ytdBase=valueAtOrBefore(pts,new Date(y0,0,1).getTime()/1000-1);
  return {last,prev,day:(last[1]-prev[1])/prev[1]*100,m1:chgSince(pts,30),m6:chgSince(pts,182),y1:chgSince(pts,365),
    ytd:ytdBase?(last[1]-ytdBase[1])/ytdBase[1]*100:null,hi,lo,pos:hi[1]>lo[1]?(last[1]-lo[1])/(hi[1]-lo[1])*100:null,
    ma50:sma(pts,50),ma200:sma(pts,200),vol:vol30(pts),top:all,off:(last[1]-all[1])/all[1]*100};
}

/* ---------- formatting ---------- */
const unitLbl=u=>u==='usd'?cfg.usdLbl:cfg.myrLbl;
const dp=v=>{const a=Math.abs(v);return a<1?4:a<100?2:a<10000?2:0;};
const money=(v,u)=>v==null?'—':u==='usd'?`US$ ${fmt(v,dp(v))}`:`MYR ${fmt(v,dp(v))}`;
const dLong=t=>new Date(t*1000).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
const pctTxt=v=>v==null||!isFinite(v)?'—':`${v>=0?'+':'−'}${fmt(Math.abs(v),1)}%`;
const pctSpan=v=>v==null||!isFinite(v)?'<span class="dim">—</span>':`<span class="${v>=0?'up':'down'}">${pctTxt(v)}</span>`;

/* ---------- chart (single series: line + soft area, crosshair tooltip) ---------- */
function niceStep(span,n){const raw=span/n,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;return (f<1.5?1:f<3?2:f<7?5:10)*p;}
function chartSVG(pts,u,W){
  const Hh=240,pl=6,pr=62,pt=14,pb=28,w=W-pl-pr,h=Hh-pt-pb;
  let mn=Math.min(...pts.map(p=>p[1])),mx=Math.max(...pts.map(p=>p[1]));
  const padV=(mx-mn)*0.08||mx*0.02;mn-=padV;mx+=padV;
  const step=niceStep(mx-mn,4),y0=Math.ceil(mn/step)*step;
  const dec=step>=1?0:step>=0.1?1:2;
  const t0=pts[0][0],t1=pts[pts.length-1][0];
  const X=t=>pl+(t1===t0?w/2:(t-t0)/(t1-t0)*w), Y=v=>pt+(1-(v-mn)/(mx-mn))*h;
  const line=pts.map((p,i)=>`${i?'L':'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const area=`${line}L${X(t1).toFixed(1)},${pt+h}L${X(t0).toFixed(1)},${pt+h}Z`;
  let grid='';
  for(let v=y0;v<=mx;v+=step){const y=Y(v).toFixed(1);
    grid+=`<line x1="${pl}" x2="${pl+w}" y1="${y}" y2="${y}" stroke="#e7efee" stroke-width="1"/>`+
      `<text x="${pl+w+8}" y="${+y+4}" font-size="11" fill="#67807c">${fmt(v,dec)}</text>`;}
  const span=t1-t0, fmtX=t=>new Date(t*1000).toLocaleDateString('en-GB',span<100*DAY?{day:'2-digit',month:'short'}:{month:'short',year:'2-digit'});
  let xl='';for(let i=0;i<4;i++){const t=t0+span*(i+0.5)/4;xl+=`<text x="${X(t).toFixed(1)}" y="${Hh-8}" font-size="11" fill="#67807c" text-anchor="middle">${fmtX(t)}</text>`;}
  const last=pts[pts.length-1];
  return `<svg class="mchart-svg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" aria-label="Price chart">
    <defs><linearGradient id="mcFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0aa79f" stop-opacity=".18"/><stop offset="1" stop-color="#0aa79f" stop-opacity="0"/></linearGradient></defs>
    ${grid}<line x1="${pl}" x2="${pl+w}" y1="${pt+h}" y2="${pt+h}" stroke="#d6e1df"/>
    <path d="${area}" fill="url(#mcFill)"/><path d="${line}" fill="none" stroke="#0aa79f" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="4" fill="#0aa79f" stroke="#fff" stroke-width="2"/>
    ${xl}
    <g class="mc-x" style="display:none"><line y1="${pt}" y2="${pt+h}" stroke="#34504c" stroke-width="1" stroke-dasharray="3 3"/><circle r="5" fill="#0aa79f" stroke="#fff" stroke-width="2"/></g>
    <rect x="${pl}" y="${pt}" width="${w}" height="${h}" fill="transparent" class="mc-hit"/>
  </svg>`;
}
function bindChart(wrap,pts,u,W){
  const svg=wrap.querySelector('svg'),g=svg.querySelector('.mc-x'),tip=wrap.querySelector('.mc-tip'),hit=svg.querySelector('.mc-hit');
  const pl=6,pr=62,pt=14,pb=28,w=W-pl-pr,h=240-pt-pb;
  let mn=Math.min(...pts.map(p=>p[1])),mx=Math.max(...pts.map(p=>p[1]));const padV=(mx-mn)*0.08||mx*0.02;mn-=padV;mx+=padV;
  const t0=pts[0][0],t1=pts[pts.length-1][0],X=t=>pl+(t-t0)/((t1-t0)||1)*w,Y=v=>pt+(1-(v-mn)/(mx-mn))*h;
  const show=e=>{
    const r=svg.getBoundingClientRect(),sx=(e.clientX-r.left)*W/r.width,t=t0+(sx-pl)/w*(t1-t0);
    let lo=0,hi=pts.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(pts[m][0]<t)lo=m;else hi=m;}
    const p=Math.abs(pts[lo][0]-t)<Math.abs(pts[hi][0]-t)?pts[lo]:pts[hi],x=X(p[0]),y=Y(p[1]);
    g.style.display='';g.querySelector('line').setAttribute('x1',x);g.querySelector('line').setAttribute('x2',x);
    g.querySelector('circle').setAttribute('cx',x);g.querySelector('circle').setAttribute('cy',y);
    tip.innerHTML=`<b>${money(p[1],u)}</b><span>${dLong(p[0])}</span>`;tip.hidden=false;
    const px=x/W*r.width;tip.style.left=Math.min(Math.max(px-tip.offsetWidth/2,0),r.width-tip.offsetWidth)+'px';
  };
  const hide=()=>{g.style.display='none';tip.hidden=true;};
  hit.addEventListener('pointerdown',show);hit.addEventListener('pointermove',show);
  hit.addEventListener('pointerleave',hide);hit.addEventListener('pointercancel',hide);
}

/* ---------- trend snapshot (computed, not a forecast) ---------- */
function signals(st,u){
  const out=[],last=st.last[1];
  if(st.ma200!=null)out.push(last>=st.ma200?['up',`Above its 200-day average (${money(st.ma200,u)}) — long-term trend is up`]:['down',`Below its 200-day average (${money(st.ma200,u)}) — long-term trend has turned down`]);
  if(st.ma50!=null&&st.ma200!=null)out.push(st.ma50>=st.ma200?['up','50-day average is above the 200-day — medium-term trend still positive']:['down','50-day average is below the 200-day — medium-term trend has weakened']);
  if(st.m1!=null)out.push([st.m1>=0?'up':'down',`${pctTxt(st.m1)} over the last month`]);
  if(st.pos!=null)out.push(['flat',st.pos>=80?`Near the top of its 52-week range (${fmt(st.pos,0)}%)`:st.pos<=20?`Near the bottom of its 52-week range (${fmt(st.pos,0)}%)`:`Mid-range: ${fmt(st.pos,0)}% of the way from the 52-week low to the high`]);
  if(st.off<-0.5)out.push(['flat',`${fmt(Math.abs(st.off),1)}% below its 2-year high of ${money(st.top[1],u)} (${dLong(st.top[0])})`]);
  else out.push(['up','At or near its 2-year high']);
  if(st.vol!=null)out.push(['flat',`30-day volatility ${fmt(st.vol,0)}% a year${st.vol>35?' — unusually choppy':st.vol<15?' — calm':''}`]);
  return out;
}

/* ---------- outlook ---------- */
function outlookCard(metal){
  if(K.outlookStatus==='loading'||K.outlookStatus==='idle')return App.skeleton(2);
  const src=K.outlook&&(K.outlook.metals||K.outlook.assets);const o=src&&src[metal];
  if(!o)return `<div class="card muted-card"><div class="tiny">${K.outlook?'No analyst summary for '+H.esc(metal)+' yet — ask Claude to add one.':'No outlook available offline.'}</div></div>`;
  const li=(arr,cls,mark)=>arr&&arr.length?`<ul class="olist">${arr.map(x=>`<li><span class="${cls}">${mark}</span>${H.esc(x)}</li>`).join('')}</ul>`:'';
  return `<div class="card">
    <div class="t-head">${H.esc(o.headline)}</div>
    ${o.context?`<p class="sub" style="margin-top:6px;font-size:13.5px;line-height:1.5">${H.esc(o.context)}</p>`:''}
    <div class="ogrid">
      <div><div class="form-sec" style="margin-top:12px">Supporting the price</div>${li(o.supportive,'up','▲')}</div>
      <div><div class="form-sec" style="margin-top:12px">Holding it back</div>${li(o.headwinds,'down','▼')}</div>
    </div>
    ${o.forecasts&&o.forecasts.length?`<div class="form-sec" style="margin-top:12px">Published forecasts</div>
      ${o.forecasts.map(f=>`<div class="kv"><span>${H.esc(f.who)} <span class="dim" style="font-weight:600">· ${H.esc(f.when)}</span></span><span>${H.esc(f.view)}</span></div>`).join('')}`:''}
    ${o.watch&&o.watch.length?`<div class="form-sec" style="margin-top:12px">What to watch</div><div class="chips">${o.watch.map(w=>`<span class="chip" style="height:30px;font-size:12.5px">${H.esc(w)}</span>`).join('')}</div>`:''}
    ${o.sources&&o.sources.length?`<div class="form-sec" style="margin-top:12px">Sources</div>${o.sources.map(s=>`<a class="src" href="${H.esc(s.url)}" target="_blank" rel="noopener">${H.esc(s.name)} ↗</a>`).join('')}`:''}
    <div class="tiny" style="margin-top:12px">Updated ${H.date(K.outlook.updated)}. ${H.esc(K.outlook.note||'')}</div>
  </div>`;
}

/* ---------- render ---------- */
K.render=el=>{
  K.load();K.loadOutlook();
  const opt=(name,items,val)=>`<div class="opts" data-mk="${name}">${items.map(([v,l])=>`<button type="button" data-v="${v}" class="${v===val?'on':''}">${l}</button>`).join('')}</div>`;
  if(!SYMF()[K.metal])K.metal=Object.keys(SYMF())[0];
  let html=opt('metal',Object.keys(SYMF()).map(m=>[m,m]),K.metal)+
    `<div class="mk-bar">${opt('unit',[['usd',cfg.usdLbl],['myr',cfg.myrLbl]],K.unit)}
      <div class="chips mk-range">${RANGES.map(([r])=>`<button class="chip ${K.range===r?'on':''}" data-mkr="${r}">${r}</button>`).join('')}</div></div>`;

  if(K.h2Status==='missing'){
    html+=`<div class="card" style="margin-top:12px"><div class="val">One-time setup: price history</div>
      <p class="sub" style="margin-top:8px;font-size:14px">Charts need the <b>metal-chart</b> function in Supabase. Supabase → Edge Functions → Deploy a new function → Via editor → name it <b>metal-chart</b> → paste <b>mobile/supabase/metal-chart/index.ts</b> → Deploy. Then tap Retry.</p>
      <button class="btn btn-p" style="width:100%;margin-top:14px" onclick="${NS}.load(true)">Retry</button></div>`;
  }else if(K.h2Status==='error'){
    html+=`<div class="notice warn">Couldn't load price history: ${H.esc(K.err)}</div><button class="btn btn-s" style="width:100%;margin-top:10px" onclick="${NS}.load(true)">Retry</button>`;
  }else if(K.h2Status!=='ok'){
    html+=`<div class="skel" style="height:300px;border-radius:16px;margin-top:12px"></div>`+App.skeleton(3);
  }else{
    const full=series(K.h2,K.metal,K.unit), st=stats(full);
    let pts;
    if(K.range==='5Y'){load5y();pts=K.h5?series(K.h5,K.metal,K.unit):null;}
    else{const days=RANGES.find(r=>r[0]===K.range)[1],cut=full.length?full[full.length-1][0]-days*DAY:0;pts=full.filter(p=>p[0]>=cut);}
    const rc=pts&&pts.length>1?(pts[pts.length-1][1]-pts[0][1])/pts[0][1]*100:null;
    html+=`<div class="card mchart" style="margin-top:12px">
      <div class="dhead"><div><div class="lbl">${K.metal} · ${unitLbl(K.unit)}${K.unit==='myr'?cfg.unitNote||'':''}</div>
        <div class="dprice">${st?money(st.last[1],K.unit):'—'}</div>
        <div class="sub">${st?`as of ${dLong(st.last[0])}`:''}</div></div>
        <div style="text-align:right">${H.pill(st?st.day:null)}<div class="sub" style="margin-top:6px">${K.range}: ${pctSpan(rc)}</div></div></div>
      <div class="mc-wrap">${pts&&pts.length>1?'':`<div class="skel" style="height:240px;border-radius:12px"></div>`}<div class="mc-tip" hidden></div></div>
    </div>`;
    if(st){
      const tile=(l,v,s='')=>`<div class="stat"><div class="lbl">${l}</div><div class="val">${v}</div><div class="sub">${s||'&nbsp;'}</div></div>`;
      const g=cfg.ratio?series(K.h2,cfg.ratio.a,'usd'):[],s=cfg.ratio?series(K.h2,cfg.ratio.b,'usd'):[];
      const ratio=g.length&&s.length?g[g.length-1][1]/s[s.length-1][1]:null;
      html+=`<div class="sec"><h2>Key data</h2><span class="note">${unitLbl(K.unit)}</span></div><div class="grid g3">
        ${tile('1 month',pctSpan(st.m1))}${tile('Year to date',pctSpan(st.ytd))}${tile('1 year',pctSpan(st.y1))}
        ${tile('52-week high',money(st.hi[1],K.unit),dLong(st.hi[0]))}${tile('52-week low',money(st.lo[1],K.unit),dLong(st.lo[0]))}
        ${tile('Position in 52-wk range',st.pos==null?'—':`${fmt(st.pos,0)}%`,`<span class="rbar"><i style="left:${Math.max(0,Math.min(100,st.pos||0))}%"></i></span>`)}
        ${tile('50-day average',money(st.ma50,K.unit),st.ma50?`price ${pctTxt((st.last[1]-st.ma50)/st.ma50*100)} vs avg`:'')}
        ${tile('200-day average',money(st.ma200,K.unit),st.ma200?`price ${pctTxt((st.last[1]-st.ma200)/st.ma200*100)} vs avg`:'')}
        ${cfg.ratio&&(K.metal===cfg.ratio.a||K.metal===cfg.ratio.b)&&ratio?tile(cfg.ratio.label,fmt(ratio,cfg.ratio.dp||1),cfg.ratio.sub):tile('30-day volatility',st.vol==null?'—':`${fmt(st.vol,0)}%`,'annualised')}
      </div>
      <div class="sec"><h2>Trend snapshot</h2><span class="note">from the price data</span></div>
      <div class="card"><ul class="olist sig">${signals(st,K.unit).map(([c,t])=>`<li><span class="${c}">${c==='up'?'▲':c==='down'?'▼':'•'}</span>${H.esc(t)}</li>`).join('')}</ul>
        <div class="tiny" style="margin-top:8px">Calculated automatically from daily closing prices. Describes what has happened, not what will.</div></div>`;
      // table view of the chart (accessibility / exact numbers): month-end closes in range
      if(pts&&pts.length>1){
        const byM=new Map();pts.forEach(p=>byM.set(new Date(p[0]*1000).toISOString().slice(0,7),p));
        const rows=[...byM.values()].reverse().slice(0,24);
        html+=`<details class="card mk-table"><summary>Price table · month-end closes</summary>
          ${rows.map((p,i)=>{const nx=rows[i+1];return `<div class="kv"><span>${new Date(p[0]*1000).toLocaleDateString('en-GB',{month:'short',year:'numeric'})}</span><span>${money(p[1],K.unit)} ${nx?pctSpan((p[1]-nx[1])/nx[1]*100):''}</span></div>`;}).join('')}</details>`;
      }
    }
    el.__mkPts=pts;
  }
  html+=`<div class="sec"><h2>${K.metal} outlook</h2><span class="note">analyst views</span></div>${outlookCard(K.metal)}`;
  return html;
};
/* called after the HTML is in the page: draw the chart at the real width + bind controls */
K.after=el=>{
  el.querySelectorAll('.opts[data-mk]').forEach(g=>g.addEventListener('click',e=>{
    const b=e.target.closest('button[data-v]');if(!b)return;K[g.dataset.mk]=b.dataset.v;App.render(false);}));
  el.querySelectorAll('[data-mkr]').forEach(b=>b.onclick=()=>{K.range=b.dataset.mkr;App.render(false);});
  const wrap=el.querySelector('.mc-wrap'),pts=el.__mkPts;
  if(wrap&&pts&&pts.length>1){
    const W=Math.max(280,Math.round(wrap.clientWidth||600));
    wrap.insertAdjacentHTML('afterbegin',chartSVG(pts,K.unit,W));
    bindChart(wrap,pts,K.unit,W);
  }
};
return K;
};
const OZ_=31.1034768;
App.metalsMarket=App.makeMarket({name:'metalsMarket',first:'Gold',
  assets:()=>({Gold:'GC=F',Silver:'SI=F',Platinum:'PL=F',Palladium:'PA=F'}),perUnit:OZ_,usdLbl:'US$/oz',myrLbl:'MYR/g',unitNote:' · pure',
  outlookFile:'data/metals-outlook.json',ratio:{a:'Gold',b:'Silver',label:'Gold / silver ratio',sub:'oz of silver per oz of gold'}});
})();
