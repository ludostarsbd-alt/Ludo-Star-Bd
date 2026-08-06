/**
 * Friends routes
 *
 * POST   /api/friends/request        — send a friend request
 * POST   /api/friends/:id/accept     — accept a request
 * POST   /api/friends/:id/decline    — decline a request
 * DELETE /api/friends/:id            — remove friend / cancel request
 * GET    /api/friends                — my friend list (accepted)
 * GET    /api/friends/requests       — pending incoming requests
 * GET    /api/friends/sent           — pending outgoing requests
 */

import { Router, type IRouter } from "express";
import { eq, and, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { friendshipsTable, playersTable } from "@workspace/db";
import { requireAuth } from "../../lib/auth";
import {
  createSocialNotification,
  getPlayerDisplayName,
} from "../../lib/social";
import { emitSocialToUser } from "../../lib/websocket";

const router: IRouter = Router();

/* ── POST /api/friends/request ────────────────────────────────────────────── */

router.post("/friends/request", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { recipientId } = req.body as { recipientId?: string };
  if (!recipientId || recipientId === userId) {
    res.status(400).json({ error: "Invalid recipient" });
    return;
  }

  const [recipient] = await db
    .select({ id: playersTable.id, displayName: playersTable.displayName })
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, recipientId))
    .limit(1);

  if (!recipient) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const [existing] = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        and(eq(friendshipsTable.requesterId, userId), eq(friendshipsTable.recipientId, recipientId)),
        and(eq(friendshipsTable.requesterId, recipientId), eq(friendshipsTable.recipientId, userId)),
      ),
    )
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Friend relationship already exists", status: existing.status });
    return;
  }

  const [friendship] = await db
    .insert(friendshipsTable)
    .values({ requesterId: userId, recipientId, status: "pending" })
    .returning();

  req.log.info({ userId, recipientId }, "Friend request sent");
  const sender = await getPlayerDisplayName(userId);
  const notification = await createSocialNotification({
    clerkUserId: recipientId,
    type: "friend_request",
    title: "New friend request",
    body: `${sender.displayName} wants to be your friend.`,
    imageUrl: sender.avatarUrl,
    data: { friendshipId: friendship.id, userId },
  });
  emitSocialToUser(recipientId, "social:friend_request", {
    friendship,
    notification,
  });
  res.status(201).json({ friendship });
});

/* ── POST /api/friends/:id/accept ─────────────────────────────────────────── */

router.post("/friends/:id/accept", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [friendship] = await db
    .select()
    .from(friendshipsTable)
    .where(eq(friendshipsTable.id, req.params.id))
    .limit(1);

  if (!friendship || friendship.recipientId !== userId) {
    res.status(404).json({ error: "Friend request not found" });
    return;
  }
  if (friendship.status !== "pending") {
    res.status(409).json({ error: "Request is no longer pending" });
    return;
  }

  const [updated] = await db
    .update(friendshipsTable)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(friendshipsTable.id, req.params.id))
    .returning();

  const recipient = await getPlayerDisplayName(userId);
  const notification = await createSocialNotification({
    clerkUserId: friendship.requesterId,
    type: "friend_accepted",
    title: "Friend request accepted",
    body: `${recipient.displayName} accepted your friend request.`,
    imageUrl: recipient.avatarUrl,
    data: { friendshipId: friendship.id, userId },
  });
  emitSocialToUser(friendship.requesterId, "social:friend_accepted", {
    friendship: updated,
    notification,
  });
  emitSocialToUser(userId, "social:friend_accepted", { friendship: updated });
  res.json({ friendship: updated });
});

/* ── POST /api/friends/:id/decline ────────────────────────────────────────── */

