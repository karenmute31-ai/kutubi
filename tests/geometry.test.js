/* [D-04] Geometry guard — boots the real app in headless Chromium (CDP) and
   measures the layering system. Modes:
     node tests/geometry.test.js --diag    → print measurements only
     node tests/geometry.test.js           → assertions (fails on D-04 defects)
   Configs: widths 320/360/412 × reader --fs 17/21.25/25.5 (scale 1.0/1.25/1.5).
   Chrome: $CHROME_BIN or /opt/meta-chromium/chrome (Hatch policy switches are
   added automatically when the policy file exists). */
const { spawn } = require('child_process');
const net = require('net');
const freePort = () => new Promise((res, rej) => { const srv0 = net.createServer(); srv0.on('error', rej); srv0.listen(0, '127.0.0.1', () => { const p = srv0.address().port; srv0.close(() => res(p)); }); });
const http = require('http'); const fs = require('fs'); const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const DIAG = process.argv.includes('--diag');
function resolveBrowser() {
  const fs = require('fs');
  const candidates = [];
  const envPath = process.env.CHROME_PATH || process.env.CHROME_BIN;
  if (envPath) candidates.push(envPath);
  const winCandidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Google/Chrome SxS/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome SxS/Application/chrome.exe',
    'C:/Users/%USERPROFILE%/AppData/Local/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Users/%USERPROFILE%/AppData/Local/Microsoft/Edge/Application/msedge.exe',
  ];
  const osEnv = process.env;
  winCandidates.forEach(c => {
    candidates.push(c.replace(/%USERPROFILE%/g, osEnv.USERPROFILE || osEnv.HOMEPATH || 'Win10'));
  });
  candidates.push('/opt/meta-chromium/chrome');
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch (e) { /* ignore */ }
  }
  return null;
}
const CHROME = resolveBrowser();
if (!CHROME) {
  console.error('geometry guard: no Chromium-compatible browser found. Set CHROME_PATH to chrome.exe/msedge.exe and re-run.');
  process.exitCode = 2;
}
console.log('geometry guard: using browser -> ' + CHROME);
const FLOATING = ['.topbar', '#readerTopbar', '.reader-actionbar', '#readerBottomBar',
  '.tabbar', '#selPopup', '#wordSheet', '#updateBanner', '#appToast', '#resumeBar', '#readProgressTrack']; // #readerPill removed: dead CSS, no such element
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0, checks = 0;
function ok(cond, label, detail) { checks++; if (!cond) { failures++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      const ext = path.extname(f);
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' }[ext] || 'application/octet-stream';
      rsp.writeHead(200, { 'Content-Type': mime }); fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function runConfig(port0, srvPort, W, fsPx) {
  const H = Math.round(W * 2.05);
  const port = await freePort();
  const userDir = fs.mkdtempSync('/tmp/kutubi-geo-');
  const args = ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests',
    '--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=' + userDir, 'about:blank'];
  const PF = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
  if (fs.existsSync(PF)) {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(PF)).digest('hex');
    args.splice(3, 0, '--hatch-webgl-allowed-domains-file=' + PF, '--hatch-webgl-allowed-domains-sha256=' + sha);
  }
  const chrome = spawn(CHROME, args, { stdio: 'ignore' });
  let ws;
  try {
    let targets = null;
    for (let i = 0; i < 40 && !targets; i++) {
      await sleep(500);
      try { const t = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); if (Array.isArray(t) && t.length) targets = t; } catch (e) {}
    }
    if (!targets) throw new Error('no CDP targets');
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    let id = 0; const pending = new Map();
    ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const evl = async (expr, awaitP = false) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: awaitP, returnByValue: true });
      if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
      return r.result && r.result.result ? r.result.result.value : undefined;
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source:
      `localStorage.setItem('motarjem-consent', JSON.stringify({v:2, ts:Date.now()}));
       localStorage.setItem('motarjem-settings', JSON.stringify({font:${fsPx}}));` });
    await send('Page.navigate', { url: 'file://' + ROOT + '/index.html' });
    const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { let v = false; try { v = await evl(expr); } catch (e) {} if (v === true) return true; await sleep(100); } return false; };
    if (!(await waitFor("typeof addBook==='function' && !!document.querySelector('#chunks') && !!document.getElementById('readerBottomBar') && !!document.getElementById('readerBottomBar').closest('#overlay-root')", 20000))) throw new Error('page not ready: overlay relocation');
    const para = 'Reading is a quiet craft. The engineer studies the system, takes notes, and tests every assumption before trusting the design in production environments. ';
    await evl(`(async () => { const text = Array.from({length: 60}, (_, i) => 'Chapter note ' + i + '. ' + ${JSON.stringify(para)}.repeat(3)).join('\\n\\n');
      const b = await addBook('Geo Book', text, 'paste'); await openBook(b.id); })()`, true);
    await sleep(500);
    const measure = () => evl(`(() => {
      const R = s => { const el = document.querySelector(s); if (!el) return null;
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
                 vis: cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05,
                 inRoot: !!el.closest('#overlay-root') }; };
      const txt = R('#chunks .chunk .orig') || R('#chunks .chunk .trans');
      /* line-level text rects actually inside the viewport (max 400) */
      const vvW = Math.round(visualViewport.width), vvH = Math.round(visualViewport.height);
      const lines = [];
      document.querySelectorAll('#chunks .chunk .orig, #chunks .chunk .trans').forEach(p => {
        if (lines.length >= 400) return;
        const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        let n; while ((n = tw.nextNode()) && lines.length < 400) {
          if (!n.textContent.trim()) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          for (const lr of rg.getClientRects())
            if (lr.width > 4 && lr.bottom > 0 && lr.top < vvH) lines.push({ x: lr.x, y: lr.y, w: lr.width, h: lr.height });
        }
      });
      const interLines = a => { if (!a || !a.vis) return 0; let s = 0;
        /* clip both rects to the visible viewport — overlap above y=0 is off-screen, not covered text */
        const ax = Math.max(a.x, 0), ay = Math.max(a.y, 0), ax2 = Math.min(a.x + a.w, vvW), ay2 = Math.min(a.y + a.h, vvH);
        if (ax2 <= ax || ay2 <= ay) return 0;
        for (const L of lines) s += Math.max(0, Math.min(ax2, L.x + L.w) - Math.max(ax, L.x)) * Math.max(0, Math.min(ay2, L.y + L.h) - Math.max(ay, L.y));
        return Math.round(s); };
      const els = {}; ${JSON.stringify(FLOATING)}.forEach(s => els[s] = R(s));
      const inter = {}; for (const k in els) inter[k] = interLines(els[k]);
      let maxBtn = 0; const over = [];
      document.querySelectorAll('#tab-reader button').forEach(b => { const r = b.getBoundingClientRect();
        if (r.height > 0) { if (r.height > maxBtn) maxBtn = Math.round(r.height); if (r.height > 48.5) over.push(b.textContent.trim().slice(0, 16) + ':' + Math.round(r.height)); } });
      const chunks = R('#chunks');
      return { vw: vvW, vh: vvH, innerW: innerWidth,
        docSW: document.documentElement.scrollWidth, htmlFs: getComputedStyle(document.documentElement).fontSize,
        topbarHVar: getComputedStyle(document.documentElement).getPropertyValue('--topbar-h').trim(),
        txt, chunks, els, inter, lines: lines.length, maxBtn, over: over.slice(0, 5),
        readerCls: document.querySelector('#tab-reader').className };
    })()`);
    const tag = 'w' + W + '/fs' + fsPx;
    const top = await measure();
    const topbarH0 = await evl(`document.querySelector('.topbar').offsetHeight`);
    await evl(`appToast('تم التحديث 🔄')`); await sleep(150);
    const topbarH1 = await evl(`document.querySelector('.topbar').offsetHeight`);
    const toastState = await measure();
    await evl(`window.scrollTo(0, 1500)`); await sleep(700);
    /* poll until the chrome slide-away transition settles (250ms CSS transition,
       started by the last scroll event) — the invariant is the END state */
    let mid = await measure();
    for (let i = 0; i < 8 && mid.inter['.topbar'] > 0; i++) { await sleep(200); mid = await measure(); }
    /* word sheet: bounds, reflow, single-instance */
    const chunksW0 = top.chunks.w;
    await evl(`openWordSheet(currentBook(), 'craft')`); await sleep(150);
    const wordLoad = await measure();
    await evl(`openWordSheet(currentBook(), 'system')`); await sleep(400);
    const wordAgain = await measure();
    const box = await evl(`(() => { const el = document.querySelector('#wordSheet .consent-box'); if (!el) return null;
      const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) }; })()`);
    await evl(`closeWordSheet()`);
    await sleep(2900);
    const toastGone = await measure();
    if (DIAG) {
      console.log(tag, JSON.stringify({ htmlFs: top.htmlFs, topbarHVar: top.topbarHVar, topbarH: [topbarH0, topbarH1],
        txtW: top.txt && top.txt.w, chunksW: chunksW0, topInter: top.inter, toast: toastState.els['#appToast'],
        midCls: mid.readerCls, midInter: mid.inter, maxBtn: top.maxBtn, over: top.over, docSW: top.docSW, vw: top.vw,
        wordLoad: wordLoad.els['#wordSheet'], wordAgainW: wordAgain.els['#wordSheet'] && wordAgain.els['#wordSheet'].w,
        wordChunksW: wordAgain.chunks.w, toastGoneVis: toastGone.els['#appToast'] && toastGone.els['#appToast'].vis }));
      return;
    }
    console.log('config ' + tag + ':');
    ok(top.docSW <= top.vw + 1, tag + ' no horizontal overflow', 'docSW=' + top.docSW + ' vw=' + top.vw);
    for (const k of FLOATING) ok(!top.els[k] || top.els[k].inRoot !== false || k === '.topbar' || k === '.tabbar' || k === '#readerTopbar' || k === '.reader-actionbar', tag + ' ' + k + ' inside layering root', 'inRoot=' + (top.els[k] && top.els[k].inRoot));
    for (const k in top.inter) { if (k === '#readProgressTrack' || k === '#readerBottomBar') continue; /* hairline by design; bottom chrome is asserted in the reading (mid-scroll) state */ ok(top.inter[k] === 0, tag + ' top: ' + k + ' does not cover text lines', 'area=' + top.inter[k]); }
    ok(topbarH1 === topbarH0, tag + ' toast does not grow header', topbarH0 + '->' + topbarH1);
    ok(!!(toastState.els['#appToast'] && toastState.els['#appToast'].vis), tag + ' toast visible after appToast');
    ok(toastState.els['#appToast'] && toastState.els['#appToast'].y + toastState.els['#appToast'].h <= toastState.vh + 1 && toastState.els['#appToast'].y > toastState.vh * 0.55, tag + ' toast at bottom edge', JSON.stringify(toastState.els['#appToast']));
    ok(/chrome-(off|scroll-hidden)/.test(mid.readerCls), tag + ' bars auto-hide while reading', mid.readerCls);
    for (const k in mid.inter) { if (k === '#readProgressTrack' || k === '#appToast') continue; /* hairline by design; the toast layer is governed by its own position/dismiss checks */ ok(mid.inter[k] === 0, tag + ' mid-scroll: ' + k + ' does not cover text lines', 'area=' + mid.inter[k]); }
    ok(top.maxBtn <= 48.5, tag + ' all reader touch targets <= 48px', 'max=' + top.maxBtn + ' over=' + top.over.join(','));
    ok(top.txt && top.txt.w >= 0.8 * top.vw, tag + ' text column >= 80% width', 'txtW=' + (top.txt && top.txt.w) + ' vw=' + top.vw);
    const wb = wordLoad.els['#wordSheet'];
    ok(wb && wb.x >= -1 && wb.x + wb.w <= top.vw + 1, tag + ' word sheet not clipped horizontally', JSON.stringify(wb));
    ok(box && box.x >= -1 && box.x + box.w <= top.vw + 1, tag + ' word sheet box inside viewport horizontally', JSON.stringify(box));
    ok(box && Math.abs(box.bottom - top.vh) <= 2, tag + ' word sheet is a bottom sheet (anchored to bottom edge)', JSON.stringify(box));
    ok(wordAgain.chunks.w === chunksW0, tag + ' word sheet does not narrow text column', chunksW0 + '->' + wordAgain.chunks.w);
    ok(wordAgain.els['#wordSheet'] && wordAgain.els['#wordSheet'].w === wb.w, tag + ' word sheet single-instance stable width', (wb && wb.w) + '->' + (wordAgain.els['#wordSheet'] && wordAgain.els['#wordSheet'].w));
    ok(!(toastGone.els['#appToast'] && toastGone.els['#appToast'].vis), tag + ' toast auto-dismissed (~2s)');
  } finally {
    try { ws && ws.close(); } catch (e) {}
    const exited = (chrome.exitCode !== null || chrome.signalCode !== null) ? Promise.resolve() : new Promise(r => chrome.once('exit', r));
    let killTimer; const killGuard = new Promise(r => { killTimer = setTimeout(() => { try { chrome.kill('SIGKILL'); } catch (e) {} r(); }, 5000); });
    try { chrome.kill(); } catch (e) {}
    await Promise.race([exited, killGuard]);
    clearTimeout(killTimer);
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  const srv = await serve();
  const srvPort = srv.address().port;
  const widths = DIAG ? [360, 412] : [320, 360, 412];
  const fonts = DIAG ? [17, 25.5] : [17, 21.25, 25.5];
  for (const W of widths) for (const F of fonts) {
    if (DIAG && !((W === 360 && F === 17) || (W === 360 && F === 25.5) || (W === 412 && F === 17) || (W === 412 && F === 25.5))) continue;
    try { await runConfig(9500, srvPort, W, F); } catch (e) { failures++; console.log('  ERROR w' + W + '/fs' + F + ': ' + e.message); }
  }
  srv.close();
  if (!DIAG) { console.log('geometry: ' + (checks - failures) + '/' + checks + ' passed'); process.exit(failures ? 1 : 0); }
})();
