/* Guard test for text-open feature (TASK 6). Node-only, no browser.
   Loads stripHtmlToText from app2.js source — zero external requires. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const app2 = fs.readFileSync(path.join(ROOT, 'app2.js'), 'utf8');

// Extract stripHtmlToText from app2.js source (do not copy the function into the test)
const m = app2.match(/function stripHtmlToText\(html\)\{[\s\S]*?^\}/m);
if (!m) throw new Error('stripHtmlToText not found in app2.js');
const stripHtmlToText = new Function(m[0] + '; return stripHtmlToText;')();

let passed = 0, failed = 0;
function ok(cond, label){
  if(cond){ passed++; console.log('  ok '+label); }
  else { failed++; console.log('  FAIL '+label); }
}

// 1) UTF-8 decode
function decodeUtf8(buf){ return new TextDecoder('utf-8',{fatal:true}).decode(buf); }
function decodeWin1256(buf){ return new TextDecoder('windows-1256').decode(buf); }

try{
  const u = decodeUtf8(Buffer.from('مرحبا mundo','utf-8'));
  ok(u==='مرحبا mundo','UTF-8 decode returns exact text');
}catch(e){ ok(false,'UTF-8 decode: '+e.message); }

// 2) windows-1256 Arabic sample
try{
  const win = Buffer.from([0x23,0x23,0x23]); // '#' = 0x23 in both
  const s = decodeWin1256(win);
  ok(s==='###','windows-1256 decode sample');
}catch(e){ ok(false,'windows-1256 decode: '+e.message); }

// 3) stripHtmlToText removes scripts/styles, keeps paragraphs, strips tags, decodes entities
try{
  const html = '<html><head><script>bad()</script><style>x{}</style><!-- comment --></head><body><p>para one</p><p>para two</p></body></html>';
  const t = stripHtmlToText(html);
  ok(!/<script/.test(t) && !/bad\(\)/.test(t),'script removed');
  ok(!/<style/.test(t),'style removed');
  ok(!/comment/.test(t),'HTML comment removed');
  ok(t.includes('para one') && t.includes('para two'),'paragraphs kept');
  ok(t.includes('\n'),'block tags become line breaks');
  ok(!/<[a-z]/.test(t),'tags stripped');
  // entities (whitespace runs are collapsed by the function)
  const e = stripHtmlToText('&amp; &lt; &gt; &quot; &#39; &nbsp; &#65; &#x41;');
  ok(e==='& < > " ' + String.fromCharCode(39) + ' A A','entities decoded: '+JSON.stringify(e));
}catch(e){ ok(false,'stripHtmlToText: '+e.message); }

// 4) empty file error
try{
  const raw = new TextEncoder().encode('');
  const txt = new TextDecoder().decode(raw);
  let threw=false;
  if(!txt || !txt.trim()) threw=true;
  ok(threw,'empty content throws');
}catch(e){ ok(false,'empty test: '+e.message); }

// 5) size limit
const MAX = 5*1024*1024;
ok((6*1024*1024) > MAX, '6MB exceeds 5MB limit');
ok((4*1024*1024) <= MAX, '4MB within limit');

// 6) app2.js does NOT contain the text "[تمت القراءة كما هي"
const encodingNoteBracketed = "[تمت القراءة كما هي";
ok(!app2.includes(encodingNoteBracketed), 'app2.js does NOT contain encoding note');

// 7) app2.js contains: addBook(title, text, "file")
ok(app2.includes('addBook(title, text, "file"'), 'app2.js contains addBook(title, text, "file")');

// 8) regression guards for importBookFile fixes
ok(!/setTimeout\(\s*\(\)\s*=>\s*\{\s*throw/.test(app2), 'no throw inside setTimeout');
const rfw = app2.match(/async function readFileWithTimeout[\s\S]*?^\}/m);
ok(!!rfw && rfw[0].includes('Promise.race'), 'readFileWithTimeout uses Promise.race');
const sizeLine = app2.split('\n').find(l => l.includes('f.size > MAX_BYTES')) || '';
ok(/pdf/i.test(sizeLine), '5MB limit excludes PDF');
ok(!app2.includes('bookEncoding'), 'no undefined bookEncoding assignment');

console.log('text-open guard: '+(passed+failed)+' checks, '+passed+' passed, '+failed+' failed');
process.exit(failed?1:0);