---
name: Guest-first access
description: Authentication boundaries for general play, deposits, and tournaments.
---

General app browsing and local/offline games are available without authentication. Authentication is required for deposit actions and for joining or playing in tournaments. Tournament information/lobby may remain visible to guests, but attempting to join must route to login.

**Why:** The user explicitly wants login only for depositing and tournament play, not as a prerequisite for ordinary games.

**How to apply:** Keep guest access at the top-level app gate. Guard protected actions at their action boundary, and never turn an authenticated online multiplayer request into a local game when identity is missing.