import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@clerk/react';
import { AlertCircle, Check, CheckCircle2, Copy, Loader2, LogOut, Wifi, WifiOff } from 'lucide-react';
import { LudoBoard } from './LudoBoard';
import { DiceDisplay } from './DiceDisplay';
import { COLORS, type GameState, type PlayerColor } from '../types/ludo';
import { getVisualCornerOrder } from '../lib/ludo-perspective';
import type { GameStartConfig } from './HomeScreen';
import {
  playCaptureSound,
  playDiceRollSound,
  playHomeSound,
  playMoveStepSound,
  playWinSound,
} from '../lib/game-sounds';

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
  lastEvent: {
    type?: string;
    color?: PlayerColor;
    tokenIndex?: number;
    fromPos?: number;
    toPos?: number;
    capturedColor?: PlayerColor;
    capturedTokenIndex?: number;
    capturedFromPos?: number;
    diceValue?: number;
    message: string;
  } | null;
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

const SERVER_ENTRY: Record<PlayerColor, number> = { red: 0, green: 13, blue: 26, yellow: 39 };

function serverPositionPath(color: PlayerColor, fromPos: number, toPos: number, diceValue: number): number[] {
  if (fromPos < 0) return [toRelativePosition(color, toPos)];
  const fromRelative = toRelativePosition(color, fromPos);
  const toRelative = toRelativePosition(color, toPos);
  const steps = [];
  const entersHomeColumn = toPos >= 100;
  for (let index = 1; index <= Math.max(1, diceValue); index += 1) {
    if (entersHomeColumn || fromPos >= 100) {
      steps.push(Math.min(toRelative, fromRelative + index));
    } else {
      steps.push((fromRelative + index) % 52);
    }
  }
  return steps.length ? steps : [toRelative];
}

/**
 * A captured token returns through the same canonical track cells it occupied,
 * in reverse, before settling into its own home base. The server has already
 * applied the capture; this is only the local visual projection of that
 * authoritative transition.
 */
function serverCaptureReturnPath(color: PlayerColor, capturedFromPos: number): number[] {
  const relative = toRelativePosition(color, capturedFromPos);
  if (relative < 0) return [-1];
  const steps: number[] = [];
  for (let position = relative - 1; position >= 0; position -= 1) {
    steps.push(position);
  }
  steps.push(-1);
  return steps;
}

