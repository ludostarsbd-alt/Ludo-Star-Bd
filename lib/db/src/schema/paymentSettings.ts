/**
 * Public manual-payment configuration.
 *
 * Gateway credentials intentionally do not belong here. This singleton only
 * stores the merchant information that is safe to show to deposit customers.
 */
import { boolean, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const paymentSettingsTable = pgTable("payment_settings", {
  id: text("id").primaryKey().default("default"),
  bkashNumber: text("bkash_number"),
  nagadNumber: text("nagad_number"),
  rocketNumber: text("rocket_number"),
  upayNumber: text("upay_number"),
  otherInstructions: text("other_instructions"),
  minDepositBDT: numeric("min_deposit_bdt", { precision: 10, scale: 2 })
    .notNull()
    .default("10"),
  maxDepositBDT: numeric("max_deposit_bdt", { precision: 10, scale: 2 })
    .notNull()
    .default("100000"),
  enabledMethods: jsonb("enabled_methods")
    .notNull()
    .default(["bkash", "nagad", "rocket", "upay", "other"]),
  coinSendEnabled: boolean("coin_send_enabled").notNull().default(false),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PaymentSettings = typeof paymentSettingsTable.$inferSelect;