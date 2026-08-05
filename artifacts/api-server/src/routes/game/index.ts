/**
 * Game room HTTP routes
 *
 * POST /api/game/rooms              — create a new room
 * GET  /api/game/rooms/:code        — get room by code
 * POST /api/game/rooms/:code/join   — join a room by code
 * POST /api/game/rooms/:code/leave  — leave a room
 * GET  /api/game/rooms/:code/state  — get live game state
 */

import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { gameRoomsTable, playersTable } from "@workspace/db";
import { requireAuth } from "../../lib/auth";
import type { RoomSeat } from "@workspace/db";

const COLORS = ["red", "green", "blue", "yellow"] as const;

const router: IRouter = Router();

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/* ── POST /api/game/rooms ─────────────────────────────────────────────────── */

router.post("/game/rooms", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const {
    mode = "classic",
    entryType = "free",
    entryFee = "0",
    isNearby = false,
    powerSixEnabled = false,
  } = req.body as {
    mode?: string;
    entryType?: string;
    entryFee?: string;
    isNearby?: boolean;
    powerSixEnabled?: boolean;
  };

  const maxPlayers = mode === "quick" ? 2 : 4;

  // Get display name from player profile
  const [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);

  const displayName = player?.displayName ?? "Player";

  // Generate unique code
  let code = generateCode();
  for (let i = 0; i < 5; i++) {
    const existing = await db
      .select({ id: gameRoomsTable.id })
      .from(gameRoomsTable)
      .where(and(eq(gameRoomsTable.code, code), eq(gameRoomsTable.status, "waiting")))
      .limit(1);
    if (!existing.length) break;
    code = generateCode();
  }

  const firstSeat: RoomSeat = {
    clerkUserId: userId,
    displayName,
    color: COLORS[0],
    seatIndex: 0,
    isReady: false,
  };

  const [room] = await db
    .insert(gameRoomsTable)
    .values({
      code,
      creatorId: userId,
      mode,
      maxPlayers,
      powerSixEnabled: Boolean(powerSixEnabled),
      entryType,
      entryFee: String(Number(entryFee) || 0),
      seats: [firstSeat] as any,
    })
    .returning();

  req.log.info({ userId, roomId: room.id, code }, "Room created");
  res.status(201).json({ room });
});

/* ── POST /api/game/matchmaking ───────────────────────────────────────────── */
router.post("/game/matchmaking", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const {
    mode = "quick",
    maxPlayers = 2,
    matchType = "quick-match",
    isNearby = false,
    powerSixEnabled = false,
  } = req.body as {
    mode?: string;
    maxPlayers?: number;
    matchType?: string;
    isNearby?: boolean;
    powerSixEnabled?: boolean;
  };
  const requestedMaxPlayers = Number(maxPlayers) === 4 ? 4 : 2;

  const [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);
  const displayName = player?.displayName ?? "Player";

  const waitingRooms = await db
    .select()
    .from(gameRoomsTable)
    .where(eq(gameRoomsTable.status, "waiting"))
    .limit(50);

  const availableRoom = waitingRooms.find((room) => {
    const seats = (room.seats as RoomSeat[]) ?? [];
    return (
      room.mode === mode &&
      room.maxPlayers === requestedMaxPlayers &&
      room.isNearby === Boolean(isNearby) &&
      room.powerSixEnabled === Boolean(powerSixEnabled) &&
      seats.length < room.maxPlayers &&
      !seats.some((seat) => seat.clerkUserId === userId)
    );
  });

  if (availableRoom) {
    const seats = (availableRoom.seats as RoomSeat[]) ?? [];
    const newSeat: RoomSeat = {
      clerkUserId: userId,
      displayName,
      color: COLORS[seats.length],
      seatIndex: seats.length,
      isReady: false,
    };
    const [updated] = await db
      .update(gameRoomsTable)
      .set({ seats: [...seats, newSeat] as any, updatedAt: new Date() })
      .where(eq(gameRoomsTable.id, availableRoom.id))
      .returning();

    req.log.info({ userId, roomId: updated.id, matchType }, "Player matched into room");
    res.json({ room: updated, matched: true });
    return;
  }

  let code = generateCode();
  for (let i = 0; i < 5; i++) {
    const existing = await db
      .select({ id: gameRoomsTable.id })
      .from(gameRoomsTable)
      .where(eq(gameRoomsTable.code, code))
      .limit(1);
    if (!existing.length) break;
    code = generateCode();
  }

  const firstSeat: RoomSeat = {
    clerkUserId: userId,
    displayName,
    color: COLORS[0],
    seatIndex: 0,
    isReady: false,
  };
  const [room] = await db
    .insert(gameRoomsTable)
    .values({
      code,
      creatorId: userId,
      mode,
      maxPlayers: requestedMaxPlayers,
      isNearby: Boolean(isNearby),
      powerSixEnabled: Boolean(powerSixEnabled),
      seats: [firstSeat] as any,
    })
    .returning();

  req.log.info({ userId, roomId: room.id, matchType }, "Player queued for matchmaking");
  res.status(201).json({ room, matched: false });
});

