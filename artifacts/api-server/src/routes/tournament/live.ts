import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { tournamentsTable } from "@workspace/db";
import { requireAuth } from "../../lib/auth";
import {
  liveStatusForSchedule,
  scheduleForStage,
  type LiveTournamentStage,
} from "../../lib/tournament-live";
import { getSpectatorCount } from "../../lib/websocket";

const router: IRouter = Router();
const STAGES: LiveTournamentStage[] = ["round-of-128", "round-of-32"];

router.get("/tournament/live", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(inArray(tournamentsTable.status, ["open", "running"]))
    .limit(1);

  if (!tournament) {
    res.status(404).json({ error: "No active tournament." });
    return;
  }

  const requestedStage = req.query.stage;
  const enabledStages = Array.isArray(tournament.enabledStages)
    ? tournament.enabledStages
    : [];
  const stage =
    typeof requestedStage === "string" && STAGES.includes(requestedStage as LiveTournamentStage)
      ? (requestedStage as LiveTournamentStage)
      : STAGES.find((candidate) => enabledStages.includes(candidate)) ?? null;

  if (!stage || !enabledStages.includes(stage)) {
    res.status(409).json({ error: "This tournament stage is not live yet." });
    return;
  }

  const schedule = scheduleForStage(tournament.knockoutSchedule, stage);
  const now = Date.now();
  const matches = schedule.map((item) => ({
    ...item,
    status: liveStatusForSchedule(item, schedule, now),
    spectatorCount: getSpectatorCount(`${tournament.id}:${item.id}`),
  }));

  res.json({
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    stage,
    stageLabel: stage === "round-of-128" ? "Round of 128" : "Round of 32",
    matches,
    currentMatchId:
      matches.find((match) => match.status === "live")?.id ??
      matches.find((match) => match.status === "upcoming")?.id ??
      matches[matches.length - 1]?.id ??
      null,
    serverTime: new Date(now).toISOString(),
  });
});

export default router;