router.post("/friends/:id/decline", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [friendship] = await db
    .select()
    .from(friendshipsTable)
    .where(eq(friendshipsTable.id, req.params.id))
    .limit(1);

  if (!friendship || friendship.recipientId !== userId) {
    res.status(404).json({ error: "Friend request not found" });
    return;
  }

  const [updated] = await db
    .update(friendshipsTable)
    .set({ status: "declined", updatedAt: new Date() })
    .where(eq(friendshipsTable.id, req.params.id))
    .returning();

  const recipient = await getPlayerDisplayName(userId);
  const notification = await createSocialNotification({
    clerkUserId: friendship.requesterId,
    type: "friend_declined",
    title: "Friend request declined",
    body: `${recipient.displayName} declined your friend request.`,
    imageUrl: recipient.avatarUrl,
    data: { friendshipId: friendship.id, userId },
  });
  emitSocialToUser(friendship.requesterId, "social:friend_declined", {
    friendship: updated,
    notification,
  });
  res.json({ friendship: updated });
});

/* ── DELETE /api/friends/:id ──────────────────────────────────────────────── */

router.delete("/friends/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [friendship] = await db
    .select()
    .from(friendshipsTable)
    .where(eq(friendshipsTable.id, req.params.id))
    .limit(1);

  if (!friendship) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (friendship.requesterId !== userId && friendship.recipientId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(friendshipsTable).where(eq(friendshipsTable.id, req.params.id));
  res.json({ success: true });
});

/* ── GET /api/friends ─────────────────────────────────────────────────────── */

router.get("/friends", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const friendships = await db
    .select()
    .from(friendshipsTable)
    .where(
      and(
        or(
          eq(friendshipsTable.requesterId, userId),
          eq(friendshipsTable.recipientId, userId),
        ),
        eq(friendshipsTable.status, "accepted"),
      ),
    );

  const friendIds = friendships.map((f) =>
    f.requesterId === userId ? f.recipientId : f.requesterId,
  );

  if (friendIds.length === 0) {
    res.json({ friends: [], total: 0 });
    return;
  }

  // Build a dynamic OR chain for all friend IDs
  const idCondition = friendIds.reduce<ReturnType<typeof eq> | ReturnType<typeof or>>(
    (acc, id, i) =>
      i === 0
        ? eq(playersTable.clerkUserId, id)
        : or(acc as any, eq(playersTable.clerkUserId, id))!,
    eq(playersTable.clerkUserId, friendIds[0]),
  );

  const friendProfiles = await db
    .select({
      clerkUserId: playersTable.clerkUserId,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      level: playersTable.level,
      coins: playersTable.coins,
      isOnline: playersTable.isOnline,
      lastSeenAt: playersTable.lastSeenAt,
    })
    .from(playersTable)
    .where(idCondition as any);

  res.json({ friends: friendProfiles, total: friendProfiles.length });
});

/* ── GET /api/friends/requests ────────────────────────────────────────────── */

router.get("/friends/requests", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const requests = await db
    .select({
      id: friendshipsTable.id,
      requesterId: friendshipsTable.requesterId,
      createdAt: friendshipsTable.createdAt,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      level: playersTable.level,
    })
    .from(friendshipsTable)
    .innerJoin(playersTable, eq(friendshipsTable.requesterId, playersTable.clerkUserId))
    .where(
      and(
        eq(friendshipsTable.recipientId, userId),
        eq(friendshipsTable.status, "pending"),
      ),
    );

  res.json({ requests });
});

/* ── GET /api/friends/sent ────────────────────────────────────────────────── */

router.get("/friends/sent", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const sent = await db
    .select({
      id: friendshipsTable.id,
      recipientId: friendshipsTable.recipientId,
      status: friendshipsTable.status,
      createdAt: friendshipsTable.createdAt,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      level: playersTable.level,
    })
    .from(friendshipsTable)
    .innerJoin(playersTable, eq(friendshipsTable.recipientId, playersTable.clerkUserId))
    .where(
      and(
        eq(friendshipsTable.requesterId, userId),
        eq(friendshipsTable.status, "pending"),
      ),
    );

  res.json({ sent });
});

export default router;
