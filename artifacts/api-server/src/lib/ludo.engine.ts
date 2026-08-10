/**
 * ludo.engine.ts
 * Complete Ludo game engine — dice, movement, capture, win detection.
 * Pure functions — no DB calls.
 */

/* ── Constants ─────────────────────────────────────────────────────────────── */

export type PlayerColor = "red" | "green" | "blue" | "yellow";

export const COLORS: PlayerColor[] = ["red", "green", "blue", "yellow"];

/** Where each color's token enters the main board (0-indexed, 0-51). */
const ENTRY: Record<PlayerColor, number> = {
  red: 0,
  green: 13,
  blue: 26,
  yellow: 39,
};

/**
 * The last main-board square BEFORE entering the home column.
 * When a token at this position rolls enough to enter the home column, it does.
 * Red's home column entry is after position 50 (between 50 and 51 going "around").
 */
const HOME_ENTRY: Record<PlayerColor, number> = {
  red: 50,
  green: 11,
  blue: 24,
  yellow: 37,
};

/** Safe squares on the main board (cannot be captured). */
const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

/** Star squares (also safe, visually distinct). */
const STAR_SQUARES = new Set([8, 21, 34, 47]);

/**
 * Token position encoding:
 *   -1          → home base (not on board)
 *   0-51        → main board
 *   100-105     → home column (100 = first step, 105 = last before finish)
 *   106         → finished ✓
 */
export const POS_HOME_BASE = -1;
export const POS_HOME_COL_START = 100;
export const POS_FINISHED = 106;

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface TokenState {
  position: number;   // as encoded above
  /** Number of steps already taken on main board from entry point (0-51 relative to entry). */
  distanceTravelled: number;
}

export interface PlayerState {
  clerkUserId: string;
  displayName: string;
  color: PlayerColor;
  tokens: [TokenState, TokenState, TokenState, TokenState]; // always 4
  isFinished: boolean; // all 4 tokens at POS_FINISHED
}

export interface LudoGameState {
  roomId: string;
  players: PlayerState[];
  currentColorIndex: number;  // index into players[]
  diceValue: number | null;   // null when waiting for roll
  consecutiveSixes: number;
  powerSixEnabled: boolean;
  /**
   * Per-player Power Six cycle:
   * -1 = no 6 has started a cycle yet
   * 0 = the player just rolled a 6
   * 1..5 = that many non-6 rolls since the last 6
   */
  powerSixCycleCount: Record<PlayerColor, number>;
  phase: "rolling" | "moving" | "finished";
  winnerId: string | null;
  winnerColor: PlayerColor | null;
  turnNumber: number;
  lastEvent: GameEvent | null;
}

export interface MoveOption {
  tokenIndex: number;
  fromPos: number;
  toPos: number;
  capturesAt: number | null;  // position where a capture happens (null if no capture)
  entersHomeCol: boolean;
  finishes: boolean;
}

export interface GameEvent {
  type:
    | "dice_rolled"
    | "token_moved"
    | "token_captured"
    | "token_safe"
    | "home_col_entered"
    | "token_finished"
    | "turn_skipped"
    | "player_won"
    | "extra_turn";  // rolled 6
  color: PlayerColor;
  diceValue?: number;
  tokenIndex?: number;
  fromPos?: number;
  toPos?: number;
  capturedColor?: PlayerColor;
  capturedTokenIndex?: number;
  capturedFromPos?: number;
  message: string;
}

/* ── Factory ───────────────────────────────────────────────────────────────── */

export function createInitialState(
  roomId: string,
  players: Array<{ clerkUserId: string; displayName: string; color: PlayerColor }>,
  powerSixEnabled = false,
): LudoGameState {
  const playerStates: PlayerState[] = players.map((p) => ({
    clerkUserId: p.clerkUserId,
    displayName: p.displayName,
    color: p.color,
    tokens: [
      { position: POS_HOME_BASE, distanceTravelled: 0 },
      { position: POS_HOME_BASE, distanceTravelled: 0 },
      { position: POS_HOME_BASE, distanceTravelled: 0 },
      { position: POS_HOME_BASE, distanceTravelled: 0 },
    ],
    isFinished: false,
  }));

  return {
    roomId,
    players: playerStates,
    currentColorIndex: 0,
    diceValue: null,
    consecutiveSixes: 0,
    powerSixEnabled,
    powerSixCycleCount: { red: -1, green: -1, blue: -1, yellow: -1 },
    phase: "rolling",
    winnerId: null,
    winnerColor: null,
    turnNumber: 0,
    lastEvent: null,
  };
}

