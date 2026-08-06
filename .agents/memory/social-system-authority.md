---
name: Social system authority
description: Durable rules for player profiles, relationships, messaging permissions, presence, and real-time social UI.
---

The social system must keep relationship state and direct-message permission authoritative on the server. A player may send one initial non-friend message, then needs a recipient reply or accepted friendship before continuing; declined requests remain blocked. REST and Socket.IO paths must enforce the same rule.

**Why:** Social actions can originate from search, friends, ranking, tournament players, or online-match seats, so client-only state cannot safely determine access or relationship status.

**How to apply:** Profile screens should consume the server’s relationship and `canMessage` result. Realtime user-room events update friends, notifications, unread badges, DMs, and presence, while persisted notification state remains the reload-safe unread source.