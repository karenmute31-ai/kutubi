/* guard: ligature لا/لأ — pdf.js بيطلّع الألف كعنصر عرضه صفر قبل اللام؛ pdftext لازم يرجّع الترتيب */
const assert=require('assert');const P=require('../pdftext.js');
const it=(s,x,w)=>({str:s,transform:[10,0,0,10,x,700],width:w,height:10});
// visual order right-to-left in the stream: ... 'ﻣ'(x=50) then zero-width 'ا' + 'ل' at x=40 then 'س' x=30  => logical sequence reading by x desc
const items=[it('ﺔ',70,5),it('ﻣ',60,6),it('ا',50,0),it('ل',50,8),it('ﺳ',40,9)];
const out=P.itemsToLines(items).join(' ').normalize('NFKC');
assert(/لا/.test(out)&&!/ال/.test(out.replace(/^ال/,'')),'lam-alef order: '+out);
console.log('lam-alef guard passed:',out);
