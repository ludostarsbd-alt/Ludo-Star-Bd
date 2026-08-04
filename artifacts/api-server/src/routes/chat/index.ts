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
import { eq, and, or, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { chatMessagesTable, playersTable } from "@workspace/db";
import { requireAuth } from "../../lib/auth";

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
