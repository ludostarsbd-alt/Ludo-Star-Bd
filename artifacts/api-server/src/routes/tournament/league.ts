/**
 * League match routes
 *
 * POST /api/tournament/league/play         — play the next league match (simulated)
 * GET  /api/tournament/league/my-stats     — player's personal league stats only
 * POST /api/tournament/league/qualify      — trigger qualification review after 3 matches
 */

import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tournamentsTable,
  tournamentRegistrationsTable,
  leagueMatchesTable,
  matchKillBonusesTable,
  playerCareerStatsTable,
} from "@workspace/db";
import { requireAuth } from "../../lib/auth";
import { simulateLeagueMatch, generateQualificationThreshold, round2 } from "../../lib/match.service";
import { assignPlayerToPool, getPoolIdForRegistration } from "../../lib/pool.service";

const router: IRouter = Router();

/* ─── Helper: get active tournament ───────────────────────────────────────── */

async function getActiveRegistration(userId: string) {
  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.status, "open"))
    .limit(1);

  if (!tournament) return null;

  const [reg] = await db
    .select()
    .from(tournamentRegistrationsTable)
    .where(
      and(
        eq(tournamentRegistrationsTable.tournamentId, tournament.id),
        eq(tournamentRegistrationsTable.clerkUserId, userId),
      ),
    )
    .limit(1);

  return reg ? { reg, tournamentId: tournament.id } : null;
}

/* ─── POST /api/tournament/league/play ────────────────────────────────────── */

router.post("/tournament/league/play", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const ctx = await getActiveRegistration(userId);
  if (!ctx) {
    res.status(404).json({ error: "Not registered for any active tournament." });
    return;
  }

  const { reg, tournamentId } = ctx;

  // Guard: already played 3 matches
  if (reg.matchesPlayed >= 3) {
    res.status(409).json({ error: "You have already played all 3 league matches." });
    return;
  }

  // Guard: must not be in knockout or eliminated already
  if (["knockout", "champion", "eliminated"].includes(reg.status)) {
    res.status(409).json({ error: "League stage is over for this tournament." });
    return;
  }

  // Assign to pool on first match (idempotent)
  const pool = await assignPlayerToPool(tournamentId, reg.id, userId);

  // Simulate the match
  const sim = simulateLeagueMatch();
  const matchNumber = reg.matchesPlayed + 1;

  // Persist the match
  const [match] = await db
    .insert(leagueMatchesTable)
    .values({
      tournamentId,
      registrationId: reg.id,
      clerkUserId: userId,
      poolId: pool.id,
      matchNumber,
      opponentName: sim.opponentName,
      opponentClerkUserId: null, // AI opponent
      outcome: sim.outcome,
      basePoints: String(sim.basePoints),
      killBonusTotal: String(sim.killBonusTotal),
      penaltyTotal: String(sim.penaltyTotal),
      netPoints: String(sim.netPoints),
    })
    .returning();

  // Persist kill bonus events
  const killBonusInserts = [
    ...sim.kills.map((k) => ({
      matchId: match.id,
      registrationId: reg.id,
      type: "bonus" as const,
      victimName: k.victimName,
      progressPct: k.progressPct,
      bonusAmount: String(k.bonusAmount),
    })),
    ...sim.penalties.map((p) => ({
      matchId: match.id,
      registrationId: reg.id,
      type: "penalty" as const,
      victimName: p.victimName,
      progressPct: p.progressPct,
      bonusAmount: String(p.bonusAmount),
    })),
  ];

  if (killBonusInserts.length > 0) {
    await db.insert(matchKillBonusesTable).values(killBonusInserts);
  }

  // Update registration totals
  const newMatchesPlayed = reg.matchesPlayed + 1;
  const newWins    = reg.wins   + (sim.outcome === "win"  ? 1 : 0);
  const newLosses  = reg.losses + (sim.outcome === "loss" ? 1 : 0);
  const newDraws   = reg.draws  + (sim.outcome === "draw" ? 1 : 0);
  const newPoints  = round2(Number(reg.totalPoints) + sim.netPoints);
  const newStatus  = newMatchesPlayed >= 3 ? "league_done" : "league_playing";

  await db
    .update(tournamentRegistrationsTable)
    .set({
      matchesPlayed: newMatchesPlayed,
      wins: newWins,
      losses: newLosses,
      draws: newDraws,
      totalPoints: String(newPoints),
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(tournamentRegistrationsTable.id, reg.id));

  // Update career stats (select first, then increment)
  const [cs] = await db
    .select()
    .from(playerCareerStatsTable)
    .where(eq(playerCareerStatsTable.clerkUserId, userId))
    .limit(1);
  if (cs) {
    await db
      .update(playerCareerStatsTable)
      .set({
        leagueMatchesPlayed: cs.leagueMatchesPlayed + 1,
        leagueWins:          cs.leagueWins   + (sim.outcome === "win"  ? 1 : 0),
        leagueLosses:        cs.leagueLosses + (sim.outcome === "loss" ? 1 : 0),
        leagueDraws:         cs.leagueDraws  + (sim.outcome === "draw" ? 1 : 0),
        totalLeaguePoints:   String(Math.round((Number(cs.totalLeaguePoints) + sim.netPoints) * 100) / 100),
        totalKills:          cs.totalKills + sim.kills.length,
        totalKillBonusEarned: String(Math.round((Number(cs.totalKillBonusEarned) + sim.killBonusTotal) * 100) / 100),
        totalPenaltySuffered: String(Math.round((Number(cs.totalPenaltySuffered) + sim.penaltyTotal) * 100) / 100),
        lastPlayedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(playerCareerStatsTable.clerkUserId, userId));
  } else {
    // Insert first-time career stats row
    await db.insert(playerCareerStatsTable).values({
      clerkUserId: userId,
      displayName: reg.displayName,
      tournamentsJoined: 1,
      leagueMatchesPlayed: 1,
      leagueWins:   sim.outcome === "win"  ? 1 : 0,
      leagueLosses: sim.outcome === "loss" ? 1 : 0,
      leagueDraws:  sim.outcome === "draw" ? 1 : 0,
      totalLeaguePoints:    String(sim.netPoints),
      totalKills:           sim.kills.length,
      totalKillBonusEarned: String(sim.killBonusTotal),
      totalPenaltySuffered: String(sim.penaltyTotal),
      lastPlayedAt: new Date(),
    }).catch(() => {});
  }

  req.log.info(
    { userId, matchNumber, outcome: sim.outcome, netPoints: sim.netPoints },
    "League match played",
  );

  res.status(201).json({
    matchId: match.id,
    matchNumber,
    opponentName: sim.outcome === "win"
      ? sim.opponentName
      : sim.opponentName,
    outcome: sim.outcome,
    basePoints: sim.basePoints,
    kills: sim.kills,
    penalties: sim.penalties,
    killBonusTotal: sim.killBonusTotal,
    penaltyTotal: sim.penaltyTotal,
    netPoints: sim.netPoints,
    // Updated standing
    standing: {
      matchesPlayed: newMatchesPlayed,
      wins: newWins,
      losses: newLosses,
      draws: newDraws,
      totalPoints: newPoints,
      status: newStatus,
    },
  });
});

/* ─── GET /api/tournament/league/my-stats ─────────────────────────────────── */

router.get("/tournament/league/my-stats", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const ctx = await getActiveRegistration(userId);
  if (!ctx) {
    res.status(404).json({ error: "Not registered for any active tournament." });
    return;
  }

  const { reg } = ctx;

  // Player sees ONLY their own data — no pool rank, no other players
  res.json({
    matchesPlayed: reg.matchesPlayed,
    wins: reg.wins,
    losses: reg.losses,
    draws: reg.draws,
    totalPoints: Number(reg.totalPoints),
    status: reg.status,
    // Status message shown to player
    statusMessage: (() => {
      switch (reg.status) {
        case "waiting":         return "Waiting for pool assignment…";
        case "pool_assigned":   return "Pool assigned. Ready to play!";
        case "league_playing":  return "Qualification Pending";
        case "league_done":     return "Qualification Pending";
        case "reviewing":       return "Your performance is being reviewed.";
        case "qualified":       return "Qualified ✅ — See You In Knockout Stage";
        case "eliminated":      return "Not Qualified ❌ — Better Luck Next Time.";
        case "knockout":        return "In Knockout Stage";
        case "champion":        return "🏆 Champion!";
        default:                return "Qualification Pending";
      }
    })(),
  });
});

