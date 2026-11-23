# Android native Back release

Version 1.0.3 (code 4). Same package ID and signing certificate as the previous downloadable APK. Added Capacitor App plugin and native backButton listener, with overlay-first, reader-to-library, then home routing. A second Back within 2.5 seconds at home calls exitApp. Browser fallback stays available. Original launcher rasters and background color retained; fullSensor, camera, native TTS and fullscreen activity retained.

Verification: release build succeeds; apksigner verifies signature and matching certificate; static package/version/permission/plugin checks. Browser candidate regression: 30 checks. Simulated App callback regression: 34 checks. Android emulator could not boot under available storage/virtualization constraints; physical Android behavior and upgrade/data retention still need a device check. No physical-device or successful emulator claim.

SHA-256: f0c50e3df4fb592901ba83288187d211c474df3ef2b58bff36344dfa539caba6
