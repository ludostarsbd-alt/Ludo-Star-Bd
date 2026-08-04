/**
 * Player wallet, XP & level routes
 *
 * GET  /api/player/wallet          — coins, cash, xp, level
 * POST /api/player/wallet/upsert   — create/update player profile (called on first login)
 * GET  /api/player/wallet/tx       — transaction history (paginated)
 */

import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { playersTable, transactionsTable, xpToLevel, xpForNextLevel } from "@workspace/db";
import { requireAuth } from "../../lib/auth";

const router: IRouter = Router();

/* ── GET /api/player/wallet ───────────────────────────────────────────────── */

router.get("/player/wallet", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);

  if (!player) {
    res.status(404).json({ error: "Player profile not found. Call /api/player/wallet/upsert first." });
    return;
  }

  const level = xpToLevel(player.xp);
  const nextLevelXp = xpForNextLevel(level);
  const currentLevelXp = xpForNextLevel(level - 1);

  res.json({
    clerkUserId: player.clerkUserId,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    coins: Number(player.coins),
    cash: Number(player.cash),
    xp: player.xp,
    level,
    xpToNextLevel: nextLevelXp - player.xp,
    xpProgress: player.xp - currentLevelXp,
    xpForLevel: nextLevelXp - currentLevelXp,
    isOnline: player.isOnline,
    lastSeenAt: player.lastSeenAt,
  });
});

/* ── POST /api/player/wallet/upsert ──────────────────────────────────────── */

router.post("/player/wallet/upsert", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { displayName, avatarUrl } = req.body as { displayName?: string; avatarUrl?: string };

  if (!displayName?.trim()) {
    res.status(400).json({ error: "displayName is required" });
    return;
  }

  const existing = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);

  if (existing.length === 0) {
    const [player] = await db
      .insert(playersTable)
      .values({
        clerkUserId: userId,
        displayName: displayName.trim(),
        avatarUrl,
        coins: "100.00", // welcome bonus
        isOnline: true,
        lastSeenAt: new Date(),
      })
      .returning();

    req.log.info({ userId }, "Player profile created");
    res.status(201).json({ player, created: true });
  } else {
    const [player] = await db
      .update(playersTable)
      .set({
        displayName: displayName.trim(),
        avatarUrl: avatarUrl ?? undefined,
        isOnline: true,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(playersTable.clerkUserId, userId))
      .returning();

    res.json({ player, created: false });
  }
});

/* ── GET /api/player/wallet/tx ────────────────────────────────────────────── */

router.get("/player/wallet/tx", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.clerkUserId, userId))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ transactions: txs, limit, offset });
});

export default router;
