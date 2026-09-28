/* ===== Markets Suite — Android push registration (app build only) =====
   Loaded on every page inside the Android app (see build-www.sh), never on the web.
   After sign-in it asks for notification permission, gets this device's FCM token
   and saves it to Supabase (push_tokens), so the price-alerts Edge Function can
   push "▼ -3% / ▲ +5%" alerts to the tablet even when the app is closed. */
(function(){
  const cap=window.Capacitor;
  if(!cap||!cap.isNativePlatform||!cap.isNativePlatform()||!window.capacitorExports)return;
  if(typeof sb==='undefined')return;                 // page without the Supabase client
  const Push=window.capacitorExports.registerPlugin('PushNotifications');
  const LS_KEY='ms_push_token';

  // tapping an alert opens Current Positions
  Push.addListener('pushNotificationActionPerformed',()=>{
    location.hash='#holdings/open';
  });
  // alert arriving while the app is open: also show it in-app
  Push.addListener('pushNotificationReceived',n=>{
    if(typeof showToast==='function')showToast((n.title?n.title+' — ':'')+(n.body||''));
  });

  Push.addListener('registration',async({value:token})=>{
    try{if(localStorage.getItem(LS_KEY)===token)return;}catch(e){}
    const {error}=await sb.from('push_tokens').upsert(
      {token,platform:'android',updated_at:new Date().toISOString()},{onConflict:'token'});
    if(!error){try{localStorage.setItem(LS_KEY,token);}catch(e){}}
    else console.warn('push token save failed',error.message);
  });
  Push.addListener('registrationError',e=>console.warn('push registration error',e));

  async function setup(){
    const {data:{session}}=await sb.auth.getSession();
    if(!session)return;                               // only once signed in (RLS needs the user)
    try{
      await Push.createChannel({id:'price-alerts',name:'Price alerts',
        description:'Holding moves of -3% / +5% vs previous close',
        importance:5,visibility:1,vibration:true,lights:true,lightColor:'#0AA79F'});
    }catch(e){}
    let perm=await Push.checkPermissions();
    if(perm.receive==='prompt'||perm.receive==='prompt-with-rationale')perm=await Push.requestPermissions();
    if(perm.receive!=='granted')return;
    await Push.register();
  }
  // run after the page's own auth check; also after login on index.html
  setTimeout(setup,600);
  sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_IN')setTimeout(setup,300);});
})();
