---
name: Android release identity
description: Durable constraints for LUDO STAR BD Android packaging and future APK updates.
---

The Android app is a signed Capacitor shell around the published Ludo web app. Its package ID and release signing identity must remain stable, and the shell must continue targeting the published HTTPS URL so authentication, multiplayer, wallet, social features, and the existing database remain shared with web users.

**Why:** Android will not install an update signed with a different key or under a different application ID, while a changed backend target can split users from their existing production data and realtime services.

**How to apply:** Increment version code for every APK update, preserve the same keystore and alias, publish backend/web changes before rebuilding, and never reset or migrate the production database as part of APK distribution.