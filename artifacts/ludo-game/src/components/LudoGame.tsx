import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LudoBoard } from './LudoBoard';
import { DiceDisplay } from './DiceDisplay';
import { useLudo } from '../hooks/useLudo';
import { COLORS, PlayerColor, PLAYER_COLORS } from '../types/ludo';
import { Trophy, RefreshCw, LogOut } from 'lucide-react';
import type { GameStartConfig } from './HomeScreen';
import { OnlineLudoGame } from './OnlineLudoGame';
import { getVisualCornerOrder } from '../lib/ludo-perspective';

/* ── Types ── */
export interface UserInfo {
  id: string;
  name: string;
  imageUrl: string | null;
}

/* ── Avatar circle ── */
function AvatarCircle({
  src,
  name,
  size = 24,
  borderColor,
  square = false,
}: {
  src?: string | null;
  name: string;
  size?: number;
  borderColor?: string;
  square?: boolean;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (square) {
    // Dice-style: white bg, rounded-md, colored border, shadow
    const squareStyle: React.CSSProperties = {
      width: size,
      height: size,
      borderRadius: 6,
      flexShrink: 0,
      border: `2px solid ${borderColor ?? '#ccc'}`,
      background: '#fff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.44,
      fontWeight: 900,
      color: borderColor ?? '#555',
      overflow: 'hidden',
    };
    if (src) {
      return (
        <div style={squareStyle}>
          <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      );
    }
    return <div style={squareStyle}>{initial}</div>;
  }

  // Default circle style (used in SetupScreen)
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    border: `1.5px solid ${borderColor ?? 'rgba(255,255,255,0.35)'}`,
    objectFit: 'cover' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size * 0.46,
    fontWeight: 800,
    color: '#fff',
    background: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  };

  if (src) {
    return <img src={src} alt={name} style={{ ...style, display: 'block' }} />;
  }
  return (
    <div style={style}>
      {initial}
    </div>
  );
}

/* ── Player count Setup Screen ── */
const PLAYER_CONFIGS: Record<number, { players: PlayerColor[]; label: string }> = {
  2: { players: ['red', 'blue'],               label: '২ জন' },
  3: { players: ['red', 'yellow', 'blue'],      label: '৩ জন' },
  4: { players: ['red', 'yellow', 'blue', 'green'], label: '৪ জন' },
};

