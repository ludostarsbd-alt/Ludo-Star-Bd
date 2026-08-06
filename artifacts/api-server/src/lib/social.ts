import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  chatMessagesTable,
  friendshipsTable,
  notificationsTable,
  playersTable,
} from "@workspace/db";

export type RelationshipStatus =
  | "self"
  | "friends"
  | "request_sent"
  | "request_received"
  | "declined"
  | "none";

export async function getFriendshipBetween(userA: string, userB: string) {
  const [friendship] = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        and(
          eq(friendshipsTable.requesterId, userA),
          eq(friendshipsTable.recipientId, userB),
        ),
        and(
          eq(friendshipsTable.requesterId, userB),
          eq(friendshipsTable.recipientId, userA),
        ),
      ),
    )
    .limit(1);
  return friendship ?? null;
}

export async function relationshipFor(userId: string, otherUserId: string): Promise<{
  status: RelationshipStatus;
  friendshipId: string | null;
}> {
  if (userId === otherUserId) {
    return { status: "self", friendshipId: null };
  }

  const friendship = await getFriendshipBetween(userId, otherUserId);
  if (!friendship) return { status: "none", friendshipId: null };
  if (friendship.status === "accepted") {
    return { status: "friends", friendshipId: friendship.id };
  }
  if (friendship.status === "declined") {
    return { status: "declined", friendshipId: friendship.id };
  }
  return {
    status:
      friendship.requesterId === userId ? "request_sent" : "request_received",
    friendshipId: friendship.id,
  };
}

export async function getDirectMessagePermission(
  senderId: string,
  recipientId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const friendship = await getFriendshipBetween(senderId, recipientId);
  if (friendship?.status === "accepted") return { allowed: true };
  if (friendship?.status === "declined") {
    return {
      allowed: false,
      reason:
        "This player declined the friend request. You cannot send another message.",
    };
  }

  const counts = await db
    .select({
      senderId: chatMessagesTable.senderId,
      count: sql<number>`count(*)`,
    })
    .from(chatMessagesTable)
    .where(
      and(
        eq(chatMessagesTable.channel, "direct"),
        eq(chatMessagesTable.isDeleted, false),
        or(
          and(
            eq(chatMessagesTable.senderId, senderId),
            eq(chatMessagesTable.recipientId, recipientId),
          ),
          and(
            eq(chatMessagesTable.senderId, recipientId),
            eq(chatMessagesTable.recipientId, senderId),
          ),
        ),
      ),
    )
    .groupBy(chatMessagesTable.senderId);

  const senderCount = Number(
    counts.find((row) => row.senderId === senderId)?.count ?? 0,
  );
  const recipientCount = Number(
    counts.find((row) => row.senderId === recipientId)?.count ?? 0,
  );

  if (senderCount === 0) return { allowed: true };
  if (recipientCount > 0) return { allowed: true };

  return {
    allowed: false,
    reason:
      "Send one initial message only. You can continue after a reply or friendship acceptance.",
  };
}

export async function createSocialNotification(input: {
  clerkUserId: string;
  type: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  data?: Record<string, unknown>;
}) {
  const [notification] = await db
    .insert(notificationsTable)
    .values({
      clerkUserId: input.clerkUserId,
      type: input.type,
      title: input.title,
      body: input.body,
      imageUrl: input.imageUrl ?? null,
      data: input.data ?? null,
    })
    .returning();
  return notification;
}

export async function getPlayerDisplayName(userId: string) {
  const [player] = await db
    .select({
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
    })
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);
  return player ?? { displayName: "Player", avatarUrl: null };
}