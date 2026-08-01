import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LudoBoard } from './LudoBoard';
import { DiceDisplay } from './DiceDisplay';
import { useLudo } from '../hooks/useLudo';
import { COLORS, PlayerColor, PLAYER_COLORS } from '../types/ludo';
import { Trophy, RefreshCw, Play } from 'lucide-react';

/* ── Name Setup Screen ── */
function SetupScreen({ onStart }: { onStart: (names: Record<PlayerColor, string>) => void }) {
  const [names, setNames] = useState<Record<PlayerColor, string>>({
    red: '',
    yellow: '',
    blue: '',
    green: '',
  });

  const colorLabels: { color: PlayerColor; label: string; placeholder: string }[] = [
    { color: 'red',    label: 'লাল',   placeholder: 'Player 1' },
    { color: 'yellow', label: 'হলুদ',  placeholder: 'Player 2' },
    { color: 'blue',   label: 'নীল',   placeholder: 'Player 3' },
    { color: 'green',  label: 'সবুজ',  placeholder: 'Player 4' },
  ];

  const handleStart = () => {
    const filled: Record<PlayerColor, string> = {
      red:    names.red.trim()    || 'Player 1',
      yellow: names.yellow.trim() || 'Player 2',
      blue:   names.blue.trim()   || 'Player 3',
      green:  names.green.trim()  || 'Player 4',
    };
    onStart(filled);
  };

  return (
    <div
      className="min-h-[100dvh] w-full flex items-center justify-center px-4 py-6"
      style={{ background: 'linear-gradient(160deg, #1b1b1f, #2b0f10)' }}
    >
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-800/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-800/20 blur-[100px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6"
      >
        <h1 className="text-3xl font-black text-white tracking-widest uppercase">Ludo</h1>
        <p className="text-slate-400 text-sm -mt-4">প্রতিটি খেলোয়াড়ের নাম লিখুন</p>

        <div className="w-full flex flex-col gap-3">
          {colorLabels.map(({ color, label, placeholder }) => (
            <div key={color} className="flex items-center gap-3">
              {/* Color dot */}
              <div
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[color].main }}
              />
              {/* Label */}
              <span className="text-sm font-semibold w-10 flex-shrink-0" style={{ color: COLORS[color].light }}>
                {label}
              </span>
              {/* Input */}
              <input
                type="text"
                maxLength={16}
                placeholder={placeholder}
                value={names[color]}
                onChange={e => setNames(prev => ({ ...prev, [color]: e.target.value }))}
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/50 transition-colors"
                onKeyDown={e => { if (e.key === 'Enter') handleStart(); }}
              />
            </div>
          ))}
        </div>

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleStart}
          className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 text-base"
          style={{ background: 'linear-gradient(135deg, #e0221c, #8f0f0b)' }}
        >
          <Play className="w-4 h-4" /> গেম শুরু করুন
        </motion.button>
      </motion.div>
    </div>
  );
}

/* ── Player box ── */
function PlayerBox({
  color,
  name,
  isActive,
  diceValue,
  rolling,
  canRoll,
  onRoll,
}: {
  color: PlayerColor;
  name: string;
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
          fontSize: 11,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: isActive ? '#fff' : COLORS[color].light,
          lineHeight: 1,
          maxWidth: isActive ? 90 : '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>

      {/* Dice — only for active player */}
      {isActive && (
        <DiceDisplay
          value={diceValue}
          rolling={rolling}
          color={COLORS[color].main}
          onClick={canRoll ? onRoll : undefined}
          disabled={!canRoll}
          size={38}
        />
      )}
    </motion.div>
  );
}

/* ── Main Game ── */
export function LudoGame() {
  const [playerNames, setPlayerNames] = useState<Record<PlayerColor, string> | null>(null);
  const { state, rollDice, movePiece, resetGame } = useLudo(playerNames ?? undefined);
  const canRoll = !state.diceRolled && !state.winner && !state.rollingAnim;

  if (!playerNames) {
    return <SetupScreen onStart={(names) => setPlayerNames(names)} />;
  }

  const handleReset = () => {
    setPlayerNames(null); // go back to setup screen
  };

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
            name={state.playerNames.red}
            isActive={state.currentPlayer === 'red'}
            diceValue={state.diceValue}
            rolling={state.rollingAnim}
            canRoll={canRoll}
            onRoll={rollDice}
          />
          <PlayerBox
            color="green"
            name={state.playerNames.green}
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

          {/* Reset button */}
          <button
            onClick={handleReset}
            title="নতুন গেম"
            className="absolute top-2 right-2 z-30 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white/60 hover:text-white transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Status message */}
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
                  className="px-3 py-1 rounded-full text-xs font-semibold text-white/90 shadow-lg whitespace-nowrap"
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
                    {state.playerNames[state.winner]}
                  </h2>
                  <p className="text-slate-400 text-sm mb-6">জিতেছে! অভিনন্দন 🎉</p>
                  <button
                    onClick={handleReset}
                    className="px-6 py-2.5 rounded-full font-bold flex items-center gap-2 hover:scale-105 active:scale-95 transition-all text-white"
                    style={{ backgroundColor: COLORS[state.winner].main }}
                  >
                    <RefreshCw className="w-4 h-4" /> আবার খেলুন
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
            name={state.playerNames.yellow}
            isActive={state.currentPlayer === 'yellow'}
            diceValue={state.diceValue}
            rolling={state.rollingAnim}
            canRoll={canRoll}
            onRoll={rollDice}
          />
          <PlayerBox
            color="blue"
            name={state.playerNames.blue}
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
