import {
  pgTable, uuid, text, timestamp, boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Chat messages — both in-game room chat and direct messages.
 * channel:
 *   room   → in-game room chat (roomId required)
 *   direct → DM between two players (recipientId required)
 */
export const chatMessagesTable = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderId: text("sender_id").notNull(),       // clerkUserId
  senderName: text("sender_name").notNull(),
  channel: text("channel").notNull(),          // room | direct

  // One of these must be set depending on channel
  roomId: text("room_id"),                     // game room ID for room chat
  recipientId: text("recipient_id"),           // clerkUserId for DM

  content: text("content").notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessagesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
