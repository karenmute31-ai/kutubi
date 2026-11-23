/* Labelled reader rotation control. Native Android locks current orientation. */
(function(){'use strict';
// Remove the old CSS-only landscape mode before any capability/duplicate check.
function clearLegacyRotation(){if(document.body.classList.contains('emu-land'))document.body.classList.remove('emu-land');}
clearLegacyRotation();
if(!document.getElementById('nativeRotationSafety')){const style=document.createElement('style');style.id='nativeRotationSafety';style.textContent='body.emu-land{position:static!important;top:auto!important;left:auto!important;width:auto!important;height:auto!important;transform:none!important;transform-origin:initial!important;overflow-x:hidden!important;overflow-y:auto!important;}';document.head.append(style);new MutationObserver(clearLegacyRotation).observe(document.body,{attributes:true,attributeFilter:['class']});}
try{if(typeof SET!=='undefined'){SET.rotation='off';if(typeof saveSet==='function')saveSet();if(typeof syncRotSel==='function')syncRotSel();if(typeof markRotBtn==='function')markRotBtn();}if(typeof emuLandscape==='function')emuLandscape=function(){clearLegacyRotation();return false;};}catch(e){}
if(window.readerRotation)return;
const cap=window.Capacitor;
const header=cap?.PluginHeaders?.some(p=>p.name==='ReadingRotation');
const native=!!(cap&&(cap.isNativePlatform?.()||window.androidBridge)&&(cap.isPluginAvailable?.('ReadingRotation')||header));
const proxy=cap?.Plugins?.ReadingRotation;
const nativeMode=mode=>proxy?.setMode?proxy.setMode({mode}):cap.nativePromise('ReadingRotation','setMode',{mode});
const web=!!screen.orientation?.lock;
const host=document.getElementById('readerSettings')||document.querySelector('#readerDrawer .rd-body');
if(!host)return;
let mode='auto',busy=false;
const b=document.createElement('button');b.id='readerRotationToggle';b.type='button';b.className='btn';b.style.cssText='display:block;margin:12px 0;min-height:44px';host.prepend(b);
let select=document.getElementById('setRotation');if(!select){const label=document.createElement('label');label.textContent='دوران الشاشة ';select=document.createElement('select');select.id='setRotation';for(const[value,text]of [['off','حر (تلقائي)'],['portrait','قفل رأسي'],['landscape','قفل أفقي']]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}label.append(select);host.insertBefore(label,b.nextSibling);}
function render(){b.textContent=mode==='auto'?'قفل دوران الشاشة على الوضع الحالي':'فك قفل دوران الشاشة';b.setAttribute('aria-pressed',String(mode!=='auto'));select.value=mode==='auto'?'off':mode;}
async function setMode(next){if(!['auto','current','portrait','landscape'].includes(next))next='auto';clearLegacyRotation();if(native)await nativeMode(next);else if(next==='auto')screen.orientation?.unlock?.();else if(web)await screen.orientation.lock(next==='current'?screen.orientation.type:next);else throw Error('unsupported');mode=next;try{if(typeof SET!=='undefined'){SET.rotation='off';saveSet();}}catch(e){}render();return true;}
async function request(next){if(busy)return false;busy=true;b.disabled=true;try{return await setMode(next);}catch(e){if(!native){b.hidden=true;b.style.display='none';}const message='قفل الدوران غير متاح في هذا الوضع على الجهاز';if(typeof toast==='function')toast(message);else if(typeof showToast==='function')showToast(message);return false;}finally{busy=false;b.disabled=false;}}
select.addEventListener('change',e=>{e.preventDefault();e.stopImmediatePropagation();request(select.value==='off'?'auto':select.value);},true);
b.addEventListener('click',()=>request(mode==='auto'?'current':'auto'));
const old=document.getElementById('btnRotLock');if(old)old.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();request(mode==='auto'?'current':'auto');},true);
try{if(typeof applyRotation==='function')applyRotation=function(){const target=typeof SET!=='undefined'?SET.rotation:'off';return request(target==='off'?'auto':target);};}catch(e){}
window.readerRotation={toggle:()=>request(mode==='auto'?'current':'auto'),setMode:request,isLocked:()=>mode!=='auto',native};render();if(native)nativeMode('auto').catch(()=>{});else if(!web){b.hidden=true;b.style.display='none';select.hidden=true;}
})();
