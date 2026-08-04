/**
 * HIDDEN FROM PLAYERS — admin/system only.
 *
 * Links a registration to a pool. Players cannot see who else is in their pool
 * or how many members exist.
 */
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const poolMembersTable = pgTable("pool_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  poolId: uuid("pool_id").notNull(),
  registrationId: uuid("registration_id").notNull(),
  clerkUserId: text("clerk_user_id").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPoolMemberSchema = createInsertSchema(poolMembersTable).omit({
  id: true,
  joinedAt: true,
});

export type InsertPoolMember = z.infer<typeof insertPoolMemberSchema>;
export type PoolMember = typeof poolMembersTable.$inferSelect;
