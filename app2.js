async function gFetchVoices(){
  const msg = $("#gMsg"), btn = $("#gTest");
  const key = ($("#gKey").value || "").trim();
  if(!key){ msg.textContent = "حط مفتاح Google API الأول."; msg.classList.add("err"); return; }
  msg.textContent = "بيجلب أصوات Google…"; msg.classList.remove("err"); btn.disabled = true;
  try{
    const ctl = new AbortController(); const to = setTimeout(()=>ctl.abort(), 15000);
    const r = await fetch("https://texttospeech.googleapis.com/v1/voices?key=" + encodeURIComponent(key), {signal: ctl.signal});
    clearTimeout(to);
    if(r.status === 400 || r.status === 401 || r.status === 403){ msg.textContent = "المفتاح مش صح أو خدمة Text-to-Speech مش مفعّلة في مشروعك"; msg.classList.add("err"); return; }
    if(!r.ok){ msg.textContent = "Google ردّت بخطأ " + r.status; msg.classList.add("err"); return; }
    const j = await r.json();
    const arr = (j && j.voices) || [];
    if(!arr.length){ msg.textContent = "مفيش أصوات راجعة من Google."; msg.classList.add("err"); return; }
    const score = v => { const lc = (v.languageCodes || [""])[0] || ""; if(lc.indexOf("ar-XA") === 0) return 0; if(lc.indexOf("ar-") === 0) return 1; return 2; };
    const voices = arr.slice().sort((a, b)=>score(a) - score(b)).map(v=>({id: v.name, name: v.name + (v.ssmlGender ? " · " + v.ssmlGender : "")}));
    settings.gKey = key; settings.gVoices = voices;
    if(!voices.some(v=>v.id === settings.gVoice)) settings.gVoice = voices[0].id;
    saveSettings(); fillGVoices(); syncProviderUI();
    msg.textContent = "تمام ✔ جلبنا " + voices.length + " صوت من Google — الأصوات العربية في الأول. اختار صوتك."; msg.classList.remove("err");
  }catch(e){ msg.textContent = "فشل الاتصال بـ Google — اتأكد من الإنترنت والمفتاح."; msg.classList.add("err"); }
  finally{ btn.disabled = false; }
}
/* حالة «محفوظة» وأزرار MP3 على أجزاء الكتاب حسب كاش الصوت الحالي */
async function refreshChunkAudioStates(book){
  const prov = ttsProvider();
  if(!book || prov === "device" || !providerVoiceId(prov)) return;
  const voiceId = providerVoiceId(prov);
  for(let i = 0; i < book.chunks.length; i++){
    const sec = $("#chunk-" + i); if(!sec) continue;
    const ch = book.chunks[i];
    for(const kind of ["trans", "explain"]){
      const text = kind === "trans" ? ch.trans : ch.explanation;
      const btn = $('[data-role="listen-' + kind + '"]', sec);
      const mp3 = $('[data-role="mp3-' + kind + '"]', sec);
      if(!text){ if(mp3) mp3.remove(); continue; }
      const has = await idbAudioGet(audioCacheKey(prov, book.id, i, kind, voiceId, text)).then(v=>!!v).catch(()=>false);
      if(btn) btn.textContent = (kind === "trans" ? "🔊 اسمع ترجمة الجزء" : "🎧 اعمل واسمع الشرح الصوتي") + (has ? " · محفوظ" : "");
      const btns = $('[data-role="btns"]', sec);
      if(has && !mp3 && btns){
        const d = document.createElement("button"); d.className = "ghost"; d.dataset.role = "mp3-" + kind;
        d.textContent = kind === "trans" ? "⬇ MP3 الترجمة" : "⬇ MP3 الشرح";
        d.addEventListener("click", ()=>downloadChunkMp3(book, i, kind));
        btns.appendChild(d);
      } else if(!has && mp3){ mp3.remove(); }
    }
  }
}
async function downloadChunkMp3(book, i, kind){
  const prov = ttsProvider();
  const ch = book.chunks[i];
  const text = kind === "explain" ? (ch.explanation || "") : (ch.trans || "");
  if(!text || prov === "device" || !providerVoiceId(prov)) return;
  const blob = await idbAudioGet(audioCacheKey(prov, book.id, i, kind, providerVoiceId(prov), text)).catch(()=>null);
  if(!blob){ setAudioStatus("الصوت ده مش محفوظ لسه — شغّله مرة واحدة الأول عشان يتولّد ويتحفظ.", true); return; }
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = (book.title || "كتاب").replace(/[\\/:*?"<>|]/g, " ").trim() + "-جزء-" + (i + 1) + ".mp3";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}
function setAudioStatus(t,err){ const el=$("#audioStatus"); if(el){ el.textContent=t||""; el.classList.toggle("err",!!err);} }
function setTransStatus(t,err){ const el=$("#transStatus"); if(el){ el.textContent=t||""; el.style.color=err?"var(--bad)":""; } }

function renderVoices(){
  const wrap=$("#voiceLists"); if(!wrap) return;
  wrap.innerHTML="";
  const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  const ar = vs.filter(v=>v.lang && v.lang.toLowerCase().startsWith("ar"));
  const en = vs.filter(v=>v.lang && v.lang.toLowerCase().startsWith("en"));
  $("#noArabicVoice").classList.toggle("hidden", ar.length>0);
  const group=(title,list,sample)=>{
    if(!list.length) return;
    const h=document.createElement("div"); h.className="voice-group";
    const t=document.createElement("strong"); t.textContent=title+" ("+list.length+")"; h.appendChild(t);
    list.forEach(v=>{
      const row=document.createElement("div"); row.className="voice-row";
      const radio=document.createElement("input"); radio.type="radio"; radio.name="voicePick"; radio.checked=settings.voiceURI===v.voiceURI;
      radio.addEventListener("change",()=>{ settings.voiceURI=v.voiceURI; saveSettings(); setAudioStatus("اتحفظ الصوت: "+v.name); });
      const name=document.createElement("span"); name.className="vn"; name.textContent=v.name+" · "+v.lang;
      const test=document.createElement("button"); test.className="ghost"; test.textContent="جرّب";
      test.addEventListener("click",()=>{ stopSpeaking(); const u=new SpeechSynthesisUtterance(sample); u.voice=v; u.lang=v.lang; speechSynthesis.speak(u); });
      row.append(radio,name,test); h.appendChild(row);
    });
    wrap.appendChild(h);
  };
  group("الأصوات العربية", ar, "أهلاً بيك في كُتُبِي");
  group("الأصوات الإنجليزية", en, "Welcome to the Egyptian book translator");
  if(!vs.length){ const p=document.createElement("p"); p.className="hint"; p.textContent="الأصوات لسه بتتحمّل من الجهاز… افتح الصفحة تاني لو القايمة فاضية."; wrap.appendChild(p); }
}

/* ---------- عرض المكتبة ---------- */
/* سطر معلومات الكرت: نسب الترجمة والشرح + سطر خطة الإنهاء لو موجودة */
function cardInfoLine(book){
  const pcts = bookPercents(book);
  const d = document.createElement("div"); d.className = "hint";
  let txt = "🌐 مترجم " + pcts.trans + "٪ • 💡 مشروح " + pcts.expl + "٪";
  const plan = finishPlan(book);
  if(plan) txt += plan.done ? " · 🎯 خلّصت الكتاب 🎉" : plan.overdue ? " · 🎯 الخطة اتأخرت — عدّل التاريخ أو كمل على مهلك" : " · 🎯 هدفك " + plan.daily + " أجزاء في اليوم (فاضل " + plan.remaining + ")";
  d.textContent = txt;
  return d;
}
/* قايمة «⋯ المزيد» الموحّدة لكروت الكتب (مكتبة + ملفاتي): كل إجراء غير أساسي له بيت واحد هنا —
   شارك تقدمي | نقل لرفّ | 🎯 تاريخ إنهاء الكتاب | 🗑 حذف الكتاب.
   الكتاب المقفول بياخد نقل الرفّ والحذف بس (نفس صلاحياته قبل كده بالظبط) */
function buildCardMorePanel(book, opts){
  const locked = !!opts.locked;
  const panel = document.createElement("div"); panel.className = "card-more-panel hidden";
  if(!locked){
    const shr = document.createElement("button"); shr.className = "ghost"; shr.textContent = "📤 شارك تقدمي";
    shr.addEventListener("click", ()=>shareProgressCard(book));
    panel.appendChild(shr);
  }
  const srow = document.createElement("div"); srow.className = "row wrap";
  const slabel = document.createElement("label"); slabel.className = "shelf-label"; slabel.textContent = "نقل لرفّ: ";
  const ssel = document.createElement("select"); ssel.className = "shelf-select"; ssel.title = "انقل الكتاب لرف تاني — اختيارك بيوقف النقل التلقائي";
  Object.keys(SHELVES).forEach(k=>{ const o = document.createElement("option"); o.value = k; o.textContent = SHELVES[k]; if(book.shelf === k) o.selected = true; ssel.appendChild(o); });
  ssel.addEventListener("change", async ()=>{
    const prevShelf = book.shelf, prevManual = book.shelfManual;
    book.shelf = ssel.value; book.shelfManual = true;
    try{ await idbPut(book); }
    catch(e){ book.shelf = prevShelf; book.shelfManual = prevManual; ssel.value = prevShelf; logError("حفظ", e); appToast("حفظ نقل الرفّ فشل — جرّب تاني"); return; }
    if(opts.onShelf) opts.onShelf();
  });
  slabel.appendChild(ssel); srow.appendChild(slabel); panel.appendChild(srow);
  if(!locked){
    const frow = document.createElement("div"); frow.className = "row wrap";
    const flabel = document.createElement("label"); flabel.className = "shelf-label"; flabel.textContent = "🎯 تاريخ إنهاء الكتاب ";
    const fin = document.createElement("input"); fin.type = "date"; fin.className = "finish-input"; fin.value = book.finishBy || "";
    const fhint = document.createElement("span"); fhint.className = "hint";
    fin.addEventListener("change", async ()=>{
      const prevFinish = book.finishBy;
      book.finishBy = fin.value || "";
      ensureBookExtras(book);
      try{ await idbPut(book); }
      catch(e){ book.finishBy = prevFinish; fin.value = prevFinish || ""; logError("حفظ", e); fhint.textContent = "الحفظ فشل — جرّب تاني."; return; }
      const cb = currentBook(); if(cb && cb.id === book.id) renderReaderControls(cb);
      fhint.textContent = book.finishBy ? "اتحفظت الخطة ✔" : "اتشالت الخطة ✔";
    });
    flabel.appendChild(fin); frow.appendChild(flabel); frow.appendChild(fhint); panel.appendChild(frow);
  }
  const del = document.createElement("button"); del.className = "ghost danger-text"; del.textContent = "🗑 حذف الكتاب";
  del.addEventListener("click", async ()=>{
    if(!confirm("تحذف «" + book.title + "» وترجمته؟")) return;
    try{ await idbDel(book.id); await idbPdfDel(book.id); }
    catch(e){ logError("حذف", e); alert("حذف الكتاب فشل — جرّب تاني."); return; }
    books = books.filter(b=>b.id !== book.id); if(currentId === book.id) currentId = null; const lo = getLastOpen(); if(lo && lo.bookId === book.id) clearLastOpen(); if(opts.onDelete) opts.onDelete();
  });
  panel.appendChild(del);
  return panel;
}
/* صف أزرار الكرت الموحّد: أساسيين بس («📖 افتح» و«🌐 ترجم») + زرار «⋯ المزيد» بيفتح القايمة */
function buildCardActions(book, opts){
  const wrap = document.createElement("div");
  const row = document.createElement("div"); row.className = "row wrap";
  const open = document.createElement("button"); open.className = "primary"; open.textContent = "📖 افتح"; open.addEventListener("click", ()=>openBook(book.id));
  const trn = document.createElement("button"); trn.className = "ghost"; trn.textContent = "🌐 ترجم"; trn.addEventListener("click", ()=>openAndTranslate(book.id));
  const more = document.createElement("button"); more.className = "ghost more-btn"; more.textContent = "⋯ المزيد";
  const panel = buildCardMorePanel(book, opts);
  more.addEventListener("click", ()=>panel.classList.toggle("hidden"));
  row.append(open, trn, more); wrap.appendChild(row); wrap.appendChild(panel);
  return wrap;
}
let libSearchQuery = ""; /* بحث المكتبة النصي بالاسم — بيتركّب مع فلتر الرفوف، مش بيستبدله */
function renderLibrary(){
  renderLibSubStatus();
  $$("#shelfChips button").forEach(ch=>ch.classList.toggle("active", ch.dataset.filter===shelfFilter));
  const list=$("#bookList"); list.innerHTML="";
  $("#emptyLib").style.display = books.length? "none":"block";
  let shownCount=0;
  books.slice().sort((a,b)=>b.created-a.created).forEach(book=>{
    ensureBookExtras(book);
    if(shelfFilter!=="all" && book.shelf!==shelfFilter) return;
    if(libSearchQuery && (book.title || "").toLowerCase().indexOf(libSearchQuery) === -1) return;
    shownCount++;
    const p=progressOf(book);
    const card=document.createElement("div"); card.className="book-card";
    card.appendChild(bookCoverEl(book));
    const h=document.createElement("h3"); h.textContent=book.title; card.appendChild(h);
    const meta=document.createElement("div"); meta.className="hint"; meta.textContent="الأجزاء: "+p.total+" · اتترجم: "+p.done+" ("+p.pct+"%)"+((book.progress||0)>0?" · 📖 قريت "+book.progress+"٪":""); card.appendChild(meta);
    const bar=document.createElement("div"); bar.className="progress-wrap"; const inn=document.createElement("div"); inn.className="progress"; inn.style.width=p.pct+"%"; bar.appendChild(inn); card.appendChild(bar);
    card.appendChild(cardInfoLine(book));
    const locked=isBookLocked(book);
    if(locked){ const lk=document.createElement("div"); lk.className="lock-badge"; lk.textContent="🔒 مقفل — اشترك"; card.appendChild(lk); }
    if(book.ocr){ const ob=document.createElement("div"); ob.className="ocr-badge"; ob.textContent="📷 نص OCR"; ob.title="نص الكتاب ده اتعمل بتعرف ضوئي على صفحات مصوّرة"; card.appendChild(ob); }
    card.appendChild(buildCardActions(book, { locked:locked, onShelf:()=>{ if(shelfFilter!=="all") renderLibrary(); }, onDelete:()=>renderLibrary() }));
    list.appendChild(card);
  });
  const fe=$("#libFilterEmpty"); if(fe){ fe.textContent = libSearchQuery ? "مفيش كتب بالاسم ده" : "مفيش كتب على الرف ده لسه."; fe.classList.toggle("hidden", !(books.length && shownCount===0)); }
  renderResumeUI();
}

/* حالة القارئ الفاضية: مفيش كتاب حالي → بطاقة «لسه مفيش كتاب مفتوح» وكروم القارئ وبقايا أي كتاب قديم بتتخفي/تتمسح،
   وكارت القفل مبيظهرش إلا لكتاب موجود ومقفول فعلًا (عن طريق renderReader وكلاس reader-locked) */
function syncReaderEmpty(){
  const sec = $("#tab-reader"); if(!sec) return;
  const has = !!currentBook();
  sec.classList.toggle("reader-empty", !has);
  document.body.classList.toggle("reader-empty", !has); /* مرايا على body: درج القارئ وحبّته ساكنين في #overlay-root بره #tab-reader */
  if(has) return;
  sec.classList.remove("reader-locked");
  document.body.classList.remove("reader-locked");
  const bb = $("#readerBottomBar"); if(bb) bb.classList.add("hidden");
  const ch = $("#chunks"); if(ch) ch.innerHTML = "";
  pagerBookId = null; renderedUpTo = 0;
  const rt = $("#readerTitle"); if(rt) rt.textContent = "—";
  const rs = $("#readerSubtitle"); if(rs) rs.textContent = "";
}
/* ---------- القارئ ---------- */
let currentTabName = "home";
const tabHistory = [];
/* ---------- وضع التخطيط (موبايل/كمبيوتر): بيتحط على body[data-layout] وبيقود شريط تنقّل
   الموبايل المضغوط (٥ خانات) وشيت «المزيد» — CSS المتجاوب بيتبني عليه هو وعلى الاستعلامات المطابقة ---------- */
const layoutMQ = (typeof window !== "undefined" && window.matchMedia)
  ? window.matchMedia("(max-width: 700px)")
  : { matches:false, addEventListener:null, addListener:null };
function applyLayoutMode(){
  document.body.dataset.layout = layoutMQ.matches ? "mobile" : "desktop";
  syncMoreBtn();
}
/* خانات الشريط السريع في كل وضع — زرار «المزيد» بيتنشّط لما التبويب الحالي مش من خانات الشريط */
function syncMoreBtn(){
  const mb = $("#btnNavMore"); if(!mb) return;
  const barSlots = document.body.dataset.layout === "mobile"
    ? ["home","library","quick","glossary","freelib"]
    : ["home","library","reader","glossary","quick","files","install","settings","freelib"];
  mb.classList.toggle("active", barSlots.indexOf(currentTabName) === -1);
}
function switchTab(name, fromBack){
  if(name !== "admin") lockAdminGate(); /* سيبت تبويب الإدارة؟ قفل كلمة السر بيرجع ومحتوى الإدارة بيتمسح من الصفحة */
  if(name !== currentTabName){
    if(!fromBack && currentTabName) tabHistory.push(currentTabName);
    currentTabName = name;
  }
  $$(".tabbar button").forEach(b=>b.classList.toggle("active", b.dataset.tab===name));
  $$(".tab").forEach(s=>s.classList.toggle("active", s.id==="tab-"+name));
  document.body.classList.toggle("in-reader", name==="reader");
  /* [D-04] بره القارئ: اقفل نوافذ القارئ العائمة وشيل مرايا كلاسات الكروم من body */
  if(name!=="reader"){ document.body.classList.remove("chrome-off","chrome-scroll-hidden"); const ws=$("#wordSheet"); if(ws) ws.classList.add("hidden"); const spx=$("#selPopup"); if(spx) spx.classList.add("hidden"); }
  syncMoreBtn();
  if(name==="home"){ renderLibSubStatus(); deferIdle(()=>renderHomeStats()); } /* الإحصائيات مش حرجة: بتترسم في وقت الخمول */
  if(name==="glossary") renderGlossary();
  if(name==="quick"){ const qs=$("#quickTargetSel"); if(qs) fillTargetSelect(qs, settings.targetLang, false); syncQuickStyle(true); }
  if(name==="settings") renderPermStatus();
  if(name==="files") renderFiles();
  if(name==="admin") renderAdmin();
  if(name==="reader"){ const b=currentBook(); if(b){ renderReader(b); } syncReaderEmpty(); }
  renderResumeUI();
  syncProgressBarVisibility();
  updateRulerVisibility();
  window.scrollTo(0,0);
}
function navBack(){
  if(currentTabName === "reader"){ switchTab("library", true); return; }
  while(tabHistory.length){
    const prev = tabHistory.pop();
    if(prev && prev !== currentTabName){ switchTab(prev, true); return; }
  }
  if(currentTabName !== "library") switchTab("library", true);
}

/* ---------- تبويب ملفاتي ---------- */
async function renderFiles(){
  const list = $("#filesList"); if(!list) return;
  list.innerHTML = "";
  const ef = $("#emptyFiles"); if(ef) ef.style.display = books.length ? "none" : "block";
  books.slice().sort((a,b)=>b.created-a.created).forEach(book=>{
    const p = progressOf(book);
    const card = document.createElement("div"); card.className = "book-card";
    card.appendChild(bookCoverEl(book));
    const h = document.createElement("h3"); h.textContent = book.title; card.appendChild(h);
    const meta = document.createElement("div"); meta.className = "hint";
    meta.textContent = "الأجزاء: " + p.total + " · اتترجم: " + p.done + " (" + p.pct + "%)" + ((book.progress||0)>0 ? " · 📖 قريت " + book.progress + "٪" : ""); card.appendChild(meta);
    card.appendChild(cardInfoLine(book));
    const locked = isBookLocked(book);
    if(locked){ const lk = document.createElement("div"); lk.className = "lock-badge"; lk.textContent = "🔒 مقفل — اشترك"; card.appendChild(lk); }
    if(book.ocr){ const ob = document.createElement("div"); ob.className = "ocr-badge"; ob.textContent = "📷 نص OCR"; ob.title = "نص الكتاب ده اتعمل بتعرف ضوئي على صفحات مصوّرة"; card.appendChild(ob); }
    card.appendChild(buildCardActions(book, { locked:locked, onDelete:()=>{ renderFiles(); renderLibrary(); } }));
    list.appendChild(card);
  });
  const si = $("#storageInfo");
  if(si){
    if(navigator.storage && navigator.storage.estimate){
      try{ const est = await navigator.storage.estimate(); si.textContent = "مساحة التخزين المستخدمة: ~" + ((est.usage || 0) / (1024 * 1024)).toFixed(1) + " MB"; }
      catch(e){ si.textContent = ""; }
    } else si.textContent = "";
  }
}

/* ---------- 🧠 اختبرني: اختبار اختيار من متعدد من محتوى الكتاب نفسه ----------
   الأسئلة بتتحفظ في الكتاب (book.quiz) فالدخول تاني مش بيكلّف API — «أسئلة جديدة» بس هي اللي بتولّد من جديد */
const QUIZ_SYS = "انت معلّم مصري بيحط أسئلة اختبار من محتوى كتاب. الأسئلة باللهجة المصرية البسيطة، واضحة وقصيرة، وإجاباتها موجودة في المحتوى اللي هيوصلك بس.";
let quizSession = null; /* {book, qs, idx, score, answered} */
async function startQuiz(book, fresh){
  if(!book || isBookLocked(book)) return;
  ensureBookExtras(book);
  const ov = $("#quizOverlay"); if(!ov) return;
  ov.classList.remove("hidden");
  const best = $("#quizBestLine"); if(best) best.textContent = book.quizBest ? "أحسن نتيجة قبل كده: " + book.quizBest + "/5 🏆" : "";
  const body = $("#quizBody"); if(!body) return;
  if(!fresh && book.quiz && book.quiz.length >= 3){ quizSession = {book:book, qs:book.quiz, idx:0, score:0, answered:false}; renderQuizQ(); return; }
  if(!hasKey()){ quizSession = null; body.innerHTML = '<p class="hint">الاختبار بيحتاج مفتاح API — ضيفه من تبويب الإعدادات</p>'; return; }
  const sample = sampleQuizChunks(book, 6);
  if(!sample.length){ quizSession = null; body.innerHTML = '<p class="hint">لسه مفيش محتوى كفاية في الكتاب للاختبار — ضيف أو ترجم أجزاء الأول.</p>'; return; }
  body.innerHTML = '<p class="hint">بيجهّز الأسئلة من الكتاب…</p>';
  try{
    const src = sample.map(x=>((x.c.trans && x.c.trans.trim()) ? x.c.trans : x.c.orig)).join("\n---\n").slice(0, 7000);
    const raw = await aiChat(QUIZ_SYS, "من المحتوى التالي اعمل 5 أسئلة اختيار من متعدد بالمصري. رجّع JSON بس بالشكل ده: [{\"q\":\"السؤال بالمصري\",\"options\":[\"اختيار ١\",\"اختيار ٢\",\"اختيار ٣\",\"اختيار ٤\"],\"answer\":0,\"why\":\"شرح سطر واحد بالمصري ليه دي الإجابة الصح\"}] — answer هو رقم الاختيار الصح (0 لحد 3). الأسئلة من المحتوى بس ومن غير أي معلومات خارجية.\n\nالمحتوى:\n" + src, 0.4, undefined, {maxTokens: 3000});
    const qs = parseQuizQuestions(raw);
    if(qs.length < 3){ body.innerHTML = '<p class="hint">الأسئلة ماطلعتش سليمة — جرّب «أسئلة جديدة».</p>'; return; }
    book.quiz = qs; await idbPut(book);
    quizSession = {book:book, qs:qs, idx:0, score:0, answered:false};
    renderQuizQ();
  }catch(e){ body.innerHTML = '<p class="hint">الاختبار وقف: ' + esc(e.message) + '</p>'; }
}
function closeQuiz(){ const ov = $("#quizOverlay"); if(ov) ov.classList.add("hidden"); quizSession = null; }
function renderQuizQ(){
  const body = $("#quizBody"); if(!body || !quizSession) return;
  const s = quizSession, q = s.qs[s.idx];
  body.innerHTML = "";
  const head = document.createElement("p"); head.className = "hint"; head.textContent = "سؤال " + (s.idx + 1) + " من " + s.qs.length + " · نتيجتك لحد دلوقتي: " + s.score; body.appendChild(head);
  const qt = document.createElement("h3"); qt.textContent = q.q; body.appendChild(qt);
  q.options.forEach((opt, oi)=>{
    const b = document.createElement("button"); b.className = "ghost quiz-opt"; b.textContent = opt;
    b.addEventListener("click", ()=>answerQuizOpt(oi));
    body.appendChild(b);
  });
  const fb = document.createElement("p"); fb.id = "quizFeedback"; fb.className = "hint"; body.appendChild(fb);
}
function answerQuizOpt(oi){
  const s = quizSession; if(!s || s.answered) return;
  s.answered = true;
  const q = s.qs[s.idx];
  const right = oi === q.answer; /* الصح بيبان بس بعد الإجابة */
  if(right) s.score++;
  const body = $("#quizBody"); if(!body) return;
  Array.from(body.querySelectorAll(".quiz-opt")).forEach((b, bi)=>{
    b.disabled = true;
    if(bi === q.answer) b.classList.add("quiz-right");
    else if(bi === oi) b.classList.add("quiz-wrong");
  });
  const fb = $("#quizFeedback");
  if(fb) fb.textContent = (right ? "✔ صح! " : "✖ غلط — الصح: «" + q.options[q.answer] + "». ") + (q.why || "");
  const nb = document.createElement("button"); nb.className = "primary"; nb.textContent = s.idx + 1 >= s.qs.length ? "شوف النتيجة" : "السؤال اللي بعده ←";
  nb.addEventListener("click", async ()=>{
    s.idx++; s.answered = false;
    if(s.idx >= s.qs.length) await finishQuizSession(); else renderQuizQ();
  });
  body.appendChild(nb);
}
async function finishQuizSession(){
  const s = quizSession; if(!s) return;
  if(s.score > (s.book.quizBest || 0)){ s.book.quizBest = s.score; try{ await idbPut(s.book); }catch(e){ logError("حفظ", e); } } /* فشل حفظ أحسن نتيجة مبيمنعش شاشة النتيجة */
  const body = $("#quizBody");
  if(body) body.innerHTML = '<h3>خلص الاختبار 🎉</h3><p>نتيجتك: <strong>' + s.score + " من " + s.qs.length + '</strong></p><p class="hint">أحسن نتيجة: ' + s.book.quizBest + '/5 — دوس «أسئلة جديدة» لو عاوز جولة تانية بأسئلة مختلفة.</p>';
  const cb = currentBook(); if(cb && cb.id === s.book.id) renderReaderControls(cb);
  quizSession = null;
}

/* ---------- دوسة كلمة: معنى أي كلمة إنجليزية في النص الأصلي ----------
   ترتيب الحل: قاموس الكتاب → القاموس الشخصي → (مفتاح: ذكاء اصطناعي | من غير مفتاح: MyMemory لكلمة واحدة) —
   والنتيجة المدفوعة بتتحفظ في القاموس الشخصي عشان متتطلبش تاني */
let sheetWord = null; /* {word, translation, meaning} */
async function wordFetchAI(word){
  const r = await quickTranslate(word, "ar-EG");
  if(!r) return null;
  return {translation:r.translation || "", meaning:[r.meaning, r.usage].filter(Boolean).join(" — ")};
}
async function wordFetchMM(word){
  const t = await myMemory(word, "ar-EG");
  return {translation:t || "", meaning:"(ترجمة آلية أساسية — المعنى التفصيلي بييجي مع المفتاح الذكي)"};
}
async function resolveWordMeaning(book, word){
  const w = String(word || "").trim(); if(!w) return null;
  const key = w.toLowerCase();
  const g = bookGlossaryUnique(book).find(x=>String(x.english || "").toLowerCase() === key);
  if(g) return {translation:g.arabic || "", meaning:g.explanation || "", source:"book"};
  const mine = savedWords.find(x=>String(x.english || "").toLowerCase() === key);
  if(mine) return {translation:mine.arabic || "", meaning:mine.explanation || "", source:"mine"};
  const got = hasKey() ? await wordFetchAI(w) : await wordFetchMM(w);
  if(got && got.translation){ saveWordToPersonal(w, got.translation, got.meaning); return {translation:got.translation, meaning:got.meaning || "", source:"ai"}; }
  return got ? {translation:got.translation || "", meaning:got.meaning || "", source:"ai"} : null;
}
function saveWordToPersonal(word, translation, meaning){
  const key = String(word || "").toLowerCase();
  if(!key || savedWords.some(x=>String(x.english || "").toLowerCase() === key)) return;
  savedWords.push({english:word, arabic:translation || "", explanation:meaning || ""});
  saveWordsStore(); renderGlossary();
}
function openWordSheet(book, word){
  const sh = $("#wordSheet"); if(!sh) return;
  const sp = $("#selPopup"); if(sp) sp.classList.add("hidden"); /* [D-04] واجهة واحدة بس في المرة — اقفل شريط التحديد */
  sheetWord = {word:word, translation:"", meaning:""};
  $("#wordTitle").textContent = word;
  const body = $("#wordBody"); body.textContent = "بيجيب المعنى…";
  sh.classList.remove("hidden");
  resolveWordMeaning(book, word).then(res=>{
    if(!sheetWord || sheetWord.word !== word) return;
    if(!res){ body.textContent = "معرفتش أجيب معنى الكلمة دي دلوقتي — جرّب تاني."; return; }
    sheetWord.translation = res.translation; sheetWord.meaning = res.meaning;
    body.textContent = (res.translation || "") + (res.meaning ? " — " + res.meaning : "") + (res.source === "book" ? " (من قاموس الكتاب)" : "");
  }).catch(e=>{ if(sheetWord && sheetWord.word === word) body.textContent = "المعنى وقف: " + e.message; });
}
function closeWordSheet(){ const sh = $("#wordSheet"); if(sh) sh.classList.add("hidden"); sheetWord = null; }
function speakSheetWord(){
  if(!sheetWord || !("speechSynthesis" in window)) return;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(sheetWord.word);
  const v = pickVoice("en"); if(v){ u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
  speechSynthesis.speak(u);
}
function saveSheetWord(){
  if(!sheetWord) return;
  saveWordToPersonal(sheetWord.word, sheetWord.translation, sheetWord.meaning);
  setTransStatus("اتحفظت «" + sheetWord.word + "» في قاموسك ✔");
  closeWordSheet();
}

/* ---------- 📤 كارت مشاركة التقدم: صورة 1080×1080 بثيم بني دافي — البيانات اللي فيها عنوان الكتاب ونسبه بس ---------- */
function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines){
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "", lines = 0;
  for(const w of words){
    const test = line ? line + " " + w : w;
    if(ctx.measureText(test).width > maxWidth && line){ ctx.fillText(line, x, y); y += lineHeight; lines++; line = w; if(lines >= maxLines) return y; }
    else line = test;
  }
  if(line && lines < maxLines){ ctx.fillText(line, x, y); y += lineHeight; }
  return y;
}
/* شعار المالك (Don Eslam) — بيتحمّل مرة واحدة وبيتعاد استخدامه في بصمة صور المشاركة */
let ownerLogoPromise = null;
function loadOwnerLogo(){
  if(ownerLogoPromise) return ownerLogoPromise;
  ownerLogoPromise = new Promise((res)=>{
    try{
      const img = new Image();
      img.onload = ()=>res(img);
      img.onerror = ()=>res(null);
      img.src = "icons/owner-logo.jpg";
    }catch(e){ res(null); }
  });
  return ownerLogoPromise;
}
async function shareProgressCard(book){
  if(!book) return;
  ensureBookExtras(book);
  const pcts = bookPercents(book);
  const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1080;
  const ctx = cv.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 1080);
  grad.addColorStop(0, "#8a5a2b"); grad.addColorStop(1, "#5d3a17");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = "rgba(255,235,200,.55)"; ctx.lineWidth = 6; ctx.strokeRect(36, 36, 1008, 1008);
  ctx.fillStyle = "#ffe9c4"; ctx.textAlign = "center";
  ctx.font = "bold 64px Tahoma, Arial, sans-serif";
  ctx.fillText("📚 تقدّمي في القراءة", 540, 170);
  ctx.font = "bold 56px Tahoma, Arial, sans-serif";
  wrapCanvasText(ctx, "«" + book.title + "»", 540, 300, 880, 76, 3);
  [["📖 قريت", pcts.read], ["🌐 اتترجم", pcts.trans], ["💡 اتشرح", pcts.expl]].forEach((s, k)=>{
    const y = 520 + k * 130;
    ctx.font = "bold 52px Tahoma, Arial, sans-serif"; ctx.fillStyle = "#ffe9c4"; ctx.textAlign = "right";
    ctx.fillText(s[0], 830, y);
    ctx.textAlign = "left"; ctx.fillText(s[1] + "٪", 250, y);
    ctx.fillStyle = "rgba(255,233,196,.25)"; ctx.fillRect(190, y + 24, 700, 26);
    ctx.fillStyle = "#ffcf7d"; ctx.fillRect(190 + Math.round(700 * (1 - s[1] / 100)), y + 24, Math.round(700 * s[1] / 100), 26);
  });
  ctx.fillStyle = "#ffe9c4"; ctx.textAlign = "center";
  ctx.font = "bold 50px Tahoma, Arial, sans-serif";
  ctx.fillText("كُتُبِي — Don Eslam", 540, 960);
  ctx.font = "36px Tahoma, Arial, sans-serif";
  ctx.fillText("كتب العالم.. بالمصري", 540, 1018);
  /* [v25] بصمة المالك على الصورة اللي هتسافر برّه التطبيق: الشعار مصغّر في الركن — أي فشل في تحميله ميوقفش المشاركة */
  try{
    const logoImg = await loadOwnerLogo();
    if(logoImg) ctx.drawImage(logoImg, 896, 886, 118, 118);
  }catch(e){}
  const blob = await new Promise(r=>cv.toBlob(r, "image/png"));
  if(!blob){ setTransStatus("مقدرتش أعمل صورة المشاركة على الجهاز ده", true); return; }
  if(navigator.canShare){
    try{
      const f = new File([blob], "kotobgy-progress.png", {type:"image/png"});
      if(navigator.canShare({files:[f]})){ await navigator.share({files:[f], title:"تقدّمي في «" + book.title + "»"}); return; }
    }catch(e){ if(e && e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "kotobgy-progress.png"; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  setTransStatus("اتنزّلت صورة تقدمك ✔ شاركها في أي مكان");
}

async function openBook(id, atChunk){
  currentId=id; const b=currentBook(); if(!b) return;
  if(!b.targetLang){ b.targetLang = settings.targetLang || "ar-EG"; await idbPut(b); } /* لغة ترجمة الكتاب بتتهيأ من الإعدادات أول مرة يتفتح */
  if(snapshotOrigIfNeeded(b)) await idbPut(b); /* كتاب قديم معندوش نسخة أصلية محفوظة: نقطة الرجوع = النص الأصلي المحفوظ حاليًا زي ما هو — بتتاخد أول ما الكتاب يتفتح، قبل أي تعديل، فزرار الاسترجاع وكل أدوات التعديل بتشتغل للكتب القديمة زي الجديدة */
  await refreshSub();
  switchTab("reader"); /* switchTab بيرسم القارئ بنفسه للكتاب الحالي — رسم إضافي هنا كان بيكرر بناء كل الأجزاء على الفاضي */
  const lo=getLastOpen();
  let idx = (typeof atChunk==="number") ? atChunk : (lo && lo.bookId===id ? (lo.chunkIndex||0) : 0);
  if(idx<0 || idx>=b.chunks.length) idx=0;
  saveLastOpen(id, idx);
  if(isBookLocked(b)) return; /* كتاب مقفول: شاشة القفل بس، من غير ترجمة تلقائية */
  updateReadProgress(b, idx);
  if(idx>0){ ensureChunksRendered(b, idx); const el=document.getElementById("chunk-"+idx); if(el) setTimeout(()=>el.scrollIntoView({block:"start"}), 80); }
  /* الفتح قراءة بس: مفيش أي ترجمة بتبدأ من هنا — الترجمة بتبدأ من زرار «ترجم» صراحة بس (في القارئ أو في كرت الكتاب) */
}
/* زرار «ترجم» في كروت المكتبة وملفاتي: فتح الكتاب + بدء الترجمة — بيعدي على نفس طريق زرار القارئ بالظبط (startTranslateForBook)
   فتأكيد الكتاب العربي ونقطة تفعيل زرار الإيقاف بيشتغلوا هنا كمان. الكتاب المقفول بيقف عند شاشة القفل من غير ترجمة */
async function openAndTranslate(id){
  await openBook(id);
  const b = currentBook();
  if(!b || b.id !== id || isBookLocked(b)) return;
  startTranslateForBook(b);
}
/* قفزة لجزء معيّن: حفظ الموضع + تحديث التقدم + رسم الصفحة لو لسه مترسمتش + تمرير — بتستخدمها الأسهم والسكرولر والفهرس */
function goToChunk(b, target){
  if(!b || !b.chunks || !b.chunks.length) return;
  target = Math.max(0, Math.min(b.chunks.length - 1, target));
  saveLastOpen(b.id, target);
  updateReadProgress(b, target);
  ensureChunksRendered(b, target);
  const el = document.getElementById("chunk-" + target);
  if(el) el.scrollIntoView({block:"start"});
}
/* تنقّل بين الأجزاء بأسهم لوحة المفاتيح (كمبيوتر): الاتجاه بالمنطق العربي — الشمال = اللي بعده */
function jumpChunkReader(dir){
  const b = currentBook(); if(!b || isBookLocked(b) || !b.chunks || !b.chunks.length) return;
  if(currentTabName !== "reader") return;
  const lo = getLastOpen();
  const cur = (lo && lo.bookId === b.id) ? (lo.chunkIndex || 0) : 0;
  const target = Math.min(b.chunks.length - 1, Math.max(0, cur + dir));
  if(target === cur) return;
  goToChunk(b, target);
}
/* ---------- كروم القارئ الجديد: لوحات سفلية (مظهر/صوت) + قائمة أدوات + درج فهرس + خلفية إغلاق ---------- */
function showBackdrop(on){ const b = $("#sheetBackdrop"); if(b) b.classList.toggle("hidden", !on); }
function closeReaderPanels(){
  ["#appearanceCard","#voiceCard"].forEach(s=>{ const el = $(s); if(el) el.classList.remove("sheet-open"); });
  const rd = $("#readerDrawer"); if(rd) rd.classList.remove("open");
  const ic = $("#indexCard"); if(ic) ic.classList.remove("drawer-open");
  showBackdrop(false);
}
/* درج أدوات القراءة: شريط الإجراءات وأدوات الكتاب بقوا جوّه درج جانبي واحد — القراءة صافية من غير أزرار فوق النص */
function openReaderDrawer(){
  closeReaderPanels();
  const rd = $("#readerDrawer"); if(rd) rd.classList.add("open");
  showBackdrop(true);
}
function openSheet(which){
  closeReaderPanels();
  if(which === "appearance"){ const c = $("#appearanceCard"); if(c) c.classList.add("sheet-open"); const b = $("#appearanceBody"); if(b) b.classList.remove("hidden"); }
  else { const c = $("#voiceCard"); if(c) c.classList.add("sheet-open"); const b = $("#voiceBody"); if(b) b.classList.remove("hidden"); }
  showBackdrop(true);
}
function openIndexDrawer(){
  closeReaderPanels();
  const ic = $("#indexCard"); if(ic) ic.classList.add("drawer-open");
  const p = $("#indexPanel"); if(p){ p.classList.remove("hidden"); renderIndexPanel(); }
  showBackdrop(true);
}
/* ---------- شيت «المزيد»: فهرس كامل بأقسام التطبيق كلها، على الموبايل والكمبيوتر بنفس الشكل.
   الشريط هو الشريط السريع والشيت هو الدليل الكامل — الازدواج بينهما مقصود هنا بس ---------- */
const MORE_DESTS = [
  { tab:"home",     icon:"🏠", label:"الرئيسية" },
  { tab:"library",  icon:"📚", label:"المكتبة" },
  { tab:"reader",   icon:"📖", label:"القارئ", reader:true },
  { tab:"glossary", icon:"📖", label:"القاموس" },
  { tab:"quick",    icon:"⚡", label:"مترجم سريع" },
  { tab:"files",    icon:"📁", label:"ملفاتي" },
  { tab:"install",  icon:"⬇", label:"التثبيت" },
  { tab:"settings", icon:"⚙", label:"الإعدادات" },
  { tab:"admin",    icon:"🛠", label:"الإدارة", admin:true }
];
/* صف الإدارة بيظهر في الفهرس بنفس قاعدة ظهور مدخل الإدارة المعتاد (زرار الهيدر) */
function adminEntryVisible(){
  const b = $("#btnNavAdmin"); if(!b) return false;
  if(b.classList.contains("hidden")) return false;
  try{ return getComputedStyle(b).display !== "none"; }catch(e){ return true; }
}
const MORE_GROUP_OF = { home:"التنقل", library:"التنقل", reader:"التنقل", glossary:"التنقل", quick:"التنقل", files:"مكتبتي", install:"التطبيق", settings:"التطبيق", admin:"التطبيق" };
/* [R5] الترجمة والعرض جوه قايمة المزيد: نسخ متزامنة بتنادي على الأصل (الأصل ما بيتغيرش) */
function syncMoreTrans(){
  const box = document.getElementById("moreTransTools"); if(!box) return;
  const tls = document.getElementById("targetLangSel"), tss = document.getElementById("tStyleSel");
  const mls = document.getElementById("moreTargetLangSel"), mss = document.getElementById("moreTStyleSel");
  if(!box._wired){
    box._wired = true;
    if(mls && tls) mls.addEventListener("change", ()=>{ tls.value = mls.value; tls.dispatchEvent(new Event("change", { bubbles:true })); setTimeout(()=>{ mls.value = tls.value; }, 400); });
    if(mss && tss) mss.addEventListener("change", ()=>{ tss.value = mss.value; tss.dispatchEvent(new Event("change", { bubbles:true })); });
    box.addEventListener("click", (e)=>{ const b = e.target.closest("[data-tproxy]"); if(!b) return; const t = document.getElementById(b.dataset.tproxy); if(!t || t.disabled) return; closeMoreSheet(); t.click(); });
  }
  if(mls && tls){ mls.innerHTML = tls.innerHTML; mls.value = tls.value; mls.disabled = !!tls.disabled; }
  if(mss && tss){ mss.innerHTML = tss.innerHTML; mss.value = tss.value; mss.disabled = !!tss.disabled; }
  const sw = document.getElementById("tStyleWrap"), mw = document.getElementById("moreStyleWrap");
  if(mw) mw.classList.toggle("hidden", !!(sw && (sw.classList.contains("hidden") || getComputedStyle(sw).display === "none")));
  const vb = document.getElementById("readViewBar"), vl = document.getElementById("moreViewList");
  if(vb && vl){
    vl.innerHTML = "";
    vb.querySelectorAll("button").forEach((ob)=>{
      const label = (ob.textContent || "").replace(/\s+/g, " ").trim(); if(!label) return;
      const row = document.createElement("button"); row.type = "button"; row.className = "more-row";
      const sp = document.createElement("span"); sp.textContent = label; row.appendChild(sp);
      if(ob.classList.contains("primary") || ob.getAttribute("aria-pressed") === "true") row.classList.add("active");
      if(ob.disabled) row.disabled = true;
      row.addEventListener("click", ()=>{ closeMoreSheet(); ob.click(); });
      vl.appendChild(row);
    });
  }
  box.querySelectorAll("[data-tproxy]").forEach((b)=>{ const t = document.getElementById(b.dataset.tproxy); b.disabled = !!(t && t.disabled); });
}

function renderMoreSheet(){
  const list = $("#moreSheetList"); if(!list) return;
  list.innerHTML = "";
  const open = (typeof currentBook === "function") ? currentBook() : null;
  let lastG = "";
  MORE_DESTS.forEach(d=>{
    if(d.admin && !adminEntryVisible()) return;
    const g = MORE_GROUP_OF[d.tab]; if(g && g !== lastG){ const h = document.createElement("div"); h.className = "more-group"; h.textContent = g; list.appendChild(h); lastG = g; }
    const row = document.createElement("button");
    row.type = "button"; row.className = "more-row";
    let gotoTab = d.tab, sub = "";
    if(d.reader){
      if(open){ sub = open.title || ""; }
      else { sub = "افتح كتابًا أولًا"; gotoTab = "library"; }
    }
    row.dataset.goto = gotoTab;
    if(currentTabName === d.tab) row.classList.add("active");
    const ic = document.createElement("span"); ic.className = "mi"; ic.textContent = d.icon; row.appendChild(ic);
    const tx = document.createElement("span"); tx.className = "mt";
    const lb = document.createElement("span"); lb.className = "ml"; lb.textContent = d.label; tx.appendChild(lb);
    if(sub){ const sb = document.createElement("span"); sb.className = "ms"; sb.textContent = sub; tx.appendChild(sb); }
    row.appendChild(tx);
    if(d.admin){ const bd = document.createElement("span"); bd.className = "more-badge"; bd.textContent = "🔐"; bd.title = "محمية بكلمة سر الإدارة"; row.appendChild(bd); }
    row.addEventListener("click", ()=>{ closeMoreSheet(); switchTab(gotoTab); });
    list.appendChild(row);
  });
  try{ syncMoreTrans(); }catch(e){}
}
function openMoreSheet(){
  closeReaderPanels();
  renderMoreSheet();
  const s = $("#moreSheet"); if(s) s.classList.add("sheet-open");
  showBackdrop(true);
}
function closeMoreSheet(){
  const s = $("#moreSheet"); if(s) s.classList.remove("sheet-open");
  /* الخلفية بتفضل لو أي لوحة قارئ لسه مفتوحة — غير كده بتتقفل */
  const anyReaderPanel = $("#appearanceCard.sheet-open, #voiceCard.sheet-open, #indexCard.drawer-open");
  if(!anyReaderPanel) showBackdrop(false);
}
/* تغيير حجم خط القراءة من كارت المظهر — نفس الإعداد ونفس العرض */
function changeFontSize(d){
  settings.font = Math.max(13, Math.min(24, (settings.font || 17) + d));
  saveSettings();
  document.documentElement.style.setProperty("--fs", settings.font + "px");
  const fv = $("#fontSizeVal"); if(fv) fv.textContent = settings.font;
}
/* ثيمات القراءة الأربعة: تعيين واحد بيستخدمه السواتش والثيم السريع في شريط التحكم */
const THEME_ORDER = ["light", "sepia", "dark", "black"];
function setTheme(val){
  settings.theme = val; saveSettings(); applyAppearance(); syncAppearanceControls(); syncThemeCycleBtn();
}
function syncThemeCycleBtn(){
  const b = $("#btnBarTheme"); if(!b) return;
  const names = { light:"فاتح", sepia:"بيج ورقي", dark:"ليلي", black:"أسود" };
  const s = b.querySelector("span"); if(s) s.textContent = "الثيم: " + (names[settings.theme] || "فاتح");
  b.firstChild.textContent = (settings.theme === "dark" || settings.theme === "black") ? "☀️" : "🌙";
}
/* غلاف مولّد لبطاقة الكتاب: لون من اسم الكتاب + عنوانه — من غير أي صور خارجية */
function bookHue(title){ let h = 0; const s = String(title || ""); for(let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
function bookCoverEl(book){
  const cov = document.createElement("div"); cov.className = "book-cover";
  cov.style.setProperty("--hue", bookHue(book.title));
  const t = document.createElement("span"); t.className = "cover-title"; t.textContent = book.title;
  cov.appendChild(t);
  return cov;
}
/* قراية بايتات ملف من الجهاز: arrayBuffer هو الطريق الأساسي وFileReader هو الاحتياطي —
   منتقي ملفات أندرويد (خصوصًا ملفات جاية من Drive) ممكن يرفض الطريق الأول على بعض الأجهزة */
async function readFileBuffer(f){
  try{ return await f.arrayBuffer(); }
  catch(e){
    return await new Promise((res, rej)=>{
      const r = new FileReader();
      r.onload = ()=>res(r.result);
      r.onerror = ()=>rej(r.error || new Error("تعذّرت قراية الملف من الجهاز."));
      try{ r.readAsArrayBuffer(f); }catch(e2){ rej(e2); }
    });
  }
}
/* قراءة ملف بمهلة: كل مرحلة async محتاجة مهلة وحالة خطأ (القاعدة ٢٢). */
async function readFileWithTimeout(f, ms){
  let t; const timeout = new Promise((_, rej)=>{ t = setTimeout(()=>rej(new Error("مهلة قراية الملف انتهت ("+Math.round(ms/1000)+" ثانية).")), ms); });
  try{ return await Promise.race([readFileBuffer(f), timeout]); }
  finally{ clearTimeout(t); }
}
/* تحويل نص HTML إلى نص عادي معkeeping فواصل الفقرات — لا تُنفّذ السكربتات ولا تُحقن في الصفحة.
   دالة نقيّة لا تعتمد على DOMParser ولا على أي مكتبة خارجية. */
function stripHtmlToText(html){
  let s = String(html === null || html === undefined ? '' : html);
  /* إزالة سكربتات وأنماط ونوسكريبت مع محتواها */
  s = s.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
  /* إزالة تعليقات HTML */
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  /* تحويل أقفال علامات المستوى البلوكي إلى أسطر جديدة */
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|th|td|pre|blockquote|section|article|header|footer|nav|aside|main|figure|details|summary|dd|dt|table|thead|tbody|tfoot|ul|ol|center|address|fieldset|legend|caption|datalist|option|optgroup)\s*>/gi, '\n');
  /* فواصل سطر صريحة */
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<hr\s*\/?>/gi, '\n');
  /* إزالة كل العلامات الباقية */
  s = s.replace(/<[^>]+>/g, ' ');
  /* فك ترميز الكيانات المسمّاة */
  const ent = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",'#39':"'",nbsp:' '};
  s = s.replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/gi, (m,k)=>Object.prototype.hasOwnProperty.call(ent,k.toLowerCase())?ent[k.toLowerCase()]:m);
  /* الكيانات الرقمية عشرية وسداسية */
  s = s.replace(/&#(\d+);/g, (m,n)=>String.fromCharCode(parseInt(n,10)));
  s = s.replace(/&#x([0-9a-fA-F]+);/gi, (m,h)=>String.fromCharCode(parseInt(h,16)));
  /* ضغط المسافات مع الحفاظ على الأسطر */
  return s.replace(/[ \t\r\f\v]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
/* استيراد ملف كتاب (PDF بيستخرج نصه / نصي زي ما هو) — نفس مسار زرار «ضيف من الملف» وبيستخدمه كمان هدف المشاركة.
   بعد الاستيراد الكتاب بيتفتح في القارئ على طول: المستخدم اختار الكتاب عشان يقراه مش عشان يدور عليه في المكتبة */
async function importBookFile(f){
  /* ملف Google Docs الأصلي مش ملف حقيقي (مفيهوش بايتات كتاب) — بنوقفه قبل أي قراية وبنوجّه المستخدم للنسخة المنزّلة */
  if(f.type && f.type.indexOf("application/vnd.google-apps") === 0) throw new Error("الملف ده بصيغة Google Docs الأصلية ومش ملف حقيقي — افتحه في Drive واعمل تنزيل (Download) بصيغة PDF أو TXT وبعدين اختر النسخة المنزّلة");
  showTabMsg("#addMsg", "بيقرا الملف…");
  const MAX_BYTES = 5 * 1024 * 1024; /* 5 ميجابايت حد أقصى للملفات النصية */
  if(f.size > MAX_BYTES && !(f.type === "application/pdf" || /\.pdf$/i.test(f.name))) throw new Error("الملف كبير جداً ("+Math.round(f.size/1024/1024)+" ميجابايت). الحد الأقصى 5 ميجابايت.");
  const buf = await readFileWithTimeout(f, 20000);
  let text = "";
  let encoding = "utf-8";
  let ocrMeta = null;
  let pdfOpts = null;
  const title = $("#bookTitle").value.trim() || f.name.replace(/\.(txt|pdf|md|html|htm)$/i, "");
  const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  const pdfBlob = isPdf ? new Blob([buf], {type: "application/pdf"}) : null; /* [T3.4a] copy the bytes BEFORE pdf.js empties buf */
  const isHtml = /\.(html|htm)$/i.test(f.name) || f.type === "text/html";
  if(isPdf){
    /* [v25] الـ PDF النصي بيعدي زي ما هو، والمصوّر (صور من غير نص) بيتحوّل تلقائيًا لمسار التعرف الضوئي */
    const r = await extractPDFWithOCR(buf, title);
    text = r.text; ocrMeta = r.ocr;
    pdfOpts = {pages: r.pages, pageCount: r.pageCount};
  }
  else if(isHtml){
    /* نص HTML خالص: تُزال السكربتات والأنماط ولا يُنفّذ أي شيء ولا يُحقن في الصفحة */
    try{ text = new TextDecoder("utf-8", {fatal:true}).decode(buf); }
    catch(e){ text = new TextDecoder("windows-1256").decode(buf); encoding = "windows-1256"; }
    text = stripHtmlToText(text);
  }
  else {
    try{ text = new TextDecoder("utf-8", {fatal:true}).decode(buf); }
    catch(e){ text = new TextDecoder("windows-1256").decode(buf); encoding = "windows-1256"; }
  }
  if(!text || !text.trim()) throw new Error("الملف فارغ أو لا يحتوي نصاً قابلاً للقراية.");
  const b = await addBook(title, text, "file", pdfOpts);
  let pdfNote = "";
  if(pdfBlob){ try{ pdfNote = await savePdfOriginal(b.id, pdfBlob); }catch(e){ logError("pdf-original", e); } }
  if(ocrMeta){ b.ocr = true; b.ocrInfo = ocrMeta; try{ await idbPut(b); }catch(e){} }
  showTabMsg("#addMsg", "اتضاف «" + b.title + "» ✔" + cleanNote(b) + pdfNote + (ocrMeta ? " — ونصه اتعمل بتعرف ضوئي (OCR) 📷" : "") + (encoding !== "utf-8" ? " — تمت القراءة كما هي (الترميز: "+encoding+")" : ""));
  renderLibrary();
  await openBook(b.id);
  if(ocrMeta) offerOcrAiRepair(b);
  return b;
}
/* Esc بيقفل أي لوحات/قوائم مفتوحة (اختبار/كلمة/المزيد/فهرس/اسأل) — شاشة الشروط والموافقات مش بتتقفل من هنا */
function closeOpenPanels(){
  closeMoreSheet();
  closeReaderPanels();
  const qo = $("#quizOverlay"); if(qo && !qo.classList.contains("hidden")) closeQuiz();
  const ws = $("#wordSheet"); if(ws && !ws.classList.contains("hidden")) closeWordSheet();
  $$(".card-more-panel").forEach(p=>p.classList.add("hidden"));
  const ip = $("#indexPanel"); if(ip) ip.classList.add("hidden");
  const ap = $("#askPanel"); if(ap) ap.classList.add("hidden");
}
/* تغيير لغة ترجمة الكتاب: بين لغتين حقيقيتين بنأكّد وبنمسح الترجمات القديمة؛
   التبديل لـ«النص الأصلي» أو الرجوع منه بيحتفظ بالترجمات زي ما هي — بتختفي من العرض بس وبترجع لما تختار لغة حقيقية */
async function changeBookTargetLang(book, newCode){
  if(!book || !newCode) return false;
  const oldCode = bookTargetLang(book);
  if(newCode === oldCode){ if(newCode !== "orig"){ settings.targetLang = newCode; saveSettings(); } return true; }
  const origSwitch = newCode === "orig" || oldCode === "orig";
  const hasTrans = book.chunks.some(c=>c.status === "done" || (c.trans && c.trans.trim()));
  if(!origSwitch && hasTrans){
    if(!confirm("تغيير لغة الترجمة هيمسح ترجمات الكتاب الحالية عشان يترجم من جديد باللغة الجديدة. أكمل؟")) return false;
    clearBookTranslations(book);
  }
  book.targetLang = newCode;
  if(newCode !== "orig"){ settings.targetLang = newCode; saveSettings(); }
  await idbPut(book);
  renderReader(book); renderLibrary();
  if(newCode === "orig") setTransStatus("اتظبط العرض على النص الأصلي كما نزل — ترجمات الكتاب المحفوظة زي ما هي، هترجع تظهر لما تختار لغة ترجمة");
  else if(oldCode === "orig") setTransStatus("اتظبطت لغة الترجمة: " + targetLangEntry(newCode).label + (hasTrans ? " — الترجمات المحفوظة رجعت تظهر" : ""));
  else if(hasTrans) setTransStatus("اتغيّرت لغة الترجمة واتمسحت الترجمات القديمة — دوس «ترجم / كمّل الترجمة» عشان تترجم باللغة الجديدة.");
  else setTransStatus("اتظبطت لغة الترجمة: " + targetLangEntry(newCode).label);
  return true;
}
/* تغيير أسلوب ترجمة الكتاب (فصحى/مصري — بيظهر وبيسري للهدف العربي بس): نفس قاعدة تغيير اللغة بالظبط —
   الترجمات المحفوظة معمولة بالأسلوب التاني، فبنأكّد الأول وبنمسحها قبل ما الأسلوب الجديد يبقى هو أسلوب الكتاب */
async function changeBookTStyle(book, newStyle){
  if(!book) return false;
  if(bookTargetLang(book) !== "ar-EG") return false; /* الأسلوب ملوش معنى برّه الهدف العربي */
  newStyle = sanitizeTStyle(newStyle);
  const oldStyle = bookTStyle(book);
  if(newStyle === oldStyle) return true;
  const hasTrans = book.chunks.some(c=>c.status === "done" || (c.trans && c.trans.trim()));
  if(hasTrans){
    if(!confirm("تغيير أسلوب الترجمة هيمسح ترجمات الكتاب الحالية عشان يترجم من جديد بالأسلوب الجديد. أكمل؟")) return false;
    clearBookTranslations(book);
  }
  book.tStyle = newStyle;
  await idbPut(book);
  renderReader(book); renderLibrary();
  setTransStatus("اتظبط أسلوب الترجمة: " + (newStyle === "egyptian" ? "🇪🇬 مصري" : "📖 فصحى") + (hasTrans ? " — اتمسحت الترجمات القديمة، دوس «ترجم / كمّل الترجمة» عشان تترجم بالأسلوب الجديد." : ""));
  return true;
}
/* ---------- ترقيم صفحات الأجزاء في القارئ (أداء) ----------
   الكتاب الكبير مبيترسمش كله مرة واحدة: أول 12 جزء بس، وكل ما القارئ يقرب من الآخر
   بتتضاف دفعة جديدة (IntersectionObserver) أو بزرار «عرض أجزاء أكتر» احتياطي.
   كل الحسابات (تقدم/بحث/فهرس/علامات/نسب) بتفضل على بيانات الكتاب كاملة — الـ DOM جزئي بس */
const CHUNK_PAGE_SIZE = 12;
let renderedUpTo = 0;      /* عدد الأجزاء المرسومة فعليًا للكتاب المعروض */
let pagerBookId = null;    /* الكتاب اللي الترقيم شغال عليه */
let chunkPagerObserver = null;
function buildChunkSection(book, i){
  const sec=document.createElement("article"); sec.className="chunk"; sec.id="chunk-"+i;
  sec.innerHTML = '<div class="chunk-head"><strong>الجزء '+(i+1)+'</strong><span class="badge" data-role="badge"></span></div>'+
    '<div class="orig" data-role="orig"></div>'+
    '<div class="trans" data-role="trans"></div>'+
    '<div class="chunk-err hidden" data-role="chunkerr"></div>'+
    '<div class="row wrap" data-role="btns"></div>'+
    '<div data-role="extra"></div>';
  return sec;
}
function pagerRowEl(){ return document.getElementById("moreChunksRow"); }
function updatePagerRow(book){
  const row = pagerRowEl(); if(!row) return;
  const left = book.chunks.length - renderedUpTo;
  row.classList.toggle("hidden", left <= 0);
  const btn = document.getElementById("btnMoreChunks");
  if(btn && left > 0) btn.textContent = "عرض أجزاء أكتر (فاضل " + left + ")";
}
/* بيرسم الأجزاء لحد رقم معين (حصري) — اللي مرسوم قبل كده مبيتلمسش */
function renderChunkPage(book, upto){
  const wrap = $("#chunks"); if(!wrap || !book) return renderedUpTo;
  if(pagerBookId !== book.id){ renderedUpTo = 0; pagerBookId = book.id; }
  const target = Math.min(upto, book.chunks.length);
  const row = pagerRowEl();
  while(renderedUpTo < target){
    const i = renderedUpTo;
    const sec = buildChunkSection(book, i);
    if(row && row.parentNode === wrap) wrap.insertBefore(sec, row); else wrap.appendChild(sec);
    fillChunk(book, i);
    renderedUpTo++;
  }
  updatePagerRow(book);
  return renderedUpTo;
}
/* بيضمن إن جزء معين بقى مرسوم (للقفز من الفهرس/العلامات أو استعادة موضع القراءة) */
function ensureChunksRendered(book, idx){
  if(!book || idx == null || idx < 0) return;
  if(pagerBookId !== book.id || idx >= renderedUpTo) renderChunkPage(book, idx + 1);
}
function loadNextChunkPage(){
  const b = currentBook(); if(!b || pagerBookId !== b.id) return;
  renderChunkPage(b, renderedUpTo + CHUNK_PAGE_SIZE);
}
function setupChunkPager(){
  if(chunkPagerObserver){ try{ chunkPagerObserver.disconnect(); }catch(e){} chunkPagerObserver = null; }
  const sentinel = document.getElementById("chunksSentinel");
  if(!sentinel || typeof IntersectionObserver === "undefined") return; /* مفيش مراقب: زرار «عرض أجزاء أكتر» بيكفي */
  chunkPagerObserver = new IntersectionObserver((entries)=>{
    for(const en of entries){ if(en.isIntersecting){ loadNextChunkPage(); break; } }
  }, {rootMargin: "800px 0px"});
  chunkPagerObserver.observe(sentinel);
}
function renderReader(book){
  $("#tab-reader").classList.remove("reader-empty"); /* كتاب موجود بيتعرض: أي حالة فاضية قديمة بتتشال قبل الرسم */
  document.body.classList.remove("reader-empty");
  $("#readerTitle").textContent=book.title;
  const locked=isBookLocked(book);
  $("#tab-reader").classList.toggle("reader-locked", locked);
  document.body.classList.toggle("reader-locked", locked); /* مرايا للدرج وحبّته في #overlay-root */
  /* شريط التحكم السفلي (أبجد): بيظهر لكتاب مفتوح ومش مقفول بس — سكرولر على آخر موضع، وسطر فرعي بمعلومات الكتاب */
  const bbEl = $("#readerBottomBar"); if(bbEl) bbEl.classList.toggle("hidden", locked);
  if(!locked){
    const lo0 = getLastOpen(); const idx0 = (lo0 && lo0.bookId === book.id) ? (lo0.chunkIndex || 0) : 0;
    const sc0 = $("#readScrubber"); if(sc0){ sc0.max = String(Math.max(0, book.chunks.length - 1)); sc0.value = String(idx0); }
    const sp0 = $("#scrubPos"); if(sp0) sp0.textContent = "جزء " + (idx0 + 1) + " من " + book.chunks.length;
    const sm0 = $("#scrubMeta"); if(sm0) sm0.textContent = "قريت " + (book.progress || 0) + "٪";
    const st0 = $("#readerSubtitle");
    if(st0){ const code0 = bookTargetLang(book); st0.textContent = book.chunks.length + " جزء" + (code0 === "orig" ? " • النص الأصلي كما نزل" : " • ترجمة " + targetLangEntry(code0).name + (code0 === "ar-EG" ? " • " + (bookTStyle(book) === "egyptian" ? "بالمصري" : "فصحى") : "")); }
    syncThemeCycleBtn();
  }
  if(locked){ renderSubPanels(); window.scrollTo(0,0); syncProgressBarVisibility(); updateRulerVisibility(); return; }
  ensureBookExtras(book);
  renderReaderControls(book); renderProgress(book); renderSummary(book);
  syncProgressBarVisibility();
  const wrap=$("#chunks"); wrap.innerHTML="";
  pagerBookId = book.id; renderedUpTo = 0;
  const row=document.createElement("div"); row.id="moreChunksRow"; row.className="more-chunks-row";
  row.innerHTML = '<div id="chunksSentinel"></div><button type="button" id="btnMoreChunks" class="ghost">عرض أجزاء أكتر</button>';
  wrap.appendChild(row);
  /* الصفحة الأولى + لحد موضع القراءة المحفوظ للكتاب ده عشان الاستعادة تشتغل من غير قفزات */
  let initial = CHUNK_PAGE_SIZE;
  try{ const lo = getLastOpen(); if(lo && lo.bookId === book.id) initial = Math.max(initial, (lo.chunkIndex || 0) + 1); }catch(e){}
  renderChunkPage(book, initial);
  setupChunkPager();
  renderVoices();
  renderAskPanel(book);
  refreshChunkAudioStates(book);
  updateRulerVisibility();
}
function renderReaderControls(book){
  /* عناصر التحكم بتخص الكتاب المعروض حاليًا بس: لو عملية خلصت في الخلفية على كتاب تاني، حالتها (تلميح الاسترجاع/لغة الهدف/…) متتحسبش منه */
  if(book && currentId && book.id !== currentId){ const cb = currentBook(); if(cb) book = cb; }
  const arBook = isArabicBook(book);
  const tls = $("#targetLangSel"); if(tls){ tls.value = bookTargetLang(book); tls.disabled = translating || repairing; }
  /* اختيار الأسلوب بيظهر للهدف العربي بس (بيختفي للأجنبي و«النص الأصلي») وقيمته هي أسلوب الكتاب الحالي */
  const arTgt = bookTargetLang(book) === "ar-EG";
  const tsW = $("#tStyleWrap"); if(tsW) tsW.classList.toggle("hidden", !arTgt);
  const tsS = $("#tStyleSel"); if(tsS){ tsS.value = bookTStyle(book); tsS.disabled = translating || repairing; }
  $("#btnTranslate").disabled = translating || repairing;
  /* «مش باهت أبدًا»: أزرار الإيقاف/الاسترجاع/المسح/التحسين/الإصلاح مبتتعطّلش في حالات السكون — بتفضل قابلة للدوس،
     والدوسة في حالة مفيهاش إجراء بترد برسالة شرح في سطر الحالة بدل الصمت. التعطيل الحقيقي للعملية الجارية نفسها بس */
  const bst=$("#btnStopTrans"); if(bst) bst.classList.toggle("danger", !!translating); /* شغال = أحمر واضح، فاضي = شكله العادي وهو برضه قابل للدوس */
  const bro=$("#btnRestoreOrig"); const rh=$("#restoreHint");
  const hasOrig = Array.isArray(book.origChunks);
  const differs = hasOrig && origDiffers(book);
  if(rh) rh.textContent = !hasOrig ? "مفيش نسخة أصلية محفوظة للكتاب ده لسه — هتتحفظ تلقائيًا أول ما الكتاب يتفتح" : (!differs ? "النص الحالي هو الأصلي" : (book.origAuto ? "نقطة الرجوع: النص الأصلي المحفوظ للكتاب" : ""));
  const bs=$("#btnStopRepair"); if(bs) bs.classList.toggle("hidden", !repairing);
  /* ملحوظة الوضع الأساسي: للكتب الأجنبية بس، ومش بتظهر لما فيه مفتاح */
  const bn=$("#basicNote");
  if(bn){ const showBasic = !arBook && !hasKey(); bn.classList.toggle("hidden", !showBasic); if(showBasic) bn.textContent = (bookTargetLang(book)==="ar-EG" && bookTStyle(book)==="egyptian") ? "الوضع الأساسي بيترجم عربي قياسي آلي — اللهجة المصرية بتحتاج مفتاح API" : "ترجمة آلية أساسية — للأسلوب المصري الكامل ضيف مفتاحك في الإعدادات"; }
  if(typeof setExplainBtn === "function") setExplainBtn();
  const qb=$("#btnQuiz"); if(qb) qb.textContent = "🧠 اختبرني" + (book.quizBest ? " — أحسن نتيجة: " + book.quizBest + "/5" : "");
  const fbi=$("#finishByInput");
  if(fbi){ fbi.value = book.finishBy || ""; const fh=$("#finishPlanHint"); if(fh){ const plan = finishPlan(book); fh.textContent = !book.finishBy ? "" : (!plan ? "" : plan.done ? "خلّصت الكتاب — مبروك 🎉" : plan.overdue ? "الخطة اتأخرت — عدّل التاريخ أو كمل على مهلك" : "فاضل " + plan.remaining + " جزء على " + plan.daysLeft + " يوم — هدفك " + plan.daily + " أجزاء في اليوم"); } }
}
function renderProgress(book){ const p=progressOf(book); $("#transProgress").style.width=p.pct+"%"; const rp=$("#readerPercents"); if(rp && book){ const pc=bookPercents(book); rp.textContent="🌐 مترجم "+pc.trans+"٪ • 💡 مشروح "+pc.expl+"٪"; } }
function fillChunk(book,i){
  const sec=$("#chunk-"+i); if(!sec) return;
  const ch=book.chunks[i];
  sec.dataset.status = ch.status || "pending"; /* حالة الجزء على العنصر نفسه — بتقود وميض التحميل في CSS وهو «بيترجم» */
  const badge=$('[data-role="badge"]',sec);
  badge.textContent = ch.status==="done" ? (ch.basic?"اتترجم (آلية أساسية)":"اتترجم ✔") : ch.status==="working" ? "بيترجم…" : ch.status==="fail" ? "وقف بخطأ" : "لسه";
  badge.className="badge "+(ch.status==="done"?"done":ch.status==="fail"?"fail":"");
  ensureBookExtras(book);
  const anns=chunkAnnotations(book,i);
  const origEl=$('[data-role="orig"]',sec);
  /* دوسة كلمة: أصل أجنبي من غير تظليلات → الكلمات الإنجليزية بتتغلّف في spans وقت رسم الجزء ده بس،
     والدوسات بيستقبلها مستمع واحد مفوّض على حاوية #chunks كلها (مفيش مستمع لكل كلمة) */
  if(!isArabicBook(book) && arabicRatio(ch.orig||"") <= 0.5 && !anns.length){
    origEl.innerHTML=tappableOrigHTML(ch.orig);
  } else {
    origEl.innerHTML=highlightedHTML(ch.orig, anns);
  }
  const tr=$('[data-role="trans"]',sec);
  const tgt = bookTargetLang(book);
  if(tgt === "orig"){
    /* وضع «النص الأصلي كما نزل»: منطقة الترجمة بتعرض الأصل نفسه زي ما هو — باتجاهه الطبيعي (عربي = يمين-شمال) وبعلامة واضحة */
    const rtlOrig = arabicRatio(ch.orig || "") > 0.5;
    tr.classList.remove("trans-empty");
    tr.classList.toggle("trans-ltr", !rtlOrig);
    if(rtlOrig) tr.removeAttribute("dir"); else tr.setAttribute("dir","ltr");
    tr.innerHTML = '<span class="badge done">النص الأصلي</span><br>' + highlightedHTML(ch.orig, anns);
  } else {
    const ltr = RTL_LANGS.indexOf(tgt) < 0; /* ترجمة أجنبية LTR — واللغات اليمين-شمال (أردو/فارسي) بتيجي باتجاهها الطبيعي */
    tr.classList.toggle("trans-ltr", ltr);
    if(ltr) tr.setAttribute("dir","ltr"); else tr.removeAttribute("dir");
    tr.classList.toggle("trans-empty", !ch.trans);
    if(ch.trans) tr.innerHTML=highlightedHTML(ch.trans, anns); else tr.textContent="— لسه ماتترجمش —";
  }
  const cerr=$('[data-role="chunkerr"]',sec);
  if(cerr){ const em = ch.status==="fail" ? chunkErrorText(book.id, i) : ""; cerr.textContent = em ? ("سبب التوقف: " + em) : ""; cerr.classList.toggle("hidden", !em); }
  const btns=$('[data-role="btns"]',sec); btns.innerHTML="";
  const mk=(label,cls,fn)=>{ const b=document.createElement("button"); b.className=cls||"ghost"; b.textContent=label; b.addEventListener("click",fn); btns.appendChild(b); return b; };
  /* زرار ترجمة الجزء ده لوحده — دايمًا ظاهر تحت كل جزء وهو زرار الترجمة الوحيد للجزء (اندمج فيه زرار «إعادة الجزء» القديم):
     لسه/وقف بخطأ = «🌐 ترجم الجزء ده»، اتترجم = «🔁 أعد ترجمة الجزء»، وهو بيترجم = «⏳ بيترجم…» وزرار إيقاف المنطقة ١ مفعّل */
  const tWorking = ch.status==="working";
  const tDone = ch.status==="done" || (!!ch.trans && ch.status!=="fail");
  const tBtn = mk(tWorking ? "⏳ بيترجم…" : tDone ? "🔁 أعد ترجمة الجزء" : "🌐 ترجم الجزء ده", (tWorking || tDone) ? "ghost" : "primary", ()=>translateOneChunk(book,i));
  tBtn.dataset.role="translate-chunk";
  if(ch.status==="done"){
    const lt=mk("🔊 اسمع ترجمة الجزء","ghost",()=>playVoiceItems([Object.assign(transSpeakItem(book, ch.trans), {bookId:book.id, chunkIdx:i, kind:"trans"})],"ترجمة الجزء "+(i+1)));
    lt.dataset.role="listen-trans";
    const le=mk("🎧 اعمل واسمع الشرح الصوتي","ghost",async()=>{ const gen=audioGen; try{ setAudioStatus("بيجهّز الشرح…"); const t=await makeExplanation(book,i); if(gen!==audioGen) return; if(t) playVoiceItems([{text:t,lang:"ar",bookId:book.id, chunkIdx:i, kind:"explain"}],"شرح الجزء "+(i+1)); }catch(e){ if(gen===audioGen && !(e && e.name==="AbortError")){ logError("شرح", e); setAudioStatus("الشرح وقف — سبب التوقف: " + describeError(e), true); } } });
    le.dataset.role="listen-explain";
  }
  /* شرح نصي للجزء ده بس — بيظهر لما الجزء قابل للشرح (مترجم، أو الكتاب في وضع النص الأصلي) */
  if(ch.status==="done" || bookTargetLang(book)==="orig") mk("💡 اشرح الجزء بال"+((typeof explDialect==="function")?explDialect().label:"مصري"),"ghost",()=>explainChunkText(book,i));
  if(ch.status==="done" || bookTargetLang(book)==="orig") mk("📝 لخّص الجزء","ghost",()=>summarizeChunkText(book,i));
  const marked=book.bookmarks.includes(i);
  mk(marked?"🔖 شيل العلامة":"🔖 علامة","ghost",async()=>{ ensureBookExtras(book); const beforeMarks=book.bookmarks.slice(); const p=book.bookmarks.indexOf(i); if(p>=0) book.bookmarks.splice(p,1); else book.bookmarks.push(i); try{ await idbPut(book); }catch(e){ book.bookmarks=beforeMarks; logError("حفظ", e); setTransStatus("حفظ العلامة فشل — جرّب تاني.", true); } fillChunk(book,i); renderIndexPanel(); });
  mk("🖍 ظلّل","ghost",()=>{ const ed=$('[data-role="hledit"]',sec); if(ed) ed.classList.toggle("hidden"); });
  const ex=$('[data-role="extra"]',sec); ex.innerHTML="";
  if(anns.length){
    const box=document.createElement("div"); box.className="annot-box";
    const h=document.createElement("strong"); h.textContent="🖍 تظليلات الجزء ده ("+anns.length+")"; box.appendChild(h);
    anns.forEach(a=>{
      const row=document.createElement("div"); row.className="annot-item";
      const q=document.createElement("span"); q.className="annot-quote"; q.innerHTML='<mark class="hl-'+esc(a.color||"yellow")+'">'+esc(a.quote.length>140?a.quote.slice(0,140)+"…":a.quote)+"</mark>"; row.appendChild(q);
      if(a.note){ const n=document.createElement("span"); n.className="annot-note"; n.textContent="📝 "+a.note; row.appendChild(n); }
      if(!annotationFound(book,a)){ const w=document.createElement("span"); w.className="badge fail"; w.textContent="(النص اتغيّر)"; row.appendChild(w); }
      const sb=document.createElement("button"); sb.className="ghost"; sb.textContent="📤 مشاركة"; sb.addEventListener("click",()=>shareQuote(book,a.quote));
      const db=document.createElement("button"); db.className="ghost"; db.textContent="🗑 حذف"; db.addEventListener("click",async()=>{ const beforeAnns=book.annotations; book.annotations=book.annotations.filter(x=>x.id!==a.id); try{ await idbPut(book); }catch(e){ book.annotations=beforeAnns; logError("حفظ", e); setTransStatus("حذف التظليل فشل — جرّب تاني.", true); } fillChunk(book,i); renderIndexPanel(); });
      row.append(sb,db); box.appendChild(row);
    });
    ex.appendChild(box);
  }
  ex.appendChild(buildHlEditor(book,i,sec));
  if(ch.glossary && ch.glossary.length){
    const d=document.createElement("details"); const s=document.createElement("summary"); s.textContent="قاموس الجزء ده ("+ch.glossary.length+")"; d.appendChild(s);
    ch.glossary.forEach(g=>d.appendChild(glossNode(g))); ex.appendChild(d);
  }
  if(ch.keyPoints && ch.keyPoints.length){
    const d=document.createElement("details"); const s=document.createElement("summary"); s.textContent="أهم النقط"; d.appendChild(s);
    const ul=document.createElement("ul"); ch.keyPoints.forEach(k=>{ const li=document.createElement("li"); li.textContent=k; ul.appendChild(li); });
    d.appendChild(ul); ex.appendChild(d);
  }
  if(ch.summary){
    const d=document.createElement("details"); const s=document.createElement("summary"); s.textContent="ملخص الجزء"; d.appendChild(s);
    const p=document.createElement("p"); p.textContent=stripMd(ch.summary); d.appendChild(p); ex.appendChild(d);
  }
  if(ch.explanation){
    const d=document.createElement("details"); const s=document.createElement("summary"); s.textContent="الشرح (نص)"; d.appendChild(s);
    const p=document.createElement("p"); p.textContent=stripMd(ch.explanation); d.appendChild(p); ex.appendChild(d);
  }
}
function renderChunk(book,i){ fillChunk(book,i); }
function glossNode(g){
  const div=document.createElement("div"); div.className="gloss-item";
  const key=String(g.english||"").toLowerCase();
  const top=document.createElement("div");
  const en=document.createElement("span"); en.className="en"; en.textContent=g.english||"";
  const ar=document.createElement("span"); ar.textContent=" = "+(g.arabic||"");
  const fav=document.createElement("button"); fav.className="fav"; fav.textContent=favs.has(key)?"⭐":"☆";
  fav.title="مفضلة"; fav.addEventListener("click",()=>{ if(favs.has(key)) favs.delete(key); else favs.add(key); saveFavs(); fav.textContent=favs.has(key)?"⭐":"☆"; });
  const pr=document.createElement("button"); pr.className="ghost"; pr.textContent="🔊 النطق";
  pr.addEventListener("click",()=>{ if(!("speechSynthesis" in window)) return; stopSpeaking(); const u=new SpeechSynthesisUtterance(g.english||""); const v=pickVoice("en"); if(v){u.voice=v; u.lang=v.lang;} else u.lang="en-US"; speechSynthesis.speak(u); });
  top.append(en,ar,fav,pr);
  if(g.known){ const kb=document.createElement("span"); kb.className="badge done"; kb.textContent="✔ اتعلّمت"; top.appendChild(kb); }
  div.appendChild(top);
  if(g.explanation){ const p=document.createElement("div"); p.className="hint"; p.textContent=g.explanation; div.appendChild(p); }
  return div;
}
function renderSummary(book){
  const card=$("#summaryCard");
  if(book.summary){ card.classList.remove("hidden"); $("#bookSummary").textContent=book.summary; }
  else card.classList.add("hidden");
}

/* ---------- 💬 اسأل الكتاب (محادثة مربوطة بمحتوى الكتاب نفسه بس) ---------- */
const ASK_SYS = "انت مساعد قراءة بيجاوب على أسئلة القارئ عن كتابه، معتمد فقط على مقتطفات من الكتاب هتوصلك. جاوب باللهجة المصرية البسيطة اليومية وبأسلوب شيّق وواضح، واذكر رقم الجزء اللي جبت منه المعلومة بين قوسين زي (الجزء ٣). لو الإجابة مش موجودة في المقتطفات اللي وصلتك، قول بالنص: الكتاب مش بيغطي النقطة دي في الأجزاء اللي وصلتني. ممنوع تضيف أي معلومة من برّه المقتطفات.";
function askTokens(q){ return Array.from(new Set(String(q || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w=>w.length >= 2))); }
/* دالة نقية: اختيار أكتر أجزاء ليها علاقة بالسؤال (تداخل كلمات في الأصل + الترجمة، وعلاوة للأجزاء اللي ليها أهم نقط) */
function pickAskChunks(book, question, n){
  n = n || 4;
  const toks = askTokens(question);
  const scored = (book.chunks || []).map((ch, i)=>{
    const hay = ((ch.orig || "") + "\n" + (ch.trans || "")).toLowerCase();
    let s = 0;
    toks.forEach(t=>{ let p = hay.indexOf(t); while(p >= 0){ s++; p = hay.indexOf(t, p + t.length); } });
    if(s > 0 && (ch.keyPoints || []).length) s += 1;
    return {i:i, s:s};
  });
  let picked = scored.filter(x=>x.s > 0).sort((a, b)=>(b.s - a.s) || (a.i - b.i)).slice(0, n).map(x=>x.i);
  if(!picked.length) picked = (book.chunks || []).slice(0, Math.min(n, (book.chunks || []).length)).map((c, i)=>i);
  return picked.sort((a, b)=>a - b);
}
function renderAskPanel(book){
  const box = $("#askMessages"); if(!box) return;
  book = book || currentBook();
  if(!book){ box.innerHTML = '<p class="hint">افتح كتاب الأول.</p>'; return; }
  ensureBookExtras(book);
  if(!book.chat.length){ box.innerHTML = '<p class="hint">اسأل أي سؤال عن محتوى الكتاب — الإجابة هتيجي من أجزاء الكتاب نفسه بس.</p>'; return; }
  box.innerHTML = "";
  book.chat.forEach(m=>{
    const d = document.createElement("div");
    d.className = "chat-msg " + (m.role === "user" ? "me" : "bot");
    d.textContent = m.text;
    box.appendChild(d);
  });
  box.scrollTop = box.scrollHeight;
}
async function sendAsk(){
  const b = currentBook(); if(!b || isBookLocked(b)) return;
  const inp = $("#askInput"); const q = (inp.value || "").trim(); if(!q) return;
  const msg = $("#askMsg");
  if(!hasKey()){ if(msg){ msg.textContent = "اسأل الكتاب بيحتاج مفتاح API من الإعدادات"; msg.classList.add("err"); } return; }
  ensureBookExtras(b);
  b.chat.push({role:"user", text:q, ts:Date.now()});
  if(b.chat.length > 50) b.chat = b.chat.slice(-50);
  inp.value = "";
  renderAskPanel(b);
  const btn = $("#askSend"); if(btn) btn.disabled = true;
  if(msg){ msg.textContent = "بيفكّر…"; msg.classList.remove("err"); }
  try{
    const idxs = pickAskChunks(b, q);
    const ctx = idxs.map(i=>{
      const ch = b.chunks[i];
      return "— الجزء " + (i + 1) + " —\n[الأصل]\n" + (ch.orig || "").slice(0, 1500) + "\n[الترجمة]\n" + (ch.trans || "").slice(0, 1500) + ((ch.keyPoints || []).length ? "\n[أهم النقط]\n" + ch.keyPoints.join("؛ ") : "");
    }).join("\n\n");
    const ans = await aiChat(ASK_SYS, "مقتطفات من الكتاب:\n\n" + ctx + "\n\nسؤال القارئ: " + q, 0.4, undefined, {maxTokens: 2048});
    b.chat.push({role:"assistant", text:String(ans).trim(), ts:Date.now()});
    if(b.chat.length > 50) b.chat = b.chat.slice(-50);
    await idbPut(b);
    if(msg) msg.textContent = "";
  }catch(e){
    if(msg){ msg.textContent = "السؤال وقف: " + e.message; msg.classList.add("err"); }
  } finally {
    if(btn) btn.disabled = false;
    renderAskPanel(b);
  }
}

/* ---------- القاموس الكلي + كلماتي ---------- */
function renderGlossary(){
  const list=$("#glossaryList"); list.innerHTML="";
  const q=($("#glossSearch").value||"").trim().toLowerCase();
  const favOnly=$("#glossFavOnly").checked;
  const seen=new Map();
  const book=currentBook();
  if(book) book.chunks.forEach(ch=>(ch.glossary||[]).forEach(g=>{ const k=String(g.english||"").toLowerCase(); if(k && !seen.has(k)) seen.set(k,g); }));
  let items=Array.from(seen.values());
  if(q) items=items.filter(g=>(g.english+" "+g.arabic+" "+(g.explanation||"")).toLowerCase().includes(q));
  if(favOnly) items=items.filter(g=>favs.has(String(g.english).toLowerCase()));
  if(!items.length){ list.innerHTML='<p class="hint">'+(book?"لسه مفيش مصطلحات — بتتكوّن مع ترجمة الكتاب (بالمفتاح الذكي).":"افتح كتاب الأول عشان يظهر قاموسه هنا.")+"</p>"; }
  items.forEach(g=>list.appendChild(glossNode(g)));
  const sw=$("#savedWordsList"); sw.innerHTML="";
  if(!savedWords.length) sw.innerHTML='<p class="hint">لسه محفظتش كلمات من المترجم السريع.</p>';
  savedWords.forEach((w,idx)=>{
    const d=document.createElement("div"); d.className="saved-item";
    d.appendChild(glossNode(w));
    const del=document.createElement("button"); del.className="ghost"; del.textContent="احذف من كلماتي";
    del.addEventListener("click",()=>{ savedWords.splice(idx,1); saveWordsStore(); renderGlossary(); });
    d.appendChild(del); sw.appendChild(d);
  });
  renderFlash();
}

/* ---------- 🃏 بطاقات المراجعة (فلاش كاردز لقاموس الكتاب الحالي) ----------
   حالة «عرفتها» بتتخزن على المصطلح نفسه (term.known) جوه قاموس أجزاء الكتاب وبتتحفظ في IndexedDB */
let flashQueue = [], flashTotal = 0, flashKnownCount = 0, flashFlipped = false, flashBookId = null;
function renderFlash(){
  const box = $("#flashBox"); if(!box) return;
  const b = currentBook();
  if(!b){ box.innerHTML = '<p class="hint">افتح كتاب الأول عشان تراجع مصطلحاته.</p>'; return; }
  if(flashBookId !== b.id){ flashQueue = []; flashTotal = 0; flashKnownCount = 0; flashFlipped = false; flashBookId = b.id; }
  if(isBookLocked(b)){ box.innerHTML = '<p class="hint">الكتاب الحالي مقفول بالاشتراك — مفيش بطاقات مراجعة له.</p>'; return; }
  const terms = bookGlossaryUnique(b);
  box.innerHTML = "";
  if(!terms.length){ box.innerHTML = '<p class="hint">لسه مفيش مصطلحات في الكتاب الحالي — بتتكوّن مع الترجمة بالمفتاح الذكي.</p>'; return; }
  if(flashTotal === 0){
    const start = document.createElement("button"); start.className = "primary"; start.textContent = "🃏 ابدأ مراجعة " + terms.length + " مصطلح";
    start.addEventListener("click", ()=>{ flashQueue = terms.slice(); flashTotal = terms.length; flashKnownCount = 0; flashFlipped = false; renderFlash(); });
    box.appendChild(start);
    const knownN = terms.filter(t=>t.known).length;
    if(knownN){ const p = document.createElement("p"); p.className = "hint"; p.textContent = "علّمت على " + knownN + " مصطلح «عرفته» قبل كده ✔"; box.appendChild(p); }
    return;
  }
  if(!flashQueue.length){
    const pct = flashTotal ? Math.round(flashKnownCount / flashTotal * 100) : 0;
    const done = document.createElement("div");
    done.innerHTML = '<p><strong>خلّصت البطاقات 🎉</strong></p><p class="hint">عرفت ' + flashKnownCount + ' من ' + flashTotal + ' (' + pct + '٪)</p>';
    const re = document.createElement("button"); re.className = "primary"; re.textContent = "🔁 إعادة من الأول";
    re.addEventListener("click", ()=>{ flashQueue = bookGlossaryUnique(b).slice(); flashTotal = flashQueue.length; flashKnownCount = 0; flashFlipped = false; renderFlash(); });
    done.appendChild(re); box.appendChild(done);
    return;
  }
  const term = flashQueue[0];
  const prog = document.createElement("p"); prog.className = "hint";
  prog.textContent = "بطاقة " + (flashKnownCount + 1) + " من " + flashTotal + " — عرفت " + flashKnownCount;
  box.appendChild(prog);
  const card = document.createElement("div"); card.className = "flash-card";
  if(!flashFlipped){
    card.innerHTML = '<div class="flash-en" dir="ltr">' + esc(term.english || "") + '</div><p class="hint">دوس على البطاقة عشان تقلبها وتشوف المعنى</p>';
  } else {
    card.innerHTML = '<div class="flash-ar">' + esc(term.arabic || "") + '</div>' + (term.explanation ? '<p>' + esc(term.explanation) + '</p>' : "");
  }
  card.addEventListener("click", ()=>{ flashFlipped = !flashFlipped; renderFlash(); });
  box.appendChild(card);
  const row = document.createElement("div"); row.className = "row wrap";
  const bk = document.createElement("button"); bk.className = "primary"; bk.textContent = "✅ عرفتها";
  bk.addEventListener("click", async ()=>{ term.known = true; flashQueue.shift(); flashKnownCount++; flashFlipped = false; const cb = currentBook(); if(cb){ try{ await idbPut(cb); }catch(e){ logError("حفظ", e); } } renderFlash(); });
  const bl = document.createElement("button"); bl.className = "ghost"; bl.textContent = "🔁 لسه بتعلّمها";
  bl.addEventListener("click", ()=>{ flashQueue.push(flashQueue.shift()); flashFlipped = false; renderFlash(); });
  row.append(bk, bl); box.appendChild(row);
}

/* ---------- تصدير وطباعة ---------- */
function bookGlossaryUnique(book){ const m=new Map(); book.chunks.forEach(ch=>(ch.glossary||[]).forEach(g=>{ const k=String(g.english||"").toLowerCase(); if(k&&!m.has(k)) m.set(k,g); })); return Array.from(m.values()); }
function exportText(book){
  const origMode = bookTargetLang(book)==="orig"; /* وضع النص الأصلي: التصدير بيطلع الأصل نفسه زي ما نزل */
  let s=book.title+(origMode ? " — النص الأصلي كما نزل" : " — النسخة المترجمة بالمصري")+"\n"+"=".repeat(40)+"\n\n";
  book.chunks.forEach((ch,i)=>{ s+="— الجزء "+(i+1)+" —\n"+(origMode ? (ch.orig||"") : (ch.trans||"(لسه ماتترجمش)"))+"\n\n"; });
  const gl=bookGlossaryUnique(book);
  if(gl.length){ s+="\nالقاموس (English = العربية + شرح بالمصري)\n"+"-".repeat(40)+"\n"; gl.forEach(g=>{ s+=g.english+" = "+g.arabic+(g.explanation?" — "+g.explanation:"")+"\n"; }); }
  const pts=book.chunks.flatMap(ch=>ch.keyPoints||[]);
  if(pts.length){ s+="\nأهم النقط\n"+"-".repeat(40)+"\n"; pts.forEach(p=>s+="• "+p+"\n"); }
  s+="\n"+"-".repeat(40)+"\nتم التصدير من تطبيق كُتُبِي — تطوير Don Eslam ©\n"; /* [v25] بصمة المالك بتسافر مع أي نسخة برّه التطبيق */
  return s;
}
function download(name, text){
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
function exportBook(book){ download(book.title.replace(/[\\/:*?"<>|]/g," ").trim()+".txt", exportText(book)); }
function printBook(book){
  const origMode = bookTargetLang(book)==="orig";
  const pa=$("#printArea"); pa.innerHTML="";
  const h=document.createElement("h1"); h.textContent=book.title+(origMode ? " — النص الأصلي" : " — النسخة المترجمة"); pa.appendChild(h);
  book.chunks.forEach((ch,i)=>{ const t=document.createElement("h2"); t.textContent="الجزء "+(i+1); pa.appendChild(t); const p=document.createElement("div"); p.className="p-trans"; p.textContent=origMode ? (ch.orig||"") : (ch.trans||""); pa.appendChild(p); });
  const gl=bookGlossaryUnique(book);
  if(gl.length){ const t=document.createElement("h2"); t.textContent="القاموس"; pa.appendChild(t); gl.forEach(g=>{ const d=document.createElement("div"); d.className="p-gloss"; d.textContent=g.english+" = "+g.arabic+(g.explanation?" — "+g.explanation:""); pa.appendChild(d); }); }
  const pf=document.createElement("div"); pf.className="p-footer"; pf.textContent="تم التصدير من تطبيق كُتُبِي — تطوير Don Eslam ©"; pa.appendChild(pf); /* [v25] بصمة المالك في الطباعة */
  window.print();
}

/* ---------- إضافة كتب ---------- */
function arabicRatio(t){ const letters=(t.match(/[A-Za-z\u0600-\u06FF]/g)||[]).length; if(!letters) return 0; const ar=(t.match(/[\u0600-\u06FF]/g)||[]).length; return ar/letters; }
/* كتاب عربي المصدر؟ بنقرأ srcArabic المحفوظة، والكتب القديمة اللي معندهاش الحقل بنحسبها من نصوص الأجزاء الأصلية */
function isArabicBook(book){
  if(!book) return false;
  if(typeof book.srcArabic === "boolean") return book.srcArabic;
  const joined = (book.chunks||[]).map(c=>c.orig||"").join("\n\n");
  return arabicRatio(joined) > 0.5;
}
async function addBook(title, text, origin, opts){
  const hasPages = !!(opts && Array.isArray(opts.pages) && opts.pages.length);
  if(hasPages) text=opts.pages.map((p,i)=>window.PdfText.markPage(i+1)+String(p||"")).join("\n\n");
  text=String(text||"").trim();
  if(text.length<30) throw new Error("النص قصير قوي — الكتاب محتاج نص أطول من كده.");
  const cleaned=cleanupText(text);
  const chunks=splitChunks(cleaned.text);
  if(hasPages){
    const pdfText=window.PdfText;
    let previousEnd=1;
    chunks.forEach(chunk=>{
      const markers=pdfText.readMarkers(chunk.orig);
      chunk.pg = markers.first === null ? previousEnd : markers.first;
      chunk.pgEnd = markers.last === null ? previousEnd : markers.last;
      previousEnd=chunk.pgEnd;
      chunk.orig=pdfText.stripMarkers(chunk.orig);
    });
  }
  const book={id:uid(), title:title||"كتاب من غير اسم", created:Date.now(), origin:origin||"", summary:"", srcArabic:arabicRatio(text) > 0.5, chunks:chunks};
  if(hasPages){ book.pageCount=opts.pageCount||opts.pages.length; book.extractVer=2; }
  book.origChunks=book.chunks.map(c=>c.orig); /* النسخة الأصلية زي ما اتقسمت أول مرة بالظبط — نقطة الاسترجاع، ومبتتغيّرش بعد كده أبدًا */
  book.origJoined=hasPages ? book.origChunks.join("\n\n") : cleaned.text;
  if(!book.chunks.length) throw new Error("ملقيتش نص قابل للقراية في اللي ضفته.");
  await idbPut(book); books.push(book);
  book._cleanStats=cleaned.stats; /* للإشارة في رسالة النجاح بس — مش بيتحفظ */
  return book;
}
function driveId(link){
  const m=String(link).match(/\/file\/d\/([\w-]+)/) || String(link).match(/[?&]id=([\w-]+)/) || String(link).match(/\/d\/([\w-]+)/);
  return m?m[1]:null;
}
let driveOcrMeta = null; /* [v25] بيانات OCR كتاب جاي من لينك Drive — بتتظبط في importDrive وبتتستهلك في معالج زرار الاستيراد */
async function importDrive(link){
  driveOcrMeta = null;
  const id=driveId(link);
  if(!id) throw new Error("اللينك مش باين إنه لينك ملف Drive. انسخ لينك الملف نفسه.");
  const r=await fetch("https://drive.google.com/uc?export=download&id="+encodeURIComponent(id));
  if(!r.ok) throw new Error("Drive رفض التحميل ("+r.status+").");
  const blob=await r.blob();
  const head=new Uint8Array(await blob.slice(0,5).arrayBuffer());
  const isPDF = head[0]===0x25 && head[1]===0x50 && head[2]===0x44 && head[3]===0x46;
  if(isPDF){
    const rr = await extractPDFWithOCR(await blob.arrayBuffer(), $("#bookTitle").value.trim() || "كتاب من Drive");
    driveOcrMeta = rr.ocr;
    return {text: rr.text, pages: rr.pages, pageCount: rr.pageCount, pdfBlob: blob};
  }
  const text=await blob.text();
  if(/^\s*<!doctype html/i.test(text) || /drive\.google\.com/.test(text.slice(0,2000)) && text.length<200000 && /<html/i.test(text.slice(0,500)))
    throw new Error("Drive رجّع صفحة ويب مش الملف — غالبًا اللينك مش عام.");
  return {text: text};
}

/* ---------- مترجم سريع ---------- */
/* اختيار أسلوب المترجم السريع بيظهر لما هدفه العربي بس، وقيمته الافتراضية أسلوب الإعدادات العام */
function syncQuickStyle(resetValue){
  const w=$("#quickTStyleWrap"), s=$("#quickTStyleSel"), t=$("#quickTargetSel");
  if(s && resetValue) s.value = sanitizeTStyle(settings.tStyle);
  if(w && t) w.classList.toggle("hidden", t.value !== "ar-EG");
}
let lastQuick=null;
async function quickTranslate(input, codeOverride){
  const text=input.trim(); if(!text) return null;
  const isWord = !/\s/.test(text);
  const codeRaw = codeOverride || (($("#quickTargetSel") && $("#quickTargetSel").value) || settings.targetLang || "ar-EG");
  const code = codeRaw === "orig" ? "ar-EG" : sanitizeTargetLang(codeRaw); /* «النص الأصلي» مش هدف صالح للمترجم السريع — وأي كود برّه القايمة (لغة اتشالت) بيرجع للمصري */
  if(code !== "ar-EG"){
    /* هدف أجنبي: الترجمة بلغة البلد ولهجتها — والمعنى بيبقى شرح تعليمي بالمصري */
    const e = targetLangEntry(code);
    if(hasKey()){
      if(isWord){
        const raw=await aiChat("You are a bilingual dictionary assistant helping an Egyptian Arabic speaker.", "For the following word, return ONLY JSON: {\"translation\":\"its translation into " + e.name + "\",\"meaning\":\"معنى الكلمة ببساطة باللهجة المصرية\",\"usage\":\"a simple example sentence in " + e.name + " followed by its Egyptian Arabic translation\"}\nWord: "+text, 0.2, undefined, {maxTokens: 1024});
        const j=parseJSONLoose(raw);
        if(j) return {word:true, source:text, translation:j.translation||"", meaning:j.meaning||"", usage:j.usage||"", lang:code};
        return {word:true, source:text, translation:raw.trim(), meaning:"", usage:"", lang:code};
      }
      const raw=await aiChat(foreignTransSys(code), "Translate the following text. Return only the translation:\n"+text, 0.3, undefined, {maxTokens: 2048});
      return {word:false, source:text, translation:raw.trim(), meaning:"", usage:"", lang:code};
    }
    const t=await myMemory(text, code);
    return {word:isWord, source:text, translation:t, meaning:isWord?"(ترجمة آلية أساسية — المعنى التفصيلي بييجي مع المفتاح الذكي)":"", usage:"", basic:true, lang:code};
  }
  if(hasKey()){
    /* أسلوب الهدف العربي في المترجم السريع: من اختيار الأسلوب اللي جنبه وافتراضيه أسلوب الإعدادات — والمعنى بيضل شرح تعليمي بالمصري في الحالتين */
    const qStyle = sanitizeTStyle(($("#quickTStyleSel") && $("#quickTStyleSel").value) || settings.tStyle);
    if(isWord){
      const fusha = qStyle === "fusha";
      const raw=await aiChat(fusha ? "انت قاموس إنجليزي-عربي سريع." : "انت قاموس إنجليزي-مصري سريع.", "للكلمة الإنجليزية التالية رجّع JSON بس: {\"translation\":\"" + (fusha ? "الترجمة العربية الفصحى السليمة" : "الترجمة العربية") + "\",\"meaning\":\"المعنى ببساطة بالمصري\",\"usage\":\"مثال استخدام بسيط بالإنجليزية مع ترجمته بالمصري\"}\nالكلمة: "+text, 0.2, undefined, {maxTokens: 1024});
      const j=parseJSONLoose(raw);
      if(j) return {word:true, source:text, translation:j.translation||"", meaning:j.meaning||"", usage:j.usage||"", lang:"ar-EG"};
      return {word:true, source:text, translation:raw.trim(), meaning:"", usage:"", lang:"ar-EG"};
    }
    const raw = qStyle === "fusha"
      ? await aiChat(TRANS_SYS_FUSHA, "ترجم النص التالي ترجمة وفية بالعربية الفصحى الحديثة السليمة، نفس المعنى بالضبط، وأعد الترجمة فقط دون أي شرح:\n"+text, 0.3, undefined, {maxTokens: 2048})
      : await aiChat(TRANS_SYS, "ترجم النص التالي ترجمة وفية بأسلوب مصري بسيط وقوي، نفس المعنى بالظبط، ورجّع الترجمة بس من غير أي شرح:\n"+text, 0.3, undefined, {maxTokens: 2048});
    return {word:false, source:text, translation:raw.trim(), meaning:"", usage:"", lang:"ar-EG"};
  }
  const t=await myMemory(text);
  return {word:isWord, source:text, translation:t, meaning:isWord?"(ترجمة آلية أساسية — المعنى التفصيلي بييجي مع المفتاح الذكي)":"", usage:"", basic:true, lang:"ar-EG"};
}

/* ---------- 💾 نسخة احتياطية / استعادة (نقل المكتبة بين الأجهزة) ---------- */
function buildBackup(){
  const s = Object.assign({}, settings);
  delete s.key;    /* مفتاح الترجمة مبيطلعش من الجهاز أبدًا */
  delete s.elKey;  /* ولا مفاتيح الأصوات السحابية */
  delete s.azKey;
  delete s.gKey;
  let subState = null;
  try{ subState = {sub: JSON.parse(localStorage.getItem("mk_sub") || "null"), owner: JSON.parse(localStorage.getItem("mk_owner") || "null")}; }catch(e){}
  return {app: "kotobgy-backup", version: 1, exportedAt: new Date().toISOString(), books: books, settings: s, readstats: loadReadStats(), installId: getInstallId(), subState: subState};
}
function isValidBackup(o){ return !!o && typeof o === "object" && o.app === "kotobgy-backup" && Array.isArray(o.books); }
async function importBackupObject(o){
  await idbClear();
  books = [];
  for(const b of o.books){ if(b && b.id && Array.isArray(b.chunks)){ ensureBookExtras(b); await idbPut(b); books.push(b); } }
  if(o.settings && typeof o.settings === "object"){
    const keep = {key: settings.key, elKey: settings.elKey, azKey: settings.azKey, gKey: settings.gKey}; /* مفاتيح الجهاز الحالي بتفضل — النسخة مفيهاش مفاتيح أصلًا */
    settings = Object.assign({}, DEFSET, o.settings, keep);
    if(!TARGET_LANGS.some(t=>t.code === settings.targetLang)) settings.targetLang = "ar-EG";
    if(["device","eleven","azure","google"].indexOf(settings.ttsProvider) < 0) settings.ttsProvider = "device";
    saveSettings();
  }
  if(o.readstats) saveReadStats(o.readstats);
  if(o.installId) try{ localStorage.setItem("mk_install_id", String(o.installId)); }catch(e){}
  if(o.subState){
    try{
      if(o.subState.sub) localStorage.setItem("mk_sub", JSON.stringify(o.subState.sub)); else localStorage.removeItem("mk_sub");
      if(o.subState.owner) localStorage.setItem("mk_owner", JSON.stringify(o.subState.owner)); else localStorage.removeItem("mk_owner");
    }catch(e){}
  }
  currentId = null;
  clearLastOpen();
  await refreshSub();
}

/* ---------- 📏 مسطرة القراءة ---------- */
function updateRulerVisibility(){
  const b = currentBook();
  const on = !!settings.ruler && currentTabName === "reader" && !!b && !isBookLocked(b);
  document.body.classList.toggle("ruler-on", on);
  if(!on){ const r = $("#readRuler"); if(r) r.style.top = "-200px"; }
}
function moveRuler(clientY){
  if(!document.body.classList.contains("ruler-on")) return;
  const r = $("#readRuler"); if(!r) return;
  const h = r.offsetHeight || 90;
  r.style.top = Math.max(0, clientY - h / 2) + "px";
}

/* ---------- أحداث الواجهة ---------- */
function showTabMsg(id, txt, err){ const el=$(id); if(el){ el.textContent=txt; el.classList.toggle("err",!!err); } }
async function testConnection(){
  const msg=$("#connMsg"); const btn=$("#testConn");
  const key=($("#apiKey").value||"").trim();
  const base=(($("#apiBase").value||"").trim()||DEFSET.base).replace(/\/+$/,"");
  const model=($("#apiModel").value||"").trim()||DEFSET.model;
  if(!key && !isBuiltinAI(base)){ msg.textContent="حط مفتاح الـ API الأول في الخانة اللي فوق، وبعدين جرّب الاتصال."; msg.classList.add("err"); return; }
  msg.textContent="بيجرّب الاتصال…"; msg.classList.remove("err"); btn.disabled=true;
  try{
    /* نفس طريق الترجمة بالظبط: نفس الـ endpoint (chat/completions) ونفس شكل الطلب ونفس القيم اللي في الخانات —
       فنجاح الاختبار هنا معناه إن الترجمة نفسها هتشتغل، مش مجرد إن السيرفر بيرد على أي طلب */
    const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(), 20000);
    let out="";
    try{ out = await aiChat("You are a connection test. Reply with exactly: OK", "ping", 0, ctl.signal, {key:key, base:base, model:model, maxTokens:512, timeoutMs:20000}); }
    finally { clearTimeout(to); }
    if(out && out.trim()){ msg.textContent="نجح الاتصال ✔ المفتاح شغال والخدمة بترد — وطريق الترجمة نفسه اتجرّب واشتغل."; msg.classList.remove("err"); }
    else { msg.textContent="فشل الاتصال — الخدمة ردّت بردّ فاضي. جرّب تاني أو غيّر الموديل."; msg.classList.add("err"); }
  }catch(e){
    if(e && e.name === "AbortError"){ msg.textContent="فشل الاتصال — الطلب أخد وقت أطول من اللازم (مهلة ٢٠ ثانية)."; msg.classList.add("err"); }
    else{ logError("اختبار الاتصال", e); msg.textContent="فشل الاتصال — سبب التوقف: " + describeError(e) + " — اتأكد من المفتاح والإنترنت وحاول تاني."; msg.classList.add("err"); }
  } finally { btn.disabled=false; }
}
/* 📋 جلب الموديلات المتاحة لحساب المستخدم من الخدمة نفسها (GET /models بنفس مفتاح وصلاحية الشات) —
   الاختيار من القايمة بيكتب اسم الموديل في خانته بالظبط، فمفيش مجال لغلطة كتابة أو حالة حروف */
async function fetchAccountModels(){
  const msg=$("#modelsMsg"), btn=$("#btnFetchModels"), sel=$("#modelListSel");
  const key=($("#apiKey").value||"").trim() || (settings.key||"").trim();
  const base=((($("#apiBase").value||"").trim())||DEFSET.base).replace(/\/+$/,"");
  if(!key && !isBuiltinAI(base)){ msg.textContent="حط مفتاح الـ API الأول في خانة المفتاح اللي فوق، وبعدين هات الموديلات."; msg.classList.add("err"); return; }
  msg.textContent="بيجيب الموديلات المتاحة لحسابك…"; msg.classList.remove("err"); btn.disabled=true;
  try{
    const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(), 15000);
    const hdrs={}; if(key) hdrs["Authorization"]="Bearer "+key;
    const r=await fetch(base+"/models", {method:"GET", headers:hdrs, signal:ctl.signal});
    clearTimeout(to);
    if(!r.ok){
      const snip=await providerErrSnippet(r);
      const err=new Error("خدمة الـ API ردّت بخطأ " + r.status + (snip ? ": " + snip : "")); err.httpStatus=r.status;
      logError("قايمة الموديلات", err);
      msg.textContent="فشل جلب الموديلات — سبب التوقف: " + describeError(err); msg.classList.add("err");
      return;
    }
    const j=await r.json();
    const list=(j && Array.isArray(j.data)) ? j.data.map(m=>String((m && m.id) || "")).filter(Boolean) : [];
    if(!list.length){ msg.textContent="الخدمة مرجّعتش أي موديلات متاحة للحساب ده."; msg.classList.add("err"); return; }
    sel.innerHTML='<option value="">— اختار موديل من حسابك —</option>' + list.map(id=>'<option value="' + esc(id) + '">' + esc(id) + "</option>").join("");
    sel.classList.remove("hidden");
    msg.textContent="تمام ✔ لقينا " + list.length + " موديل متاح لحسابك — اختار واحد من القايمة وهيتكتب في خانة الموديل، وبعدين دوس «احفظ الإعدادات»."; msg.classList.remove("err");
  }catch(e){
    if(e && e.name === "AbortError"){ msg.textContent="جلب الموديلات أخد وقت أطول من اللازم — جرّب تاني."; msg.classList.add("err"); }
    else{ logError("قايمة الموديلات", e); msg.textContent="فشل جلب الموديلات — سبب التوقف: " + describeError(e); msg.classList.add("err"); }
  } finally { btn.disabled=false; }
}
document.addEventListener("DOMContentLoaded", async()=>{
  // وضع التخطيط (موبايل/كمبيوتر) بيتظبط قبل أي رسم عشان الشريط يطلع صح من أول لحظة
  applyLayoutMode();
  if(layoutMQ.addEventListener) layoutMQ.addEventListener("change", applyLayoutMode);
  else if(layoutMQ.addListener) layoutMQ.addListener(applyLayoutMode);
  // الثيم والخط وشكل القراءة (ثيم/خط قراءة/تباعد أسطر)
  applyAppearance();
  syncAppearanceControls();
  const fv0=$("#fontSizeVal"); if(fv0) fv0.textContent=settings.font||17;
  const tb0=$(".topbar"); if(tb0) document.documentElement.style.setProperty("--topbar-h", tb0.offsetHeight+"px");
  /* [D-04] نظام الطبقات: كل عنصر عائم بيتنقل لحاوية #overlay-root (بره حاوية القارئ) قبل أي تفاعل */
  const OVERLAY_FLOATERS=["updateBanner","resumeBar","readProgressTrack","readRuler","selPopup","sheetBackdrop","moreSheet","quizOverlay","wordSheet","appearanceCard","voiceCard","bookToolsCard","indexCard","readerBottomBar","readerDrawer","readerDrawerFab"];
  const overlayRootEl=$("#overlay-root");
  if(overlayRootEl) OVERLAY_FLOATERS.forEach(id=>{ const el=document.getElementById(id); const insideDrawer = el && el.id!=="readerDrawer" && el.closest("#readerDrawer"); if(el && el.parentNode!==overlayRootEl && !insideDrawer) overlayRootEl.appendChild(el); }); /* الساكن جوّه درج القارئ أصلًا (كارت الأدوات) ميتحركش من مكانه */
  /* [D-04] ارتفاع الشريط العام بيتقاس لحظيًا — مفيش قيمة قديمة تخلي أشرطة القارئ تطفو فوق النص */
  if(tb0 && "ResizeObserver" in window) new ResizeObserver(()=>{ document.documentElement.style.setProperty("--topbar-h", tb0.offsetHeight+"px"); }).observe(tb0);
  $("#apiKey").value=settings.key||""; $("#apiBase").value=settings.base||DEFSET.base; $("#apiModel").value=settings.model||DEFSET.model;
  const dts=$("#defTStyleSel"); if(dts){ dts.value=sanitizeTStyle(settings.tStyle); dts.addEventListener("change",()=>{ settings.tStyle=sanitizeTStyle(dts.value); saveSettings(); const b=currentBook(); if(b) renderReaderControls(b); showTabMsg("#settingsMsg","اتحفظ أسلوب الترجمة الافتراضي ✔"); }); }
  /* لهجة الشرح: اختيار واحد بيتزامن بين الإعدادات ودرج القارئ، وبيأثر في الشرح الجديد (القديم بيفضل محفوظ زي ما هو) */
  const syncExplDialect=(v)=>{ settings.explDialect=sanitizeExplDialect(v); saveSettings(); const a=$("#defExplDialectSel"); if(a) a.value=settings.explDialect; const c=$("#explDialectSel"); if(c) c.value=settings.explDialect; setExplainBtn(); showTabMsg("#settingsMsg","اتحفظت لهجة الشرح ✔"); };
  const deds=$("#defExplDialectSel"); if(deds){ deds.value=sanitizeExplDialect(settings.explDialect||"egyptian"); deds.addEventListener("change",()=>syncExplDialect(deds.value)); }
  const reds=$("#explDialectSel"); if(reds){ reds.value=sanitizeExplDialect(settings.explDialect||"egyptian"); reds.addEventListener("change",()=>syncExplDialect(reds.value)); }
  const qts=$("#quickTStyleSel"); if(qts) qts.value=sanitizeTStyle(settings.tStyle); /* المترجم السريع بيقرا قيمة الاختيار وقت الترجمة نفسها */
  $("#toneSelect").value=settings.tone||"calm"; $("#speedRange").value=settings.speed||1;
  if(!TARGET_LANGS.some(t=>t.code===settings.targetLang)) settings.targetLang="ar-EG";
  fillTargetSelect($("#targetLangSel"), settings.targetLang);
  fillTargetSelect($("#quickTargetSel"), settings.targetLang, false); /* المترجم السريع: لغات حقيقية بس — «النص الأصلي» مش هدف ترجمة */
  $("#quickTargetSel").addEventListener("change",()=>{ settings.targetLang=$("#quickTargetSel").value; saveSettings(); syncQuickStyle(false); });
  syncQuickStyle(true);
  updateBanner();
  renderErrLogUI();
  /* مستمع دوسات واحد مفوّض لحاوية الأجزاء كلها: كلمات قابلة للدوس + زرار «عرض أجزاء أكتر»
     (العناصر بتتعاد بناءها مع كل رسم — التفويض على الحاوية بيخليه ثابت ومفيش مستمعين متكررين) */
  const chunksEl=$("#chunks");
  if(chunksEl) chunksEl.addEventListener("click",(e)=>{
    const t=e.target;
    if(!t || !t.closest) return;
    if(t.closest("#btnMoreChunks")){ loadNextChunkPage(); return; }
    const sp=t.closest(".tapword");
    if(sp){ const b=currentBook(); if(b) openWordSheet(b, sp.dataset.w); }
  });
  $$(".tabbar button[data-tab]").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
  const bnm=$("#btnNavMore"); if(bnm) bnm.addEventListener("click",()=>{ const s=$("#moreSheet"); if(s && s.classList.contains("sheet-open")) closeMoreSheet(); else openMoreSheet(); });
  $("#backToLib").addEventListener("click",()=>switchTab("library"));
  const relBtn=$("#readerEmptyLib"); if(relBtn) relBtn.addEventListener("click",()=>switchTab("library"));
  const lsi=$("#libSearchInput"); if(lsi) lsi.addEventListener("input",()=>{ libSearchQuery=lsi.value.trim().toLowerCase(); renderLibrary(); });
  // شريط الأزرار اللي تحت الهيدر: رجوع / تحديث / ملفاتي / الإدارة
  $("#btnNavBack").addEventListener("click", navBack);
  $("#btnNavUpdate").addEventListener("click", ()=>{ appRefreshApp(); });
  $("#btnNavFiles").addEventListener("click", ()=>switchTab("files"));
  $("#btnNavAdmin").addEventListener("click", ()=>switchTab("admin"));
  /* أزرار الإدارة (تفعيل المالك/اللوحة/المولّد) مش موجودة في الصفحة وقت الإقلاع —
     بتتوصل وقت بناء محتوى الإدارة بعد فتح القفل (renderAdminContent) */
  $("#darkToggle").addEventListener("click",()=>{ const t=settings.theme||"light"; settings.theme=(t==="dark"||t==="black")?"light":"dark"; saveSettings(); applyAppearance(); syncAppearanceControls(); });
  // شكل القراءة: ثيمات / خط / تباعد / فهرس / وضع تركيز
  $$(".theme-swatch").forEach(b=>b.addEventListener("click",()=>setTheme(b.dataset.themeVal)));
  $("#readerFontSel").addEventListener("change",()=>{ settings.fontFamily=$("#readerFontSel").value; saveSettings(); applyAppearance(); });
  $("#lineHeightRange").addEventListener("input",()=>{ settings.lineHeight=parseFloat($("#lineHeightRange").value); saveSettings(); applyAppearance(); const lv=$("#lineHeightVal"); if(lv) lv.textContent=settings.lineHeight.toFixed(1); });
  $("#btnAppearance").addEventListener("click",()=>{ $("#appearanceBody").classList.toggle("hidden"); syncAppearanceControls(); });
  $("#btnIndex").addEventListener("click",()=>{ const p=$("#indexPanel"); p.classList.toggle("hidden"); if(!p.classList.contains("hidden")) renderIndexPanel(); });
  $("#bookSearch").addEventListener("input",()=>renderIndexPanel());
  $("#indexMarksOnly").addEventListener("change",()=>{ indexMarksOnly=$("#indexMarksOnly").checked; renderIndexPanel(); });
  $("#btnFocus").addEventListener("click",()=>{ if(document.fullscreenElement){ document.exitFullscreen().catch(()=>{}); } else { const el=$("#tab-reader"); if(el && el.requestFullscreen) el.requestFullscreen().catch(()=>{}); } });
  /* أرفف المكتبة: فلاتر */
  $$("#shelfChips button").forEach(b=>b.addEventListener("click",()=>{ shelfFilter=b.dataset.filter; renderLibrary(); }));
  /* 💬 اسأل الكتاب */
  $("#btnAskBook").addEventListener("click",()=>{ const p=$("#askPanel"); p.classList.toggle("hidden"); if(!p.classList.contains("hidden")){ renderAskPanel(); const inp=$("#askInput"); if(inp) inp.focus(); } });
  $("#askSend").addEventListener("click", sendAsk);
  $("#askInput").addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); sendAsk(); } });
  $("#askClear").addEventListener("click",async()=>{ const b=currentBook(); if(!b) return; if(!confirm("تمسح محادثة «اسأل الكتاب» للكتاب ده؟")) return; const oldChat=b.chat; b.chat=[]; try{ await idbPut(b); }catch(e){ b.chat=oldChat; logError("حفظ", e); const m=$("#askMsg"); if(m){ m.textContent="مسح المحادثة فشل — جرّب تاني."; m.classList.add("err"); } } renderAskPanel(b); });
  /* 📏 مسطرة القراءة */
  const rt=$("#rulerToggle"); if(rt){ rt.checked=!!settings.ruler; rt.addEventListener("change",()=>{ settings.ruler=rt.checked; saveSettings(); updateRulerVisibility(); }); }
  document.addEventListener("pointermove",e=>{ if(e.pointerType!=="touch") moveRuler(e.clientY); },{passive:true});
  document.addEventListener("touchmove",e=>{ if(e.touches && e.touches[0]) moveRuler(e.touches[0].clientY); },{passive:true});
  /* 💾 نسخة احتياطية / استعادة */
  $("#btnBackupExport").addEventListener("click",()=>{ download("kotobgy-backup.json", JSON.stringify(buildBackup(), null, 2)); showTabMsg("#backupMsg","اتنزّلت النسخة الاحتياطية ✔ احفظها في مكان أمان."); });
  $("#backupFile").addEventListener("change",async()=>{
    const f=$("#backupFile").files[0]; if(!f) return;
    try{
      const o=JSON.parse(await f.text());
      if(!isValidBackup(o)){ showTabMsg("#backupMsg","الملف ده مش نسخة احتياطية صالحة من كُتُبِي.", true); return; }
      if(!confirm("الاستيراد هيستبدل مكتبتك وبياناتك الحالية بالنسخة دي. أكمل؟")) return;
      await importBackupObject(o);
      showTabMsg("#backupMsg","اتاستوردت النسخة ✔ بيحدّث التطبيق…");
      setTimeout(()=>location.reload(), 700);
    }catch(e){ showTabMsg("#backupMsg","الاستيراد فشل: "+e.message, true); }
    $("#backupFile").value="";
  });
  /* 🔊 المزوّدات الصوتية السحابية: تهيئة الحقول والأزرار */
  $("#elKey").value=settings.elKey||""; $("#azKey").value=settings.azKey||""; $("#azRegion").value=settings.azRegion||""; $("#gKey").value=settings.gKey||"";
  fillElVoices(); fillAzVoices(); fillGVoices();
  $("#elModelSel").value=settings.elModel||"eleven_multilingual_v2";
  const syncElSliders=()=>{ $("#elStab").value=settings.elStability; $("#elStabVal").textContent=(+settings.elStability).toFixed(2); $("#elSim").value=settings.elSimilarity; $("#elSimVal").textContent=(+settings.elSimilarity).toFixed(2); $("#elSpeed").value=settings.elSpeed; $("#elSpeedVal").textContent=(+settings.elSpeed).toFixed(2); };
  syncElSliders();
  $("#elSaveKey").addEventListener("click",()=>{ settings.elKey=$("#elKey").value.trim(); saveSettings(); syncProviderUI(); showTabMsg("#elMsg","اتحفظ مفتاح ElevenLabs على جهازك ✔"); });
  $("#elTest").addEventListener("click", elFetchVoices);
  $("#elVoiceSel").addEventListener("change",()=>{ settings.elVoiceId=$("#elVoiceSel").value; saveSettings(); const b=currentBook(); if(b) refreshChunkAudioStates(b); });
  $("#elModelSel").addEventListener("change",()=>{ settings.elModel=$("#elModelSel").value; saveSettings(); });
  $("#elStab").addEventListener("input",()=>{ settings.elStability=parseFloat($("#elStab").value); saveSettings(); syncElSliders(); });
  $("#elSim").addEventListener("input",()=>{ settings.elSimilarity=parseFloat($("#elSim").value); saveSettings(); syncElSliders(); });
  $("#elSpeed").addEventListener("input",()=>{ settings.elSpeed=parseFloat($("#elSpeed").value); saveSettings(); syncElSliders(); });
  $("#azSaveKey").addEventListener("click",()=>{ settings.azKey=$("#azKey").value.trim(); settings.azRegion=$("#azRegion").value.trim(); saveSettings(); syncProviderUI(); showTabMsg("#azMsg","اتحفظ مفتاح Azure والريجن على جهازك ✔"); });
  $("#azTest").addEventListener("click", azFetchVoices);
  $("#azVoiceSel").addEventListener("change",()=>{ settings.azVoice=$("#azVoiceSel").value; saveSettings(); const b=currentBook(); if(b) refreshChunkAudioStates(b); });
  $("#gSaveKey").addEventListener("click",()=>{ settings.gKey=$("#gKey").value.trim(); saveSettings(); syncProviderUI(); showTabMsg("#gMsg","اتحفظ مفتاح Google على جهازك ✔"); });
  $("#gTest").addEventListener("click", gFetchVoices);
  $("#gVoiceSel").addEventListener("change",()=>{ settings.gVoice=$("#gVoiceSel").value; saveSettings(); const b=currentBook(); if(b) refreshChunkAudioStates(b); });
  $("#ttsProviderSel").addEventListener("change",()=>{ const v=$("#ttsProviderSel").value; if(v!=="device" && !providerReady(v)){ setAudioStatus("المزوّد ده محتاج مفتاح من الإعدادات الأول.", true); syncProviderUI(); return; } const wasEl=elActive; settings.ttsProvider=v; saveSettings(); if(wasEl) stopAllAudio("الصوت وقف."); syncProviderUI(); });
  syncProviderUI();
  /* التقاط آخر تحديد نص جوه جزء (احتياطي: ضغطة زرار الحفظ ممكن تضيّع التحديد الحي) */
  document.addEventListener("mouseup",()=>setTimeout(captureChunkSelection,30));
  document.addEventListener("touchend",()=>setTimeout(captureChunkSelection,300));
  /* وقت القراءة: بنعدّ كل 10 ثواني طول ما القارئ مفتوح والصفحة ظاهرة، وبنرحّل بالدقيقة */
  let readPendingSec=0;
  setInterval(()=>{
    if(document.visibilityState!=="visible" || currentTabName!=="reader" || !currentId) return;
    const b=currentBook(); if(!b || isBookLocked(b)) return;
    readPendingSec+=10;
    if(readPendingSec>=60){
      const mins=Math.floor(readPendingSec/60); readPendingSec-=mins*60;
      const s=loadReadStats(); const k=todayKey(); const beforeMin=s.byDay[k]||0;
      s.totalMin+=mins; s.byDay[k]=beforeMin+mins; saveReadStats(s);
      /* احتفال مرة واحدة في اليوم أول ما هدف القراية يتحقق */
      const goal=settings.dailyGoalMin||15;
      if(beforeMin < goal && s.byDay[k] >= goal){
        let shown=false; try{ shown = localStorage.getItem("mk_goal_day")===k; }catch(e){}
        if(!shown){
          try{ localStorage.setItem("mk_goal_day", k); }catch(e){}
          appToast("🎉 حققت هدف القراءة النهارده");
          if(currentTabName==="home") renderHomeStats();
        }
      }
    }
  },10000);
  $("#fontPlus").addEventListener("click",()=>changeFontSize(1));
  $("#fontMinus").addEventListener("click",()=>changeFontSize(-1));
  /* الصوت والنبرة: طي/فتح الكارت + تصدير/طباعة الكتاب الحالي من أدوات الكتاب */
  $("#btnVoice").addEventListener("click",()=>{ $("#voiceBody").classList.toggle("hidden"); });
  $("#btnExportBook").addEventListener("click",()=>{ const b=currentBook(); if(b) exportBook(b); });
  $("#btnPrintBook").addEventListener("click",()=>{ const b=currentBook(); if(b) printBook(b); });
  $("#saveSettings").addEventListener("click",()=>{ settings.key=$("#apiKey").value; settings.base=$("#apiBase").value.trim()||DEFSET.base; settings.model=$("#apiModel").value.trim()||DEFSET.model; saveSettings(); updateBanner(); showTabMsg("#settingsMsg","اتحفظت الإعدادات على جهازك ✔"); const b=currentBook(); if(b) renderReaderControls(b); });
  /* عيون إظهار/إخفاء حقول المفاتيح: المفاتيح بتفضل password افتراضيًا ومش بتتعرض كنص صريح غير بدوسة مقصودة */
  $$(".key-eye").forEach(b=>b.addEventListener("click",()=>{
    const inp = document.getElementById(b.dataset.eyeFor); if(!inp) return;
    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    b.textContent = show ? "🙈" : "👁";
  }));
  $("#btnWipe").addEventListener("click",async()=>{ if(confirm("مسح نهائي لكل الكتب والترجمات من الجهاز؟")){ stopAllAudio(); try{ await idbClear(); await idbClearAudio(); await idbPdfClear(); }catch(e){ logError("مسح البيانات", e); alert("المسح فشل — جرّب تاني."); return; } books=[]; currentId=null; savedWords=[]; saveWordsStore(); favs=new Set(); saveFavs(); try{ localStorage.removeItem(READSTATS_KEY); localStorage.removeItem("mk_goal_day"); }catch(e){} clearLastOpen(); renderLibrary(); renderGlossary(); renderHomeStats(); switchTab("library"); } });
  $("#testConn").addEventListener("click", testConnection);
  $("#btnFetchModels").addEventListener("click", fetchAccountModels);
  $("#modelListSel").addEventListener("change",()=>{ const v=$("#modelListSel").value; if(v) $("#apiModel").value=v; });
  $("#resumeBarBtn").addEventListener("click", resumeToLast);
  $("#resumeBannerBtn").addEventListener("click", resumeToLast);
  // الرئيسية: أكمِل القراءة + أزرار سريعة
  $("#homeResumeBtn").addEventListener("click", resumeToLast);
  $("#homeAdd").addEventListener("click", ()=>switchTab("library"));
  const hfl=$("#homeFreeLibrary"); if(hfl) hfl.addEventListener("click", openFreeLibrary);
  const ofl=$("#openFreeLibrary"); if(ofl) ofl.addEventListener("click", openFreeLibrary);
  const flb=$("#freeLibBack"); if(flb) flb.addEventListener("click", ()=>switchTab("library"));
  const fsf=$("#freeSourceForeign"); if(fsf) fsf.addEventListener("click", ()=>switchFreeSource("foreign"));
  const fsa=$("#freeSourceArabic"); if(fsa) fsa.addEventListener("click", ()=>switchFreeSource("arabic"));
  const fsb=$("#freeSearchBtn"); if(fsb) fsb.addEventListener("click", ()=>{ freeLibState.query=($("#freeSearchInput").value||"").trim(); loadFreeLibrary(true); });
  const fsi=$("#freeSearchInput"); if(fsi) fsi.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); freeLibState.query=fsi.value.trim(); loadFreeLibrary(true); } });
  $$("#freeCategoryChips button").forEach(b=>b.addEventListener("click",()=>{ freeLibState.category=b.dataset.freeCategory; $$("#freeCategoryChips button").forEach(x=>x.classList.toggle("active",x===b)); loadFreeLibrary(true); }));
  $$("#freeLangChips button").forEach(b=>b.addEventListener("click",()=>{ freeLibState.language=b.dataset.freeLang||""; $$("#freeLangChips button").forEach(x=>x.classList.toggle("active",x===b)); loadFreeLibrary(true); }));
  const flm=$("#freeLibMore"); if(flm) flm.addEventListener("click", ()=>loadFreeLibrary(false));
  const asb=$("#arSearchBtn"); if(asb) asb.addEventListener("click", ()=>{ arLibState.query=($("#arSearchInput").value||"").trim(); loadArabicLibrary(true); });
  const asi=$("#arSearchInput"); if(asi) asi.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); arLibState.query=asi.value.trim(); loadArabicLibrary(true); } });
  const alm=$("#arLibMore"); if(alm) alm.addEventListener("click", ()=>loadArabicLibrary(false));
  $("#homeQuick").addEventListener("click", ()=>switchTab("quick"));
  $("#homeFiles").addEventListener("click", ()=>switchTab("files"));
  $("#homeSub").addEventListener("click", ()=>switchTab("settings"));
  // التحديث + الموافقة + الصلاحيات
  initConsent();
  $("#consentBtn").addEventListener("click",()=>{
    if(!consentReadOnly){ try{ localStorage.setItem(CONSENT_KEY, JSON.stringify({v:CONSENT_VER, at:Date.now()})); }catch(e){} }
    hideConsent();
  });
  $("#btnShowTerms").addEventListener("click",()=>showConsent(true));
  $("#btnUpdateNow").addEventListener("click",()=>{
    if(swWaiting){
      reloadPending=true;
      swWaiting.postMessage({type:"SKIP_WAITING"});
      setTimeout(()=>{ if(!reloadDone){ reloadDone=true; location.reload(); } }, 2000); /* احتياطي لو الحدث اتأخر */
    }else location.reload();
  });
  $("#btnUpdateLater").addEventListener("click",()=>{ updateLaterDismissed=true; $("#updateBanner").classList.add("hidden"); });
  $("#btnNotifPerm").addEventListener("click",async()=>{ try{ if("Notification" in window) await Notification.requestPermission(); }catch(e){} renderPermStatus(); });
  /* تتبّع الجزء الظاهر أثناء التمرير في القارئ عشان «الرجوع للكتاب» يرجع لنفس المكان */
  let scrollTick=false;
  window.addEventListener("scroll", ()=>{
    if(scrollTick) return; scrollTick=true;
    setTimeout(()=>{
      scrollTick=false;
      const rt=$("#tab-reader"); if(!rt || !rt.classList.contains("active") || !currentId) return;
      const b=currentBook(); if(!b || isBookLocked(b)) return;
      const secs=$$("#chunks .chunk"); if(!secs.length) return;
      const mid=window.scrollY + window.innerHeight*0.4;
      let idx=0;
      /* رقم الجزء بييجي من الـ id نفسه مش من ترتيبه في القايمة — مع الترقيم المرسوم جزئي بس */
      for(let i=0;i<secs.length;i++){ const top=secs[i].getBoundingClientRect().top + window.scrollY; if(top<=mid) idx=parseInt(secs[i].id.slice(6),10)||0; else break; }
      const lo=getLastOpen();
      if(!lo || lo.bookId!==currentId || lo.chunkIndex!==idx) saveLastOpen(currentId, idx);
      updateReadProgress(b, idx);
    }, 150);
  }, {passive:true});
  /* تفريغ حفظ التقدّم المؤجّل قبل ما التبويب يختفي أو الصفحة تتقفل */
  document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState === "hidden" || document.hidden){ flushProgressSave(); /* [D-04] مفيش نافذة تنجو من الخروج والرجوع */ const ws=$("#wordSheet"); if(ws) ws.classList.add("hidden"); const sp=$("#selPopup"); if(sp) sp.classList.add("hidden"); } });
  window.addEventListener("pagehide", flushProgressSave);
  window.addEventListener("beforeunload", flushProgressSave);
  /* إخفاء كروم القارئ العائم (الشريط العلوي + شريط الإجراءات تحته) وانت نازل في القراءة:
     بيرجع مع أي طلوع أو عند القمة أو بلمسة على الورقة، وبيتعطّل في وضع التركيز (ملء الشاشة) */
  let lastHdrY = window.scrollY || 0;
  window.addEventListener("scroll", ()=>{
    const rd = $("#tab-reader"); if(!rd) return;
    if(currentTabName !== "reader" || document.fullscreenElement){ rd.classList.remove("chrome-scroll-hidden"); document.body.classList.remove("chrome-scroll-hidden"); lastHdrY = window.scrollY || 0; return; }
    const y = window.scrollY || 0;
    if(y < 80) rd.classList.remove("chrome-scroll-hidden");
    else if(y > lastHdrY + 6 && y > 160) rd.classList.add("chrome-scroll-hidden");
    else if(y < lastHdrY - 4) rd.classList.remove("chrome-scroll-hidden");
    lastHdrY = y;
    document.body.classList.toggle("chrome-scroll-hidden", rd.classList.contains("chrome-scroll-hidden")); /* [D-04] مرايا لـ body عشان الشريط العام (بره #tab-reader) يختفي هو كمان */
  }, {passive:true});
  /* لمسة على الورقة نفسها بتخفي/تظهر كل الكروم (الشريطين + الحبة) للانغماس — اللمس على أزرار أو كلمات أو تحديد نص مبيعملش حاجة */
  $("#tab-reader").addEventListener("click", (e)=>{
    if(e.target.closest("#readerTopbar, #readerActionBar, #readerBottomBar, #readerDrawer, #readerDrawerFab, #appearanceCard, #voiceCard, #bookToolsCard, #indexCard, #askPanel, #summaryCard, #quizOverlay, #lockCard, button, a, input, select, textarea, label, details, mark, .tapword, .annot-box")) return;
    try{ if(String(window.getSelection() || "").length) return; }catch(err){}
    const b = currentBook(); if(!b || isBookLocked(b)) return;
    $("#tab-reader").classList.toggle("chrome-off");
    document.body.classList.toggle("chrome-off", $("#tab-reader").classList.contains("chrome-off")); /* [D-04] مرايا لـ body */
  });
  /* أزرار الشريط العائم وقائمة الأدوات واللوحات */
  $("#btnReaderMenu").addEventListener("click", ()=>openReaderDrawer());
  const rdfab=$("#readerDrawerFab"); if(rdfab) rdfab.addEventListener("click", ()=>openReaderDrawer());
  const rdclose=$("#readerDrawerClose"); if(rdclose) rdclose.addEventListener("click", ()=>closeReaderPanels());
  $("#btnMenuVoice").addEventListener("click", ()=>openSheet("voice"));
  $("#btnReaderSearch").addEventListener("click", ()=>{ openIndexDrawer(); const s = $("#bookSearch"); if(s){ s.focus(); if(s.select) s.select(); } });
  $("#sheetBackdrop").addEventListener("click", ()=>{ closeReaderPanels(); closeMoreSheet(); });
  /* شريط التحكم السفلي: فهرس/مظهر/صوت بنفس لوحات الكروم، وثيم سريع بيلف على الثيمات الأربعة */
  $("#btnBarIndex").addEventListener("click", ()=>{ const ic = $("#indexCard"); if(ic && ic.classList.contains("drawer-open")) closeReaderPanels(); else openIndexDrawer(); });
  $("#btnBarAppearance").addEventListener("click", ()=>{ const c = $("#appearanceCard"); if(c && c.classList.contains("sheet-open")) closeReaderPanels(); else openSheet("appearance"); });
  $("#btnBarVoice").addEventListener("click", ()=>{ const c = $("#voiceCard"); if(c && c.classList.contains("sheet-open")) closeReaderPanels(); else openSheet("voice"); });
  $("#btnBarTheme").addEventListener("click", ()=>{ const cur = THEME_ORDER.indexOf(settings.theme || "light"); setTheme(THEME_ORDER[(cur + 1) % THEME_ORDER.length]); });
