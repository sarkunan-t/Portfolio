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
  title:'Home',
  render(el){
    if(!App.state.sharesLoaded){el.innerHTML=`<div class="skel" style="height:190px;border-radius:20px;margin-bottom:12px"></div>`+App.skeleton(4);return;}
    const pos=C.positions(), {c}=C.combined(pos), k=C.kpis(), r=H.fx();
    const shares=c.value!=null?c.value:c.cost;
    const Mt=App.metals, mOn=Mt.status==='ok'&&Mt.rows.length>0, mt=mOn?Mt.totals():null;
    const nw=shares+(mt?mt.value:0);
    const dayCls=c.day>=0?'up':'down';

    // hero
    let html=`<div class="card hero">
      <div class="lbl">Estimated net worth</div>
      <div class="big">MYR ${fmt(nw)}</div>
      <div class="sub">${c.value!=null?(mt?'Shares + metals at market value':'Shares at live market value'):'Shares at cost — prices loading'}${r&&c.value!=null?` · ≈ USD ${fmt(nw/r)}`:''}</div>
      ${c.dayBase?`<div class="chg ${dayCls}">${c.day>=0?'▲':'▼'} ${c.day>=0?'+':'−'}MYR ${fmt(Math.abs(c.day))} (${fmt(Math.abs(c.dayPct),2)}%) today</div>`:''}
      <div class="hero-split">
        <div><span class="lbl">Unrealised P&amp;L</span><b class="${(c.pnl||0)>=0?'':''}">${c.pnl==null?'—':`${c.pnl>=0?'+':'−'}MYR ${fmt(Math.abs(c.pnl))}`}</b><span class="lbl">${c.pnlPct==null?'':`${c.pnlPct>=0?'+':'−'}${fmt(Math.abs(c.pnlPct))}%`}</span></div>
        <div><span class="lbl">Positions</span><b>${c.n}</b><span class="lbl">${c.wallets} wallet${c.wallets!==1?'s':''}</span></div>
      </div>
    </div>`;

    // KPI grid
    html+=`<div class="sec"><h2>Share portfolio</h2><span class="note">MYR + USD in MYR</span></div>
    <div class="grid g3">
      ${kpiTile('Total invested',k.inv,false,k)}
      ${kpiTile('Market value',k.val,false,k,`${k.priced} of ${k.open} positions priced`)}
      ${kpiTile('Unrealised P&amp;L',k.unr,true,k,k.unrPct==null?'':`${k.unrPct>=0?'+':'−'}${fmt(Math.abs(k.unrPct))}% on cost`)}
      ${kpiTile('Realised P&amp;L',k.real,true,k)}
      ${kpiTile('Dividends',k.div,false,k)}
      ${kpiTile('Net P&amp;L incl. dividends',k.net,true,k)}
    </div>`;

    // assets
    html+=`<div class="sec"><h2>Assets &amp; liabilities</h2></div>
    <div class="grid g2 gw2" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));">
      <button class="stat tap" style="text-align:left" onclick="App.go('holdings','open')"><div class="lbl">Share holdings</div><div class="val">MYR ${H.k(shares)}</div><div class="sub">${c.n} open positions</div></button>
      ${mOn?`<button class="stat tap" style="text-align:left" onclick="App.go('more','metals')"><div class="lbl">Metals</div><div class="val">MYR ${H.k(mt.value)}</div><div class="sub">${mt.atCost?'at cost':`${mt.pnl>=0?'+':'−'}MYR ${H.k(Math.abs(mt.pnl))} (${mt.pnlPct>=0?'+':'−'}${fmt(Math.abs(mt.pnlPct||0),1)}%)`}</div></button>`
        :`<button class="stat tap muted-card" style="text-align:left" onclick="App.go('more','metals')"><div class="lbl">Metals</div><div class="val dim">${Mt.status==='missing'?'Not set up':'None yet'}</div><div class="sub">gold &amp; silver</div></button>`}
      <button class="stat tap muted-card" style="text-align:left" onclick="App.go('more','asnb')"><div class="lbl">ASNB</div><div class="val dim">Not set up</div><div class="sub">unit trusts</div></button>
      <div class="stat muted-card"><div class="lbl" style="color:var(--down)">Liabilities</div><div class="val dim">Not set up</div><div class="sub">loans &amp; debt</div></div>
    </div>`;

    // movers
    const priced=pos.filter(p=>p.dayPct!=null);
    if(priced.length){
      // merge wallets of the same stock for "today" (a move is per stock, not per wallet)
      const by={};priced.forEach(p=>{const b=by[p.sym]||(by[p.sym]={...p,units:0,dayAmt:0,value:0});b.units+=p.units;b.dayAmt+=p.dayAmt;b.value+=p.value;});
      const list=Object.values(by).sort((a,b)=>b.dayPct-a.dayPct);
      html+=`<div class="sec"><h2>Today</h2><span class="note">vs previous close</span></div><div class="list">`+
        list.map(p=>`<button class="lrow" onclick="App.holdings.openStock('${p.ticker}','${p.market}')">
          <div class="ico ${p.ccy==='USD'?'usd':'myr'}">${p.ccy==='USD'?'$':'RM'}</div>
          <div class="main-col"><div class="t1">${H.esc(p.label)}</div><div class="t2">${p.ccy} ${fmt(p.price,p.market==='Bursa'?3:2)} · ${fmt(p.units,0)} units</div></div>
          <div class="end">${H.pill(p.dayPct)}<div class="s ${p.dayAmt>=0?'up':'down'}">${p.dayAmt>=0?'+':'−'}${p.ccy} ${fmt(Math.abs(p.dayAmt))}</div></div>
        </button>`).join('')+`</div>`;
    }

    // alerts
    const al=App.state.alerts.slice(0,4);
    html+=`<div class="sec"><h2>Price alerts</h2><a class="link" href="#more/alerts">See all</a></div>`;
    html+=al.length?`<div class="list">${al.map(App.more.alertRow).join('')}</div>`:
      `<div class="card muted-card"><div class="tiny">No alerts yet. You'll get one when a holding moves −3% or +5% vs previous close during market hours.</div></div>`;

    html+=`<div class="tiny" style="margin:18px 2px 0;">${mt?'Net worth = shares + metals (at spot). ASNB':'Shares only — ASNB'} and liabilities not tracked yet.${r?` USD converted at ${fmt(r,4)} (${kpiFxSrc}).`:''}</div>`;
    el.innerHTML=html;
  }
};
})();
