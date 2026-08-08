/* ===== Markets Suite — shared core =====
   Supabase client, auth guard, sidebar, utilities.
   Every page (except index.html) loads this first. */

const SUPABASE_URL='https://yppafsdnzcfkmopqlsgm.supabase.co';
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwcGFmc2RuemNma21vcHFsc2dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNTQ1ODYsImV4cCI6MjA5ODczMDU4Nn0.7lhkzyUIhccr6aPPNR9Xgwj2erlN07rb0FEMxY1GKdQ';
const PASS_HASH='60806fd1d4e5822dfc83753ff8a17307323375290c645a270c589c21a05d1ca6';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

/* ---- auth guard (redirect to login if not authed) ---- */
function requireAuth(){
  if(sessionStorage.getItem('pt_auth')!=='1'){location.replace('index.html');}
}

/* ---- utilities ---- */
async function sha256(str){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function fmt(n,dec=2){
  if(n==null||isNaN(n))return '—';
  return Number(n).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function showToast(msg){
  let t=document.getElementById('toast');
  if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t);}
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}
function setHTML(id,html){const el=document.getElementById(id);if(el)el.innerHTML=html;}
function setText(id,txt){const el=document.getElementById(id);if(el)el.textContent=txt;}

/* ---- sidebar ---- */
const NAV=[
  {group:null,items:[
    {id:'dashboard',icon:'&#9670;',label:'Asset & Liability',href:'dashboard.html'}
  ]},
  {group:'Share Holdings',items:[
    {id:'summary',icon:'&#9632;',label:'Summary',href:'shares-summary.html',sub:true},
    {id:'holdings',icon:'&#9632;',label:'Holdings',href:'shares-holdings.html',sub:true},
    {id:'transactions',icon:'&#9632;',label:'Transactions',href:'shares-transactions.html',sub:true},
    {id:'dividends',icon:'&#9632;',label:'Dividends',href:'shares-dividends.html',sub:true}
  ]},
  {group:'Other Assets',items:[
    {id:'metals',icon:'&#9679;',label:'Metals',href:'metals.html'},
    {id:'asnb',icon:'&#9679;',label:'ASNB',href:'asnb.html'}
  ]},
  {group:'Tools',items:[
    {id:'quote',icon:'&#8599;',label:'Quote Board',href:'stock-lookup.html'}
  ]}
];

function buildSidebar(activeId){
  const nav=NAV.map(g=>{
    const head=g.group?`<div class="sb-group">${g.group}</div>`:'';
    const links=g.items.map(i=>
      `<a class="sb-link${i.sub?' sub':''}${i.id===activeId?' active':''}" href="${i.href}">
        <span class="sb-ic">${i.icon}</span>${i.label}</a>`).join('');
    return head+links;
  }).join('');
  const html=`
    <div class="sb-brand">
      <div class="sb-logo">&#9632; Markets Suite</div>
      <div class="sb-title">Finance Console</div>
    </div>
    <nav class="sb-nav">${nav}</nav>
    <div class="sb-foot">
      <button class="danger" onclick="resetAllData()">Reset data</button>
      <button onclick="handleSignOut()">Sign out</button>
    </div>`;
  const sbEl=document.getElementById('sidebar');
  if(sbEl)sbEl.innerHTML=html;
  const mb=document.getElementById('menuBtn');
  const bd=document.getElementById('sbBackdrop');
  if(mb)mb.onclick=()=>{sbEl.classList.toggle('open');if(bd)bd.classList.toggle('show',sbEl.classList.contains('open'));};
  if(bd)bd.onclick=()=>{sbEl.classList.remove('open');bd.classList.remove('show');};
}

/* ---- session actions ---- */
function handleSignOut(){
  sessionStorage.removeItem('pt_auth');
  location.replace('index.html');
}

async function resetAllData(){
  const pw=prompt('This will permanently delete ALL transactions and dividends.\n\nEnter your password to continue:');
  if(pw===null)return;
  const hash=await sha256(pw);
  if(hash!==PASS_HASH){showToast('Incorrect password');return;}
  const word=prompt('Final check — type RESET to confirm:');
  if(word===null)return;
  if(word.trim().toUpperCase()!=='RESET'){showToast('Reset cancelled');return;}
  const [txDel,divDel]=await Promise.all([
    sb.from('transactions').delete().not('id','is',null),
    sb.from('dividends').delete().not('id','is',null)
  ]);
  if(txDel.error||divDel.error){showToast('Reset failed — check connection');return;}
  showToast('All data cleared ✓');
  setTimeout(()=>location.reload(),800);
}
