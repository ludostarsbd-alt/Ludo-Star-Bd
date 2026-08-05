import {
  pgTable, uuid, text, integer, numeric, boolean, timestamp, jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * A multiplayer game room.
 * status:
 *   waiting    → waiting for players to fill seats
 *   in_progress → game is running
 *   finished   → game ended
 *   cancelled  → aborted (not enough players)
 *
 * mode:
 *   classic    → 4 players, standard Ludo
 *   quick      → 2 players, heads-up
 *
 * entryType:
 *   free       → no entry fee
 *   coins      → entry fee in coins
 *   cash       → entry fee in real money
 */
export const gameRoomsTable = pgTable("game_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // 6-char room code e.g. "AB12CD"

  creatorId: text("creator_id").notNull(),  // clerkUserId
  mode: text("mode").notNull().default("classic"),   // classic | quick
  maxPlayers: integer("max_players").notNull().default(4),
  status: text("status").notNull().default("waiting"),
  powerSixEnabled: boolean("power_six_enabled").notNull().default(false),

  entryType: text("entry_type").notNull().default("free"),
  entryFee: numeric("entry_fee", { precision: 10, scale: 2 }).notNull().default("0.00"),
  prizePool: numeric("prize_pool", { precision: 10, scale: 2 }).notNull().default("0.00"),

  isNearby: boolean("is_nearby").notNull().default(false),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  nearbyRadiusKm: numeric("nearby_radius_km", { precision: 5, scale: 2 }),

  // Array of { clerkUserId, displayName, color, seatIndex }
  seats: jsonb("seats").notNull().default("[]"),

  gameId: uuid("game_id"), // linked ludoGamesTable row when game starts

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const insertGameRoomSchema = createInsertSchema(gameRoomsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGameRoom = z.infer<typeof insertGameRoomSchema>;
export type GameRoom = typeof gameRoomsTable.$inferSelect;

export type RoomSeat = {
  clerkUserId: string;
  displayName: string;
  color: "red" | "green" | "blue" | "yellow";
  seatIndex: number;
  isReady: boolean;
};
