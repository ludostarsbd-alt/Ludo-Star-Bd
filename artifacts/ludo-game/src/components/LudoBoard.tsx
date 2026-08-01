import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameState, PlayerColor, TRACK, HOME_RUN, START_INDEX, SAFE_CELLS, COLORS } from '../types/ludo';
import { getMovablePieces } from '../hooks/useLudo';
import pawnImg from '@assets/file_000000006c2c81f4af7666db0b572667_1785553183915.png';

interface LudoBoardProps {
  state: GameState;
  onPieceClick: (player: PlayerColor, index: number) => void;
}

const area = (row: number, col: number, rowSpan = 1, colSpan = 1) => ({
  gridRow: `${row + 1} / span ${rowSpan}`,
  gridColumn: `${col + 1} / span ${colSpan}`,
});

function getPawnFilter(color: PlayerColor) {
  switch (color) {
    case 'red': return 'none';
    case 'green': return 'hue-rotate(120deg) saturate(1.5)';
    case 'blue': return 'hue-rotate(220deg) saturate(1.5) brightness(1.2)';
    case 'yellow': return 'hue-rotate(60deg) saturate(2.5) brightness(1.1)';
  }
}

function getPieceCellCoords(player: PlayerColor, relPos: number, pieceIndex: number): { r: number, c: number, type: string } {
  if (relPos === -1) {
    // In yard
    const homeAreas = {
      red: { row: 0, col: 0 },
      green: { row: 0, col: 9 },
      blue: { row: 9, col: 9 },
      yellow: { row: 9, col: 0 },
    };
    const ha = homeAreas[player];
    // Layout 2x2 inside the 6x6 corner (approx row+2/4, col+2/4)
    const offsets = [
      { r: 1.5, c: 1.5 },
      { r: 1.5, c: 3.5 },
      { r: 3.5, c: 1.5 },
      { r: 3.5, c: 3.5 }
    ];
    return { r: ha.row + offsets[pieceIndex].r, c: ha.col + offsets[pieceIndex].c, type: 'yard' };
  }

  if (relPos === 57) {
    // Center finish
    const centers = {
      red: { r: 7, c: 6.5 },
      green: { r: 6.5, c: 7 },
      blue: { r: 7, c: 7.5 },
      yellow: { r: 7.5, c: 7 },
    };
    return { r: centers[player].r, c: centers[player].c, type: 'center' };
  }

  if (relPos >= 51 && relPos <= 56) {
    const [r, c] = HOME_RUN[player][relPos - 51];
    return { r, c, type: 'homerun' };
  }

  const startIdx = START_INDEX[player];
  const absIdx = (startIdx + relPos) % 51;
  const [r, c] = TRACK[absIdx];
  return { r, c, type: 'track' };
}