/* [R4] More-sheet proxies for the reader bottom bar */
$("#moreReaderTools")?.addEventListener("click", e => { const b = e.target.closest("[data-proxy]"); if (!b) return; const t = document.getElementById(b.dataset.proxy); if (!t) return; closeMoreSheet(); t.click(); });
  /* سكرولر التقدم: السحب بيعاين رقم الجزء بس، والترك بيقفز فعلًا (وبيرسم الصفحة لو لسه مترسمتش) */
  const scrubEl = $("#readScrubber");
  if(scrubEl){
    scrubEl.addEventListener("input", ()=>{ const b = currentBook(); if(!b) return; const sp = $("#scrubPos"); if(sp) sp.textContent = "جزء " + ((parseInt(scrubEl.value, 10) || 0) + 1) + " من " + b.chunks.length; });
    scrubEl.addEventListener("change", ()=>{ const b = currentBook(); if(!b || isBookLocked(b)) return; goToChunk(b, parseInt(scrubEl.value, 10) || 0); });
  }
  /* اختصارات كمبيوتر: ←/→ تنقّل بين الأجزاء، Ctrl+K بحث في الكتاب، Esc إغلاق اللوحات —
     ومتشتغلش أبدًا وانت بتكتب في أي خانة */
  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape"){ closeOpenPanels(); return; }
    const t = e.target;
    if(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if(currentTabName !== "reader") return;
    if(e.key === "ArrowLeft"){ e.preventDefault(); jumpChunkReader(1); }
    else if(e.key === "ArrowRight"){ e.preventDefault(); jumpChunkReader(-1); }
    else if((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")){
      e.preventDefault();
      openIndexDrawer();
      const s = $("#bookSearch"); if(s){ s.focus(); if(s.select) s.select(); }
    }
  });
  /* ملف جاي من قائمة مشاركة أندرويد (Web Share Target): الـ Service Worker خزّنه في كاش المشاركة —
     بنستهلكه هنا وبنستورده بنفس مسار رفع الملفات. لو المنصة مش بتدعم، مفيش حاجة بتتكسر */
  (async ()=>{ try{
    if(!("caches" in window)) return;
    if(new URLSearchParams(location.search).get("import") !== "shared") return;
    const cache = await caches.open("motarjem-shared-v1");
    const res = await cache.match("/shared-file"); if(!res) return;
    const nameRes = await cache.match("/shared-name");
    const name = nameRes ? (decodeURIComponent(await nameRes.text()) || "shared.pdf") : "shared.pdf";
    const blob = await res.blob();
    await cache.delete("/shared-file"); await cache.delete("/shared-name");
    try{ history.replaceState(null, "", location.pathname); }catch(e){}
    const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
    switchTab("library");
    await importBookFile(file);
  }catch(e){} })();

  // إضافة كتب
  $("#addByPaste").addEventListener("click",async()=>{ try{ const b=await addBook($("#bookTitle").value.trim(), $("#pasteText").value, "paste"); showTabMsg("#addMsg","اتضاف «"+b.title+"» ✔ افتحه من المكتبة تحت."+cleanNote(b)); $("#pasteText").value=""; renderLibrary(); }catch(e){ showTabMsg("#addMsg","مشكلة: "+e.message, true); } });
  /* حارس تزامن الاستيراد: اختيار ملف بيستورد على طول، ولو المستخدم دوس «ضيف من الملف» والاستيراد شغال
     كانت بتبدأ نسخة تانية متوازية بتكسر مرجع شغلانة الـ OCR وتسيب الأولى معلّقة للأبد — فأي استيراد
     جديد أثناء واحد شغال بيتجاهل برسالة واضحة، وقيمة الحقل بتتصفّر قبل الانتظار مش بعده */
  let bookImportInFlight = false;
  $("#addByFile").addEventListener("click",async()=>{
    const fi=$("#fileInput");
    const f=fi.files[0]; if(!f){ showTabMsg("#addMsg","اختار ملف الأول.", true); return; }
    if(bookImportInFlight){ showTabMsg("#addMsg","فيه كتاب بيتحضّر دلوقتي — استنى لما يخلص الأول.", true); return; }
    fi.value="";
    bookImportInFlight = true;
    try{ await importBookFile(f); }
    catch(e){ showTabMsg("#addMsg","مشكلة في الملف: "+e.message, true); }
    finally{ bookImportInFlight = false; }
  });
  /* اختيار ملف من منتقي الجهاز/Drive: الاختيار نفسه بيستورد الكتاب وبيفتحه — من غير ما يستنى زرار «ضيف من الملف».
     قيمة الحقل بتتصفّر قبل بدء الاستيراد (مش بعده) عشان الدوس على «ضيف من الملف» أثناء الشغل ميبدأش استيراد تاني */
  $("#fileInput").addEventListener("change",async()=>{
    const fi=$("#fileInput");
    const f=fi.files && fi.files[0];
    if(f){
      if(bookImportInFlight){ showTabMsg("#addMsg","فيه كتاب بيتحضّر دلوقتي — استنى لما يخلص الأول.", true); fi.value=""; return; }
      fi.value="";
      bookImportInFlight = true;
      try{ await importBookFile(f); }
      catch(e){ showTabMsg("#addMsg","مشكلة في الملف: "+e.message, true); }
      finally{ bookImportInFlight = false; }
    } else { fi.value=""; }
  });
  $("#addByDrive").addEventListener("click",async()=>{
    const link=$("#driveLink").value.trim(); if(!link){ showTabMsg("#driveMsg","الزق لينك Drive الأول.", true); return; }
    try{
      showTabMsg("#driveMsg","بيستورد من Drive…");
      const imported=await importDrive(link);
      const text=imported.text;
      const pdfOpts=imported.pages ? {pages: imported.pages, pageCount: imported.pageCount} : null;
      const b=await addBook($("#bookTitle").value.trim()||"كتاب من Drive", text, "drive", pdfOpts);
      let pdfNote = "";
      if(imported.pdfBlob){ try{ pdfNote = await savePdfOriginal(b.id, imported.pdfBlob); }catch(e){ logError("pdf-original", e); } }
      const dom = driveOcrMeta; driveOcrMeta = null;
      if(dom){ b.ocr = true; b.ocrInfo = dom; try{ await idbPut(b); }catch(e){} }
      showTabMsg("#driveMsg","اتستورد واتضاف «"+b.title+"» ✔"+cleanNote(b)+pdfNote+(dom ? " — ونصه اتعمل بتعرف ضوئي (OCR) 📷" : "")); renderLibrary();
      await openBook(b.id);
      if(dom) offerOcrAiRepair(b);
    }catch(e){
      if(/drive\.google\.com/i.test(link)) showTabMsg("#driveMsg","جوجل درايف مانع الجلب المباشر — نزّل الملف وبعدين اختره من «استيراد من Google Drive».", true);
      else showTabMsg("#driveMsg","الاستيراد فشل: "+e.message+" — اتأكد إن مشاركة الملف على Drive مضبوطة على «أي شخص معه الرابط» (Anyone with the link) وحاول تاني، أو افتح الملف في Drive ونزّله وارفعه من «ارفع ملف».", true);
    }
  });
  /* صف مصادر الإضافة: نفس منتقي ملفات الجهاز لكل الطرق — ودرايف بيظهر جوّه على أندرويد */
  const pickDeviceFile = ()=>{ const fi=$("#fileInput"); if(fi){ try{ fi.click(); }catch(e){} } };
  $("#srcUpload").addEventListener("click", pickDeviceFile);
  $("#srcDrive").addEventListener("click", ()=>{ const h=$("#driveImportHint"); if(h) h.classList.remove("hidden"); pickDeviceFile(); });
  $("#srcLink").addEventListener("click", ()=>{ const d=$("#driveLink"); if(d){ d.scrollIntoView({block:"center"}); d.focus(); } });
  $("#filesDriveBtn").addEventListener("click", ()=>{ switchTab("library"); const h=$("#driveImportHint"); if(h) h.classList.remove("hidden"); pickDeviceFile(); });

  // القارئ
  $("#btnTranslate").addEventListener("click",()=>{ const b=currentBook(); if(!b) return; startTranslateForBook(b); });
  $("#btnExplainBook").addEventListener("click",()=>{ const b=currentBook(); if(!b) return; if(explaining){ stopExplainBook(); setTransStatus("⏸ بيوقف الشرح…"); return; } explainBook(b); });
  $("#btnQuiz").addEventListener("click",()=>{ const b=currentBook(); if(b) startQuiz(b, false); });
  /* تغيير لغة ترجمة الكتاب: المنطق في changeBookTargetLang — التبديل لـ/من «النص الأصلي» بيحتفظ بالترجمات ومبيبنهاش بس */
  $("#targetLangSel").addEventListener("change", async ()=>{
    const b=currentBook(); const sel=$("#targetLangSel"); if(!b || !sel) return;
    const ok = await changeBookTargetLang(b, sel.value);
    if(!ok) sel.value = bookTargetLang(b);
  });
  /* تغيير أسلوب ترجمة الكتاب: المنطق في changeBookTStyle — نفس تأكيد ومسح تغيير اللغة، والإلغاء بيرجّع الاختيار لأسلوب الكتاب */
  $("#tStyleSel").addEventListener("change", async ()=>{
    const b=currentBook(); const sel=$("#tStyleSel"); if(!b || !sel) return;
    const ok = await changeBookTStyle(b, sel.value);
    if(!ok) sel.value = bookTStyle(b);
  });
  $("#finishByInput").addEventListener("change", async ()=>{
    const b=currentBook(); if(!b) return;
    const prevFinish = b.finishBy;
    b.finishBy = $("#finishByInput").value || "";
    ensureBookExtras(b);
    try{ await idbPut(b); }
    catch(e){ b.finishBy = prevFinish; logError("حفظ", e); renderReaderControls(b); setTransStatus("حفظ خطة الإنهاء فشل — جرّب تاني.", true); return; }
    renderReaderControls(b); renderLibrary();
    const plan = finishPlan(b);
    setTransStatus(!b.finishBy ? "اتشالت خطة الإنهاء" : (plan && plan.done ? "الكتاب خلصان أصلًا — مبروك 🎉" : plan && plan.overdue ? "التاريخ ده عدى — عدّله لتاريخ جاي أو كمل على مهلك" : "اتظبطت الخطة: هدفك " + (plan ? plan.daily : 0) + " أجزاء في اليوم ✔"));
  });
  $("#quizClose").addEventListener("click", closeQuiz);
  $("#quizNew").addEventListener("click",()=>{ const b=currentBook(); if(b) startQuiz(b, true); });
  $("#wordClose").addEventListener("click", closeWordSheet);
  $("#wordSpeak").addEventListener("click", speakSheetWord);
  $("#wordSave").addEventListener("click", saveSheetWord);
  /* مسح ترجمات الكتاب الحالي كلها (للترجمات القديمة البايظة مثلًا) — الأصل بيفضل زي ما هو */
  $("#btnClearTrans").addEventListener("click", async ()=>{
    const b=currentBook(); if(!b) return;
    if(translating || repairing){ setTransStatus("فيه شغل شغال دلوقتي — وقّفه أو استنى يخلص الأول"); return; }
    if(!b.chunks.some(c=>c.trans && c.trans.trim())){ setTransStatus("مفيش ترجمات محفوظة تتمسح"); return; }
    if(!confirm("هتمسح كل ترجمات وشرح الكتاب ده المحفوظة وترجع للأصل بس. أكمل؟")) return;
    clearBookTranslations(b);
    await idbPut(b);
    renderReader(b); renderLibrary();
    setTransStatus("اتمسحت ترجمات الكتاب — النص الأصلي زي ما هو.");
  });
  $("#btnStopTrans").addEventListener("click",()=>{ if(!translating){ setTransStatus("مفيش ترجمة شغالة دلوقتي — الزرار بيشتغل أوتوماتيك أول ما الترجمة تبدأ"); return; } stopFlag=true; if(transRun) transRun.stop(); setTransStatus("⏸ بيوقف الترجمة…"); });
  $("#btnReloadBook").addEventListener("click",()=>{ reloadCurrentBook(); });
  /* استرجاع النص الأصلي المحفوظ: بيرجع النص زي ما كان قبل التحسين/الإصلاح ويمسح المشتقات المرتبطة بالنص الحالي */
  $("#btnRestoreOrig").addEventListener("click", async ()=>{
    const b=currentBook(); if(!b) return;
    if(translating || repairing){ setTransStatus("فيه شغل شغال دلوقتي — وقّفه أو استنى يخلص الأول"); return; }
    if(!Array.isArray(b.origChunks)){ if(snapshotOrigIfNeeded(b)) await idbPut(b); setTransStatus("النص الحالي هو الأصلي أصلًا — مفيش حاجة ترجع"); return; }
    if(!origDiffers(b)){ setTransStatus("النص الحالي هو الأصلي أصلًا — مفيش حاجة ترجع"); return; }
    if(!confirm("هترجع نص الكتاب الأصلي زي ما كان قبل التحسين/الإصلاح، وهتتمسح الترجمات والشرح والتظليلات المرتبطة بالنص الحالي. أكمل؟")) return;
    await restoreOriginal(b);
  });
  $("#btnCleanup").addEventListener("click",()=>{ const b=currentBook(); if(b) cleanupBook(b); });
  $("#btnRepair").addEventListener("click",()=>{ const b=currentBook(); if(b) repairBook(b); });
  $("#btnStopRepair").addEventListener("click",()=>{ repairStop=true; if(repairRun) repairRun.stop(); setTransStatus("⏸ بيوقف الإصلاح…"); });
  $("#btnSummary").addEventListener("click",async()=>{
    const b=currentBook(); if(!b) return;
    const pts=b.chunks.flatMap(c=>c.keyPoints||[]);
    try{
      if(hasKey() && (pts.length || b.chunks.some(c=>c.trans))){
        const src = pts.length? pts.join("\n") : b.chunks.map(c=>c.trans).join("\n").slice(0,6000);
        b.summary=await aiChat(EXPL_SYS, "لخّص الكتاب التالي بالمصري الشيق البسيط في فقرة مركزة، من المحتوى ده بس ومن غير إضافات خارجية:\n"+src, 0.4, undefined, {maxTokens: 2048});
      } else if(pts.length){ b.summary="أهم نقط الكتاب: "+pts.join("؛ ")+"."; }
      else { alert("الملخص محتاج أجزاء مترجمة فيها أهم نقط — كمّل الترجمة الأول."); return; }
      await idbPut(b); renderSummary(b);
    }catch(e){ alert("الملخص وقف: "+e.message); }
  });
  $("#toneSelect").addEventListener("change",()=>{ settings.tone=$("#toneSelect").value; saveSettings(); autoMatchVoiceForTone(settings.tone); const b=currentBook(); if(b){ const lim = (pagerBookId === b.id) ? Math.min(renderedUpTo, b.chunks.length) : 0; for(let i=0;i<lim;i++) renderChunk(b,i); } });
  $("#speedRange").addEventListener("input",()=>{ settings.speed=parseFloat($("#speedRange").value); saveSettings(); const ea=$("#elAudio"); if(ea) ea.playbackRate=settings.speed; });
  $("#btnPlayTrans").addEventListener("click",()=>{ const b=currentBook(); if(!b) return; const items=[]; b.chunks.forEach((c,ci)=>{ if(c.status==="done") items.push(Object.assign(transSpeakItem(b, c.trans), {bookId:b.id, chunkIdx:ci, kind:"trans"})); }); if(!items.length){ setAudioStatus("لسه مفيش أجزاء مترجمة تسمعها.", true); return; } playVoiceItems(items,"ترجمة الكتاب"); });
  $("#btnPlayBookExplain").addEventListener("click",async()=>{
    const b=currentBook(); if(!b) return;
    const gen=audioGen; /* لو المستخدم وقّف الصوت أو شغّل حاجة تانية أثناء التجهيز، الإعداد بيتلغي ومبيبدأش نطق */
    try{
      setAudioStatus("بيجهّز شروحات الكتاب…");
      const items=[];
      for(let i=0;i<b.chunks.length;i++){
        if(gen!==audioGen){ setAudioStatus("الصوت وقف."); return; }
        if(b.chunks[i].status==="done"){ const t=await makeExplanation(b,i); if(t) items.push({text:t,lang:"ar",bookId:b.id, chunkIdx:i, kind:"explain"}); }
      }
      if(gen!==audioGen){ setAudioStatus("الصوت وقف."); return; }
      if(!items.length){ setAudioStatus("مفيش شروحات جاهزة — كمّل الترجمة الأول.", true); return; }
      playVoiceItems(items,"شرح الكتاب");
    }catch(e){ if(gen===audioGen) setAudioStatus("الشرح الصوتي وقف: "+e.message, true); }
  });
  $("#btnPauseAudio").addEventListener("click",()=>{ if(elActive){ const a=$("#elAudio"); if(a) a.pause(); return; } if("speechSynthesis" in window) speechSynthesis.pause(); });
  $("#btnResumeAudio").addEventListener("click",()=>{ if(elActive){ const a=$("#elAudio"); if(a){ const p=a.play(); if(p && p.catch) p.catch(()=>{}); } return; } if("speechSynthesis" in window) speechSynthesis.resume(); });
  $("#btnElFallback").addEventListener("click",()=>{ const f=elFallbackItems; elFallbackItems=null; $("#btnElFallback").classList.add("hidden"); if(f) speakItems(f.items, f.label); });
  $("#sleepTimerSel").addEventListener("change",()=>setSleepMode($("#sleepTimerSel").value));
  $("#btnStopAudio").addEventListener("click",()=>{ stopAllAudio("الصوت وقف."); });

  // القاموس
  $("#glossSearch").addEventListener("input",renderGlossary);
  $("#glossFavOnly").addEventListener("change",renderGlossary);

  // مترجم سريع
  $("#btnQuick").addEventListener("click",async()=>{
    const v=$("#quickInput").value; const res=$("#quickResult");
    if(!v.trim()){ res.textContent="اكتب كلمة أو جملة الأول."; return; }
    res.textContent="بيترجم…";
    try{
      lastQuick=await quickTranslate(v);
      res.textContent = (lastQuick.word?
        ("الترجمة: "+lastQuick.translation+(lastQuick.meaning?"\nالمعنى: "+lastQuick.meaning:"")+(lastQuick.usage?"\nالاستخدام: "+lastQuick.usage:"")):
        lastQuick.translation) + (lastQuick.basic?"\n(ترجمة آلية أساسية)":"");
      $("#btnQuickSave").disabled = !lastQuick.word;
      $("#btnQuickListen").disabled = false;
    }catch(e){ res.textContent="الترجمة وقفت: "+e.message; }
  });
  $("#btnQuickSave").addEventListener("click",()=>{ if(!lastQuick||!lastQuick.word) return; if(!savedWords.some(w=>w.english.toLowerCase()===lastQuick.source.toLowerCase())){ savedWords.push({english:lastQuick.source, arabic:lastQuick.translation, explanation:[lastQuick.meaning,lastQuick.usage].filter(Boolean).join(" — ")}); saveWordsStore(); } alert("اتحفظت في قاموسك ✔ هتلاقيها في تبويب القاموس."); });
  $("#btnQuickListen").addEventListener("click",()=>{ if(!lastQuick) return; const items=[{text:lastQuick.source,lang:"en"}]; if(lastQuick.lang && lastQuick.lang!=="ar-EG") items.push({text:lastQuick.translation, lang:lastQuick.lang.split("-")[0], langFull:lastQuick.lang}); else items.push({text:lastQuick.translation,lang:"ar"}); playVoiceItems(items,"المترجم السريع"); });

  // تحديد نص في الأصل → ترجمة فورية
  const showSel=()=>{
    const sel=window.getSelection(); if(!sel || sel.isCollapsed) return;
    const txt=sel.toString().trim(); if(txt.length<2 || txt.length>400) return;
    let node=sel.anchorNode; let inside=false;
    while(node){ if(node.nodeType===1 && node.classList && node.classList.contains("orig")){ inside=true; break; } node=node.parentNode; }
    if(!inside) return;
    /* [D-04] تحديد كلمة واحدة بيروح لورقة الكلمة (مسار دوسة الكلمة) — واجهة تطبيق واحدة، من غير ما نزاحم شريط التحديد */
    if(!/\s/.test(txt) && txt.length<=24){ const bk=currentBook(); if(bk){ openWordSheet(bk, txt); return; } }
    $("#selText").textContent=txt; $("#selResult").textContent="";
    $("#selPopup").dataset.text=txt;
    $("#selPopup").classList.remove("hidden");
  };
  document.addEventListener("mouseup",()=>setTimeout(showSel,50));
  document.addEventListener("touchend",()=>setTimeout(showSel,350));
  $("#selClose").addEventListener("click",()=>$("#selPopup").classList.add("hidden"));
  $("#selTranslate").addEventListener("click",async()=>{
    const txt=$("#selPopup").dataset.text||""; const res=$("#selResult"); res.textContent="بيترجم…";
    try{ const q=await quickTranslate(txt, "ar-EG"); res.textContent=q.translation+(q.meaning?"\n"+q.meaning:""); }
    catch(e){ res.textContent="وقفت: "+e.message; }
  });

  // التثبيت
  let deferredPrompt=null;
  window.addEventListener("beforeinstallprompt",e=>{ e.preventDefault(); deferredPrompt=e; $("#btnInstall").classList.remove("hidden"); });
  $("#btnInstall").addEventListener("click",async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $("#btnInstall").classList.add("hidden"); } });

  if("speechSynthesis" in window){ speechSynthesis.onvoiceschanged=renderVoices; renderVoices(); }

  try{ books=await idbAll(); }catch(e){ books=[]; }
  getInstallId();
  trialStart(); /* بداية الفترة التجريبية (يومين) بتتسجل من أول تشغيل للنسخة دي */
  await refreshSub();
  renderLibrary();
  renderHomeStats();
  renderSubPanels();
  /* [F] فحص الإصلاح الذاتي عند الإقلاع: وصفات آمنة تلقائية + سجل ظاهر في لوحة الصحة (الإدارة) */
  if(window.KutubiHealth) KutubiHealth.bootRun().then(r=>{ if(r && r.booksChanged) renderLibrary(); }).catch(()=>{});

  initServiceWorker();
});

