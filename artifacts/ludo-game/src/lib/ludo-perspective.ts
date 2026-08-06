import type { PlayerColor } from '../types/ludo';

/**
 * Canonical corner order, clockwise from the top-left.
 * The board itself is never rotated; these helpers only project canonical
 * coordinates into a player's fixed visual perspective.
 */
export const CORNER_ORDER_CLOCKWISE: PlayerColor[] = ['red', 'green', 'blue', 'yellow'];

export type BoardRect = {
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
};

/**
 * Number of static counter-clockwise quarter turns represented by the
 * perspective. This is a coordinate mapping, not a CSS transform.
 */
export function getPerspectiveSteps(perspective: PlayerColor): number {
  const playerIndex = CORNER_ORDER_CLOCKWISE.indexOf(perspective);
  return (playerIndex - 3 + 4) % 4;
}

export function projectBoardRect(rect: BoardRect, perspective: PlayerColor): Required<BoardRect> {
  const rowSpan = rect.rowSpan ?? 1;
  const colSpan = rect.colSpan ?? 1;
  const steps = getPerspectiveSteps(perspective);

  switch (steps) {
    case 1:
      return {
        row: 15 - (rect.col + colSpan),
        col: rect.row,
        rowSpan: colSpan,
        colSpan: rowSpan,
      };
    case 2:
      return {
        row: 15 - (rect.row + rowSpan),
        col: 15 - (rect.col + colSpan),
        rowSpan,
        colSpan,
      };
    case 3:
      return {
        row: rect.col,
        col: 15 - (rect.row + rowSpan),
        rowSpan: colSpan,
        colSpan: rowSpan,
      };
    default:
      return { row: rect.row, col: rect.col, rowSpan, colSpan };
  }
}

export function projectBoardPoint(
  row: number,
  col: number,
  perspective: PlayerColor,
): { row: number; col: number } {
  const projected = projectBoardRect({ row, col }, perspective);
  return { row: projected.row, col: projected.col };
}

/**
 * Returns logical colors in visual positions: top-left, top-right,
 * bottom-left, bottom-right. The perspective player's logical home is always
 * the bottom-left position.
 */
export function getVisualCornerOrder(
  perspective: PlayerColor,
): [PlayerColor, PlayerColor, PlayerColor, PlayerColor] {
  const steps = getPerspectiveSteps(perspective);
  // These are the canonical colors that land in visual TL, TR, BL, BR
  // after the same static coordinate projection used by the board.
  const visualCorners: Array<[PlayerColor, PlayerColor, PlayerColor, PlayerColor]> = [
    ['red', 'green', 'yellow', 'blue'],
    ['green', 'blue', 'red', 'yellow'],
    ['blue', 'yellow', 'green', 'red'],
    ['yellow', 'red', 'blue', 'green'],
  ];
  return visualCorners[steps];
}

export type CenterSide = 'top' | 'right' | 'bottom' | 'left';

const CENTER_SIDES: CenterSide[] = ['top', 'right', 'bottom', 'left'];

export function projectCenterSide(side: CenterSide, perspective: PlayerColor): CenterSide {
  const index = CENTER_SIDES.indexOf(side);
  const steps = getPerspectiveSteps(perspective);
  return CENTER_SIDES[(index - steps + 4) % 4];
}