/**
 * Player routes
 *
 * GET  /api/player/career-stats    — lifetime career stats for the logged-in player
 * GET  /api/player/profile         — display name, level, badges etc.
 */

import { Router, type IRouter } from "express";
import { eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  playerCareerStatsTable,
  playersTable,
} from "@workspace/db";
import { requireAuth } from "../../lib/auth";
import {
  getDirectMessagePermission,
  relationshipFor,
} from "../../lib/social";

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
      onlineMatchesPlayed: 0,
      onlineWins: 0,
      onlineLosses: 0,
      bestKnockoutRound: null,
      totalKills: 0,
      totalKillBonusEarned: 0,
      totalPenaltySuffered: 0,
      winRate: 0,
      overallWinRate: 0,
      lastPlayedAt: null,
    });
    return;
  }

  const leagueWinRate =
    stats.leagueMatchesPlayed > 0
      ? Math.round((stats.leagueWins / stats.leagueMatchesPlayed) * 100)
      : 0;
  const totalMatches = stats.leagueMatchesPlayed + stats.onlineMatchesPlayed;
  const totalWins = stats.leagueWins + stats.onlineWins;

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
    onlineMatchesPlayed: stats.onlineMatchesPlayed,
    onlineWins: stats.onlineWins,
    onlineLosses: stats.onlineLosses,
    bestKnockoutRound: stats.bestKnockoutRound,
    totalKills: stats.totalKills,
    totalKillBonusEarned: Number(stats.totalKillBonusEarned),
    totalPenaltySuffered: Number(stats.totalPenaltySuffered),
    winRate: leagueWinRate,
    overallWinRate: totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0,
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
  const totalMatches = stats
    ? stats.leagueMatchesPlayed + stats.onlineMatchesPlayed
    : 0;
  const totalWins = stats ? stats.leagueWins + stats.onlineWins : 0;
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
    onlineMatchesPlayed: stats?.onlineMatchesPlayed ?? 0,
    onlineWins: stats?.onlineWins ?? 0,
    onlineLosses: stats?.onlineLosses ?? 0,
    overallWinRate: totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0,
  });
});

/* ─── GET /api/player/profile/:playerId ───────────────────────────────────── */

router.get("/player/profile/:playerId", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, req.params.playerId))
    .limit(1);
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const [stats] = await db
    .select()
    .from(playerCareerStatsTable)
    .where(eq(playerCareerStatsTable.clerkUserId, player.clerkUserId))
    .limit(1);
  const totalPoints = stats ? Number(stats.totalLeaguePoints) : 0;
  const relationship = await relationshipFor(userId, player.clerkUserId);
  const messagePermission =
    userId === player.clerkUserId
      ? { allowed: false, reason: "You cannot message yourself." }
      : await getDirectMessagePermission(userId, player.clerkUserId);

  const [rankRow] = await db
    .select({
      rank: sql<number>`count(*) + 1`,
    })
    .from(playersTable)
    .where(sql`${playersTable.coins} > ${player.coins}`);

  res.json({
    clerkUserId: player.clerkUserId,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    level: player.level,
    xp: player.xp,
    rank: Number(rankRow?.rank ?? 0),
    isOnline: player.isOnline,
    lastSeenAt: player.lastSeenAt,
    totalPoints,
    championships: stats?.championships ?? 0,
    winRate:
      stats && stats.leagueMatchesPlayed > 0
        ? Math.round((stats.leagueWins / stats.leagueMatchesPlayed) * 100)
        : 0,
    relationshipStatus: relationship.status,
    friendshipId: relationship.friendshipId,
    canMessage: messagePermission.allowed,
    messagePermissionReason: messagePermission.reason ?? null,
  });
});

/* ─── GET /api/player/search ──────────────────────────────────────────────── */

router.get("/player/search", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const query = String(req.query.q ?? "").trim();
  if (query.length < 2) {
    res.json({ players: [] });
    return;
  }

  const players = await db
    .select({
      clerkUserId: playersTable.clerkUserId,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      level: playersTable.level,
      isOnline: playersTable.isOnline,
      lastSeenAt: playersTable.lastSeenAt,
    })
    .from(playersTable)
    .where(
      or(
        ilike(playersTable.displayName, `%${query}%`),
        ilike(playersTable.clerkUserId, `%${query}%`),
      ),
    )
    .limit(20);

  res.json({
    players: await Promise.all(
      players.map(async (player) => ({
        ...player,
        relationshipStatus: (await relationshipFor(userId, player.clerkUserId))
          .status,
      })),
    ),
  });
});

export default router;
