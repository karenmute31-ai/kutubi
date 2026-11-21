/* [S1] translation-hints guard: #basicNote/#arabicNote appear only for foreign (non-Arabic) books. */
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function resolveBrowser() {
  const candidates = [process.env.CHROME_PATH, process.env.CHROME_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Users/' + (process.env.USERNAME || 'Win10') + '/AppData/Local/Google/Chrome/Application/chrome.exe',
    '/opt/meta-chromium/chrome'].filter(Boolean);
  return candidates.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }) || null;
}
const CHROME = resolveBrowser();
if (!CHROME) { console.error('translation-hints guard: no browser found. Set CHROME_PATH.'); process.exit(2); }
console.log('translation-hints guard: browser -> ' + CHROME);

let checks = 0, failures = 0;
function ok(c, l, d) { checks++; if (!c) { failures++; console.log('  FAIL ' + l + (d ? ' - ' + d : '')); } }

async function bootCDP(port) {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kutubi-thg-'));
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
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === "Runtime.exceptionThrown") console.log("  page error: " + JSON.stringify(m.params.exceptionDetails).slice(0, 300)); if (m.method === "Log.entryAdded") console.log("  page log: " + JSON.stringify(m.params.entry).slice(0, 250)); if (m.method === 'Page.javascriptDialogOpening') { globalThis.__dialogs = (globalThis.__dialogs || 0) + 1; console.log('  (auto-accepted dialog: ' + String(m.params && m.params.message).slice(0, 60) + ')'); send('Page.handleJavaScriptDialog', { accept: true }); } });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evl = async expr => {
    const r = await Promise.race([send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }), new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate timeout (25s): ' + String(expr).slice(0, 90))), 25000))]);
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 350));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  return { send, evl, close: () => { try { ws.close(); } catch (e) {} chrome.kill(); try { fs.rmSync(userDir, {recursive:true,force:true}); } catch(e){} } };
}

const BOOT = `
  localStorage.setItem('motarjem-consent', JSON.stringify({v:2, ts:Date.now()}));
  localStorage.setItem('motarjem-settings', JSON.stringify({font:17, theme:'light', fontFamily:'system', lineHeight:1.9, tStyle:'fusha', targetLang:'ar-EG', ttsProvider:'device'}));
`;

const hintState = () => `(() => {
  const bn = document.getElementById('basicNote'), an = document.getElementById('arabicNote');
  return {
    basicHidden: !bn || bn.classList.contains('hidden'),
    arabicHidden: !an || an.classList.contains('hidden')
  };
})()`;

async function run() {
  console.log('== (a) static checks ==');
  const a2 = fs.readFileSync(path.join(ROOT, 'app2.js'), 'utf8');
  ok(/function renderReaderControls/.test(a2), 'renderReaderControls exists in app2.js');

  console.log('== (b) browser checks ==');
  const cdp = await bootCDP(9790 + (process.pid % 40));
  try {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
    const fileUrl = 'file://' + ROOT.split(path.sep).join('/') + '/index.html';
    await cdp.send('Page.navigate', { url: fileUrl });
    let booted = false;
    for (let i = 0; i < 40 && !booted; i++) { await sleep(500); try { booted = await cdp.evl(`typeof addBook==='function' && typeof openBook==='function'`); } catch (e) {} }
    ok(booted, 'app booted'); console.log('  step: booted=' + booted);
    if (!booted) { try { console.log("  diag: " + JSON.stringify(await cdp.evl(`({href:location.href, rs:document.readyState, title:document.title, addBook:typeof addBook, openBook:typeof openBook, settings:typeof settings, scripts:[...document.scripts].map(s=>(s.type||"js")+":"+(s.src||"inline").split("/").pop()).join(","), body:(document.body&&document.body.innerText||"").slice(0,150)})`))); } catch (e) { console.log("  diag error: " + e.message); } return; }

    console.log('  step: foreign book, no key'); // Foreign (English) book, no API key -> basicNote visible (foreign-only hint), arabicNote hidden
    await cdp.evl(`(async()=>{
      localStorage.setItem('motarjem-settings', JSON.stringify({font:17, theme:'light', fontFamily:'system', lineHeight:1.9, tStyle:'fusha', targetLang:'ar-EG', ttsProvider:'device', key:''}));
      settings.key = ''; const b = await addBook('Foreign Book', 'This is an English chapter. '.repeat(40), 'paste');
      await openBook(b.id);
      window.__foreignId = b.id;
    })()`);
    await sleep(700);
    let s = await cdp.evl(hintState());
    ok(s.arabicHidden === true, 'arabicNote hidden for foreign book', JSON.stringify(s));
    ok(s.basicHidden === false, 'basicNote visible for foreign book when no API key', JSON.stringify(s));

    console.log('  step: arabic book, no key'); // Arabic book, no API key -> NO translation hints at all
    await cdp.evl(`(async()=>{
      localStorage.setItem('motarjem-settings', JSON.stringify({font:17, theme:'light', fontFamily:'system', lineHeight:1.9, tStyle:'fusha', targetLang:'ar-EG', ttsProvider:'device', key:''}));
      settings.key = ''; const ar = 'هذا كتاب عربي أصيل يحتوي على نص عربي طويل للقراءة والفهم. '.repeat(30);
      const b = await addBook('كتاب عربي', ar, 'paste');
      await openBook(b.id);
      window.__arabicId = b.id;
    })()`);
    await sleep(700);
    s = await cdp.evl(hintState());
    ok(s.arabicHidden === true, 'arabicNote hidden for Arabic book', JSON.stringify(s));
    ok(s.basicHidden === true, 'basicNote hidden for Arabic book (no hints on Arabic books)', JSON.stringify(s));
    ok(!globalThis.__dialogs, 'no confirm() dialog when adding an Arabic book', 'dialogs=' + globalThis.__dialogs);

    console.log('  step: foreign book, with key'); // Foreign book with API key -> basicNote hidden (no-key hint not relevant), arabicNote hidden
    await cdp.evl(`(async()=>{
      localStorage.setItem('motarjem-settings', JSON.stringify({font:17, theme:'light', fontFamily:'system', lineHeight:1.9, tStyle:'fusha', targetLang:'ar-EG', ttsProvider:'device', key:'sk-test'}));
      settings.key = 'sk-test'; await openBook(window.__foreignId);
    })()`);
    await sleep(500);
    s = await cdp.evl(hintState());
    ok(s.basicHidden === true, 'basicNote hidden for foreign book when API key present', JSON.stringify(s));
    ok(s.arabicHidden === true, 'arabicNote hidden for foreign book with key', JSON.stringify(s));

  } finally { cdp.close(); }
}

run().then(() => {
  console.log('translation-hints guard: ' + (checks - failures) + '/' + checks + ' passed');
  process.exit(failures ? 1 : 0);
}).catch(e => { console.error('translation-hints guard crashed: ' + (e && e.message)); process.exit(1); });
