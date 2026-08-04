/**
 * match.service.ts
 * Pure simulation logic for Ludo tournament matches.
 * No DB calls — just generates deterministic match data that routes then persist.
 */

/* ─── Kill Bonus Tiers ─────────────────────────────────────────────────────── */

/**
 * Based on how far (%) the victim token has progressed on the board when killed.
 * progressPct === 100 means "one step before the finish line".
 */
const KILL_TIERS: { pct: number; bonus: number }[] = [
  { pct: 10,  bonus: 0.10 },
  { pct: 25,  bonus: 0.25 },
  { pct: 40,  bonus: 0.40 },
  { pct: 55,  bonus: 0.55 },
  { pct: 70,  bonus: 0.70 },
  { pct: 85,  bonus: 0.85 },
  { pct: 99,  bonus: 0.99 },
  { pct: 100, bonus: 1.00 }, // one step before finish
];

const AI_NAMES = [
  "Shakil", "Nusrat", "Rakib", "Tanvir", "Mim", "Sabbir",
  "Ayesha", "Farid", "Riya", "Imran", "Sumaiya", "Karim",
  "Sadia", "Rifat", "Taslima", "Nahid", "Parvez", "Sharmin",
  "Hasan", "Bristy", "Sohel", "Tania",
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomKillTier() {
  return randomFrom(KILL_TIERS);
}

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface KillEvent {
  victimName: string;
  progressPct: number;
  bonusAmount: number;
}

export interface SimulatedMatch {
  opponentName: string;
  outcome: "win" | "loss" | "draw";
  basePoints: number;          // +5 win, +2 draw, 0 loss
  kills: KillEvent[];          // tokens the player killed → bonus
  penalties: KillEvent[];      // player's tokens killed  → penalty (same amounts)
  killBonusTotal: number;
  penaltyTotal: number;
  netPoints: number;
}

/* ─── League Match Simulation ──────────────────────────────────────────────── */

/**
 * Simulate a single league match for a player.
 * Win chance 40%, Draw 20%, Loss 40%.
 * 0–2 kill events, 0–2 penalty events per match.
 */
export function simulateLeagueMatch(opponentName?: string): SimulatedMatch {
  const roll = Math.random();
  let outcome: "win" | "loss" | "draw";
  let basePoints: number;

  if (roll < 0.40)      { outcome = "win";  basePoints = 5; }
  else if (roll < 0.60) { outcome = "draw"; basePoints = 2; }
  else                  { outcome = "loss"; basePoints = 0; }

  const name = opponentName ?? randomFrom(AI_NAMES);

  // Generate 0–2 kill bonuses
  const numKills = Math.floor(Math.random() * 3);
  const kills: KillEvent[] = [];
  let killBonusTotal = 0;
  for (let i = 0; i < numKills; i++) {
    const tier = randomKillTier();
    kills.push({ victimName: randomFrom(AI_NAMES), progressPct: tier.pct, bonusAmount: tier.bonus });
    killBonusTotal += tier.bonus;
  }

  // Generate 0–2 penalty events (independent of kills)
  const numPenalties = Math.floor(Math.random() * 3);
  const penalties: KillEvent[] = [];
  let penaltyTotal = 0;
  for (let i = 0; i < numPenalties; i++) {
    const tier = randomKillTier();
    penalties.push({ victimName: name, progressPct: tier.pct, bonusAmount: tier.bonus });
    penaltyTotal += tier.bonus;
  }

  const netPoints = basePoints + killBonusTotal - penaltyTotal;

  return {
    opponentName: name,
    outcome,
    basePoints,
    kills,
    penalties,
    killBonusTotal: round2(killBonusTotal),
    penaltyTotal: round2(penaltyTotal),
    netPoints: round2(netPoints),
  };
}

/* ─── Knockout Match Simulation ────────────────────────────────────────────── */

/**
 * Knockout match: only win or loss (no draws).
 * Win probability 50%.
 */
export function simulateKnockoutMatch(opponentName?: string): {
  opponentName: string;
  outcome: "win" | "loss";
} {
  return {
    opponentName: opponentName ?? randomFrom(AI_NAMES),
    outcome: Math.random() < 0.5 ? "win" : "loss",
  };
}

/* ─── Qualification Threshold ──────────────────────────────────────────────── */

/**
 * Calculate the qualification threshold for a pool.
 * Returns a score between 8.0 and 14.0 (rounded to 2 dp).
 */
export function generateQualificationThreshold(): number {
  return round2(Math.random() * 6 + 8);
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

export function getRandomOpponentName(): string {
  return randomFrom(AI_NAMES);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
