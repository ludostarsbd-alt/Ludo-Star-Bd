import {
  pgTable, uuid, text, integer, numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Individual kill events within a league match.
 *
 * type:
 *   bonus   → player killed an opponent's token (earns points)
 *   penalty → player's token was killed (loses points)
 *
 * progressPct: how far along the board the victim token was (10–100)
 * bonusAmount: points earned/lost (positive — sign determined by type)
 *
 * Kill bonus tiers:
 *   10% → +0.10   25% → +0.25   40% → +0.40   55% → +0.55
 *   70% → +0.70   85% → +0.85   99% → +0.99   100% → +1.00 (one step before finish)
 *
 * The victim receives −bonusAmount (equal penalty).
 */
export const matchKillBonusesTable = pgTable("match_kill_bonuses", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id").notNull(),
  registrationId: uuid("registration_id").notNull(),
  type: text("type").notNull(), // bonus | penalty
  victimName: text("victim_name").notNull(),
  progressPct: integer("progress_pct").notNull(), // 10 | 25 | 40 | 55 | 70 | 85 | 99 | 100
  bonusAmount: numeric("bonus_amount", { precision: 6, scale: 2 }).notNull(),
});

export const insertKillBonusSchema = createInsertSchema(matchKillBonusesTable).omit({ id: true });

export type InsertKillBonus = z.infer<typeof insertKillBonusSchema>;
export type MatchKillBonus = typeof matchKillBonusesTable.$inferSelect;
