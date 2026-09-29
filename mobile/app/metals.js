/* ===== Metals: gold, silver & other precious metals =====
   Table "metals" (mobile/supabase/metals.sql): one row per Buy or Sell.
   Holdings are tracked in PURE grams (weight × purity) so 916 jewellery and
   999.9 bars add up correctly. Average-cost method per metal, like shares.
   Value = pure grams × spot (Yahoo futures, USD/troy oz → MYR/g at the app's USD/MYR). */
(function(){
const H=App.h, $=id=>document.getElementById(id);
const OZ=31.1034768;
const METALS=[
  {id:'Gold',sym:'GC=F',abbr:'Au',cls:'div'},
  {id:'Silver',sym:'SI=F',abbr:'Ag',cls:'ag'},
  {id:'Platinum',sym:'PL=F',abbr:'Pt',cls:'ag'},
  {id:'Palladium',sym:'PA=F',abbr:'Pd',cls:'ag'},
  {id:'Other',sym:null,abbr:'··',cls:'myr'}
];
const meta=id=>METALS.find(m=>m.id===id)||METALS[METALS.length-1];
const FORMS=[['Bar','Bar'],['Coin','Coin'],['Jewellery','Jewellery'],['Account','Gold account'],['Other','Other']];
const PURITY=[['0.9999','999.9 · 24K'],['0.999','999 · fine'],['0.916','916 · 22K'],['0.875','875 · 21K'],['0.75','750 · 18K'],
  ['0.925','925 · sterling'],['custom','Other…']];
const UNITS=[['g','grams',1],['oz','troy oz',OZ],['kg','kg',1000]];
const DEALERS=['Public Gold','Maybank (MIGA)','Poh Kong','Habib Jewels','UOB','CIMB','Tomei'];
const purityLbl=p=>{const v=Number(p);const hit=PURITY.find(x=>Number(x[0])===v);return hit?hit[1].split(' · ')[0]:fmt(v*1000,1).replace(/\.0$/,'');};

const M=App.metals={rows:[],status:'loading',err:'',spot:{},spotAt:null,spotStatus:'idle'};

/* ---------- data ---------- */
M.load=async()=>{
  M.status='loading';
  const {data,error}=await sb.from('metals').select('*').order('txn_date',{ascending:false}).order('created_at',{ascending:false});
  if(error){
    console.error('metals',error);M.rows=[];M.err=error.message||'';
    M.status=/does not exist|schema cache|relation/i.test(M.err)?'missing':'error';
  }else{M.rows=data||[];M.status='ok';}
  App.refreshView();
  if(M.status==='ok')M.loadSpot();
};
M.loadSpot=async()=>{
  const held=new Set(M.rows.map(r=>r.metal));
  const syms=METALS.filter(m=>m.sym&&(m.id==='Gold'||m.id==='Silver'||held.has(m.id))).map(m=>m.sym);
  M.spotStatus='loading';App.refreshView();
  try{
    const d=await invokeQuote({symbols:syms});
    syms.forEach(s=>{const q=d&&(d[s]||d[s.toUpperCase()]);
      M.spot[s]=q&&!q.error&&q.price!=null?{usdOz:Number(q.price),prev:q.prevClose!=null?Number(q.prevClose):null}:null;});
    M.spotAt=new Date();M.spotStatus=syms.some(s=>M.spot[s])?'ok':'error';
  }catch(e){console.error('metal spot',e);M.spotStatus='error';}
  App.refreshView();
};
/* MYR per pure gram (null until spot + USD/MYR are both known) */
M.spotG=metal=>{const m=meta(metal),s=m.sym&&M.spot[m.sym],r=H.fx();return s&&r?s.usdOz*r/OZ:null;};
M.spotDayPct=metal=>{const m=meta(metal),s=m.sym&&M.spot[m.sym];return s&&s.prev?(s.usdOz-s.prev)/s.prev*100:null;};

M.positions=()=>{
  const by={};
  [...M.rows].sort((a,b)=>String(a.txn_date).localeCompare(String(b.txn_date))||String(a.created_at).localeCompare(String(b.created_at)))
  .forEach(r=>{
    const p=by[r.metal]||(by[r.metal]={metal:r.metal,gross:0,pure:0,cost:0,realised:0,n:0,sells:0});
    const w=Number(r.weight_g)||0, pure=w*(Number(r.purity)||1), amt=Number(r.amount_myr)||0;
    p.n++;
    if(r.tx_type==='Sell'){
      const avg=p.pure>0?p.cost/p.pure:0, take=Math.min(pure,p.pure), costOut=avg*take;
      p.realised+=amt-costOut;p.cost-=costOut;p.pure-=take;p.gross=Math.max(0,p.gross-w);p.sells++;
    }else{p.pure+=pure;p.gross+=w;p.cost+=amt;}
  });
  return METALS.map(m=>by[m.id]).filter(Boolean).map(p=>{
    if(p.pure<1e-6){p.pure=0;p.cost=0;}
    const g=M.spotG(p.metal);
    p.value=g!=null?p.pure*g:null;
    p.pnl=p.value!=null?p.value-p.cost:null;
    p.pnlPct=p.pnl!=null&&p.cost>0?p.pnl/p.cost*100:null;
    p.avgG=p.pure>0?p.cost/p.pure:null;
    return p;
  });
};
/* totals for Home / net worth — metals without a spot price count at cost */
M.totals=()=>{
  const ps=M.positions();
  const t={cost:0,value:0,pnl:0,realised:0,pure:{},atCost:false,n:ps.filter(p=>p.pure>0).length};
  ps.forEach(p=>{t.cost+=p.cost;t.realised+=p.realised;t.pure[p.metal]=p.pure;
    if(p.value!=null){t.value+=p.value;t.pnl+=p.pnl;}else{t.value+=p.cost;if(p.pure>0)t.atCost=true;}});
  t.pnlPct=t.cost>0?t.pnl/t.cost*100:null;
  return t;
};

/* one-line summary for the More menu and Home tile */
M.menuSub=()=>{
  if(M.status==='missing')return 'Tap to set up';
  if(M.status!=='ok')return 'loading…';
  if(!M.rows.length)return 'Gold, silver & more — none recorded yet';
  const t=M.totals();return `MYR ${fmt(t.value)}${t.pure.Gold?` · ${fmt(t.pure.Gold,2)} g gold`:''}`;
};

/* ---------- screen ---------- */
const kgFmt=g=>g>=1000?`${fmt(g/1000,3)} kg`:`${fmt(g,g<1?3:2)} g`;
function spotTiles(){
  const r=H.fx();
  const tile=id=>{const s=M.spot[meta(id).sym],g=M.spotG(id);
    return `<div class="stat"><div class="lbl">${id} spot · per gram</div>
      <div class="val">${g!=null?`MYR ${fmt(g)}`:M.spotStatus==='loading'||(!r&&s)?'<span class="dim">loading…</span>':'<span class="dim">—</span>'}</div>
      <div class="sub">${s?`US$ ${fmt(s.usdOz)}/oz `:''}${H.pill(M.spotDayPct(id))}</div></div>`;};
  return `<div class="grid g2">${tile('Gold')}${tile('Silver')}</div>`;
}
function posRow(p){
  const m=meta(p.metal);
  return `<div class="lrow"><div class="ico ${m.cls}">${m.abbr}</div>
    <div class="main-col"><div class="t1">${p.metal}</div>
      <div class="t2">${kgFmt(p.pure)} pure${p.avgG!=null?` · avg MYR ${fmt(p.avgG)}/g`:''}</div></div>
    <div class="end"><div class="v">${p.value!=null?`MYR ${fmt(p.value)}`:`MYR ${fmt(p.cost)}`}</div>
      <div class="s">${p.pnl!=null?`${H.money('MYR',p.pnl,true)} · ${H.pct(p.pnlPct)}`:'<span class="dim">at cost</span>'}</div></div></div>`;
}
M.row=r=>{
  const buy=r.tx_type!=='Sell', m=meta(r.metal), w=Number(r.weight_g), perG=w>0?Number(r.amount_myr)/w:null;
  const title=r.item||`${r.metal} ${(FORMS.find(f=>f[0]===r.form)||['',''])[1].toLowerCase()}`.trim();
  return `<button class="lrow" onclick="App.metals.open('${r.id}')">
    <div class="ico ${buy?m.cls:'sell'}">${buy?m.abbr:'▼'}</div>
    <div class="main-col"><div class="t1">${H.esc(title)}</div>
      <div class="t2">${H.dateShort(r.txn_date)} · ${kgFmt(w)} · ${purityLbl(r.purity)}${r.dealer?' · '+H.esc(r.dealer):''}</div></div>
    <div class="end"><div class="v ${buy?'':'up'}">${buy?'−':'+'}MYR ${fmt(r.amount_myr)}</div>
      <div class="s dim">${perG!=null?`MYR ${fmt(perG)}/g`:''}</div></div></button>`;
};

M.render=el=>{
  if(M.status==='loading'){el.innerHTML=App.skeleton(4);return;}
  if(M.status==='missing'){
    el.innerHTML=`<div class="card"><div class="val">One-time setup</div>
      <p class="sub" style="margin-top:8px;font-size:14px">The <b>metals</b> table isn't in Supabase yet. Open Supabase → SQL Editor, paste the contents of <b>mobile/supabase/metals.sql</b> from the repo, and press Run. Then come back and tap Retry.</p>
      <button class="btn btn-p" style="width:100%;margin-top:14px" onclick="App.metals.load()">Retry</button></div>`;
    return;
  }
  if(M.status==='error'){el.innerHTML=`<div class="notice warn">Couldn't load metals: ${H.esc(M.err)}</div>
    <button class="btn btn-s" style="width:100%;margin-top:12px" onclick="App.metals.load()">Retry</button>`;return;}

  const ps=M.positions(), t=M.totals(), held=ps.filter(p=>p.pure>0);
  let html='';
  if(M.rows.length){
    html+=`<div class="card hero">
      <div class="lbl">Metals value</div>
      <div class="big">MYR ${fmt(t.value)}</div>
      <div class="sub">${t.atCost?'Part at cost — spot price loading':'At today\'s spot price'} · cost MYR ${fmt(t.cost)}</div>
      <div class="hero-split">
        <div><span class="lbl">Unrealised P&amp;L</span><b>${t.atCost&&!t.pnl?'—':`${t.pnl>=0?'+':'−'}MYR ${fmt(Math.abs(t.pnl))}`}</b><span class="lbl">${t.pnlPct==null||t.atCost?'':`${t.pnlPct>=0?'+':'−'}${fmt(Math.abs(t.pnlPct))}%`}</span></div>
        ${t.pure.Gold?`<div><span class="lbl">Gold held</span><b>${kgFmt(t.pure.Gold)}</b><span class="lbl">pure</span></div>`:''}
        ${t.realised?`<div><span class="lbl">Realised P&amp;L</span><b>${t.realised>=0?'+':'−'}MYR ${fmt(Math.abs(t.realised))}</b><span class="lbl">from sales</span></div>`:''}
      </div></div>`;
  }
  html+=`<div class="sec"><h2>Spot price</h2><span class="note">${M.spotAt?M.spotAt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):''}</span></div>${spotTiles()}
    ${M.spotStatus==='error'?'<div class="notice warn">Spot price unavailable right now — holdings shown at cost. Tap refresh to try again.</div>':''}
    <div class="tiny" style="margin-top:8px">COMEX futures via Yahoo, about 15 min delayed, for pure metal. Dealers buy back a little below spot and sell above it.</div>`;
  if(held.length)html+=`<div class="sec"><h2>Holdings</h2><span class="note">by metal</span></div><div class="list">${held.map(posRow).join('')}</div>`;
  html+=`<div class="sec"><h2>Purchases &amp; sales</h2><span class="note">${M.rows.length} record${M.rows.length!==1?'s':''}</span></div>`;
  html+=M.rows.length?`<div class="list">${M.rows.map(M.row).join('')}</div>`:
    `<div class="card muted-card"><div class="empty" style="padding:22px 8px">No metals recorded yet.<br>Tap <b>+ Add</b> to log your first gold or silver purchase.</div></div>`;
  el.innerHTML=html;
};

/* ---------- detail ---------- */
M.open=id=>{
  const r=M.rows.find(x=>x.id===id);if(!r)return;
  const w=Number(r.weight_g),pure=w*Number(r.purity),g=M.spotG(r.metal);
  const kv=(k,v)=>`<div class="kv"><span>${k}</span><span>${v}</span></div>`;
  App.openSheet({title:r.item||`${r.metal} ${r.form||''}`.trim(),sub:`${r.tx_type==='Sell'?'Sold':'Bought'} ${H.date(r.txn_date)}`,
    body:`<div class="card" style="margin:0">
      ${kv('Metal',r.metal)}${kv('Form',(FORMS.find(f=>f[0]===r.form)||['','—'])[1])}
      ${kv('Weight',kgFmt(w))}${kv('Purity',`${purityLbl(r.purity)} (${fmt(Number(r.purity)*100,2)}%)`)}${kv('Pure metal',kgFmt(pure))}
      ${kv(r.tx_type==='Sell'?'Received':'Paid',`MYR ${fmt(r.amount_myr)}`)}${kv('Per gram',w?`MYR ${fmt(r.amount_myr/w)}`:'—')}
      ${g!=null?kv('Worth at spot today',`MYR ${fmt(pure*g)}`):''}
      ${kv('Dealer',H.esc(r.dealer||'—'))}${r.notes?kv('Notes',H.esc(r.notes)):''}</div>`,
    foot:`<button class="btn btn-d" onclick="App.metals.del('${r.id}')">Delete</button><button class="btn btn-p" onclick="App.metals.form('${r.id}')">Edit</button>`});
};
M.del=async id=>{
  const r=M.rows.find(x=>x.id===id);if(!r)return;
  if(!confirm(`Delete this ${r.metal.toLowerCase()} ${r.tx_type==='Sell'?'sale':'purchase'} on ${r.txn_date}?`))return;
  const {error}=await sb.from('metals').delete().eq('id',id);
  if(error){showToast('Delete failed — '+error.message);return;}
  App.closeSheet();showToast('Deleted ✓');M.load();
};

/* ---------- add / edit form ---------- */
const opt=(name,items,val)=>`<div class="opts" data-opt="${name}">${items.map(([v,l])=>`<button type="button" data-v="${v}" class="${v===val?'on '+(v==='Buy'?'buy':v==='Sell'?'sell':''):''}">${l}</button>`).join('')}</div>`;
const optVal=name=>{const b=document.querySelector(`.opts[data-opt="${name}"] button.on`);return b?b.dataset.v:null;};
M.form=(id,preset={})=>{
  const r=id?M.rows.find(x=>x.id===id):null;
  const pv=r?String(Number(r.purity)):(preset.metal==='Silver'?'0.999':'0.9999');
  const pKnown=PURITY.some(p=>p[0]!=='custom'&&Number(p[0])===Number(pv));
  const dealers=[...new Set([...M.rows.map(x=>x.dealer).filter(Boolean),...DEALERS])];
  const body=`
    ${opt('type',[['Buy','▲ Buy'],['Sell','▼ Sell']],r?r.tx_type:'Buy')}
    <div class="lbl" style="margin:14px 0 6px">Metal</div>
    ${opt('metal',METALS.map(m=>[m.id,m.id]),r?r.metal:(preset.metal||'Gold'))}
    <div class="frow" style="margin-top:14px">
      <label class="fld"><span>Form</span><select id="mForm">${FORMS.map(([v,l])=>`<option value="${v}" ${(r?r.form:'Bar')===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="fld"><span>Date</span><input type="date" id="mDate" value="${r?r.txn_date:H.today()}"></label>
    </div>
    <label class="fld"><span>Item (optional)</span><input id="mItem" placeholder="e.g. Public Gold 20g bar, 1oz Kijang coin" value="${H.esc(r?r.item||'':'')}"></label>
    <div class="form-sec">Weight &amp; purity</div>
    <div class="frow">
      <label class="fld"><span>Weight</span><input type="number" inputmode="decimal" id="mW" step="any" min="0" placeholder="0.00" value="${r?Number(r.weight_g):''}"></label>
      <label class="fld"><span>Unit</span><select id="mU">${UNITS.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>
    </div>
    <div class="frow">
      <label class="fld"><span>Purity</span><select id="mP">${PURITY.map(([v,l])=>`<option value="${v}" ${(pKnown?Number(v)===Number(pv):v==='custom')?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="fld" id="mPcWrap" ${pKnown?'hidden':''}><span>Fineness (per 1000)</span><input type="number" inputmode="decimal" id="mPc" step="any" min="1" max="1000" placeholder="e.g. 585" value="${pKnown?'':fmt(Number(pv)*1000,1).replace(/,/g,'')}"></label>
    </div>
    <div class="form-sec">Money</div>
    <label class="fld"><span id="mAmtLbl">Total paid (MYR)</span><input type="number" inputmode="decimal" id="mAmt" step="any" min="0" placeholder="0.00" value="${r?r.amount_myr:''}">
      <div class="hint">Include premium, workmanship and any fees.</div></label>
    <div class="netbox"><span>PER GRAM</span><b id="mPerG">—</b></div>
    <div class="tiny" id="mSpotCmp" style="margin-top:8px"></div>
    <label class="fld" style="margin-top:14px"><span>Dealer / bank</span><input id="mDealer" list="mDl" placeholder="e.g. Public Gold" value="${H.esc(r?r.dealer||'':'')}"></label>
    <datalist id="mDl">${dealers.map(d=>`<option value="${H.esc(d)}">`).join('')}</datalist>
    <label class="fld"><span>Notes (optional)</span><input id="mNotes" placeholder="e.g. invoice no., certificate no." value="${H.esc(r?r.notes||'':'')}"></label>
    <div class="form-err" id="mErr"></div>`;
  App.openSheet({title:r?'Edit metal record':'Add metal',sub:r?`${r.metal} · ${H.date(r.txn_date)}`:'',body,full:true,
    foot:`<button class="btn btn-s" onclick="App.closeSheet()">Cancel</button><button class="btn btn-p" id="mSave">${r?'Save changes':'Save'}</button>`});
  const root=$('shBody');
  const grams=()=>{const w=parseFloat($('mW').value)||0,u=UNITS.find(x=>x[0]===$('mU').value);return w*(u?u[2]:1);};
  const purity=()=>$('mP').value==='custom'?(parseFloat($('mPc').value)||0)/1000:parseFloat($('mP').value);
  const calc=()=>{
    const sell=optVal('type')==='Sell';
    $('mAmtLbl').textContent=sell?'Total received (MYR)':'Total paid (MYR)';
    const g=grams(),amt=parseFloat($('mAmt').value)||0,p=purity();
    $('mPerG').textContent=g>0&&amt>0?`MYR ${fmt(amt/g)}/g`:'—';
    const s=M.spotG(optVal('metal'));
    if(s&&g>0&&p>0){const spotVal=g*p*s,prem=amt>0?(amt-spotVal)/spotVal*100:null;
      $('mSpotCmp').innerHTML=`Worth MYR ${fmt(spotVal)} at today's spot${prem!=null?` · you ${sell?'got':'paid'} ${prem>=0?'+':'−'}${fmt(Math.abs(prem),1)}% ${prem>=0?'above':'below'} spot`:''}.`;}
    else $('mSpotCmp').textContent='';
  };
  root.querySelectorAll('.opts[data-opt]').forEach(gp=>gp.addEventListener('click',e=>{
    const b=e.target.closest('button[data-v]');if(!b)return;
    gp.querySelectorAll('button').forEach(x=>x.className='');
    b.className='on '+(b.dataset.v==='Buy'?'buy':b.dataset.v==='Sell'?'sell':'');
    if(gp.dataset.opt==='metal'&&!r){$('mP').value=b.dataset.v==='Gold'?'0.9999':'0.999';$('mPcWrap').hidden=true;}
    calc();
  }));
  $('mP').addEventListener('change',()=>{$('mPcWrap').hidden=$('mP').value!=='custom';calc();});
  ['mW','mAmt','mPc'].forEach(i=>$(i).addEventListener('input',calc));
  $('mU').addEventListener('change',calc);
  calc();

  $('mSave').onclick=async()=>{
    const err=$('mErr');err.textContent='';
    const g=grams(),p=purity(),amt=parseFloat($('mAmt').value),date=$('mDate').value,metal=optVal('metal'),type=optVal('type');
    if(!date){err.textContent='Select a date.';return;}
    if(!(g>0)){err.textContent='Enter the weight.';return;}
    if(!(p>0&&p<=1)){err.textContent='Enter a purity between 1 and 1000.';return;}
    if(!(amt>=0)||isNaN(amt)){err.textContent=type==='Sell'?'Enter the amount received.':'Enter the amount paid.';return;}
    if(type==='Sell'){
      const pos=M.positions().find(x=>x.metal===metal),have=(pos?pos.pure:0)+(r&&r.tx_type==='Sell'&&r.metal===metal?Number(r.weight_g)*Number(r.purity):0);
      if(g*p>have+1e-6&&!confirm(`You're selling ${fmt(g*p,3)} g of pure ${metal.toLowerCase()} but only ${fmt(have,3)} g is recorded. Save anyway?`))return;
    }
    const payload={tx_type:type,txn_date:date,metal,form:$('mForm').value,item:$('mItem').value.trim()||null,
      weight_g:parseFloat(g.toFixed(4)),purity:parseFloat(p.toFixed(5)),amount_myr:parseFloat(amt.toFixed(2)),
      dealer:$('mDealer').value.trim()||null,notes:$('mNotes').value.trim()||null,updated_at:new Date().toISOString()};
    const btn=$('mSave');btn.disabled=true;btn.textContent='Saving…';
    const {error}=r?await sb.from('metals').update(payload).eq('id',r.id):await sb.from('metals').insert(payload);
    btn.disabled=false;btn.textContent=r?'Save changes':'Save';
    if(error){err.textContent=error.message;return;}
    App.closeSheet();showToast(`${metal} ${type==='Sell'?'sale':'purchase'} saved ✓`);M.load();
  };
};
/* ---------- My metals | Market & outlook ---------- */
M.view='mine';
const renderMine=M.render;
M.render=el=>{
  const tabs=`<div class="opts" style="margin-bottom:14px"><button type="button" data-mv="mine" class="${M.view==='mine'?'on':''}">My metals</button><button type="button" data-mv="market" class="${M.view==='market'?'on':''}">Market &amp; outlook</button></div>`;
  if(M.view==='market'){el.innerHTML=tabs+App.metalsMarket.render(el);App.metalsMarket.after(el);}
  else{renderMine(el);el.insertAdjacentHTML('afterbegin',tabs);}
  el.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>{M.view=b.dataset.mv;App.render(true);});
};
})();
