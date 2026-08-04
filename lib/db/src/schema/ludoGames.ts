import {
  pgTable, uuid, text, integer, timestamp, jsonb, boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Full serialised Ludo game state — one row per live/completed game.
 * The canonical game state lives in memory (WebSocket server) while the game
 * is running; this table is used for persistence / reconnect recovery.
 */
export const ludoGamesTable = pgTable("ludo_games", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull(),

  // JSON snapshot of LudoGameState (see ludo.engine.ts)
  state: jsonb("state").notNull(),

  currentTurn: text("current_turn").notNull(), // color of current player
  turnNumber: integer("turn_number").notNull().default(0),
  isFinished: boolean("is_finished").notNull().default(false),
  winnerId: text("winner_id"),   // clerkUserId of winner
  winnerColor: text("winner_color"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const insertLudoGameSchema = createInsertSchema(ludoGamesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLudoGame = z.infer<typeof insertLudoGameSchema>;
export type LudoGame = typeof ludoGamesTable.$inferSelect;
