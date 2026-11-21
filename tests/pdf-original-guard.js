/* [G2] pdf-original guard: the original PDF bytes are saved in their own DB (kutubi-pdf) on import. */
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resolveBrowser() {
  const c = [process.env.CHROME_PATH, process.env.CHROME_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/opt/meta-chromium/chrome'].filter(Boolean);
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }) || null;
}
const CHROME = resolveBrowser();
if (!CHROME) { console.error('pdf-original guard: no Chromium-compatible browser found. Set CHROME_PATH.'); process.exit(2); }
console.log('pdf-original guard: ROOT=' + ROOT);

let checks = 0, failures = 0;
function ok(cond, label, detail) { checks++; if (!cond) { failures++; console.log('  FAIL ' + label + (detail ? ' - ' + detail : '')); } }

async function bootCDP(port) {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kutubi-pdfg-'));
  const args = ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=' + port,
    '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + userDir, 'about:blank'];
  const chrome = spawn(CHROME, args, { stdio: 'ignore' });
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

async function run() {
  console.log('== (a) static wiring ==');
  const a2 = fs.readFileSync(path.join(ROOT, 'app2.js'), 'utf8');
  const delLine = a2.split(/\r?\n/).find(l => l.indexOf('await idbDel(book.id)') >= 0) || '';
  ok(delLine.indexOf('idbPdfDel') >= 0, 'book delete line also deletes the stored PDF', delLine.slice(0, 120));

  console.log('== (b) browser tests ==');
  const cdp = await bootCDP(9700 + (process.pid % 40));
  try {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
    await cdp.send('Page.navigate', { url: 'file://' + ROOT.replace(/\\/g, '/') + '/index.html' });
    let booted = false;
    for (let i = 0; i < 40 && !booted; i++) { await sleep(500); try { booted = await cdp.evl(`typeof addBook==='function'`); } catch (e) {} }
    ok(booted, 'app booted (addBook defined)');
    if (!booted) return;

    // 1) import a small PDF through the real importBookFile; fake extractor empties the buffer like pdf.js does
    let r1;
    try {
      r1 = await cdp.evl(`(async () => {
        let detached = false;
        window.extractPDFWithOCR = async (buf, title) => { structuredClone(buf, {transfer:[buf]}); detached = buf.byteLength === 0; return { text: 'Hello PDF text. '.repeat(60), ocr: null }; };
        const bytes = new Uint8Array(50000); bytes.set(new TextEncoder().encode('%PDF-1.4\\n'), 0);
        const f = new File([bytes], 'otg.pdf', { type: 'application/pdf' });
        const b = await importBookFile(f);
        const blob = await idbPdfGet(b.id);
        let head = '';
        if (blob) head = new TextDecoder().decode(new Uint8Array(await blob.slice(0, 5).arrayBuffer()));
        window.__bid = b.id;
        return { detached, hasBlob: !!blob, size: blob ? blob.size : -1, head, type: blob ? blob.type : '' };
      })()`);
    } catch (e) { r1 = { error: String(e.message || e) }; }
    ok(!r1.error, 'import + idbPdfGet run without error', r1.error);
    ok(r1.detached === true, 'test setup: buffer was emptied by the extractor', JSON.stringify(r1));
    ok(r1.hasBlob === true, 'original PDF is stored in kutubi-pdf after import', JSON.stringify(r1));
    ok(r1.size === 50000, 'stored PDF has the same size as the file (not an emptied copy)', JSON.stringify(r1));
    ok(r1.head === '%PDF-', 'stored PDF starts with %PDF-', JSON.stringify(r1));

    // 1b) page-aware extractor output maps chunks and strips private-use markers from originals
    let rPages;
    try {
      rPages = await cdp.evl(`(async () => {
        window.extractPDFWithOCR = async () => ({ text: 'نص صفحات تجريبي طويل بما يكفي للاستيراد.', ocr: null, pages: [
          'الصفحة الأولى نص عربي تجريبي طويل كفاية.',
          'الصفحة الثانية نص عربي تجريبي طويل كفاية.',
          'الصفحة الثالثة نص عربي تجريبي طويل كفاية.'
        ], pageCount: 3 });
        const bytes = new Uint8Array(50000); bytes.set(new TextEncoder().encode('%PDF-1.4\\n'), 0);
        const b = await importBookFile(new File([bytes], 'pages.pdf', { type: 'application/pdf' }));
        const hasMarker = s => [...String(s || '')].some(ch => { const n = ch.charCodeAt(0); return n >= 0xE000 && n <= 0xE1FF; });
        return { chunks: b.chunks.map(c => ({ pg: c.pg, pgEnd: c.pgEnd, orig: c.orig })), origJoined: b.origJoined, pageCount: b.pageCount, extractVer: b.extractVer, marker: hasMarker(b.origJoined) || b.chunks.some(c => hasMarker(c.orig)) };
      })()`);
    } catch (e) { rPages = { error: String(e.message || e) }; }
    ok(!rPages.error && rPages.chunks.length > 0 && rPages.chunks.every(c => Number.isInteger(c.pg) && Number.isInteger(c.pgEnd)), 'page-aware import stores numeric pg/pgEnd', JSON.stringify(rPages));
    ok(!rPages.error && rPages.marker === false, 'page markers are absent from chunk originals and origJoined', JSON.stringify(rPages));
    ok(!rPages.error && rPages.pageCount === 3 && rPages.extractVer === 2, 'page-aware book stores pageCount=3 and extractVer=2', JSON.stringify(rPages));
    ok(!rPages.error && rPages.chunks[0].pg === 1 && rPages.chunks[rPages.chunks.length-1].pgEnd === 3, 'page markers survive cleanup: first pg=1, last pgEnd=3', JSON.stringify(rPages));

    // 1c) legacy extractor shape remains compatible and does not add page fields
    let rLegacy;
    try {
      rLegacy = await cdp.evl(`(async () => {
        window.extractPDFWithOCR = async () => ({ text: 'Legacy PDF text. '.repeat(60), ocr: null });
        const bytes = new Uint8Array(50000); bytes.set(new TextEncoder().encode('%PDF-1.4\\n'), 0);
        const b = await importBookFile(new File([bytes], 'legacy.pdf', { type: 'application/pdf' }));
        return { hasPg: b.chunks.some(c => Object.prototype.hasOwnProperty.call(c, 'pg') || Object.prototype.hasOwnProperty.call(c, 'pgEnd')) };
      })()`);
    } catch (e) { rLegacy = { error: String(e.message || e) }; }
    ok(!rLegacy.error && rLegacy.hasPg === false, 'legacy extractor shape imports without pg fields', JSON.stringify(rLegacy));

    // 2) delete / clear helpers really empty the drawer
    let r2;
    try {
      r2 = await cdp.evl(`(async () => {
        await idbPdfDel(window.__bid);
        const afterDel = await idbPdfGet(window.__bid);
        await idbPdfPut('x1', new Blob(['aaa'])); await idbPdfPut('x2', new Blob(['bbb']));
        await idbPdfClear();
        return { afterDel: afterDel === null, x1: (await idbPdfGet('x1')) === null, x2: (await idbPdfGet('x2')) === null };
      })()`);
    } catch (e) { r2 = { error: String(e.message || e) }; }
    ok(!r2.error, 'delete/clear helpers run without error', r2.error);
    ok(r2.afterDel === true, 'idbPdfDel removes the stored PDF', JSON.stringify(r2));
    ok(r2.x1 === true && r2.x2 === true, 'idbPdfClear empties the drawer', JSON.stringify(r2));

    // 3) oversize: skipped with an Arabic note, nothing stored
    let r3;
    try {
      r3 = await cdp.evl(`(async () => {
        const note = await savePdfOriginal('big1', { size: 61 * 1024 * 1024 });
        return { note, stored: (await idbPdfGet('big1')) !== null, max: PDF_MAX_BYTES };
      })()`);
    } catch (e) { r3 = { error: String(e.message || e) }; }
    ok(!r3.error, 'oversize check runs without error', r3.error);
    ok(r3.note && r3.note.length > 5, 'oversize PDF returns a clear note', JSON.stringify(r3));
    ok(r3.stored === false, 'oversize PDF is not stored', JSON.stringify(r3));
    ok(r3.max === 60 * 1024 * 1024, 'limit is 60 MB', JSON.stringify(r3));

    // 4) low free space: skipped with a note, nothing stored (quota check)
    let r4;
    try {
      r4 = await cdp.evl(`(async () => {
        navigator.storage.estimate = async () => ({ quota: 100e6, usage: 99e6 });
        const note = await savePdfOriginal('low1', new Blob([new Uint8Array(1e6)]));
        return { note, stored: (await idbPdfGet('low1')) !== null };
      })()`);
    } catch (e) { r4 = { error: String(e.message || e) }; }
    ok(!r4.error, 'low-space check runs without error', r4.error);
    ok(r4.note && r4.note.length > 5, 'low free space returns a clear note', JSON.stringify(r4));
    ok(r4.stored === false, 'PDF is not stored when free space is low', JSON.stringify(r4));
  } finally { cdp.close(); }
}

run().then(() => {
  console.log('pdf-original guard: ' + (checks - failures) + '/' + checks + ' passed');
  process.exit(failures ? 1 : 0);
}).catch(e => { console.error('pdf-original guard crashed: ' + (e && e.message)); process.exit(1); });