/**
 * Admin API — all routes require the admin email (th9610610@gmail.com).
 *
 * GET  /api/admin/stats                   — dashboard overview
 * GET  /api/admin/players                 — paginated player list + search
 * POST /api/admin/players/:uid/adjust     — manually credit/debit coins or cash
 * GET  /api/admin/transactions            — all transactions
 * GET  /api/admin/payment-orders          — all payment orders
 * GET  /api/admin/game-rooms              — game rooms
 * GET  /api/admin/tournaments             — tournaments
 */

import { Router, type IRouter } from "express";
import { desc, eq, ilike, or, sql, count, sum, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  playersTable,
  transactionsTable,
  paymentOrdersTable,
  gameRoomsTable,
  tournamentsTable,
  tournamentRegistrationsTable,
  tournamentTeamsTable,
} from "@workspace/db";
import { requireAdmin } from "../../lib/admin";

const router: IRouter = Router();

/* ─── helpers ──────────────────────────────────────────────────────────────── */
function page(query: Record<string, unknown>) {
  const limit = Math.min(Number(query["limit"]) || 20, 100);
  const offset = Number(query["offset"]) || 0;
  return { limit, offset };
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/admin/stats
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/admin/stats", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const [[players], [revenue], [pendingOrders], [activeRooms]] =
    await Promise.all([
      db.select({ total: count() }).from(playersTable),

      db
        .select({
          totalBDT: sum(paymentOrdersTable.amountBDT),
          totalCoins: sum(playersTable.coins),
        })
        .from(paymentOrdersTable)
        .leftJoin(playersTable, eq(paymentOrdersTable.clerkUserId, playersTable.clerkUserId))
        .where(eq(paymentOrdersTable.status, "completed")),

      db
        .select({ total: count() })
        .from(paymentOrdersTable)
        .where(eq(paymentOrdersTable.status, "pending")),

      db
        .select({ total: count() })
        .from(gameRoomsTable)
        .where(eq(gameRoomsTable.status, "waiting")),
    ]);

  const [[totalCoinsInSystem]] = await Promise.all([
    db
      .select({ totalCoins: sum(playersTable.coins), totalCash: sum(playersTable.cash) })
      .from(playersTable),
  ]);

  const [[txStats]] = await Promise.all([
    db
      .select({
        totalDeposits: count(sql`CASE WHEN type = 'deposit' THEN 1 END`),
        totalCoinPurchases: count(sql`CASE WHEN type = 'coin_purchase' THEN 1 END`),
      })
      .from(transactionsTable),
  ]);

  res.json({
    players: { total: players?.total ?? 0 },
    finance: {
      totalRevenueBDT: Number(revenue?.totalBDT ?? 0),
      totalCoinsInSystem: Number(totalCoinsInSystem?.totalCoins ?? 0),
      totalCashInSystem: Number(totalCoinsInSystem?.totalCash ?? 0),
      pendingOrders: pendingOrders?.total ?? 0,
    },
    activity: {
      activeRooms: activeRooms?.total ?? 0,
      totalDeposits: txStats?.totalDeposits ?? 0,
      totalCoinPurchases: txStats?.totalCoinPurchases ?? 0,
    },
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/admin/players?search=&limit=&offset=
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/admin/players", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const { limit, offset } = page(req.query as Record<string, unknown>);
  const search = (req.query["search"] as string | undefined) ?? "";

  const where = search
    ? or(
        ilike(playersTable.displayName, `%${search}%`),
        ilike(playersTable.clerkUserId, `%${search}%`),
      )
    : undefined;

  const players = await db
    .select()
    .from(playersTable)
    .where(where)
    .orderBy(desc(playersTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(playersTable)
    .where(where);

  res.json({ players, total, limit, offset });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/admin/players/:uid/adjust
   Body: { type: "coins"|"cash", delta: number, note: string }
   ═══════════════════════════════════════════════════════════════════════════ */
router.post("/admin/players/:uid/adjust", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const { uid } = req.params;
  const { type, delta, note } = req.body as {
    type?: string;
    delta?: number;
    note?: string;
  };

  if (!["coins", "cash"].includes(type ?? "")) {
    res.status(400).json({ error: "type must be 'coins' or 'cash'" });
    return;
  }
  if (typeof delta !== "number" || delta === 0) {
    res.status(400).json({ error: "delta must be a non-zero number" });
    return;
  }

  const [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, uid))
    .limit(1);

  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  if (type === "coins") {
    const newCoins = Math.max(0, Number(player.coins) + delta);
    await db
      .update(playersTable)
      .set({ coins: String(newCoins), updatedAt: new Date() })
      .where(eq(playersTable.clerkUserId, uid));

    await db.insert(transactionsTable).values({
      clerkUserId: uid,
      type: delta > 0 ? "admin_credit" : "admin_debit",
      coinsDelta: String(delta),
      cashDelta: "0",
      coinsAfter: String(newCoins),
      cashAfter: player.cash,
      note: note ?? "Admin adjustment",
      meta: { adminAction: true } as any,
      status: "completed",
    });

    res.json({ success: true, newCoins });
  } else {
    const newCash = Math.max(0, Number(player.cash) + delta);
    await db
      .update(playersTable)
      .set({ cash: String(newCash), updatedAt: new Date() })
      .where(eq(playersTable.clerkUserId, uid));

    await db.insert(transactionsTable).values({
      clerkUserId: uid,
      type: delta > 0 ? "admin_credit" : "admin_debit",
      coinsDelta: "0",
      cashDelta: String(delta),
      coinsAfter: player.coins,
      cashAfter: String(newCash),
      note: note ?? "Admin adjustment",
      meta: { adminAction: true } as any,
      status: "completed",
    });

    res.json({ success: true, newCash });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/admin/transactions?limit=&offset=&type=
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/admin/transactions", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const { limit, offset } = page(req.query as Record<string, unknown>);
  const typeFilter = req.query["type"] as string | undefined;

  const where = typeFilter ? eq(transactionsTable.type, typeFilter) : undefined;

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(where)
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(transactionsTable)
    .where(where);

  res.json({ transactions: txs, total, limit, offset });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/admin/payment-orders?status=&limit=&offset=
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/admin/payment-orders", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const { limit, offset } = page(req.query as Record<string, unknown>);
  const statusFilter = req.query["status"] as string | undefined;

  const where = statusFilter
    ? eq(paymentOrdersTable.status, statusFilter)
    : undefined;

  const orders = await db
    .select({
      orderId: paymentOrdersTable.orderId,
      clerkUserId: paymentOrdersTable.clerkUserId,
      gateway: paymentOrdersTable.gateway,
      orderType: paymentOrdersTable.orderType,
      bundleId: paymentOrdersTable.bundleId,
      amountBDT: paymentOrdersTable.amountBDT,
      expectedCoins: paymentOrdersTable.expectedCoins,
      status: paymentOrdersTable.status,
      gatewayRef: paymentOrdersTable.gatewayRef,
      failureReason: paymentOrdersTable.failureReason,
      createdAt: paymentOrdersTable.createdAt,
      completedAt: paymentOrdersTable.completedAt,
      displayName: playersTable.displayName,
    })
    .from(paymentOrdersTable)
    .leftJoin(playersTable, eq(paymentOrdersTable.clerkUserId, playersTable.clerkUserId))
    .where(where)
    .orderBy(desc(paymentOrdersTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(paymentOrdersTable)
    .where(where);

  res.json({ orders, total, limit, offset });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/admin/game-rooms?limit=&offset=
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/admin/game-rooms", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const { limit, offset } = page(req.query as Record<string, unknown>);

  const rooms = await db
    .select()
    .from(gameRoomsTable)
    .orderBy(desc(gameRoomsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(gameRoomsTable);

  res.json({ rooms, total, limit, offset });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/admin/tournaments?limit=&offset=
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/admin/tournaments", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const { limit, offset } = page(req.query as Record<string, unknown>);

  const tournaments = await db
    .select()
    .from(tournamentsTable)
    .orderBy(desc(tournamentsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(tournamentsTable);

  const withCounts = await Promise.all(tournaments.map(async (tournament) => {
    const [{ registrations }] = await db
      .select({ registrations: count() })
      .from(tournamentRegistrationsTable)
      .where(eq(tournamentRegistrationsTable.tournamentId, tournament.id));
    const [{ teams }] = await db
      .select({ teams: count() })
      .from(tournamentTeamsTable)
      .where(eq(tournamentTeamsTable.tournamentId, tournament.id));
    return { ...tournament, registrations, teams };
  }));

  res.json({ tournaments: withCounts, total, limit, offset });
});

const stageSchema = z.enum([
  "group",
  "round-of-128",
  "round-of-64",
  "round-of-32",
  "round-of-16",
  "quarter-final",
  "semi-final",
  "final",
]);
const scheduleItemSchema = z.object({
  id: z.string().min(1),
  stage: stageSchema,
  matchNumber: z.number().int().positive(),
  startsAt: z.string().datetime(),
});
const tournamentConfigSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(["1v1", "2v2"]),
  groupMatchCount: z.number().int().min(1).max(100),
  enabledStages: z.array(stageSchema).min(1),
  groupSchedule: z.array(scheduleItemSchema),
  knockoutSchedule: z.array(scheduleItemSchema),
  allowTeamRename: z.boolean().default(true),
});

router.post("/admin/tournaments", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = tournamentConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid tournament configuration.", details: parsed.error.flatten() });
    return;
  }
  const [tournament] = await db.insert(tournamentsTable).values({
    ...parsed.data,
    status: "open",
  }).returning();
  res.status(201).json({ tournament });
});

router.patch("/admin/tournaments/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = tournamentConfigSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid tournament configuration.", details: parsed.error.flatten() });
    return;
  }
  const [tournament] = await db.update(tournamentsTable).set({
    ...parsed.data,
    updatedAt: new Date(),
  }).where(eq(tournamentsTable.id, req.params.id)).returning();
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found." });
    return;
  }
  res.json({ tournament });
});

router.post("/admin/tournaments/:id/start", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const [tournament] = await db.update(tournamentsTable).set({
    status: "running",
    updatedAt: new Date(),
  }).where(and(
    eq(tournamentsTable.id, req.params.id),
    eq(tournamentsTable.status, "open"),
  )).returning();
  if (!tournament) {
    res.status(409).json({ error: "Tournament not found or already started." });
    return;
  }
  res.json({ tournament });
});

router.get("/admin/tournaments/:id/schedule", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const [tournament] = await db.select().from(tournamentsTable)
    .where(eq(tournamentsTable.id, req.params.id)).limit(1);
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found." });
    return;
  }
  res.json({
    tournamentId: tournament.id,
    groupSchedule: tournament.groupSchedule,
    knockoutSchedule: tournament.knockoutSchedule,
    enabledStages: tournament.enabledStages,
  });
});

export default router;
