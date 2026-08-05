---
name: Power Six persistence
description: Durable design rule for the optional Power Six dice feature in multiplayer Ludo.
---

Power Six must be decided by the room setting and enforced by the server. Store the room-level option in the game-room record, and store each player’s independent cycle counter inside the serialized authoritative game state.

**Why:** Both players must receive the same dice result, and reconnects or API restarts must not reset a player’s cycle or allow clients to disagree about whether the sixth roll is forced.

**How to apply:** Keep local play’s implementation behaviorally identical, but never let online clients generate or override Power Six dice; restore persisted multiplayer state before accepting rolls.