# LUDO STAR BD Android APK

## Current release

- App name: `LUDO STAR BD`
- Application ID: `com.starbd.ludo`
- Version name: `1.0.0`
- Version code: `1`
- Build type: signed Android release APK
- Backend: `https://ludo-914--crickets1.replit.app`
- Transport security: HTTPS only; cleartext traffic is disabled
- Database: the existing production database is used through the published backend

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
2. Update `versionName` and increment `versionCode` in
   `android/app/build.gradle`.
3. Keep the same `ludo-star-bd-release.jks`, alias `ludo-star-bd`, and signing
   password. Android will reject an update signed with a different key.
4. Rebuild the web app, run `pnpm exec cap sync android`, and run the release
   Gradle task with the same signing environment variables.
5. Distribute the new APK. Existing users can install it over the old version,
   and backend/database data remains untouched.

Back up the keystore securely. Losing it means future APKs cannot update the
installed app; a new key would require a new application ID or a manual
uninstall/reinstall.