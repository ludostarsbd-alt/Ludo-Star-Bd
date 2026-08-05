/**
 * Knockout routes
 *
 * GET  /api/tournament/knockout/bracket   — player's current knockout status + history
 * POST /api/tournament/knockout/play      — play a knockout match (win or lose)
 */

import { Router, type IRouter } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tournamentsTable,
  tournamentRegistrationsTable,
  tournamentTeamsTable,
  knockoutMatchesTable,
  playerCareerStatsTable,
} from "@workspace/db";
import { requireAuth } from "../../lib/auth";
import { simulateKnockoutMatch } from "../../lib/match.service";
import { KNOCKOUT_ROUNDS, roundLabel, type KnockoutRound } from "../../lib/tournament-format";

const router: IRouter = Router();

/* ─── Knockout round definitions ──────────────────────────────────────────── */

function nextRound(current: KnockoutRound): KnockoutRound | null {
  const idx = KNOCKOUT_ROUNDS.indexOf(current);
  return idx < KNOCKOUT_ROUNDS.length - 1
    ? KNOCKOUT_ROUNDS[idx + 1]
    : null;
}

function enabledKnockoutRounds(enabledStages: unknown): KnockoutRound[] {
  if (!Array.isArray(enabledStages)) return [...KNOCKOUT_ROUNDS];
  return KNOCKOUT_ROUNDS.filter((round) => enabledStages.includes(round));
}

/* ─── Helper ──────────────────────────────────────────────────────────────── */

async function getActiveRegistration(userId: string) {
  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(inArray(tournamentsTable.status, ["open", "running"]))
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

  return reg ? { reg, tournamentId: tournament.id, tournament } : null;
}

/* ─── GET /api/tournament/knockout/bracket ────────────────────────────────── */

router.get("/tournament/knockout/bracket", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const ctx = await getActiveRegistration(userId);
  if (!ctx) {
    res.status(404).json({ error: "Not registered for any active tournament." });
    return;
  }

  const { reg, tournament } = ctx;
  const rounds = enabledKnockoutRounds(tournament.enabledStages);

  if (!["qualified", "knockout", "champion", "eliminated"].includes(reg.status)) {
    res.status(409).json({ error: "Not yet in knockout stage." });
    return;
  }

  const knockoutHistory = await db
    .select()
    .from(knockoutMatchesTable)
    .where(eq(knockoutMatchesTable.registrationId, reg.id))
    .orderBy(knockoutMatchesTable.playedAt);

  const completedRounds = knockoutHistory
    .filter((k) => k.outcome === "win")
    .map((k) => k.round);

  res.json({
    status: reg.status,
    currentRound: reg.knockoutRound,
    currentRoundLabel: reg.knockoutRound
       ? roundLabel(reg.knockoutRound as KnockoutRound)
      : null,
    completedRounds,
    knockoutHistory: knockoutHistory.map((k) => ({
      round: k.round,
       roundLabel: roundLabel(k.round as KnockoutRound) ?? k.round,
      opponentName: k.opponentName,
      outcome: k.outcome,
      playedAt: k.playedAt,
    })),
    // Full bracket (all rounds visible, status per round)
    bracket: rounds.map((r) => ({
      round: r,
       roundLabel: roundLabel(r),
      playerStatus: (() => {
        if (completedRounds.includes(r)) return "won";
        const lostHere = knockoutHistory.find(
          (k) => k.round === r && k.outcome === "loss"
        );
        if (lostHere) return "lost";
        if (
          reg.knockoutRound === r &&
          (reg.status === "qualified" || reg.status === "knockout")
        ) return "current";
        return "upcoming";
      })(),
    })),
  });
});

/* ─── POST /api/tournament/knockout/play ─────────────────────────────────── */

