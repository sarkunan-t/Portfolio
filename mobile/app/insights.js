/* ===== Insights: P&L by year · cash by wallet · capital · dividend stats =====
   Charts are sized to the real screen width (so text stays readable) and use tap-to-inspect
   instead of hover. Colours: MYR #00a19c / USD #6a4fd1 (validated pair), P&L green/red with
   hatching for "held" so sold vs held never relies on colour alone. */
(function(){
const H=App.h, C=App.calc;
const COL={MYR:'#00a19c',USD:'#6a4fd1',RP:'#1e8e3e',RL:'#d93025',INK:'#16302e',DIM:'#5f7674',GRID:'#e3ecea',AXIS:'#b9cac7'};
const PK='pnl';
App.state.asOf='';
App.state.flow={ccy:'',cds:'',view:'net'};

const cw=()=>Math.max(300,Math.min(1080,(document.getElementById('view').clientWidth||360)-34));
function ticks(lo,hi,n=5){if(lo===hi)hi=lo+1;const raw=(hi-lo)/n,mag=Math.pow(10,Math.floor(Math.log10(raw))),r=raw/mag;
  const step=(r<=1?1:r<=2?2:r<=2.5?2.5:r<=5?5:10)*mag,out=[];
  for(let v=Math.floor(lo/step)*step;v<=Math.ceil(hi/step)*step+step/2;v+=step)out.push(Math.round(v*1e6)/1e6);return out;}
const kf=v=>{const a=Math.abs(v),s=v<0?'−':'';return a>=1e6?s+(a/1e6).toFixed(1)+'M':a>=1e3?s+(a/1e3).toFixed(a>=1e5?0:1)+'k':s+Math.round(a);};
function bar(x,w,yb,ye,round=true){const h=Math.abs(ye-yb);if(h<0.5)return '';
  if(!round)return `M${x},${Math.min(yb,ye)}h${w}v${h}h${-w}Z`;
  const r=Math.min(4,h,w/2),up=ye<yb;
  return up?`M${x},${yb}V${ye+r}Q${x},${ye} ${x+r},${ye}H${x+w-r}Q${x+w},${ye} ${x+w},${ye+r}V${yb}Z`
           :`M${x},${yb}V${ye-r}Q${x},${ye} ${x+r},${ye}H${x+w-r}Q${x+w},${ye} ${x+w},${ye-r}V${yb}Z`;}
const ea=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
/* tap-to-inspect: any element with data-tip writes into the chart's info box */
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-tip]');if(!t)return;
  const wrap=t.closest('.chart-card');if(!wrap)return;
  const box=wrap.querySelector('.chart-info');if(box){box.innerHTML=t.getAttribute('data-tip');box.classList.remove('idle');}
  wrap.querySelectorAll('.sel').forEach(x=>x.classList.remove('sel'));t.classList.add('sel');
});