/* ── Dice ──────────────────────────────────────────────────────────────────── */

export function rollDice(powerSixEnabled = false, cycleCount = -1): number {
  if (powerSixEnabled && cycleCount === 5) return 6;
  return Math.floor(Math.random() * 6) + 1;
}

function updatePowerSixCycle(
  state: LudoGameState,
  color: PlayerColor,
  diceValue: number,
): Record<PlayerColor, number> {
  if (!state.powerSixEnabled) return state.powerSixCycleCount;

  const currentCount = state.powerSixCycleCount[color] ?? -1;
  const next = { ...state.powerSixCycleCount };
  if (diceValue === 6) {
    next[color] = 0;
  } else if (currentCount >= 0) {
    next[color] = currentCount + 1;
  }
  return next;
}

/* ── Movement helpers ──────────────────────────────────────────────────────── */

/**
 * Given a color and a current main-board absolute position,
 * how many steps has this token travelled from its entry point?
 */
function distanceFromEntry(color: PlayerColor, absPos: number): number {
  const entry = ENTRY[color];
  return (absPos - entry + 52) % 52;
}

/**
 * Calculate destination position for a token that is on the main board at
 * `absPos`, belonging to `color`, rolling `steps`.
 *
 * Returns:
 *   null            → invalid (would overshoot home column)
 *   number          → new position (main board 0-51, home col 100-105, or 106=done)
 */
function calculateMainBoardMove(
  color: PlayerColor,
  token: TokenState,
  steps: number,
): number | null {
  const homeEntryAbs = HOME_ENTRY[color];
  const entry = ENTRY[color];
  const distHome = (homeEntryAbs - entry + 52) % 52; // distance from entry to home col mouth

  const currentDist = token.distanceTravelled;
  const newDist = currentDist + steps;

  if (newDist <= distHome) {
    // Still on main board
    const newAbs = (entry + newDist) % 52;
    return newAbs;
  }

  // Entering or traversing home column
  const homeColSteps = newDist - distHome - 1; // 0 = first home col square
  const homeColPos = POS_HOME_COL_START + homeColSteps;

  if (homeColPos > POS_FINISHED) return null; // overshoot
  return homeColPos;
}

/**
 * All valid moves the current player can make given a dice value.
 */
export function getValidMoves(state: LudoGameState, diceValue: number): MoveOption[] {
  const player = state.players[state.currentColorIndex];
  const options: MoveOption[] = [];

  for (let ti = 0; ti < 4; ti++) {
    const token = player.tokens[ti];

    // Token already finished
    if (token.position === POS_FINISHED) continue;

    // Token at home base — only a 6 can bring it out
    if (token.position === POS_HOME_BASE) {
      if (diceValue === 6) {
        const entryPos = ENTRY[player.color];
        const capture = findCapture(state, player.color, entryPos);
        options.push({
          tokenIndex: ti,
          fromPos: POS_HOME_BASE,
          toPos: entryPos,
          capturesAt: capture ? entryPos : null,
          entersHomeCol: false,
          finishes: false,
        });
      }
      continue;
    }

    // Token in home column
    if (token.position >= POS_HOME_COL_START) {
      const currentStep = token.position - POS_HOME_COL_START;
      const newStep = currentStep + diceValue;
      if (newStep === POS_FINISHED - POS_HOME_COL_START) {
        // Exact landing at finish
        options.push({
          tokenIndex: ti,
          fromPos: token.position,
          toPos: POS_FINISHED,
          capturesAt: null,
          entersHomeCol: false,
          finishes: true,
        });
      } else if (newStep < POS_FINISHED - POS_HOME_COL_START) {
        options.push({
          tokenIndex: ti,
          fromPos: token.position,
          toPos: POS_HOME_COL_START + newStep,
          capturesAt: null,
          entersHomeCol: false,
          finishes: false,
        });
      }
      // else overshoot — not valid
      continue;
    }

    // Token on main board
    const toPos = calculateMainBoardMove(player.color, token, diceValue);
    if (toPos === null) continue; // overshoot

    const entersHomeCol = toPos >= POS_HOME_COL_START;
    const finishes = toPos === POS_FINISHED;
    const capture = (!entersHomeCol && !finishes) ? findCapture(state, player.color, toPos) : null;

    options.push({
      tokenIndex: ti,
      fromPos: token.position,
      toPos,
      capturesAt: capture ? toPos : null,
      entersHomeCol,
      finishes,
    });
  }

  return options;
}

