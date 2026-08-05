import { Router, type IRouter } from "express";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  playersTable,
  tournamentsTable,
  tournamentRegistrationsTable,
  tournamentTeamsTable,
  teamInvitationsTable,
} from "@workspace/db";
import { requireAuth } from "../../lib/auth";

const router: IRouter = Router();

async function activeTournament() {
  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(inArray(tournamentsTable.status, ["open", "running"]))
    .limit(1);
  return tournament ?? null;
}

async function activeRegistration(userId: string) {
  const tournament = await activeTournament();
  if (!tournament) return null;
  const [registration] = await db
    .select()
    .from(tournamentRegistrationsTable)
    .where(and(
      eq(tournamentRegistrationsTable.tournamentId, tournament.id),
      eq(tournamentRegistrationsTable.clerkUserId, userId),
    ))
    .limit(1);
  return registration ? { tournament, registration } : null;
}

router.get("/tournament/config", async (_req, res): Promise<void> => {
  const tournament = await activeTournament();
  if (!tournament) {
    res.status(404).json({ error: "No active tournament." });
    return;
  }
  res.json({
    id: tournament.id,
    name: tournament.name,
    type: tournament.type,
    status: tournament.status,
    groupMatchCount: tournament.groupMatchCount,
    enabledStages: tournament.enabledStages,
    format: tournament.format,
    participantCount: tournament.participantCount,
    groupCount: tournament.groupCount,
    entryStage: tournament.entryStage,
    groupSchedule: tournament.groupSchedule,
    knockoutSchedule: tournament.knockoutSchedule,
    allowTeamRename: tournament.allowTeamRename,
  });
});

router.get("/tournament/players/search", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    res.json({ players: [] });
    return;
  }
  const pattern = `%${q}%`;
  const players = await db
    .select({
      playerId: playersTable.id,
      clerkUserId: playersTable.clerkUserId,
      displayName: playersTable.displayName,
    })
    .from(playersTable)
    .where(or(
      ilike(playersTable.displayName, pattern),
      ilike(playersTable.clerkUserId, pattern),
      sql`${playersTable.id}::text ILIKE ${pattern}`,
    ))
    .limit(10);
  res.json({ players: players.filter((player) => player.clerkUserId !== userId) });
});

router.post("/tournament/team", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = z.object({ teamName: z.string().trim().min(2).max(40).optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Team name must be between 2 and 40 characters." });
    return;
  }
  const ctx = await activeRegistration(userId);
  if (!ctx) {
    res.status(404).json({ error: "Join the active tournament first." });
    return;
  }
  if (ctx.tournament.type !== "2v2") {
    res.status(409).json({ error: "This tournament is for individual players." });
    return;
  }
  if (ctx.tournament.status === "running") {
    res.status(409).json({ error: "Team creation is closed after the tournament starts." });
    return;
  }
  if (ctx.registration.teamId) {
    res.status(409).json({ error: "You already belong to a team." });
    return;
  }
  const [team] = await db.insert(tournamentTeamsTable).values({
    tournamentId: ctx.tournament.id,
    name: parsed.data.teamName || `${ctx.registration.displayName} Team`,
    captainClerkUserId: userId,
    captainName: ctx.registration.displayName,
  }).returning();
  await db.update(tournamentRegistrationsTable)
    .set({ teamId: team.id, updatedAt: new Date() })
    .where(eq(tournamentRegistrationsTable.id, ctx.registration.id));
  res.status(201).json({ team });
});

router.post("/tournament/team/invite", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = z.object({ inviteeClerkUserId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a player to invite." });
    return;
  }
  const ctx = await activeRegistration(userId);
  if (!ctx?.registration.teamId) {
    res.status(409).json({ error: "Create a team before sending an invitation." });
    return;
  }
  const [team] = await db.select().from(tournamentTeamsTable).where(eq(tournamentTeamsTable.id, ctx.registration.teamId)).limit(1);
  if (!team || team.captainClerkUserId !== userId || team.partnerClerkUserId) {
    res.status(409).json({ error: "Only the captain can invite one partner." });
    return;
  }
  if (parsed.data.inviteeClerkUserId === userId) {
    res.status(400).json({ error: "You cannot invite yourself." });
    return;
  }
  const [player] = await db.select().from(playersTable)
    .where(eq(playersTable.clerkUserId, parsed.data.inviteeClerkUserId)).limit(1);
  if (!player) {
    res.status(404).json({ error: "Player not found." });
    return;
  }
  const [existing] = await db.select().from(teamInvitationsTable).where(and(
    eq(teamInvitationsTable.teamId, team.id),
    eq(teamInvitationsTable.inviteeClerkUserId, player.clerkUserId),
    eq(teamInvitationsTable.status, "pending"),
  )).limit(1);
  if (existing) {
    res.status(409).json({ error: "Invitation already sent." });
    return;
  }
  const [invitation] = await db.insert(teamInvitationsTable).values({
    tournamentId: ctx.tournament.id,
    teamId: team.id,
    inviterClerkUserId: userId,
    inviteeClerkUserId: player.clerkUserId,
    inviterName: team.captainName,
    inviteeName: player.displayName,
  }).returning();
  res.status(201).json({ invitation });
});

