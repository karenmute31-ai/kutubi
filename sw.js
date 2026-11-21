/* كُتُبِي — Service Worker: app-shell cache (offline shell only, لا بيخزّن مفاتيح ولا بيانات كتب) */
const CACHE = "motarjem-v35";
const SHARE_CACHE = "motarjem-shared-v1"; /* ملفات جاية من هدف المشاركة — برّه كاش النسخ ومبتتمسحش مع التحديثات */
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./app2.js",
  "./app3.js",
  "./pdftext.js",
  "./app4.js",
  "./app5.js", /* [F] محرك الإصلاح الذاتي — جزء من الشل */
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
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
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
  /* Stale-While-Revalidate لأصول الشل: النسخة المتخزّنة بترد فورًا والشبكة بتحدّث الكاش في الخلفية.
     ده مش بيكسر تدفق تحديث النسخ المتفق عليه: النسخة الجديدة بتوصل كـ Service Worker جديد
     بيستنى موافقة المستخدم (رسالة SKIP_WAITING من بانر التحديث)، وكاشها منفصل باسم نسختها —
     فمفيش أصول قديمة بتتسرّب بعد ما المستخدم يقبل التحديث */
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      const net = fetch(e.request).then((res) => {
        if (res && res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
