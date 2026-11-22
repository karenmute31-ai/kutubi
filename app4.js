/* app4.js — استيراد الكتب المصوّرة: تعرّف ضوئي (OCR) محلي بالكامل + عرض إصلاح بالذكاء الاصطناعي
   الفكرة: الـ PDF اللي نصه المستخرج فاضي أو شحيح (كتاب متصوّر سكانر) مبقاش طريق مسدود —
   بنرسم صفحاته بـ pdf.js وبنعرّف عليها بـ Tesseract.js (عربي + إنجليزي) على جهاز المستخدم نفسه،
   والناتج بيعدي على نفس خط الإضافة المعتاد (addBook: تنضيف cleanupText + تقسيم splitChunks).
   كل أصول الـ OCR (المكتبة + النواة + بيانات اللغتين) ملفات محلية تحت vendor/tesseract —
   بتتحمّل كسولًا أول مرة بس — ومن [E] بقت داخلة كاش الشل (SHELL) بأمر المالك فبتنزل مع التطبيق من الأول. */
/* [v25] */

/* مسارات أصول الـ OCR — نِسبية من جذر التطبيق فبتشتغل على Vercel وفي حزمة Capacitor بنفس الشكل.
   النواة مثبّتة على ملف SIMD-LSTM بعينه (المكتبة بتقبل مسار ملف مباشر) — متوافقة مع أي متصفح حديث (SIMD موجود من Chrome 91). */
const OCR_LIB_URL = "./vendor/tesseract/tesseract.min.js";
const OCR_WORKER_URL = "./vendor/tesseract/worker.min.js";
const OCR_CORE_URL = "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js";
const OCR_CORE_FALLBACK_URL = "./vendor/tesseract/core/tesseract-core-lstm.wasm.js"; /* [D-13] نواة LSTM عادية (نفس إصدار النواة الأساسية 7.0.0): بديل لو SIMD مقدرتش تشتغل على الجهاز */
const OCR_LANG_URL = "./vendor/tesseract/lang";
const OCR_STAGE_TIMEOUT_MS = 20000;  /* [E] سقف موحّد لكل مرحلة تشغيل (20ث) + إعادة تلقائية واحدة — من غيره أي تعليقة بتجمّد الواجهة للأبد */
const OCR_PAGE_TIMEOUT_MS = 120000;  /* [E] سقف قراءة الصفحة الواحدة أثناء الشغل — عامل بيعلّق في نص كتاب برضه لازم يتحسم مش يلف للأبد */
let ocrPageTimeoutMs = OCR_PAGE_TIMEOUT_MS; /* القيمة الفعلية — بتتظبط في الاختبارات بس */
let ocrBootTimeouts = { stage: OCR_STAGE_TIMEOUT_MS }; /* القيم الفعلية المستخدمة — بتتظبط في الاختبارات بس */
const OCR_LANGS = "ara+eng";
const OCR_EST_SEC_PER_PAGE = 6;      /* تقدير مبدئي لوقت الصفحة — بيتصحح ذاتيًا بمتوسط الصفحات اللي خلصت */
const OCR_AUTO_MAX_PAGES = 60;       /* كتاب لحد ٦٠ صفحة: الـ OCR بيبدأ لوحده. أكبر من كده بيستنى اختيار المستخدم عشان الوقت */
const OCR_LAYER_MIN_CHARS = 30;      /* نفس عتبة addBook: أقل من كده «مفيش نص» */
const OCR_LAYER_PER_PAGE = 25;       /* متوسط حروف/صفحة أقل من كده في كتاب ٣ صفحات+ = مصوّر حتى لو فيه وتر مارك متكرر */

let ocrLibPromise = null;            /* وعد تحميل مكتبة Tesseract (مرة واحدة في الجلسة) */
let ocrWorkerPromise = null;         /* وعد إنشاء عامل الـ OCR (بيتشارك بين كل الصفحات والكتب) */
let ocrWorkerFactory = null;         /* خطاف اختبار: المصنع البديل للعامل في بيئة Node */
let ocrTessSink = null;              /* مستقبِل تقدم الصفحة الحالية من logger بتاع المكتبة */
let ocrBootSink = null;              /* [D-13] مستقبِل حالات تجهيز المحرك (initializing/loading) — بيروّحها لسطر حالة اللوحة */
let ocrPanelWired = false;           /* ربط أزرار لوحة الـ OCR اتعمل مرة واحدة بس */
let ocrJob = null;                   /* شغلانة الـ OCR الحالية: {resolve, paused, cancelled, running} */

/* ---------- [E] تشخيص التشغيل: سجل مراحل موقّت في الذاكرة + كشف SIMD + صورة الاختبار الذاتي ---------- */
let ocrDiag = null;                  /* سجل تشغيل الجلسة الحالية: [{stage, t0, ms, ok, info}] — بيتصفّر مع كل محاولة تشغيل */
function ocrDiagReset(){ ocrDiag = { at: Date.now(), ua: (typeof navigator !== "undefined" ? navigator.userAgent : ""), stages: [] }; }
function ocrDiagMark(stage, t0, ok, info){
  if(!ocrDiag) ocrDiagReset();
  ocrDiag.stages.push({ stage: stage, ms: (typeof t0 === "number") ? (Date.now() - t0) : null, ok: !!ok, info: info || "" });
}
function ocrDiagText(){
  if(!ocrDiag) return "تشخيص OCR: مفيش محاولة تشغيل متسجلة.";
  const lines = ["تشخيص OCR — " + new Date(ocrDiag.at).toISOString(), "الجهاز/المتصفح: " + ocrDiag.ua];
  ocrDiag.stages.forEach(s=>{ lines.push("• " + s.stage + ": " + (s.ms == null ? "لسه شغالة/متعلقة" : s.ms + "ms") + " — " + (s.ok ? "تمت" : "فشلت") + (s.info ? " (" + s.info + ")" : "")); });
  return lines.join("\n");
}
/* نسخ التشخيص للحافظة — بيتنادى من زر اللوحة وزر سجل أخطاء الإدارة */
async function copyOcrDiagnostics(){
  /* نسخ حديث بس (Clipboard API) — من غير عناصر عائمة برّه نظام الطبقات (حارس lint-layering) */
  try{ await navigator.clipboard.writeText(ocrDiagText()); return true; }catch(e){ return false; }
}
/* كشف دعم تعليمات SIMD في WebAssembly قبل اختيار النواة: وحدة SIMD صغيرة معروفة بتتصدّق أو بتترفض */
let ocrSimdCache = null;
function ocrSupportsSimd(){
  if(ocrSimdCache !== null) return ocrSimdCache;
  try{
    const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,22,1,20,0,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11]); /* () -> v128, v128.const */
    ocrSimdCache = (typeof WebAssembly !== "undefined") && WebAssembly.validate(bytes);
  }catch(e){ ocrSimdCache = false; }
  return ocrSimdCache;
}
/* صورة الاختبار الذاتي: نص مطبوع واضح «Kutubi OCR 2026» (PNG ‏8.9KB) — المحرك لازم يقرا «Kutubi» منها قبل أي كتاب */
const OCR_SELFTEST_B64 = "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";
const OCR_SELFTEST_NEEDLE = "Kutubi";
function ocrSelfTestImage(){
  const bin = atob(OCR_SELFTEST_B64);
  const arr = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "image/png" });
}

