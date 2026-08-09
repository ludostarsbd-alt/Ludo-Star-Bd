---
name: Android release identity
description: Durable constraints for LUDO STAR BD Android packaging and future APK updates.
---

The mobile apps are signed Capacitor shells around the published Ludo web app, with one shared source for Android and iPhone. Their application/bundle ID and release identities must remain stable, and both shells must continue targeting the published HTTPS URL so authentication, multiplayer, wallet, social features, and the existing database remain shared with web users.

**Why:** Android will not install an update signed with a different key or under a different application ID, while a changed backend target can split users from their existing production data and realtime services.

**How to apply:** Increment Android version code and iPhone build number for every native update, preserve the Android keystore/alias and Apple signing identity, publish backend/web changes before rebuilding, and never reset or migrate the production database as part of mobile distribution.