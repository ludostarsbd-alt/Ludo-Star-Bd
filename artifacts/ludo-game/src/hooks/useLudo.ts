import { useState, useCallback, useRef, useEffect } from 'react';
import { GameState, PlayerColor, PiecePos, PLAYER_COLORS, START_INDEX, SAFE_CELLS } from '../types/ludo';

const DEFAULT_NAMES: Record<PlayerColor, string> = {
  red: 'Player 1',
  yellow: 'Player 2',
  blue: 'Player 3',
  green: 'Player 4',
};

const STEP_DELAY = 340; // ms per cell — slightly slower

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
    if (pos === 57) continue;
    if (pos === -1) {
      if (diceValue === 6) movable.push(i);
    } else {
      const newPos = pos + diceValue;
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
    const newPos = oldPos === -1 ? 0 : oldPos + diceVal;

    // Build list of intermediate positions to step through
    const steps: number[] = [];
    if (oldPos === -1) {
      // Coming from home: single jump to start cell
      steps.push(0);
    } else {
      for (let p = oldPos + 1; p <= newPos; p++) {
        steps.push(p);
      }
    }

    // Lock the board during animation
    setState(prev => ({ ...prev, isAnimating: true, message: '' }));

    let stepIndex = 0;

    const doStep = () => {
      const pos = steps[stepIndex];

      // Move piece to intermediate position
      setState(prev => {
        const newPieces = JSON.parse(JSON.stringify(prev.pieces)) as GameState['pieces'];
        newPieces[player][pieceIndex] = pos;
        const next = { ...prev, pieces: newPieces };
        stateRef.current = next;
        return next;
      });

      stepIndex++;

      if (stepIndex < steps.length) {
        // More steps to go
        setTimeout(doStep, STEP_DELAY);
      } else {
        // Last step reached — apply capture & turn logic
        setTimeout(() => {
          const finalS = stateRef.current;
          let captureMsg = '';
          const finalPieces = JSON.parse(JSON.stringify(finalS.pieces)) as GameState['pieces'];

          if (newPos < 51) {
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
            if (diceVal === 6 || captureMsg) {
              setState(prev => ({
                ...prev,
                diceRolled: false,
                diceValue: null,
                message: `${prev.playerNames[player]} আবার খেলবে!`,
                history: [
                  `${prev.playerNames[player]} আবার খেলবে!`,
                  ...stateRef.current.history,
                ].slice(0, 5),
              }));
            } else {
              nextTurn();
            }
          }, 800);
        }, 80);
      }
    };

    // Kick off first step immediately
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
