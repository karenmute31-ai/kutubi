/* كتبي — قائمة موديلات المسار المدمج (زرار «هات الموديلات المتاحة» في الإعدادات)
   بيرجّع موديل Gemini اللي البروكسي بيستخدمه فعلًا، بصيغة OpenAI-compatible. */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  res.status(200).json({
    object: "list",
    data: [
      { id: model, object: "model", owned_by: "kutubi-builtin", description: "الترجمة الذكية المجانية المدمجة — بدون مفتاح" },
    ],
  });
}
