# Ludo Tournament App

A competitive Ludo tournament platform built for Android (APK / Play Store). Players join tournaments, play 3 league matches to earn points, qualify through a hidden pool system, then compete in a full knockout bracket.

---

## Run & Operate

```bash
# API server (port 8080, proxied at /api)
pnpm --filter @workspace/api-server run dev

# Ludo game frontend (proxied at /)
pnpm --filter @workspace/ludo-game run dev

# Full typecheck
pnpm run typecheck

# Push DB schema changes (requires DATABASE_URL)
pnpm --filter @workspace/db run push
```

**Required env vars:**
- `DATABASE_URL` — PostgreSQL connection string (provision via Replit DB or external Postgres)
- `CLERK_PUBLISHABLE_KEY` — Clerk auth public key
- `CLERK_SECRET_KEY` — Clerk auth secret key

---

## Stack

- **Runtime:** Node.js 24, TypeScript 5.9
- **API:** Express 5, pnpm workspaces monorepo
- **DB:** PostgreSQL + Drizzle ORM (drizzle-zod for schema validation)
- **Auth:** Clerk (JWT, Clerk Express middleware)
- **Build:** esbuild (CJS→ESM bundle)
- **Frontend:** React 19 + Vite + Tailwind CSS v4 + Framer Motion
- **Mobile target:** APK via Expo (to be added)

---

## Where Things Live

| Path | Purpose |
|---|---|
| `artifacts/api-server/src/routes/tournament/` | Tournament join, status, reset |
| `artifacts/api-server/src/routes/tournament/league.ts` | League match play + qualification |
| `artifacts/api-server/src/routes/tournament/knockout.ts` | Knockout bracket + match play |
| `artifacts/api-server/src/routes/player/index.ts` | Career stats + player profile |
| `artifacts/api-server/src/lib/match.service.ts` | Match simulation logic (kill bonuses, points) |
| `artifacts/api-server/src/lib/pool.service.ts` | Hidden pool assignment logic |
| `artifacts/api-server/src/lib/auth.ts` | Clerk auth helper (`requireAuth`) |
| `lib/db/src/schema/` | All Drizzle table definitions |
| `artifacts/ludo-game/src/components/TournamentScreen.tsx` | Frontend tournament UI |

---

## Complete API Reference

All endpoints are prefixed with `/api`. Authentication uses Clerk JWT in the `Authorization` header.

### Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/healthz` | ❌ | Server health check |

### Tournament Core
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/tournament/join` | ✅ | Join the active tournament |
| GET | `/api/tournament/my-status` | ✅ | Full status: phase, matches, points, history |
| POST | `/api/tournament/reset` | ✅ | Reset/leave current tournament |

#### `POST /api/tournament/join`
```json
Request:  { "displayName": "Rakib", "nearbyEnabled": false }
Response: { "registrationId": "uuid", "tournamentId": "uuid", "status": "waiting", "alreadyJoined": false }
```

#### `GET /api/tournament/my-status`
Returns the player's complete tournament status — phase, match history with kill bonuses, knockout history. **Never exposes pool ID, pool size, other pool members, or other players' points.**

### League Stage
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/tournament/league/play` | ✅ | Simulate next league match (returns result) |
| GET | `/api/tournament/league/my-stats` | ✅ | Personal stats only (Matches/Wins/Losses/Points/Status) |
| POST | `/api/tournament/league/qualify` | ✅ | Trigger qualification after all 3 matches played |

#### `POST /api/tournament/league/play` — Response
```json
{
  "matchId": "uuid",
  "matchNumber": 1,
  "opponentName": "Rakib",
  "outcome": "win",
  "basePoints": 5,
  "kills": [{ "victimName": "Nusrat", "progressPct": 70, "bonusAmount": 0.70 }],
  "penalties": [],
  "killBonusTotal": 0.70,
  "penaltyTotal": 0.00,
  "netPoints": 5.70,
  "standing": { "matchesPlayed": 1, "wins": 1, "losses": 0, "draws": 0, "totalPoints": 5.70, "status": "league_playing" }
}
```