/* ---------- إشعار تحديث التطبيق (Service Worker update flow) ---------- */
let swReg=null, swWaiting=null, updateLaterDismissed=false, updateNotified=false, reloadPending=false, reloadDone=false;
function showUpdateBanner(){
  const b=$("#updateBanner"); if(!b) return;
  if(!updateNotified){
    updateNotified=true;
    if(swReg && "Notification" in window && Notification.permission==="granted"){
      try{ swReg.showNotification("كُتُبِي", {body:"فيه تحديث جديد جاهز — افتح التطبيق وحدّث.", icon:"icons/icon-192.png"}); }catch(e){}
    }
  }
  if(updateLaterDismissed) return; /* «لاحقًا» بتخفيه لباقي الجلسة بس */
  b.classList.remove("hidden");
}
let appToastTimer=null; /* [D-04] التوست بقى عنصر #appToast على حافة الشاشة — مش سطر جوه الشريط بيكبّره وبيزحلق النص */
function appToast(t){ const el = $("#appToast"); if(!el) return; el.textContent = t || ""; el.classList.add("show"); clearTimeout(appToastTimer); appToastTimer = setTimeout(()=>el.classList.remove("show"), 2000); }
/* إعادة قراءة الإعدادات من localStorage (تحديث حقيقي: أي تعديل محفوظ برّه الذاكرة الحالية بيبان) */
function reloadSettingsFromStorage(){
  try{ const s = JSON.parse(localStorage.getItem("motarjem-settings")||"{}"); settings = Object.assign({}, DEFSET, s); }catch(e){}
  if(String(settings.model || "").trim().toLowerCase() === KNOWN_BAD_MODEL){ settings.model = GOOD_DEFAULT_MODEL; }
  if(!TARGET_LANGS.some(t=>t.code===settings.targetLang)) settings.targetLang = "ar-EG";
  settings.tStyle = sanitizeTStyle(settings.tStyle);
  applyAppearance(); syncAppearanceControls();
  const set = (id, v)=>{ const el = $(id); if(el) el.value = (v == null ? "" : v); };
  set("#apiKey", settings.key || ""); set("#apiBase", settings.base || DEFSET.base); set("#apiModel", settings.model || DEFSET.model);
  set("#defTStyleSel", settings.tStyle);
  set("#defExplDialectSel", sanitizeExplDialect(settings.explDialect||"egyptian"));
  set("#explDialectSel", sanitizeExplDialect(settings.explDialect||"egyptian"));
  set("#toneSelect", settings.tone || "calm"); set("#speedRange", settings.speed || 1);
  set("#elKey", settings.elKey || ""); set("#azKey", settings.azKey || ""); set("#azRegion", settings.azRegion || ""); set("#gKey", settings.gKey || "");
  const fv = $("#fontSizeVal"); if(fv) fv.textContent = settings.font || 17;
  const rt = $("#rulerToggle"); if(rt) rt.checked = !!settings.ruler;
  const tb = $(".topbar"); if(tb) document.documentElement.style.setProperty("--topbar-h", tb.offsetHeight + "px");
}
/* ⟳ تحديث = ريفريش كامل للتطبيق والصفحة (مش مجرد فحص نسخة):
   بيوقف أي ترجمة/شرح/إصلاح وصوت شغالين، يعيد قراءة كل البيانات من التخزين،
   يعيد رسم العرض الحالي من الصفر مع الحفاظ على الكتاب المفتوح وموضع القراءة،
   وبعدين يفحص نسخة أحدث (البانر بيظهر لو فيه SW مستني) — وبيأكّد برسالة «تم التحديث 🔄» */
