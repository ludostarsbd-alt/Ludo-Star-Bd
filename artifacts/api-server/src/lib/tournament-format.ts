export const KNOCKOUT_ROUNDS = [
  "round-of-128",
  "round-of-64",
  "round-of-32",
  "round-of-16",
  "quarter-final",
  "semi-final",
  "final",
] as const;

export type KnockoutRound = (typeof KNOCKOUT_ROUNDS)[number];
export type TournamentFormat = "direct-knockout" | "group-stage";

const DIRECT_ENTRY_STAGES: Array<{ maxParticipants: number; stage: KnockoutRound }> = [
  { maxParticipants: 2, stage: "final" },
  { maxParticipants: 4, stage: "semi-final" },
  { maxParticipants: 8, stage: "quarter-final" },
  { maxParticipants: 16, stage: "round-of-16" },
  { maxParticipants: 32, stage: "round-of-32" },
  { maxParticipants: 64, stage: "round-of-64" },
  { maxParticipants: 128, stage: "round-of-128" },
];

export type ResolvedTournamentFormat = {
  format: TournamentFormat;
  participantCount: number;
  groupCount: number;
  entryStage: KnockoutRound;
  requiredStage: KnockoutRound;
};

/**
 * Resolve the bracket from the locked entrant count.
 *
 * Two entrants play the final directly. Larger small tournaments start in the
 * smallest bracket that can contain every entrant. Above 128 entrants, the
 * tournament becomes a 32-group league and each group winner enters R32.
 */
export function resolveTournamentFormat(
  participantCount: number,
): ResolvedTournamentFormat | null {
  if (!Number.isInteger(participantCount) || participantCount < 2) return null;

  if (participantCount > 128) {
    return {
      format: "group-stage",
      participantCount,
      groupCount: 32,
      entryStage: "round-of-32",
      requiredStage: "round-of-32",
    };
  }

  const entry = DIRECT_ENTRY_STAGES.find(({ maxParticipants }) => participantCount <= maxParticipants);
  if (!entry) return null;

  return {
    format: "direct-knockout",
    participantCount,
    groupCount: 0,
    entryStage: entry.stage,
    requiredStage: entry.stage,
  };
}

export function roundLabel(round: KnockoutRound): string {
  return {
    "round-of-128": "Round of 128",
    "round-of-64": "Round of 64",
    "round-of-32": "Round of 32",
    "round-of-16": "Round of 16",
    "quarter-final": "Quarter Final",
    "semi-final": "Semi Final",
    final: "Final",
  }[round];
}