import {
  pgTable, uuid, text, numeric, timestamp, jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * All financial transactions.
 * type:
 *   deposit         → real money → coins/cash
 *   coin_purchase   → store bundle purchase
 *   game_entry_fee  → deducted when joining paid room
 *   game_winnings   → credited on win
 *   daily_bonus     → daily login reward
 *   refund          → reversed charge
 */
export const transactionsTable = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull(),

  type: text("type").notNull(),
  // positive = credit, negative = debit
  coinsDelta: numeric("coins_delta", { precision: 14, scale: 2 }).notNull().default("0.00"),
  cashDelta: numeric("cash_delta", { precision: 14, scale: 2 }).notNull().default("0.00"),

  // Running balances after this tx
  coinsAfter: numeric("coins_after", { precision: 14, scale: 2 }).notNull(),
  cashAfter: numeric("cash_after", { precision: 14, scale: 2 }).notNull(),

  // Payment provider reference (Stripe charge id, bKash trxid, etc.)
  externalRef: text("external_ref"),
  note: text("note"),
  meta: jsonb("meta"), // arbitrary extra data

  status: text("status").notNull().default("completed"), // pending | completed | failed | refunded
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;

/* ── Store bundles ─────────────────────────────────────────────────────────── */
export const COIN_BUNDLES = [
  { id: "coins_100",   coins: 100,  price: 9,   currency: "BDT", label: "100 Coins" },
  { id: "coins_500",   coins: 500,  price: 39,  currency: "BDT", label: "500 Coins" },
  { id: "coins_1000",  coins: 1000, price: 69,  currency: "BDT", label: "1 000 Coins" },
  { id: "coins_2500",  coins: 2500, price: 149, currency: "BDT", label: "2 500 Coins" },
  { id: "coins_5000",  coins: 5000, price: 279, currency: "BDT", label: "5 000 Coins" },
  { id: "coins_10000", coins: 10000,price: 499, currency: "BDT", label: "10 000 Coins" },
] as const;

export type CoinBundleId = (typeof COIN_BUNDLES)[number]["id"];
