import {
  pgTable, uuid, text, boolean, numeric, timestamp, integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One row per player per tournament.
 *
 * status lifecycle:
 *   waiting          → just joined, in waiting list
 *   pool_assigned    → assigned to a pool, can start league matches
 *   league_playing   → playing league matches (matchesPlayed < 3)
 *   league_done      → all 3 league matches played
 *   reviewing        → qualification review in progress
 *   qualified        → passed qualification threshold
 *   eliminated       → did not qualify (or lost in knockout)
 *   knockout         → currently in knockout stage
 *   champion         → won the final
 */
export const tournamentRegistrationsTable = pgTable("tournament_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull(),
  clerkUserId: text("clerk_user_id").notNull(),
  displayName: text("display_name").notNull(),
  teamId: uuid("team_id"),
  nearbyEnabled: boolean("nearby_enabled").notNull().default(false),

  // progression
  status: text("status").notNull().default("waiting"),
  matchesPlayed: integer("matches_played").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  totalPoints: numeric("total_points", { precision: 10, scale: 2 }).notNull().default("0.00"),

  // qualification
  qualificationThreshold: numeric("qualification_threshold", { precision: 10, scale: 2 }),
  qualified: boolean("qualified"),

  // knockout progress
  knockoutRound: text("knockout_round"), // optional: round-of-128 | round-of-64 | round-of-32 | round-of-16 | quarter-final | semi-final | final

  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRegistrationSchema = createInsertSchema(tournamentRegistrationsTable).omit({
  id: true,
  joinedAt: true,
  updatedAt: true,
});

export type InsertRegistration = z.infer<typeof insertRegistrationSchema>;
export type TournamentRegistration = typeof tournamentRegistrationsTable.$inferSelect;
