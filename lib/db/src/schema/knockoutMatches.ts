import {
  pgTable, uuid, text, timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One row per knockout match played by a qualified player.
 *
 * rounds (in order):
 *   optional round-of-128 → round-of-64 → round-of-32 → round-of-16 → quarter-final → semi-final → final
 *
 * outcome: win | loss
 * A loss means the player is eliminated (status → eliminated).
 * Winning the final means the player is the champion (status → champion).
 */
export const knockoutMatchesTable = pgTable("knockout_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull(),
  registrationId: uuid("registration_id").notNull(),
  clerkUserId: text("clerk_user_id").notNull(),

  round: text("round").notNull(), // optional round-of-128 | round-of-64 | round-of-32 | round-of-16 | quarter-final | semi-final | final
  opponentName: text("opponent_name").notNull(),
  opponentClerkUserId: text("opponent_clerk_user_id"),

  outcome: text("outcome").notNull(), // win | loss

  playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKnockoutMatchSchema = createInsertSchema(knockoutMatchesTable).omit({
  id: true,
  playedAt: true,
});

export type InsertKnockoutMatch = z.infer<typeof insertKnockoutMatchSchema>;
export type KnockoutMatch = typeof knockoutMatchesTable.$inferSelect;
