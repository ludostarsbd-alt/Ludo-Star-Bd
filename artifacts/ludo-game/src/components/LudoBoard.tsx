import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameState, PlayerColor, TRACK, HOME_RUN, START_INDEX, SAFE_CELLS, COLORS, HOME_ENTRY_POS, HOME_CENTER_POS } from '../types/ludo';
import { getMovablePieces } from '../hooks/useLudo';
import { projectBoardPoint, projectBoardRect, projectCenterSide } from '../lib/ludo-perspective';
import pawnImg from '@assets/file_000000006c2c81f4af7666db0b572667_1785553183915.png';

interface LudoBoardProps {
  state: GameState;
  onPieceClick: (player: PlayerColor, index: number) => void;
  /** Fixed visual perspective captured when the match starts. */
  perspective?: PlayerColor;
}

// Each cell is exactly 1/15 = 6.6667% of the board
const CELL = 100 / 15;

const cell = (row: number, col: number, rowSpan = 1, colSpan = 1) => ({
  position: 'absolute' as const,
  left: `${col * CELL}%`,
  top: `${row * CELL}%`,
  width: `${colSpan * CELL}%`,
  height: `${rowSpan * CELL}%`,
});

function getPawnFilter(color: PlayerColor) {
  switch (color) {
    case 'red':    return 'none';
    case 'green':  return 'hue-rotate(120deg) saturate(1.5)';
    case 'blue':   return 'hue-rotate(220deg) saturate(1.5) brightness(1.2)';
    case 'yellow': return 'hue-rotate(60deg) saturate(2.5) brightness(1.1)';
  }
}

function getPieceCellCoords(
  player: PlayerColor,
  relPos: number,
  pieceIndex: number,
  perspective: PlayerColor,
) {
  let coords: { r: number; c: number };
  if (relPos === -1) {
    const homeOrigins: Record<PlayerColor, { row: number; col: number }> = {
      red:    { row: 0, col: 0 },
      green:  { row: 0, col: 9 },
      blue:   { row: 9, col: 9 },
      yellow: { row: 9, col: 0 },
    };
    const ha = homeOrigins[player];
    const offsets = [
      { r: 1.5, c: 1.5 },
      { r: 1.5, c: 3.5 },
      { r: 3.5, c: 1.5 },
      { r: 3.5, c: 3.5 },
    ];
    coords = { r: ha.row + offsets[pieceIndex].r, c: ha.col + offsets[pieceIndex].c };
  } else if (relPos === HOME_CENTER_POS[player]) {
    const centers: Record<PlayerColor, { r: number; c: number }> = {
      red:    { r: 7,   c: 6.5 },
      green:  { r: 6.5, c: 7   },
      blue:   { r: 7,   c: 7.5 },
      yellow: { r: 7.5, c: 7   },
    };
    coords = centers[player];
  } else {
    const homeEntry = HOME_ENTRY_POS[player];
    if (relPos >= homeEntry && relPos <= homeEntry + 5) {
      const [r, c] = HOME_RUN[player][relPos - homeEntry];
      coords = { r, c };
    } else {
      const absIdx = (START_INDEX[player] + relPos) % 52;
      const [r, c] = TRACK[absIdx];
      coords = { r, c };
    }
  }
  const projected = projectBoardPoint(coords.r, coords.c, perspective);
  return { r: projected.row, c: projected.col };
}

/** Compute the set of absolute TRACK indices that should glow as trail */
function computeTrailAbsIndices(
  player: PlayerColor,
  steps: number[],
  currentStepIdx: number,
): Set<number> {
  const trail = new Set<number>();
  // Highlight already-visited cells (0..currentStepIdx) that are on the main track
  const homeEntry = HOME_ENTRY_POS[player];
  for (let s = 0; s <= currentStepIdx; s++) {
    const relPos = steps[s];
    if (relPos >= 0 && relPos < homeEntry) {
      const absIdx = (START_INDEX[player] + relPos) % 52;
      trail.add(absIdx);
    }
  }
  return trail;
}

