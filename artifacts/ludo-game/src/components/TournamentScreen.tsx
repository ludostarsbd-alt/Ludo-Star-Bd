import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, ChevronLeft, Swords, Star, Sparkles, AlertCircle,
  PlayCircle, Crown, Loader2, ArrowRight, Shield, Skull,
  Users, MapPin, Lock, CheckCircle2, XCircle, Clock,
  ChevronDown, Zap, Target
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────────────────── */

export type KnockoutRound = 'round-of-32' | 'round-of-16' | 'quarter-final' | 'semi-final' | 'final';

export interface KillBonus {
  victimName: string;
  progressPct: number;
  bonus: number;
}

export interface MatchResult {
  matchNum: number;
  outcome: 'win' | 'loss' | 'draw';
  basePoints: number;
  killBonuses: KillBonus[];
  penalties: number;
  netPoints: number;
  opponentName: string;
}

export interface TournamentState {
  phase: 'none' | 'waiting' | 'league' | 'review' | 'qualification' | 'knockout' | 'champion' | 'eliminated';
  joinedAt?: number;
  poolId?: string;
  nearbyEnabled?: boolean;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  matchResults: MatchResult[];
  totalPoints: number;
  qualificationThreshold?: number;
  qualifiedScore?: number;
  knockoutRound?: KnockoutRound;
  knockoutHistory: KnockoutRound[];
}

const DEFAULT_STATE: TournamentState = {
  phase: 'none',
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  matchResults: [],
  totalPoints: 0,
  knockoutHistory: [],
};

const OPPONENT_NAMES = [
  'Shakil', 'Nusrat', 'Rakib', 'Tanvir', 'Mim', 'Sabbir',
  'Ayesha', 'Farid', 'Riya', 'Imran', 'Sumaiya', 'Karim',
  'Sadia', 'Rifat', 'Taslima', 'Nahid'
];

const KNOCKOUT_ROUNDS: KnockoutRound[] = [
  'round-of-32', 'round-of-16', 'quarter-final', 'semi-final', 'final'
];

const ROUND_LABELS: Record<KnockoutRound, string> = {
  'round-of-32': 'Round of 32',
  'round-of-16': 'Round of 16',
  'quarter-final': 'Quarter Final',
  'semi-final': 'Semi Final',
  'final': 'Final',
};

function getRandomOpponent() {
  return OPPONENT_NAMES[Math.floor(Math.random() * OPPONENT_NAMES.length)];
}

/* ─── Shared UI ──────────────────────────────────────────────────────────────── */

function TopNav({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 w-full z-20 relative">
      <button
        onClick={onBack}
        className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center active:scale-90 transition-transform"
      >
        <ChevronLeft size={18} className="text-white" />
      </button>
      <h2 className="text-yellow-400 font-black italic text-lg tracking-widest drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">
        {title}
      </h2>
      <div className="w-9 h-9" />
    </div>
  );
}

function GlassPanel({
  children,
  className = '',
  highlight = false,
  glow = '',
}: {
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
  glow?: string;
}) {
  return (
    <div
      className={`rounded-2xl border backdrop-blur-md p-4
        ${highlight
          ? 'bg-gradient-to-br from-yellow-900/40 via-amber-900/20 to-black/80 border-yellow-500/50 shadow-[0_0_15px_rgba(250,204,21,0.15)]'
          : 'bg-gradient-to-br from-white/5 to-white/[0.02] border-white/10'}
        ${glow}
        ${className}`}
    >
      {children}
    </div>
  );
}

