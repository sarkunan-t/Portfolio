/* ===== Chart & analysis (More → Quote lookup) =====
   App.ta.mount(el, 'NVDA')  → price chart with SMA 20/50/200 + Bollinger, volume, RSI(14), MACD(12,26,9),
   technical snapshot, fundamentals, a rule-based "technical read", and an optional AI analysis.
   Data: Edge Function "stock-analysis" (mobile/supabase/stock-analysis/index.ts) — 5 years of daily bars,
   a benchmark (S&P 500 for US, FBM KLCI for Bursa) and Yahoo fundamentals. All indicators are computed here. */
(function(){
const H=App.h;
const TA=App.ta={cache:{},st:{range:'1y',sma20:false,sma50:true,sma200:true,bb:false,candles:false},ai:{}};
try{Object.assign(TA.st,JSON.parse(localStorage.getItem('ta_prefs')||'{}'));}catch(e){}
const savePrefs=()=>{try{localStorage.setItem('ta_prefs',JSON.stringify(TA.st));}catch(e){}};

/* ---------- indicator maths (pure; arrays aligned with bars, null where not enough data) ---------- */
const I=TA.ind={
  sma(a,n){const o=new Array(a.length).fill(null);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];if(i>=n-1)o[i]=s/n;}return o;},
  ema(a,n){const o=new Array(a.length).fill(null),k=2/(n+1);let e=null,s=0,c=0;
    for(let i=0;i<a.length;i++){const v=a[i];if(v==null)continue;if(e==null){s+=v;c++;if(c===n){e=s/n;o[i]=e;}continue;}e=v*k+e*(1-k);o[i]=e;}return o;},
  rsi(a,n=14){const o=new Array(a.length).fill(null);if(a.length<=n)return o;let g=0,l=0;
    for(let i=1;i<=n;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d;}g/=n;l/=n;o[n]=l===0?100:100-100/(1+g/l);
    for(let i=n+1;i<a.length;i++){const d=a[i]-a[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;o[i]=l===0?100:100-100/(1+g/l);}return o;},
  macd(a,f=12,s=26,sg=9){const ef=I.ema(a,f),es=I.ema(a,s),m=a.map((_,i)=>ef[i]!=null&&es[i]!=null?ef[i]-es[i]:null);
    const first=m.findIndex(v=>v!=null),sig=new Array(a.length).fill(null);
    if(first>=0){const e=I.ema(m.slice(first),sg);e.forEach((v,j)=>sig[first+j]=v);}
    return {macd:m,signal:sig,hist:m.map((v,i)=>v!=null&&sig[i]!=null?v-sig[i]:null)};},
  bb(a,n=20,k=2){const mid=I.sma(a,n),up=new Array(a.length).fill(null),lo=new Array(a.length).fill(null);
    for(let i=n-1;i<a.length;i++){let s=0;for(let j=i-n+1;j<=i;j++)s+=(a[j]-mid[i])**2;const sd=Math.sqrt(s/n);up[i]=mid[i]+k*sd;lo[i]=mid[i]-k*sd;}return {mid,up,lo};},
  atr(h,l,c,n=14){const o=new Array(c.length).fill(null);let a=0;
    for(let i=1;i<c.length;i++){const tr=Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1]));
      if(i<n){a+=tr;continue;} if(i===n){a=(a+tr)/n;o[i]=a;continue;} a=(a*(n-1)+tr)/n;o[i]=a;}return o;}
};

/* ---------- data ---------- */
TA.load=async(sym,force)=>{
  const c=TA.cache[sym];
  if(!force&&c&&(c.status==='loading'||(c.status==='ok'&&Date.now()-c.at<10*60*1000)))return c;
  const e=TA.cache[sym]={status:'loading',at:Date.now()};
  try{
    const call=sb.functions.invoke('stock-analysis',{body:{action:'data',symbol:sym}});
    const to=new Promise((_,rej)=>setTimeout(()=>rej(new Error('Chart request timed out')),25000));
    const {data,error}=await Promise.race([call,to]);
    if(error){const m=String(error.message||error);throw new Error(/not found|404|Failed to send/i.test(m)?'missing':m);}
    if(!data||data.error)throw new Error(data&&data.error||'No data');
    if(!data.bars||data.bars.length<30)throw new Error('Not enough price history for '+sym);
    Object.assign(e,{status:'ok',data,calc:compute(data),at:Date.now()});
  }catch(err){Object.assign(e,{status:'error',err:String(err.message||err)});}
  return e;
};

function compute(d){
  const b=d.bars,t=b.map(x=>x[0]),o=b.map(x=>x[1]),h=b.map(x=>x[2]),l=b.map(x=>x[3]),c=b.map(x=>x[4]),v=b.map(x=>x[5]);
  const k={t,o,h,l,c,v,sma20:I.sma(c,20),sma50:I.sma(c,50),sma200:I.sma(c,200),rsi:I.rsi(c,14),bb:I.bb(c,20,2),atr:I.atr(h,l,c,14),vma50:I.sma(v,50),...I.macd(c)};
  k.snap=snapshot(k,d);return k;
}
const pctOf=(a,b)=>a!=null&&b?(a/b-1)*100:null;
function lastCross(a,b,from){ // index where sign(a-b) last changed
  for(let i=from;i>0;i--){if(a[i]==null||b[i]==null||a[i-1]==null||b[i-1]==null)return null;
    if(Math.sign(a[i]-b[i])!==Math.sign(a[i-1]-b[i-1]))return i;}return null;}