router.get("/tournament/team/invitations", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const invitations = await db.select().from(teamInvitationsTable)
    .where(or(
      eq(teamInvitationsTable.inviteeClerkUserId, userId),
      eq(teamInvitationsTable.inviterClerkUserId, userId),
    ));
  res.json({ invitations });
});

router.post("/tournament/team/invitations/:id/respond", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = z.object({ accept: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose accept or reject." });
    return;
  }
  const [invitation] = await db.select().from(teamInvitationsTable)
    .where(and(
      eq(teamInvitationsTable.id, req.params.id),
      eq(teamInvitationsTable.inviteeClerkUserId, userId),
      eq(teamInvitationsTable.status, "pending"),
    )).limit(1);
  if (!invitation) {
    res.status(404).json({ error: "Invitation not found or already answered." });
    return;
  }
  if (!parsed.data.accept) {
    const [updated] = await db.update(teamInvitationsTable)
      .set({ status: "rejected", respondedAt: new Date() })
      .where(eq(teamInvitationsTable.id, invitation.id)).returning();
    res.json({ invitation: updated, accepted: false });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [team] = await tx.select().from(tournamentTeamsTable)
      .where(eq(tournamentTeamsTable.id, invitation.teamId)).limit(1);
    if (!team || team.partnerClerkUserId) throw new Error("That team already has a partner.");
    const [inviteeReg] = await tx.select().from(tournamentRegistrationsTable).where(and(
      eq(tournamentRegistrationsTable.tournamentId, invitation.tournamentId),
      eq(tournamentRegistrationsTable.clerkUserId, userId),
    )).limit(1);
    if (inviteeReg?.teamId) throw new Error("You already belong to another team.");
    const [updatedTeam] = await tx.update(tournamentTeamsTable).set({
      partnerClerkUserId: userId,
      partnerName: invitation.inviteeName,
      status: "ready",
      updatedAt: new Date(),
    }).where(eq(tournamentTeamsTable.id, team.id)).returning();
    if (inviteeReg) {
      await tx.update(tournamentRegistrationsTable).set({ teamId: team.id, updatedAt: new Date() })
        .where(eq(tournamentRegistrationsTable.id, inviteeReg.id));
    } else {
      await tx.insert(tournamentRegistrationsTable).values({
        tournamentId: invitation.tournamentId,
        clerkUserId: userId,
        displayName: invitation.inviteeName,
        teamId: team.id,
        status: "waiting",
      });
    }
    await tx.update(teamInvitationsTable).set({ status: "accepted", respondedAt: new Date() })
      .where(eq(teamInvitationsTable.id, invitation.id));
    return updatedTeam;
  }).catch((error: unknown) => {
    throw error;
  });
  res.json({ accepted: true, team: result });
});

router.patch("/tournament/team", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = z.object({ name: z.string().trim().min(2).max(40) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Team name must be between 2 and 40 characters." });
    return;
  }
  const ctx = await activeRegistration(userId);
  if (!ctx?.registration.teamId || !ctx.tournament.allowTeamRename) {
    res.status(409).json({ error: "Team renaming is not available." });
    return;
  }
  const [team] = await db.update(tournamentTeamsTable).set({ name: parsed.data.name, updatedAt: new Date() })
    .where(and(
      eq(tournamentTeamsTable.id, ctx.registration.teamId),
      or(eq(tournamentTeamsTable.captainClerkUserId, userId), eq(tournamentTeamsTable.partnerClerkUserId, userId)),
    )).returning();
  if (!team) {
    res.status(403).json({ error: "You are not part of this team." });
    return;
  }
  res.json({ team });
});

export default router;