function StatBox({ label, value, sub, color = 'text-white' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
      <span className={`block text-2xl font-black ${color}`}>{value}</span>
      <span className="block text-[10px] text-white/50 font-bold mt-0.5">{label}</span>
      {sub && <span className="block text-[9px] text-white/30 mt-0.5">{sub}</span>}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────────── */

export function TournamentScreen({
  onNavigate,
  userInfo,
}: {
  onNavigate: (k: string) => void;
  userInfo: { name: string; imageUrl: string | null } | null;
}) {
  const [state, setState] = useState<TournamentState>(() => {
    try {
      const saved = localStorage.getItem('ludo_tournament');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_STATE;
  });

  const [simulating, setSimulating] = useState(false);
  const [showResultModal, setShowResultModal] = useState<MatchResult | null>(null);

  useEffect(() => {
    localStorage.setItem('ludo_tournament', JSON.stringify(state));
  }, [state]);

  function resetTournament() {
    setState(DEFAULT_STATE);
  }

  /* ─── Simulation Logic ─────────────────────────────────────────────────────── */

  function simulateSingleMatch(matchNum: number): MatchResult {
    const outcomeRoll = Math.random();
    let outcome: 'win' | 'loss' | 'draw' = 'loss';
    let basePoints = 0;
    if (outcomeRoll < 0.4) { outcome = 'win'; basePoints = 5; }
    else if (outcomeRoll < 0.6) { outcome = 'draw'; basePoints = 2; }
    else { outcome = 'loss'; basePoints = 0; }

    const numKills = Math.floor(Math.random() * 3);
    const killBonuses: KillBonus[] = [];
    let killBonusSum = 0;
    const tiers = [10, 25, 40, 55, 70, 85, 99, 100];

    for (let i = 0; i < numKills; i++) {
      const tierPct = tiers[Math.floor(Math.random() * tiers.length)];
      const bonus = tierPct === 100 ? 1.00 : tierPct / 100;
      killBonuses.push({ victimName: getRandomOpponent(), progressPct: tierPct, bonus });
      killBonusSum += bonus;
    }

    const numPenalties = Math.floor(Math.random() * 3);
    let penalties = 0;
    for (let i = 0; i < numPenalties; i++) {
      const tierPct = tiers[Math.floor(Math.random() * tiers.length)];
      penalties += tierPct === 100 ? 1.00 : tierPct / 100;
    }

    return {
      matchNum,
      outcome,
      basePoints,
      killBonuses,
      penalties,
      netPoints: basePoints + killBonusSum - penalties,
      opponentName: getRandomOpponent(),
    };
  }

  function handlePlayLeagueMatch() {
    setSimulating(true);
    setTimeout(() => {
      const result = simulateSingleMatch(state.matchesPlayed + 1);
      setState(prev => ({
        ...prev,
        matchesPlayed: prev.matchesPlayed + 1,
        wins: prev.wins + (result.outcome === 'win' ? 1 : 0),
        losses: prev.losses + (result.outcome === 'loss' ? 1 : 0),
        draws: prev.draws + (result.outcome === 'draw' ? 1 : 0),
        matchResults: [...prev.matchResults, result],
        totalPoints: prev.totalPoints + result.netPoints,
      }));
      setSimulating(false);
      setShowResultModal(result);
    }, 1500);
  }

  function handleReviewQualification() {
    setState(prev => ({ ...prev, phase: 'review' }));
  }

  function handleCheckQualification(threshold: number) {
    const qualified = state.totalPoints >= threshold;
    if (qualified) {
      setState(prev => ({
        ...prev,
        phase: 'qualification',
        qualificationThreshold: threshold,
        qualifiedScore: prev.totalPoints,
      }));
    } else {
      setState(prev => ({
        ...prev,
        phase: 'qualification',
        qualificationThreshold: threshold,
        qualifiedScore: prev.totalPoints,
      }));
    }
  }

  function handlePlayKnockoutMatch() {
    setSimulating(true);
    setTimeout(() => {
      const result = simulateSingleMatch(0);
      setSimulating(false);
      const won = result.outcome === 'win';

      if (!won) {
        setState(prev => ({ ...prev, phase: 'eliminated' }));
      } else {
        setState(prev => {
          const currentIndex = KNOCKOUT_ROUNDS.indexOf(prev.knockoutRound!);
          const history = [...prev.knockoutHistory, prev.knockoutRound!];
          if (currentIndex === KNOCKOUT_ROUNDS.length - 1) {
            return { ...prev, phase: 'champion', knockoutHistory: history };
          } else {
            return { ...prev, knockoutRound: KNOCKOUT_ROUNDS[currentIndex + 1], knockoutHistory: history };
          }
        });
      }
      setShowResultModal(result);
    }, 2000);
  }

  /* ─── Screens ──────────────────────────────────────────────────────────────── */

  return (
    <div className="h-screen w-full relative flex flex-col bg-[#050818] overflow-hidden text-white font-sans">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-indigo-950/40 via-[#050818] to-amber-950/30 opacity-80 pointer-events-none" />

      {/* Ambient glow orbs */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-yellow-500/5 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-cyan-500/5 blur-[80px] rounded-full pointer-events-none" />

      {state.phase !== 'waiting' && (
        <TopNav onBack={() => onNavigate('home')} title="TOURNAMENT" />
      )}

      <div className="relative z-10 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* ── 1. LOBBY ── */}
          {state.phase === 'none' && (
            <LobbyScreen
              userInfo={userInfo}
              onJoin={(nearbyEnabled) => {
                // Require login
                if (!userInfo) {
                  onNavigate('sign-in');
                  return;
                }
                setState({
                  ...DEFAULT_STATE,
                  phase: 'waiting',
                  joinedAt: Date.now(),
                  nearbyEnabled,
                  poolId: Math.random().toString(36).slice(2, 8).toUpperCase(),
                });
              }}
            />
          )}

          {/* ── 2. WAITING LIST ── */}
          {state.phase === 'waiting' && (
            <WaitingScreen
              nearbyEnabled={state.nearbyEnabled ?? false}
              onComplete={() => setState(prev => ({ ...prev, phase: 'league' }))}
              onBack={() => resetTournament()}
            />
          )}

          {/* ── 3. LEAGUE DASHBOARD ── */}
          {state.phase === 'league' && (
            <LeagueDashboard
              state={state}
              userInfo={userInfo}
              simulating={simulating}
              onPlay={handlePlayLeagueMatch}
              onViewMatch={(r) => setShowResultModal(r)}
              onCheckResult={handleReviewQualification}
            />
          )}

          {/* ── 4. REVIEW (Pending screen) ── */}
          {state.phase === 'review' && (
            <ReviewScreen
              state={state}
              onReveal={handleCheckQualification}
            />
          )}

          {/* ── 5. QUALIFICATION RESULT ── */}
          {state.phase === 'qualification' && (
            <QualificationResultScreen
              state={state}
              onProceed={() => {
                const qualified = state.totalPoints >= (state.qualificationThreshold ?? 0);
                if (qualified) {
                  setState(prev => ({ ...prev, phase: 'knockout', knockoutRound: 'round-of-32' }));
                } else {
                  setState(prev => ({ ...prev, phase: 'eliminated' }));
                }
              }}
            />
          )}

          {/* ── 6. KNOCKOUT / CHAMPION / ELIMINATED ── */}
          {(state.phase === 'knockout' || state.phase === 'champion' || state.phase === 'eliminated') && (
            <KnockoutStage
              state={state}
              onPlay={handlePlayKnockoutMatch}
              onRestart={resetTournament}
              simulating={simulating}
            />
          )}

        </AnimatePresence>
      </div>

      {/* Match Result Modal */}
      <AnimatePresence>
        {showResultModal && (
          <MatchResultModal result={showResultModal} onClose={() => setShowResultModal(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Lobby Screen ───────────────────────────────────────────────────────────── */

function LobbyScreen({
  userInfo,
  onJoin,
}: {
  userInfo: { name: string; imageUrl: string | null } | null;
  onJoin: (nearby: boolean) => void;
}) {
  const [nearbyEnabled, setNearbyEnabled] = useState(false);
  const isLoggedIn = !!userInfo;

  return (
    <motion.div
      key="lobby"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-start px-5 pb-8 pt-2"
    >
      {/* Trophy */}
      <motion.div
        animate={{ y: [-8, 8, -8] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="mb-5 relative mt-2"
      >
        <div className="absolute inset-0 bg-yellow-500 blur-[60px] opacity-25 rounded-full" />
        <Trophy size={110} className="text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.8)] relative z-10" />
        <Sparkles size={32} className="absolute -top-3 -right-3 text-yellow-200 animate-pulse" />
      </motion.div>

      <h1 className="text-4xl font-black italic tracking-widest text-center mb-1 text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">
        CHAMPIONSHIP
      </h1>
      <p className="text-white/50 text-xs text-center mb-5 max-w-[260px]">
        যোগ দিন, লিগ খেলুন, কোয়ালিফাই করুন, চ্যাম্পিয়ন হোন।
      </p>

      {/* Rules */}
      <GlassPanel className="w-full mb-4">
        <div className="space-y-3.5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0"><Swords size={15} /></div>
            <div>
              <h4 className="font-bold text-sm">লিগ পর্ব — ৩ ম্যাচ</h4>
              <p className="text-[11px] text-white/50">৩টি ম্যাচ খেলে পয়েন্ট অর্জন করুন</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 shrink-0"><Star size={15} /></div>
            <div>
              <h4 className="font-bold text-sm">পয়েন্ট সিস্টেম</h4>
              <p className="text-[11px] text-white/50">জয় +5 · ড্র +2 · হার 0 · কিল বোনাস</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 shrink-0"><Crown size={15} /></div>
            <div>
              <h4 className="font-bold text-sm">নকআউট ব্র্যাকেট</h4>
              <p className="text-[11px] text-white/50">R32 → R16 → QF → SF → Final → 🏆</p>
            </div>
          </div>
        </div>
      </GlassPanel>

      {/* Nearby Player Option */}
      <div className="w-full mb-4">
        <button
          onClick={() => setNearbyEnabled(p => !p)}
          className={`w-full flex items-center gap-3 rounded-2xl border p-3.5 transition-all ${nearbyEnabled ? 'bg-green-500/15 border-green-400/50' : 'bg-white/[0.03] border-white/10'}`}
        >
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${nearbyEnabled ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
            <MapPin size={16} />
          </div>
          <div className="flex-1 text-left">
            <h4 className="font-bold text-sm">Nearby Player Match</h4>
            <p className="text-[11px] text-white/50">কাছের খেলোয়াড়দের সাথে ম্যাচ পাওয়ার অপশন</p>
          </div>
          {/* Toggle */}
          <div className={`w-11 h-6 rounded-full relative transition-colors duration-200 ${nearbyEnabled ? 'bg-green-500' : 'bg-white/15'}`}>
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200" style={{ left: nearbyEnabled ? 22 : 2 }} />
          </div>
        </button>
      </div>

      {/* Login required notice */}
      {!isLoggedIn && (
        <div className="w-full mb-3 flex items-center gap-2 bg-yellow-500/10 border border-yellow-400/30 rounded-xl px-3 py-2.5">
          <Lock size={14} className="text-yellow-400 shrink-0" />
          <span className="text-yellow-300 text-xs font-semibold">টুর্নামেন্টে যোগ দিতে লগইন করুন</span>
        </div>
      )}

      <button
        onClick={() => onJoin(nearbyEnabled)}
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 text-black font-black text-lg italic tracking-wider shadow-[0_0_30px_rgba(250,204,21,0.4)] active:scale-95 transition-transform flex items-center justify-center gap-2"
      >
        {!isLoggedIn ? <><Lock size={18} /> LOGIN TO JOIN</> : 'JOIN TOURNAMENT'}
      </button>
    </motion.div>
  );
}

/* ─── Waiting Screen ─────────────────────────────────────────────────────────── */

function WaitingScreen({
  nearbyEnabled,
  onComplete,
  onBack,
}: {
  nearbyEnabled: boolean;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [count, setCount] = useState(1);
  const [dots, setDots] = useState('.');

  useEffect(() => {
    // Animate player count going up
    const interval = setInterval(() => {
      setCount(c => {
        const next = c + Math.floor(Math.random() * 3 + 1);
        return next;
      });
    }, 400);
    const dotInterval = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 500);
    const done = setTimeout(onComplete, 4000);
    return () => { clearInterval(interval); clearInterval(dotInterval); clearTimeout(done); };
  }, [onComplete]);

  return (
    <motion.div
      key="waiting"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center h-screen px-6 text-center"
    >
      {/* Back */}
      <div className="absolute top-4 left-4">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={18} className="text-white" />
        </button>
      </div>

      {/* Pulsing ring */}
      <div className="relative mb-8">
        <div className="absolute inset-0 border-4 border-cyan-500/20 rounded-full animate-ping scale-125" />
        <div className="absolute inset-0 border-4 border-cyan-500/10 rounded-full animate-ping scale-150 animation-delay-300" />
        <div className="w-24 h-24 rounded-full bg-cyan-500/15 border-2 border-cyan-400/60 flex items-center justify-center relative z-10">
          <Users size={36} className="text-cyan-300" />
        </div>
      </div>

      <h2 className="text-2xl font-black italic tracking-wide mb-2 text-white drop-shadow-lg">
        Waiting List{dots}
      </h2>
      <p className="text-white/50 text-sm mb-8 max-w-[260px]">
        আপনি Waiting List-এ আছেন। সিস্টেম সকল Player কে Pool-এ যুক্ত করছে।
      </p>

      {/* Status panel */}
      <div className="w-full max-w-sm space-y-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
          <CheckCircle2 size={16} className="text-green-400 shrink-0" />
          <span className="text-sm font-semibold flex-1">Registration Confirmed</span>
          <span className="text-green-400 text-xs font-bold">✓</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-cyan-500/10 border border-cyan-400/30 px-4 py-3">
          <Loader2 size={16} className="text-cyan-400 animate-spin shrink-0" />
          <span className="text-sm font-semibold flex-1">Pool Assignment</span>
          <span className="text-cyan-300 text-xs font-bold">Pending</span>
        </div>
        {nearbyEnabled && (
          <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
            <MapPin size={16} className="text-green-400 shrink-0" />
            <span className="text-sm font-semibold flex-1 text-left">Nearby Match</span>
            <span className="text-green-400 text-xs font-bold">Enabled</span>
          </div>
        )}
      </div>

      <p className="text-white/30 text-[11px] mt-8">
        সকল তথ্য গোপন রাখা হবে।
      </p>
    </motion.div>
  );
}

/* ─── League Dashboard ───────────────────────────────────────────────────────── */

function LeagueDashboard({
  state,
  userInfo,
  simulating,
  onPlay,
  onViewMatch,
  onCheckResult,
}: {
  state: TournamentState;
  userInfo: { name: string; imageUrl: string | null } | null;
  simulating: boolean;
  onPlay: () => void;
  onViewMatch: (r: MatchResult) => void;
  onCheckResult: () => void;
}) {
  const allDone = state.matchesPlayed >= 3;

  return (
    <motion.div
      key="league"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="px-4 pb-24 pt-2"
    >
      {/* Player Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 p-0.5 shadow-[0_0_15px_rgba(6,182,212,0.3)] shrink-0">
          <div className="w-full h-full bg-[#050818] rounded-[11px] flex items-center justify-center overflow-hidden">
            {userInfo?.imageUrl
              ? <img src={userInfo.imageUrl} className="w-full h-full object-cover opacity-80" alt="" />
              : <span className="text-2xl font-black text-cyan-400">{(userInfo?.name?.[0] || 'P').toUpperCase()}</span>
            }
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-base truncate">{userInfo?.name || 'Player'}</h3>
          <div className="inline-flex items-center gap-1.5 bg-yellow-500/15 px-2 py-0.5 rounded text-yellow-300 text-[10px] font-bold tracking-widest mt-1 border border-yellow-400/30">
            ⚔️ LEAGUE STAGE
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="block text-[10px] text-white/40">Status</span>
          <span className="text-[11px] font-bold text-amber-300">Qualification Pending</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        <StatBox label="Played" value={state.matchesPlayed} sub="/ 3" />
        <StatBox label="Wins" value={state.wins} color="text-green-400" />
        <StatBox label="Losses" value={state.losses} color="text-red-400" />
        <StatBox label="Points" value={state.totalPoints.toFixed(2)} color="text-yellow-400" />
      </div>

      {/* Match History */}
      <h4 className="font-bold text-xs text-white/50 mb-2.5 flex items-center gap-1.5 uppercase tracking-widest">
        <Swords size={12} /> Match History
      </h4>

      <div className="space-y-2.5 mb-6">
        {[1, 2, 3].map(num => {
          const res = state.matchResults.find(m => m.matchNum === num);
          if (res) {
            return (
              <div key={num} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${res.outcome === 'win' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : res.outcome === 'draw' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                  {res.outcome === 'win' ? 'W' : res.outcome === 'draw' ? 'D' : 'L'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">vs {res.opponentName}</div>
                  <div className="text-[10px] text-white/40">Match {num}</div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`block text-base font-black ${res.netPoints >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {res.netPoints >= 0 ? '+' : ''}{res.netPoints.toFixed(2)}
                  </span>
                  <button onClick={() => onViewMatch(res)} className="text-[10px] text-cyan-400 underline underline-offset-2">Details</button>
                </div>
              </div>
            );
          }
          return (
            <div key={num} className="bg-white/[0.02] border border-white/5 border-dashed rounded-xl p-4 flex items-center justify-center">
              <span className="text-xs font-bold text-white/20">MATCH {num} • PENDING</span>
            </div>
          );
        })}
      </div>

      {!allDone ? (
        <button
          onClick={onPlay}
          disabled={simulating}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100 shadow-[0_0_20px_rgba(8,145,178,0.3)]"
        >
          {simulating ? <Loader2 className="animate-spin" size={20} /> : <PlayCircle size={20} />}
          {simulating ? 'Finding Match...' : `PLAY MATCH ${state.matchesPlayed + 1}`}
        </button>
      ) : (
        <button
          onClick={onCheckResult}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-black flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_0_25px_rgba(250,204,21,0.4)]"
        >
          VIEW QUALIFICATION RESULT <ArrowRight size={18} />
        </button>
      )}
    </motion.div>
  );
}

/* ─── Review (Pending) Screen ────────────────────────────────────────────────── */

function ReviewScreen({
  state,
  onReveal,
}: {
  state: TournamentState;
  onReveal: (threshold: number) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const thresholdRef = useRef<number>(parseFloat((Math.random() * 6 + 8).toFixed(1)));

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 3000);
    return () => clearTimeout(t);
  }, []);

  if (!revealed) {
    return (
      <motion.div
        key="pending"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-[80vh] px-6 text-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="relative mb-8"
        >
          <div className="w-24 h-24 rounded-full border-4 border-t-yellow-400 border-r-yellow-400/30 border-b-yellow-400/10 border-l-yellow-400/60" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Clock size={28} className="text-yellow-400" />
          </div>
        </motion.div>

        <h2 className="text-xl font-black italic tracking-widest text-white mb-3">
          Qualification Pending...
        </h2>
        <p className="text-white/60 text-sm leading-relaxed max-w-[260px]">
          Your performance is being reviewed.
        </p>

        <div className="mt-8 flex gap-1">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.4 }}
              className="w-2 h-2 rounded-full bg-yellow-400"
            />
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="review-done"
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex flex-col items-center justify-center h-[80vh] px-6 text-center"
    >
      <div className="w-16 h-16 rounded-full bg-yellow-500/20 border border-yellow-400/50 flex items-center justify-center mb-5">
        <CheckCircle2 size={30} className="text-yellow-400" />
      </div>
      <h2 className="text-xl font-black italic tracking-widest text-white mb-2">Review Complete</h2>
      <p className="text-white/50 text-sm mb-8">আপনার লিগ পারফরম্যান্স যাচাই হয়েছে।</p>
      <button
        onClick={() => onReveal(thresholdRef.current)}
        className="w-full max-w-xs py-4 rounded-2xl bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-black text-sm tracking-wider active:scale-95 transition-transform shadow-[0_0_25px_rgba(250,204,21,0.4)] flex items-center justify-center gap-2"
      >
        SEE RESULT <ArrowRight size={16} />
      </button>
    </motion.div>
  );
}

/* ─── Qualification Result Screen ────────────────────────────────────────────── */

function QualificationResultScreen({
  state,
  onProceed,
}: {
  state: TournamentState;
  onProceed: () => void;
}) {
  const threshold = state.qualificationThreshold ?? 11.3;
  const points = state.totalPoints;
  const qualified = points >= threshold;
  const diff = Math.abs(points - threshold);

  return (
    <motion.div
      key="qual-result"
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', bounce: 0.3 }}
      className="flex flex-col items-center justify-center px-5 pb-10 pt-6"
    >
      {qualified ? (
        /* ── QUALIFIED ── */
        <>
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
            className="relative mb-6"
          >
            <div className="absolute inset-0 bg-green-500 blur-[60px] opacity-25 rounded-full" />
            <div className="w-28 h-28 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center relative z-10 shadow-[0_0_30px_rgba(74,222,128,0.4)]">
              <Crown size={52} className="text-green-400" />
            </div>
          </motion.div>

          <p className="text-2xl mb-1">🎉</p>
          <h1 className="text-3xl font-black italic tracking-widest text-green-400 mb-2 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]">
            Congratulations!
          </h1>

          <GlassPanel className="w-full mb-6" glow="shadow-[0_0_20px_rgba(74,222,128,0.1)] border-green-500/30">
            <div className="flex justify-between items-center py-3 border-b border-white/10">
              <span className="text-white/60 text-sm">Your Points</span>
              <span className="font-black text-yellow-400 text-xl">{points.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-white/60 text-sm">Status</span>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-green-400" />
                <span className="font-black text-green-400">Qualified ✅</span>
              </div>
            </div>
          </GlassPanel>

          <div className="w-full bg-gradient-to-r from-green-500/10 via-emerald-500/5 to-transparent border border-green-400/20 rounded-2xl p-4 mb-6 text-center">
            <p className="text-green-300 font-bold text-sm">See You In Knockout Stage 🏆</p>
          </div>

          <button
            onClick={onProceed}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black text-base flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_0_25px_rgba(74,222,128,0.35)]"
          >
            PROCEED TO KNOCKOUT <ArrowRight size={18} />
          </button>
        </>
      ) : (
        /* ── NOT QUALIFIED ── */
        <>
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-red-500 blur-[60px] opacity-20 rounded-full" />
            <div className="w-28 h-28 rounded-full bg-red-500/15 border-2 border-red-500/60 flex items-center justify-center relative z-10">
              <XCircle size={52} className="text-red-400" />
            </div>
          </div>

          <h1 className="text-2xl font-black italic tracking-widest text-white mb-1">
            Tournament Finished
          </h1>

          <GlassPanel className="w-full mb-4">
            <div className="flex justify-between items-center py-3 border-b border-white/10">
              <span className="text-white/60 text-sm">Your Points</span>
              <span className="font-black text-yellow-400 text-xl">{points.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-white/10">
              <span className="text-white/60 text-sm">Qualified Score</span>
              <span className="font-bold text-white">{threshold.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-white/10">
              <span className="text-white/60 text-sm">Difference</span>
              <span className="font-bold text-red-400">-{diff.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-white/60 text-sm">Status</span>
              <div className="flex items-center gap-1.5">
                <XCircle size={15} className="text-red-400" />
                <span className="font-black text-red-400">Not Qualified ❌</span>
              </div>
            </div>
          </GlassPanel>

          <p className="text-white/50 text-sm mb-6">Better Luck Next Time.</p>

          <button
            onClick={onProceed}
            className="w-full py-4 rounded-2xl bg-white/10 border border-white/20 text-white font-black active:scale-95 transition-transform hover:bg-white/15"
          >
            FINISH
          </button>
        </>
      )}
    </motion.div>
  );
}

/* ─── Knockout Stage ─────────────────────────────────────────────────────────── */

function KnockoutStage({
  state,
  onPlay,
  onRestart,
  simulating,
}: {
  state: TournamentState;
  onPlay: () => void;
  onRestart: () => void;
  simulating: boolean;
}) {

  if (state.phase === 'champion') {
    return (
      <motion.div
        key="champion"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-screen px-6 text-center"
      >
        <motion.div
          animate={{ scale: [1, 1.12, 1], rotate: [0, 4, -4, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="relative mb-6"
        >
          <div className="absolute inset-0 bg-yellow-400 blur-[80px] opacity-40 rounded-full" />
          <Trophy size={160} className="text-yellow-400 relative z-10 drop-shadow-[0_0_40px_rgba(250,204,21,1)]" />
        </motion.div>
        <h1
          className="text-5xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 via-yellow-400 to-amber-600 mb-3 drop-shadow-xl"
          style={{ WebkitTextStroke: '1px rgba(250,204,21,0.5)' }}
        >
          CHAMPION!
        </h1>
        <p className="text-white/70 mb-10 max-w-[260px]">অসাধারণ! আপনি সকল রাউন্ড জিতে চ্যাম্পিয়ন হয়েছেন।</p>
        <button
          onClick={onRestart}
          className="px-10 py-3.5 bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-black rounded-2xl active:scale-95 transition-all shadow-[0_0_30px_rgba(250,204,21,0.4)]"
        >
          PLAY AGAIN
        </button>
      </motion.div>
    );
  }

  if (state.phase === 'eliminated') {
    return (
      <motion.div
        key="eliminated"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-screen px-6 text-center"
      >
        <Skull size={90} className="text-red-500/60 mb-5 drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]" />
        <h1 className="text-4xl font-black italic tracking-widest text-red-500 mb-2">ELIMINATED</h1>
        <p className="text-white/50 mb-10 max-w-[250px]">
          আপনি টুর্নামেন্ট থেকে ছিটকে গেছেন। পরের টুর্নামেন্টে আবার চেষ্টা করুন।
        </p>
        <button
          onClick={onRestart}
          className="w-full max-w-xs py-4 bg-gradient-to-r from-red-600 to-rose-600 rounded-2xl font-bold active:scale-95 shadow-[0_0_20px_rgba(225,29,72,0.3)]"
        >
          START NEW TOURNAMENT
        </button>
      </motion.div>
    );
  }

  // Knockout bracket
  const currentOpponent = getRandomOpponent();

  return (
    <motion.div
      key="bracket"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="px-4 pb-28"
    >
      <div className="text-center mb-6 mt-2">
        <div className="inline-flex items-center gap-2 bg-red-500/15 border border-red-400/30 rounded-full px-4 py-1.5 mb-3">
          <Zap size={13} className="text-red-400" />
          <span className="text-xs font-bold text-red-300 tracking-widest">KNOCKOUT STAGE</span>
        </div>
        <p className="text-xs text-white/40">হারলেই বাদ! জিতলে পরের রাউন্ড।</p>
      </div>

      {/* Bracket Flow */}
      <div className="relative mb-8">
        {/* Vertical connector */}
        <div className="absolute left-[19px] top-5 bottom-5 w-0.5 bg-white/10" />

        <div className="space-y-3">
          {KNOCKOUT_ROUNDS.map((r, i) => {
            const isCompleted = state.knockoutHistory.includes(r);
            const isCurrent = state.knockoutRound === r;
            const isFuture = !isCompleted && !isCurrent;

            let RoundIcon = Shield;
            if (r === 'quarter-final') RoundIcon = Swords;
            else if (r === 'semi-final') RoundIcon = Star;
            else if (r === 'final') RoundIcon = Trophy;

            return (
              <div key={r} className="flex items-center gap-3 relative">
                {/* Dot */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 transition-all ${
                  isCompleted ? 'bg-green-500/25 border-2 border-green-500 text-green-400 shadow-[0_0_10px_rgba(74,222,128,0.3)]' :
                  isCurrent   ? 'bg-cyan-500/25 border-2 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.5)]' :
                                'bg-white/5 border border-white/10 text-white/25'
                }`}>
                  {isCompleted ? <CheckCircle2 size={16} /> : <RoundIcon size={16} />}
                </div>

                {/* Card */}
                <div className={`flex-1 rounded-xl border p-3 transition-all ${
                  isCurrent   ? 'bg-cyan-950/50 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]' :
                  isCompleted ? 'bg-green-950/20 border-green-500/20 opacity-80' :
                                'bg-white/[0.03] border-white/8 opacity-40'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`font-black text-sm uppercase ${isCurrent ? 'text-cyan-300' : isCompleted ? 'text-green-400' : 'text-white/40'}`}>
                        {ROUND_LABELS[r]}
                      </h4>
                      <p className="text-[10px] text-white/40 mt-0.5">
                        {isCompleted ? '✅ Won' : isCurrent ? `vs ${currentOpponent}` : 'TBD'}
                      </p>
                    </div>
                    {isCurrent && (
                      <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-400/30 rounded-full px-2 py-0.5 animate-pulse">
                        NOW
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Champion final row */}
          <div className="flex items-center gap-3 relative">
            <div className="w-10 h-10 rounded-full bg-yellow-500/10 border border-yellow-400/20 flex items-center justify-center shrink-0 z-10 text-yellow-400/40">
              <Crown size={16} />
            </div>
            <div className="flex-1 rounded-xl border border-yellow-400/10 p-3 opacity-40 bg-yellow-950/10">
              <h4 className="font-black text-sm text-yellow-400/60 uppercase">Champion 🏆</h4>
              <p className="text-[10px] text-white/30 mt-0.5">Final destination</p>
            </div>
          </div>
        </div>
      </div>

      {/* Play Button */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-gradient-to-t from-[#050818] to-transparent">
        <button
          onClick={onPlay}
          disabled={simulating}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100 shadow-[0_0_25px_rgba(8,145,178,0.4)] text-base"
        >
          {simulating ? <Loader2 className="animate-spin" size={20} /> : <PlayCircle size={20} />}
          {simulating
            ? 'FINDING MATCH...'
            : `PLAY ${ROUND_LABELS[state.knockoutRound!]?.toUpperCase()}`
          }
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Match Result Modal ─────────────────────────────────────────────────────── */

function MatchResultModal({ result, onClose }: { result: MatchResult; onClose: () => void }) {
  const outcomeColor = result.outcome === 'win' ? 'green' : result.outcome === 'draw' ? 'blue' : 'red';
  const colorMap = {
    green: { bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-400' },
    blue:  { bg: 'bg-blue-500/20',  border: 'border-blue-500/30',  text: 'text-blue-400'  },
    red:   { bg: 'bg-red-500/20',   border: 'border-red-500/30',   text: 'text-red-400'   },
  }[outcomeColor];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', bounce: 0.25 }}
        className="bg-[#121424] border border-white/10 rounded-2xl w-full max-w-sm relative z-10 overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className={`p-5 text-center ${colorMap.bg} border-b ${colorMap.border}`}>
          <div className="text-xs font-bold opacity-60 mb-1 uppercase tracking-widest">
            {result.matchNum ? `Match ${result.matchNum} Result` : 'Match Result'}
          </div>
          <div className={`text-3xl font-black uppercase mb-0.5 ${colorMap.text}`}>
            {result.outcome === 'win' ? '🏆 YOU WON' : result.outcome === 'draw' ? '🤝 DRAW' : '💀 YOU LOST'}
          </div>
          <div className="text-sm text-white/60">vs {result.opponentName}</div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-white/60">Base Points</span>
            <span className="font-bold text-white">{result.basePoints >= 0 ? '+' : ''}{result.basePoints.toFixed(2)}</span>
          </div>

          {result.killBonuses.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-white/40 text-[10px] block uppercase tracking-widest">Kill Bonuses</span>
              {result.killBonuses.map((kb, i) => (
                <div key={i} className="flex justify-between text-xs pl-3 border-l-2 border-green-500/40">
                  <span className="text-green-300">Killed {kb.victimName} <span className="text-white/40">({kb.progressPct === 100 ? '1 step before finish' : `${kb.progressPct}%`})</span></span>
                  <span className="font-bold text-green-400">+{kb.bonus.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {result.penalties > 0 && (
            <div className="space-y-1.5">
              <span className="text-white/40 text-[10px] block uppercase tracking-widest">Penalties</span>
              <div className="flex justify-between text-xs pl-3 border-l-2 border-red-500/40">
                <span className="text-red-300">Token cut by opponent</span>
                <span className="font-bold text-red-400">-{result.penalties.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-between text-base font-black border-t border-white/15 pt-3 mt-1">
            <span className="text-white/80">Net Points</span>
            <span className={result.netPoints >= 0 ? 'text-yellow-400' : 'text-red-400'}>
              {result.netPoints >= 0 ? '+' : ''}{result.netPoints.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="p-4 border-t border-white/5 bg-[#0a0b14]">
          <button
            onClick={onClose}
            className="w-full py-3 bg-white/10 hover:bg-white/15 rounded-xl font-bold transition-colors text-sm"
          >
            CONTINUE
          </button>
        </div>
      </motion.div>
    </div>
  );
}
