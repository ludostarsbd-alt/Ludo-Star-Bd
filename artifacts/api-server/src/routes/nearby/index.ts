/**
 * Nearby Match routes
 *
 * POST /api/nearby/update-location   — player updates their GPS location
 * GET  /api/nearby/players           — list players within radiusKm
 * GET  /api/nearby/rooms             — list open rooms near the player's location
 */

import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { playersTable, gameRoomsTable } from "@workspace/db";
import { requireAuth } from "../../lib/auth";

const router: IRouter = Router();

/**
 * Haversine distance in km between two lat/lng pairs.
 * Used client-side for display; server uses the PG formula below.
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── POST /api/nearby/update-location ────────────────────────────────────── */

router.post("/nearby/update-location", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { latitude, longitude } = req.body as { latitude?: number; longitude?: number };

  if (
    latitude == null || longitude == null ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) {
    res.status(400).json({ error: "Valid latitude and longitude are required" });
    return;
  }

  await db
    .update(playersTable)
    .set({
      latitude: String(latitude),
      longitude: String(longitude),
      locationUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(playersTable.clerkUserId, userId));

  req.log.info({ userId, latitude, longitude }, "Location updated");
  res.json({ success: true, latitude, longitude });
});

/* ── GET /api/nearby/players ─────────────────────────────────────────────── */

router.get("/nearby/players", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const radiusKm = Math.min(Number(req.query.radiusKm) || 10, 100);
  const limit = Math.min(Number(req.query.limit) || 30, 100);

  // Get caller's location first
  const [me] = await db
    .select({ latitude: playersTable.latitude, longitude: playersTable.longitude })
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);

  if (!me?.latitude || !me?.longitude) {
    res.status(400).json({ error: "Update your location first via POST /api/nearby/update-location" });
    return;
  }

  const myLat = Number(me.latitude);
  const myLon = Number(me.longitude);

  // Haversine in PG to filter by radius
  const players = await db.execute(
    sql`
      SELECT
        clerk_user_id,
        display_name,
        avatar_url,
        level,
        is_online,
        latitude,
        longitude,
        (
          6371 * 2 * asin(
            sqrt(
              sin(radians(latitude::float - ${myLat}) / 2) ^ 2 +
              cos(radians(${myLat})) * cos(radians(latitude::float)) *
              sin(radians(longitude::float - ${myLon}) / 2) ^ 2
            )
          )
        ) AS distance_km
      FROM players
      WHERE
        clerk_user_id != ${userId}
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND location_updated_at > NOW() - INTERVAL '30 minutes'
        AND (
          6371 * 2 * asin(
            sqrt(
              sin(radians(latitude::float - ${myLat}) / 2) ^ 2 +
              cos(radians(${myLat})) * cos(radians(latitude::float)) *
              sin(radians(longitude::float - ${myLon}) / 2) ^ 2
            )
          )
        ) <= ${radiusKm}
      ORDER BY distance_km ASC
      LIMIT ${limit}
    `,
  );

  res.json({
    players: (players as unknown as any[]).map((p) => ({
      clerkUserId: p.clerk_user_id,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      level: p.level,
      isOnline: p.is_online,
      distanceKm: Math.round(Number(p.distance_km) * 100) / 100,
    })),
    myLocation: { latitude: myLat, longitude: myLon },
    radiusKm,
  });
});

/* ── GET /api/nearby/rooms ───────────────────────────────────────────────── */

router.get("/nearby/rooms", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const radiusKm = Math.min(Number(req.query.radiusKm) || 10, 100);
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const [me] = await db
    .select({ latitude: playersTable.latitude, longitude: playersTable.longitude })
    .from(playersTable)
    .where(eq(playersTable.clerkUserId, userId))
    .limit(1);

  if (!me?.latitude || !me?.longitude) {
    res.status(400).json({ error: "Update your location first" });
    return;
  }

  const myLat = Number(me.latitude);
  const myLon = Number(me.longitude);

  const roomsResult = await db.execute(
    sql`
      SELECT
        id,
        code,
        mode,
        max_players,
        entry_type,
        entry_fee,
        seats,
        latitude,
        longitude,
        created_at,
        (
          6371 * 2 * asin(
            sqrt(
              sin(radians(latitude::float - ${myLat}) / 2) ^ 2 +
              cos(radians(${myLat})) * cos(radians(latitude::float)) *
              sin(radians(longitude::float - ${myLon}) / 2) ^ 2
            )
          )
        ) AS distance_km
      FROM game_rooms
      WHERE
        status = 'waiting'
        AND is_nearby = true
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND (
          6371 * 2 * asin(
            sqrt(
              sin(radians(latitude::float - ${myLat}) / 2) ^ 2 +
              cos(radians(${myLat})) * cos(radians(latitude::float)) *
              sin(radians(longitude::float - ${myLon}) / 2) ^ 2
            )
          )
        ) <= ${radiusKm}
      ORDER BY distance_km ASC
      LIMIT ${limit}
    `,
  );

  res.json({
    rooms: (roomsResult as unknown as any[]).map((r: any) => ({
      id: r.id,
      code: r.code,
      mode: r.mode,
      maxPlayers: r.max_players,
      entryType: r.entry_type,
      entryFee: Number(r.entry_fee),
      seats: r.seats,
      distanceKm: Math.round(Number(r.distance_km) * 100) / 100,
      createdAt: r.created_at,
    })),
    myLocation: { latitude: myLat, longitude: myLon },
    radiusKm,
  });
});

export default router;
