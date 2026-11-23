/* Screen-aware Back handling. Browser history is the fallback for existing Android shells. */
(function(){
'use strict';
const isAlrawi=!!document.getElementById('view-home');
const root=()=>isAlrawi?document.querySelector('.view.active'):document.querySelector('.tab.active');
const current=()=>{const r=root();return r?r.id.replace(isAlrawi?'view-':'tab-',''):'home'};
let view=current(),restoring=false,lastHomeBack=0;
function arm(){try{history.pushState({appNavigation:1,view},'',location.href)}catch(_){}}
function visible(e){return !!e&&!e.hidden&&!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'}
function closeOverlay(){
 const dialogs=[...document.querySelectorAll('dialog[open]')];if(dialogs.length){dialogs[dialogs.length-1].close();return true}
 if(isAlrawi){
  if(document.body.classList.contains('drawer-open')){closeDrawer();return true}
  for(const id of ['readerSettings','readerSearch']){const e=document.getElementById(id);if(visible(e)){e.hidden=true;document.body.classList.remove('sheet-open');return true}}
 }else{
  const more=document.getElementById('moreSheet');if(more&&more.classList.contains('sheet-open')){closeMoreSheet();return true}
  if(document.querySelector('#readerDrawer.open,#appearanceCard.sheet-open,#voiceCard.sheet-open,#bookToolsCard.sheet-open,#indexCard.drawer-open')){closeReaderPanels();return true}
  for(const id of ['wordSheet','quizOverlay','askPanel']){const e=document.getElementById(id);if(visible(e)){e.classList.add('hidden');return true}}
  const lib=document.getElementById('tab-library');if(lib&&lib.classList.contains('add-open')){lib.classList.remove('add-open');return true}
 }
 return false;
}
const button=document.createElement('button');button.type='button';button.id='appScreenBack';button.className='btn ghost';button.textContent='→ رجوع';button.setAttribute('aria-label','الرجوع إلى الشاشة السابقة');button.style.cssText='display:block;min-height:44px;margin:.5rem 0;position:static;';const main=document.querySelector('main');if(main)main.prepend(button);
function sync(){button.hidden=view==='home';button.style.display=view==='home'?'none':'block'}
function navigate(name){restoring=true;try{if(isAlrawi)go(name);else switchTab(name,true)}finally{restoring=false}view=current();sync()}
function notice(){if(isAlrawi&&typeof toast==='function')toast('اضغط رجوع مرة أخرى للخروج من الرئيسية');else if(typeof showToast==='function')showToast('اضغط رجوع مرة أخرى للخروج من الرئيسية');else{const t=document.createElement('div');t.setAttribute('role','status');t.textContent='اضغط رجوع مرة أخرى للخروج من الرئيسية';t.style.cssText='position:fixed;bottom:60px;inset-inline:10%;background:#222;color:#fff;padding:12px;z-index:99999;text-align:center';document.body.append(t);setTimeout(()=>t.remove(),2200)}}
function back(fromPop){
 if(closeOverlay()){lastHomeBack=0;if(fromPop)arm();return 'overlay'}
 view=current();
 if(view!=='home'){navigate(view==='reader'?'library':'home');lastHomeBack=0;if(fromPop)arm();else arm();return view}
 if(!fromPop)return 'home';
 const now=Date.now();if(lastHomeBack&&now-lastHomeBack<2500){lastHomeBack=0;return 'exit-allowed'}lastHomeBack=now;notice();arm();return 'confirm-exit';
}
window.appNavigation={route(name){view=name;lastHomeBack=0;sync();if(!restoring)arm()},back:()=>back(false),current};
button.addEventListener('click',()=>back(false));
window.addEventListener('popstate',()=>back(true));
// Capacitor App owns Android system Back. Existing older shells retain browser fallback.
let nativeBusy=false;
async function nativeBack(){if(nativeBusy)return;nativeBusy=true;try{const result=back(true);if(result==='exit-allowed'){const app=window.Capacitor?.Plugins?.App;if(app&&typeof app.exitApp==='function')await app.exitApp();}}catch(e){console.warn('Native Back could not complete');}finally{nativeBusy=false;}}
window.addEventListener('app-native-back',nativeBack);
try{const cap=window.Capacitor;if(cap&&cap.isNativePlatform&&cap.isNativePlatform()&&cap.isPluginAvailable&&cap.isPluginAvailable('App')){cap.Plugins.App.addListener('backButton',nativeBack).catch(()=>console.warn('Native Back listener unavailable'));}}catch(e){console.warn('Native Back listener unavailable');}
try{history.replaceState({appNavigation:1,view},'',location.href)}catch(_){}arm();sync();
})();
