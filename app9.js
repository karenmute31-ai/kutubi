/* كُتُبِي — واجهة القراءة الهادية (v80): بيعيد ترتيب عناصر القارئ الموجودة (من غير ما يكسر وظايفها) ويضيف Aa/فوتر/وضع الصفحات/السطوع */
(function(){
  "use strict";
  var $=function(s,r){return (r||document).querySelector(s)};
  function ready(f){ if(document.readyState!=="loading") f(); else document.addEventListener("DOMContentLoaded",f); }
  var LS={get:function(k,d){try{var v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}},set:function(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
  ready(function(){
    var tab=$("#tab-reader"); if(!tab) return;
    /* 1) فوتر رفيع: سلايدر التنقل + موضع الجزء (نفس العناصر بنفس الـ ids فمعالجاتها شغالة) */
    var footer=document.createElement("div"); footer.id="readerFooter";
    var scr=$("#readScrubber"), pos=$("#scrubPos");
    if(scr&&pos){ footer.appendChild(scr); footer.appendChild(pos); }
    var ov=$("#overlay-root")||document.body; ov.appendChild(footer);
    /* 2) زر Aa في الهيدر الرفيع */
    var top=$("#readerTopbar"), menu=$("#btnReaderMenu");
    if(top&&menu){ var aa=document.createElement("button"); aa.id="btnReaderAa"; aa.type="button"; aa.title="المظهر والخط"; aa.textContent="Aa"; top.insertBefore(aa,menu);
      aa.addEventListener("click",function(){ var c=$("#appearanceCard"); var open=c&&c.classList.contains("sheet-open"); if(open&&window.closeReaderPanels) window.closeReaderPanels(); else { var b=$("#btnBarAppearance"); if(b) b.click(); } }); }
    /* 3) ورقة Aa: وضع القراءة (تمرير/صفحات) + السطوع + طريقة العرض */
    var body=$("#appearanceBody");
    if(body){
      var ex=document.createElement("div"); ex.id="aaExtras";
      ex.innerHTML='<div class="aa-row"><span>طريقة القراءة</span><div class="aa-seg" id="aaMode"><button type="button" class="ghost" data-m="scroll">تمرير</button><button type="button" class="ghost" data-m="pages">صفحات</button></div></div>'
        +'<div class="aa-row"><span>العرض</span><div class="aa-seg" id="aaView"><button type="button" class="ghost" data-v="orig">الأصلي</button><button type="button" class="ghost" data-v="trans">المترجم</button><button type="button" class="ghost" data-v="both">الاتنين</button></div></div>'
        +'<label>☀ السطوع <input id="aaBright" type="range" min="0" max="60" step="2" value="0" aria-label="السطوع"></label>';
      body.appendChild(ex);
      /* كل اللي مش أساسي (راحة العين/الفلتر/التذكير/المؤقت) في قسم واحد قابل للطي آخر الورقة */
      var keep=[].slice.call(body.children).filter(function(c){return c===ex||c.matches("label:first-child,.swatches,.font-size-row")||c.querySelector&&(c.querySelector("#readerFontSel,#lineHeightRange")||c.matches(".swatches"))||c.id==="readerFontSel"});
      var more=document.createElement("details"); more.className="aa-more"; more.innerHTML="<summary>المزيد: راحة العين والمؤقت</summary>";
      [].slice.call(body.children).forEach(function(c){ if(keep.indexOf(c)<0 && c!==ex) more.appendChild(c); });
      body.appendChild(more);
      var dim=document.createElement("div"); dim.id="dimLayer"; document.body.appendChild(dim);
      function setDim(v){ document.documentElement.style.setProperty("--dim",(v/100).toFixed(2)); LS.set("kb_dim",String(v)); }
      var bright=$("#aaBright"); var dv=parseInt(LS.get("kb_dim","0"),10)||0; bright.value=String(dv); setDim(dv);
      bright.addEventListener("input",function(){setDim(parseInt(bright.value,10)||0)});
      function syncMode(){ var m=LS.get("kb_mode","scroll"); document.body.classList.toggle("pages-mode",m==="pages"); [].forEach.call(ex.querySelectorAll("#aaMode button"),function(b){b.classList.toggle("on",b.dataset.m===m)}); }
      ex.querySelector("#aaMode").addEventListener("click",function(e){var b=e.target.closest("button"); if(!b)return; LS.set("kb_mode",b.dataset.m); syncMode();});
      syncMode();
      function syncView(){ var v=(document.querySelector("#readViewBar .primary")||{}).dataset; v=v&&v.readview; [].forEach.call(ex.querySelectorAll("#aaView button"),function(b){b.classList.toggle("on",b.dataset.v===v)}); }
      ex.querySelector("#aaView").addEventListener("click",function(e){var b=e.target.closest("button"); if(!b)return; var t=document.querySelector('#readViewBar [data-readview="'+b.dataset.v+'"]'); if(t) t.click(); setTimeout(syncView,60);});
      var vb=$("#readViewBar"); if(vb) vb.addEventListener("click",function(){setTimeout(syncView,60)}); syncView(); setTimeout(syncView,800);
    }
    /* 4) وضع الصفحات: نقر الحافتين يقلب صفحة بحجم الشاشة */
    var tap=document.createElement("div"); tap.id="readerPageTap"; tap.innerHTML='<i class="l"></i><i class="r"></i>'; document.body.appendChild(tap);
    function flip(dir){ var h=window.innerHeight-48-44-24; window.scrollBy({top:dir*h,behavior:"smooth"}); }
    tap.addEventListener("click",function(e){ var i=e.target.closest("i"); if(!i)return; flip(i.classList.contains("l")?1:-1); /* عربي: الشمال = التالي */ });
    /* 5) درج ⋯ بأقسام: ترجمة (مفتوح) / أدوات الذكاء / أدوات الكتاب (قابلين للطي) */
    var rdBody=$("#readerDrawer .rd-body");
    if(rdBody && !$("#readerDrawer details.rd-sec")){
      function sec(title,open){var d=document.createElement("details");d.className="rd-sec";if(open)d.open=true;var s=document.createElement("summary");s.textContent=title;var b=document.createElement("div");b.className="rd-sec-body";d.appendChild(s);d.appendChild(b);return {d:d,b:b}}
      var sTr=sec("🌐 الترجمة والعرض",true), sAi=sec("✨ أدوات الذكاء",false), sTools=sec("🧰 أدوات الكتاب",false);
      var ab=$("#readerActionBar"), tc=$("#bookToolsCard");
      var ai=document.createElement("div"); ai.className="ai-grid";
      ["btnExplainBook","btnAskBook","btnQuiz","btnSummary","btnMenuVoice"].forEach(function(id){var el=document.getElementById(id); if(el){ el.classList.remove("wide"); ai.appendChild(el);} });
      sAi.b.appendChild(ai);
      if(ab) sTr.b.appendChild(ab);
      if(tc) sTools.b.appendChild(tc);
      rdBody.appendChild(sTr.d); rdBody.appendChild(sAi.d); rdBody.appendChild(sTools.d);
    }
    /* ===== المرحلة 2 ===== */
    var lib=$("#tab-library");
    if(lib){
      var fab=document.createElement("button"); fab.id="libAddFab"; fab.type="button"; fab.textContent="+"; fab.title="ضيف كتاب"; fab.setAttribute("aria-label","ضيف كتاب");
      document.body.appendChild(fab);
      fab.addEventListener("click",function(){ var o=lib.classList.toggle("add-open"); fab.textContent=o?"×":"+"; if(o){ var c=lib.querySelector(".card:has(#bookTitle)"); if(c) c.scrollIntoView({behavior:"smooth",block:"start"}); } });
      function syncLib(){ document.body.classList.toggle("on-library",lib.classList.contains("active")); }
      new MutationObserver(syncLib).observe(lib,{attributes:true,attributeFilter:["class"]}); syncLib();
    }
    /* التابات السفلية: الرئيسية/المكتبة/المزيد بس — خانة المزيد بتنشط لأي تاب تاني */
    window.syncMoreBtn=function(){ var mb=$("#btnNavMore"); if(!mb||typeof currentTabName==="undefined")return; var slots=document.body.dataset.layout==="mobile"?["home","library"]:["home","library","reader","glossary","quick","files","install","settings","freelib"]; mb.classList.toggle("active",slots.indexOf(currentTabName)===-1); };
    var bnm=$("#btnNavMore"); if(bnm) bnm.addEventListener("click",function(e){ if(document.body.dataset.layout!=="mobile")return; if(bnm._lpFired)return; e.stopImmediatePropagation(); var sh=$("#moreSheet"); if(sh&&sh.classList.contains("sheet-open")) closeMoreSheet(); else openMoreSheet(); },true);
    /* صفوف الهيدر اللي اتشالت (تحديث) تتحط في المزيد */
    var ms=$("#moreSheetList");
    if(ms){ new MutationObserver(function(){ if(document.body.dataset.layout!=="mobile"||ms.querySelector(".more-upd")||!ms.querySelector(".more-row"))return; var tb=$("#moreSheet .more-sheet-head"); if(tb&&/درج/.test(tb.textContent))return; var r=document.createElement("button"); r.type="button"; r.className="more-row more-upd"; r.innerHTML='<span class="mi">⟳</span><span class="mt"><span class="ml">تحديث التطبيق</span></span>'; r.addEventListener("click",function(){var u=$("#btnNavUpdate"); if(window.closeMoreSheet)closeMoreSheet(); if(u)u.click();}); ms.appendChild(r); }).observe(ms,{childList:true}); }
    /* ===== المرحلة 3: شريط الذكاء عند تحديد نص (ترجم / اشرح بالمصري / اسمع + تظليل وملاحظة) ===== */
    function arabicRatio(t){ var a=(t.match(/[\u0600-\u06FF]/g)||[]).length; return a/Math.max(1,t.replace(/\s/g,"").length); }
    var lastSel=""; document.addEventListener("selectionchange",function(){ var x=String(window.getSelection()||"").trim(); if(x) lastSel=x; });
    function smartBar(pop){
      if(pop.querySelector(".smartbar")) return;
      var row=document.createElement("div"); row.className="smartbar";
      row.innerHTML='<button type="button" data-a="tr">🌐 ترجم</button><button type="button" data-a="ex">💡 اشرح بالمصري</button><button type="button" data-a="ls">🔊 اسمع</button>';
      var res=document.createElement("div"); res.className="smartres"; res.hidden=true;
      pop.insertBefore(res,pop.firstChild); pop.insertBefore(row,pop.firstChild);
      pop.addEventListener("mousedown",function(e){e.preventDefault()});
      row.addEventListener("click",async function(e){
        var b=e.target.closest("button"); if(!b)return; var t=pop.dataset.t||lastSel||""; if(!t)return;
        var a=b.dataset.a; res.hidden=false;
        try{
          if(a==="ls"){ var lang=arabicRatio(t)>0.5?"ar":"en"; if(typeof speakItems==="function") speakItems([{text:t,lang:lang}],"تحديد"); res.textContent="🔊 بيقرأ…"; return; }
          res.textContent=a==="tr"?"بيترجم…":"بيشرح…";
          if(a==="tr"){ var q=await quickTranslate(t,"ar-EG"); res.textContent=(q&&q.translation||"")+((q&&q.meaning)?"\n"+q.meaning:""); }
          else { var dl=explDialect(); var out=await aiChat(dl.sys, dl.ask+"، شرح قصير ومركّز للفقرة دي من الكتاب:\n\n"+t); res.textContent=String(out||"").trim()||"مفيش شرح متاح دلوقتي"; }
        }catch(err){ res.textContent="وقفت: "+(err&&err.message||err); }
        var r=pop.getBoundingClientRect(); if(r.bottom>window.innerHeight-8) pop.style.top=Math.max(8,window.innerHeight-r.height-8)+"px";
      });
      new MutationObserver(function(){ if(pop.style.display==="block"){ var st=String(window.getSelection()||"").trim(); if(st){ pop.dataset.t=st; } res.hidden=true; res.textContent=""; } else { res.hidden=true; } }).observe(pop,{attributes:true,attributeFilter:["style"]});
    }
    var pe=document.getElementById("hlPop"); if(pe) smartBar(pe);
    new MutationObserver(function(){ var p=document.getElementById("hlPop"); if(p) smartBar(p); }).observe(document.body,{childList:true});
    /* منطقة لمس علوية/سفلية بتظهر وتخفي الكروم حتى لو الكلام كله كلمات قابلة للضغط */
    document.addEventListener("click",function(e){
      if(document.body.dataset.layout!=="mobile"||!document.body.classList.contains("in-reader")) return;
      if(e.target.closest("button,a,input,select,textarea,label,summary,details,#readerDrawer,#appearanceCard,#voiceCard,#indexCard,#wordSheet,#readerTopbar,#readerFooter,#readerPageTap,.sheet,.modal")) return;
      var y=e.clientY, H=window.innerHeight; if(!(y<80||y>H-90)) return;
      e.stopPropagation(); e.preventDefault();
      var off=tab.classList.toggle("chrome-off"); document.body.classList.toggle("chrome-off",off);
      document.body.classList.remove("chrome-scroll-hidden"); tab.classList.remove("chrome-scroll-hidden");
    },true);
    /* 6) انغماس افتراضي: الكروم مخفي لحد ما تلمس الورقة */
    function immerse(){ if(document.body.dataset.layout!=="mobile")return; tab.classList.add("chrome-off"); document.body.classList.add("chrome-off"); }
    var obs=new MutationObserver(function(){ var inR=document.body.classList.contains("in-reader"); if(inR&&!document.body.__rIn){ document.body.__rIn=1; immerse(); } else if(!inR) document.body.__rIn=0; });
    obs.observe(document.body,{attributes:true,attributeFilter:["class"]});
  });
})();
