import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LudoBoard } from './LudoBoard';
import { DiceDisplay } from './DiceDisplay';
import { useLudo } from '../hooks/useLudo';
import { COLORS, PlayerColor } from '../types/ludo';
import { Trophy, RefreshCw } from 'lucide-react';

/* ── Player box: 150×55px, holds the mini dice only when active ── */
function PlayerBox({
  color,
  isActive,
  diceValue,
  rolling,
  canRoll,
  onRoll,
}: {
  color: PlayerColor;
  isActive: boolean;
  diceValue: number | null;
  rolling: boolean;
  canRoll: boolean;
  onRoll: () => void;
}) {
  return (
    <motion.div
      animate={{ scale: isActive ? 1.05 : 1 }}
      transition={{ duration: 0.25 }}
      style={{
        width: 150,
        height: 55,
        borderRadius: 10,
        border: `2px solid ${isActive ? COLORS[color].light : COLORS[color].main + '55'}`,
        background: isActive
          ? `linear-gradient(135deg, ${COLORS[color].main}, ${COLORS[color].dark})`
          : `${COLORS[color].dark}55`,
        boxShadow: isActive ? `0 0 18px 4px ${COLORS[color].main}66` : undefined,
        display: 'flex',
        alignItems: 'center',
        justifyContent: isActive ? 'space-between' : 'center',
        padding: '0 8px',
        flexShrink: 0,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Player name */}
      <span
        style={{
          fontSize: 9,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: 1,
          color: isActive ? '#fff' : COLORS[color].light,
          lineHeight: 1,
          writingMode: 'horizontal-tb',
        }}
      >
        {color}
      </span>

      {/* Dice — only shown for the active player */}
      {isActive && (
        <DiceDisplay
          value={diceValue}
          rolling={rolling}
          color='#fff'
          onClick={canRoll ? onRoll : undefined}
          disabled={!canRoll}
          size={34}
        />
      )}
    </motion.div>
  );
}

export function LudoGame() {
  const { state, rollDice, movePiece, resetGame } = useLudo();
  const canRoll = !state.diceRolled && !state.winner && !state.rollingAnim;

  return (
    <div
      className="min-h-[100dvh] w-full flex items-center justify-center px-4 py-1 overflow-hidden text-slate-100"
      style={{ background: 'linear-gradient(160deg, #1b1b1f, #2b0f10)' }}
    >
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-800/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-800/20 blur-[100px] rounded-full" />
      </div>

      <div
        className="flex flex-col items-center gap-2 w-full"
        style={{ maxWidth: 'min(640px, calc(100dvh - 110px), calc(100vw - 32px))' }}
      >

        {/* Top row: Red (left) · Green (right) */}
        <div className="flex w-full justify-between px-1">
          <PlayerBox
            color="red"
            isActive={state.currentPlayer === 'red'}
            diceValue={state.diceValue}
            rolling={state.rollingAnim}
            canRoll={canRoll}
            onRoll={rollDice}
          />
          <PlayerBox
            color="green"
            isActive={state.currentPlayer === 'green'}
            diceValue={state.diceValue}
            rolling={state.rollingAnim}
            canRoll={canRoll}
            onRoll={rollDice}
          />
        </div>

        {/* Board */}
        <div className="relative w-full">
          <LudoBoard state={state} onPieceClick={movePiece} />

          {/* Reset button — top-right corner of board */}
          <button
            onClick={resetGame}
            title="New game"
            className="absolute top-2 right-2 z-30 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white/60 hover:text-white transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Status message — bottom of board */}
          <AnimatePresence>
            {state.diceRolled && !state.winner && !state.rollingAnim && (
              <motion.div
                key={state.message}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
              >
                <div
                  className="px-3 py-1 rounded-full text-xs font-semibold text-white/90 shadow-lg"
                  style={{ background: `${COLORS[state.currentPlayer].dark}cc` }}
                >
                  {state.message}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* WIN OVERLAY */}
          <AnimatePresence>
            {state.winner && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/50 rounded-[3%]"
                style={{ backdropFilter: 'blur(8px)' }}
              >
                <motion.div
                  initial={{ scale: 0.5, y: 40 }}
                  animate={{ scale: 1, y: 0 }}
                  className="p-8 rounded-3xl flex flex-col items-center text-center shadow-2xl border border-white/20"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS[state.winner].dark}cc, rgba(10,10,20,0.95))`,
                  }}
                >
                  <Trophy className="w-16 h-16 mb-3" style={{ color: COLORS[state.winner].light }} />
                  <h2
                    className="text-3xl font-black uppercase tracking-widest mb-1"
                    style={{ color: COLORS[state.winner].light }}
                  >
                    {state.winner} Wins!
                  </h2>
                  <p className="text-slate-400 text-sm mb-6">Congratulations!</p>
                  <button
                    onClick={resetGame}
                    className="px-6 py-2.5 rounded-full font-bold flex items-center gap-2 hover:scale-105 active:scale-95 transition-all text-white"
                    style={{ backgroundColor: COLORS[state.winner].main }}
                  >
                    <RefreshCw className="w-4 h-4" /> Play Again
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom row: Yellow (left) · Blue (right) */}
        <div className="flex w-full justify-between px-1">
          <PlayerBox
            color="yellow"
            isActive={state.currentPlayer === 'yellow'}
            diceValue={state.diceValue}
            rolling={state.rollingAnim}
            canRoll={canRoll}
            onRoll={rollDice}
          />
          <PlayerBox
            color="blue"
            isActive={state.currentPlayer === 'blue'}
            diceValue={state.diceValue}
            rolling={state.rollingAnim}
            canRoll={canRoll}
            onRoll={rollDice}
          />
        </div>

      </div>
    </div>
  );
}