/* ─── POST /api/tournament/league/qualify ─────────────────────────────────── */

router.post("/tournament/league/qualify", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const ctx = await getActiveRegistration(userId);
  if (!ctx) {
    res.status(404).json({ error: "Not registered for any active tournament." });
    return;
  }

  const { reg, tournamentId } = ctx;

  if (reg.matchesPlayed < 3) {
    res.status(409).json({ error: "You must complete all 3 league matches first." });
    return;
  }

  if (reg.status !== "league_done" && reg.status !== "reviewing") {
    res.status(409).json({
      error: "Qualification has already been determined.",
      status: reg.status,
      qualified: reg.qualified,
    });
    return;
  }

  // Set to reviewing first
  await db
    .update(tournamentRegistrationsTable)
    .set({ status: "reviewing", updatedAt: new Date() })
    .where(eq(tournamentRegistrationsTable.id, reg.id));

  // Generate qualification threshold (hidden from player until reveal)
  const threshold = generateQualificationThreshold();
  const playerPoints = Number(reg.totalPoints);
  const qualified = playerPoints >= threshold;
  const newStatus = qualified ? "qualified" : "eliminated";

  await db
    .update(tournamentRegistrationsTable)
    .set({
      status: newStatus,
      qualificationThreshold: String(threshold),
      qualified,
      knockoutRound: qualified ? "round-of-32" : null,
      updatedAt: new Date(),
    })
    .where(eq(tournamentRegistrationsTable.id, reg.id));

  // Increment tournamentsQualified in career stats
  if (qualified) {
    await db
      .update(playerCareerStatsTable)
      .set({
        tournamentsQualified: sql`${playerCareerStatsTable.tournamentsQualified} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(playerCareerStatsTable.clerkUserId, userId))
      .catch(() => {});
  }

  req.log.info(
    { userId, tournamentId, qualified, threshold, playerPoints },
    "Qualification determined",
  );

  res.json({
    qualified,
    yourPoints: playerPoints,
    qualifiedScore: threshold,
    difference: round2(Math.abs(playerPoints - threshold)),
    status: newStatus,
    // Status card message
    message: qualified
      ? `Congratulations 🎉\nYour Points: ${playerPoints}\nStatus: Qualified ✅\nSee You In Knockout Stage`
      : `Tournament Finished\nYour Points: ${playerPoints}\nQualified Score: ${threshold}\nDifference: ${round2(threshold - playerPoints)}\nStatus: Not Qualified ❌\nBetter Luck Next Time.`,
  });
});

export default router;
