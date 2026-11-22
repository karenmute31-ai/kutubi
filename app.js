"use strict";
/* كُتُبِي — مترجم الكتب بالمصري. تطبيق ثابت بالكامل. البيانات والمفتاح على الجهاز بس. */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
/* تنظيف علامات الماركداون الخفيفة من نصوص الـ AI قبل عرضها كنص عادي (النجمتين ** للتغميق بتظهر حروف لو اتعرضت زي ما هي) */
function stripMd(s){return String(s==null?"":s).replace(/\*\*([^*]+)\*\*/g,"$1").replace(/__([^_]+)__/g,"$1").replace(/(^|[^*])\*([^*\n]+)\*/g,"$1$2").replace(/`([^`]+)`/g,"$1").replace(/^#{1,6}\s+/gm,"");}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}

/* ---------- الإعدادات (localStorage بس) ---------- */
const DEFSET = {key:"", base:"/api/ai", model:"gemini-3.5-flash-lite", tone:"calm", voiceURI:"", speed:1, dark:false, font:17, theme:"dark", fontFamily:"system", lineHeight:1.9, targetLang:"ar-EG", tStyle:"fusha", dailyGoalMin:15, ruler:false, userWpm:0, elKey:"", elVoiceId:"", elModel:"eleven_multilingual_v2", elStability:0.5, elSimilarity:0.75, elSpeed:1, ttsProvider:"device", azKey:"", azRegion:"", azVoice:"", gKey:"", gVoice:"", oKey:"", oVoice:"", oModel:"gpt-4o-mini-tts"};
let settings = Object.assign({}, DEFSET);
try{ Object.assign(settings, JSON.parse(localStorage.getItem("motarjem-settings")||"{}")); }catch(e){}
/* ترحيل: اللي كان عنده dark بس من غير theme — الثيم بيتبني منها */
if(!settings.theme) settings.theme = "dark";
if(!settings.fontFamily) settings.fontFamily = "system";
if(typeof settings.lineHeight !== "number" || isNaN(settings.lineHeight)) settings.lineHeight = 1.9;
if(typeof settings.dailyGoalMin !== "number" || isNaN(settings.dailyGoalMin) || settings.dailyGoalMin <= 0) settings.dailyGoalMin = 15;
if(typeof settings.ruler !== "boolean") settings.ruler = !!settings.ruler;
if(typeof settings.elStability !== "number" || isNaN(settings.elStability)) settings.elStability = 0.5;
if(typeof settings.elSimilarity !== "number" || isNaN(settings.elSimilarity)) settings.elSimilarity = 0.75;
if(typeof settings.elSpeed !== "number" || isNaN(settings.elSpeed)) settings.elSpeed = 1;
if(["device","eleven","azure","google","openai"].indexOf(settings.ttsProvider) < 0) settings.ttsProvider = "device";
/* نحافظ على اختيارات الأصوات القديمة كاختيارات يدوية، لحد ما المستخدم يطلب المطابقة التلقائية. */
if(settings.azVoiceManual==null && settings.azVoice) settings.azVoiceManual=true;
if(settings.gVoiceManual==null && settings.gVoice) settings.gVoiceManual=true;
/* أسلوب الترجمة للعربي: «فصحى» هي الأساس والافتراضي للكل، و«مصري» اختيار — أي قيمة غريبة مخزّنة بترجع لفصحى */
if(settings.tStyle !== "egyptian") settings.tStyle = "fusha";
function saveSettings(){ localStorage.setItem("motarjem-settings", JSON.stringify(settings)); }
/* ترحيل اسم الموديل الافتراضي القديم الغلط: «minimax/minimax-m3» مش موجود عند GMI أصلًا (أي طلب بيه بيرجع
   404 No matching target server) — الاسم الموثّق عندهم بالحروف بالظبط هو «MiniMaxAI/MiniMax-M3».
   بنصحّح القيمة المعروفة الغلط دي بس (بمقارنة من غير حساسية لحالة الحروف والمسافات) —
   أي اسم تاني كتبه المستخدم بنفسه عمدًا بيتساب زي ما هو ومبيتلمسش */
const KNOWN_BAD_MODEL = "minimax/minimax-m3", GOOD_DEFAULT_MODEL = "MiniMaxAI/MiniMax-M3";
if(String(settings.model || "").trim().toLowerCase() === KNOWN_BAD_MODEL){ settings.model = GOOD_DEFAULT_MODEL; saveSettings(); }

/* ---------- شكل القراءة (ثيم / خط / تباعد أسطر) ---------- */
const FONT_STACKS = {system:'"Segoe UI",Tahoma,Arial,sans-serif', amiri:'"Amiri","Traditional Arabic","Segoe UI",serif', tajawal:'"Tajawal","Segoe UI",Tahoma,Arial,sans-serif', naskh:'"Noto Naskh Arabic","Traditional Arabic","Segoe UI",serif', scheherazade:'"Scheherazade New","Traditional Arabic","Segoe UI",serif', cairo:'"Cairo","Segoe UI",Tahoma,Arial,sans-serif'};
/* 🌙 الوضع الليلي الذكي: لما يتفعّل، الثيم بيتبع وقت اليوم (ليلي من ٧ مساءً لـ ٦ الصبح) — وأي اختيار يدوي للثيم بيلغيه */
function isNightNow(){ const h = new Date().getHours(); return h >= 19 || h < 6; }
function autoNightTheme(){ return isNightNow() ? (settings.nightTheme || "dark") : "light"; }
function effectiveTheme(){ return settings.autoNight ? autoNightTheme() : (settings.theme || "light"); }
function checkAutoNight(){ if(settings.autoNight){ applyAppearance(); syncAppearanceControls(); } }
function applyAppearance(){
  const t = effectiveTheme();
  document.documentElement.dataset.theme = t;
  /* لون شريط المتصفح/النظام بيتبع ثيم القراءة: بني العلامة للفاتح، ورمادي غامق للّيلي */
  const mtc = document.querySelector('meta[name="theme-color"]'); if(mtc) mtc.setAttribute("content", t === "dark" ? "#131110" : (t === "black" ? "#000000" : (t === "royal" ? "#14100c" : (t === "modern" ? "#f4f6fb" : "#7c3f12"))));
  document.documentElement.style.setProperty("--fs", (settings.font||17)+"px");
  document.documentElement.style.setProperty("--lh", settings.lineHeight || 1.9);
  document.documentElement.style.setProperty("--reader-font", FONT_STACKS[settings.fontFamily] || FONT_STACKS.system);
  settings.dark = (t === "dark" || t === "black" || t === "royal"); /* مراية للتوافق مع أي كود قديم بيبص على dark */
  const dt = $("#darkToggle"); if(dt) dt.textContent = (t === "dark" || t === "black" || t === "royal") ? "☀️" : "🌙";
}
function syncAppearanceControls(){
  $$(".theme-swatch").forEach(b=>b.classList.toggle("active", b.dataset.themeVal === (settings.autoNight ? "auto" : (settings.theme || "light"))));
  const fs = $("#readerFontSel"); if(fs) fs.value = settings.fontFamily || "system";
  const lh = $("#lineHeightRange"); if(lh) lh.value = settings.lineHeight || 1.9;
  const lv = $("#lineHeightVal"); if(lv) lv.textContent = (settings.lineHeight || 1.9).toFixed(1);
}
/* المسار المدمج المجاني: بروكسي /api/ai على نفس الاستضافة — المفتاح على السيرفر، مش محتاج مفتاح من المستخدم */
function isBuiltinAI(){ const b=(settings.base||"").trim().replace(/\/+$/,""); return b==="/api/ai" || b===location.origin+"/api/ai"; }
function hasKey(){ return !!(settings.key && settings.key.trim()) || isBuiltinAI(); }

const TONES = {
  /* النبرة الافتراضية: سرعة 1x حقيقية — القيم الأقل من 1 محجوزة للأساليب اللي طبيعتها أبطأ عمدًا */
  calm:{label:"هادية للتركيز", rate:1.0, pitch:1.0, style:"بأسلوب هادي وجُمل قصيرة وواضحة للتركيز"},
  enthusiastic:{label:"حماسية شيّقة", rate:1.08, pitch:1.15, style:"بأسلوب حماسي شيّق يشدّ الانتباه"},
  serious:{label:"جادّة رسمية", rate:0.98, pitch:0.9, style:"بأسلوب جاد ورسمي ومباشر"},
  teacher:{label:"شرح معلّم صبور", rate:0.95, pitch:1.05, style:"بأسلوب معلّم صبور بيشرح خطوة خطوة ويربط الأفكار"},
  story:{label:"قصصية", rate:1.02, pitch:1.1, style:"بأسلوب قصصي كأنك بتحكي حدوتة مترابطة"},
  /* أساليب أداء عامة (أنماط مهنية) — بتتنفذ بأصوات الجهاز نفسها */
  commentator:{label:"معلّق رياضي حماسي", rate:1.15, pitch:1.1, style:"بأسلوب معلّق رياضي حماسي وسريع كأنه بيعلّق على لحظة مهمة، جمل قصيرة قوية"},
  literary:{label:"راوٍ أدبي", rate:0.85, pitch:0.85, style:"بلغة راقية وجمل موزونة ووقفات، أسلوب روائي أدبي من غير تغيير المحتوى"},
  poet:{label:"إلقاء شعري", rate:0.8, pitch:0.95, style:"بإيقاع واضح ووقفات عند نهاية الجمل، تقديم موقّع كأنه إلقاء شعري"},
  news:{label:"مذيع نشرة أخبار", rate:1.0, pitch:0.9, style:"بأسلوب مذيع نشرة أخبار: رسمي وواضح ومباشر، جمل خبرية مرتبة"},
  documentary:{label:"راوي وثائقي", rate:0.88, pitch:0.8, style:"بأسلوب راوي وثائقي: هادي وعميق وفضولي، كأنه بيحكي فيلم وثائقي"},
  podcaster:{label:"بودكاستر مصري", rate:1.05, pitch:1.05, style:"بكلام مصري خفيف وودود كأنه بودكاست حواري"},
  professor:{label:"دكتور جامعي",rate:1,pitch:0.98,style:"اشرح كدكتور جامعي صبور واسع الفهم في مجال النص: ابدأ بالأساس، عرّف المصطلحات، رتّب الفكرة منطقيًا، ثم وضح الروابط والحدود بدقة وبساطة. لا تدّع مؤهلات حقيقية ولا تضف معرفة من خارج المقطع"},
  engineer:{label:"مهندس خبير عملي",rate:1,pitch:0.96,style:"اشرح كمهندس خبير عملي في موضوع المقطع: ما المشكلة؟ ما الأجزاء المذكورة؟ كيف تعمل وفق المصدر؟ افصل الخطوات وبسّط كل صعوبة، ثم اختم بتلخيص عملي دون اختراع تطبيقات أو معلومات"},
  mentor:{label:"أستاذ فطين متعمق",rate:1,pitch:1.02,style:"اشرح كأستاذ فطين صبور: توقع مواضع اللبس، اطرح سؤالًا بسيطًا ثم أجب عنه من النص، فرّق بين المصطلحات المتشابهة، وقرّب المعنى بلغة سهلة وعميقة، بلا ادعاء خبرة حقيقية أو معلومات خارجية"},
  founder:{label:"رائد أعمال حماسي", rate:1, pitch:1.06, style:"بأسلوب رائد أعمال حماسي وعملي: افتح بسؤال جذاب من النص، بسّط الفكرة ثم اربط السبب بالنتيجة، واختم بخلاصة قصيرة. استخدم اللهجة المطلوبة، ولا تضف نصائح أو أرقام أو قصصًا خارج النص"},
  playful:{label:"مذيع بودكاست مرح", rate:1, pitch:1.08, style:"بأسلوب مذيع بودكاست مرح وودود: جمل قصيرة، أسئلة تشد الانتباه، وتوقفات طبيعية بين الأفكار. استخدم اللهجة المطلوبة، بدون اختراع وقائع أو تقليد شخص بعينه"},
  simplifier:{label:"خبير بيبسّط", rate:1, pitch:1.02, style:"بأسلوب خبير ودود بيبسّط: عرّف كل مصطلح صعب أول ظهوره، اشرح خطوة بخطوة، ثم لخّص أهم فكرة. التزم باللهجة المطلوبة والمعلومات الواردة في النص فقط"},
  creator:{label:"صانع محتوى", rate:1.1, pitch:1.1, style:"بأسلوب فيديوهات السوشيال: بداية تجذب الانتباه، جمل قصيرة سريعة وحماسية، كلام مصري شبابي من غير إسفاف"},
  /* «الهندسة العكسية — أسلوب المهندس بهنسي»: منقول حرفيًا من تطبيق الراوي بنفس الاسم والبرومبت والسلوك.
     fullInstr معناها إن style هنا برومبت شرح كامل بيستبدل صياغة الشرح العادية في makeExplanation (مش مجرد وصف نبرة بيتحقق في جملة) */
  reverse:{label:"الهندسة العكسية — أسلوب المهندس بهنسي ⭐", rate:0.95, pitch:0.95, temp:0.5, fullInstr:true,
    desc:"⭐ الأساسي القوي — مستوحى من أسلوب المهندس أحمد بهنسي (مدرّس برمجة وذكاء اصطناعي — «سلسلة الهندسة العكسية»): بنفكّك مفهوم الجزء من النتيجة النهائية لأصغر وحدة طبقة طبقة، وكل طبقة مربوطة سببيًا بالمشكلة اللي حلّتها، مع توقّعات سقراطية وشجرة تفكيك مرئية، وبنختم بقانون الدرس وأرقامه الحقيقية من النص وسؤال «لو عكسناها؟» واختبار ذاتي — تفكير نقدي بدل الحفظ.",
    style:"اشرح بالمصرية بأسلوب «الهندسة العكسية» — تفكيك عكسي من الكل لأصغر وحدة، وبالترتيب الإلزامي ده حرفيًا:\n(١) «الصورة الكاملة»: ابدأ من النتيجة النهائية/المفهوم الكلي اللي الجزء بيوصّله — إيه اللي بيحصل في الآخر كله على بعضه — في فقرة قصيرة واضحة.\n(٢) «التفكيك طبقة طبقة»: فكّك المفهوم طبقة فوق طبقة لحد أصغر وحدة شغالة، وكل طبقة بعنوان واضح. وقبل ما تكشف كل طبقة جديدة حط نقطة توقّع سقراطية قصيرة بسطر مستقل يبدأ بـ«توقّع: » وسؤال يدعو القارئ يخمّن أصغر حتة جوه اللي قبله (زي: «توقّع: إيه أصغر حتة شغالة جوه دي؟»)، وبعدين اكشف الطبقة وفسّرها.\n(٣) «ليه الطبقة دي موجودة؟»: مع كل طبقة اربطها سببيًا بالمشكلة اللي جت تحلّها من الطبقة اللي قبلها — مفيش طبقة بتتشرح من غير سبب وجودها.\n(٤) «شجرة التفكيك»: في نص الشرح حط شجرة تفكيك نصية منظمة للمفهوم الرئيسي (عناوين متدرجة بمسافات/فروع زي ├── و└──) تلخّص الكل وطبقاته في نظرة واحدة.\n(٥) «القانون: » اختم جسم الشرح بسطر مستقل يبدأ بـ«القانون: » فيه قاعدة الدرس الحاكمة في سطر واحد، ومعاه الأرقام الحقيقية الواردة في نص الجزء نفسه فقط — ممنوع منعًا باتًا اختراع أو استنتاج أي رقم مش مكتوب في النص، ولو النص مفيهوش أرقام اكتب القاعدة من غير أرقام وقول صراحة «النص مفيهوش أرقام».\n(٦) «لو عكسناها؟»: سؤال واحد أخير بهذا العنوان — ماذا لو انعكس السبب والنتيجة في المفهوم ده؟ — وإجابة قصيرة من منطق النص نفسه.\n(٧) «اختبر نفسك»: ٣ أسئلة سريعة مرقمة من محتوى الجزء (من غير إجاباتها)، وبعدها سطر دعوة: «ودلوقتي اشرحها بكلامك انت من غير ما تبص — لو عرفت تفكّكها بصوتك يبقى فهمتها فعلًا».\nقواعد صارمة: الشرح بالمصرية الطبيعية، والمصطلحات التقنية بالإنجليزية عند أول ورود جنب مقابلها العربي، وكل الحقائق والأرقام والمفاهيم من نص الجزء فقط — التفكير النقدي في الربط والتساؤل، مش في إضافة معلومة من برّه النص."},
  hakawati:{label:"حكواتي — شرح سريع بالتشبيهات ⚡", rate:1.06, pitch:1.03, temp:0.6, fullInstr:true,
    desc:"⚡ شرح سريع بروح الحكواتي: فكرة واحدة واضحة في كل جزء، سرد سريع يشدّك، تشبيه من الحياة اليومية لكل مفهوم صعب، وسخرية خفيفة محترمة — والحقائق كلها من نص الكتاب، التشبيه والهزار للتوضيح بس. أسلوب عام، مش تقليد لأي شخص حقيقي.",
    style:"اشرح بالمصرية بأسلوب «الحكواتي السريع» — سرد معرفي سريع خفيف الدم، وبالترتيب الإلزامي ده حرفيًا:\n(١) «فكرة واحدة في كل جزء»: قسّم الشرح لحتت صغيرة، كل حتة ليها عنوان قصير وفكرة واحدة واضحة — ممنوع خلط فكرتين في حتة واحدة.\n(٢) «سرد سريع»: جمل قصيرة وإيقاع متدفق يشدّ الانتباه، ادخل في صلب الموضوع من أول سطر من غير مقدمات.\n(٣) «التشبيه اليومي»: كل مفهوم صعب يتقرّب بتشبيه واحد من الحياة اليومية — التشبيه للتوضيح فقط، مش حقيقة من الكتاب.\n(٤) «سخرية خفيفة»: تعليق ساخر بسيط ومحترم على غرابة فكرة أو مفارقة واردة في النص — السخرية من غرابة المعلومة مش من القارئ، ومن غير استهزاء بالمحتوى أو إسفاف.\n(٥) «سؤال تشويقي»: بين كل فكرة واللي بعدها سؤال قصير يشدّ للي جاي، وإجابته تيجي من النص نفسه في الجزء اللي بعده.\n(٦) «الخلاصة في سطر»: اختم جسم الشرح بسطر مستقل يبدأ بـ«الخلاصة في سطر: » فيه أهم معلومة في الجزء.\nقواعد صارمة: الشرح بالمصرية الطبيعية، وكل الحقائق والأرقام والمفاهيم من نص الجزء فقط — السخرية والتشبيه أدوات توضيح مش إضافة معلومة، وممنوع تقليد أو ادعاء صوت أو أسلوب أي شخص حقيقي بعينه."}
};

/* وصف نبرة/أسلوب الشرح المختار — بيظهر تحت قايمة النبرة لما يكون للأسلوب وصف (زي الهندسة العكسية) */
function syncSpeedLabel(){ const e=$("#speedValue"); if(e) e.textContent=(settings.speed||1).toFixed(1)+"x"; }
function syncToneDesc(){
  const d=$("#toneDesc"); if(!d) return;
  const t=TONES[settings.tone]||TONES.calm;
  if(t.desc || ["professor","engineer","mentor","founder","playful","simplifier"].includes(settings.tone)){ d.textContent=t.desc||"شخصية شرح عامة: تفكيك المعلومة لحِتت صغيرة، وتعريف كل مصطلح، وسؤال بسيط بعد كل فكرة، وتشبيه يومي للتوضيح فقط، بدون اختراع حقائق."; d.classList.remove("hidden"); }
  else { d.textContent=""; d.classList.add("hidden"); }
}

/* ---------- مطابقة صوت مقترحة حسب أسلوب الأداء (بتتطبق لحظة تغيير الأسلوب بس) ---------- */
function voiceGenderHint(v){
  if(!v) return "";
  const direct=String(v.gender||"").toLowerCase();
  if(direct==="male" || direct==="female") return direct;
  const id=v.id||v.name||"";
  if(/ar-EG-SalmaNeural|ar-SA-ZariyahNeural|ar-XA-(?:Standard|Wavenet)-[AD]\b/.test(id)) return "female";
  if(/ar-EG-ShakirNeural|ar-SA-HamedNeural|ar-XA-(?:Standard|Wavenet)-[BC]\b/.test(id)) return "male";
  return "";
}
function filterVoicePool(vs){
  const pref=settings.voiceGender||"all";
  return pref==="all" ? vs : vs.filter(v=>voiceGenderHint(v)===pref);
}

function autoMatchVoiceForTone(toneKey){
  if(!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices();
  const ar = vs.filter(v=>v.lang && v.lang.toLowerCase().startsWith("ar"));
  if(!ar.length) return; /* مفيش صوت عربي: سيب الاختيار زي ما هو */
  let target = null;
  if(toneKey==="commentator" || toneKey==="podcaster" || toneKey==="creator"){
    const fav = settings.voiceURI ? ar.find(v=>v.voiceURI===settings.voiceURI) : null;
    target = fav || ar[0];
  } else if(toneKey==="literary" || toneKey==="documentary" || toneKey==="news" || toneKey==="poet"){
    target = ar.find(v=>voiceGenderHint(v)==="male") || ar.find(v=>voiceGenderHint(v)!=="female") || ar[0];
  }
  if(target && target.voiceURI !== settings.voiceURI){
    settings.voiceURI = target.voiceURI; saveSettings();
    setAudioStatus("اتظبط الصوت المقترح للأسلوب: " + target.name + " — وتقدر تغيّره من قايمة الأصوات.");
  }
  renderVoices();
}

/* ---------- IndexedDB للكتب ---------- */
let dbPromise = null;
/* حارس نسخة المخطط الوحيد: أي تغيير مستقبلي في شكل البيانات بيعدي من migrateSchema بس */
const IDB_VERSION = 2;
function migrateSchema(db, oldVersion, newVersion){ /* حاليًا المخطط ثابت من النسخة ٢ — مفيش ترحيلات، والخطّاف جاهز لأي تغيير جاي */
}
function idb(){
  if(dbPromise) return dbPromise;
  const p = new Promise((res, rej)=>{
    const rq = indexedDB.open("motarjem-db", IDB_VERSION);
    rq.onupgradeneeded = (e)=>{
      migrateSchema(rq.result, (e && e.oldVersion) || 0, IDB_VERSION);
      const db = rq.result;
      if(!db.objectStoreNames.contains("books")) db.createObjectStore("books",{keyPath:"id"});
      if(!db.objectStoreNames.contains("audioCache")) db.createObjectStore("audioCache"); /* كاش صوت ElevenLabs — مفاتيحه نصية برّه السجل */
    };
    rq.onsuccess = ()=>{
      const db = rq.result;
      /* اتصال اتقفل من برّه (ترقية نسخة القاعدة في تبويب تاني أو أثناء تحديث التطبيق):
         بنقفله وبننسى الوعد المتخزّن، فأول عملية جاية تفتح اتصال جديد بدل ما كل عملية
         تفضل تفشل بـ«The database connection is closing» لحد ما المستخدم يعيد تحميل الصفحة */
      db.onversionchange = ()=>{ try{ db.close(); }catch(e){} if(dbPromise === p) dbPromise = null; };
      db.onclose = ()=>{ if(dbPromise === p) dbPromise = null; };
      res(db);
    };
    rq.onerror = ()=>rej(rq.error);
    rq.onblocked = ()=>{ console.warn("IndexedDB: الفتح متعطّل — تبويب تاني ماسك اتصال بنسخة أقدم"); };
  });
  dbPromise = p;
  /* فتح فاشل مبيتخزّنش: المحاولة الجاية تعيد الفتح من الصفر بدل ما تفضل ترفض بنفس الخطأ */
  p.catch(()=>{ if(dbPromise === p) dbPromise = null; });
  return p;
}
/* هل الخطأ ده معناه إن اتصال القاعدة مقفول/بيقفل؟ (InvalidStateError أو رسالة closing/closed) */
function isIdbClosedError(e){
  if(!e) return false;
  if(e.name === "InvalidStateError") return true;
  return /closing|closed/i.test(String(e.message || ""));
}
/* تشغيل عملية تخزين مع إعادة محاولة واحدة شفافة لو الاتصال كان مقفول: بننسى الاتصال
   المتخزّن ونفتح من جديد ونعيد نفس العملية مرة واحدة بس قبل ما الخطأ يطلع لفوق */
async function idbOp(fn){
  try{ return await fn(await idb()); }
  catch(e){
    if(!isIdbClosedError(e)) throw e;
    dbPromise = null;
    return await fn(await idb());
  }
}
function idbReq(db, store, mode, make){
  return new Promise((res, rej)=>{
    let rq;
    try{ rq = make(db.transaction(store, mode).objectStore(store)); }
    catch(e){ rej(e); return; }
    rq.onsuccess = ()=>res(rq.result);
    rq.onerror = ()=>rej(rq.error);
  });
}
/* [T3.4a] original PDF lives in its own tiny DB (kutubi-pdf, key = book id) so the books store stays light */
const PDF_MAX_BYTES = 60 * 1024 * 1024;
let pdfDbPromise = null;
function pdfDb(){
  if(pdfDbPromise) return pdfDbPromise;
  const p = new Promise((res, rej)=>{
    const rq = indexedDB.open("kutubi-pdf", 1);
    rq.onupgradeneeded = ()=>{ rq.result.createObjectStore("pdfs"); };
    rq.onsuccess = ()=>{ const d = rq.result; d.onclose = ()=>{ pdfDbPromise = null; }; d.onversionchange = ()=>{ d.close(); pdfDbPromise = null; }; res(d); };
    rq.onerror = ()=>rej(rq.error);
    rq.onblocked = ()=>rej(new Error("pdf db blocked"));
  });
  pdfDbPromise = p;
  p.catch(()=>{ if(pdfDbPromise === p) pdfDbPromise = null; });
  return p;
}
function pdfReq(mode, make){
  return pdfDb().then(db=>new Promise((res, rej)=>{
    let tx, rq;
    try{ tx = db.transaction("pdfs", mode); rq = make(tx.objectStore("pdfs")); }catch(e){ rej(e); return; }
    tx.oncomplete = ()=>res(rq.result);
    tx.onerror = ()=>rej(tx.error);
    tx.onabort = ()=>rej(tx.error || new Error("pdf tx aborted"));
  }));
}
async function idbPdfPut(id, blob){ return pdfReq("readwrite", s=>s.put(blob, String(id))); }
async function idbPdfGet(id){ try{ return (await pdfReq("readonly", s=>s.get(String(id)))) || null; }catch(e){ return null; } }
async function idbPdfDel(id){ try{ await pdfReq("readwrite", s=>s.delete(String(id))); }catch(e){} }
async function idbPdfClear(){ try{ await pdfReq("readwrite", s=>s.clear()); }catch(e){} }
async function savePdfOriginal(id, blob){
  if(blob.size > PDF_MAX_BYTES) return " — الـ PDF كبير (" + Math.round(blob.size/1024/1024) + " ميجا) فالأصل ما اتحفظش، هتقرا النص بس";
  try{
    if(navigator.storage && navigator.storage.estimate){
      const est = await navigator.storage.estimate();
      if(est && est.quota && (est.quota - (est.usage || 0)) < blob.size * 3) return " — مساحة التخزين على الجهاز قليلة فالأصل ما اتحفظش، هتقرا النص بس";
    }
  }catch(e){}
  try{ await idbPdfPut(id, blob); return ""; }
  catch(e){ return " — معرفتش أحفظ الـ PDF الأصلي (التخزين ممتلي؟) والنص اتحفظ عادي"; }
}
async function idbAll(){ return idbOp(db=>idbReq(db, "books", "readonly", s=>s.getAll()).then(r=>r || [])); }
async function idbPut(book){ return idbOp(db=>idbReq(db, "books", "readwrite", s=>s.put(book))); }
async function idbDel(id){ return idbOp(db=>idbReq(db, "books", "readwrite", s=>s.delete(id))); }
async function idbClear(){ return idbOp(db=>idbReq(db, "books", "readwrite", s=>s.clear())); }
/* ---------- كاش الصوت (IndexedDB store: audioCache) ---------- */
async function idbAudioGet(key){ return idbOp(db=>idbReq(db, "audioCache", "readonly", s=>s.get(key)).then(r=>r || null)); }
async function idbAudioPut(key, blob){ return idbOp(db=>idbReq(db, "audioCache", "readwrite", s=>s.put(blob, key))); }
async function idbClearAudio(){ return idbOp(db=>idbReq(db, "audioCache", "readwrite", s=>s.clear())); }
/* [F] مفاتيح كاش الصوت وحذف مفتاح واحد — بيستخدمهم الإصلاح الذاتي (تنضيف الأيتام + تفريغ ضغط التخزين) */
async function idbAudioKeys(){ return idbOp(db=>idbReq(db, "audioCache", "readonly", s=>s.getAllKeys()).then(r=>r || [])); }
async function idbAudioDel(key){ return idbOp(db=>idbReq(db, "audioCache", "readwrite", s=>s.delete(key))); }

/* ---------- الحالة ---------- */
let books = [];
let currentId = null;
let stopFlag = false, translating = false;
/* وحدة تحكم في تشغيل قابل للإيقاف الفوري: الإيقاف = علم + إجهاض (abort) الطلب الشبكي الجاري نفسه،
   فزرار الإيقاف بيوقف فورًا حتى لو الطلب الحالي معلّق، مش بيستنى لما يخلص */
function makeRunControl(){
  const ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const rc = {
    stopped:false,
    signal: ctl ? ctl.signal : undefined,
    stop(){ rc.stopped = true; if(ctl && !ctl.signal.aborted){ try{ ctl.abort(); }catch(e){} } }
  };
  return rc;
}
let transRun = null;  /* تحكم تشغيل الترجمة الجارية */
let repairRun = null; /* تحكم تشغيل الإصلاح الجاري */
/* حالة زرار إيقاف الترجمة البصرية من نقطة بدء/إنهاء الترجمة نفسها — مش معتمدة على إعادة رسم عناصر التحكم.
   الزرار مبيتعطّلش أبدًا (دوسه وهو فاضي بيشرح): وهو شغال بياخد شكل خطر (أحمر) عشان المستخدم يشوف إنه مفعّل */
function setStopBtn(on){ const b = $("#btnStopTrans"); if(!b) return; b.classList.toggle("danger", !!on); }
let favs = new Set(); try{ favs = new Set(JSON.parse(localStorage.getItem("motarjem-favs")||"[]")); }catch(e){}
let savedWords = []; try{ savedWords = JSON.parse(localStorage.getItem("motarjem-saved")||"[]"); }catch(e){}
function currentBook(){ return books.find(b=>b.id===currentId) || null; }
/* تأجيل شغل مش حرج لوقت خمول المتصفح (إحصائيات الرئيسية مثلًا) — ببديل مهلة لو requestIdleCallback مش متاح */
function deferIdle(fn){ if(typeof requestIdleCallback === "function"){ try{ requestIdleCallback(()=>fn(), {timeout:400}); return; }catch(e){} } setTimeout(fn, 60); }
/* حفظ تقدّم القراءة مؤجّل: التمرير بيحدّث الذاكرة بس، والكتابة الفعلية مرة واحدة كل ثانيتين بآخر قيمة —
   وبتتفرّغ فورًا عند إخفاء التبويب أو قفل الصفحة عشان مفيش تقدّم يضيع */
let progSaveTimer = null, progSaveBook = null;
function scheduleProgressSave(book){
  progSaveBook = book;
  if(progSaveTimer) return;
  progSaveTimer = setTimeout(flushProgressSave, 2000);
}
function discardProgressSave(){
  if(progSaveTimer){ clearTimeout(progSaveTimer); progSaveTimer = null; }
  progSaveBook = null;
}
function flushProgressSave(){
  if(progSaveTimer){ clearTimeout(progSaveTimer); progSaveTimer = null; }
  const b = progSaveBook; progSaveBook = null;
  if(b && books.includes(b)){ const p = idbPut(b); if(p && p.catch) p.catch(()=>{}); } /* وعد طليق: رفضه لازم يتبتلع هنا بدل ما يبقى rejection غير معالَج */
}
function saveFavs(){ localStorage.setItem("motarjem-favs", JSON.stringify(Array.from(favs))); }
function saveWordsStore(){ localStorage.setItem("motarjem-saved", JSON.stringify(savedWords)); }

/* ---------- سجل الأخطاء المحلي + وصف واضح لأي خطأ مزوّد ----------
   أي تشغيل يقف بخطأ لازم يبقى مفهوم من نفسه: سطر الحالة بيقول «سبب التوقف» الحقيقي
   (كود HTTP + رسالة المزوّد نفسها)، وآخر 5 أخطاء بتتسجل محليًا وتظهر في الإدارة والإعدادات.
   التنضيف: حروف تحكم بتتشال، المسافات بتتظبط، والمقتطف بيُقصّ — ومفتاح الـ API بيتنقّى دايمًا لو ظهر بأي شكل */
const ERRLOG_KEY = "mk_errlog";
/* تنقية أي نص خطأ من كل المفاتيح المعروفة (مفتاح الذكاء + مفاتيح الصوت) قبل ما يتعرض أو يتسجل —
   المفاتيح مش لازم تظهر أبدًا في سجل الأخطاء ولا في أي رسالة */
function stripKnownKeys(t){
  try{
    if(!settings) return t;
    [settings.key, settings.elKey, settings.azKey, settings.gKey].forEach(k=>{
      const v = k ? String(k).trim() : "";
      if(v) t = t.split(v).join("***");
    });
  }catch(e){}
  return t;
}
function sanitizeErrText(s){
  let t = String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  t = stripKnownKeys(t);
  return t.slice(0, 140);
}
function describeError(err){
  if(!err) return "خطأ غير معروف";
  let t = String((err && err.message) || err).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  t = stripKnownKeys(t);
  t = t.slice(0, 220); /* سقف العرض في سطر الحالة/السجل — مقتطف المزوّد نفسه متقّص أصلًا على 140 */
  return t || "خطأ غير معروف";
}
function loadErrLog(){
  try{ const a = JSON.parse(localStorage.getItem(ERRLOG_KEY) || "[]"); return Array.isArray(a) ? a : []; }catch(e){ return []; }
}
function logError(feature, err){
  try{
    const a = loadErrLog();
    a.unshift({time: Date.now(), feature: String(feature || ""), message: describeError(err)});
    while(a.length > 5) a.pop();
    localStorage.setItem(ERRLOG_KEY, JSON.stringify(a));
  }catch(e){}
  renderErrLogUI();
}
function clearErrLog(){ try{ localStorage.removeItem(ERRLOG_KEY); }catch(e){} renderErrLogUI(); }
function renderErrLogUI(){
  const log = loadErrLog();
  const line = $("#lastErrLine");
  if(line){
    if(log.length){ line.textContent = "آخر خطأ: " + log[0].message; line.classList.remove("hidden"); }
    else { line.textContent = ""; line.classList.add("hidden"); }
  }
  const box = $("#adminErrLog");
  if(box){
    box.innerHTML = "";
    if(!log.length){ box.innerHTML = '<p class="hint">مفيش أخطاء متسجلة.</p>'; }
    else log.forEach(en=>{
      const p = document.createElement("p"); p.className = "hint";
      let when = "";
      try{ when = new Date(en.time).toLocaleString("ar-EG"); }catch(e){}
      p.textContent = "🕐 " + when + " · " + en.feature + ": " + en.message;
      box.appendChild(p);
    });
    /* [E] أخطاء OCR المرحلية بيتسجل معاها تشخيص التشغيل — زر لنسخه من سجل الإدارة كمان */
    if(log.some(en=>en.feature === "OCR") && typeof copyOcrDiagnostics === "function"){
      const b = document.createElement("button");
      b.type = "button"; b.className = "ghost"; b.textContent = "📋 نسخ تشخيص OCR";
      b.addEventListener("click", async ()=>{ const ok = await copyOcrDiagnostics(); b.textContent = ok ? "✔ اتنسخ التشخيص" : "⚠️ النسخ فشل"; });
      box.appendChild(b);
    }
  }
}
/* مقتطف رسالة الخطأ من جسم ردّ المزوّد (OpenAI-compatible وغيره) — منقّى ومقصوص، من غير مفاتيح ولا هيدرز */
async function providerErrSnippet(resp){
  try{
    const t = await resp.text();
    if(!t) return "";
    let j = null; try{ j = JSON.parse(t); }catch(e){}
    let m = "";
    if(j){
      if(j.error && typeof j.error === "object" && j.error.message) m = String(j.error.message);
      else if(typeof j.error === "string") m = j.error;
      else if(j.message) m = String(j.message);
      else if(typeof j.detail === "string") m = j.detail;
      else if(j.responseDetails) m = String(j.responseDetails);
    }
    return sanitizeErrText(m || t);
  }catch(e){ return ""; }
}

/* ---------- الاشتراك الشهري (تفعيل يدوي بكود عن طريق واتساب) ---------- */
const SUB_SECRET = "M0tarjem!Sub#2026$xK9pQ2wZ7vN4rT8yU3iO6pA1sD5fG0hJkLzXcVbNmQeWrTy";
const SUB_MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
/* بيانات الدفع اليدوي — فاضية دلوقتي، المالك يملها هنا بسطر واحد لما تجهز */
const PAYMENT_INFO = { walletType:"", walletNumber:"", instapay:"", bankName:"", bankAccount:"", iban:"" };
function payValueRow(label, value){
  return '<p class="hint">' + esc(label) + '</p><div class="row wrap"><code class="install-id" dir="ltr">' + esc(value) + '</code><button type="button" class="ghost pay-copy" data-copy="' + esc(value) + '">نسخ</button></div>';
}
function payPaneHTML(kind){
  const P = PAYMENT_INFO;
  const instr = '<p class="hint">حوّل ٤٩ جنيه وبعدين ابعت صورة التحويل وكود التثبيت بتاعك على واتساب، وهنبعتلك كود التفعيل على طول.</p>';
  const empty = '<p class="hint">تفاصيل الدفع دي بتتجهز — للاشتراك دلوقتي دوس زرار الواتساب اللي فوق.</p>';
  if(kind === "wallet"){
    if(P.walletNumber) return (P.walletType ? '<p class="hint">المحفظة: ' + esc(P.walletType) + '</p>' : '') + payValueRow("رقم المحفظة", P.walletNumber) + instr;
    return empty;
  }
  if(kind === "instapay"){
    if(P.instapay) return payValueRow("عنوان إنستاباي", P.instapay) + instr;
    return empty;
  }
  if(P.bankAccount || P.iban){
    let h = "";
    if(P.bankName) h += '<p class="hint">البنك: ' + esc(P.bankName) + '</p>';
    if(P.bankAccount) h += payValueRow("رقم الحساب", P.bankAccount);
    if(P.iban) h += payValueRow("IBAN", P.iban);
    return h + instr;
  }
  return empty;
}
function payBoxHTML(){
  return '<div class="pay-box"><h3 class="pay-title">طرق الدفع</h3>' +
    '<div class="pay-tabs">' +
    '<button type="button" class="pay-tab active" data-pay="wallet">المحافظ الإلكترونية</button>' +
    '<button type="button" class="pay-tab" data-pay="instapay">إنستاباي</button>' +
    '<button type="button" class="pay-tab" data-pay="bank">حساب بنكي</button>' +
    '</div>' +
    '<div class="pay-pane" data-pane="wallet">' + payPaneHTML("wallet") + '</div>' +
    '<div class="pay-pane hidden" data-pane="instapay">' + payPaneHTML("instapay") + '</div>' +
    '<div class="pay-pane hidden" data-pane="bank">' + payPaneHTML("bank") + '</div>' +
    '</div>';
}
let subCache = {active:false, yymm:"", expiry:null};
function getInstallId(){
  let id = localStorage.getItem("mk_install_id");
  if(!id){
    const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; /* من غير 0/O/1/I عشان مفيش لخبطة */
    const bytes = new Uint8Array(8); crypto.getRandomValues(bytes);
    id = Array.from(bytes, b=>alpha[b % alpha.length]).join("");
    localStorage.setItem("mk_install_id", id);
  }
  return id;
}
async function sha256Hex(str){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function subCheckChars(installId, yymm){
  const hex = await sha256Hex(SUB_SECRET + "|" + installId + "|" + yymm);
  return hex.slice(0,6).toUpperCase();
}
/* ---------- وضع المالك (كود دائم OWNR — وصول كامل من غير انتهاء) ---------- */
async function ownerCheckChars(installId){
  const hex = await sha256Hex(SUB_SECRET + "|" + installId + "|OWNR");
  return hex.slice(0,6).toUpperCase();
}
async function validateOwnerCode(raw, installId){
  const c = normalizeSubCode(raw);
  if(c.length !== 10 || c.slice(0,4) !== "OWNR") return false;
  return (await ownerCheckChars(installId)) === c.slice(4);
}
let ownerCache = false;
async function refreshOwner(){
  ownerCache = false;
  try{
    const o = JSON.parse(localStorage.getItem("mk_owner")||"null");
    if(o && o.code) ownerCache = await validateOwnerCode(o.code, getInstallId());
  }catch(e){}
  return ownerCache;
}
function isOwner(){ return ownerCache; }
function subExpiryDate(yymm){
  const yy = parseInt(yymm.slice(0,2),10), mm = parseInt(yymm.slice(2,4),10);
  return new Date(2000+yy, mm, 0, 23, 59, 59, 999); /* آخر يوم في شهر الانتهاء */
}
function subMonthYearLabel(yymm){
  const yy = parseInt(yymm.slice(0,2),10), mm = parseInt(yymm.slice(2,4),10);
  return SUB_MONTHS_AR[mm-1] + " " + (2000+yy);
}
function normalizeSubCode(raw){ return String(raw==null?"":raw).toUpperCase().replace(/[^A-Z0-9]/g,""); }
async function validateSubCode(raw, installId){
  const c = normalizeSubCode(raw);
  if(c.length !== 10) return null;
  const yymm = c.slice(0,4), check = c.slice(4);
  if(!/^\d{4}$/.test(yymm)) return null;
  const mm = parseInt(yymm.slice(2,4),10);
  if(mm < 1 || mm > 12) return null;
  const expected = await subCheckChars(installId, yymm);
  if(expected !== check) return null;
  if(new Date() > subExpiryDate(yymm)) return {expired:true, yymm:yymm};
  return {yymm:yymm, expiry:subExpiryDate(yymm)};
}
async function refreshSub(){
  await refreshOwner();
  subCache = {active:false, yymm:"", expiry:null, owner:ownerCache};
  try{
    const s = JSON.parse(localStorage.getItem("mk_sub")||"null");
    if(s && s.code){
      const v = await validateSubCode(s.code, getInstallId());
      if(v && !v.expired) subCache = {active:true, yymm:v.yymm, expiry:v.expiry, owner:ownerCache};
    }
  }catch(e){}
  if(ownerCache) subCache.active = true; /* المالك: وصول كامل دائم بغض النظر عن أي اشتراك شهري */
  renderLibSubStatus();
  return subCache.active;
}
/* بيعيد التحقق من الكود المحفوظ كل مرة (مش بيصدّق أي علامة محفوظة وخلاص) */
async function isSubActive(){ return refreshSub(); }
/* ---------- الفترة التجريبية: يومين من أول تشغيل للتطبيق ---------- */
const TRIAL_MS = 2*24*3600*1000;
const TRIAL_START_KEY = "mk_trial_start";
function trialStart(){
  let t = 0;
  try{ t = parseInt(localStorage.getItem(TRIAL_START_KEY) || "0", 10) || 0; }catch(e){}
  if(!t){ t = Date.now(); try{ localStorage.setItem(TRIAL_START_KEY, String(t)); }catch(e){} }
  return t;
}
function trialLeftMs(){ return Math.max(0, TRIAL_MS - (Date.now() - trialStart())); }
function inTrial(){ return trialLeftMs() > 0; }
function fmtTrialLeft(ms){
  ms = Math.max(0, ms || 0);
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440), h = Math.floor((totalMin % 1440) / 60), m = totalMin % 60;
  if(d > 0 && h === 0 && m === 0) return d === 2 ? "يومين" : "يوم"; /* بداية التجريبية بالظبط: يومين كاملين */
  if(d > 0) return "يوم و" + h + " ساعة";
  if(h > 0) return h + " ساعة و" + m + " دقيقة";
  return m + " دقيقة";
}
function isBookLocked(book){
  if(!book) return false;
  if(ownerCache) return false;
  if(subCache.active) return false;
  return !inTrial(); /* التجريبية شغالة: كل الكتب مفتوحة — خلصت: الكل مقفول لحد الاشتراك */
}
function subWaLink(id){
  const txt = "أهلاً، عايز أشترك في «كُتُبِي» — اشتراك شهري (٤٩ جنيه).\nكود التثبيت بتاع جهازي: " + id + "\nابعتلي كود التفعيل الشهري من فضلك.";
  return "https://wa.me/201030908031?text=" + encodeURIComponent(txt);
}
function renderLibSubStatus(){
  const txt = subCache.owner
    ? "⭐ وضع المالك مفعّل — وصول كامل دائم."
    : subCache.active
    ? "⭐ اشتراكك مفعّل لحد نهاية " + subMonthYearLabel(subCache.yymm) + " — كل كتبك مفتوحة."
    : inTrial()
    ? "🎁 انت في الفترة التجريبية — باقي لك " + fmtTrialLeft(trialLeftMs()) + " — الاشتراك بـ ٤٩ جنيه شهريًا بيفتح كل الكتب بعد التجريبية (من تبويب الإعدادات)."
    : "انتهت الفترة التجريبية (يومين). الاشتراك بـ ٤٩ جنيه شهريًا بيفتح كل الكتب (من تبويب الإعدادات).";
  const el = $("#libSubStatus"); if(el) el.textContent = txt;
  const home = $("#homeSubStatus"); if(home) home.textContent = txt;
}
function renderSubPanels(){
  const id = getInstallId();
  $$(".sub-panel").forEach(root=>{
    const st = subCache.owner
      ? '<p class="sub-status ok">⭐ وضع المالك مفعّل — وصول كامل دائم</p>'
      : subCache.active
      ? '<p class="sub-status ok">✔ اشتراك مفعّل — صالح لحد نهاية ' + esc(subMonthYearLabel(subCache.yymm)) + '</p>'
      : inTrial()
      ? '<p class="sub-status">🎁 انت في الفترة التجريبية — باقي لك ' + fmtTrialLeft(trialLeftMs()) + ' — بعدها فعّل الاشتراك الشهري عشان كتبك تفضل مفتوحة: ترجمة وشرح وتصدير كاملين.</p>'
      : '<p class="sub-status">انتهت الفترة التجريبية (يومين). فعّل الاشتراك الشهري عشان تفتح كل كتبك: ترجمة وشرح وتصدير كاملين.</p>';
    root.innerHTML = st +
      '<p class="sub-price">سعر الاشتراك: <strong>٤٩ جنيه شهريًا</strong></p>' +
      '<p class="hint">كود التثبيت بتاع جهازك — ابعه لنا واتساب وانت بتشترك عشان يوصلك كودك:</p>' +
      '<div class="row wrap"><code class="install-id" dir="ltr">' + esc(id) + '</code><button type="button" class="ghost sub-copy">نسخ</button></div>' +
      '<label>كود التفعيل اللي وصلك مننا<input type="text" class="sub-input" dir="ltr" placeholder="2611-XXXXXX" autocomplete="off"></label>' +
      '<div class="row wrap"><button type="button" class="primary sub-activate">تفعيل</button>' +
      '<a class="wa-btn" target="_blank" rel="noopener" href="' + subWaLink(id) + '">💬 اشترك عن طريق واتساب</a></div>' +
      payBoxHTML() +
      '<p class="msg sub-msg"></p>';
    $(".sub-copy", root).addEventListener("click", async ()=>{
      const msg = $(".sub-msg", root);
      try{ await navigator.clipboard.writeText(id); msg.textContent = "اتنسخ كود التثبيت ✔"; msg.classList.remove("err"); }
      catch(e){ msg.textContent = "انسخ الكود يدويًا من فوق: " + id; msg.classList.remove("err"); }
    });
    $(".sub-activate", root).addEventListener("click", async ()=>{
      let msg = $(".sub-msg", root);
      const raw = $(".sub-input", root).value;
      msg.textContent = "بيتأكد من الكود…"; msg.classList.remove("err");
      const r = await tryActivateSub(raw);
      renderSubPanels(); renderLibrary();
      const b = currentBook();
      if(b && $("#tab-reader").classList.contains("active")) renderReader(b);
      msg = $(".sub-msg", root);
      if(msg){ msg.textContent = r.msg; msg.classList.toggle("err", !r.ok); }
    });
    /* تبويبات طرق الدفع — شغالة جوه البانل ده بس (مش بتأثر على البانل التاني) */
    $$(".pay-tab", root).forEach(tab=>tab.addEventListener("click", ()=>{
      $$(".pay-tab", root).forEach(t=>t.classList.toggle("active", t===tab));
      $$(".pay-pane", root).forEach(p=>p.classList.toggle("hidden", p.dataset.pane!==tab.dataset.pay));
    }));
    $$(".pay-copy", root).forEach(btn=>btn.addEventListener("click", async ()=>{
      const msg = $(".sub-msg", root);
      try{ await navigator.clipboard.writeText(btn.dataset.copy); if(msg){ msg.textContent = "اتنسخ ✔"; msg.classList.remove("err"); } }
      catch(e){ if(msg) msg.textContent = "انسخ القيمة يدويًا من فوق."; }
    }));
  });
  renderLibSubStatus();
}
async function tryActivateSub(raw){
  const id = getInstallId();
  if(!normalizeSubCode(raw)) return {ok:false, msg:"اكتب كود التفعيل الأول — لو لسه مشتركتش، دوس «اشترك عن طريق واتساب»."};
  if(await validateOwnerCode(raw, id)){
    localStorage.setItem("mk_owner", JSON.stringify({code:normalizeSubCode(raw), at:Date.now()}));
    await refreshSub();
    return {ok:true, owner:true, msg:"⭐ وضع المالك اتفعّل — وصول كامل دائم على الجهاز ده."};
  }
  const v = await validateSubCode(raw, id);
  if(!v) return {ok:false, msg:"الكود ده مش صح — اتأكد إنك كاتبه زي ما وصلك بالظبط، وإنك بتفعّل على نفس الجهاز اللي طلع منه كود التثبيت."};
  if(v.expired) return {ok:false, msg:"الكود ده مدته خلصت (كان صالح لحد نهاية " + subMonthYearLabel(v.yymm) + ") — كلّمنا واتساب عشان تجدّد اشتراكك."};
  localStorage.setItem("mk_sub", JSON.stringify({code:normalizeSubCode(raw), yymm:v.yymm, activatedAt:Date.now()}));
  await refreshSub();
  return {ok:true, msg:"مبروك! اشتراكك اتفعّل ✔ صالح لحد نهاية " + subMonthYearLabel(v.yymm) + " — كل كتبك بقت مفتوحة."};
}

/* ---------- تحسين النصوص (تنضيف محلي حتمي — من غير أي إعادة كتابة للمحتوى) ---------- */
function cleanupText(text){
  const before = String(text||"");
  const stats = {merged:0, removedPages:0, removedDup:0, before:before.length, after:0};
  let lines = before.replace(/\r\n?/g,"\n").split("\n");
  /* ١) شيل سطور أرقام الصفحات: سطر كله أرقام (عربية/هندية) حواليها شرط أو نقط أو فراغات بس */
  const pageRe = /^[\s\-–—._·•]*[0-9\u0660-\u0669\u06F0-\u06F9]+[\s\-–—._·•]*$/;
  lines = lines.filter(l=>{
    const s = l.trim();
    if(s && pageRe.test(s)){ stats.removedPages++; return false; }
    return true;
  });
  /* ٢) شيل سطور الترويسة/التذييل: سطر كامل بيتكرر بالنص ٣ مرات أو أكتر */
  const counts = {};
  lines.forEach(l=>{ const s = l.trim(); if(s) counts[s] = (counts[s]||0)+1; });
  lines = lines.filter(l=>{
    const s = l.trim();
    if(s && counts[s] >= 3){ stats.removedDup++; return false; }
    return true;
  });
  /* ٣) ظبط المسافات جوه السطر وقص أطرافه */
  lines = lines.map(l=>l.replace(/[ \t]+/g," ").trim());
  /* ٤) ادمج السطور اللي اتقطعت في نص الجملة (السطر مش بينتهي بعلامة نهاية جملة) */
  const endPunct = /[.!?؟:؛…"']$|[.!?؟:؛…"'][»)\]]$|[»)\]]$/;
  const joined = [];
  for(const l of lines){
    if(l === ""){ joined.push(""); continue; }
    const prev = joined.length ? joined[joined.length-1] : "";
    if(prev !== "" && !endPunct.test(prev)){ joined[joined.length-1] = prev + " " + l; stats.merged++; }
    else joined.push(l);
  }
  /* ٥) سطرين فاضيين ورا بعض بالكتير يبقوا واحد، وقص الفراغ من الأول والآخر */
  const out = []; let blanks = 0;
  for(const l of joined){
    if(l === ""){ blanks++; if(blanks <= 1) out.push(""); }
    else { blanks = 0; out.push(l); }
  }
  const res = out.join("\n").trim();
  stats.after = res.length;
  return {text:res, stats:stats};
}
function cleanNote(b){
  const s = b && b._cleanStats; if(!s) return "";
  const n = (s.merged||0) + (s.removedPages||0) + (s.removedDup||0);
  return n ? " واتنضّف النص تلقائيًا أثناء الإضافة 🧹" : "";
}
function setCleanupStatus(t, err){ const el = $("#cleanupStatus"); if(el){ el.textContent = t||""; el.style.color = err ? "var(--bad)" : ""; } }
async function cleanupBook(book){
  if(translating || repairing || explaining){ setCleanupStatus("فيه ترجمة أو إصلاح أو شرح شغال دلوقتي — وقّفه أو استنى يخلص الأول", true); return; }
  if(isBookLocked(book)) return;
  const hasTrans = book.chunks.some(c=>c.status==="done" || (c.trans && c.trans.trim()));
  if(hasTrans && !confirm("تحسين النص هيعيد تقسيم الكتاب ويمسح ترجمته الحالية عشان تترجم من جديد على النص النضيف. أكمل؟")) return;
  snapshotOrigIfNeeded(book); /* نقطة استرجاع للكتب القديمة: النص الحالي قبل أول تعديل — بتتحفظ مع حفظ التحسين نفسه */
  const origText = book.chunks.map(c=>c.orig).join("\n\n");
  const cleaned = cleanupText(origText);
  book.chunks = splitChunks(cleaned.text); /* re-chunked: page map no longer valid; viewer falls back to proportional */ book.chunks.forEach(c=>{ delete c.pg; delete c.pgEnd; });
  book.summary = "";
  book.progress = 0; book.bookmarks = []; book.annotations = []; /* إعادة التقسيم غيّرت أرقام الأجزاء — العلامات والتظليلات القديمة مبقتش مربوطة صح */
  await idbPut(book);
  renderReader(book); renderLibrary();
  const s = cleaned.stats;
  setCleanupStatus("اتنضّف النص ✔ اتدمج " + s.merged + " سطر، واتشال " + s.removedPages + " رقم صفحة و" + s.removedDup + " سطر مكرر. ترجم من جديد على النص النضيف.");
}

/* ---------- مسح ترجمات كتاب (روتين مشترك: الإصلاح / تغيير لغة الترجمة / زرار المسح) ---------- */
function clearDerivedChunk(ch){ ch.trans=""; ch.status="pending"; ch.glossary=[]; ch.keyPoints=[]; ch.explanation=""; ch.explTone=""; ch.basic=false; }
function clearBookTranslations(book){ book.chunks.forEach(clearDerivedChunk); book.summary=""; }

/* ---------- النسخة الأصلية المحفوظة واسترجاعها + إعادة تحميل الكتاب ---------- */
/* لقطة النص الأصلي: بتتعمل مرة واحدة بس (عند إضافة الكتاب، أو قبل أول تحسين/إصلاح لكتاب قديم معندوش لقطة)
   ومبتتغيّرش بعد كده أبدًا — لا من التحسين ولا الإصلاح ولا الاسترجاع نفسه. بترجع true لو اللقطة اتعملت دلوقتي */
function snapshotOrigIfNeeded(book){
  if(!book || Array.isArray(book.origChunks)) return false;
  book.origChunks = (book.chunks || []).map(c=>c.orig || "");
  book.origJoined = book.origChunks.join("\n\n");
  book.origAuto = true; /* نقطة الرجوع دي اتعملت تلقائيًا من النص المحفوظ حاليًا — مش النص الأصلي وقت إضافة الكتاب */
  return true;
}
/* هل نص الأجزاء الحالي مختلف عن النسخة الأصلية المحفوظة؟ (معندوش نسخة أصلًا = مش مختلف) */
function origDiffers(book){
  if(!book || !Array.isArray(book.origChunks)) return false;
  const cur = (book.chunks || []).map(c=>c.orig || "");
  if(cur.length !== book.origChunks.length) return true;
  for(let i=0;i<cur.length;i++){ if(cur[i] !== book.origChunks[i]) return true; }
  return false;
}
/* أجزاء جديدة نضيفة مبنية من النسخة الأصلية المحفوظة — أصل بس، من غير أي بيانات مشتقة */
function buildRestoredChunks(book){
  return (book.origChunks || []).map(t=>{ const ch = { orig:t }; clearDerivedChunk(ch); return ch; });
}
/* استرجاع النص الأصلي: بيرجّع أجزاء الكتاب زي ما كانت قبل التحسين/الإصلاح وبيمسح الترجمات والشرح وكل المرتبط بالنص الحالي */
async function restoreOriginal(book){
  if(!book || translating || repairing) return;
  if(isBookLocked(book)) return; /* الكتب المقفولة: نفس سلوك القفل */
  if(!Array.isArray(book.origChunks) || !origDiffers(book)) return;
  book.chunks = buildRestoredChunks(book);
  book.summary = "";
  book.progress = 0; book.bookmarks = []; book.annotations = []; book.chat = []; /* أرقام الأجزاء رجعت زي الأصل: العلامات والتظليلات والمحادثة القديمة مبقتش مربوطة صح */
  book.srcArabic = arabicRatio(book.chunks.map(c=>c.orig).join("\n\n")) > 0.5;
  await idbPut(book);
  renderReader(book); renderLibrary();
  setTransStatus("رجعنا النص الأصلي للكتاب");
}
/* إعادة تحميل الكتاب الحالي: بيوقف أي ترجمة/إصلاح/صوت شغال، ويقرا الكتاب من جديد من التخزين، ويعيد رسم القارئ كله — من غير ما يغيّر أي بيانات ومش بيستأنف ترجمة واقفة */
async function reloadCurrentBook(){
  const id = currentId; if(!id) return;
  stopFlag = true; if(transRun) transRun.stop();
  repairStop = true; if(repairRun) repairRun.stop();
  stopAllAudio();
  await new Promise(r=>setTimeout(r, 150)); /* فرصة للحلقات الواقفة تثبّت حالتها قبل إعادة الرسم */
  let fresh = null;
  try{ fresh = (await idbAll()).find(b=>b.id===id); }
  catch(e){ logError("إعادة تحميل", e); setTransStatus("إعادة التحميل فشلت — سبب التوقف: " + describeError(e), true); return; }
  if(!fresh) return;
  const ix = books.findIndex(b=>b.id===id);
  if(ix >= 0) books[ix] = fresh; else books.push(fresh);
  renderReader(fresh); renderLibrary(); renderIndexPanel();
  setTransStatus("اتعاد تحميل الكتاب من الأول");
}

/* ---------- إصلاح النص البايظ بالذكاء الاصطناعي (من استخراج PDF وحش) ---------- */
const REPAIR_SYS = "انت محرر نصوص. أصلح النص الجاي من كتاب: رتّب الكلمات والحروف لو ترتيبها مقلوب من استخراج PDF، أكمل الكلمات المقطوعة من السياق، وشيل التشوهات والرموز الغريبة، وحافظ على كل المحتوى والمعنى والترتيب. ممنوع تضيف أي معلومة مش موجودة أو تحذف محتوى. أي جزء مش مفهوم خالص سيبه زي ما هو وحط قبله [غير واضح]. ارجع النص المصلح بس، من غير شرح ولا مقدمات.";
let repairing = false, repairStop = false;
async function repairBook(book, opts){
  if(repairing || translating || explaining){ setCleanupStatus("فيه ترجمة أو إصلاح أو شرح شغال دلوقتي — وقّفه أو استنى يخلص الأول", true); return; }
  if(isBookLocked(book)) return; /* الكتب المقفولة: نفس سلوك القفل، مفيش إصلاح */
  if(!hasKey()){
    setCleanupStatus("الإصلاح بالذكاء الاصطناعي بيحتاج مفتاح API — ضيفه من تبويب الإعدادات. (زرار «تحسين النص» العادي بيشتغل من غير مفتاح.)", true);
    return;
  }
  /* skipConfirm: اللي نادى (عرض إصلاح ما بعد الـ OCR) سأل المستخدم خلاص — مفيش سؤالين ورا بعض لنفس الخطوة */
  if(!(opts && opts.skipConfirm) && !confirm("الإصلاح هيبعت نص الكتاب للذكاء الاصطناعي يعيد بناء الكلام البايظ من السياق ويستبدل النص الأصلي. الحتت المدمرة على الآخر هيتعلّم عليها [غير واضح] بدل ما يخترع كلام. ودي خطوة منفصلة عن الترجمة. أكمل؟")) return;
  if(snapshotOrigIfNeeded(book)) await idbPut(book); /* نقطة استرجاع للكتب القديمة: بنحفظ اللقطة قبل أي تعديل فعلي */
  repairing = true; repairStop = false;
  repairRun = makeRunControl();
  renderReaderControls(book);
  let okCount = 0, failCount = 0, stoppedMid = false, lastErr = null;
  try{
    for(let i=0;i<book.chunks.length;i++){
      if(repairStop || repairRun.stopped){ stoppedMid = true; setTransStatus("⏸ وقفت الإصلاح — اتصلح " + okCount + " جزء لحد دلوقتي وتقدر تكمل في أي وقت."); break; }
      const ch = book.chunks[i];
      $("#transProgress").style.width = Math.round(i/book.chunks.length*100) + "%";
      setTransStatus("بيصلّح الجزء " + (i+1) + " من " + book.chunks.length + "…");
      try{
        /* جزء أطول من حد الـ API: بيتصلّح قطعة قطعة وبيتجمّع بنفس الترتيب */
        let fixed;
        if((ch.orig || "").length > API_CHUNK_MAX){
          const outs = [];
          for(const piece of splitForApi(ch.orig, API_CHUNK_MAX)){
            if(repairStop || repairRun.stopped) throw abortError();
            const pf = String(await aiChat(REPAIR_SYS, piece, 0.2, repairRun.signal, {maxTokens: 4096}) || "").trim();
            if(!pf) throw new Error("ردّ فاضي من الخدمة");
            outs.push(pf);
          }
          fixed = outs.join("\n\n");
        } else {
          fixed = String(await aiChat(REPAIR_SYS, ch.orig, 0.2, repairRun.signal, {maxTokens: 4096}) || "").trim();
        }
        if(!fixed) throw new Error("ردّ فاضي من الخدمة");
        ch.orig = fixed; clearDerivedChunk(ch);
        book.repaired = true; okCount++;
      }catch(err){
        if(repairStop || repairRun.stopped || (err && err.name==="AbortError")){ /* إيقاف مقصود: الجزء الحالي بيفضل بأصله */
          stoppedMid = true; setTransStatus("⏸ وقفت الإصلاح — اتصلح " + okCount + " جزء لحد دلوقتي وتقدر تكمل في أي وقت."); break;
        }
        failCount++; lastErr = err; /* الجزء اللي فشل بيفضل بأصله زي ما هو — وآخر خطأ بيتحفظ عشان سببه يظهر في رسالة الخلاصة */
      }
      await idbPut(book); renderChunk(book, i);
    }
    if(!stoppedMid && !repairStop){
      if(failCount && lastErr) logError("إصلاح", lastErr);
      setTransStatus(failCount ? "خلص الإصلاح — بس فيه أجزاء فشلت" : "خلص الإصلاح ✔", !!failCount);
      setCleanupStatus("اتصلح " + okCount + " من " + book.chunks.length + " جزء" + (failCount ? " — و" + failCount + " جزء فشل واتساب زي ما هو. آخر خطأ — سبب التوقف: " + describeError(lastErr) + "." : ".") + " دلوقتي دوس «ترجم / كمّل الترجمة» عشان تترجم على النص المصلّح.");
    }
  } finally {
    repairing = false; repairRun = null; renderReaderControls(book); renderProgress(book); renderLibrary();
  }
}

/* ---------- الرجوع للكتاب المفتوح (آخر موضع قراية) ---------- */
const LAST_OPEN_KEY = "motarjem-last-open";
function getLastOpen(){ try{ return JSON.parse(localStorage.getItem(LAST_OPEN_KEY)||"null"); }catch(e){ return null; } }
function saveLastOpen(bookId, chunkIndex){
  const bk = books.find(b=>b.id===bookId);
  if(bk && isBookLocked(bk)) return; /* كتاب مقفول بالاشتراك: منسجلش موضعه أصلًا عشان «أكمِل» مودّيش لشاشة الدفع */
  try{ localStorage.setItem(LAST_OPEN_KEY, JSON.stringify({bookId:bookId, chunkIndex:chunkIndex||0, ts:Date.now()})); }catch(e){}
  renderResumeUI();
}
function clearLastOpen(){ try{ localStorage.removeItem(LAST_OPEN_KEY); }catch(e){} renderResumeUI(); }
function resumeToLast(){
  const lo = getLastOpen(); if(!lo || !lo.bookId) return;
  const bk = books.find(b=>b.id===lo.bookId);
  if(!bk || isBookLocked(bk)){ clearLastOpen(); return; } /* مقفول أو اتمسح: نضّف الموضع ومتتحركش */
  openBook(lo.bookId, lo.chunkIndex||0);
}
/* [R4] غلاف + شريط موضع القراءة في كارت الرئيسية (آمن: أي خطأ يتجاهَل) */
function renderHomeResumeExtras(hr, book, lo){
  try{
    if(typeof bookCoverEl === "function"){
      const fresh = bookCoverEl(book); fresh.classList.add("hr-cover");
      const old = hr.querySelector(".hr-cover");
      if(old) old.replaceWith(fresh); else hr.insertBefore(fresh, hr.firstChild);
    }
    const total = (book.chunks || []).length;
    const idx = Math.min(Math.max(lo.chunkIndex || 0, 0), Math.max(total - 1, 0));
    const pct = total ? Math.round((idx + 1) / total * 100) : 0;
    let bar = hr.querySelector(".hr-progress");
    if(!bar){ bar = document.createElement("div"); bar.className = "hr-progress"; bar.appendChild(document.createElement("i")); hr.appendChild(bar); }
    bar.firstChild.style.width = pct + "%";
    bar.title = "موضعك في الكتاب: " + pct + "%";
  }catch(e){}
}
function renderResumeUI(){
  const bar = $("#resumeBar"), ban = $("#resumeBanner"), hr = $("#homeResume");
  const lo = getLastOpen();
  const book = lo ? books.find(b=>b.id===lo.bookId) : null;
  if(!book || isBookLocked(book)){
    if(bar) bar.classList.add("hidden");
    if(ban) ban.classList.add("hidden");
    if(hr) hr.classList.add("hidden");
    document.body.classList.remove("has-resume-bar");
    if(lo) try{ localStorage.removeItem(LAST_OPEN_KEY); }catch(e){}
    return;
  }
  const txt = "📖 أكمِل: " + book.title + " — الجزء " + ((lo.chunkIndex||0)+1);
  const activeTab = ($(".tab.active")||{}).id || "";
  if(bar){ $("#resumeBarText").textContent = txt; const hideBar = activeTab==="tab-reader" || activeTab==="tab-library" || activeTab==="tab-home"; bar.classList.toggle("hidden", hideBar); document.body.classList.toggle("has-resume-bar", !hideBar); }
  if(ban){ $("#resumeBannerText").textContent = txt; ban.classList.remove("hidden"); }
  if(hr){ $("#homeResumeText").textContent = txt; hr.classList.remove("hidden"); renderHomeResumeExtras(hr, book, lo); }
}

/* ---------- تجربة القراءة: تقدّم القراءة ووقتها وإحصائياتها ---------- */
function countWords(t){ return (String(t||"").match(/\S+/g)||[]).length; }
/* دوال نقية قابلة للاختبار: نسبة القراءة + الدقايق الباقية (الافتراضي 180 كلمة/دقيقة — أو سرعة المستخدم الفعلية لو اتقاست) */
function readProgressCalc(reachedIdx, totalChunks, remainingWordsCount, wpm){
  const pct = totalChunks > 0 ? Math.max(0, Math.min(100, Math.round(((reachedIdx+1)/totalChunks)*100))) : 0;
  const mins = Math.max(0, Math.round((remainingWordsCount||0)/(wpm > 0 ? wpm : 180)));
  return {pct:pct, mins:mins};
}
/* سرعة القراءة الفعلية: بتتقاس بس لما الإحصائيات فيها ≥ 3 جلسات (أيام قراءة) و≥ 30 دقيقة إجمالًا —
   الكلمات المقروءة بتتقدّر من تقدّم كل كتاب × كلماته. برّه الشروط دي بترجع null والتقدير بيفضل 180 */
function computeUserWpm(stats, booksList){
  if(!stats || !stats.byDay) return null;
  const sessions = Object.keys(stats.byDay).filter(k=>(stats.byDay[k] || 0) >= 1).length;
  const totalMin = stats.totalMin || 0;
  if(sessions < 3 || totalMin < 30) return null;
  let wordsRead = 0;
  (booksList || []).forEach(b=>{
    const total = (b.chunks || []).reduce((w, c)=>w + countWords(c.trans || c.orig), 0);
    wordsRead += total * ((b.progress || 0) / 100);
  });
  if(wordsRead < 200) return null;
  const wpm = Math.round(wordsRead / totalMin);
  return Math.max(60, Math.min(600, wpm));
}
function effectiveWpm(){
  const w = computeUserWpm(loadReadStats(), books);
  if(w){ if(settings.userWpm !== w){ settings.userWpm = w; saveSettings(); } return w; }
  return 180;
}
/* خطة الإنهاء: التاريخ المستهدف (book.finishBy بصيغة YYYY-MM-DD) → الأجزاء الباقية والهدف اليومي */
function finishPlan(book, todayStr){
  if(!book || !book.finishBy || !book.chunks || !book.chunks.length) return null;
  const total = book.chunks.length;
  const readChunks = Math.round(((book.progress || 0) / 100) * total);
  const remaining = Math.max(0, total - readChunks);
  if(remaining <= 0) return {done:true, remaining:0, daysLeft:0, daily:0};
  const tp = String(todayStr || todayKey()).split("-").map(Number);
  const fp = String(book.finishBy).split("-").map(Number);
  if(fp.length !== 3 || fp.some(isNaN)) return null;
  const daysLeft = Math.round((new Date(fp[0], fp[1]-1, fp[2]) - new Date(tp[0], tp[1]-1, tp[2])) / 86400000);
  if(daysLeft < 0) return {overdue:true, remaining:remaining, daysLeft:daysLeft, daily:remaining};
  return {remaining:remaining, daysLeft:daysLeft, daily:Math.max(1, Math.ceil(remaining / Math.max(1, daysLeft)))};
}
/* نسب الكتاب التلاتة: قراءة / ترجمة / شرح — لكروت المكتبة وكارت المشاركة */
function bookPercents(book){
  const total = (book && book.chunks) ? book.chunks.length : 0;
  if(!total) return {read:0, trans:0, expl:0};
  const done = book.chunks.filter(c=>c.status === "done").length;
  const expl = book.chunks.filter(c=>c.explanation && c.explanation.trim()).length;
  return {read:Math.round(book.progress || 0), trans:Math.round(done / total * 100), expl:Math.round(expl / total * 100)};
}
/* كلمات إنجليزية قابلة للدوس في النص الأصلي: كل كلمة بتتغلّف في span — دالة نقية */
function tappableOrigHTML(text){
  return String(text || "").split(/([A-Za-z][A-Za-z'-]*)/g).map(part=>
    /^[A-Za-z][A-Za-z'-]*$/.test(part) ? '<span class="tapword" data-w="' + esc(part) + '">' + esc(part) + "</span>" : esc(part)
  ).join("");
}
/* تأكيد التشغيلات الطويلة: أكتر من 10 أجزاء = تأكيد واحد فيه العدد والطلبات والوقت التقريبي — حماية لرصيد الـ API */
function needsRunConfirm(remaining){ return (remaining || 0) > 10; }
function runEstimateText(calls){
  const secs = (calls || 0) * 4;
  if(secs < 60) return "حوالي " + secs + " ثانية";
  const mins = Math.round(secs / 60);
  if(mins === 1) return "حوالي دقيقة";
  if(mins === 2) return "حوالي دقيقتين";
  if(mins <= 10) return "حوالي " + mins + " دقايق";
  return "حوالي " + mins + " دقيقة";
}
function runConfirmText(verb, calls){
  return "التشغيل ده كبير: فاضل " + calls + " جزء " + verb + " — ده حوالي " + calls + " طلب API و" + runEstimateText(calls) + ". أكمل؟";
}
/* عيّنة أجزاء للاختبار: لحد 6 أجزاء موزعة على الكتاب، الأجزاء المترجمة أولًا — دالة نقية */
function sampleQuizChunks(book, n){
  n = n || 6;
  const chs = (book && book.chunks) || [];
  const usable = chs.map((c, i)=>({i:i, c:c})).filter(x=>((x.c.trans || "").trim() || (x.c.orig || "").trim()));
  if(usable.length <= n) return usable;
  const done = usable.filter(x=>x.c.status === "done");
  const pool = done.length >= 3 ? done : usable;
  const step = pool.length / n;
  const out = [];
  for(let k = 0; k < n; k++) out.push(pool[Math.floor(k * step)]);
  return out;
}
/* تحليل أسئلة الاختبار الراجعة من الذكاء الاصطناعي: بنقبل بس الشكل السليم (سؤال + 4 اختيارات + إجابة 0..3) — دالة نقية */
function parseQuizQuestions(raw){
  let j = null;
  try{ const t = JSON.parse(String(raw || "")); if(Array.isArray(t)) j = t; }catch(e){}
  if(!j) j = parseJSONLoose(raw); /* parseJSONLoose بيقصّ { } بس — المصفوفة الصافية لازم تتجرب الأول زي ما هي */
  const arr = Array.isArray(j) ? j : (j && Array.isArray(j.questions) ? j.questions : null);
  if(!arr) return [];
  return arr.filter(q=>q && typeof q.q === "string" && q.q.trim() && Array.isArray(q.options) && q.options.length === 4 && q.options.every(o=>typeof o === "string" && o.trim()) && Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3)
    .slice(0, 5).map(q=>({q:q.q.trim(), options:q.options.map(o=>o.trim()), answer:q.answer, why:String(q.why || "").trim()}));
}
function remainingWords(book, fromIdx){
  let w = 0;
  for(let i = fromIdx+1; i < book.chunks.length; i++){ const c = book.chunks[i]; w += countWords(c.trans || c.orig); }
  return w;
}
const READSTATS_KEY = "motarjem-readstats";
function loadReadStats(){
  try{
    const s = JSON.parse(localStorage.getItem(READSTATS_KEY) || "null");
    if(s && typeof s === "object") return {totalMin:+s.totalMin || 0, byDay:(s.byDay && typeof s.byDay === "object") ? s.byDay : {}, finishedBooks:+s.finishedBooks || 0, finishedIds:Array.isArray(s.finishedIds) ? s.finishedIds : []};
  }catch(e){}
  return {totalMin:0, byDay:{}, finishedBooks:0, finishedIds:[]};
}
function saveReadStats(s){ try{ localStorage.setItem(READSTATS_KEY, JSON.stringify(s)); }catch(e){} }
function todayKey(){ const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
function dayKeyOf(d){ return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
function shiftDayKey(key, delta){ const p = String(key).split("-").map(Number); const d = new Date(p[0] || 2000, ((p[1] || 1) - 1), p[2] || 1); d.setDate(d.getDate() + delta); return dayKeyOf(d); }
/* دالة نقية: سلسلة الأيام المتتالية اللي فيها قراية (≥ دقيقة) لحد النهارده أو امبارح */
function computeStreak(byDay, todayStr){
  byDay = byDay || {};
  let cursor = todayStr;
  if(!((byDay[cursor] || 0) >= 1)) cursor = shiftDayKey(todayStr, -1); /* النهارده لسه مبدأش: السلسلة بتتحسب لحد امبارح */
  let n = 0;
  while((byDay[cursor] || 0) >= 1){ n++; cursor = shiftDayKey(cursor, -1); }
  return n;
}
function markBookFinished(book){
  const s = loadReadStats();
  if(!s.finishedIds.includes(book.id)){ s.finishedIds.push(book.id); s.finishedBooks = s.finishedIds.length; saveReadStats(s); }
}
/* ---------- أرفف المكتبة (سأقرأه / بقرأه حاليًا / خلّصته) ---------- */
const SHELVES = {want:"سأقرأه", reading:"بقرأه حاليًا", done:"خلّصته"};
let shelfFilter = "all";
/* دالة نقية: الرف التلقائي من نسبة التقدم — الاختيار اليدوي للمستخدم بيكسب دايمًا */
function autoShelfFor(progress, current, manual){
  if(manual) return (current && SHELVES[current]) ? current : "want";
  if(progress >= 100) return "done";
  if(progress > 0) return "reading";
  return (current && SHELVES[current]) ? current : "want";
}
function applyAutoShelf(book){ if(!book || book.shelfManual) return; book.shelf = autoShelfFor(book.progress || 0, book.shelf, false); }
function ensureBookExtras(book){
  if(!book) return;
  if(!Array.isArray(book.bookmarks)) book.bookmarks = [];
  if(!Array.isArray(book.annotations)) book.annotations = [];
  if(typeof book.progress !== "number" || isNaN(book.progress)) book.progress = 0;
  if(typeof book.shelfManual !== "boolean") book.shelfManual = false;
  if(!book.shelf || !SHELVES[book.shelf]) book.shelf = autoShelfFor(book.progress || 0, null, book.shelfManual);
  if(!Array.isArray(book.chat)) book.chat = [];
  if(!Array.isArray(book.quiz)) book.quiz = [];
  if(typeof book.quizBest !== "number" || isNaN(book.quizBest)) book.quizBest = 0;
  if(typeof book.finishBy !== "string") book.finishBy = "";
}
/* ---------- مؤشر الصفحات «صفحة X من Y» ----------
   كتب الـPDF عندها pageCount حقيقي مخزّن وقت الاستيراد (حتى كتب الـOCR المصوّرة) — الرقم بيرتكز عليه.
   باقي الكتب (نص/EPUB) الإجمالي تقديري بمتوسط حروف الصفحة، وبيتعلّم بـ≈ عشان ميدّعيش دقة مش موجودة.
   الموضع بيتحسب بنسبة الحروف اللي قبل موضع القراءة لكل حروف الكتاب — ثابت مهما اتغيّر حجم الخط أو الشاشة. */
const PAGE_CHARS_EST = 1800;
const pageMapCache = new Map(); /* book.id → خريطة محسوبة مرة واحدة لكل نسخة كتاب */
function bookPageMap(book){
  if(!book || !book.chunks || !book.chunks.length) return null;
  const n = book.chunks.length;
  const sig = n + ":" + (((book.chunks[0]||{}).orig||"").length) + ":" + (((book.chunks[n-1]||{}).orig||"").length) + ":" + (book.pageCount || 0);
  const hit = pageMapCache.get(book.id);
  if(hit && hit.sig === sig) return hit;
  const cum = new Array(n); let total = 0;
  for(let i=0;i<n;i++){ cum[i] = total; total += ((book.chunks[i].orig || "").length + 2); }
  const map = {
    sig: sig, cum: cum, totalChars: Math.max(total, 1),
    total: (book.pageCount && book.pageCount > 0) ? Math.round(book.pageCount) : Math.max(1, Math.round(total / PAGE_CHARS_EST)),
    exact: !!(book.pageCount && book.pageCount > 0)
  };
  pageMapCache.set(book.id, map);
  return map;
}
function pageLabelAt(book, idx, frac){
  const m = bookPageMap(book); if(!m) return "";
  idx = Math.max(0, Math.min(m.cum.length - 1, idx || 0));
  const chunkLen = ((book.chunks[idx].orig || "").length + 2);
  const off = m.cum[idx] + Math.max(0, Math.min(1, frac || 0)) * chunkLen;
  const page = Math.max(1, Math.min(m.total, 1 + Math.floor(off / m.totalChars * m.total)));
  return "صفحة " + page + " من " + (m.exact ? "" : "≈") + m.total;
}
function updatePagePill(book, idx, frac){
  const pill = $("#pillPos"); if(!pill) return;
  pill.textContent = pageLabelAt(book, idx, frac);
}
function updateReadProgress(book, idx, frac){
  if(!book || !book.chunks || !book.chunks.length) return;
  ensureBookExtras(book);
  const calc = readProgressCalc(idx, book.chunks.length, remainingWords(book, idx), effectiveWpm());
  if(calc.pct > (book.progress || 0)){
    book.progress = calc.pct;
    applyAutoShelf(book); /* التقدم بيحرّك الرف تلقائيًا (إلا لو المستخدم اختار رف بنفسه) */
    scheduleProgressSave(book); /* الحفظ مؤجّل ومتجمّع — التمرير المستمر مبيكتبش كل مرة */
    if(calc.pct >= 100){ flushProgressSave(); markBookFinished(book); }
  }
  const t = $("#readProgressText"); if(t) t.textContent = "قريت " + calc.pct + "٪ من الكتاب — باقي حوالي " + calc.mins + " دقيقة";
  const f = $("#readProgressFill"); if(f) f.style.width = calc.pct + "%";
  const sm = $("#scrubMeta"); if(sm) sm.textContent = "قريت " + calc.pct + "٪ • باقي ~" + calc.mins + " دقيقة";
  const sc = $("#readScrubber");
  if(sc && document.activeElement !== sc){ sc.max = String(Math.max(0, book.chunks.length - 1)); sc.value = String(idx); const sp = $("#scrubPos"); if(sp) sp.textContent = "جزء " + (idx + 1) + " من " + book.chunks.length; }
  updatePagePill(book, idx, frac || 0);
}
function syncProgressBarVisibility(){
  const b = currentBook();
  const show = currentTabName === "reader" && b && !isBookLocked(b);
  document.body.classList.toggle("reading", !!show);
}
function renderHomeStats(){
  const el = $("#readStatsBody"); if(!el) return;
  const s = loadReadStats();
  const today = s.byDay[todayKey()] || 0;
  const inProg = books.filter(b=>(b.progress || 0) > 0 && (b.progress || 0) < 100 && !isBookLocked(b)).length;
  const streak = computeStreak(s.byDay, todayKey());
  const goal = settings.dailyGoalMin || 15;
  const goalPct = Math.min(100, Math.round(today / goal * 100));
  el.innerHTML =
    '<div class="stat-box"><strong>' + today + '</strong><span>دقايق قراءة النهارده</span></div>' +
    '<div class="stat-box"><strong>' + s.totalMin + '</strong><span>إجمالي دقايق القراءة</span></div>' +
    '<div class="stat-box"><strong>' + s.finishedBooks + '</strong><span>كتب خلّصتها</span></div>' +
    '<div class="stat-box"><strong>' + inProg + '</strong><span>كتب بتتقرا دلوقتي</span></div>' +
    '<div class="stat-box"><strong>🔥 ' + streak + '</strong><span>سلسلة أيام متتالية</span></div>' +
    '<div class="stat-box goal-box"><strong>هدف النهارده: ' + today + ' من ' + goal + ' دقيقة</strong>' +
    '<div class="progress-wrap"><div class="progress" style="width:' + goalPct + '%"></div></div>' +
    '<label>الهدف اليومي <select id="goalSel">' + [5,10,15,30,60].map(m=>'<option value="' + m + '"' + (m === goal ? " selected" : "") + '>' + m + ' دقيقة</option>').join("") + '</select></label></div>';
  const wpm = computeUserWpm(s, books);
  if(wpm) el.innerHTML += '<div class="stat-box"><strong>' + wpm + '</strong><span>كلمة/دقيقة — الوقت محسوب على سرعتك الفعلية</span></div>';
  const gs = $("#goalSel");
  if(gs) gs.addEventListener("change", ()=>{ settings.dailyGoalMin = parseInt(gs.value, 10) || 15; saveSettings(); renderHomeStats(); });
  renderAchievements(s, streak);
  /* هدف خطة الإنهاء لآخر كتاب اتفتح — بيظهر في الرئيسية */
  const gl = $("#homeGoalLine");
  if(gl){
    let hb = null;
    try{ const lo = getLastOpen(); if(lo && lo.bookId) hb = books.find(b=>b.id === lo.bookId) || null; }catch(e){}
    if(!hb) hb = books.filter(b=>b.finishBy && !isBookLocked(b)).slice(-1)[0] || null;
    const plan = hb ? finishPlan(hb) : null;
    if(hb && plan && !plan.done){
      gl.textContent = plan.overdue ? "🎯 خطة «" + hb.title + "» اتأخرت — عدّل التاريخ أو كمل على مهلك، فاضل " + plan.remaining + " جزء" : "🎯 هدفك النهاردة: اقرا " + plan.daily + " أجزاء من «" + hb.title + "»";
      gl.classList.remove("hidden");
    } else gl.classList.add("hidden");
  }
}

/* ---------- 🏆 الإنجازات وتحدي الأسبوع (محسوبة من إحصائيات القراءة الموجودة — من غير تخزين جديد) ---------- */
function weekMin(s){
  let n = 0; const tk = todayKey();
  for(let d = 0; d < 7; d++) n += (s.byDay[shiftDayKey(tk, -d)] || 0);
  return n;
}
function computeAchievements(s, books, streak){
  const anns = books.reduce((n, b)=>n + ((b.annotations || []).length), 0);
  const asked = books.some(b=>(b.chat || []).length);
  const summarized = books.some(b=>(b.chunks || []).some(c=>c.summary));
  const explained = books.some(b=>(b.chunks || []).some(c=>c.explanation));
  const list = [
    {icon:"🎯", title:"أول خطوة", desc:"سجّل أول دقيقة قراية", done:s.totalMin >= 1, cur:Math.min(s.totalMin,1), max:1},
    {icon:"📖", title:"قارئ جديد", desc:"خلّص أول كتاب", done:s.finishedBooks >= 1, cur:Math.min(s.finishedBooks,1), max:1},
    {icon:"📚", title:"نهّاز كتب", desc:"خلّص ٣ كتب", done:s.finishedBooks >= 3, cur:Math.min(s.finishedBooks,3), max:3},
    {icon:"🔥", title:"ولّاعة ٣ أيام", desc:"سلسلة قراية ٣ أيام", done:streak >= 3, cur:Math.min(streak,3), max:3},
    {icon:"🏆", title:"أسبوع كامل", desc:"سلسلة ٧ أيام متتالية", done:streak >= 7, cur:Math.min(streak,7), max:7},
    {icon:"⏱", title:"٥ ساعات قراية", desc:"٣٠٠ دقيقة إجمالي", done:s.totalMin >= 300, cur:Math.min(s.totalMin,300), max:300},
    {icon:"🖍", title:"المظلّل", desc:"١٠ تظليلات وملاحظات", done:anns >= 10, cur:Math.min(anns,10), max:10},
    {icon:"⭐", title:"جامع الكلمات", desc:"٢٠ كلمة في المفضلة", done:favs.size >= 20, cur:Math.min(favs.size,20), max:20},
    {icon:"💬", title:"فضولي", desc:"اسأل الكتاب أول سؤال", done:asked, cur:asked?1:0, max:1},
    {icon:"📝", title:"الملخّص الذكي", desc:"اعمل أول ملخص لجزء", done:summarized, cur:summarized?1:0, max:1},
    {icon:"💡", title:"الفهّيم", desc:"اعمل أول شرح لجزء", done:explained, cur:explained?1:0, max:1}
  ];
  return list;
}
function renderAchievements(s, streak){
  const wk = $("#achvWeekly");
  if(wk){
    const goal = 120, cur = weekMin(s), pct = Math.min(100, Math.round(cur / goal * 100));
    wk.innerHTML = '<div class="stat-box goal-box weekly"><strong>⚔ تحدي الأسبوع: ' + cur + ' من ' + goal + ' دقيقة</strong>' +
      '<div class="progress-wrap"><div class="progress" style="width:' + pct + '%"></div></div>' +
      '<span class="hint">' + (cur >= goal ? "خلّصت التحدي — بطل 🏆" : "فاضل " + (goal - cur) + " دقيقة على مدار آخر ٧ أيام") + '</span></div>';
  }
  const body = $("#achvBody"); if(!body) return;
  body.innerHTML = "";
  computeAchievements(s, books, streak).forEach(a=>{
    const d = document.createElement("div");
    d.className = "achv" + (a.done ? " done" : "");
    const pct = a.max > 1 ? Math.min(100, Math.round(a.cur / a.max * 100)) : (a.done ? 100 : 0);
    d.innerHTML = '<span class="achv-ic">' + a.icon + '</span><strong>' + a.title + '</strong><span class="hint">' + a.desc + '</span>' +
      '<div class="progress-wrap"><div class="progress" style="width:' + pct + '%"></div></div>';
    body.appendChild(d);
  });
}

/* ---------- التظليل والملاحظات والعلامات ---------- */
function chunkAnnotations(book, i){ return (book.annotations || []).filter(a=>a && a.chunk === i); }
function highlightedHTML(text, anns){
  text = String(text || "");
  if(!anns || !anns.length) return esc(text);
  const marks = [];
  anns.forEach(a=>{ if(a && a.quote){ const p = text.indexOf(a.quote); if(p >= 0) marks.push({p:p, q:a.quote, a:a}); } });
  if(!marks.length) return esc(text);
  marks.sort((x,y)=>x.p - y.p);
  let out = "", last = 0;
  marks.forEach(m=>{
    if(m.p < last) return; /* تداخل: عدّيه عشان منكسرش الـ HTML */
    out += esc(text.slice(last, m.p)) + '<mark class="hl-' + esc(m.a.color || "yellow") + '" title="' + esc(m.a.note || "") + '">' + esc(m.q) + "</mark>";
    last = m.p + m.q.length;
  });
  return out + esc(text.slice(last));
}
function annotationFound(book, a){
  const ch = book.chunks[a.chunk]; if(!ch || !a.quote) return false;
  return (ch.orig && ch.orig.indexOf(a.quote) >= 0) || (ch.trans && ch.trans.indexOf(a.quote) >= 0);
}
let lastChunkSel = {idx:-1, text:""};
function captureChunkSelection(){
  const sel = window.getSelection ? window.getSelection() : null;
  if(!sel || !sel.rangeCount || sel.isCollapsed) return;
  const node = sel.anchorNode, el = node && (node.nodeType === 1 ? node : node.parentElement);
  const sec = el && el.closest ? el.closest(".chunk") : null;
  if(!sec || !sec.id || sec.id.indexOf("chunk-") !== 0) return;
  if(!sec.contains(sel.focusNode)) return;
  const txt = sel.toString();
  if(txt && txt.trim()) lastChunkSel = {idx:parseInt(sec.id.slice(6), 10), text:txt};
}
async function shareQuote(book, quote, msgEl){
  const txt = "\"" + quote + "\" — من كتاب «" + book.title + "» عبر تطبيق كُتُبِي";
  const ok = (t)=>{ if(msgEl){ msgEl.textContent = t; msgEl.classList.remove("err"); } };
  const bad = ()=>{ if(msgEl){ msgEl.textContent = "النسخ متمش من المتصفح — انسخ النص يدويًا."; msgEl.classList.add("err"); } };
  try{ await navigator.clipboard.writeText(txt); ok("اتنسخ الاقتباس ✔ شاركه في أي مكان."); return true; }
  catch(e){
    try{
      const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select();
      const done = document.execCommand("copy"); ta.remove();
      if(done){ ok("اتنسخ الاقتباس ✔ شاركه في أي مكان."); return true; }
    }catch(_){}
    bad(); return false;
  }
}
/* ---------- 🖼 كروت مشاركة الاقتباسات: صورة مربعة بهوية كُتُبِي الذهبية ---------- */
function renderQuoteCard(book, quote){
  const W = 1080, cv = document.createElement("canvas"); cv.width = W; cv.height = W;
  const x = cv.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, W);
  g.addColorStop(0, "#241806"); g.addColorStop(0.55, "#1a1108"); g.addColorStop(1, "#0f0a04");
  x.fillStyle = g; x.fillRect(0, 0, W, W);
  /* إطار دهبي مزدوج */
  x.strokeStyle = "#c47b2a"; x.lineWidth = 6; x.strokeRect(36, 36, W-72, W-72);
  x.strokeStyle = "rgba(196,123,42,.35)"; x.lineWidth = 2; x.strokeRect(56, 56, W-112, W-112);
  /* علامة اقتباس زخرفية */
  x.fillStyle = "rgba(196,123,42,.28)"; x.font = "bold 220px Georgia,serif"; x.textAlign = "center"; x.direction = "rtl";
  x.fillText("❝", W/2, 300);
  /* لف النص على سطور حسب العرض */
  const wrap = (text, maxW)=>{
    const words = String(text||"").split(/\s+/).filter(Boolean); const lines = []; let cur = "";
    words.forEach(wd=>{ const t = cur ? cur + " " + wd : wd; if(x.measureText(t).width > maxW && cur){ lines.push(cur); cur = wd; } else cur = t; });
    if(cur) lines.push(cur);
    return lines;
  };
  let size = 52, lines = [];
  for(let tries = 0; tries < 6; tries++){
    x.font = "bold " + size + "px Tajawal,'Segoe UI',Tahoma,Arial,sans-serif";
    lines = wrap(quote, W - 240);
    if(lines.length * (size * 1.55) <= 520 || size <= 28) break;
    size -= 6;
  }
  const lh = size * 1.55; let y = 420 - ((lines.length - 1) * lh) / 2;
  x.fillStyle = "#f5e8d5";
  lines.forEach(l=>{ x.fillText(l, W/2, y); y += lh; });
  /* اسم الكتاب */
  x.font = "600 36px Tajawal,'Segoe UI',Tahoma,Arial,sans-serif"; x.fillStyle = "#c47b2a";
  const ttl = "— من كتاب «" + String(book.title||"").slice(0, 60) + "»";
  x.fillText(ttl, W/2, Math.min(y + 30, 900));
  /* توقيع العلامة */
  x.font = "bold 34px Tajawal,'Segoe UI',Tahoma,Arial,sans-serif"; x.fillStyle = "#8a6a3a";
  x.fillText("كُتُبِي 📖 Don Eslam", W/2, 980);
  return new Promise(res=>cv.toBlob(res, "image/png"));
}
async function shareQuoteImage(book, quote, msgEl){
  try{
    const blob = await renderQuoteCard(book, quote);
    if(!blob) throw new Error("no blob");
    const file = new File([blob], "kutubi-quote.png", {type:"image/png"});
    if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file], title:"اقتباس من «" + book.title + "»"}); return true; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "kutubi-quote-" + Date.now() + ".png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
    if(msgEl){ msgEl.textContent = "اتحفظ كارت الاقتباس كصورة ✔"; msgEl.classList.remove("err"); }
    return true;
  }catch(e){
    if(e && e.name === "AbortError") return false; /* المستخدم لغى المشاركة */
    return shareQuote(book, quote, msgEl); /* رجوع للنسخ النصي */
  }
}

function buildHlEditor(book, i, sec){
  const wrap = document.createElement("div"); wrap.className = "hl-editor hidden"; wrap.dataset.role = "hledit";
  wrap.innerHTML =
    '<p class="hint">حدّد (ظلّل) أي كلام جوه نص الجزء ده بالماوس أو اللمس، وبعدين اختار لون ودوس حفظ.</p>' +
    '<div class="row wrap">' +
      '<button type="button" class="hl-color active" data-color="yellow">🟨 أصفر</button>' +
      '<button type="button" class="hl-color" data-color="green">🟩 أخضر</button>' +
      '<button type="button" class="hl-color" data-color="pink">🩷 وردي</button>' +
    '</div>' +
    '<input type="text" class="hl-note" placeholder="اكتب ملحوظة على التظليل ده (اختياري)">' +
    '<div class="row wrap">' +
      '<button type="button" class="primary hl-save">💾 احفظ التظليل</button>' +
      '<button type="button" class="ghost hl-share">📤 مشاركة كاقتباس</button>' +
      '<button type="button" class="ghost hl-cancel">إلغاء</button>' +
    '</div>' +
    '<p class="msg hl-msg"></p>';
  let color = "yellow";
  $$(".hl-color", wrap).forEach(b=>b.addEventListener("click", ()=>{ color = b.dataset.color; $$(".hl-color", wrap).forEach(x=>x.classList.toggle("active", x === b)); }));
  const msg = $(".hl-msg", wrap);
  const getQuote = ()=>{
    let txt = "";
    const sel = window.getSelection ? window.getSelection() : null;
    if(sel && sel.rangeCount && !sel.isCollapsed){
      const node = sel.anchorNode, el = node && (node.nodeType === 1 ? node : node.parentElement);
      if(el && el.closest && el.closest(".chunk") === sec && sec.contains(sel.focusNode)) txt = sel.toString();
    }
    if(!txt && lastChunkSel.idx === i) txt = lastChunkSel.text;
    return (txt || "").trim();
  };
  $(".hl-cancel", wrap).addEventListener("click", ()=>wrap.classList.add("hidden"));
  $(".hl-share", wrap).addEventListener("click", ()=>{
    const q = getQuote().slice(0, 300);
    if(!q){ msg.textContent = "حدّد نص الأول وبعدين شاركه."; msg.classList.add("err"); return; }
    shareQuote(book, q, msg);
  });
  $(".hl-save", wrap).addEventListener("click", async ()=>{
    let q = getQuote();
    if(!q){ msg.textContent = "لسه محددتش نص — ظلّل كلام جوه الجزء ده الأول."; msg.classList.add("err"); return; }
    if(q.length > 300) q = q.slice(0, 300);
    const ch = book.chunks[i];
    if((ch.orig || "").indexOf(q) < 0 && (ch.trans || "").indexOf(q) < 0){ msg.textContent = "التحديد لازم يكون من نص الجزء ده بالظبط."; msg.classList.add("err"); return; }
    ensureBookExtras(book);
    const beforeAnns = book.annotations.slice();
    book.annotations.push({id:uid(), chunk:i, quote:q, color:color, note:$(".hl-note", wrap).value.trim(), ts:Date.now()});
    try{ await idbPut(book); }
    catch(e){ book.annotations = beforeAnns; logError("حفظ", e); msg.textContent = "الحفظ على الجهاز فشل — التظليل متسجلش، جرّب تاني."; msg.classList.add("err"); return; }
    fillChunk(book, i);
    renderIndexPanel();
  });
  return wrap;
}

/* ---------- فهرس الأجزاء والبحث جوه الكتاب ---------- */
let indexMarksOnly = false;
function jumpToChunk(i){
  const b = currentBook();
  if(b) ensureChunksRendered(b, i); /* جزء لسه مترسمش: بنرسم لحدّه الأول وبعدين ننزل عليه */
  const el = document.getElementById("chunk-" + i); if(!el) return;
  el.scrollIntoView({block:"start"});
  el.classList.add("flash"); setTimeout(()=>el.classList.remove("flash"), 1600);
}
function renderIndexPanel(){
  const book = currentBook(); const list = $("#indexList"); if(!list) return;
  if(!book){ list.innerHTML = '<p class="hint">افتح كتاب الأول.</p>'; const ia = $("#indexAnnotations"); if(ia) ia.innerHTML = ""; return; }
  ensureBookExtras(book);
  const q = ($("#bookSearch").value || "").trim().toLowerCase();
  list.innerHTML = "";
  let shown = 0;
  book.chunks.forEach((ch, i)=>{
    const marked = book.bookmarks.includes(i);
    if(indexMarksOnly && !marked) return;
    let preview = "";
    if(q){
      const src = (ch.trans && ch.trans.toLowerCase().indexOf(q) >= 0) ? ch.trans : ch.orig;
      const sp = (src || "").toLowerCase().indexOf(q);
      if(sp < 0) return;
      preview = "…" + src.slice(Math.max(0, sp - 30), sp + q.length + 40).replace(/\s+/g, " ") + "…";
    } else {
      preview = (ch.trans || ch.orig || "").replace(/\s+/g, " ").slice(0, 70);
    }
    shown++;
    const item = document.createElement("button"); item.type = "button"; item.className = "index-item";
    item.innerHTML = '<span class="idx-title">الجزء ' + (i + 1) + (marked ? " 🔖" : "") + ' <span class="badge' + (ch.status === "done" ? " done" : "") + '">' + (ch.status === "done" ? "✔ اتترجم" : "لسه") + '</span></span><span class="idx-prev">' + esc(preview) + "</span>";
    item.addEventListener("click", ()=>jumpToChunk(i));
    list.appendChild(item);
  });
  if(!shown){ const p = document.createElement("p"); p.className = "hint"; p.textContent = q ? "مفيش نتايج للبحث ده في الكتاب." : "مفيش أجزاء مطابقة."; list.appendChild(p); }
  renderBookAnnotations(book);
}
function renderBookAnnotations(book){
  const box = $("#indexAnnotations"); if(!box) return;
  box.innerHTML = "";
  const anns = (book.annotations || []).slice().sort((a, b)=>(a.chunk - b.chunk) || (a.ts - b.ts));
  if(!anns.length){ box.innerHTML = '<p class="hint">لسه معندكش تظليلات. افتح أي جزء ودوس «🖍 ظلّل».</p>'; return; }
  anns.forEach(a=>{
    const found = annotationFound(book, a);
    const item = document.createElement("button"); item.type = "button"; item.className = "index-item";
    item.innerHTML = '<span class="idx-title"><span class="hl-dot hl-' + esc(a.color || "yellow") + '"></span>الجزء ' + (a.chunk + 1) + (found ? "" : ' <span class="badge fail">(النص اتغيّر)</span>') + '</span><span class="idx-prev">' + esc(a.quote) + "</span>" + (a.note ? '<span class="idx-note">📝 ' + esc(a.note) + "</span>" : "");
    item.addEventListener("click", ()=>jumpToChunk(a.chunk));
    box.appendChild(item);
  });
}

/* ---------- تقسيم النص لأجزاء بنفس الترتيب (~1200 حرف) ---------- */
function splitChunks(text){
  const paras = String(text||"").replace(/\r\n/g,"\n").split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);
  const chunks=[]; let buf="";
  const push=()=>{ if(buf.trim()) chunks.push(buf.trim()); buf=""; };
  for(const p of paras){
    if(p.length>1200){
      if(buf) push();
      const sents = p.match(/[^.!?…]+[.!?…]+["']?|\S[^.!?…]*$/g) || [p];
      let b="";
      for(const s of sents){
        if(s.length>1200){ if(b){chunks.push(b); b="";} for(let i=0;i<s.length;i+=1200) chunks.push(s.slice(i,i+1200)); continue; }
        if((b+" "+s).length>1200){ chunks.push(b.trim()); b=s; } else b=(b?b+" ":"")+s;
      }
      if(b.trim()) chunks.push(b.trim());
      continue;
    }
    if((buf+"\n\n"+p).length>1200) push();
    buf = buf ? buf+"\n\n"+p : p;
  }
  push();
  return chunks.map(t=>({orig:t, trans:"", status:"pending", glossary:[], keyPoints:[], explanation:"", explTone:""}));
}

/* ---------- تقسيم النصوص الطويلة لطلبات الـ API ----------
   أي نص أطول من الحد بيتم تقسيمه عند حدود فقرات/جُمل ونتايجه بتتجمّع بنفس الترتيب —
   عشان جزء ضخم واحد ميكسرش نافذة سياق الموديل ولا يرجع ردّ مقطوع. دالة نقية */
const API_CHUNK_MAX = 6000;
function splitForApi(text, max){
  max = max || API_CHUNK_MAX;
  const s = String(text || "");
  if(s.length <= max) return [s];
  const pieces = []; let buf = "";
  const pushBuf = ()=>{ if(buf){ pieces.push(buf); buf = ""; } };
  for(const p of s.split(/\n\s*\n/)){
    if(p.length > max){
      pushBuf();
      const sents = p.match(/[^.!?…。！？]+[.!?…。！？]+["'»”’)]*\s*|\S[^.!?…。！？]*$/g) || [p];
      let b = "";
      for(const sent of sents){
        if(sent.length > max){ if(b){ pieces.push(b); b = ""; } for(let i = 0; i < sent.length; i += max) pieces.push(sent.slice(i, i + max)); continue; }
        if((b + sent).length > max){ pieces.push(b); b = sent; } else b += sent;
      }
      if(b) pieces.push(b);
      continue;
    }
    if(buf && (buf + "\n\n" + p).length > max) pushBuf();
    buf = buf ? buf + "\n\n" + p : p;
  }
  pushBuf();
  return pieces.length ? pieces : [s];
}

/* ---------- محرك الترجمة ---------- */
/* خطأ إجهاض موحّد: أي إيقاف مقصود من المستخدم بيترمي بالشكل ده عشان حلقات التشغيل تفرّقه عن الخطأ الحقيقي */
function abortError(){ const e = new Error("اتوقفت"); e.name = "AbortError"; return e; }
/* بيجمع إشارة إيقاف خارجية (زرار الإيقاف) + مهلة زمنية في إشارة واحدة لأي طلب شبكة:
   الإيقاف الخارجي بيقطع الطلب فورًا، والمهلة بتفشل الطلب المعلّق نضيف بدل ما يعلّق التشغيل كله */
function timedSignal(signal, ms){
  if(typeof AbortController === "undefined") return {signal: signal, timedOut: ()=>false, cleanup: ()=>{}};
  const ctl = new AbortController();
  let timedOut = false, onAbort = null;
  if(signal){
    if(signal.aborted) ctl.abort();
    else { onAbort = ()=>ctl.abort(); signal.addEventListener("abort", onAbort); }
  }
  const to = setTimeout(()=>{ timedOut = true; ctl.abort(); }, ms);
  return { signal: ctl.signal, timedOut: ()=>timedOut,
    cleanup: ()=>{ clearTimeout(to); if(signal && onAbort) signal.removeEventListener("abort", onAbort); } };
}
/* نوم بيحترم الإيقاف: الانتظار بين المحاولات بيتلغي فورًا مع زرار الإيقاف */
function sleepWithAbort(ms, signal){
  return new Promise((res, rej)=>{
    if(signal && signal.aborted){ rej(abortError()); return; }
    let onAbort = null;
    const to = setTimeout(()=>{ if(signal && onAbort) signal.removeEventListener("abort", onAbort); res(); }, ms);
    if(signal){ onAbort = ()=>{ clearTimeout(to); rej(abortError()); }; signal.addEventListener("abort", onAbort); }
  });
}
const AI_TIMEOUT_MS = 90000;
/* طلب واحد فعلي لخدمة المحادثة: بيرجّع نص المحتوى + سبب الإنهاء.
   بنقرا message.content بس — reasoning_content (تفكير الموديلات الاستدلالية زي MiniMax M3) بيتم تجاهله تمامًا ومبيتخزّنش أبدًا كترجمة */
async function aiChatOnce(system, user, temp, signal, opts){
  opts = opts || {};
  const base = String(opts.base || settings.base || DEFSET.base).replace(/\/+$/,"");
  const key = (opts.key != null ? String(opts.key) : (settings.key || "")).trim();
  const model = opts.model || settings.model || DEFSET.model;
  const maxTokens = opts.maxTokens || 2048;
  const ts = timedSignal(signal, opts.timeoutMs || AI_TIMEOUT_MS);
  try{
    const r = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: key ? {"Content-Type":"application/json", "Authorization":"Bearer " + key} : {"Content-Type":"application/json"},
      signal: ts.signal,
      body: JSON.stringify({model: model, temperature: temp == null ? 0.3 : temp, max_tokens: maxTokens,
        messages: [{role:"system", content:system}, {role:"user", content:user}]})
    });
    if(!r.ok){
      const snip = await providerErrSnippet(r);
      /* تلميح عملي لحالة «الموديل مش معروف عند الخدمة» (404 No matching target server) — أكتر سبب واقعي لوقف الترجمة */
      const hint = (r.status === 404 && snip && snip.indexOf("No matching target server") >= 0)
        ? " — اسم الموديل مش معروف عند الخدمة؛ افتح الإعدادات ودوس «هات الموديلات المتاحة» واختار الموديل بالظبط" : "";
      const err = new Error("خدمة الترجمة ردّت بخطأ " + r.status + (snip ? ": " + snip : "") + hint);
      err.httpStatus = r.status;
      throw err;
    }
    const j = await r.json();
    const ch0 = (j && j.choices && j.choices[0]) || null;
    const msg = (ch0 && ch0.message) || {};
    let content = msg.content;
    if(Array.isArray(content)) content = content.map(p=>(p && typeof p === "object") ? (p.text || "") : String(p == null ? "" : p)).join("");
    return { text: content == null ? "" : String(content), finishReason: (ch0 && ch0.finish_reason) || "" };
  }catch(e){
    if(ts.timedOut()){
      const err = new Error("طلب الذكاء الاصطناعي أخد وقت أطول من اللازم (مهلة " + Math.round((opts.timeoutMs || AI_TIMEOUT_MS) / 1000) + " ثانية) — الخدمة بطيئة دلوقتي، جرّب تاني");
      err.aiTimeout = true;
      throw err;
    }
    if((signal && signal.aborted) || (e && e.name === "AbortError")) throw abortError();
    throw e;
  } finally { ts.cleanup(); }
}
/* نقطة دخول كل نداءات الذكاء الاصطناعي:
   - إعادة محاولة لحد مرتين (بانتظار ٢ ثم ٥ ثواني بيحترم الإيقاف) على 429 و5xx وانقطاع الشبكة والمهلة — أخطاء 4xx التانية بتفشل فورًا برسالة المزوّد
   - ردّ فاضي أو مقطوع (finish_reason=length — بيحصل مع الموديلات الاستدلالية لما التفكير الداخلي ياكل ميزانية التوكنز):
     محاولة واحدة بميزانية توكنز مضاعفة، ولو الرد فضل فاضي بيتقال السبب بوضوح بدل ما يتخزّن فراغ أو كلام التفكير كترجمة */
async function aiChat(system, user, temp, signal, opts){
  opts = opts || {};
  const maxTokens = opts.maxTokens || 2048;
  let lastErr = null;
  for(let attempt = 0; attempt < 3; attempt++){
    if(attempt > 0) await sleepWithAbort(attempt === 1 ? 2000 : 5000, signal);
    try{
      let out = await aiChatOnce(system, user, temp, signal, Object.assign({}, opts, {maxTokens: maxTokens}));
      if(!out.text.trim() || out.finishReason === "length"){
        const bigger = Math.min(16384, Math.max(maxTokens * 2, 8192));
        if(bigger > maxTokens){
          const out2 = await aiChatOnce(system, user, temp, signal, Object.assign({}, opts, {maxTokens: bigger}));
          if(out2.text.trim()) out = out2;
        }
        if(!out.text.trim()){
          const err = new Error("الخدمة رجّعت ردّ فاضي — غالبًا الموديل استهلك ميزانية الرد في التفكير الداخلي. جرّب تاني، ولو اتكرّرت غيّر الموديل من الإعدادات المتقدمة.");
          err.aiEmpty = true;
          throw err;
        }
      }
      return out.text;
    }catch(e){
      if(e && e.name === "AbortError") throw e;
      lastErr = e;
      const st = e && e.httpStatus;
      const retryable = !!(e && (e.aiTimeout || st === 429 || (typeof st === "number" && st >= 500) || e instanceof TypeError));
      if(!retryable || attempt === 2) throw e;
    }
  }
  throw lastErr;
}
function parseJSONLoose(s){
  try{
    const a=s.indexOf("{"), b=s.lastIndexOf("}");
    if(a>=0 && b>a) return JSON.parse(s.slice(a,b+1));
    return JSON.parse(s);
  }catch(e){ return null; }
}
/* ---------- لغات الترجمة المستهدفة (بلهجة وإملاء بلدها) ---------- */
const TARGET_LANGS = [
 {code:'orig', label:'📄 النص الأصلي كما نزل (من غير ترجمة)', mm:'', name:'the original text as downloaded'},
 {code:'ar-EG', label:'العربية — بالمصري', mm:'ar', name:'Egyptian Arabic'},
 {code:'en-US', label:'English — أمريكي (US)', mm:'en', name:'American English (US spelling and idioms)'},
 {code:'en-GB', label:'English — بريطاني (UK)', mm:'en', name:'British English (UK spelling and idioms)'},
 {code:'id-ID', label:'Bahasa Indonesia — إندونيسيا', mm:'id', name:'Indonesian (Bahasa Indonesia)'},
 {code:'ms-MY', label:'Bahasa Melayu — ماليزيا', mm:'ms', name:'Malay as used in Malaysia (Bahasa Melayu)'},
 {code:'cs-CZ', label:'Čeština — التشيك', mm:'cs', name:'Czech as used in Czechia'},
 {code:'da-DK', label:'Dansk — الدنمارك', mm:'da', name:'Danish as used in Denmark'},
 {code:'de-DE', label:'Deutsch — ألمانيا', mm:'de', name:'German'},
 {code:'es-ES', label:'Español — إسبانيا', mm:'es', name:'Spanish as used in Spain'},
 {code:'es-419', label:'Español — أمريكا اللاتينية', mm:'es', name:'Latin American Spanish'},
 {code:'fr-FR', label:'Français — فرنسا', mm:'fr', name:'French as used in France'},
 {code:'it-IT', label:'Italiano — إيطاليا', mm:'it', name:'Italian'},
 {code:'hu-HU', label:'Magyar — المجر', mm:'hu', name:'Hungarian as used in Hungary'},
 {code:'nl-NL', label:'Nederlands — هولندا', mm:'nl', name:'Dutch as used in the Netherlands'},
 {code:'nb-NO', label:'Norsk — النرويج', mm:'no', name:'Norwegian Bokmål as used in Norway'},
 {code:'pl-PL', label:'Polski — بولندا', mm:'pl', name:'Polish as used in Poland'},
 {code:'pt-BR', label:'Português — البرازيل', mm:'pt', name:'Brazilian Portuguese'},
 {code:'ro-RO', label:'Română — رومانيا', mm:'ro', name:'Romanian as used in Romania'},
 {code:'fi-FI', label:'Suomi — فنلندا', mm:'fi', name:'Finnish as used in Finland'},
 {code:'sv-SE', label:'Svenska — السويد', mm:'sv', name:'Swedish as used in Sweden'},
 {code:'vi-VN', label:'Tiếng Việt — فيتنام', mm:'vi', name:'Vietnamese as used in Vietnam'},
 {code:'tr-TR', label:'Türkçe — تركيا', mm:'tr', name:'Turkish'},
 {code:'el-GR', label:'Ελληνικά — اليونان', mm:'el', name:'Greek as used in Greece'},
 {code:'ru-RU', label:'Русский — روسيا', mm:'ru', name:'Russian'},
 {code:'uk-UA', label:'Українська — أوكرانيا', mm:'uk', name:'Ukrainian as used in Ukraine'},
 {code:'hi-IN', label:'हिन्दी — الهند', mm:'hi', name:'Hindi as used in India (Devanagari script)'},
 {code:'bn-BD', label:'বাংলা — بنغلاديش', mm:'bn', name:'Bengali as used in Bangladesh'},
 {code:'ta-IN', label:'தமிழ் — الهند (تاميل)', mm:'ta', name:'Tamil as used in India'},
 {code:'th-TH', label:'ไทย — تايلاند', mm:'th', name:'Thai as used in Thailand'},
 {code:'zh-CN', label:'中文 — الصينية المبسطة', mm:'zh-CN', name:'Simplified Chinese'},
 {code:'ja-JP', label:'日本語 — اليابان', mm:'ja', name:'Japanese'},
 {code:'ko-KR', label:'한국어 — كوريا', mm:'ko', name:'Korean'},
 {code:'ur-PK', label:'اردو — باكستان', mm:'ur', name:'Urdu as used in Pakistan'},
 {code:'fa-IR', label:'فارسی — إيران', mm:'fa', name:'Persian (Farsi) as used in Iran'}];
/* لغات بتتكتب من اليمين لليسار — ترجماتها متبقاش LTR أبدًا */
const RTL_LANGS = ["ar-EG","ur-PK","fa-IR"];
/* تنقية لغة الهدف: أي كود مش موجود في القايمة الحالية (لغة اتشالت أو قيمة قديمة) بيرجع للمصري —
   عشان كتاب أو إعدادات محفوظة بلغة مبقتش موجودة متخربش التطبيق ولا تفضي القايمة */
function sanitizeTargetLang(code){ return TARGET_LANGS.some(t=>t.code===code) ? code : "ar-EG"; }
function targetLangEntry(code){ return TARGET_LANGS.find(t=>t.code===code) || TARGET_LANGS.find(t=>t.code==="ar-EG"); }
function bookTargetLang(book){ return sanitizeTargetLang((book && book.targetLang) || settings.targetLang || "ar-EG"); }
/* أسلوب الترجمة (للهدف العربي بس — الأهداف الأجنبية بيحكمها برومبت لغتها ومبتتأثرش بيه):
   «fusha» فصحى سليمة زي ترجمة المتصفحات وهي الافتراضي، و«egyptian» باللهجة المصرية كميزة اختيارية.
   كتاب من غير tStyle بياخد أسلوب الإعدادات العام، والأسلوب بيأثّر على تشغيلات الترجمة الجديدة بس —
   الترجمات المحفوظة قبل كده مبتتلمسش ولا بتتفقد صلاحيتها */
function sanitizeTStyle(s){ return s === "egyptian" ? "egyptian" : "fusha"; }
function bookTStyle(book){ return sanitizeTStyle((book && book.tStyle) || settings.tStyle); }
function foreignTransSys(code){
  const e = targetLangEntry(code);
  return "You are a professional native translator. Translate the following text into " + e.name + ", exactly as a skilled native speaker of that country/region writes: correct local spelling conventions, natural local idioms and phrasing, faithful to the source in meaning, order and context. Do not add explanations, comments or extra content. Output only the translation.";
}
/* includeOrig === false: قايمة من غير اختيار «النص الأصلي» (المترجم السريع محتاج لغة ترجمة حقيقية دايمًا) */
function fillTargetSelect(sel, val, includeOrig){
  if(!sel) return;
  const list = TARGET_LANGS.filter(t=>includeOrig === false ? t.code !== "orig" : true);
  sel.innerHTML = list.map(t=>'<option value="' + esc(t.code) + '">' + esc(t.label) + "</option>").join("");
  sel.value = list.some(t=>t.code === val) ? val : "ar-EG";
}
function transSpeakItem(book, text){
  const c = bookTargetLang(book);
  if(c === "ar-EG") return {text:text, lang:"ar"};
  return {text:text, lang:c.split("-")[0], langFull:c};
}
/* كشف لغة نص سريع للنطق: عربي لو فيه حروف عربية، غير كده إنجليزي (أغلب مصادر الكتب) */
function detectTextLang(text){ return /[\u0600-\u06FF]/.test(String(text||"")) ? "ar" : "en"; }
function origSpeakItem(book, text){ const l=detectTextLang(text); return {text:text, lang:l}; }
const TRANS_SYS = "انت مترجم كتب محترف بيترجم للعربية باللهجة المصرية البسيطة اليومية. استخدم كلام المصريين الطبيعي (زي، علشان، كده، دلوقتي، أوي، ومش) وابتعد تمامًا عن الفصحى الثقيلة والألفاظ الصعبة والتراكيب المعقدة، من غير ما تضعّف المعنى أو تحذف أي مفهوم. والتزم بالوفاء التام للأصل: نفس المعنى والترتيب والسياق بالظبط.";
/* أسلوب الفصحى: عربي سليم حديث بجودة ترجمات المتصفحات — حجر الأساس والافتراضي، من غير أي عامية */
const TRANS_SYS_FUSHA = "انت مترجم كتب محترف يترجم إلى العربية الفصحى الحديثة السليمة. استخدم عربية صحيحة واضحة خالية تمامًا من العامية واللهجات المحلية، بجودة ترجمات المتصفحات الاحترافية وبأسلوب رصين سهل الفهم، والتزم بالوفاء التام للأصل: نفس المعنى والترتيب والسياق بالضبط.";
/* برومبت الترجمة للعربي حسب الأسلوب: عقد الإخراج (translation/glossary/keyPoints) واحد في الأسلوبين،
   وشرح القاموس وأهم النقط بيفضلوا وسائل تعلّم بالمصري في الحالتين.
   فرع «egyptian» هو البرومبت الأصلي بالنص الحرفي من غير أي تغيير، وفرع «fusha» نظيره بالفصحى */
function arTransPrompt(text, style){
  if(sanitizeTStyle(style) === "egyptian"){
    return { sys: TRANS_SYS, user: "ترجم النص التالي ترجمة وفية باللهجة المصرية البسيطة اليومية — كلام سهل يفهمه أي قارئ، شيّق لكن قوي: نفس المعنى والترتيب والسياق بالظبط، من غير أي إضافة أو شرح أو تأليف جوه الترجمة نفسها. المصطلحات التقنية والإنجليزية المهمة سيبها بالإنجليزية جنب ترجمتها العربية أول مرة تظهر.\n"+
    "رجّع JSON بس (من غير أي كلام برّه) بالشكل ده:\n{\"translation\":\"نص الترجمة بس\",\"glossary\":[{\"english\":\"المصطلح بالإنجليزية\",\"arabic\":\"ترجمته العربية\",\"explanation\":\"شرحه ببساطة بالمصري\"}],\"keyPoints\":[\"أهم نقطة بالمصري\"]}\n\nالنص:\n"+text };
  }
  return { sys: TRANS_SYS_FUSHA, user: "ترجم النص التالي ترجمة وفية بالعربية الفصحى الحديثة السليمة — عربية صحيحة واضحة بجودة ترجمات المتصفحات الاحترافية: نفس المعنى والترتيب والسياق بالضبط، دون أي إضافة أو شرح أو تأليف داخل الترجمة نفسها، ودون أي كلمات عامية أو لهجات محلية. المصطلحات التقنية والإنجليزية المهمة أبقِها بالإنجليزية ويليها بين قوسين مقابلها العربي عند أول ظهور لها، على هذا النحو: Term (المقابل العربي).\n"+
  "أعد JSON فقط (دون أي كلام خارجه) بالشكل التالي:\n{\"translation\":\"نص الترجمة فقط\",\"glossary\":[{\"english\":\"المصطلح بالإنجليزية\",\"arabic\":\"ترجمته العربية\",\"explanation\":\"شرحه ببساطة بالمصري\"}],\"keyPoints\":[\"أهم نقطة بالمصري\"]}\n\nالنص:\n"+text };
}
async function translateChunkAI(text, code, signal, style){
  code = code || "ar-EG";
  if(code !== "ar-EG"){
    /* لغة أجنبية: ترجمة أصلية بلهجة وإملاء بلدها — والقاموس والنقط بيفضلوا وسائل تعلّم بالمصري */
    const e = targetLangEntry(code);
    const fuser = "Translate the following text into " + e.name + ", faithfully: exactly the same meaning, order and context, with correct local spelling and natural local idioms.\n"+
    "Return ONLY JSON (no text outside it) in this shape:\n{\"translation\":\"the translation only, in " + e.name + "\",\"glossary\":[{\"english\":\"an important term from the source text\",\"arabic\":\"ترجمته العربية\",\"explanation\":\"شرحه ببساطة باللهجة المصرية\"}],\"keyPoints\":[\"أهم نقطة بالمصري\"]}\n"+
    "The glossary and keyPoints are learning aids for an Egyptian Arabic speaker, so keep them in Egyptian Arabic as shown; the translation itself is only in " + e.name + ".\n\nText:\n"+text;
    const fraw = await aiChat(foreignTransSys(code), fuser, 0.3, signal, {maxTokens: 4096});
    const fj = parseJSONLoose(fraw);
    if(fj && fj.translation) return {translation:String(fj.translation), glossary:Array.isArray(fj.glossary)?fj.glossary:[], keyPoints:Array.isArray(fj.keyPoints)?fj.keyPoints:[]};
    if(/^\s*\{/.test(fraw)) throw new Error("الخدمة رجّعت ردّ مش سليم (JSON مقطوع أو بايظ) — الجزء متسجلش، دوس «إعادة» عليه");
    return {translation: fraw.trim(), glossary:[], keyPoints:[]};
  }
  const pr = arTransPrompt(text, style); /* الأسلوب بيتحسم من الكتاب (أو المترجم السريع) — الفصحى هي الافتراضي */
  const raw = await aiChat(pr.sys, pr.user, 0.3, signal, {maxTokens: 4096});
  const j = parseJSONLoose(raw);
  if(j && j.translation) return {translation:String(j.translation), glossary:Array.isArray(j.glossary)?j.glossary:[], keyPoints:Array.isArray(j.keyPoints)?j.keyPoints:[]};
  if(/^\s*\{/.test(raw)) throw new Error("الخدمة رجّعت ردّ مش سليم (JSON مقطوع أو بايظ) — الجزء متسجلش، دوس «إعادة» عليه");
  return {translation: raw.trim(), glossary:[], keyPoints:[]};
}
async function myMemory(text, code, signal){
  // MyMemory ليها حد ~500 حرف للطلب، فبنقسم على جُمل — والمصدر كشف تلقائي دايمًا (autodetect)
  // عشان كتاب فرنساوي أو ألماني في الوضع الأساسي ميترجمش على إنه إنجليزي فيطلع كلام بايظ
  const mmCode = targetLangEntry(code || "ar-EG").mm || "ar";
  const pair = encodeURIComponent("autodetect|" + mmCode);
  const parts = String(text).match(/[^.!?…]+[.!?…]+["']?|[\s\S]{1,450}/g) || [text];
  /* أي قطعة أطول من حد الطلب (جملة طويلة) بتتقسم على حدود مسافات — قبل كده ذيلها كان بيُقصّ ويضيع من الترجمة */
  const reqPieces = [];
  for(const p of parts){
    if(p.length <= 450){ reqPieces.push(p); continue; }
    let rest = p;
    while(rest.length > 450){
      let cut = rest.lastIndexOf(" ", 450);
      if(cut < 200) cut = 450;
      reqPieces.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if(rest) reqPieces.push(rest);
  }
  const out=[];
  for(const q of reqPieces){
    if(signal && signal.aborted) throw abortError();
    const r = await fetch("https://api.mymemory.translated.net/get?q="+encodeURIComponent(q)+"&langpair="+pair, {signal: signal});
    if(!r.ok) throw new Error("MyMemory خطأ "+r.status);
    const j = await r.json();
    if(j && j.responseStatus && String(j.responseStatus) !== "200") throw new Error("MyMemory خطأ " + j.responseStatus + (j.responseDetails ? ": " + sanitizeErrText(j.responseDetails) : ""));
    const t = j && j.responseData && j.responseData.translatedText;
    if(!t) throw new Error("MyMemory ردّت من غير ترجمة");
    out.push(t);
  }
  return out.join(" ");
}
async function translateChunkAny(text, code, signal, style){
  code = code || "ar-EG";
  /* جزء أطول من حد الـ API الآمن: بيتقسم عند حدود فقرات/جُمل وترجمات القطع بتتجمّع بنفس الترتيب —
     وقواميس القطع وأهم نقطها بتندمج، وعلامة «أساسية» بتتلطخ لو أي قطعة اترجمت آليًا */
  if(String(text || "").length > API_CHUNK_MAX){
    const parts = [], gloss = [], pts = [];
    let basic = false;
    for(const piece of splitForApi(text, API_CHUNK_MAX)){
      if(signal && signal.aborted) throw abortError();
      const r = await translateChunkAny(piece, code, signal, style);
      parts.push(r.translation);
      (r.glossary || []).forEach(g=>gloss.push(g));
      (r.keyPoints || []).forEach(p=>pts.push(p));
      basic = basic || !!r.basic;
    }
    return {translation: parts.join("\n\n"), glossary: gloss, keyPoints: pts, basic: basic};
  }
  if(hasKey()) return translateChunkAI(text, code, signal, style);
  const t = await myMemory(text, code, signal);
  return {translation:t, glossary:[], keyPoints:[], basic:true};
}

/* ---------- الترجمة (يدوية بس: بتبدأ من زرار «ترجم» صراحة — فتح الكتاب قراءة بس) ---------- */
function progressOf(book){ const d=book.chunks.filter(c=>c.status==="done").length; return {done:d,total:book.chunks.length,pct:book.chunks.length?Math.round(d/book.chunks.length*100):0}; }
const TRANS_STOP_MSG = "⏸ اتوقفت الترجمة — تقدر تكمل من زرار ترجم في أي وقت";
/* بدء الترجمة اليدوي: الطريق الوحيد لبدء أي ترجمة — بيستخدمه زرار القارئ «ترجم» وزرار «ترجم» في كروت المكتبة وملفاتي.
   كتاب عربي هدفه المصري بيطلب تأكيد الأول، والبدء نفسه بيعدي على translateBook (نقطة تفعيل زرار الإيقاف) */
function startTranslateForBook(book){
  if(!book) return false;
  if(isBookLocked(book)) return false;
  if(bookTargetLang(book)==="orig"){ setTransStatus("الوضع الحالي: عرض النص الأصلي بس من غير ترجمة — غيّر اللغة لو عاوز ترجمة"); return false; }
  if(isArabicBook(book) && bookTargetLang(book)==="ar-EG" && !confirm("الكتاب ده عربي أصلًا — ترجمته غالبًا هتطلع كلام مكرر أو مش مفهوم. أكمل برضه؟")) return false;
  const remaining = book.chunks.filter(c=>c.status!=="done").length;
  if(needsRunConfirm(remaining) && !confirm(runConfirmText("يترجم", remaining))) return false;
  translateBook(book);
  return true;
}
async function translateBook(book){
  if(translating) return;
  if(repairing){ setTransStatus("فيه إصلاح شغال دلوقتي — وقّفه أو استنى يخلص الأول"); return; }
  if(explaining){ setTransStatus("فيه شرح شغال دلوقتي — وقّفه أو استنى يخلص الأول"); return; }
  if(isBookLocked(book)) return; /* الكتب المقفولة مابتترجمش */
  if(bookTargetLang(book)==="orig"){ setTransStatus("الوضع الحالي: عرض النص الأصلي بس من غير ترجمة — غيّر اللغة لو عاوز ترجمة"); return; } /* وضع النص الأصلي: الترجمة مش بتشتغل أبدًا */
  translating = true; stopFlag=false;
  transRun = makeRunControl();
  setStopBtn(true); /* تفعيل فوري لزرار الإيقاف عند بدء الترجمة — تلقائيًا في كل مرة، من غير انتظار أي إعادة رسم */
  renderReaderControls(book);
  try{
    for(let i=0;i<book.chunks.length;i++){
      if(stopFlag || transRun.stopped) { setTransStatus(TRANS_STOP_MSG); break; }
      const ch = book.chunks[i];
      if(ch.status==="done") continue;
      ch.status="working"; renderChunk(book,i); setTransStatus("بيترجم الجزء "+(i+1)+" من "+book.chunks.length+"…");
      try{
        const res = await translateChunkAny(ch.orig, bookTargetLang(book), transRun.signal, bookTStyle(book));
        if(stopFlag || transRun.stopped){ /* الطلب خلص في نفس لحظة الإيقاف: منسجلش النتيجة، الجزء يفضل مش مترجم */
          ch.status="pending"; await idbPut(book).catch(()=>{}); renderChunk(book,i); renderProgress(book);
          setTransStatus(TRANS_STOP_MSG); break;
        }
        ch.trans=res.translation; ch.glossary=res.glossary||[]; ch.keyPoints=res.keyPoints||[]; ch.basic=!!res.basic; ch.status="done"; ch.explanation=""; ch.explTone="";
      }catch(err){
        if(stopFlag || transRun.stopped || (err && err.name==="AbortError")){ /* إيقاف مقصود: مش خطأ — الجزء يرجع «لسه» من غير ترجمة */
          ch.status="pending"; await idbPut(book).catch(()=>{}); renderChunk(book,i); renderProgress(book);
          setTransStatus(TRANS_STOP_MSG); break;
        }
        ch.status="fail"; await idbPut(book).catch(()=>{}); renderChunk(book,i); renderProgress(book);
        logError("ترجمة", err);
        setTransStatus("الجزء "+(i+1)+" وقف — سبب التوقف: " + describeError(err) + " — دوس «ترجم الجزء ده» تحت الجزء أو «ترجم / كمّل».", true);
        return;
      }
      try{ await idbPut(book); }
      catch(e){ /* الحفظ على الجهاز فشل (مساحة ممتلئة مثلًا): بنوقف التشغيل برسالة واضحة بدل ما نكمل ونحرق طلبات ترجمة مش هتتحفظ */
        logError("ترجمة", e);
        setTransStatus("الحفظ على الجهاز فشل — الترجمة واقفة: " + describeError(e), true);
        return;
      }
      renderChunk(book,i); renderProgress(book); /* إعادة رسم مستهدفة للجزء ده بس — المكتبة بتتحدّث مرة واحدة في آخر التشغيل (finally) */
    }
    if(!stopFlag && !(transRun && transRun.stopped)) setTransStatus("خلصت ترجمة الكتاب كله 🎉");
  } finally { translating=false; transRun=null; setStopBtn(false); renderReaderControls(book); renderLibrary(); }
}
/* ---------- ترجمة جزء واحد لوحده (زرار «ترجم الجزء ده» تحت كل جزء) ----------
   ميزة مستقلة لترجمة/إعادة ترجمة جزء بعينه، بنفس قواعد ترجمة الكتاب كله بالظبط ومن غير أي استثناء:
   كتاب مقفول مبتشتغلش، أي عملية شغالة على الكتاب (ترجمة/إصلاح/شرح) بتمنعها بشرح، وضع «النص الأصلي» بيوقفها برسالته،
   وكتاب عربي هدفه المصري بيطلب التأكيد المعتاد الأول. مفيش تأكيد تشغيل (هي عملية على جزء واحد بس).
   وبتعدّي على نفس نظام التشغيل/الإيقاف بتاع ترجمة الكتاب كله (translating + transRun + setStopBtn من نقطة البدء نفسها)،
   فزرار الإيقاف في المنطقة ١ بيبقى مفعّل (أحمر) طول شغلها وبيقدر يوقفها فعلًا في أي لحظة.
   النتيجة بتتكتب في الجزء عند النجاح بس — فالإيقاف أو الفشل في إعادة ترجمة جزء مترجم بيخلّي ترجمته القديمة زي ما هي */
const chunkErrors = {}; /* سبب توقف آخر محاولة ترجمة لجزء لوحده — بيظهر جوه الجزء نفسه تحت ترجمته، مؤقت في الجلسة ومش بيتحفظ في التخزين */
function setChunkError(bookId, i, msg){ const k = bookId + ":" + i; if(msg) chunkErrors[k] = msg; else delete chunkErrors[k]; }
function chunkErrorText(bookId, i){ return chunkErrors[bookId + ":" + i] || ""; }
async function translateOneChunk(book, i){
  const ch = book && book.chunks ? book.chunks[i] : null; if(!ch) return;
  if(isBookLocked(book)) return; /* الكتب المقفولة أجزاؤها مش بتترسم أصلًا — ده تأكيد إضافي لنفس القاعدة */
  if(translating || repairing || explaining){ setTransStatus("فيه عملية شغالة على الكتاب — وقّفها أو استنى تخلص"); return; }
  if(bookTargetLang(book)==="orig"){ setTransStatus("الوضع الحالي: عرض النص الأصلي بس من غير ترجمة — غيّر اللغة لو عاوز ترجمة"); return; }
  if(isArabicBook(book) && bookTargetLang(book)==="ar-EG" && !confirm("الكتاب ده عربي أصلًا — ترجمته غالبًا هتطلع كلام مكرر أو مش مفهوم. أكمل برضه؟")) return;
  const prevStatus = ch.status; /* حالة الجزء قبل المحاولة — الإيقاف بيرجّعها زي ما كانت بالظبط */
  setChunkError(book.id, i, "");
  translating = true; stopFlag = false;
  transRun = makeRunControl();
  setStopBtn(true); renderReaderControls(book);
  ch.status="working"; renderChunk(book,i);
  setTransStatus("بيترجم الجزء "+(i+1)+" لوحده…");
  try{
    const res=await translateChunkAny(ch.orig, bookTargetLang(book), transRun.signal, bookTStyle(book));
    if(stopFlag || transRun.stopped){ /* اتوقفت وهي شغالة: الجزء يرجع لحالته قبل المحاولة، وترجمته القديمة (لو فيه) محفوظة */
      ch.status=prevStatus; setTransStatus(TRANS_STOP_MSG);
    } else {
      ch.trans=res.translation; ch.glossary=res.glossary||[]; ch.keyPoints=res.keyPoints||[]; ch.basic=!!res.basic; ch.status="done"; ch.explanation=""; ch.explTone="";
      setTransStatus("اتترجم الجزء "+(i+1)+" ✔");
    }
  }catch(err){
    if(stopFlag || transRun.stopped || (err && err.name==="AbortError")){ ch.status=prevStatus; setTransStatus(TRANS_STOP_MSG); }
    else { ch.status="fail"; setChunkError(book.id, i, describeError(err)); logError("ترجمة", err); setTransStatus("الجزء "+(i+1)+" فشل — سبب التوقف: " + describeError(err), true); }
  } finally { translating=false; transRun=null; setStopBtn(false); }
  try{ await idbPut(book); }catch(e){ logError("ترجمة", e); } /* فشل الحفظ مبيمنعش تحديث الواجهة بحالة الجزء النهائية */
  renderChunk(book,i); renderProgress(book); renderLibrary(); renderReaderControls(book);
}
/* الاسم القديم: زرار «إعادة الجزء» المنفصل اتدمج في «ترجم الجزء ده» — الاسم بيضل كاختصار لنفس الدالة لأي مرجع قديم */
async function retryChunk(book, i){ return translateOneChunk(book, i); }

/* ---------- الشرح الصوتي (نص الشرح) ---------- */
/* لهجات الشرح: مصري / فصحى مبسطة / خليجي — بتتختار من الإعدادات أو من درج القارئ وبتتخزن مع إعدادات الجهاز */
const EXPL_DIALECTS={
  egyptian:{ label:"مصري", sys:"انت شارح مصري بيشرح محتوى الكتب باللهجة المصرية البسيطة اليومية، كأنك بتشرح لصاحبك القاعد جنبك: كلام سهل وأسلوب شيّق يشدّه يكمل، وتبسيط لأي مصطلح أو مفهوم صعب أول ما يظهر، وكل الأمثلة والربط من داخل المحتوى نفسه بس.", ask:"اشرح المحتوى التالي بالمصري " },
  fusha:{ label:"فصحى مبسطة", sys:"انت شارح بيشرح محتوى الكتب بالعربية الفصحى المبسطة السهلة: لغة واضحة بسيطة من غير تعقيد لغوي، أسلوب شيّق يشدّ القارئ يكمل، وتبسيط لأي مصطلح أو مفهوم صعب أول ما يظهر، وكل الأمثلة والربط من داخل المحتوى نفسه بس.", ask:"اشرح المحتوى التالي بالفصحى المبسطة " },
  gulf:{ label:"خليجي", sys:"انت شارح بيشرح محتوى الكتب باللهجة الخليجية البيضاء البسيطة اليومية، كأنك تشرح لخويّك الجالس جنبك: كلام سهل وأسلوب شيّق يخليه يكمل، وتبسيط لأي مصطلح أو مفهوم صعب أول ما يظهر، وكل الأمثلة والربط من داخل المحتوى نفسه بس.", ask:"اشرح المحتوى التالي بالخليجي " }
};
const LEARNING_LEVELS={beginner:{label:"مبتدئ",prompt:"ابدأ من الصفر: عرّف المصطلح قبل استخدامه، فكك الفكرة لخطوات صغيرة جدًا، وشبّه للتقريب ثم ارجع للدقة. لا تفترض خلفية مسبقة."},intermediate:{label:"متوسط",prompt:"افترض فهم الأساسيات، اربط الأفكار ووضح مواضع اللبس والفروق المهمة، مع مثال واحد موجز للتقريب."},advanced:{label:"محترف",prompt:"اشرح بعمق واختصار ذكي، ركز على دقة المصطلحات والعلاقات والقيود والاستثناءات المذكورة في النص. لا تضف معرفة خارج المقطع أو تفترض استثناءات غير مذكورة."}};
function learningLevel(){return LEARNING_LEVELS[settings.explLevel]||LEARNING_LEVELS.beginner;}
function sanitizeExplDialect(d){ return EXPL_DIALECTS[d] ? d : "egyptian"; }
function explDialect(){ return EXPL_DIALECTS[sanitizeExplDialect(settings.explDialect||"egyptian")]; }
const EXPL_SYS="انت شارح مصري بيشرح محتوى الكتب باللهجة المصرية البسيطة اليومية، كأنك بتشرح لصاحبك القاعد جنبك: كلام سهل وأسلوب شيّق يشدّه يكمل، وتبسيط لأي مصطلح أو مفهوم صعب أول ما يظهر، وكل الأمثلة والربط من داخل المحتوى نفسه بس.";
function explanationMatchesSettings(ch){return !!(ch && ch.explanation && ch.explanation.trim() && ch.explVersion===2 && ch.explLevel===(settings.explLevel||"beginner") && ch.explTone===settings.tone && ch.explDialect===sanitizeExplDialect(settings.explDialect||"egyptian"));}
async function makeExplanation(book, i, signal){
  const ch=book.chunks[i]; if(!ch) return "";
  const origMode = bookTargetLang(book)==="orig"; /* وضع النص الأصلي: الشرح بيتبني من الأصل نفسه — الجزء مش محتاج يبقى «مترجم» */
  if(!origMode && ch.status!=="done") return "";
  const tone=TONES[settings.tone]||TONES.calm;
  /* لهجة المستخدم تسري على كل الشخصيات، مع الحفاظ على هيكل أسلوب بهنسي. */
  const effDialect = sanitizeExplDialect(settings.explDialect||"egyptian");
  if(explanationMatchesSettings(ch)) return ch.explanation;
  let text="";
  if(hasKey()){
    const srcBlock = origMode ? "\n\nالمحتوى (النص الأصلي كما هو):\n"+ch.orig : "\n\nالمحتوى المترجم:\n"+ch.trans+"\n\nالأصل:\n"+ch.orig;
    const dl = explDialect();
    const learning = "\nمستوى المتعلم: "+learningLevel().label+". "+learningLevel().prompt+"\nقواعد تعليمية لكل الأساليب: استنتج نوع المحتوى من المقطع فقط. للعلمي والتعليمي: قسّم الأفكار لوحدات صغيرة، عرّف المصطلح، اشرح السبب خطوة بخطوة من غير تسطيح، أعد الفكرة المحورية بصياغة أخرى، ثم اختم بأهم النقاط و٣ أسئلة اختبر نفسك مع إجابات منفصلة بعد الأسئلة. يمكن تشبيه يومي واضح أنه مجرد تشبيه لا حقيقة من الكتاب. للنص الأدبي والرواية: حافظ على متعة السرد، فسّر الأحداث والدوافع المذكورة فقط، دون حرق ما لم يرد في المقطع، واختم بخلاصة لطيفة وسؤال تأمل بدل اختبار حفظ. لا تخترع وقائع أو أرقامًا، ولا تعد بحفظ مضمون أو دائم. ممنوع اختراع ترتيب زمني أو سببي أو علاقة احتواء بين مفاهيم متجاورة في المصدر. التفكيك وسيلة تنظيم للشرح وليس مبررًا لادعاء أن كل مفهوم داخل الذي قبله. لو سؤال عكس السبب غير مسنود بالمصدر قل إن المقطع لا يكفي للحكم.\nاللهجة الملزمة لهذا الشرح: " + dl.label + "، حتى لو وصف النبرة الأصلي ذكر لهجة أخرى. صيّغ حتى العناوين والأسئلة والاقتباسات النموذجية بنفس اللهجة المختارة، ولا تنقل أمثلة تعليمات النبرة حرفيًا بلهجة مختلفة.";
    const style=tone.fullInstr && effDialect!=="egyptian" ? tone.style.replace(/بالمصرية الطبيعية|بالمصرية/g, "بال"+dl.label) : tone.style;
    text = await aiChat(dl.sys, dl.ask+style+learning+srcBlock, tone.temp==null?0.5:tone.temp, signal, {maxTokens:4096});
    /* مراجعة المصدر تمنع تحويل طريقة التفكيك لعلاقات علمية غير مذكورة في الكتاب. فشلها يوقف الحفظ بدل عرض مسودة غير مراجعة. */
    text = await aiChat("أنت مراجع دقيق للشرح. الحقائق من المصدر وحده. أعد الشرح المصحح فقط دون أي تعليق.", "راجع المسودة مقارنة بالمصدر. احذف الوقائع والعلاقات السببية والترتيب والاحتواء غير المذكورين. التشبيه مسموح إن سُمّي تشبيهًا، وليس دليلًا علميًا. لا تخترع أرقامًا. حافظ على شخصية الشرح وبنيته قدر ما يسمح به المصدر. اللهجة المطلوبة لكل النص حتى العناوين والأسئلة: "+dl.label+". لو سؤال عكس السبب لا يمكن إجابته من النص قل ذلك بلا استنتاجات خارجية.\nالمصدر:\n"+(origMode?ch.orig:ch.trans+"\n"+ch.orig)+"\nالمسودة:\n"+text, 0.15, signal, {maxTokens:4096});
  } else if(ch.keyPoints && ch.keyPoints.length){
    text = "أهم اللي في الجزء ده: "+ch.keyPoints.join(". ")+".";
  } else {
    text = "الجزء ده بيقول: "+String(origMode ? ch.orig : ch.trans).slice(0,600);
  }
  ch.explanation=String(text).trim(); ch.explVersion=2; ch.explLevel=settings.explLevel||"beginner"; ch.explTone=settings.tone; ch.explDialect=effDialect;
  await idbPut(book); renderChunk(book,i);
  return ch.explanation;
}

/* ---------- 💡 الشرح النصي بالمصري (زرار لوحده، منفصل عن الشرح الصوتي) ----------
   بيشرح كل أجزاء الكتاب اللي لسه من غير شرح، بالترتيب، وبيتوقف بنفس حارس التوليد (audioGen) + إجهاض الطلب الجاري */
let explaining = false, explainStop = false, explainRun = null;
function setExplainBtn(){ const b=$("#btnExplainBook"); if(b) b.textContent = explaining ? "⏹ وقّف الشرح" : "💡 اشرح الكتاب بال"+explDialect().label; }
function stopExplainBook(){ if(!explaining) return; explainStop = true; if(explainRun) explainRun.stop(); audioGen++; }
/* ---------- 📝 ملخص ذكي لكل جزء (فصل) — بيلخّص الجزء باللهجة المختارة وبيخزّنه معاه ---------- */
async function makeChunkSummary(book, i, signal){
  const ch=book.chunks[i]; if(!ch) return "";
  const origMode = bookTargetLang(book)==="orig";
  if(!origMode && ch.status!=="done") return "";
  const dlKey = sanitizeExplDialect(settings.explDialect||"egyptian");
  if(ch.summary && ch.summaryDialect===dlKey) return ch.summary;
  if(!hasKey()) return "";
  const src = origMode ? ch.orig : (ch.trans || ch.orig);
  const dl = explDialect();
  const text = await aiChat(dl.sys, "لخّص الجزء التالي من الكتاب في ٣-٥ جمل قصيرة مركّزة، أهم الأفكار والمعلومات بس من غير مقدمات ولا إضافات من برّه المحتوى:\n\n"+src, 0.4, signal, {maxTokens: 1024});
  ch.summary=String(text).trim(); ch.summaryDialect=dlKey;
  await idbPut(book); renderChunk(book,i);
  return ch.summary;
}
async function summarizeChunkText(book, i){
  if(!book || isBookLocked(book)) return;
  if(!hasKey()){ setTransStatus("الملخص الذكي بيحتاج مفتاح API — ضيفه من تبويب الإعدادات", true); return; }
  const ch=book.chunks[i]; if(!ch) return;
  if(ch.summary && ch.summary.trim()){ openChunkSummary(i); setTransStatus("الجزء "+(i+1)+" متلخّص أصلًا — الملخص مفتوح تحت الجزء"); return; }
  const gen=audioGen;
  try{
    setTransStatus("بيتلخّص الجزء "+(i+1)+"…");
    const t=await makeChunkSummary(book,i);
    if(gen!==audioGen) return;
    if(t){ openChunkSummary(i); setTransStatus("✅ ملخص الجزء "+(i+1)+" جاهز تحت الجزء"); }
    else setTransStatus("الملخص محتاج الجزء يكون مترجم الأول (أو الكتاب في وضع النص الأصلي).", true);
  }catch(e){ if(!(e && e.name==="AbortError")){ logError("ملخص", e); setTransStatus("الملخص وقف — سبب التوقف: "+describeError(e), true); } }
}
function openChunkSummary(i){
  const sec=document.getElementById("chunk-"+i); if(!sec) return;
  sec.querySelectorAll("details").forEach(d=>{ const s=d.querySelector("summary"); if(s && s.textContent.indexOf("ملخص الجزء")===0) d.open=true; });
}

function openChunkExplanation(i){
  const sec = document.getElementById("chunk-" + i); if(!sec) return;
  sec.querySelectorAll("details").forEach(d=>{ const s = d.querySelector("summary"); if(s && s.textContent.indexOf("الشرح") === 0) d.open = true; });
}
async function explainBook(book){
  if(!book || explaining) return;
  if(isBookLocked(book)) return;
  if(translating || repairing){ setTransStatus("فيه شغل شغال دلوقتي — وقّفه أو استنى يخلص الأول"); return; }
  if(!hasKey()){ setTransStatus("الشرح بالمصري بيحتاج مفتاح API — ضيفه من تبويب الإعدادات", true); return; }
  const origMode = bookTargetLang(book)==="orig";
  /* «ناقص شرح» = مفيش شرح أصلًا أو شرحه معمول بنبرة قديمة — بيتماشى مع makeExplanation اللي بيجدّد الشرح لما النبرة تتغيّر */
  const needsExpl = c => !explanationMatchesSettings(c);
  const missing = book.chunks.map((c, i)=>i).filter(i=>{
    const c = book.chunks[i];
    return needsExpl(c) && (origMode || c.status === "done");
  });
  if(!missing.length){
    const anyMissing = book.chunks.some(needsExpl);
    setTransStatus(anyMissing ? "الأجزاء اللي لسه من غير شرح لسه مش مترجمة — ترجمها الأول وبعدين اشرحها" : "الكتاب كله متشرح أصلًا ✔ — الشرح تحت كل جزء");
    return;
  }
  if(needsRunConfirm(missing.length) && !confirm(runConfirmText("يتشرح", missing.length))) return;
  explaining = true; explainStop = false; explainRun = makeRunControl();
  const gen = audioGen;
  setExplainBtn();
  let done = 0, runErr = null;
  try{
    for(const i of missing){
      if(explainStop || gen !== audioGen || (explainRun && explainRun.stopped)) break;
      setTransStatus("بيتشرح الجزء " + (i+1) + " من " + book.chunks.length + "…");
      let t = "";
      try{ t = await makeExplanation(book, i, explainRun ? explainRun.signal : undefined); }
      catch(e){ if(explainStop || gen !== audioGen || (e && e.name === "AbortError")) break; runErr = e; break; } /* خطأ حقيقي: التشغيل بيقف وسببه بيظهر وبيتسجل — مش بيعدّي في صمت */
      if(explainStop || gen !== audioGen || (explainRun && explainRun.stopped)) break;
      if(t){ done++; renderChunk(book, i); openChunkExplanation(i); } /* makeExplanation حفظت الجزء بنفسها — مفيش كتابة تانية هنا */
    }
  } finally {
    explaining = false; explainRun = null; setExplainBtn();
    renderSummary(book);
  }
  if(runErr){ logError("شرح", runErr); setTransStatus("وقف الشرح — سبب التوقف: " + describeError(runErr) + " (اتشرح " + done + " جزء قبلها)", true); }
  else if(explainStop || gen !== audioGen) setTransStatus("⏸ وقف الشرح — اتشرح " + done + " جزء، والباقي زي ما هو");
  else setTransStatus("خلص شرح الكتاب ✔ اتشرح " + done + " جزء");
}
/* شرح جزء واحد بس (نص) — من زرار الجزء نفسه */
async function explainChunkText(book, i){
  if(!book || isBookLocked(book)) return;
  if(explaining){ setTransStatus("فيه شرح شغال دلوقتي — وقّفه أو استنى يخلص الأول"); return; }
  if(!hasKey()){ setTransStatus("الشرح بالمصري بيحتاج مفتاح API — ضيفه من تبويب الإعدادات", true); return; }
  const ch = book.chunks[i]; if(!ch) return;
  if(explanationMatchesSettings(ch)){ openChunkExplanation(i); setTransStatus("الجزء " + (i+1) + " متشرح أصلًا — الشرح مفتوح تحت الجزء"); return; }
  explaining = true; explainStop = false; explainRun = makeRunControl();
  const gen = audioGen;
  setExplainBtn();
  try{
    setTransStatus("بيتشرح الجزء " + (i+1) + "…");
    const t = await makeExplanation(book, i, explainRun ? explainRun.signal : undefined);
    if(explainStop || gen !== audioGen || (explainRun && explainRun.stopped)){ setTransStatus("⏸ وقف الشرح"); return; }
    if(t){ renderChunk(book, i); openChunkExplanation(i); setTransStatus("اتشرح الجزء " + (i+1) + " ✔"); } /* makeExplanation حفظت بنفسها */
    else setTransStatus("الجزء ده لسه مش مترجم — ترجمه الأول وبعدين اشرحه", true);
  }catch(e){
    if(explainStop || gen !== audioGen || (e && e.name === "AbortError")) setTransStatus("⏸ وقف الشرح");
    else { logError("شرح", e); setTransStatus("الشرح وقف — سبب التوقف: " + describeError(e), true); }
  } finally { explaining = false; explainRun = null; setExplainBtn(); }
}

/* ---------- الصوت (speechSynthesis) ---------- */
let playChain = null; // {items:[{text,lang}], idx, label}
let audioGen = 0; // جيل التشغيل: أي إيقاف أو تشغيل جديد بيبطّل أي «تجهيز شرح» لسه شغال في الخلفية
/* حالة مشغّل ElevenLabs (عنصر <audio> واحد + إجهاض التوليد الجاري) */
let elAbort = null, elActive = false, elPlaying = false, elCurrentURL = null, elPendingResolve = null, elFallbackItems = null;
/* ---------- مؤقّت النوم (إيقاف تلقائي للصوت) ---------- */
let sleepTimerId = null, sleepTickId = null, sleepEndsAt = 0, sleepEndChunk = false;
function sleepSuffix(){
  if(sleepEndChunk) return " · 😴 هيقف آخر الجزء الحالي";
  if(sleepEndsAt > 0){ const m = Math.max(1, Math.ceil((sleepEndsAt - Date.now())/60000)); return " · 😴 فاضل " + m + " دقيقة للإيقاف التلقائي"; }
  return "";
}
function clearSleepTimer(resetSel){
  if(sleepTimerId){ clearTimeout(sleepTimerId); sleepTimerId = null; }
  if(sleepTickId){ clearInterval(sleepTickId); sleepTickId = null; }
  sleepEndsAt = 0; sleepEndChunk = false;
  if(resetSel){ const s = $("#sleepTimerSel"); if(s) s.value = "off"; }
}
function setSleepMode(val){
  clearSleepTimer(false);
  if(val === "endchunk"){ sleepEndChunk = true; if(playChain) nextUtterStatus(); return; }
  const mins = parseInt(val, 10);
  if(mins > 0){
    sleepEndsAt = Date.now() + mins*60000;
    sleepTimerId = setTimeout(()=>{ stopAllAudio("😴 وقف الصوت تلقائيًا — مؤقّت النوم خلص."); }, mins*60000);
    sleepTickId = setInterval(()=>{ if(playChain) nextUtterStatus(); }, 30000);
    if(playChain) nextUtterStatus();
  }
}
function nextUtterStatus(){
  if(!playChain) return;
  setAudioStatus((playChain.label||"شغال دلوقتي") + ": جزء " + (playChain.idx+1) + " من " + playChain.items.length + sleepSuffix());
}
/* إيقاف صوت كامل: بيكنسل النطق + أي تجهيز شرح جاري + مؤقّت النوم، وبيفك حالة الـ pause العالقة */
/* زرار الإيقاف العائم: بيظهر في أي مكان في التطبيق طالما فيه صوت شغال (جهاز أو سحابي) —
   عشان «اسمع الأصل» جوه القارئ ميبقاش من غير تحكم ظاهر */
function anyAudioPlaying(){ return !!playChain || !!elActive; }
function syncVoiceStopFab(){
  const on = anyAudioPlaying();
  try{ document.body.classList.toggle("audio-playing", on); }catch(e){}
  const f = (typeof $ === "function") ? $("#voiceStopFab") : null;
  if(f) f.classList.toggle("hidden", !on);
}
function stopAllAudio(msg){
  audioGen++;
  clearSleepTimer(true);
  if(elAbort){ try{ elAbort.abort(); }catch(e){} elAbort = null; }
  elStopElement();
  elActive = false;
  stopSpeaking();
  if("speechSynthesis" in window){ try{ speechSynthesis.resume(); }catch(e){} }
  setAudioStatus(msg == null ? "الصوت وقف." : msg);
}
function pickVoice(langKey){
  const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  /* langKey ممكن يبقى لغة بس («ar») أو لغة+لهجة («ar-EG»): الصوت المحفوظ الأول لو لغته مطابقة،
     بعدين مطابقة اللهجة بالظبط (شرح مصري بصوت مصري)، وبعدين أي صوت بنفس اللغة */
  const full=String(langKey||"ar").toLowerCase();
  const prefix=full.split("-")[0];
  if(settings.voiceURI){ const v=vs.find(v=>v.voiceURI===settings.voiceURI); if(v && v.lang && v.lang.toLowerCase().startsWith(prefix)) return v; }
  const filtered=filterVoicePool(vs);
  const candidates=filtered.length?filtered:vs;
  if(full.indexOf("-")>0){ const reg=candidates.find(v=>v.lang && v.lang.toLowerCase().startsWith(full)); if(reg) return reg; }
  if(full==="ar"){ const fusha=candidates.find(v=>/^ar(?!-eg)/i.test(v.lang||"")); if(fusha) return fusha; }
  return candidates.find(v=>v.lang && v.lang.toLowerCase().startsWith(prefix)) || null;
}
function speakItems(items, label){
  if(!("speechSynthesis" in window)){ setAudioStatus("جهازك مش بيدعم نطق النصوص في المتصفح.", true); return; }
  audioGen++; /* تشغيل جديد يلغي أي تجهيز شرح قديم لسه شغال */
  stopSpeaking();
  playChain={items:items.filter(x=>x.text && x.text.trim()), idx:0, label:label||""};
  nextUtter();
}
function nextUtter(){
  if(!playChain) return;
  if(playChain.idx>=playChain.items.length){ playChain=null; setAudioStatus("خلصت القراية الصوتية ✔"); return; }
  const it=playChain.items[playChain.idx];
  const u=new SpeechSynthesisUtterance(it.text);
  const tone=TONES[settings.tone]||TONES.calm;
  u.lang = it.langFull || (it.lang==="en" ? "en-US" : "ar-EG");
  const v=pickVoice(it.langFull || it.lang || "ar"); if(v){ u.voice=v; u.lang=v.lang; }
  u.rate=settings.speed||1; u.pitch=tone.pitch;
  nextUtterStatus();
  u.onend=utterAdvanced;
  u.onerror=utterAdvanced;
  speechSynthesis.speak(u);
}
/* نهاية جزء صوتي: بنكمّل اللي بعده — أو بنقف هنا لو مؤقّت النوم على «نهاية الجزء الحالي» */
function utterAdvanced(){
  if(!playChain) return;
  if(sleepEndChunk){
    playChain = null;
    clearSleepTimer(true);
    setAudioStatus("😴 وقف الصوت عند نهاية الجزء ✔");
    return;
  }
  playChain.idx++; nextUtter();
}
function stopSpeaking(){ if("speechSynthesis" in window) speechSynthesis.cancel(); playChain=null; }

/* ---------- 🔊 ElevenLabs — أصوات احترافية من حساب المستخدم نفسه ----------
   المفتاح (settings.elKey) بيتبعت لـ api.elevenlabs.io بس، ومش بيتلوج ولا بيترسم في أي مكان.
   أصوات الجهاز بتفضل هي الافتراضي المجاني؛ ElevenLabs اختيار صريح من المستخدم. */
let elRenderedSpeed = 1;
const EL_API = "https://api.elevenlabs.io";
const PROVIDER_NAMES = {eleven: "ElevenLabs", azure: "Microsoft Azure", google: "Google Cloud", openai: "OpenAI"};
/* أصوات ElevenLabs الجاهزة المعروفة (premade): بتظهر في القايمة قبل أي جلب وتشتغل فور حفظ المفتاح —
   وجلب الأصوات من الحساب بيستبدلها بأصوات حساب المستخدم كلها (بما فيها أصوات المكتبة والنسخ الصوتي).
   مفيش فيها صوت عربي رسمي متخصص — العربي بيشتغل عن طريق موديل eleven_multilingual_v2 بجودة متفاوتة */
const EL_SEED = [];
/* أصوات OpenAI TTS الثابتة (مفيش API لجلب القايمة — دي القايمة الرسمية الكاملة) */
const OPENAI_SEED = ["alloy","ash","ballad","coral","echo","fable","nova","onyx","sage","shimmer","verse","marin","cedar"].map(id=>({id,name:id+" · متعدد اللغات (النوع غير معلن)"}));
/* ---------- أصوات عربية/مصرية جاهزة بالاسم (Azure وGoogle) ----------
   بتظهر في قوائم اختيار الصوت قبل أي جلب، وتشتغل فور حفظ المفتاح من غير ما المستخدم يجلب القايمة الكاملة —
   وجلب الأصوات من الحساب بيستبدلها بالقايمة الحقيقية الكاملة */
const AZURE_AR_SEED = [
  {id:"ar-EG-ShakirNeural", name:"شاكر 🇪🇬 مصري راجل — ar-EG-ShakirNeural"},
  {id:"ar-EG-SalmaNeural", name:"سلمى 🇪🇬 مصرية ست — ar-EG-SalmaNeural"},
  {id:"ar-SA-HamedNeural", name:"حامد 🌴 عربي راجل (فصحى/خليجي) — ar-SA-HamedNeural"},
  {id:"ar-SA-ZariyahNeural", name:"زارية 🌴 عربية ست (فصحى/خليجي) — ar-SA-ZariyahNeural"}
];
const GOOGLE_AR_SEED = [
  {id:"ar-XA-Standard-B", name:"عربي رجالي ١ — ar-XA-Standard-B"},
  {id:"ar-XA-Standard-A", name:"عربي نسائي ١ — ar-XA-Standard-A"},
  {id:"ar-XA-Standard-C", name:"عربي رجالي ٢ — ar-XA-Standard-C"},
  {id:"ar-XA-Standard-D", name:"عربي نسائي ٢ — ar-XA-Standard-D"},
  {id:"ar-XA-Wavenet-B", name:"عربي رجالي ١ (Wavenet) — ar-XA-Wavenet-B"},
  {id:"ar-XA-Wavenet-A", name:"عربي نسائي ١ (Wavenet) — ar-XA-Wavenet-A"}
];
/* لهجة الشرح → اللهجة الصوتية المفضلة: مصري→ar-EG، خليجي→ar-SA (أقرب صوت خليجي متاح عند المزوّدين)، فصحى→أي عربي غير مصري */
function explDialectKey(){ return sanitizeExplDialect(settings.explDialect||"egyptian"); }
function explLocaleOf(dk){ return dk==="egyptian" ? "ar-EG" : dk==="gulf" ? "ar-SA" : "ar"; }
/* الصوت السحابي الفعلي وقت التشغيل: اختيار المستخدم بإيده بيكسب دايمًا؛
   لو الصوت اتظبط تلقائيًا (لسه ماختارش بنفسه) بنطابق لهجة نص الشرح مع أنسب صوت عربي ليها —
   شرح مصري يتقرا بصوت مصري، وشرح فصحى/خليجي بصوت عربي فصيح مش مصري */
function effectiveCloudVoice(prov, item){
  if(prov === "azure"){
    const cur = settings.azVoice || "";
    if(settings.azVoiceManual) return cur;
    if(!item || item.kind !== "explain") return cur;
    const want = explLocaleOf(item.explDialect || explDialectKey());
    const pool0 = ((Array.isArray(settings.azVoices) && settings.azVoices.length) ? settings.azVoices : AZURE_AR_SEED);
    const preferred=filterVoicePool(pool0);
    const pool=(preferred.length?preferred:pool0).map(v=>v.id);
    if(want === "ar"){ /* فصحى: نفضّل صوت عربي غير مصري عشان النبرة تطلع فصيحة */
      if(pool.includes(cur) && cur.indexOf("ar-")===0 && cur.indexOf("ar-EG")!==0) return cur;
      return pool.find(id=>id.indexOf("ar-")===0 && id.indexOf("ar-EG")!==0) || cur;
    }
    if(pool.includes(cur) && cur.indexOf(want)===0) return cur;
    return pool.find(id=>id.indexOf(want)===0) || cur;
  }
  if(prov === "google"){ /* أصوات Google العربية كلها ar-XA من غير تفرقة لهجات — الصوت المختار هو المناسب دايمًا */
    if(settings.gVoiceManual) return settings.gVoice||"";
    const list=(settings.gVoices&&settings.gVoices.length)?settings.gVoices:GOOGLE_AR_SEED;
    return (filterVoicePool(list).find(v=>/^ar-/.test(v.id))||list.find(v=>v.id===settings.gVoice)||list[0]||{}).id||"";
  }
  if(prov === "openai"){ /* أصوات OpenAI متعددة اللغات من غير نسخ عربية متخصصة — الصوت المختار هو المناسب */
    return settings.oVoice || "";
  }
  return providerVoiceId(prov);
}
function elKeySet(){ return !!(settings.elKey && settings.elKey.trim()); }
function azKeySet(){ return !!(settings.azKey && settings.azKey.trim() && settings.azRegion && settings.azRegion.trim()); }
function gKeySet(){ return !!(settings.gKey && settings.gKey.trim()); }
function oKeySet(){ return !!(settings.oKey && settings.oKey.trim()); }
function providerReady(p){
  if(p === "eleven") return elKeySet();
  if(p === "azure") return azKeySet();
  if(p === "google") return gKeySet();
  if(p === "openai") return oKeySet();
  return true;
}
/* المزوّد الفعّال: الاختيار المحفوظ لو مفتاحه جاهز، وإلا أصوات الجهاز */
function ttsProvider(){
  const p = settings.ttsProvider;
  if((p === "eleven" || p === "azure" || p === "google" || p === "openai") && providerReady(p)) return p;
  return "device";
}
function providerVoiceId(p){
  if(p === "azure") return settings.azVoice || "";
  if(p === "google") return settings.gVoice || "";
  if(p === "openai") return settings.oVoice || "";
  return settings.elVoiceId || "";
}
/* تقسيم النص لجُمل بحد أقصى maxlen حرف — دالة نقية: الناتج بيغطي النص كله من غير ما يضيع ولا حرف */
function splitSentences(text, maxlen){
  maxlen = maxlen || 800;
  const s = String(text || "");
  if(!s.trim()) return [];
  const END = ".!?…؟。！？";
  const TAIL = "\"'»”’)]} ";
  const sents = []; let cur = "";
  for(let i = 0; i < s.length; i++){
    cur += s[i];
    if(END.indexOf(s[i]) >= 0){
      while(i + 1 < s.length && (END.indexOf(s[i + 1]) >= 0 || TAIL.indexOf(s[i + 1]) >= 0)){ cur += s[i + 1]; i++; }
      sents.push(cur); cur = "";
    }
  }
  if(cur) sents.push(cur);
  const out = []; let buf = "";
  for(const raw0 of sents){
    let raw = raw0;
    if(raw.length > maxlen){ if(buf){ out.push(buf); buf = ""; } while(raw.length > maxlen){ out.push(raw.slice(0, maxlen)); raw = raw.slice(maxlen); } buf = raw; continue; }
    if(buf && (buf + raw).length > maxlen){ out.push(buf); buf = ""; }
    buf += raw;
  }
  if(buf) out.push(buf);
  return out;
}
/* بصمة قصيرة للنص (djb2) — للتمييز المحلي في مفتاح الكاش بس */
function textHash(str){ let h = 5381; const s = String(str || ""); for(let i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; } return h.toString(36); }
/* بصمة إعدادات التوليد لكل مزوّد — أي تغيير فيها يبطل الكاش القديم ضمنيًا */
function genSalt(p){
  if(p === "azure" || p === "google" || p === "openai") return "sp" + (settings.speed || 1) + "|model" + (p==="openai" ? settings.oModel : "") + "|tn" + (settings.tone || "calm"); /* النبرة بتأثر في أسلوب الأداء السحابي */
  return (settings.elModel || "") + "|" + settings.elStability + "|" + settings.elSimilarity + "|" + settings.elSpeed + "|tn" + (settings.tone || "calm");
}
/* مفتاح كاش الصوت: مزوّد|كتاب|جزء|نوع|صوت|بصمة (النص + إعدادات التوليد) */
function audioCacheKey(provider, bookId, chunkIdx, kind, voiceId, text){ return provider + "|" + bookId + "|" + chunkIdx + "|" + kind + "|" + voiceId + "|" + textHash(String(text || "") + "" + genSalt(provider)); }
/* ElevenLabs: الثبات والأسلوب بيتحسبوا من النبرة المختارة — الأساليب المعبّرة (قصصي/حماسي/شعري) بتاخد ثبات أقل وأسلوب أعلى،
   والرسمية (أخبار/جاد/تعليمي) ثبات أعلى عشان تفضل واضحة */
function elVoiceSettings(){
  if(settings.elProsodyManual) return {stability:settings.elStability,similarity_boost:settings.elSimilarity,speed:1,style:0};
  const expressive = ["founder","playful","story","enthusiastic","commentator","poet","creator","podcaster","literary","hakawati"];
  const formal = ["professor","engineer","mentor","simplifier","serious","news","documentary","calm","teacher","reverse"];
  if(expressive.indexOf(settings.tone) >= 0) return {stability: 0.35, similarity_boost: settings.elSimilarity, speed: 1, style: 0.45};
  if(formal.indexOf(settings.tone) >= 0) return {stability: 0.65, similarity_boost: settings.elSimilarity, speed: 1, style: 0};
  return {stability: settings.elStability, similarity_boost: settings.elSimilarity, speed: 1};
}
async function elFetchSegment(text, signal){
  const r = await fetch(EL_API + "/v1/text-to-speech/" + encodeURIComponent(settings.elVoiceId), {
    method: "POST",
    headers: {"Content-Type":"application/json", "Accept":"audio/mpeg", "xi-api-key": settings.elKey.trim()},
    signal: signal,
    body: JSON.stringify({text: text, model_id: settings.elModel || "eleven_multilingual_v2",
      voice_settings: elVoiceSettings()})
  });
  if(r.status === 401) throw Object.assign(new Error("مفتاح ElevenLabs مش شغال"), {cloudCode: 401});
  if(r.status === 429) throw Object.assign(new Error("رصيد ElevenLabs خلص أو وصل للحد"), {cloudCode: 429});
  if(!r.ok) throw new Error("ElevenLabs ردّت بخطأ " + r.status);
  return await r.blob();
}
/* ---------- Microsoft Azure Speech (باقة مجانية من حساب المستخدم) ---------- */
function ssmlEscape(s){ return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function azureLocaleOf(voice){ const p = String(voice || "").split("-"); return p.length >= 2 ? p[0] + "-" + p[1] : "ar-EG"; }
/* النبرة المختارة → أسلوب أداء Azure (mstts:express-as): بيخلي القراية معبّرة حسب نوع المحتوى مش مسطحة.
   مش كل صوت بيدعم كل أسلوب — لو Azure رفضت (400) بنعيد الطلب من غير أسلوب تلقائيًا */
const AZURE_TONE_STYLE = {calm:"calm", enthusiastic:"cheerful", serious:"newscast", teacher:"friendly", story:"narration-relaxed", commentator:"sports_commentary", literary:"narration-professional", poet:"lyrical", news:"newscast", documentary:"documentary-narration", podcaster:"chat", creator:"cheerful", reverse:"friendly", founder:"cheerful", playful:"chat", simplifier:"friendly", professor:"narration-professional", hakawati:"chat", engineer:"friendly", mentor:"friendly"};
function azurePitchOf(tone){ const pct = Math.round((((tone && tone.pitch) || 1) - 1) * 50); return (pct >= 0 ? "+" : "") + pct + "%"; }
function azureSSML(text, voiceName, locale, rate, pitch, styleName){
  const prosody = "<prosody rate='" + rate + "' pitch='" + pitch + "'>" + ssmlEscape(text) + "</prosody>";
  const inner = styleName ? "<mstts:express-as style='" + styleName + "'>" + prosody + "</mstts:express-as>" : prosody;
  return "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='" + locale + "'><voice name='" + voiceName + "'>" + inner + "</voice></speak>";
}
async function azFetchSegment(text, signal, voiceName){
  const region = (settings.azRegion || "").trim();
  if(!/^[a-z0-9-]+$/i.test(region)) throw new Error("ريجن Azure غير صالح");
  const voice = voiceName || settings.azVoice;
  const tone = TONES[settings.tone] || TONES.calm;
  const ratePct = 0;
  const rate = (ratePct >= 0 ? "+" : "") + ratePct + "%";
  const pitch = azurePitchOf(tone);
  const wantedStyle = AZURE_TONE_STYLE[settings.tone] || "";
  const meta=(settings.azVoices||[]).find(v=>v.id===voice);
  const styleName=meta && Array.isArray(meta.styles) && meta.styles.includes(wantedStyle) ? wantedStyle : "";
  const mk = (style) => fetch("https://" + region + ".tts.speech.microsoft.com/cognitiveservices/v1", {
    method: "POST",
    headers: {"Ocp-Apim-Subscription-Key": settings.azKey.trim(), "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3"},
    signal: signal,
    body: azureSSML(text, voice, azureLocaleOf(voice), rate, pitch, style)
  });
  let r = await mk(styleName);
  if(r.status === 400 && styleName){ r = await mk(""); } /* الصوت ده مش بيدعم الأسلوب — نكمّل بنبرة محسوبة (rate/pitch) بس */
  if(r.status === 401 || r.status === 403) throw Object.assign(new Error("مفتاح Azure مش شغال أو الريجن غلط"), {cloudCode: 401});
  if(r.status === 429) throw Object.assign(new Error("وصلت لحد باقة Azure المجانية الشهرية"), {cloudCode: 429});
  if(!r.ok) throw new Error("Azure ردّت بخطأ " + r.status);
  return await r.blob();
}
/* ---------- Google Cloud Text-to-Speech (باقة مجانية من حساب المستخدم) ---------- */
function googleLangOf(name){ const p = String(name || "").split("-"); return p.length >= 2 ? p[0] + "-" + p[1] : "ar-XA"; }
function base64ToBlob(b64, type){
  const bin = atob(String(b64 || ""));
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], {type: type || "audio/mpeg"});
}
/* Google: مفيش أساليب أداء — أقصى تحكم متاح هو pitch بالسيميتون حسب النبرة */
function googlePitchOf(tone){ const st = Math.round(((((tone && tone.pitch) || 1) - 1) * 10) + 1e-8); return Math.max(-3, Math.min(3, st)); }
async function gFetchSegment(text, signal, voiceName){
  const voice = voiceName || settings.gVoice;
  const tone = TONES[settings.tone] || TONES.calm;
  const r = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize?key=" + encodeURIComponent(settings.gKey.trim()), {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    signal: signal,
    body: JSON.stringify({input: {text: text}, voice: {languageCode: googleLangOf(voice), name: voice}, audioConfig: {audioEncoding: "MP3", speakingRate: 1, pitch: googlePitchOf(tone)}})
  });
  if(r.status === 400 || r.status === 401 || r.status === 403) throw Object.assign(new Error("مفتاح Google مش شغال أو خدمة Text-to-Speech مش مفعّلة في مشروعك"), {cloudCode: 401});
  if(r.status === 429) throw Object.assign(new Error("وصلت لحد باقة Google المجانية الشهرية"), {cloudCode: 429});
  if(!r.ok) throw new Error("Google ردّت بخطأ " + r.status);
  const j = await r.json();
  if(!j || !j.audioContent) throw new Error("Google ردّت من غير صوت");
  return base64ToBlob(j.audioContent, "audio/mpeg");
}
/* ---------- OpenAI TTS (حساب المستخدم نفسه — أصوات ثابتة معروفة، مفيش باقة مجانية) ---------- */
async function oaFetchSegment(text, signal){
  const tone = TONES[settings.tone] || TONES.calm;
  const mk = (withInstr) => {
    const body = {model: settings.oModel || "gpt-4o-mini-tts", voice: settings.oVoice || "alloy", input: text, speed: 1, response_format: "mp3"};
    /* تعليمات الأداء: gpt-4o-mini-tts بس هو اللي بيفهمها — tts-1/tts-1-hd بيرفضوها فبنعيد من غيرها.
       أساليب البرومبت الكامل (زي الهندسة العكسية) وصفها طويل — بتاخد وصف أداء مختصر */
    if(withInstr) body.instructions = "اقرا النص ده " + (tone.fullInstr ? "بأسلوب شرح تعليمي متدرّج خطوة بخطوة وبنبرة مدرّس خبير" : tone.style) + " — قراية معبّرة طبيعية مش مسطحة.";
    return fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {"Content-Type": "application/json", "Authorization": "Bearer " + settings.oKey.trim()},
      signal: signal,
      body: JSON.stringify(body)
    });
  };
  let r = await mk((settings.oModel || "gpt-4o-mini-tts") === "gpt-4o-mini-tts");
  if(r.status === 400){ r = await mk(false); }
  if(r.status === 401 || r.status === 403) throw Object.assign(new Error("مفتاح OpenAI مش شغال"), {cloudCode: 401});
  if(r.status === 429) throw Object.assign(new Error("رصيد OpenAI خلص أو وصل للحد"), {cloudCode: 429});
  if(!r.ok) throw new Error("OpenAI ردّت بخطأ " + r.status);
  return await r.blob();
}
async function cloudFetchSegment(prov, text, signal, voiceName){
  /* مهلة ٦٠ ثانية مركّبة مع إشارة الإيقاف — طلب صوت معلّق بيفشل نضيف بدل ما يعلّق التشغيل كله */
  const ts = timedSignal(signal, 60000);
  try{
    if(prov === "azure") return await azFetchSegment(text, ts.signal, voiceName);
    if(prov === "google") return await gFetchSegment(text, ts.signal, voiceName);
    if(prov === "openai") return await oaFetchSegment(text, ts.signal);
    return await elFetchSegment(text, ts.signal);
  }catch(e){
    if(ts.timedOut()) throw new Error("طلب الصوت أخد وقت أطول من اللازم — جرّب تاني");
    throw e;
  } finally { ts.cleanup(); }
}
/* صوت عنصر واحد (جزء + نوع) عند المزوّد السحابي الفعّال: من الكاش لو موجود، وإلا توليد + حفظ */
async function cloudAudioForItem(item, signal){
  const prov = ttsProvider();
  const voiceId = effectiveCloudVoice(prov, item);
  if(!voiceId) throw new Error("اختار صوت " + (PROVIDER_NAMES[prov] || "") + " من الإعدادات الأول");
  const key = (item.bookId != null && item.chunkIdx != null && item.kind) ? audioCacheKey(prov, item.bookId, item.chunkIdx, item.kind, voiceId, item.text) : null;
  if(key){
    const cached = await idbAudioGet(key).catch(()=>null);
    if(cached) return {blobs: [cached], key: key, cached: true};
  }
  const segs = splitSentences(item.text, prov === "azure" ? 700 : 800);
  const blobs = [];
  for(const seg of segs){
    if(signal && signal.aborted) throw Object.assign(new Error("اتوقف التوليد"), {name: "AbortError"});
    blobs.push(await cloudFetchSegment(prov, seg, signal, voiceId));
  }
  if(key && blobs.length){
    const merged = blobs.length === 1 ? blobs[0] : new Blob(blobs, {type: "audio/mpeg"});
    await idbAudioPut(key, merged).catch(()=>{});
    return {blobs: [merged], key: key, cached: false};
  }
  return {blobs: blobs, key: key, cached: false};
}
function elStopElement(){
  const a = $("#elAudio");
  if(a){ try{ a.pause(); }catch(e){} try{ a.removeAttribute("src"); a.load(); }catch(e){} }
  if(elCurrentURL){ URL.revokeObjectURL(elCurrentURL); elCurrentURL = null; }
  elPlaying = false;
  if(elPendingResolve){ const r = elPendingResolve; elPendingResolve = null; r(); }
}
function elPlayBlob(blob, rate){
  return new Promise((resolve,reject)=>{
    const a = $("#elAudio");
    if(!a){ resolve(); return; }
    if(elCurrentURL) URL.revokeObjectURL(elCurrentURL);
    elCurrentURL = URL.createObjectURL(blob);
    a.src = elCurrentURL;
    /* التوليد محايد 1x، والمنزلق يضبط playbackRate مرة واحدة فقط. */
    a.playbackRate = (rate == null ? (settings.speed || 1) : rate);
    elPlaying = true;
    const cleanup = ()=>{ a.removeEventListener("ended", onEnd); a.removeEventListener("error", onErr); elPendingResolve = null; };
    const onEnd = ()=>{ cleanup(); elPlaying = false; resolve(); };
    const onErr = ()=>{ cleanup(); elPlaying = false; reject(new Error("تعذر تشغيل ملف الصوت، جرّب صوتًا آخر أو أعد التشغيل")); };
    elPendingResolve = ()=>{ cleanup(); resolve(); }; /* الإيقاف اليدوي بيحرّر الانتظار فورًا */
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onErr);
    const p = a.play(); if(p && p.catch) p.catch(()=>{ cleanup(); elPlaying=false; reject(new Error("اضغط تشغيل للسماح بالصوت في المتصفح")); });
  });
}
function offerDeviceFallback(items, label, errMsg){
  elFallbackItems = {items: items, label: label};
  const b = $("#btnElFallback"); if(b) b.classList.remove("hidden");
  setAudioStatus(errMsg + " — تقدر تسمع بصوت الجهاز من الزرار اللي تحت.", true);
}
async function cloudPlaySequence(items, label){
  const prov = ttsProvider();
  const list = (items || []).filter(x=>x.text && x.text.trim());
  if(!list.length) return;
  audioGen++;
  const gen = audioGen;
  stopSpeaking();
  elStopElement();
  elAbort = (typeof AbortController !== "undefined") ? new AbortController() : null;
  elActive = true;
  syncProviderUI();
  elRenderedSpeed=1;
  try{
    for(let k = 0; k < list.length; k++){
      if(gen !== audioGen) return;
      const it = list[k];
      setAudioStatus((label || "شغال دلوقتي") + ": جزء " + (k + 1) + " من " + list.length + " · بيجهّز صوت " + (PROVIDER_NAMES[prov] || "") + "…" + sleepSuffix());
      let got;
      try{ got = await cloudAudioForItem(it, elAbort ? elAbort.signal : undefined); }
      catch(e){
        if(gen !== audioGen || (e && e.name === "AbortError")) return;
        elActive = false;
        if(e && (e.cloudCode === 401 || e.cloudCode === 429)){ offerDeviceFallback(list.slice(k), label, e.message); return; }
        setAudioStatus("صوت " + (PROVIDER_NAMES[prov] || "") + " وقف: " + e.message, true);
        return;
      }
      if(gen !== audioGen) return;
      setAudioStatus((label || "شغال دلوقتي") + ": جزء " + (k + 1) + " من " + list.length + (got.cached ? " (من المحفوظ)" : "") + sleepSuffix());
      for(const b of got.blobs){ if(gen !== audioGen) return; await elPlayBlob(b, settings.speed||1); }
      if(gen !== audioGen) return;
      if(sleepEndChunk){ clearSleepTimer(true); elActive = false; setAudioStatus("😴 وقف الصوت عند نهاية الجزء ✔"); return; }
      const bk = currentBook();
      if(bk && it.bookId === bk.id && it.chunkIdx != null){ fillChunk(bk, it.chunkIdx); refreshChunkAudioStates(bk); }
    }
    elActive = false;
    setAudioStatus("خلصت القراية الصوتية ✔");
  } finally { if(gen === audioGen) elActive = false; }
}
/* نقطة الدخول الموحّدة للتشغيل الصوتي: بتروّح للمزوّد المختار */
function playVoiceItems(items, label){
  if(ttsProvider() !== "device"){ cloudPlaySequence(items, label); }
  else speakItems(items, label);
}
function openCloudSetup(provider){
  closeReaderPanels(); switchTab("settings"); const resume=document.getElementById("resumeBar");if(resume)resume.classList.add("hidden");
  const id=({azure:"azKey",google:"gKey",eleven:"elKey",openai:"oKey"})[provider]||"cloudSetupHeading";
  setTimeout(()=>{const e=document.getElementById(id);if(e){e.scrollIntoView({block:"center",behavior:"auto"});e.focus({preventScroll:true});}},100);
}
function syncProviderUI(){
  const a = $("#elAudio"); if(a) a.classList.toggle("hidden", ttsProvider() === "device");
  const sel = $("#ttsProviderSel");
  if(sel){
    sel.value = settings.ttsProvider;
    $$("option", sel).forEach(o=>{ o.disabled = false; if(o.value !== "device"){if(!o.dataset.label) o.dataset.label=o.textContent; o.textContent=o.dataset.label+(providerReady(o.value)?" — مفتاح محفوظ":" — يحتاج تفعيل");} });
  }
  const hint = $("#elProviderHint");
  if(hint){
    const missing = [];
    if(!elKeySet()) missing.push("ElevenLabs");
    if(!azKeySet()) missing.push("Azure");
    if(!gKeySet()) missing.push("Google");
    if(!oKeySet()) missing.push("OpenAI");
    hint.textContent = missing.length ? "اللي لسه محتاج مفتاح من الإعدادات: " + missing.join("، ") + " — وأصوات الجهاز شغالة دايمًا مجانًا." : "";
  }
}
function fillElVoices(){
  const sel = $("#elVoiceSel"); if(!sel) return;
  /* الأصوات الجاهزة المعروفة بتظهر قبل أي جلب — وجلب أصوات الحساب بيستبدلها بأصوات المستخدم كلها */
  const vs = (Array.isArray(settings.elVoices) && settings.elVoices.length) ? settings.elVoices : EL_SEED;
  const filtered=filterVoicePool(vs);
  const shown=filtered;
  sel.innerHTML = shown.map(v=>'<option value="' + esc(v.id) + '">' + esc(v.name) + (voiceGenderHint(v)==="female" ? " · ست" : voiceGenderHint(v)==="male" ? " · راجل" : " · النوع غير معلن") + (v.cat ? " · " + esc(v.cat) : "") + "</option>").join("");
  if(!vs.length) sel.innerHTML='<option value="">احفظ المفتاح واجلب أصوات حسابك</option>';
  const saved=vs.find(v=>v.id===settings.elVoiceId);
  if(saved && !shown.some(v=>v.id===saved.id)){ const o=document.createElement("option"); o.value=saved.id; o.textContent=saved.name+" · اختيارك الحالي خارج الفلتر"; sel.appendChild(o); }
  if(!shown.length && !saved){ const o=document.createElement("option"); o.value=""; o.textContent="مفيش صوت متاح بالنوع ده"; sel.appendChild(o); }
  sel.value = settings.elVoiceId || (shown[0] && shown[0].id) || "";
}
function fillAzVoices(){
  const sel = $("#azVoiceSel"); if(!sel) return;
  /* القايمة الجاهزة بتظهر قبل أي جلب — الأصوات العربية/المصرية مسماة بوضوح وتشتغل أول ما المفتاح يتحفظ */
  const vs = (Array.isArray(settings.azVoices) && settings.azVoices.length) ? settings.azVoices : AZURE_AR_SEED;
  const filtered=filterVoicePool(vs);
  const shown=filtered;
  sel.innerHTML = shown.map(v=>'<option value="' + esc(v.id) + '">' + esc(v.name) + "</option>").join("");
  const saved=vs.find(v=>v.id===settings.azVoice);
  if(saved && !shown.some(v=>v.id===saved.id)){ const o=document.createElement("option"); o.value=saved.id; o.textContent=saved.name+" · اختيارك الحالي خارج الفلتر"; sel.appendChild(o); }
  if(!shown.length && !saved){ const o=document.createElement("option"); o.value=""; o.textContent="مفيش صوت متاح بالنوع ده"; sel.appendChild(o); }
  sel.value = settings.azVoice || (shown[0] && shown[0].id) || "";
}
function fillGVoices(){
  const sel = $("#gVoiceSel"); if(!sel) return;
  const vs = (Array.isArray(settings.gVoices) && settings.gVoices.length) ? settings.gVoices : GOOGLE_AR_SEED;
  const filtered=filterVoicePool(vs);
  const shown=filtered;
  sel.innerHTML = shown.map(v=>'<option value="' + esc(v.id) + '">' + esc(v.name) + "</option>").join("");
  const saved=vs.find(v=>v.id===settings.gVoice);
  if(saved && !shown.some(v=>v.id===saved.id)){ const o=document.createElement("option"); o.value=saved.id; o.textContent=saved.name+" · اختيارك الحالي خارج الفلتر"; sel.appendChild(o); }
  if(!shown.length && !saved){ const o=document.createElement("option"); o.value=""; o.textContent="مفيش صوت متاح بالنوع ده"; sel.appendChild(o); }
  sel.value = settings.gVoice || (shown[0] && shown[0].id) || "";
}
function fillOVoices(){
  const sel = $("#oVoiceSel"); if(!sel) return;
  const legacy=["alloy","echo","fable","onyx","nova","shimmer"];
  const pool=(settings.oModel||"gpt-4o-mini-tts")==="gpt-4o-mini-tts" ? OPENAI_SEED : OPENAI_SEED.filter(v=>legacy.includes(v.id));
  if(!pool.some(v=>v.id===settings.oVoice)) settings.oVoice=pool[0].id;
  sel.innerHTML = pool.map(v=>'<option value="' + esc(v.id) + '">' + esc(v.name) + "</option>").join("");
  sel.value = settings.oVoice || OPENAI_SEED[0].id;
}
/* جلب الأصوات من حسابات المستخدم عند كل مزوّد — المفتاح بيتبعت لمزوّده بس */
async function elFetchVoices(){
  const msg = $("#elMsg"), btn = $("#elTest");
  const key = ($("#elKey").value || "").trim();
  if(!key){ msg.textContent = "حط مفتاح ElevenLabs الأول في الخانة اللي فوق."; msg.classList.add("err"); return; }
  msg.textContent = "بيجلب الأصوات…"; msg.classList.remove("err"); btn.disabled = true;
  try{
    const ctl = new AbortController(); const to = setTimeout(()=>ctl.abort(), 15000);
    const r = await fetch(EL_API + "/v1/voices", {headers: {"xi-api-key": key}, signal: ctl.signal});
    clearTimeout(to);
    if(r.status === 401){ msg.textContent = "المفتاح مش صح أو منتهي"; msg.classList.add("err"); return; }
    if(!r.ok){ msg.textContent = "ElevenLabs ردّت بخطأ " + r.status; msg.classList.add("err"); return; }
    const j = await r.json();
    const voices = (j && j.voices) || [];
    if(!voices.length){ msg.textContent = "الحساب مفيهوش أصوات متاحة."; msg.classList.add("err"); return; }
    settings.elKey = key;
    settings.elVoices = voices.map(v=>({id: v.voice_id, name: v.name || v.voice_id, cat: v.category || "", gender: ((v.labels||{}).gender||"").toLowerCase(), locale: ((v.labels||{}).language||"")}));
    if(!settings.elVoices.some(v=>v.id === settings.elVoiceId)) settings.elVoiceId = settings.elVoices[0].id;
    saveSettings(); fillElVoices(); syncProviderUI();
    msg.textContent = "تمام ✔ جلبنا " + voices.length + " صوت من حسابك. اختار صوتك من القايمة."; msg.classList.remove("err");
  }catch(e){ msg.textContent = "فشل الاتصال بـ ElevenLabs — اتأكد من الإنترنت والمفتاح."; msg.classList.add("err"); }
  finally{ btn.disabled = false; }
}
async function azFetchVoices(){
  const msg = $("#azMsg"), btn = $("#azTest");
  const key = ($("#azKey").value || "").trim();
  const region = ($("#azRegion").value || "").trim();
  if(!key || !region){ msg.textContent = "حط مفتاح Azure والريجن الأول."; msg.classList.add("err"); return; }
  msg.textContent = "بيجلب أصوات Azure…"; msg.classList.remove("err"); btn.disabled = true;
  try{
    const ctl = new AbortController(); const to = setTimeout(()=>ctl.abort(), 15000);
    const r = await fetch("https://" + region + ".tts.speech.microsoft.com/cognitiveservices/voices/list", {headers: {"Ocp-Apim-Subscription-Key": key}, signal: ctl.signal});
    clearTimeout(to);
    if(r.status === 401 || r.status === 403){ msg.textContent = "المفتاح مش صح أو الريجن غلط"; msg.classList.add("err"); return; }
    if(!r.ok){ msg.textContent = "Azure ردّت بخطأ " + r.status; msg.classList.add("err"); return; }
    const arr = await r.json();
    if(!Array.isArray(arr) || !arr.length){ msg.textContent = "مفيش أصوات راجعة من Azure."; msg.classList.add("err"); return; }
    const score = v => { const loc = v.Locale || ""; if(loc.indexOf("ar-EG") === 0) return 0; if(loc.indexOf("ar-") === 0) return 1; return 2; };
    const tag = v => { const loc = v.Locale || ""; if(loc.indexOf("ar-EG") === 0) return " 🇪🇬 مصري"; if(loc.indexOf("ar-") === 0) return " 🌍 عربي"; return ""; };
    const gnd = v => v.Gender === "Female" ? "ست" : v.Gender === "Male" ? "راجل" : (v.Gender || "");
    const voices = arr.slice().sort((a, b)=>score(a) - score(b)).map(v=>({id: v.ShortName, gender:(v.Gender||"").toLowerCase(), styles:v.StyleList||[], name: (v.ShortName || "") + tag(v) + (v.Locale ? " · " + v.Locale : "") + (v.Gender ? " · " + gnd(v) : "")}));
    settings.azKey = key; settings.azRegion = region; settings.azVoices = voices;
    if(!voices.some(v=>v.id === settings.azVoice)) settings.azVoice = voices[0].id;
    saveSettings(); fillAzVoices(); syncProviderUI();
    msg.textContent = "تمام ✔ جلبنا " + voices.length + " صوت من Azure — الأصوات العربية في الأول. اختار صوتك."; msg.classList.remove("err");
  }catch(e){ msg.textContent = "فشل الاتصال بـ Azure — اتأكد من الإنترنت والمفتاح والريجن."; msg.classList.add("err"); }
  finally{ btn.disabled = false; }
}


// Back navigation is handled by app-navigation.js.