/* ---------- تحميل المكتبة والعامل (كسول — أول كتاب مصوّر بس) ---------- */
function ocrLoadLib(){
  if(window.Tesseract) return Promise.resolve(window.Tesseract);
  if(ocrLibPromise) return ocrLibPromise;
  ocrLibPromise = new Promise((res, rej)=>{
    const s = document.createElement("script");
    s.src = OCR_LIB_URL;
    s.onload = ()=>{ if(window.Tesseract) res(window.Tesseract); else rej(new Error("مكتبة التعرف الضوئي اتحمّلت من غير ما تشتغل — حدّث الصفحة وجرّب تاني.")); };
    s.onerror = ()=>rej(new Error("تعذّر تحميل مكتبة التعرف الضوئي (OCR) من ملفات التطبيق."));
    document.head.appendChild(s);
  });
  ocrLibPromise.catch(()=>{ ocrLibPromise = null; }); /* فشل التحميل ميبوّظش المحاولات الجاية */
  return ocrLibPromise;
}
/* [D-13] سباق ضد مهلة: لو الوعد متعلّق للأبد (عامل بيجهّز في WebView ومش بيكمّل) المهلة هي اللي تحسم،
   وأي نتيجة متأخرة بعد المهلة بتترمي — ولو عامل اتخلق متأخر بيتم إنهاؤه فورًا عشان ميبقاش زومبي شغال */
function ocrRaceTimeout(promise, ms, onLate){
  return new Promise((resolve, reject)=>{
    let settled = false;
    const t = setTimeout(()=>{ settled = true; reject(new Error("OCR_TIMEOUT")); }, ms);
    Promise.resolve(promise).then(
      (v)=>{ if(settled){ if(onLate){ try{ onLate(v); }catch(e){} } return; } clearTimeout(t); resolve(v); },
      (e)=>{ if(settled) return; clearTimeout(t); reject(e); });
  });
}
/* [E] سباق بمهلة مرحلة بتتجدد: createWorker بيعدي جوّه على مراحل (نواة ← لغة ← تهيئة)،
   فكل انتقال مرحلة من الـ logger بيصفّر عدّاد الـ 20ث — المهلة على المرحلة مش على التشغيل كله */
