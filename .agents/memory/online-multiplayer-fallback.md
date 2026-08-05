---
name: Online multiplayer fallback
description: Rules for distinguishing real-player multiplayer from local play.
---

Online multiplayer and local/offline play are separate products. If an online room, authenticated identity, or realtime connection is unavailable, show a recoverable online error or waiting state; never silently substitute a local board or AI opponent.

**Why:** A silent fallback makes the player believe they are playing a real opponent while the server is not synchronizing the match.

**How to apply:** Keep `online` room state server-backed, require an authenticated player identity, and reserve local game initialization for an explicit offline selection.