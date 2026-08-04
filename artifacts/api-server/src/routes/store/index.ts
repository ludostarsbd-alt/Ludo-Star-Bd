/**
 * Store / Deposit routes
 *
 * GET  /api/store/bundles          — list available coin bundles
 * POST /api/store/purchase         — buy a coin bundle (verify payment reference)
 * POST /api/store/deposit/verify   — verify real-money deposit (bKash/Nagad/card)
 * GET  /api/store/transactions     — recent purchases (alias for wallet/tx filtered)
 */

import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { playersTable, transactionsTable, COIN_BUNDLES, type CoinBundleId } from "@workspace/db";
import { requireAuth } from "../../lib/auth";

const router: IRouter = Router();

/* ── GET /api/store/bundles ───────────────────────────────────────────────── */

router.get("/store/bundles", async (req, res): Promise<void> => {
  // Public — no auth required to browse
  res.json({ bundles: COIN_BUNDLES });
});

/* ── POST /api/store/purchase ────────────────────────────────────────────── */

/**
 * Coin bundle purchase — the client sends a payment reference that was
 * verified by the payment gateway webhook. In production this endpoint should
 * be idempotent on `externalRef` and validate the reference with the gateway.
 *
 * For now we trust the body for integration testing; add server-side webhook
 * verification before going live.
 */
router.post("/store/purchase", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { bundleId, externalRef, gatewayName } = req.body as {
    bundleId?: CoinBundleId;
    externalRef?: string;
    gatewayName?: string;
  };

  if (!bundleId || !externalRef) {
    res.status(400).json({ error: "bundleId and externalRef are required" });
    return;
  }

  const bundle = COIN_BUNDLES.find((b) => b.id === bundleId);
  if (!bundle) {
    res.status(400).json({ error: "Invalid bundleId" });
    return;
  }

  // Idempotency: reject duplicate external refs
  const [dup] = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.clerkUserId, userId),
        eq(transactionsTable.externalRef, externalRef),
      ),
    )
    .limit(1);

  if (dup) {
    res.status(409).json({ error: "Duplicate transaction reference", transactionId: dup.id });
    return;
  }

  // Fetch current wallet
  const [player] = await db
    .select({ coins: playersTable.coins, cash: playersTable.cash })
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);

  if (!player) {
    res.status(404).json({ error: "Player not found. Call /api/player/wallet/upsert first." });
    return;
  }

  const newCoins = Number(player.coins) + bundle.coins;

  await db
    .update(playersTable)
    .set({ coins: String(newCoins), updatedAt: new Date() })
    .where(eq(playersTable.clerkUserId, userId));

  const [tx] = await db
    .insert(transactionsTable)
    .values({
      clerkUserId: userId,
      type: "coin_purchase",
      coinsDelta: String(bundle.coins),
      cashDelta: "0",
      coinsAfter: String(newCoins),
      cashAfter: player.cash,
      externalRef,
      note: `Purchased ${bundle.label}`,
      meta: { bundleId, gatewayName, priceBDT: bundle.price } as any,
      status: "completed",
    })
    .returning();

  req.log.info({ userId, bundleId, coins: bundle.coins, externalRef }, "Coin bundle purchased");

  res.status(201).json({
    success: true,
    coinsAdded: bundle.coins,
    newBalance: newCoins,
    transaction: tx,
  });
});

/* ── POST /api/store/deposit/verify ─────────────────────────────────────────*/

/**
 * Real-money deposit (BDT → cash balance).
 * In production: validate `externalRef` against bKash/Nagad/SSLCommerz API.
 */
router.post("/store/deposit/verify", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { externalRef, amountBDT, gatewayName } = req.body as {
    externalRef?: string;
    amountBDT?: number;
    gatewayName?: string;
  };

  if (!externalRef || !amountBDT || amountBDT <= 0) {
    res.status(400).json({ error: "externalRef and a positive amountBDT are required" });
    return;
  }

  // Idempotency check
  const [dup] = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.clerkUserId, userId),
        eq(transactionsTable.externalRef, externalRef),
      ),
    )
    .limit(1);

  if (dup) {
    res.status(409).json({ error: "Duplicate transaction reference", transactionId: dup.id });
    return;
  }

  const [player] = await db
    .select({ coins: playersTable.coins, cash: playersTable.cash })
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);

  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const newCash = Number(player.cash) + amountBDT;

  await db
    .update(playersTable)
    .set({ cash: String(newCash), updatedAt: new Date() })
    .where(eq(playersTable.clerkUserId, userId));

  const [tx] = await db
    .insert(transactionsTable)
    .values({
      clerkUserId: userId,
      type: "deposit",
      coinsDelta: "0",
      cashDelta: String(amountBDT),
      coinsAfter: player.coins,
      cashAfter: String(newCash),
      externalRef,
      note: `Deposit via ${gatewayName ?? "gateway"}`,
      meta: { amountBDT, gatewayName } as any,
      status: "completed",
    })
    .returning();

  req.log.info({ userId, amountBDT, gatewayName, externalRef }, "Deposit verified");

  res.status(201).json({
    success: true,
    cashAdded: amountBDT,
    newCashBalance: newCash,
    transaction: tx,
  });
});

/* ── GET /api/store/transactions ─────────────────────────────────────────── */

router.get("/store/transactions", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.clerkUserId, userId),
        eq(transactionsTable.type, "coin_purchase"),
      ),
    )
    .orderBy(transactionsTable.createdAt)
    .limit(limit)
    .offset(offset);

  res.json({ transactions: txs.reverse(), limit, offset });
});

export default router;
