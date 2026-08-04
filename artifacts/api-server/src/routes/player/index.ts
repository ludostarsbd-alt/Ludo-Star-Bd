/**
 * Player routes
 *
 * GET  /api/player/career-stats    — lifetime career stats for the logged-in player
 * GET  /api/player/profile         — display name, level, badges etc.
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { playerCareerStatsTable, tournamentRegistrationsTable } from "@workspace/db";
import { requireAuth } from "../../lib/auth";

const router: IRouter = Router();

/* ─── GET /api/player/career-stats ───────────────────────────────────────── */

router.get("/player/career-stats", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [stats] = await db
    .select()
    .from(playerCareerStatsTable)
    .where(eq(playerCareerStatsTable.clerkUserId, userId))
    .limit(1);

  if (!stats) {
    // Return zero-state if player has never joined a tournament
    res.json({
      tournamentsJoined: 0,
      tournamentsQualified: 0,
      championships: 0,
      leagueMatchesPlayed: 0,
      leagueWins: 0,
      leagueLosses: 0,
      leagueDraws: 0,
      totalLeaguePoints: 0,
      knockoutsPlayed: 0,
      knockoutWins: 0,
      bestKnockoutRound: null,
      totalKills: 0,
      totalKillBonusEarned: 0,
      totalPenaltySuffered: 0,
      winRate: 0,
      lastPlayedAt: null,
    });
    return;
  }

  const leagueWinRate =
    stats.leagueMatchesPlayed > 0
      ? Math.round((stats.leagueWins / stats.leagueMatchesPlayed) * 100)
      : 0;

  res.json({
    displayName: stats.displayName,
    tournamentsJoined: stats.tournamentsJoined,
    tournamentsQualified: stats.tournamentsQualified,
    championships: stats.championships,
    leagueMatchesPlayed: stats.leagueMatchesPlayed,
    leagueWins: stats.leagueWins,
    leagueLosses: stats.leagueLosses,
    leagueDraws: stats.leagueDraws,
    totalLeaguePoints: Number(stats.totalLeaguePoints),
    knockoutsPlayed: stats.knockoutsPlayed,
    knockoutWins: stats.knockoutWins,
    bestKnockoutRound: stats.bestKnockoutRound,
    totalKills: stats.totalKills,
    totalKillBonusEarned: Number(stats.totalKillBonusEarned),
    totalPenaltySuffered: Number(stats.totalPenaltySuffered),
    winRate: leagueWinRate,
    lastPlayedAt: stats.lastPlayedAt,
  });
});

/* ─── GET /api/player/profile ─────────────────────────────────────────────── */

router.get("/player/profile", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [stats] = await db
    .select()
    .from(playerCareerStatsTable)
    .where(eq(playerCareerStatsTable.clerkUserId, userId))
    .limit(1);

  // Compute level from total points (simple formula)
  const totalPoints = stats ? Number(stats.totalLeaguePoints) : 0;
  const level = Math.max(1, Math.floor(totalPoints / 20) + 1);

  // Determine badges
  const badges: string[] = [];
  if (stats) {
    if (stats.championships > 0)         badges.push("Champion 🏆");
    if (stats.tournamentsQualified >= 5)  badges.push("Veteran ⭐");
    if (stats.totalKills >= 50)          badges.push("Assassin 💀");
    if (stats.leagueWins >= 10)          badges.push("League Pro ⚔️");
    if (stats.knockoutsPlayed >= 5)      badges.push("Knockout Beast 🔥");
  }

  res.json({
    clerkUserId: userId,
    displayName: stats?.displayName ?? "Player",
    level,
    totalPoints,
    badges,
    tournamentsJoined: stats?.tournamentsJoined ?? 0,
    championships: stats?.championships ?? 0,
    winRate:
      stats && stats.leagueMatchesPlayed > 0
        ? Math.round((stats.leagueWins / stats.leagueMatchesPlayed) * 100)
        : 0,
  });
});

export default router;