/** Find if there is an enemy token at `pos` that can be captured. */
function findCapture(
  state: LudoGameState,
  myColor: PlayerColor,
  pos: number,
): { color: PlayerColor; tokenIndex: number } | null {
  if (SAFE_SQUARES.has(pos)) return null;
  if (pos >= POS_HOME_COL_START) return null; // home col is per-player, no captures

  for (const player of state.players) {
    if (player.color === myColor) continue;
    for (let ti = 0; ti < 4; ti++) {
      if (player.tokens[ti].position === pos) {
        return { color: player.color, tokenIndex: ti };
      }
    }
  }
  return null;
}

/* ── State mutation ────────────────────────────────────────────────────────── */

/**
 * Apply a dice roll to the state.
 * Returns the new state + the resulting valid moves.
 * If no valid moves exist, advances the turn automatically.
 */
export function applyDiceRoll(
  state: LudoGameState,
  diceValue: number,
): { state: LudoGameState; moves: MoveOption[]; event: GameEvent } {
  const player = state.players[state.currentColorIndex];

  const event: GameEvent = {
    type: "dice_rolled",
    color: player.color,
    diceValue,
    message: `${player.displayName} rolled ${diceValue}`,
  };
  const powerSixCycleCount = updatePowerSixCycle(state, player.color, diceValue);

  // Third consecutive 6 → forfeited turn
  if (diceValue === 6 && state.consecutiveSixes >= 2) {
    const next = advanceTurn(state, false);
    return {
      state: {
        ...next,
        diceValue,
        powerSixCycleCount,
        consecutiveSixes: 0,
        phase: "rolling",
        lastEvent: {
          type: "turn_skipped",
          color: player.color,
          diceValue,
          message: `${player.displayName}'s turn forfeited (three 6s)`,
        },
      },
      moves: [],
      event,
    };
  }

  const moves = getValidMoves({ ...state, diceValue }, diceValue);

  if (moves.length === 0) {
    // No moves — skip turn
    const next = advanceTurn(state, false);
    return {
      state: {
        ...next,
        diceValue,
        powerSixCycleCount,
        consecutiveSixes: diceValue === 6 ? state.consecutiveSixes + 1 : 0,
        phase: "rolling",
        lastEvent: {
          type: "turn_skipped",
          color: player.color,
          diceValue,
          message: `${player.displayName} has no valid moves`,
        },
      },
      moves: [],
      event,
    };
  }

  return {
    state: {
      ...state,
      diceValue,
      powerSixCycleCount,
      consecutiveSixes: diceValue === 6 ? state.consecutiveSixes + 1 : 0,
      phase: "moving",
      lastEvent: event,
    },
    moves,
    event,
  };
}

/**
 * Apply a player's chosen move.
 * Returns new state (and whether the game is over).
 */
