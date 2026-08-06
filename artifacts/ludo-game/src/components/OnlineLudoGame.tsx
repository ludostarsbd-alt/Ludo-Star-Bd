import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@clerk/react';
import { AlertCircle, CheckCircle2, Loader2, LogOut, Wifi, WifiOff } from 'lucide-react';
import { LudoBoard } from './LudoBoard';
import { DiceDisplay } from './DiceDisplay';
import { COLORS, type GameState, type PlayerColor } from '../types/ludo';
import { getVisualCornerOrder } from '../lib/ludo-perspective';
import type { GameStartConfig } from './HomeScreen';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const API_BASE = `${basePath}/api`;

type RoomSeat = {
  clerkUserId: string;
  displayName: string;
  color: PlayerColor;
  seatIndex: number;
  isReady: boolean;
};

type MultiplayerRoom = {
  id: string;
  code: string;
  mode: string;
  maxPlayers: number;
  status: string;
  powerSixEnabled?: boolean;
  seats: RoomSeat[];
};

type ServerToken = { position: number; distanceTravelled: number };
type ServerPlayer = {
  clerkUserId: string;
  displayName: string;
  color: PlayerColor;
  tokens: [ServerToken, ServerToken, ServerToken, ServerToken];
  isFinished: boolean;
};
type ServerGame = {
  roomId: string;
  players: ServerPlayer[];
  currentColorIndex: number;
  diceValue: number | null;
  powerSixEnabled: boolean;
  powerSixCycleCount: Record<PlayerColor, number>;
  phase: 'rolling' | 'moving' | 'finished';
  winnerId: string | null;
  winnerColor: PlayerColor | null;
  turnNumber: number;
  lastEvent: { message: string } | null;
};

type UserInfo = { id: string; name: string; imageUrl: string | null };

function toRelativePosition(color: PlayerColor, position: number): number {
  if (position < 0) return -1;
  if (position >= 100 && position < 106) return 51 + (position - 100);
  if (position >= 106) return 56;
  const entry: Record<PlayerColor, number> = { red: 0, green: 13, blue: 26, yellow: 39 };
  return (position - entry[color] + 52) % 52;
}

function toBoardState(game: ServerGame): GameState {
  const names: Record<PlayerColor, string> = {
    red: 'Player 1',
    yellow: 'Player 2',
    blue: 'Player 3',
    green: 'Player 4',
  };
  const pieces: Record<PlayerColor, number[]> = {
    red: [-1, -1, -1, -1],
    green: [-1, -1, -1, -1],
    blue: [-1, -1, -1, -1],
    yellow: [-1, -1, -1, -1],
  };

  for (const player of game.players) {
    names[player.color] = player.displayName;
    pieces[player.color] = player.tokens.map((token) =>
      toRelativePosition(player.color, token.position),
    );
  }

  const currentPlayer = game.players[game.currentColorIndex]?.color ?? game.players[0]?.color ?? 'red';
  const activePlayers = game.players.map((player) => player.color);
  const eventMessage = game.lastEvent?.message ?? `${names[currentPlayer]}-এর চাল!`;

  return {
    pieces,
    currentPlayer,
    diceValue: game.diceValue,
    diceRolled: game.phase === 'moving',
    winner: game.winnerColor,
    message: eventMessage,
    rollingAnim: false,
    isAnimating: false,
    history: game.lastEvent ? [eventMessage] : [`${names[currentPlayer]}-এর চাল!`],
    playerNames: names,
    activePlayers,
    animPiece: null,
    teamMode: false,
    consecutiveSixes: 0,
    powerSixCycleCount: game.powerSixCycleCount ?? { red: -1, green: -1, blue: -1, yellow: -1 },
  };
}

function roomFromConfig(config: GameStartConfig): MultiplayerRoom | null {
  return config.room ?? null;
}

function initialPerspective(room: MultiplayerRoom | null, userId: string): PlayerColor | null {
  return room?.seats.find((seat) => seat.clerkUserId === userId)?.color ?? null;
}

