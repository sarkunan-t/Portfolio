/* ===== UnicornHunter app — derived numbers =====
   Same maths as the web pages (shares-holdings / transactions / funds / dividends / summary),
   built on shares.js (positionEngine, calcHoldings, allocateDividends, txSettle, priceCache, kpiFx). */
(function(){
const H=App.h;
const C=App.calc={};
const CDS=['MYB','RHB','RKT'];
C.CDS=CDS;
C.CDS_NAME={MYB:'Maybank',RHB:'RHB',RKT:'Rakuten'};
C.WALLETS=[];['MYR','USD'].forEach(ccy=>CDS.forEach(c=>C.WALLETS.push({cds:c,ccy,key:c+'-'+ccy})));

C.quote=sym=>{const q=priceCache[sym];return q&&q!=='err'?q:null;};
C.qstate=sym=>{const q=priceCache[sym];return q===undefined||q===null?'loading':q==='err'?'err':'ok';};
C.toMyr=(ccy,v)=>v==null?null:ccy==='USD'?(H.fx()?v*H.fx():null):v;
C.dayPct=q=>q&&q.prevClose?((q.price-q.prevClose)/q.prevClose*100):null;
const lotCcy=l=>(l.ccy==='USD'||l.market==='US')?'USD':'MYR';

/* ---- open positions: one per stock per wallet (holdings page) ----
   f: {ccy:[],wallet:[],stock:[],year:[]} */
C.positions=(f={})=>{
  const pass=(g,v)=>!f[g]||!f[g].length||f[g].includes(String(v));
  const map={};
  positionEngine().open.forEach(l=>{
    const ccy=lotCcy(l), wk=l.cds+'-'+ccy, yr=new Date(l.tx.tx_date).getFullYear();
    if(!pass('ccy',ccy)||!pass('wallet',wk)||!pass('stock',l.ticker)||!pass('year',yr))return;
    const k=l.ticker+'|'+l.market+'|'+l.cds;
    const p=map[k]||(map[k]={ticker:l.ticker,market:l.market,name:l.name,cds:l.cds,ccy,wallet:wk,units:0,cost:0,since:null,lots:0});
    p.units+=l.units;p.cost+=l.cost;p.lots++;
    const d=String(l.tx.tx_date||'');if(!p.since||d<p.since)p.since=d;
  });
  return Object.values(map).map(p=>{
    const sym=toYahoo(p), q=C.quote(sym);
    p.sym=sym; p.state=C.qstate(sym);
    p.price=q?q.price:null; p.prevClose=q?q.prevClose:null;
    p.value=q?p.units*q.price:null; p.pnl=q?p.value-p.cost:null;
    p.pnlPct=q&&p.cost?p.pnl/p.cost*100:null;
    p.avg=p.units>0?p.cost/p.units:0;
    p.dayPct=C.dayPct(q); p.dayAmt=q&&q.prevClose?p.units*(q.price-q.prevClose):null;
    p.label=H.stockLabel(p.ticker,p.market,p.name); p.subl=H.stockSub(p.ticker,p.market,p.name);
    return p;
  });
};
C.totals=list=>{
  const t={n:list.length,cost:0,value:0,pricedCost:0,priced:0,loading:0,day:0,dayBase:0};
  list.forEach(p=>{t.cost+=p.cost;
    if(p.state==='ok'){t.value+=p.value;t.pricedCost+=p.cost;t.priced++;
      if(p.dayAmt!=null){t.day+=p.dayAmt;t.dayBase+=p.units*p.prevClose;}}
    else if(p.state==='loading')t.loading++;});
  t.pnl=t.priced?t.value-t.pricedCost:null;
  t.pnlPct=t.priced&&t.pricedCost?t.pnl/t.pricedCost*100:null;
  t.dayPct=t.dayBase?t.day/t.dayBase*100:null;
  if(!t.priced)t.value=null;
  return t;
};
/* both currencies combined in MYR */
C.combined=pos=>{
  const by={MYR:pos.filter(p=>p.ccy==='MYR'),USD:pos.filter(p=>p.ccy==='USD')};
  const T={MYR:C.totals(by.MYR),USD:C.totals(by.USD)}, r=H.fx();
  const val=(T.MYR.value||0)+(C.toMyr('USD',T.USD.value)||0);
  const pc=T.MYR.pricedCost+(C.toMyr('USD',T.USD.pricedCost)||0);
  const any=T.MYR.priced||T.USD.priced;
  const c={n:T.MYR.n+T.USD.n,cost:T.MYR.cost+(C.toMyr('USD',T.USD.cost)||0),
    value:any?val:null,pnl:any?val-pc:null,usdPending:T.USD.n>0&&!r,
    day:T.MYR.day+(C.toMyr('USD',T.USD.day)||0),
    dayBase:T.MYR.dayBase+(C.toMyr('USD',T.USD.dayBase)||0),
    wallets:new Set(pos.map(p=>p.wallet)).size};
  c.pnlPct=c.pnl!=null&&pc?c.pnl/pc*100:null;
  c.dayPct=c.dayBase?c.day/c.dayBase*100:null;
  return {by,T,c};
};

/* ---- portfolio KPIs (unfiltered version of shares.js updateKPIs) ---- */
C.kpis=()=>{
  const {realised,open}=positionEngine();
  const Z=()=>({MYR:0,USD:0});
  const inv=Z(),val=Z(),cost=Z(),real=Z(),div=Z();
  let openN=new Set(),priced=new Set();
  realised.forEach(r=>{if(r.ccy==='MYR'||r.ccy==='USD')real[r.ccy]+=r.pnl;});
  open.forEach(l=>{
    if(l.ccy!=='MYR'&&l.ccy!=='USD')return;
    const pk=l.ticker+'|'+l.market+'|'+l.cds;openN.add(pk);inv[l.ccy]+=l.cost;
    const q=C.quote(toYahoo(l));
    if(q){val[l.ccy]+=l.units*q.price;cost[l.ccy]+=l.cost;priced.add(pk);}
  });
  dividends.forEach(d=>{div[d.currency==='USD'?'USD':'MYR']+=Number(d.amount)||0;});
  const unr={MYR:val.MYR-cost.MYR,USD:val.USD-cost.USD};
  const net={MYR:real.MYR+unr.MYR+div.MYR,USD:real.USD+unr.USD+div.USD};
  const r=H.fx(), m=o=>r?o.MYR+o.USD*r:null;
  const cm=m(cost);
  return {inv,val,cost,real,div,unr,net,m,open:openN.size,priced:priced.size,
    unrPct:priced.size&&cm?m(unr)/cm*100:null};
};

/* ---- all stocks incl. sold (summary page) ---- */
C.summary=()=>{
  const divBy={};
  dividends.forEach(d=>{const y=new Date(d.payout_date).getFullYear();(divBy[d.ticker]=divBy[d.ticker]||{})[y]=((divBy[d.ticker]||{})[y]||0)+Number(d.amount);});
  return calcHoldings().map(h=>{
    const sym=h.market==='Bursa'?h.ticker+'.KL':h.ticker, q=C.quote(sym), open=h.qty>0.001;
    const est=open&&q?h.qty*q.price:null;
    const dv=divBy[h.ticker]||{}, divTot=Object.values(dv).reduce((s,v)=>s+v,0);
    return {...h,sym,open,avg:h.qty>0?h.totalCost/h.qty:0,price:q?q.price:null,state:C.qstate(sym),
      est,unreal:est!=null?est-h.totalCost:null,divByYear:dv,divTot,
      label:h.company_name||TICKER_NAME[h.ticker]||h.ticker,ccy:h.currency||(h.market==='Bursa'?'MYR':'USD')};
  }).sort((a,b)=>(b.open-a.open)||a.label.localeCompare(b.label));
};

/* ---- dividends as payout lines (dividends page) ---- */
C.divLines=()=>allocateDividends(dividends,transactions).map(x=>({
  ...x,id:x.div.id,date:x.div.payout_date,year:String(new Date(x.div.payout_date).getFullYear()),
  ticker:x.div.ticker,name:x.div.stock_name||x.div.ticker,
  wallet:x.cds?`${x.cds}-${x.ccy}`:'Unassigned',
  dest:!x.cds?'Unassigned':(x.toWallet?'CDS wallet':'Maybank savings'),
  auto:!x.div.cds_account
}));
C.lineMyr=l=>l.ccy==='USD'?(H.fx()?l.amount*H.fx():null):l.amount;
C.divStats=lines=>{
  const now=new Date().getFullYear(), byYear={}, byStock={};
  let total=0,toWal=0,toSav=0,pending=0;
  lines.forEach(l=>{const m=C.lineMyr(l);if(m==null){pending++;return;}
    total+=m;byYear[+l.year]=(byYear[+l.year]||0)+m;byStock[l.name]=(byStock[l.name]||0)+m;
    if(l.dest==='CDS wallet')toWal+=m;else if(l.dest==='Maybank savings')toSav+=m;});
  const past=Object.keys(byYear).map(Number).filter(y=>y<now);
  const avg=past.length?past.reduce((s,y)=>s+byYear[y],0)/past.length:0;
  const top=Object.entries(byStock).sort((a,b)=>b[1]-a[1])[0]||['—',0];
  const latest=[...lines].sort((a,b)=>b.date.localeCompare(a.date))[0];
  return {now,byYear,byStock,total,toWal,toSav,pending,avg,pastN:past.length,top,latest};
};

/* ---- cash per CDS wallet (transactions page "Cash by CDS Wallet") ---- */
const SETTLE_DAYS={Bursa:2,US:1};
C.addBizDays=(dateStr,n)=>{const d=new Date(dateStr+'T00:00:00');let k=0;while(k<n){d.setDate(d.getDate()+1);const w=d.getDay();if(w!==0&&w!==6)k++;}return d;};
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
C.walletCash=()=>{
  const today=H.today(), W={}, order=[];
  const wal=(cds,ccy)=>{const c=normCds(cds)||'—',k=c+'-'+ccy;
    if(!W[k]){W[k]={key:k,cds:c,ccy,cap:0,buy:0,buyN:0,sell:0,sellN:0,div:0,divN:0,divOut:0,divOutN:0,divBank:'',capIn:0,capInN:0,capOut:0,capOutN:0,xIn:0,xOut:0,pend:[],active:false};order.push(k);}
    return W[k];};
  ['MYR','USD'].forEach(ccy=>CDS.forEach(c=>wal(c,ccy)));
  App.state.funds.forEach(f=>{
    const ccy=f.currency||'MYR';if(ccy!=='MYR'&&ccy!=='USD')return;
    const a=wal(f.cds_account,ccy),amt=Number(f.amount)||0,inn=(f.txn_type==='Deposit'||f.txn_type==='Transfer In');
    a.cap+=inn?amt:-amt;a.active=true;
    if(inn){a.capIn+=amt;a.capInN++;if(f.txn_type==='Transfer In')a.xIn+=amt;}
    else{a.capOut+=amt;a.capOutN++;if(f.txn_type==='Transfer Out')a.xOut+=amt;}
  });
  transactions.forEach(t=>{
    const st=txSettle(t),ccy=st.ccy;if(ccy!=='MYR'&&ccy!=='USD')return;
    const a=wal(t.cds_account,ccy),amt=st.amt;a.active=true;
    if(t.tx_type==='Buy'){a.buy+=amt;a.buyN++;}else{a.sell+=amt;a.sellN++;}
    const n=SETTLE_DAYS[t.market]??2,due=ymd(C.addBizDays(t.tx_date,n));
    if(due>=today)a.pend.push({t,due,amt,n});
  });
  allocateDividends(dividends,transactions).forEach(x=>{
    if(!x.cds)return;const a=wal(x.cds,x.ccy);a.active=true;
    if(x.toWallet){a.div+=x.amount;a.divN++;}else{a.divOut+=x.amount;a.divOutN++;a.divBank=x.bank;}
  });
  const HV={};
  positionEngine().open.forEach(l=>{
    const k=l.cds+'-'+l.ccy;if(!HV[k])HV[k]={val:0,cost:0,pricedCost:0,stocks:new Set(),unpriced:new Set()};
    const h=HV[k];h.stocks.add(l.ticker);h.cost+=l.cost;
    const q=C.quote(toYahoo(l));if(q){h.val+=l.units*q.price;h.pricedCost+=l.cost;}else h.unpriced.add(l.ticker);
    wal(l.cds,l.ccy).active=true;
  });
  return order.map(k=>{
    const a=W[k];a.bal=a.cap-a.buy+a.sell+a.div;a.hold=HV[k]||null;
    const g={};
    a.pend.forEach(p=>{const key=p.due+'|'+p.t.tx_type;if(!g[key])g[key]={due:p.due,side:p.t.tx_type,amt:0,tickers:new Set(),contra:false,n:p.n};
      g[key].amt+=p.amt;g[key].tickers.add(p.t.ticker);if(p.t.is_contra)g[key].contra=true;});
    a.groups=Object.values(g).sort((x,y)=>x.due.localeCompare(y.due));
    const payDue=a.groups.filter(x=>x.side==='Buy').reduce((s,x)=>s+x.amt,0),first=a.groups.find(x=>x.side==='Buy');
    a.short=payDue>0&&a.bal<0?{amt:-a.bal,by:first.due}:null;
    a.negative=!a.short&&a.bal<-0.005;
    a.total=a.hold?a.bal+a.hold.val:a.bal;
    return a;
  });
};

/* ---- uninvested cash across all wallets, in MYR (counts towards net worth) ---- */
C.cashTotal=()=>{
  if(App.state.fundsStatus!=='ok')return {ok:false,myr:0,MYR:0,USD:0,n:0};
  const r=H.fx(),W=C.walletCash().filter(a=>a.active);
  const t={ok:true,MYR:0,USD:0,n:W.length,usdPending:false};
  W.forEach(a=>{t[a.ccy]+=a.bal;});
  t.neg=W.filter(a=>a.bal<-0.5).map(a=>a.key);
  if(t.USD&&!r)t.usdPending=true;
  t.myr=t.MYR+(r?t.USD*r:0);
  return t;
};

/* ---- funds balances (funds page) ---- */
C.fundBalances=(asOf,netShares)=>{
  const bal={};const cell=c=>{const k=c||'—';if(!bal[k])bal[k]={MYR:0,USD:0};return bal[k];};
  CDS.forEach(c=>cell(c));
  App.state.funds.forEach(f=>{
    if(asOf&&f.txn_date&&f.txn_date>asOf)return;
    const ccy=f.currency||'MYR';if(ccy!=='MYR'&&ccy!=='USD')return;
    const amt=Number(f.amount)||0,b=cell(f.cds_account);
    if(f.txn_type==='Deposit'||f.txn_type==='Transfer In')b[ccy]+=amt;else b[ccy]-=amt;
  });
  if(netShares){
    transactions.forEach(t=>{
      if(asOf&&t.tx_date&&t.tx_date>asOf)return;
      const st=txSettle(t),ccy=st.ccy;if(ccy!=='MYR'&&ccy!=='USD')return;
      const b=cell(normCds(t.cds_account));if(t.tx_type==='Buy')b[ccy]-=st.amt;else b[ccy]+=st.amt;
    });
    allocateDividends(dividends,transactions).forEach(x=>{
      if(!x.toWallet)return;if(asOf&&x.div.payout_date&&x.div.payout_date>asOf)return;
      cell(x.cds)[x.ccy]+=x.amount;
    });
  }
  return bal;
};
C.sumBal=bal=>{let m=0,u=0;Object.values(bal).forEach(b=>{m+=b.MYR;u+=b.USD;});return {m,u};};

/* ---- P&L segments by stock by year (transactions page chart) ----
   pass(tx) decides which trades count (filters). */
C.pnlSegments=pass=>{
  const {realised,open}=positionEngine(), fx=H.fx();
  const segs=[],unpriced=new Set(),noCost=[];
  realised.forEach(r=>{if(!pass(r.tx))return;if(r.noCost)noCost.push(r);
    segs.push({kind:'R',ticker:r.ticker,name:r.name,market:r.market,ccy:r.ccy,cds:r.cds,year:new Date(r.tx.tx_date).getFullYear(),
      units:r.units,avg:r.avg,px:r.units?r.proceeds/r.units:0,native:r.pnl,noCost:r.noCost});});
  open.forEach(l=>{if(!pass(l.tx))return;const q=C.quote(toYahoo(l));if(!q){unpriced.add(l.ticker+'|'+l.cds);return;}
    segs.push({kind:'U',ticker:l.ticker,name:l.name,market:l.market,ccy:l.ccy,cds:l.cds,year:new Date(l.tx.tx_date).getFullYear(),
      units:l.units,avg:l.avg,px:q.price,native:l.units*(q.price-l.avg)});});
  segs.forEach(g=>{g.myr=g.ccy==='USD'?(fx?g.native*fx:null):g.native;});
  let noFx=0;const M={};
  segs.forEach(g=>{if(g.myr==null){noFx++;return;}
    const k=g.year+'|'+g.ticker+'|'+g.kind;
    if(!M[k])M[k]=Object.assign({},g,{cdsSet:new Set()});
    else{const m=M[k];if(g.noCost)m.noCost=true;m.avg=(m.avg*m.units+g.avg*g.units)/(m.units+g.units);m.px=(m.px*m.units+g.px*g.units)/(m.units+g.units);m.units+=g.units;m.native+=g.native;m.myr+=g.myr;}
    M[k].cdsSet.add(g.cds);});
  const items=Object.values(M).filter(g=>Math.abs(g.myr)>=0.005);
  items.forEach(g=>g.cds=[...g.cdsSet].join(', '));
  return {items,unpriced:unpriced.size,noCost,noFx};
};

/* ---- trade fees (transactions page) ---- */
C.fees=(market,price,qty,type)=>{
  const gross=price*qty;
  let broker,stax,stamp,clearing;
  if(market==='Bursa'){broker=Math.max(gross*0.0042,8);stax=broker*0.06;stamp=Math.min(Math.ceil(gross/1000),200);clearing=Math.min(gross*0.0003,1000);}
  else{broker=Math.max(gross*0.003,3);stax=0;stamp=0;clearing=0;}
  const tot=broker+stax+stamp+clearing;
  return {gross,broker,stax,stamp,clearing,net:type==='Buy'?gross+tot:gross-tot};
};

/* ---- FX for a date: live today (quote fn), else ECB via Frankfurter (funds page) ---- */
C.fxForDate=async dateStr=>{
  const today=H.today(), isToday=!dateStr||dateStr>=today;
  if(isToday){
    let r=H.fx();
    if(!r){try{await fetchPrices(['USDMYR=X']);const c=priceCache['USDMYR=X'];if(c&&c!=='err')r=c.price;}catch(e){}}
    if(r)return {rate:r,date:today,src:'live'};
  }
  try{const res=await fetch(`https://api.frankfurter.dev/v1/${isToday?'latest':dateStr}?base=USD&symbols=MYR`);
    if(res.ok){const j=await res.json();if(j&&j.rates&&j.rates.MYR)return {rate:j.rates.MYR,date:j.date,src:'ECB'};}}catch(e){}
  return null;
};
})();
