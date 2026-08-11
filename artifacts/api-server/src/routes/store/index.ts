/**
 * Store / Payment routes — two-phase, gateway-verified payment system.
 *
 * Flow:
 *   1. POST /api/store/order/initiate
 *        → creates a pending payment_orders row (amount is server-derived)
 *        → calls gateway API to open a payment session
 *        → returns a payment URL for the client to open
 *
 *   2. User pays on gateway's page
 *
 *   3. Gateway POSTs to our webhook:
 *        POST /api/store/webhook/bkash
 *        POST /api/store/webhook/nagad
 *        POST /api/store/webhook/sslcommerz
 *        → signature verified
 *        → gateway API queried to confirm amount & status
 *        → payment_orders row atomically moved to 'completed' (WHERE status='pending')
 *        → wallet credited only on success
 *        → uniqueIndex on gateway_ref prevents double-credit on duplicate webhooks
 *
 *   4. GET /api/store/order/:orderId
 *        → client polls for status (pending/completed/failed)
 *
 * Other endpoints:
 *   GET  /api/store/bundles            — coin bundle catalogue
 *   POST /api/store/coin-purchase      — spend approved cash balance on a bundle
 *   GET  /api/store/transactions       — purchase history
 */

import express, { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  playersTable,
  transactionsTable,
  paymentOrdersTable,
  COIN_BUNDLES,
  type CoinBundleId,
} from "@workspace/db";
import { requireAuth } from "../../lib/auth";
import {
  initiatePayment,
  bkashVerify,
  nagadVerify,
  sslVerify,
  verifyBkashSignature,
  verifySslIpnSignature,
  type GatewayName,
} from "../../lib/payment.service";

const router: IRouter = Router();

/* ─── helpers ──────────────────────────────────────────────────────────────── */

function generateOrderId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `LD-${ts}-${rand}`;
}

function webhookCallbackBase(req: Request): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "localhost";
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  return `${proto}://${host}/api`;
}

/**
 * Atomically credit the wallet and mark the order completed.
 * Returns false if the order was already completed (prevents double-credit).
 */
