# PDF import verification, 2026-11-23

## Behavior
- Per-page text layer wins whenever nonempty. Arabic dictionary rarity is not proof of broken encoding. Short titles, code and text-only blank pages do not invoke OCR.
- Image-only pages run local Arabic/English Tesseract. Maximum two workers, one on single-core or sub-2GB devices. Page canvases are released.
- Pages and original source checkpoint to a separate IndexedDB database. Ready contiguous pages append to one book without rechunking existing content or resetting reading position.
- Pause finishes the active pages. Resume after navigation/reload skips saved pages. Hidden Android apps can be suspended by the OS, so resume is durable rather than claiming continuous OS background service.
- Progress counts durable pages; ETA starts only after two new pages and is measured, not a fixed promise.
- No provider key or uploaded book content. No migration of existing books.
- New imports cap at 800 pages with an explicit partial-book notice. Weak text is retained with a warning; explicit repair remains separate.

## Real browser runs
Repeated Chromium runs at 390x844 and 1365x900 using real generated PDF files and actual file-picker interactions. 200-page Arabic technical vocabulary plus English algorithms/code opens, reads and persists. Mixed text/image/blank PDF invokes OCR only for the image page. Pause, navigate, read ready pages, reload and resume retain ID, page order and no duplicate pages. Malformed PDF exposes error/retry/cancel. Both existing top-level CJS suites and new engine tests pass.

## Measurements
ALRAWI 200-page selectable technical fixture: candidate core extraction 2.80 s, first page 0.225 s; full durable UI import to reader 5.15 s (Kutubi 4.94 s). Old ALRAWI aggregate heuristic flags this readable text as broken because common-word score is zero; old full import still had not returned at 118 s and was stopped, not recorded as completed.
ALRAWI synthetic scanned 200-page repeated Arabic fixture: old 48.846 s and no usable import until return; candidate 48.489 s and first page 1.236 s. Output length/text sample match old. This is not a whole-OCR throughput speedup.
Lower scale 2.2 without recovery was faster but Arabic output was poor. With recovery restored it was slower and inconsistent. Rejected. Production candidate retains scale 3 with pixel safety cap; no unearned Arabic accuracy claim.

## Boundaries
No physical phone or Android emulator execution. Current APKs inspected: Capacitor remote WebView, correct app IDs/HTTPS production URLs, TTS plugin only, App plugin absent. No signing keys found or rebuilt APK. Browser mobile viewport is a real browser test, not physical Android certification. No changes to Windows binaries.
