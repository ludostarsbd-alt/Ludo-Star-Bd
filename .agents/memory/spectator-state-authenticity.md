---
name: Spectator state authenticity
description: Rule for rendering tournament spectator boards and live match state.
---

The spectator feed must show a board only when the server has supplied an authoritative active-game snapshot. A configured schedule entry alone is not evidence that a playable match exists.

**Why:** A schedule can contain upcoming, finished, or administratively configured matches without a live game process. Rendering a generated board makes nonexistent activity look real and undermines trust in the tournament feed.

**How to apply:** Keep schedule/status data separate from game-state data; render an explicit waiting/empty state when the snapshot is absent, and authorize socket joins against the running tournament's configured, currently live schedule.