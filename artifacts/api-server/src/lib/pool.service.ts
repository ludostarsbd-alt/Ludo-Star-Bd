/**
 * pool.service.ts
 * Pool assignment logic — hidden from players.
 *
 * The system automatically assigns each player to a pool when they play their
 * first league match. Pool size is chosen randomly from [4, 8, 12, 16].
 * Players never see their pool ID, pool size, or other pool members.
 */

import { eq, and, lt } from "drizzle-orm";
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
