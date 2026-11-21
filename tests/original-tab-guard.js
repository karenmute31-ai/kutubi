/* [G1] original-tab guard — browser-based (CDP) tests for the reader view switch.
   Runs like geometry.test.js: boots headless Chromium, serves the app over HTTP,
   drives addBook/openBook/view-switch through the global JS API, and asserts
   behaviour on the live DOM.

   Coverage:
   (a) view choice persists per book across reload (localStorage motarjem-read-view);
       a new book defaults to "orig"; switching mode keeps the reading position.
   (b) opening a book and switching to أصلي makes zero fetch/XHR/AI calls
       (intercept every network request and assert 0).

   Fail on old code (git show 5243fdb:<file> copies in a temp folder), pass on current.
   ROOT override: OTG_ROOT env var (defaults to the current web folder).
*/
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.OTG_ROOT || path.join(__dirname, '..');
const DIAG = process.argv.includes('--diag');
function resolveBrowser() {
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
  console.error('original-tab guard: no Chromium-compatible browser found. Set CHROME_PATH to chrome.exe/msedge.exe and re-run.');
  process.exitCode = 2;
}
console.log('original-tab guard: ROOT=' + ROOT);
console.log('original-tab guard: using browser -> ' + CHROME);
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

let failures = 0, checks = 0;
function ok(cond, label, detail) {
  checks++; if (!cond) { failures++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
}

async function bootCDP(port) {
  const userDir = fs.mkdtempSync('/tmp/kutubi-otg-');
  const args = ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests',
    '--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=' + userDir, 'about:blank'];
  const chrome = spawn(CHROME, args, { stdio: 'ignore' });
  let ws;
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
    await send('Runtime.enable');
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: awaitP, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');
  return { chrome, ws, send, evl, close: () => { try { ws && ws.close(); } catch (e) {} chrome.kill(); } };
}

function appBootScript() {
  return `
    localStorage.setItem('motarjem-consent', JSON.stringify({v:2, ts:Date.now()}));
    localStorage.setItem('motarjem-settings', JSON.stringify({font:17, theme:'light', fontFamily:'system', lineHeight:1.9, tStyle:'fusha', targetLang:'ar-EG', ttsProvider:'device'}));
  `;
}

async function waitForApp(cdp) {
  for (let i = 0; i < 40; i++) { await sleep(500); if (await cdp.evl(`typeof addBook==='function'`)) return true; }
  throw new Error('app did not boot (addBook not defined)');
}

async function addBookAndOpen(cdp, title, text) {
  const id = await cdp.evl(`(async () => {
    const b = await addBook(${JSON.stringify(title)}, ${JSON.stringify(text)}, 'paste');
    window.__otg_bid = b.id;
    localStorage.setItem('__otg_bid', b.id);
    return b.id;
  })()`, true);
  await sleep(400);
  await cdp.evl(`(async () => { await openBook(window.__otg_bid); })()`, true);
  await sleep(400);
  return id;
}

