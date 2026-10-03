/* ===== More → Triage & confirmation: stocks tagged from the Growth scanner =====
   Table: scan_watch (mobile/supabase/watchlist.sql). Two stages:
     triage        — tagged for research
     confirmation  — research done, waiting for the setup to confirm (breakout, earnings, volume…)
   Live prices come from the same "quote" Edge Function as holdings; score / signal from the latest scan.
   Market data only — the view is marked data-nomask (hide-amounts leaves it alone). */
(function(){
const H=App.h;
H.icon.flag='<svg viewBox="0 0 24 24"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>';
const STAGES=[['triage','Triage','Tagged for research'],['confirmation','Confirmation','Waiting for the setup to confirm']];
const W=App.watch={status:'idle',rows:[],err:'',px:{},pxAt:0,pxBusy:false,ptBusy:false,ptTried:{},ptState:''};
const isMissing=e=>e&&(e.code==='42P01'||e.code==='PGRST205'||/does not exist|schema cache/i.test(e.message||''));

/* ---------- data ---------- */
W.load=async()=>{
  W.status=W.status==='ok'?'ok':'loading';
  const {data,error}=await sb.from('scan_watch').select('*').order('added_at',{ascending:false});
  if(error){W.status=isMissing(error)?'missing':'error';W.err=error.message;W.rows=[];}
  else{W.rows=data||[];W.status='ok';}
  App.refreshView();
};
W.loadPrices=async(force)=>{
  if(W.pxBusy||!W.rows.length)return;
  if(!force&&Date.now()-W.pxAt<5*60*1000&&W.rows.every(r=>W.px[r.symbol]))return;
  W.pxBusy=true;App.refreshView();
  try{const d=await invokeQuote({symbols:W.rows.map(r=>r.symbol)});
    W.rows.forEach(r=>{const q=d&&(d[r.symbol]||d[r.symbol.toUpperCase()]);W.px[r.symbol]=q&&q.price!=null?q:{error:true};});
    W.pxAt=Date.now();}
  catch(e){console.error('watch prices',e);}
  W.pxBusy=false;App.refreshView();
};
/* analyst price targets: Edge Function "price-target" (mobile/supabase/price-target/index.ts), saved on the row */
W.fetchTargets=async(syms,force)=>{
  syms=(syms||[]).filter(s=>force||!W.ptTried[s]);if(!syms.length||W.ptBusy)return;
  syms.forEach(s=>W.ptTried[s]=1);W.ptBusy=true;App.refreshView();
  try{
    const call=sb.functions.invoke('price-target',{body:{symbols:syms}});
    const to=new Promise((_,rej)=>setTimeout(()=>rej(new Error('Timed out')),25000));
    const {data,error}=await Promise.race([call,to]);
    if(error){let st=0;try{st=error.context&&error.context.status;}catch(e){}
      W.ptState=st===404?'missing':'error';throw error;}
    W.ptState='ok';
    const now=new Date().toISOString();
    for(const sym of syms){
      const t=data&&data[sym],r=W.get(sym);if(!t||!r)continue;
      const patch={target_at:now,target_mean:t.mean??null,target_median:t.median??null,target_high:t.high??null,target_low:t.low??null,
        analysts:t.analysts??null,rating:t.rating??null,rating_mean:t.ratingMean??null,target_ccy:t.currency??null};
      const {error:e2}=await sb.from('scan_watch').update(patch).eq('id',r.id);
      if(e2){if(/column/i.test(e2.message))W.ptState='nocols';continue;}
      Object.assign(r,patch);
    }
  }catch(e){console.error('price-target',e);}
  W.ptBusy=false;App.refreshView();
  if(App.sheetIsOpen()&&syms.includes(H.$('#shTitle').textContent))W.open(H.$('#shTitle').textContent);
};
const stale=r=>!r.target_at||Date.now()-new Date(r.target_at)>3*864e5;   // refresh if older than 3 days
W.get=sym=>W.rows.find(r=>r.symbol===sym)||null;
W.stageOf=sym=>{const r=W.get(sym);return r?r.stage:null;};
W.tag=sym=>{const s=W.stageOf(sym);return s?`<span class="tag ${s==='triage'?'wt-tri':'wt-con'}">${s==='triage'?'Triage':'Confirmation'}</span>`:'';};

/* ---------- add / move / note / remove ---------- */
W.add=async(sym,extra={})=>{
  sym=String(sym||'').trim().toUpperCase();
  if(!/^[A-Z0-9.\-]{1,12}$/.test(sym)){showToast('Enter a valid ticker');return false;}
  if(W.get(sym)){showToast(sym+' is already on your list');return false;}
  const s=(App.scanner&&App.scanner.rows||[]).find(r=>r.symbol===sym)||{};
  const payload={symbol:sym,name:extra.name||s.name||null,sector:s.sector||null,stage:extra.stage||'triage',
    added_price:s.price!=null?s.price:(extra.price!=null?extra.price:null),added_score:s.score!=null?s.score:null,
    added_class:s.classification||null,notes:extra.notes||null,confirmed_at:extra.stage==='confirmation'?H.today():null};
  const {error}=await sb.from('scan_watch').insert(payload);
  if(error){showToast(isMissing(error)?'Run mobile/supabase/watchlist.sql in Supabase first':'Could not add — '+error.message);return false;}
  showToast(`${sym} added to ${payload.stage==='triage'?'Triage':'Confirmation'} ✓`);
  await W.load();W.loadPrices(true);W.fetchTargets([sym],true);return true;
};
W.move=async(sym,stage)=>{
  const r=W.get(sym);if(!r||r.stage===stage)return;
  const {error}=await sb.from('scan_watch').update({stage,confirmed_at:stage==='confirmation'?H.today():null,updated_at:new Date().toISOString()}).eq('id',r.id);
  if(error){showToast('Update failed — '+error.message);return;}
  showToast(`${sym} moved to ${stage==='triage'?'Triage':'Confirmation'} ✓`);
  await W.load();if(App.sheetIsOpen()&&H.$('#shTitle').textContent===sym)W.open(sym);
};
W.saveNote=async sym=>{
  const r=W.get(sym),el=H.$('#wNote');if(!r||!el)return;
  const {error}=await sb.from('scan_watch').update({notes:el.value.trim()||null,updated_at:new Date().toISOString()}).eq('id',r.id);
  if(error){showToast('Save failed — '+error.message);return;}
  showToast('Note saved ✓');W.load();
};
W.remove=async sym=>{
  const r=W.get(sym);if(!r)return;
  if(!confirm(`Remove ${sym} from your ${r.stage==='triage'?'Triage':'Confirmation'} list?`))return;
  const {error}=await sb.from('scan_watch').delete().eq('id',r.id);
  if(error){showToast('Remove failed — '+error.message);return;}
  App.closeSheet();showToast(sym+' removed');W.load();
};
/* manual add (FAB / header button): any US ticker, not only scanner results */
W.form=()=>{
  App.openSheet({title:'Add to watchlist',sub:'NASDAQ / US ticker',
    body:`<label class="fld"><span>Ticker</span><input id="wSym" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="e.g. NVDA"></label>
      <div class="tiny" id="wHint" style="margin:-6px 0 14px"></div>
      <div class="lbl" style="margin-bottom:6px">Stage</div>
      <div class="opts" data-opt="wst">${STAGES.map(([v,l],i)=>`<button type="button" data-v="${v}" class="${i?'':'on'}">${l}</button>`).join('')}</div>
      <label class="fld" style="margin-top:14px"><span>Note (optional)</span><textarea id="wNoteNew" rows="3" placeholder="Why it's interesting, what would confirm it…"></textarea></label>
      <div class="form-err" id="wErr"></div>`,
    foot:`<button class="btn btn-s" onclick="App.closeSheet()">Cancel</button><button class="btn btn-p" id="wSave">Add</button>`});
  const hint=()=>{const v=H.$('#wSym').value.trim().toUpperCase(),s=(App.scanner.rows||[]).find(r=>r.symbol===v);
    H.$('#wHint').innerHTML=!v?'':s?`${H.esc(s.name||'')} · score ${s.score}${s.classification?' · '+s.classification:''}`:'Not in the latest scan list — it will be tracked by price only.';};
  H.$('#wSym').addEventListener('input',hint);
  document.querySelectorAll('.opts[data-opt="wst"] button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.opts[data-opt="wst"] button').forEach(x=>x.className='');b.className='on';});
  H.$('#wSave').onclick=async()=>{
    const st=(document.querySelector('.opts[data-opt="wst"] button.on')||{}).dataset.v||'triage';
    const btn=H.$('#wSave');btn.disabled=true;
    const ok=await W.add(H.$('#wSym').value,{stage:st,notes:H.$('#wNoteNew').value.trim()||null});
    btn.disabled=false;if(ok)App.closeSheet();
  };
  setTimeout(()=>{const i=H.$('#wSym');if(i)i.focus();},150);
};

