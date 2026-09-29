/* ===== UnicornHunter app — start-up & sign-in ===== */
(function(){
const H=App.h;
let started=false;
function startApp(){
  if(started)return; started=true;
  H.$('#login').hidden=true; H.$('#shell').hidden=false;
  App.initRouter();
  loadShares(); App.loadFunds(); App.loadAlerts(); App.metals.load();
  // refresh prices when the app comes back to the foreground after a while
  let hiddenAt=0;
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){hiddenAt=Date.now();return;}
    if(hiddenAt&&Date.now()-hiddenAt>5*60*1000){App.refreshPrices();App.loadAlerts();}
  });
}
function showLogin(){H.$('#shell').hidden=true;H.$('#login').hidden=false;}

H.$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=H.$('#lgEmail').value.trim(), password=H.$('#lgPass').value, btn=H.$('#lgBtn'), msg=H.$('#lgErr');
  msg.textContent='';
  if(!email||!password){msg.textContent='Enter your email and password.';return;}
  btn.disabled=true;btn.textContent='Signing in…';
  const {error}=await sb.auth.signInWithPassword({email,password});
  btn.disabled=false;btn.textContent='Sign in';
  if(error){msg.textContent=error.message==='Invalid login credentials'?'Incorrect email or password.':error.message;return;}
  startApp();
});

sb.auth.getSession().then(({data:{session}})=>{session?startApp():showLogin();});
sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_OUT'){started=false;showLogin();}});
})();