/* ---------------- P&L by stock by year ---------------- */
const tf=(t,g)=>({market:t.market,cds:normCds(t.cds_account),year:String(new Date(t.tx_date).getFullYear()),stock:t.ticker}[g]);
const pnlPass=t=>['market','cds','year','stock'].every(g=>App.fPass(PK,g,tf(t,g)));
function pnlGroups(){
  const v=g=>[...new Set(transactions.map(t=>tf(t,g)))];
  return [{id:'market',label:'Market',options:v('market').sort().map(x=>({value:x}))},
    {id:'cds',label:'CDS account',options:v('cds').sort().map(x=>({value:x}))},
    {id:'year',label:'Year (bought or sold)',options:v('year').sort((a,b)=>b-a).map(x=>({value:x}))},
    {id:'stock',label:'Stock',options:[...new Map(transactions.map(t=>[t.ticker,{value:t.ticker,label:`${t.ticker} · ${t.company_name||t.ticker}`}])).values()].sort((a,b)=>a.value.localeCompare(b.value))}];
}
function pnlChart(items){
  const years=[...new Set(items.map(g=>g.year))].sort((a,b)=>a-b);
  const st={};years.forEach(y=>{const ys=items.filter(g=>g.year===y);
    st[y]={pos:ys.filter(g=>g.myr>0).sort((a,b)=>b.myr-a.myr),neg:ys.filter(g=>g.myr<0).sort((a,b)=>a.myr-b.myr)};
    st[y].up=st[y].pos.reduce((s,g)=>s+g.myr,0);st[y].dn=st[y].neg.reduce((s,g)=>s+g.myr,0);});
  const tk=ticks(Math.min(0,...years.map(y=>st[y].dn)),Math.max(0,...years.map(y=>st[y].up)));
  const W=cw(),Hh=Math.round(Math.min(420,Math.max(280,W*0.5))),pL=48,pR=8,pT=22,pB=30,pw=W-pL-pR,ph=Hh-pT-pB;
  const lo=tk[0],hi=tk[tk.length-1],yv=v=>pT+ph-(v-lo)/(hi-lo)*ph;
  const band=pw/years.length,bw=Math.min(64,band*0.62);
  let s=`<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" aria-label="P&amp;L by stock by year">
    <defs><pattern id="hG" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#a8dcb9"/><rect width="2.2" height="6" fill="${COL.RP}"/></pattern>
    <pattern id="hR" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f4b4ae"/><rect width="2.2" height="6" fill="${COL.RL}"/></pattern></defs>
    <style>.sel{stroke:#0f1f1d;stroke-width:2;}</style>`;
  tk.forEach(t=>{s+=`<line x1="${pL}" x2="${W-pR}" y1="${yv(t)}" y2="${yv(t)}" stroke="${t===0?COL.AXIS:COL.GRID}"/>
    <text x="${pL-6}" y="${yv(t)+4}" text-anchor="end" font-size="11" fill="${COL.DIM}" font-family="Mulish">${kf(t)}</text>`;});
  years.forEach((y,i)=>{
    const x=pL+band*i+(band-bw)/2,S=st[y];
    const draw=(arr,dir)=>{let acc=0;arr.forEach((g,j)=>{
      const a=yv(acc),b=yv(acc+g.myr);acc+=g.myr;const gap=j>0?2:0,ys=dir>0?a-gap:a+gap;if(Math.abs(b-ys)<0.6)return;
      const fill=g.kind==='R'?(g.myr>=0?COL.RP:COL.RL):(g.myr>=0?'url(#hG)':'url(#hR)');
      const nat=g.ccy==='USD'?`USD ${g.native>=0?'+':'−'}${fmt(Math.abs(g.native))} ≈ `:'';
      const tip=`<b>${ea(g.name)} (${ea(g.ticker)})</b> · ${y}<br>${g.kind==='R'?'Sold — realised':'Held — unrealised'} · ${ea(g.cds)}<br>`+
        `${fmt(g.units,0)} units · avg ${g.ccy} ${fmt(g.avg,g.avg<10?4:2)} → ${g.kind==='R'?'sold':'now'} ${g.ccy} ${fmt(g.px,g.px<10?4:2)}<br>`+
        `<b class="${g.myr>=0?'up':'down'}">P&amp;L ${nat}${g.myr>=0?'+':'−'}MYR ${fmt(Math.abs(g.myr))}</b>`+(g.noCost?'<br>⚠ sold more units than held':'');
      s+=`<path class="hit" d="${bar(x,bw,ys,b,j===arr.length-1)}" fill="${fill}" data-tip="${ea(tip)}"/>`;
      if(Math.abs(b-ys)>=16&&bw>=34){const solid=g.kind==='R';
        s+=`<text x="${x+bw/2}" y="${(ys+b)/2+4}" text-anchor="middle" font-size="10.5" font-weight="800" font-family="Mulish" pointer-events="none" fill="${solid?'#fff':COL.INK}" ${solid?'':'stroke="#fff" stroke-width="3" paint-order="stroke"'}>${ea(g.ticker)}</text>`;}
    });};
    draw(S.pos,1);draw(S.neg,-1);
    const net=S.up+S.dn;
    s+=`<circle cx="${x+bw/2}" cy="${yv(net)}" r="5" fill="${COL.INK}" stroke="#fff" stroke-width="2" pointer-events="none"/>`;
    s+=`<text x="${x+bw/2}" y="${net>=0?yv(S.up)-7:yv(S.dn)+15}" text-anchor="middle" font-size="11" font-weight="800" font-family="Mulish" fill="${COL.INK}">${net>=0?'+':''}${kf(net)}</text>`;
    s+=`<text x="${pL+band*i+band/2}" y="${Hh-9}" text-anchor="middle" font-size="12" font-weight="700" font-family="Mulish" fill="${COL.DIM}">${String(y).slice(years.length>7?2:0)}</text>`;
  });
  return s+'</svg>';
}
function renderPnl(el){
  const {items,unpriced,noCost,noFx}=C.pnlSegments(pnlPass);
  const R=items.filter(g=>g.kind==='R').reduce((s,g)=>s+g.myr,0),U=items.filter(g=>g.kind==='U').reduce((s,g)=>s+g.myr,0);
  let html=App.filterChips(PK)+`<div class="grid g3">
    <div class="stat"><div class="lbl">Realised · sold</div><div class="val">${H.money('MYR',R,true)}</div></div>
    <div class="stat"><div class="lbl">Unrealised · held</div><div class="val">${H.money('MYR',U,true)}</div></div>
    <div class="stat"><div class="lbl">Net</div><div class="val">${H.money('MYR',R+U,true)}</div></div></div>`;
  html+=`<div class="card chart-card" style="margin-top:12px"><div class="lbl">P&amp;L by stock by year</div>
    <div class="tiny">Sold = realised in the year sold · Held = unrealised at today's price, in the year bought</div>
    <div class="chart-legend"><span><i style="background:${COL.RP}"></i>Sold · profit</span><span><i style="background:${COL.RL}"></i>Sold · loss</span>
      <span><i class="hatch-g"></i>Held · profit</span><span><i class="hatch-r"></i>Held · loss</span><span><i style="background:${COL.INK};border-radius:50%"></i>Net for year</span></div>
    <div class="chart" style="overflow-x:auto">${items.length?pnlChart(items):`<div class="empty">No P&amp;L for these filters${unpriced?' (prices loading…)':''}</div>`}</div>
    <div class="chart-info idle">Tap a bar segment to see the stock, units and P&amp;L.</div>`;
  const notes=[];if(H.fx())notes.push(`USD in MYR @ ${fmt(H.fx(),4)}.`);if(unpriced)notes.push(`${unpriced} held position${unpriced>1?'s':''} without a live price — not shown.`);if(noFx)notes.push('USD rate pending — US positions not shown yet.');
  if(notes.length)html+=`<div class="tiny" style="margin-top:8px">${notes.join(' ')}</div>`;
  if(noCost.length)html+=`<div class="notice warn">⚠ ${noCost.length} sale${noCost.length>1?'s':''} sold more units than the account held — the extra units have no cost, so they count as pure profit: ${noCost.map(r=>`${r.ticker} ${r.cds} ${H.date(r.tx.tx_date)} (sold ${fmt(r.units,0)}, held ${fmt(r.heldUnits,0)})`).join(' · ')}</div>`;
  const rows=[...items].sort((a,b)=>b.year-a.year||a.ticker.localeCompare(b.ticker));
  html+=`<details class="more-dt"><summary>Show as table</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Year</th><th>Stock</th><th>Status</th><th>CDS</th><th class="n">Units</th><th class="n">P&amp;L</th><th class="n">MYR</th></tr></thead><tbody>`+
    rows.map(g=>`<tr><td><b>${g.year}</b></td><td>${ea(g.ticker)}</td><td>${g.kind==='R'?'Sold':'Held'}</td><td>${ea(g.cds)}</td><td class="n">${fmt(g.units,0)}</td><td class="n">${H.money(g.ccy,g.native,true)}</td><td class="n">${H.money('MYR',g.myr,true)}</td></tr>`).join('')+
    `</tbody></table></div></details></div>`;
  el.innerHTML=html;
}

