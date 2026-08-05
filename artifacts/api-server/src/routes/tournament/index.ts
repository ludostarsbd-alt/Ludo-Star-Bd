/**
 * Tournament core routes
 *
 * POST /api/tournament/join            — register for the active tournament
 * GET  /api/tournament/my-status       — current player's full tournament status
 * POST /api/tournament/reset           — reset/leave current tournament (dev/testing)
 */

import { Router, type IRouter } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  tournamentsTable,
  tournamentRegistrationsTable,
  leagueMatchesTable,
  matchKillBonusesTable,
  knockoutMatchesTable,
  playerCareerStatsTable,
  tournamentTeamsTable,
} from "@workspace/db";
import { requireAuth } from "../../lib/auth";

const router: IRouter = Router();

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

/** Return the single open tournament, creating one if none exists. */
async function getOrCreateActiveTournament() {
  const [existing] = await db
    .select()
    .from(tournamentsTable)
    .where(inArray(tournamentsTable.status, ["open", "running"]))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(tournamentsTable)
    .values({ status: "open" })
    .returning();

  return created;
}

/* ─── POST /api/tournament/join ────────────────────────────────────────────── */

const JoinBody = z.object({
  displayName: z.string().min(1).max(50),
  nearbyEnabled: z.boolean().optional().default(false),
});

router.post("/tournament/join", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = JoinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { displayName, nearbyEnabled } = parsed.data;
  const tournament = await getOrCreateActiveTournament();

  // Check if player already registered for this tournament
  const [existing] = await db
    .select()
    .from(tournamentRegistrationsTable)
    .where(
      and(
        eq(tournamentRegistrationsTable.tournamentId, tournament.id),
        eq(tournamentRegistrationsTable.clerkUserId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    res.status(200).json({
      registrationId: existing.id,
      tournamentId: tournament.id,
      status: existing.status,
      alreadyJoined: true,
    });
    return;
  }

  if (tournament.status !== "open") {
    res.status(409).json({ error: "This tournament has already started; new players cannot join now." });
    return;
  }

  // Create registration
  const [registration] = await db
    .insert(tournamentRegistrationsTable)
    .values({
      tournamentId: tournament.id,
      clerkUserId: userId,
      displayName,
      nearbyEnabled,
      status: "waiting",
    })
    .returning();

  // Upsert career stats (increment tournaments joined)
  await db
    .insert(playerCareerStatsTable)
    .values({
      clerkUserId: userId,
      displayName,
      tournamentsJoined: 1,
    })
    .onConflictDoUpdate({
      target: playerCareerStatsTable.clerkUserId,
      set: {
        displayName,
        tournamentsJoined: sql`${playerCareerStatsTable.tournamentsJoined} + 1`,
        lastPlayedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .catch(() => {
      // Silently ignore upsert conflicts
    });

  req.log.info({ userId, tournamentId: tournament.id }, "Player joined tournament");

  res.status(201).json({
    registrationId: registration.id,
    tournamentId: tournament.id,
    status: registration.status,
    alreadyJoined: false,
  });
});

/* ─── GET /api/tournament/my-status ───────────────────────────────────────── */

router.get("/tournament/my-status", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const tournament = await getOrCreateActiveTournament();

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

  if (!reg) {
    res.status(404).json({ error: "Not registered for active tournament" });
    return;
  }

  // Fetch league match history (player's own data only)
  const leagueMatches = await db
    .select()
    .from(leagueMatchesTable)
    .where(eq(leagueMatchesTable.registrationId, reg.id));

  // Fetch kill bonuses for each match
  const matchesWithBonuses = await Promise.all(
    leagueMatches.map(async (match) => {
      const killBonuses = await db
        .select()
        .from(matchKillBonusesTable)
        .where(eq(matchKillBonusesTable.matchId, match.id));
      return { ...match, killBonuses };
    }),
  );

  // Fetch knockout history
  const knockoutHistory = await db
    .select()
    .from(knockoutMatchesTable)
    .where(eq(knockoutMatchesTable.registrationId, reg.id));

  const team = reg.teamId
    ? (await db.select().from(tournamentTeamsTable).where(eq(tournamentTeamsTable.id, reg.teamId)).limit(1))[0] ?? null
    : null;

  res.json({
    tournamentId: tournament.id,
    registrationId: reg.id,
    // Player-visible data only — no pool info
    status: reg.status,
    matchesPlayed: reg.matchesPlayed,
    wins: reg.wins,
    losses: reg.losses,
    draws: reg.draws,
    totalPoints: Number(reg.totalPoints),
    qualified: reg.qualified,
    qualificationThreshold: reg.qualificationThreshold ? Number(reg.qualificationThreshold) : null,
    knockoutRound: reg.knockoutRound,
    tournamentFormat: tournament.format,
    participantCount: tournament.participantCount,
    groupCount: tournament.groupCount,
    entryStage: tournament.entryStage,
    nearbyEnabled: reg.nearbyEnabled,
    joinedAt: reg.joinedAt,
    team: team ? {
      id: team.id,
      name: team.name,
      captainName: team.captainName,
      partnerName: team.partnerName,
      status: team.status,
      matchesPlayed: team.matchesPlayed,
      wins: team.wins,
      losses: team.losses,
      points: Number(team.points),
      qualified: team.qualified,
      qualificationThreshold: team.qualificationThreshold ? Number(team.qualificationThreshold) : null,
      knockoutRound: team.knockoutRound,
    } : null,
    // Match history
    leagueMatches: matchesWithBonuses.map((m) => ({
      id: m.id,
      matchNumber: m.matchNumber,
      opponentName: m.opponentName,
      outcome: m.outcome,
      basePoints: Number(m.basePoints),
      killBonusTotal: Number(m.killBonusTotal),
      penaltyTotal: Number(m.penaltyTotal),
      netPoints: Number(m.netPoints),
      playedAt: m.playedAt,
      kills: m.killBonuses.filter(kb => kb.type === "bonus").map(kb => ({
        victimName: kb.victimName,
        progressPct: kb.progressPct,
        bonusAmount: Number(kb.bonusAmount),
      })),
      penalties: m.killBonuses.filter(kb => kb.type === "penalty").map(kb => ({
        victimName: kb.victimName,
        progressPct: kb.progressPct,
        bonusAmount: Number(kb.bonusAmount),
      })),
    })),
    knockoutHistory: knockoutHistory.map((k) => ({
      round: k.round,
      opponentName: k.opponentName,
      outcome: k.outcome,
      playedAt: k.playedAt,
    })),
  });
});

/* ─── POST /api/tournament/reset ──────────────────────────────────────────── */

router.post("/tournament/reset", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const tournament = await getOrCreateActiveTournament();

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

  if (!reg) {
    res.status(404).json({ error: "Not registered for active tournament" });
    return;
  }

  // Delete all match data for this registration
  await db
    .delete(leagueMatchesTable)
    .where(eq(leagueMatchesTable.registrationId, reg.id));
  await db
    .delete(knockoutMatchesTable)
    .where(eq(knockoutMatchesTable.registrationId, reg.id));

  // Reset registration status
  await db
    .update(tournamentRegistrationsTable)
    .set({
      status: "waiting",
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      totalPoints: "0.00",
      qualificationThreshold: null,
      qualified: null,
      knockoutRound: null,
      updatedAt: new Date(),
    })
    .where(eq(tournamentRegistrationsTable.id, reg.id));

  req.log.info({ userId }, "Player reset tournament");
  res.json({ success: true });
});

export default router;