/* ---------- maths ---------- */
const usd=v=>v==null||!isFinite(v)?'—':`$${fmt(v,Math.abs(v)<10?3:2)}`;
const pc=v=>v==null||!isFinite(v)?'<span class="dim">—</span>':`<span class="${v>=0?'up':'down'}">${v>=0?'+':'−'}${fmt(Math.abs(v),1)}%</span>`;
const pts=v=>v==null?'<span class="dim">—</span>':`<span class="${v>=0?'up':'down'}">${v>=0?'+':'−'}${Math.abs(v)}</span>`;
const days=d=>Math.max(0,Math.round((Date.now()-new Date(d+'T00:00:00'))/864e5));
function enrich(r){
  const q=W.px[r.symbol],s=(App.scanner&&App.scanner.rows||[]).find(x=>x.symbol===r.symbol);
  const price=q&&!q.error?q.price:(s?s.price:null);
  return {...r,price,live:!!(q&&!q.error),day:q&&!q.error&&q.prevClose?(q.price-q.prevClose)/q.prevClose*100:(s?s.chg_pct:null),
    since:price!=null&&r.added_price?(price/r.added_price-1)*100:null,score:s?s.score:null,cls:s?s.classification:null,
    dScore:s&&r.added_score!=null?s.score-r.added_score:null,days:days(r.added_at),inScan:!!s,
    upside:price!=null&&r.target_mean?(r.target_mean/price-1)*100:null};
}
const clsTag=c=>c?`<span class="tag cls-${c.toLowerCase()}" data-tip="cls.${c}">${c}</span>`:'';

