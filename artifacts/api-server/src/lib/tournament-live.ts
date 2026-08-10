import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { notificationsTable, playersTable } from "@workspace/db";
import { emitSocialToUser } from "./websocket";

export type LiveTournamentStage = "round-of-128" | "round-of-32";

export type LiveScheduleItem = {
  id: string;
  stage: LiveTournamentStage;
  matchNumber: number;
  startsAt: string;
};

export async function notifyTournamentStageStarted(
  tournamentId: string,
  stage: LiveTournamentStage,
): Promise<void> {
  const notifications = await db.transaction(async (tx) => {
    // The start endpoint is protected by an open→running claim, but this
    // advisory lock also makes this helper idempotent if another code path
    // invokes it for the same tournament/stage at the same time.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${tournamentId}:${stage}`}))`);
    const [existing] = await tx
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.type, "tournament_stage_started"),
          sql`${notificationsTable.data}->>'tournamentId' = ${tournamentId}`,
          sql`${notificationsTable.data}->>'stage' = ${stage}`,
        ),
      )
      .limit(1);

    if (existing) return [];

    const players = await tx
      .select({ clerkUserId: playersTable.clerkUserId })
      .from(playersTable);
    if (players.length === 0) return [];

    const stageLabel = stage === "round-of-128" ? "R128" : "R32";
    const body = `${stageLabel} Match চলছে — চাইলে Live দেখতে পারেন।`;
    const data = {
      tournamentId,
      stage,
      deepLink: "tournament-live",
    };

    return tx
      .insert(notificationsTable)
      .values(
        players.map((player) => ({
          clerkUserId: player.clerkUserId,
          type: "tournament_stage_started",
          title: `${stageLabel} Match চলছে`,
          body,
          data,
        })),
      )
      .returning();
  });

  for (const notification of notifications) {
    emitSocialToUser(notification.clerkUserId, "social:notification", {
      notification,
    });
  }
}

export function scheduleForStage(
  rawSchedule: unknown,
  stage: LiveTournamentStage,
  now = Date.now(),
): LiveScheduleItem[] {
  const scheduled = Array.isArray(rawSchedule)
    ? rawSchedule
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .filter((item) => item.stage === stage)
        .map((item, index) => ({
          id: typeof item.id === "string" ? item.id : `${stage}-match-${index + 1}`,
          stage,
          matchNumber:
            typeof item.matchNumber === "number" && Number.isInteger(item.matchNumber)
              ? item.matchNumber
              : index + 1,
          startsAt:
            typeof item.startsAt === "string"
              ? item.startsAt
              : new Date(now + index * 120_000).toISOString(),
        }))
    : [];

  if (scheduled.length > 0) {
    return scheduled.sort((a, b) => a.matchNumber - b.matchNumber);
  }
  // No configured schedule means no live matches. Never invent bracket slots
  // that a client could mistake for real tournament activity.
  return [];
}

export function liveStatusForSchedule(
  item: LiveScheduleItem,
  schedule: LiveScheduleItem[],
  now = Date.now(),
): "upcoming" | "live" | "finished" {
  const startsAt = new Date(item.startsAt).getTime();
  if (!Number.isFinite(startsAt) || startsAt > now) return "upcoming";

  const next = schedule.find((candidate) => candidate.matchNumber > item.matchNumber);
  if (next && new Date(next.startsAt).getTime() <= now) return "finished";
  return "live";
}