import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LudoBoard } from './LudoBoard';
import { DiceDisplay } from './DiceDisplay';
import { useLudo } from '../hooks/useLudo';
import { COLORS, PlayerColor } from '../types/ludo';
import { Trophy, RefreshCw, ChevronRight } from 'lucide-react';

const PLAYER_ORDER: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];

function PlayerBadge({
  color,
  isActive,
  isDone,
}: {
  color: PlayerColor;
  isActive: boolean;
  isDone: boolean;
}) {
  return (
    <motion.div
      animate={{
        scale: isActive ? 1.06 : 1,
        opacity: isDone ? 0.5 : 1,
      }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-sm uppercase tracking-wide border transition-all duration-300"
      style={{
        backgroundColor: isActive ? COLORS[color].main : `${COLORS[color].dark}55`,
        borderColor: isActive ? COLORS[color].light : `${COLORS[color].main}44`,
        color: isActive ? '#fff' : COLORS[color].light,
        boxShadow: isActive ? `0 0 16px 4px ${COLORS[color].main}55` : undefined,
      }}
    >
      {/* Pulsing dot when active */}
      <motion.div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: isActive ? '#fff' : COLORS[color].main }}
        animate={isActive ? { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] } : { scale: 1 }}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <span>{color}</span>
      {isDone && <span className="text-xs">✓</span>}
    </motion.div>
  );
}

export function LudoGame() {
  const { state, rollDice, movePiece, resetGame } = useLudo();

  const canRoll = !state.diceRolled && !state.winner && !state.rollingAnim;

  // Check if all pieces of a player are finished
  const isPlayerDone = (player: PlayerColor) =>
    state.pieces[player]?.every((p) => p === 57) ?? false;

  return (
    <div className="min-h-[100dvh] w-full flex flex-col xl:flex-row items-center justify-center p-4 xl:p-8 gap-8 overflow-hidden text-slate-100">

      {/* BACKGROUND GLOWS */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/20 blur-[100px] rounded-full mix-blend-screen" />
        <div className="absolute top-[40%] right-[10%] w-[30%] h-[30%] bg-green-500/10 blur-[80px] rounded-full mix-blend-screen" />
      </div>

      {/* BOARD + PLAYER BADGES */}
      <div className="w-full max-w-[600px] flex-shrink-0">

        {/* Top row: Red (left) and Green (right) — above their quadrants */}
        <div className="flex justify-between mb-2 px-1">
          <PlayerBadge
            color="red"
            isActive={state.currentPlayer === 'red'}
            isDone={isPlayerDone('red')}
          />
          <PlayerBadge
            color="green"
            isActive={state.currentPlayer === 'green'}
            isDone={isPlayerDone('green')}
          />
        </div>

        {/* Board */}
        <div className="relative">
          <LudoBoard state={state} onPieceClick={movePiece} />

          {/* WIN OVERLAY */}
          <AnimatePresence>
            {state.winner && (
              <motion.div
                initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
                exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 rounded-[3%]"
              >
                <motion.div
                  initial={{ scale: 0.5, y: 50 }}
                  animate={{ scale: 1, y: 0 }}
                  className="glass-panel p-8 rounded-3xl flex flex-col items-center text-center shadow-2xl border-white/20 border"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS[state.winner].dark}88, rgba(20,20,30,0.9))`,
                  }}
                >
                  <Trophy className="w-20 h-20 mb-4" style={{ color: COLORS[state.winner].light }} />
                  <h2
                    className="text-4xl font-bold mb-2 uppercase tracking-wider"
                    style={{ color: COLORS[state.winner].light }}
                  >
                    {state.winner} Wins!
                  </h2>
                  <p className="text-slate-300 mb-8 font-medium">What a spectacular victory.</p>
                  <button
                    onClick={resetGame}
                    className="px-8 py-3 rounded-full font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                    style={{ backgroundColor: COLORS[state.winner].main, color: 'white' }}
                  >
                    <RefreshCw className="w-5 h-5" /> Play Again
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom row: Yellow (left) and Blue (right) — below their quadrants */}
        <div className="flex justify-between mt-2 px-1">
          <PlayerBadge
            color="yellow"
            isActive={state.currentPlayer === 'yellow'}
            isDone={isPlayerDone('yellow')}
          />
          <PlayerBadge
            color="blue"
            isActive={state.currentPlayer === 'blue'}
            isDone={isPlayerDone('blue')}
          />
        </div>
      </div>

      {/* GAME PANEL */}
      <div className="w-full max-w-[600px] xl:max-w-[380px] xl:h-[600px] glass-panel rounded-3xl p-6 xl:p-8 flex flex-col justify-between z-10 relative shadow-2xl border-white/10">

        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">
              LUDO
            </h1>
            <button
              onClick={resetGame}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white"
              title="Reset Game"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {/* DICE — clickable, centered */}
          <div className="flex flex-col items-center gap-3 py-4">
            <DiceDisplay
              value={state.diceValue}
              rolling={state.rollingAnim}
              color={COLORS[state.currentPlayer].main}
              onClick={rollDice}
              disabled={!canRoll}
            />
            <motion.p
              key={state.message}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm font-medium text-white/70 text-center"
            >
              {canRoll
                ? 'Tap the dice to roll'
                : state.rollingAnim
                ? 'Rolling...'
                : state.message}
            </motion.p>
          </div>

          {/* MESSAGE */}
          {!canRoll && !state.rollingAnim && (
            <motion.div
              key={state.message}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <p className="text-lg font-semibold text-white/90">{state.message}</p>
            </motion.div>
          )}
        </div>

        {/* GAME LOG */}
        <div className="mt-6 pt-6 border-t border-white/10 flex-1 flex flex-col min-h-[160px]">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
            Action Log
          </h3>
          <div className="flex-1 overflow-hidden relative">
            <div className="absolute inset-0">
              <AnimatePresence initial={false}>
                {state.history.map((log, i) => (
                  <motion.div
                    key={`${log}-${i}`}
                    initial={{ opacity: 0, x: -20, height: 0 }}
                    animate={{ opacity: 1 - i * 0.22, x: 0, height: 'auto' }}
                    className="flex items-start gap-2 mb-2 text-sm"
                    style={{ color: i === 0 ? 'white' : 'rgba(255,255,255,0.6)' }}
                  >
                    <ChevronRight className="w-4 h-4 mt-0.5 opacity-50 shrink-0" />
                    <span className="font-medium">{log}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