function ocrRaceStageTimeout(promise, bumpRef, onLate){
  return new Promise((resolve, reject)=>{
    let settled = false;
    const iv = setInterval(()=>{
      if(!settled && Date.now() > bumpRef.deadline){ settled = true; clearInterval(iv); reject(new Error("OCR_TIMEOUT")); }
    }, 100);
    Promise.resolve(promise).then(
      (v)=>{ if(settled){ if(onLate){ try{ onLate(v); }catch(e){} } return; } settled = true; clearInterval(iv); resolve(v); },
      (e)=>{ if(settled) return; settled = true; clearInterval(iv); reject(e); });
  });
}
/* [E] خطأ مرحلي: بيقول التشغيل وقف عند أنهي مرحلة بالظبط (بأسماء المراحل المعروضة للمستخدم)، واللوحة بتعرضه بدل تجميد «بيجهّز» */
const OCR_STAGE_LABELS = { lib: "تحميل المحرك", core: "تحميل المحرك", boot: "تحميل المحرك", lang: "تحميل بيانات اللغة", selftest: "الاختبار الذاتي", page: "قراءة الصفحة" };
function ocrBootStageError(stage, cause){
  const msg = stage === "page"
    ? "التعرف وقف عند مرحلة: قراءة الصفحة (المحرك علّق واتقتل عشان ميجمّدش الاستيراد)."
    : "المحرك مقدرش يبدأ على الجهاز ده — وقفت عند مرحلة: " + (OCR_STAGE_LABELS[stage] || stage) + ".";
  const err = new Error(msg);
  err.ocrBootStage = stage;
  err.cause = cause || null;
  return err;
}
/* [D-13] حالات تجهيز المحرك من logger المكتبة → نص عربي لسطر حالة اللوحة */
function ocrBootStatusText(m){
  if(!m || !m.status) return "";
  const s = String(m.status);
  const pct = (typeof m.progress === "number" && m.progress > 0 && m.progress < 1) ? " (" + Math.round(m.progress * 100) + "%)" : "";
  if(s.indexOf("core") >= 0) return "📷 تحميل المحرك" + pct + "…";
  if(s.indexOf("language") >= 0 || s.indexOf("traineddata") >= 0) return "📷 تحميل بيانات اللغة" + pct + "…";
  if(s.indexOf("initializ") >= 0) return "📷 تحميل المحرك" + pct + "…";
  return "";
}
function ocrWorkerOptions(coreUrl, logger){
  return {
    workerPath: OCR_WORKER_URL,
    corePath: coreUrl,
    langPath: OCR_LANG_URL,
    cacheMethod: "none", /* البيانات محلية أصلًا — من غير كاش خارجي عشان نسخ البيانات متتلخبطش بين إصدارات التطبيق */
    logger: logger || ((m)=>{
      if(ocrTessSink) { ocrTessSink(m); return; }
      if(ocrBootSink && m && m.status !== "recognizing text") ocrBootSink(m); /* حالات التجهيز تظهر في اللوحة */
    })
  };
}
/* [E] مرحلة المكتبة: مهلة 20ث + إعادة تلقائية واحدة — فشلها مش بيتصلّح بنواة تانية فبيطلع على طول */
async function ocrLoadLibTimed(){
  let lastErr = null;
  for(let attempt = 0; attempt < 2; attempt++){
    const t0 = Date.now();
    try{
      const T = await ocrRaceTimeout(ocrLoadLib(), ocrBootTimeouts.stage);
      ocrDiagMark("lib", t0, true, attempt ? "نحتت في الإعادة" : "");
      return T;
    }catch(e){
      ocrLibPromise = null;
      lastErr = (e && e.message === "OCR_TIMEOUT") ? ocrBootStageError("lib", e) : e;
      ocrDiagMark("lib", t0, false, (e && e.message) || "");
      if(!(e && (e.message === "OCR_TIMEOUT" || e.ocrBootStage))) throw e; /* خطأ حقيقي مش تعليقة: مش بيتعالج بالإعادة */
    }
  }
  throw lastErr;
}
/* [E] الاختبار الذاتي: صورة صغيرة معروفة النص — المحرك لازم يقراها صح قبل ما يلمس أي كتاب */
async function ocrSelfTest(worker){
  const t0 = Date.now();
  const r = await ocrRaceTimeout(Promise.resolve().then(()=>worker.recognize(ocrSelfTestImage())), ocrBootTimeouts.stage);
  const text = (r && r.data && r.data.text) || "";
  if(text.indexOf(OCR_SELFTEST_NEEDLE) < 0)
    throw ocrBootStageError("selftest", new Error("المحرك قرا: " + text.trim().slice(0, 60)));
  ocrDiagMark("selftest", t0, true, "");
}
/* [E] محاولة تشغيل بنواة بعينها: مهلة 20ث للمرحلة، ومراحل logger الداخلة بتتسجل في التشخيص،
   وأي عامل يوصل متأخر بعد المهلة بيتم إنهاؤه فورًا عشان ميبقاش زومبي شغال */
async function ocrCreateWorkerTimed(coreUrl, coreName){
  let stage = "core", stageT0 = Date.now(); /* بتتحرك مع logger: نواة ← بيانات لغة ← تهيئة */
  const bumpRef = { deadline: Date.now() + ocrBootTimeouts.stage };
  const bootLogger = (m)=>{
    if(!m || !m.status) return;
    const s = String(m.status);
    const ns = s.indexOf("language") >= 0 || s.indexOf("traineddata") >= 0 ? "lang"
             : s.indexOf("initializ") >= 0 ? "boot" : s.indexOf("core") >= 0 ? "core" : null;
    if(ns && ns !== stage){ ocrDiagMark(stage, stageT0, true, coreName); stage = ns; stageT0 = Date.now(); bumpRef.deadline = Date.now() + ocrBootTimeouts.stage; }
    if(ocrTessSink){ ocrTessSink(m); return; }
    if(ocrBootSink && s !== "recognizing text") ocrBootSink(m);
  };
  let createP;
  if(ocrWorkerFactory){ /* وضع الاختبار: المصنع البديل بيقوم مقام createWorker وبنفس الخيارات */
    createP = Promise.resolve().then(()=>ocrWorkerFactory(OCR_LANGS, 1, ocrWorkerOptions(coreUrl, bootLogger)));
  } else {
    const T = await ocrLoadLibTimed();
    createP = Promise.resolve().then(()=>T.createWorker(OCR_LANGS, 1, ocrWorkerOptions(coreUrl, bootLogger)));
  }
  let worker;
  const bootT0 = Date.now();
  try{
    worker = await ocrRaceStageTimeout(createP, bumpRef, (lateWorker)=>{
      if(lateWorker && lateWorker.terminate) lateWorker.terminate();
    });
  }catch(e){
    ocrDiagMark(stage, stageT0, false, (e && e.message) || "");
    if(e && e.message === "OCR_TIMEOUT") throw ocrBootStageError(stage, e);
    throw e;
  }
  ocrDiagMark(stage, stageT0, true, coreName);
  ocrDiagMark("boot-total", bootT0, true, coreName);
  /* الأولوية للعامل الحقيقي: الاختبار الذاتي على صورة معروفة — فشله = المحرك مش جاهز مهما قال التشغيل */
  const stT0 = Date.now();
  try{ await ocrSelfTest(worker); }
  catch(e){
    try{ if(worker && worker.terminate) await worker.terminate(); }catch(_){}
    if(e && e.message === "OCR_TIMEOUT"){ ocrDiagMark("selftest", stT0, false, "OCR_TIMEOUT"); throw ocrBootStageError("selftest", e); }
    if(e && e.ocrBootStage) throw e;
    ocrDiagMark("selftest", stT0, false, (e && e.message) || "");
    throw ocrBootStageError("selftest", e);
  }
  return worker;
}
/* [E] التشغيل: كشف SIMD الأول — مدعوم → نواة SIMD، وأي فشل/تعليقة في التشغيل أو الاختبار الذاتي
   إعادة واحدة بس بالنواة العادية (وهي نفسها البداية لو SIMD مش مدعوم أصلًا) */