#### `POST /api/tournament/league/qualify` — Response
```json
{
  "qualified": true,
  "yourPoints": 15.40,
  "qualifiedScore": 11.30,
  "difference": 4.10,
  "status": "qualified",
  "message": "Congratulations 🎉\nYour Points: 15.40\nStatus: Qualified ✅\nSee You In Knockout Stage"
}
```

### Knockout Stage
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/tournament/knockout/bracket` | ✅ | Full bracket (all rounds with status per round) |
| POST | `/api/tournament/knockout/play` | ✅ | Play a knockout match (win or eliminated) |

#### Knockout Rounds (in order)
`round-of-32` → `round-of-16` → `quarter-final` → `semi-final` → `final` → **Champion**

#### `GET /api/tournament/knockout/bracket` — Response
```json
{
  "status": "knockout",
  "currentRound": "quarter-final",
  "completedRounds": ["round-of-32", "round-of-16"],
  "bracket": [
    { "round": "round-of-32", "roundLabel": "Round of 32", "playerStatus": "won" },
    { "round": "round-of-16", "roundLabel": "Round of 16", "playerStatus": "won" },
    { "round": "quarter-final", "roundLabel": "Quarter Final", "playerStatus": "current" },
    { "round": "semi-final", "roundLabel": "Semi Final", "playerStatus": "upcoming" },
    { "round": "final", "roundLabel": "Final", "playerStatus": "upcoming" }
  ]
}
```

### Player Stats
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/player/career-stats` | ✅ | Lifetime career stats across all tournaments |
| GET | `/api/player/profile` | ✅ | Display name, level, badges, win rate |

### Player Wallet / XP
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/player/wallet` | ✅ | Coins, cash, XP, level, next-level progress |
| POST | `/api/player/wallet/upsert` | ✅ | Create/update player profile (call on first login) |
| GET | `/api/player/wallet/tx` | ✅ | Transaction history (paginated) |

### Game Rooms (Multiplayer)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/game/rooms` | ✅ | Create a room (mode: classic/quick, entryType: free/coins/cash) |
| GET | `/api/game/rooms/:code` | ✅ | Get room by 6-char code |
| POST | `/api/game/rooms/:code/join` | ✅ | Join a room by code |
| POST | `/api/game/rooms/:code/leave` | ✅ | Leave a room |
| GET | `/api/game/rooms/:code/state` | ✅ | Live game state snapshot |

#### WebSocket (`/api/ws/socket.io`)
Events emitted by client: `room:join`, `room:leave`, `game:start`, `game:roll`, `game:move`, `chat:room`
Events broadcast by server: `room:joined`, `room:player_joined`, `room:player_left`, `game:started`, `game:dice_rolled`, `game:moved`, `game:finished`, `chat:room_message`, `error`

### Leaderboard
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/leaderboard/global` | ✅ | Top players by coins (all-time) |
| GET | `/api/leaderboard/weekly` | ✅ | Top earners this week |
| GET | `/api/leaderboard/friends` | ✅ | Ranking among friends only |
| GET | `/api/leaderboard/my-rank` | ✅ | Caller's rank in global board |

### Friends
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/friends/request` | ✅ | Send friend request (`{ recipientId }`) |
| POST | `/api/friends/:id/accept` | ✅ | Accept a request |
| POST | `/api/friends/:id/decline` | ✅ | Decline a request |
| DELETE | `/api/friends/:id` | ✅ | Remove friend or cancel request |
| GET | `/api/friends` | ✅ | My friend list |
| GET | `/api/friends/requests` | ✅ | Incoming pending requests |
| GET | `/api/friends/sent` | ✅ | Outgoing pending requests |

