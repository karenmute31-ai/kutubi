/* كُتُبِي v107 — تعديل النص وإصلاحه: محرر النص الكامل + تصوير صفحات بالكاميرا/الصور (OCR عربي+إنجليزي على الجهاز)
   + إعادة استخراج الكتاب من ملف الـPDF الأصلي. بيعتمد على دوال التطبيق الموجودة (ocrGetWorker / splitChunks / cleanupText / idbPut / renderReader). */
(function(){
  "use strict";
  var $=function(s,r){return (r||document).querySelector(s)};
  function ready(f){ if(document.readyState!=="loading") f(); else document.addEventListener("DOMContentLoaded",f); }
  function book(){ try{ return typeof currentBook==="function" ? currentBook() : null; }catch(e){ return null; } }
  function locked(b){ try{ return typeof isBookLocked==="function" && isBookLocked(b); }catch(e){ return false; } }
  function busy(){ try{ return (typeof translating!=="undefined" && translating) || (typeof repairing!=="undefined" && repairing); }catch(e){ return false; } }
  function stat(t,err){ var el=$("#edStatus"); if(el){ el.textContent=t||""; el.style.color=err?"var(--bad)":""; } var o=$("#edOvStatus"); if(o){ o.textContent=t||""; o.style.color=err?"var(--bad)":""; } }
  function need(){ var b=book(); if(!b){ stat("افتح كتابًا الأول من المكتبة.",true); return null; } if(locked(b)){ stat("الكتاب مقفول — افتحه الأول.",true); return null; } if(busy()){ stat("استنى الترجمة/الإصلاح الشغال يخلص الأول.",true); return null; } return b; }
  function refresh(b){ try{ renderReader(b); }catch(e){} try{ renderLibrary(); }catch(e){} }
  function esc(t){ return String(t==null?"":t); }

  /* ===== قسم في درج القارئ + صف في «المزيد» ===== */
  function buildSection(){
    var body=$("#readerDrawer .rd-body"); if(!body || $("#edSection")) return false;
    var d=document.createElement("details"); d.className="rd-sec"; d.id="edSection";
    d.innerHTML='<summary>✏️ تعديل النص وإصلاحه</summary>'
      +'<div class="rd-sec-body"><div class="ai-grid">'
      +'<button type="button" id="btnEdOpen">✏️ محرر النص الكامل</button>'
      +'<label class="ed-file" id="lblEdCam">📷 صوّر صفحة بالكاميرا<input id="edCamFile" type="file" accept="image/*" capture="environment" hidden></label>'
      +'<label class="ed-file" id="lblEdImg">🖼 صور من الجهاز (OCR)<input id="edImgFile" type="file" accept="image/*" multiple hidden></label>'
      +'<button type="button" id="btnEdRepair">🔁 إعادة استخراج من الـPDF الأصلي</button>'
      +'</div><p class="hint" id="edStatus"></p></div>';
    body.appendChild(d);
    $("#btnEdOpen").addEventListener("click",openEditor);
    $("#edCamFile").addEventListener("change",function(e){ ocrFiles(e.target.files); e.target.value=""; });
    $("#edImgFile").addEventListener("change",function(e){ ocrFiles(e.target.files); e.target.value=""; });
    $("#btnEdRepair").addEventListener("click",repairFromPdf);
    var mt=$("#moreReaderTools");
    if(mt && !$("#moreBtnEdit")){ var r=document.createElement("button"); r.type="button"; r.className="more-row"; r.id="moreBtnEdit"; r.innerHTML='✏️ <span>تعديل النص وإصلاحه</span>';
      r.addEventListener("click",function(){ try{ closeMoreSheet(); }catch(e){} openEditor(); }); mt.appendChild(r); }
    return true;
  }

  /* ===== الغطاء: محرر + نتيجة OCR ===== */
  function overlay(){
    var o=$("#edOverlay"); if(o) return o;
    o=document.createElement("div"); o.id="edOverlay"; o.className="consent-overlay hidden";
    o.innerHTML='<div class="consent-box card ed-box"><h2 id="edOvTitle">✏️ محرر النص الكامل</h2>'
      +'<div id="edEditorWrap"><div class="row wrap"><input id="edJump" type="number" min="1" placeholder="رقم الجزء" style="max-width:8rem"><button type="button" class="ghost" id="edJumpBtn">روح للجزء</button><button type="button" class="primary" id="edSave">💾 احفظ التعديلات</button></div>'
      +'<p class="hint">أي جزء تعدّله بتتمسح ترجمته وشرحه القديمين عشان يتعاد توليدهم من النص الجديد. الأجزاء اللي مالمستهاش بتفضل زي ما هي.</p><div id="edList"></div><button type="button" class="ghost hidden" id="edMore">حمّل أجزاء أكتر</button></div>'
      +'<div id="edOcrWrap" class="hidden"><p class="hint">راجع النص المتعرّف عليه وعدّل فيه لو محتاج، وبعدين اختار مكانه:</p><textarea id="edOcrText" rows="9" style="width:100%"></textarea>'
      +'<div class="row wrap"><select id="edOcrPos"><option value="end">جزء جديد في آخر الكتاب</option><option value="into">ضيفه في آخر جزء رقم…</option></select><input id="edOcrAfter" type="number" min="1" placeholder="رقم الجزء" style="max-width:8rem"><button type="button" class="primary" id="edOcrAdd">أضِف للكتاب</button></div></div>'
      +'<p id="edOvStatus" class="hint"></p><div class="row wrap"><button type="button" class="ghost" id="edClose">اقفل</button></div></div>';
    (document.getElementById("overlay-root")||document.body).appendChild(o);
    $("#edClose").addEventListener("click",function(){ o.classList.add("hidden"); });
    $("#edJumpBtn").addEventListener("click",jump); $("#edSave").addEventListener("click",saveAll); $("#edMore").addEventListener("click",function(){ renderMore(); });
    $("#edOcrAdd").addEventListener("click",addOcr);
    return o;
  }
  var PAGE=12, shown=0, edBook=null;
  function openEditor(){
    var b=need(); if(!b) return;
    try{ closeReaderPanels(); }catch(e){}
    var o=overlay(); edBook=b; shown=0; $("#edList").innerHTML=""; $("#edOvTitle").textContent="✏️ محرر النص الكامل — "+esc(b.title);
    $("#edEditorWrap").classList.remove("hidden"); $("#edOcrWrap").classList.add("hidden"); $("#edOvStatus").textContent="";
    renderMore(); o.classList.remove("hidden");
  }
  function renderMore(upTo){
    var b=edBook; if(!b) return; var list=$("#edList"); var end=Math.min(b.chunks.length,upTo||shown+PAGE);
    for(var i=shown;i<end;i++){
      var w=document.createElement("div"); w.className="ed-chunk"; w.dataset.i=String(i);
      var h=document.createElement("div"); h.className="hint"; h.textContent="الجزء "+(i+1)+" من "+b.chunks.length+(b.chunks[i].pg?(" — صفحة "+b.chunks[i].pg):"");
      var t=document.createElement("textarea"); t.rows=7; t.style.width="100%"; t.dir="auto"; t.value=b.chunks[i].orig||""; t.dataset.orig=t.value;
      t.addEventListener("input",function(){ this.parentNode.classList.toggle("ed-dirty", this.value!==this.dataset.orig); });
      w.appendChild(h); w.appendChild(t); list.appendChild(w);
    }
    shown=end; $("#edMore").classList.toggle("hidden", shown>=b.chunks.length);
  }
  function jump(){
    var b=edBook; if(!b) return; var n=parseInt($("#edJump").value,10); if(!n||n<1||n>b.chunks.length){ stat("رقم الجزء بين 1 و"+b.chunks.length,true); return; }
    if(n>shown) renderMore(n);
    var el=$('#edList .ed-chunk[data-i="'+(n-1)+'"]'); if(el){ el.scrollIntoView({block:"start"}); var ta=el.querySelector("textarea"); if(ta) ta.focus(); }
  }
  async function saveAll(){
    var b=edBook; if(!b||busy()) return; var n=0;
    document.querySelectorAll("#edList .ed-chunk").forEach(function(w){
      var t=w.querySelector("textarea"); if(t.value===t.dataset.orig) return;
      var i=+w.dataset.i, ch=b.chunks[i]; if(!ch) return; ch.orig=t.value; clearDerivedChunk(ch); t.dataset.orig=t.value; w.classList.remove("ed-dirty"); n++;
    });
    if(!n){ stat("مفيش تعديلات تتحفظ."); return; }
    b.summary=""; try{ await idbPut(b); }catch(e){ stat("فشل الحفظ: "+(e&&e.message||e),true); return; }
    refresh(b); stat("اتحفظ ✔ "+n+" جزء اتعدّل — ترجمة وشرح الأجزاء دي هتتعاد من النص الجديد.");
  }

  /* ===== OCR من صور/كاميرا ===== */
  async function fileToCanvas(f){
    var bmp=await createImageBitmap(f); var sc=Math.min(1, 2600/Math.max(bmp.width,bmp.height)); var c=document.createElement("canvas");
    c.width=Math.max(1,Math.round(bmp.width*sc)); c.height=Math.max(1,Math.round(bmp.height*sc)); var x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,c.width,c.height); x.drawImage(bmp,0,0,c.width,c.height); if(bmp.close) bmp.close(); return c;
  }
  async function ocrFiles(files){
    var b=need(); if(!b) return; files=[].slice.call(files||[]); if(!files.length) return;
    var o=overlay(); edBook=b; $("#edOvTitle").textContent="📷 تعرّف ضوئي على الصور"; $("#edEditorWrap").classList.add("hidden"); $("#edOcrWrap").classList.add("hidden"); o.classList.remove("hidden");
    try{ closeReaderPanels(); }catch(e){}
    var out=[];
    try{
      stat("بيجهّز محرك التعرف الضوئي… (أول مرة بياخد وقت)");
      var worker=await ocrGetWorker();
      for(var i=0;i<files.length;i++){
        stat("بيقرا الصورة "+(i+1)+" من "+files.length+"…");
        var c=await fileToCanvas(files[i]); var r=await worker.recognize(c); var t=((r&&r.data&&r.data.text)||"").trim(); if(t) out.push(t);
      }
    }catch(e){ stat("التعرف الضوئي فشل: "+(e&&e.message||e),true); return; }
    if(!out.length){ stat("ملقيتش نص في الصور — جرّب صورة أوضح وإضاءة أحسن.",true); return; }
    var txt=out.join("\n\n"); $("#edOcrText").value=txt; $("#edOcrWrap").classList.remove("hidden");
    stat("اتعرّف على "+txt.length+" حرف — راجعهم وعدّل لو محتاج، وبعدين دوس «أضِف للكتاب».");
  }
  async function addOcr(){
    var b=edBook||book(); if(!b||busy()) return; var t=$("#edOcrText").value.trim(); if(t.length<5){ stat("النص قصير قوي.",true); return; }
    var pos=$("#edOcrPos").value;
    if(pos==="into"){
      var n=parseInt($("#edOcrAfter").value,10); if(!n||n<1||n>b.chunks.length){ stat("رقم الجزء بين 1 و"+b.chunks.length,true); return; }
      var ch=b.chunks[n-1]; ch.orig=(ch.orig||"")+"\n\n"+t; clearDerivedChunk(ch);
    } else {
      var cl=cleanupText(t).text; var add=splitChunks(cl); if(!add.length){ stat("ملقيتش نص قابل للإضافة.",true); return; }
      add.forEach(function(c){ b.chunks.push(c); });
    }
    b.summary=""; b.srcArabic=arabicRatio(b.chunks.map(function(c){return c.orig||""}).join("\n\n"))>0.5;
    try{ await idbPut(b); }catch(e){ stat("فشل الحفظ: "+(e&&e.message||e),true); return; }
    refresh(b); $("#edOcrWrap").classList.add("hidden"); stat("اتضافت الصفحات للكتاب ✔");
  }

  /* ===== إعادة الاستخراج من الـPDF الأصلي ===== */
  async function repairFromPdf(){
    var b=need(); if(!b) return; var blob=null;
    try{ blob=await idbPdfGet(b.id); }catch(e){}
    if(!blob){
      stat("الكتاب ده معندوش نسخة PDF محفوظة — اختار ملف الـPDF الأصلي.");
      blob=await new Promise(function(res){ var i=document.createElement("input"); i.type="file"; i.accept="application/pdf,.pdf"; i.onchange=function(){ res(i.files&&i.files[0]||null); }; i.click(); });
      if(!blob) return;
    }
    if(!confirm("هيعيد استخراج النص من ملف الـPDF بأحدث محرك (ولو الملف مصوّر أو الخط مكسور هيستخدم التعرف الضوئي). الترجمات والعلامات الحالية للكتاب هتتمسح، ونسخة من النص الحالي هتتحفظ احتياطي. أكمل؟")) return;
    try{
      stat("بيعيد الاستخراج…"); var buf=await blob.arrayBuffer(); var r=await extractPDFWithOCR(buf, b.title);
      var text=r.text, pages=r.pages;
      if(pages && pages.length) text=pages.map(function(p,i){ return window.PdfText.markPage(i+1)+String(p||""); }).join("\n\n");
      text=String(text||"").trim(); if(text.length<30) throw new Error("النص المستخرج قصير قوي.");
      var cleaned=cleanupText(text), chunks=splitChunks(cleaned.text);
      if(pages && pages.length){ var pe=1; chunks.forEach(function(c){ var m=window.PdfText.readMarkers(c.orig); c.pg=m.first===null?pe:m.first; c.pgEnd=m.last===null?pe:m.last; pe=c.pgEnd; c.orig=window.PdfText.stripMarkers(c.orig); }); }
      if(!chunks.length) throw new Error("ملقيتش نص قابل للقراية.");
      b.repairBackup={ at:Date.now(), chunks:b.chunks.map(function(c){return c.orig||""}) };
      b.chunks=chunks; b.origChunks=chunks.map(function(c){return c.orig}); b.origJoined=b.origChunks.join("\n\n");
      b.summary=""; b.progress=0; b.bookmarks=[]; b.annotations=[]; b.chat=[]; b.srcArabic=arabicRatio(text)>0.5; if(pages&&pages.length){ b.pageCount=r.pageCount||pages.length; b.extractVer=2; }
      await idbPut(b); refresh(b); stat("اتعاد استخراج الكتاب ✔ "+chunks.length+" جزء.");
    }catch(e){ stat("إعادة الاستخراج فشلت: "+(e&&e.message||e),true); }
  }

  ready(function(){ var n=0; (function tryB(){ if(buildSection()||++n>40) return; setTimeout(tryB,250); })(); });
})();
