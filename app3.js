/* ---------- قفل الإدارة بكلمة سر (للمالك) ----------
   تبويب الإدارة فيه مولّد أكواد التفعيل وسجل الأخطاء وأدوات حساسة، فهو مقفول بكلمة سر:
   اللي بيتحفظ هو تجزئة SHA-256 مملّحة بس (mk_admin_salt + mk_admin_hash) — كلمة السر
   نفسها مش بتتحفظ ولا بتتسجل في أي مكان. محتوى الإدارة مش بيتبني في الصفحة أصلًا غير
   بعد الفتح (مش مجرد مخفي بـ CSS)، والخروج من التبويب بيقفل ويمسح المحتوى من الصفحة.
   نسيت كلمة السر؟ كود المالك الدائم (OWNR) بتاع الجهاز ده هو طريق الاستعادة الوحيد. */
const ADMIN_SALT_KEY = "mk_admin_salt", ADMIN_HASH_KEY = "mk_admin_hash";
let adminUnlocked = false;   /* الفتح لجلسة مشاهدة التبويب دي بس — أي خروج منه بيقفل */
let adminFailCount = 0;      /* محاولات فتح غلط متتالية (في الذاكرة بس، مش بتتحفظ) */
let adminLockUntil = 0;      /* نهاية القفل المؤقت بعد ٥ محاولات غلط (في الذاكرة بس) */
let adminLockTimer = null;   /* عدّاد تحديث رسالة القفل المؤقت */
function hasAdminPw(){ try{ return !!localStorage.getItem(ADMIN_HASH_KEY); }catch(e){ return false; } }
async function adminPwDigest(pw){
  const salt = localStorage.getItem(ADMIN_SALT_KEY) || "";
  return sha256Hex(salt + "|" + pw);
}
function stopAdminLockTimer(){ if(adminLockTimer){ clearInterval(adminLockTimer); adminLockTimer = null; } }
/* قفل الإدارة + مسح محتواها من الصفحة — بيتنادى عند مغادرة التبويب أو من زرار «اقفل الإدارة» */
function lockAdminGate(){
  adminUnlocked = false;
  stopAdminLockTimer();
  const root = $("#adminRoot"); if(root) root.innerHTML = "";
}
function renderAdmin(){
  const root = $("#adminRoot"); if(!root) return;
  if(adminUnlocked){ renderAdminContent(root); return; }
  if(hasAdminPw()) renderAdminLock(root); else renderAdminSetup(root);
}
/* أول مرة: إنشاء كلمة سر الإدارة (مفيش أي محتوى إدارة قبلها) */
function renderAdminSetup(root){
  stopAdminLockTimer();
  root.innerHTML =
    '<div class="card">' +
    '<div class="admin-gate-ic">🔐</div>' +
    '<h2>إنشاء كلمة سر الإدارة</h2>' +
    '<p class="hint">تبويب الإدارة فيه مولّد أكواد التفعيل وأدوات المالك — اعمل له كلمة سر عشان محدش غيرك يفتحه. اللي بيتحفظ على الجهاز هو تجزئة مشفّرة من كلمة السر بس، مش كلمة السر نفسها.</p>' +
    '<label>كلمة السر (٦ حروف على الأقل)<input id="adminPwNew" type="password" autocomplete="new-password" dir="ltr"></label>' +
    '<label>أكّد كلمة السر<input id="adminPwConfirm" type="password" autocomplete="new-password" dir="ltr"></label>' +
    '<div class="row wrap"><button type="button" id="btnAdminPwSet" class="primary">🔐 إنشاء كلمة السر</button></div>' +
    '<p id="adminSetupMsg" class="msg"></p>' +
    '</div>';
  const set = async ()=>{
    const msg = $("#adminSetupMsg"); if(!msg) return;
    const p1 = $("#adminPwNew").value, p2 = $("#adminPwConfirm").value;
    if(p1.length < 6){ msg.textContent = "كلمة السر قصيرة — لازم تبقى ٦ حروف على الأقل."; msg.classList.add("err"); return; }
    if(p1 !== p2){ msg.textContent = "كلمة السر وتأكيدها مش زي بعض — راجعهم وجرّب تاني."; msg.classList.add("err"); return; }
    msg.textContent = "بيتأكد…"; msg.classList.remove("err");
    try{
      const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
      const salt = Array.from(bytes, b=>b.toString(16).padStart(2,"0")).join("");
      localStorage.setItem(ADMIN_SALT_KEY, salt);
      localStorage.setItem(ADMIN_HASH_KEY, await sha256Hex(salt + "|" + p1));
    }catch(e){ msg.textContent = "مقدرتش أحفظ كلمة السر على الجهاز ده."; msg.classList.add("err"); return; }
    adminFailCount = 0; adminLockUntil = 0; adminUnlocked = true;
    renderAdmin();
  };
  $("#btnAdminPwSet").addEventListener("click", set);
  $("#adminPwConfirm").addEventListener("keydown", e=>{ if(e.key === "Enter"){ e.preventDefault(); set(); } });
}
/* كل مرة بعد كده: شاشة قفل — المحتوى مش موجود في الصفحة لحد الفتح الصح */
function renderAdminLock(root){
  stopAdminLockTimer();
  root.innerHTML =
    '<div class="card">' +
    '<div class="admin-gate-ic">🔒</div>' +
    '<h2>الإدارة مقفولة</h2>' +
    '<p class="hint">اكتب كلمة سر الإدارة عشان تفتح مولّد الأكواد وأدوات المالك.</p>' +
    '<label>كلمة سر الإدارة<input id="adminPwInput" type="password" autocomplete="current-password" dir="ltr"></label>' +
    '<div class="row wrap"><button type="button" id="btnAdminUnlock" class="primary">افتح الإدارة</button></div>' +
    '<p id="adminLockMsg" class="msg"></p>' +
    '<h3>نسيت كلمة السر؟</h3>' +
    '<p class="hint">اكتب كود المالك الدائم (OWNR) الخاص بالجهاز ده — لو صح، كلمة السر القديمة هتتشال وترجع تعمل واحدة جديدة. مفيش أي طريقة استعادة تانية.</p>' +
    '<label>كود المالك<input id="adminRecoverCode" type="text" dir="ltr" placeholder="OWNR-XXXXXX" autocomplete="off"></label>' +
    '<div class="row wrap"><button type="button" id="btnAdminRecover" class="ghost">استعادة بكود المالك</button></div>' +
    '<p id="adminRecoverMsg" class="msg"></p>' +
    '</div>';
  const msg = $("#adminLockMsg");
  const showLockout = ()=>{
    const left = Math.max(0, Math.ceil((adminLockUntil - Date.now()) / 1000));
    if(left > 0){ msg.textContent = "محاولات غلط كتير — استنى " + left + " ثانية وجرّب تاني."; msg.classList.add("err"); return true; }
    return false;
  };
  if(adminLockUntil && Date.now() < adminLockUntil){
    showLockout();
    adminLockTimer = setInterval(()=>{
      if(!$("#adminLockMsg")){ stopAdminLockTimer(); return; }
      if(!showLockout()){ stopAdminLockTimer(); msg.textContent = ""; msg.classList.remove("err"); }
    }, 500);
  }
  const unlock = async ()=>{
    if(Date.now() < adminLockUntil){ showLockout(); return; }
    const inp = $("#adminPwInput"); if(!inp) return;
    if(!inp.value){ msg.textContent = "اكتب كلمة السر الأول."; msg.classList.add("err"); return; }
    msg.textContent = "بيتأكد…"; msg.classList.remove("err");
    let okHash = false;
    try{ okHash = (await adminPwDigest(inp.value)) === localStorage.getItem(ADMIN_HASH_KEY); }catch(e){}
    if(okHash){
      adminUnlocked = true; adminFailCount = 0; adminLockUntil = 0; stopAdminLockTimer();
      renderAdmin();
    } else {
      adminFailCount++;
      if(adminFailCount >= 5){
        adminLockUntil = Date.now() + 30000; adminFailCount = 0;
        renderAdminLock(root); /* إعادة رسم عشان عدّاد القفل المؤقت يشتغل على الرسالة الجديدة */
        const m2 = $("#adminLockMsg"); if(m2){ m2.textContent = "محاولات غلط كتير — الإدارة اتقفلت مؤقتًا ٣٠ ثانية."; m2.classList.add("err"); }
      } else {
        msg.textContent = "كلمة السر مش صح — فاضل " + (5 - adminFailCount) + " محاولات قبل قفل مؤقت."; msg.classList.add("err");
      }
    }
  };
  $("#btnAdminUnlock").addEventListener("click", unlock);
  $("#adminPwInput").addEventListener("keydown", e=>{ if(e.key === "Enter"){ e.preventDefault(); unlock(); } });
  $("#btnAdminRecover").addEventListener("click", async ()=>{
    const rmsg = $("#adminRecoverMsg"); if(!rmsg) return;
    rmsg.textContent = "بيتأكد من الكود…"; rmsg.classList.remove("err");
    if(await validateOwnerCode($("#adminRecoverCode").value, getInstallId())){
      try{ localStorage.removeItem(ADMIN_HASH_KEY); localStorage.removeItem(ADMIN_SALT_KEY); }catch(e){}
      adminFailCount = 0; adminLockUntil = 0; adminUnlocked = false; stopAdminLockTimer();
      renderAdmin();
      const sm = $("#adminSetupMsg"); if(sm){ sm.textContent = "اتشالت كلمة السر القديمة ✔ اعمل واحدة جديدة دلوقتي."; sm.classList.remove("err"); }
    } else {
      rmsg.textContent = "الكود ده مش كود مالك صحيح لجهازك — الاستعادة مش هتكمل."; rmsg.classList.add("err");
    }
  });
}
/* المحتوى الكامل — بيتبني هنا بس، بعد فتح ناجح، وبيتمسح كله عند القفل/المغادرة */
function renderAdminContent(root){
  stopAdminLockTimer();
  const owner = isOwner();
  let h = "";
  h += '<div class="card">' +
    '<div class="row wrap admin-head"><h2>🛠 لوحة الإدارة</h2><button type="button" id="btnAdminLockNow" class="ghost">🔒 اقفل الإدارة</button></div>' +
    '<p class="sub-status ok">الإدارة مفتوحة بكلمة السر — هتتقفل لوحدها أول ما تسيب التبويب ده.</p>' +
    '</div>';
  h += '<div class="card">' +
    '<h2>🎟 مولّد أكواد التفعيل</h2>' +
    '<p class="hint">العميل يبعت لك كود التثبيت بتاع جهازه (من بانل الاشتراك عنده) — الصقه هنا وولّد له كوده. الأكواد المتولّدة هي بس اللي بتظهر، ومفيش أي سر بيظهر في أي مكان.</p>' +
    '<label>كود تثبيت العميل<input id="genInstallId" type="text" dir="ltr" placeholder="XXXXXXXX" autocomplete="off"></label>' +
    '<label>شهر الاشتراك<input id="genMonth" type="month" dir="ltr"></label>' +
    '<div class="row wrap"><button type="button" id="btnGenSub" class="primary">توليد كود شهري</button><button type="button" id="btnGenOwner" class="ghost">توليد كود مالك دائم</button></div>' +
    '<div id="genOut" class="hidden"><p class="hint" id="genOutLabel"></p>' +
    '<div class="row wrap"><code class="install-id" id="genCodeOut" dir="ltr"></code><button type="button" class="ghost" id="genCopy">نسخ الكود</button></div></div>' +
    '<p id="genMsg" class="msg"></p>' +
    '</div>';
  if(owner){
    h += '<div class="card"><h2>⭐ لوحة المالك</h2>' +
      '<p class="sub-status ok">وضع المالك مفعّل — وصول كامل دائم</p>' +
      '<p class="hint">كود التثبيت بتاع جهازك:</p>' +
      '<div class="row wrap"><code class="install-id" id="adminInstallId" dir="ltr"></code><button type="button" class="ghost" id="adminCopyId">نسخ</button></div>' +
      '<p id="adminStats" class="hint"></p>' +
      '<div class="row wrap"><button type="button" id="btnAdminSub" class="ghost">فتح صفحة الاشتراك</button><button type="button" id="btnAdminWipe" class="ghost">مسح كل البيانات</button></div>' +
      '<p id="adminDashMsg" class="msg"></p></div>';
  } else {
    h += '<div class="card"><h2>⭐ وضع المالك</h2>' +
      '<p class="hint">فعّل وضع المالك بكود المالك الدائم الخاص بجهازك عشان يفتح لك وصول كامل دائم على الجهاز ده.</p>' +
      '<label>كود المالك<input id="adminCode" type="text" dir="ltr" placeholder="OWNR-XXXXXX" autocomplete="off"></label>' +
      '<div class="row wrap"><button type="button" id="btnAdminActivate" class="primary">تفعيل وضع المالك</button></div>' +
      '<p id="adminMsg" class="msg"></p></div>';
  }
  h += '<div class="card"><h3>آخر الأخطاء</h3><div id="adminErrLog"><p class="hint">مفيش أخطاء متسجلة.</p></div>' +
    '<div class="row wrap"><button type="button" id="btnClearErrLog" class="ghost">مسح سجل الأخطاء</button></div></div>';
  /* [F] الصحة والإصلاح الذاتي: فحص عند الإقلاع وعند الطلب + سجل إصلاحات ظاهر */
  h += '<div class="card"><h3>🩺 الصحة والإصلاح الذاتي</h3>' +
    '<p class="hint">التطبيق بيفحص نفسه عند الإقلاع وبيصلّح تلقائيًا فئات الأعطال المعروفة (تخزين عالق، حالة ترجمة عالقة، محرك OCR، إعدادات برّه النطاق، أجزاء كتب بايظة). ممنوع مسح كتبك أبدًا: الجزء البايظ بيترجع من النسخة الأصلية أو بيُعزل مع نسخة احتياطية قابلة للاسترجاع. مشاكل المفتاح بتتبلّغ بس — دي بتاعتك.</p>' +
    '<div class="row wrap"><button type="button" id="btnHealthRun" class="primary">🩺 فحص وإصلاح دلوقتي</button></div>' +
    '<p id="healthSummary" class="hint"></p>' +
    '<h3>📜 سجل الإصلاحات</h3><div id="repairLogList"></div></div>';
  root.innerHTML = h;

  $("#btnAdminLockNow").addEventListener("click", ()=>{ lockAdminGate(); renderAdmin(); });
  const gm = $("#genMonth"); if(gm){ const n = new Date(); gm.value = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0"); }
  const genErr = (t)=>{ const m = $("#genMsg"); if(m){ m.textContent = t; m.classList.add("err"); } };
  const showGen = (label, code)=>{
    $("#genOutLabel").textContent = label;
    $("#genCodeOut").textContent = code;
    $("#genOut").classList.remove("hidden");
    const m = $("#genMsg"); if(m){ m.textContent = ""; m.classList.remove("err"); }
  };
  const validGenId = ()=>{
    const id = normalizeSubCode($("#genInstallId").value);
    if(id.length !== 8){ genErr("كود التثبيت لازم يبقى ٨ حروف/أرقام زي ما العميل بعته بالظبط."); return null; }
    return id;
  };
  $("#btnGenSub").addEventListener("click", async ()=>{
    const id = validGenId(); if(!id) return;
    const mm = /^(\d{4})-(\d{2})$/.exec($("#genMonth").value || "");
    if(!mm){ genErr("اختار شهر الاشتراك الأول."); return; }
    const yymm = mm[1].slice(2) + mm[2];
    const code = yymm + "-" + (await subCheckChars(id, yymm));
    showGen("كود اشتراك " + subMonthYearLabel(yymm) + " — لجهاز العميل " + id + " (صالح لحد آخر الشهر):", code);
  });
  $("#btnGenOwner").addEventListener("click", async ()=>{
    const id = validGenId(); if(!id) return;
    const code = "OWNR-" + (await ownerCheckChars(id));
    showGen("كود مالك دائم — لجهاز العميل " + id + " (مش بينتهي):", code);
  });
  $("#genCopy").addEventListener("click", async ()=>{
    const m = $("#genMsg"); const code = $("#genCodeOut").textContent;
    try{ await navigator.clipboard.writeText(code); if(m){ m.textContent = "اتنسخ الكود ✔ ابعته للعميل."; m.classList.remove("err"); } }
    catch(e){ if(m){ m.textContent = "انسخ الكود يدويًا من فوق."; m.classList.remove("err"); } }
  });
  if(owner){
    $("#adminInstallId").textContent = getInstallId();
    const tot = books.reduce((n,b)=>n + b.chunks.length, 0);
    const done = books.reduce((n,b)=>n + b.chunks.filter(c=>c.status === "done").length, 0);
    $("#adminStats").textContent = "عدد الكتب: " + books.length + " · إجمالي الأجزاء: " + tot + " · الأجزاء المترجمة: " + done;
    $("#adminCopyId").addEventListener("click", async ()=>{
      const msg = $("#adminDashMsg"); const id = getInstallId();
      try{ await navigator.clipboard.writeText(id); if(msg){ msg.textContent = "اتنسخ كود التثبيت ✔"; msg.classList.remove("err"); } }
      catch(e){ if(msg) msg.textContent = "انسخ الكود يدويًا: " + id; }
    });
    $("#btnAdminSub").addEventListener("click", ()=>switchTab("settings"));
    $("#btnAdminWipe").addEventListener("click", ()=>{ const w = $("#btnWipe"); if(w) w.click(); });
  } else {
    $("#btnAdminActivate").addEventListener("click", async ()=>{
      const msg = $("#adminMsg"); if(!msg) return;
      msg.textContent = "بيتأكد من الكود…"; msg.classList.remove("err");
      const r = await tryActivateSub($("#adminCode").value);
      if(isOwner()){
        renderAdmin(); renderSubPanels(); renderLibrary();
        const b = currentBook(); if(b) renderReader(b);
      } else if(r.ok){
        msg.textContent = "الكود ده فعّل اشتراك شهري — وضع المالك محتاج كود OWNR الخاص بيك."; msg.classList.remove("err");
        renderSubPanels(); renderLibrary();
      } else {
        msg.textContent = "الكود ده مش كود مالك صحيح لجهازك — اتأكد إنه كود OWNR المتولّد لكود التثبيت بتاع الجهاز ده بالظبط."; msg.classList.add("err");
      }
    });
  }
  renderErrLogUI();
  $("#btnClearErrLog").addEventListener("click", ()=>clearErrLog());
  /* [F] لوحة الصحة: رسم سجل الإصلاحات + زرار الفحص اليدوي الكامل (فيه إقلاع OCR نشط) */
  if(typeof renderRepairLog === "function") renderRepairLog();
  const hb = $("#btnHealthRun");
  if(hb) hb.addEventListener("click", async ()=>{
    hb.disabled = true;
    try{
      const r = await runHealthChecks({ active: true, source: "manual", allowReload: false });
      if(r && r.booksChanged){ renderLibrary(); const cb = currentBook(); if(cb) renderReader(cb); }
    } finally { hb.disabled = false; }
  });
}

/* ---------- 🌐 مكتبة الكتب المجانية القانونية ----------
   الكتالوجات الخارجية (Gutendex / Internet Archive) بتتوصل وقت التشغيل بس؛
   مفيش محتوى كتب مضمّن في التطبيق، والتنزيل بيعدّي على addBook الأصلية زي أي استيراد */
const GUTENDEX_BOOKS_URL = "https://gutendex.com/books";
const FREE_CATEGORY_TOPICS = {
  popular: "",
  literature: "Fiction",
  history: "History",
  philosophy: "Philosophy",
  science: "Science",
  children: "Children's literature"
};
const FREE_LANG_LABELS = { en:"English", fr:"Français", de:"Deutsch", es:"Español", it:"Italiano", pt:"Português", nl:"Nederlands", fi:"Suomi", sv:"Svenska", la:"Latin" };
const freeLibState = { source:"foreign", category:"popular", language:"", query:"", next:null, loaded:false, loading:false, pendingReset:false, books:new Map(), downloading:new Set() };
const arLibState = { query:"", page:1, total:0, shown:0, loaded:false, loading:false, pendingReset:false, books:new Map(), downloading:new Set() };

function openFreeLibrary(){
  switchTab("freelib");
  if(!freeLibState.loaded && !freeLibState.loading) loadFreeLibrary(true);
}
function switchFreeSource(source){
  freeLibState.source = source === "arabic" ? "arabic" : "foreign";
  const arabic = freeLibState.source === "arabic";
  $("#freeSourceForeign").classList.toggle("active", !arabic);
  $("#freeSourceArabic").classList.toggle("active", arabic);
  $("#foreignCatalogPanel").classList.toggle("hidden", arabic);
  $("#arabicCatalogPanel").classList.toggle("hidden", !arabic);
  $("#freeLibAttribution").textContent = arabic
    ? "الكتب العربية هنا من الملكية العامة عبر أرشيف الإنترنت، وكتب هنداوي من موقعها الرسمي — كلها مجانية قانونيًا. الكتب الحديثة المحمية بحقوق النشر مش موجودة هنا."
    : "الكتب من مشروع جوتنبرج (Project Gutenberg) — كتب دخلت الملكية العامة ومجانية قانونيًا. الكتب الحديثة المحمية بحقوق النشر مش موجودة هنا — دي بتتشرى أو بتتستعار من مصدرها.";
  if(arabic) renderCuratedShelf();
}
function freeLibAuthors(book){
  const names = (book.authors || []).map(a=>a && a.name).filter(Boolean);
  return names.length ? names.join("، ") : "مؤلف غير معروف";
}
function freeLibCover(book){
  const url = book.formats && book.formats["image/jpeg"];
  if(url){
    const cov = document.createElement("div"); cov.className = "book-cover freelib-cover";
    const img = document.createElement("img"); img.src = url; img.alt = ""; img.loading = "lazy";
    cov.appendChild(img); return cov;
  }
  return bookCoverEl({ title:book.title || "كتاب مجاني" });
}
function gutendexUrl(){
  const u = new URL(GUTENDEX_BOOKS_URL);
  const topic = FREE_CATEGORY_TOPICS[freeLibState.category] || "";
  if(topic) u.searchParams.set("topic", topic);
  if(freeLibState.language) u.searchParams.set("languages", freeLibState.language);
  if(freeLibState.query) u.searchParams.set("search", freeLibState.query);
  return u.toString();
}
function freeFallbackEl(pageUrl){
  const box = document.createElement("div"); box.className = "freelib-fallback hidden";
  const p = document.createElement("p"); p.className = "hint";
  p.textContent = "المصدر مانع التنزيل المباشر — افتح صفحة الكتاب ونزّل ملف النص وبعدين استورده من «إضافة كتاب»";
  const a = document.createElement("a"); a.className = "button-link ghost"; a.href = pageUrl; a.target = "_blank"; a.rel = "noopener"; a.textContent = "📄 صفحة الكتاب";
  box.append(p, a); return box;
}
function showFreeFallback(card){
  const fb = card && card.querySelector(".freelib-fallback"); if(fb) fb.classList.remove("hidden");
}
function freeTextUrl(book){
  const formats = book.formats || {};
  const candidates = Object.keys(formats).map(key=>({ key:key, url:String(formats[key] || "") })).filter(x=>
    x.key.toLowerCase().indexOf("text/plain") === 0 && x.url && !/\.zip(?:$|[?#])/i.test(x.url)
  );
  candidates.sort((a,b)=>{
    const score = x => (/charset=utf-8/i.test(x.key) ? 20 : 0) + (/\.txt(?:$|[?#])/i.test(x.url) ? 5 : 0);
    return score(b) - score(a);
  });
  return candidates.length ? candidates[0].url : "";
}
function renderFreeBook(book){
  freeLibState.books.set(String(book.id), book);
  const card = document.createElement("article"); card.className = "book-card freelib-card"; card.dataset.gutenbergId = String(book.id);
  card.appendChild(freeLibCover(book));
  const h = document.createElement("h3"); h.textContent = book.title || "كتاب من غير اسم"; card.appendChild(h);
  const author = document.createElement("div"); author.className = "hint"; author.textContent = "✍️ " + freeLibAuthors(book); card.appendChild(author);
  const meta = document.createElement("div"); meta.className = "freelib-meta";
  (book.languages || []).forEach(code=>{ const b = document.createElement("span"); b.className = "lang-badge"; b.textContent = FREE_LANG_LABELS[code] || code; meta.appendChild(b); });
  const dl = document.createElement("span"); dl.className = "download-count"; dl.textContent = "⬇ " + Number(book.download_count || 0).toLocaleString("en-US") + " تحميل"; meta.appendChild(dl);
  card.appendChild(meta);
  const status = document.createElement("p"); status.className = "msg freelib-card-status"; status.setAttribute("aria-live", "polite"); card.appendChild(status);
  const row = document.createElement("div"); row.className = "row wrap";
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "primary freelib-download"; btn.textContent = "⬇ نزّل وافتح في مكتبتي";
  btn.addEventListener("click", ()=>downloadFreeBook(book, card));
  const page = document.createElement("a"); page.className = "button-link ghost"; page.href = "https://www.gutenberg.org/ebooks/" + encodeURIComponent(book.id); page.target = "_blank"; page.rel = "noopener"; page.textContent = "📄 صفحة الكتاب";
  row.append(btn, page); card.appendChild(row);
  card.appendChild(freeFallbackEl(page.href));
  return card;
}
async function loadFreeLibrary(reset){
  /* تحميل شغال وطلب إعادة بحث وصل (فلتر/بحث اتغيروا في النص): بنعلّمه وبيتنفذ بأحدث حالة أول ما التحميل الحالي يخلص —
     من غير كده ضغطات الفلاتر السريعة كانت بتضيع والواجهة تفضل معلّقة على نتايج غير اللي اختارها المستخدم */
  if(freeLibState.loading){ if(reset) freeLibState.pendingReset = true; return; }
  const list = $("#freeLibResults"), status = $("#freeLibStatus"), more = $("#freeLibMore"); if(!list || !status || !more) return;
  let url;
  if(reset){ freeLibState.next = null; list.innerHTML = ""; freeLibState.books.clear(); url = gutendexUrl(); }
  else { if(!freeLibState.next) return; url = freeLibState.next; }
  freeLibState.loading = true; more.disabled = true;
  status.textContent = reset ? "بيحمّل كتب مجانية…" : "بيحمّل كتب أكتر…"; status.classList.remove("err");
  try{
    const r = await fetch(url);
    if(!r.ok) throw new Error("Gutendex HTTP " + r.status);
    const data = await r.json();
    const results = Array.isArray(data.results) ? data.results : [];
    results.forEach(book=>list.appendChild(renderFreeBook(book)));
    freeLibState.next = data.next || null;
    freeLibState.loaded = true;
    more.classList.toggle("hidden", !freeLibState.next);
    status.textContent = results.length ? "لقينا " + Number(data.count || results.length).toLocaleString("en-US") + " كتاب — اختار كتاب ودوس «نزّل وافتح في مكتبتي»." : "مفيش نتائج مطابقة — جرّب كلمة بحث أو تصنيف تاني.";
    status.classList.toggle("err", !results.length);
  }catch(e){
    status.textContent = "مقدرناش نوصل لكتالوج الكتب المجانية — اتأكد من الإنترنت وحاول تاني.";
    status.classList.add("err");
    more.classList.toggle("hidden", !freeLibState.next);
  } finally {
    freeLibState.loading = false; more.disabled = false;
    if(freeLibState.pendingReset){ freeLibState.pendingReset = false; loadFreeLibrary(true); }
  }
}
function isAddBookCancelled(e){ return !!(e && /الإضافة اتلغت/.test(e.message || "")); }
async function finishCatalogImport(book, cardStatus){
  renderLibrary();
  appToast("نزّل واتضاف «" + book.title + "» لمكتبتك ✔");
  if(cardStatus) cardStatus.textContent = "اتضاف لمكتبتك ✔ بيفتح دلوقتي…";
  switchTab("library");
  await openBook(book.id);
}
async function downloadFreeBook(book, card){
  const key = "gutenberg:" + book.id;
  if(freeLibState.downloading.has(key)) return;
  const btn = card && card.querySelector(".freelib-download");
  const status = card && card.querySelector(".freelib-card-status");
  const originalLabel = btn ? btn.textContent : "";
  freeLibState.downloading.add(key);
  if(btn){ btn.disabled = true; btn.textContent = "⏳ بيحمّل الكتاب…"; }
  if(status){ status.textContent = "بيحمّل النص الكامل من مشروع جوتنبرج…"; status.classList.remove("err"); }
  let text = "";
  try{
    const url = freeTextUrl(book);
    if(!url) throw new Error("no plain text");
    const r = await fetch(url);
    if(!r.ok) throw new Error("text HTTP " + r.status);
    text = await r.text();
    if(/^\s*<!doctype html/i.test(text)) throw new Error("source returned html");
  }catch(e){
    if(status){ status.textContent = "التنزيل المباشر فشل."; status.classList.add("err"); }
    showFreeFallback(card);
    freeLibState.downloading.delete(key);
    if(btn){ btn.disabled = false; btn.textContent = originalLabel; }
    return;
  }
  try{
    const added = await addBook(book.title || "كتاب مجاني", text, "gutenberg");
    await finishCatalogImport(added, status);
  }catch(e){
    if(status){ status.textContent = isAddBookCancelled(e) ? "تمام — الإضافة اتلغت." : (e.message || "الإضافة فشلت."); status.classList.toggle("err", !isAddBookCancelled(e)); }
    if(btn){ btn.disabled = false; btn.textContent = originalLabel; }
  } finally { freeLibState.downloading.delete(key); }
}

/* ---------- 📚 كتب عربية من الملكية العامة عبر Internet Archive ---------- */
/* الرفوف المختارة: كلاسيكيات عربية اتحقّق منها يدويًا على أرشيف الإنترنت — لكل واحدة
   ملف نص كامل سليم (_djvu.txt) ونص عربي حقيقي. دي واجهة الجانب العربي الافتراضية،
   وبتترسم من الثابت ده على طول من غير أي طلب شبكة؛ بحث الأرشيف الحر تحتها زي ما هو. */
const AR_CURATED_SHELF = [
  { identifier:"123boukrika44_maktoob_20140109_2134", title:"ألف ليلة وليلة", author:"تراث عربي" },
  { identifier:"Heliopolis1957_gmail_20180528_0108", title:"كليلة ودمنة", author:"عبد الله بن المقفع" },
  { identifier:"diwan_20170911_2151", title:"مقدمة ابن خلدون", author:"عبد الرحمن بن خلدون" },
  { identifier:"a1249n", title:"البخلاء", author:"الجاحظ" },
  { identifier:"Tawq-Al-Hamama", title:"طوق الحمامة", author:"ابن حزم الأندلسي" },
  { identifier:"ar119phil13", title:"حي بن يقظان", author:"ابن طفيل" },
  { identifier:"33102-foulabook.com", title:"رسالة الغفران", author:"أبو العلاء المعري" },
  { identifier:"AlmunghithMinDalal", title:"المنقذ من الضلال", author:"أبو حامد الغزالي" },
  { identifier:"dewanmotnbi", title:"ديوان المتنبي", author:"أبو الطيب المتنبي" }
];
let arShelfRendered = false;
function renderCuratedShelf(){
  if(arShelfRendered) return;
  const list = $("#arShelfResults"); if(!list) return;
  AR_CURATED_SHELF.forEach(item=>{
    const card = renderArabicBook({ identifier:item.identifier, title:item.title, creator:item.author });
    /* غلاف الأرشيف هو الأساس، ولو مقدرش يتحمّل بنرجع للغلاف المولّد زي باقي الكتب */
    const cov = card.querySelector(".freelib-cover"), img = cov && cov.querySelector("img");
    if(img) img.addEventListener("error", ()=>{
      const gen = bookCoverEl({ title:item.title }); gen.classList.add("freelib-cover");
      cov.replaceWith(gen);
    });
    list.appendChild(card);
  });
  arShelfRendered = true;
}
function iaQuery(){
  const base = "mediatype:texts AND (language:ara OR language:Arabic) AND NOT access-restricted-item:true";
  const q = String(arLibState.query || "").replace(/["\\:()\[\]{}^~*?!]+/g, " ").replace(/\s+/g, " ").trim();
  return q ? "(" + base + ") AND (title:(" + q + ") OR creator:(" + q + "))" : base;
}
function iaSearchUrl(page){
  const u = new URL("https://archive.org/advancedsearch.php");
  u.searchParams.set("q", iaQuery());
  ["identifier","title","creator","year","downloads"].forEach(f=>u.searchParams.append("fl[]", f));
  u.searchParams.append("sort[]", "downloads desc");
  u.searchParams.set("rows", "24");
  u.searchParams.set("page", String(page || 1));
  u.searchParams.set("output", "json");
  return u.toString();
}
function iaCreator(doc){
  const c = Array.isArray(doc.creator) ? doc.creator.filter(Boolean).join("، ") : String(doc.creator || "");
  return c || "مؤلف غير معروف";
}
function renderArabicBook(doc){
  arLibState.books.set(String(doc.identifier), doc);
  const card = document.createElement("article"); card.className = "book-card freelib-card"; card.dataset.archiveId = String(doc.identifier || "");
  const cov = document.createElement("div"); cov.className = "book-cover freelib-cover";
  const img = document.createElement("img"); img.src = "https://archive.org/services/img/" + encodeURIComponent(doc.identifier || ""); img.alt = ""; img.loading = "lazy"; cov.appendChild(img); card.appendChild(cov);
  const h = document.createElement("h3"); h.textContent = doc.title || "كتاب عربي من غير اسم"; card.appendChild(h);
  const author = document.createElement("div"); author.className = "hint"; author.textContent = "✍️ " + iaCreator(doc); card.appendChild(author);
  const meta = document.createElement("div"); meta.className = "freelib-meta";
  const lang = document.createElement("span"); lang.className = "lang-badge"; lang.textContent = "العربية"; meta.appendChild(lang);
  if(doc.year){ const y = document.createElement("span"); y.className = "download-count"; y.textContent = "📅 " + doc.year; meta.appendChild(y); }
  card.appendChild(meta);
  const status = document.createElement("p"); status.className = "msg freelib-card-status"; status.setAttribute("aria-live", "polite"); card.appendChild(status);
  const row = document.createElement("div"); row.className = "row wrap";
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "primary freelib-download"; btn.textContent = "⬇ نزّل وافتح في مكتبتي";
  btn.addEventListener("click", ()=>downloadArabicBook(doc, card));
  const pageUrl = "https://archive.org/details/" + encodeURIComponent(doc.identifier || "");
  const page = document.createElement("a"); page.className = "button-link ghost"; page.href = pageUrl; page.target = "_blank"; page.rel = "noopener"; page.textContent = "📄 صفحة الكتاب";
  row.append(btn, page); card.appendChild(row);
  card.appendChild(freeFallbackEl(pageUrl));
  return card;
}
async function loadArabicLibrary(reset){
  if(arLibState.loading){ if(reset) arLibState.pendingReset = true; return; }
  const list = $("#arLibResults"), status = $("#arLibStatus"), more = $("#arLibMore"); if(!list || !status || !more) return;
  if(reset){ arLibState.page = 1; arLibState.total = 0; arLibState.shown = 0; list.innerHTML = ""; arLibState.books.clear(); }
  else arLibState.page += 1;
  arLibState.loading = true; more.disabled = true;
  status.textContent = reset ? "بيحمّل نصوص عربية من الملكية العامة…" : "بيحمّل كتب عربية أكتر…"; status.classList.remove("err");
  try{
    const r = await fetch(iaSearchUrl(arLibState.page));
    if(!r.ok) throw new Error("Internet Archive HTTP " + r.status);
    const data = await r.json();
    const response = data.response || {};
    const docs = Array.isArray(response.docs) ? response.docs : [];
    arLibState.total = Number(response.numFound || docs.length);
    docs.forEach(doc=>{ if(doc.identifier) list.appendChild(renderArabicBook(doc)); });
    arLibState.shown = list.children.length;
    arLibState.loaded = true;
    more.classList.toggle("hidden", !(arLibState.shown < arLibState.total && docs.length));
    status.textContent = docs.length ? "لقينا " + arLibState.total.toLocaleString("en-US") + " نص عربي من الملكية العامة — التنزيل هيطلب تأكيد إضافة النص العربي زي أي كتاب عربي." : "مفيش نتائج عربية مطابقة — جرّب كلمة بحث تانية.";
    status.classList.toggle("err", !docs.length);
  }catch(e){
    if(!reset && arLibState.page > 1) arLibState.page -= 1;
    status.textContent = "مقدرناش نوصل لأرشيف الإنترنت — اتأكد من الاتصال وحاول تاني.";
    status.classList.add("err");
    more.classList.toggle("hidden", !(arLibState.shown < arLibState.total));
  } finally {
    arLibState.loading = false; more.disabled = false;
    if(arLibState.pendingReset){ arLibState.pendingReset = false; loadArabicLibrary(true); }
  }
}
function archiveTextFile(files){
  const list = (Array.isArray(files) ? files : []).map(f=>({ name:String((f && f.name) || ""), size:Number((f && f.size) || 0), format:String((f && f.format) || "") })).filter(f=>f.name);
  const bad = f => /(_meta\.txt|_files\.xml|_scandata\.xml|_reviews\.xml|_history\.xml|__ia_identity\.txt)$/i.test(f.name) || /(_meta|_files)$/i.test(f.name);
  const txt = list.filter(f=>/\.txt$/i.test(f.name) && !bad(f));
  txt.sort((a,b)=>{
    const score = f => (/_djvu\.txt$/i.test(f.name) || /djvutxt/i.test(f.format) ? 100 : 0) + (/_text\.txt$/i.test(f.name) ? 30 : 0) + Math.min(20, Math.floor(f.size / 100000));
    return score(b) - score(a);
  });
  return txt.length ? txt[0].name : "";
}
async function downloadArabicBook(doc, card){
  const key = "archive:" + doc.identifier;
  if(arLibState.downloading.has(key)) return;
  const btn = card && card.querySelector(".freelib-download");
  const status = card && card.querySelector(".freelib-card-status");
  const originalLabel = btn ? btn.textContent : "";
  arLibState.downloading.add(key);
  if(btn){ btn.disabled = true; btn.textContent = "⏳ بيحمّل الكتاب…"; }
  if(status){ status.textContent = "بيجيب ملف النص الكامل من أرشيف الإنترنت…"; status.classList.remove("err"); }
  let text = "";
  try{
    const id = encodeURIComponent(doc.identifier || "");
    const mr = await fetch("https://archive.org/metadata/" + id);
    if(!mr.ok) throw new Error("metadata HTTP " + mr.status);
    const meta = await mr.json();
    const file = archiveTextFile(meta.files || []);
    if(!file) throw new Error("no full text file");
    const r = await fetch("https://archive.org/download/" + id + "/" + encodeURIComponent(file));
    if(!r.ok) throw new Error("text HTTP " + r.status);
    text = await r.text();
    if(/^\s*<!doctype html/i.test(text)) throw new Error("source returned html");
  }catch(e){
    if(status){ status.textContent = "التنزيل المباشر فشل."; status.classList.add("err"); }
    showFreeFallback(card);
    arLibState.downloading.delete(key);
    if(btn){ btn.disabled = false; btn.textContent = originalLabel; }
    return;
  }
  try{
    const added = await addBook(doc.title || "كتاب عربي", text, "archive");
    await finishCatalogImport(added, status);
  }catch(e){
    if(status){ status.textContent = isAddBookCancelled(e) ? "تمام — الإضافة اتلغت." : (e.message || "الإضافة فشلت."); status.classList.toggle("err", !isAddBookCancelled(e)); }
    if(btn){ btn.disabled = false; btn.textContent = originalLabel; }
  } finally { arLibState.downloading.delete(key); }
}
