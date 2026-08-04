/**
 * Knockout routes
 *
 * GET  /api/tournament/knockout/bracket   — player's current knockout status + history
 * POST /api/tournament/knockout/play      — play a knockout match (win or lose)
 */

import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tournamentsTable,
  tournamentRegistrationsTable,
  knockoutMatchesTable,
  playerCareerStatsTable,
} from "@workspace/db";
import { requireAuth } from "../../lib/auth";
import { simulateKnockoutMatch } from "../../lib/match.service";

const router: IRouter = Router();

/* ─── Knockout round definitions ──────────────────────────────────────────── */

const KNOCKOUT_ROUNDS = [
  "round-of-32",
  "round-of-16",
  "quarter-final",
  "semi-final",
  "final",
] as const;

type KnockoutRound = (typeof KNOCKOUT_ROUNDS)[number];

const ROUND_LABELS: Record<KnockoutRound, string> = {
  "round-of-32":   "Round of 32",
  "round-of-16":   "Round of 16",
  "quarter-final": "Quarter Final",
  "semi-final":    "Semi Final",
  "final":         "Final",
};

function nextRound(current: KnockoutRound): KnockoutRound | null {
  const idx = KNOCKOUT_ROUNDS.indexOf(current);
  return idx < KNOCKOUT_ROUNDS.length - 1
    ? KNOCKOUT_ROUNDS[idx + 1]
    : null;
}

/* ─── Helper ──────────────────────────────────────────────────────────────── */

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

/* ─── GET /api/tournament/knockout/bracket ────────────────────────────────── */

router.get("/tournament/knockout/bracket", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const ctx = await getActiveRegistration(userId);
  if (!ctx) {
    res.status(404).json({ error: "Not registered for any active tournament." });
    return;
  }

  const { reg } = ctx;

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
      ? ROUND_LABELS[reg.knockoutRound as KnockoutRound]
      : null,
    completedRounds,
    knockoutHistory: knockoutHistory.map((k) => ({
      round: k.round,
      roundLabel: ROUND_LABELS[k.round as KnockoutRound] ?? k.round,
      opponentName: k.opponentName,
      outcome: k.outcome,
      playedAt: k.playedAt,
    })),
    // Full bracket (all rounds visible, status per round)
    bracket: KNOCKOUT_ROUNDS.map((r) => ({
      round: r,
      roundLabel: ROUND_LABELS[r],
      playerStatus: (() => {
        if (completedRounds.includes(r)) return "won";
        const lostHere = knockoutHistory.find(
          (k) => k.round === r && k.outcome === "loss"
        );
        if (lostHere) return "lost";
        if (reg.knockoutRound === r && reg.status === "knockout") return "current";
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

  const { reg, tournamentId } = ctx;

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
  if (!currentRound || !KNOCKOUT_ROUNDS.includes(currentRound)) {
    res.status(500).json({ error: "Invalid knockout round state." });
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
    const next = nextRound(currentRound);
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

  // Update career stats — select first then update
  {
    const [cs] = await db
      .select()
      .from(playerCareerStatsTable)
      .where(eq(playerCareerStatsTable.clerkUserId, userId))
      .limit(1);

    if (cs) {
      const roundOrder = KNOCKOUT_ROUNDS as readonly string[];
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
    roundLabel: ROUND_LABELS[currentRound],
    opponentName: sim.opponentName,
    outcome: sim.outcome,
    newStatus,
    nextRound: newRound,
    nextRoundLabel: newRound ? ROUND_LABELS[newRound as KnockoutRound] : null,
    isChampion: newStatus === "champion",
    isEliminated: newStatus === "eliminated",
    message: (() => {
      if (newStatus === "champion") return "🏆 আপনি চ্যাম্পিয়ন হয়েছেন!";
      if (newStatus === "eliminated") return "আপনি টুর্নামেন্ট থেকে বাদ পড়েছেন।";
      return `আপনি ${ROUND_LABELS[currentRound]} জিতেছেন! পরবর্তী: ${ROUND_LABELS[newRound as KnockoutRound]}`;
    })(),
  });
});

export default router;
