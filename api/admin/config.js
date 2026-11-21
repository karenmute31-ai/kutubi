/* كونفيج التطبيق السحابي (Edge Config) — قراءة عامة، كتابة بتوكن المالك بس */
import crypto from "crypto";
const ECID=()=>process.env.EDGE_CONFIG_ID, WTOK=()=>process.env.EDGE_CONFIG_WRITE_TOKEN;
async function readAll(){
  const r=await fetch("https://api.vercel.com/v1/edge-config/"+ECID()+"/items",{headers:{Authorization:"Bearer "+WTOK()}});
  if(!r.ok) throw new Error("store");
  const d=await r.json(); const out={};
  for(const it of (d.items||d||[])) out[it.key]=it.value;
  return out;
}
let _ac={t:0,rec:null};
function _sha(salt,pw){return crypto.createHmac("sha256","kutubi-admin").update(salt+"|"+pw).digest("hex");}
async function _adminRec(){
  if(_ac.rec && Date.now()-_ac.t<30000) return _ac.rec;
  const r=await fetch("https://api.vercel.com/v1/edge-config/"+ECID()+"/items",{headers:{Authorization:"Bearer "+WTOK()}});
  if(!r.ok) return null;
  const d=await r.json();
  const it=(Array.isArray(d)?d:(d.items||[])).find(x=>x.key==="kutubi_admin");
  if(it&&it.value&&it.value.hash){_ac={t:Date.now(),rec:it.value};return it.value;}
  const env=process.env.ADMIN_SECRET; if(!env) return null;
  const salt=crypto.randomBytes(8).toString("hex");
  const rec={salt:salt,hash:_sha(salt,env),changedAt:new Date().toISOString()};
  await fetch("https://api.vercel.com/v1/edge-config/"+ECID()+"/items",{method:"PATCH",headers:{Authorization:"Bearer "+WTOK(),"Content-Type":"application/json"},body:JSON.stringify({items:[{operation:"upsert",key:"kutubi_admin",value:rec}]})});
  _ac={t:Date.now(),rec:rec}; return rec;
}
async function okToken(req){
  const ar=await _adminRec(); if(!ar) return false;
  const h=req.headers["authorization"]||""; const t=h.startsWith("Bearer ")?h.slice(7):"";
  const i=t.lastIndexOf("."); if(i<1) return false;
  const exp=t.slice(0,i), sig=t.slice(i+1);
  if(Number(exp)<Date.now()) return false;
  const good=crypto.createHmac("sha256",ar.hash).update(exp).digest("hex");
  try{ return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(good)); }catch(e){ return false; }
}
export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
  if(req.method==="OPTIONS"){res.status(204).end();return;}
  if(!ECID()||!WTOK()){res.status(200).json({config:{customButtons:[],customTabs:[],announcement:""},degraded:true});return;}
  try{
    if(req.method==="GET"){
      const all=await readAll();
      res.status(200).json({config:all["kutubi_config"]||{customButtons:[],customTabs:[],announcement:""}}); return;
    }
    if(req.method==="PUT"){
      if(!(await okToken(req))){res.status(401).json({error:"محتاج تسجيل دخول المالك."});return;}
      let body=req.body; if(typeof body==="string"){try{body=JSON.parse(body||"{}")}catch(e){body={}}}
      const cfg=(body&&body.config&&typeof body.config==="object")?body.config:null;
      if(!cfg){res.status(400).json({error:"ناقص config"});return;}
      const clean={announcement:String(cfg.announcement||"").slice(0,500),
        customButtons:(Array.isArray(cfg.customButtons)?cfg.customButtons:[]).slice(0,12).map(b=>({
          icon:String(b.icon||"🔹").slice(0,8), label:String(b.label||"").slice(0,40),
          tab:String(b.tab||"").slice(0,24), url:String(b.url||"").slice(0,300)})).filter(b=>b.label&&(b.tab||b.url)),
        customTabs:(Array.isArray(cfg.customTabs)?cfg.customTabs:[]).slice(0,12).map(t=>({
          icon:String(t.icon||"📑").slice(0,8), label:String(t.label||"").slice(0,40),
          url:String(t.url||"").slice(0,300), note:String(t.note||"").slice(0,5000)})).filter(t=>t.label&&(t.url||t.note))};
      const r=await fetch("https://api.vercel.com/v1/edge-config/"+ECID()+"/items",{method:"PATCH",
        headers:{Authorization:"Bearer "+WTOK(),"Content-Type":"application/json"},
        body:JSON.stringify({items:[{operation:"upsert",key:"kutubi_config",value:clean}]})});
      if(!r.ok) throw new Error("write");
      res.status(200).json({ok:true,config:clean}); return;
    }
    res.status(405).json({error:"method"});
  }catch(e){res.status(502).json({error:"مخزن الكونفيج ماردش — جرّب تاني."});}
}