function TogglePill({ on }: { on: boolean }) {
  return (
    <div style={{
      position: 'relative', flexShrink: 0, width: 44, height: 24, borderRadius: 12,
      background: on ? undefined : 'rgba(255,255,255,0.18)', transition: 'background 0.2s',
    }}>
      <motion.div
        animate={{ x: on ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        style={{ position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
      />
    </div>
  );
}

function SetupScreen({
  userInfo,
  onStart,
}: {
  userInfo?: UserInfo | null;
  onStart: (
    names: Record<PlayerColor, string>,
    avatars: Record<PlayerColor, string | null>,
    activePlayers: PlayerColor[],
    powerSixEnabled: boolean,
    teamMode: boolean,
  ) => void;
}) {
  const [powerSixEnabled, setPowerSixEnabled] = useState(false);
  const [teamMode, setTeamMode] = useState(false);

  const handlePick = (count: number) => {
    const { players } = PLAYER_CONFIGS[count];
    const defaultLabels: Record<PlayerColor, string> = {
      red: 'Player 1', yellow: 'Player 2', blue: 'Player 3', green: 'Player 4',
    };
    const names: Record<PlayerColor, string> = {
      red:    userInfo?.name || defaultLabels.red,
      yellow: defaultLabels.yellow,
      blue:   defaultLabels.blue,
      green:  defaultLabels.green,
    };
    const avatars: Record<PlayerColor, string | null> = {
      red: userInfo?.imageUrl ?? null, yellow: null, blue: null, green: null,
    };
    onStart(names, avatars, players, powerSixEnabled, count === 4 ? teamMode : false);
  };

  return (
    <div
      className="min-h-[100dvh] w-full flex items-center justify-center px-4 py-6"
      style={{ background: 'transparent' }}
    >
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-800/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-800/20 blur-[100px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-xs flex flex-col items-center gap-6"
      >
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-4xl font-black text-white tracking-widest uppercase">Ludo</h1>
          <p className="text-slate-400 text-sm">কতজন খেলবে?</p>
        </div>

        {/* Player count cards */}
        <div className="w-full flex gap-3">
          {[2, 3, 4].map(count => {
            const { players, label } = PLAYER_CONFIGS[count];
            return (
              <motion.button
                key={count}
                whileHover={{ scale: 1.06, y: -3 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => handlePick(count)}
                className="flex-1 flex flex-col items-center gap-3 py-5 rounded-2xl border border-white/10 select-none"
                style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(8px)' }}
              >
                <span className="text-5xl font-black text-white leading-none">{count}</span>
                <div className="flex justify-center gap-1.5">
                  {players.map(p => (
                    <div key={p} className="rounded-full" style={{ width: 14, height: 14, backgroundColor: COLORS[p].main, boxShadow: `0 0 6px ${COLORS[p].main}99` }} />
                  ))}
                </div>
                <span className="text-xs font-semibold text-slate-400">{label}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Team Mode toggle (৪ জনের জন্য) */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setTeamMode(v => !v)}
          className="w-full flex items-center justify-between rounded-2xl border px-4 py-3 select-none"
          style={{
            background: teamMode ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(8px)',
            borderColor: teamMode ? 'rgba(16,185,129,0.50)' : 'rgba(255,255,255,0.1)',
          }}
        >
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-bold text-white">🤝 টিম মোড</span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
              লাল &amp; নীল vs হলুদ &amp; সবুজ (৪ জনে)
            </span>
          </div>
          <div style={{ position: 'relative', flexShrink: 0, width: 44, height: 24, borderRadius: 12, background: teamMode ? '#10b981' : 'rgba(255,255,255,0.18)', transition: 'background 0.2s', boxShadow: teamMode ? '0 0 10px #10b98188' : undefined }}>
            <TogglePill on={teamMode} />
          </div>
        </motion.button>

        {/* Power Six toggle */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setPowerSixEnabled(v => !v)}
          className="w-full flex items-center justify-between rounded-2xl border px-4 py-3 select-none"
          style={{
            background: powerSixEnabled ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(8px)',
            borderColor: powerSixEnabled ? 'rgba(245,158,11,0.45)' : 'rgba(255,255,255,0.1)',
          }}
        >
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-bold text-white">⚡ পাওয়ার সিক্স</span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
              ছয়ের পর প্রতি ৬ রোলে একটি ছয় গ্যারান্টি
            </span>
          </div>
          <div style={{ position: 'relative', flexShrink: 0, width: 44, height: 24, borderRadius: 12, background: powerSixEnabled ? '#f59e0b' : 'rgba(255,255,255,0.18)', transition: 'background 0.2s', boxShadow: powerSixEnabled ? '0 0 10px #f59e0b88' : undefined }}>
            <TogglePill on={powerSixEnabled} />
          </div>
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
  avatarUrl,
  powerSixNextForced = false,
}: {
  color: PlayerColor;
  name: string;
  isActive: boolean;
  diceValue: number | null;
  rolling: boolean;
  canRoll: boolean;
  onRoll: () => void;
  avatarUrl?: string | null;
  powerSixNextForced?: boolean;
}) {
  return (
    <motion.div
      animate={{ scale: isActive ? 1.05 : 1 }}
      transition={{ duration: 0.25 }}
      style={{
        width: 155,
        height: 58,
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
        gap: 6,
      }}
    >
      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}>
        <AvatarCircle
          src={avatarUrl}
          name={name}
          size={38}
          borderColor={COLORS[color].main}
          square
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: isActive ? '#fff' : COLORS[color].light,
            lineHeight: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
      </div>

      {/* Dice — only for active player */}
      {isActive && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <DiceDisplay
            value={diceValue}
            rolling={rolling}
            color={powerSixNextForced ? '#f59e0b' : COLORS[color].main}
            onClick={canRoll ? onRoll : undefined}
            disabled={!canRoll}
            size={38}
          />
          {powerSixNextForced && (
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
              transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                top: -7,
                right: -7,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                boxShadow: '0 0 8px #f59e0baa',
                zIndex: 10,
              }}
            >
              ⚡
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
}

/* ── টিম নাম হেল্পার ── */
const TEAM_LABEL: Record<PlayerColor, string> = {
  red: 'লাল & নীল', blue: 'লাল & নীল',
  yellow: 'হলুদ & সবুজ', green: 'হলুদ & সবুজ',
};

/* ── Build initial state from GameStartConfig ── */
function configToGameSetup(
  config: GameStartConfig,
  userInfo?: UserInfo | null,
): {
  names: Record<PlayerColor, string>;
  avatars: Record<PlayerColor, string | null>;
  players: PlayerColor[];
  powerSix: boolean;
  teamMode: boolean;
} {
  const players: PlayerColor[] =
    config.playerCount === 2 ? ['red', 'blue'] :
    config.playerCount === 3 ? ['red', 'yellow', 'blue'] :
    ['red', 'yellow', 'blue', 'green'];

  const defaultLabels: Record<PlayerColor, string> = {
    red: userInfo?.name || 'Player 1',
    yellow: 'Player 2',
    blue: 'Player 3',
    green: 'Player 4',
  };

  const names: Record<PlayerColor, string> = {
    red:    defaultLabels.red,
    yellow: defaultLabels.yellow,
    blue:   defaultLabels.blue,
    green:  defaultLabels.green,
  };

  const avatars: Record<PlayerColor, string | null> = {
    red: userInfo?.imageUrl ?? null, yellow: null, blue: null, green: null,
  };

  return {
    names,
    players,
    avatars,
    powerSix: config.powerSixEnabled ?? false,
    teamMode: config.teamMode ?? false,
  };
}

/* ── Main Game ── */
function LocalLudoGame({
  userInfo,
  initialConfig,
  onBack,
}: {
  userInfo?: UserInfo | null;
  initialConfig?: GameStartConfig;
  onBack?: () => void;
}) {
  // If initialConfig is provided, pre-load it; otherwise wait for SetupScreen
  const [playerNames, setPlayerNames] = useState<Record<PlayerColor, string> | null>(() => {
    if (!initialConfig) return null;
    return configToGameSetup(initialConfig, userInfo).names;
  });
  const [playerAvatars, setPlayerAvatars] = useState<Record<PlayerColor, string | null>>(() => {
    if (!initialConfig) return { red: null, yellow: null, blue: null, green: null };
    return configToGameSetup(initialConfig, userInfo).avatars;
  });
  const [activePlayers, setActivePlayers] = useState<PlayerColor[]>(() => {
    if (!initialConfig) return ['red', 'yellow', 'blue', 'green'];
    return configToGameSetup(initialConfig, userInfo).players;
  });
  const [powerSixEnabled, setPowerSixEnabled] = useState<boolean>(
    () => initialConfig?.powerSixEnabled ?? false,
  );
  const [teamModeEnabled, setTeamModeEnabled] = useState<boolean>(
    () => initialConfig ? (initialConfig.teamMode ?? false) : false,
  );
  // The local player's canonical color is fixed when the match is created.
  // It is used only for visual projection; game state remains canonical.
  const [perspective, setPerspective] = useState<PlayerColor>(() =>
    initialConfig ? configToGameSetup(initialConfig, userInfo).players[0] : 'red',
  );

  const { state, rollDice, movePiece, resetGame } = useLudo(playerNames ?? undefined, activePlayers, powerSixEnabled, teamModeEnabled);
  const canRoll = !state.diceRolled && !state.winner && !state.rollingAnim && !state.isAnimating;

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Render a PlayerBox or an empty spacer for the given corner colour
  const renderBox = (color: PlayerColor) => {
    if (!activePlayers.includes(color)) return <div style={{ width: 155 }} />;
    return (
      <PlayerBox
        color={color}
        name={state.playerNames[color]}
        isActive={state.currentPlayer === color}
        diceValue={state.diceValue}
        rolling={state.rollingAnim}
        canRoll={canRoll}
        onRoll={rollDice}
        avatarUrl={playerAvatars[color]}
        powerSixNextForced={powerSixEnabled && state.powerSixCycleCount[color] === 5}
      />
    );
  };
  const visualCorners = getVisualCornerOrder(perspective);

  const handleStart = (
    names: Record<PlayerColor, string>,
    avatars: Record<PlayerColor, string | null>,
    players: PlayerColor[],
    ps: boolean,
    tm: boolean,
  ) => {
    setPlayerNames(names);
    setPlayerAvatars(avatars);
    setActivePlayers(players);
    setPerspective(players[0]);
    setPowerSixEnabled(ps);
    setTeamModeEnabled(tm);
  };

  // Reset clears local game state; if onBack is provided go to home, else go to setup
  const handleReset = () => {
    if (onBack) {
      onBack();
      return;
    }
    setPlayerNames(null);
    setPlayerAvatars({ red: null, yellow: null, blue: null, green: null });
    setActivePlayers(['red', 'yellow', 'blue', 'green']);
    setPowerSixEnabled(false);
  };

  if (!playerNames) {
    return <SetupScreen userInfo={userInfo} onStart={handleStart} />;
  }

  return (
    <div
      className="min-h-[100dvh] w-full flex items-center justify-center px-4 py-1 overflow-hidden text-slate-100"
      style={{ background: 'transparent' }}
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

        {/* Top row: TL · TR (fixed layout) */}
        <div className="flex w-full justify-between px-1">
          {renderBox(visualCorners[0])}
          {renderBox(visualCorners[1])}
        </div>

        {/* Board — fixed orientation, no rotation */}
        <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <LudoBoard state={state} onPieceClick={movePiece} perspective={perspective} />
          </div>

          {/* Leave button — top-left */}
          {onBack && (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              title="গেম ছেড়ে যান"
              className="absolute top-2 left-2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-full bg-black/40 hover:bg-red-700/60 text-white/50 hover:text-white transition-all text-[10px] font-bold"
            >
              <LogOut className="w-3.5 h-3.5" /> Leave
            </button>
          )}

          {/* Reset button — top-right */}
          <button
            onClick={handleReset}
            title="নতুন গেম"
            className="absolute top-2 right-2 z-30 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white/60 hover:text-white transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* LEAVE CONFIRMATION */}
          <AnimatePresence>
            {showLeaveConfirm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-[3%]"
                style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
              >
                <motion.div
                  initial={{ scale: 0.85, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.85, y: 20 }}
                  className="mx-6 p-6 rounded-3xl flex flex-col items-center text-center border border-white/15 shadow-2xl"
                  style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)' }}
                >
                  <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-400/40 flex items-center justify-center mb-3">
                    <LogOut className="w-7 h-7 text-red-400" />
                  </div>
                  <h3 className="text-white font-black text-lg mb-1">গেম ছেড়ে যাবেন?</h3>
                  <p className="text-white/50 text-xs mb-5 leading-relaxed">
                    আপনি গেম থেকে বের হয়ে গেলে<br />আপনার অগ্রগতি হারিয়ে যাবে।
                  </p>
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => setShowLeaveConfirm(false)}
                      className="flex-1 py-2.5 rounded-2xl border border-white/20 text-white/80 font-bold text-sm active:scale-95 transition-all bg-white/5 hover:bg-white/10"
                    >
                      না, থাকব
                    </button>
                    <button
                      onClick={() => { setShowLeaveConfirm(false); onBack?.(); }}
                      className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 text-white font-black text-sm active:scale-95 transition-all shadow-[0_0_16px_rgba(239,68,68,0.4)]"
                    >
                      হ্যাঁ, Leave
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

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
                  {state.teamMode ? (
                    <>
                      <h2 className="text-2xl font-black uppercase tracking-widest mb-1" style={{ color: COLORS[state.winner].light }}>
                        {TEAM_LABEL[state.winner]}
                      </h2>
                      <p className="text-slate-300 text-xs font-semibold mb-1">টিম জিতেছে! 🤝</p>
                    </>
                  ) : (
                    <h2 className="text-3xl font-black uppercase tracking-widest mb-1" style={{ color: COLORS[state.winner].light }}>
                      {state.playerNames[state.winner]}
                    </h2>
                  )}
                  <p className="text-slate-400 text-sm mb-6">অভিনন্দন 🎉</p>
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

        {/* Bottom row: BL · BR (fixed layout) */}
        <div className="flex w-full justify-between px-1">
          {renderBox(visualCorners[2])}
          {renderBox(visualCorners[3])}
        </div>

      </div>
    </div>
  );
}

export function LudoGame(props: {
  userInfo?: UserInfo | null;
  initialConfig?: GameStartConfig;
  onBack?: () => void;
  onOpenPlayerProfile?: (playerId: string) => void;
  onMatchFinished?: () => void;
}) {
  const requestedOnlineMatch =
    props.initialConfig?.online ||
    props.initialConfig?.matchType === 'quick-match' ||
    props.initialConfig?.matchType === 'nearby' ||
    props.initialConfig?.matchType === 'ranked' ||
    props.initialConfig?.matchType === 'create-room' ||
    props.initialConfig?.matchType === 'join-code';

  // Never silently turn an online match into a local game. A missing room or
  // identity is an online setup failure, not permission to start with bots.
  if (requestedOnlineMatch && (!props.initialConfig?.roomId || !props.userInfo?.id)) {
    return (
      <div
        className="min-h-[100dvh] w-full flex items-center justify-center px-4 text-center text-white"
        style={{ background: 'transparent' }}
      >
        <div className="w-full max-w-sm rounded-3xl border border-red-400/30 bg-[#060a1c]/90 p-6 shadow-2xl">
          <h1 className="text-xl font-black mb-2">Online match শুরু করা যায়নি</h1>
          <p className="text-sm text-white/60 leading-relaxed mb-5">
            Room তৈরি হয়নি বা login session পাওয়া যায়নি। Offline game শুরু করা হয়নি।
          </p>
          <button
            onClick={props.onBack ?? (() => undefined)}
            className="w-full rounded-xl bg-red-600 py-3 text-sm font-black text-white"
          >
            ফিরে যান
          </button>
        </div>
      </div>
    );
  }

  if (requestedOnlineMatch && props.initialConfig?.roomId && props.userInfo?.id) {
    return (
      <OnlineLudoGame
        userInfo={props.userInfo as UserInfo & { id: string }}
        initialConfig={props.initialConfig}
        onBack={props.onBack ?? (() => undefined)}
        onOpenPlayerProfile={props.onOpenPlayerProfile}
        onMatchFinished={props.onMatchFinished}
      />
    );
  }
  return <LocalLudoGame {...props} />;
}
