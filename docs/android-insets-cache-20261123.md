# Android insets and fresh assets

Removed fullscreen flag. The native viewport now pads around system bars, cutouts and IME using WindowInsetsCompat, and consumes those insets before the WebView. SystemBars automatic handling is disabled to avoid competing listeners. Local executable asset URLs have release query tags so a legacy cache cannot supply old scripts when the new APK opens its new start URL. Service workers use network-first for same-origin GETs with offline fallback and never cache API replies. Existing book databases are untouched.

Exact 40-page cybersecurity PDF: all 40 pages use text extraction, zero OCR, about 0.44 seconds on the test machine. Some font-encoded fragments remain; not a claim of perfect Drive-equivalent text. Device rendering and upgrade still require phone verification.

SHA-256: 87d6146884c0d897b70daf3acbec1ff567684ec4e74e4c12769a4989430146c4