function snapshot(k,d){
  const L=k.c.length-1,c=k.c[L],at=n=>L-n>=0?k.c[L-n]:null,S={};
  S.price=c;S.date=k.t[L];
  S.sma20=k.sma20[L];S.sma50=k.sma50[L];S.sma200=k.sma200[L];
  S.vs50=pctOf(c,S.sma50);S.vs200=pctOf(c,S.sma200);
  S.slope50=L>=69&&k.sma50[L-20]?pctOf(S.sma50,k.sma50[L-20]):null;
  S.slope200=L>=219&&k.sma200[L-20]?pctOf(S.sma200,k.sma200[L-20]):null;
  const xi=S.sma200!=null?lastCross(k.sma50,k.sma200,L):null;
  S.cross=S.sma200==null?null:{golden:S.sma50>S.sma200,date:xi!=null?k.t[xi]:null,days:xi!=null?L-xi:null};
  S.rsi=k.rsi[L];S.rsiPrev=k.rsi[L-5]??null;
  S.macd=k.macd[L];S.signal=k.signal[L];S.hist=k.hist[L];S.histPrev=k.hist[L-1];
  const mi=S.signal!=null?lastCross(k.macd,k.signal,L):null;S.macdCrossDays=mi!=null?L-mi:null;
  const bu=k.bb.up[L],bl=k.bb.lo[L];S.pctB=bu!=null&&bu!==bl?(c-bl)/(bu-bl):null;S.bbWidth=bu!=null&&k.bb.mid[L]?(bu-bl)/k.bb.mid[L]*100:null;
  S.atrPct=k.atr[L]!=null?k.atr[L]/c*100:null;
  const y0=Math.max(0,L-251);S.hi52=Math.max(...k.h.slice(y0));S.lo52=Math.min(...k.l.slice(y0));
  S.fromHi=pctOf(c,S.hi52);S.fromLo=pctOf(c,S.lo52);
  const rng=n=>{const s=Math.max(0,L-n+1);return {hi:Math.max(...k.h.slice(s)),lo:Math.min(...k.l.slice(s))};};
  S.r20=rng(20);S.r60=rng(60);
  S.ret={'1M':pctOf(c,at(21)),'3M':pctOf(c,at(63)),'6M':pctOf(c,at(126)),'1Y':pctOf(c,at(252))};
  const yr=new Date(k.t[L]*1000).getFullYear(),yi=k.t.findIndex(x=>new Date(x*1000).getFullYear()===yr);
  S.ret.YTD=yi>0?pctOf(c,k.c[yi-1]):null;
  S.vol=k.v[L];S.vavg=k.vma50[L];S.volRatio=S.vavg?S.vol/S.vavg:null;
  const v5=k.v.slice(-5).reduce((a,x)=>a+x,0)/5;S.vol5Ratio=S.vavg?v5/S.vavg:null;
  let up=0,dn=0;for(let i=Math.max(1,L-49);i<=L;i++){if(k.c[i]>k.c[i-1])up+=k.v[i];else if(k.c[i]<k.c[i-1])dn+=k.v[i];}
  S.udVol=dn?up/dn:null;
  // relative strength vs benchmark
  S.bench=d.bench&&d.bench.symbol;S.rs={};
  if(d.bench&&d.bench.points&&d.bench.points.length>70){
    const bp=d.bench.points,bAt=ts=>{let lo=0,hi=bp.length-1;if(ts<bp[0][0])return null;while(hi-lo>1){const m=(lo+hi)>>1;if(bp[m][0]<=ts)lo=m;else hi=m;}return bp[bp[hi][0]<=ts?hi:lo][1];};
    const bNow=bAt(k.t[L]);
    for(const [lab,n] of [['3M',63],['6M',126],['1Y',252]]){if(L-n<0)continue;const b0=bAt(k.t[L-n]);
      if(b0&&bNow)S.rs[lab]={stock:S.ret[lab],bench:pctOf(bNow,b0),diff:S.ret[lab]-pctOf(bNow,b0)};}
  }
  // trend stage
  const a=S.sma50,z=S.sma200,r=S.slope200;
  if(z==null)S.stage={k:'na',t:'Not enough history',d:'Needs 200 trading days for the long-term trend.'};
  else if(c>a&&a>z&&r>0)S.stage={k:'up',t:'Uptrend',d:'Price above a rising 50-day and 200-day average, 50-day above 200-day.'};
  else if(c<a&&a<z&&r<0)S.stage={k:'down',t:'Downtrend',d:'Price below a falling 50-day and 200-day average.'};
  else if(c<a&&c>z&&r>0)S.stage={k:'pull',t:'Pullback in uptrend',d:'Dipped under the 50-day but still above a rising 200-day.'};
  else if(c>a&&c<z)S.stage={k:'rec',t:'Recovery attempt',d:'Back above the 50-day but still under the 200-day.'};
  else if(Math.abs(r||0)<1.5&&Math.abs(S.vs200||0)<10)S.stage={k:'base',t:'Sideways / basing',d:'Flat 200-day average with price close to it.'};
  else if(c>z&&r<=0)S.stage={k:'top',t:'Losing momentum',d:'Above the 200-day, but that average has stopped rising.'};
  else S.stage={k:'mixed',t:'Mixed',d:'Trend signals disagree.'};
  return S;
}