### Chat
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/chat/room/:roomId` | ✅ | Room chat history |
| GET | `/api/chat/dm/:userId` | ✅ | DM history with a user |
| POST | `/api/chat/dm` | ✅ | Send a DM (`{ recipientId, content }`) |
| DELETE | `/api/chat/:messageId` | ✅ | Soft-delete own message |

### Daily Bonus
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/daily-bonus/status` | ✅ | Can player claim today? streak, next reward |
| POST | `/api/daily-bonus/claim` | ✅ | Claim today's reward (idempotent per day) |

### Notifications
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/notifications/token` | ✅ | Register FCM/APNs push token |
| GET | `/api/notifications` | ✅ | Notification history (`?unreadOnly=true`) |
| POST | `/api/notifications/:id/read` | ✅ | Mark one as read |
| POST | `/api/notifications/read-all` | ✅ | Mark all as read |
| DELETE | `/api/notifications/:id` | ✅ | Delete a notification |

### Store / Deposit
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/store/bundles` | ❌ | List coin bundles (100–10 000 coins) |
| POST | `/api/store/purchase` | ✅ | Buy a bundle (`{ bundleId, externalRef }`) |
| POST | `/api/store/deposit/verify` | ✅ | Verify real-money deposit (bKash/Nagad/card) |
| GET | `/api/store/transactions` | ✅ | Purchase history |

### Nearby Match
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/nearby/update-location` | ✅ | Update player GPS (`{ latitude, longitude }`) |
| GET | `/api/nearby/players` | ✅ | Players within radius (`?radiusKm=10`) |
| GET | `/api/nearby/rooms` | ✅ | Open nearby rooms (`?radiusKm=10`) |

---

## Database Schema (8 tables)

| Table | Purpose |
|---|---|
| `tournaments` | One active season at a time |
| `tournament_registrations` | Per-player registration + live standings |
| `tournament_pools` | **HIDDEN** — pool metadata (size 4/8/12/16) |
| `pool_members` | **HIDDEN** — player→pool assignment |
| `league_matches` | Each of the 3 league matches per player |
| `match_kill_bonuses` | Individual kill/penalty events per match |
| `knockout_matches` | Each knockout round match per player |
| `player_career_stats` | Lifetime aggregate stats |

### Kill Bonus Tiers
| Token progress | Bonus/Penalty |
|---|---|
| 10% | ±0.10 |
| 25% | ±0.25 |
| 40% | ±0.40 |
| 55% | ±0.55 |
| 70% | ±0.70 |
| 85% | ±0.85 |
| 99% | ±0.99 |
| 1 step before finish | ±1.00 |

The victim always receives the **exact same magnitude** as penalty that the killer received as bonus.

---

## Architecture Decisions

- **Hidden pool system** — `tournament_pools` and `pool_members` tables have no player-facing API endpoints. Players never see pool ID, size, members, or rank. Pools are auto-assigned on first league match play.
- **AI opponents** — All current league and knockout opponents are AI-simulated. `opponentClerkUserId` is null for AI matches. Real matchmaking can be wired later.
- **Single active tournament** — The system maintains one `status = 'open'` tournament. All new registrations go to this tournament. Create a new tournament by marking the current one `completed`.
- **Qualification threshold** — Generated randomly (8.0–14.0 pts) per player at qualification time, not per pool. Hidden until the player triggers the review.
- **Career stats** — Maintained as running totals in `player_career_stats`. Updated after every match.

---

## User Preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

---

## Gotchas

- `pnpm run typecheck:libs` must be run after any `lib/*` schema change before checking artifacts.
- After any DB schema change, run `pnpm --filter @workspace/db run push` (requires `DATABASE_URL`).
- The API server uses `zod` (not `zod/v4`) — esbuild cannot resolve the subpath export.
- Never import `@workspace/db` from frontend artifacts — it contains `pg` which is Node-only.
- `drizzle-orm`'s SQL increment pattern: `sql\`\${table.col} + 1\`` (not `db.$count()`).

---

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
