/* Page-level, checkpointed local PDF import. No book pages leave this device. */
(function(root){
'use strict';
const version=1, MAX=800;
async function timed(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('الصفحة أخدت وقت أطول من المتوقع. التقدم محفوظ، جرّب الاستكمال.')),90000);})]);}finally{clearTimeout(timer);}}
function policy(nav){const mem=Number(nav.deviceMemory)||4,cores=Number(nav.hardwareConcurrency)||2;return {workers:mem>=2&&cores>=2?2:1,scale:3,maxPixels:6500000};}
async function layer(page){const tc=await page.getTextContent({disableNormalization:true});await fixPageLigatures(page,tc);const raw=window.PdfText.itemsToLines(tc.items).join('\n'),text=expandPresentationForms(raw);return {text,usable:text.trim().length>0};}
async function run(pdf,opts){
 const o=opts||{},p=policy(o.navigator||navigator),total=Math.min(pdf.numPages,MAX),done=new Map(o.saved||[]),workers=[];let next=1,stopping=false,started=performance.now(),initial=done.size;
 const emit=()=>{const count=done.size,elapsed=(performance.now()-started)/1000;return {done:count,total,originalTotal:pdf.numPages,capped:pdf.numPages>MAX,elapsed,eta:count-initial>=2?Math.max(0,elapsed/(count-initial)*(total-count)):null};};
 async function one(i,slot){let page,cv;try{
  page=await pdf.getPage(i);let r=await layer(page),method='text';
  if(!r.usable){
   // Preserve short text-only title/blank pages. OCR is only for image or broken-font pages.
   const list=await page.getOperatorList(),ops=pdfjsLib.OPS;
   const image=list.fnArray.some(x=>x===ops.paintImageXObject||x===ops.paintInlineImageXObject||x===ops.paintImageMaskXObject||x===ops.paintImageXObjectRepeat||x===ops.paintInlineImageXObjectGroup||x===ops.paintJpegXObject);
   if(image&&!r.text.trim()){
    method='ocr';if(!workers[slot]){if(!await ocrLoadLib().then(()=>true))throw new Error('محرك OCR محتاج إنترنت أول مرة.');workers[slot]=await timed(Tesseract.createWorker(['ara','eng'],1,{langPath:'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@main',gzip:false,cacheMethod:'write'}));}
    const base=page.getViewport({scale:1}),scale=Math.min(p.scale,Math.sqrt(p.maxPixels/(base.width*base.height))),vp=page.getViewport({scale});
    cv=document.createElement('canvas');cv.width=Math.ceil(vp.width);cv.height=Math.ceil(vp.height);const ctx=cv.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);await page.render({canvasContext:ctx,viewport:vp}).promise;
    const result=await timed(root.LocalOcrLines?LocalOcrLines.recognize(workers[slot],cv):workers[slot].recognize(cv));r.text=String(result&&result.data&&result.data.text||'').trim();
   }
  }
  await o.onPage(i,r.text,method,emit());done.set(i,r.text);if(o.onProgress)await o.onProgress(emit());
 }finally{if(cv)cv.width=cv.height=0;if(page)page.cleanup();}}
 try{
  // First page is not delayed behind worker-pool boot or full-book text scanning.
  if(!done.has(1)&&!(o.shouldStop&&o.shouldStop()))await one(1,0);
  const work=async slot=>{while(!stopping&&!(o.shouldStop&&o.shouldStop())){while(next<=total&&done.has(next))next++;if(next>total)return;const i=next++;try{await one(i,slot);}catch(e){stopping=true;throw e;}}};
  const results=await Promise.allSettled(Array.from({length:p.workers},(_,i)=>work(i)));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  return {...emit(),complete:done.size===total,pages:done,policy:p};
 }finally{for(const w of workers)if(w)try{await w.terminate();}catch(e){}}}
