---
name: Spectator socket lifecycle
description: Rules for live spectator presence cleanup and stable Socket.IO subscriptions.
---

Spectator presence must be cleaned up independently of multiplayer seat metadata, and changing React event callbacks must not recreate the authenticated Socket.IO connection.

**Why:** Spectator-only sockets have no player-room metadata, while unstable callback dependencies can disconnect/reconnect the socket whenever the selected live match or rendered screen changes.

**How to apply:** Remove all spectator rooms at the start of disconnect handling, before any player-room guard; keep socket event listeners stable and route current callbacks through refs.