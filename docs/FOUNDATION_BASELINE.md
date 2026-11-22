# Kutubi foundation baseline, v113

Foundation branch starts from `84377ec4540366d821ac7a99c67271d945c33655` at `https://kutubi-app.vercel.app/`. Work in this branch is currently confined to fixtures/contracts and classification. No runtime file has changed. Baseline tag: `foundation-baseline-20261122-kutubi-v113`.

## Existing storage and backup

- `motarjem-db` version 2 contains `books` (keyPath `id`) and `audioCache` (external string keys).
- Original PDF blobs live separately in `kutubi-pdf` version 1, store `pdfs` with external book-ID keys. Current maximum PDF save size is 60 MiB.
- The existing `kotobgy-backup` JSON includes books, sanitized settings, readstats, installId and subscription/owner metadata. It excludes the known provider keys. It is not a complete original-PDF/audio backup: those blobs are not in the JSON envelope.
- The low-level book delete API is distinct from PDF/audio deletion. UI deletion calls its own PDF cleanup. Tests do not call this a library-corruption defect.
- Existing deferred-progress code already checks the current object is still in the live books array, and its CJS guard checks deleted/restored snapshots cannot be overwritten by that delayed path.

`tests/foundation-storage-contract.cjs` uses an isolated synthetic browser context, real IndexedDB and Blob persistence. It tests schema/stores/key paths, derived/original and unknown field retention, sanitized backup, PDF/audio exclusion, reload persistence and low-level deletion separation. It never touches a real library or provider key. No schema migration is made.

## Baseline gates, not all green

Existing top-level CJS files passed. The functional suite passed 19/19 and stress/import/OCR suite 9/9. Synthetic provider responses/camera inputs do not establish genuine cloud, phone or billing success.

The legacy full guard runner initially lacked its expected Chromium executable. Supplying Playwright's Chromium via CHROME_PATH let it execute its browser cases. It remains red on unchanged v113. Some guards use file URLs, which log manifest/service-worker/admin CORS failures. The desktop test runner exceeded the command time limit after several recorded failures. No claim is made that the whole runner passed.

Classification so far:

- Confirmed live issue: floating reader page-position pill covers source text at wide sizes (1366×768 and 800×600). Reproduced on actual production in a synthetic book and inspected actual screenshots. A separate v113-based hotfix branch owns the minimal fix and release gates, not this foundation branch.
- Bottom-bar/sidebar equality assumptions are stale against the current `rbb-in-drawer` design. A hidden bar's zero rectangle and proxy controls inside a closed drawer are not by themselves evidence that a visible control is inaccessible. No layout change is being made for these assertions.
- Translation-hint guard expects a foreign-book basic-translation hint visible on original-text entry; current production keeps it hidden and no longer has the expected arabicNote element. Its semantics still need a targeted source/control review before deciding whether the expectation is obsolete. No change is made.
- Layering lint flags an existing fixed audio-stop control. This is a static layering-rule violation, not yet evidence that the control covers text or is inaccessible. It remains reported, not silently waived.

Physical Android/WebView, genuine provider voices/billing, long background playback, full disk and real-user backup/recovery remain untested. Foundation flags will not be enabled or deployed as part of these baseline contracts.
