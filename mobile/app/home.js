/* ===== Home: net worth, today, KPIs, movers, alerts ===== */
(function(){
const H=App.h, C=App.calc;

function kpiTile(label,o,signed,k,extra=''){
  const m=k.m(o);
  const v=m==null?`${H.money('MYR',o.MYR,signed)}`:(signed?H.money('MYR',m,true):H.money('MYR',m));
  const split=(o.MYR||o.USD)?`MYR ${H.k(o.MYR)} · USD ${H.k(o.USD)}`:'&nbsp;';
  return `<div class="stat"><div class="lbl">${label}</div><div class="val">${v}</div><div class="sub">${extra||split}</div></div>`;
}

App.screens.home={
  title:seg=>seg==='trend'?'Trend & health':'Home',
  segs:[{id:'overview',label:'Overview'},{id:'trend',label:'Trend & health'}],
  render(el,seg){
    if(seg==='trend'){App.nw.render(el);return;}
    if(App.state.sharesLoaded)setTimeout(()=>App.nw.load(),50);
    if(!App.state.sharesLoaded){el.innerHTML=`<div class="skel" style="height:190px;border-radius:20px;margin-bottom:12px"></div>`+App.skeleton(4);return;}
    const pos=C.positions(), {c}=C.combined(pos), k=C.kpis(), r=H.fx();
    const shares=c.value!=null?c.value:c.cost;
    const CL=App.classTotals(), extra=CL.filter(x=>x.on), mt=extra.length?true:null;
    const nw=shares+extra.reduce((s,x)=>s+x.t.value,0);
    const dayCls=c.day>=0?'up':'down';

    // hero
    const hero=`<div class="card hero">
      <div class="lbl">Estimated net worth</div>
      <div class="big">MYR ${fmt(nw)}</div>
      <div class="sub">${c.value!=null?(extra.length?'Shares + '+extra.map(x=>x.key==='asnb'?'ASNB':x.label.toLowerCase()).join(' + ')+' at market value':'Shares at live market value'):'Shares at cost — prices loading'}${r&&c.value!=null?` · ≈ USD ${fmt(nw/r)}`:''}</div>
      <a class="hero-link" href="#home/trend">See trend &amp; health ›</a>
      ${c.dayBase?`<div class="chg ${dayCls}">${c.day>=0?'▲':'▼'} ${c.day>=0?'+':'−'}MYR ${fmt(Math.abs(c.day))} (${fmt(Math.abs(c.dayPct),2)}%) today</div>`:''}
      <div class="hero-split">
        <div><span class="lbl">Unrealised P&amp;L</span><b class="${(c.pnl||0)>=0?'':''}">${c.pnl==null?'—':`${c.pnl>=0?'+':'−'}MYR ${fmt(Math.abs(c.pnl))}`}</b><span class="lbl">${c.pnlPct==null?'':`${c.pnlPct>=0?'+':'−'}${fmt(Math.abs(c.pnlPct))}%`}</span></div>
        <div><span class="lbl">Positions</span><b>${c.n}</b><span class="lbl">${c.wallets} wallet${c.wallets!==1?'s':''}</span></div>
      </div>
    </div>`;
    const wide=App.wide();

    // KPI grid
    const kpis=`<div class="sec"><h2>Share portfolio</h2><span class="note">MYR + USD in MYR</span></div>
    <div class="grid g3 ${wide?'kpi6':''}">
      ${kpiTile('Total invested',k.inv,false,k)}
      ${kpiTile('Market value',k.val,false,k,`${k.priced} of ${k.open} positions priced`)}
      ${kpiTile('Unrealised P&amp;L',k.unr,true,k,k.unrPct==null?'':`${k.unrPct>=0?'+':'−'}${fmt(Math.abs(k.unrPct))}% on cost`)}
      ${kpiTile('Realised P&amp;L',k.real,true,k)}
      ${kpiTile('Dividends',k.div,false,k)}
      ${kpiTile('Net P&amp;L incl. dividends',k.net,true,k)}
    </div>`;

    // assets
    const assets=`<div class="sec"><h2>Assets &amp; liabilities</h2></div>
    <div class="grid g2 gw2" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));">
      <button class="stat tap" style="text-align:left" onclick="App.go('holdings','open')"><div class="lbl">Share holdings</div><div class="val">MYR ${H.k(shares)}</div><div class="sub">${c.n} open positions</div></button>
      ${CL.map(x=>x.on?`<button class="stat tap" style="text-align:left" onclick="App.go('more','${x.key}')"><div class="lbl">${x.label}</div><div class="val">MYR ${H.k(x.t.value)}</div><div class="sub">${x.t.atCost?'at cost':x.t.pnlPct==null?`${x.t.n} held`:`${x.t.pnl>=0?'+':'−'}MYR ${H.k(Math.abs(x.t.pnl))} (${x.t.pnlPct>=0?'+':'−'}${fmt(Math.abs(x.t.pnlPct||0),1)}%)`}</div></button>`
        :`<button class="stat tap muted-card" style="text-align:left" onclick="App.go('more','${x.key}')"><div class="lbl">${x.label}</div><div class="val dim">${x.m.status==='missing'?'Not set up':x.m.status==='ok'?'None yet':'…'}</div><div class="sub">${x.sub}</div></button>`).join('')}
      <div class="stat muted-card"><div class="lbl" style="color:var(--down)">Liabilities</div><div class="val dim">Not set up</div><div class="sub">loans &amp; debt</div></div>
    </div>`;

    // movers
    const priced=pos.filter(p=>p.dayPct!=null);
    let movers='';
    if(priced.length&&wide){
      const by={};priced.forEach(p=>{const b=by[p.sym]||(by[p.sym]={...p,units:0,dayAmt:0,value:0});b.units+=p.units;b.dayAmt+=p.dayAmt;b.value+=p.value;});
      const list=Object.values(by).sort((a,b)=>b.dayPct-a.dayPct);
      movers=`<div class="sec"><h2>Today</h2><span class="note">vs previous close · ${list.length} stocks</span></div>`+H.table(
        [{k:'s',label:'Stock'},{k:'p',label:'Price',cls:'n'},{k:'v',label:'Value',cls:'n'},{k:'d',label:'Today',cls:'n'},{k:'a',label:'Change',cls:'n'}],
        list.map(p=>({on:`App.holdings.openStock('${p.ticker}','${p.market}')`,cells:{
          s:`<div class="t-main">${H.esc(p.label)}</div><div class="t-sub">${H.esc(p.subl||p.ticker)} ${H.ccyTag(p.ccy)}</div>`,
          p:fmt(p.price,p.market==='Bursa'?3:2),v:fmt(p.value),d:H.pill(p.dayPct),
          a:`<span class="${p.dayAmt>=0?'up':'down'}">${p.dayAmt>=0?'+':'−'}${fmt(Math.abs(p.dayAmt))}</span>`}})));
    }else if(priced.length){
      // merge wallets of the same stock for "today" (a move is per stock, not per wallet)
      const by={};priced.forEach(p=>{const b=by[p.sym]||(by[p.sym]={...p,units:0,dayAmt:0,value:0});b.units+=p.units;b.dayAmt+=p.dayAmt;b.value+=p.value;});
      const list=Object.values(by).sort((a,b)=>b.dayPct-a.dayPct);
      movers=`<div class="sec"><h2>Today</h2><span class="note">vs previous close</span></div><div class="list">`+
        list.map(p=>`<button class="lrow" onclick="App.holdings.openStock('${p.ticker}','${p.market}')">
          <div class="ico ${p.ccy==='USD'?'usd':'myr'}">${p.ccy==='USD'?'$':'RM'}</div>
          <div class="main-col"><div class="t1">${H.esc(p.label)}</div><div class="t2">${p.ccy} ${fmt(p.price,p.market==='Bursa'?3:2)} · ${fmt(p.units,0)} units</div></div>
          <div class="end">${H.pill(p.dayPct)}<div class="s ${p.dayAmt>=0?'up':'down'}">${p.dayAmt>=0?'+':'−'}${p.ccy} ${fmt(Math.abs(p.dayAmt))}</div></div>
        </button>`).join('')+`</div>`;
    }

    // alerts
    const al=App.state.alerts.slice(0,wide?6:4);
    let alerts=`<div class="sec"><h2>Price alerts</h2><a class="link" href="#more/alerts">See all</a></div>`;
    alerts+=al.length?`<div class="list">${al.map(App.more.alertRow).join('')}</div>`:
      `<div class="card muted-card"><div class="tiny">No alerts yet. You'll get one when a holding moves −3% or +5% vs previous close during market hours.</div></div>`;

    let html;
    if(wide)html=`<div class="dash-top">${hero}<div class="stack">${App.nw.strip()}${assets.replace('<div class="sec">','<div class="sec" style="margin-top:0">')}</div></div>`+kpis+
      `<div class="dash-two" style="margin-top:30px"><div>${movers||'<div class="card muted-card"><div class="tiny">No live prices yet.</div></div>'}</div><div>${alerts}</div></div>`;
    else html=hero+App.nw.strip()+kpis+assets+movers+alerts;
    html+=`<div class="tiny" style="margin:18px 2px 0;">Net worth = shares${extra.map(x=>' + '+(x.key==='asnb'?'ASNB':x.label.toLowerCase())).join('')} at market value. Cash${CL.filter(x=>!x.on).map(x=>', '+x.label).join('')} and liabilities not included.${r?` USD converted at ${fmt(r,4)} (${kpiFxSrc}).`:''}</div>`;
    el.innerHTML=html;
  }
};
})();