export function OnlineLudoGame({
  userInfo,
  initialConfig,
  onBack,
  onOpenPlayerProfile,
  onMatchFinished,
}: {
  userInfo: UserInfo;
  initialConfig: GameStartConfig;
  onBack: () => void;
  onOpenPlayerProfile?: (playerId: string) => void;
  onMatchFinished?: () => void;
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
  const [roomCodeCopied, setRoomCodeCopied] = useState(false);
  const [graceUntil, setGraceUntil] = useState<number | null>(null);
  const [, setGraceTick] = useState(0);
  const [turnDeadline, setTurnDeadline] = useState<{
    clerkUserId: string;
    phase: 'rolling' | 'moving';
    deadlineAt: number;
  } | null>(null);
  const [, setDeadlineTick] = useState(0);
  const [displayBoardState, setDisplayBoardState] = useState<GameState | null>(null);
  const animationTimerRef = useRef<number | null>(null);
  const gameRef = useRef<ServerGame | null>(null);
  const onMatchFinishedRef = useRef(onMatchFinished);
  onMatchFinishedRef.current = onMatchFinished;

  useEffect(() => {
    if (!graceUntil) return;
    const timer = window.setInterval(() => {
      setGraceTick((value) => value + 1);
      if (Date.now() >= graceUntil) setGraceUntil(null);
    }, 500);
    return () => window.clearInterval(timer);
  }, [graceUntil]);

  useEffect(() => {
    if (!turnDeadline) return;
    const timer = window.setInterval(() => {
      setDeadlineTick((value) => value + 1);
      if (Date.now() >= turnDeadline.deadlineAt) setTurnDeadline(null);
    }, 250);
    return () => window.clearInterval(timer);
  }, [turnDeadline]);

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
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 700,
          reconnectionDelayMax: 5000,
          auth: { token },
        });
        socketRef.current = socket;

        const updateRoom = (nextRoom: MultiplayerRoom) => {
          if (!cancelled) setRoom(nextRoom);
        };
        const updateGame = (payload: { game: ServerGame }) => {
          if (!cancelled && payload.game) {
            gameRef.current = payload.game;
            setGame(payload.game);
            setDisplayBoardState(toBoardState(payload.game));
            setPerspective((current) =>
              current ?? payload.game.players.find((player) => player.clerkUserId === userInfo.id)?.color ?? null,
            );
          }
        };
        const animateGameMove = (payload: { game: ServerGame }) => {
          if (cancelled || !payload.game) return;
          const previous = gameRef.current;
          const next = payload.game;
          const event = next.lastEvent;
          gameRef.current = next;
          setGame(next);
          setPerspective((current) =>
            current ?? next.players.find((player) => player.clerkUserId === userInfo.id)?.color ?? null,
          );
          if (
            !previous ||
            !event?.color ||
            event.tokenIndex === undefined ||
            event.fromPos === undefined ||
            event.toPos === undefined
          ) {
            setDisplayBoardState(toBoardState(next));
            return;
          }

          const start = toBoardState(previous);
          const finish = toBoardState(next);
           const movingColor = event.color;
           const movingTokenIndex = event.tokenIndex;
          const steps = serverPositionPath(
             movingColor,
            event.fromPos,
            event.toPos,
            event.diceValue ?? 1,
          );
           const pieces = { ...start.pieces, [movingColor]: [...start.pieces[movingColor]] };
           pieces[movingColor][movingTokenIndex] = start.pieces[movingColor][movingTokenIndex];
          setDisplayBoardState({
            ...start,
            pieces,
            diceValue: event.diceValue ?? start.diceValue,
            diceRolled: true,
            isAnimating: true,
            message: '',
            animPiece: {
               player: movingColor,
               index: movingTokenIndex,
              step: 0,
              total: steps.length,
              steps,
            },
          });

          let stepIndex = 0;
           const finishMoveAnimation = () => {
             if (event.type === 'token_finished') playHomeSound();
             if (
               event.type !== 'token_captured' ||
               event.capturedColor === undefined ||
               event.capturedTokenIndex === undefined ||
               event.capturedFromPos === undefined
             ) {
               setDisplayBoardState(finish);
               animationTimerRef.current = null;
               return;
             }

             const capturedColor = event.capturedColor;
             const capturedTokenIndex = event.capturedTokenIndex;
             const capturedSteps = serverCaptureReturnPath(capturedColor, event.capturedFromPos);
             if (capturedSteps.length === 0) {
               setDisplayBoardState(finish);
               animationTimerRef.current = null;
               return;
             }

             const capturePieces = {
               ...finish.pieces,
               [capturedColor]: [...finish.pieces[capturedColor]],
             };
             capturePieces[capturedColor][capturedTokenIndex] =
               toRelativePosition(capturedColor, event.capturedFromPos);
             setDisplayBoardState({
               ...finish,
               pieces: capturePieces,
               isAnimating: true,
               message: '',
               animPiece: {
                 player: capturedColor,
                 index: capturedTokenIndex,
                 step: 0,
                 total: capturedSteps.length,
                 steps: capturedSteps,
               },
             });

             let captureStepIndex = 0;
             const tickCapture = () => {
               if (captureStepIndex >= capturedSteps.length) {
                 setDisplayBoardState(finish);
                 playCaptureSound();
                 animationTimerRef.current = null;
                 return;
               }
               const position = capturedSteps[captureStepIndex];
               setDisplayBoardState((current) => {
                 if (!current) return finish;
                 const nextPieces = {
                   ...current.pieces,
                   [capturedColor]: [...current.pieces[capturedColor]],
                 };
                 nextPieces[capturedColor][capturedTokenIndex] = position;
                 return {
                   ...current,
                   pieces: nextPieces,
                   animPiece: current.animPiece
                     ? { ...current.animPiece, step: captureStepIndex }
                     : null,
                 };
               });
               playMoveStepSound();
               captureStepIndex += 1;
               animationTimerRef.current = window.setTimeout(tickCapture, 300);
             };
             animationTimerRef.current = window.setTimeout(tickCapture, 80);
           };

          const tick = () => {
            if (stepIndex >= steps.length) {
               finishMoveAnimation();
              return;
            }
            const position = steps[stepIndex];
            setDisplayBoardState((current) => {
              if (!current) return finish;
               const nextPieces = { ...current.pieces, [movingColor]: [...current.pieces[movingColor]] };
               nextPieces[movingColor][movingTokenIndex] = position;
              return {
                ...current,
                pieces: nextPieces,
                animPiece: current.animPiece
                  ? { ...current.animPiece, step: stepIndex }
                  : null,
              };
            });
            playMoveStepSound();
            stepIndex += 1;
             animationTimerRef.current = window.setTimeout(tick, 360);
          };
          animationTimerRef.current = window.setTimeout(tick, 40);
        };

        socket.on('connect', () => {
          if (cancelled) return;
          setConnected(true);
          setError('');
          setGraceUntil(null);
          socket?.emit('room:join', {
            roomId: initialConfig.roomId,
          });
        });
        socket.on('disconnect', () => {
          setConnected(false);
          setGraceUntil(Date.now() + 45_000);
        });
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
         socket.on(
           'game:turn_deadline',
           (payload: {
             clerkUserId?: string;
             phase?: 'rolling' | 'moving';
             deadlineAt?: number | null;
           }) => {
             if (!payload.deadlineAt || !payload.clerkUserId || !payload.phase) {
               setTurnDeadline(null);
               return;
             }
             setTurnDeadline({
               clerkUserId: payload.clerkUserId,
               phase: payload.phase,
               deadlineAt: payload.deadlineAt,
             });
           },
         );
        socket.on('room:updated', (payload: { room: MultiplayerRoom }) => updateRoom(payload.room));
        socket.on('game:started', updateGame);
         socket.on('game:dice_rolled', (payload: { game: ServerGame; color?: PlayerColor }) => {
           const myColor = gameRef.current?.players.find(
             (player) => player.clerkUserId === userInfo.id,
           )?.color;
           if (payload.color && payload.color !== myColor) playDiceRollSound();
           updateGame(payload);
         });
        socket.on('game:moved', animateGameMove);
        socket.on('game:state', updateGame);
         socket.on('game:finished', (payload: { game: ServerGame }) => {
           playWinSound();
           updateGame(payload);
         });
        socket.on('room:player_disconnected', (payload: { clerkUserId?: string; graceSeconds?: number }) => {
          if (payload.clerkUserId && payload.clerkUserId !== userInfo.id) {
            setGraceUntil(Date.now() + (payload.graceSeconds ?? 45) * 1000);
          }
        });
        socket.on('error', (payload: { message?: string }) => {
          if (!cancelled) setError(payload.message ?? 'অনলাইন গেমে একটি সমস্যা হয়েছে।');
        });
      } catch {
        if (!cancelled) setError('অনলাইন authenticated session তৈরি করা যায়নি।');
      }
    })();

    return () => {
      cancelled = true;
      if (animationTimerRef.current) window.clearTimeout(animationTimerRef.current);
      socket?.emit('room:leave');
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [getToken, initialConfig.roomId, userInfo.id, userInfo.name]);

  const boardState = useMemo(() => (game ? toBoardState(game) : null), [game]);
  const renderedBoardState = displayBoardState ?? boardState;
  const fixedPerspective =
    perspective ??
    game?.players.find((player) => player.clerkUserId === userInfo.id)?.color ??
    null;
  const currentServerPlayer = game?.players[game.currentColorIndex];
  const powerSixEnabled = Boolean(game?.powerSixEnabled ?? room?.powerSixEnabled);
  const isMyTurn =
    Boolean(currentServerPlayer && currentServerPlayer.clerkUserId === userInfo.id);
  const canRoll = Boolean(game && game.phase === 'rolling' && isMyTurn && connected);
  const autoTurnSeconds = turnDeadline
    ? Math.max(0, Math.ceil((turnDeadline.deadlineAt - Date.now()) / 1000))
    : 0;
  const autoTurnPlayer = turnDeadline
    ? game?.players.find((player) => player.clerkUserId === turnDeadline.clerkUserId)
    : null;

  const emitRoll = () => {
    if (!canRoll || !initialConfig.roomId) return;
    playDiceRollSound();
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

  const copyRoomCode = async () => {
    const code = room?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setRoomCodeCopied(true);
      window.setTimeout(() => setRoomCodeCopied(false), 1600);
    } catch {
      setError('Room code কপি করা যায়নি। Code টি ধরে copy করুন।');
    }
  };

  if (!game || !boardState || !renderedBoardState) {
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
             <button
               type="button"
               onClick={() => void copyRoomCode()}
               disabled={!room?.code}
               className="mx-auto flex items-center gap-2 rounded-xl px-3 py-1 text-3xl font-black tracking-[0.25em] text-cyan-200 transition-colors hover:bg-cyan-300/10 disabled:opacity-50"
               aria-label="Copy room code"
             >
               {room?.code ?? '------'}
               {room?.code && (roomCodeCopied ? <Check size={18} className="text-emerald-300" /> : <Copy size={17} className="text-cyan-200/70" />)}
             </button>
             {roomCodeCopied && <p className="mt-1 text-[10px] font-bold text-emerald-300">Code copied — send it to your friend</p>}
            <div className="flex justify-center items-center gap-2 mt-3 text-xs text-white/60">
              {connected ? <Wifi size={14} className="text-green-400" /> : <WifiOff size={14} className="text-amber-400" />}
              {connected
                ? 'Server connected'
                : graceUntil
                  ? `Reconnecting… ${Math.max(0, Math.ceil((graceUntil - Date.now()) / 1000))}s`
                  : 'Connecting to server…'}
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

  if (game.phase === 'finished' && game.winnerId) {
    const winner = game.players.find((player) => player.clerkUserId === game.winnerId);
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center px-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-amber-300/30 bg-[#060a1c]/95 p-7 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-amber-300/30 bg-amber-300/10 text-3xl">
            {winner?.clerkUserId === userInfo.id ? '1st' : 'FIN'}
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300">Match result</p>
          <h1 className="mt-2 text-3xl font-black text-white">{winner?.displayName ?? 'Winner'}</h1>
          <p className="mt-2 text-sm text-white/55">
            {winner?.clerkUserId === userInfo.id ? 'You won the online match.' : 'The online match has finished.'}
          </p>
          <button
            type="button"
            onClick={() => onMatchFinishedRef.current?.()}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 py-3 text-sm font-black text-white shadow-lg transition-transform active:scale-[.98]"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  const visualCorners = getVisualCornerOrder(fixedPerspective);
  const topPlayers = [visualCorners[0], visualCorners[1], visualCorners[3]]
    .filter((color) => color !== fixedPerspective && renderedBoardState.activePlayers.includes(color));
  const renderPlayer = (color: PlayerColor) => {
    if (!renderedBoardState.activePlayers.includes(color)) return null;
    const isActive = renderedBoardState.currentPlayer === color;
    const nextRollForced = powerSixEnabled && renderedBoardState.powerSixCycleCount[color] === 5;
    const player = game?.players.find((candidate) => candidate.color === color);
    const canOpenProfile = Boolean(
      player &&
      player.clerkUserId !== userInfo.id &&
      onOpenPlayerProfile,
    );
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
         {canOpenProfile ? (
           <button
             type="button"
             onClick={() => onOpenPlayerProfile?.(player!.clerkUserId)}
             className="min-w-0 truncate text-left text-[11px] font-black hover:text-cyan-200"
             aria-label={`Open ${boardState.playerNames[color]} profile`}
           >
             {boardState.playerNames[color]}
           </button>
         ) : (
           <span className="text-[11px] font-black truncate">{boardState.playerNames[color]}</span>
         )}
        {isActive && (
          <div className="relative">
          <DiceDisplay value={renderedBoardState.diceValue} rolling={false}
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
        <div className="w-full flex items-center justify-center gap-2 px-1">
          {topPlayers.map((color) => (
            <div key={color} className="flex-1 min-w-0 max-w-[190px]">{renderPlayer(color)}</div>
          ))}
        </div>
        <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
           <LudoBoard state={renderedBoardState} onPieceClick={emitMove} perspective={fixedPerspective} />
          <button onClick={onBack} className="absolute top-2 left-2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-full bg-black/40 text-white/60 text-[10px] font-bold">
            <LogOut className="w-3.5 h-3.5" /> Leave
          </button>
          {!connected && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 rounded-full bg-amber-500/90 px-3 py-1 text-[10px] font-bold">
              Reconnecting…
            </div>
          )}
           {turnDeadline && autoTurnSeconds > 0 && autoTurnPlayer && (
             <div className="absolute top-11 left-1/2 -translate-x-1/2 z-30 rounded-full border border-amber-300/40 bg-[#4a2800]/95 px-3 py-1 text-[10px] font-bold text-amber-100 whitespace-nowrap shadow-lg">
               {autoTurnPlayer.displayName}-এর জন্য auto {turnDeadline.phase === 'rolling' ? 'dice roll' : 'move'} হবে {autoTurnSeconds}s পরে
             </div>
           )}
          {error && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 rounded-full bg-red-600/90 px-3 py-1 text-[10px] font-bold whitespace-nowrap">
              {error}
            </div>
          )}
        </div>
        <div className="w-full flex justify-center px-1">
          <div className="w-full max-w-[190px]">{renderPlayer(fixedPerspective)}</div>
        </div>
         <p className="text-white/50 text-[11px] font-semibold">{renderedBoardState.message}</p>
      </div>
    </div>
  );
}