const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {bandsFromPixels,recognize}=require('../ocr-lines.js');
let checks=0;const check=(fn)=>{fn();checks++};
function image(w,h,fill=255){const p=new Uint8ClampedArray(w*h*4);for(let i=0;i<p.length;i+=4){p[i]=p[i+1]=p[i+2]=fill;p[i+3]=255}return {p,w,h}}
function ink(im,x,y,w,h){for(let r=y;r<y+h;r++)for(let c=x;c<x+w;c++){let i=(r*im.w+c)*4;im.p[i]=im.p[i+1]=im.p[i+2]=0}}
check(()=>{let im=image(400,200);assert.equal(bandsFromPixels(im.p,im.w,im.h).length,0)});
check(()=>{let im=image(400,200,0);assert.equal(bandsFromPixels(im.p,im.w,im.h).length,0)});
check(()=>{let im=image(400,200,0);for(let i=3;i<im.p.length;i+=4)im.p[i]=0;assert.equal(bandsFromPixels(im.p,im.w,im.h).length,0)});
check(()=>{let im=image(400,200);[25,80,135].forEach(y=>ink(im,50,y,300,20));const b=bandsFromPixels(im.p,im.w,im.h);assert.equal(b.length,3);assert.deepEqual(b.map(x=>x.top),[25,80,135])});
check(()=>{let im=image(400,160);ink(im,70,15,220,3);ink(im,60,22,250,20);ink(im,60,90,250,20);assert.equal(bandsFromPixels(im.p,im.w,im.h).length,2)});
check(()=>{let im=image(400,160);for(let y of [20,80]){ink(im,10,y,110,20);ink(im,265,y,120,20)}assert.equal(bandsFromPixels(im.p,im.w,im.h).length,0,'Keep columns on page OCR, never invent column order')});
check(()=>{let im=image(400,850);for(let i=0;i<65;i++)ink(im,50,i*13+2,300,6);assert.equal(bandsFromPixels(im.p,im.w,im.h).length,0,'Bound the retry cost')});
check(()=>{const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');assert(html.indexOf('src="ocr-lines.js"')<html.indexOf('src="app.js"'));assert(sw.includes('./ocr-lines.js'),'Fallback must be available offline')});
(async()=>{
 const original={data:{text:'unchanged English and العربية',confidence:95}};let mutated=0;
 const worker={recognize:async()=>original,setParameters:async()=>{mutated++}};
 assert.equal(await recognize(worker,{}),original);assert.equal(mutated,0);checks++;
 await assert.rejects(recognize({recognize:async()=>{throw new Error('Expected engine failure')}},{}),/Expected engine failure/);checks++;
 let active=0,max=0;const serial={recognize:async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return original}};
 await Promise.all([recognize(serial,{}),recognize(serial,{})]);assert.equal(max,1);checks++;
 const savedDocument=global.document;
 const im=image(400,200);[25,80,135].forEach(y=>ink(im,50,y,300,20));
 global.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage(){},getImageData:()=>({data:im.p})})})};
 const input={width:400,height:200,getContext(){}};
 const weak={data:{text:'نص عربي مبعثر',confidence:40}};let params=[],n=0;
 const recovering={recognize:async()=>n++?{data:{text:'نص عربي واضح للاختبار',confidence:95}}:weak,setParameters:async p=>params.push(p.tessedit_pageseg_mode)};
 const recovered=await recognize(recovering,input);assert.equal(recovered.ocrRecovery.method,'separated-lines');assert.equal(recovered.ocrRecovery.lines,3);assert.deepEqual(params,['7','6']);checks++;
 n=0;params=[];const failing={recognize:async()=>{if(n++)throw new Error('Retry failed');return weak},setParameters:async p=>params.push(p.tessedit_pageseg_mode)};
 assert.equal(await recognize(failing,input),weak);assert.deepEqual(params,['7','6']);checks++;
 n=0;params=[];const cancelled={recognize:async()=>{n++;return weak},setParameters:async p=>params.push(p.tessedit_pageseg_mode)};
 assert.equal(await recognize(cancelled,input,{isCancelled:()=>true}),weak);assert.equal(n,1);assert.deepEqual(params,['7','6']);checks++;
 if(savedDocument===undefined)delete global.document;else global.document=savedDocument;
 console.log('PASS OCR recovery guards '+checks+'/'+checks);
})().catch(e=>{console.error(e);process.exitCode=1});