/* ---------------- Cash by CDS wallet ---------------- */
function renderCash(el){
  const st=App.state.fundsStatus, fx=H.fx();
  let html='';
  if(st==='loading')html+=`<div class="notice info">⌛ Loading deposits from Funds…</div>`;
  if(st==='error')html+=`<div class="notice warn">⚠ Deposits could not be loaded — cash balances below exclude deposits and are NOT accurate. Tap refresh or sign in again.</div>`;
  const W=C.walletCash();
  html+=`<div class="tiny" style="margin:4px 2px 10px">Dividends: MYB &amp; RKT into the wallet, RHB to Maybank savings. Settlement: Bursa T+2, US T+1 business days (public holidays not included).</div><div class="grid gw2 gw3">`;
  html+=W.map(a=>{
    const c=a.ccy,m=(v,sg='')=>`${sg}${c} ${fmt(Math.abs(v))}`,eq=v=>c==='USD'?(fx?`≈ MYR ${fmt(v*fx)}`:'≈ MYR (rate pending)'):(fx?`≈ USD ${fmt(v/fx)}`:'');
    const head=`<div class="pos-top"><div><div class="pos-name">${a.key}</div><div class="pos-meta">${C.CDS_NAME[a.cds]||a.cds} · ${c==='USD'?'US T+1':'Bursa T+2'}</div></div>${H.ccyTag(c)}</div>`;
    if(!a.active)return `<div class="card muted-card">${head}<div class="tiny" style="margin-top:8px">No deposits or trades yet.</div></div>`;
    let x=`<div class="card">${head}
      <div class="dhead" style="margin:12px 0 4px"><div><div class="lbl">Cash balance</div><div class="val ${a.bal>=0?'':'down'}">${m(a.bal,a.bal<0?'−':'')}</div><div class="tiny">${eq(a.bal)}</div></div>
        <div style="text-align:right"><div class="lbl">Cash + shares</div><div class="val">${m(a.total,a.total<0?'−':'')}</div><div class="tiny">${a.hold&&a.hold.stocks.size?`${a.hold.stocks.size} stock${a.hold.stocks.size>1?'s':''} at market`:'no shares held'}</div></div></div>
      <details class="more-dt"><summary>Breakdown</summary>
      <div class="kv" style="margin-top:6px"><span>Capital in${a.capInN?` (${a.capInN})`:''}</span><span class="up">+${m(a.capIn)}</span></div>
      ${a.xIn>0.005?`<div class="kv sm"><span>incl. transfers in</span><span>${m(a.xIn)}</span></div>`:''}
      <div class="kv"><span>Capital out${a.capOutN?` (${a.capOutN})`:''}</span><span class="down">−${m(a.capOut)}</span></div>
      ${a.xOut>0.005?`<div class="kv sm"><span>incl. transfers out</span><span>${m(a.xOut)}</span></div>`:''}
      <div class="kv"><span>Stocks purchased${a.buyN?` (${a.buyN})`:''}</span><span class="down">−${m(a.buy)}</span></div>
      <div class="kv"><span>Sale proceeds${a.sellN?` (${a.sellN})`:''}</span><span class="up">+${m(a.sell)}</span></div>
      ${DIV_TO_WALLET[a.cds]?`<div class="kv"><span>Dividends received${a.divN?` (${a.divN})`:''}</span><span class="up">+${m(a.div)}</span></div>`:''}
      <div class="kv b"><span>Cash balance</span><span>${m(a.bal,a.bal<0?'−':'')}</span></div>
      ${a.hold&&a.hold.stocks.size?`<div class="kv"><span>Shares at market</span><span>${a.hold.val?m(a.hold.val):'—'}</span></div>
        <div class="kv sm"><span>cost ${m(a.hold.cost)} · unrealised</span><span class="${a.hold.val-a.hold.pricedCost>=0?'up':'down'}">${m(a.hold.val-a.hold.pricedCost,a.hold.val-a.hold.pricedCost>=0?'+':'−')}</span></div>
        ${a.hold.unpriced.size?`<div class="kv sm"><span style="color:var(--warn)">no live price: ${[...a.hold.unpriced].join(', ')}</span><span></span></div>`:''}`:''}
      </details>`;
    if(a.divOut>0.005)x+=`<div class="notice info">Dividends ${m(a.divOut)} (${a.divOutN}) paid to ${a.divBank} — not in this wallet</div>`;
    a.groups.forEach(g=>{const buy=g.side==='Buy';
      x+=`<div class="notice due">${buy?'⏳ Payment due':'↩ Proceeds due'} ${m(g.amt)} · ${g.due===H.today()?'<b>today</b>':H.date(g.due)}<br><span style="font-weight:600">${[...g.tickers].join(', ')} · T+${g.n}${g.contra?' · contra':''}</span></div>`;});
    if(a.short)x+=`<div class="notice warn">⚠ Short by ${m(a.short.amt)} — top up by ${H.date(a.short.by)}</div>`;
    else if(a.negative)x+=`<div class="notice warn">⚠ Negative balance ${m(a.bal,'−')} — a deposit may be missing</div>`;
    if(!a.groups.length&&!a.short&&!a.negative)x+=`<div class="notice ok">✓ No unsettled trades</div>`;
    return x+'</div>';
  }).join('')+'</div>';
  el.innerHTML=html;
}

