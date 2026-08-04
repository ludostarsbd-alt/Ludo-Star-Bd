export type PlayerColor = 'red' | 'green' | 'blue' | 'yellow';
export type PiecePos = number; // -1 to 57

export interface AnimPieceInfo {
  player: PlayerColor;
  index: number;
  step: number;   // 0-based index of the CURRENT step being shown
  total: number;  // total number of steps
  steps: number[]; // all relative positions (one per step)
}

export interface GameState {
  pieces: Record<PlayerColor, PiecePos[]>;
  currentPlayer: PlayerColor;
  diceValue: number | null;
  diceRolled: boolean;
  winner: PlayerColor | null;
  message: string;
  rollingAnim: boolean;
  isAnimating: boolean;
  history: string[];
  playerNames: Record<PlayerColor, string>;
  activePlayers: PlayerColor[];
  animPiece: AnimPieceInfo | null;
  /** টিম মোড চালু আছে কি না */
  teamMode: boolean;
  /** কতবার পরপর ছয় উঠেছে এই চালে (0, 1, 2) */
  consecutiveSixes: number;
  /**
   * Power Six cycle counter per player.
   * -1 = no cycle active (no 6 rolled yet this game by this player)
   *  0 = just rolled a 6, new cycle started (0 non-6 rolls so far)
   *  1–5 = that many non-6 rolls since last 6
   * When it reaches 5 the next roll is forced to be 6.
   */
  powerSixCycleCount: Record<PlayerColor, number>;
}

export const PLAYER_COLORS: PlayerColor[] = ['red', 'yellow', 'blue', 'green'];

export const TRACK = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],
  [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],[6,0],
];

export const HOME_RUN: Record<PlayerColor, number[][]> = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  green:  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  blue:   [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  yellow: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
};

export const START_INDEX: Record<PlayerColor, number> = { red: 0, green: 13, blue: 26, yellow: 39 };

/**
 * The relative position at which a piece leaves the main track and enters
 * its colour's home run.  Red's home-adjacent cell is TRACK[50] (relative 50)
 * so it enters at 51.  For Green/Blue/Yellow the home-adjacent cell is at
 * relative 49, so they enter at 50.
 */
export const HOME_ENTRY_POS: Record<PlayerColor, number> = {
  red:    51,
  green:  51,
  blue:   51,
  yellow: 51,
};

/**
 * The "finished" position for each colour = HOME_ENTRY_POS + 6 (6 home-run
 * cells, then the centre).  Red: 57, others: 56.
 */
export const HOME_CENTER_POS: Record<PlayerColor, number> = {
  red:    56,
  green:  56,
  blue:   56,
  yellow: 56,
};

export const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export const COLORS: Record<PlayerColor, { main: string; light: string; dark: string }> = {
  red:    { main: '#e0221c', light: '#ff6b63', dark: '#8f0f0b' },
  green:  { main: '#1f9e3a', light: '#6fe084', dark: '#0f5f20' },
  blue:   { main: '#1f5fd6', light: '#6fa2ff', dark: '#0d2f7a' },
  yellow: { main: '#e3b400', light: '#ffe066', dark: '#8a6c00' },
};
