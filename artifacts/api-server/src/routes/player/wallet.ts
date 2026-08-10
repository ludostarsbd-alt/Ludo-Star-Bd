/**
 * Player wallet, XP & level routes
 *
 * GET  /api/player/wallet          — coins, cash, xp, level
 * POST /api/player/wallet/upsert   — create/update player profile (called on first login)
 * GET  /api/player/wallet/tx       — transaction history (paginated)
 */

import { Router, type IRouter } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  paymentSettingsTable,
  playersTable,
  tournamentRegistrationsTable,
  transactionsTable,
  xpToLevel,
  xpForNextLevel,
} from "@workspace/db";
import { requireAuth } from "../../lib/auth";
import { z } from "zod";

const router: IRouter = Router();

async function coinSendEntitlement(userId: string) {
  const [[settings], [champion]] = await Promise.all([
    db
      .select({ enabled: paymentSettingsTable.coinSendEnabled })
      .from(paymentSettingsTable)
      .where(eq(paymentSettingsTable.id, "default"))
      .limit(1),
    db
      .select({ id: tournamentRegistrationsTable.id })
      .from(tournamentRegistrationsTable)
      .where(
        and(
          eq(tournamentRegistrationsTable.clerkUserId, userId),
          eq(tournamentRegistrationsTable.status, "champion"),
        ),
      )
      .orderBy(desc(tournamentRegistrationsTable.updatedAt))
      .limit(1),
  ]);

  return {
    enabled: Boolean(settings?.enabled ?? false),
    isWinner: Boolean(champion),
  };
}

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

/* ── GET /api/player/coin-send/status ─────────────────────────────────────── */

router.get("/player/coin-send/status", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const entitlement = userId
    ? await coinSendEntitlement(userId)
    : { enabled: Boolean((await db
        .select({ enabled: paymentSettingsTable.coinSendEnabled })
        .from(paymentSettingsTable)
        .where(eq(paymentSettingsTable.id, "default"))
        .limit(1))[0]?.enabled ?? false), isWinner: false };
  res.json({
    enabled: entitlement.enabled,
    unlocked: entitlement.enabled && entitlement.isWinner,
    isWinner: entitlement.isWinner,
  });
});

const CoinSendBody = z.object({
  recipientId: z.string().trim().min(1).max(200),
  amount: z.coerce.number().int().positive().max(1_000_000),
});

/* ── POST /api/player/coin-send ──────────────────────────────────────────── */

router.post("/player/coin-send", async (req, res): Promise<void> => {
  const senderId = requireAuth(req, res);
  if (!senderId) return;

  const parsed = CoinSendBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "প্রাপকের Player ID এবং সঠিক Coin amount দিন।" });
    return;
  }

  const { recipientId, amount } = parsed.data;
  if (recipientId === senderId) {
    res.status(400).json({ error: "নিজেকে Coin Send করা যাবে না।" });
    return;
  }

  const entitlement = await coinSendEntitlement(senderId);
  if (!entitlement.enabled) {
    res.status(403).json({ error: "Coin Send Feature বর্তমানে বন্ধ আছে।" });
    return;
  }
  if (!entitlement.isWinner) {
    res.status(403).json({ error: "শুধু Tournament Winner Coin Send করতে পারবেন।" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [recipient] = await tx
      .select({ clerkUserId: playersTable.clerkUserId, displayName: playersTable.displayName })
      .from(playersTable)
      .where(eq(playersTable.clerkUserId, recipientId))
      .limit(1);
    if (!recipient) return { error: "Player খুঁজে পাওয়া যায়নি।" as const };

    // The balance predicate makes concurrent sends safe: a second request
    // cannot spend coins already consumed by the first request.
    const [sender] = await tx
      .update(playersTable)
      .set({
        coins: sql`${playersTable.coins} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(playersTable.clerkUserId, senderId),
          gte(playersTable.coins, String(amount)),
        ),
      )
      .returning({ coins: playersTable.coins, cash: playersTable.cash });
    if (!sender) return { error: "আপনার পর্যাপ্ত Coin নেই।" as const };

    const [receiver] = await tx
      .update(playersTable)
      .set({
        coins: sql`${playersTable.coins} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(playersTable.clerkUserId, recipientId))
      .returning({ coins: playersTable.coins, cash: playersTable.cash });
    if (!receiver) throw new Error("Recipient wallet disappeared during transfer.");

    await tx.insert(transactionsTable).values([
      {
        clerkUserId: senderId,
        type: "coin_send",
        coinsDelta: String(-amount),
        cashDelta: "0",
        coinsAfter: sender.coins,
        cashAfter: sender.cash,
        note: `Coin sent to ${recipient.displayName}`,
        meta: { direction: "debit", recipientId } as any,
        status: "completed",
      },
      {
        clerkUserId: recipientId,
        type: "coin_received",
        coinsDelta: String(amount),
        cashDelta: "0",
        coinsAfter: receiver.coins,
        cashAfter: receiver.cash,
        note: `Coin received from ${senderId}`,
        meta: { direction: "credit", senderId } as any,
        status: "completed",
      },
    ]);

    return {
      recipientName: recipient.displayName,
      senderCoins: Number(sender.coins),
      amount,
    };
  });

  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json({ success: true, ...result });
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
