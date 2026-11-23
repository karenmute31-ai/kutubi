/* لوحة المالك — تسجيل الدخول: الباسورد متخزّنة كتجزئة مملّحة في مخزن الكونفيج (قابلة للتغيير من اللوحة)
   وأول مرة بتتزرع من ADMIN_SECRET. التوكن HMAC مفتاحه التجزئة الحالية — تغيير الباسورد بيلغي كل الجلسات. */
import crypto from "crypto";
const ECID=()=>process.env.EDGE_CONFIG_ID, WTOK=()=>process.env.EDGE_CONFIG_WRITE_TOKEN;
let cache={t:0,rec:null};
function sha(salt,pw){return crypto.createHmac("sha256","kutubi-admin").update(salt+"|"+pw).digest("hex");}
async function adminRec(){
  if(cache.rec && Date.now()-cache.t<30000) return cache.rec;
  if(!ECID()||!WTOK()) return null;
  const r=await fetch("https://api.vercel.com/v1/edge-config/"+ECID()+"/items",{headers:{Authorization:"Bearer "+WTOK()}});
  if(!r.ok) return null;
  const d=await r.json();
  const it=(Array.isArray(d)?d:(d.items||[])).find(x=>x.key==="kutubi_admin");
  if(it&&it.value&&it.value.hash){cache={t:Date.now(),rec:it.value};return it.value;}
  const env=process.env.ADMIN_SECRET; if(!env) return null;
  const salt=crypto.randomBytes(8).toString("hex");
  const rec={salt:salt,hash:sha(salt,env),changedAt:new Date().toISOString()};
  await fetch("https://api.vercel.com/v1/edge-config/"+ECID()+"/items",{method:"PATCH",headers:{Authorization:"Bearer "+WTOK(),"Content-Type":"application/json"},body:JSON.stringify({items:[{operation:"upsert",key:"kutubi_admin",value:rec}]})});
  cache={t:Date.now(),rec:rec};
  return rec;
}
const tries=new Map();
function ip(req){const f=req.headers["x-forwarded-for"];return (typeof f==="string"&&f)?f.split(",")[0].trim():"unknown";}
export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS"){res.status(204).end();return;}
  if(req.method!=="POST"){res.status(405).json({error:"method"});return;}
  const key=ip(req), now=Date.now();
  const rec=tries.get(key)||{n:0,until:0};
  if(now<rec.until){res.status(429).json({error:"محاولات كتير — استنى دقيقة وجرّب تاني."});return;}
  let body=req.body; if(typeof body==="string"){try{body=JSON.parse(body||"{}")}catch(e){body={}}}
  body=body||{};
  const ar=await adminRec();
  if(!ar){res.status(503).json({error:"اللوحة السحابية لسه مش متظبطة على السيرفر."});return;}
  const given=sha(ar.salt,String(body.password||""));
  let ok=false; try{ok=crypto.timingSafeEqual(Buffer.from(given),Buffer.from(ar.hash));}catch(e){}
  if(!ok){
    rec.n++; if(rec.n>=5){rec.until=now+60000;rec.n=0;} tries.set(key,rec);
    res.status(401).json({error:"باسورد الإدارة غلط."});return;
  }
  tries.delete(key);
  const exp=String(now+12*3600*1000);
  const sig=crypto.createHmac("sha256",ar.hash).update(exp).digest("hex");
  res.status(200).json({token:exp+"."+sig});
}