/* ---------- rule-based technical read (free, instant) ---------- */
function read(S,st,u){
  const out=[],m=v=>u(v),add=(tone,txt,w=1)=>out.push({tone,txt,w:tone==='up'?w:tone==='down'?-w:0});
  if(S.stage.k==='up')add('up',`<b>Uptrend.</b> ${S.stage.d}`,1.5);
  else if(S.stage.k==='down')add('down',`<b>Downtrend.</b> ${S.stage.d}`,1.5);
  else if(S.stage.k==='pull')add('flat',`<b>Pullback in an uptrend.</b> Watch whether it holds the 200-day (${m(S.sma200)}).`);
  else if(S.stage.k==='rec')add('flat',`<b>Recovery attempt.</b> Needs to get back above the 200-day (${m(S.sma200)}) to repair the long-term trend.`);
  else if(S.stage.k!=='na')add('flat',`<b>${S.stage.t}.</b> ${S.stage.d}`);
  if(S.cross){const rec=S.cross.days!=null&&S.cross.days<=30;
    if(S.cross.golden)add('up',`50-day is above the 200-day (golden cross${S.cross.date?`, ${rec?'fresh — ':''}${dShort(S.cross.date)}`:''}).`,rec?1:0.5);
    else add('down',`50-day is below the 200-day (death cross${S.cross.date?`, ${rec?'fresh — ':''}${dShort(S.cross.date)}`:''}).`,rec?1:0.5);}
  if(S.rsi!=null){const r=Math.round(S.rsi);
    if(r>=70)add('down',`RSI ${r} — overbought. Strong buying, but a pause or pullback is common from here.`,0.5);
    else if(r<=30)add('flat',`RSI ${r} — oversold. Selling may be stretched; wait for the price to turn up before reading it as a bounce.`);
    else if(r>=50)add('up',`RSI ${r} — momentum on the buyers' side.`,0.5);
    else add('down',`RSI ${r} — momentum on the sellers' side.`,0.5);}
  if(S.hist!=null){const rising=S.hist>S.histPrev;
    if(S.macd>S.signal)add('up',`MACD above its signal line${rising?' and widening':' but narrowing'}${S.macdCrossDays!=null&&S.macdCrossDays<=10?` (crossed up ${S.macdCrossDays}d ago)`:''}.`,rising?1:0.5);
    else add('down',`MACD below its signal line${!rising?' and widening':' but narrowing'}${S.macdCrossDays!=null&&S.macdCrossDays<=10?` (crossed down ${S.macdCrossDays}d ago)`:''}.`,!rising?1:0.5);}
  if(S.vs50!=null&&S.vs50>=25||S.vs200!=null&&S.vs200>=50)add('down',`Extended: ${pc(S.vs50)} above the 50-day${S.vs200!=null?`, ${pc(S.vs200)} above the 200-day`:''}. Chasing here risks buying the top of a run.`,0.75);
  if(S.fromHi!=null){if(S.fromHi>=-5)add('up',`Within ${fmt(Math.abs(S.fromHi),1)}% of its 52-week high (${m(S.hi52)}) — strength, and a breakout level to watch.`,0.5);
    else if(S.fromHi<=-35)add('down',`${fmt(Math.abs(S.fromHi),0)}% below its 52-week high — a lot of overhead supply from earlier buyers.`,0.5);}
  const rs=S.rs['3M']||S.rs['6M'];
  if(rs){const lab=S.rs['3M']?'3 months':'6 months',bn=S.bench==='^KLSE'?'the FBM KLCI':S.bench==='^GSPC'?'the S&P 500':S.bench;
    if(rs.diff>=5)add('up',`Beating ${bn} by ${fmt(rs.diff,1)} pts over ${lab}.`);
    else if(rs.diff<=-5)add('down',`Lagging ${bn} by ${fmt(Math.abs(rs.diff),1)} pts over ${lab}.`);
    else add('flat',`Moving roughly in line with ${bn} over ${lab}.`);}
  if(S.udVol!=null){if(S.udVol>=1.25)add('up',`More volume on up days than down days over 50 days (${fmt(S.udVol,2)}×) — accumulation.`,0.5);
    else if(S.udVol<=0.8)add('down',`More volume on down days than up days over 50 days (${fmt(S.udVol,2)}×) — distribution.`,0.5);}
  if(S.volRatio!=null&&S.volRatio>=2)add('flat',`Last session traded ${fmt(S.volRatio,1)}× its 50-day average volume — check the news.`);
  if(S.atrPct!=null&&S.atrPct>=4)add('flat',`Volatile: average daily range ${fmt(S.atrPct,1)}% — size positions and stops accordingly.`);
  if(st&&!st.error){
    if(st.target&&S.price){const up=(st.target/S.price-1)*100;
      if(up>=15&&st.ratingMean&&st.ratingMean<=2.5)add('up',`Analysts: average target ${m(st.target)} (${pc(up)}), rated ${ratingTxt(st)} by ${st.analysts||'?'}.`,0.5);
      else if(up<0)add('down',`Price is above the average analyst target ${m(st.target)} (${pc(up)}).`,0.5);
      else add('flat',`Analysts: average target ${m(st.target)} (${pc(up)})${st.analysts?`, ${st.analysts} analysts`:''}.`);}
    if(st.earningsDate){const dd=Math.round((st.earningsDate*1000-Date.now())/86400000);
      if(dd>=0&&dd<=14)add('flat',`Earnings in ${dd} day${dd===1?'':'s'} (${dShort(st.earningsDate)}) — expect a big move either way.`);}
  }
  const score=out.reduce((a,x)=>a+x.w,0);
  const tilt=score>=2.5?{k:'up',t:'Constructive'}:score<=-2.5?{k:'down',t:'Cautious'}:{k:'flat',t:'Neutral / mixed'};
  const watch=[];
  if(S.sma50)watch.push(`${S.price>=S.sma50?'Holding above':'Reclaiming'} the 50-day (${m(S.sma50)}) ${S.price>=S.sma50?'keeps the short-term trend intact':'would improve the short-term trend'}.`);
  if(S.sma200)watch.push(`${S.price>=S.sma200?'A close below':'A close above'} the 200-day (${m(S.sma200)}) would ${S.price>=S.sma200?'weaken':'repair'} the long-term picture.`);
  watch.push(`Nearby resistance ${m(S.r60.hi)} (60-day high) · support ${m(S.r60.lo)} (60-day low).`);
  return {items:out,tilt,score,watch};
}
const ratingTxt=st=>({strong_buy:'Strong buy',buy:'Buy',hold:'Hold',underperform:'Underperform',sell:'Sell'})[st.rating]||st.rating||'—';
const dShort=t=>new Date(t*1000).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
const pc=v=>v==null||!isFinite(v)?'—':`${v>=0?'+':'−'}${fmt(Math.abs(v),1)}%`;
const pcS=v=>v==null||!isFinite(v)?'<span class="dim">—</span>':`<span class="${v>=0?'up':'down'}">${pc(v)}</span>`;
const big=v=>v==null?'—':Math.abs(v)>=1e12?fmt(v/1e12,2)+'T':Math.abs(v)>=1e9?fmt(v/1e9,2)+'B':Math.abs(v)>=1e6?fmt(v/1e6,1)+'M':Math.abs(v)>=1e3?fmt(v/1e3,0)+'K':fmt(v,0);

/* ---------- chart ---------- */
const COL={close:'#0aa79f',sma20:'#8b5cf6',sma50:'#e8a33a',sma200:'#3b5bdb',bb:'#94a3a0',up:'#16a34a',down:'#dc2626',rsi:'#7c3aed',macd:'#00332F',sig:'#e8a33a',grid:'#e7efee',axis:'#67807c'};
const RANGES=[['3m','3M',63],['6m','6M',126],['1y','1Y',252],['2y','2Y',504],['5y','5Y',99999]];
function niceStep(span,n){const raw=span/n||1,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;return (f<1.5?1:f<3?2:f<7?5:10)*p;}
function layout(W){const wide=W>=700;
  const P={pl:6,pr:58,w:W-64,priceH:wide?300:220,volH:wide?60:46,rsiH:wide?78:64,macdH:wide?78:64,gap:12,xAxis:22,top:10};
  P.y={price:P.top};P.y.vol=P.y.price+P.priceH+4;P.y.rsi=P.y.vol+P.volH+P.gap;P.y.macd=P.y.rsi+P.rsiH+P.gap;P.H=P.y.macd+P.macdH+P.xAxis;return P;}
