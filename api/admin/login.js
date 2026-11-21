/* لوحة المالك السحابية — تسجيل الدخول: باسورد الإدارة (ADMIN_SECRET على السيرفر بس)
   بيرجّع توكن HMAC صالح ١٢ ساعة. مفيش أي سر بيتخزن في المتصفح. */
import crypto from "crypto";
const tries = new Map();
function ip(req){ const f=req.headers["x-forwarded-for"]; return (typeof f==="string"&&f)?f.split(",")[0].trim():"unknown"; }
export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS"){res.status(204).end();return;}
  if(req.method!=="POST"){res.status(405).json({error:"method"});return;}
  const secret=process.env.ADMIN_SECRET;
  if(!secret){res.status(503).json({error:"اللوحة السحابية لسه مش متظبطة على السيرفر."});return;}
  const key=ip(req); const now=Date.now();
  const rec=tries.get(key)||{n:0,until:0};
  if(now<rec.until){res.status(429).json({error:"محاولات كتير — استنى دقيقة وجرّب تاني."});return;}
  let body=req.body; if(typeof body==="string"){try{body=JSON.parse(body||"{}")}catch(e){body={}}}
  body=body||{};
  if(String(body.password||"")!==secret){
    rec.n++; if(rec.n>=5){rec.until=now+60000;rec.n=0;} tries.set(key,rec);
    res.status(401).json({error:"باسورد الإدارة غلط."});return;
  }
  tries.delete(key);
  const exp=String(now+12*3600*1000);
  const sig=crypto.createHmac("sha256",secret).update(exp).digest("hex");
  res.status(200).json({token:exp+"."+sig});
}