/* هيكل تحميل وامض بيظهر فوق التبويب الحالي أثناء الريفريش (فيه فجوات async حقيقية: إيقاف + قراءة تخزين) */
function showRefreshSkeleton(on){
  const old = document.getElementById("refreshSkeleton"); if(old) old.remove();
  if(!on) return;
  const tab = document.querySelector(".tab.active"); if(!tab) return;
  const d = document.createElement("div"); d.id = "refreshSkeleton"; d.className = "skel skel-block"; d.setAttribute("aria-hidden", "true");
  tab.insertBefore(d, tab.firstChild);
}
async function appRefreshApp(){
  showRefreshSkeleton(true);
  if(translating){ stopFlag = true; if(transRun) transRun.stop(); }
  if(repairing){ repairStop = true; if(repairRun) repairRun.stop(); }
  if(explaining){ stopExplainBook(); }
  stopAllAudio();
  await new Promise(r=>setTimeout(r, 200)); /* فرصة للحلقات الواقفة تثبّت حالتها قبل إعادة القراءة */
  reloadSettingsFromStorage();
  try{ books = await idbAll(); }catch(e){ books = []; }
  await refreshSub();
  await refreshOwner();
  updateBanner();
  renderSubPanels();
  const tab = currentTabName;
  switchTab(tab, true); /* إعادة رسم العرض الحالي من الصفر من غير ما نغيّر التبويب أو سجل الرجوع */
  renderLibrary();
  if(tab === "reader"){
    const b = currentBook();
    if(b && !isBookLocked(b)){
      const lo = getLastOpen();
      let idx = (lo && lo.bookId === b.id) ? (lo.chunkIndex || 0) : 0;
      if(idx < 0 || idx >= b.chunks.length) idx = 0;
      ensureChunksRendered(b, idx);
      const el = document.getElementById("chunk-" + idx);
      if(el) setTimeout(()=>el.scrollIntoView({block:"start"}), 80);
    }
  }
  if(window.checkForUpdate) window.checkForUpdate(false); /* فحص نسخة: لو فيه تحديث مستني البانر بيظهر فوق الريفريش نفسه */
  showRefreshSkeleton(false);
  appToast("تم التحديث 🔄");
}
/* فحص تحديث يدوي من زرار «🔄 تحديث» — بيستخدم نفس ماكينة إشعار التحديث */
window.checkForUpdate = async function(manual){
  if(swWaiting){ showUpdateBanner(); if(manual) appToast("فيه تحديث جاهز — دوس «حدّث دلوقتي» من الشريط اللي فوق."); return; }
  if(!swReg){ if(manual) appToast("النسخة دي لسه بتتحمّل — استنى ثواني وجرّب تاني."); return; }
  if(manual) appToast("بيدوّر على تحديث…");
  try{ await swReg.update(); }catch(e){}
  setTimeout(()=>{
    if(swWaiting){ showUpdateBanner(); if(manual) appToast("لقينا تحديث — دوس «حدّث دلوقتي» من الشريط اللي فوق."); }
    else if(manual) appToast("انت على أحدث نسخة ✔");
  }, 1200);
};
function initServiceWorker(){
  if(!("serviceWorker" in navigator)) return;
  if(!(location.protocol==="https:" || location.hostname==="localhost")) return;
  navigator.serviceWorker.addEventListener("controllerchange", ()=>{
    if(reloadPending && !reloadDone){ reloadDone=true; location.reload(); }
  });
  navigator.serviceWorker.register("sw.js").then((reg)=>{
    swReg=reg;
    if(reg.waiting && navigator.serviceWorker.controller){ swWaiting=reg.waiting; showUpdateBanner(); }
    reg.addEventListener("updatefound", ()=>{
      const nw=reg.installing; if(!nw) return;
      nw.addEventListener("statechange", ()=>{
        if(nw.state==="installed" && navigator.serviceWorker.controller){ swWaiting=nw; showUpdateBanner(); }
      });
    });
    reg.update().catch(()=>{});
    document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") reg.update().catch(()=>{}); });
    setInterval(()=>{ reg.update().catch(()=>{}); }, 30*60*1000);
  }).catch(()=>{});
}

