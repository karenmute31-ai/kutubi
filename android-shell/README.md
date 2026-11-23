# Android shell

Requires JDK 21, Android SDK 36 and Node.js. Run `npm ci`, `npx cap sync android`, then `cd android && ./gradlew assembleRelease`. Sign the unsigned release APK using the existing app keystore outside the repository. Never create a replacement signing identity or commit credentials. The remote HTTPS app supplies the screen-aware native Back listener. The shell includes Capacitor App and TextToSpeech, fullSensor rotation, camera permission and a fullscreen activity.
