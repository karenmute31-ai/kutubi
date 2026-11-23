/* كُتُبِي — Service Worker: app-shell cache (offline shell only, لا بيخزّن مفاتيح ولا بيانات كتب) */
const CACHE = "kutubi-v116-native-audio-1";
const SHARE_CACHE = "motarjem-shared-v1"; /* ملفات جاية من هدف المشاركة — برّه كاش النسخ ومبتتمسحش مع التحديثات */
const SHELL = ["./pdf-font-repair.js","./vendor/pdf-font/pdf-lib.min.js","./vendor/pdf-font/opentype.min.js","./pdf-import.js","./app-navigation.js","./luxe-ui.css","./luxe-ui.js","./ocr-lines.js","./android-shell-tts.js","./gemini-tts.js","./cloudflare-tts.js","./eleven-owner-tts.js",
  "./",
  "./index.html",
  "./style.css",
  "./reader2.css",
  "./app.js",
  "./app2.js",
  "./app3.js",
  "./pdftext.js",
  "./app4.js",
  "./app5.js", /* [F] محرك الإصلاح الذاتي — جزء من الشل */
  "./app6.js",
  "./app7.js",
  "./app9.js", "./app10.js", "./read-aloud.js",
  "./app8.js", /* [G] التظليل بالضغط المطوّل — جزء من الشل */
  "./vendor/pdfjs/pdf.min.js",
  "./vendor/pdfjs/pdf.worker.min.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/owner-logo.jpg",
  /* [E] أصول الـ OCR بقت في الـ precache بأمر المالك (كانت كسولة قبل كده): المحرك + النواتان + بيانات اللغتين */
  "./vendor/tesseract/tesseract.min.js",
  "./vendor/tesseract/worker.min.js",
  "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js",
  "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm",
  "./vendor/tesseract/core/tesseract-core-lstm.wasm.js",
  "./vendor/tesseract/core/tesseract-core-lstm.wasm",
  "./vendor/tesseract/lang/ara.traineddata.gz",
  "./vendor/tesseract/lang/eng.traineddata.gz"
];
self.addEventListener("install", (e) => {
  // ملحوظة: مش بنعمل skipWaiting تلقائيًا هنا — النسخة الجديدة بتستنى في حالة waiting
  // لحد ما المستخدم يدوس «حدّث دلوقتي» في التطبيق فتوصلها رسالة SKIP_WAITING.
  // أول تثبيت خالص (مفيش نسخة قديمة) بيُفعّل تلقائيًا من غير ما يستنى.
  /* cache:"reload" = من الشبكة مباشرة: غير كده addAll بياخد نسخة من كاش المتصفح بحدود/رؤوس قديمة (CSP قديم بيفضل) */
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))).then(()=>self.skipWaiting())));
});
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  /* هدف مشاركة الويب (Web Share Target): ملف جاي من قائمة مشاركة أندرويد (Drive/الملفات) —
     بنخزّنه في كاش المشاركة ونحوّل التطبيق لاستهلاكه عند الفتح. أي فشل هنا بيعدي بهدوء */
  if (e.request.method === "POST" && url.searchParams.get("share") === "1") {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const file = form.get("shared_file");
        if (file && file.size) {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put("/shared-file", new Response(file, { headers: { "Content-Type": file.type || "application/octet-stream" } }));
          await cache.put("/shared-name", new Response(encodeURIComponent(file.name || "shared.pdf"), { headers: { "Content-Type": "text/plain" } }));
        }
      } catch (err) {}
      return Response.redirect("./index.html?import=shared", 303);
    })());
    return;
  }
  // طلبات الـ API (الترجمة) والصفحات الخارجية: شبكة مباشرة، مفيش كاش
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== "GET") return;
  if (url.pathname.startsWith('/api/')) { e.respondWith(fetch(e.request)); return; }
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(res=>{
    if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return res;
  }).catch(async()=>{const hit=await caches.match(e.request);if(hit)return hit;if(e.request.mode==='navigate')return caches.match('./index.html');return Response.error();}));
});
