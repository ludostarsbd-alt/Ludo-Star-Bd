/**
 * Daily Bonus routes
 *
 * GET  /api/daily-bonus/status   — can the player claim today? streak info
 * POST /api/daily-bonus/claim    — claim today's reward (idempotent per day)
 */

import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
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
  // The reward preview is intentionally public so guests can see what they
  // could earn before deciding to create an account. Claiming stays protected.
  const userId = getAuth(req).userId;
  if (!userId) {
    res.json({
      canClaim: false,
      alreadyClaimed: false,
      currentStreak: 0,
      longestStreak: 0,
      totalClaimed: 0,
      lastClaimDate: null,
      lastClaimCoins: null,
      nextReward: getDayReward(1),
      rewardLadder: [50, 75, 100, 150, 200, 300, 500],
      guestPreview: true,
    });
    return;
  }

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

  // Serialize claims per player. A read-then-write without a lock lets two
  // simultaneous requests both observe an unclaimed day and double-credit.
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`daily-bonus:${userId}`}))`);

    const [record] = await tx
      .select()
      .from(dailyBonusesTable)
      .where(eq(dailyBonusesTable.clerkUserId, userId))
      .limit(1);

    if (record?.lastClaimDate === today) {
      return { kind: "already-claimed" as const };
    }

    const streakContinues = record?.lastClaimDate === yesterday();
    const newStreak = streakContinues ? (record?.currentStreak ?? 0) + 1 : 1;
    const reward = getDayReward(newStreak);

    if (record) {
      await tx
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
      await tx.insert(dailyBonusesTable).values({
        clerkUserId: userId,
        currentStreak: 1,
        longestStreak: 1,
        totalClaimed: 1,
        lastClaimDate: today,
        lastClaimCoins: String(reward),
      });
    }

    const [wallet] = await tx
      .update(playersTable)
      .set({
        coins: sql`${playersTable.coins} + ${reward}`,
        updatedAt: new Date(),
      })
      .where(eq(playersTable.clerkUserId, userId))
      .returning({ coins: playersTable.coins, cash: playersTable.cash });

    if (!wallet) throw new Error("PLAYER_WALLET_NOT_FOUND");

    await tx.insert(transactionsTable).values({
      clerkUserId: userId,
      type: "daily_bonus",
      coinsDelta: String(reward),
      cashDelta: "0",
      coinsAfter: wallet.coins,
      cashAfter: wallet.cash,
      note: `Day ${newStreak} streak bonus`,
    });

    return {
      kind: "claimed" as const,
      reward,
      newStreak,
      longestStreak: Math.max(record?.longestStreak ?? 0, newStreak),
    };
  });

  if (result.kind === "already-claimed") {
    res.status(409).json({ error: "Already claimed today", nextClaimAt: `${today}T24:00:00Z` });
    return;
  }

  req.log.info({ userId, newStreak: result.newStreak, reward: result.reward }, "Daily bonus claimed");

  res.json({
    success: true,
    coinsAwarded: result.reward,
    streak: result.newStreak,
    longestStreak: result.longestStreak,
    message: result.newStreak === 7
      ? `🎉 7-day streak! You earned ${result.reward} coins!`
      : `Daily bonus claimed! +${result.reward} coins (Day ${result.newStreak})`,
  });
});

export default router;
