import {
  pgTable, uuid, text, integer, numeric, timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Lifetime career stats for each player (across all tournaments).
 * One row per Clerk user. Upserted after every match.
 */
export const playerCareerStatsTable = pgTable("player_career_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  displayName: text("display_name").notNull(),

  // Tournament participation
  tournamentsJoined: integer("tournaments_joined").notNull().default(0),
  tournamentsQualified: integer("tournaments_qualified").notNull().default(0),
  championships: integer("championships").notNull().default(0),

  // League aggregate
  leagueMatchesPlayed: integer("league_matches_played").notNull().default(0),
  leagueWins: integer("league_wins").notNull().default(0),
  leagueLosses: integer("league_losses").notNull().default(0),
  leagueDraws: integer("league_draws").notNull().default(0),
  totalLeaguePoints: numeric("total_league_points", { precision: 12, scale: 2 }).notNull().default("0.00"),

  // Knockout aggregate
  knockoutsPlayed: integer("knockouts_played").notNull().default(0),
  knockoutWins: integer("knockout_wins").notNull().default(0),

  // Casual online multiplayer aggregate (kept separate from tournaments)
  onlineMatchesPlayed: integer("online_matches_played").notNull().default(0),
  onlineWins: integer("online_wins").notNull().default(0),
  onlineLosses: integer("online_losses").notNull().default(0),

  // Best knockout round reached
  bestKnockoutRound: text("best_knockout_round"), // e.g. "final"

  // Kill stats
  totalKills: integer("total_kills").notNull().default(0),
  totalKillBonusEarned: numeric("total_kill_bonus_earned", { precision: 12, scale: 2 }).notNull().default("0.00"),
  totalPenaltySuffered: numeric("total_penalty_suffered", { precision: 12, scale: 2 }).notNull().default("0.00"),

  lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCareerStatsSchema = createInsertSchema(playerCareerStatsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertCareerStats = z.infer<typeof insertCareerStatsSchema>;
export type PlayerCareerStats = typeof playerCareerStatsTable.$inferSelect;
