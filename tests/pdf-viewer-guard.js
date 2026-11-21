/* [G3] pdf-viewer guard: the "PDF pages" button shows only when an original PDF is stored, opens page holders, and goes back to text. */
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHROME = [process.env.CHROME_PATH, process.env.CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/opt/meta-chromium/chrome'].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!CHROME) { console.error('pdf-viewer guard: no browser found. Set CHROME_PATH.'); process.exit(2); }
let checks = 0, failures = 0;
function ok(c, l, d) { checks++; if (!c) { failures++; console.log('  FAIL ' + l + (d ? ' - ' + d : '')); } }

async function bootCDP(port) {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kutubi-pdfv-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=' + port,
    '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + userDir, 'about:blank'], { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 40 && !targets; i++) {
    await sleep(500);
    try { const t = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); if (Array.isArray(t) && t.length) targets = t; } catch (e) {}
  }
  if (!targets) { chrome.kill(); throw new Error('no CDP targets'); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evl = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');
  return { send, evl, close: () => { try { ws.close(); } catch (e) {} chrome.kill(); } };
}
const BOOT = `
  localStorage.setItem('motarjem-consent', JSON.stringify({v:2, ts:Date.now()}));
  localStorage.setItem('motarjem-settings', JSON.stringify({font:17, theme:'light', fontFamily:'system', lineHeight:1.9, tStyle:'fusha', targetLang:'ar-EG', ttsProvider:'device'}));
`;
const FAKE_PDFJS = `
  window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({
    numPages: 3, destroy() { window.__destroyed = true; },
    getPage: async () => ({ getViewport: ({scale}) => ({ width: 100 * scale, height: 140 * scale }),
      render: () => ({ promise: Promise.resolve() }), cleanup() {} }) }) }) };
`;
const state = () => `(() => {
  const b = document.getElementById('btnPdfPages'), h = document.getElementById('pdfPages'), c = document.getElementById('chunks');
  return { btnExists: !!b, btnHidden: !!b && b.classList.contains('hidden'), btnText: b ? b.textContent : '',
    hostHidden: !!h && h.classList.contains('hidden'), holders: h ? h.querySelectorAll('.pdfpg').length : -1,
    chunksShown: !!c && c.style.display !== 'none' };
})()`;

async function run() {
  const cdp = await bootCDP(9750 + (process.pid % 40));
  try {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
    await cdp.send('Page.navigate', { url: 'file://' + ROOT.replace(/\\/g, '/') + '/index.html' });
    let booted = false;
    for (let i = 0; i < 40 && !booted; i++) { await sleep(500); try { booted = await cdp.evl(`typeof addBook==='function' && typeof idbPdfPut==='function'`); } catch (e) {} }
    ok(booted, 'app booted');
    if (!booted) return;
    const text = Array.from({ length: 30 }, (_, i) => 'Chapter ' + i + '. ' + 'Reading is a quiet craft. '.repeat(20)).join('\n\n');

    // 1) book without PDF: button hidden
    await cdp.evl(`(async () => { const b = await addBook('NoPdf', ${JSON.stringify(text)}, 'paste'); await openBook(b.id); })()`);
    await sleep(600);
    let s = await cdp.evl(state());
    ok(s.btnExists, 'PDF pages button exists in the page', JSON.stringify(s));
    ok(s.btnHidden, 'button is hidden for a book without a stored PDF', JSON.stringify(s));

    // 2) book with PDF: button visible
    await cdp.evl(`(async () => { ${FAKE_PDFJS}
      const b = await addBook('WithPdf', ${JSON.stringify(text)}, 'paste');
      await idbPdfPut(b.id, new Blob([new Uint8Array(2000)], {type:'application/pdf'}));
      await openBook(b.id); })()`);
    await sleep(800);
    s = await cdp.evl(state());
    ok(s.btnHidden === false, 'button is visible for a book with a stored PDF', JSON.stringify(s));

    // 3) open viewer
    await cdp.evl(`document.getElementById('btnPdfPages').click()`);
    await sleep(900);
    s = await cdp.evl(state());
    ok(s.holders === 3, 'viewer creates one holder per PDF page', JSON.stringify(s));
    ok(s.hostHidden === false, 'pages container is shown', JSON.stringify(s));
    ok(s.chunksShown === false, 'extracted text is hidden while pages are shown', JSON.stringify(s));
    ok(/\\u0631\\u062c\\u0648\\u0639|رجوع/.test(s.btnText), 'button now offers going back to text', JSON.stringify(s));

    // 4) back to text
    await cdp.evl(`document.getElementById('btnPdfPages').click()`);
    await sleep(500);
    s = await cdp.evl(state());
    ok(s.holders === 0, 'pages are cleared when going back to text', JSON.stringify(s));
    ok(s.hostHidden === true && s.chunksShown === true, 'text is shown again and pages hidden', JSON.stringify(s));
    ok((await cdp.evl(`window.__destroyed === true`)), 'pdf document is released (destroy called)');

    // 5) pdf.js missing: message, text stays
    await cdp.evl(`window.pdfjsLib = undefined; document.getElementById('btnPdfPages').click()`);
    await sleep(500);
    s = await cdp.evl(state());
    ok(s.holders === 0 && s.chunksShown === true, 'without pdf.js the text stays visible', JSON.stringify(s));
  } finally { cdp.close(); }
}
run().then(() => {
  console.log('pdf-viewer guard: ' + (checks - failures) + '/' + checks + ' passed');
  process.exit(failures ? 1 : 0);
}).catch(e => { console.error('pdf-viewer guard crashed: ' + (e && e.message)); process.exit(1); });