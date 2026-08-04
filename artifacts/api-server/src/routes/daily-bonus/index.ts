/**
 * Daily Bonus routes
 *
 * GET  /api/daily-bonus/status   — can the player claim today? streak info
 * POST /api/daily-bonus/claim    — claim today's reward (idempotent per day)
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { dailyBonusesTable, playersTable, transactionsTable, getDayReward } from "@workspace/db";
import { requireAuth } from "../../lib/auth";

const router: IRouter = Router();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function yesterday(): string {
  const d = new Date(Date.now() - 86400000);
  return d.toISOString().slice(0, 10);
}

/* ── GET /api/daily-bonus/status ─────────────────────────────────────────── */

router.get("/daily-bonus/status", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const today = todayStr();

  const [record] = await db
    .select()
    .from(dailyBonusesTable)
    .where(eq(dailyBonusesTable.clerkUserId, userId))
    .limit(1);

  const alreadyClaimed = record?.lastClaimDate === today;
  const currentStreak = record?.currentStreak ?? 0;
  const nextStreak = alreadyClaimed ? currentStreak : currentStreak + 1;
  const reward = getDayReward(nextStreak);

  res.json({
    canClaim: !alreadyClaimed,
    alreadyClaimed,
    currentStreak,
    longestStreak: record?.longestStreak ?? 0,
    totalClaimed: record?.totalClaimed ?? 0,
    lastClaimDate: record?.lastClaimDate ?? null,
    lastClaimCoins: record?.lastClaimCoins ? Number(record.lastClaimCoins) : null,
    nextReward: reward,
    // Full 7-day reward ladder for UI display
    rewardLadder: [50, 75, 100, 150, 200, 300, 500],
  });
});

/* ── POST /api/daily-bonus/claim ─────────────────────────────────────────── */

router.post("/daily-bonus/claim", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const today = todayStr();

  const [record] = await db
    .select()
    .from(dailyBonusesTable)
    .where(eq(dailyBonusesTable.clerkUserId, userId))
    .limit(1);

  if (record?.lastClaimDate === today) {
    res.status(409).json({ error: "Already claimed today", nextClaimAt: `${today}T24:00:00Z` });
    return;
  }

  // Calculate new streak
  const streakContinues = record?.lastClaimDate === yesterday();
  const newStreak = streakContinues ? (record?.currentStreak ?? 0) + 1 : 1;
  const reward = getDayReward(newStreak);

  // Update or create daily bonus record
  if (record) {
    await db
      .update(dailyBonusesTable)
      .set({
        currentStreak: newStreak,
        longestStreak: Math.max(record.longestStreak, newStreak),
        totalClaimed: record.totalClaimed + 1,
        lastClaimDate: today,
        lastClaimCoins: String(reward),
        updatedAt: new Date(),
      })
      .where(eq(dailyBonusesTable.clerkUserId, userId));
  } else {
    await db.insert(dailyBonusesTable).values({
      clerkUserId: userId,
      currentStreak: 1,
      longestStreak: 1,
      totalClaimed: 1,
      lastClaimDate: today,
      lastClaimCoins: String(reward),
    });
  }

  // Credit coins to player wallet
  const [player] = await db
    .select({ coins: playersTable.coins, cash: playersTable.cash })
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);

  if (player) {
    const newCoins = Number(player.coins) + reward;
    await db
      .update(playersTable)
      .set({ coins: String(newCoins), updatedAt: new Date() })
      .where(eq(playersTable.clerkUserId, userId));

    // Record transaction
    await db.insert(transactionsTable).values({
      clerkUserId: userId,
      type: "daily_bonus",
      coinsDelta: String(reward),
      cashDelta: "0",
      coinsAfter: String(newCoins),
      cashAfter: player.cash,
      note: `Day ${newStreak} streak bonus`,
    });
  }

  req.log.info({ userId, newStreak, reward }, "Daily bonus claimed");

  res.json({
    success: true,
    coinsAwarded: reward,
    streak: newStreak,
    longestStreak: Math.max(record?.longestStreak ?? 0, newStreak),
    message: newStreak === 7
      ? `🎉 7-day streak! You earned ${reward} coins!`
      : `Daily bonus claimed! +${reward} coins (Day ${newStreak})`,
  });
});

export default router;
