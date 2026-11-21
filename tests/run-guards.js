/* [D-04] Guard runner — the project's test flow for the layering system.
   Run after every build:  node tests/run-guards.js
   1) lint-layering: static checks (positioning registry, z bands, vh ban,
      16px rem root, #overlay-root + relocation registry).
   2) geometry.test: boots the real app in headless Chromium at
      320/360/412 widths × reader font scales 1.0/1.25/1.5 and asserts no
      overlay covers text lines, targets ≤48px, column ≥80%, toast behavior,
      word-sheet bounds/no-reflow/single-instance.
   3) original-tab-guard: CDP browser tests for the reader view switch
      (view persistence per book, default orig, position kept; zero network
      calls when opening a book and switching to أصلي). */
const { spawnSync } = require('child_process');
let failed = 0;
for (const f of ['no-cdn-guard.js', 'eol-guard.js', 'anchor-edit-guard.js', 'pdf-text-guard.js', 'text-open-guard.js', 'lint-layering.js', 'geometry.test.js', 'original-tab-guard.js', 'pdf-original-guard.js', 'pdf-viewer-guard.js', 'translation-hints-guard.js', 'desktop-reader-guard.js']) {
  console.log('== ' + f + ' ==');
  const r = spawnSync(process.execPath, [__dirname + '/' + f], { stdio: 'inherit' });
  if (r.status !== 0) failed = 1;
}
console.log(failed ? 'GUARDS: FAILED' : 'GUARDS: ALL PASSED');
process.exit(failed);