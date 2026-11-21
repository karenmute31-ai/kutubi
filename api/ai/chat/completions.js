/* كتبي — بروكسي الترجمة الذكية المجانية (بدون مفتاح من المستخدم)
   Vercel Serverless Function: POST /api/ai/chat/completions
   بيستقبل طلب OpenAI-compatible من التطبيق ويمرّره لجوجل Gemini
   عبر نقطة التوافق مع OpenAI، والمفتاح متخزن هنا على السيرفر بس
   (متغيّر بيئة GEMINI_API_KEY) — مبيوصلش لجهاز المستخدم أبدًا.

   متغيّرات البيئة:
   - GEMINI_API_KEY   (مطلوب) مفتاح Gemini المجاني من AI Studio
   - GEMINI_MODEL     (اختياري) الافتراضي gemini-3.5-flash-lite
   - DAILY_CAP        (اختياري) حد الطلبات اليومي لكل IP، الافتراضي 40
   - KV_REST_API_URL + KV_REST_API_TOKEN  (اختياري، Vercel KV / Upstash)
     لو مش موجودين البروكسي يشتغل من غير حدّ يومي (degrade مفتوح).

   الحد اليومي بيتقاس على يوم جوجل (منتصف الليل بتوقيت المحيط الهادئ). */

const UPSTREAM = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

function pacificDay() {
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch (e) { return {}; }
}

/* حدّ يومي لكل IP عبر Upstash/Vercel KV (REST). أي عطل في KV = نسمح بالطلب. */
async function checkDailyCap(ip, cap) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { limited: false };
  const key = "kutubi:rl:" + ip + ":" + pacificDay();
  try {
    const r = await fetch(url.replace(/\/+$/, "") + "/pipeline", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, 90000, "NX"]]),
    });
    if (!r.ok) return { limited: false };
    const results = await r.json();
    const count = results && results[0] && typeof results[0].result === "number" ? results[0].result : 0;
    return { limited: count > cap, count };
  } catch (e) {
    return { limited: false };
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(503).json({ error: { message: "الترجمة الذكية المجانية لسه بتتجهّز — جرّب بعد شوية، أو ضيف مفتاحك الخاص من تبويب الإعدادات." } });
    return;
  }

  const cap = parseInt(process.env.DAILY_CAP || "40", 10) || 40;
  const verdict = await checkDailyCap(clientIp(req), cap);
  if (verdict.limited) {
    res.status(429).json({ error: { message: "وصلت للحد اليومي للترجمة الذكية المجانية (" + cap + " طلب). بيتصفّر كل يوم، أو ضيف مفتاحك الخاص من الإعدادات من غير حدود." } });
    return;
  }

  const body = await readBody(req);
  const messages = body && Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length) {
    res.status(400).json({ error: { message: "طلب ناقص: messages مطلوبة." } });
    return;
  }

  const payload = {
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    messages: messages.slice(0, 24),
    temperature: typeof body.temperature === "number" ? body.temperature : 0.4,
    max_tokens: Math.min(typeof body.max_tokens === "number" ? body.max_tokens : 4096, 8192),
  };

  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 50000);
  try {
    const r = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    const text = await r.text();
    res.status(r.status);
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: { message: "المزوّد ماردش في الوقت المناسب — جرّب تاني." } });
  } finally {
    clearTimeout(to);
  }
}

export const config = { maxDuration: 60 };