/* ── GET /api/game/rooms/:code ────────────────────────────────────────────── */

router.get("/game/rooms/:code", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [room] = await db
    .select()
    .from(gameRoomsTable)
    .where(eq(gameRoomsTable.code, req.params.code.toUpperCase()))
    .limit(1);

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  res.json({ room });
});

/* ── POST /api/game/rooms/:code/join ──────────────────────────────────────── */

router.post("/game/rooms/:code/join", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [room] = await db
    .select()
    .from(gameRoomsTable)
    .where(eq(gameRoomsTable.code, req.params.code.toUpperCase()))
    .limit(1);

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  if (room.status !== "waiting") {
    res.status(409).json({ error: "Room is not accepting new players" });
    return;
  }

  const seats = (room.seats as RoomSeat[]) ?? [];

  // Already in room?
  if (seats.some((s) => s.clerkUserId === userId)) {
    res.json({ room, alreadyJoined: true });
    return;
  }

  if (seats.length >= room.maxPlayers) {
    res.status(409).json({ error: "Room is full" });
    return;
  }

  const [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);

  const newSeat: RoomSeat = {
    clerkUserId: userId,
    displayName: player?.displayName ?? "Player",
    color: COLORS[seats.length],
    seatIndex: seats.length,
    isReady: false,
  };

  const updatedSeats = [...seats, newSeat];

  const [updated] = await db
    .update(gameRoomsTable)
    .set({ seats: updatedSeats as any, updatedAt: new Date() })
    .where(eq(gameRoomsTable.id, room.id))
    .returning();

  req.log.info({ userId, roomId: room.id }, "Player joined room");
  res.json({ room: updated, alreadyJoined: false });
});

/* ── POST /api/game/rooms/:code/leave ─────────────────────────────────────── */

router.post("/game/rooms/:code/leave", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [room] = await db
    .select()
    .from(gameRoomsTable)
    .where(eq(gameRoomsTable.code, req.params.code.toUpperCase()))
    .limit(1);

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const seats = (room.seats as RoomSeat[]).filter((s) => s.clerkUserId !== userId);

  // If creator leaves and room is waiting, cancel room
  const newStatus = room.creatorId === userId && seats.length === 0 ? "cancelled" : room.status;

  await db
    .update(gameRoomsTable)
    .set({ seats: seats as any, status: newStatus, updatedAt: new Date() })
    .where(eq(gameRoomsTable.id, room.id));

  req.log.info({ userId, roomId: room.id }, "Player left room");
  res.json({ success: true });
});

/* ── GET /api/game/rooms/:code/state ─────────────────────────────────────── */

router.get("/game/rooms/:code/state", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [room] = await db
    .select()
    .from(gameRoomsTable)
    .where(eq(gameRoomsTable.code, req.params.code.toUpperCase()))
    .limit(1);

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  res.json({
    roomId: room.id,
    code: room.code,
    status: room.status,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    seats: room.seats,
    gameId: room.gameId,
    startedAt: room.startedAt,
    finishedAt: room.finishedAt,
  });
});

export default router;
