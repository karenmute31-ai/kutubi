/* guard: ligature لا/لأ — pdf.js بيطلّع الألف كعنصر عرضه صفر قبل اللام؛ pdftext لازم يرجّع الترتيب */
const assert=require('assert');const P=require('../pdftext.js');
const it=(s,x,w)=>({str:s,transform:[10,0,0,10,x,700],width:w,height:10});
// visual order right-to-left in the stream: ... 'ﻣ'(x=50) then zero-width 'ا' + 'ل' at x=40 then 'س' x=30  => logical sequence reading by x desc
const items=[it('ﺔ',70,5),it('ﻣ',60,6),it('ا',50,0),it('ل',50,8),it('ﺳ',40,9)];
const out=P.itemsToLines(items).join(' ').normalize('NFKC');
assert(/لا/.test(out)&&!/ال/.test(out.replace(/^ال/,'')),'lam-alef order: '+out);
console.log('lam-alef guard passed:',out);
// Chrome/Skia Naskh pattern: spaces between the zero-width alef and the lam, and the lam is the LAST char of a longer item
const it2=(s,x,w,y=700)=>({str:s,transform:[10,0,0,10,x,y],width:w,height:10});
const o2=P.itemsToLines([it2('ﺗ',407,7),it2(' ',414,7.5),it2('ا',420,0),it2(' ',414,7.5),it2('ل',420,14),it2(' ',434,7.5),it2('ﺔ',440,13)]).join(' ').normalize('NFKC');
assert(/لا/.test(o2)&&!/ل ا/.test(o2),'spaced lam-alef: '+o2);
assert(P.expandText('الإدارة لأن ل ا أحد')==='الإدارة لأن لا أحد','split lam alef');
console.log('lam-alef spaced guard passed:',o2);
