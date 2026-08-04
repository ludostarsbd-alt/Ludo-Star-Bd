import {
  pgTable, uuid, text, integer, numeric, timestamp, date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Daily login reward tracking.
 * streak resets if claimDate > lastClaimDate + 1 day.
 */
export const dailyBonusesTable = pgTable("daily_bonuses", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),

  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  totalClaimed: integer("total_claimed").notNull().default(0),

  lastClaimDate: date("last_claim_date"),           // YYYY-MM-DD
  lastClaimCoins: numeric("last_claim_coins", { precision: 10, scale: 2 }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDailyBonusSchema = createInsertSchema(dailyBonusesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDailyBonus = z.infer<typeof insertDailyBonusSchema>;
export type DailyBonus = typeof dailyBonusesTable.$inferSelect;

/* ── Reward ladder ─────────────────────────────────────────────────────────── */
// Day 1‥7 cycle; higher streaks multiply the base reward
export const DAILY_REWARDS: Record<number, number> = {
  1: 50,
  2: 75,
  3: 100,
  4: 150,
  5: 200,
  6: 300,
  7: 500, // 7-day streak bonus
};

export function getDayReward(streak: number): number {
  const day = ((streak - 1) % 7) + 1;
  return DAILY_REWARDS[day] ?? 50;
}