export function OnlineLudoGame({
  userInfo,
  initialConfig,
  onBack,
  onOpenPlayerProfile,
}: {
  userInfo: UserInfo;
  initialConfig: GameStartConfig;
  onBack: () => void;
  onOpenPlayerProfile?: (playerId: string) => void;
}) {
  const { getToken } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [room, setRoom] = useState<MultiplayerRoom | null>(() => roomFromConfig(initialConfig));
  const [game, setGame] = useState<ServerGame | null>(null);
  // This is deliberately write-once for the lifetime of the match. Do not
  // seed it from initialConfig.room: that snapshot can be stale or client
  // supplied. The server's room:joined/game payload is authoritative.
  const [perspective, setPerspective] = useState<PlayerColor | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;

    void (async () => {
      try {
        const token = await getToken();
        if (cancelled) return;
        if (!token) {
          setError('অনলাইন গেমের জন্য authenticated session token পাওয়া যায়নি।');
          return;
        }

        socket = io(window.location.origin, {
          path: `${basePath}/api/ws/socket.io`,
          withCredentials: true,
          transports: ['websocket', 'polling'],
          auth: { token },
        });
        socketRef.current = socket;

        const updateRoom = (nextRoom: MultiplayerRoom) => {
          if (!cancelled) setRoom(nextRoom);
        };
        const updateGame = (payload: { game: ServerGame }) => {
          if (!cancelled && payload.game) {
            setGame(payload.game);
            setPerspective((current) =>
              current ?? payload.game.players.find((player) => player.clerkUserId === userInfo.id)?.color ?? null,
            );
          }
        };

        socket.on('connect', () => {
          if (cancelled) return;
          setConnected(true);
          setError('');
          socket?.emit('room:join', {
            roomId: initialConfig.roomId,
          });
        });
        socket.on('disconnect', () => setConnected(false));
        socket.on('connect_error', async () => {
          if (!cancelled) setError('অনলাইন সার্ভারে সংযোগ করা যাচ্ছে না। আবার চেষ্টা করুন।');
          try {
            const refreshedToken = await getToken();
            if (refreshedToken && socket) socket.auth = { token: refreshedToken };
          } catch {
            // The visible connection error is the actionable state.
          }
        });
        socket.on('room:joined', (payload: { room: MultiplayerRoom; game: ServerGame | null }) => {
          updateRoom(payload.room);
          setPerspective((current) => current ?? initialPerspective(payload.room, userInfo.id));
          if (payload.game) updateGame({ game: payload.game });
        });
        socket.on('room:updated', (payload: { room: MultiplayerRoom }) => updateRoom(payload.room));
        socket.on('game:started', updateGame);
        socket.on('game:dice_rolled', updateGame);
        socket.on('game:moved', updateGame);
        socket.on('game:state', updateGame);
        socket.on('game:finished', updateGame);
        socket.on('error', (payload: { message?: string }) => {
          if (!cancelled) setError(payload.message ?? 'অনলাইন গেমে একটি সমস্যা হয়েছে।');
        });
      } catch {
        if (!cancelled) setError('অনলাইন authenticated session তৈরি করা যায়নি।');
      }
    })();

    return () => {
      cancelled = true;
      socket?.emit('room:leave');
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [getToken, initialConfig.roomId, userInfo.id, userInfo.name]);

  const boardState = useMemo(() => (game ? toBoardState(game) : null), [game]);
  const fixedPerspective =
    perspective ??
    game?.players.find((player) => player.clerkUserId === userInfo.id)?.color ??
    null;
  const currentServerPlayer = game?.players[game.currentColorIndex];
  const powerSixEnabled = Boolean(game?.powerSixEnabled ?? room?.powerSixEnabled);
  const isMyTurn =
    Boolean(currentServerPlayer && currentServerPlayer.clerkUserId === userInfo.id);
  const canRoll = Boolean(game && game.phase === 'rolling' && isMyTurn && connected);

  const emitRoll = () => {
    if (!canRoll || !initialConfig.roomId) return;
    socketRef.current?.emit('game:roll', {
      roomId: initialConfig.roomId,
    });
  };

  const emitMove = (player: PlayerColor, tokenIndex: number) => {
    if (
      !game ||
      game.phase !== 'moving' ||
      !isMyTurn ||
      currentServerPlayer?.color !== player ||
      !initialConfig.roomId
    ) return;
    socketRef.current?.emit('game:move', {
      roomId: initialConfig.roomId,
      tokenIndex,
    });
  };

  if (!game || !boardState) {
    const seats = room?.seats ?? [];
    const full = room ? seats.length >= room.maxPlayers : false;
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center px-4 text-white"
        style={{ background: 'transparent' }}>
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#060a1c]/90 p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-cyan-300 text-[10px] font-black uppercase tracking-[0.24em]">Online match</p>
              <h1 className="text-2xl font-black mt-1">Players খোঁজা হচ্ছে</h1>
            </div>
            <button onClick={onBack} className="rounded-full bg-white/10 p-2 text-white/70">
              <LogOut size={18} />
            </button>
          </div>
          <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-center mb-4">
            <p className="text-white/50 text-[10px] uppercase tracking-widest mb-2">Room Code</p>
            <p className="text-3xl font-black tracking-[0.25em] text-cyan-200">{room?.code ?? '------'}</p>
            <div className="flex justify-center items-center gap-2 mt-3 text-xs text-white/60">
              {connected ? <Wifi size={14} className="text-green-400" /> : <WifiOff size={14} className="text-amber-400" />}
              {connected ? 'Server connected' : 'Connecting to server…'}
            </div>
          </div>
          <div className="space-y-2 mb-5">
            {Array.from({ length: room?.maxPlayers ?? 2 }).map((_, index) => {
              const seat = seats[index];
              return (
                <div key={index} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm"
                    style={{ background: seat ? COLORS[seat.color].main : 'rgba(255,255,255,0.1)' }}>
                    {seat ? seat.displayName.slice(0, 1).toUpperCase() : '?'}
                  </span>
                  {seat ? (
                    <button
                      type="button"
                      onClick={() => onOpenPlayerProfile?.(seat.clerkUserId)}
                      className="text-left text-white font-bold text-sm hover:text-cyan-200"
                    >
                      {seat.displayName}
                    </button>
                  ) : (
                    <span className="text-white/30 text-sm">অন্য Player-এর অপেক্ষায়…</span>
                  )}
                  {seat && <CheckCircle2 size={15} className="ml-auto text-green-400" />}
                </div>
              );
            })}
          </div>
          {full && connected && (
            <div className="flex items-center justify-center gap-2 text-green-300 text-sm font-bold">
              <Loader2 size={16} className="animate-spin" /> গেম শুরু হচ্ছে…
            </div>
          )}
          {!full && (
            <p className="text-center text-white/40 text-xs leading-relaxed">
              এই screen খোলা রাখুন। একজন real player join করলেই<br />দুজনের জন্য একই game শুরু হবে।
            </p>
          )}
          {error && (
            <div className="mt-4 flex gap-2 items-start rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-red-200 text-xs">
              <AlertCircle size={15} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Never render an online board with a guessed perspective. A game payload
  // without this authenticated user's server seat is an identity/session
  // problem, not permission to display someone else's orientation.
  if (!fixedPerspective) {
    return (
      <div
        className="min-h-[100dvh] w-full flex items-center justify-center px-4 text-white"
        style={{ background: 'transparent' }}
      >
        <div className="w-full max-w-md rounded-3xl border border-red-400/30 bg-[#060a1c]/90 p-6 text-center shadow-2xl">
          <AlertCircle className="mx-auto mb-3 text-red-300" size={28} />
          <h1 className="text-xl font-black">Online match identity পাওয়া যায়নি</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Server এই authenticated player-এর seat নিশ্চিত করতে পারেনি। নিরাপত্তার জন্য board দেখানো হচ্ছে না।
          </p>
          <button
            onClick={onBack}
            className="mt-5 w-full rounded-xl bg-red-600 py-3 text-sm font-black text-white"
          >
            ফিরে যান
          </button>
        </div>
      </div>
    );
  }

  const visualCorners = getVisualCornerOrder(fixedPerspective);
  const renderPlayer = (color: PlayerColor) => {
    if (!boardState.activePlayers.includes(color)) return <div style={{ width: 155 }} />;
    const isActive = boardState.currentPlayer === color;
    const nextRollForced = powerSixEnabled && boardState.powerSixCycleCount[color] === 5;
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl px-2 py-2 min-w-[140px]"
        style={{
          border: `2px solid ${isActive ? COLORS[color].light : COLORS[color].main + '55'}`,
          background: isActive ? `linear-gradient(135deg, ${COLORS[color].main}, ${COLORS[color].dark})` : `${COLORS[color].dark}55`,
          boxShadow: isActive ? `0 0 18px 4px ${COLORS[color].main}66` : undefined,
        }}>
        <span className="w-8 h-8 rounded-md bg-white text-sm font-black flex items-center justify-center"
          style={{ color: COLORS[color].main }}>
          {boardState.playerNames[color].slice(0, 1).toUpperCase()}
        </span>
        <span className="text-[11px] font-black truncate">{boardState.playerNames[color]}</span>
        {isActive && (
          <div className="relative">
          <DiceDisplay value={boardState.diceValue} rolling={false}
            color={nextRollForced ? '#f59e0b' : COLORS[color].main}
            onClick={canRoll ? emitRoll : undefined} disabled={!canRoll} size={36} />
            {nextRollForced && (
              <span className="absolute -top-2 -right-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-black">
                6
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center px-4 py-1 overflow-hidden text-slate-100"
      style={{ background: 'transparent' }}>
      <div className="flex flex-col items-center gap-2 w-full"
        style={{ maxWidth: 'min(640px, calc(100dvh - 110px), calc(100vw - 32px))' }}>
        <div className="w-full flex justify-between px-1">{renderPlayer(visualCorners[0])}{renderPlayer(visualCorners[1])}</div>
        <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
          <LudoBoard state={boardState} onPieceClick={emitMove} perspective={fixedPerspective} />
          <button onClick={onBack} className="absolute top-2 left-2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-full bg-black/40 text-white/60 text-[10px] font-bold">
            <LogOut className="w-3.5 h-3.5" /> Leave
          </button>
          {!connected && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 rounded-full bg-amber-500/90 px-3 py-1 text-[10px] font-bold">
              Reconnecting…
            </div>
          )}
          {error && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 rounded-full bg-red-600/90 px-3 py-1 text-[10px] font-bold whitespace-nowrap">
              {error}
            </div>
          )}
        </div>
        <div className="w-full flex justify-between px-1">{renderPlayer(visualCorners[2])}{renderPlayer(visualCorners[3])}</div>
        <p className="text-white/50 text-[11px] font-semibold">{boardState.message}</p>
      </div>
    </div>
  );
}