function chartSVG(k,i0,W,st,dp){
  const P=layout(W),n=k.c.length-i0,X=i=>P.pl+(n<=1?P.w/2:(i-i0)/(n-1)*P.w),bw=Math.max(1,Math.min(9,P.w/n*0.7));
  const vis=a=>a.slice(i0).filter(v=>v!=null);
  let pv=st.candles?[...vis(k.h),...vis(k.l)]:vis(k.c);
  if(st.sma20)pv=pv.concat(vis(k.sma20));if(st.sma50)pv=pv.concat(vis(k.sma50));if(st.sma200)pv=pv.concat(vis(k.sma200));
  if(st.bb)pv=pv.concat(vis(k.bb.up),vis(k.bb.lo));
  let mn=Math.min(...pv),mx=Math.max(...pv);const pad=(mx-mn)*0.06||mx*0.02;mn-=pad;mx+=pad;
  const Y=v=>P.y.price+(1-(v-mn)/(mx-mn))*P.priceH;
  const path=(a,y=Y)=>{let s='',pen=false;for(let i=i0;i<a.length;i++){if(a[i]==null){pen=false;continue;}s+=`${pen?'L':'M'}${X(i).toFixed(1)},${y(a[i]).toFixed(1)}`;pen=true;}return s;};
  let g='';
  // price grid
  const step=niceStep(mx-mn,5),dec=step>=1?0:step>=0.1?1:step>=0.01?2:3;
  for(let v=Math.ceil(mn/step)*step;v<=mx;v+=step){const y=Y(v).toFixed(1);g+=`<line x1="${P.pl}" x2="${P.pl+P.w}" y1="${y}" y2="${y}" stroke="${COL.grid}"/><text x="${P.pl+P.w+6}" y="${+y+4}" font-size="10.5" fill="${COL.axis}">${fmt(v,dec)}</text>`;}
  if(st.bb){const up=[],lo=[];for(let i=i0;i<k.c.length;i++)if(k.bb.up[i]!=null){up.push(`${X(i).toFixed(1)},${Y(k.bb.up[i]).toFixed(1)}`);lo.unshift(`${X(i).toFixed(1)},${Y(k.bb.lo[i]).toFixed(1)}`);}
    if(up.length)g+=`<polygon points="${up.join(' ')} ${lo.join(' ')}" fill="${COL.bb}" fill-opacity=".12"/><path d="${path(k.bb.up)}" fill="none" stroke="${COL.bb}" stroke-width="1"/><path d="${path(k.bb.lo)}" fill="none" stroke="${COL.bb}" stroke-width="1"/>`;}
  if(st.candles){for(let i=i0;i<k.c.length;i++){const upB=k.c[i]>=k.o[i],col=upB?COL.up:COL.down,x=X(i).toFixed(1),yo=Y(k.o[i]),yc=Y(k.c[i]);
      g+=`<line x1="${x}" x2="${x}" y1="${Y(k.h[i]).toFixed(1)}" y2="${Y(k.l[i]).toFixed(1)}" stroke="${col}" stroke-width="1"/><rect x="${(X(i)-bw/2).toFixed(1)}" y="${Math.min(yo,yc).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,Math.abs(yo-yc)).toFixed(1)}" fill="${upB?'#fff':col}" stroke="${col}" stroke-width="1"/>`;}}
  else g+=`<path d="${path(k.c)}" fill="none" stroke="${COL.close}" stroke-width="2" stroke-linejoin="round"/>`;
  if(st.sma20)g+=`<path d="${path(k.sma20)}" fill="none" stroke="${COL.sma20}" stroke-width="1.4"/>`;
  if(st.sma50)g+=`<path d="${path(k.sma50)}" fill="none" stroke="${COL.sma50}" stroke-width="1.8"/>`;
  if(st.sma200)g+=`<path d="${path(k.sma200)}" fill="none" stroke="${COL.sma200}" stroke-width="1.8"/>`;
  // last price tag
  const L=k.c.length-1,ly=Y(k.c[L]);
  g+=`<rect x="${P.pl+P.w+1}" y="${(ly-9).toFixed(1)}" width="${P.pr-2}" height="18" rx="4" fill="${COL.close}"/><text x="${P.pl+P.w+6}" y="${(ly+4).toFixed(1)}" font-size="10.5" font-weight="700" fill="#fff">${fmt(k.c[L],dp)}</text>`;
  // volume
  const vmax=Math.max(...k.v.slice(i0))||1,VY=v=>P.y.vol+P.volH-(v/vmax)*P.volH;
  for(let i=i0;i<k.c.length;i++){const up=i>0&&k.c[i]>=k.c[i-1];g+=`<rect x="${(X(i)-bw/2).toFixed(1)}" y="${VY(k.v[i]).toFixed(1)}" width="${bw.toFixed(1)}" height="${(P.y.vol+P.volH-VY(k.v[i])).toFixed(1)}" fill="${up?COL.up:COL.down}" fill-opacity=".35"/>`;}
  g+=`<path d="${path(k.vma50,VY)}" fill="none" stroke="${COL.axis}" stroke-width="1" stroke-dasharray="3 2"/><text x="${P.pl+P.w+6}" y="${P.y.vol+12}" font-size="10" fill="${COL.axis}">Vol</text>`;
  // RSI
  const RY=v=>P.y.rsi+(1-v/100)*P.rsiH;
  g+=`<rect x="${P.pl}" y="${RY(70)}" width="${P.w}" height="${RY(30)-RY(70)}" fill="${COL.rsi}" fill-opacity=".05"/>`;
  for(const lv of [30,50,70])g+=`<line x1="${P.pl}" x2="${P.pl+P.w}" y1="${RY(lv)}" y2="${RY(lv)}" stroke="${lv===50?COL.grid:'#c9b8f0'}" stroke-dasharray="${lv===50?'':'4 3'}"/><text x="${P.pl+P.w+6}" y="${RY(lv)+4}" font-size="10" fill="${COL.axis}">${lv}</text>`;
  g+=`<path d="${path(k.rsi,RY)}" fill="none" stroke="${COL.rsi}" stroke-width="1.5"/><text x="${P.pl+4}" y="${P.y.rsi+11}" font-size="10" font-weight="700" fill="${COL.rsi}">RSI 14</text>`;
  // MACD
  const mv=[...vis(k.macd),...vis(k.signal),...vis(k.hist)];const ma=Math.max(...mv.map(Math.abs))||1,MY=v=>P.y.macd+P.macdH/2-(v/ma)*(P.macdH/2);
  g+=`<line x1="${P.pl}" x2="${P.pl+P.w}" y1="${MY(0)}" y2="${MY(0)}" stroke="${COL.grid}"/>`;
  for(let i=i0;i<k.c.length;i++){const hv=k.hist[i];if(hv==null)continue;g+=`<rect x="${(X(i)-bw/2).toFixed(1)}" y="${Math.min(MY(0),MY(hv)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.abs(MY(hv)-MY(0)).toFixed(1)}" fill="${hv>=0?COL.up:COL.down}" fill-opacity=".45"/>`;}
  g+=`<path d="${path(k.macd,MY)}" fill="none" stroke="${COL.macd}" stroke-width="1.4"/><path d="${path(k.signal,MY)}" fill="none" stroke="${COL.sig}" stroke-width="1.2"/><text x="${P.pl+4}" y="${P.y.macd+11}" font-size="10" font-weight="700" fill="${COL.macd}">MACD 12,26,9</text>`;
  // x labels
  const span=k.t[L]-k.t[i0],fx=t=>new Date(t*1000).toLocaleDateString('en-GB',span<200*86400?{day:'2-digit',month:'short'}:{month:'short',year:'2-digit'});
  for(let j=0;j<5;j++){const i=Math.round(i0+(n-1)*(j+0.5)/5);g+=`<text x="${X(i).toFixed(1)}" y="${P.H-6}" font-size="10.5" fill="${COL.axis}" text-anchor="middle">${fx(k.t[i])}</text>`;}
  return `<svg class="ta-svg" viewBox="0 0 ${W} ${P.H}" width="${W}" height="${P.H}" role="img" aria-label="Price chart with indicators">${g}
    <g class="ta-x" style="display:none"><line y1="${P.y.price}" y2="${P.y.macd+P.macdH}" stroke="#34504c" stroke-dasharray="3 3"/><circle r="4.5" fill="${COL.close}" stroke="#fff" stroke-width="2"/></g>
    <rect class="ta-hit" x="${P.pl}" y="${P.y.price}" width="${P.w}" height="${P.y.macd+P.macdH-P.y.price}" fill="transparent"/></svg>`;
}
function bindChart(wrap,k,i0,W,st,u){
  const P=layout(W),n=k.c.length-i0,svg=wrap.querySelector('svg'),g=svg.querySelector('.ta-x'),tip=wrap.querySelector('.ta-tip'),hit=svg.querySelector('.ta-hit'),leg=wrap.parentNode.querySelector('.ta-legend');
  const vis=a=>a.slice(i0).filter(v=>v!=null);
  let pv=st.candles?[...vis(k.h),...vis(k.l)]:vis(k.c);
  if(st.sma20)pv=pv.concat(vis(k.sma20));if(st.sma50)pv=pv.concat(vis(k.sma50));if(st.sma200)pv=pv.concat(vis(k.sma200));if(st.bb)pv=pv.concat(vis(k.bb.up),vis(k.bb.lo));
  let mn=Math.min(...pv),mx=Math.max(...pv);const pad=(mx-mn)*0.06||mx*0.02;mn-=pad;mx+=pad;
  const X=i=>P.pl+(n<=1?P.w/2:(i-i0)/(n-1)*P.w),Y=v=>P.y.price+(1-(v-mn)/(mx-mn))*P.priceH;
  const show=e=>{const r=svg.getBoundingClientRect(),sx=(e.clientX-r.left)*W/r.width;
    const i=Math.max(i0,Math.min(k.c.length-1,Math.round(i0+(sx-P.pl)/P.w*(n-1)))),x=X(i);
    g.style.display='';const ln=g.querySelector('line');ln.setAttribute('x1',x);ln.setAttribute('x2',x);
    const cc=g.querySelector('circle');cc.setAttribute('cx',x);cc.setAttribute('cy',Y(k.c[i]));
    const chg=i>0?(k.c[i]/k.c[i-1]-1)*100:null;
    tip.innerHTML=`<b>${u(k.c[i])} <span class="${chg>=0?'up':'down'}" style="opacity:1">${pc(chg)}</span></b><span>${dShort(k.t[i])}</span>`+
      `<span>O ${fmt(k.o[i],2)} · H ${fmt(k.h[i],2)} · L ${fmt(k.l[i],2)} · Vol ${big(k.v[i])}</span>`+
      `<span>SMA50 ${k.sma50[i]!=null?fmt(k.sma50[i],2):'—'} · SMA200 ${k.sma200[i]!=null?fmt(k.sma200[i],2):'—'}</span>`+
      `<span>RSI ${k.rsi[i]!=null?fmt(k.rsi[i],0):'—'} · MACD ${k.hist[i]!=null?(k.hist[i]>=0?'▲':'▼')+' '+fmt(Math.abs(k.hist[i]),2):'—'}</span>`;
    tip.hidden=false;const px=x/W*r.width;tip.style.left=Math.min(Math.max(px-tip.offsetWidth/2,0),r.width-tip.offsetWidth)+'px';
    if(leg)leg.dataset.i=i;};
  const hide=()=>{g.style.display='none';tip.hidden=true;};
  hit.addEventListener('pointerdown',show);hit.addEventListener('pointermove',show);
  hit.addEventListener('pointerleave',hide);hit.addEventListener('pointercancel',hide);
}

