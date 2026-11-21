/* ---------- 🖍 التظليل بالضغط المطوّل (app8) ----------
   ظلّل أي كلام في القارئ مباشرة: دوس مطوّلًا على النص (موبايل) أو حدّد بالماوس،
   فتطلع فقاعة صغيرة جنب التحديد فيها الألوان + ملحوظة + حفظ/اقتباس.
   بيشتغل على نفس بنية التظليلات الموجودة (book.annotations + highlightedHTML):
   الحفظ بيعدّي على نفس مسار زرار «🖍 ظلّل»، والنص المخزّن نفسه مبيتغيّرش أبدًا. */
(function(){
  "use strict";
  var COLOR_KEY = "mk_hlpop_color";
  var color = "yellow";
  try{ var c0 = localStorage.getItem(COLOR_KEY); if(c0 === "green" || c0 === "pink" || c0 === "yellow") color = c0; }catch(e){}

  var css = document.createElement("style");
  css.textContent =
    ".chunk [data-role=orig],.chunk [data-role=trans]{-webkit-touch-callout:none}" +
    "#hlPop{position:fixed;z-index:130;background:#1e1b4b;color:#fff;border-radius:14px;padding:.55rem .6rem;box-shadow:0 8px 28px rgba(0,0,0,.42);direction:rtl;display:none;max-width:94vw}" +
    "#hlPop .hlrow{display:flex;gap:.35rem;align-items:center;flex-wrap:wrap}" +
    "#hlPop button{border:0;border-radius:10px;padding:.35rem .6rem;font-size:.88rem;cursor:pointer;background:rgba(255,255,255,.15);color:#fff;font-family:inherit}" +
    "#hlPop button:active{transform:scale(.95)}" +
    "#hlPop button.sw{width:30px;height:30px;border-radius:50%;padding:0;border:2px solid transparent}" +
    "#hlPop button.sw.active{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.35)}" +
    "#hlPop .sw-yellow{background:#e8cf3a}#hlPop .sw-green{background:#7cc96f}#hlPop .sw-pink{background:#f79ec1}" +
    "#hlPop input{background:rgba(255,255,255,.12);border:0;border-radius:10px;color:#fff;padding:.4rem .6rem;width:100%;margin-top:.45rem;font-family:inherit;font-size:.9rem;box-sizing:border-box}" +
    "#hlPop input::placeholder{color:rgba(255,255,255,.55)}" +
    "#hlPop .hlmsg{font-size:.75rem;color:#ffd97a;margin-top:.3rem;min-height:0}" +
    "#hlPop .hlmsg.err{color:#ff9d9d}";
  document.head.appendChild(css);

  var pop = null, noteInput = null, msgEl = null;
  var sel = null; /* {book, idx, quote} آخر تحديد صالح جوه جزء */
  var touchActive = false, showTimer = null, hideTimer = null;

  function buildPop(){
    if(pop) return pop;
    pop = document.createElement("div"); pop.id = "hlPop";
    pop.innerHTML =
      '<div class="hlrow">' +
        '<button type="button" class="sw sw-yellow" data-c="yellow" title="أصفر"></button>' +
        '<button type="button" class="sw sw-green" data-c="green" title="أخضر"></button>' +
        '<button type="button" class="sw sw-pink" data-c="pink" title="وردي"></button>' +
        '<button type="button" id="hlPopSave">💾 ظلّل</button>' +
        '<button type="button" id="hlPopQuote">📤 اقتباس</button>' +
        '<button type="button" id="hlPopClose" title="إلغاء">✖</button>' +
      '</div>' +
      '<input type="text" id="hlPopNote" placeholder="ملحوظة على التظليل (اختياري)…">' +
      '<p class="hlmsg" id="hlPopMsg"></p>';
    document.body.appendChild(pop);
    noteInput = pop.querySelector("#hlPopNote");
    msgEl = pop.querySelector("#hlPopMsg");
    pop.querySelectorAll(".sw").forEach(function(b){
      b.addEventListener("click", function(){
        color = b.dataset.c;
        try{ localStorage.setItem(COLOR_KEY, color); }catch(e){}
        markSwatches();
      });
    });
    pop.querySelector("#hlPopClose").addEventListener("click", hidePop);
    pop.querySelector("#hlPopSave").addEventListener("click", saveHighlight);
    pop.querySelector("#hlPopQuote").addEventListener("click", shareSel);
    /* اللمس جوه الفقاعة ميقفلش التحديد ولا يخفيها */
    pop.addEventListener("mousedown", function(e){ e.preventDefault(); }); /* منع فقدان التحديد عند الدوس */
    pop.addEventListener("touchstart", function(e){ e.stopPropagation(); }, {passive:true});
    markSwatches();
    return pop;
  }
  function markSwatches(){
    if(!pop) return;
    pop.querySelectorAll(".sw").forEach(function(b){ b.classList.toggle("active", b.dataset.c === color); });
  }

  function chunkIdxOf(sec){
    if(!sec || !sec.id || sec.id.indexOf("chunk-") !== 0) return -1;
    return parseInt(sec.id.slice(6), 10);
  }
  function grabSelection(){
    var s = window.getSelection ? window.getSelection() : null;
    if(!s || !s.rangeCount || s.isCollapsed) return null;
    var node = s.anchorNode, el = node && (node.nodeType === 1 ? node : node.parentElement);
    if(!el || !el.closest) return null;
    var sec = el.closest(".chunk");
    if(!sec || !sec.closest("#chunks")) return null; /* التحديد لازم يكون جوه قارئ الكتاب */
    if(!sec.contains(s.focusNode)) return null;
    /* لازم يكون جوه نص الجزء نفسه (أصل/ترجمة) مش جوه أزرار أو محرر */
    var zone = el.closest('[data-role="orig"],[data-role="trans"]');
    if(!zone || !sec.contains(zone)) return null;
    var txt = (s.toString() || "").replace(/\s+/g, " ").trim();
    if(!txt || txt.length < 2) return null;
    var book = (typeof currentBook === "function") ? currentBook() : null;
    if(!book) return null;
    var idx = chunkIdxOf(sec);
    if(idx < 0 || !book.chunks || !book.chunks[idx]) return null;
    return { book: book, idx: idx, quote: txt.slice(0, 300), rect: s.getRangeAt(0).getBoundingClientRect() };
  }

  function showPop(g){
    buildPop();
    sel = g;
    msgEl.textContent = ""; msgEl.classList.remove("err");
    noteInput.value = "";
    pop.style.display = "block";
    /* التموضع: فوق التحديد، ولو مفيش مكان تحته — وكلها جوه الشاشة */
    var r = g.rect, pw = pop.offsetWidth, ph = pop.offsetHeight;
    var x = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2));
    var y = r.top - ph - 10;
    if(y < 8) y = Math.min(window.innerHeight - ph - 8, r.bottom + 10);
    pop.style.left = x + "px"; pop.style.top = y + "px";
  }
  function hidePop(){
    if(pop) pop.style.display = "none";
    sel = null;
  }

  function onSelChange(){
    clearTimeout(showTimer);
    showTimer = setTimeout(function(){
      if(touchActive) return; /* لسه بيحدّد بإصبعه — نستنى رفع الإصبع */
      var g = grabSelection();
      if(g) showPop(g);
      else if(pop && pop.style.display === "block" && document.activeElement !== noteInput) hidePop();
    }, 280);
  }
  document.addEventListener("selectionchange", onSelChange);
  document.addEventListener("touchstart", function(e){
    touchActive = true;
    if(pop && pop.style.display === "block" && !pop.contains(e.target)) hidePop();
  }, {passive:true});
  document.addEventListener("touchend", function(){
    touchActive = false;
    clearTimeout(showTimer);
    showTimer = setTimeout(function(){
      var g = grabSelection();
      if(g) showPop(g);
    }, 120);
  }, {passive:true});
  window.addEventListener("scroll", function(){ if(pop && pop.style.display === "block") hidePop(); }, {passive:true, capture:true});
  document.addEventListener("keydown", function(e){ if(e.key === "Escape") hidePop(); });

  /* مطابقة مرنة للمسافات: التحديد بييجي بمسافات مطبّعة (المتصفح بيطبّع \n لمسافة)،
     فبنبني نسخة مطبّعة من نص الجزء مع خريطة رجوع لمواضع النص الأصلي، ونستخرج المقطع الخام */
  function flexQuote(raw, q){
    if(!raw) return null;
    if(raw.indexOf(q) >= 0) return q;
    var norm = [], map = [], prevSpace = false;
    for(var ci = 0; ci < raw.length; ci++){
      var cc = raw[ci];
      if(/\s/.test(cc)){ if(!prevSpace){ norm.push(" "); map.push(ci); prevSpace = true; } }
      else { norm.push(cc); map.push(ci); prevSpace = false; }
    }
    var np = norm.join("").indexOf(q);
    if(np < 0) return null;
    var startRaw = map[np], endRaw = map[Math.min(np + q.length - 1, map.length - 1)];
    var slice = raw.slice(startRaw, endRaw + 1);
    return slice;
  }
  async function saveHighlight(){
    if(!sel){ hidePop(); return; }
    var g = sel, book = g.book, ch = book.chunks[g.idx];
    /* نفس تحقق محرر «🖍 ظلّل»: الاقتباس لازم يكون من نص الجزء ده بالظبط */
    var q = flexQuote(ch.orig, g.quote) || flexQuote(ch.trans, g.quote);
    if(!q){ msgEl.textContent = "التحديد مش مطابق لنص الجزء — جرّب تحدد تاني."; msgEl.classList.add("err"); return; }
    if(typeof ensureBookExtras === "function") ensureBookExtras(book);
    var before = book.annotations.slice();
    book.annotations.push({ id: (typeof uid === "function" ? uid() : String(Date.now())), chunk: g.idx, quote: q, color: color, note: noteInput.value.trim(), ts: Date.now() });
    try{ await idbPut(book); }
    catch(e){
      book.annotations = before;
      if(typeof logError === "function") logError("حفظ", e);
      msgEl.textContent = "الحفظ على الجهاز فشل — التظليل متسجلش، جرّب تاني."; msgEl.classList.add("err");
      return;
    }
    hidePop();
    try{ if(window.getSelection) window.getSelection().removeAllRanges(); }catch(e){}
    fillChunk(book, g.idx);
    renderIndexPanel();
    if(typeof setTransStatus === "function") setTransStatus("اتظلّل واتحفظ ✔ — تلاقيه في «فهرس وبحث» تحت التظليلات.");
  }

  function shareSel(){
    if(!sel) return;
    if(typeof shareQuote === "function") shareQuote(sel.book, sel.quote, msgEl);
  }

  /* تنضيف لو الكتاب اتقفل أو اتغيّر */
  document.addEventListener("click", function(e){
    if(pop && pop.style.display === "block" && !pop.contains(e.target) && !e.target.closest(".chunk")) hidePop();
  });
})();