export function LudoBoard({ state, onPieceClick, perspective = 'yellow' }: LudoBoardProps) {

  const homeAreas: { color: PlayerColor; row: number; col: number }[] = [
    { color: 'red',    row: 0, col: 0 },
    { color: 'green',  row: 0, col: 9 },
    { color: 'blue',   row: 9, col: 9 },
    { color: 'yellow', row: 9, col: 0 },
  ];

  const groupedPieces = useMemo(() => {
    const groups = new Map<string, Array<{ player: PlayerColor; pieceIndex: number }>>();
    Object.entries(state.pieces).forEach(([pColor, positions]) => {
      const player = pColor as PlayerColor;
      positions.forEach((pos, i) => {
        if (pos === -1 || pos === HOME_CENTER_POS[player]) return;
        // Exclude the animating piece from stacking calculations so it doesn't
        // visually "collide" with stationary pieces it passes through mid-journey.
        if (
          state.animPiece &&
          state.animPiece.player === player &&
          state.animPiece.index === i
        ) return;
        const coords = getPieceCellCoords(player, pos, i, perspective);
        const key = `${coords.r}-${coords.c}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ player, pieceIndex: i });
      });
    });
    return groups;
  }, [state.pieces, state.animPiece, perspective]);

  const movablePieces = useMemo(() => {
    if (!state.diceRolled || state.winner) return [];
    return getMovablePieces(state.pieces, state.currentPlayer, state.diceValue);
  }, [state.pieces, state.currentPlayer, state.diceValue, state.diceRolled, state.winner]);

  // Compute trail cells for the currently animating piece
  const trailAbsIndices = useMemo(() => {
    if (!state.animPiece) return new Set<number>();
    return computeTrailAbsIndices(
      state.animPiece.player,
      state.animPiece.steps,
      state.animPiece.step,
    );
  }, [state.animPiece]);

  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '1 / 1',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'visible',
        borderRadius: '3%',
        border: '4px solid #222',
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
      }}
    >
      {/* ── Background layer: clipped for border-radius corners ── */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: '3%', background: '#fff' }}>
      {/* ── Background cells: absolute-positioned (no CSS Grid) ── */}

      {/* Corner home quadrants (6×6 each) */}
      {homeAreas.map((h) => (
        <div
          key={h.color}
          style={{
            ...(() => {
              const projected = projectBoardRect({ row: h.row, col: h.col, rowSpan: 6, colSpan: 6 }, perspective);
              return cell(projected.row, projected.col, projected.rowSpan, projected.colSpan);
            })(),
            background: COLORS[h.color].main,
            zIndex: 2,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '12%',
              background: '#fff',
              borderRadius: '12%',
            }}
          />
        </div>
      ))}

      {/* Track cells */}
      {TRACK.map(([r, c], i) => {
        const isSafe = SAFE_CELLS.has(i);
        const isTrail = trailAbsIndices.has(i);
        let bg = '#fff';
        let trailColor = '';
        Object.entries(START_INDEX).forEach(([col, si]) => {
          if (si === i) bg = COLORS[col as PlayerColor].main;
        });
        if (isTrail && state.animPiece) {
          trailColor = COLORS[state.animPiece.player].main;
        }
        return (
          <div
            key={`t${i}`}
            style={{
               ...(() => {
                 const projected = projectBoardRect({ row: r, col: c }, perspective);
                 return cell(projected.row, projected.col);
               })(),
              background: bg,
              outline: '1px solid #bbb',
              outlineOffset: '-0.5px',
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {isSafe && (
              <span
                style={{
                  fontSize: 'min(3.2vw, 14px)',
                  lineHeight: 1,
                  color: bg === '#fff' ? '#f4c400' : '#fff',
                  pointerEvents: 'none',
                  position: 'relative',
                  zIndex: 2,
                }}
              >
                ★
              </span>
            )}
            {/* Trail glow overlay */}
            <AnimatePresence>
              {isTrail && trailColor && (
                <motion.div
                  key={`trail-${i}`}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 0.55, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.3 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '20%',
                    background: trailColor,
                    zIndex: 1,
                    pointerEvents: 'none',
                    boxShadow: `0 0 6px 2px ${trailColor}99`,
                  }}
                />
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Home run cells */}
      {Object.entries(HOME_RUN).map(([color, cells]) =>
        cells.map(([r, c], i) => (
          <div
            key={`${color}hr${i}`}
            style={{
               ...(() => {
                 const projected = projectBoardRect({ row: r, col: c }, perspective);
                 return cell(projected.row, projected.col);
               })(),
              background: COLORS[color as PlayerColor].main,
              outline: '1px solid #bbb',
              outlineOffset: '-0.5px',
              zIndex: 1,
            }}
          />
        ))
      )}

      {/* Center finish triangles (3×3) */}
      <div style={{
        ...(() => {
          const projected = projectBoardRect({ row: 6, col: 6, rowSpan: 3, colSpan: 3 }, perspective);
          return cell(projected.row, projected.col, projected.rowSpan, projected.colSpan);
        })(),
        zIndex: 2,
      }}>
        {([
          ['green', 'top'],
          ['blue', 'right'],
          ['yellow', 'bottom'],
          ['red', 'left'],
        ] as const).map(([color, side]) => {
          const visualSide = projectCenterSide(side, perspective);
          const clipPaths = {
            top: 'polygon(0 0, 100% 0, 50% 50%)',
            right: 'polygon(100% 0, 100% 100%, 50% 50%)',
            bottom: 'polygon(0 100%, 100% 100%, 50% 50%)',
            left: 'polygon(0 0, 0 100%, 50% 50%)',
          };
          return (
            <div
              key={color}
              style={{ position: 'absolute', inset: 0, clipPath: clipPaths[visualSide], background: COLORS[color].main }}
            />
          );
        })}
      </div>

      </div>{/* end background layer */}

      {/* ── Pieces layer — overflow visible so jump anim isn't clipped ── */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {Object.entries(state.pieces).filter(([pColor]) =>
          state.activePlayers.includes(pColor as PlayerColor)
        ).map(([pColor, positions]) => {
          const player = pColor as PlayerColor;
          return positions.map((pos, i) => {
            const coords = getPieceCellCoords(player, pos, i, perspective);
            const isMovable = !state.isAnimating && state.currentPlayer === player && movablePieces.includes(i);

            let stackOffsetX = 0;
            let stackOffsetY = 0;
            if (pos !== -1 && pos !== HOME_CENTER_POS[player]) {
              const cellKey = `${coords.r}-${coords.c}`;
              const stack = groupedPieces.get(cellKey);
              if (stack && stack.length > 1) {
                const myIdx = stack.findIndex(s => s.player === player && s.pieceIndex === i);
                if (myIdx >= 0) {
                  stackOffsetX = (myIdx - (stack.length - 1) / 2) * 8;
                  stackOffsetY = (myIdx - (stack.length - 1) / 2) * -4;
                }
              }
            }

            const pieceKey = `${player}-${i}`;

            // Is this the piece currently being stepped through?
            const isAnimatingPiece =
              state.animPiece?.player === player && state.animPiece?.index === i;

            // Key changes on every step → img remounts → hop animation
            // restarts from scratch identically for every single step.
            const currentStep = isAnimatingPiece ? state.animPiece!.step : -1;
            const imgKey = isAnimatingPiece
              ? `${pieceKey}-step-${currentStep}`
              : pieceKey;

            // Is this the final landing step? Only the last step gets the full
            // impact treatment (dust burst, landing arc). Intermediate steps get
            // a light "fly-over" arc so the piece visually clears other pawns.
            const isLastStep =
              isAnimatingPiece &&
              state.animPiece!.step === state.animPiece!.total - 1;

            return (
              <motion.div
                key={pieceKey}
                layoutId={pieceKey}
                style={{
                  position: 'absolute',
                  width: `${CELL}%`,
                  height: `${CELL}%`,
                  top: `${coords.r * CELL}%`,
                  left: `${coords.c * CELL}%`,
                  x: stackOffsetX,
                  y: stackOffsetY,
                  zIndex: isAnimatingPiece ? 200 : isMovable ? 40 : 20,
                  cursor: isMovable ? 'pointer' : 'default',
                  pointerEvents: isMovable ? 'auto' : 'none',
                  overflow: 'visible',
                }}
                initial={false}
                transition={{
                  type: 'tween',
                  duration: 0.28,
                  ease: [0.4, 0, 0.2, 1],
                }}
                onClick={() => { if (isMovable) onPieceClick(player, i); }}
                whileHover={isMovable ? { scale: 1.18 } : {}}
                whileTap={isMovable ? { scale: 0.9 } : {}}
              >
                 <div style={{
                  position: 'relative', width: '100%', height: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isMovable && (
                    <div className="absolute inset-[-10%] rounded-full movable-ring" />
                  )}

                  {/* Dust burst — only on the FINAL landing step, never mid-transit.
                      This prevents the visual "collision" effect when the piece
                      passes through cells occupied by other pawns. */}
                  {isLastStep && (
                    <motion.div
                      key={`dust-${imgKey}`}
                      initial={{ scale: 0, opacity: 0.75 }}
                      animate={{ scale: 2.4, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, ${COLORS[player].light}99 0%, transparent 70%)`,
                        pointerEvents: 'none',
                        zIndex: -1,
                      }}
                    />
                  )}

                  {/*
                    imgKey changes on every step → React remounts this element
                    → animation plays from the very beginning, same every time.

                    Intermediate steps use a high "fly-over" arc so the piece
                    clearly clears any pawns sitting in transit cells.
                    Only the final step gets the full landing bounce.
                  */}
                  <motion.img
                    key={imgKey}
                    src={pawnImg}
                    alt={`${player} piece`}
                    className={isMovable ? 'piece-movable' : ''}
                    initial={isAnimatingPiece
                      ? { y: 0, scale: 1, rotate: 0 }
                      : false
                    }
                    animate={isAnimatingPiece
                      ? isLastStep
                        ? {
                            // Final landing: normal bounce-down arc
                            y: [0, -38, -19, 0],
                            scale: [1, 1.25, 1.1, 1],
                            rotate: [0, -6, 3, 0],
                          }
                        : {
                            // Intermediate step: high fly-over arc, lands lightly
                            // The bigger peak (-58) visually clears other pawns
                            y: [0, -58, -30, -8],
                            scale: [1, 1.15, 1.05, 1],
                            rotate: [0, -4, 2, 0],
                          }
                      : { y: 0, scale: 1, rotate: 0 }
                    }
                    transition={isAnimatingPiece
                      ? {
                          duration: 0.38,
                          ease: [0.2, 1, 0.35, 1],
                          times: [0, 0.38, 0.72, 1],
                        }
                      : { duration: 0.15 }
                    }
                    style={{
                      width: 42,
                      height: 42,
                      objectFit: 'contain',
                      filter: isAnimatingPiece
                        ? `${getPawnFilter(player)} drop-shadow(0 10px 14px rgba(0,0,0,0.65))`
                        : getPawnFilter(player),
                      mixBlendMode: 'multiply',
                    }}
                  />

                </div>
              </motion.div>
            );
          });
        })}
      </div>
    </div>
  );
}
