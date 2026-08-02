import { useState, useCallback, useRef, useEffect } from 'react';
import { GameState, PlayerColor, PiecePos, PLAYER_COLORS, START_INDEX, SAFE_CELLS, HOME_ENTRY_POS } from '../types/ludo';

const DEFAULT_NAMES: Record<PlayerColor, string> = {
  red: 'Player 1',
  yellow: 'Player 2',
  blue: 'Player 3',
  green: 'Player 4',
};

// ms between each step — enough time for the hop arc to complete fully
const STEP_DELAY = 420;

function makeInitialState(
  names: Record<PlayerColor, string> = DEFAULT_NAMES,
  activePlayers: PlayerColor[] = PLAYER_COLORS,
): GameState {
  return {
    pieces: {
      red: [-1, -1, -1, -1],
      green: [-1, -1, -1, -1],
      blue: [-1, -1, -1, -1],
      yellow: [-1, -1, -1, -1],
    },
    currentPlayer: activePlayers[0],
    diceValue: null,
    diceRolled: false,
    winner: null,
    message: `${names[activePlayers[0]]}-এর চাল!`,
    rollingAnim: false,
    isAnimating: false,
    history: [`গেম শুরু! ${names[activePlayers[0]]}-এর চাল।`],
    playerNames: { ...names },
    activePlayers,
    animPiece: null,
    consecutiveSixes: 0,
  };
}

export function getMovablePieces(
  pieces: Record<PlayerColor, PiecePos[]>,
  player: PlayerColor,
  diceValue: number | null
): number[] {
  if (!diceValue) return [];
  const playerPieces = pieces[player];
  const movable: number[] = [];

  for (let i = 0; i < 4; i++) {
    const pos = playerPieces[i];
    if (pos === 57) continue; // already home
    if (pos === -1) {
      // ঘরে আছে — শুধু ছয়ে বের হওয়া যাবে
      if (diceValue === 6) movable.push(i);
    } else {
      const newPos = pos + diceValue;
      // ঠিক 57 বা কম হলেই যেতে পারবে — বেশি গেলে যাবে না
      if (newPos <= 57) movable.push(i);
    }
  }
  return movable;
}

