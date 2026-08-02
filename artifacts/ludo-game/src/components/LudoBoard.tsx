import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameState, PlayerColor, TRACK, HOME_RUN, START_INDEX, SAFE_CELLS, COLORS } from '../types/ludo';
import { getMovablePieces } from '../hooks/useLudo';
import pawnImg from '@assets/file_000000006c2c81f4af7666db0b572667_1785553183915.png';

interface LudoBoardProps {
  state: GameState;
  onPieceClick: (player: PlayerColor, index: number) => void;
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

function getPieceCellCoords(player: PlayerColor, relPos: number, pieceIndex: number) {
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
    return { r: ha.row + offsets[pieceIndex].r, c: ha.col + offsets[pieceIndex].c };
  }
  if (relPos === 57) {
    const centers: Record<PlayerColor, { r: number; c: number }> = {
      red:    { r: 7,   c: 6.5 },
      green:  { r: 6.5, c: 7   },
      blue:   { r: 7,   c: 7.5 },
      yellow: { r: 7.5, c: 7   },
    };
    return centers[player];
  }
  if (relPos >= 51 && relPos <= 56) {
    const [r, c] = HOME_RUN[player][relPos - 51];
    return { r, c };
  }
  const absIdx = (START_INDEX[player] + relPos) % 51;
  const [r, c] = TRACK[absIdx];
  return { r, c };
}

/** Compute the set of absolute TRACK indices that should glow as trail */
function computeTrailAbsIndices(
  player: PlayerColor,
  steps: number[],
  currentStepIdx: number,
): Set<number> {
  const trail = new Set<number>();
  // Highlight already-visited cells (0..currentStepIdx) that are on the main track
  for (let s = 0; s <= currentStepIdx; s++) {
    const relPos = steps[s];
    if (relPos >= 0 && relPos < 51) {
      const absIdx = (START_INDEX[player] + relPos) % 51;
      trail.add(absIdx);
    }
  }
  return trail;
}

export function LudoBoard({ state, onPieceClick }: LudoBoardProps) {
  const [hoppingPieces, setHoppingPieces] = useState<Set<string>>(new Set());

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
        if (pos === -1 || pos === 57) return;
        const coords = getPieceCellCoords(player, pos, i);
        const key = `${coords.r}-${coords.c}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ player, pieceIndex: i });
      });
    });
    return groups;
  }, [state.pieces]);

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
        background: '#fff',
        borderRadius: '3%',
        overflow: 'hidden',
        border: '4px solid #222',
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
      }}
    >
      {/* ── Background layer: absolute-positioned cells (no CSS Grid) ── */}

      {/* Corner home quadrants (6×6 each) */}
      {homeAreas.map((h) => (
        <div
          key={h.color}
          style={{
            ...cell(h.row, h.col, 6, 6),
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
              ...cell(r, c),
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
              ...cell(r, c),
              background: COLORS[color as PlayerColor].main,
              outline: '1px solid #bbb',
              outlineOffset: '-0.5px',
              zIndex: 1,
            }}
          />
        ))
      )}

      {/* Center finish triangles (3×3) */}
      <div style={{ ...cell(6, 6, 3, 3), zIndex: 2 }}>
        <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0 0, 100% 0, 50% 50%)',       background: COLORS.green.main  }} />
        <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0 0, 0 100%, 50% 50%)',       background: COLORS.red.main    }} />
        <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(100% 0, 100% 100%, 50% 50%)', background: COLORS.blue.main   }} />
        <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0 100%, 100% 100%, 50% 50%)', background: COLORS.yellow.main }} />
      </div>

      {/* ── Pieces layer ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {Object.entries(state.pieces).filter(([pColor]) =>
          state.activePlayers.includes(pColor as PlayerColor)
        ).map(([pColor, positions]) => {
          const player = pColor as PlayerColor;
          return positions.map((pos, i) => {
            const coords = getPieceCellCoords(player, pos, i);
            const isMovable = !state.isAnimating && state.currentPlayer === player && movablePieces.includes(i);

            let stackOffsetX = 0;
            let stackOffsetY = 0;
            if (pos !== -1 && pos !== 57) {
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
            const isHopping = hoppingPieces.has(pieceKey);

            // Check if this is the currently animating piece
            const isAnimatingPiece =
              state.animPiece?.player === player && state.animPiece?.index === i;
            const stepNum = isAnimatingPiece ? state.animPiece!.step + 1 : 0;
            const stepTotal = isAnimatingPiece ? state.animPiece!.total : 0;

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
                  zIndex: isHopping ? 60 : isAnimatingPiece ? 55 : isMovable ? 40 : 20,
                  cursor: isMovable ? 'pointer' : 'default',
                  pointerEvents: isMovable ? 'auto' : 'none',
                  overflow: 'visible',
                }}
                initial={false}
                transition={{
                  type: 'spring',
                  stiffness: 220,
                  damping: 20,
                  mass: 0.75,
                }}
                onLayoutAnimationStart={() =>
                  setHoppingPieces(prev => new Set([...prev, pieceKey]))
                }
                onLayoutAnimationComplete={() =>
                  setHoppingPieces(prev => { const s = new Set(prev); s.delete(pieceKey); return s; })
                }
                onClick={() => { if (isMovable) onPieceClick(player, i); }}
                whileHover={isMovable ? { scale: 1.18 } : {}}
                whileTap={isMovable ? { scale: 0.9 } : {}}
              >
                <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isMovable && (
                    <div className="absolute inset-[-10%] rounded-full movable-ring" />
                  )}

                  {/* Landing dust burst — shows briefly on land */}
                  <AnimatePresence>
                    {isHopping && isAnimatingPiece && (
                      <motion.div
                        key={`dust-${pieceKey}-${stepNum}`}
                        initial={{ scale: 0, opacity: 0.7 }}
                        animate={{ scale: 2.2, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.28, ease: 'easeOut' }}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: '50%',
                          background: `radial-gradient(circle, ${COLORS[player].light}88 0%, transparent 70%)`,
                          pointerEvents: 'none',
                          zIndex: -1,
                        }}
                      />
                    )}
                  </AnimatePresence>

                  <motion.img
                    src={pawnImg}
                    alt={`${player} piece`}
                    className={isMovable && !isHopping ? 'piece-movable' : ''}
                    animate={
                      isHopping
                        ? {
                            y: [0, -34, 8, -4, 0],
                            scale: [1, 1.3, 0.82, 1.08, 1],
                            rotate: [0, -6, 4, -2, 0],
                          }
                        : { y: 0, scale: 1, rotate: 0 }
                    }
                    transition={
                      isHopping
                        ? {
                            duration: 0.38,
                            ease: [0.2, 1, 0.35, 1],
                            times: [0, 0.38, 0.65, 0.82, 1],
                          }
                        : { duration: 0.15 }
                    }
                    style={{
                      width: 42,
                      height: 42,
                      objectFit: 'contain',
                      filter: isHopping
                        ? `${getPawnFilter(player)} drop-shadow(0 10px 12px rgba(0,0,0,0.6))`
                        : isAnimatingPiece
                          ? `${getPawnFilter(player)} drop-shadow(0 4px 8px rgba(0,0,0,0.45))`
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
