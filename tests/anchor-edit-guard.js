'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const TOOL = path.resolve(__dirname, '..', 'tools', 'anchor-edit.js');
let checks = 0;
let failures = 0;

function ok(cond, label, detail) {
  checks++;
  if (cond) {
    console.log('ok   ' + label);
  } else {
    failures++;
    console.log('FAIL ' + label + (detail ? ' - ' + detail : ''));
  }
}

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aeg-'));
}

function writeFile(p, data) {
  fs.writeFileSync(p, data);
}

function readBuf(p) {
  return fs.readFileSync(p);
}

function runTool(args) {
  return spawnSync(process.execPath, [TOOL].concat(args), { encoding: 'utf8' });
}

function bufEq(a, b) {
  return Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.length === b.length && a.equals(b);
}

function hasLoneCR(buf) {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0d) {
      if (i + 1 >= buf.length || buf[i + 1] !== 0x0a) return true;
      i++;
    }
  }
  return false;
}

function hasLoneLF(buf) {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      if (i === 0 || buf[i - 1] !== 0x0d) return true;
    }
  }
  return false;
}

function hasCR(buf) {
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0d) return true;
  return false;
}

function countStr(hay, needle) {
  let c = 0, p = 0;
  while (true) {
    const i = hay.indexOf(needle, p);
    if (i === -1) break;
    c++;
    p = i + needle.length;
  }
  return c;
}

function cleanupDir(d) {
  try {
    const entries = fs.readdirSync(d);
    for (const e of entries) {
      try { fs.unlinkSync(path.join(d, e)); } catch (_) {}
    }
    fs.rmdirSync(d);
  } catch (_) {}
}

