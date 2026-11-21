/* [G2] desktop-reader guard — CDP browser test for the reader sidebar (R1).
   Same harness as tests/geometry.test.js: headless Chromium + CDP, HTTP server,
   addBook/openBook, page-side MEASURE, 5 configs.
   WIDE configs: measure at scrollY 0 (M0), then scrollTo(0,600)+sleep 700ms (M1).
   NARROW configs: measure once at scrollY 0.
   Exit code 1 if any check fails.
*/

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resolveBrowser() {
  const candidates = [];
  const envPath = process.env.CHROME_PATH || process.env.CHROME_BIN;
  if (envPath) candidates.push(envPath);
  const winCandidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Google Chrome SxS/Application/chrome.exe',
    'C:/Program Files (x86)/Google Chrome SxS/Application/chrome.exe',
    'C:/Users/%USERPROFILE%/AppData/Local/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft Edge/Application/msedge.exe',
    'C:/Users/%USERPROFILE%/AppData/Local/Microsoft Edge/Application/msedge.exe',
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
  console.error('desktop-reader guard: no Chromium-compatible browser found. Set CHROME_PATH to chrome.exe/msedge.exe and re-run.');
  process.exitCode = 2;
}

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
function ok(cond, label, detail) { checks++; if (!cond) { failures++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }

const MEASURE = `(() => {
  const q = s => document.querySelector(s);
  const R = e => { const r = e.getBoundingClientRect(); return { l:r.left, t:r.top, r:r.right, b:r.bottom, w:r.width, h:r.height }; };
  const cs = (e, p) => getComputedStyle(e)[p];
  const sb = q('#readerSidebar'), bb = q('#readerBottomBar'), ch = q('#chunks'), tb = q('.topbar'), tab = q('.tabbar'), tr = q('#tab-reader');
  const ids = ['readerSidebar','readerTopbar','readerActionBar','lockCard','readerEmpty','appearanceCard','backToLib','targetLangSel','btnTranslate','readViewBar','readerBottomBar','chunks'];
  const o = { layout: document.body.dataset.layout, ih: innerHeight, scrollH: document.documentElement.scrollHeight, scrollY: scrollY };
  o.dupIds = ids.filter(id => document.querySelectorAll('#' + id).length !== 1);
  o.sbDisplay = cs(sb, 'display'); o.sbPos = cs(sb, 'position'); o.trDisplay = cs(tr, 'display');
  o.chOverflowY = cs(ch, 'overflowY'); o.trOverflowY = cs(tr, 'overflowY'); o.mainOverflowY = cs(q('main'), 'overflowY');
  o.topbarPos = cs(q('#readerTopbar'), 'position');
  o.barsInside = sb.contains(q('#readerTopbar')) && sb.contains(q('#readerActionBar')) && !!(q('#readerTopbar').compareDocumentPosition(q('#readerActionBar')) & Node.DOCUMENT_POSITION_FOLLOWING);
  o.bbOpacity = cs(bb, 'opacity'); o.bbTransform = cs(bb, 'transform'); o.tbTransform = cs(tb, 'transform');
  o.rtbOpacity = cs(q('#readerTopbar'), 'opacity'); o.rtbTransform = cs(q('#readerTopbar'), 'transform');
  o.abOpacity = cs(q('.reader-actionbar'), 'opacity'); o.abTransform = cs(q('.reader-actionbar'), 'transform');
  const c = R(ch), t = R(tb), k = tab ? R(tab) : null;
  o.sb = R(sb); o.bb = R(bb); o.ch = c; o.tb = t;
  const yTop = Math.max(c.t, t.b + 2), yBot = Math.min(c.b, (k && k.h > 0 && k.w > k.h ? k.t : innerHeight) - 2);
  o.bbDisplay = cs(bb, 'display'); o.textH = yBot - yTop;
  const xL = Math.max(c.l, 0), xR = Math.min(c.r, innerWidth);
  o.covered = []; o.samples = 0;
  if (yBot > yTop && xR > xL) for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) {
    const x = xL + (xR - xL) * (i + .5) / 6, y = yTop + (yBot - yTop) * (j + .5) / 8;
    o.samples++;
    const el = document.elementFromPoint(x, y);
    if (!el || !ch.contains(el)) o.covered.push((el && (el.id || el.className || el.tagName)) + '@' + Math.round(x) + ',' + Math.round(y));
  }
  return JSON.stringify(o);
})()`;

const MEAS_M = `(() => {
  const q = s => document.querySelector(s);
  const R = e => { const r = e.getBoundingClientRect(); return { l:r.left, t:r.top, r:r.right, b:r.bottom, w:r.width, h:r.height }; };
  const tab = q('.tabbar'), tb = q('.topbar'), sb = q('#readerSidebar'), bb = q('#readerBottomBar'), ch = q('#chunks');
  const btns = [...tab.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  const cs = getComputedStyle(tab);
  return JSON.stringify({ iw: innerWidth, ih: innerHeight, tab: R(tab), tb: R(tb), sb: R(sb), bbShown: getComputedStyle(bb).display !== 'none', bb: R(bb), ch: R(ch), opacity: cs.opacity, transform: cs.transform, scrollH: tab.scrollHeight, clientH: tab.clientHeight, docW: document.documentElement.scrollWidth, tops: btns.map(b => b.getBoundingClientRect().top), hs: btns.map(b => b.getBoundingClientRect().height), ws: btns.map(b => b.getBoundingClientRect().width) });
})()`;

const bookText = Array.from({ length: 80 }, (_, i) => 'فقرة ' + (i + 1) + ' هذا نص تجريبي طويل للقراءة. '.repeat(12)).join('\n\n');

async function bootCDP(port) {
  const userDir = fs.mkdtempSync('/tmp/kutubi-dr-');
  const args = ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests',
    '--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=' + userDir, 'about:blank'];
  const chrome = spawn(CHROME, args, { stdio: 'ignore' });
  let ws;
  let targets = null;
  for (let i = 0; i < 80 && !targets; i++) {
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
  await send('Page.addScriptToEvaluateOnNewDocument', { source:
    `localStorage.setItem('motarjem-consent', JSON.stringify({v:2, ts:Date.now()}));
     localStorage.setItem('motarjem-settings', JSON.stringify({font:17, theme:'light', fontFamily:'system', lineHeight:1.9, tStyle:'fusha', targetLang:'ar-EG', ttsProvider:'device'}));` });
  await send('Page.navigate', { url: 'file://' + ROOT + '/index.html' });
  for (let i = 0; i < 80; i++) { await sleep(500); if (await evl(`typeof addBook==='function' && !!document.querySelector('#chunks')`)) break; }
  await evl(`(async () => { const b = await addBook(${JSON.stringify('Geo Book')}, ${JSON.stringify(bookText)}, 'paste'); await openBook(b.id); })()`, true);
  await sleep(1200);
  return { chrome, ws, send, evl, close: () => { try { ws && ws.close(); } catch (e) {} chrome.kill(); } };
}

function assertWide(m0, m1, tag) {
  ok(m0.dupIds.length === 0, tag + ' C0 dupIds empty', JSON.stringify(m0.dupIds));
  ok(m0.barsInside, tag + ' C0 barsInside');
  ok(m0.layout === 'desktop', tag + ' C0 layout desktop', m0.layout);
  ok(m0.samples >= 30, tag + ' C0 samples>=30', 'samples=' + m0.samples);
  ok(m0.scrollH > m0.ih + 700, tag + ' C0 scrollH precondition', 'scrollH=' + m0.scrollH + ' ih=' + m0.ih);
  ok(m0.chOverflowY === 'visible' && m0.trOverflowY === 'visible' && m0.mainOverflowY === 'visible', tag + ' C1 overflows visible', JSON.stringify({ ch: m0.chOverflowY, tr: m0.trOverflowY, main: m0.mainOverflowY }));
  ok(m0.sb.l >= 0, tag + ' C2 sb.l>=0', 'sb.l=' + m0.sb.l);
  ok(m0.sb.r <= m0.ch.l + 1, tag + ' C2 sb.r<=ch.l+1', 'sb.r=' + m0.sb.r + ' ch.l=' + m0.ch.l);
  ok(m0.bb.r <= m0.ch.l + 1, tag + ' C2 bb.r<=ch.l+1', 'bb.r=' + m0.bb.r + ' ch.l=' + m0.ch.l);
  if (m0.ih > 520) {
    ok(Math.abs(m0.bb.l - m0.sb.l) <= 2 && Math.abs(m0.bb.w - m0.sb.w) <= 2, tag + ' C3 bb matches sb', JSON.stringify({ sb: { l: m0.sb.l, w: m0.sb.w }, bb: { l: m0.bb.l, w: m0.bb.w } }));
    ok(m0.sb.b <= m0.bb.t + 1, tag + ' C4 sb.b<=bb.t+1', JSON.stringify({ sb: m0.sb, bb: m0.bb }));
  }
  ok(m0.sbPos === 'sticky', tag + ' C5 sbPos sticky', m0.sbPos);
  ok(m1.scrollY > 100, tag + ' C5 M1 scrollY>100', 'scrollY=' + m1.scrollY);
  ok(Math.abs(m1.sb.t - m1.tb.b) <= 20, tag + ' C5 sb.t near tb.b', JSON.stringify({ sb_t: m1.sb.t, tb_b: m1.tb.b }));
  ok(m0.covered.length === 0, tag + ' C6 M0 covered empty', JSON.stringify(m0.covered));
  ok(m1.covered.length === 0, tag + ' C6 M1 covered empty', JSON.stringify(m1.covered));
  if (m1.ih > 520) {
    ok(m1.bb.t >= 0 && m1.bb.b <= m1.ih, tag + ' C7 bb in viewport', JSON.stringify(m1.bb));
    ok(m1.bbOpacity === '1', tag + ' C7 bbOpacity 1', m1.bbOpacity);
    ok(m1.bbTransform === 'none', tag + ' C7 bbTransform none', m1.bbTransform);
  }
  ok(m1.tbTransform === 'none', tag + ' C7 tbTransform none', m1.tbTransform);
  ok(m1.rtbOpacity === '1', tag + ' C7 rtbOpacity 1', m1.rtbOpacity);
  ok(m1.rtbTransform === 'none', tag + ' C7 rtbTransform none', m1.rtbTransform);
  ok(m1.abOpacity === '1', tag + ' C7 abOpacity 1', m1.abOpacity);
  ok(m1.abTransform === 'none', tag + ' C7 abTransform none', m1.abTransform);
  ok(m0.topbarPos === 'static', tag + ' C8 topbarPos static', m0.topbarPos);
  ok(m0.sbDisplay === 'flex' && m0.trDisplay === 'grid' && m0.textH >= m0.ih * 0.4, tag + ' C9 sidebar grid and text height', JSON.stringify({ sbDisplay: m0.sbDisplay, trDisplay: m0.trDisplay, textH: m0.textH, ih: m0.ih }));
  if (m0.ih <= 520 || m1.ih <= 520) {
    ok(m0.bbDisplay === 'none' && m1.bbDisplay === 'none', tag + ' C10 bb hidden on short viewport', JSON.stringify({ m0: m0.bbDisplay, m1: m1.bbDisplay }));
  }
}

function assertNarrow(m0, tag) {
  ok(m0.dupIds.length === 0, tag + ' N1 dupIds empty', JSON.stringify(m0.dupIds));
  ok(m0.barsInside, tag + ' N1 barsInside');
  ok(m0.sbDisplay === 'contents', tag + ' N2 sbDisplay contents', m0.sbDisplay);
  ok(m0.trDisplay !== 'grid', tag + ' N2 trDisplay not grid', m0.trDisplay);
  ok(m0.topbarPos === 'sticky', tag + ' N2 topbarPos sticky', m0.topbarPos);
}

async function runM(cdp, cfg, tag) {
  if (!cfg.wide && cfg.W <= 700) return;
  if (cfg.wide && cfg.W >= 1024) {
    await sleep(300);
    const m0 = JSON.parse(await cdp.evl(MEAS_M));
    await cdp.evl('window.scrollTo(0,600)');
    await sleep(700);
    const m1 = JSON.parse(await cdp.evl(MEAS_M));
    ok(Math.abs(m0.tab.l) <= 1 && m0.tab.w <= 200 && m0.tab.t >= m0.tb.b - 1 && m0.tab.b <= m0.ih + 1, tag + ' M-a m0 vertical position/width', JSON.stringify({ tab: m0.tab, tb: m0.tb, ih: m0.ih }));
    ok(Math.abs(m1.tab.l) <= 1 && m1.tab.w <= 200 && m1.tab.t >= m1.tb.b - 1 && m1.tab.b <= m1.ih + 1, tag + ' M-a m1 vertical position/width', JSON.stringify({ tab: m1.tab, tb: m1.tb, ih: m1.ih }));
    ok(m0.tops.length >= 6, tag + ' M-b enough buttons', 'n=' + m0.tops.length);
    for (let i = 0; i < m0.tops.length; i++) {
      if (i > 0) ok(m0.tops[i] > m0.tops[i - 1], tag + ' M-b tops strictly increasing [' + i + ']', JSON.stringify(m0.tops));
      ok(m0.hs[i] >= 44, tag + ' M-b btn height>=44 [' + i + ']', String(m0.hs[i]));
      ok(m0.ws[i] >= m0.tab.w - 40, tag + ' M-b btn width>=tab.w-40 [' + i + ']', 'w=' + m0.ws[i] + ' tabw=' + m0.tab.w);
    }
    ok(m0.tab.r <= m0.sb.l + 1 && m0.tab.r <= m0.ch.l + 1 && (!m0.bbShown || m0.tab.r <= m0.bb.l + 1), tag + ' M-c m0 no overlap', JSON.stringify({ tab: m0.tab, sb: m0.sb, ch: m0.ch, bbShown: m0.bbShown }));
    ok(m1.tab.r <= m1.sb.l + 1 && m1.tab.r <= m1.ch.l + 1 && (!m1.bbShown || m1.tab.r <= m1.bb.l + 1), tag + ' M-c m1 no overlap', JSON.stringify({ tab: m1.tab, sb: m1.sb, ch: m1.ch, bbShown: m1.bbShown }));
    ok(m0.scrollH <= m0.clientH + 1, tag + ' M-d scrollH<=clientH+1', 'scrollH=' + m0.scrollH + ' clientH=' + m0.clientH);
    ok(m0.docW <= m0.iw + 1, tag + ' M-e m0 docW<=iw+1', 'docW=' + m0.docW + ' iw=' + m0.iw);
    ok(m1.docW <= m1.iw + 1, tag + ' M-e m1 docW<=iw+1', 'docW=' + m1.docW + ' iw=' + m1.iw);
    ok(m1.opacity === '1' && m1.transform === 'none', tag + ' M-f chrome-scroll stable', JSON.stringify({ opacity: m1.opacity, transform: m1.transform }));
    const tabsJson = await cdp.evl("JSON.stringify([...document.querySelectorAll('.tabbar button[data-tab]')].map(b=>b.dataset.tab))");
    const tabList = JSON.parse(tabsJson || '[]');
    for (const V of tabList) {
      await cdp.evl("document.querySelector('.tabbar button[data-tab=\"" + V + "\"]').click()");
      await sleep(500);
      const rj = await cdp.evl("(v=>{const s=document.getElementById('tab-'+v);if(!s)return JSON.stringify({skip:true});const tr=document.querySelector('.tabbar').getBoundingClientRect().right;const kids=[...s.children].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).position!=='fixed'});const minL=kids.length?Math.min(...kids.map(e=>e.getBoundingClientRect().left)):null;return JSON.stringify({minL:minL,tabR:tr,docW:document.documentElement.scrollWidth,iw:innerWidth,n:kids.length});})('" + V + "')");
      const r = JSON.parse(rj || '{}');
      if (r.skip) { console.log(tag + ' M-g SKIP ' + V); continue; }
      ok(r.minL === null || r.minL >= r.tabR - 1, tag + ' M-g ' + V + ' no content under tabbar', JSON.stringify(r));
      ok(r.docW <= r.iw + 1, tag + ' M-g ' + V + ' no hscroll', JSON.stringify({ docW: r.docW, iw: r.iw }));
    }
    return;
  }
  if (cfg.W >= 701 && cfg.W <= 1023) {
    await sleep(300);
    const m0 = JSON.parse(await cdp.evl(MEAS_M));
    ok(m0.tab.t > m0.ih * 0.6 && m0.tab.w >= m0.iw * 0.8, tag + ' M-n bottom tabbar unchanged', JSON.stringify({ tab: m0.tab, ih: m0.ih, iw: m0.iw }));
  }
}

/* [R4] D-checks: reader tools move to the More sheet on desktop only.
   D1 markup, D2 bar trimmed, D3 sheet shows the proxies, D4 proxy clicks drive the originals,
   D5 mobile (NARROW) keeps bar row2 and hides the More-sheet tools container. */
const D1 = `(() => {
  const c = document.querySelector('#moreReaderTools');
  const out = { exists: document.querySelectorAll('#moreReaderTools').length, container: !!c, bad: [], proxies: {} };
  ['moreBtnIndex','moreBtnAppearance','moreBtnVoice','moreBtnTheme'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) { out.bad.push(id + ':missing'); return; }
    if (!c || !c.contains(b)) out.bad.push(id + ':not-inside');
    out.proxies[id] = b.dataset.proxy || '';
  });
  const want = { moreBtnIndex:'btnBarIndex', moreBtnAppearance:'btnBarAppearance', moreBtnVoice:'btnBarVoice', moreBtnTheme:'btnBarTheme' };
  Object.keys(want).forEach(id => { if (out.proxies[id] !== want[id]) out.bad.push(id + ':proxy=' + out.proxies[id]); });
  return JSON.stringify(out);
})()`;

const D2 = `(() => {
  const bb = document.querySelector('#readerBottomBar');
  const row2 = bb ? bb.querySelector('.rbb-row2') : null;
  const sc = document.querySelector('#readScrubber');
  const r = sc ? sc.getBoundingClientRect() : { width: 0, height: 0 };
  return JSON.stringify({
    row2Display: row2 ? getComputedStyle(row2).display : 'missing',
    bbH: bb ? bb.getBoundingClientRect().height : -1,
    scrubW: r.width, scrubH: r.height
  });
})()`;

const D3 = `(() => {
  const c = document.querySelector('#moreReaderTools');
  if (!c) return JSON.stringify({ exists: false });
  const R = e => { const r = e.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
  const btns = ['moreBtnIndex','moreBtnAppearance','moreBtnVoice','moreBtnTheme'].map(id => {
    const b = document.getElementById(id);
    if (!b) return { id: id, missing: true };
    const r = R(b);
    return { id: id, t: r.t, b: r.b, w: r.w, h: r.h, display: getComputedStyle(b).display, visible: r.w > 0 && r.h > 0 && getComputedStyle(b).visibility !== 'hidden' };
  });
  return JSON.stringify({ exists: true, container: R(c), btns: btns, overflowY: getComputedStyle(document.querySelector('#moreSheet')).overflowY, ih: innerHeight });
})()`;

const D5 = `(() => {
  const c = document.querySelector('#moreReaderTools');
  const bb = document.querySelector('#readerBottomBar');
  const row2 = bb ? bb.querySelector('.rbb-row2') : null;
  return JSON.stringify({
    toolsDisplay: c ? getComputedStyle(c).display : 'missing',
    row2Display: row2 ? getComputedStyle(row2).display : 'missing'
  });
})()`;

const D4_RESET = `(() => {
  if (typeof closeReaderPanels === 'function') closeReaderPanels();
  if (typeof closeMoreSheet === 'function') closeMoreSheet();
  const bd = document.querySelector('#sheetBackdrop'); if (bd) bd.classList.add('hidden');
  document.querySelectorAll('#moreSheet.sheet-open').forEach(s => s.classList.remove('sheet-open'));
  const sb = document.querySelector('#readerSidebar'); if (sb) sb.scrollTop = 0;
  return 'reset';
})()`;

async function runD(cdp, cfg, tag) {
  await cdp.evl(D4_RESET); await sleep(300);

  const d1 = JSON.parse(await cdp.evl(D1));
  ok(d1.exists === 1 && d1.container && d1.bad.length === 0, tag + ' D1 moreReaderTools markup+proxies', JSON.stringify(d1));

  if (cfg.wide && cfg.H > 520) {
    const d2 = JSON.parse(await cdp.evl(D2));
    ok(d2.row2Display === 'none' && d2.bbH <= 90 && d2.scrubW >= 60 && d2.scrubH > 0, tag + ' D2 bar keeps scrubber only', JSON.stringify(d2));
  }

  if (cfg.wide) {
    await cdp.evl(`document.getElementById('btnNavMore').click()`); await sleep(700);
    const d3 = JSON.parse(await cdp.evl(D3));
    ok(d3.exists === true && d3.container && d3.container.w > 0 && d3.container.h > 0 && d3.btns.length === 4 && d3.btns.every(b => !b.missing && b.visible), tag + ' D3 moreReaderTools visible in More sheet', JSON.stringify(d3));
    if (cfg.H > 520) {
      ok(d3.btns.every(b => b.missing || (b.t >= 0 && b.b <= d3.ih)), tag + ' D3 proxy buttons inside viewport', JSON.stringify(d3.btns));
    } else {
      ok(d3.overflowY === 'auto' || d3.overflowY === 'scroll', tag + ' D3 sheet scrollable on short viewport', d3.overflowY);
    }
    await cdp.evl(`closeMoreSheet()`); await sleep(400);
    const closed = await cdp.evl(`document.querySelector('#moreSheet').classList.contains('sheet-open')`);
    ok(!closed, tag + ' D3 sheet closed again');
  }

  if (cfg.W === 1366 && cfg.H === 768 || cfg.W === 910 && cfg.H === 380) {
    const themeBefore = await cdp.evl(`document.documentElement.dataset.theme || ''`);
    await cdp.evl(`document.getElementById('btnNavMore').click()`); await sleep(600);
    await cdp.evl(`document.getElementById('moreBtnTheme').click()`); await sleep(500);
    const themeAfter = await cdp.evl(`document.documentElement.dataset.theme || ''`);
    ok(!!themeBefore && themeAfter !== themeBefore, tag + ' D4 moreBtnTheme clicks original (theme signal changed)', JSON.stringify({ before: themeBefore, after: themeAfter }));
    await cdp.evl(D4_RESET); await sleep(300);

    await cdp.evl(`document.getElementById('btnNavMore').click()`); await sleep(600);
    await cdp.evl(`document.getElementById('moreBtnIndex').click()`); await sleep(700);
    const idx = JSON.parse(await cdp.evl(`(() => { const ic = document.querySelector('#indexCard'); const pn = document.querySelector('#indexPanel'); const bd = document.querySelector('#sheetBackdrop'); return JSON.stringify({ drawerOpen: !!ic && ic.classList.contains('drawer-open'), panelShown: !!pn && !pn.classList.contains('hidden'), backdropShown: !!bd && !bd.classList.contains('hidden'), moreOpen: document.querySelector('#moreSheet').classList.contains('sheet-open') }); })()`));
    ok(idx.drawerOpen && idx.panelShown && idx.backdropShown && !idx.moreOpen, tag + ' D4 moreBtnIndex clicks original (index drawer signal)', JSON.stringify(idx));
    await cdp.evl(D4_RESET); await sleep(300);
  }

  if (cfg.wide === false) {
    const d5 = JSON.parse(await cdp.evl(D5));
    ok(d5.toolsDisplay === 'none' && d5.row2Display !== 'none', tag + ' D5 mobile keeps bar row2, hides More tools', JSON.stringify(d5));
  }
}

async function runConfig(port, W, H, wide) {
  const tag = 'w' + W + 'x' + H + (wide ? ' WIDE' : ' NARROW');
  const cdp = await bootCDP(port);
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    const m0 = JSON.parse(await cdp.evl(MEASURE));
    if (wide) {
      await cdp.evl(`window.scrollTo(0, 600)`, true);
      await sleep(700);
      const m1 = JSON.parse(await cdp.evl(MEASURE));
      assertWide(m0, m1, tag);
      console.log(tag + ' | iw=' + W + ' ih=' + m0.ih + ' sb.l=' + m0.sb.l + ' sb.w=' + m0.sb.w + ' sb.t=' + m0.sb.t + ' sb.b=' + m0.sb.b + ' bb.l=' + m0.bb.l + ' bb.w=' + m0.bb.w + ' bb.t=' + m0.bb.t + ' bb.b=' + m0.bb.b + ' bbDisplay=' + m0.bbDisplay + ' ch.l=' + m0.ch.l + ' ch.r=' + m0.ch.r + ' textH=' + m0.textH + ' samples=' + m0.samples + ' covered=' + (m0.covered.length + m1.covered.length));
      await cdp.evl(D4_RESET); await sleep(300);
      const m0b = JSON.parse(await cdp.evl(MEASURE));
      const dRow2 = JSON.parse(await cdp.evl(D2));
      console.log(tag + ' | iw=' + W + ' ih=' + m0b.ih + ' sb.t=' + m0b.sb.t + ' sb.b=' + m0b.sb.b + ' bb.t=' + m0b.bb.t + ' bb.h=' + m0b.bb.h + ' bbDisplay=' + m0b.bbDisplay + ' row2Display=' + dRow2.row2Display + ' textH=' + m0b.textH + ' covered.length=' + m0b.covered.length);
      await runD(cdp, { W: W, H: H, wide: true }, tag);
      await runM(cdp, { W: W, H: H, wide: true }, tag);
    } else {
      assertNarrow(m0, tag);
      ok(m0.layout === 'mobile', tag + ' N3 layout mobile', 'W=' + W + ' layout=' + m0.layout);
      console.log(tag + ' | iw=' + W + ' layout=' + m0.layout + ' sbDisplay=' + m0.sbDisplay + ' trDisplay=' + m0.trDisplay + ' topbarPos=' + m0.topbarPos);
      await runD(cdp, { W: W, H: H, wide: false }, tag);
    }
  } catch (e) { failures++; console.log('  ERROR ' + tag + ': ' + e.message); } finally { cdp.close(); }
}

(async () => {
  const srv = await serve();
  const configs = [
    { W: 1366, H: 768, wide: true },
    { W: 1024, H: 768, wide: true },
    { W: 1920, H: 1080, wide: true },
    { W: 1366, H: 571, wide: true },
    { W: 800, H: 600, wide: true },
    { W: 701, H: 700, wide: true },
    { W: 910, H: 380, wide: true },
    { W: 700, H: 700, wide: false },
    { W: 412, H: 800, wide: false },
  ];
  for (const cfg of configs) {
    try { await runConfig(9700 + cfg.W, cfg.W, cfg.H, cfg.wide); } catch (e) { failures++; console.log('  ERROR w' + cfg.W + ': ' + e.message); }
  }
  srv.close();
  console.log('desktop-reader guard: ' + (checks - failures) + '/' + checks + ' passed');
  process.exit(failures ? 1 : 0);
})();
