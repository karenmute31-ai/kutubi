/* سجل المشتركين السحابي (Edge Config) — كل العمليات بتوكن المالك */
import crypto from "crypto";
const ECID=()=>process.env.EDGE_CONFIG_ID, WTOK=()=>process.env.EDGE_CONFIG_WRITE_TOKEN;
function okToken(req){
  const secret=process.env.ADMIN_SECRET; if(!secret) return false;
  const h=req.headers["authorization"]||""; const t=h.startsWith("Bearer ")?h.slice(7):"";
  const i=t.lastIndexOf("."); if(i<1) return false;
  const exp=t.slice(0,i), sig=t.slice(i+1);
  if(Number(exp)<Date.now()) return false;
  const good=crypto.createHmac("sha256",secret).update(exp).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(good));
}
async function readSubs(){
  const r=await fetch("https://api.vercel.com/v1/edge-config/"+ECID()+"/items",{headers:{Authorization:"Bearer "+WTOK()}});
  if(!r.ok) throw new Error("store");
  const d=await r.json();
  const it=(d.items||d||[]).find(x=>x.key==="kutubi_subs");
  return Array.isArray(it&&it.value)?it.value:[];
}
async function writeSubs(subs){
  const r=await fetch("https://api.vercel.com/v1/edge-config/"+ECID()+"/items",{method:"PATCH",
    headers:{Authorization:"Bearer "+WTOK(),"Content-Type":"application/json"},
    body:JSON.stringify({items:[{operation:"upsert",key:"kutubi_subs",value:subs.slice(0,500)}]})});
  if(!r.ok) throw new Error("write");
}
export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
  if(req.method==="OPTIONS"){res.status(204).end();return;}
  if(!okToken(req)){res.status(401).json({error:"محتاج تسجيل دخول المالك."});return;}
  if(!ECID()||!WTOK()){res.status(503).json({error:"المخزن مش متوصل."});return;}
  let body=req.body; if(typeof body==="string"){try{body=JSON.parse(body||"{}")}catch(e){body={}}}
  body=body||{};
  try{
    const subs=await readSubs();
    if(req.method==="GET"){res.status(200).json({subs});return;}
    if(req.method==="POST"){
      const code=String(body.code||"").trim().slice(0,32);
      if(!code){res.status(400).json({error:"ناقص code"});return;}
      if(subs.some(s=>s.code===code)){res.status(409).json({error:"الكود ده متسجل قبل كده."});return;}
      subs.unshift({code, note:String(body.note||"").slice(0,120), createdAt:new Date().toISOString(), active:true});
      await writeSubs(subs); res.status(200).json({ok:true,subs}); return;
    }
    if(req.method==="PATCH"){
      const code=String(body.code||""); const s=subs.find(x=>x.code===code);
      if(!s){res.status(404).json({error:"الكود مش موجود."});return;}
      if(typeof body.active==="boolean") s.active=body.active;
      if(typeof body.note==="string") s.note=body.note.slice(0,120);
      await writeSubs(subs); res.status(200).json({ok:true,subs}); return;
    }
    res.status(405).json({error:"method"});
  }catch(e){res.status(502).json({error:"مخزن المشتركين ماردش — جرّب تاني."});}
}
