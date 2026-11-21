'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILES = ['index.html', 'app.js', 'app2.js', 'app4.js', 'sw.js'];
const NEEDLE = 'cdnjs.cloudflare.com';
let failures = 0;
for (const rel of FILES) {
  const full = path.join(ROOT, rel);
  let text;
  try { text = fs.readFileSync(full, 'utf8'); } catch (e) { console.log('FAIL ' + rel + ' - read error: ' + e.message); failures++; continue; }
  if (text.includes(NEEDLE)) { console.log('FAIL ' + rel + ' - contains ' + NEEDLE); failures++; }
  else console.log('ok ' + rel + ' - no ' + NEEDLE);
}
console.log('no-cdn-guard: ' + (FILES.length - failures) + '/' + FILES.length + ' passed');
process.exit(failures ? 1 : 0);
