# LUDO STAR BD mobile app

This project uses one shared React/Vite codebase and one Capacitor app
configuration for Android and iPhone. The platform folders are native shells;
the game, authentication, API, multiplayer, wallet, tournaments, and database
remain shared.

## Shared app identity

- App name: `LUDO STAR BD`
- Android application ID: `com.starbd.ludo`
- iPhone bundle ID: `com.starbd.ludo`
- Backend: `https://ludo-914--crickets1.replit.app`
- Transport security: HTTPS only; cleartext traffic is disabled
- Database: the existing production database is used through the published backend

## One-codebase workflow

From `artifacts/ludo-game`:

```bash
pnpm run mobile:sync
```

This builds the shared web app and synchronizes it into both native projects.
Use Android Studio for the Android build and Xcode for the iPhone build:

```bash
pnpm run mobile:open:android
pnpm run mobile:open:ios
```

The iPhone build requires macOS/Xcode and Apple signing credentials. The
Android build requires Android Studio/SDK and the existing release keystore.

## Android release

- Version name: `1.0.1`
- Version code: `2`
- Build type: signed Android release APK

## Install and distribution

The exported APK can be uploaded to Google Drive, Dropbox, OneDrive, or another
cloud storage provider. Set the shared file permission to allow anyone with the
link to view/download it.

On Android:

1. Download the APK from the shared link.
2. If prompted, allow the browser or file manager to install unknown apps.
3. Open the APK and install **LUDO STAR BD**.

## Required environment variables

- `LUDO_APK_KEYSTORE_PASSWORD` — secret password for the release keystore.
- `LUDO_APK_KEYSTORE_PATH` — optional path to the existing keystore. If omitted,
  the Android project uses `android/ludo-star-bd-release.jks`.
- `ANDROID_HOME` / `ANDROID_SDK_ROOT` — Android SDK location for local builds.
- `JAVA_HOME` — use a compatible JDK, currently JDK 21 is recommended.

The production backend URL is configured in `capacitor.config.ts`; it is not a
secret. Clerk's existing production configuration and the server-side database
remain unchanged.

## Future APK updates

1. Publish the web/backend changes first and confirm the production URL remains
   unchanged. Do not reset or migrate the production database.
2. Update the Android version name/code in `android/app/build.gradle` and the
   iPhone marketing/build versions in Xcode.
3. Keep the same `ludo-star-bd-release.jks`, alias `ludo-star-bd`, and signing
   password. Android will reject an update signed with a different key.
 4. Run `pnpm run mobile:sync`, then create the Android APK and iPhone archive
   from their respective native IDEs.
5. Distribute the new Android APK and submit the iPhone archive through Apple.
   Existing users keep the same app identity and backend/database data.

Back up the keystore securely. Losing it means future APKs cannot update the
installed app; a new key would require a new application ID or a manual
uninstall/reinstall.