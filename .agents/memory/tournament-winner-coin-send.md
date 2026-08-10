---
name: Tournament winner coin send
description: Entitlement and control rules for the winner-only coin transfer feature.
---

The Coin Send feature is controlled by the persisted payment-settings toggle; when enabled, the UI is visible to everyone but only users with a champion tournament registration can transfer coins.

**Why:** Admins need an immediate ON/OFF control without changing tournament configuration, while winner status must remain server-authoritative and cannot be trusted from client UI state.

**How to apply:** Check both the feature flag and champion registration on every status and transfer request; record paired debit/credit transactions inside one database transaction.