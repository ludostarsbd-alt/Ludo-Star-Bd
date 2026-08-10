/**
 * Admin deposit request management.
 *
 * GET  /api/admin/deposit-requests              — list all requests (filterable by status)
 * POST /api/admin/deposit-requests/:id/approve  — approve + credit cash balance
 * POST /api/admin/deposit-requests/:id/reject   — reject with a reason
 */

import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { count } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  manualDepositRequestsTable,
  playersTable,
  transactionsTable,
} from "@workspace/db";
import { requireAdmin } from "../../lib/admin";

const router: IRouter = Router();

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/admin/deposit-requests?status=&limit=&offset=
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/admin/deposit-requests", async (req, res): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const limit  = Math.min(Number(req.query["limit"])  || 20, 100);
  const offset = Number(req.query["offset"]) || 0;
  const statusFilter = req.query["status"] as string | undefined;

  const where = statusFilter
    ? eq(manualDepositRequestsTable.status, statusFilter)
    : undefined;

  const requests = await db
    .select()
    .from(manualDepositRequestsTable)
    .where(where)
    .orderBy(desc(manualDepositRequestsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(manualDepositRequestsTable)
    .where(where);

  res.json({ requests, total, limit, offset });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/admin/deposit-requests/:id/approve
   Body: { adminNote? }
   Credits the player's cash balance atomically.
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/admin/deposit-requests/:id/approve", async (req, res): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { id } = req.params;
  const { adminNote } = req.body as { adminNote?: string };

  // Claim the pending request, update the wallet, and write the ledger entry
  // on the same database transaction. Any failure rolls all three changes
  // back, so an approval can never be recorded without its credit/ledger row.
  const result = await db.transaction(async (tx) => {
    const [request] = await tx
      .update(manualDepositRequestsTable)
      .set({
        status: "approved",
        adminNote: adminNote?.trim() || "যাচাই করা হয়েছে",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(manualDepositRequestsTable.id, id),
          eq(manualDepositRequestsTable.status, "pending"),
        ),
      )
      .returning();

    if (!request) return { kind: "already-processed" as const };

    const [wallet] = await tx
      .update(playersTable)
      .set({
        cash: sql`${playersTable.cash} + ${request.amountBDT}`,
        updatedAt: new Date(),
      })
      .where(eq(playersTable.clerkUserId, request.clerkUserId))
      .returning({
        coins: playersTable.coins,
        cash: playersTable.cash,
      });

    if (!wallet) {
      throw new Error("PLAYER_WALLET_NOT_FOUND");
    }

    await tx.insert(transactionsTable).values({
      clerkUserId: request.clerkUserId,
      type: "deposit",
      coinsDelta: "0",
      cashDelta: request.amountBDT,
      coinsAfter: wallet.coins,
      cashAfter: wallet.cash,
      externalRef: request.trxId,
      note: `Manual deposit via ${request.paymentMethod} — approved by admin`,
      meta: {
        depositRequestId: request.id,
        paymentMethod: request.paymentMethod,
        senderNumber: request.senderNumber,
        trxId: request.trxId,
        adminId,
      } as any,
      status: "completed",
    });

    return {
      kind: "approved" as const,
      request,
      amountBDT: Number(request.amountBDT),
      newCash: Number(wallet.cash),
    };
  });

  if (result.kind === "already-processed") {
    res.status(409).json({ error: "Request was already processed by another action." });
    return;
  }

  req.log.info(
    { id, userId: result.request.clerkUserId, amountBDT: result.amountBDT, adminId },
    "Manual deposit approved",
  );

  res.json({
    success: true,
    message: `৳ ${result.amountBDT.toFixed(2)} সফলভাবে ${result.request.displayName}-এর একাউন্টে যোগ করা হয়েছে।`,
    newCash: result.newCash,
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/admin/deposit-requests/:id/reject
   Body: { adminNote }   ← required for reject
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/admin/deposit-requests/:id/reject", async (req, res): Promise<void> => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { id } = req.params;
  const { adminNote } = req.body as { adminNote?: string };

  if (!adminNote?.trim()) {
    res.status(400).json({ error: "adminNote (rejection reason) is required." });
    return;
  }

  const updated = await db
    .update(manualDepositRequestsTable)
    .set({
      status: "rejected",
      adminNote: adminNote.trim(),
      reviewedBy: adminId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(manualDepositRequestsTable.id, id),
        eq(manualDepositRequestsTable.status, "pending"),
      ),
    )
    .returning({ id: manualDepositRequestsTable.id, displayName: manualDepositRequestsTable.displayName });

  if (updated.length === 0) {
    res.status(404).json({ error: "Request not found or already processed." });
    return;
  }

  req.log.info({ id, adminId, reason: adminNote }, "Manual deposit rejected");

  res.json({
    success: true,
    message: `${updated[0]!.displayName}-এর রিকোয়েস্ট বাতিল করা হয়েছে।`,
  });
});

export default router;
