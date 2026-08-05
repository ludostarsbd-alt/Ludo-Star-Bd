---
name: Tournament configuration authority
description: Durable rules for flexible tournament stages, qualification, and team progression.
---

The tournament server owns the enabled stage list and the selected next knockout round. The client must render only enabled knockout stages and persist/use the round returned by qualification instead of inferring a fixed bracket locally.

**Why:** Admins can enable or disable stages and configure different group-match counts, so a fixed client bracket creates inconsistent progression and misleading controls.

**How to apply:** When adding tournament UI or endpoints, read stage configuration from the active tournament, validate progression against that ordered list, and keep team-level stats/name/champion identity in sync for 2v2 tournaments. Lock participant-based format at start; count teams, not teammate registrations, and use the locked stage list in both API and UI.