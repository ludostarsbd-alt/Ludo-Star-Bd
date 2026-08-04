import {
  pgTable, uuid, text, integer, numeric, timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One row per league match played by a player.
 * Each player plays exactly 3 league matches.
 *
 * outcome: win | loss | draw
 * opponentClerkUserId: null when opponent is an AI/simulated player
 */
export const leagueMatchesTable = pgTable("league_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull(),
  registrationId: uuid("registration_id").notNull(),
  clerkUserId: text("clerk_user_id").notNull(),
  poolId: uuid("pool_id"),

  matchNumber: integer("match_number").notNull(), // 1, 2, or 3
  opponentName: text("opponent_name").notNull(),
  opponentClerkUserId: text("opponent_clerk_user_id"), // null = AI

  outcome: text("outcome").notNull(), // win | loss | draw
  basePoints: numeric("base_points", { precision: 8, scale: 2 }).notNull(),
  killBonusTotal: numeric("kill_bonus_total", { precision: 8, scale: 2 }).notNull().default("0.00"),
  penaltyTotal: numeric("penalty_total", { precision: 8, scale: 2 }).notNull().default("0.00"),
  netPoints: numeric("net_points", { precision: 8, scale: 2 }).notNull(),

  playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLeagueMatchSchema = createInsertSchema(leagueMatchesTable).omit({
  id: true,
  playedAt: true,
});

export type InsertLeagueMatch = z.infer<typeof insertLeagueMatchSchema>;
export type LeagueMatch = typeof leagueMatchesTable.$inferSelect;
