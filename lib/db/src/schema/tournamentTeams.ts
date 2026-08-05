import { pgTable, text, uuid, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** A permanent pair in a 2v2 tournament. */
export const tournamentTeamsTable = pgTable("tournament_teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull(),
  name: text("name").notNull(),
  captainClerkUserId: text("captain_clerk_user_id").notNull(),
  partnerClerkUserId: text("partner_clerk_user_id"),
  captainName: text("captain_name").notNull(),
  partnerName: text("partner_name"),
  status: text("status").notNull().default("waiting_for_partner"), // waiting_for_partner | ready | eliminated | champion
  matchesPlayed: integer("matches_played").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  points: numeric("points", { precision: 10, scale: 2 }).notNull().default("0.00"),
  qualificationThreshold: numeric("qualification_threshold", { precision: 10, scale: 2 }),
  qualified: boolean("qualified"),
  knockoutRound: text("knockout_round"), // optional: round-of-128 | round-of-64 | round-of-32 | round-of-16 | quarter-final | semi-final | final
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTournamentTeamSchema = createInsertSchema(tournamentTeamsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertTournamentTeam = z.infer<typeof insertTournamentTeamSchema>;
export type TournamentTeam = typeof tournamentTeamsTable.$inferSelect;