/* ---------- الموافقة على شروط الخدمة (أول تشغيل) ---------- */
const CONSENT_KEY="motarjem-consent", CONSENT_VER=2;
let consentReadOnly=false;
function consentAccepted(){
  try{ const c=JSON.parse(localStorage.getItem(CONSENT_KEY)||"null"); return !!(c && c.v>=CONSENT_VER); }catch(e){ return false; }
}
function showConsent(readOnly){
  consentReadOnly=!!readOnly;
  $("#consentBtn").textContent = consentReadOnly ? "إغلاق" : "أوافق على الشروط وأبدأ";
  $("#consentModal").classList.remove("hidden");
}
function hideConsent(){ $("#consentModal").classList.add("hidden"); }
function initConsent(){ if(!consentAccepted()) showConsent(false); }

/* ---------- صلاحيات الدخول (حالة حقيقية من المتصفح، من غير مفاتيح وهمية) ---------- */
async function permQueryState(name){
  try{
    if(!navigator.permissions || !navigator.permissions.query) return null;
    const st=await navigator.permissions.query({name:name});
    return st.state;
  }catch(e){ return null; }
}
function permStateText(state){
  if(state==="granted") return "مسموحة ✔";
  if(state==="denied") return "مرفوضة ✖";
  return "بتتطلب عند الاستخدام";
}
async function renderPermStatus(){
  const ns=$("#notifStatus"); if(!ns) return;
  const btn=$("#btnNotifPerm");
  if(!("Notification" in window)){
    ns.textContent="المتصفح ده مش بيدعم الإشعارات";
    if(btn) btn.classList.add("hidden");
  }else{
    const p=Notification.permission;
    ns.textContent = p==="granted" ? "مفعّلة ✔" : (p==="denied" ? "مرفوضة ✖" : "لسه متطلبتش");
    if(btn) btn.disabled = (p==="granted");
  }
  const mic=$("#micStatus"); if(mic) mic.textContent=permStateText(await permQueryState("microphone"));
  const clip=$("#clipStatus"); if(clip) clip.textContent=permStateText(await permQueryState("clipboard-read"));
  const fs=$("#fileStatus"); if(fs) fs.textContent="بتتطلب عند الاستخدام";
}
function updateBanner(){
  const b=$("#engineBanner");
  if(hasKey()){ b.classList.add("hidden"); b.textContent=""; }
  else{ b.classList.remove("hidden"); b.textContent="وضع الترجمة الآلية الأساسية شغال — للأسلوب المصري الكامل والوفي، ضيف مفتاح الـ API بتاعك في تبويب الإعدادات."; }
}

