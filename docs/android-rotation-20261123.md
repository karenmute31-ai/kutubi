# Reader rotation control

Labelled button in reader settings/tools drawer. ReadingRotation native plugin sets SCREEN_ORIENTATION_LOCKED to keep current device orientation, and SCREEN_ORIENTATION_FULL_SENSOR on unlock. Browser uses screen.orientation where available, hides on unsupported/failure. State is session-only. Existing ALRAWI top icon routes to the same new control. Builds and native-call stubs tested, physical phone rotation not verified.
