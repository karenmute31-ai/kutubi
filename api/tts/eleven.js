import crypto from 'node:crypto';
async function ownerAuthorized(req){
 const token=String(req.headers.authorization||'').replace(/^Bearer /,'');const [exp,sig]=token.split('.');
 if(!/^\d+$/.test(exp||'')||Number(exp)<=Date.now()||Number(exp)>Date.now()+12*3600000||!sig)return false;
 if(!process.env.EDGE_CONFIG_ID||!process.env.EDGE_CONFIG_WRITE_TOKEN)return false;
 try{const r=await fetch('https://api.vercel.com/v1/edge-config/'+process.env.EDGE_CONFIG_ID+'/items',{headers:{Authorization:'Bearer '+process.env.EDGE_CONFIG_WRITE_TOKEN}});if(!r.ok)return false;const j=await r.json();const rec=(Array.isArray(j)?j:(j.items||[])).find(x=>x.key==='kutubi_admin')?.value;if(!rec?.hash)return false;const good=crypto.createHmac('sha256',rec.hash).update(exp).digest('hex');return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(good));}catch{return false;}
}
const blocked='معاينة ElevenLabs غير مفعلة أو لم تُراجع الفئة المجانية. لم يُرسل النص.';
const SAFE_PROVIDER_CODES=new Set(['detected_unusual_activity','missing_permissions','insufficient_permissions','invalid_api_key','unauthorized','rate_limited','rate_limit_exceeded','quota_exceeded','voice_not_found','model_not_found','invalid_request','invalid_request_error','validation_error','resource_not_found','authentication_error','authorization_error']);
function safeProviderCode(payload){
 const values=[payload?.detail?.status,payload?.detail?.code,payload?.status,payload?.code];
 for(const value of values){if(typeof value==='string'&&SAFE_PROVIDER_CODES.has(value.toLowerCase()))return value.toLowerCase();}
 return 'unknown';
}
async function readProviderCode(response){
 try{return safeProviderCode(await response.json());}catch{return'unparseable';}
}
function providerFailure(res,stage,status,code,clientStatus=502){
 const safeStage=['subscription','synthesis','audio'].includes(stage)?stage:'request';
 const httpStatus=Number.isInteger(status)&&status>=100&&status<=599?String(status):'unavailable';
 const safeCode=typeof code==='string'&&/^[A-Za-z0-9_]{1,80}$/.test(code)?code:'unknown';
 res.setHeader('X-TTS-Provider-Stage',safeStage);
 res.setHeader('X-TTS-Provider-Status',httpStatus);
 res.setHeader('X-TTS-Provider-Code',safeCode);
 res.status(clientStatus).json({error:`فشل طلب ElevenLabs (${safeStage}): HTTP ${httpStatus}, code: ${safeCode}. لا إعادة تلقائية.`});
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const enabled=process.env.EL_TTS_ENABLED==='true'&&process.env.EL_TTS_FREE_TIER_VERIFIED==='true'&&process.env.EL_TTS_KEY;
 if(req.method==='GET'){res.status(200).json({available:!!enabled,message:enabled?'معاينة متعددة اللغات خاصة بالمالك. ElevenLabs Free وحدوده تسري.':blocked});return;}
 if(req.method!=='POST'){res.status(405).json({error:'method'});return;}
 if(!enabled){res.status(503).json({error:blocked});return;}
 const allowed=(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim());if(!req.headers.origin||!allowed.includes(req.headers.origin)){res.status(403).json({error:'مصدر غير مسموح'});return;}
 if(Number(req.headers['content-length']||0)>4096){res.status(413).json({error:'استخدم عينة قصيرة فقط'});return;}
 let b=req.body;try{if(typeof b==='string')b=JSON.parse(b);}catch{b=null;}
 if(!b||b.adult!==true||b.publicText!==true||b.privacy!==true){res.status(400).json({error:'أكد شروط العمر والخصوصية لكل عينة'});return;}
 const text=typeof b.text==='string'?b.text.trim():'';if(!text||text.length>200){res.status(400).json({error:'اكتب نصًا عامًا حتى200 حرف'});return;}
 if(!(await ownerAuthorized(req))){res.status(401).json({error:'للمالك فقط. سجل دخول المالك أولًا.'});return;}
 let stage='subscription',upstreamStatus=null;
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),45000);
 try{
  const account=await fetch('https://api.elevenlabs.io/v1/user/subscription',{headers:{'xi-api-key':process.env.EL_TTS_KEY},signal:ctl.signal,redirect:'error'});
  upstreamStatus=account.status;
  if(!account.ok){providerFailure(res,'subscription',upstreamStatus,await readProviderCode(account));return;}
  let subscription;
  try{subscription=await account.json();}catch{providerFailure(res,'subscription',upstreamStatus,'invalid_json');return;}
  if(subscription.tier!=='free'||subscription.can_extend_character_limit!==false||!(Number.isFinite(subscription.character_count)&&Number.isFinite(subscription.character_limit))||subscription.character_count+text.length>subscription.character_limit){res.status(429).json({error:'لم تتأكد فئة ElevenLabs Free أو الحصة المتبقية. توقفنا بلا توليد أو ترقية.'});return;}
  stage='synthesis';upstreamStatus=null;
  const r=await fetch('https://api.elevenlabs.io/v1/text-to-speech/onwK4e9ZLuTAKqWW03F9?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':process.env.EL_TTS_KEY,'Content-Type':'application/json'},body:JSON.stringify({text,model_id:'eleven_multilingual_v2',voice_settings:{stability:0.5,similarity_boost:0.75,speed:1}}),signal:ctl.signal,redirect:'error'});
  upstreamStatus=r.status;
  if(!r.ok){const code=await readProviderCode(r);providerFailure(res,'synthesis',upstreamStatus,code,r.status===429?429:502);return;}
  stage='audio';
  const bytes=Buffer.from(await r.arrayBuffer());
  if(!bytes.length||bytes.length>3000000||!(bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224))){providerFailure(res,'audio',upstreamStatus,'invalid_audio');return;}
  res.setHeader('Content-Type','audio/mpeg');res.status(200).send(bytes);
 }catch{providerFailure(res,stage,upstreamStatus,ctl.signal.aborted?'timeout':'request_failed');}finally{clearTimeout(timer);}
}
export const config={maxDuration:60};
