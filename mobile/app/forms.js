/* ===== Forms: trade · dividend · fund movement =====
   Same fields, fee maths and database payloads as the web pages. */
(function(){
const H=App.h, C=App.calc, $=id=>document.getElementById(id);
App.forms={};
const opt=(name,items,val,cls={})=>`<div class="opts" data-opt="${name}">${items.map(([v,l])=>`<button type="button" data-v="${v}" class="${v===val?'on '+(cls[v]||''):''}">${l}</button>`).join('')}</div>`;
function bindOpts(root,onChange){
  root.querySelectorAll('.opts[data-opt]').forEach(g=>g.addEventListener('click',e=>{
    const b=e.target.closest('button[data-v]');if(!b)return;
    g.querySelectorAll('button').forEach(x=>x.className='');
    b.className='on '+(b.dataset.v==='Buy'?'buy':b.dataset.v==='Sell'?'sell':'');
    onChange(g.dataset.opt,b.dataset.v);
  }));
}
const optVal=name=>{const b=document.querySelector(`.opts[data-opt="${name}"] button.on`);return b?b.dataset.v:null;};
const num=id=>parseFloat($(id).value)||0;
const stockOptions=list=>list.map(s=>`<option value="${s.code}">${s.code} — ${H.esc(s.name)}</option>`).join('');

/* ---------------- TRADE ---------------- */
App.forms.trade=(id,preset={})=>{
  const t=id?transactions.find(x=>x.id===id):null;
  const st={type:t?t.tx_type:(preset.type||'Buy'),contra:t?!!t.is_contra:false,market:t?t.market:(preset.market||'Bursa'),
    cds:t?normCds(t.cds_account):(preset.cds||'RHB')};
  if(!t&&preset.ticker){const last=transactions.find(x=>x.ticker===preset.ticker);if(last)st.cds=normCds(last.cds_account);}
  const body=`
    <div class="form-sec">Trade</div>
    ${opt('type',[['Buy','▲ Buy'],['Sell','▼ Sell']],st.type,{Buy:'buy',Sell:'sell'})}
    <div class="frow" style="margin-top:12px">
      <div><div class="lbl" style="margin-bottom:6px">Market</div>${opt('market',[['Bursa','Bursa'],['US','US']],st.market)}</div>
      <div><div class="lbl" style="margin-bottom:6px">Contra</div>${opt('contra',[['no','No'],['yes','Yes']],st.contra?'yes':'no')}</div>
    </div>
    <div class="lbl" style="margin:12px 0 6px">CDS account</div>${opt('cds',[['MYB','Maybank'],['RHB','RHB'],['RKT','Rakuten']],st.cds)}
    <div class="form-sec">Stock</div>
    <div class="frow">
      <label class="fld"><span>Stock code</span><input id="tTicker" list="tList" autocomplete="off" autocapitalize="characters" placeholder="e.g. 1155" value="${H.esc(t?t.ticker:preset.ticker||'')}"></label>
      <label class="fld"><span>Stock name</span><input id="tName" placeholder="Auto-filled" value="${H.esc(t?t.company_name||'':'')}"></label>
    </div><datalist id="tList"></datalist>
    <label class="fld"><span>Date</span><input type="date" id="tDate" value="${t?t.tx_date:H.today()}"></label>
    <div class="frow">
      <label class="fld"><span>Price (<span id="tCcy">MYR</span>)</span><input type="number" inputmode="decimal" id="tPrice" step="any" min="0" placeholder="0.00" value="${t?t.price:''}"></label>
      <label class="fld"><span>Units</span><input type="number" inputmode="numeric" id="tQty" step="1" min="0" placeholder="0" value="${t?t.quantity:''}"></label>
    </div>
    <div class="form-sec">Fees (auto-calculated)</div>
    <div class="fees"><div class="fee"><div class="lbl">Gross</div><b id="fGross">—</b></div><div class="fee"><div class="lbl">Broker</div><b id="fBroker">—</b></div>
      <div class="fee"><div class="lbl">SST 6%</div><b id="fStax">—</b></div><div class="fee"><div class="lbl">Stamp duty</div><b id="fStamp">—</b></div>
      <div class="fee"><div class="lbl">Clearing</div><b id="fClear">—</b></div><div class="fee"><div class="lbl">Currency</div><b id="fCcy2">MYR</b></div></div>
    <div class="netbox"><span>NET AMOUNT</span><b id="fNet">—</b></div>
    <label class="fld" style="margin-top:14px"><span>Notes (optional)</span><input id="tNotes" placeholder="e.g. Rights issue" value="${H.esc(t?t.notes||'':'')}"></label>
    <div class="form-err" id="tErr"></div>`;
  App.openSheet({title:t?'Edit trade':'New trade',sub:t?`${t.ticker} · ${H.date(t.tx_date)}`:'',body,full:true,
    foot:`<button class="btn btn-s" onclick="App.closeSheet()">Cancel</button><button class="btn btn-p" id="tSave">${t?'Save changes':'Save trade'}</button>`});
  const root=$('shBody');
  const ccy=()=>optVal('market')==='Bursa'?'MYR':'USD';
  const fillList=()=>{$('tList').innerHTML=stockOptions(optVal('market')==='Bursa'?BURSA_STOCKS:US_STOCKS);};
  const calc=()=>{
    const c=ccy();$('tCcy').textContent=c;$('fCcy2').textContent=c;
    const p=num('tPrice'),q=num('tQty');
    if(p*q<=0){['fGross','fBroker','fStax','fStamp','fClear','fNet'].forEach(i=>$(i).textContent='—');return;}
    const f=C.fees(optVal('market'),p,q,optVal('type'));
    $('fGross').textContent=fmt(f.gross);$('fBroker').textContent=fmt(f.broker);$('fStax').textContent=fmt(f.stax);
    $('fStamp').textContent=fmt(f.stamp);$('fClear').textContent=fmt(f.clearing);$('fNet').textContent=c+' '+fmt(f.net);
  };
  bindOpts(root,(g)=>{if(g==='market'){$('tTicker').value='';$('tName').value='';fillList();}calc();});
  $('tTicker').addEventListener('input',()=>{
    const v=$('tTicker').value.trim().toUpperCase(), m=(optVal('market')==='Bursa'?BURSA_STOCKS:US_STOCKS).find(s=>s.code===v||s.name===v);
    if(m){$('tTicker').value=m.code;$('tName').value=m.name;}
  });
  ['tPrice','tQty'].forEach(i=>$(i).addEventListener('input',calc));
  fillList();calc();
  if(!t&&preset.ticker){const m=[...BURSA_STOCKS,...US_STOCKS].find(s=>s.code===preset.ticker);const last=transactions.find(x=>x.ticker===preset.ticker);$('tName').value=(last&&last.company_name)||(m&&m.name)||'';}

  $('tSave').onclick=async()=>{
    const err=$('tErr');err.textContent='';
    const ticker=$('tTicker').value.trim().toUpperCase(), market=optVal('market'), date=$('tDate').value;
    const qty=parseFloat($('tQty').value), price=parseFloat($('tPrice').value), type=optVal('type');
    if(!ticker){err.textContent='Enter a stock code.';return;}
    if(!date){err.textContent='Select a date.';return;}
    if(!qty||qty<=0){err.textContent='Enter a valid quantity.';return;}
    if(!price||price<=0){err.textContent='Enter a valid price.';return;}
    const f=C.fees(market,price,qty,type), r2=v=>parseFloat(v.toFixed(2));
    const payload={ticker,market,company_name:$('tName').value.trim()||null,tx_type:type,tx_date:date,
      quantity:qty,price,currency:market==='Bursa'?'MYR':'USD',cds_account:optVal('cds'),is_contra:optVal('contra')==='yes',
      gross_amount:r2(f.gross),broker_fee:r2(f.broker),stax:r2(f.stax),stamp_duty:r2(f.stamp),clearing_fee:r2(f.clearing),
      net_amount:r2(f.net),notes:$('tNotes').value.trim()||null,updated_at:new Date().toISOString()};
    const btn=$('tSave');btn.disabled=true;btn.textContent='Saving…';
    const {error}=t?await sb.from('transactions').update(payload).eq('id',t.id):await sb.from('transactions').insert(payload);
    btn.disabled=false;btn.textContent=t?'Save changes':'Save trade';
    if(error){err.textContent=error.message;return;}
    App.closeSheet();showToast('Trade saved ✓');App.reloadShares();
  };
};

/* ---------------- DIVIDEND ---------------- */
const guessCcy=tk=>{const t=transactions.find(x=>x.ticker===tk);return (t&&t.market==='US')||US_STOCKS.some(u=>u.code===tk)?'USD':'MYR';};
App.forms.dividend=id=>{
  const d=id?dividends.find(x=>x.id===id):null;
  const wv=d&&d.cds_account?`${normCds(d.cds_account)}-${d.currency==='USD'?'USD':'MYR'}`:'';
  const walletOpts=[['','Auto — work out from holdings'],['MYB-MYR','MYB-MYR → into Maybank CDS wallet'],['MYB-USD','MYB-USD → into Maybank CDS wallet'],
    ['RKT-MYR','RKT-MYR → into Rakuten CDS wallet'],['RKT-USD','RKT-USD → into Rakuten CDS wallet'],['RHB-MYR','RHB-MYR → to Maybank savings'],['RHB-USD','RHB-USD → to Maybank savings']];
  const body=`
    <label class="fld"><span>Payout date</span><input type="date" id="dDate" value="${d?d.payout_date:H.today()}"></label>
    <div class="frow">
      <label class="fld"><span>Stock code</span><input id="dTicker" list="dList" autocomplete="off" autocapitalize="characters" placeholder="e.g. 1155" value="${H.esc(d?d.ticker:'')}"></label>
      <label class="fld"><span>Stock name</span><input id="dName" placeholder="Auto-filled" value="${H.esc(d?d.stock_name||'':'')}"></label>
    </div><datalist id="dList">${stockOptions([...BURSA_STOCKS,...US_STOCKS])}</datalist>
    <label class="fld"><span>Amount received (<span id="dCcy">MYR</span>)</span><input type="number" inputmode="decimal" id="dAmount" step="any" min="0" placeholder="0.00" value="${d?d.amount:''}"></label>
    <label class="fld"><span>Paid from wallet</span><select id="dWallet">${walletOpts.map(([v,l])=>`<option value="${v}" ${v===wv?'selected':''}>${l}</option>`).join('')}</select>
      <div class="hint">MYB &amp; RKT dividends go into the CDS wallet; RHB dividends go to Maybank savings.</div></label>
    <label class="fld"><span>Note (optional)</span><input id="dNote" placeholder="e.g. MaybankIB, voucher no." value="${H.esc(d?d.banked_to||'':'')}"></label>
    <div class="form-err" id="dErr"></div>`;
  App.openSheet({title:d?'Edit dividend':'New dividend',body,full:true,
    foot:`<button class="btn btn-s" onclick="App.closeSheet()">Cancel</button><button class="btn btn-p" id="dSave">${d?'Save changes':'Save dividend'}</button>`});
  const upd=()=>{const w=$('dWallet').value;$('dCcy').textContent=w?w.split('-')[1]:guessCcy($('dTicker').value.trim().toUpperCase());};
  $('dTicker').addEventListener('input',()=>{const v=$('dTicker').value.trim().toUpperCase(),m=[...BURSA_STOCKS,...US_STOCKS].find(s=>s.code===v||s.name===v);
    if(m){$('dTicker').value=m.code;$('dName').value=m.name;}upd();});
  $('dWallet').addEventListener('change',upd);
  if(d)$('dCcy').textContent=d.currency==='USD'?'USD':'MYR'; else upd();
  $('dSave').onclick=async()=>{
    const err=$('dErr');err.textContent='';
    const date=$('dDate').value,ticker=$('dTicker').value.trim().toUpperCase(),amount=parseFloat($('dAmount').value);
    if(!date){err.textContent='Select a payout date.';return;}
    if(!ticker){err.textContent='Enter a ticker.';return;}
    if(!amount||amount<=0){err.textContent='Enter a valid amount.';return;}
    const w=$('dWallet').value;
    const payload={ticker,stock_name:$('dName').value.trim()||null,payout_date:date,year:new Date(date).getFullYear(),amount,
      banked_to:$('dNote').value.trim()||null,cds_account:w?w.split('-')[0]:null,currency:w?w.split('-')[1]:guessCcy(ticker)};
    const btn=$('dSave');btn.disabled=true;btn.textContent='Saving…';
    const {error}=d?await sb.from('dividends').update(payload).eq('id',d.id):await sb.from('dividends').insert(payload);
    btn.disabled=false;btn.textContent=d?'Save changes':'Save dividend';
    if(error){err.textContent=error.message;return;}
    App.closeSheet();showToast('Dividend saved ✓');App.reloadShares();
  };
};

/* ---------------- FUND MOVEMENT ----------------
   Deposit : bank (MYR) → CDS wallet · Withdraw: CDS wallet → bank (MYR) · Transfer: wallet → wallet
   MYR↔USD converted at the date's rate; overtype "received" to use your actual amounts. */
const walletKey=(cds,ccy)=>(cds||'—')+'-'+(ccy||'MYR');
const pw=k=>{const [cds,ccy]=k.split('-');return {cds,ccy};};
const uuid=()=>crypto.randomUUID?crypto.randomUUID():'xf-'+Date.now()+'-'+Math.random().toString(16).slice(2);
App.forms.funds=(id,group)=>{
  const funds=App.state.funds;
  const f=id?funds.find(x=>x.id===id):null;
  const xr=group?funds.filter(x=>x.transfer_group===group):null;
  const xo=xr&&xr.find(r=>r.txn_type==='Transfer Out'), xi=xr&&xr.find(r=>r.txn_type==='Transfer In');
  const s={mode:xo?'Transfer':f?(f.txn_type==='Withdraw'?'Withdraw':'Deposit'):'Deposit',auto:null,manual:false};
  const wopts=C.WALLETS.map(w=>`<option value="${w.key}">${w.key} · ${C.CDS_NAME[w.cds]} ${w.ccy}</option>`).join('');
  const banks=[...new Set(funds.map(x=>x.bank_account).filter(Boolean))].sort();
  const body=`
    ${opt('mode',[['Deposit','↓ Deposit'],['Withdraw','↑ Withdraw'],['Transfer','⇄ Transfer']],s.mode)}
    <div class="tiny" id="mHint" style="margin:8px 2px 4px"></div>
    <label class="fld" style="margin-top:10px"><span>Date</span><input type="date" id="mDate"></label>
    <div class="frow">
      <label class="fld"><span id="mFromL">From</span><input id="mFromBank" list="mBanks" autocomplete="off" placeholder="e.g. Maybank"><select id="mFromW">${wopts}</select></label>
      <label class="fld"><span id="mToL">To</span><select id="mToW">${wopts}</select><input id="mToBank" list="mBanks" autocomplete="off" placeholder="e.g. Maybank"></label>
    </div><datalist id="mBanks">${banks.map(b=>`<option value="${H.esc(b)}">`).join('')}</datalist>
    <div class="frow">
      <label class="fld"><span id="mSendL">Amount</span><input type="number" inputmode="decimal" id="mSend" step="any" min="0" placeholder="0.00"></label>
      <label class="fld fxr"><span id="mRecvL">Amount received</span><input type="number" inputmode="decimal" id="mRecv" step="any" min="0" placeholder="0.00"></label>
    </div>
    <div class="frow fxr">
      <label class="fld"><span>Rate — MYR per 1 USD</span><input type="number" inputmode="decimal" id="mRate" step="any" min="0" placeholder="0.0000"></label>
      <div class="fld"><span>&nbsp;</span><button type="button" class="btn btn-s" style="width:100%" id="mAuto">↻ Rate for date</button></div>
    </div>
    <div class="tiny fxr" id="mRateNote" style="margin:-6px 2px 10px"></div>
    <label class="fld"><span>Notes (optional)</span><input id="mNotes" placeholder="e.g. Funding US account"></label>
    <div class="summary-box" id="mSum"></div>
    <div class="form-err" id="mErr"></div>`;
  const editing=!!(f||xo);
  App.openSheet({title:xo?'Edit transfer':f?'Edit movement':'New movement',body,full:true,
    foot:`<button class="btn btn-s" onclick="App.closeSheet()">Cancel</button><button class="btn btn-p" id="mSave">${editing?'Save changes':'Save movement'}</button>`});
  const root=$('shBody');
  const HINT={Deposit:"Bank (MYR) → CDS wallet. Pick a USD wallet and the MYR is converted at that day's rate.",
    Withdraw:"CDS wallet → bank (MYR). From a USD wallet the USD is converted to MYR at that day's rate.",
    Transfer:'CDS wallet → CDS wallet. Between MYR and USD wallets the rate is applied automatically.'};
  const sendCcy=()=>s.mode==='Deposit'?'MYR':pw($('mFromW').value).ccy;
  const recvCcy=()=>s.mode==='Withdraw'?'MYR':pw($('mToW').value).ccy;
  const isFx=()=>sendCcy()!==recvCcy();
  const myrUsd=()=>{const a=num('mSend'),b=num('mRecv');return sendCcy()==='MYR'?{myr:a,usd:b}:{myr:b,usd:a};};
  const layout=()=>{
    const m=s.mode,fx=isFx();
    $('mFromBank').hidden=m!=='Deposit';$('mFromW').hidden=m==='Deposit';
    $('mToBank').hidden=m!=='Withdraw';$('mToW').hidden=m==='Withdraw';
    $('mFromL').textContent=m==='Deposit'?'From — bank (MYR)':'From — CDS wallet';
    $('mToL').textContent=m==='Withdraw'?'To — bank (MYR)':'To — CDS wallet';
    root.querySelectorAll('.fxr').forEach(e=>e.hidden=!fx);
    $('mSendL').textContent=fx?`Amount sent (${sendCcy()})`:`Amount (${sendCcy()})`;
    $('mRecvL').textContent=`Amount received (${recvCcy()})`;
    $('mHint').textContent=HINT[m];
  };
  const syncRate=()=>{const {myr,usd}=myrUsd();if(myr>0&&usd>0)$('mRate').value=(myr/usd).toFixed(4);};
  const summary=()=>{
    const fx=isFx(),a=num('mSend');
    const from=s.mode==='Deposit'?($('mFromBank').value.trim()||'Bank'):$('mFromW').value;
    const to=s.mode==='Withdraw'?($('mToBank').value.trim()||'Bank'):$('mToW').value;
    let txt=`${H.esc(from)} → ${H.esc(to)}`;
    if(a>0){txt+=`<br>${sendCcy()} ${fmt(a)} → ${recvCcy()} ${fmt(fx?num('mRecv'):a)}`;
      if(fx){const {myr,usd}=myrUsd();if(myr>0&&usd>0)txt+=` @ ${fmt(myr/usd,4)}${s.manual?' (your amounts)':''}`;}}
    $('mSum').innerHTML=txt;
    $('mRateNote').textContent=fx&&s.auto?`Market: USDMYR ${fmt(s.auto.rate,4)} (${s.auto.src==='live'?'live':'ECB ref. '+s.auto.date})`:'';
  };
  const recalc=()=>{
    const fx=isFx(),rate=num('mRate'),a=num('mSend'),b=num('mRecv'),fromMyr=sendCcy()==='MYR';
    if(fx&&rate>0&&!s.manual){
      if(!a&&b)$('mSend').value=(fromMyr?b*rate:b/rate).toFixed(2);
      else $('mRecv').value=a?(fromMyr?a/rate:a*rate).toFixed(2):'';
    }else if(fx&&s.manual)syncRate();
    summary();
  };
  const autoRate=async()=>{
    $('mRateNote').textContent='Fetching rate…';
    const r=await C.fxForDate($('mDate').value);
    if(!r){$('mRateNote').textContent='Could not fetch a rate — type the rate, or both amounts.';return;}
    s.auto=r;s.manual=false;$('mRate').value=r.rate.toFixed(4);recalc();
  };
  const afterAccount=()=>{s.manual=false;layout();if(isFx()&&!num('mRate'))autoRate();else recalc();};
  const setMode=(m,defaults)=>{
    s.mode=m;
    if(defaults){s.manual=false;
      if(m==='Deposit')$('mToW').value='RKT-USD';
      if(m==='Withdraw')$('mFromW').value='RKT-USD';
      if(m==='Transfer'){$('mFromW').value='MYB-MYR';$('mToW').value='MYB-USD';}
      $('mRecv').value='';}
    layout();if(isFx()&&!num('mRate'))autoRate();else recalc();
  };
  // initial values
  $('mDate').value=H.today();$('mFromBank').value='Maybank';$('mToBank').value='Maybank';
  if(xo){
    $('mDate').value=xo.txn_date;$('mNotes').value=xo.notes||'';
    $('mFromW').value=walletKey(xo.cds_account||'MYB',xo.currency);$('mToW').value=walletKey(xi.cds_account||'MYB',xi.currency);
    $('mSend').value=xo.amount;$('mRecv').value=xi.amount;
    if((xo.currency||'MYR')!==(xi.currency||'MYR')){if(xo.fx_rate)$('mRate').value=Number(xo.fx_rate).toFixed(4);s.manual=true;}
    setMode('Transfer',false);
  }else if(f){
    const ccy=f.currency||'MYR',fx=f.fx_rate?Number(f.fx_rate):null,usd=ccy==='USD';
    $('mDate').value=f.txn_date;$('mNotes').value=f.notes||'';
    if(f.txn_type==='Withdraw'){$('mFromW').value=walletKey(f.cds_account||'MYB',ccy);$('mToBank').value=f.bank_account||'';$('mSend').value=f.amount;if(usd&&fx)$('mRecv').value=(f.amount*fx).toFixed(2);}
    else{$('mFromBank').value=f.bank_account||'';$('mToW').value=walletKey(f.cds_account||'MYB',ccy);
      if(usd){$('mRecv').value=f.amount;if(fx)$('mSend').value=(f.amount*fx).toFixed(2);}else $('mSend').value=f.amount;}
    if(usd&&fx){$('mRate').value=fx.toFixed(4);s.manual=true;}
    setMode(f.txn_type==='Withdraw'?'Withdraw':'Deposit',false);
  }else setMode('Deposit',true);

  bindOpts(root,(g,v)=>{if(g==='mode')setMode(v,true);});
  $('mFromW').addEventListener('change',()=>{if(s.mode==='Transfer'){const a=pw($('mFromW').value);$('mToW').value=walletKey(a.cds,a.ccy==='MYR'?'USD':'MYR');}afterAccount();});
  $('mToW').addEventListener('change',afterAccount);
  $('mDate').addEventListener('change',()=>{if(isFx())autoRate();else summary();});
  $('mSend').addEventListener('input',recalc);
  $('mRecv').addEventListener('input',()=>{s.manual=true;syncRate();summary();});
  $('mRate').addEventListener('input',()=>{s.manual=false;recalc();});
  ['mFromBank','mToBank'].forEach(i=>$(i).addEventListener('input',summary));
  $('mAuto').onclick=autoRate;

  $('mSave').onclick=async()=>{
    const err=$('mErr');err.textContent='';
    const date=$('mDate').value,notes=$('mNotes').value.trim()||null,fx=isFx(),send=num('mSend'),recv=fx?num('mRecv'):send;
    if(!date){err.textContent='Select a date.';return;}
    if(!(send>0)){err.textContent='Enter the amount sent.';return;}
    if(fx&&!(recv>0)){err.textContent='Enter the amount received, or a rate so it can be calculated.';return;}
    const {myr,usd}=myrUsd(), rate=fx?myr/usd:null, ts=new Date().toISOString();
    let rows;
    if(s.mode==='Deposit'){const w=pw($('mToW').value),bank=$('mFromBank').value.trim();if(!bank){err.textContent='Enter the bank account.';return;}
      rows=[{txn_date:date,txn_type:'Deposit',currency:w.ccy,amount:recv,cds_account:w.cds,bank_account:bank,notes,transfer_group:null,fx_rate:rate,updated_at:ts}];}
    else if(s.mode==='Withdraw'){const w=pw($('mFromW').value),bank=$('mToBank').value.trim();if(!bank){err.textContent='Enter the bank account.';return;}
      rows=[{txn_date:date,txn_type:'Withdraw',currency:w.ccy,amount:send,cds_account:w.cds,bank_account:bank,notes,transfer_group:null,fx_rate:rate,updated_at:ts}];}
    else{const a=pw($('mFromW').value),b=pw($('mToW').value);
      if(a.cds===b.cds&&a.ccy===b.ccy){err.textContent='From and To are the same wallet.';return;}
      const g=group||uuid();
      rows=[{txn_date:date,txn_type:'Transfer Out',currency:a.ccy,amount:send,cds_account:a.cds,bank_account:null,notes,transfer_group:g,fx_rate:rate||1,updated_at:ts},
            {txn_date:date,txn_type:'Transfer In',currency:b.ccy,amount:recv,cds_account:b.cds,bank_account:null,notes,transfer_group:g,fx_rate:rate||1,updated_at:ts}];}
    const btn=$('mSave');btn.disabled=true;btn.textContent='Saving…';
    let error=null;
    if(f&&s.mode!=='Transfer')({error}=await sb.from('funds').update(rows[0]).eq('id',f.id));
    else{
      if(f)({error}=await sb.from('funds').delete().eq('id',f.id));
      else if(group)({error}=await sb.from('funds').delete().eq('transfer_group',group));
      if(!error)({error}=await sb.from('funds').insert(rows));
    }
    btn.disabled=false;btn.textContent=editing?'Save changes':'Save movement';
    if(error){err.textContent=error.message;return;}
    App.closeSheet();showToast(s.mode+' saved ✓');App.loadFunds();
  };
};
})();