export function applyMove(
  state: LudoGameState,
  tokenIndex: number,
): { state: LudoGameState; event: GameEvent; gameOver: boolean } {
  const diceValue = state.diceValue!;
  const player = state.players[state.currentColorIndex];
  const token = player.tokens[tokenIndex];

  // Find the move option
  const moves = getValidMoves(state, diceValue);
  const move = moves.find((m) => m.tokenIndex === tokenIndex);
  if (!move) {
    throw new Error(`Invalid move: tokenIndex=${tokenIndex}`);
  }

  // Clone state
  const newState: LudoGameState = JSON.parse(JSON.stringify(state));
  const newPlayer = newState.players[newState.currentColorIndex];
  const newToken = newPlayer.tokens[tokenIndex];

  // Update token position
  const fromPos = newToken.position;
  newToken.position = move.toPos;

  // Update distance travelled
  if (move.fromPos === POS_HOME_BASE) {
    newToken.distanceTravelled = 0;
  } else if (move.fromPos < POS_HOME_COL_START) {
    newToken.distanceTravelled += diceValue;
  }
  // (home col tokens don't use distanceTravelled further)

  // Handle capture
  let capturedColor: PlayerColor | undefined;
  let capturedTokenIndex: number | undefined;
  let capturedFromPos: number | undefined;
  if (move.capturesAt !== null) {
    for (const ep of newState.players) {
      if (ep.color === player.color) continue;
      for (let ti = 0; ti < 4; ti++) {
        if (ep.tokens[ti].position === move.capturesAt) {
          capturedFromPos = ep.tokens[ti].position;
          ep.tokens[ti].position = POS_HOME_BASE;
          ep.tokens[ti].distanceTravelled = 0;
          capturedColor = ep.color;
          capturedTokenIndex = ti;
          break;
        }
      }
      if (capturedColor) break;
    }
  }

  // Check if this player has finished
  const allDone = newPlayer.tokens.every((t) => t.position === POS_FINISHED);
  if (allDone) {
    newPlayer.isFinished = true;
  }

  // Check win (first player to finish all tokens)
  const gameOver = allDone;
  if (gameOver) {
    newState.phase = "finished";
    newState.winnerId = player.clerkUserId;
    newState.winnerColor = player.color;
  }

  // Build event
  let eventType: GameEvent["type"] = "token_moved";
  let message = `${player.displayName} moved token ${tokenIndex + 1}`;
  if (capturedColor) {
    eventType = "token_captured";
    message += ` and captured ${capturedColor}'s token!`;
  }
  if (move.entersHomeCol) {
    eventType = "home_col_entered";
    message += " (entering home stretch)";
  }
  if (move.finishes) {
    eventType = "token_finished";
    message += " — token finished!";
  }
  if (gameOver) {
    eventType = "player_won";
    message = `${player.displayName} wins the game! 🎉`;
  }

  const event: GameEvent = {
    type: eventType,
    color: player.color,
    diceValue,
    tokenIndex,
    fromPos,
    toPos: move.toPos,
    capturedColor,
    capturedTokenIndex,
    capturedFromPos,
    message,
  };

  newState.lastEvent = event;
  newState.turnNumber += 1;

  // Advance turn (extra turn on 6 or on capture)
  const extraTurn = diceValue === 6 || capturedColor !== undefined;
  if (!gameOver) {
    const next = advanceTurn(newState, extraTurn);
    return { state: { ...next, phase: "rolling", diceValue: null }, event, gameOver: false };
  }

  return { state: newState, event, gameOver: true };
}

/* ── Turn management ───────────────────────────────────────────────────────── */

function advanceTurn(state: LudoGameState, samePlayer: boolean): LudoGameState {
  if (samePlayer) {
    return { ...state, consecutiveSixes: state.diceValue === 6 ? state.consecutiveSixes : 0 };
  }
  // Move to next active (non-finished) player
  let next = state.currentColorIndex;
  for (let i = 1; i <= state.players.length; i++) {
    next = (state.currentColorIndex + i) % state.players.length;
    if (!state.players[next].isFinished) break;
  }
  return { ...state, currentColorIndex: next, consecutiveSixes: 0 };
}

/* ── Utility ───────────────────────────────────────────────────────────────── */

export function getCurrentPlayer(state: LudoGameState): PlayerState {
  return state.players[state.currentColorIndex];
}

export function isSafeSquare(pos: number): boolean {
  return SAFE_SQUARES.has(pos);
}

export function isStarSquare(pos: number): boolean {
  return STAR_SQUARES.has(pos);
}