/* ---------- UI ---------- */
let mounted=null;
TA.mount=(el,sym)=>{mounted={el,sym};paint();
  const c=TA.cache[sym];if(!c||c.status!=='ok'||Date.now()-c.at>10*60*1000){if(!c||c.status!=='loading')TA.load(sym).then(()=>{if(mounted&&mounted.sym===sym&&mounted.el.isConnected)paint();});}};
function money(sym,cur){const p=/\.KL$/.test(sym)||cur==='MYR'?'RM ':cur==='USD'?'US$':cur?cur+' ':'';return v=>v==null||!isFinite(v)?'—':p+fmt(v,Math.abs(v)<10?3:2);}
function paint(){
  if(!mounted||!mounted.el.isConnected)return;
  const {el,sym}=mounted,c=TA.cache[sym];
  if(!c||c.status==='loading'){el.innerHTML=`<div class="card"><div class="sec" style="margin-top:0"><h2>Chart &amp; analysis</h2></div><div class="tiny"><span class="spin-i"></span> Loading 5 years of prices, indicators and fundamentals…</div></div>`;return;}
  if(c.status==='error'){el.innerHTML=`<div class="card"><div class="sec" style="margin-top:0"><h2>Chart &amp; analysis</h2></div>${c.err==='missing'?
    `<div class="notice warn" style="margin:0">The <b>stock-analysis</b> Edge Function isn't deployed yet. Supabase → Edge Functions → Deploy a new function → name it <b>stock-analysis</b> → paste <code>mobile/supabase/stock-analysis/index.ts</code> → Deploy.</div>`:
    `<div class="notice warn" style="margin:0">${H.esc(c.err)}</div>`}<button class="btn btn-s" style="margin-top:10px" id="taRetry">Try again</button></div>`;
    el.querySelector('#taRetry').onclick=()=>{TA.load(sym,true).then(paint);paint();};return;}
  const d=c.data,k=c.calc,S=k.snap,st=TA.st,u=money(sym,d.meta&&d.meta.currency),dp=S.price<10?3:2;
  const rN=(RANGES.find(r=>r[0]===st.range)||RANGES[2])[2],i0=Math.max(0,k.c.length-rN);
  const R=read(S,d.stats,u),wide=App.wide&&App.wide();
  const tog=(key,lab,col)=>`<button type="button" class="chip ${st[key]?'on':''}" data-tg="${key}">${col?`<i class="ta-dot" style="background:${col}"></i>`:''}${lab}</button>`;
  const legend=`<div class="ta-legend">${st.sma20&&S.sma20?`<span><i class="ta-dot" style="background:${COL.sma20}"></i>SMA20 ${u(S.sma20)}</span>`:''}${st.sma50&&S.sma50?`<span><i class="ta-dot" style="background:${COL.sma50}"></i>SMA50 ${u(S.sma50)}</span>`:''}${st.sma200&&S.sma200?`<span><i class="ta-dot" style="background:${COL.sma200}"></i>SMA200 ${u(S.sma200)}</span>`:''}${S.rsi!=null?`<span><i class="ta-dot" style="background:${COL.rsi}"></i>RSI ${fmt(S.rsi,0)}</span>`:''}${S.hist!=null?`<span><i class="ta-dot" style="background:${COL.macd}"></i>MACD ${S.macd>=S.signal?'above':'below'} signal</span>`:''}</div>`;
  const chartCard=`<div class="card ta-card"><div class="ta-head"><div><div class="sec" style="margin:0"><h2>Chart &amp; analysis</h2></div>
      <div class="tiny">${H.esc((d.stats&&d.stats.name)||(d.meta&&d.meta.name)||sym)}${d.meta&&d.meta.exchange?' · '+H.esc(d.meta.exchange):''} · daily bars to ${dShort(S.date)}</div></div>
      <div class="chips mk-range">${RANGES.map(([v,l])=>`<button type="button" class="chip ${st.range===v?'on':''}" data-rg="${v}">${l}</button>`).join('')}</div></div>
    <div class="chips ta-tog">${tog('sma20','SMA 20',COL.sma20)}${tog('sma50','SMA 50',COL.sma50)}${tog('sma200','SMA 200',COL.sma200)}${tog('bb','Bollinger',COL.bb)}${tog('candles','Candles')}</div>
    ${legend}<div class="ta-wrap"><div class="ta-tip" hidden></div><div class="ta-chart"></div></div></div>`;
  const kv=(lab,val,tip)=>`<div class="kv"><span>${tip?H.lt(lab,tip):lab}</span><span>${val}</span></div>`;
  const tone=t=>t==='up'?'up':t==='down'?'down':'';
  const stageCls={up:'up',down:'down',pull:'',rec:'',base:'',top:'',mixed:'',na:''}[S.stage.k];
  const snap=`<div class="card"><div class="sec" style="margin-top:0"><h2>Technical snapshot</h2></div>
    ${kv('Trend',`<span class="${stageCls}">${S.stage.t}</span>`,'ta.stage')}
    ${kv('Price vs SMA 50',S.sma50?`${pcS(S.vs50)} <span class="dim">(${u(S.sma50)}, ${S.slope50>0?'rising':'falling'})</span>`:'—','ta.sma')}
    ${kv('Price vs SMA 200',S.sma200?`${pcS(S.vs200)} <span class="dim">(${u(S.sma200)}, ${S.slope200>0?'rising':'falling'})</span>`:'<span class="dim">needs 200 days</span>','ta.sma')}
    ${kv('SMA 50 / 200',S.cross?`<span class="${S.cross.golden?'up':'down'}">${S.cross.golden?'Golden cross':'Death cross'}</span>${S.cross.date?` <span class="dim">since ${dShort(S.cross.date)}</span>`:''}`:'—','ta.cross')}
    ${kv('RSI (14)',S.rsi!=null?(r=>`<b class="${r>=70?'down':r<=30?'up':''}">${r}</b> <span class="dim">${r>=70?'overbought':r<=30?'oversold':r>=50?'bullish zone':'bearish zone'}</span>`)(Math.round(S.rsi)):'—','ta.rsi')}
    ${kv('MACD',S.hist!=null?`<span class="${S.macd>=S.signal?'up':'down'}">${S.macd>=S.signal?'Above':'Below'} signal</span> <span class="dim">histogram ${S.hist>S.histPrev?'rising':'falling'}</span>`:'—','ta.macd')}
    ${kv('Bollinger %B',S.pctB!=null?`${fmt(S.pctB*100,0)}% <span class="dim">band width ${fmt(S.bbWidth,1)}%</span>`:'—','ta.bb')}
    ${kv('52-week range',`${u(S.lo52)} – ${u(S.hi52)} <span class="dim">(${pc(S.fromHi)} from high)</span>`)}
    ${kv('Support / resistance',`${u(S.r60.lo)} / ${u(S.r60.hi)} <span class="dim">60-day</span>`,'ta.levels')}
    ${kv('Volatility (ATR 14)',S.atrPct!=null?`${fmt(S.atrPct,1)}% a day`:'—','ta.atr')}
    ${kv('Volume',S.volRatio!=null?`${fmt(S.volRatio,1)}× avg <span class="dim">5-day ${fmt(S.vol5Ratio,1)}× · up/down ${S.udVol!=null?fmt(S.udVol,2):'—'}</span>`:'—','ta.vol')}
    ${kv('Returns',['1M','3M','6M','YTD','1Y'].map(x=>`<span class="dim">${x}</span> ${pcS(S.ret[x])}`).join(' &nbsp;'))}
    ${Object.keys(S.rs).length?kv(`vs ${S.bench==='^KLSE'?'FBM KLCI':S.bench==='^GSPC'?'S&amp;P 500':H.esc(S.bench)}`,Object.entries(S.rs).map(([l,r])=>`<span class="dim">${l}</span> <span class="${r.diff>=0?'up':'down'}">${r.diff>=0?'+':'−'}${fmt(Math.abs(r.diff),1)} pts</span>`).join(' &nbsp;'),'ta.rs'):''}
  </div>`;
  const f=d.stats||{},has=f&&!f.error;
  const pct1=v=>v==null?'—':pcS(v*100);
  const fund=has?`<div class="card"><div class="sec" style="margin-top:0"><h2>Fundamentals</h2></div>
    ${f.sector?kv('Sector',H.esc(f.sector+(f.industry?' · '+f.industry:''))):''}
    ${kv('Market cap',big(f.marketCap))}
    ${kv('P/E (trailing · forward)',`${f.pe?fmt(f.pe,1):'—'} · ${f.forwardPe?fmt(f.forwardPe,1):'—'}`,'m.pe')}
    ${f.peg!=null?kv('PEG',fmt(f.peg,2)):''}
    ${kv('EPS (trailing)',f.eps!=null?fmt(f.eps,2):'—')}
    ${kv('Revenue growth (y/y)',pct1(f.revenueGrowth))}${kv('Earnings growth (y/y)',pct1(f.earningsGrowth))}
    ${kv('Profit margin',pct1(f.profitMargin))}${f.roe!=null?kv('Return on equity',pct1(f.roe)):''}
    ${f.debtToEquity!=null?kv('Debt / equity',fmt(f.debtToEquity/100,2)+'×'):''}
    ${kv('Dividend yield',f.divYield!=null?fmt(f.divYield*100,2)+'%':'—')}
    ${f.beta!=null?kv('Beta',fmt(f.beta,2)):''}
    ${f.shortPctFloat!=null?kv('Short interest',fmt(f.shortPctFloat*100,1)+'% of float'):''}
    ${kv('Analyst target',f.target?`${u(f.target)} <span class="dim">(${pc((f.target/S.price-1)*100)}) · ${ratingTxt(f)}${f.analysts?' · '+f.analysts+' analysts':''}</span>`:'<span class="dim">no coverage</span>','w.target')}
    ${f.earningsDate?kv('Next earnings',dShort(f.earningsDate)):''}
  </div>`:'';
  const readCard=`<div class="card"><div class="ta-head"><div class="sec" style="margin:0"><h2>Technical read</h2></div><span class="tag ta-tilt ${R.tilt.k}">${R.tilt.t}</span></div>
    <ul class="ta-read">${R.items.map(x=>`<li class="${tone(x.tone)}"><i>${x.tone==='up'?'▲':x.tone==='down'?'▼':'•'}</i><span>${x.txt}</span></li>`).join('')}</ul>
    <div class="lbl" style="margin:12px 0 6px">What to watch</div><ul class="ta-watch">${R.watch.map(w=>`<li>${w}</li>`).join('')}</ul>
    <div class="tiny" style="margin-top:10px">Rule-based read of price and volume data — not a forecast or financial advice.</div></div>`;
  const aiKey=`ta_ai_${sym}_${S.date}`;let ai=TA.ai[sym];
  if(!ai){try{const s=localStorage.getItem(aiKey);if(s)ai=TA.ai[sym]={status:'ok',text:s,cached:true};}catch(e){}}
  const aiCard=`<div class="card"><div class="ta-head"><div class="sec" style="margin:0"><h2>AI analysis</h2></div>${ai&&ai.status==='ok'?'<button class="link" id="taAiRe" style="background:none;border:0">Regenerate</button>':''}</div>
    ${!ai?`<div class="tiny">Claude reads the chart numbers, fundamentals and analyst data above and writes a short, balanced assessment.</div><button class="btn btn-p" id="taAi" style="margin-top:12px;width:100%">✨ Generate AI analysis</button>`:
      ai.status==='loading'?`<div class="tiny"><span class="spin-i"></span> Analysing ${H.esc(sym)}…</div>`:
      ai.status==='error'?(ai.err==='AI not set up'?`<div class="notice info" style="margin:0">AI analysis needs an Anthropic API key. Add the secret <b>ANTHROPIC_API_KEY</b> in Supabase → Edge Functions → Secrets. Until then, use the technical read.</div>`:`<div class="notice warn" style="margin:0">${H.esc(ai.err)}</div><button class="btn btn-s" id="taAi" style="margin-top:10px">Try again</button>`):
      `<div class="ta-ai">${md(ai.text)}</div>${ai.cached?'<div class="tiny" style="margin-top:8px">Saved analysis for this trading day.</div>':''}`}</div>`;
  el.innerHTML=chartCard+(wide?`<div class="ta-grid"><div>${snap}${fund}</div><div>${readCard}${aiCard}</div></div>`:snap+readCard+aiCard+fund);
  // chart
  const box=el.querySelector('.ta-chart'),W=Math.max(300,Math.round(box.clientWidth||340));
  box.innerHTML=chartSVG(k,i0,W,st,dp);bindChart(el.querySelector('.ta-wrap'),k,i0,W,st,u);
  el.querySelectorAll('[data-rg]').forEach(b=>b.onclick=()=>{st.range=b.dataset.rg;savePrefs();paint();});
  el.querySelectorAll('[data-tg]').forEach(b=>b.onclick=()=>{st[b.dataset.tg]=!st[b.dataset.tg];savePrefs();paint();});
  const go=async()=>{TA.ai[sym]={status:'loading'};paint();
    try{const {data,error}=await sb.functions.invoke('stock-analysis',{body:{action:'ai',symbol:sym,facts:facts(sym,d,k,R)}});
      if(error)throw new Error(String(error.message||error));if(!data||data.error)throw new Error(data&&data.error||'No reply');
      TA.ai[sym]={status:'ok',text:data.text};try{localStorage.setItem(aiKey,data.text);}catch(e){}
    }catch(e){TA.ai[sym]={status:'error',err:String(e.message||e)};}
    paint();};
  const b1=el.querySelector('#taAi');if(b1)b1.onclick=go;
  const b2=el.querySelector('#taAiRe');if(b2)b2.onclick=go;
}
/* compact facts for the AI (numbers only — the model is told not to invent anything) */
function facts(sym,d,k,R){
  const S=k.snap,r=v=>v==null||!isFinite(v)?null:Math.round(v*100)/100,L=k.c.length-1;
  const weekly=[];for(let i=L;i>=0&&weekly.length<26;i-=5)weekly.unshift([new Date(k.t[i]*1000).toISOString().slice(0,10),r(k.c[i])]);
  const st=d.stats&&!d.stats.error?d.stats:null;
  return {symbol:sym,name:(st&&st.name)||(d.meta&&d.meta.name)||null,currency:d.meta&&d.meta.currency,exchange:d.meta&&d.meta.exchange,
    asOf:new Date(S.date*1000).toISOString().slice(0,10),price:r(S.price),
    trend:S.stage.t,sma20:r(S.sma20),sma50:r(S.sma50),sma200:r(S.sma200),pctVsSma50:r(S.vs50),pctVsSma200:r(S.vs200),
    sma50Slope20dPct:r(S.slope50),sma200Slope20dPct:r(S.slope200),
    cross:S.cross?{type:S.cross.golden?'golden':'death',since:S.cross.date?new Date(S.cross.date*1000).toISOString().slice(0,10):null}:null,
    rsi14:r(S.rsi),rsi14FiveDaysAgo:r(S.rsiPrev),macd:{macd:r(S.macd),signal:r(S.signal),hist:r(S.hist),histPrev:r(S.histPrev),crossDaysAgo:S.macdCrossDays},
    bollingerPctB:r(S.pctB),bollingerWidthPct:r(S.bbWidth),atr14Pct:r(S.atrPct),
    high52w:r(S.hi52),low52w:r(S.lo52),pctFrom52wHigh:r(S.fromHi),range60d:{low:r(S.r60.lo),high:r(S.r60.hi)},range20d:{low:r(S.r20.lo),high:r(S.r20.hi)},
    returnsPct:Object.fromEntries(Object.entries(S.ret).map(([a,b])=>[a,r(b)])),
    benchmark:S.bench,relativeStrengthPts:Object.fromEntries(Object.entries(S.rs).map(([a,b])=>[a,r(b.diff)])),
    volume:{lastVsAvg50:r(S.volRatio),last5VsAvg50:r(S.vol5Ratio),upDownVolumeRatio50d:r(S.udVol)},
    weeklyCloses:weekly,
    fundamentals:st?{sector:st.sector,industry:st.industry,marketCap:st.marketCap,pe:r(st.pe),forwardPe:r(st.forwardPe),peg:r(st.peg),eps:r(st.eps),
      revenueGrowth:r(st.revenueGrowth),earningsGrowth:r(st.earningsGrowth),profitMargin:r(st.profitMargin),roe:r(st.roe),debtToEquity:r(st.debtToEquity),
      dividendYield:r(st.divYield),beta:r(st.beta),shortPctFloat:r(st.shortPctFloat),
      analystTarget:r(st.target),analystHigh:r(st.targetHigh),analystLow:r(st.targetLow),analysts:st.analysts,rating:st.rating,
      nextEarnings:st.earningsDate?new Date(st.earningsDate*1000).toISOString().slice(0,10):null,business:st.summary}:null,
    ruleBasedTilt:R.tilt.t};
}
function md(s){
  const inl=t=>H.esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g,'$1<i>$2</i>').replace(/_(.+?)_/g,'<i>$1</i>');
  let out='',inList=false;
  for(const line of String(s||'').split('\n')){const l=line.trim();
    if(/^[-*•]\s+/.test(l)){if(!inList){out+='<ul>';inList=true;}out+=`<li>${inl(l.replace(/^[-*•]\s+/,''))}</li>`;continue;}
    if(inList){out+='</ul>';inList=false;}
    if(/^#{1,4}\s+/.test(l))out+=`<h4>${inl(l.replace(/^#{1,4}\s+/,''))}</h4>`;
    else if(l)out+=`<p>${inl(l)}</p>`;}
  return out+(inList?'</ul>':'');
}
// redraw at the new width when the window is resized
let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{if(mounted&&mounted.el.isConnected&&TA.cache[mounted.sym]&&TA.cache[mounted.sym].status==='ok')paint();},200);});