let dbp,active=null;
function db(){if(!dbp)dbp=new Promise((resolve,reject)=>{const r=indexedDB.open('kutubi-pdf-imports',version);r.onupgradeneeded=()=>{for(const n of ['jobs','files','pages'])r.result.createObjectStore(n,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return dbp;}
async function store(name,mode,fn){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction(name,mode),r=fn(t.objectStore(name));let out;r.onsuccess=()=>out=r.result;t.oncomplete=()=>resolve(out);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('فشل الحفظ على الجهاز'));});}
const put=(n,x)=>store(n,'readwrite',s=>s.put(x)),get=(n,id)=>store(n,'readonly',s=>s.get(id));
function panel(){let el=document.getElementById('pdfImportProgress');if(el)return el;el=document.createElement('section');el.id='pdfImportProgress';el.dir='rtl';el.setAttribute('aria-label','تقدم استيراد PDF');el.style.cssText='margin:12px 0;padding:14px;border:1px solid #94764b;border-radius:14px;background:#fff1d9;color:#302317;line-height:1.7';const host=document.querySelector('main')||document.body;host.prepend(el);return el;}
function status(j){const el=panel();el.replaceChildren();const t=document.createElement('div');t.textContent=j.title+' • '+j.done+' / '+j.total+' صفحة محفوظة'+(j.capped?' (حد 800 صفحة، الكتاب جزئي)':'')+' • '+({running:'جاري التجهيز',paused:'متوقف مؤقتًا',complete:'اكتمل',error:'توقف بسبب خطأ',cancelled:'تم الإلغاء'}[j.status]||'');el.append(t);const info=document.createElement('div');info.textContent=j.error||((j.eta==null?'التقدير يظهر بعد قياس صفحتين':('متبقي تقريبًا '+Math.max(1,Math.ceil(j.eta/60))+' دقيقة'))+' • تقدر تقرأ الصفحات الجاهزة. لو النظام قفل التطبيق، استكمل من آخر صفحة محفوظة.');if(j.status==='complete')info.textContent='اتحفظت كل الصفحات المتاحة على جهازك.';el.append(info);if(j.warning){const w=document.createElement('div');w.textContent='بعض الصفحات محتمل ترميزها ضعيف. حافظنا على طبقة النص الأصلية من غير OCR تلقائي. راجعها واستخدم إصلاح النص لو احتاجت.';el.append(w);}
 const btn=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.style.margin='6px';b.onclick=fn;el.append(b);};
 if(j.bookId)btn('افتح الصفحات الجاهزة',()=>{openBook(j.bookId);});
 if(j.status==='running')btn('إيقاف مؤقت',()=>{if(active)active.stop=true;});
 if(['paused','error'].includes(j.status))btn('استكمال',()=>resume(j.id));
 if(j.status!=='running')btn('إخفاء',async()=>{el.remove();if(['complete','cancelled'].includes(j.status)){await store('jobs','readwrite',s=>s.delete(j.id));const entries=await store('pages','readonly',s=>s.getAll());for(const row of entries)if(row.job===j.id)await store('pages','readwrite',s=>s.delete(row.id));}});
 if(['paused','error'].includes(j.status))btn('إنهاء الاستيراد والاحتفاظ بالجاهز',async()=>{j.status='cancelled';await put('jobs',j);await store('files','readwrite',s=>s.delete(j.id));status(j);});
}
function makeChunks(t,page){const chunks=splitChunks(t);for(const c of chunks){c.pg=page;c.pgEnd=page;}return chunks;}
async function syncBook(j,rows){
 let b=j.bookId?books.find(x=>x.id===j.bookId):null;if(j.bookId&&!b)throw new Error('الكتاب اتحذف. الاستيراد وقف عشان ما يرجعوش تاني.');
 let through=b&&b.pdfImport?b.pdfImport.through||0:0;const additions=[];while(rows.has(through+1)){through++;additions.push(...makeChunks(rows.get(through)||'',through));}
 if(!b&&additions.length){const sample=additions.map(c=>c.orig).join('\n');b={id:uid(),title:j.title,created:Date.now(),origin:'file',summary:'',srcArabic:arabicRatio(sample)>.5,chunks:[],origChunks:[],origJoined:'',pageCount:through,extractVer:2};j.bookId=b.id;books.push(b);}
 if(b){const before=b.chunks.length;for(const c of additions){b.chunks.push(c);b.origChunks.push(c.orig);}b.origJoined=b.origChunks.join('\n\n');b.pageCount=through;b.pdfImport={id:j.id,done:j.done,total:j.total,status:j.status,through};await idbPut(b);if(!books.includes(b)){await idbDel(b.id);throw new Error('الكتاب اتحذف، واتوقف الاستيراد.');}if(currentId===b.id&&currentTabName==='reader'){renderChunkPage(b,Math.min(b.chunks.length,Math.max(renderedUpTo,before+8)));}}

 j.through=through;
}
async function execute(j){
 if(active){appToast('في استيراد شغال بالفعل. أوقفه مؤقتًا الأول.');return;}
 const locked=async()=>{active={id:j.id,stop:false};let pdf;
 try{await idbAll();const linked=books.find(b=>b.pdfImport&&b.pdfImport.id===j.id);if(linked)j.bookId=linked.id;const f=await get('files',j.id);if(!f)throw new Error('الملف الأصلي مش محفوظ. اختاره من جديد.');const entries=await store('pages','readonly',s=>s.getAll()),rows=new Map(entries.filter(x=>x.job===j.id).map(x=>[x.page,x.text]));
 pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdfjs/pdf.worker.min.js';pdf=await pdfjsLib.getDocument({data:await f.file.arrayBuffer()}).promise;j.total=Math.min(pdf.numPages,MAX);j.capped=pdf.numPages>MAX;j.done=rows.size;j.eta=null;j.status='running';j.error='';await syncBook(j,rows);await put('jobs',j);status(j);
 const result=await run(pdf,{saved:[...rows],shouldStop:()=>active.stop,onPage:async(i,text,method)=>{if(method==='text'&&window.PdfText.brokenArabicEncoding(text))j.warning=true;await put('pages',{id:j.id+':'+i,job:j.id,page:i,text,method});rows.set(i,text);j.done=rows.size;await syncBook(j,rows);await put('jobs',j);},onProgress:async p=>{j.eta=p.eta;status(j);}});
 if(result.complete&&!j.bookId)throw new Error('الصفحات خلصت لكن مفيش نص قابل للقراءة. راجع جودة الملف أو جرّب نسخة نصية.');j.status=result.complete?'complete':'paused';j.eta=result.complete?0:null;await syncBook(j,rows);await put('jobs',j);status(j);if(result.complete){if(j.bookId)await savePdfOriginal(j.bookId,f.file);await store('files','readwrite',s=>s.delete(j.id));}
 }catch(e){j.status='error';j.error=/[\u0600-\u06ff]/.test(e.message||'')?e.message:'الاستيراد توقف. الصفحات اللي اتحفظت موجودة، وفر مساحة أو اتأكد من الإنترنت ثم استكمل.';try{await put('jobs',j);}catch(_){}status(j);
 }finally{if(pdf)await pdf.destroy();active=null;}};
 if(navigator.locks)await navigator.locks.request('kutubi-pdf-import',{ifAvailable:true},async lock=>{if(lock)await locked();else appToast('الاستيراد شغال في تبويب تاني.');});else await locked();
}
async function start(file){let waits=0;while(!root.pdfjsLib&&waits++<50)await new Promise(r=>setTimeout(r,200));if(!root.pdfjsLib)throw new Error('مكتبة PDF لسه ما اتحملتش. اتأكد من الإنترنت وجرّب تاني.');if(active)throw new Error('استيراد PDF تاني شغال. أوقفه مؤقتًا الأول.');const j={id:uid(),title:document.getElementById('bookTitle').value.trim()||file.name.replace(/\.pdf$/i,''),done:0,total:0,through:0,status:'paused',created:Date.now()};await put('files',{id:j.id,file});await put('jobs',j);document.getElementById('addMsg').textContent='تم حفظ الملف. الصفحات هتظهر للقراءة أول بأول في شريط التقدم، مش محتاج تنتظر الكتاب كله.';void execute(j);return j.id;}
async function resume(id){const j=await get('jobs',id);if(j)await execute(j);}
async function init(){try{await idbAll();const jobs=await store('jobs','readonly',s=>s.getAll());const j=jobs.filter(j=>j.status!=='complete'&&j.status!=='cancelled').sort((a,b)=>b.created-a.created)[0];if(j){j.status='paused';j.eta=null;status(j);}}catch(e){console.warn('PDF import checkpoint unavailable');}}
root.PdfImport={start,resume,run,policy,layer};setTimeout(init,0);
})(window);
