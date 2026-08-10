/**
 * Manual deposit routes — user-facing.
 *
 * POST /api/store/deposit/manual        — submit a deposit request
 * GET  /api/store/deposit/my-requests   — user's own request history
 */

import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  manualDepositRequestsTable,
  paymentSettingsTable,
  playersTable,
} from "@workspace/db";
import { requireAuth } from "../../lib/auth";

const router: IRouter = Router();

const DEFAULT_PAYMENT_SETTINGS = {
  bkashNumber: null,
  nagadNumber: null,
  rocketNumber: null,
  upayNumber: null,
  otherInstructions: null,
  minDepositBDT: "10",
  maxDepositBDT: "100000",
  enabledMethods: ["bkash", "nagad", "rocket", "upay", "other"],
};

function publicPaymentSettings(row: typeof DEFAULT_PAYMENT_SETTINGS | any) {
  return {
    bkashNumber: row.bkashNumber ?? null,
    nagadNumber: row.nagadNumber ?? null,
    rocketNumber: row.rocketNumber ?? null,
    upayNumber: row.upayNumber ?? null,
    otherInstructions: row.otherInstructions ?? null,
    minDepositBDT: String(row.minDepositBDT ?? DEFAULT_PAYMENT_SETTINGS.minDepositBDT),
    maxDepositBDT: String(row.maxDepositBDT ?? DEFAULT_PAYMENT_SETTINGS.maxDepositBDT),
    enabledMethods: Array.isArray(row.enabledMethods)
      ? row.enabledMethods
      : DEFAULT_PAYMENT_SETTINGS.enabledMethods,
  };
}

router.get("/store/payment-settings", async (_req, res): Promise<void> => {
  const [settings] = await db
    .select()
    .from(paymentSettingsTable)
    .where(eq(paymentSettingsTable.id, "default"))
    .limit(1);
  res.json({ settings: publicPaymentSettings(settings ?? DEFAULT_PAYMENT_SETTINGS) });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/store/deposit/manual
   Body: { amountBDT, paymentMethod, senderNumber, trxId, userNote? }
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/store/deposit/manual", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { amountBDT, paymentMethod, senderNumber, trxId, userNote } = req.body as {
    amountBDT?: number;
    paymentMethod?: string;
    senderNumber?: string;
    trxId?: string;
    userNote?: string;
  };

  // Validate
  const [paymentSettings] = await db
    .select()
    .from(paymentSettingsTable)
    .where(eq(paymentSettingsTable.id, "default"))
    .limit(1);
  const publicSettings = publicPaymentSettings(paymentSettings ?? DEFAULT_PAYMENT_SETTINGS);
  const minDeposit = Number(publicSettings.minDepositBDT);
  const maxDeposit = Number(publicSettings.maxDepositBDT);

  if (!amountBDT || amountBDT < minDeposit || amountBDT > maxDeposit) {
    res.status(400).json({ error: `amountBDT must be between ${minDeposit} and ${maxDeposit} BDT` });
    return;
  }
  const VALID_METHODS = ["bkash", "nagad", "rocket", "upay", "other"];
  if (!paymentMethod || !VALID_METHODS.includes(paymentMethod)) {
    res.status(400).json({ error: `paymentMethod must be one of: ${VALID_METHODS.join(", ")}` });
    return;
  }
  if (!publicSettings.enabledMethods.includes(paymentMethod)) {
    res.status(400).json({ error: "এই পেমেন্ট মাধ্যমটি বর্তমানে চালু নেই।" });
    return;
  }
  if (!senderNumber || !/^01[3-9]\d{8}$/.test(senderNumber.trim())) {
    res.status(400).json({ error: "senderNumber must be a valid Bangladeshi mobile number (01XXXXXXXXX)" });
    return;
  }
  if (!trxId || trxId.trim().length < 4) {
    res.status(400).json({ error: "trxId is required (min 4 characters)" });
    return;
  }

  // Fetch player display name
  const [player] = await db
    .select({ displayName: playersTable.displayName })
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);

  if (!player) {
    res.status(404).json({ error: "Player profile not found. Please set up your wallet first." });
    return;
  }

  // Check for duplicate trxId from same user (prevent double-submission)
  const [existing] = await db
    .select({ id: manualDepositRequestsTable.id, status: manualDepositRequestsTable.status })
    .from(manualDepositRequestsTable)
    .where(eq(manualDepositRequestsTable.trxId, trxId.trim()))
    .limit(1);

  if (existing) {
    res.status(409).json({
      error: "এই TrxID দিয়ে আগেই রিকোয়েস্ট করা হয়েছে।",
      existingStatus: existing.status,
    });
    return;
  }

  let created: typeof manualDepositRequestsTable.$inferSelect | undefined;
  try {
    [created] = await db
      .insert(manualDepositRequestsTable)
      .values({
        clerkUserId: userId,
        displayName: player.displayName,
        amountBDT: String(Math.round(amountBDT * 100) / 100),
        paymentMethod,
        senderNumber: senderNumber.trim(),
        trxId: trxId.trim(),
        userNote: userNote?.trim() || null,
        status: "pending",
      })
      .returning();
  } catch (error: unknown) {
    // The pre-read above is only a friendly fast path. The unique index is
    // the actual concurrency guard when duplicate submissions race.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505"
    ) {
      const [existing] = await db
        .select({ id: manualDepositRequestsTable.id, status: manualDepositRequestsTable.status })
        .from(manualDepositRequestsTable)
        .where(eq(manualDepositRequestsTable.trxId, trxId.trim()))
        .limit(1);
      res.status(409).json({
        error: "এই TrxID দিয়ে আগেই রিকোয়েস্ট করা হয়েছে।",
        existingStatus: existing?.status ?? "pending",
      });
      return;
    }
    throw error;
  }

  req.log.info({ userId, amountBDT, paymentMethod, trxId }, "Manual deposit request created");

  res.status(201).json({
    success: true,
    id: created.id,
    status: "pending",
    message: "রিকোয়েস্ট পাঠানো হয়েছে। অ্যাডমিন অনুমোদন করলে আপনার একাউন্টে টাকা যোগ হবে।",
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/store/deposit/my-requests
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/store/deposit/my-requests", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const requests = await db
    .select({
      id: manualDepositRequestsTable.id,
      amountBDT: manualDepositRequestsTable.amountBDT,
      paymentMethod: manualDepositRequestsTable.paymentMethod,
      senderNumber: manualDepositRequestsTable.senderNumber,
      trxId: manualDepositRequestsTable.trxId,
      userNote: manualDepositRequestsTable.userNote,
      status: manualDepositRequestsTable.status,
      adminNote: manualDepositRequestsTable.adminNote,
      reviewedAt: manualDepositRequestsTable.reviewedAt,
      createdAt: manualDepositRequestsTable.createdAt,
    })
    .from(manualDepositRequestsTable)
    .where(eq(manualDepositRequestsTable.clerkUserId, userId))
    .orderBy(desc(manualDepositRequestsTable.createdAt))
    .limit(50);

  res.json({ requests });
});

export default router;
