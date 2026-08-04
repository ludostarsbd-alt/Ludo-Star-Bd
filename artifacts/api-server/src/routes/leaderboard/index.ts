/**
 * Leaderboard routes
 *
 * GET /api/leaderboard/global        — top players by coins (all-time)
 * GET /api/leaderboard/weekly        — top players by coins earned this week
 * GET /api/leaderboard/friends       — among friends only
 * GET /api/leaderboard/my-rank       — caller's rank in global leaderboard
 */

import { Router, type IRouter } from "express";
import { eq, desc, or, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { playersTable, friendshipsTable, transactionsTable } from "@workspace/db";
import { requireAuth } from "../../lib/auth";

const router: IRouter = Router();

/* ── GET /api/leaderboard/global ─────────────────────────────────────────── */

router.get("/leaderboard/global", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const limit = Math.min(Number(req.query.limit) || 50, 100);

  const rows = await db
    .select({
      rank: sql<number>`row_number() over (order by ${playersTable.coins} desc)`,
      clerkUserId: playersTable.clerkUserId,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      coins: playersTable.coins,
      level: playersTable.level,
      xp: playersTable.xp,
    })
    .from(playersTable)
    .orderBy(desc(playersTable.coins))
    .limit(limit);

  res.json({ leaderboard: rows, period: "all_time" });
});

/* ── GET /api/leaderboard/weekly ─────────────────────────────────────────── */

router.get("/leaderboard/weekly", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const limit = Math.min(Number(req.query.limit) || 50, 100);

  // Sum of coin credits in the past 7 days
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      rank: sql<number>`row_number() over (order by sum(${transactionsTable.coinsDelta}) desc)`,
      clerkUserId: transactionsTable.clerkUserId,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      level: playersTable.level,
      weeklyCoins: sql<number>`sum(${transactionsTable.coinsDelta})`,
    })
    .from(transactionsTable)
    .innerJoin(playersTable, eq(transactionsTable.clerkUserId, playersTable.clerkUserId))
    .where(
      and(
        sql`${transactionsTable.createdAt} >= ${oneWeekAgo}`,
        sql`${transactionsTable.coinsDelta} > 0`,
      ),
    )
    .groupBy(
      transactionsTable.clerkUserId,
      playersTable.displayName,
      playersTable.avatarUrl,
      playersTable.level,
    )
    .orderBy(sql`sum(${transactionsTable.coinsDelta}) desc`)
    .limit(limit);

  res.json({ leaderboard: rows, period: "weekly", since: oneWeekAgo });
});

/* ── GET /api/leaderboard/friends ────────────────────────────────────────── */

router.get("/leaderboard/friends", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  // Get friend IDs
  const friendships = await db
    .select()
    .from(friendshipsTable)
    .where(
      and(
        or(
          eq(friendshipsTable.requesterId, userId),
          eq(friendshipsTable.recipientId, userId),
        ),
        eq(friendshipsTable.status, "accepted"),
      ),
    );

  const friendIds = friendships.map((f) =>
    f.requesterId === userId ? f.recipientId : f.requesterId,
  );
  const allIds = [...friendIds, userId];

  if (allIds.length === 0) {
    res.json({ leaderboard: [], period: "friends" });
    return;
  }

  const rows = await db
    .select({
      rank: sql<number>`row_number() over (order by ${playersTable.coins} desc)`,
      clerkUserId: playersTable.clerkUserId,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      coins: playersTable.coins,
      level: playersTable.level,
      xp: playersTable.xp,
      isMe: sql<boolean>`${playersTable.clerkUserId} = ${userId}`,
    })
    .from(playersTable)
    .where(sql`${playersTable.clerkUserId} = ANY(${allIds})`)
    .orderBy(desc(playersTable.coins));

  res.json({ leaderboard: rows, period: "friends" });
});

/* ── GET /api/leaderboard/my-rank ────────────────────────────────────────── */

router.get("/leaderboard/my-rank", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const result = await db.execute<{ rank: number; coins: string }>(
    sql`
      SELECT rank, coins
      FROM (
        SELECT clerk_user_id, coins,
               row_number() over (order by coins desc) AS rank
        FROM players
      ) sub
      WHERE clerk_user_id = ${userId}
    `,
  );

  const row = (result as unknown as Array<{ rank: number; coins: string }>)[0];

  if (!row) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.json({ rank: Number(row.rank), coins: Number(row.coins) });
});

export default router;
