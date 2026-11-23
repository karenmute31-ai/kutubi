# Reader rotation control

Labelled button in reader settings/tools drawer. ReadingRotation native plugin sets SCREEN_ORIENTATION_LOCKED to keep current device orientation, and SCREEN_ORIENTATION_FULL_SENSOR on unlock. Browser uses screen.orientation where available, hides on unsupported/failure. State is session-only. Existing ALRAWI top icon routes to the same new control. Builds and native-call stubs tested, physical phone rotation not verified.

Follow-up: legacy ALRAWI CSS landscape fallback caused sideways/clipped document from saved landscape preference. Bundled safety script clears and observes the class, blocks its transform, clears old persisted rotation, and disables emulated rotation. MainActivity explicitly starts fullSensor. Six simulated capability states and repeated viewport transitions pass; physical sensor rotation unverified.

Settings follow-up: existing ALRAWI select is intercepted in capture phase before its obsolete browser-only handler. Both apps use setMode portrait/landscape/auto/current in native plugin. Header-only remote bridge uses nativePromise when proxy is absent. Four proxy/header simulation combinations pass. No physical-device verification.