/* ---------------- Capital (funds page) ---------------- */
function walletBars(bal,tk,basis){
  const W=Math.max(300,Math.min(520,cw()/(cw()>=700?2:1)-10)),Hh=230,pL=44,pR=6,pT=20,pB=28,pw=W-pL-pR,ph=Hh-pT-pB,fx=H.fx();
  const lo=tk[0],hi=tk[tk.length-1],y=v=>pT+ph-(v-lo)/(hi-lo)*ph,y0=y(0),gW=pw/3,bw=Math.min(40,gW*0.32);
  let s=`<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" aria-label="${basis}"><style>.sel{stroke:#0f1f1d;stroke-width:2;}</style>`;
  tk.forEach(t=>{s+=`<line x1="${pL}" x2="${W-pR}" y1="${y(t)}" y2="${y(t)}" stroke="${t===0?COL.AXIS:COL.GRID}"/><text x="${pL-6}" y="${y(t)+4}" text-anchor="end" font-size="11" fill="${COL.DIM}" font-family="Mulish">${kf(t)}</text>`;});
  C.CDS.forEach((c,i)=>{const cx=pL+gW*i+gW/2,m=bal[c].MYR,u=bal[c].USD,um=u*fx;
    [[cx-bw-1,m,COL.MYR,`<b>${c}-MYR</b> · ${basis}<br>MYR ${fmt(m)}`],[cx+1,um,COL.USD,`<b>${c}-USD</b> · ${basis}<br>USD ${fmt(u)} ≈ MYR ${fmt(um)} @ ${fmt(fx,4)}`]].forEach(([x,v,col,tip])=>{
      const d=bar(x,bw,y0,y(v));if(d)s+=`<path class="hit" d="${d}" fill="${col}" data-tip="${ea(tip)}"/>`;
      s+=`<rect data-tip="${ea(tip)}" x="${x-3}" y="${pT}" width="${bw+6}" height="${ph}" fill="transparent"/>`;
      if(Math.abs(v)>=0.005)s+=`<text x="${x+bw/2}" y="${v>=0?y(v)-5:y(v)+13}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${COL.INK}" font-family="Mulish" pointer-events="none">${kf(v)}</text>`;});
    s+=`<text x="${cx}" y="${Hh-8}" text-anchor="middle" font-size="12" font-weight="800" fill="${COL.INK}" font-family="Mulish">${c}</text>`;});
  return s+'</svg>';
}
function flowChart(){
  const {ccy,cds,view}=App.state.flow, fx=H.fx(), funds=App.state.funds;
  const series=['MYR','USD'].filter(c=>!ccy||ccy===c), flows={MYR:{},USD:{}};
  funds.forEach(f=>{if(cds&&f.cds_account!==cds)return;const c=f.currency||'MYR';if(!flows[c])return;const y=new Date(f.txn_date).getFullYear();if(isNaN(y))return;
    flows[c][y]=(flows[c][y]||0)+((f.txn_type==='Deposit'||f.txn_type==='Transfer In')?1:-1)*(Number(f.amount)||0);});
  const all=funds.map(f=>new Date(f.txn_date).getFullYear()).filter(y=>!isNaN(y));
  if(!all.length)return {svg:'<div class="empty">No movements yet</div>',table:''};
  const years=[];for(let y=Math.min(...all);y<=Math.max(Math.max(...all),new Date().getFullYear());y++)years.push(y);
  const data={};series.forEach(c=>{let run=0;data[c]=years.map(y=>{const n=flows[c][y]||0;run+=n;const nat=view==='cum'?run:n;return {y,nat,myr:c==='USD'?(fx?nat*fx:null):nat};});});
  const table=`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Year</th>${series.map(c=>`<th class="n">${c}</th>${c==='USD'?'<th class="n">≈ MYR</th>':''}`).join('')}</tr></thead><tbody>`+
    years.map((y,i)=>`<tr><td><b>${y}</b></td>${series.map(c=>{const d=data[c][i];return `<td class="n">${H.money(c,d.nat,true)}</td>${c==='USD'?`<td class="n">${d.myr!=null?H.money('MYR',d.myr,true):'—'}</td>`:''}`;}).join('')}</tr>`).join('')+'</tbody></table></div>';
  const draw=series.filter(c=>c==='MYR'||fx);
  if(!draw.length)return {svg:'<div class="empty">Fetching USD/MYR rate…</div>',table};
  const vals=[0];draw.forEach(c=>data[c].forEach(d=>vals.push(d.myr)));
  const tk=ticks(Math.min(...vals),Math.max(...vals),4);
  const W=cw(),Hh=Math.round(Math.min(320,Math.max(240,W*0.42))),pL=48,pR=44,pT=16,pB=28,pw=W-pL-pR,ph=Hh-pT-pB,lo=tk[0],hi=tk[tk.length-1];
  const x=i=>pL+(years.length===1?pw/2:i*pw/(years.length-1)),yv=v=>pT+ph-(v-lo)/(hi-lo)*ph;
  let s=`<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" aria-label="Capital flow by year"><style>.sel line{stroke:${COL.INK};}</style>`;
  tk.forEach(t=>{s+=`<line x1="${pL}" x2="${W-pR}" y1="${yv(t)}" y2="${yv(t)}" stroke="${t===0?COL.AXIS:COL.GRID}"/><text x="${pL-6}" y="${yv(t)+4}" text-anchor="end" font-size="11" fill="${COL.DIM}" font-family="Mulish">${kf(t)}</text>`;});
  const step=years.length>8?2:1;
  years.forEach((y,i)=>{if(i%step===0||i===years.length-1)s+=`<text x="${x(i)}" y="${Hh-8}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${COL.DIM}" font-family="Mulish">${y}</text>`;});
  const band=years.length>1?pw/(years.length-1):pw;
  years.forEach((y,i)=>{const rows=series.map(c=>{const d=data[c][i];return `<span style="color:${COL[c]}">■</span> ${c}: ${c==='USD'?'USD '+fmt(d.nat)+(d.myr!=null?' ≈ MYR '+fmt(d.myr):''):'MYR '+fmt(d.nat)}`;}).join('<br>');
    s+=`<g data-tip="${ea(`<b>${y}</b> · ${view==='cum'?'cumulative':'net flow'}${cds?' · '+cds:''}<br>${rows}`)}"><rect x="${x(i)-band/2}" y="${pT}" width="${band}" height="${ph}" fill="transparent"/>
      <line x1="${x(i)}" x2="${x(i)}" y1="${pT}" y2="${pT+ph}" stroke="transparent" stroke-dasharray="3 3"/></g>`;});
  draw.forEach(c=>{const pts=data[c].map((d,i)=>[x(i),yv(d.myr)]);
    s+=`<polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${COL[c]}" stroke-width="2" stroke-linejoin="round" pointer-events="none"/>`;
    pts.forEach(p=>{s+=`<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="${COL[c]}" stroke="#fff" stroke-width="2" pointer-events="none"/>`;});
    const l=pts[pts.length-1];s+=`<text x="${l[0]+9}" y="${l[1]+4}" font-size="12" font-weight="800" fill="${COL.INK}" font-family="Mulish" pointer-events="none">${c}</text>`;});
  return {svg:s+'</svg>',table};
}
function renderCapital(el){
  if(App.state.fundsStatus==='loading'){el.innerHTML=App.skeleton(4);return;}
  const asOf=App.state.asOf, fx=H.fx();
  const fund=C.fundBalances(asOf,false),cash=C.fundBalances(asOf,true),F=C.sumBal(fund),K=C.sumBal(cash);
  const eq=(m,u)=>fx?m+u*fx:null, tF=eq(F.m,F.u), tC=eq(K.m,K.u);
  let html=`<div class="card"><div class="pos-top"><div class="lbl">Balances as of</div>
      <div style="display:flex;gap:8px;align-items:center"><input type="date" class="inp" style="height:40px;width:auto;font-size:14px" id="asOf" value="${asOf}">
      ${asOf?'<button class="chip" id="asNow">Now</button>':''}</div></div>
    <div class="big" style="font-size:28px;margin-top:8px">${tF!=null?`MYR ${fmt(tF)}`:`MYR ${fmt(F.m)} + USD ${fmt(F.u)}`}</div>
    <div class="sub">Total funded · MYR + USD${fx?` (USD @ ${fmt(fx,4)})`:''}</div>
    <div class="kv" style="margin-top:10px"><span>After share purchases</span><span>${tC!=null?H.money('MYR',tC,true):'—'}</span></div>
    <div class="grid g2" style="gap:10px;margin-top:8px">
      <div class="stat" style="box-shadow:none"><div class="lbl">MYR funds</div><div class="val">${H.money('MYR',F.m,true)}</div><div class="sub">after purchases ${H.money('MYR',K.m,true)}</div></div>
      <div class="stat" style="box-shadow:none"><div class="lbl">USD funds</div><div class="val">${H.money('USD',F.u,true)}</div><div class="sub">after purchases ${H.money('USD',K.u,true)}${fx?' · ≈ MYR '+fmt(F.u*fx):''}</div></div></div></div>`;
  if(fx){
    const vals=[];[fund,cash].forEach(b=>C.CDS.forEach(c=>{vals.push(b[c].MYR,b[c].USD*fx);}));
    const tk=ticks(Math.min(0,...vals),Math.max(0,...vals),4);
    html+=`<div class="card chart-card"><div class="lbl">Available funds by CDS wallet</div>
      <div class="chart-legend"><span><i style="background:${COL.MYR}"></i>MYR wallet</span><span><i style="background:${COL.USD}"></i>USD wallet (in MYR)</span></div>
      <div class="grid gw2"><div><div style="font-weight:800;font-size:14px">Funded balance</div><div class="tiny">deposits − withdrawals ± transfers</div><div class="chart">${walletBars(fund,tk,'Funded')}</div></div>
        <div><div style="font-weight:800;font-size:14px">Cash after share purchases</div><div class="tiny">− purchases + sales + dividends (MYB, RKT)</div><div class="chart">${walletBars(cash,tk,'After share purchases')}</div></div></div>
      <div class="chart-info idle">Tap a bar to see the exact amount.</div>
      <details class="more-dt"><summary>Show as table</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Wallet</th><th class="n">Funded</th><th class="n">After purchases</th><th class="n">≈ MYR</th></tr></thead><tbody>`+
      C.WALLETS.map(w=>{const f=fund[w.cds][w.ccy],c=cash[w.cds][w.ccy];return `<tr><td><b>${w.key}</b></td><td class="n">${H.money(w.ccy,f,true)}</td><td class="n">${H.money(w.ccy,c,true)}</td><td class="n">${H.money('MYR',w.ccy==='USD'?c*fx:c,true)}</td></tr>`;}).join('')+
      `</tbody></table></div></details></div>`;
  }
  const fl=App.state.flow, fc=flowChart();
  const chip=(k,v,l)=>`<button class="chip ${fl[k]===v?'on':''}" data-flow="${k}" data-fv="${v}">${l}</button>`;
  html+=`<div class="card chart-card"><div class="lbl">Capital flow — year on year</div>
    <div class="chips" style="margin:10px 0 4px">${chip('view','net','Net per year')}${chip('view','cum','Cumulative')}</div>
    <div class="chips" style="margin-bottom:4px">${chip('ccy','','MYR & USD')}${chip('ccy','MYR','MYR')}${chip('ccy','USD','USD')}</div>
    <div class="chips">${chip('cds','','All CDS')}${chip('cds','MYB','MYB')}${chip('cds','RHB','RHB')}${chip('cds','RKT','RKT')}</div>
    <div class="chart-legend" style="margin-top:10px">${['MYR','USD'].filter(c=>!fl.ccy||fl.ccy===c).map(c=>`<span><i style="background:${COL[c]}"></i>${c}${c==='USD'?' (in MYR)':''}</span>`).join('')}</div>
    <div class="chart" style="overflow-x:auto">${fc.svg}</div>
    <div class="chart-info idle">Tap a year to see the amounts.</div>
    <div class="tiny" style="margin-top:6px">Flow = deposits − withdrawals + transfers in − transfers out.</div>
    <details class="more-dt"><summary>Show as table</summary>${fc.table}</details></div>`;
  el.innerHTML=html;
  const a=document.getElementById('asOf');if(a)a.onchange=()=>{App.state.asOf=a.value;App.render(false);};
  const n=document.getElementById('asNow');if(n)n.onclick=()=>{App.state.asOf='';App.render(false);};
  el.querySelectorAll('[data-flow]').forEach(b=>b.onclick=()=>{App.state.flow[b.dataset.flow]=b.dataset.fv;App.render(false);});
}

