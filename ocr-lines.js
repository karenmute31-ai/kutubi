/* Free, local OCR recovery for Arabic fonts whose dots confuse automatic line finding.
   Keep good page OCR unchanged. Retry only weak pages with separated horizontal text
   rows, then keep the retry only when its confidence and text coverage improve.
   No dictionary replacements, language model, upload or per-book rules. */
(function(root){
 'use strict';
 const queues=new WeakMap();
 function bandsFromPixels(pixels,width,height){
  if(!width||!height||pixels.length<width*height*4)return [];
  const grayHist=new Uint32Array(256),rows=new Uint32Array(height),cols=new Uint32Array(width);
  for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3]/255;const g=Math.round((pixels[i]*.299+pixels[i+1]*.587+pixels[i+2]*.114)*a+255*(1-a));grayHist[g]++;}
  let sum=0,bg=255;for(let i=0;i<256;i++){sum+=grayHist[i];if(sum>=width*height*.8){bg=i;break;}}
  if(bg<170)return []; // Leave dark/photos/ambiguous backgrounds to the engine.
  const threshold=Math.min(200,bg-35),minInk=Math.max(2,Math.round(width*.001));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,a=pixels[i+3]/255;const g=(pixels[i]*.299+pixels[i+1]*.587+pixels[i+2]*.114)*a+255*(1-a);if(g<threshold){rows[y]++;cols[x]++;}}
  const raw=[];for(let y=0;y<height;y++){if(rows[y]<minInk)continue;const prev=raw[raw.length-1];if(prev&&y===prev.bottom+1)prev.bottom=y;else raw.push({top:y,bottom:y});}
  if(!raw.length)return [];
  const heights=raw.map(b=>b.bottom-b.top+1).sort((a,b)=>a-b),typical=heights[Math.floor(heights.length*.75)];
  const mergeGap=Math.max(2,Math.min(12,Math.round(typical*.22))),bands=[];
  for(const b of raw){const prev=bands[bands.length-1];if(prev&&b.top-prev.bottom-1<=mergeGap)prev.bottom=b.bottom;else bands.push({...b});}
  if(bands.length>60)return [];
  let left=0,right=width-1;while(left<right&&!cols[left])left++;while(right>left&&!cols[right])right--;
  // Do not concatenate newspaper/book columns into a single fabricated reading order.
  let gap=0;for(let x=left;x<=right;x++){gap=cols[x]<2?gap+1:0;if(gap>Math.max(24,(right-left)*.12)&&x-gap>left+(right-left)*.2&&x<left+(right-left)*.8)return [];}
  for(const b of bands){
   b.left=width;b.right=0;
   for(let y=b.top;y<=b.bottom;y++)for(let x=left;x<=right;x++){const i=(y*width+x)*4,a=pixels[i+3]/255;const g=(pixels[i]*.299+pixels[i+1]*.587+pixels[i+2]*.114)*a+255*(1-a);if(g<threshold){b.left=Math.min(b.left,x);b.right=Math.max(b.right,x);}}
   if(b.bottom-b.top<4||b.bottom-b.top>300||b.right-b.left<8)return [];
  }
  return bands;
 }
 async function toCanvas(input){
  if(input&&typeof input.getContext==='function')return input;
  let img=input,owned=false,url=null;
  try{
   if(typeof Blob!=='undefined'&&input instanceof Blob){
    if(typeof createImageBitmap==='function'){img=await createImageBitmap(input);owned=true;}
    else{url=URL.createObjectURL(input);img=new Image();img.src=url;await img.decode();}
   }else if(typeof input==='string'){img=new Image();img.src=input;await img.decode();}
   const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
   if(!w||!h||w*h>32000000)throw new Error('OCR_IMAGE_SIZE');
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0);return canvas;
  }finally{if(owned&&img.close)img.close();if(url)URL.revokeObjectURL(url);}
 }
 function letters(t){return (String(t||'').match(/[A-Za-z\u0621-\u064a\u066e-\u06d3]/g)||[]).length;}
 function arabic(t){return (String(t||'').match(/[\u0621-\u064a\u066e-\u06d3]/g)||[]).length;}
 async function run(worker,input,options){
  const opts=options||{},original=await worker.recognize(input),data=original&&original.data||{},text=data.text||'';
  const confidence=Number(data.confidence);
  if(!worker.setParameters||!Number.isFinite(confidence)||confidence>=80)return original;
  let changed=false;
  try{
   const canvas=await toCanvas(input),scale=Math.min(1,1600/canvas.width,2400/canvas.height);
   const analysis=document.createElement('canvas');analysis.width=Math.max(1,Math.round(canvas.width*scale));analysis.height=Math.max(1,Math.round(canvas.height*scale));
   const ctx=analysis.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,analysis.width,analysis.height);ctx.drawImage(canvas,0,0,analysis.width,analysis.height);
   const bands=bandsFromPixels(ctx.getImageData(0,0,analysis.width,analysis.height).data,analysis.width,analysis.height);
   analysis.width=analysis.height=0;
   if(!bands.length)return original;
   const start=Date.now(),lines=[];let weighted=0,weight=0;
   await worker.setParameters({tessedit_pageseg_mode:'7'});changed=true;
   for(const band of bands){
    if((opts.isCancelled&&opts.isCancelled())||Date.now()-start>(opts.budgetMs||30000))return original;
    const x=Math.max(0,Math.floor(band.left/scale)),y=Math.max(0,Math.floor(band.top/scale));
    const w=Math.min(canvas.width-x,Math.ceil((band.right-band.left+1)/scale)),h=Math.min(canvas.height-y,Math.ceil((band.bottom-band.top+1)/scale));
    const padding=20,line=document.createElement('canvas');line.width=w+padding*2;line.height=h+padding*2;
    const lc=line.getContext('2d');lc.fillStyle='#fff';lc.fillRect(0,0,line.width,line.height);lc.drawImage(canvas,x,y,w,h,padding,padding,w,h);
    let result=await worker.recognize(line),ld=result&&result.data||{};
    // Normalize a weak baseline before trying raw-line mode. Arabic line finding
    // is sensitive to raster height, even for a clean, correctly shaped line.
    if(!String(ld.text||'').trim()||(Number(ld.confidence)||0)<65){
     const small=document.createElement('canvas'),factor=35/h;
     small.width=Math.max(1,Math.round(line.width*factor));small.height=Math.max(1,Math.round(line.height*factor));
     const sc=small.getContext('2d');sc.fillStyle='#fff';sc.fillRect(0,0,small.width,small.height);sc.drawImage(line,0,0,small.width,small.height);
     const retry=await worker.recognize(small),rd=retry&&retry.data||{};small.width=small.height=0;
     if(String(rd.text||'').trim()&&(!String(ld.text||'').trim()||(Number(rd.confidence)||0)>(Number(ld.confidence)||0)+3))ld=rd;
    }
    if(!String(ld.text||'').trim()||(Number(ld.confidence)||0)<65){
     await worker.setParameters({tessedit_pageseg_mode:'13'});
     const retry=await worker.recognize(line),rd=retry&&retry.data||{};
     await worker.setParameters({tessedit_pageseg_mode:'7'});
     if(String(rd.text||'').trim()&&(!String(ld.text||'').trim()||(Number(rd.confidence)||0)>(Number(ld.confidence)||0)+3))ld=rd;
    }
    const lt=String(ld.text||'').trim();line.width=line.height=0;
    if(!lt)return original;lines.push(lt);const n=Math.max(1,letters(lt));weighted+=(Number(ld.confidence)||0)*n;weight+=n;
   }
   const candidate=lines.join('\n'),candidateConfidence=weighted/Math.max(1,weight);
   if(arabic(candidate)>=8&&letters(candidate)>=letters(text)*.8&&candidateConfidence>=confidence+5){
    return {data:{text:candidate,confidence:candidateConfidence},ocrRecovery:{method:'separated-lines',lines:bands.length,originalConfidence:confidence}};
   }
   return original;
  }catch(error){if(opts.isCancelled&&opts.isCancelled())throw error;return original;}
  finally{if(changed)await worker.setParameters({tessedit_pageseg_mode:'6'});}
 }
 function recognize(worker,input,options){
  const next=(queues.get(worker)||Promise.resolve()).catch(()=>{}).then(()=>run(worker,input,options));
  queues.set(worker,next.catch(()=>{}));return next;
 }
 const api={recognize,bandsFromPixels};if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.LocalOcrLines=api;
})(typeof window!=='undefined'?window:globalThis);
