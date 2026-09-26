/* ===== Markets Suite — multi-select filter dropdown =====
   Markup : <div class="ms" id="myFilter"></div>
   Setup  : MS.init('myFilter',{noun:'Years', allLabel:'All Years', options:[2026,2025,…] | [{value,label}], onChange})
   Read   : MS.values(id) → [] means "All" (nothing ticked, or everything ticked)
            MS.has(id,v)  → true if v passes the filter
            MS.active(id) → true if the filter is narrowing the list
   Reset  : MS.clear([ids], callback)
   Options: MS.optionValues(id) → current option values
   Lists longer than 8 options get a search box.                                */
(function(){
  const css=`
  .ms{position:relative;}
  .ms-btn{display:flex;align-items:center;gap:8px;cursor:pointer;min-width:130px;justify-content:space-between;text-align:left;}
  .ms-btn .ms-lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px;}
  .ms-btn.active{border-color:var(--teal);color:#00514d;background-color:#eef8f7;}
  .ms-panel{position:absolute;top:calc(100% + 4px);left:0;z-index:30;display:none;min-width:200px;max-height:320px;overflow:auto;
    background:#fff;border:1px solid var(--panel-edge);border-radius:10px;box-shadow:0 8px 24px rgba(0,51,47,.14);padding:6px;}
  .ms.open .ms-panel{display:block;}
  .ms-opt{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;}
  .ms-opt:hover{background:#f1f7f6;}
  .ms-opt input{width:auto;margin:0;accent-color:#00a19c;}
  .ms-actions{display:flex;justify-content:space-between;gap:8px;padding:4px 8px 6px;border-bottom:1px solid var(--panel-edge);margin-bottom:4px;}
  .ms-actions a{font-size:11px;font-weight:700;color:#00a19c;cursor:pointer;}
  .ms-search{width:100%;box-sizing:border-box;margin:2px 0 6px;padding:6px 9px;border:1px solid var(--panel-edge);border-radius:8px;font-family:'Mulish',sans-serif;font-size:12px;}
  .ms-search:focus{outline:none;border-color:var(--teal);}`;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  const S={}, C={};
  const esc=v=>String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

  function init(id,cfg){
    const opts=(cfg.options||[]).map(o=>(o&&typeof o==='object')
      ?{value:String(o.value),label:o.label!=null?String(o.label):String(o.value)}
      :{value:String(o),label:String(o)});
    C[id]=Object.assign({},cfg,{options:opts});
    const vals=opts.map(o=>o.value);
    S[id]=new Set([...(S[id]||[])].filter(v=>vals.includes(v)));        // keep picks that still exist
    const el=document.getElementById(id); if(!el)return;
    el.classList.add('ms');
    el.innerHTML=`<button type="button" class="filter-select ms-btn"><span class="ms-lbl"></span></button>
      <div class="ms-panel">
        <div class="ms-actions"><a data-act="all">Select all</a><a data-act="none">Clear</a></div>
        ${opts.length>8?'<input class="ms-search" type="text" placeholder="Search…">':''}
        <div class="ms-list">${opts.map(o=>`<label class="ms-opt"><input type="checkbox" value="${esc(o.value)}" ${S[id].has(o.value)?'checked':''}><span>${esc(o.label)}</span></label>`).join('')}</div>
      </div>`;
    el.querySelector('.ms-btn').onclick=e=>{e.stopPropagation();toggle(el);};
    const panel=el.querySelector('.ms-panel');
    panel.onclick=e=>e.stopPropagation();
    panel.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.onchange=()=>{
      cb.checked?S[id].add(cb.value):S[id].delete(cb.value); changed(id);
    });
    panel.querySelector('[data-act=all]').onclick=()=>setAll(id,true);
    panel.querySelector('[data-act=none]').onclick=()=>setAll(id,false);
    const srch=panel.querySelector('.ms-search');
    if(srch)srch.oninput=()=>{const q=srch.value.toLowerCase();
      panel.querySelectorAll('.ms-opt').forEach(l=>l.style.display=l.textContent.toLowerCase().includes(q)?'':'none');};
    label(id);
  }
  function toggle(el){
    const open=!el.classList.contains('open');
    closeAll(); if(open){el.classList.add('open');const s=el.querySelector('.ms-search');if(s)s.focus();}
  }
  function closeAll(){document.querySelectorAll('.ms.open').forEach(m=>m.classList.remove('open'));}
  function label(id){
    const el=document.getElementById(id); if(!el||!C[id])return;
    const c=C[id], picked=c.options.filter(o=>S[id].has(o.value)).map(o=>o.value);
    const all=!picked.length||picked.length===c.options.length;
    el.querySelector('.ms-lbl').textContent=all?c.allLabel:picked.length<=2?picked.join(', '):`${c.noun}: ${picked.length} selected`;
    el.querySelector('.ms-btn').classList.toggle('active',!all);
  }
  function syncBoxes(id){document.querySelectorAll(`#${id} .ms-list input[type=checkbox]`).forEach(cb=>cb.checked=S[id].has(cb.value));}
  function changed(id){label(id);if(C[id].onChange)C[id].onChange(id);}
  function setAll(id,on){S[id]=new Set(on?C[id].options.map(o=>o.value):[]);syncBoxes(id);changed(id);}
  function values(id){
    if(!C[id]||!S[id])return [];
    if(S[id].size===C[id].options.length)return [];
    return [...S[id]];
  }
  function clear(ids,cb){
    (ids||Object.keys(C)).forEach(id=>{if(!C[id])return;S[id]=new Set();syncBoxes(id);label(id);});
    if(cb)cb();
  }
  document.addEventListener('click',closeAll);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll();});

  window.MS={
    init, values, clear,
    has:(id,v)=>{const a=values(id);return !a.length||a.includes(String(v));},
    active:id=>values(id).length>0,
    exists:id=>!!C[id],
    optionValues:id=>C[id]?C[id].options.map(o=>o.value):[]
  };
})();