/* ---------------- Dividend stats ---------------- */
function renderDivStats(el){
  const list=App.activity.divFiltered(), s=C.divStats(list);
  let html=App.filterChips('dividends');
  if(!list.length){el.innerHTML=html+'<div class="empty">No dividends found.</div>';return;}
  html+=`<div class="grid g3">
    <div class="stat"><div class="lbl">Total dividends</div><div class="val gold">MYR ${fmt(s.total)}</div><div class="sub">wallets ${H.k(s.toWal)} · savings ${H.k(s.toSav)}</div></div>
    <div class="stat"><div class="lbl">This year</div><div class="val">MYR ${fmt(s.byYear[s.now]||0)}</div><div class="sub">${s.now} year to date</div></div>
    <div class="stat"><div class="lbl">Last year</div><div class="val">MYR ${fmt(s.byYear[s.now-1]||0)}</div><div class="sub">${s.now-1}</div></div>
    <div class="stat"><div class="lbl">Average / year</div><div class="val">MYR ${fmt(s.avg)}</div><div class="sub">${s.pastN} year${s.pastN!==1?'s':''} (excl. ${s.now})</div></div>
    <div class="stat"><div class="lbl">Top payer</div><div class="val">${H.esc(s.top[0])}</div><div class="sub">MYR ${fmt(s.top[1])} cumulative</div></div>
    <div class="stat"><div class="lbl">Latest payout</div><div class="val">${s.latest.ccy} ${fmt(s.latest.amount)}</div><div class="sub">${H.esc(s.latest.name)} · ${H.dateShort(s.latest.date)}</div></div></div>`;
  const yrs=Object.keys(s.byYear).sort((a,b)=>b-a), mx=Math.max(...yrs.map(y=>s.byYear[y]));
  html+=`<div class="card" style="margin-top:12px"><div class="lbl" style="margin-bottom:6px">By year (MYR)</div><div class="yr-bars">`+
    yrs.map(y=>`<div class="yb"><b>${y}</b><div><div class="bar" style="width:${s.byYear[y]/mx*100}%"></div></div><span>${fmt(s.byYear[y])}</span></div>`).join('')+`</div></div>`;
  const stocks=Object.entries(s.byStock).sort((a,b)=>b[1]-a[1]), ms=stocks.length?stocks[0][1]:1;
  html+=`<div class="card"><div class="lbl" style="margin-bottom:6px">By stock (MYR, cumulative)</div><div class="yr-bars">`+
    stocks.map(([n,v])=>`<div class="yb" style="grid-template-columns:minmax(80px,140px) 1fr auto"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${H.esc(n)}</b><div><div class="bar" style="width:${v/ms*100}%"></div></div><span>${fmt(v)}</span></div>`).join('')+`</div></div>`;
  if(s.pending)html+=`<div class="tiny" style="margin-top:8px">${s.pending} USD payout(s) waiting for the exchange rate.</div>`;
  el.innerHTML=html;
}

App.screens.insights={
  title:'Insights',
  segs:[{id:'pnl',label:'P&L by year'},{id:'cash',label:'Cash by wallet'},{id:'capital',label:'Capital'},{id:'dividends',label:'Dividends'}],
  actions:seg=>seg==='pnl'?[{id:'filter',active:App.filterActive(App.state.filters[PK])}]:seg==='dividends'?[{id:'filter',active:App.filterActive(App.state.filters.dividends)}]:[],
  openFilter(seg){
    if(seg==='dividends'){App.screens.activity.openFilter('dividends');return;}
    App.openFilterSheet({title:'Filter P&L',groups:pnlGroups(),state:App.state.filters[PK]||{},onApply:w=>{App.state.filters[PK]=w;App.render(true);}});
  },
  render(el,seg){
    if(!App.state.sharesLoaded&&seg!=='capital'){el.innerHTML=App.skeleton(4);return;}
    ({cash:renderCash,capital:renderCapital,dividends:renderDivStats}[seg]||renderPnl)(el);
  }
};
let rt;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{if(App.state.tab==='insights')App.refreshView();},250);});
})();
