---
name: Fixed board perspective
description: The Ludo board renders each player's own home at bottom-left without rotating or mutating canonical game state.
---

The board's visual perspective is captured once when a match starts. Canonical player colors, track coordinates, dice, turns, movement payloads, and synchronized server state remain unchanged; only render-time board cells, pieces, center triangles, and player panels are projected.

**Why:** Online clients must agree on one authoritative coordinate system, while each player needs an ergonomic personal orientation that does not jump as turns change.

**How to apply:** Keep any future board or player-panel changes on the projection layer. Convert visual clicks back to canonical colors before invoking local logic or emitting server moves, and never derive perspective from `currentPlayer`.