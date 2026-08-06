---
name: APK download delivery
description: Delivery constraint for Android APK files in this workspace.
---

Android APKs should be delivered through a published API endpoint that sets the Android package MIME type and `Content-Disposition: attachment`. Do not rely on workspace asset cards as the primary mobile download path because some mobile browsers render the binary as plain text instead of downloading it.

**Why:** The APK was valid and signed, but mobile browsers opened the raw workspace asset in a text viewer, making it look corrupted.

**How to apply:** Keep the signed APK bundled with the API deployment, expose a stable download route, publish after route changes, and give Android users the published endpoint rather than a raw asset link.