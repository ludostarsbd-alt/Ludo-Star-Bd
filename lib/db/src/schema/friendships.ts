import {
  pgTable, uuid, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Friend relationships between players.
 * status:
 *   pending  → requester sent request, recipient hasn't acted
 *   accepted → both are friends
 *   declined → recipient declined (soft)
 *   blocked  → one user blocked the other
 */
export const friendshipsTable = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: text("requester_id").notNull(),   // clerkUserId
    recipientId: text("recipient_id").notNull(),   // clerkUserId
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("friendships_pair_idx").on(t.requesterId, t.recipientId),
  ],
);

export const insertFriendshipSchema = createInsertSchema(friendshipsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFriendship = z.infer<typeof insertFriendshipSchema>;
export type Friendship = typeof friendshipsTable.$inferSelect;
