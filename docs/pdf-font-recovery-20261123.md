# Embedded PDF font recovery

Local-only preprocessing repairs ToUnicode maps from the embedded TrueType cmap and Arabic GSUB shaping tables. Missing mappings may be inherited from compatible same-sized font subsets only when at least 12 overlapping mappings agree with no conflict. No book wording is hardcoded, no dictionary substitutions, and page pixels are unchanged. Unsupported fonts retain their original mapping. If preprocessing fails, import uses the original bytes. Original upload remains stored for resumable processing.

Exact 40-page cybersecurity document: all pages imported, malformed title and contents headings recovered with no whole-book OCR. Exact 213-page document: main-body paragraphs and page numbers recovered, full UI import about 10 seconds on test machine. Decorative headings, copyright and some front matter still contain damaged mappings. No perfect-text or Google Drive equivalence claim.

Regression tests: 200-page mixed and technical text retain text path; scanned import pause/reload/resume; mixed text/image/blank only OCR image; malformed PDF recoverable error; full exact-document UI imports in both applications. Physical phone speed/quality not verified.

Libraries: pdf-lib (MIT), opentype.js (MIT), licenses bundled alongside local assets. No external book upload, payment or model call.
