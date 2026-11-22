/* guard: رباطة لا اللي خطها يسجّلها حرفين عاديين — pdf.js بيعكسها «ال»؛ fixLigatureItems بيرجّعها من جليفات الـoperator list */
const assert=require('assert');const P=require('../pdftext.js');
// glyphs in visual (stream) order for السلامة: ة م [لا] س [لا]  (pdf.js reverses the whole string char by char)
const runs=[["ة","م","لا","س","ل","ا"],[" "],["و","لا"]];
const naive=Array.from(runs[0].join("")).reverse().join("");
assert.strictEqual(naive,"السالمة"); // the bug
const items=[{str:naive,transform:[10,0,0,10,100,700],width:50},{str:" ",transform:[10,0,0,10,90,700],width:3},{str:"ال"+"و",transform:[10,0,0,10,60,700],width:20}];
P.fixLigatureItems(items,runs);
assert.strictEqual(items[0].str,"السلامة");
assert.strictEqual(items[2].str,"لاو");
// unmatched item must stay untouched
const it2=[{str:"ما هذا",transform:[1,0,0,1,0,0],width:5}];
P.fixLigatureItems(it2,runs);assert.strictEqual(it2[0].str,"ما هذا");
console.log("ligature glyph guard passed:",items.map(i=>i.str).join("|"));
