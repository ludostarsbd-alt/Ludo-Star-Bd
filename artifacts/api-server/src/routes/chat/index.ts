/**
 * Chat routes (REST — persisted history)
 * Real-time delivery is handled via Socket.IO in websocket.ts
 *
 * GET  /api/chat/room/:roomId      — room chat history
 * GET  /api/chat/dm/:userId        — DM history with a specific user
 * POST /api/chat/dm                — send a DM (REST fallback; WS is preferred)
 * DELETE /api/chat/:messageId      — soft-delete own message
 */

import { Router, type IRouter } from "express";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { chatMessagesTable, friendshipsTable, notificationsTable, playersTable } from "@workspace/db";
import { requireAuth } from "../../lib/auth";
import {
  createSocialNotification,
  getDirectMessagePermission,
  getPlayerDisplayName,
} from "../../lib/social";
import { emitSocialToUser } from "../../lib/websocket";

const router: IRouter = Router();

/* ── GET /api/chat/room/:roomId ──────────────────────────────────────────── */

router.get("/chat/room/:roomId", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const before = req.query.before as string | undefined; // ISO timestamp cursor

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(
      and(
        eq(chatMessagesTable.channel, "room"),
        eq(chatMessagesTable.roomId, req.params.roomId),
        eq(chatMessagesTable.isDeleted, false),
      ),
    )
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(limit);

  res.json({ messages: messages.reverse(), roomId: req.params.roomId });
});

/* ── GET /api/chat/dm/:otherUserId ───────────────────────────────────────── */

router.get("/chat/dm/:otherUserId", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const otherId = req.params.otherUserId;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(
      and(
        eq(chatMessagesTable.channel, "direct"),
        eq(chatMessagesTable.isDeleted, false),
        or(
          and(
            eq(chatMessagesTable.senderId, userId),
            eq(chatMessagesTable.recipientId, otherId),
          ),
          and(
            eq(chatMessagesTable.senderId, otherId),
            eq(chatMessagesTable.recipientId, userId),
          ),
        ),
      ),
    )
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(limit);

  res.json({ messages: messages.reverse(), withUserId: otherId });
});

/* ── GET /api/chat/unread ─────────────────────────────────────────────────── */

router.get("/chat/unread", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const rows = await db
    .select({ data: notificationsTable.data })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.clerkUserId, userId),
        eq(notificationsTable.type, "chat_message"),
        eq(notificationsTable.isRead, false),
      ),
    )
    .limit(500);

  const unreadByUser: Record<string, number> = {};
  for (const row of rows) {
    const senderId =
      row.data && typeof row.data === "object" && "senderId" in row.data
        ? String((row.data as { senderId?: unknown }).senderId ?? "")
        : "";
    if (senderId) unreadByUser[senderId] = (unreadByUser[senderId] ?? 0) + 1;
  }
  res.json({ unreadByUser, total: Object.values(unreadByUser).reduce((a, b) => a + b, 0) });
});

/* ── POST /api/chat/dm/:otherUserId/read ──────────────────────────────────── */

router.post("/chat/dm/:otherUserId/read", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(
      and(
        eq(notificationsTable.clerkUserId, userId),
        eq(notificationsTable.type, "chat_message"),
        eq(notificationsTable.isRead, false),
        sql`${notificationsTable.data}->>'senderId' = ${req.params.otherUserId}`,
      ),
    );
  res.json({ success: true });
});

/* ── POST /api/chat/dm ───────────────────────────────────────────────────── */

router.post("/chat/dm", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { recipientId, content } = req.body as { recipientId?: string; content?: string };

  if (!recipientId || recipientId === userId) {
    res.status(400).json({ error: "Invalid recipient" });
    return;
  }
  if (!content?.trim() || content.length > 1000) {
    res.status(400).json({ error: "Content must be 1–1000 characters" });
    return;
  }

  const [recipient] = await db
    .select({ clerkUserId: playersTable.clerkUserId })
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, recipientId))
    .limit(1);
  if (!recipient) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const permission = await getDirectMessagePermission(userId, recipientId);
  if (!permission.allowed) {
    res.status(403).json({ error: permission.reason });
    return;
  }

  const [sender] = await db
    .select({ displayName: playersTable.displayName })
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);

  const [message] = await db
    .insert(chatMessagesTable)
    .values({
      senderId: userId,
      senderName: sender?.displayName ?? "Player",
      channel: "direct",
      recipientId,
      content: content.trim(),
    })
    .returning();

  const senderProfile = await getPlayerDisplayName(userId);
  const notification = await createSocialNotification({
    clerkUserId: recipientId,
    type: "chat_message",
    title: `Message from ${senderProfile.displayName}`,
    body: content.trim().slice(0, 120),
    imageUrl: senderProfile.avatarUrl,
    data: { messageId: message.id, senderId: userId },
  });
  emitSocialToUser(recipientId, "social:dm_received", { message, notification });
  res.status(201).json({ message });
});

/* ── DELETE /api/chat/:messageId ─────────────────────────────────────────── */

router.delete("/chat/:messageId", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [msg] = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.id, req.params.messageId))
    .limit(1);

  if (!msg || msg.senderId !== userId) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  await db
    .update(chatMessagesTable)
    .set({ isDeleted: true })
    .where(eq(chatMessagesTable.id, req.params.messageId));

  res.json({ success: true });
});

export default router;
