// Guard: protects the human-owned rule files from being overwritten.
// Usage: node tests/rules-guard.js [path-to-rules-file]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rulesPath = process.argv[2] || path.join(ROOT, 'AGENT_RULES.md');
const statePath = path.join(ROOT, 'STATE.md');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ok ' + msg); }
  else { failed++; console.log('  FAIL ' + msg); }
}

let rules = '';
let state = '';
try { rules = fs.readFileSync(rulesPath, 'utf8').replace(/\r\n/g, '\n'); }
catch (e) { console.log('  FAIL cannot read rules file: ' + rulesPath); }
try { state = fs.readFileSync(statePath, 'utf8').replace(/\r\n/g, '\n'); }
catch (e) { console.log('  FAIL cannot read STATE.md'); }

ok(rules.split('\n').length >= 55, 'rules file has at least 55 lines');
ok(rules.startsWith('# AGENT RULES'), 'rules title present');

['A) Scope', 'B) Safety', 'C) Process', 'D) Honesty', 'E) Code quality', 'F) Reporting', 'G) Hard safety']
  .forEach(function (s) { ok(rules.includes('## ' + s), 'section present: ' + s); });

for (let n = 1; n <= 40; n++) {
  ok(new RegExp('^' + n + '\\. ', 'm').test(rules), 'rule number ' + n + ' present');
}

ok(rules.includes('Never open C:\\Users\\Win10\\wasla'), 'wasla protection rule intact');
ok(rules.includes('Never push or merge without explicit approval'), 'no push/merge rule intact');
ok(rules.includes('Report only what a command output proved'), 'honesty rule intact');
ok(rules.includes('Root-cause protocol'), 'root-cause rule intact');
ok(rules.includes('Never overwrite a tracked file'), 'no-overwrite rule intact');

ok(state.includes('## Done'), 'STATE.md has Done section');
ok(state.includes('## Pending'), 'STATE.md has Pending section');
ok(state.includes('## Decisions'), 'STATE.md has Decisions section');

console.log('rules guard: ' + (passed + failed) + ' checks, ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);