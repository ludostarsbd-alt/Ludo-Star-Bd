/**
 * HIDDEN FROM PLAYERS — admin/system only.
 *
 * A Pool is a group of players that compete together in the league stage.
 * Pool sizes are calculated when a large tournament is started. The system never exposes:
 *   - how many pools exist
 *   - which pool a player is in
 *   - how many players are in a pool
 *   - other players in the same pool
 */
import { pgTable, uuid, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tournamentPoolsTable = pgTable("tournament_pools", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull(),
  poolSize: integer("pool_size").notNull(),
  currentSize: integer("current_size").notNull().default(0),
  status: text("status").notNull().default("open"), // open | full | completed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPoolSchema = createInsertSchema(tournamentPoolsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPool = z.infer<typeof insertPoolSchema>;
export type TournamentPool = typeof tournamentPoolsTable.$inferSelect;