/* ---------- pre-market / after-hours prices for US stocks (Open positions) ----------
   App.ext.ensure(['NVDA','AAPL']) fetches via stock-analysis {action:'ext'}; App.ext.view('NVDA') →
   {kind:'pre'|'post', price, pct, time} or null. Refetched at most every 3 minutes (or on ⟳ refresh). */
const EX=App.ext={cache:{},at:0,busy:false,state:''};
EX.ensure=async syms=>{
  const us=[...new Set(syms)].filter(s=>s&&!/\.KL$|-USD$|^\^|=/.test(s));
  if(!us.length||EX.busy||EX.state==='missing')return;
  if(Date.now()-EX.at<3*60*1000&&us.every(s=>s in EX.cache))return;
  EX.busy=true;
  try{
    for(let i=0;i<us.length;i+=40){
      const {data,error}=await sb.functions.invoke('stock-analysis',{body:{action:'ext',symbols:us.slice(i,i+40)}});
      if(error){let st=0;try{st=error.context&&error.context.status;}catch(e){}if(st===404)EX.state='missing';throw error;}
      us.slice(i,i+40).forEach(s=>{EX.cache[s]=data&&data[s]&&!data[s].error?data[s]:null;});
    }
    EX.at=Date.now();if(EX.state!=='missing')EX.state='ok';
  }catch(e){console.warn('pre/after-hours',e);if(EX.state!=='missing')EX.state='error';}
  EX.busy=false;App.refreshView();
};
EX.view=sym=>{const q=EX.cache[sym];if(!q)return null;
  const st=String(q.state||'').toUpperCase(),postFirst=/POST|CLOSED/.test(st)&&q.post;
  const x=postFirst?q.post:q.pre||null;if(!x||x.price==null)return null;
  return {kind:postFirst?'post':'pre',price:x.price,pct:x.pct,time:x.time,live:st==='PRE'&&!postFirst||st==='POST'&&postFirst,state:st};};
