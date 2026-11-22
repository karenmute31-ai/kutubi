/* Presentation-only layer. Original controls, storage and provider logic are retained. */
(function(){
'use strict';
function start(){
 const $=s=>document.querySelector(s);
 const isAlrawi=!!$('#view-home');
 document.body.classList.add('luxe-ui',isAlrawi?'luxe-alrawi':'luxe-kutubi');
 function fold(card,title){
  if(!card||card.closest('.luxe-fold'))return;
  const details=document.createElement('details');details.className='luxe-fold';
  const summary=document.createElement('summary');summary.textContent=title;
  card.before(details);details.append(summary,card);
 }
 const home=$(isAlrawi?'#view-home':'#tab-home');
 const marker=document.createElement('p');marker.className='luxe-preview-note';marker.textContent='معاينة التصميم • النسخة الحالية محفوظة';home.prepend(marker);
 if(isAlrawi){
  const subtitle=$('.hero-sub');if(subtitle)fold(subtitle,'عن الراوي وإمكانياته');
  const stats=$('#heroStats');if(stats)fold(stats,'معلومات القراءة والترجمة');
  const listen=$('#view-listen');if(listen){
   Array.from(listen.children).filter(x=>x.classList.contains('card')).slice(1).forEach(card=>{
    const h=card.querySelector('h3,h2');fold(card,h?h.textContent.trim():'خيارات الاستماع');
   });
  }
 }else{
  const more=$('#btnNavMore');if(more)more.addEventListener('click',e=>{e.stopImmediatePropagation();if(typeof openMoreSheet==='function')openMoreSheet();},true);
  const stats=$('#readStatsBody');if(stats)fold(stats.closest('.card'),'قراءتي • الإحصائيات والإنجازات');
  const owner=$('#tab-home .owner-footer');if(owner)fold(owner,'عن التطبيق وصاحبه');
  const actions=$('.home-actions');if(actions){
   const secondary=document.createElement('div');secondary.className='luxe-secondary-actions';
   ['homeFreeLibrary','homeFiles','homeSub'].forEach(id=>{const b=document.getElementById(id);if(b)secondary.append(b)});
   actions.after(secondary);fold(secondary,'المكتبة المجانية وملفاتي والاشتراك');
  }
 }
 document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(isAlrawi){if(typeof closeDrawer==='function')closeDrawer();}
  else{if(typeof closeReaderPanels==='function')closeReaderPanels();if(typeof closeMoreSheet==='function')closeMoreSheet();}
 });
 document.documentElement.dataset.luxeReady='true';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