router.post("/tournament/knockout/play", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const ctx = await getActiveRegistration(userId);
  if (!ctx) {
    res.status(404).json({ error: "Not registered for any active tournament." });
    return;
  }

  const { reg, tournamentId, tournament } = ctx;
  const rounds = enabledKnockoutRounds(tournament.enabledStages);
  const [team] = reg.teamId
    ? await db.select().from(tournamentTeamsTable).where(eq(tournamentTeamsTable.id, reg.teamId)).limit(1)
    : [];

  // Must be in knockout stage
  if (reg.status !== "knockout" && reg.status !== "qualified") {
    res.status(409).json({
      error:
        reg.status === "champion"
          ? "You are already the champion!"
          : reg.status === "eliminated"
          ? "You have been eliminated."
          : "Not in knockout stage yet.",
    });
    return;
  }

  const currentRound = reg.knockoutRound as KnockoutRound;
  if (!currentRound || !rounds.includes(currentRound)) {
    res.status(500).json({ error: "Invalid knockout round state." });
    return;
  }
  if (team && team.status !== "ready") {
    res.status(409).json({ error: "This team is no longer active in the tournament." });
    return;
  }

  // Simulate match
  const sim = simulateKnockoutMatch();

  // Persist
  const [match] = await db
    .insert(knockoutMatchesTable)
    .values({
      tournamentId,
      registrationId: reg.id,
      clerkUserId: userId,
      round: currentRound,
      opponentName: sim.opponentName,
      opponentClerkUserId: null, // AI
      outcome: sim.outcome,
    })
    .returning();

  let newStatus: string;
  let newRound: string | null = null;

  if (sim.outcome === "loss") {
    newStatus = "eliminated";
    newRound = null;
  } else {
    // Won — advance to next round, or become champion
    const currentIndex = rounds.indexOf(currentRound);
    const next = currentIndex >= 0 && currentIndex < rounds.length - 1
      ? rounds[currentIndex + 1]
      : null;
    if (next) {
      newStatus = "knockout";
      newRound = next;
    } else {
      // Won the final!
      newStatus = "champion";
      newRound = null;
    }
  }

  await db
    .update(tournamentRegistrationsTable)
    .set({
      status: newStatus,
      knockoutRound: newRound,
      updatedAt: new Date(),
    })
    .where(eq(tournamentRegistrationsTable.id, reg.id));

  if (team) {
    await db.update(tournamentTeamsTable).set({
      status: newStatus === "champion" ? "champion" : newStatus === "eliminated" ? "eliminated" : "ready",
      knockoutRound: newRound,
      updatedAt: new Date(),
    }).where(eq(tournamentTeamsTable.id, team.id));
    await db.update(tournamentRegistrationsTable).set({
      status: newStatus,
      knockoutRound: newRound,
      updatedAt: new Date(),
    }).where(and(
      eq(tournamentRegistrationsTable.tournamentId, tournamentId),
      eq(tournamentRegistrationsTable.teamId, team.id),
    ));
  }

  if (newStatus === "champion") {
    await db.update(tournamentsTable).set({
      status: "completed",
      championName: team?.name ?? reg.displayName,
      championTeamId: team?.id ?? null,
      updatedAt: new Date(),
    }).where(eq(tournamentsTable.id, tournamentId));
  }

  // Update career stats — select first then update
  {
    const [cs] = await db
      .select()
      .from(playerCareerStatsTable)
      .where(eq(playerCareerStatsTable.clerkUserId, userId))
      .limit(1);

    if (cs) {
    const roundOrder = rounds as readonly string[];
      const currentBestIdx = cs.bestKnockoutRound
        ? roundOrder.indexOf(cs.bestKnockoutRound)
        : -1;
      const newRoundIdx = roundOrder.indexOf(currentRound);
      const bestRound =
        newRoundIdx > currentBestIdx ? currentRound : cs.bestKnockoutRound;

      await db
        .update(playerCareerStatsTable)
        .set({
          knockoutsPlayed: cs.knockoutsPlayed + 1,
          knockoutWins:    cs.knockoutWins + (sim.outcome === "win" ? 1 : 0),
          bestKnockoutRound: bestRound,
          championships:
            newStatus === "champion"
              ? cs.championships + 1
              : cs.championships,
          lastPlayedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(playerCareerStatsTable.clerkUserId, userId));
    }
  }

  req.log.info(
    { userId, round: currentRound, outcome: sim.outcome, newStatus },
    "Knockout match played",
  );

  res.status(201).json({
    matchId: match.id,
    round: currentRound,
     roundLabel: roundLabel(currentRound),
    opponentName: sim.opponentName,
    outcome: sim.outcome,
    newStatus,
    nextRound: newRound,
     nextRoundLabel: newRound ? roundLabel(newRound as KnockoutRound) : null,
    isChampion: newStatus === "champion",
    isEliminated: newStatus === "eliminated",
    message: (() => {
      if (newStatus === "champion") return "🏆 আপনি চ্যাম্পিয়ন হয়েছেন!";
      if (newStatus === "eliminated") return "আপনি টুর্নামেন্ট থেকে বাদ পড়েছেন।";
       return `আপনি ${roundLabel(currentRound)} জিতেছেন! পরবর্তী: ${roundLabel(newRound as KnockoutRound)}`;
    })(),
  });
});

export default router;
