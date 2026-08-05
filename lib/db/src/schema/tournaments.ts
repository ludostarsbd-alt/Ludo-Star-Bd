import { pgTable, text, uuid, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One tournament season. The configuration is persisted so admins can schedule
 * a complete competition before players begin entering it.
 * status:
 *   open         → accepting registrations
 *   running      → league + knockout in progress
 *   completed    → all knockout rounds done
 */
export const tournamentsTable = pgTable("tournaments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default("Championship"),
  type: text("type").notNull().default("1v1"), // 1v1 | 2v2
  status: text("status").notNull().default("open"), // open | running | completed | cancelled
  groupMatchCount: integer("group_match_count").notNull().default(3),
  enabledStages: jsonb("enabled_stages").notNull().default(["group", "round-of-32", "round-of-16", "quarter-final", "semi-final", "final"]),
  format: text("format").notNull().default("auto"), // auto | direct-knockout | group-stage
  participantCount: integer("participant_count"),
  groupCount: integer("group_count"),
  entryStage: text("entry_stage"),
  groupSchedule: jsonb("group_schedule").notNull().default([]),
  knockoutSchedule: jsonb("knockout_schedule").notNull().default([]),
  allowTeamRename: boolean("allow_team_rename").notNull().default(true),
  championName: text("champion_name"),
  championTeamId: uuid("champion_team_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTournamentSchema = createInsertSchema(tournamentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournamentsTable.$inferSelect;
