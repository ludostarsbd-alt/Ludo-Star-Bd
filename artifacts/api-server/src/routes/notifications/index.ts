/**
 * Notification routes
 *
 * POST /api/notifications/token         — register push token
 * GET  /api/notifications               — notification history (paginated)
 * POST /api/notifications/:id/read      — mark one as read
 * POST /api/notifications/read-all      — mark all as read
 * DELETE /api/notifications/:id         — delete one
 */

import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { notificationsTable, playersTable } from "@workspace/db";
import { requireAuth } from "../../lib/auth";

const router: IRouter = Router();

/* ── POST /api/notifications/token ───────────────────────────────────────── */

router.post("/notifications/token", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { pushToken } = req.body as { pushToken?: string };
  if (!pushToken?.trim()) {
    res.status(400).json({ error: "pushToken is required" });
    return;
  }

  await db
    .update(playersTable)
    .set({ pushToken: pushToken.trim(), updatedAt: new Date() })
    .where(eq(playersTable.clerkUserId, userId));

  req.log.info({ userId }, "Push token registered");
  res.json({ success: true });
});

/* ── GET /api/notifications ──────────────────────────────────────────────── */

router.get("/notifications", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const offset = Number(req.query.offset) || 0;
  const unreadOnly = req.query.unreadOnly === "true";

  const whereConditions = unreadOnly
    ? and(
        eq(notificationsTable.clerkUserId, userId),
        eq(notificationsTable.isRead, false),
      )
    : eq(notificationsTable.clerkUserId, userId);

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(whereConditions)
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  // Count unread
  const unreadRows = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.clerkUserId, userId),
        eq(notificationsTable.isRead, false),
      ),
    );

  res.json({
    notifications,
    unreadCount: unreadRows.length,
    limit,
    offset,
  });
});

/* ── POST /api/notifications/:id/read ────────────────────────────────────── */

router.post("/notifications/:id/read", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [notif] = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.id, req.params.id),
        eq(notificationsTable.clerkUserId, userId),
      ),
    )
    .limit(1);

  if (!notif) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.id, req.params.id));

  res.json({ success: true });
});

/* ── POST /api/notifications/read-all ────────────────────────────────────── */

router.post("/notifications/read-all", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(
      and(
        eq(notificationsTable.clerkUserId, userId),
        eq(notificationsTable.isRead, false),
      ),
    );

  res.json({ success: true });
});

/* ── DELETE /api/notifications/:id ───────────────────────────────────────── */

router.delete("/notifications/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [notif] = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.id, req.params.id),
        eq(notificationsTable.clerkUserId, userId),
      ),
    )
    .limit(1);

  if (!notif) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  await db
    .delete(notificationsTable)
    .where(eq(notificationsTable.id, req.params.id));

  res.json({ success: true });
});

export default router;
