import crypto from 'node:crypto';
async function ownerAuthorized(req){
 const token=String(req.headers.authorization||'').replace(/^Bearer /,'');const [exp,sig]=token.split('.');
 if(!/^\d+$/.test(exp||'')||Number(exp)<=Date.now()||Number(exp)>Date.now()+12*3600000||!sig)return false;
 if(!process.env.EDGE_CONFIG_ID||!process.env.EDGE_CONFIG_WRITE_TOKEN)return false;
 try{const r=await fetch('https://api.vercel.com/v1/edge-config/'+process.env.EDGE_CONFIG_ID+'/items',{headers:{Authorization:'Bearer '+process.env.EDGE_CONFIG_WRITE_TOKEN}});if(!r.ok)return false;const j=await r.json();const rec=(Array.isArray(j)?j:(j.items||[])).find(x=>x.key==='alrawi_admin')?.value;if(!rec?.hash)return false;const good=crypto.createHmac('sha256',rec.hash).update(exp).digest('hex');return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(good));}catch{return false;}
}
const blocked='معاينة Cloudflare غير مفعلة أو لم تُراجع الفئة المجانية. لم يُرسل النص.';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const enabled=process.env.CF_TTS_ENABLED==='true'&&process.env.CF_TTS_FREE_TIER_VERIFIED==='true'&&process.env.CF_TTS_TOKEN&&/^[a-f0-9]{32}$/.test(process.env.CF_TTS_ACCOUNT_ID||'');
 if(req.method==='GET'){res.status(200).json({available:!!enabled,englishOnly:true,message:enabled?'معاينة إنجليزية خاصة بالمالك. Workers Free وحدوده تسري.':blocked});return;}
 if(req.method!=='POST'){res.status(405).json({error:'method'});return;}
 if(!enabled){res.status(503).json({error:blocked});return;}
 const allowed=(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim());if(!req.headers.origin||!allowed.includes(req.headers.origin)){res.status(403).json({error:'مصدر غير مسموح'});return;}
 if(Number(req.headers['content-length']||0)>4096){res.status(413).json({error:'استخدم عينة قصيرة فقط'});return;}
 let b=req.body;try{if(typeof b==='string')b=JSON.parse(b);}catch{b=null;}
 if(!b||b.adult!==true||b.publicText!==true||b.privacy!==true){res.status(400).json({error:'أكد شروط العمر والخصوصية لكل عينة'});return;}
 const text=typeof b.text==='string'?b.text.trim():'';if(!text||text.length>200||/[^\x20-\x7E\n\r\t]/.test(text)){res.status(400).json({error:'هذه المعاينة إنجليزية فقط، حتى200 حرف'});return;}
 if(!(await ownerAuthorized(req))){res.status(401).json({error:'للمالك فقط. سجل دخول المالك أولًا.'});return;}
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),45000);
 try{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CF_TTS_ACCOUNT_ID+'/ai/run/@cf/deepgram/aura-2-en',{method:'POST',headers:{Authorization:'Bearer '+process.env.CF_TTS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({text,speaker:'luna',encoding:'mp3'}),signal:ctl.signal,redirect:'error'});
 if(!r.ok){res.status(r.status===429?429:502).json({error:r.status===429?'انتهت حصة Cloudflare أو معدل الطلبات. لا ترقية أو إعادة تلقائية.':'تعذر توليد صوت Cloudflare. راجع إتاحة النموذج والحساب.'});return;}
 const bytes=Buffer.from(await r.arrayBuffer());if(!bytes.length||bytes.length>3000000||!(bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224)))throw Error('invalid audio');res.setHeader('Content-Type','audio/mpeg');res.status(200).send(bytes);
 }catch{res.status(502).json({error:'لم يكتمل توليد العينة الإنجليزية. لا إعادة تلقائية.'});}finally{clearTimeout(timer);}
}
export const config={maxDuration:60};
