import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Eye, Flame, Loader2,
  Radio, RefreshCw, Signal, Users, X,
} from 'lucide-react';
import { useSocialSocket, type SpectatorGameState } from '../hooks/useSocialSocket';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export type LiveMatchStatus = 'upcoming' | 'live' | 'finished';
export type LiveMatch = {
  id: string;
  stage: string;
  matchNumber: number;
  startsAt: string;
  status: LiveMatchStatus;
  spectatorCount: number;
};
export type LiveTournamentPayload = {
  tournamentId: string;
  tournamentName: string;
  stage: string;
  stageLabel: string;
  matches: LiveMatch[];
  currentMatchId: string | null;
  serverTime: string;
};

type Props = {
  onBack: () => void;
  userId?: string;
};

async function liveRequest<T>(stage?: string): Promise<T> {
  const query = stage ? `?stage=${encodeURIComponent(stage)}` : '';
  const response = await fetch(`${basePath}/api/tournament/live${query}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'লাইভ টুর্নামেন্ট পাওয়া যায়নি');
  return body as T;
}

function stageName(stage: string) {
  return stage === 'round-of-128' ? 'ROUND OF 128' : stage === 'round-of-32' ? 'ROUND OF 32' : stage.replaceAll('-', ' ').toUpperCase();
}

function relativeTime(startsAt: string, now: number) {
  const delta = new Date(startsAt).getTime() - now;
  if (delta <= 0) return 'এখন চলছে';
  const minutes = Math.max(1, Math.ceil(delta / 60000));
  return `${minutes} মিনিট পরে`;
}

function MatchGlyph({ status }: { status: LiveMatchStatus }) {
  if (status === 'live') return <Radio size={16} className="text-[#ff5d5d]" />;
  if (status === 'finished') return <span className="text-[10px] font-black text-white/35">END</span>;
  return <span className="text-[10px] font-black text-[#9da4bf]">UP</span>;
}

function GameBoard({ game }: { game: SpectatorGameState | null }) {
  if (!game) {
    return (
      <div className="flex aspect-square w-full max-w-[430px] items-center justify-center rounded-[28px] border border-dashed border-white/12 bg-[#101426] px-8 text-center shadow-[0_20px_70px_rgba(0,0,0,.28)]">
        <div>
          <Signal size={26} className="mx-auto mb-3 text-white/25" />
          <p className="text-sm font-bold text-white/55">সার্ভারের live game state এখনো আসেনি</p>
          <p className="mt-1 text-xs text-white/30">বাস্তব ম্যাচ শুরু হলে বোর্ড এখানে দেখা যাবে</p>
        </div>
      </div>
    );
  }

  const players = game?.players ?? [];
  const colors = ['#ff5d5d', '#5dd6b0', '#66a8ff', '#f7c85b'];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[430px] overflow-hidden rounded-[28px] border border-[#ff6a5f]/25 bg-[#101426] p-3 shadow-[0_20px_70px_rgba(0,0,0,.45)]">
      <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)', backgroundSize: '12.5% 12.5%' }} />
      <div className="relative grid h-full grid-cols-2 grid-rows-2 gap-2 rounded-2xl border border-white/10 bg-[#151a2e] p-2">
        {colors.map((color, index) => (
          <motion.div
            key={color}
            animate={{ opacity: players[index] ? 1 : 0.42 }}
            className="relative rounded-2xl border p-3"
            style={{ borderColor: `${color}55`, background: `${color}12` }}
          >
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: color, boxShadow: `0 0 14px ${color}` }} />
              <span className="max-w-[90px] truncate text-[10px] font-bold text-white/80">{players[index]?.displayName ?? 'অপেক্ষায়'}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map(token => <span key={token} className="h-5 w-5 rounded-full border-2 border-white/25" style={{ background: `${color}bb` }} />)}
            </div>
          </motion.div>
        ))}
        <div className="absolute left-1/2 top-1/2 flex h-[27%] w-[27%] -translate-x-1/2 -translate-y-1/2 rotate-45 items-center justify-center rounded-xl border border-[#ff6a5f]/35 bg-[#202640]">
          <div className="-rotate-45 text-center"><Flame size={22} className="mx-auto text-[#ff6a5f]" /><span className="mt-1 block text-[9px] font-black tracking-widest text-white/50">LIVE</span></div>
        </div>
      </div>
    </div>
  );
}

export function LiveTournamentScreen({ onBack }: Props) {
  const [payload, setPayload] = useState<LiveTournamentPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [game, setGame] = useState<SpectatorGameState | null>(null);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const selectedMatch = useMemo(() => payload?.matches.find(match => match.id === selectedId) ?? null, [payload, selectedId]);
  const selectedRoomId = selectedMatch && payload ? `${payload.tournamentId}:${selectedMatch.id}` : null;
  const joinedRoomRef = React.useRef<string | null>(null);
  const handleCount = useCallback((roomId: string, count: number) => {
    setPayload(current => current ? { ...current, matches: current.matches.map(match => `${current.tournamentId}:${match.id}` === roomId ? { ...match, spectatorCount: count } : match) } : current);
  }, []);
  const handleGame = useCallback((roomId: string, nextGame: SpectatorGameState) => {
    if (roomId === selectedRoomId) setGame(nextGame);
  }, [selectedRoomId]);
  const handleSocketError = useCallback((message: string) => setError(message), []);
  const { connected, joinSpectator, leaveSpectator } = useSocialSocket({
    enabled: true,
    onSpectatorCount: handleCount,
    onSpectatorGameState: handleGame,
    onError: handleSocketError,
  });

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const next = await liveRequest<LiveTournamentPayload>(payload?.stage);
      setPayload(next);
      setSelectedId(current => current && next.matches.some(item => item.id === current) ? current : next.currentMatchId);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'লাইভ ম্যাচ লোড করা যায়নি');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [payload?.stage]);

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setGame(null);
    const previousRoomId = joinedRoomRef.current;
    if (previousRoomId && previousRoomId !== selectedRoomId) {
      leaveSpectator(previousRoomId);
      joinedRoomRef.current = null;
      setJoined(false);
    }
  }, [selectedRoomId, leaveSpectator]);

  useEffect(() => () => {
    if (joinedRoomRef.current) leaveSpectator(joinedRoomRef.current);
  }, [leaveSpectator]);

  useEffect(() => {
    if (connected && joined && selectedRoomId) joinSpectator(selectedRoomId);
  }, [connected, joined, selectedRoomId, joinSpectator]);

  const toggleJoin = () => {
    if (!selectedRoomId) return;
    if (joined) {
      leaveSpectator(selectedRoomId);
      joinedRoomRef.current = null;
      setJoined(false);
    } else {
      joinSpectator(selectedRoomId);
      joinedRoomRef.current = selectedRoomId;
      setJoined(true);
    }
  };

  if (loading) return (
    <div className="min-h-[100dvh] bg-[#090b18] px-4 py-5 text-white">
      <div className="mx-auto max-w-5xl animate-pulse space-y-4"><div className="h-9 w-44 rounded-lg bg-white/10" /><div className="h-32 rounded-3xl bg-white/10" /><div className="h-80 rounded-3xl bg-white/10" /></div>
    </div>
  );
  if (error && !payload) return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#090b18] px-5 text-center text-white">
      <div className="max-w-sm rounded-3xl border border-[#ff6a5f]/25 bg-[#14182a] p-7"><AlertTriangle size={34} className="mx-auto mb-3 text-[#ff6a5f]" /><h2 className="text-lg font-black">লাইভ এখনো প্রস্তুত নয়</h2><p className="mt-2 text-sm text-white/50">{error}</p><div className="mt-5 flex gap-2"><button data-testid="button-live-retry" onClick={() => void load()} className="flex-1 rounded-xl bg-[#ff5d5d] py-2.5 text-xs font-black text-[#190b12]">আবার চেষ্টা</button><button data-testid="button-live-back-error" onClick={onBack} className="flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-bold">ফিরে যান</button></div></div>
    </div>
  );
  if (!payload) return null;
  const liveCount = payload.matches.filter(match => match.status === 'live').length;

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#090b18] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-70" style={{ background: 'radial-gradient(circle at 15% 0%, rgba(255,93,93,.17), transparent 32%), radial-gradient(circle at 90% 35%, rgba(247,200,91,.10), transparent 28%)' }} />
      <main className="relative mx-auto max-w-5xl px-4 pb-8 pt-4 sm:px-6">
        <header className="flex items-center justify-between">
          <button data-testid="button-live-back" onClick={onBack} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/75"><ChevronLeft size={16} /> টুর্নামেন্ট</button>
           <div className="flex items-center gap-2 text-[10px] font-black tracking-[.18em] text-white/40"><Signal size={14} className={connected ? 'text-[#5dd6b0]' : 'text-[#f7c85b]'} /> {connected ? 'LIVE LINK' : 'CONNECTING'}</div>
        </header>
        <section className="mt-5 overflow-hidden rounded-[28px] border border-[#ff6a5f]/30 bg-[#151329] p-5 shadow-[0_20px_80px_rgba(255,93,93,.12)] sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><div className="flex items-center gap-2 text-[11px] font-black tracking-[.22em] text-[#ff8173]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#ff5d5d]" /> ON AIR</div><h1 className="mt-2 text-3xl font-black italic tracking-tight sm:text-5xl">{payload.tournamentName}</h1><p className="mt-1 text-sm font-bold text-white/45">{stageName(payload.stage)} <span className="mx-1 text-white/20">/</span> {payload.stageLabel}</p></div>
            <div className="rounded-2xl border border-[#f7c85b]/20 bg-[#f7c85b]/10 px-4 py-3 text-right"><span className="block text-2xl font-black text-[#f7c85b]">{liveCount}</span><span className="text-[10px] font-bold uppercase tracking-widest text-[#f7c85b]/60">ম্যাচ লাইভ</span></div>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs text-white/45"><Eye size={15} className="text-[#f7c85b]" /> অর্ডার করা ফিড · দর্শকরা সঙ্গে সঙ্গে আপডেট হয়</div>
        </section>
        {error && <div className="mt-3 rounded-xl border border-[#f7c85b]/20 bg-[#f7c85b]/10 px-3 py-2 text-xs text-[#f7c85b]">{error}</div>}
        <div className="mt-5 grid gap-5 lg:grid-cols-[240px_1fr]">
          <aside className="rounded-3xl border border-white/10 bg-[#111427]/80 p-3">
            <div className="flex items-center justify-between px-2 pb-2"><span className="text-xs font-black tracking-widest text-white/50">MATCH FEED</span><button data-testid="button-live-refresh" onClick={() => void load(true)} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10">{refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}</button></div>
            <div className="space-y-1.5">{payload.matches.map(match => <button data-testid={`button-match-${match.id}`} key={match.id} onClick={() => setSelectedId(match.id)} className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${selectedId === match.id ? 'border-[#ff6a5f]/60 bg-[#ff5d5d]/15' : 'border-transparent bg-white/[.025] hover:bg-white/[.06]'}`}><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${match.status === 'live' ? 'bg-[#ff5d5d]/20' : 'bg-white/5'}`}><MatchGlyph status={match.status} /></div><span className="min-w-0 flex-1"><span className="block text-xs font-black">ম্যাচ {match.matchNumber}</span><span className={`block text-[10px] ${match.status === 'live' ? 'text-[#ff8173]' : 'text-white/35'}`}>{match.status === 'live' ? 'এখন লাইভ' : match.status === 'finished' ? 'শেষ হয়েছে' : relativeTime(match.startsAt, now)}</span></span><span className="text-[10px] font-bold text-white/40"><Users size={11} className="mr-1 inline" />{match.spectatorCount}</span></button>)}</div>
          </aside>
          <section className="min-w-0">
              {selectedMatch ? <><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-black tracking-[.2em] text-[#ff8173]">MATCH {String(selectedMatch.matchNumber).padStart(2, '0')}</p><h2 className="mt-1 text-2xl font-black">{selectedMatch.status === 'live' ? 'মাঠে লড়াই চলছে' : selectedMatch.status === 'upcoming' ? 'পরের ম্যাচ' : 'ম্যাচ শেষ'}</h2></div><div className="text-right"><span className="flex items-center justify-end gap-1 text-xs font-bold text-white/55"><Users size={14} /> {selectedMatch.spectatorCount} দেখছে</span><span className="mt-1 block text-[10px] text-white/30">{new Date(selectedMatch.startsAt).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}</span></div></div><GameBoard game={selectedMatch.status === 'live' ? game : null} /><div className="mt-4 flex gap-2"><button data-testid="button-spectate-toggle" onClick={toggleJoin} disabled={selectedMatch.status !== 'live' || !connected} className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black transition-all active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-35 ${joined ? 'border border-[#ff5d5d]/40 bg-[#ff5d5d]/15 text-[#ff8173]' : 'bg-[#ff5d5d] text-[#190b12] shadow-[0_8px_28px_rgba(255,93,93,.24)]'}`}>{joined ? <><X size={16} /> বেরিয়ে যান</> : <><Eye size={16} /> ম্যাচে ঢুকুন</>}</button><button data-testid="button-next-match" onClick={() => { const index = payload.matches.findIndex(item => item.id === selectedMatch.id); const next = payload.matches[index + 1] ?? payload.matches[0]; setSelectedId(next.id); }} className="rounded-2xl border border-white/10 bg-white/5 px-4 text-white/70"><ChevronRight size={18} /></button></div></> : <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-sm text-white/45">কোনো ম্যাচ নেই</div>}
          </section>
        </div>
      </main>
    </div>
  );
}