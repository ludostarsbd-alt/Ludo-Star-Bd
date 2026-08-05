import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const teamInvitationsTable = pgTable("team_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull(),
  teamId: uuid("team_id").notNull(),
  inviterClerkUserId: text("inviter_clerk_user_id").notNull(),
  inviteeClerkUserId: text("invitee_clerk_user_id").notNull(),
  inviterName: text("inviter_name").notNull(),
  inviteeName: text("invitee_name").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | rejected | cancelled
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
});

export const insertTeamInvitationSchema = createInsertSchema(teamInvitationsTable).omit({
  id: true, createdAt: true, respondedAt: true,
});
export type InsertTeamInvitation = z.infer<typeof insertTeamInvitationSchema>;
export type TeamInvitation = typeof teamInvitationsTable.$inferSelect;