(async () => {
  // Case 1: CRLF file, replace mode, multi-line replacement written with LF
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const repl = path.join(d, 'r.txt');
      const orig = Buffer.from('AAA\r\nBBB\r\nCCC\r\n', 'utf8');
      writeFile(target, orig);
      writeFile(anchor, Buffer.from('BBB\r\n', 'utf8'));
      writeFile(repl, Buffer.from('X1\nX2\n', 'utf8'));
      const r = runTool([target, 'replace', anchor, repl]);
      const out = readBuf(target);
      const expected = Buffer.from('AAA\r\nX1\r\nX2\r\nCCC\r\n', 'utf8');
      ok(r.status === 0, 'case1 exit 0', 'status=' + r.status + ' stderr=' + (r.stderr||''));
      ok(bufEq(out, expected), 'case1 new lines CRLF, others identical', JSON.stringify(out.toString('utf8')));
      ok(!hasLoneLF(out), 'case1 no lone LF');
    } finally { cleanupDir(d); }
  }

  // Case 2: LF file, same -> no \r anywhere
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const repl = path.join(d, 'r.txt');
      writeFile(target, Buffer.from('AAA\nBBB\nCCC\n', 'utf8'));
      writeFile(anchor, Buffer.from('BBB\n', 'utf8'));
      writeFile(repl, Buffer.from('X1\r\nX2\r\n', 'utf8'));
      const r = runTool([target, 'replace', anchor, repl]);
      const out = readBuf(target);
      const expected = Buffer.from('AAA\nX1\nX2\nCCC\n', 'utf8');
      ok(r.status === 0, 'case2 exit 0', 'status=' + r.status);
      ok(bufEq(out, expected), 'case2 content expected', JSON.stringify(out.toString('utf8')));
      ok(!hasCR(out), 'case2 no \\r anywhere');
    } finally { cleanupDir(d); }
  }

  // Case 3: mixed file (CRLF dominant, one lone-LF line) -> new lines CRLF, lone-LF line untouched byte-for-byte
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const repl = path.join(d, 'r.txt');
      // dominant CRLF, line 3 is lone LF
      const orig = Buffer.from('A\r\nB\r\nLONE\nD\r\nE\r\n', 'utf8');
      writeFile(target, orig);
      writeFile(anchor, Buffer.from('D\r\n', 'utf8'));
      writeFile(repl, Buffer.from('X\nY\n', 'utf8'));
      const r = runTool([target, 'replace', anchor, repl]);
      const out = readBuf(target);
      const expected = Buffer.from('A\r\nB\r\nLONE\nX\r\nY\r\nE\r\n', 'utf8');
      ok(r.status === 0, 'case3 exit 0', 'status=' + r.status);
      ok(bufEq(out, expected), 'case3 new lines CRLF, lone-LF untouched', JSON.stringify(out.toString('utf8')));
      // verify the lone-LF line "LONE\n" still present byte-for-byte
      ok(out.indexOf(Buffer.from('LONE\n', 'utf8')) !== -1, 'case3 lone-LF line byte-for-byte');
    } finally { cleanupDir(d); }
  }

  // Case 4: zero matches -> exit 1, file bytes unchanged
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const repl = path.join(d, 'r.txt');
      const orig = Buffer.from('AAA\r\nBBB\r\n', 'utf8');
      writeFile(target, orig);
      writeFile(anchor, Buffer.from('ZZZ\r\n', 'utf8'));
      writeFile(repl, Buffer.from('X\r\n', 'utf8'));
      const r = runTool([target, 'replace', anchor, repl]);
      const out = readBuf(target);
      ok(r.status === 1, 'case4 exit 1', 'status=' + r.status);
      ok(bufEq(out, orig), 'case4 file unchanged');
    } finally { cleanupDir(d); }
  }

  // Case 5: two matches -> exit 1, file unchanged, output mentions count 2
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const repl = path.join(d, 'r.txt');
      const orig = Buffer.from('X\r\nY\r\nX\r\n', 'utf8');
      writeFile(target, orig);
      writeFile(anchor, Buffer.from('X\r\n', 'utf8'));
      writeFile(repl, Buffer.from('Z\r\n', 'utf8'));
      const r = runTool([target, 'replace', anchor, repl]);
      const out = readBuf(target);
      const combined = (r.stdout || '') + (r.stderr || '');
      ok(r.status === 1, 'case5 exit 1', 'status=' + r.status);
      ok(bufEq(out, orig), 'case5 file unchanged');
      ok(combined.indexOf('2') !== -1, 'case5 output mentions count 2', JSON.stringify(combined));
    } finally { cleanupDir(d); }
  }

  // Case 6: modes after and before
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const repl = path.join(d, 'r.txt');
      writeFile(target, Buffer.from('A\r\nB\r\nC\r\n', 'utf8'));
      writeFile(anchor, Buffer.from('B\r\n', 'utf8'));
      writeFile(repl, Buffer.from('AFTER\r\n', 'utf8'));
      let r = runTool([target, 'after', anchor, repl]);
      let out = readBuf(target);
      ok(r.status === 0 && bufEq(out, Buffer.from('A\r\nB\r\nAFTER\r\nC\r\n', 'utf8')), 'case6 after mode', JSON.stringify(out.toString('utf8')) + ' status=' + r.status);
    } finally { cleanupDir(d); }
  }
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const repl = path.join(d, 'r.txt');
      writeFile(target, Buffer.from('A\r\nB\r\nC\r\n', 'utf8'));
      writeFile(anchor, Buffer.from('B\r\n', 'utf8'));
      writeFile(repl, Buffer.from('BEFORE\r\n', 'utf8'));
      let r = runTool([target, 'before', anchor, repl]);
      let out = readBuf(target);
      ok(r.status === 0 && bufEq(out, Buffer.from('A\r\nBEFORE\r\nB\r\nC\r\n', 'utf8')), 'case6 before mode', JSON.stringify(out.toString('utf8')) + ' status=' + r.status);
    } finally { cleanupDir(d); }
  }

  // Case 7: cut valid; part2 before part1 -> exit 1 unchanged; ambiguous part1 -> exit 1 unchanged
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      writeFile(target, Buffer.from('A\r\nSTART\r\nMID\r\nEND\r\nZ\r\n', 'utf8'));
      writeFile(anchor, Buffer.from('START\r\nMID\r\n\r\n-----8<-----\r\nEND\r\n', 'utf8'));
      const r = runTool([target, 'cut', anchor]);
      const out = readBuf(target);
      ok(r.status === 0 && bufEq(out, Buffer.from('A\r\nZ\r\n', 'utf8')), 'case7 cut valid', JSON.stringify(out.toString('utf8')) + ' status=' + r.status + ' stderr=' + (r.stderr||''));
    } finally { cleanupDir(d); }
  }
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const orig = Buffer.from('END\r\nMID\r\nSTART\r\n', 'utf8');
      writeFile(target, orig);
      // part1 = START, part2 = END, but END appears before START
      writeFile(anchor, Buffer.from('START\r\n\r\n-----8<-----\r\nEND\r\n', 'utf8'));
      const r = runTool([target, 'cut', anchor]);
      const out = readBuf(target);
      ok(r.status === 1, 'case7 part2 before part1 exit 1', 'status=' + r.status);
      ok(bufEq(out, orig), 'case7 part2 before part1 unchanged');
    } finally { cleanupDir(d); }
  }
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const orig = Buffer.from('X\r\nY\r\nX\r\nZ\r\n', 'utf8');
      writeFile(target, orig);
      writeFile(anchor, Buffer.from('X\r\n\r\n-----8<-----\r\nZ\r\n', 'utf8'));
      const r = runTool([target, 'cut', anchor]);
      const out = readBuf(target);
      ok(r.status === 1, 'case7 ambiguous part1 exit 1', 'status=' + r.status);
      ok(bufEq(out, orig), 'case7 ambiguous part1 unchanged');
    } finally { cleanupDir(d); }
  }

  // Case 8: replacement containing literal $& $1 ${x} and a backtick -> inserted literally
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const repl = path.join(d, 'r.txt');
      writeFile(target, Buffer.from('A\r\nMARK\r\nC\r\n', 'utf8'));
      writeFile(anchor, Buffer.from('MARK\r\n', 'utf8'));
      const lit = 'LIT $& $1 ${x} `tick`\r\n';
      writeFile(repl, Buffer.from(lit, 'utf8'));
      const r = runTool([target, 'replace', anchor, repl]);
      const out = readBuf(target);
      const expected = Buffer.from('A\r\nLIT $& $1 ${x} `tick`\r\nC\r\n', 'utf8');
      ok(r.status === 0 && bufEq(out, expected), 'case8 literals inserted literally', JSON.stringify(out.toString('utf8')));
    } finally { cleanupDir(d); }
  }

  // Case 9: Arabic text + a file starting with a BOM -> bytes outside the edit identical
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const repl = path.join(d, 'r.txt');
      const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
      const orig = Buffer.concat([bom, Buffer.from('مرحبا\r\nANCHOR\r\nنهاية\r\n', 'utf8')]);
      writeFile(target, orig);
      writeFile(anchor, Buffer.from('ANCHOR\r\n', 'utf8'));
      writeFile(repl, Buffer.from('بديل\r\n', 'utf8'));
      const r = runTool([target, 'replace', anchor, repl]);
      const out = readBuf(target);
      const expected = Buffer.concat([bom, Buffer.from('مرحبا\r\nبديل\r\nنهاية\r\n', 'utf8')]);
      ok(r.status === 0 && bufEq(out, expected), 'case9 Arabic+BOM outside edit identical', 'status=' + r.status);
      ok(out[0] === 0xEF && out[1] === 0xBB && out[2] === 0xBF, 'case9 BOM preserved');
    } finally { cleanupDir(d); }
  }

  // Case 10: file with no trailing newline stays without one
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const repl = path.join(d, 'r.txt');
      writeFile(target, Buffer.from('AAA\r\nBBB', 'utf8'));
      writeFile(anchor, Buffer.from('BBB', 'utf8'));
      writeFile(repl, Buffer.from('CCC', 'utf8'));
      const r = runTool([target, 'replace', anchor, repl]);
      const out = readBuf(target);
      const expected = Buffer.from('AAA\r\nCCC', 'utf8');
      ok(r.status === 0 && bufEq(out, expected), 'case10 no trailing newline preserved', JSON.stringify(out.toString('utf8')));
      ok(out[out.length - 1] !== 0x0a && out[out.length - 1] !== 0x0d, 'case10 still no trailing newline');
    } finally { cleanupDir(d); }
  }

  // Case 11: stdout has OK and the printed delta equals the real byte delta
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const repl = path.join(d, 'r.txt');
      const orig = Buffer.from('AAA\r\nBBB\r\n', 'utf8');
      writeFile(target, orig);
      writeFile(anchor, Buffer.from('BBB\r\n', 'utf8'));
      writeFile(repl, Buffer.from('LONGER\r\n', 'utf8'));
      const r = runTool([target, 'replace', anchor, repl]);
      const out = readBuf(target);
      const realDelta = out.length - orig.length;
      const m = (r.stdout || '').match(/OK delta=(-?\d+)/);
      ok(r.status === 0 && m && m[1] === String(realDelta), 'case11 stdout OK and delta matches', 'stdout=' + JSON.stringify(r.stdout) + ' real=' + realDelta);
    } finally { cleanupDir(d); }
  }

  // Case 12: trailing-newline convention of anchor/replacement files (pin STEP 1c behavior)
  // STEP 1c: anchor-edit.js does NOT strip trailing newline from anchor/replacement files;
  // it reads them as utf8 and normalizes EOLs with normalizeToEol (preserves trailing newlines),
  // and inserts with slice concatenation. Pinned: anchor file with trailing newline matches/inserts accordingly.
  {
    const d = mkTmpDir();
    try {
      const target = path.join(d, 'f.txt');
      const anchor = path.join(d, 'a.txt');
      const repl = path.join(d, 'r.txt');
      // target has trailing newline; anchor and replacement provided WITH trailing newline -> match and keep it
      writeFile(target, Buffer.from('A\r\nB\r\nC\r\n', 'utf8'));
      writeFile(anchor, Buffer.from('B\r\n', 'utf8'));
      writeFile(repl, Buffer.from('R\r\n', 'utf8'));
      const r = runTool([target, 'replace', anchor, repl]);
      const out = readBuf(target);
      ok(r.status === 0 && bufEq(out, Buffer.from('A\r\nR\r\nC\r\n', 'utf8')), 'case12 trailing newline in anchor/repl preserved (not stripped)', JSON.stringify(out.toString('utf8')));
    } finally { cleanupDir(d); }
  }

  console.log('anchor-edit guard: ' + (checks - failures) + '/' + checks + ' passed');
  process.exit(failures ? 1 : 0);
})();