async function ocrBootWithFallback(){
  ocrDiagReset();
  const simd = ocrSupportsSimd();
  ocrDiagMark("simd-detect", Date.now(), true, simd ? "SIMD مدعوم" : "SIMD غير مدعوم — بداية مباشرة بالنواة العادية");
  const plan = simd ? [[OCR_CORE_URL, "simd-lstm"], [OCR_CORE_FALLBACK_URL, "lstm"]] : [[OCR_CORE_FALLBACK_URL, "lstm"]];
  let lastErr = null;
  for(let i = 0; i < plan.length; i++){
    try{ return await ocrCreateWorkerTimed(plan[i][0], plan[i][1]); }
    catch(e){
      if(e && e.ocrBootStage === "lib") throw e;
      lastErr = e;
    }
  }
  if(lastErr && lastErr.ocrBootStage) throw lastErr;
  throw ocrBootStageError("boot", lastErr);
}
async function ocrGetWorker(){
  if(ocrWorkerFactory) return ocrBootWithFallback(); /* الاختبارات: نفس الخط المرحلي، من غير الكاش المشترك */
  if(ocrWorkerPromise) return ocrWorkerPromise;
  ocrWorkerPromise = ocrBootWithFallback();
  ocrWorkerPromise.catch(()=>{ ocrWorkerPromise = null; }); /* فشل التشغيل ميبوّظش المحاولات الجاية */
  return ocrWorkerPromise;
}
/* [F] إعادة تشغيل قسرية للعامل: بننهي العامل المتخزّن (حي أو فاشل) وبنصفّر الوعد —
   بيستخدمها الإصلاح الذاتي (وصفة OCR) عشان العامل العالق/المحطّم يتبدل من غير ما المستخدم يعيد تحميل التطبيق */
async function ocrRestartWorker(){
  const p = ocrWorkerPromise; ocrWorkerPromise = null;
  if(p){ try{ const w = await p; if(w && typeof w.terminate === "function") await w.terminate(); }catch(e){} }
}

/* ---------- فتح الـ PDF واستخراج طبقة النص (نفس إعدادات extractPDF بالظبط) ---------- */
async function ocrOpenPdf(buf){
  if(!window.pdfjsLib) throw new Error("مكتبة قراية الـ PDF لسه بتتحمّل — استنى ثواني وجرّب تاني (محتاجة إنترنت أول مرة).");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.min.js";
  const pdf = await pdfjsLib.getDocument({data: buf}).promise;
  if(!pdf || !pdf.numPages) throw new Error("الملف ده مفيهوش صفحات قابلة للقراية — شكله تالف أو فاضي.");
  return pdf;
}
/* رباطات لا/لأ اللي بتتسجل حرفين عاديين بتتعكس في pdf.js («السالمة»): بنصلحها من جليفات الـ operator list (صفحات حروفها الأساسية بس) */
async function fixPageLigatures(page, tc){
  try{
    const helper = window.PdfText;
    if(!helper || !helper.fixLigatureItems || !window.pdfjsLib || !pdfjsLib.OPS) return;
    let basic = 0; for(const it of tc.items){ const m = String(it.str||"").match(/[\u0627\u0644]/g); if(m) basic += m.length; if(basic > 6) break; }
    if(basic <= 6) return;
    const ol = await page.getOperatorList(), runs = [];
    for(let q = 0; q < ol.fnArray.length; q++){
      if(ol.fnArray[q] === pdfjsLib.OPS.showText){ const a = ol.argsArray[q] && ol.argsArray[q][0]; if(Array.isArray(a)) runs.push(a.filter(g=>g && typeof g === "object").map(g=>String(g.unicode == null ? "" : g.unicode))); }
    }
    helper.fixLigatureItems(tc.items, runs);
  }catch(e){}
}
async function ocrLayerText(pdf){
  const out = [];
  for(let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    /* disableNormalization: تطبيع pdf.js بيفك الحروف المركبة (في/لا/المجموعات المشكولة) وبعدين بيقلبها كعربي، فتطلع مقلوبة («يف» بدل «في») */
    const tc = await page.getTextContent({disableNormalization: true});
    await fixPageLigatures(page, tc);
    out.push(tc.items.map(it=>it.str).join(" "));
    if(page.cleanup) page.cleanup();
  }
  return out.join("\n\n");
}
async function ocrLayerPages(pdf){
  const pages = [];
  for(let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent({disableNormalization: true});
    await fixPageLigatures(page, tc);
    const fallback = tc.items.map(it=>it.str).join(" ").trim();
    const helper = typeof window !== "undefined" ? window.PdfText : null;
    const lines = helper && typeof helper.itemsToLines === "function" ? helper.itemsToLines(tc.items) : (fallback ? [fallback] : []);
    pages.push(lines);
    if(page.cleanup) page.cleanup();
  }
  return pages;
}
/* كتاب مصوّر؟ طبقة النص فاضية/شحيحة: أقل من عتبة الإضافة، أو متوسط حروف هزيل لكل صفحة رغم طول الكتاب
   (بيغطي حالة الوتر مارك المتكرر اللي بيعدي العتبة المطلقة وهو مش نص كتاب أصلًا) */
function ocrLooksScanned(text, numPages){
  const t = String(text || "").trim();
  if(t.length < OCR_LAYER_MIN_CHARS) return true;
  if(numPages >= 3 && (t.length / numPages) < OCR_LAYER_PER_PAGE) return true;
  return false;
}