async function atomicCredit(params: {
  orderId: string;
  gatewayRef: string;
  paidAmountBDT: number;
  rawResponse: unknown;
}): Promise<boolean> {
  try {
    return await db.transaction(async (tx) => {
      // Claim the order and load its authoritative amount in one statement.
      // The pending predicate makes concurrent webhook deliveries mutually
      // exclusive; the unique gateway_ref index handles cross-order reuse.
      const [order] = await tx
        .update(paymentOrdersTable)
        .set({
          status: "completed",
          gatewayRef: params.gatewayRef,
          gatewayResponse: params.rawResponse as any,
          webhookReceivedAt: new Date(),
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentOrdersTable.orderId, params.orderId),
            eq(paymentOrdersTable.status, "pending"),
          ),
        )
        .returning();

      if (!order) return false;

      const [wallet] = await tx
        .select({ coins: playersTable.coins, cash: playersTable.cash })
        .from(playersTable)
        .where(eq(playersTable.clerkUserId, order.clerkUserId))
        .limit(1);

      if (!wallet) throw new Error("PLAYER_WALLET_NOT_FOUND");

      if (order.orderType === "coin_bundle" && order.expectedCoins) {
        const [updatedWallet] = await tx
          .update(playersTable)
          .set({
            coins: sql`${playersTable.coins} + ${order.expectedCoins}`,
            updatedAt: new Date(),
          })
          .where(eq(playersTable.clerkUserId, order.clerkUserId))
          .returning({ coins: playersTable.coins, cash: playersTable.cash });
        if (!updatedWallet) throw new Error("PLAYER_WALLET_NOT_FOUND");

        await tx.insert(transactionsTable).values({
          clerkUserId: order.clerkUserId,
          type: "coin_purchase",
          coinsDelta: String(order.expectedCoins),
          cashDelta: "0",
          coinsAfter: updatedWallet.coins,
          cashAfter: updatedWallet.cash,
          externalRef: params.gatewayRef,
          note: `Bundle purchase via ${order.gateway} — orderId ${order.orderId}`,
          meta: { orderId: order.orderId, bundleId: order.bundleId, gateway: order.gateway } as any,
          status: "completed",
        });
      } else if (order.orderType === "cash_deposit") {
        const [updatedWallet] = await tx
          .update(playersTable)
          .set({
            cash: sql`${playersTable.cash} + ${params.paidAmountBDT}`,
            updatedAt: new Date(),
          })
          .where(eq(playersTable.clerkUserId, order.clerkUserId))
          .returning({ coins: playersTable.coins, cash: playersTable.cash });
        if (!updatedWallet) throw new Error("PLAYER_WALLET_NOT_FOUND");

        await tx.insert(transactionsTable).values({
          clerkUserId: order.clerkUserId,
          type: "deposit",
          coinsDelta: "0",
          cashDelta: String(params.paidAmountBDT),
          coinsAfter: updatedWallet.coins,
          cashAfter: updatedWallet.cash,
          externalRef: params.gatewayRef,
          note: `Cash deposit via ${order.gateway} — orderId ${order.orderId}`,
          meta: { orderId: order.orderId, gateway: order.gateway, amountBDT: params.paidAmountBDT } as any,
          status: "completed",
        });
      }

      return true;
    });
  } catch (error: unknown) {
    // A duplicate gateway reference is an idempotent webhook replay (or a
    // gateway bug sending the same reference for another order). The unique
    // index rolls this transaction back, leaving the original credit intact.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505"
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * Mark an order as failed and store the reason.
 */
async function markFailed(orderId: string, reason: string, raw?: unknown): Promise<void> {
  await db
    .update(paymentOrdersTable)
    .set({
      status: "failed",
      failureReason: reason,
      gatewayResponse: (raw as any) ?? null,
      webhookReceivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentOrdersTable.orderId, orderId),
        eq(paymentOrdersTable.status, "pending"),
      ),
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/store/bundles
   ═══════════════════════════════════════════════════════════════════════════ */

router.get("/store/bundles", (_req, res): void => {
  res.json({ bundles: COIN_BUNDLES });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/store/coin-purchase
   Body: { bundleId }

   Manual-deposit flow:
   admin verifies the user's bKash/Nagad/Rocket request → cash is credited →
   this endpoint atomically debits that cash and credits the selected coins.
   The bundle catalogue and balance check are server-owned.
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/store/coin-purchase", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { bundleId } = req.body as { bundleId?: CoinBundleId };
  const bundle = COIN_BUNDLES.find((candidate) => candidate.id === bundleId);
  if (!bundle) {
    res.status(400).json({ error: "Invalid bundleId" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [wallet] = await tx
      .update(playersTable)
      .set({
        cash: sql`${playersTable.cash} - ${bundle.price}`,
        coins: sql`${playersTable.coins} + ${bundle.coins}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(playersTable.clerkUserId, userId),
          gte(playersTable.cash, String(bundle.price)),
        ),
      )
      .returning({
        coins: playersTable.coins,
        cash: playersTable.cash,
      });

    if (!wallet) return { kind: "insufficient-cash" as const };

    await tx.insert(transactionsTable).values({
      clerkUserId: userId,
      type: "coin_purchase",
      coinsDelta: String(bundle.coins),
      cashDelta: String(-bundle.price),
      coinsAfter: wallet.coins,
      cashAfter: wallet.cash,
      note: `Purchased ${bundle.label} with approved cash balance`,
      meta: {
        bundleId: bundle.id,
        priceBDT: bundle.price,
        source: "cash_balance",
      } as any,
      status: "completed",
    });

    return {
      kind: "purchased" as const,
      bundle,
      coins: Number(wallet.coins),
      cash: Number(wallet.cash),
    };
  });

  if (result.kind === "insufficient-cash") {
    res.status(400).json({
      error: `পর্যাপ্ত cash balance নেই। ${bundle.label} কিনতে ৳${bundle.price} লাগবে।`,
    });
    return;
  }

  req.log.info(
    { userId, bundleId: bundle.id, amountBDT: bundle.price },
    "Coin bundle purchased with cash balance",
  );
  res.status(201).json({
    success: true,
    bundleId: result.bundle.id,
    coins: result.coins,
    cash: result.cash,
    coinsAdded: result.bundle.coins,
    amountBDT: result.bundle.price,
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/store/order/initiate
   Body: { gateway, orderType, bundleId? (coin_bundle), amountBDT? (cash_deposit) }
   ═══════════════════════════════════════════════════════════════════════════ */

router.post("/store/order/initiate", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { gateway, orderType, bundleId, amountBDT: clientAmount } = req.body as {
    gateway?: GatewayName;
    orderType?: string;
    bundleId?: CoinBundleId;
    amountBDT?: number;
  };

  // Validate gateway
  const VALID_GATEWAYS: GatewayName[] = ["bkash", "nagad", "sslcommerz"];
  if (!gateway || !VALID_GATEWAYS.includes(gateway)) {
    res.status(400).json({ error: `gateway must be one of: ${VALID_GATEWAYS.join(", ")}` });
    return;
  }

  let amountBDT: number;
  let expectedCoins: number | undefined;
  let resolvedBundleId: string | undefined;

  if (orderType === "coin_bundle") {
    // Amount comes from our server-side bundle catalogue — never from client
    const bundle = COIN_BUNDLES.find((b) => b.id === bundleId);
    if (!bundle) {
      res.status(400).json({ error: "Invalid bundleId" });
      return;
    }
    amountBDT = bundle.price;
    expectedCoins = bundle.coins;
    resolvedBundleId = bundle.id;
  } else if (orderType === "cash_deposit") {
    // For cash deposits we accept a client amount but clamp to reasonable min/max
    if (!clientAmount || clientAmount < 10 || clientAmount > 50000) {
      res.status(400).json({ error: "amountBDT must be between 10 and 50 000 for cash deposits" });
      return;
    }
    // Round to 2 dp — never trust float arithmetic for money
    amountBDT = Math.round(clientAmount * 100) / 100;
  } else {
    res.status(400).json({ error: "orderType must be coin_bundle or cash_deposit" });
    return;
  }

  // Fetch player for display name / email (needed by SSLCommerz)
  const [player] = await db
    .select({ displayName: playersTable.displayName })
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);

  if (!player) {
    res.status(404).json({ error: "Player not found. Call /api/player/wallet/upsert first." });
    return;
  }

  const orderId = generateOrderId();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  const callbackUrl = `${webhookCallbackBase(req)}/store/webhook/${gateway}`;

  // Persist the order BEFORE calling the gateway
  await db.insert(paymentOrdersTable).values({
    orderId,
    clerkUserId: userId,
    gateway,
    orderType,
    bundleId: resolvedBundleId,
    amountBDT: String(amountBDT),
    expectedCoins,
    status: "pending",
    expiresAt,
  });

  // Call gateway to create payment session
  let initResult: Awaited<ReturnType<typeof initiatePayment>>;
  try {
    initResult = await initiatePayment(gateway, {
      orderId,
      amountBDT,
      callbackUrl,
      customerName: player.displayName,
      customerEmail: `${userId.slice(0, 8)}@ludo.app`,
    });
  } catch (err: unknown) {
    // Roll back order to failed so client knows immediately
    await markFailed(orderId, String(err instanceof Error ? err.message : err));
    req.log.error({ err, orderId, gateway }, "Gateway initiation failed");
    res.status(502).json({ error: "Payment gateway unavailable. Please try again." });
    return;
  }

  // Save gatewayPaymentId returned by gateway
  await db
    .update(paymentOrdersTable)
    .set({ gatewayPaymentId: initResult.gatewayPaymentId, updatedAt: new Date() })
    .where(eq(paymentOrdersTable.orderId, orderId));

  req.log.info({ userId, orderId, gateway, amountBDT }, "Payment order initiated");

  res.status(201).json({
    orderId,
    paymentUrl: initResult.paymentUrl,
    amountBDT,
    expiresAt,
    status: "pending",
    // Instructions for the client
    nextStep: `Redirect the user to paymentUrl. Poll GET /api/store/order/${orderId} for status.`,
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/store/order/:orderId — poll status
   ═══════════════════════════════════════════════════════════════════════════ */

router.get("/store/order/:orderId", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [order] = await db
    .select()
    .from(paymentOrdersTable)
    .where(
      and(
        eq(paymentOrdersTable.orderId, req.params.orderId),
        eq(paymentOrdersTable.clerkUserId, userId),
      ),
    )
    .limit(1);

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  // Auto-expire overdue pending orders
  if (order.status === "pending" && new Date() > order.expiresAt) {
    await db
      .update(paymentOrdersTable)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(paymentOrdersTable.orderId, order.orderId),
          eq(paymentOrdersTable.status, "pending"),
        ),
      );
    res.json({ orderId: order.orderId, status: "expired", amountBDT: Number(order.amountBDT) });
    return;
  }

  res.json({
    orderId: order.orderId,
    status: order.status,
    gateway: order.gateway,
    orderType: order.orderType,
    amountBDT: Number(order.amountBDT),
    expectedCoins: order.expectedCoins,
    gatewayRef: order.gatewayRef,
    failureReason: order.failureReason,
    completedAt: order.completedAt,
    expiresAt: order.expiresAt,
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/store/webhook/bkash
   bKash calls this after the user pays (IPN / callback).
   ═══════════════════════════════════════════════════════════════════════════ */

// Raw body needed for signature verification
router.post(
  "/store/webhook/bkash",
  express.raw({ type: "*/*" }),
  async (req: Request, res: Response): Promise<void> => {
    const rawBody = (req.body as Buffer).toString("utf8");
    const signature = req.headers["x-bkash-signature"] as string ?? "";

    // Verify webhook signature
    if (!verifyBkashSignature(rawBody, signature)) {
      req.log.warn({ signature }, "bKash webhook: invalid signature");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    let body: Record<string, string>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    const { paymentID, merchantInvoiceNumber: orderId, status: bkashStatus } = body;

    if (!paymentID || !orderId) {
      res.status(400).json({ error: "Missing paymentID or merchantInvoiceNumber" });
      return;
    }

    req.log.info({ orderId, paymentID, bkashStatus }, "bKash webhook received");

    // Look up order
    const [order] = await db
      .select()
      .from(paymentOrdersTable)
      .where(eq(paymentOrdersTable.orderId, orderId))
      .limit(1);

    if (!order || order.status !== "pending") {
      // Already handled or unknown — ack to bKash so they stop retrying
      res.json({ message: "ack" });
      return;
    }

    if (bkashStatus !== "success" && bkashStatus !== "Completed") {
      await markFailed(orderId, `bKash reported status: ${bkashStatus}`);
      res.json({ message: "ack" });
      return;
    }

    // Verify with bKash API
    const verify = await bkashVerify({
      paymentId: paymentID,
      expectedAmountBDT: Number(order.amountBDT),
    });

    if (!verify.success) {
      req.log.error({ orderId, reason: verify.failureReason }, "bKash verification failed");
      await markFailed(orderId, verify.failureReason ?? "Verification failed", verify.rawResponse);
      res.json({ message: "ack" });
      return;
    }

    const credited = await atomicCredit({
      orderId,
      gatewayRef: verify.gatewayRef,
      paidAmountBDT: verify.paidAmountBDT,
      rawResponse: verify.rawResponse,
    });

    req.log.info({ orderId, credited, gatewayRef: verify.gatewayRef }, "bKash payment processed");
    res.json({ message: "ack", credited });
  },
);

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/store/webhook/nagad
   ═══════════════════════════════════════════════════════════════════════════ */

router.post("/store/webhook/nagad", async (req, res): Promise<void> => {
  const { order_id: orderId, payment_ref_id: paymentRefId, status: nagadStatus } =
    req.body as Record<string, string>;

  if (!orderId || !paymentRefId) {
    res.status(400).json({ error: "Missing order_id or payment_ref_id" });
    return;
  }

  req.log.info({ orderId, paymentRefId, nagadStatus }, "Nagad webhook received");

  const [order] = await db
    .select()
    .from(paymentOrdersTable)
    .where(eq(paymentOrdersTable.orderId, orderId))
    .limit(1);

  if (!order || order.status !== "pending") {
    res.json({ message: "ack" });
    return;
  }

  if (nagadStatus !== "Success") {
    await markFailed(orderId, `Nagad status: ${nagadStatus}`);
    res.json({ message: "ack" });
    return;
  }

  const verify = await nagadVerify({
    paymentRefId,
    expectedAmountBDT: Number(order.amountBDT),
  });

  if (!verify.success) {
    req.log.error({ orderId, reason: verify.failureReason }, "Nagad verification failed");
    await markFailed(orderId, verify.failureReason ?? "Verification failed", verify.rawResponse);
    res.json({ message: "ack" });
    return;
  }

  const credited = await atomicCredit({
    orderId,
    gatewayRef: verify.gatewayRef,
    paidAmountBDT: verify.paidAmountBDT,
    rawResponse: verify.rawResponse,
  });

  req.log.info({ orderId, credited }, "Nagad payment processed");
  res.json({ message: "ack", credited });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/store/webhook/sslcommerz   (IPN)
   ═══════════════════════════════════════════════════════════════════════════ */

router.post("/store/webhook/sslcommerz", async (req, res): Promise<void> => {
  const body = req.body as Record<string, string>;
  const { tran_id: orderId, val_id: valId, status: sslStatus } = body;

  if (!orderId || !valId) {
    res.status(400).json({ error: "Missing tran_id or val_id" });
    return;
  }

  // Verify IPN signature
  if (!verifySslIpnSignature(body)) {
    req.log.warn({ orderId }, "SSLCommerz IPN: invalid signature");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  req.log.info({ orderId, valId, sslStatus }, "SSLCommerz IPN received");

  const [order] = await db
    .select()
    .from(paymentOrdersTable)
    .where(eq(paymentOrdersTable.orderId, orderId))
    .limit(1);

  if (!order || order.status !== "pending") {
    res.json({ message: "ack" });
    return;
  }

  if (sslStatus !== "VALID") {
    await markFailed(orderId, `SSLCommerz IPN status: ${sslStatus}`);
    res.json({ message: "ack" });
    return;
  }

  // Cross-check with SSLCommerz validation API
  const verify = await sslVerify({
    valId,
    expectedAmountBDT: Number(order.amountBDT),
  });

  if (!verify.success) {
    req.log.error({ orderId, reason: verify.failureReason }, "SSLCommerz verification failed");
    await markFailed(orderId, verify.failureReason ?? "Verification failed", verify.rawResponse);
    res.json({ message: "ack" });
    return;
  }

  const credited = await atomicCredit({
    orderId,
    gatewayRef: verify.gatewayRef,
    paidAmountBDT: verify.paidAmountBDT,
    rawResponse: verify.rawResponse,
  });

  req.log.info({ orderId, credited }, "SSLCommerz payment processed");
  res.json({ message: "ack", credited });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/store/transactions
   ═══════════════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/store/orders — player's own order history
   ═══════════════════════════════════════════════════════════════════════════ */

router.get("/store/orders", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const orders = await db
    .select({
      orderId: paymentOrdersTable.orderId,
      gateway: paymentOrdersTable.gateway,
      orderType: paymentOrdersTable.orderType,
      bundleId: paymentOrdersTable.bundleId,
      amountBDT: paymentOrdersTable.amountBDT,
      expectedCoins: paymentOrdersTable.expectedCoins,
      status: paymentOrdersTable.status,
      gatewayRef: paymentOrdersTable.gatewayRef,
      failureReason: paymentOrdersTable.failureReason,
      createdAt: paymentOrdersTable.createdAt,
      completedAt: paymentOrdersTable.completedAt,
    })
    .from(paymentOrdersTable)
    .where(eq(paymentOrdersTable.clerkUserId, userId))
    .orderBy(paymentOrdersTable.createdAt)
    .limit(limit)
    .offset(offset);

  res.json({ orders: orders.reverse(), limit, offset });
});

export default router;
