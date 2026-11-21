/* ---------- 📖 أدوات تحسين القراءة (app7) ----------
   قراءة سريعة (إبراز أوائل الكلمات بالتباين من غير ما نكسر وصل الحروف العربية)، راحة العين (تباعد كلمات وأسطر
   من غير تباعد حروف — تباعد الحروف بيفصل الحرف العربي)، فلتر ضوء أزرق دافئ بيزيد تلقائيًا بعد المغرب،
   وضع تركيز (الجزء الحالي بس واضح)، وجلسة قراءة بمؤقت وتذكير راحة ٢٠-٢٠-٢٠.
   كل ده مخزّن على الجهاز بس (مفتاح mk_readtools) ومبيلمسش نص الكتاب ولا بياناته: أي تغيير في الـ DOM بس لتلوين النص. */
(function(){
  "use strict";
  var KEY = "mk_readtools";
  var DEF = { bionic: false, comfort: false, blue: 0, blueAuto: true, focus: false, session: true, breakMin: 20 };
  var S = Object.assign({}, DEF);
  function load(){
    try{
      var o = JSON.parse(localStorage.getItem(KEY) || "null");
      if(o && typeof o === "object"){
        S.bionic = !!o.bionic; S.comfort = !!o.comfort; S.focus = !!o.focus;
        S.blueAuto = o.blueAuto !== false; S.session = o.session !== false;
        var b = Number(o.blue); S.blue = isFinite(b) ? Math.max(0, Math.min(60, Math.round(b))) : 0;
        var m = Number(o.breakMin); S.breakMin = [10, 20, 30, 45].indexOf(m) >= 0 ? m : 20;
      }
    }catch(e){}
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }

  var css = document.createElement("style");
  css.textContent =
    "body.rt-comfort .chunk .orig, body.rt-comfort .chunk .trans{word-spacing:.28em;line-height:calc(var(--lh,1.9)*1.14);text-align:right;max-width:62ch;margin-inline:auto}" +
    "body.rt-comfort .chunk{padding-block:1.1rem}" +
    ".chunk .rt-r{color:color-mix(in srgb,currentColor 62%,transparent)}" +
    ".chunk .rt-l{font-weight:700}" +
    "body.rt-focus .chunk{transition:opacity .25s}body.rt-focus .chunk:not(.rt-current){opacity:.32}" +
    "#rtBlue{position:fixed;inset:0;pointer-events:none;z-index:109;background:rgb(255,150,40);mix-blend-mode:multiply;opacity:0;transition:opacity .6s}" +
    "#rtPill{position:fixed;left:12px;bottom:76px;z-index:60;background:rgba(30,27,75,.88);color:#fff;border-radius:999px;padding:.35rem .8rem;font-size:.85rem;display:none;direction:rtl;box-shadow:0 2px 10px rgba(0,0,0,.25)}" +
    "#rtBreak{position:fixed;left:50%;transform:translateX(-50%);bottom:130px;z-index:125;background:#1e1b4b;color:#fff;border-radius:14px;padding:.8rem 1rem;max-width:88vw;display:none;direction:rtl;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.35)}" +
    "#rtBreak button{margin-top:.5rem;margin-inline:.25rem}" +
    "#rtTools label.switch-row{display:flex;justify-content:space-between;align-items:center;gap:.6rem}";
  document.head.appendChild(css);

  /* ---- الفلتر الدافئ: نسبة اليدوي أو التلقائي بعد المغرب (٦م ← ١٥٪ ، ٩م ← ٣٠٪ ، لحد ٦ص) ---- */
  function autoBlue(){
    var h = new Date().getHours();
    if(h >= 21 || h < 5) return 30;
    if(h >= 18 || h < 6) return 15;
    return 0;
  }
  function blueNow(){ return Math.max(S.blue, S.blueAuto ? autoBlue() : 0); }
  function applyBlue(){
    var el = document.getElementById("rtBlue");
    if(!el){ el = document.createElement("div"); el.id = "rtBlue"; document.body.appendChild(el); }
    /* multiply على برتقالي: أعلى نسبة ٦٠٪ بتدّي دفء واضح من غير ما تخفي النص */
    el.style.opacity = String(Math.min(0.6, blueNow() / 100));
    var lbl = document.getElementById("rtBlueVal"); if(lbl) lbl.textContent = String(blueNow()) + "٪" + (S.blueAuto && autoBlue() > S.blue ? " (تلقائي)" : "");
  }

  /* ---- القراءة السريعة: بنلوّن أول ~٤٠٪ من حروف كل كلمة (كثافة التباين فقط، من غير تغيير الخط) ---- */
  var WORD = /[\u0600-\u06FF\u0750-\u077FA-Za-z]{3,}/g;
  var AR = /[\u0600-\u06FF\u0750-\u077F]/;
  function bionicNode(tn){
    var txt = tn.nodeValue;
    if(!txt || !WORD.test(txt)){ WORD.lastIndex = 0; return; }
    WORD.lastIndex = 0;
    var frag = document.createDocumentFragment(), last = 0, m;
    while((m = WORD.exec(txt))){
      if(m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
      var w = m[0], cut = Math.max(1, Math.round(w.length * 0.4));
      var latin = !AR.test(w);
      var a = document.createElement("span"); a.className = "rt-b" + (latin ? " rt-l" : ""); a.textContent = w.slice(0, cut);
      var b = document.createElement("span"); b.className = "rt-r"; b.textContent = w.slice(cut);
      frag.appendChild(a); frag.appendChild(b);
      last = m.index + w.length;
    }
    if(last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
    tn.parentNode.replaceChild(frag, tn);
  }
  function bionicOn(el){
    if(el.getAttribute("data-rt-bio") === "1") return;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function(n){
        var p = n.parentNode;
        if(!p || (p.closest && p.closest("button,textarea,input,select,.rt-b,.rt-r"))) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = []; while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(bionicNode);
    el.setAttribute("data-rt-bio", "1");
  }
  function bionicOff(el){
    if(el.getAttribute("data-rt-bio") !== "1") return;
    el.querySelectorAll(".rt-b,.rt-r").forEach(function(s){ s.replaceWith(document.createTextNode(s.textContent)); });
    el.normalize();
    el.removeAttribute("data-rt-bio");
  }
  var applyTimer = null;
  function applyBionicAll(){
    var els = document.querySelectorAll(".chunk [data-role=orig], .chunk [data-role=trans]");
    els.forEach(function(el){
      if(S.bionic) bionicOn(el); else bionicOff(el);
    });
  }
  /* لما الجزء يتعاد رسمه (ترجمة/إصلاح) بنعيد التلوين عليه بس بعد هدوء ٢٥٠ مللي */
  var mo = new MutationObserver(function(muts){
    if(!S.bionic) return;
    if(muts.every(function(m){ var t = m.target; return t && t.closest && t.closest(".rt-b,.rt-r"); })) return;
    clearTimeout(applyTimer); applyTimer = setTimeout(function(){ mo.disconnect(); try{ applyBionicAll(); }finally{ observe(); } }, 250);
  });
  function observe(){ var host = document.getElementById("chunks") || document.getElementById("tab-reader") || document.body; mo.observe(host, {childList: true, subtree: true, characterData: false}); }

  /* ---- وضع التركيز: الجزء اللي في نص الشاشة بس واضح ---- */
  var focusTick = null;
  function updateFocus(){
    if(!S.focus){ document.querySelectorAll(".chunk.rt-current").forEach(function(c){ c.classList.remove("rt-current"); }); return; }
    var mid = window.innerHeight / 2, best = null, bd = 1e9;
    document.querySelectorAll(".chunk").forEach(function(c){
      var r = c.getBoundingClientRect();
      var d = (r.top <= mid && r.bottom >= mid) ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      if(d < bd){ bd = d; best = c; }
    });
    document.querySelectorAll(".chunk.rt-current").forEach(function(c){ if(c !== best) c.classList.remove("rt-current"); });
    if(best) best.classList.add("rt-current");
  }
  window.addEventListener("scroll", function(){ if(!S.focus || focusTick) return; focusTick = setTimeout(function(){ focusTick = null; updateFocus(); }, 120); }, { passive: true });

  /* ---- جلسة القراءة: مؤقت بيعدّ الدقايق وانت قدّام كتاب مفتوح في تبويب القارئ + تذكير راحة العين ---- */
  var sessionMs = 0, lastTick = Date.now(), sinceBreakMs = 0, breakShown = false;
  function readerActive(){
    var pane = document.getElementById("tab-reader");
    return !document.hidden && !!document.querySelector(".chunk") && (!pane || pane.offsetParent !== null);
  }
  function fmtMin(ms){ var m = Math.floor(ms / 60000); return m < 60 ? m + " د" : Math.floor(m / 60) + " س " + (m % 60) + " د"; }
  function sessionTick(){
    var now = Date.now(), dt = Math.min(now - lastTick, 5000); lastTick = now;
    var pill = document.getElementById("rtPill");
    if(!S.session){ if(pill) pill.style.display = "none"; return; }
    if(readerActive()){ sessionMs += dt; sinceBreakMs += dt; }
    if(!pill){ pill = document.createElement("div"); pill.id = "rtPill"; document.body.appendChild(pill); }
    pill.style.display = (readerActive() && sessionMs >= 60000) ? "block" : "none";
    pill.textContent = "⏱ جلسة القراءة: " + fmtMin(sessionMs);
    if(!breakShown && sinceBreakMs >= S.breakMin * 60000) showBreak();
  }
  function showBreak(){
    breakShown = true;
    var el = document.getElementById("rtBreak");
    if(!el){
      el = document.createElement("div"); el.id = "rtBreak";
      el.innerHTML = '<div>👀 بقالك ' + S.breakMin + ' دقيقة بتقرا. بُص لحاجة بعيدة ٢٠ ثانية وريّح عينك.</div>' +
        '<button type="button" class="ghost" id="rtBreakOk">تمام، ريّحت</button><button type="button" class="ghost" id="rtBreakLater">فكّرني بعدين</button>';
      document.body.appendChild(el);
      document.getElementById("rtBreakOk").addEventListener("click", function(){ sinceBreakMs = 0; breakShown = false; el.style.display = "none"; });
      document.getElementById("rtBreakLater").addEventListener("click", function(){ sinceBreakMs = Math.max(0, (S.breakMin - 5) * 60000); breakShown = false; el.style.display = "none"; });
    }
    el.querySelector("div").textContent = "👀 بقالك " + S.breakMin + " دقيقة بتقرا. بُص لحاجة بعيدة ٢٠ ثانية وريّح عينك.";
    el.style.display = "block";
  }

  /* ---- الواجهة: قسم جوه «مظهر القراءة» ---- */
  function buildUI(){
    var host = document.getElementById("appearanceBody");
    if(!host || document.getElementById("rtTools")) return;
    var box = document.createElement("div"); box.id = "rtTools";
    box.innerHTML =
      '<label>🧠 أدوات تحسين القراءة</label>' +
      '<label class="switch-row">⚡ قراءة سريعة (إبراز أوائل الكلمات) <input type="checkbox" id="rtBionic"></label>' +
      '<p class="hint">بيبرز أول جزء من كل كلمة عشان عينك تجري أسرع. النص نفسه مبيتغيّرش.</p>' +
      '<label class="switch-row">🪶 راحة العين (تباعد كلمات وأسطر أوسع، مناسب للديسليكسيا) <input type="checkbox" id="rtComfort"></label>' +
      '<label>🌅 فلتر الضوء الأزرق: <span id="rtBlueVal">0٪</span><input type="range" id="rtBlueRange" min="0" max="60" step="5" value="0"></label>' +
      '<label class="switch-row">🌙 يزيد تلقائيًا بعد المغرب <input type="checkbox" id="rtBlueAuto"></label>' +
      '<label class="switch-row">🎯 وضع التركيز (الجزء الحالي بس واضح) <input type="checkbox" id="rtFocus"></label>' +
      '<label class="switch-row">⏱ مؤقت جلسة القراءة <input type="checkbox" id="rtSession"></label>' +
      '<label>تذكير راحة العين كل <select id="rtBreakSel"><option value="10">١٠ دقايق</option><option value="20">٢٠ دقيقة</option><option value="30">٣٠ دقيقة</option><option value="45">٤٥ دقيقة</option></select></label>';
    host.appendChild(box);
    function $i(id){ return document.getElementById(id); }
    $i("rtBionic").checked = S.bionic; $i("rtComfort").checked = S.comfort; $i("rtBlueRange").value = S.blue;
    $i("rtBlueAuto").checked = S.blueAuto; $i("rtFocus").checked = S.focus; $i("rtSession").checked = S.session; $i("rtBreakSel").value = String(S.breakMin);
    $i("rtBionic").addEventListener("change", function(e){ S.bionic = e.target.checked; save(); mo.disconnect(); applyBionicAll(); observe(); });
    $i("rtComfort").addEventListener("change", function(e){ S.comfort = e.target.checked; save(); applyClasses(); });
    $i("rtBlueRange").addEventListener("input", function(e){ S.blue = Number(e.target.value) || 0; save(); applyBlue(); });
    $i("rtBlueAuto").addEventListener("change", function(e){ S.blueAuto = e.target.checked; save(); applyBlue(); });
    $i("rtFocus").addEventListener("change", function(e){ S.focus = e.target.checked; save(); applyClasses(); updateFocus(); });
    $i("rtSession").addEventListener("change", function(e){ S.session = e.target.checked; save(); sessionTick(); });
    $i("rtBreakSel").addEventListener("change", function(e){ S.breakMin = Number(e.target.value) || 20; save(); });
    applyBlue();
  }
  function applyClasses(){
    document.body.classList.toggle("rt-comfort", !!S.comfort);
    document.body.classList.toggle("rt-focus", !!S.focus);
  }
  function init(){
    load(); applyClasses(); applyBlue(); buildUI();
    if(S.bionic) applyBionicAll();
    observe(); updateFocus();
    setInterval(sessionTick, 5000);
    setInterval(applyBlue, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", function(){ lastTick = Date.now(); if(!document.hidden) applyBlue(); });
    /* الواجهة بتتبني مرة واحدة بعد ما التطبيق يجهز؛ لو الكارت اتبنى متأخر نحاول تاني بخفة */
    var tries = 0, iv = setInterval(function(){ buildUI(); if(document.getElementById("rtTools") || ++tries > 20) clearInterval(iv); }, 500);
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.KutubiReadTools = { state: S, applyBionicAll: applyBionicAll, blueNow: blueNow, autoBlue: autoBlue, bionicNode: bionicNode };
})();
