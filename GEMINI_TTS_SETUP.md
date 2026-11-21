# Optional public-text Gemini TTS preview

Not enabled by this code change. No client key and no automatic book forwarding.

Server-only settings needed after owner verifies free-tier eligibility and accepts terms:
- GEMINI_TTS_KEY, dedicated server credential, never a client field.
- GEMINI_TTS_ENABLED=true
- GEMINI_TTS_FREE_TIER_VERIFIED=true, an operational gate, not an automatic billing check.
- ALLOWED_ORIGINS, exact deployed origins.
- KV_REST_API_URL and KV_REST_API_TOKEN. Missing or unavailable quota store refuses generation.

Hard limits: 400 characters per sample, 3 requests per IP/day and 10 globally/day. Failed attempts consume reservation; no automatic retries or paid fallback. UTC day. This is a bounded preview, not a public book reader or robust user-account quota system. Origin checks and checkboxes do not authenticate age/location; do not enable on a service aimed at or likely used by minors. Eligibility/region restrictions must be addressed before wider launch.

Current review state: key accepted by read-only model listing; 3.8 TTS listed. Project billing/free quota not verified, no live audio generated and no quality claim. Do not turn on solely because the model appears. Free-tier processing may include training and human review. No confidential/personal content.

Official references:
https://aistudio.google.com/docs/speech-generation
https://aistudio.google.com/docs/pricing
https://ai.google.dev/gemini-api/terms

Local follow-up: Gemini default studio voice is Charon, selected by the owner after three successful direct API sample requests. Owner-only generation requires the existing admin login and server-side verification against the current admin record. The session token stays in JS memory, no password storage. Output capped at 1200 tokens per preview. Both production projects currently lack KV quota storage; not enabled or deployed. Owner states no billing/card is linked, but account console not inspected.

Updated owner decision: no KV dependency. Owner-only authentication remains required. No app-enforced daily cap: Google quotas apply. Short output (1200 tokens), no auto-retry or paid fallback. Runtime still disabled until explicitly configured. Prior references to KV/3-IP/10-global describe the superseded draft, not current behavior.