/* [original-tab] reader view switch: الأصلي / المترجم / الاتنين. View-only: never touches book data.
   Persists the choice per book in localStorage so it survives reload; a new book always starts on "الأصلي".
   Switching mode is pure CSS on the already-rendered chunks — resume position and locked-book rules untouched. */
(function(){
  const KEY = "motarjem-read-view";
  const VIEWS = ["orig","trans","both"];
  var byBook = {};
  function load(){ try{ byBook = JSON.parse(localStorage.getItem(KEY)||"{}"); if(!byBook || typeof byBook !== "object") byBook = {}; }catch(e){ byBook = {}; } }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(byBook)); }catch(e){} }
  function bookKey(){ try{ return (typeof currentId !== "undefined" && currentId) ? String(currentId) : "_"; }catch(e){ return "_"; } }
  function getView(){ var v = byBook[bookKey()]; return VIEWS.indexOf(v) >= 0 ? v : "orig"; }
  function setView(v){ byBook[bookKey()] = v; save(); }
  function applyView(){
    var v = getView();
    var wrap = document.getElementById("chunks");
    if(wrap){ wrap.classList.toggle("rv-orig", v === "orig"); wrap.classList.toggle("rv-trans", v === "trans"); }
    var btns = document.querySelectorAll("#readViewBar [data-readview]");
    for(var k = 0; k < btns.length; k++){
      var on = btns[k].getAttribute("data-readview") === v;
      btns[k].className = on ? "primary" : "ghost";
      btns[k].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  document.addEventListener("click", function(e){
    var b = (e.target && e.target.closest) ? e.target.closest("#readViewBar [data-readview]") : null;
    if(!b) return;
    setView(b.getAttribute("data-readview"));
    applyView();
  });
  function start(){
    load();
    var t = document.getElementById("readerTitle");
    if(t && typeof MutationObserver === "function"){ new MutationObserver(applyView).observe(t, {childList:true, characterData:true, subtree:true}); }
    applyView();
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();


/* [T3.4b] show the ORIGINAL PDF pages (canvas, lazy, released when far away). Reads the Blob saved by T3.4a; never touches book data. */
(function(){
  var PDF_WORKER = "./vendor/pdfjs/pdf.worker.min.js";
  var isOpen = false, loading = false, openId = null, pdfDoc = null, io = null, token = 0;
  function el(id){ return document.getElementById(id); }
  function say(t, err){ try{ setTransStatus(t, !!err); }catch(e){} }
  function curId(){ try{ return (typeof currentId !== "undefined" && currentId) ? currentId : null; }catch(e){ return null; } }
  function setLabel(){ var b = el("btnPdfPages"); if(b) b.textContent = isOpen ? "📝 رجوع للنص" : "📑 صفحات الـPDF"; }
  function releasePage(p){
    p.__n = (p.__n || 0) + 1; p.dataset.state = "";
    var c = p.querySelector("canvas"); if(c){ c.width = 0; c.height = 0; c.remove(); }
  }
  async function renderPage(p){
    if(!pdfDoc || p.dataset.state === "busy" || p.dataset.state === "done" || p.dataset.state === "err") return;
    p.__n = (p.__n || 0) + 1; var mine = p.__n, myTok = token;
    p.dataset.state = "busy";
    try{
      var page = await pdfDoc.getPage(Number(p.dataset.page));
      if(myTok !== token || p.__n !== mine) return;
      var base = page.getViewport({scale: 1});
      var cssW = p.clientWidth || 320;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var scale = (cssW / base.width) * dpr;
      var vp = page.getViewport({scale: scale});
      if(vp.width * vp.height > 4e6){ scale = scale * Math.sqrt(4e6 / (vp.width * vp.height)); vp = page.getViewport({scale: scale}); }
      var cv = document.createElement("canvas");
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      await page.render({canvasContext: cv.getContext("2d"), viewport: vp}).promise;
      if(myTok !== token || p.__n !== mine){ cv.width = 0; cv.height = 0; return; }
      p.style.aspectRatio = base.width + " / " + base.height;
      p.appendChild(cv); p.dataset.state = "done";
      if(page.cleanup) page.cleanup();
    }catch(e){
      if(myTok === token && p.__n === mine){ p.dataset.state = "err"; try{ logError("pdf-page", e); }catch(e2){} }
    }
  }
  function closeViewer(){
    token++;
    if(io){ try{ io.disconnect(); }catch(e){} io = null; }
    var host = el("pdfPages"); if(host){ host.innerHTML = ""; host.classList.add("hidden"); }
    var ch = el("chunks"); if(ch) ch.style.display = "";
    if(pdfDoc && pdfDoc.destroy){ try{ pdfDoc.destroy(); }catch(e){} }
    var wasOpen = isOpen;
    pdfDoc = null; isOpen = false; openId = null; setLabel();
    if(wasOpen){ try{ var lo = getLastOpen(); var t = lo && document.getElementById("chunk-" + (lo.chunkIndex || 0)); if(t) t.scrollIntoView({block: "start"}); }catch(e){} }
  }
  async function openViewer(){
    var id = curId(); if(!id || loading) return;
    if(!window.pdfjsLib){ say("مكتبة الـ PDF لسه بتتحمّل — استنى ثواني وجرّب تاني (محتاجة إنترنت أول مرة).", true); return; }
    loading = true;
    try{
      var blob = await idbPdfGet(id);
      if(!blob){ say("الـ PDF الأصلي مش محفوظ للكتاب ده — النص هو المتاح.", true); return; }
      var doc;
      try{
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
        var buf = await blob.arrayBuffer();
        doc = await pdfjsLib.getDocument({data: buf}).promise;
      }catch(e){ say("معرفتش أفتح الـ PDF الأصلي — النص لسه شغال.", true); return; }
      if(curId() !== id){ try{ doc.destroy(); }catch(e){} return; }
      var first = await doc.getPage(1); var v = first.getViewport({scale: 1});
      var ar = v.width + " / " + v.height;
      token++; pdfDoc = doc; openId = id; isOpen = true;
      var host = el("pdfPages"); host.innerHTML = "";
      var pages = [];
      for(var n = 1; n <= doc.numPages; n++){
        var d = document.createElement("div"); d.className = "pdfpg"; d.dataset.page = String(n); d.style.aspectRatio = ar;
        host.appendChild(d); pages.push(d);
      }
      host.classList.remove("hidden");
      var ch = el("chunks"); if(ch) ch.style.display = "none";
      setLabel();
      if(typeof IntersectionObserver === "function"){
        io = new IntersectionObserver(function(entries){
          entries.forEach(function(en){ if(en.isIntersecting) renderPage(en.target); else releasePage(en.target); });
        }, {rootMargin: "1200px 0px"});
        pages.forEach(function(p){ io.observe(p); });
      } else { pages.slice(0, 20).forEach(renderPage); }
      host.scrollIntoView({block: "start"});
    } finally { loading = false; }
  }
  async function refresh(){
    var id = curId(), b = el("btnPdfPages"); if(!b) return;
    if(isOpen && openId !== id) closeViewer();
    if(!id){ b.classList.add("hidden"); return; }
    var blob = null; try{ blob = await idbPdfGet(id); }catch(e){}
    if(curId() !== id) return;
    b.classList.toggle("hidden", !blob);
  }
  document.addEventListener("click", function(e){
    var b = (e.target && e.target.closest) ? e.target.closest("#btnPdfPages") : null;
    if(!b) return;
    if(isOpen) closeViewer(); else openViewer();
  });
  function start(){
    var t = el("readerTitle");
    if(t && typeof MutationObserver === "function"){ new MutationObserver(refresh).observe(t, {childList: true, characterData: true, subtree: true}); }
    refresh();
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
