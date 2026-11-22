/* تغيير باسورد الإدارة السيرفري — لازم الباسورد الحالية، والتغيير فوري وبيلغي كل الجلسات */
import crypto from "crypto";
const ECID=()=>process.env.EDGE_CONFIG_ID, WTOK=()=>process.env.EDGE_CONFIG_WRITE_TOKEN;
let cache={t:0,rec:null};
function sha(salt,pw){return crypto.createHmac("sha256","kutubi-admin").update(salt+"|"+pw).digest("hex");}
async function readItems(){
  const r=await fetch("https://api.vercel.com/v1/edge-config/"+ECID()+"/items",{headers:{Authorization:"Bearer "+WTOK()}});
  if(!r.ok) return null;
  const d=await r.json(); return d.items||[];
}
async function adminRec(){
  if(cache.rec && Date.now()-cache.t<30000) return cache.rec;
  const items=await readItems(); if(!items) return null;
  const it=items.find(x=>x.key==="kutubi_admin");
  if(it&&it.value&&it.value.hash){cache={t:Date.now(),rec:it.value};return it.value;}
  const env=process.env.ADMIN_SECRET; if(!env) return null;
  const salt=crypto.randomBytes(8).toString("hex");
  const rec={salt:salt,hash:sha(salt,env),changedAt:new Date().toISOString()};
  await writeRec(rec); cache={t:Date.now(),rec:rec}; return rec;
}
async function writeRec(rec){
  cache={t:0,rec:null};
  const r=await fetch("https://api.vercel.com/v1/edge-config/"+ECID()+"/items",{method:"PATCH",headers:{Authorization:"Bearer "+WTOK(),"Content-Type":"application/json"},body:JSON.stringify({items:[{operation:"upsert",key:"kutubi_admin",value:rec}]})});
  if(!r.ok) throw new Error("write");
}
/* مزامنة نفس الباسورد مع الراوي: مناداش على مخزنه — بينادي إندبوينت الراوي نفسه بالباسورد الحالية
   (اللي معانا أصلًا من الطلب) فبيتحقق منها عنده ويحدّث مخزنه بنفسه. مفيش قيم بيئة جديدة مطلوبة.
   ترويسة x-mirror-from بتمنع اللوب: الطلب الجاي من مرآة مبيعكسش تاني. */
const ALRAWI_PASSWORD_URL="https://khabeer-books.vercel.app/api/admin/password";
async function mirrorAlrawi(cur,next,incoming){
  if(incoming) return "origin"; /* ده طلب مرآة جاي من الراوي — منعكسش تاني */
  try{
    const r=await fetch(ALRAWI_PASSWORD_URL,{method:"POST",headers:{"Content-Type":"application/json","x-mirror-from":"kutubi"},body:JSON.stringify({current:cur,next:next})});
    return r.ok?"synced":"failed";
  }catch(e){return "failed";}
}
const tries=new Map();
function ip(req){const f=req.headers["x-forwarded-for"];return (typeof f==="string"&&f)?f.split(",")[0].trim():"unknown";}
export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS"){res.status(204).end();return;}
  if(req.method!=="POST"){res.status(405).json({error:"method"});return;}
  if(!ECID()||!WTOK()){res.status(503).json({error:"المخزن مش متوصل."});return;}
  const key=ip(req), now=Date.now();
  const rec=tries.get(key)||{n:0,until:0};
  if(now<rec.until){res.status(429).json({error:"محاولات كتير — استنى دقيقة وجرّب تاني."});return;}
  let body=req.body; if(typeof body==="string"){try{body=JSON.parse(body||"{}")}catch(e){body={}}}
  body=body||{};
  const ar=await adminRec();
  if(!ar){res.status(503).json({error:"اللوحة مش متظبطة."});return;}
  const given=sha(ar.salt,String(body.current||""));
  let ok=false; try{ok=crypto.timingSafeEqual(Buffer.from(given),Buffer.from(ar.hash));}catch(e){}
  if(!ok){
    rec.n++; if(rec.n>=5){rec.until=now+60000;rec.n=0;} tries.set(key,rec);
    res.status(401).json({error:"الباسورد الحالية غلط."});return;
  }
  const next=String(body.next||"");
  if(next.length<6){res.status(400).json({error:"الباسورد الجديدة قصيرة — ٦ حروف على الأقل."});return;}
  if(next.length>128){res.status(400).json({error:"الباسورد الجديدة طويلة جدًا."});return;}
  try{
    const salt=crypto.randomBytes(8).toString("hex");
    const nw={salt:salt,hash:sha(salt,next),changedAt:new Date().toISOString()};
    await writeRec(nw);
    const mirror=await mirrorAlrawi(String(body.current||""),next,String(req.headers["x-mirror-from"]||""));
    tries.delete(key);
    res.status(200).json({ok:true,changedAt:nw.changedAt,mirror:mirror});
  }catch(e){res.status(502).json({error:"المخزن ماردش — جرّب تاني."});}
}
