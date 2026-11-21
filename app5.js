"use strict";
/* app5.js — [F] الإصلاح الذاتي (Self-Healing): محرك فحص ووصفات إصلاح للفئات المعروفة من الأعطال.
   النمط المهني الصادق: التطبيق مبيعيدش كتابة كوده ولا بيخمّن إصلاح لمجهول — وصفات حتمية
   (اكتشاف -> إصلاح من المصدر -> تحقق -> تسجيل في «سجل الإصلاحات») + تدهور رشيق + تشخيص كامل.
   حاجز البيانات: ممنوع مسح كتب/بيانات المستخدم أبدًا — العزل (quarantine) + نسخة احتياطية قابلة
   للاسترجاع بيتحفظوا جوه سجل الكتاب نفسه قبل أي تعديل. الوصفات الآمنة بتتطبق تلقائيًا،
   ووصفات العزل بتتطبق تلقائيًا بس بتتعلّم في السجل. */

/* ---------- سجل الإصلاحات (محلي، آخر ٤٠ إدخال) ---------- */
const REPAIR_LOG_KEY = "mk_repairlog";
function loadRepairLog(){ try{ const a = JSON.parse(localStorage.getItem(REPAIR_LOG_KEY) || "[]"); return Array.isArray(a) ? a : []; }catch(e){ return []; } }
function repairLog(recipe, status, detail, flagged){
  try{
    const a = loadRepairLog();
    a.unshift({ time: Date.now(), recipe: String(recipe || ""), status: String(status || "ok"), detail: sanitizeErrText(detail || ""), flagged: !!flagged });
    while(a.length > 40) a.pop();
    localStorage.setItem(REPAIR_LOG_KEY, JSON.stringify(a));
  }catch(e){}
  renderRepairLog();
}
function renderRepairLog(){
  const box = (typeof document !== "undefined") ? document.getElementById("repairLogList") : null;
  if(!box) return;
  const log = loadRepairLog();
  box.innerHTML = "";
  if(!log.length){ box.innerHTML = '<p class="hint">لسه مفيش إصلاحات متسجلة.</p>'; return; }
  log.slice(0, 15).forEach(en=>{
    const p = document.createElement("p"); p.className = "hint";
    let when = ""; try{ when = new Date(en.time).toLocaleString("ar-EG"); }catch(e){}
    const icon = en.status === "fixed" ? "🔧" : en.status === "flagged" ? "⚠️" : en.status === "failed" ? "❌" : "✔";
    p.textContent = icon + " " + when + " · " + en.recipe + ": " + en.detail;
    box.appendChild(p);
  });
}

/* ---------- أدوات صغيرة ---------- */
function healthRaceTimeout(promise, ms){
  return Promise.race([promise, new Promise((_, rej)=>setTimeout(()=>{ const e = new Error("مهلة الفحص خلصت"); e.healthTimeout = true; rej(e); }, ms))]);
}
function healthResult(recipe, label, found, fixed, flagged, notes){
  return { recipe: recipe, label: label, found: found || 0, fixed: fixed || 0, flagged: flagged || 0, notes: notes || [] };
}

/* ---------- وصفة ١: التخزين — اتصال عالق + أيتام كاش الصوت + ضغط الحصة ---------- */
async function recipeStorage(){
  let found = 0, fixed = 0; const notes = [];
  /* اتصال IDB ميت/عالق: قراءة موقوتة، ولو فشلت/علّقت بننسى الوعد المتخزّن ونعيد الفتح مرة (امتداد D-01) */
  try{ await healthRaceTimeout(idbAll(), 4000); }
  catch(e){
    found++;
    try{ dbPromise = null; await healthRaceTimeout(idbAll(), 4000); fixed++; notes.push("اتصال قاعدة البيانات كان عالق/مقفول — اتفتح من جديد واتأكدنا إنه شغال"); }
    catch(e2){ notes.push("اتصال قاعدة البيانات لسه مش بيرد — جرّب إعادة تحميل التطبيق"); return healthResult("storage", "التخزين", found, fixed, 1, notes); }
  }
  /* أيتام كاش الصوت: مفتاحه provider|bookId|... وكتابه اتمسح — الكاش قابل لإعادة التوليد فمسحه آمن */
  let keys = [];
  try{ keys = await idbAudioKeys(); }catch(e){}
  const ids = new Set((typeof books !== "undefined" ? books : []).map(b=>b.id));
  const orphans = keys.filter(k=>{ const p = String(k).split("|"); return p.length >= 2 && !!p[1] && !ids.has(p[1]); });
  for(const k of orphans){ try{ await idbAudioDel(k); fixed++; }catch(e){} }
  if(orphans.length){ found += orphans.length; notes.push("اتمسح " + orphans.length + " ملف صوت يتيم (كتابه مش موجود)"); }
  /* ضغط الحصة: بنفرّغ كاش الصوت بس — الكتب ممنوع تتلمس */
  try{
    const est = (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) ? await navigator.storage.estimate() : null;
    if(est && est.quota && (est.usage / est.quota) >= 0.85){
      const left = keys.length - orphans.length;
      if(left > 0){ await idbClearAudio(); fixed += left; found += left; notes.push("ضغط تخزين (الحصة قربت تخلص) — اتفضّى كاش الصوت (" + left + " ملف) والكتب زي ما هي"); }
    }
  }catch(e){}
  return healthResult("storage", "التخزين", found, fixed, 0, notes);
}

