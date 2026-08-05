/**
 * Admin deposit request management.
 *
 * GET  /api/admin/deposit-requests              — list all requests (filterable by status)
 * POST /api/admin/deposit-requests/:id/approve  — approve + credit cash balance
 * POST /api/admin/deposit-requests/:id/reject   — reject with a reason
 */

import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
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

  // Fetch the request — must be pending
  const [request] = await db
    .select()
    .from(manualDepositRequestsTable)
    .where(
      and(
        eq(manualDepositRequestsTable.id, id),
        eq(manualDepositRequestsTable.status, "pending"),
      ),
    )
    .limit(1);

  if (!request) {
    res.status(404).json({ error: "Request not found or already processed." });
    return;
  }

  // Fetch player wallet
  const [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, request.clerkUserId))
    .limit(1);

  if (!player) {
    res.status(404).json({ error: "Player wallet not found." });
    return;
  }

  const amountBDT = Number(request.amountBDT);
  const newCash = Number(player.cash) + amountBDT;

  // Atomically:
  //   1. Mark the request approved (WHERE status='pending' prevents double-approval)
  //   2. Credit wallet
  //   3. Insert transaction record
  const updated = await db
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
    .returning({ id: manualDepositRequestsTable.id });

  if (updated.length === 0) {
    // Another admin beat us to it
    res.status(409).json({ error: "Request was already processed by another action." });
    return;
  }

  await db
    .update(playersTable)
    .set({ cash: String(newCash), updatedAt: new Date() })
    .where(eq(playersTable.clerkUserId, request.clerkUserId));

  await db.insert(transactionsTable).values({
    clerkUserId: request.clerkUserId,
    type: "deposit",
    coinsDelta: "0",
    cashDelta: String(amountBDT),
    coinsAfter: player.coins,
    cashAfter: String(newCash),
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

  req.log.info({ id, userId: request.clerkUserId, amountBDT, adminId }, "Manual deposit approved");

  res.json({
    success: true,
    message: `৳ ${amountBDT.toFixed(2)} সফলভাবে ${request.displayName}-এর একাউন্টে যোগ করা হয়েছে।`,
    newCash,
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