EX.label=v=>v?(v.kind==='pre'?'Pre-market':'After hours'):'';
EX.time=t=>t?new Date(t*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'';

/* ---------- glossary entries (ⓘ tips) ---------- */
if(App.gloss)Object.assign(App.gloss,{
  'ta.stage':{t:'Trend',d:'Where the price sits against its 50-day and 200-day averages and whether those are rising. Uptrend = price above a rising 50-day, which is above a rising 200-day.',g:'Most successful buys happen in an Uptrend or a Pullback in an uptrend. Downtrends tend to keep going down.'},
  'ta.sma':{t:'Simple moving average (SMA)',d:'The average closing price over the last 50 or 200 trading days (about 2½ and 10 months). The 50-day shows the medium-term trend, the 200-day the long-term trend.',g:'Price above a rising average = buyers in control. Big institutions watch the 200-day closely; a break below it often triggers selling.'},
  'ta.cross':{t:'Golden / death cross',d:'Golden cross: the 50-day average crosses above the 200-day. Death cross: it crosses below.',g:'A slow, confirming signal — it tells you the trend has changed, usually after a good part of the move. A fresh golden cross with rising volume is a stronger sign.'},
  'ta.rsi':{t:'RSI (14)',d:'Relative Strength Index, 0–100: how strong recent up-days are compared with down-days over 14 sessions.',g:'Above 70 = overbought (stretched; pullbacks common). Below 30 = oversold. 50–70 is the healthy zone for a stock in an uptrend.'},
  'ta.macd':{t:'MACD (12, 26, 9)',d:'The gap between a fast (12-day) and slow (26-day) exponential average, plus a 9-day "signal" line of that gap. The bars (histogram) show MACD minus signal.',g:'MACD crossing above its signal = momentum turning up; below = turning down. Rising bars mean momentum is growing.'},
  'ta.bb':{t:'Bollinger Bands (20, 2)',d:'A band 2 standard deviations above and below the 20-day average. %B shows where the price sits in the band: 100% = top, 0% = bottom.',g:'Narrow bands (low width) often come before a big move. Riding the upper band = strong trend; a close outside the band is stretched.'},
  'ta.atr':{t:'Volatility (ATR 14)',d:'Average True Range over 14 days, as % of the price — the typical daily swing.',g:'Under 2% = calm, 2–4% normal for growth stocks, over 4% = volatile. Useful to set a stop-loss outside normal daily noise (e.g. 2× ATR).'},
  'ta.vol':{t:'Volume',d:'Last session\'s volume vs its 50-day average, the 5-day average vs the 50-day, and up/down volume: total volume on up days ÷ volume on down days over 50 sessions.',g:'Up/down above 1.25 = accumulation (buyers more active); under 0.8 = distribution. Breakouts on 1.5×+ average volume are more reliable.'},
  'ta.levels':{t:'Support / resistance',d:'The lowest low and highest high of the last 60 trading days.',g:'A break above resistance on strong volume is a common entry trigger; a break below support is a warning.'},
  'ta.ext':{t:'Pre-market / after hours',d:'US stocks also trade before the open (4:00–9:30 am New York = 4:00–9:30 pm Malaysia, an hour later when the US is on winter time) and after the close (4:00–8:00 pm New York). Shows the latest extended-hours price and its change vs the last regular close. From about 4 pm New York onwards it switches to the after-hours price.',g:'A preview of how the stock may open — thin volume, so moves can reverse at the opening bell. Bursa has no pre-market trading price, so it shows — for Malaysian stocks.'},
  'ta.extv':{t:'Pre / after value',d:'What this holding would be worth at the latest pre-market (or after-hours) price: units × that price. The line below is the difference from the Value column (last regular price). The total uses the regular value for any stock without an extended-hours price.',g:'A preview of where your US holdings may open — extended-hours trading is thin, so the opening price can differ.'},
  'ta.rs':{t:'Relative strength vs index',d:'The stock\'s return minus the index\'s return (S&P 500 for US stocks, FBM KLCI for Bursa) over 3, 6 and 12 months, in percentage points.',g:'Leaders beat the market. Positive and rising = outperformer; negative = laggard.'}
});
})();
