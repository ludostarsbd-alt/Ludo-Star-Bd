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
  [7,0],
];

export const HOME_RUN: Record<PlayerColor, number[][]> = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  green:  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  blue:   [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  yellow: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
};

export const START_INDEX: Record<PlayerColor, number> = { red: 0, green: 13, blue: 26, yellow: 39 };

export const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export const COLORS: Record<PlayerColor, { main: string; light: string; dark: string }> = {
  red:    { main: '#e0221c', light: '#ff6b63', dark: '#8f0f0b' },
  green:  { main: '#1f9e3a', light: '#6fe084', dark: '#0f5f20' },
  blue:   { main: '#1f5fd6', light: '#6fa2ff', dark: '#0d2f7a' },
  yellow: { main: '#e3b400', light: '#ffe066', dark: '#8a6c00' },
};
