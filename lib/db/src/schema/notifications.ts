import {
  pgTable, uuid, text, boolean, timestamp, jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Push notification history — one row per delivered notification.
 * type examples: match_invite | friend_request | daily_bonus | game_result | chat_message
 */
export const notificationsTable = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull(),

  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  imageUrl: text("image_url"),

  isRead: boolean("is_read").notNull().default(false),

  // Deep-link data for the client
  data: jsonb("data"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
