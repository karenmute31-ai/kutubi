import crypto from 'node:crypto';
async function ownerAuthorized(req){
 const token=String(req.headers.authorization||'').replace(/^Bearer /,'');const [exp,sig]=token.split('.');
 if(!/^\d+$/.test(exp||'')||Number(exp)<=Date.now()||Number(exp)>Date.now()+12*3600000||!sig)return false;
 if(!process.env.EDGE_CONFIG_ID||!process.env.EDGE_CONFIG_WRITE_TOKEN)return false;
 try{const r=await fetch('https://api.vercel.com/v1/edge-config/'+process.env.EDGE_CONFIG_ID+'/items',{headers:{Authorization:'Bearer '+process.env.EDGE_CONFIG_WRITE_TOKEN}});if(!r.ok)return false;const j=await r.json();const rec=(Array.isArray(j)?j:(j.items||[])).find(x=>x.key==='kutubi_admin')?.value;if(!rec?.hash)return false;const good=crypto.createHmac('sha256',rec.hash).update(exp).digest('hex');return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(good));}catch{return false;}
}
const VOICES=['Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe','Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi','Laomedeia','Achernar','Alnilam','Schedar','Gacrux','Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat'];
const blocked='معاينة Gemini غير مفعلة: يلزم تحقق المالك من الحصة والخصوصية والقيود الإقليمية، وصلاحية المالك. لم يُرسل النص.';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const enabled=process.env.GEMINI_TTS_ENABLED==='true'&&process.env.GEMINI_TTS_FREE_TIER_VERIFIED==='true'&&process.env.GEMINI_TTS_KEY;
 if(req.method==='GET'){res.status(200).json({available:!!enabled,message:enabled?'للمالك فقط. لا سقف يومي يفرضه التطبيق؛ حدود Google تسري. لا ترسل نصًا خاصًا.':blocked});return;}
 if(req.method!=='POST'){res.status(405).json({error:'method'});return;}
 if(!enabled){res.status(503).json({error:blocked});return;}
 const origin=req.headers.origin;const allowed=(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim());
 if(!origin||!allowed.includes(origin)){res.status(403).json({error:'مصدر غير مسموح'});return;}
 if(Number(req.headers['content-length']||0)>4096){res.status(413).json({error:'استخدم عينة قصيرة فقط'});return;}
 let b=req.body;try{if(typeof b==='string')b=JSON.parse(b);}catch{b=null;}
 if(!b||b.adult!==true||b.publicText!==true||b.privacy!==true||b.eligibleRegion!==true){res.status(400).json({error:'أكد شروط العمر والخصوصية والمنطقة لكل تجربة'});return;}
 const text=typeof b.text==='string'?b.text.trim():'';
 if(!text||text.length>400||!VOICES.includes(b.voice)){res.status(400).json({error:'نص حتى ٤٠٠ حرف وصوت قياسي مطلوبان'});return;}
 if(!(await ownerAuthorized(req))){res.status(401).json({error:'المعاينة الشخصية للمالك فقط. سجل دخول المالك أولًا.'});return;}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{const r=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'x-goog-api-key':process.env.GEMINI_TTS_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:'gemini-3.8-flash-tts',store:false,input:[{type:'user_input',content:[{type:'text',text,annotations:[{type:'speech_metadata',style:'Speak in natural Egyptian Arabic, clear friendly educational delivery. Read exactly the transcript without adding words.'}]}]}],response_format:{type:'audio',mime_type:'audio/wav'},generation_config:{max_output_tokens:1200,speech_config:[{voice:b.voice}]}}),signal:controller.signal});if(!r.ok){res.status(r.status===429?429:502).json({error:r.status===429?'حصة Gemini غير متاحة الآن. لا يوجد تحويل تلقائي لخدمة مدفوعة.':'تعذر توليد الصوت من Gemini. راجع إتاحة النموذج والحساب.'});return;}const j=await r.json();const parts=(j.steps||[]).flatMap(s=>s.content||[]);const audio=parts.find(p=>p.type==='audio'&&p.data);if(!audio)throw Error();const bytes=Buffer.from(audio.data,'base64');if(!bytes.length||bytes.length>5000000)throw Error();res.setHeader('Content-Type','audio/wav');res.status(200).send(bytes);}catch{res.status(502).json({error:'لم يكتمل توليد الصوت. لا تُعد المحاولة تلقائيًا.'});}finally{clearTimeout(timer);}
}
export const config={maxDuration:60};
