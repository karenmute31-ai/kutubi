/* [D-04] Layering lint — fails the build if floating UI escapes the system.
   System: ONE #overlay-root in index.html holds every position:fixed element
   (bars layer z 10–39 · sheets 50–99 · modals 100 · toasts 110–130).
   In-flow sticky bars (.topbar, #readerTopbar, .reader-actionbar) are the only
   allowed sticky elements: they reserve layout space, so they can never
   overlay the reader column. Also guards the root-cause regressions:
   html font-size must stay 16px (reader size lives in --fs on chunk text only)
   and plain vh units are banned (dvh only). */
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
let fails = 0, checks = 0;
const bad = (label, detail) => { checks++; fails++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); };
const good = () => { checks++; };

const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* registry of selectors allowed to be fixed/sticky */
const ALLOWED = ['.topbar', '.tabbar', '#readerTopbar', '.reader-actionbar', '#readerBottomBar', '#readerSidebar',
  '#readerPill', '#selPopup', '.sel-popup', '.consent-overlay', '#updateBanner', '.update-banner', '.resume-bar', '#readProgressTrack',
  '#readRuler', '.sheet-backdrop', '#appearanceCard', '#voiceCard', '#indexCard', '#bookToolsCard',
  '.more-sheet', '#appToast', '#overlay-root', '.book-cover', '.freelib-cover'];
const rules = css.split('}').map(r => r.trim()).filter(Boolean);
for (const rule of rules) {
  const m = rule.match(/position\s*:\s*(fixed|sticky)/);
  if (!m) continue;
  const sels = rule.slice(0, rule.indexOf('{')).split(',').map(s => s.trim());
  for (const sel of sels) {
    if (ALLOWED.some(a => sel.includes(a))) good();
    else bad('position:' + m[1] + ' outside layering system', sel);
  }
}
/* z-index bands (the root container itself sits at the top of the bar band) */
for (const m of css.matchAll(/z-index\s*:\s*(-?\d+)/g)) {
  const z = +m[1];
  if ((z >= 10 && z <= 39) || (z >= 50 && z <= 99) || z === 100 || (z >= 110 && z <= 130)) good();
  else bad('z-index outside layering bands', 'z=' + z);
}
/* no plain vh (dvh allowed) */
const vhHits = (css.match(/(^|[^a-zA-Z])vh\b/g) || []).length;
if (vhHits === 0) good(); else bad('plain vh units in style.css', vhHits + ' hits (use dvh)');
/* root-cause regression: html font-size must not be the reader size */
if (/html\s*\{[^}]*font-size\s*:\s*var\(--fs\)/.test(css)) bad('html{font-size:var(--fs)} regression', 'UI rem base must stay 16px');
else good();
if (/html\s*\{[^}]*font-size\s*:\s*16px/.test(css)) good(); else bad('html font-size is not locked to 16px');
/* overlay root exists in the HTML, with the toast statically inside it */
const rootIdx = html.indexOf('id="overlay-root"');
if (rootIdx === -1) bad('#overlay-root missing in index.html');
else good();
const toastIdx = html.indexOf('id="appToast"');
if (rootIdx !== -1 && toastIdx > rootIdx) good(); else bad('#appToast not inside #overlay-root');
/* every other floater must be in the boot relocation registry (OVERLAY_FLOATERS in app2.js),
   which moves it into #overlay-root before any interaction */
const app2 = fs.readFileSync(path.join(ROOT, 'app2.js'), 'utf8');
const reg = app2.match(/OVERLAY_FLOATERS\s*=\s*\[([^\]]*)\]/);
const regIds = reg ? [...reg[1].matchAll(/"([^"]+)"/g)].map(m => m[1]) : [];
if (reg) good(); else bad('OVERLAY_FLOATERS registry missing in app2.js');
for (const id of ['wordSheet', 'quizOverlay', 'selPopup', 'sheetBackdrop', 'appearanceCard', 'voiceCard',
  'indexCard', 'bookToolsCard', 'readerBottomBar', 'moreSheet', 'updateBanner', 'resumeBar',
  'readProgressTrack', 'readRuler']) {
  if (regIds.includes(id)) good(); else bad('floater not relocated into #overlay-root', '#' + id);
}
/* app JS must not invent floaters */
for (const f of ['app.js', 'app2.js', 'app3.js', 'app4.js']) {
  const js = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/\.style\.position\s*=\s*['"]fixed['"]/.test(js)) bad('JS-created fixed element', f); else good();
}
console.log('lint-layering: ' + (checks - fails) + '/' + checks + ' passed');
process.exit(fails ? 1 : 0);
