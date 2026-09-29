/* ===== ASNB: unit trust funds (ASB, ASM, ASN …) =====
   Table "asnb" (mobile/supabase/asnb.sql). Row types:
     Invest   — money in, units bought at the price per unit (RM1.00 for fixed-price funds)
     Withdraw — money out, units sold
     Dividend / Bonus — yearly distribution; reinvested as units (default) or paid out (units 0)
     Price    — latest price per unit for a variable-price fund (ASN Equity, Imbang, Sara …)
   Value = units × price (fixed-price funds are always RM1.00). Cost = what you put in, at average cost. */
(function(){
const H=App.h, $=id=>document.getElementById(id);
const FIXED=['ASB','ASB 2','ASB 3 Didik','ASB Financing','ASM','ASM 2 Wawasan','ASM 3'];
const VARIABLE=['ASN','ASN Equity 2','ASN Equity 3','ASN Equity 5','ASN Equity Global','ASN Equity Malaysia','ASN Imbang 1','ASN Imbang 2',
  'ASN Imbang 3 Global','ASN Sara 1','ASN Sara 2','ASN Sukuk','ASN Income Growth'];
const isFixed=f=>FIXED.some(x=>x.toLowerCase()===String(f||'').trim().toLowerCase());
const TYPES=[['Invest','↓ Invest'],['Withdraw','↑ Withdraw'],['Dividend','Dividend'],['Bonus','Bonus'],['Price','Price']];
/* Reference: ASB distribution per unit (sen) by financial year (dividend + bonus) — StashAway / PNB press releases */
const ASB_HIST=[[2025,5.20,0.55],[2024,5.50,0.25],[2023,4.25,1.00],[2022,3.35,1.75],[2021,4.25,0.75],[2020,3.50,1.50],[2019,5.00,0.50],
  [2018,6.50,0.50],[2017,7.00,0.25],[2016,6.75,0.50],[2015,7.25,0.50],[2014,7.50,1.00]];
const OTHER_REF=[['ASB 2','FY to 31 Mar 2026','5.50 sen (5.25 the year before)'],['ASM','FY to 31 Mar 2026','5.00 sen (4.75 the year before)']];

const A=App.asnb={rows:[],status:'loading',err:''};

/* ---------- data ---------- */
A.load=async()=>{
  A.status='loading';
  const {data,error}=await sb.from('asnb').select('*').order('txn_date',{ascending:false}).order('created_at',{ascending:false});
  if(error){console.error('asnb',error);A.rows=[];A.err=error.message||'';A.status=/does not exist|schema cache|relation/i.test(A.err)?'missing':'error';}
  else{A.rows=data||[];A.status='ok';}
  App.refreshView();
};
A.isFixed=isFixed;
const chron=rows=>[...rows].sort((a,b)=>String(a.txn_date).localeCompare(String(b.txn_date))||String(a.created_at).localeCompare(String(b.created_at)));
/* apply one row to a fund position (shared with the net worth timeline) */
A.apply=(p,r)=>{
  const u=Number(r.units)||0,amt=Number(r.amount_myr)||0,nav=Number(r.nav)||null;
  if(nav)p.nav=nav;
  if(r.tx_type==='Invest'){p.units+=u;p.cost+=amt;p.invested+=amt;}
  else if(r.tx_type==='Withdraw'){const avg=p.units>0?p.cost/p.units:0,take=Math.min(u,p.units);p.cost-=avg*take;p.units-=take;p.withdrawn+=amt;p.realised+=amt-avg*take;}
  else if(r.tx_type==='Dividend'||r.tx_type==='Bonus'){p.units+=u;p.income+=amt;if(!u)p.paidOut+=amt;
    const y=String(r.txn_date).slice(0,4);p.byYear[y]=(p.byYear[y]||0)+amt;}
  if(p.units<1e-9){p.units=0;p.cost=0;}
};
A.newPos=fund=>({fund,fixed:isFixed(fund),units:0,cost:0,invested:0,withdrawn:0,realised:0,income:0,paidOut:0,byYear:{},nav:isFixed(fund)?1:null,n:0,since:null});
A.positions=()=>{
  const by={};
  chron(A.rows).forEach(r=>{const p=by[r.fund]||(by[r.fund]=A.newPos(r.fund));p.n++;if(!p.since)p.since=r.txn_date;A.apply(p,r);});
  return Object.values(by).map(p=>{
    if(p.fixed)p.nav=1;
    p.value=p.nav!=null?p.units*p.nav:null;
    p.gain=p.value!=null?p.value-p.cost+p.paidOut:null;             // reinvested dividends are inside value; paid-out ones added back
    p.gainPct=p.gain!=null&&p.cost>0?p.gain/p.cost*100:null;
    p.pnlPct=p.value!=null&&p.cost>0?(p.value/p.cost-1)*100:null;
    return p;
  }).sort((a,b)=>(b.value||0)-(a.value||0));
};
A.totals=()=>{
  const ps=A.positions(),t={cost:0,value:0,income:0,atCost:false,n:ps.filter(p=>p.units>0).length,byYear:{}};
  ps.forEach(p=>{t.cost+=p.cost;t.income+=p.income;if(p.value!=null)t.value+=p.value;else{t.value+=p.cost;if(p.units>0)t.atCost=true;}
    Object.entries(p.byYear).forEach(([y,v])=>t.byYear[y]=(t.byYear[y]||0)+v);});
  t.pnl=t.value-t.cost;t.pnlPct=t.cost>0?t.pnl/t.cost*100:null;return t;
};
A.menuSub=()=>A.status==='missing'?'Tap to set up':A.status!=='ok'?'loading…':!A.rows.length?'ASB, ASM, ASN — none recorded yet':`MYR ${fmt(A.totals().value)} · ${A.totals().n} fund${A.totals().n!==1?'s':''}`;

/* ---------- screen ---------- */
const uf=u=>fmt(u,Number(u)%1?2:0);
function fundCard(p){
  return `<div class="stat" style="padding:14px 16px">
    <div class="dhead" style="margin:0"><div style="min-width:0"><div class="t1" style="font-weight:800;font-size:16px">${H.esc(p.fund)}</div>
      <div class="sub" style="font-size:12px">${p.fixed?'Fixed price · RM1.00 a unit':p.nav!=null?`Variable price · RM ${fmt(p.nav,4)} a unit`:'Variable price — add a Price record'}</div></div>
      <div style="text-align:right"><div style="font-weight:800;font-size:17px">MYR ${fmt(p.value!=null?p.value:p.cost)}</div><div class="sub" style="font-size:12px">${uf(p.units)} units</div></div></div>
    <div class="kv" style="margin-top:8px"><span>Put in (net)</span><span>MYR ${fmt(p.cost)}</span></div>
    <div class="kv"><span>Dividends &amp; bonus received</span><span class="up">MYR ${fmt(p.income)}</span></div>
    <div class="kv"><span>Total gain</span><span>${p.gain==null?'—':`${H.money('MYR',p.gain,true)} · ${H.pct(p.gainPct)}`}</span></div>
  </div>`;
}
A.row=r=>{
  const t=r.tx_type,inc=t==='Dividend'||t==='Bonus';
  const cls=t==='Invest'?'buy':t==='Withdraw'?'sell':inc?'div':'myr',ic=t==='Invest'?'↓':t==='Withdraw'?'↑':inc?'%':'RM';
  return `<button class="lrow" onclick="App.asnb.open('${r.id}')"><div class="ico ${cls}">${ic}</div>
    <div class="main-col"><div class="t1">${H.esc(r.fund)} · ${t}</div>
      <div class="t2">${H.dateShort(r.txn_date)}${t==='Price'?` · RM ${fmt(r.nav,4)} a unit`:` · ${uf(r.units)} units${inc&&!Number(r.units)?' · paid out':''}`}</div></div>
    <div class="end">${t==='Price'?'':`<div class="v ${t==='Invest'?'':'up'}">${t==='Invest'?'−':'+'}MYR ${fmt(r.amount_myr)}</div>`}<div class="s dim">${t}</div></div></button>`;
};
function reference(){
  const mx=Math.max(...ASB_HIST.map(r=>r[1]+r[2]));
  return `<div class="card">
    <div class="t-head">ASB distribution per unit, by year</div>
    <p class="sub" style="font-size:13px;margin-top:4px">Dividend + bonus in sen per RM1 unit (so 5.75 sen ≈ 5.75% a year). ASB is fixed at RM1.00 a unit; up to RM300,000 per person.</p>
    <div class="ref-bars">${ASB_HIST.map(([y,d,b])=>`<div class="rb"><span class="rb-y">${y}</span>
      <span class="rb-t"><i style="width:${d/mx*100}%;background:#0aa79f"></i><i style="width:${b/mx*100}%;background:#e8b04a"></i></span>
      <span class="rb-v">${fmt(d+b,2)}</span></div>`).join('')}</div>
    <div class="rb-leg"><span><i style="background:#0aa79f"></i>Dividend</span><span><i style="background:#e8b04a"></i>Bonus</span></div>
    <div class="form-sec" style="margin-top:12px">Other fixed-price funds · latest</div>
    ${OTHER_REF.map(([f,y,v])=>`<div class="kv"><span>${f} <span class="dim" style="font-weight:600">· ${y}</span></span><span>${v}</span></div>`).join('')}
    <div class="tiny" style="margin-top:10px">2020 and 2022 include an extra 0.75 / 0.50 sen bonus paid only on the first 30,000 units. Past distributions don't guarantee future ones. Sources: PNB press releases, iMoney, MySumber, StashAway.</div></div>`;
}
A.render=el=>{
  if(A.status==='loading'){el.innerHTML=App.skeleton(4);return;}
  if(A.status==='missing'){el.innerHTML=`<div class="card"><div class="val">One-time setup</div>
    <p class="sub" style="margin-top:8px;font-size:14px">The <b>asnb</b> table isn't in Supabase yet. Supabase → SQL Editor → paste <b>mobile/supabase/asnb.sql</b> → Run. Then tap Retry.</p>
    <button class="btn btn-p" style="width:100%;margin-top:14px" onclick="App.asnb.load()">Retry</button></div>`+`<div class="sec"><h2>Reference</h2></div>`+reference();return;}
  if(A.status==='error'){el.innerHTML=`<div class="notice warn">Couldn't load ASNB: ${H.esc(A.err)}</div><button class="btn btn-s" style="width:100%;margin-top:12px" onclick="App.asnb.load()">Retry</button>`;return;}
  const ps=A.positions(),held=ps.filter(p=>p.units>0),t=A.totals(),yr=String(new Date().getFullYear());
  let html='';
  if(A.rows.length){
    html+=`<div class="card hero"><div class="lbl">ASNB value</div><div class="big">MYR ${fmt(t.value)}</div>
      <div class="sub">Put in MYR ${fmt(t.cost)} (net of withdrawals)</div>
      <div class="hero-split">
        <div><span class="lbl">Dividends &amp; bonus</span><b>MYR ${fmt(t.income)}</b><span class="lbl">all time</span></div>
        <div><span class="lbl">This year</span><b>MYR ${fmt(t.byYear[yr]||0)}</b><span class="lbl">${yr}</span></div>
        <div><span class="lbl">Funds</span><b>${t.n}</b><span class="lbl">active</span></div>
      </div></div>`;
    if(held.length)html+=`<div class="sec"><h2>Funds</h2></div><div class="grid gw2">${held.map(fundCard).join('')}</div>`;
    const ys=Object.keys(t.byYear).sort().reverse();
    if(ys.length)html+=`<div class="sec"><h2>Dividends &amp; bonus by year</h2></div><div class="list">${ys.map(y=>{
      return `<div class="lrow"><div class="main-col"><div class="t1">${y}</div><div class="t2">${ps.filter(p=>p.byYear[y]).map(p=>`${H.esc(p.fund)} MYR ${fmt(p.byYear[y])}`).join(' · ')}</div></div>
        <div class="end"><div class="v up">MYR ${fmt(t.byYear[y])}</div></div></div>`;}).join('')}</div>`;
  }
  html+=`<div class="sec"><h2>Records</h2><span class="note">${A.rows.length} record${A.rows.length!==1?'s':''}</span></div>`;
  html+=A.rows.length?`<div class="list">${A.rows.map(A.row).join('')}</div>`:
    `<div class="card muted-card"><div class="empty" style="padding:22px 8px">No ASNB records yet.<br>Tap <b>+ Add</b> to record your balance or first investment.</div></div>`;
  html+=`<div class="tiny" style="margin-top:8px">Tip: to start quickly, add one <b>Invest</b> per fund with today's date and your current units — then add dividends as they're paid.</div>`;
  html+=`<div class="sec"><h2>Reference</h2><span class="note">past distributions</span></div>`+reference();
  el.innerHTML=html;
};

/* ---------- detail ---------- */
A.open=id=>{
  const r=A.rows.find(x=>x.id===id);if(!r)return;
  const kv=(k,v)=>`<div class="kv"><span>${k}</span><span>${v}</span></div>`,t=r.tx_type;
  App.openSheet({title:`${r.fund} · ${t}`,sub:H.date(r.txn_date),
    body:`<div class="card" style="margin:0">${kv('Fund',H.esc(r.fund))}${kv('Type',t)}
      ${t!=='Price'?kv(t==='Invest'?'Paid':t==='Withdraw'?'Received':'Amount',`MYR ${fmt(r.amount_myr)}`)+kv('Units',uf(r.units)):''}
      ${kv('Price per unit',r.nav?`RM ${fmt(r.nav,4)}`:'—')}${(t==='Dividend'||t==='Bonus')?kv('Reinvested',Number(r.units)?'Yes, as units':'No, paid out'):''}
      ${r.notes?kv('Notes',H.esc(r.notes)):''}</div>`,
    foot:`<button class="btn btn-d" onclick="App.asnb.del('${r.id}')">Delete</button><button class="btn btn-p" onclick="App.asnb.form('${r.id}')">Edit</button>`});
};
A.del=async id=>{
  const r=A.rows.find(x=>x.id===id);if(!r)return;
  if(!confirm(`Delete this ${r.fund} ${r.tx_type.toLowerCase()} on ${r.txn_date}?`))return;
  const {error}=await sb.from('asnb').delete().eq('id',id);
  if(error){showToast('Delete failed — '+error.message);return;}
  App.closeSheet();showToast('Deleted ✓');A.load();
};

/* ---------- add / edit ---------- */
A.form=id=>{
  const r=id?A.rows.find(x=>x.id===id):null;
  const funds=[...new Set([...A.rows.map(x=>x.fund),...FIXED,...VARIABLE])];
  const cur=r?r.tx_type:'Invest';
  const body=`
    <div class="opts" data-opt="atype" style="flex-wrap:wrap">${TYPES.map(([v,l])=>`<button type="button" data-v="${v}" class="${v===cur?'on':''}">${l}</button>`).join('')}</div>
    <div class="frow" style="margin-top:14px">
      <label class="fld"><span>Fund</span><input id="aFund" list="aList" autocomplete="off" placeholder="e.g. ASB" value="${H.esc(r?r.fund:'ASB')}"></label>
      <label class="fld"><span>Date</span><input type="date" id="aDate" value="${r?r.txn_date:H.today()}"></label>
    </div><datalist id="aList">${funds.map(f=>`<option value="${H.esc(f)}">${isFixed(f)?'fixed RM1.00':'variable price'}</option>`).join('')}</datalist>
    <div class="tiny" id="aKind" style="margin:-8px 0 12px"></div>
    <label class="fld" id="aAmtW"><span id="aAmtLbl">Amount (MYR)</span><input type="number" inputmode="decimal" id="aAmt" step="any" min="0" placeholder="0.00" value="${r&&r.tx_type!=='Price'?r.amount_myr:''}"></label>
    <div class="frow">
      <label class="fld"><span>Price per unit (RM)</span><input type="number" inputmode="decimal" id="aNav" step="any" min="0" placeholder="1.0000" value="${r&&r.nav?Number(r.nav):''}"></label>
      <label class="fld" id="aUnitsW"><span>Units</span><input type="number" inputmode="decimal" id="aUnits" step="any" min="0" placeholder="auto" value="${r&&r.tx_type!=='Price'?Number(r.units):''}"></label>
    </div>
    <label class="fld" id="aReW" style="display:flex;align-items:center;gap:10px"><input type="checkbox" id="aRe" style="width:22px;height:22px" ${!r||Number(r.units)?'checked':''}><span style="margin:0">Reinvested as units (ASNB default)</span></label>
    <label class="fld"><span>Notes (optional)</span><input id="aNotes" placeholder="e.g. myASNB ref, via Maybank2u" value="${H.esc(r?r.notes||'':'')}"></label>
    <div class="form-err" id="aErr"></div>`;
  App.openSheet({title:r?'Edit ASNB record':'Add ASNB record',sub:r?`${r.fund} · ${H.date(r.txn_date)}`:'',body,full:true,
    foot:`<button class="btn btn-s" onclick="App.closeSheet()">Cancel</button><button class="btn btn-p" id="aSave">${r?'Save changes':'Save'}</button>`});
  const type=()=>{const b=document.querySelector('.opts[data-opt="atype"] button.on');return b?b.dataset.v:'Invest';};
  let unitsTouched=!!r;
  const upd=()=>{
    const t=type(),f=$('aFund').value.trim(),fx=isFixed(f),inc=t==='Dividend'||t==='Bonus';
    $('aKind').textContent=f?(fx?'Fixed-price fund — always RM1.00 a unit.':'Variable-price fund — enter the price per unit on that date.'):'';
    if(fx){$('aNav').value='1';$('aNav').readOnly=true;}else $('aNav').readOnly=false;
    $('aAmtW').hidden=t==='Price';$('aUnitsW').hidden=t==='Price';$('aReW').style.display=inc?'flex':'none';
    $('aAmtLbl').textContent=t==='Invest'?'Amount invested (MYR)':t==='Withdraw'?'Amount withdrawn (MYR)':inc?`${t} amount (MYR)`:'Amount (MYR)';
    const amt=parseFloat($('aAmt').value)||0,nav=parseFloat($('aNav').value)||0;
    if(!unitsTouched){$('aUnits').value=amt>0&&nav>0&&!(inc&&!$('aRe').checked)?(amt/nav).toFixed(fx?2:4).replace(/\.?0+$/,''):inc&&!$('aRe').checked?'0':'';}
  };
  document.querySelectorAll('.opts[data-opt="atype"] button').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('.opts[data-opt="atype"] button').forEach(x=>x.className='');b.className='on';unitsTouched=false;upd();});
  ['aFund','aAmt','aNav'].forEach(i=>$(i).addEventListener('input',()=>{if(i!=='aFund'||true)upd();}));
  $('aUnits').addEventListener('input',()=>{unitsTouched=true;});
  $('aRe').addEventListener('change',()=>{unitsTouched=false;upd();});
  upd();
  $('aSave').onclick=async()=>{
    const err=$('aErr');err.textContent='';
    const t=type(),f=$('aFund').value.trim(),d=$('aDate').value,nav=parseFloat($('aNav').value),inc=t==='Dividend'||t==='Bonus';
    const amt=parseFloat($('aAmt').value),units=parseFloat($('aUnits').value);
    if(!f){err.textContent='Enter the fund, e.g. ASB.';return;}
    if(!d){err.textContent='Select a date.';return;}
    if(t==='Price'){if(isFixed(f)){err.textContent=f+' is fixed at RM1.00 — no price update needed.';return;}if(!(nav>0)){err.textContent='Enter the price per unit.';return;}}
    else{
      if(!(amt>0)){err.textContent='Enter the amount.';return;}
      if(!(nav>0)){err.textContent='Enter the price per unit.';return;}
      if(isNaN(units)||units<0||(!inc&&!(units>0))){err.textContent='Enter the number of units.';return;}
      if(t==='Withdraw'){const p=A.positions().find(x=>x.fund===f),have=(p?p.units:0)+(r&&r.tx_type==='Withdraw'&&r.fund===f?Number(r.units):0);
        if(units>have+1e-6&&!confirm(`You're withdrawing ${uf(units)} units but only ${uf(have)} are recorded in ${f}. Save anyway?`))return;}
    }
    const payload={tx_type:t,txn_date:d,fund:f,units:t==='Price'?0:parseFloat(units.toFixed(4)),amount_myr:t==='Price'?0:parseFloat(amt.toFixed(2)),
      nav:nav>0?nav:null,notes:$('aNotes').value.trim()||null,updated_at:new Date().toISOString()};
    const btn=$('aSave');btn.disabled=true;btn.textContent='Saving…';
    const {error}=r?await sb.from('asnb').update(payload).eq('id',r.id):await sb.from('asnb').insert(payload);
    btn.disabled=false;btn.textContent=r?'Save changes':'Save';
    if(error){err.textContent=error.message;return;}
    App.closeSheet();showToast(`${f} ${t.toLowerCase()} saved ✓`);A.load();
  };
};
})();