export function LudoBoard({ state, onPieceClick }: LudoBoardProps) {
  const homeAreas = [
    { color: 'red' as const, row: 0, col: 0 },
    { color: 'green' as const, row: 0, col: 9 },
    { color: 'blue' as const, row: 9, col: 9 },
    { color: 'yellow' as const, row: 9, col: 0 },
  ];

  // Group pieces by cell to calculate stacking offsets
  const groupedPieces = useMemo(() => {
    const groups = new Map<string, Array<{player: PlayerColor, pieceIndex: number}>>();
    
    Object.entries(state.pieces).forEach(([pColor, positions]) => {
      const player = pColor as PlayerColor;
      positions.forEach((pos, i) => {
        if (pos === -1 || pos === 57) return; // Don't stack yard or center pieces
        const coords = getPieceCellCoords(player, pos, i);
        const key = `${coords.r}-${coords.c}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ player, pieceIndex: i });
      });
    });
    return groups;
  }, [state.pieces]);

  // Determine movable pieces
  const movablePieces = useMemo(() => {
    if (!state.diceRolled || state.winner) return [];
    return getMovablePieces(state.pieces, state.currentPlayer, state.diceValue);
  }, [state.pieces, state.currentPlayer, state.diceValue, state.diceRolled, state.winner]);

  return (
    <div className="relative w-full max-w-full aspect-square bg-white rounded-2xl md:rounded-[3%] overflow-hidden border-[6px] border-slate-900 ludo-shadow p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
      <div 
        className="w-full h-full relative"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(15, 1fr)',
          gridTemplateRows: 'repeat(15, 1fr)',
          gap: '1px',
          background: '#e2e8f0', // grid lines
          border: '1px solid #cbd5e1'
        }}
      >
        {/* Track cells back layer */}
        {TRACK.map(([r, c], i) => {
          const isSafe = SAFE_CELLS.has(i);
          let bg = '#ffffff';
          Object.entries(START_INDEX).forEach(([col, si]) => {
            if (si === i) bg = COLORS[col as PlayerColor].main;
          });
          return (
            <div
              key={`t${i}`}
              className="relative flex items-center justify-center"
              style={{ ...area(r, c), background: bg }}
            >
              {isSafe && (
                <span className="text-xl md:text-2xl drop-shadow-sm pointer-events-none" style={{ color: bg === '#ffffff' ? '#f59e0b' : '#ffffff' }}>★</span>
              )}
            </div>
          );
        })}

        {/* Home run cells */}
        {Object.entries(HOME_RUN).map(([color, cells]) =>
          cells.map(([r, c], i) => (
            <div
              key={`${color}hr${i}`}
              style={{ ...area(r, c), background: COLORS[color as PlayerColor].main }}
            />
          ))
        )}

        {/* Center finish area */}
        <div style={{ ...area(6, 6, 3, 3), position: 'relative', background: '#fff' }}>
          <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0 0, 100% 0, 50% 50%)', background: COLORS.green.main }} />
          <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0 0, 0 100%, 50% 50%)', background: COLORS.red.main }} />
          <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(100% 0, 100% 100%, 50% 50%)', background: COLORS.blue.main }} />
          <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0 100%, 100% 100%, 50% 50%)', background: COLORS.yellow.main }} />
        </div>

        {/* Corner home quadrants (overlayed on top of grid lines) */}
        {homeAreas.map((h) => (
          <div
            key={h.color}
            style={{
              ...area(h.row, h.col, 6, 6),
              background: COLORS[h.color].main,
              position: 'relative',
              zIndex: 10,
            }}
          >
            <div
              className="absolute shadow-inner"
              style={{
                inset: '12%',
                background: '#fff',
                borderRadius: '16%',
              }}
            />
          </div>
        ))}
      </div>

      {/* PIECES RENDER LAYER - Absolute positioning over grid */}
      <div className="absolute inset-2 pointer-events-none">
        {Object.entries(state.pieces).map(([pColor, positions]) => {
          const player = pColor as PlayerColor;
          return positions.map((pos, i) => {
            const coords = getPieceCellCoords(player, pos, i);
            const isMovable = state.currentPlayer === player && movablePieces.includes(i);
            
            // Calculate stacking offsets
            let stackOffsetX = 0;
            let stackOffsetY = 0;
            if (pos !== -1 && pos !== 57) {
              const cellKey = `${coords.r}-${coords.c}`;
              const stack = groupedPieces.get(cellKey);
              if (stack && stack.length > 1) {
                const myIndexInStack = stack.findIndex(s => s.player === player && s.pieceIndex === i);
                if (myIndexInStack >= 0) {
                  // small spread for stacked pieces
                  stackOffsetX = (myIndexInStack - (stack.length-1)/2) * 8;
                  stackOffsetY = (myIndexInStack - (stack.length-1)/2) * -4;
                }
              }
            }

            // In Framer Motion, layoutId allows animating absolute position changes
            return (
              <motion.div
                key={`${player}-${i}`}
                layoutId={`${player}-${i}`}
                className={`absolute ${isMovable ? 'cursor-pointer pointer-events-auto z-40' : 'z-20 pointer-events-none'}`}
                style={{
                  width: '6.66%', // 1/15 of board
                  height: '6.66%',
                  top: `${coords.r * 6.66}%`,
                  left: `${coords.c * 6.66}%`,
                  x: stackOffsetX,
                  y: stackOffsetY,
                }}
                initial={false}
                transition={{ type: 'spring', stiffness: 300, damping: 25, mass: 0.8 }}
                onClick={() => {
                  if (isMovable) onPieceClick(player, i);
                }}
                whileHover={isMovable ? { scale: 1.15, zIndex: 50 } : {}}
                whileTap={isMovable ? { scale: 0.95 } : {}}
              >
                <div className="relative w-full h-full flex items-center justify-center pt-[10%]">
                  {isMovable && (
                    <div className="absolute inset-[-10%] rounded-full movable-ring" />
                  )}
                  <img 
                    src={pawnImg} 
                    alt={`${player} piece`}
                    className="object-contain drop-shadow-xl"
                    style={{ 
                      width: '30px',
                      height: '30px',
                      filter: getPawnFilter(player),
                      mixBlendMode: 'multiply',
                    }}
                  />
                  {/* Highlight core for extra pop */}
                  {isMovable && (
                     <div className="absolute inset-[30%] bg-white rounded-full blur-md opacity-40 z-[-1]" />
                  )}
                </div>
              </motion.div>
            );
          });
        })}
      </div>
    </div>
  );
}
