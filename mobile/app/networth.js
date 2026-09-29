/* ===== Home → Trend & health =====
   Net worth history rebuilt from your own records: for every day since the first trade,
   units held (transactions) × that day's closing price (+ USD→MYR at that day's rate),
   plus metals (pure grams × futures price → MYR/g). Prices come from the "metal-chart"
   Edge Function (Yahoo daily closes). Today's point uses the live prices the app already has.
   Net worth here = shares + metals at market value (same as the Home hero). Cash is not included. */
(function(){
const H=App.h, C=App.calc, OZ=31.1034768, DAYMS=86400000;
const METAL_SYM={Gold:'GC=F',Silver:'SI=F',Platinum:'PL=F',Palladium:'PA=F'};
const FXS='USDMYR=X';
const PAL=['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#4a3aa7','#e34948'];  // categorical, fixed order
const NW_COL='#0b6e69', COST_COL='#8aa19e', MAX_ON=8;
const GRAN=[
  ['day','Day',90],['week','Week',52],['month','Month',36],['quarter','Quarter',40],['half','Half-year',30],['year','Year',50]];
/* RAG thresholds — edit here to tune */
const RULE={lossRed:-20,lossAmber:-8,trend3mRed:-15,drawAmber:20,weightAmber:25,nwPerfRed:-10,nwPerfAmber:0,nwDrawAmber:10};

const N=App.nw={hist:null,status:'idle',err:'',at:0,gran:'month',mode:'value',on:['nw','cost'],color:{}};
App.state.seg.home=App.state.seg.home||'overview';

/* ---------- load price history ---------- */
N.load=async force=>{
  if(N.status==='loading')return;
  if(!force&&N.hist&&Date.now()-N.at<30*60*1000)return;
  if(!App.state.sharesLoaded||App.classes().some(c=>c.m.status==='loading'))return;
  const syms=new Set([FXS]);let first=null;
  transactions.forEach(t=>{syms.add(toYahoo(t));if(!first||t.tx_date<first)first=t.tx_date;});
  ((App.metals&&App.metals.rows)||[]).forEach(r=>{if(METAL_SYM[r.metal])syms.add(METAL_SYM[r.metal]);if(!first||r.txn_date<first)first=r.txn_date;});
  ((App.crypto&&App.crypto.rows)||[]).forEach(r=>{syms.add(App.crypto.sym(r.coin));if(!first||r.txn_date<first)first=r.txn_date;});
  ((App.asnb&&App.asnb.rows)||[]).forEach(r=>{if(!first||r.txn_date<first)first=r.txn_date;});
  if(!first){N.status='empty';App.refreshView();return;}
  N.status='loading';App.refreshView();
  try{
    const from=Math.floor(new Date(first+'T00:00:00Z').getTime()/1000)-14*86400;
    const call=sb.functions.invoke('metal-chart',{body:{symbols:[...syms],from}});
    const to=new Promise((_,rej)=>setTimeout(()=>rej(new Error('Timed out — try again')),60000));
    const {data,error}=await Promise.race([call,to]);
    if(error){
      let msg=error.message||String(error),st=0;
      try{st=error.context.status;const b=await error.context.json();if(b&&b.error)msg=b.error;}catch(e){}
      if(st===404)msg='not-deployed';
      throw new Error(msg);
    }
    if(data&&data.error)throw new Error(data.error);
    N.hist=data||{};N.at=Date.now();N.status='ok';
  }catch(e){
    console.error('networth history',e);N.err=e.message;
    N.status=/not-deployed/.test(N.err)?'missing':/No supported symbols|No valid symbols|Unsupported range/i.test(N.err)?'outdated':'error';
  }
  App.refreshView();
};

/* ---------- build the daily timeline ---------- */
const dkey=t=>new Date(t*1000+8*3600*1000).toISOString().slice(0,10);     // Malaysia date of a price bar
const todayKey=()=>H.today();
function priceMap(sym){const s=N.hist&&N.hist[sym];if(!s||s.error||!s.points)return null;const m=new Map();s.points.forEach(([t,c])=>m.set(dkey(t),c));return m;}
function days(from,to){const out=[];let d=new Date(from+'T00:00:00Z');const end=new Date(to+'T00:00:00Z');while(d<=end){out.push(d.toISOString().slice(0,10));d=new Date(d.getTime()+DAYMS);}return out;}

let memo=null,memoKey='';
N.build=()=>{
  const k=[N.at,transactions.length,transactions.reduce((a,t)=>a+(Number(t.quantity)||0),0),((App.metals&&App.metals.rows)||[]).length,((App.crypto&&App.crypto.rows)||[]).length,((App.asnb&&App.asnb.rows)||[]).length,((App.asnb&&App.asnb.rows)||[]).reduce((a,r)=>a+(Number(r.units)||0)+(Number(r.nav)||0),0),
    App.crypto&&App.crypto.spotAt?App.crypto.spotAt.getTime():0,App.state.pricesAt?App.state.pricesAt.getTime():0,App.metals&&App.metals.spotAt?App.metals.spotAt.getTime():0,H.fx()||0,H.today()].join('|');
  if(memo&&memoKey===k)return memo;
  memoKey=k;memo=buildTimeline();return memo;
};
function buildTimeline(){
  const mrows=(App.metals&&App.metals.rows)||[];
  const crows=(App.crypto&&App.crypto.rows)||[],arows=(App.asnb&&App.asnb.rows)||[];
  const firsts=[...transactions.map(t=>t.tx_date),...mrows.map(r=>r.txn_date),...crows.map(r=>r.txn_date),...arows.map(r=>r.txn_date)].filter(Boolean).sort();
  if(!firsts.length)return null;
  const D=days(firsts[0],todayKey()), n=D.length, today=D[n-1];
  const fxM=priceMap(FXS); let fx=null;
  if(fxM){const f=N.hist[FXS].points[0];fx=f?f[1]:null;}
  if(!fx)fx=H.fx()||4.4;
  // stocks
  const byT={};
  transactions.forEach(t=>{const k=t.ticker+'|'+t.market;(byT[k]=byT[k]||[]).push(t);});
  const stocks=Object.entries(byT).map(([k,list])=>{
    list.sort((a,b)=>String(a.tx_date).localeCompare(String(b.tx_date))||((a.tx_type==='Buy'?0:1)-(b.tx_type==='Buy'?0:1)));
    const t0=list[0], sym=toYahoo(t0);
    return {id:'s:'+k,kind:'stock',ticker:t0.ticker,market:t0.market,sym,usd:t0.market!=='Bursa'||t0.currency==='USD',
      label:H.stockLabel(t0.ticker,t0.market,t0.company_name),ev:list,i:0,qty:0,cost:0,costM:0,px:null,pm:priceMap(sym),v:new Array(n).fill(null)};
  });
  // metals
  const byM={};
  mrows.forEach(r=>{(byM[r.metal]=byM[r.metal]||[]).push(r);});
  const metals=Object.entries(byM).map(([m,list])=>{
    list.sort((a,b)=>String(a.txn_date).localeCompare(String(b.txn_date))||String(a.created_at).localeCompare(String(b.created_at)));
    return {id:'m:'+m,kind:'metal',metal:m,label:m,ev:list,i:0,pure:0,cost:0,pxUsdOz:null,pm:METAL_SYM[m]?priceMap(METAL_SYM[m]):null,v:new Array(n).fill(null)};
  });
  const fxArr=new Array(n);
  const S={nw:new Array(n).fill(null),cost:new Array(n).fill(null),shares:new Array(n).fill(null),metals:new Array(n).fill(null)};
  for(let di=0;di<n;di++){
    const d=D[di];
    if(fxM&&fxM.has(d))fx=fxM.get(d);
    const fxNow=di===n-1&&H.fx()?H.fx():fx;fxArr[di]=fxNow;
    let sh=0,me=0,co=0,any=false;
    stocks.forEach(s=>{
      while(s.i<s.ev.length&&s.ev[s.i].tx_date<=d){
        const t=s.ev[s.i++],q=Number(t.quantity)||0,net=Number(t.net_amount)||0;
        if(t.tx_type==='Buy'){s.qty+=q;s.cost+=net;s.costM+=net*(s.usd?fx:1);}          // MYR cost fixed at the trade-date rate
        else{const held=Math.max(s.qty,0),cov=Math.min(q,held),frac=held>0?cov/held:0;s.cost-=s.cost*frac;s.costM-=s.costM*frac;s.qty=Math.max(held-q,0);if(s.qty<=1e-9){s.qty=0;s.cost=0;s.costM=0;}}
        if(s.px==null)s.px=Number(t.price)||null;
      }
      if(s.pm&&s.pm.has(d))s.px=s.pm.get(d);
      if(di===n-1){const q=C.quote(s.sym);if(q&&q.price)s.px=q.price;}
      if(s.qty>1e-6&&s.px!=null){const r=s.usd?fxNow:1;s.v[di]=s.qty*s.px*r;sh+=s.v[di];co+=s.costM;any=true;}
    });
    metals.forEach(m=>{
      while(m.i<m.ev.length&&m.ev[m.i].txn_date<=d){
        const r=m.ev[m.i++],pure=(Number(r.weight_g)||0)*(Number(r.purity)||1),amt=Number(r.amount_myr)||0;
        if(r.tx_type==='Sell'){const avg=m.pure>0?m.cost/m.pure:0,take=Math.min(pure,m.pure);m.cost-=avg*take;m.pure-=take;}
        else{m.pure+=pure;m.cost+=amt;}
        if(m.pxUsdOz==null&&pure>0&&amt>0)m.pxUsdOz=amt/pure*OZ/fx;          // until a market price exists, value at what was paid
      }
      if(m.pm&&m.pm.has(d))m.pxUsdOz=m.pm.get(d);
      if(di===n-1&&App.metals){const g=App.metals.spotG(m.metal);if(g){m.pxUsdOz=g/fxNow*OZ;}}
      if(m.pure>1e-6&&m.pxUsdOz!=null){m.v[di]=m.pure*m.pxUsdOz*fxNow/OZ;me+=m.v[di];co+=m.cost;any=true;}
    });
    if(any){S.shares[di]=sh>0?sh:null;S.metals[di]=me>0?me:null;S.nw[di]=sh+me;S.cost[di]=co;}
  }
  // crypto — quantity × daily close (COIN-USD) × that day's USD/MYR
  const chron=(rows)=>[...rows].sort((a,b)=>String(a.txn_date).localeCompare(String(b.txn_date))||String(a.created_at).localeCompare(String(b.created_at)));
  const byC={};chron(crows).forEach(r=>{(byC[r.coin]=byC[r.coin]||[]).push(r);});
  const coins=Object.entries(byC).map(([c,ev])=>({id:'c:'+c,kind:'crypto',coin:c,label:c,ev,i:0,qty:0,cost:0,px:null,pm:priceMap(App.crypto.sym(c)),v:new Array(n).fill(null),cv:new Array(n).fill(null)}));
  // ASNB — units × price per unit (RM1.00 for fixed-price funds; last recorded price for others)
  const byA={};chron(arows).forEach(r=>{(byA[r.fund]=byA[r.fund]||[]).push(r);});
  const funds=Object.entries(byA).map(([f,ev])=>({id:'a:'+f,kind:'asnb',fund:f,label:f,ev,i:0,p:App.asnb.newPos(f),v:new Array(n).fill(null),cv:new Array(n).fill(null)}));
  S.crypto=new Array(n).fill(null);S.asnb=new Array(n).fill(null);
  for(let di=0;di<n;di++){
    const d=D[di],fxd=fxArr[di];let cs=null,cc=0,as=null,ac=0;
    coins.forEach(k=>{
      while(k.i<k.ev.length&&k.ev[k.i].txn_date<=d){const r=k.ev[k.i++],q=Number(r.quantity)||0,amt=Number(r.amount_myr)||0;
        if(r.tx_type==='Sell'){const avg=k.qty>0?k.cost/k.qty:0,take=Math.min(q,k.qty);k.cost-=avg*take;k.qty-=take;}else{k.qty+=q;k.cost+=amt;}
        if(k.px==null&&q>0&&amt>0)k.px=amt/q/fxd;}
      if(k.pm&&k.pm.has(d))k.px=k.pm.get(d);
      if(di===n-1){const m=App.crypto.priceMyr(k.coin);if(m)k.px=m/fxd;}
      if(k.qty>1e-12&&k.px!=null){k.v[di]=k.qty*k.px*fxd;cs=(cs||0)+k.v[di];cc+=k.cost;}
    });
    funds.forEach(f=>{
      while(f.i<f.ev.length&&f.ev[f.i].txn_date<=d)App.asnb.apply(f.p,f.ev[f.i++]);
      const nav=f.p.fixed?1:f.p.nav;
      if(f.p.units>1e-9&&nav){f.v[di]=f.p.units*nav;as=(as||0)+f.v[di];ac+=f.p.cost;}
    });
    S.crypto[di]=cs;S.asnb[di]=as;
    if(cs!=null||as!=null){S.nw[di]=(S.nw[di]||0)+(cs||0)+(as||0);S.cost[di]=(S.cost[di]||0)+cc+ac;}
  }
  const holdings=[...stocks,...metals,...coins,...funds];
  holdings.forEach(h=>{h.active=h.v[n-1]!=null&&h.v[n-1]>0;});
  return {D,S,holdings,hasMetals:metals.length>0,hasCrypto:coins.length>0,hasAsnb:funds.length>0};
}

/* ---------- periods ---------- */
function bucketKey(d,g){
  const y=d.slice(0,4),m=+d.slice(5,7);
  if(g==='day')return d;
  if(g==='week'){const t=new Date(d+'T00:00:00Z'),dow=(t.getUTCDay()+6)%7;return new Date(t.getTime()-dow*DAYMS).toISOString().slice(0,10);}
  if(g==='month')return d.slice(0,7);
  if(g==='quarter')return y+'-Q'+Math.ceil(m/3);
  if(g==='half')return y+'-H'+(m<=6?1:2);
  return y;
}
function bucketLabel(k,g,end){
  if(g==='day')return new Date(k+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
  if(g==='week')return 'w/c '+new Date(k+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
  if(g==='month')return new Date(k+'-01T00:00:00').toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
  if(g==='quarter')return k.slice(5)+' '+k.slice(2,4);
  if(g==='half')return k.slice(5)+' '+k.slice(2,4);
  return k;
}
function periods(tl,g){
  const lim=GRAN.find(x=>x[0]===g)[2], idx=[], keys=[];
  let first=tl.S.nw.findIndex(v=>v!=null);if(first<0)return {idx:[],keys:[]};
  for(let i=first;i<tl.D.length;i++){const k=bucketKey(tl.D[i],g);if(keys[keys.length-1]===k)idx[idx.length-1]=i;else{keys.push(k);idx.push(i);}}
  return {idx:idx.slice(-lim),keys:keys.slice(-lim)};
}

/* ---------- series catalogue & colours ---------- */
function catalogue(tl){
  const list=[{id:'nw',label:'Net worth',grp:'t'},{id:'cost',label:'Money invested',grp:'t'},{id:'shares',label:'Shares',grp:'t'}];
  if(tl.hasMetals)list.push({id:'metals',label:'Metals',grp:'t'});
  if(tl.hasCrypto)list.push({id:'crypto',label:'Crypto',grp:'t'});
  if(tl.hasAsnb)list.push({id:'asnb',label:'ASNB',grp:'t'});
  tl.holdings.filter(h=>h.active).sort((a,b)=>b.v[b.v.length-1]-a.v[a.v.length-1]).forEach(h=>list.push({id:h.id,label:h.label,grp:'h',h}));
  return list;
}
const colorOf=id=>id==='nw'?NW_COL:id==='cost'?COST_COL:N.color[id]||'#67807c';
function toggle(id,cat){
  const i=N.on.indexOf(id);
  if(i>=0){N.on.splice(i,1);delete N.color[id];}
  else{
    if(N.on.length>=MAX_ON){showToast(`Up to ${MAX_ON} lines at once — switch one off first`);return;}
    N.on.push(id);
    if(id!=='nw'&&id!=='cost'){const used=new Set(Object.values(N.color));N.color[id]=PAL.find(c=>!used.has(c))||PAL[0];}
  }
  App.render(false);
}
function seriesVals(tl,id){if(tl.S[id])return tl.S[id];const h=tl.holdings.find(x=>x.id===id);return h?h.v:[];}

/* ---------- chart ---------- */
const kfmt=v=>{const a=Math.abs(v),s=v<0?'−':'';return a>=1e6?s+(a/1e6).toFixed(a>=1e7?1:2)+'M':a>=1e3?s+(a/1e3).toFixed(a>=1e5?0:1)+'k':s+fmt(a,0);};
function niceStep(span,n){const raw=span/n||1,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;return (f<1.5?1:f<3?2:f<7?5:10)*p;}
function chart(el,tl,P,cat){
  const wrap=el.querySelector('.nw-wrap');if(!wrap)return;
  const W=Math.max(300,Math.round(wrap.clientWidth||640)),Hh=280,pl=8,pr=58,pt=16,pb=30,w=W-pl-pr,h=Hh-pt-pb,n=P.idx.length;
  const on=N.on.filter(id=>cat.some(c=>c.id===id));
  const data=on.map(id=>{
    const raw=seriesVals(tl,id), vals=P.idx.map(i=>raw[i]);
    if(N.mode==='pct'){const b=vals.find(v=>v!=null&&v!==0);return {id,vals:vals.map(v=>v==null||!b?null:(v/b-1)*100)};}
    return {id,vals};
  });
  const all=data.flatMap(d=>d.vals).filter(v=>v!=null);
  if(!all.length||n<2){wrap.innerHTML='<div class="empty">Not enough history for this view yet.</div>';return;}
  let mn=Math.min(...all),mx=Math.max(...all);
  if(N.mode==='value')mn=Math.min(mn,0)>=0?Math.max(0,mn-(mx-mn)*0.1):mn;
  const pad=(mx-mn)*0.06||Math.abs(mx)*0.05||1;mn-=pad;mx+=pad;if(N.mode==='value'&&mn<0&&Math.min(...all)>=0)mn=0;
  const step=niceStep(mx-mn,4),X=i=>pl+(n===1?w/2:i/(n-1)*w),Y=v=>pt+(1-(v-mn)/(mx-mn))*h;
  const hide=App.state.hide&&N.mode==='value';
  let g='';
  for(let v=Math.ceil(mn/step)*step;v<=mx+1e-9;v+=step){const y=Y(v).toFixed(1);
    g+=`<line x1="${pl}" x2="${pl+w}" y1="${y}" y2="${y}" stroke="${Math.abs(v)<1e-9&&N.mode==='pct'?'#b9cac7':'#e7efee'}"/>`+
      `<text x="${pl+w+8}" y="${+y+4}" font-size="11" fill="#67807c">${hide?'•••':N.mode==='pct'?(v>0?'+':'')+fmt(v,step<1?1:0)+'%':kfmt(v)}</text>`;}
  const nt=Math.min(n,W<500?4:6);let xl='';
  for(let j=0;j<nt;j++){const i=Math.round(j*(n-1)/Math.max(1,nt-1));xl+=`<text x="${X(i).toFixed(1)}" y="${Hh-9}" font-size="11" fill="#67807c" text-anchor="${j===0?'start':j===nt-1?'end':'middle'}">${bucketLabel(P.keys[i],N.gran)}</text>`;}
  const paths=data.map(d=>{
    let p='',pen=false;d.vals.forEach((v,i)=>{if(v==null){pen=false;return;}p+=`${pen?'L':'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;pen=true;});
    const col=colorOf(d.id),wid=d.id==='nw'?3:2,dash=d.id==='cost'?' stroke-dasharray="6 4"':'';
    const li=d.vals.length-1-[...d.vals].reverse().findIndex(v=>v!=null);
    const end=li>=0&&li<d.vals.length?`<circle cx="${X(li).toFixed(1)}" cy="${Y(d.vals[li]).toFixed(1)}" r="${d.id==='nw'?4.5:3.5}" fill="${col}" stroke="#fff" stroke-width="2"/>`:'';
    return `<path d="${p}" fill="none" stroke="${col}" stroke-width="${wid}" stroke-linejoin="round" stroke-linecap="round"${dash}/>${end}`;
  }).join('');
  const area=(()=>{const d=data.find(x=>x.id==='nw');if(!d||N.mode!=='value')return '';let p='',s=null,e=null;
    d.vals.forEach((v,i)=>{if(v==null)return;if(s==null)s=i;e=i;p+=`${p?'L':'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;});
    return s==null?'':`<path d="${p}L${X(e).toFixed(1)},${pt+h}L${X(s).toFixed(1)},${pt+h}Z" fill="url(#nwFill)"/>`;})();
  wrap.innerHTML=`<svg class="mchart-svg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" aria-label="Net worth trend chart">
    <defs><linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${NW_COL}" stop-opacity=".14"/><stop offset="1" stop-color="${NW_COL}" stop-opacity="0"/></linearGradient></defs>
    ${g}${area}${paths}${xl}
    <line class="nw-x" y1="${pt}" y2="${pt+h}" stroke="#34504c" stroke-dasharray="3 3" style="display:none"/>
    <rect x="${pl}" y="${pt}" width="${w}" height="${h}" fill="transparent" class="mc-hit"/></svg><div class="mc-tip nw-tip" hidden></div>`;
  const svg=wrap.querySelector('svg'),tip=wrap.querySelector('.nw-tip'),xline=svg.querySelector('.nw-x'),hit=svg.querySelector('.mc-hit');
  const lbl=id=>(cat.find(c=>c.id===id)||{}).label||id;
  const show=e=>{
    const r=svg.getBoundingClientRect(),sx=(e.clientX-r.left)*W/r.width,i=Math.max(0,Math.min(n-1,Math.round((sx-pl)/w*(n-1))));
    xline.style.display='';xline.setAttribute('x1',X(i));xline.setAttribute('x2',X(i));
    const rows=data.map(d=>({id:d.id,v:d.vals[i]})).filter(x=>x.v!=null).sort((a,b)=>b.v-a.v);
    tip.innerHTML=`<b>${bucketLabel(P.keys[i],N.gran)}${i===n-1?' (to date)':''}</b>`+rows.map(x=>`<span class="tr"><i style="background:${colorOf(x.id)}"></i>${H.esc(lbl(x.id))}<em>${N.mode==='pct'?`${x.v>=0?'+':'−'}${fmt(Math.abs(x.v),1)}%`:H.mask('MYR '+fmt(x.v,0))}</em></span>`).join('');
    tip.hidden=false;const px=X(i)/W*r.width;
    tip.style.left=Math.min(Math.max(px-tip.offsetWidth/2,0),r.width-tip.offsetWidth)+'px';
  };
  const off=()=>{xline.style.display='none';tip.hidden=true;};
  hit.addEventListener('pointerdown',show);hit.addEventListener('pointermove',show);hit.addEventListener('pointerleave',off);hit.addEventListener('pointercancel',off);
}

/* ---------- health (RAG) ---------- */
function histStats(sym){
  const s=N.hist&&N.hist[sym];if(!s||s.error||!s.points||s.points.length<30)return null;
  const p=s.points,last=p[p.length-1][1],tl=p[p.length-1][0];
  const at=days=>{let v=null;for(const x of p){if(x[0]<=tl-days*86400)v=x[1];else break;}return v;};
  const ma=p.length>=200?p.slice(-200).reduce((a,x)=>a+x[1],0)/200:null;
  const yr=p.filter(x=>x[0]>=tl-365*86400),hi=Math.max(...yr.map(x=>x[1]));
  const b3=at(91);
  return {ma200:ma,below200:ma!=null&&last<ma,m3:b3?(last/b3-1)*100:null,draw:hi>0?(1-last/hi)*100:null};
}
const RANK={r:0,a:1,g:2};
function judge(x){
  const why=[];let lvl='g';
  const bump=(l,t)=>{why.push([l,t]);if(RANK[l]<RANK[lvl])lvl=l;};
  if(x.pnlPct!=null){
    if(x.pnlPct<=RULE.lossRed)bump('r',`Down ${fmt(Math.abs(x.pnlPct),1)}% on what you paid`);
    else if(x.pnlPct<=RULE.lossAmber)bump('a',`Down ${fmt(Math.abs(x.pnlPct),1)}% on what you paid`);
  }
  const s=x.hs;
  if(s){
    if(s.below200&&s.m3!=null&&s.m3<=RULE.trend3mRed)bump('r',`Falling: ${fmt(s.m3,1)}% in 3 months and below its 200-day average`);
    else if(s.below200)bump('a','Price is below its 200-day average (downtrend)');
    if(s.draw!=null&&s.draw>=RULE.drawAmber)bump('a',`${fmt(s.draw,0)}% below its 52-week high`);
  }
  if(x.weight!=null&&x.weight>=RULE.weightAmber)bump('a',`${fmt(x.weight,0)}% of your net worth in one holding`);
  if(!why.length)why.push(['g',x.pnlPct!=null?`Up ${fmt(Math.max(0,x.pnlPct),1)}% on cost${s&&!s.below200?' · above its 200-day average':''}`:'No warning signs']);
  why.sort((p,q)=>RANK[p[0]]-RANK[q[0]]);
  return {lvl,why};
}
N.health=()=>{
  const pos=C.positions(),{c}=C.combined(pos),Mt=App.metals,mt=Mt&&Mt.status==='ok'&&Mt.rows.length?Mt.totals():null;
  const Xt=App.crypto&&App.crypto.status==='ok'&&App.crypto.rows.length?App.crypto.totals():null,At=App.asnb&&App.asnb.status==='ok'&&App.asnb.rows.length?App.asnb.totals():null;
  const nw=(c.value!=null?c.value:c.cost)+(mt?mt.value:0)+(Xt?Xt.value:0)+(At?At.value:0);
  const by={};
  pos.forEach(p=>{const k=p.ticker+'|'+p.market,b=by[k]||(by[k]={kind:'stock',ticker:p.ticker,market:p.market,label:p.label,sym:p.sym,value:0,cost:0,priced:true});
    const v=C.toMyr(p.ccy,p.value),co=C.toMyr(p.ccy,p.cost);if(v==null)b.priced=false;b.value+=v||0;b.cost+=co||0;});
  const items=Object.values(by).map(b=>({...b,pnlPct:b.priced&&b.cost?(b.value/b.cost-1)*100:null,weight:nw>0&&b.priced?b.value/nw*100:null,hs:histStats(b.sym)}));
  if(mt)Mt.positions().filter(p=>p.pure>0).forEach(p=>{const v=p.value!=null?p.value:p.cost;
    items.push({kind:'metal',metal:p.metal,label:p.metal,value:v,cost:p.cost,pnlPct:p.pnlPct,weight:nw>0?v/nw*100:null,hs:histStats(METAL_SYM[p.metal])});});
  if(Xt)App.crypto.positions().filter(p=>p.qty>0).forEach(p=>{const v=p.value!=null?p.value:p.cost;
    items.push({kind:'crypto',coin:p.coin,label:p.name+' ('+p.coin+')',value:v,cost:p.cost,pnlPct:p.pnlPct,weight:nw>0?v/nw*100:null,hs:['USDT','USDC'].includes(p.coin)?null:histStats(App.crypto.sym(p.coin))});});
  if(At)App.asnb.positions().filter(p=>p.units>0).forEach(p=>{const v=p.value!=null?p.value:p.cost;
    items.push({kind:'asnb',fund:p.fund,label:p.fund,value:v,cost:p.cost,pnlPct:p.fixed?null:p.pnlPct,weight:p.fixed?null:(nw>0?v/nw*100:null),hs:null,fixedNote:p.fixed});});
  items.forEach(it=>Object.assign(it,judge(it)));
  items.forEach(it=>{if(it.fixedNote&&it.lvl==='g')it.why=[['g','Fixed price RM1.00 — capital stays at RM1 a unit']];});
  items.sort((a,b)=>RANK[a.lvl]-RANK[b.lvl]||(b.weight||0)-(a.weight||0));
  // net worth itself
  const why=[];let lvl='g';const bump=(l,t)=>{why.push([l,t]);if(RANK[l]<RANK[lvl])lvl=l;};
  const tl=N.status==='ok'?N.build():null;
  const invested=c.cost+(mt?mt.cost:0)+(Xt?Xt.cost:0)+(At?At.cost:0);
  if(nw<invested)bump('r',`Worth ${fmt((1-nw/invested)*100,1)}% less than the money invested in current holdings`);
  if(tl){
    const n=tl.D.length,i3=Math.max(0,n-92),a=tl.S.nw[i3],b=tl.S.nw[n-1],ca=tl.S.cost[i3],cb=tl.S.cost[n-1];
    if(a&&b!=null){const perf=((b-a)-(cb-ca))/a*100;N.perf3m=perf;
      if(perf<=RULE.nwPerfRed)bump('r',`Lost ${fmt(Math.abs(perf),1)}% over 3 months (excluding new money added)`);
      else if(perf<RULE.nwPerfAmber)bump('a',`Down ${fmt(Math.abs(perf),1)}% over 3 months (excluding new money added)`);
      else why.push(['g',`Up ${fmt(perf,1)}% over 3 months (excluding new money added)`]);}
    const yr=tl.S.nw.slice(-366).filter(v=>v!=null),pk=Math.max(...yr);
    if(pk>0&&b!=null&&(1-b/pk)*100>=RULE.nwDrawAmber)bump('a',`${fmt((1-b/pk)*100,0)}% below its 12-month high`);
  }
  const nR=items.filter(i=>i.lvl==='r').length,nA=items.filter(i=>i.lvl==='a').length;
  if(nR)bump('a',`${nR} holding${nR>1?'s':''} flagged for review`);
  if(!why.length)why.push(['g','Above the money invested']);
  why.sort((x,y)=>RANK[x[0]]-RANK[y[0]]);
  return {nw:{lvl,why},items,counts:{r:nR,a:nA,g:items.length-nR-nA},hasHist:!!tl};
};
const BADGE={r:['✕','Review'],a:['!','Watch'],g:['✓','OK']};
N.badge=l=>`<span class="rag ${l}"><b>${BADGE[l][0]}</b>${BADGE[l][1]}</span>`;
N.strip=()=>{   // compact line for the Home overview
  const hl=N.health(),c=hl.counts;
  return `<button class="card tap hstrip" onclick="App.go('home','trend')">
    <div><div class="lbl">Portfolio health</div><div class="hs-row">${N.badge(hl.nw.lvl)}<span class="hs-t">${H.esc(hl.nw.why[0][1])}</span></div></div>
    <div class="hs-c">${c.r?`<span class="rag r"><b>✕</b>${c.r}</span>`:''}${c.a?`<span class="rag a"><b>!</b>${c.a}</span>`:''}<span class="rag g"><b>✓</b>${c.g}</span>${H.icon.chev}</div></button>`;
};

/* ---------- screen ---------- */
N.render=el=>{
  if(!App.state.sharesLoaded||App.classes().some(c=>c.m.status==='loading')){el.innerHTML=`<div class="skel" style="height:320px;border-radius:20px"></div>`+App.skeleton(3);return;}
  N.load();
  let html='';
  const tl=N.status==='ok'?N.build():null;
  if(N.status==='missing'||N.status==='outdated'){
    html+=`<div class="card"><div class="val">One-time setup: price history</div>
      <p class="sub" style="margin-top:8px;font-size:14px">The trend chart needs the updated <b>metal-chart</b> function. Supabase → Edge Functions → <b>metal-chart</b> → Code → paste <b>mobile/supabase/metal-chart/index.ts</b> → Deploy${N.status==='missing'?' (or Deploy a new function named metal-chart if it isn\'t there yet)':''}. Then tap Retry.</p>
      <button class="btn btn-p" style="width:100%;margin-top:14px" onclick="App.nw.load(true)">Retry</button></div>`;
  }else if(N.status==='error'){
    html+=`<div class="notice warn">Couldn't load price history: ${H.esc(N.err)}</div><button class="btn btn-s" style="width:100%;margin-top:10px" onclick="App.nw.load(true)">Retry</button>`;
  }else if(N.status==='empty'){
    html+=`<div class="empty">No trades or metals recorded yet.</div>`;
  }else if(!tl){
    html+=`<div class="skel" style="height:320px;border-radius:20px"></div><div class="tiny" style="margin-top:8px">Rebuilding your net worth history from ${transactions.length} trades…</div>`;
  }else{
    const P=periods(tl,N.gran),cat=catalogue(tl),n=P.idx.length;
    const nwNow=tl.S.nw[tl.D.length-1],i0=P.idx[0],nw0=tl.S.nw[i0],dNw=nwNow!=null&&nw0!=null?nwNow-nw0:null;
    const dCost=tl.S.cost[tl.D.length-1]-(tl.S.cost[i0]||0),perf=nw0?((dNw-dCost)/nw0*100):null;
    html+=`<div class="card nw-card">
      <div class="dhead"><div><div class="lbl">Net worth · last ${n} ${GRAN.find(g=>g[0]===N.gran)[1].toLowerCase()}${n!==1?'s':''}</div>
        <div class="dprice">MYR ${fmt(nwNow)}</div>
        <div class="sub">${dNw!=null?`${H.money('MYR',dNw,true)} since ${bucketLabel(P.keys[0],N.gran)}`:''}${perf!=null?` · ${perf>=0?'+':'−'}${fmt(Math.abs(perf),1)}% excl. new money`:''}</div></div>
        <div style="text-align:right">${N.badge(N.health().nw.lvl)}</div></div>
      <div class="nw-ctl">
        <div class="chips">${GRAN.map(([id,l])=>`<button class="chip ${N.gran===id?'on':''}" data-gran="${id}">${l}</button>`).join('')}</div>
        <div class="opts" style="min-width:170px"><button type="button" data-nwm="value" class="${N.mode==='value'?'on':''}">MYR</button><button type="button" data-nwm="pct" class="${N.mode==='pct'?'on':''}">% change</button></div>
      </div>
      <div class="nw-wrap"></div>
      <div class="lbl" style="margin:12px 0 6px">Lines on the chart · tap to show or hide</div>
      <div class="chips nw-series">${cat.map(s=>{const on=N.on.includes(s.id);
        return `<button class="chip sc ${on?'on':''}" data-ser="${H.esc(s.id)}">${on?`<i class="sw ${s.id==='cost'?'dash':''}" style="background:${colorOf(s.id)}"></i>`:'<i class="sw off"></i>'}${H.esc(s.label)}</button>`;}).join('')}</div>
      <div class="tiny" style="margin-top:10px">${N.mode==='pct'?'% change compares each line with its own value at the start of the period, so holdings of different sizes can be compared.':'Net worth = shares + metals + crypto + ASNB at market value. “Money invested” = what you paid for what you still hold, so the gap between the two lines is your unrealised gain.'}</div>
    </div>`;
    // period table
    const rows=[];for(let j=P.idx.length-1;j>=0;j--){const i=P.idx[j],pi=j>0?P.idx[j-1]:null,v=tl.S.nw[i],pv=pi!=null?tl.S.nw[pi]:null;
      const ch=pv!=null&&v!=null?v-pv:null,dc=pi!=null?tl.S.cost[i]-tl.S.cost[pi]:null,pf=pv?((ch-dc)/pv*100):null;rows.push({k:P.keys[j],v,ch,dc,pf,last:j===P.idx.length-1});}
    html+=`<div class="sec"><h2>By ${GRAN.find(g=>g[0]===N.gran)[1].toLowerCase()}</h2><span class="note">latest first</span></div>
      <div class="list">${rows.slice(0,24).map(r=>`<div class="lrow"><div class="main-col"><div class="t1">${bucketLabel(r.k,N.gran)}${r.last?' <span class="tag">to date</span>':''}</div>
        <div class="t2">${r.dc!=null&&Math.abs(r.dc)>=1?`${r.dc>0?'Added':'Took out'} MYR ${fmt(Math.abs(r.dc),0)} · `:''}${r.pf!=null?`performance ${r.pf>=0?'+':'−'}${fmt(Math.abs(r.pf),1)}%`:'start'}</div></div>
        <div class="end"><div class="v">MYR ${fmt(r.v,0)}</div><div class="s">${r.ch!=null?H.money('MYR',r.ch,true,0):''}</div></div></div>`).join('')}</div>
      ${rows.length>24?`<div class="tiny" style="margin-top:6px">Showing the latest 24 of ${rows.length}.</div>`:''}`;
    el.__nw={tl,P,cat};
  }
  // health
  const hl=N.health();
  html+=`<div class="sec"><h2>Health check</h2><span class="note">${hl.counts.r} review · ${hl.counts.a} watch · ${hl.counts.g} OK</span></div>
    <div class="card"><div class="dhead" style="margin-bottom:6px"><div class="t1" style="font-weight:800;font-size:15px">Net worth</div>${N.badge(hl.nw.lvl)}</div>
      <ul class="olist">${hl.nw.why.map(([l,t])=>`<li><span class="rg-${l}">${BADGE[l][0]}</span>${H.esc(t)}</li>`).join('')}</ul></div>
    <div class="list" style="margin-top:12px">${hl.items.map(it=>`<button class="lrow" onclick="${it.kind==='stock'?`App.holdings.openStock('${it.ticker}','${it.market}')`:`App.go('more','${it.kind==='metal'?'metals':it.kind}')`}">
      <div style="width:74px;flex-shrink:0">${N.badge(it.lvl)}</div>
      <div class="main-col"><div class="t1">${H.esc(it.label)}${it.kind!=='stock'?` <span class="tag ${it.kind==='metal'?'gold':''}">${it.kind==='metal'?'metal':it.kind==='crypto'?'crypto':'ASNB'}</span>`:''}</div>
        <div class="t2 wrap">${it.why.map(w=>H.esc(w[1])).join(' · ')}</div></div>
      <div class="end"><div class="v">${it.pnlPct==null?'—':H.pct(it.pnlPct,1)}</div><div class="s dim">${it.weight==null?'':fmt(it.weight,1)+'% of NW'}</div></div></button>`).join('')||'<div class="empty">No active holdings.</div>'}</div>
    ${hl.hasHist?'':'<div class="tiny" style="margin-top:6px">Trend checks (200-day average, 3-month move) appear once price history has loaded.</div>'}
    <details class="card mk-table" style="margin-top:12px"><summary>How the health check works</summary>
      <ul class="olist">
        <li><span class="rg-r">✕</span><b>Review</b>&nbsp;— down ${Math.abs(RULE.lossRed)}%+ on what you paid, or down ${Math.abs(RULE.trend3mRed)}%+ in 3 months while below its 200-day average.</li>
        <li><span class="rg-a">!</span><b>Watch</b>&nbsp;— down ${Math.abs(RULE.lossAmber)}%+ on cost, below its 200-day average, ${RULE.drawAmber}%+ below its 52-week high, or ${RULE.weightAmber}%+ of net worth in one holding.</li>
        <li><span class="rg-g">✓</span><b>OK</b>&nbsp;— none of the above.</li>
        <li><span class="dim">•</span>Net worth: <b>Review</b> if it's below the money invested or lost ${Math.abs(RULE.nwPerfRed)}%+ over 3 months (ignoring deposits); <b>Watch</b> if it fell over 3 months, is ${RULE.nwDrawAmber}%+ below its 12-month high, or any holding is flagged Review.</li>
      </ul><div class="tiny" style="margin-top:8px">These are prompts to take a look, not buy or sell signals.</div></details>`;
  el.innerHTML=html;
  // bind
  el.querySelectorAll('[data-gran]').forEach(b=>b.onclick=()=>{N.gran=b.dataset.gran;App.render(false);});
  el.querySelectorAll('[data-nwm]').forEach(b=>b.onclick=()=>{N.mode=b.dataset.nwm;App.render(false);});
  if(el.__nw){const {tl,P,cat}=el.__nw;el.querySelectorAll('[data-ser]').forEach(b=>b.onclick=()=>toggle(b.dataset.ser,cat));chart(el,tl,P,cat);el.__nw=null;}
};
})();