/* ---------- رسم صفحة PDF على كانفس بدقة تناسب الـ OCR (هدف ~٢٤٠٠ بكسل عرض، بسقف أمان للذاكرة) ---------- */
async function ocrRenderPage(pdf, pageNum){
  const page = await pdf.getPage(pageNum);
  const base = page.getViewport({scale: 1});
  let scale = 2400 / base.width;
  scale = Math.max(1.6, Math.min(4.2, scale));
  if(base.height * scale > 3400) scale = 3400 / base.height;
  const vp = page.getViewport({scale: scale});
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext("2d");
  if(ctx){ ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  await page.render({canvasContext: ctx, viewport: vp}).promise;
  if(page.cleanup) page.cleanup();
  return canvas;
}

function ocrSleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
function ocrFmtDur(sec){
  sec = Math.max(0, Math.round(sec || 0));
  if(sec < 70) return "أقل من دقيقة";
  const m = Math.round(sec / 60);
  if(m < 60) return "حوالي " + m + " دقيقة";
  const h = Math.floor(m / 60), rm = m % 60;
  return "حوالي " + h + " ساعة" + (rm ? " و" + rm + " دقيقة" : "");
}

/* ---------- قلب خط الـ OCR: صفحات مرسومة → نص، مع إيقاف مؤقت/استكمال/إلغاء من برّه ----------
   opts: {from, to, onProgress(evt), control:{isPaused(), isCancelled()}}
   أحداث التقدم: {type:'page'|'page-done'|'paused', page, done, total, chars, frac?, avg?} */
async function ocrPdfToText(pdf, opts){
  opts = opts || {};
  const control = opts.control || {};
  const from = Math.max(1, opts.from || 1);
  const to = Math.min(pdf.numPages, opts.to || pdf.numPages);
  const total = Math.max(0, to - from + 1);
  const worker = await ocrGetWorker();
  const parts = [];
  let chars = 0, done = 0, avg = OCR_EST_SEC_PER_PAGE;
  const isC = ()=>{ try{ return !!(control.isCancelled && control.isCancelled()); }catch(e){ return false; } };
  const isP = ()=>{ try{ return !!(control.isPaused && control.isPaused()); }catch(e){ return false; } };
  for(let p = from; p <= to; p++){
    if(isC()) break;
    while(isP() && !isC()){
      if(opts.onProgress) opts.onProgress({type: "paused", page: p, done: done, total: total, chars: chars});
      await ocrSleep(300);
    }
    if(isC()) break;
    const t0 = Date.now();
    if(opts.onProgress) opts.onProgress({type: "render", page: p, done: done, total: total, chars: chars}); /* [E] مرحلة رسم/تجهيز الصفحة قبل التعرف عليها */
    const canvas = await ocrRenderPage(pdf, p);
    ocrTessSink = (m)=>{
      if(opts.onProgress && m && m.status === "recognizing text")
        opts.onProgress({type: "page", page: p, done: done, total: total, chars: chars, frac: m.progress || 0, avg: avg});
    };
    let pageText = "";
    try{
      /* [E] الثابت العام: ولا مرحلة تلف من غير سقف — تعليقة قراءة صفحة بتقتل العامل المعلّق وبتطلع خطأ مرحلي بدل لفّ أبدي */
      const r = await ocrRaceTimeout(worker.recognize(canvas), ocrPageTimeoutMs);
      pageText = (r && r.data && r.data.text) || "";
    }catch(e){
      if(e && e.message === "OCR_TIMEOUT"){
        try{ if(worker.terminate) await worker.terminate(); }catch(_){}
        ocrWorkerPromise = null;
        ocrDiagMark("page", t0, false, "OCR_TIMEOUT صفحة " + p);
        throw ocrBootStageError("page", e);
      }
      throw e;
    } finally { ocrTessSink = null; }
    parts.push(pageText.trim());
    chars += pageText.trim().length;
    done++;
    if(done === 1) ocrDiagMark("first-recognize", t0, true, "صفحة " + p); /* [E] أول تعرف فعلي — نهاية سلسلة التشغيل في التشخيص */
    const sec = (Date.now() - t0) / 1000;
    avg = done === 1 ? sec : (avg * 0.6 + sec * 0.4);
    if(opts.onProgress) opts.onProgress({type: "page-done", page: p, done: done, total: total, chars: chars, avg: avg});
  }
  return { text: parts.join("\n\n"), done: done, total: total, chars: chars, cancelled: isC(), from: from, to: to };
}

/* ---------- نقطة الدخول من الاستيراد: نص الطبقة لو كفاية، ولو الكتاب مصوّر → لوحة الـ OCR ----------
   بترجع {text, ocr:null, pages, pageCount} للكتب النصية، و{text, ocr:{...}, pages:null, pageCount} للمصوّرة */
/* بعض ملفات الـ PDF العربية بتخزن النص بأشكال عرض (Presentation Forms U+FB50–FEFF):
   بنفكها لحروف قياسية بـ NFKC عشان البحث والمطابقة يشتغلوا صح */
function expandPresentationForms(t){
  const pt = (typeof window !== "undefined" && window.PdfText) ? window.PdfText : null;
  if(pt && typeof pt.expandText === "function") return pt.expandText(t);
  t = String(t == null ? "" : t);
  return /[\uFB50-\uFDFF\uFE70-\uFEFF]/.test(t) ? t.normalize("NFKC") : t;
}
async function extractPDFWithOCR(buf, title){
  const pdf = await ocrOpenPdf(buf);
  const layer = await ocrLayerText(pdf);
  /* ترميز عربي مكسور من المصنع (خريطة حروف غلط جوه الملف): طبقة النص موجودة بس حروفها ضايعة،
     فبنعامل الملف كأنه مصوّر ونروح للـ OCR اللي بيقرأ من الصورة — نفس كشف الراوي بالظبط */
  const _pt = (typeof window !== "undefined" && window.PdfText) ? window.PdfText : null;
  const layerBroken = !!(_pt && typeof _pt.brokenArabicEncoding === "function" && _pt.brokenArabicEncoding(expandPresentationForms(layer)));
  if(!ocrLooksScanned(layer, pdf.numPages) && !layerBroken){
    const pageLines = await ocrLayerPages(pdf);
    if(!window.PdfText || typeof window.PdfText.stripRunningHeaders !== "function") return { text: expandPresentationForms(layer), ocr: null, pages: null, pageCount: pdf.numPages };
    const cleaned = window.PdfText.stripRunningHeaders(pageLines);
    const pages = cleaned.pages.map(lines=>expandPresentationForms(lines.join("\n")));
    return { text: pages.join("\n\n"), ocr: null, pages: pages, pageCount: pdf.numPages };
  }
  if(typeof document === "undefined" || !document.getElementById("ocrPanel"))
    throw new Error(layerBroken
      ? "ترميز العربي في ملف الـPDF ده مكسور من مصدره — خريطة الحروف جوه الملف نفسه غلط، فأي برنامج استخراج نص هيطلّع منه نفس الحروف المبهدلة. الحل: نسخة نصية من الكتاب (الصق نصه أو ارفع TXT)."
      : "الكتاب ده PDF مصوّر (صور من غير نص) ومفيش واجهة تعرّف ضوئي متاحة هنا.");
  const res = await ocrPanelFlow(pdf, title);
  return {
    text: res.text,
    ocr: {
      engine: "tesseract-ara-eng", pages: pdf.numPages,
      from: res.from, to: res.to, done: res.done,
      chars: res.text.length, partial: !!res.partial, at: Date.now()
    },
    pages: null, pageCount: pdf.numPages
  };
}

/* ---------- لوحة الـ OCR: نطاق الصفحات، تحذير الوقت للكتب الكبيرة، تقدم حي، إيقاف/استكمال/إلغاء ---------- */
function ocrPanelEl(id){ return document.getElementById(id); }
function ocrSelectedRange(numPages){
  const modeEl = document.querySelector('input[name="ocrRangeMode"]:checked');
  const mode = modeEl ? modeEl.value : "all";
  if(mode === "first"){
    let n = parseInt((ocrPanelEl("ocrFirstN") || {}).value, 10);
    if(!n || n < 1) n = OCR_AUTO_MAX_PAGES;
    return { from: 1, to: Math.min(numPages, n), mode: mode };
  }
  if(mode === "custom"){
    let a = parseInt((ocrPanelEl("ocrFrom") || {}).value, 10);
    let b = parseInt((ocrPanelEl("ocrTo") || {}).value, 10);
    if(!a || a < 1) a = 1;
    if(!b || b < a) b = a;
    return { from: Math.min(a, numPages), to: Math.min(b, numPages), mode: mode };
  }
  return { from: 1, to: numPages, mode: "all" };
}
function ocrSyncTimeWarn(pdf){
  const warn = ocrPanelEl("ocrTimeWarn"); if(!warn || !pdf) return;
  const r = ocrSelectedRange(pdf.numPages);
  const selPages = r.to - r.from + 1;
  let msg = "⏱ الوقت التقديري للنطاق المختار (" + selPages + " صفحة): " + ocrFmtDur(selPages * OCR_EST_SEC_PER_PAGE) + " — بيقلّ أو يزيد حسب سرعة جهازك.";
  if(pdf.numPages > OCR_AUTO_MAX_PAGES && r.mode === "all")
    msg += " ⚠️ الكتاب كله " + pdf.numPages + " صفحة هياخد " + ocrFmtDur(pdf.numPages * OCR_EST_SEC_PER_PAGE) + " تقريبًا — الأفضل تبدأ بأول " + OCR_AUTO_MAX_PAGES + " صفحة وتكمل الباقي بنطاق مخصص بعدين.";
  warn.textContent = msg;
}
function ocrWirePanel(pdf){
  if(ocrPanelWired) return;
  ocrPanelWired = true;
  const onRange = ()=>ocrSyncTimeWarn(pdf);
  ["ocrFirstN", "ocrFrom", "ocrTo"].forEach(id=>{
    const el = ocrPanelEl(id);
    if(el) el.addEventListener("input", onRange);
  });
  document.querySelectorAll('input[name="ocrRangeMode"]').forEach(r=>r.addEventListener("change", onRange));
  const startBtn = ocrPanelEl("ocrStart");
  if(startBtn) startBtn.addEventListener("click", ()=>{ if(ocrJob && !ocrJob.running) ocrStartJob(); });
  const pauseBtn = ocrPanelEl("ocrPause");
  if(pauseBtn) pauseBtn.addEventListener("click", ()=>{
    if(!ocrJob || !ocrJob.running) return;
    ocrJob.paused = !ocrJob.paused;
    pauseBtn.textContent = ocrJob.paused ? "▶ استكمال" : "⏸ إيقاف مؤقت";
    const st = ocrPanelEl("ocrStatus");
    if(st) st.textContent = ocrJob.paused ? "⏸ واقف مؤقتًا — دوس «استكمال» عشان يكمل من نفس الصفحة." : "▶ بيكمل التعرف…";
  });
  const diagBtn = ocrPanelEl("ocrDiag");
  if(diagBtn) diagBtn.addEventListener("click", async ()=>{
    const okCopy = await copyOcrDiagnostics();
    const st = ocrPanelEl("ocrStatus");
    if(st) st.textContent = okCopy ? "📋 اتنسخ تشخيص التشغيل — الصقه في أي محادثة أو ملف." : "⚠️ النسخ مقدرش يتم على الجهاز ده.";
  });
  const cancelBtn = ocrPanelEl("ocrCancel");
  if(cancelBtn) cancelBtn.addEventListener("click", ()=>{
    if(!ocrJob) return;
    ocrJob.cancelled = true;
    if(!ocrJob.running && ocrJob.bootError){ /* [D-13] إلغاء بعد فشل تشغيل المحرك: اقفل اللوحة وانهِ الاستيراد بدل ما يفضل معلّق */
      const j = ocrJob; ocrJob = null; ocrHidePanel();
      j.reject(new Error("اتلغى استيراد الكتاب المصوّر — من غير تعرّف ضوئي مفيش نص يتقري منه."));
    }
  });
}
function ocrSetRunningUI(running){
  const ids = { ocrStart: !running, ocrPause: running, ocrRangeBox: !running, ocrCancel: true };
  Object.keys(ids).forEach(id=>{
    const el = ocrPanelEl(id);
    if(el) el.classList.toggle("hidden", !ids[id]);
  });
  const pauseBtn = ocrPanelEl("ocrPause");
  if(pauseBtn && running) pauseBtn.textContent = "⏸ إيقاف مؤقت";
}
function ocrHidePanel(){
  const p = ocrPanelEl("ocrPanel");
  if(p) p.classList.add("hidden");
  ocrSetRunningUI(false);
}
function ocrPanelFlow(pdf, title){
  return new Promise((resolve, reject)=>{
    const panel = ocrPanelEl("ocrPanel");
    const info = ocrPanelEl("ocrInfo");
    const status = ocrPanelEl("ocrStatus");
    const bar = ocrPanelEl("ocrBar");
    ocrJob = { resolve: resolve, reject: reject, paused: false, cancelled: false, running: false, pdf: pdf };
    ocrWirePanel(pdf);
    if(info) info.textContent = "«" + (title || "الكتاب") + "» — الـ PDF ده مصوّر: صفحاته صور من غير طبقة نص (" + pdf.numPages + " صفحة)، عشان كده التطبيق هيشغّل تعرّف ضوئي (OCR) على جهازك ويحوّل الصور لنص قابل للقراية والترجمة.";
    if(status) status.textContent = "";
    if(bar) bar.style.width = "0%";
    /* النطاق الافتراضي: الكل للكتب الصغيرة، وأول ٦٠ للكبيرة عشان الوقت */
    const big = pdf.numPages > OCR_AUTO_MAX_PAGES;
    document.querySelectorAll('input[name="ocrRangeMode"]').forEach(r=>{ r.checked = (r.value === (big ? "first" : "all")); });
    const toEl = ocrPanelEl("ocrTo"); if(toEl){ toEl.max = pdf.numPages; toEl.value = Math.min(pdf.numPages, OCR_AUTO_MAX_PAGES); }
    const fromEl = ocrPanelEl("ocrFrom"); if(fromEl){ fromEl.max = pdf.numPages; fromEl.value = 1; }
    const nEl = ocrPanelEl("ocrFirstN"); if(nEl){ nEl.max = pdf.numPages; }
    ocrSyncTimeWarn(pdf);
    ocrSetRunningUI(false);
    if(panel){
      panel.classList.remove("hidden");
      try{ panel.scrollIntoView({behavior: "smooth", block: "center"}); }catch(e){}
    }
    if(!big){ /* كتاب صغير: يبدأ لوحده — «يقبل أي كتاب ويظبطه من نفسه» */
      if(status) status.textContent = "📷 بيجهّز محرك التعرف الضوئي وبيبدأ لوحده…";
      setTimeout(()=>{ if(ocrJob && !ocrJob.running && !ocrJob.cancelled) ocrStartJob(); }, 350);
    } else {
      if(status) status.textContent = "الكتاب كبير — اختار نطاق الصفحات ودوس «ابدأ التعرف».";
    }
  });
}
async function ocrStartJob(){
  const job = ocrJob;
  if(!job || job.running) return;
  const pdf = job.pdf;
  const range = ocrSelectedRange(pdf.numPages);
  job.running = true;
  job.paused = false;
  job.bootError = null;
  ocrSetRunningUI(true);
  const diagBtn0 = ocrPanelEl("ocrDiag");
  if(diagBtn0) diagBtn0.classList.add("hidden"); /* زر التشخيص بيظهر بس مع خطأ مرحلي */
  const status = ocrPanelEl("ocrStatus");
  const bar = ocrPanelEl("ocrBar");
  if(status) status.textContent = "📷 بيجهّز محرك التعرف الضوئي…";
  /* [D-13] حالات تجهيز المحرك (تحميل النواة/اللغات/التهيئة) بتتكتب في سطر الحالة بدل ما يفضل ثابت */
  ocrBootSink = (m)=>{ const t = ocrBootStatusText(m); if(t && status) status.textContent = t; };
  try{
    const res = await ocrPdfToText(pdf, {
      from: range.from, to: range.to,
      control: { isPaused: ()=>job.paused, isCancelled: ()=>job.cancelled },
      onProgress: (ev)=>{
        if(!status) return;
        const pctTotal = ev.total ? Math.round(((ev.done + (ev.frac || 0)) / ev.total) * 100) : 0;
        if(bar) bar.style.width = pctTotal + "%";
        if(ev.type === "paused"){ status.textContent = "⏸ واقف مؤقتًا عند صفحة " + ev.page + " — اتعمل " + ev.done + " صفحة (" + ev.chars + " حرف)."; return; }
        if(ev.type === "render"){ status.textContent = "📷 تجهيز الصفحة " + ev.page + "…"; if(bar) bar.style.width = pctTotal + "%"; return; }
        const remain = ev.avg ? ocrFmtDur(ev.avg * (ev.total - ev.done)) : "";
        status.textContent = "📷 صفحة " + ev.page + " من " + (range.to) + " · اتعمل " + ev.done + "/" + ev.total + " صفحة · النص المستخرج لحد دلوقتي " + ev.chars + " حرف" + (remain && ev.type === "page-done" ? " · فاضل " + remain + " تقريبًا" : "") + "…";
      }
    });
    ocrBootSink = null;
    job.running = false;
    ocrHidePanel();
    ocrJob = null;
    if(res.cancelled){
      const usable = res.text.trim().length >= 200 && res.done > 0;
      if(usable && confirm("وقفت التعرف بعد " + res.done + " صفحة (" + res.text.trim().length + " حرف) — النص اللي طلع قابل للقراية. تحب تضيف اللي اتعمل ككتاب جزئي؟ تقدر تضيف باقي الصفحات بعدين ككتاب منفصل بنطاق مخصص."))
        return job.resolve({ text: res.text, from: res.from, to: res.to, done: res.done, partial: true });
      return job.reject(new Error("اتلغى استيراد الكتاب المصوّر — من غير تعرّف ضوئي مفيش نص يتقري منه."));
    }
    if(res.text.trim().length < OCR_LAYER_MIN_CHARS)
      return job.reject(new Error("التعرف الضوئي مخلّصش نص قابل للقراية من الصفحات المختارة — جرّب نطاق صفحات تاني أو اتأكد إن الصفحات مكتوبة بوضوح."));
    return job.resolve({ text: res.text, from: res.from, to: res.to, done: res.done, partial: res.done < (res.to - res.from + 1) });
  }catch(e){
    ocrBootSink = null;
    job.running = false;
    if(e && e.ocrBootStage){ /* [E] فشل مرحلي في التشغيل: اللوحة تفضل مفتوحة وقابلة للاستخدام — خطأ بالمرحلة + إعادة + نسخ تشخيص، بدل تجميد «بيجهّز» للأبد */
      job.bootError = e;
      ocrSetRunningUI(false);
      const diagBtn = ocrPanelEl("ocrDiag");
      if(diagBtn) diagBtn.classList.remove("hidden");
      if(typeof logError === "function") logError("OCR", new Error(e.message + " || " + ocrDiagText().replace(/\n/g, " | ")));
      if(status) status.textContent = "⚠️ " + e.message + " دوس «ابدأ التعرف» عشان تجرب تاني (إعادة)، أو «نسخ التشخيص» وابعته للدعم، أو «إلغاء» عشان تقفل الاستيراد.";
      return;
    }
    ocrHidePanel();
    ocrJob = null;
    job.reject(e);
  }
}

/* ---------- عرض إصلاح الـ OCR بالذكاء الاصطناعي: سؤال واحد بس، وبعده الإصلاح الموجود نفسه ----------
   بيتنادى بعد ما كتاب OCR يضيف ويفتح. من غير مفتاح مفيش عرض أصلًا. الإصلاح نفسه بيأكّد من جوّه
   فبنمرر skipConfirm عشان المستخدم ميجاوبش على سؤالين ورا بعض لنفس الخطوة */
function offerOcrAiRepair(book){
  if(!book || !book.ocr) return;
  if(typeof hasKey !== "function" || !hasKey()) return;
  if(typeof isBookLocked === "function" && isBookLocked(book)) return;
  if(typeof repairBook !== "function") return;
  /* [H] إصلاح جذري لتجميد ما بعد الـ OCR: confirm() الأصلي كان بيوقف الخيط الرئيسي للصفحة كلها —
     والمستخدم غالبًا ساب الجهاز أثناء دقايق التعرّف، فيرجع يلاقي الصفحة متجمدة على صندوق نظام مفتوح
     والكتاب «مختفي» (هو فعليًا اتحفظ). بانر غير مانع مكانه: الكتاب يفتح عادي والقرار بيفضل للمستخدم */
  setTimeout(()=>{ try{ showOcrRepairOffer(book); }catch(e){} }, 700);
}
function showOcrRepairOffer(book){
  const old = document.getElementById("ocrAiOffer"); if(old) old.remove();
  if(!document.body) return;
  const box = document.createElement("div");
  box.id = "ocrAiOffer";
  box.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:130px;z-index:126;background:#1e1b4b;color:#fff;border-radius:14px;padding:.8rem 1rem;max-width:92vw;direction:rtl;box-shadow:0 6px 24px rgba(0,0,0,.35);font-size:.95rem";
  const ttl = String(book.title || "").slice(0, 60);
  box.innerHTML =
    '<div style="margin-bottom:.55rem">📷 نص «' + esc(ttl) + '» جاي من تعرّف ضوئي (OCR) فغالبًا فيه غلطات حروف. تشغّل «إصلاح النص بالذكاء الاصطناعي» عليه؟ <span style="opacity:.75">الإصلاح بيبعت نص الكتاب لخدمة الذكاء الاصطناعي وبيستهلك من رصيد مفتاحك — ولو رفضت الكتاب موجود زي ما هو وتقدر تشغّله في أي وقت من أدوات الكتاب.</span></div>' +
    '<div class="row wrap" style="display:flex;gap:.4rem;flex-wrap:wrap">' +
      '<button type="button" class="primary" id="ocrAiYes">🔧 إصلح دلوقتي</button>' +
      '<button type="button" class="ghost" id="ocrAiNo">لاحقًا</button>' +
    '</div>';
  document.body.appendChild(box);
  const done = ()=>{ try{ box.remove(); }catch(e){} };
  box.querySelector("#ocrAiYes").addEventListener("click", ()=>{ done(); repairBook(book, {skipConfirm: true}); });
  box.querySelector("#ocrAiNo").addEventListener("click", done);
}

/* خطافات للاختبار الآلي (Node): نفس الدوال اللي الواجهة بتستخدمها */
let KutubiOCR = {
  extractPDFWithOCR: extractPDFWithOCR,
  ocrPdfToText: ocrPdfToText,
  ocrGetWorker: ocrGetWorker,
  ocrRestartWorker: ocrRestartWorker, /* [F] إعادة تشغيل العامل للإصلاح الذاتي */
  ocrLooksScanned: ocrLooksScanned,
  ocrLayerText: ocrLayerText,
  ocrLayerPages: ocrLayerPages,
  ocrOpenPdf: ocrOpenPdf,
  ocrRenderPage: ocrRenderPage,
  offerOcrAiRepair: offerOcrAiRepair,
  _setWorkerFactory: function(f){ ocrWorkerFactory = f; },
  _setBootTimeouts: function(t){ /* [E] الاختبارات بس: تصغير مهلة المرحلة الموحّدة (أو إرجاع الافتراضي بـ null) */
    if(!t){ ocrBootTimeouts = { stage: OCR_STAGE_TIMEOUT_MS }; ocrPageTimeoutMs = OCR_PAGE_TIMEOUT_MS; return; }
    if(t.stage) ocrBootTimeouts.stage = t.stage;
    if(t.lib) ocrBootTimeouts.stage = t.lib;   /* توافق مع اختبارات D-13 القديمة */
    if(t.boot) ocrBootTimeouts.stage = t.boot;
    if(t.page) ocrPageTimeoutMs = t.page; else if(!t.stage && !t.lib && !t.boot) ocrPageTimeoutMs = OCR_PAGE_TIMEOUT_MS;
  },
  _ocrDiagText: function(){ return ocrDiagText(); },        /* [E] فحص سجل التشخيص من الاختبارات */
  _ocrSupportsSimd: function(){ return ocrSupportsSimd(); } /* [E] فحص كشف SIMD من الاختبارات */
};
if(typeof window !== "undefined") window.KutubiOCR = KutubiOCR;
