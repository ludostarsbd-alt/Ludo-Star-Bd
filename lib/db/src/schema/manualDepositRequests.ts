/**
 * Manual deposit requests.
 *
 * Flow:
 *   1. User pays via bKash/Nagad/Rocket outside the app
 *   2. User submits: amount, payment method, their payment number, trxId
 *   3. Admin reviews and approves or rejects
 *   4. On approval → wallet cash balance is credited atomically
 *
 * status:
 *   pending   → waiting for admin review
 *   approved  → admin approved, wallet credited
 *   rejected  → admin rejected with a reason
 */

import {
  pgTable, uuid, text, numeric, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const manualDepositRequestsTable = pgTable(
  "manual_deposit_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    clerkUserId: text("clerk_user_id").notNull(),
    displayName: text("display_name").notNull(),  // denormalised for admin view

    /** How much the user claims to have sent (in BDT). */
    amountBDT: numeric("amount_bdt", { precision: 10, scale: 2 }).notNull(),

    /** bKash | Nagad | Rocket | Upay | other */
    paymentMethod: text("payment_method").notNull(),

    /** The user's own number they sent FROM */
    senderNumber: text("sender_number").notNull(),

    /** Transaction ID / reference number provided by the payment app */
    trxId: text("trx_id").notNull(),

    /** User's optional note (screenshot description etc.) */
    userNote: text("user_note"),

    status: text("status").notNull().default("pending"), // pending | approved | rejected

    /** Set when admin acts */
    adminNote: text("admin_note"),
    reviewedBy: text("reviewed_by"),   // admin clerkUserId
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A gateway transaction reference can only represent one deposit, even
    // when two submit requests arrive concurrently.
    uniqueIndex("manual_deposit_requests_trx_id_idx").on(t.trxId),
  ],
);

export const insertManualDepositSchema = createInsertSchema(manualDepositRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertManualDeposit = z.infer<typeof insertManualDepositSchema>;
export type ManualDepositRequest = typeof manualDepositRequestsTable.$inferSelect;

/** Payment method options shown in the UI */
export const PAYMENT_METHODS = [
  { id: "bkash",  label: "bKash",  color: "#E2136E", emoji: "💗" },
  { id: "nagad",  label: "Nagad",  color: "#F05A28", emoji: "🧡" },
  { id: "rocket", label: "Rocket", color: "#8B5CF6", emoji: "💜" },
  { id: "upay",   label: "Upay",   color: "#0EA5E9", emoji: "💙" },
  { id: "other",  label: "অন্যান্য", color: "#6B7280", emoji: "💳" },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];