/* ---------- screen ---------- */
W.render=el=>{
  if(W.status==='idle')W.load();
  if(App.scanner&&App.scanner.status==='idle')App.scanner.load();
  if(W.status==='idle'||W.status==='loading'){el.innerHTML=App.skeleton(5);return;}
  if(W.status==='missing'){el.innerHTML=`<div class="card muted-card"><div class="val">One-time setup</div>
    <p class="sub" style="margin-top:8px;font-size:14px;line-height:1.5">Run <b>mobile/supabase/watchlist.sql</b> in Supabase → SQL Editor, then reload.</p></div>`;return;}
  if(W.status==='error'){el.innerHTML=`<div class="notice warn">Couldn't load your list: ${H.esc(W.err)}</div>`;return;}
  W.loadPrices();
  if(W.ptState!=='missing'&&W.ptState!=='nocols')W.fetchTargets(W.rows.filter(stale).map(r=>r.symbol));
  const all=W.rows.map(enrich), wide=App.wide();
  const avg=l=>{const v=l.filter(x=>x.since!=null);return v.length?v.reduce((a,x)=>a+x.since,0)/v.length:null;};
  let html=`<div data-nomask><div class="grid g3 sc-stats">
    ${STAGES.map(([k,l])=>{const l2=all.filter(x=>x.stage===k);return `<div class="stat"><div class="lbl">${l}${H.tip('w.'+k)}</div><div class="val">${l2.length}</div><div class="sub">avg ${l2.length?pcTxt(avg(l2)):'—'} since tagged</div></div>`;}).join('')}
    <div class="stat"><div class="lbl">Scanner</div><div class="val">${App.scanner&&App.scanner.run?H.dateShort(App.scanner.run.scan_date):'—'}</div><div class="sub">latest scores & signals</div></div></div>`;
  if(!all.length){
    html+=`<div class="card muted-card" style="margin-top:14px"><div class="val">Nothing tagged yet</div>
      <p class="sub" style="margin-top:8px;font-size:14px;line-height:1.5">Open a stock in the <a class="link" href="#more/scanner">Growth scanner</a> and tap <b>Add to Triage</b>, or use <b>+ Add</b> for any US ticker.</p></div></div>`;
    el.innerHTML=html;return;}
  STAGES.forEach(([k,l,sub])=>{
    const list=all.filter(x=>x.stage===k).sort((a,b)=>(b.since??-1e9)-(a.since??-1e9));
    html+=`<div class="${wide?'dt-note':'sec'}"><h2>${l}${H.tip('w.'+k)}</h2><span class="note">${list.length} stock${list.length!==1?'s':''} · ${sub}</span></div>`;
    if(!list.length){html+=`<div class="card muted-card"><div class="tiny">${k==='triage'?'Nothing waiting for research.':'Nothing waiting for confirmation — promote a stock from Triage when your research checks out.'}</div></div>`;return;}
    if(wide){
      html+='<div class="sc-dt">'+H.table([{k:'s',label:'Stock'},{k:'a',label:'Tagged'},{k:'p',label:'Price now',cls:'n'},{k:'d',label:'Today',cls:'n'},
        {k:'sn',label:'Since tagged'+H.tip('w.since'),cls:'n'},{k:'tg',label:'Target'+H.tip('w.target'),cls:'n'},{k:'up',label:'Upside'+H.tip('w.upside'),cls:'n'},{k:'sc',label:'Score'+H.tip('w.score'),cls:'n'},{k:'c',label:'Signal now'+H.tip('signal')},{k:'n',label:'Notes'}],
        list.map(x=>({on:`App.watch.open('${x.symbol}')`,cells:{
          s:`<div class="t-main">${H.esc(x.symbol)}${App.scanner&&held(x.symbol)?' <span class="tag myr">Held</span>':''}</div><div class="t-sub" title="${H.esc(x.sector||'')}">${H.esc(x.name||'')}</div>`,
          a:`${H.dateShort(x.added_at)}<div class="t-sub">${x.days}d ago</div>`,p0:usd(x.added_price),p:x.price==null?(W.pxBusy?'<span class="spin-i"></span>':'—'):usd(x.price),
          d:H.pill(x.day),sn:`<b>${pc(x.since)}</b><div class="t-sub">from ${usd(x.added_price)}</div>`,tg:tgCell(x),up:pc(x.upside),sc:x.score==null?'<span class="dim">—</span>':`<b>${x.score}</b> <span class="t-sub" style="display:inline">${x.added_score!=null?'from '+x.added_score:''}</span>`,
          c:clsTag(x.cls)||'<span class="dim">—</span>',n:x.notes?`<span class="t-sub" title="${H.esc(x.notes)}" style="display:inline-block;max-width:130px;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom">${H.esc(x.notes)}</span>`:''}})))+'</div>';
    }else{
      html+=`<div class="list">${list.map(x=>`<button class="lrow" onclick="App.watch.open('${x.symbol}')">
        <div class="sc-badge ${x.score==null?'mid':x.score>=80?'hi':x.score>=60?'ok':x.score>=45?'mid':'lo'}">${x.score??'–'}</div>
        <div class="main-col"><div class="t1">${H.esc(x.symbol)} ${clsTag(x.cls)}</div>
          <div class="t2">${x.target_mean?`target ${usd(x.target_mean)} (${pcTxt(x.upside)})`:H.esc(x.name||'')} · ${x.days}d · from ${usd(x.added_price)}</div></div>
        <div class="end"><div class="v">${x.price==null?(W.pxBusy?'<span class="spin-i"></span>':'—'):usd(x.price)}</div><div class="s">${pc(x.since)} <span class="dim">since</span></div></div></button>`).join('')}</div>`;
    }
  });
  html+=`<p class="tiny sc-foot">${W.pxAt?`Live prices ${new Date(W.pxAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} (about 15 min delayed). `:''}Score and signal are from the latest nightly scan. Price targets are the Wall Street analyst consensus (via Yahoo Finance)${W.ptState==='missing'?' — <b>deploy the price-target Edge Function to see them</b>':W.ptState==='nocols'?' — <b>run mobile/supabase/price-targets.sql to save them</b>':''}. A watchlist is for research — not a buy list.</p></div>`;
  el.innerHTML=html;
};
const RATING={strong_buy:'Strong buy',buy:'Buy',hold:'Hold',underperform:'Underperform',sell:'Sell',none:'—'};
const tgCell=x=>x.target_mean?`${usd(x.target_mean)}${x.analysts?`<div class="t-sub">${x.analysts} analysts</div>`:''}`:
  (W.ptBusy&&!x.target_at?'<span class="spin-i"></span>':'<span class="dim">—</span>');
function targetCard(r,x,sym){
  const tv=`https://www.tradingview.com/symbols/${x.inScan?'NASDAQ-':''}${encodeURIComponent(sym)}/forecast/`;
  const kv=(k,v)=>`<div class="kv"><span>${k}</span><span>${v}</span></div>`;
  let inner;
  if(r.target_mean){
    const lo=Number(r.target_low),hi=Number(r.target_high),mean=Number(r.target_mean),p=x.price;
    const vals=[lo,hi,mean,p].filter(v=>v!=null&&isFinite(v)),mn=Math.min(...vals),mx=Math.max(...vals),span=mx-mn||1,pos=v=>((v-mn)/span*100).toFixed(1);
    inner=`<div class="pt-bar"><div class="pt-rng" style="left:${pos(lo)}%;right:${(100-pos(hi)).toFixed(1)}%"></div>
        <i class="pt-mean" style="left:${pos(mean)}%" title="Average target"></i>${p!=null?`<i class="pt-now" style="left:${pos(p)}%" title="Price now"></i>`:''}</div>
      <div class="pt-leg"><span>Low ${usd(lo)}</span><span><i class="pt-k now"></i>Now ${usd(p)} · <i class="pt-k mean"></i>Avg ${usd(mean)}</span><span>High ${usd(hi)}</span></div>
      ${kv(H.lt('Average target','w.target'),`<b>${usd(mean)}</b>${r.target_median?` <span class="dim">median ${usd(r.target_median)}</span>`:''}`)}
      ${kv(H.lt('Upside to average','w.upside'),pc(x.upside))}
      ${kv('Upside to high / low',`${pc(p?(hi/p-1)*100:null)} / ${pc(p?(lo/p-1)*100:null)}`)}
      ${kv(H.lt('Analyst rating','w.rating'),`${RATING[r.rating]||H.esc(r.rating||'—')}${r.rating_mean?` <span class="dim">${fmt(r.rating_mean,1)} of 5</span>`:''}${r.analysts?` <span class="dim">· ${r.analysts} analysts</span>`:''}`)}
      <div class="tiny" style="margin-top:6px">Wall Street consensus via Yahoo Finance · updated ${r.target_at?H.date(String(r.target_at).slice(0,10)):'—'}</div>`;
  }else if(W.ptBusy){inner=App.skeleton(1);}
  else inner=`<div class="tiny">${W.ptState==='missing'?'Deploy the <b>price-target</b> Edge Function in Supabase to load analyst targets.':
      W.ptState==='nocols'?'Run <b>mobile/supabase/price-targets.sql</b> in Supabase to store analyst targets.':
      r.target_at?'No analysts cover this stock — common for small caps.':'Not loaded yet.'}</div>`;
  return `<div class="card" style="box-shadow:none;margin-top:14px"><div class="form-sec" style="margin-top:0">Analyst price target${H.tip('w.target')}</div>${inner}
    <div class="btn-row" style="margin-top:12px"><button class="btn btn-s" onclick="App.watch.fetchTargets(['${sym}'],true)">${W.ptBusy?'Loading…':'Refresh target'}</button>
      <a class="btn btn-s" href="${tv}" target="_blank" rel="noopener">View on TradingView ↗</a></div></div>`;
}
const pcTxt=v=>v==null?'—':`${v>=0?'+':'−'}${fmt(Math.abs(v),1)}%`;
const held=sym=>{try{return App.calc.positions().some(p=>p.market==='US'&&String(p.ticker).toUpperCase()===sym);}catch(e){return false;}};

/* ---------- detail ---------- */
W.open=sym=>{
  const r=W.get(sym);if(!r)return;const x=enrich(r);
  const kv=(k,v)=>`<div class="kv"><span>${k}</span><span>${v}</span></div>`;
  const body=`<div data-nomask><div class="dhead"><div><div class="dprice">${usd(x.price)}</div>
      <div class="sub">${x.live?'live · ~15 min delayed':'last scan close'}</div></div>${H.pill(x.day)}</div>
    <div class="lbl" style="margin-bottom:6px">Stage</div>
    <div class="opts" id="wStage">${STAGES.map(([v,l])=>`<button type="button" data-v="${v}" class="${r.stage===v?'on':''}">${l}</button>`).join('')}</div>
    <div class="card" style="box-shadow:none;margin-top:14px">
      ${kv('Tagged',`${H.date(r.added_at)} · ${x.days} days ago`)}
      ${r.confirmed_at?kv('Moved to confirmation',H.date(r.confirmed_at)):''}
      ${kv('Price when tagged',usd(r.added_price))}
      ${kv(H.lt('Since tagged','w.since'),pc(x.since))}
      ${kv(H.lt('Score','w.score'),x.score==null?'<span class="dim">not in latest scan</span>':`${x.score} ${r.added_score!=null?`<span class="dim">(was ${r.added_score}, ${x.dScore>=0?'+':'−'}${Math.abs(x.dScore)})</span>`:''}`)}
      ${kv(H.lt('Signal','signal'),`${clsTag(x.cls)||'—'}${r.added_class&&r.added_class!==x.cls?` <span class="dim">was ${H.esc(r.added_class)}</span>`:''}`)}
    </div>
    ${targetCard(r,x,sym)}
    <label class="fld" style="margin-top:14px"><span>Notes — thesis, what would confirm it, what would kill it</span>
      <textarea id="wNote" rows="4">${H.esc(r.notes||'')}</textarea></label>
    <div class="btn-row" style="margin-top:0">
      <button class="btn btn-s" onclick="App.watch.saveNote('${sym}')">Save note</button>
      ${x.inScan?`<button class="btn btn-s" onclick="App.scanner.open('${sym}')">Research page</button>`:''}
    </div></div>`;
  App.openSheet({title:sym,sub:H.esc(r.name||'')+(r.sector?' · '+H.esc(r.sector):''),body,
    foot:`<button class="btn btn-d" onclick="App.watch.remove('${sym}')">Remove</button>${r.stage==='triage'?
      `<button class="btn btn-p" onclick="App.watch.move('${sym}','confirmation')">Move to Confirmation ›</button>`:
      `<button class="btn btn-s" onclick="App.watch.move('${sym}','triage')">‹ Back to Triage</button>`}`});
  H.$('#wStage').querySelectorAll('button').forEach(b=>b.onclick=()=>W.move(sym,b.dataset.v));
};
W.menuSub=()=>W.status==='ok'?`${W.rows.filter(r=>r.stage==='triage').length} in triage · ${W.rows.filter(r=>r.stage==='confirmation').length} in confirmation`:'Stocks tagged from the scanner';
})();
