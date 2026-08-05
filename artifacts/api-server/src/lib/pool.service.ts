/**
 * pool.service.ts
 * Pool assignment logic — hidden from players.
 *
 * Large tournaments pre-create balanced pools when the format is locked.
 * Smaller/legacy league flows create pools on first match using a configured
 * fallback size. Players never see their pool ID, pool size, or other members.
 */

import { eq, and, asc, lt } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tournamentPoolsTable,
  poolMembersTable,
  tournamentRegistrationsTable,
  type TournamentPool,
} from "@workspace/db";

const ALLOWED_POOL_SIZES = [4, 8, 12, 16] as const;

function pickPoolSize(): number {
  return ALLOWED_POOL_SIZES[Math.floor(Math.random() * ALLOWED_POOL_SIZES.length)];
}

/**
 * Get or create a pool for the player and assign them to it.
 * Returns the pool record. Idempotent — safe to call multiple times.
 */
export async function assignPlayerToPool(
  tournamentId: string,
  registrationId: string,
  clerkUserId: string,
): Promise<TournamentPool> {
  // If player is already assigned, return their existing pool
  const [existingMember] = await db
    .select({ poolId: poolMembersTable.poolId })
    .from(poolMembersTable)
    .where(eq(poolMembersTable.registrationId, registrationId))
    .limit(1);

  if (existingMember) {
    const [pool] = await db
      .select()
      .from(tournamentPoolsTable)
      .where(eq(tournamentPoolsTable.id, existingMember.poolId))
      .limit(1);
    return pool;
  }

  // In a 2v2 tournament, both registrations represent one team slot. Reuse
  // the captain/partner's pool membership instead of consuming two group slots.
  const [registration] = await db
    .select({ teamId: tournamentRegistrationsTable.teamId })
    .from(tournamentRegistrationsTable)
    .where(eq(tournamentRegistrationsTable.id, registrationId))
    .limit(1);

  if (registration?.teamId) {
    const [teamMember] = await db
      .select({ poolId: poolMembersTable.poolId })
      .from(poolMembersTable)
      .innerJoin(
        tournamentRegistrationsTable,
        eq(poolMembersTable.registrationId, tournamentRegistrationsTable.id),
      )
      .where(eq(tournamentRegistrationsTable.teamId, registration.teamId))
      .limit(1);

    if (teamMember) {
      await db.insert(poolMembersTable).values({
        poolId: teamMember.poolId,
        registrationId,
        clerkUserId,
      });
      await db
        .update(tournamentRegistrationsTable)
        .set({ status: "pool_assigned" })
        .where(eq(tournamentRegistrationsTable.id, registrationId));

      const [pool] = await db
        .select()
        .from(tournamentPoolsTable)
        .where(eq(tournamentPoolsTable.id, teamMember.poolId))
        .limit(1);
      return pool;
    }
  }

  // Try to find an open pool with space
  const [openPool] = await db
    .select()
    .from(tournamentPoolsTable)
    .where(
      and(
        eq(tournamentPoolsTable.tournamentId, tournamentId),
        eq(tournamentPoolsTable.status, "open"),
        lt(tournamentPoolsTable.currentSize, tournamentPoolsTable.poolSize),
      ),
    )
    .orderBy(asc(tournamentPoolsTable.createdAt))
    .limit(1);

  let pool: TournamentPool;

  if (openPool) {
    pool = openPool;
  } else {
    // Create a new pool
    const poolSize = pickPoolSize();
    const [newPool] = await db
      .insert(tournamentPoolsTable)
      .values({ tournamentId, poolSize, currentSize: 0, status: "open" })
      .returning();
    pool = newPool;
  }

  // Add player to pool
  await db.insert(poolMembersTable).values({
    poolId: pool.id,
    registrationId,
    clerkUserId,
  });

  // Increment pool size; mark full if needed
  const newSize = pool.currentSize + 1;
  const newStatus = newSize >= pool.poolSize ? "full" : "open";

  const [updatedPool] = await db
    .update(tournamentPoolsTable)
    .set({ currentSize: newSize, status: newStatus })
    .where(eq(tournamentPoolsTable.id, pool.id))
    .returning();

  // Update registration status
  await db
    .update(tournamentRegistrationsTable)
    .set({ status: "pool_assigned" })
    .where(eq(tournamentRegistrationsTable.id, registrationId));

  return updatedPool;
}

/**
 * Pre-create balanced groups for a large tournament. Group membership is
 * filled into these pools as players start their group matches.
 */
export async function ensureTournamentGroups(
  tournamentId: string,
  participantCount: number,
  groupCount = 32,
): Promise<void> {
  const existing = await db
    .select()
    .from(tournamentPoolsTable)
    .where(eq(tournamentPoolsTable.tournamentId, tournamentId))
    .orderBy(asc(tournamentPoolsTable.createdAt));

  if (existing.length >= groupCount) return;

  const baseSize = Math.floor(participantCount / groupCount);
  const remainder = participantCount % groupCount;
  const missing = Array.from({ length: groupCount - existing.length }, (_, index) => {
    const groupIndex = existing.length + index;
    return {
      tournamentId,
      poolSize: Math.max(1, baseSize + (groupIndex < remainder ? 1 : 0)),
      currentSize: 0,
      status: "open",
    };
  });

  if (missing.length) {
    await db.insert(tournamentPoolsTable).values(missing);
  }
}

/**
 * Get the pool ID for a registration (or null if not yet assigned).
 */
export async function getPoolIdForRegistration(registrationId: string): Promise<string | null> {
  const [member] = await db
    .select({ poolId: poolMembersTable.poolId })
    .from(poolMembersTable)
    .where(eq(poolMembersTable.registrationId, registrationId))
    .limit(1);
  return member?.poolId ?? null;
}