/* ---------- وصفة ٢: حالة عالقة — أجزاء «working» من جلسة وقعت ---------- */
async function recipeStuck(){
  if(typeof translating !== "undefined" && (translating || repairing || explaining))
    return healthResult("stuck", "الحالة العالقة", 0, 0, 0, ["اتخطّت: فيه تشغيل شغال فعلًا دلوقتي"]);
  let found = 0, fixed = 0;
  for(const b of (typeof books !== "undefined" ? books : [])){
    let dirty = false;
    (b.chunks || []).forEach(ch=>{ if(ch && ch.status === "working"){ ch.status = "pending"; found++; fixed++; dirty = true; } });
    if(dirty){ try{ await idbPut(b); }catch(e){} }
  }
  return healthResult("stuck", "الحالة العالقة", found, fixed, 0, found ? ["اتصفّرت حالة «بيترجم…» العالقة في " + fixed + " جزء — الترجمة تقدر تكمل من زرار ترجم"] : []);
}

/* ---------- وصفة ٧: الإعدادات — قيم برّه النطاق أو بايظة بتتظبط لحدود صالحة ---------- */
const HEALTH_THEMES = ["light", "sepia", "dark", "black"];
function sanitizeSettingsValues(){
  const corr = [];
  const num = (v)=> (typeof v === "number" && !isNaN(v)) ? v : null;
  const clamp = (key, lo, hi, dflt)=>{
    let v = num(settings[key]);
    if(v === null){ settings[key] = dflt; corr.push(key + "→" + dflt); return; }
    const c = Math.max(lo, Math.min(hi, v));
    if(c !== v){ settings[key] = c; corr.push(key + "→" + c); }
  };
  clamp("font", 13, 24, 17);
  clamp("lineHeight", 1.6, 2.4, 1.9);
  clamp("speed", 0.6, 1.6, 1);
  clamp("elStability", 0, 1, 0.5);
  clamp("elSimilarity", 0, 1, 0.75);
  clamp("elSpeed", 0.7, 1.2, 1);
  clamp("dailyGoalMin", 1, 600, 15);
  if(HEALTH_THEMES.indexOf(settings.theme) < 0){ settings.theme = "light"; corr.push("theme→light"); }
  if(typeof FONT_STACKS !== "undefined" && !FONT_STACKS[settings.fontFamily]){ settings.fontFamily = "system"; corr.push("fontFamily→system"); }
  if(["device", "eleven", "azure", "google"].indexOf(settings.ttsProvider) < 0){ settings.ttsProvider = "device"; corr.push("ttsProvider→device"); }
  const tl = sanitizeTargetLang(settings.targetLang); /* أي كود قديم/محذوف (he-IL مثلًا) بيرجع ar-EG */
  if(tl !== settings.targetLang){ corr.push("targetLang: " + settings.targetLang + "→" + tl); settings.targetLang = tl; }
  const ts = sanitizeTStyle(settings.tStyle);
  if(ts !== settings.tStyle){ settings.tStyle = ts; corr.push("tStyle→" + ts); }
  try{ new URL(String(settings.base || "")); }catch(e){ settings.base = DEFSET.base; corr.push("base→الافتراضي"); }
  if(corr.length) saveSettings();
  return corr;
}
function recipeSettings(){
  const corr = sanitizeSettingsValues();
  return healthResult("settings", "الإعدادات", corr.length, corr.length, 0, corr.length ? ["اتظبطت قيم برّه النطاق: " + corr.join("، ")] : []);
}

