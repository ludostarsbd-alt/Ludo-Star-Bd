import {
  pgTable, uuid, text, numeric, integer, timestamp, jsonb, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One row per payment attempt — created BEFORE the player is redirected
 * to the payment gateway. The wallet is only credited when the gateway
 * confirms success and we verify that confirmation server-side.
 *
 * status lifecycle:
 *   pending     → order created, player has not yet paid
 *   processing  → webhook received, verification in progress
 *   completed   → gateway confirmed, wallet credited
 *   failed      → gateway reported failure or verification failed
 *   expired     → player never completed payment within expiry window
 *
 * gateway:
 *   bkash | nagad | sslcommerz
 *
 * orderType:
 *   coin_bundle  → buy an in-app coin pack
 *   cash_deposit → add real BDT to cash balance
 */
export const paymentOrdersTable = pgTable(
  "payment_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Our own order ID (sent to gateway as merchantInvoiceNumber / orderId). */
    orderId: text("order_id").notNull().unique(),

    clerkUserId: text("clerk_user_id").notNull(),

    gateway: text("gateway").notNull(), // bkash | nagad | sslcommerz
    orderType: text("order_type").notNull(), // coin_bundle | cash_deposit

    /** For coin_bundle orders: which bundle the player is buying. */
    bundleId: text("bundle_id"),
    /** Exact BDT amount this order should collect. Server-derived, never from client. */
    amountBDT: numeric("amount_bdt", { precision: 10, scale: 2 }).notNull(),
    /** For coin_bundle: how many coins to credit on success. */
    expectedCoins: integer("expected_coins"),

    status: text("status").notNull().default("pending"),

    /**
     * ID returned by the gateway when we create the payment
     * (bKash paymentID, Nagad merchantOrderId, SSLCommerz tran_id).
     * Set after gateway initiation succeeds.
     */
    gatewayPaymentId: text("gateway_payment_id"),

    /**
     * Final transaction reference from the gateway after the user pays
     * (bKash trxID, Nagad bankTxnId, SSLCommerz bank_tran_id).
     * Set after webhook / execute confirmation.
     */
    gatewayRef: text("gateway_ref"),

    /** Raw gateway response stored for audit trail. */
    gatewayResponse: jsonb("gateway_response"),

    /** How long until this order is considered expired (default 15 min). */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    failureReason: text("failure_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    webhookReceivedAt: timestamp("webhook_received_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("payment_orders_gateway_ref_idx").on(t.gatewayRef),
  ],
);

export const insertPaymentOrderSchema = createInsertSchema(paymentOrdersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPaymentOrder = z.infer<typeof insertPaymentOrderSchema>;
export type PaymentOrder = typeof paymentOrdersTable.$inferSelect;
