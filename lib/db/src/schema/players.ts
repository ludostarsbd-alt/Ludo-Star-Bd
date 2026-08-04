import {
  pgTable, uuid, text, numeric, integer, timestamp, boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Player wallet, level & XP — one row per Clerk user.
 * Coins  = in-app currency (earned/spent in-game)
 * Cash   = real-money balance (from deposits)
 */
export const playersTable = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),

  // Wallet
  coins: numeric("coins", { precision: 14, scale: 2 }).notNull().default("0.00"),
  cash: numeric("cash", { precision: 14, scale: 2 }).notNull().default("0.00"),

  // XP / Level
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),

  // Push notification token (FCM / APNs)
  pushToken: text("push_token"),

  // Location for nearby matchmaking
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  locationUpdatedAt: timestamp("location_updated_at", { withTimezone: true }),

  isOnline: boolean("is_online").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;

/* ── XP thresholds ─────────────────────────────────────────────────────────── */
// Level = floor(sqrt(xp / 100)) + 1  (capped at 100)
export function xpToLevel(xp: number): number {
  return Math.min(100, Math.floor(Math.sqrt(xp / 100)) + 1);
}

export function xpForNextLevel(level: number): number {
  return (level) ** 2 * 100;
}