/* ---------- وصفة ٤: مزوّد الذكاء — تصنيف + تصحيح اسم موديل معروف + تقرير المفتاح ---------- */
/* مصنّف نقي: بياخد خطأ بخصائص aiChat (httpStatus/aiTimeout/aiEmpty) ويرجّع فئة الفشل */
function classifyAiFailure(err){
  if(!err) return "other";
  const st = err.httpStatus;
  if(typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  if(err instanceof TypeError) return "offline"; /* فشل fetch نفسه: شبكة/DNS/CORS */
  if(st === 401 || st === 403) return "key";
  if(st === 404) return "model";
  if(st === 429) return "rate";
  if(typeof st === "number" && st >= 500) return "server";
  if(err.aiTimeout) return "server";
  if(err.aiEmpty) return "empty";
  return "other";
}
function recipeAi(){
  let found = 0, fixed = 0, flagged = 0; const notes = [];
  /* تصحيح تلقائي لاسم الموديل المعروف الغلط بس — أي اسم تاني كتبه المستخدم بيتساب (نفس قاعدة الترحيل) */
  if(String(settings.model || "").trim().toLowerCase() === KNOWN_BAD_MODEL){
    settings.model = GOOD_DEFAULT_MODEL; saveSettings();
    found++; fixed++; notes.push("اسم الموديل المعروف الغلط اتصحّح تلقائيًا لـ " + GOOD_DEFAULT_MODEL);
  }
  /* تصنيف آخر أخطاء الذكاء المتسجلة: مشاكل المفتاح بتتبلّغ بس — المالك هو اللي يتصرّف */
  const kinds = {};
  loadErrLog().forEach(en=>{
    const m = /خطأ (\d{3})/.exec(en.message || "") || /MyMemory خطأ (\d{3})/.exec(en.message || "");
    if(!m) return;
    const fake = { httpStatus: parseInt(m[1], 10) };
    const kind = classifyAiFailure(fake);
    kinds[kind] = (kinds[kind] || 0) + 1;
  });
  if(kinds.key){ flagged++; notes.push("فيه خطأ مفتاح API متسجل (401/403) — ده محتاج تدخّلك: راجع المفتاح من الإعدادات، ومفيش إصلاح تلقائي ممكن هنا"); }
  if(kinds.model){ notes.push("فيه خطأ 404 موديل متسجل — اتأكد إن اسم الموديل مختار من «الموديلات المتاحة» في الإعدادات"); }
  if(kinds.rate || kinds.server){ notes.push("الخدمة ردّت بأخطاء " + (kinds.rate ? "429 (ضغط) " : "") + (kinds.server ? "5xx/مهلة " : "") + "— دول بيتحاولوا تلقائيًا مرتين بانتظار متزايد أصلًا"); }
  return healthResult("ai", "مزوّد الذكاء", found, fixed, flagged, notes);
}

/* ---------- وصفة ٦: بيانات الكتب — أجزاء بايظة/فاضية/حروف مشكّلة مقلوبة/JSON مشتقات بايظ ---------- */
/* مصنّف عيب نقي لجزء واحد: بيرجّع نوع العيب أو null لو الجزء سليم */
function chunkDefect(ch){
  if(!ch || typeof ch !== "object") return "invalid-chunk";
  if(typeof ch.orig !== "string") return "invalid-orig";
  const o = ch.orig;
  const badChars = (o.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g) || []).length;
  const repl = (o.match(/\uFFFD/g) || []).length;
  if(badChars > 0 || repl >= 2) return "garbled";
  const ar = (o.match(/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length; /* نطاق العربي + أشكال العرض معًا */
  if(ar >= 20){
    const shaped = (o.match(/[\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
    if(shaped / ar > 0.05) return "shaped-reversed"; /* حروف عربية بأشكال العرض = استخراج PDF مقلوب/مشكّل */
  }
  /* مشتقات بايظة: حقول لازم تكون مصفوفات/نصوص وحالتها غير كده */
  if(ch.glossary != null && !Array.isArray(ch.glossary)) return "invalid-derived";
  if(ch.keyPoints != null && !Array.isArray(ch.keyPoints)) return "invalid-derived";
  if(ch.trans != null && typeof ch.trans !== "string") return "invalid-derived";
  if(ch.explanation != null && typeof ch.explanation !== "string") return "invalid-derived";
  if(ch.status != null && ["pending", "working", "done", "fail"].indexOf(ch.status) < 0) return "invalid-derived";
  return null;
}
function bookOrigChars(book){ return (book.chunks || []).reduce((n, c)=>n + (typeof c.orig === "string" ? c.orig.length : 0), 0); }
/* إصلاح كتاب واحد: نسخة احتياطية أولًا، وبعدين إعادة اشتقاق من اللقطة أو عزل — وبيتحقق من الأعداد قبل/بعد.
   إعادة اشتقاق جراحية على مستوى الجزء (مش إعادة تقسيم للكتاب كله) عشان أرقام الأجزاء والعلامات متتحركش */
async function repairBookData(book){
  const defects = [];
  (book.chunks || []).forEach((ch, i)=>{ const d = chunkDefect(ch); if(d) defects.push({ i: i, kind: d }); });
  const emptyIdx = [];
  const totalChars = bookOrigChars(book);
  if(totalChars >= 500) (book.chunks || []).forEach((ch, i)=>{ if(ch && typeof ch.orig === "string" && !ch.orig.trim() && !defects.some(d=>d.i === i)) emptyIdx.push(i); });
  emptyIdx.forEach(i=>defects.push({ i: i, kind: "empty" }));
  if(!defects.length) return { bookId: book.id, found: 0, fixed: 0, quarantined: 0, charsBefore: totalChars, charsAfter: totalChars, backupAt: 0 };
  /* النسخة الاحتياطية القابلة للاسترجاع بتتخزن جوه سجل الكتاب وبتتحفظ قبل أي تعديل */
  book.healthBackup = { at: Date.now(), chunks: JSON.parse(JSON.stringify(book.chunks || [])), quarantinedChunks: JSON.parse(JSON.stringify(book.quarantinedChunks || [])) };
  await idbPut(book);
  if(typeof snapshotOrigIfNeeded === "function") snapshotOrigIfNeeded(book);
  let fixed = 0; const quarantineIdx = [];
  defects.sort((a, b)=>a.i - b.i).forEach(d=>{
    const ch = book.chunks[d.i];
    if(!ch || typeof ch !== "object"){ quarantineIdx.push(d.i); return; }
    if(d.kind === "invalid-derived"){ clearDerivedChunk(ch); fixed++; return; }
    const snap = (Array.isArray(book.origChunks) && typeof book.origChunks[d.i] === "string") ? book.origChunks[d.i] : null;
    if(snap && snap.trim() && !chunkDefect({ orig: snap })){
      let restored = snap;
      try{ const cl = cleanupText(snap); if(cl && cl.text && cl.text.trim()) restored = cl.text; }catch(e){} /* إعادة تنضيف للنص المشتق */
      ch.orig = restored; clearDerivedChunk(ch); fixed++; return;
    }
    quarantineIdx.push(d.i);
  });
  let quarantined = 0;
  if(quarantineIdx.length){
    if(quarantineIdx.length >= book.chunks.length){ /* كل الكتاب بايظ ومفيش مصدر سليم: منلمسش حاجة — النسخة الاحتياطية موجودة والتقرير بيقول */
      return { bookId: book.id, found: defects.length, fixed: fixed, quarantined: 0, failed: true, charsBefore: totalChars, charsAfter: totalChars, backupAt: book.healthBackup.at };
    }
    book.quarantinedChunks = book.quarantinedChunks || [];
    quarantineIdx.slice().sort((a, b)=>b - a).forEach(i=>{
      const ch = book.chunks[i];
      book.quarantinedChunks.push(Object.assign({}, ch, { _qIndex: i, _qAt: Date.now() }));
      book.chunks.splice(i, 1); quarantined++;
    });
  }
  await idbPut(book);
  const stillBad = (book.chunks || []).filter(c=>chunkDefect(c)).length;
  return { bookId: book.id, found: defects.length, fixed: fixed, quarantined: quarantined, stillBad: stillBad,
           charsBefore: totalChars, charsAfter: bookOrigChars(book), backupAt: book.healthBackup.at };
}
/* استرجاع النسخة الاحتياطية الصحية لكتاب (من اللوحة/الاختبارات) */
async function restoreHealthBackup(book){
  if(!book || !book.healthBackup) return false;
  book.chunks = JSON.parse(JSON.stringify(book.healthBackup.chunks || []));
  book.quarantinedChunks = JSON.parse(JSON.stringify(book.healthBackup.quarantinedChunks || []));
  await idbPut(book);
  return true;
}
async function recipeBooks(){
  let found = 0, fixed = 0, quarantined = 0, flagged = 0; const notes = [];
  const list = (typeof books !== "undefined" ? books : []).slice();
  for(const b of list){
    let r = null;
    try{ r = await repairBookData(b); }catch(e){ flagged++; notes.push("كتاب «" + (b.title || "") + "» فحصه فشل: " + describeError(e)); continue; }
    if(!r || !r.found) continue;
    found += r.found; fixed += r.fixed; quarantined += r.quarantined;
    if(r.failed){ flagged++; notes.push("كتاب «" + (b.title || "") + "» كله بايظ ومفيش نسخة أصلية سليمة — اتساب زي ما هو واتحفظت نسخة احتياطية"); }
    else notes.push("كتاب «" + (b.title || "") + "»: اتصلح " + r.fixed + " جزء من النسخة الأصلية" + (r.quarantined ? " واتعزل " + r.quarantined + " جزء (محفوظ وقابل للاسترجاع)" : "") + " — حروف قبل " + r.charsBefore + " وبعد " + r.charsAfter);
  }
  return healthResult("books", "بيانات الكتب", found, fixed, flagged || (quarantined ? 1 : 0), notes.concat(quarantined ? ["الأجزاء المعزولة محفوظة جوه كتبها (quarantinedChunks) مع نسخة احتياطية كاملة — مفيش حاجة اتمسحت"] : []));
}

/* ---------- وصفة ٥: الشل — كاش نسخة قديمة/بايظ: بنفرّغ كاش الشل بس ونعيد التحميل مرة (بحارس حلقة) ---------- */
function staleShellCaches(keys){
  return (keys || []).filter(k=>/^motarjem-v\d+$/.test(k) && k !== APP_VERSION_TAG);
}
async function recipeShell(opts){
  if(typeof caches === "undefined" || !caches.keys) return healthResult("shell", "شل التطبيق", 0, 0, 0, ["Cache Storage مش متاح في البيئة دي — اتخطّت"]);
  let keys = [];
  try{ keys = await caches.keys(); }catch(e){ return healthResult("shell", "شل التطبيق", 0, 0, 0, []); }
  const stale = staleShellCaches(keys);
  for(const k of stale){ try{ await caches.delete(k); }catch(e){} }
  if(stale.length && opts && opts.allowReload){
    try{
      if(!sessionStorage.getItem("mk_shell_reloaded") && !(typeof window !== "undefined" && window.__healthNoReload)){
        sessionStorage.setItem("mk_shell_reloaded", "1");
        if(typeof location !== "undefined" && location.reload) setTimeout(()=>{ try{ location.reload(); }catch(e){} }, 300);
      }
    }catch(e){}
  }
  return healthResult("shell", "شل التطبيق", stale.length, stale.length, 0, stale.length ? ["اتفرّغ كاش شل قديم (" + stale.join("، ") + ") — بيانات الكتب برّه الكاش ده أصلًا ومتلمستش"] : []);
}

/* ---------- وصفة ٣: محرك OCR — إعادة تشغيل مرحلية + نواة بديلة (بتستهلك إقلاع [E] المرحلي) ---------- */
async function recipeOcr(opts){
  if(!opts || !opts.active)
    return healthResult("ocr", "محرك OCR", 0, 0, 0, ["فحص سلبي عند الإقلاع (المحرك بيقلع كسولًا) — الفحص الكامل من زرار اللوحة"]);
  if(typeof KutubiOCR === "undefined" || !KutubiOCR.ocrGetWorker)
    return healthResult("ocr", "محرك OCR", 0, 0, 1, ["وحدة OCR مش محمّلة"]);
  let restarts = 0, lastErr = null;
  for(let attempt = 0; attempt <= 2; attempt++){
    try{ await KutubiOCR.ocrGetWorker(); return healthResult("ocr", "محرك OCR", restarts ? 1 : 0, restarts, 0, restarts ? ["المحرك كان عالق/محطّم — اتعاد تشغيله واشتغل بعد " + restarts + " إعادة"] : []); }
    catch(e){
      lastErr = e;
      if(attempt < 2){ restarts++; try{ await KutubiOCR.ocrRestartWorker(); }catch(e2){} }
    }
  }
  logError("OCR", lastErr);
  const diag = (typeof KutubiOCR._ocrDiagText === "function") ? KutubiOCR._ocrDiagText() : "";
  return healthResult("ocr", "محرك OCR", 1, 0, 1, ["المحرك فشل بعد إعادتين للتشغيل — مرحلة الوقوف في التشخيص" + (diag ? ": " + diag.split("\n").slice(2).join(" · ") : "")]);
}

/* ---------- المحرك: تشغيل كل الوصفات بالتسلسل + تسجيل + ملخص اللوحة ---------- */
let healthRunning = false;
async function runHealthChecks(opts){
  opts = opts || {};
  if(healthRunning) return { skipped: true };
  healthRunning = true;
  const results = [];
  const run = async (fn)=>{ try{ results.push(await fn()); }catch(e){ results.push(healthResult("?", "وصفة", 0, 0, 1, ["الوصفة نفسها فشلت: " + describeError(e)])); } };
  try{
    await run(()=>recipeStorage());
    await run(()=>recipeStuck());
    await run(()=>recipeOcr(opts));
    await run(()=>recipeAi());
    await run(()=>recipeShell(opts));
    await run(()=>recipeBooks());
    await run(()=>recipeSettings());
  } finally { healthRunning = false; }
  let fixedTotal = 0, flaggedTotal = 0, booksChanged = false;
  results.forEach(r=>{
    fixedTotal += r.fixed; flaggedTotal += r.flagged;
    if((r.recipe === "books" || r.recipe === "stuck") && r.fixed > 0) booksChanged = true;
    const status = r.failed ? "failed" : (r.flagged && !r.fixed ? "flagged" : (r.fixed ? "fixed" : "ok"));
    const detail = r.notes.length ? r.notes.join(" · ") : (r.found ? "اتكشف " + r.found + " واتصلح " + r.fixed : "سليم — مفيش حاجة محتاجة إصلاح");
    repairLog(r.label, status, detail, !!r.flagged);
  });
  const sum = document.getElementById("healthSummary");
  if(sum) sum.textContent = "آخر فحص (" + (opts.source === "boot" ? "عند الإقلاع" : "يدوي") + "): اتصلح " + fixedTotal + " حاجة" + (flaggedTotal ? "، وفيه " + flaggedTotal + " تنبيه محتاج انتباه" : "") + " — التفاصيل في سجل الإصلاحات تحت.";
  renderRepairLog();
  return { results: results, fixedTotal: fixedTotal, flaggedTotal: flaggedTotal, booksChanged: booksChanged };
}
/* تشغيل الإقلاع: فحص كامل سلبي الـ OCR (المحرك كسول) + إعادة تحميل الشل مسموحة مرة واحدة */
async function healthBootRun(){
  return runHealthChecks({ active: false, source: "boot", allowReload: true });
}

/* خطافات للاختبار الآلي (Node) — نفس دوال الواجهة */
let KutubiHealth = {
  runHealthChecks: runHealthChecks,
  bootRun: healthBootRun,
  classifyAiFailure: classifyAiFailure,
  chunkDefect: chunkDefect,
  staleShellCaches: staleShellCaches,
  sanitizeSettingsValues: sanitizeSettingsValues,
  repairBookData: repairBookData,
  restoreHealthBackup: restoreHealthBackup,
  recipeStorage: recipeStorage,
  recipeStuck: recipeStuck,
  recipeOcr: recipeOcr,
  recipeAi: recipeAi,
  recipeShell: recipeShell,
  recipeBooks: recipeBooks,
  recipeSettings: recipeSettings,
  loadRepairLog: loadRepairLog
};
if(typeof window !== "undefined") window.KutubiHealth = KutubiHealth;