export function useLudo(
  playerNames: Record<PlayerColor, string> = DEFAULT_NAMES,
  activePlayers: PlayerColor[] = PLAYER_COLORS,
) {
  const [state, setState] = useState<GameState>(() => makeInitialState(playerNames, activePlayers));
  const stateRef = useRef(state);
  stateRef.current = state;

  // Re-initialize whenever the player config changes (new game setup)
  const activePlayersKey = activePlayers.join(',');
  const prevKey = useRef('');
  useEffect(() => {
    if (prevKey.current === '') { prevKey.current = activePlayersKey; return; }
    if (prevKey.current !== activePlayersKey) {
      prevKey.current = activePlayersKey;
      const fresh = makeInitialState(playerNames, activePlayers);
      setState(fresh);
      stateRef.current = fresh;
    }
  }, [activePlayersKey]); // eslint-disable-line

  const nextTurn = useCallback(() => {
    setState(s => {
      const ap = s.activePlayers;
      const currentIdx = ap.indexOf(s.currentPlayer);
      const nextPlayer = ap[(currentIdx + 1) % ap.length];
      const name = s.playerNames[nextPlayer];
      const history = [`${name}-এর চাল।`, ...s.history].slice(0, 5);
      return {
        ...s,
        currentPlayer: nextPlayer,
        diceRolled: false,
        diceValue: null,
        isAnimating: false,
        consecutiveSixes: 0,   // নতুন চালে রিসেট
        message: `${name}-এর চাল!`,
        history,
      };
    });
  }, []);

  const handleRollDice = useCallback(() => {
    if (state.diceRolled || state.winner || state.rollingAnim || state.isAnimating) return;

    setState(s => ({ ...s, rollingAnim: true, message: 'ডাইস ঘুরছে...' }));

    setTimeout(() => {
      const val = Math.floor(Math.random() * 6) + 1;

      setState(s => {
        const name = s.playerNames[s.currentPlayer];
        const history = [`${name} ${val} পেয়েছে!`, ...s.history].slice(0, 5);
        const newState = {
          ...s,
          rollingAnim: false,
          diceValue: val,
          diceRolled: true,
          message: `${name} পেল ${val}!`,
          history,
        };
        stateRef.current = newState;
        return newState;
      });

      setTimeout(() => {
        const current = stateRef.current;
        const name = current.playerNames[current.currentPlayer];

        // ══ তিনটা পরপর ছয়ের নিয়ম ══
        // consecutiveSixes = 0 মানে এটা ১ম রোল, 1 মানে ২য়, 2 মানে ৩য়
        if (val === 6 && current.consecutiveSixes >= 2) {
          // তৃতীয়বার ছয় — চাল বাতিল
          setState(s => ({
            ...s,
            message: `${name} তিনবার ছয় দিয়েছে! চাল বাতিল।`,
            history: [`${name} তিনবার ছয় — চাল বাতিল!`, ...s.history].slice(0, 5),
          }));
          setTimeout(() => nextTurn(), 1800);
          return;
        }

        // consecutiveSixes আপডেট
        if (val === 6) {
          setState(s => ({ ...s, consecutiveSixes: s.consecutiveSixes + 1 }));
        } else {
          setState(s => ({ ...s, consecutiveSixes: 0 }));
        }

        const movable = getMovablePieces(current.pieces, current.currentPlayer, val);
        if (movable.length === 0) {
          setState(s => ({ ...s, message: 'কোনো চাল নেই। পরের জনের চাল...' }));
          setTimeout(() => nextTurn(), 1500);
        } else {
          setState(s => ({ ...s, message: 'গুটি বেছে নিন।' }));
        }
      }, 500);
    }, 600);
  }, [state.diceRolled, state.winner, state.rollingAnim, state.isAnimating, nextTurn]);

  const handlePieceClick = useCallback((player: PlayerColor, pieceIndex: number) => {
    const s = stateRef.current;
    if (s.isAnimating || s.currentPlayer !== player || !s.diceRolled || !s.diceValue || s.winner) return;

    const movable = getMovablePieces(s.pieces, player, s.diceValue);
    if (!movable.includes(pieceIndex)) return;

    const oldPos = s.pieces[player][pieceIndex];
    const diceVal = s.diceValue;

    // ঠিক diceVal ঘর — এর কম বেশি নয়
    const newPos = oldPos === -1 ? 0 : oldPos + diceVal;

    // Build list of intermediate positions to step through
    const steps: number[] = [];
    if (oldPos === -1) {
      // ঘর থেকে বের হওয়া: সরাসরি start cell-এ
      steps.push(0);
    } else {
      for (let p = oldPos + 1; p <= newPos; p++) {
        steps.push(p);
      }
    }

    const totalSteps = steps.length;

    // Lock the board during animation
    setState(prev => ({
      ...prev,
      isAnimating: true,
      message: '',
      animPiece: { player, index: pieceIndex, step: 0, total: totalSteps, steps },
    }));

    let stepIndex = 0;

    const doStep = () => {
      const pos = steps[stepIndex];
      const currentStepIdx = stepIndex;

      setState(prev => {
        const newPieces = JSON.parse(JSON.stringify(prev.pieces)) as GameState['pieces'];
        newPieces[player][pieceIndex] = pos;
        const next = {
          ...prev,
          pieces: newPieces,
          animPiece: prev.animPiece
            ? { ...prev.animPiece, step: currentStepIdx }
            : null,
        };
        stateRef.current = next;
        return next;
      });

      stepIndex++;

      if (stepIndex < steps.length) {
        setTimeout(doStep, STEP_DELAY);
      } else {
        // শেষ ঘরে পৌঁছানো — hop animation শেষ হওয়ার জন্য অপেক্ষা
        setTimeout(() => {
          const finalS = stateRef.current;
          let captureMsg = '';
          const finalPieces = JSON.parse(JSON.stringify(finalS.pieces)) as GameState['pieces'];

          // কাটা: শুধু মেইন ট্র্যাকে, safe cell ছাড়া
          if (newPos < HOME_ENTRY_POS[player]) {
            const absIdx = (START_INDEX[player] + newPos) % 51;
            if (!SAFE_CELLS.has(absIdx)) {
              for (const otherPlayer of PLAYER_COLORS) {
                if (otherPlayer === player) continue;
                for (let i = 0; i < 4; i++) {
                  const opPos = finalPieces[otherPlayer][i];
                  if (opPos >= 0 && opPos < 51) {
                    const opAbsIdx = (START_INDEX[otherPlayer] + opPos) % 51;
                    if (opAbsIdx === absIdx) {
                      finalPieces[otherPlayer][i] = -1;
                      captureMsg = `${finalS.playerNames[player]} কাটল ${finalS.playerNames[otherPlayer]}-এর গুটি!`;
                    }
                  }
                }
              }
            }
          }

          const hasWon = finalPieces[player].every(p => p === 57);

          setState(prev => ({
            ...prev,
            pieces: finalPieces,
            isAnimating: false,
            animPiece: null,
            winner: hasWon ? player : null,
            message: hasWon
              ? `${prev.playerNames[player]} জিতেছে! 🎉`
              : captureMsg || 'চমৎকার!',
            history: captureMsg
              ? [captureMsg, ...prev.history].slice(0, 5)
              : prev.history,
          }));

          if (hasWon) return;

          setTimeout(() => {
            const afterS = stateRef.current;
            const rolledSix = diceVal === 6;

            if (rolledSix || captureMsg) {
              // ছয় উঠলে বা কাটলে আবার চালার সুযোগ
              // (তিনটা ছয়ের চেক handleRollDice-এ হয়)
              setState(prev => ({
                ...prev,
                diceRolled: false,
                diceValue: null,
                message: captureMsg
                  ? `${prev.playerNames[player]} কাটল! আবার খেলুন।`
                  : `${prev.playerNames[player]} ছয় পেয়েছে! আবার খেলুন।`,
                history: [
                  captureMsg
                    ? `${afterS.playerNames[player]} আবার খেলবে (কেটেছে)!`
                    : `${afterS.playerNames[player]} আবার খেলবে (ছয়)!`,
                  ...stateRef.current.history,
                ].slice(0, 5),
              }));
            } else {
              // ছয় না হলে পরের জনের চাল
              nextTurn();
            }
          }, 800);
        }, 420);
      }
    };

    setTimeout(doStep, 0);
  }, [nextTurn]);

  const resetGame = useCallback((newNames?: Record<PlayerColor, string>, newActivePlayers?: PlayerColor[]) => {
    const names = newNames ?? stateRef.current.playerNames;
    const ap = newActivePlayers ?? stateRef.current.activePlayers;
    const fresh = makeInitialState(names, ap);
    setState(fresh);
    stateRef.current = fresh;
  }, []);

  return {
    state,
    rollDice: handleRollDice,
    movePiece: handlePieceClick,
    resetGame,
  };
}