async function run() {
  const srv = await serve();
  const port = 9600 + (process.pid % 40);

  // ==== Test (a): view persistence per book, default orig, position kept ====
  console.log('== (a) view persistence per book ==');
  try {
    const cdp = await bootCDP(port);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 738, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: appBootScript() });
    await cdp.send('Page.navigate', { url: 'file://' + ROOT + '/index.html' });
    await waitForApp(cdp);
    const para = 'Reading is a quiet craft. The engineer studies the system. '.repeat(6);
    await addBookAndOpen(cdp, 'OTG Book One', Array.from({length: 40}, (_, i) => 'Chapter ' + i + '. ' + para).join('\n\n'));

    // Default view should be "orig"
    let defView = await cdp.evl(`(() => {
      const wrap = document.getElementById('chunks');
      const btns = document.querySelectorAll('#readViewBar [data-readview]');
      const active = Array.from(btns).find(b => b.classList.contains('primary'));
      return { wrapOrig: !!wrap && wrap.classList.contains('rv-orig'), wrapTrans: !!wrap && wrap.classList.contains('rv-trans'), btnCount: btns.length, active: active ? active.getAttribute('data-readview') : null };
    })()`);
    ok(defView.btnCount > 0, 'readViewBar buttons exist', 'btnCount=' + defView.btnCount);
    ok(defView.wrapOrig && !defView.wrapTrans && defView.active === 'orig', 'new book defaults to "orig" view', JSON.stringify(defView));

    // Set reading position to chunk 5
    const pos = await cdp.evl(`(async () => {
      const b = currentBook();
      goToChunk(b, 5);
      await new Promise(r => setTimeout(r, 300));
      const lo = JSON.parse(localStorage.getItem('motarjem-last-open') || 'null');
      return { lastOpen: lo && lo.bookId === window.__otg_bid ? lo.chunkIndex : null, hasChunk5: !!document.getElementById('chunk-5') };
    })()`, true);
    ok(pos.lastOpen === 5, 'reading position set to chunk 5', JSON.stringify(pos));

    // Switch to "trans"
    await cdp.evl(`(() => { const b = document.querySelector('#readViewBar [data-readview="trans"]'); if(b) b.click(); })()`);
    await sleep(300);
    let afterSwitch = await cdp.evl(`(() => {
      const wrap = document.getElementById('chunks');
      const btns = document.querySelectorAll('#readViewBar [data-readview]');
      const active = Array.from(btns).find(b => b.classList.contains('primary'));
      const lo = JSON.parse(localStorage.getItem('motarjem-last-open') || 'null');
      return { wrapTrans: !!wrap && wrap.classList.contains('rv-trans'), active: active ? active.getAttribute('data-readview') : null, lastOpenAfterSwitch: lo && lo.bookId === window.__otg_bid ? lo.chunkIndex : null };
    })()`);
    ok(afterSwitch.wrapTrans && afterSwitch.active === 'trans', 'switching to "trans" applies rv-trans', JSON.stringify(afterSwitch));
    ok(afterSwitch.lastOpenAfterSwitch === 5, 'switching view keeps reading position (not reset to 0)', JSON.stringify(afterSwitch));

    // Persist across reload
    await cdp.send('Page.reload');
    await waitForApp(cdp);
    await sleep(400);
    // Re-open the same book after reload (app boots on home tab by default)
    await cdp.evl(`(async () => { await openBook(localStorage.getItem('__otg_bid')); })()`, true);
    await sleep(500);
    let afterReload = await cdp.evl(`(() => {
      const wrap = document.getElementById('chunks');
      const btns = document.querySelectorAll('#readViewBar [data-readview]');
      const active = Array.from(btns).find(b => b.classList.contains('primary'));
      const stored = JSON.parse(localStorage.getItem('motarjem-read-view') || '{}');
      const bid = localStorage.getItem('__otg_bid');
      return { stored: stored[bid], active: active ? active.getAttribute('data-readview') : null, wrapTrans: !!wrap && wrap.classList.contains('rv-trans') };
    })()`);
    ok(afterReload.stored === 'trans' && afterReload.active === 'trans' && afterReload.wrapTrans, 'view choice "trans" persists per book across reload', JSON.stringify(afterReload));

    // Position kept after reload (not reset to beginning)
    const pos2 = await cdp.evl(`(() => {
      const lo = JSON.parse(localStorage.getItem('motarjem-last-open') || 'null');
      const bid = localStorage.getItem('__otg_bid');
      return { lastOpen: lo && lo.bookId === bid ? lo.chunkIndex : null, visibleChunks: $$('#chunks .chunk').length };
    })()`);
    ok(pos2.lastOpen === 5, 'reading position kept across reload (not reset to 0)', JSON.stringify(pos2));

    cdp.close();
  } catch (e) { failures++; console.log('  ERROR test (a): ' + e.message); }

  // ==== Test (b): zero network calls when opening a book and switching to أصلي ====
  console.log('== (b) zero fetch/XHR/AI calls on open + orig switch ==');
  try {
    const cdp = await bootCDP(port + 1);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 738, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: appBootScript() });
    const requests = [];
    await cdp.send('Network.enable');
    cdp.ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Network.requestWillBeSent') {
        const req = m.params && m.params.request;
        if (req && req.url) requests.push({ url: req.url, ts: Date.now() });
      }
    });
    await cdp.send('Page.navigate', { url: 'file://' + ROOT + '/index.html' });
    await waitForApp(cdp);
    await sleep(500);
    const loadedAt = Date.now();
    // Clear requests captured during page load; only count requests after load
    const postLoad = requests.filter(r => r.ts >= loadedAt);
    requests.length = 0;
    requests.push(...postLoad);

    await addBookAndOpen(cdp, 'OTG Book Two', Array.from({length: 30}, (_, i) => 'Chapter ' + i + '. Reading is a quiet craft. '.repeat(4)).join('\n\n'));

    // Switch to "orig" (أصلي)
    const origBtn = await cdp.evl(`(() => { const b = document.querySelector('#readViewBar [data-readview="orig"]'); return !!b; })()`);
    ok(origBtn, 'orig view button exists (#readViewBar [data-readview="orig"])', 'exists=' + origBtn);
    if (origBtn) {
      await cdp.evl(`(() => { const b = document.querySelector('#readViewBar [data-readview="orig"]'); if(b) b.click(); })()`);
      await sleep(600);
    }

    const httpReqs = requests.filter(r => r.url.startsWith('http'));
    ok(httpReqs.length === 0, 'zero fetch/XHR/AI calls on open + orig switch', 'httpReqs=' + httpReqs.length + ' urls=' + JSON.stringify(httpReqs.map(r => r.url)));

    cdp.close();
  } catch (e) { failures++; console.log('  ERROR test (b): ' + e.message); }

  srv.close();
  console.log('original-tab guard: ' + (checks - failures) + '/' + checks + ' passed');
  process.exit(failures ? 1 : 0);
}

run();