import { useState, useCallback, useRef, useEffect } from 'react';
import { GameState, PlayerColor, PiecePos, PLAYER_COLORS, START_INDEX, SAFE_CELLS, HOME_ENTRY_POS, HOME_CENTER_POS } from '../types/ludo';
import {
  playCaptureSound,
  playDiceRollSound,
  playHomeSound,
  playMoveStepSound,
  playWinSound,
} from '../lib/game-sounds';

/** টিম পার্টনার: লাল↔নীল, হলুদ↔সবুজ */
export const TEAM_PARTNER: Record<PlayerColor, PlayerColor> = {
  red: 'blue', blue: 'red', yellow: 'green', green: 'yellow',
};

/**
 * টিম মোডে, যদি currentPlayer-এর সব গুটি ঘরে চলে গিয়ে থাকে,
 * তাহলে তার partner চালবে — নইলে currentPlayer নিজেই চালবে।
 */
function getEffectiveMover(
  pieces: Record<PlayerColor, PiecePos[]>,
  currentPlayer: PlayerColor,
  teamMode: boolean,
): PlayerColor {
  if (!teamMode) return currentPlayer;
  const allHome = pieces[currentPlayer].every(p => p === HOME_CENTER_POS[currentPlayer]);
  return allHome ? TEAM_PARTNER[currentPlayer] : currentPlayer;
}

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
  teamMode = false,
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
    teamMode,
    consecutiveSixes: 0,
    powerSixCycleCount: { red: -1, green: -1, blue: -1, yellow: -1 },
  };
}

export function getMovablePieces(
  pieces: Record<PlayerColor, PiecePos[]>,
  player: PlayerColor,
  diceValue: number | null,
  teamMode = false,
): number[] {
  if (!diceValue) return [];
  // টিম মোডে সব গুটি ঘরে গেলে পার্টনারের গুটি চালাবে
  const effectivePlayer = getEffectiveMover(pieces, player, teamMode);
  const playerPieces = pieces[effectivePlayer];
  const movable: number[] = [];

  for (let i = 0; i < 4; i++) {
    const pos = playerPieces[i];
    if (pos === HOME_CENTER_POS[effectivePlayer]) continue; // already home
    if (pos === -1) {
      // ঘরে আছে — শুধু ছয়ে বের হওয়া যাবে
      if (diceValue === 6) movable.push(i);
    } else {
      const newPos = pos + diceValue;
      // ঠিক home center বা কম হলেই যেতে পারবে — বেশি গেলে যাবে না
      if (newPos <= HOME_CENTER_POS[effectivePlayer]) movable.push(i);
    }
  }
  return movable;
}

export function useLudo(
  playerNames: Record<PlayerColor, string> = DEFAULT_NAMES,
  activePlayers: PlayerColor[] = PLAYER_COLORS,
  powerSixEnabled = false,
  teamMode = false,
) {
  const [state, setState] = useState<GameState>(() => makeInitialState(playerNames, activePlayers, teamMode));
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

    playDiceRollSound();
    setState(s => ({ ...s, rollingAnim: true, message: 'ডাইস ঘুরছে...' }));

    setTimeout(() => {
      // ── Power Six: if the player has had 5 non-6 rolls since their last 6,
      //    the 6th roll is forced to be 6. ──
      const preRoll = stateRef.current;
      const rollingPlayer = preRoll.currentPlayer;
      const psCycle = preRoll.powerSixCycleCount[rollingPlayer]; // -1 or 0-5
      const val = (powerSixEnabled && psCycle === 5)
        ? 6
        : Math.floor(Math.random() * 6) + 1;

      // Update this player's cycle counter
      const updatedPs = { ...preRoll.powerSixCycleCount };
      if (powerSixEnabled) {
        if (val === 6) {
          updatedPs[rollingPlayer] = 0; // new cycle starts after every 6
        } else if (psCycle >= 0) {
          updatedPs[rollingPlayer] = psCycle + 1; // advance within cycle
        }
        // psCycle === -1 and val !== 6 → no cycle yet, stay at -1
      }

      setState(s => {
        const name = s.playerNames[s.currentPlayer];
        const history = [`${name} ${val} পেয়েছে!`, ...s.history].slice(0, 5);
        const newState = {
          ...s,
          rollingAnim: false,
          diceValue: val,
          diceRolled: true,
          powerSixCycleCount: updatedPs,
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
  }, [state.diceRolled, state.winner, state.rollingAnim, state.isAnimating, nextTurn, powerSixEnabled]);

  const handlePieceClick = useCallback((player: PlayerColor, pieceIndex: number) => {
    const s = stateRef.current;
    if (s.isAnimating || !s.diceRolled || !s.diceValue || s.winner) return;

    // টিম মোডে কে আসলে চালবে তা নির্ধারণ করা
    const effectivePlayer = getEffectiveMover(s.pieces, s.currentPlayer, s.teamMode);
    if (player !== effectivePlayer) return; // অন্য কারো গুটিতে ক্লিক করলে চলবে না

    const movable = getMovablePieces(s.pieces, s.currentPlayer, s.diceValue, s.teamMode);
    if (!movable.includes(pieceIndex)) return;

    const oldPos = s.pieces[effectivePlayer][pieceIndex];
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
      animPiece: { player: effectivePlayer, index: pieceIndex, step: 0, total: totalSteps, steps },
    }));

    let stepIndex = 0;

    const doStep = () => {
      const pos = steps[stepIndex];
      const currentStepIdx = stepIndex;

      setState(prev => {
        const newPieces = JSON.parse(JSON.stringify(prev.pieces)) as GameState['pieces'];
        newPieces[effectivePlayer][pieceIndex] = pos;
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
      playMoveStepSound();

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
          if (newPos < HOME_ENTRY_POS[effectivePlayer]) {
            const absIdx = (START_INDEX[effectivePlayer] + newPos) % 52;
            if (!SAFE_CELLS.has(absIdx)) {
              for (const otherPlayer of PLAYER_COLORS) {
                if (otherPlayer === effectivePlayer) continue;
                // টিম মোডে: নিজের পার্টনারের গুটি কাটা যাবে না
                if (finalS.teamMode && TEAM_PARTNER[effectivePlayer] === otherPlayer) continue;

                for (let i = 0; i < 4; i++) {
                  const opPos = finalPieces[otherPlayer][i];
                  if (opPos >= 0 && opPos < 51) {
                    const opAbsIdx = (START_INDEX[otherPlayer] + opPos) % 52;
                    if (opAbsIdx === absIdx) {
                      // টিম মোডে: ২টি একই টিমের গুটি এক সেলে থাকলে কাটা যাবে না
                      if (finalS.teamMode) {
                        const opPartner = TEAM_PARTNER[otherPlayer];
                        const partnerProtects = finalPieces[opPartner]?.some(pp => {
                          if (pp < 0 || pp >= 51) return false;
                          return (START_INDEX[opPartner] + pp) % 52 === absIdx;
                        }) ?? false;
                        if (partnerProtects) continue; // সুরক্ষিত সেল — কাটা যাবে না
                      }
                      finalPieces[otherPlayer][i] = -1;
                      captureMsg = `${finalS.playerNames[effectivePlayer]} কাটল ${finalS.playerNames[otherPlayer]}-এর গুটি!`;
                      playCaptureSound();
                    }
                  }
                }
              }
            }
          }

          // টিম মোডে: দুজনের সব গুটি ঘরে গেলে টিম জয়
          const teamPartner = finalS.teamMode ? TEAM_PARTNER[effectivePlayer] : null;
          const hasWon = finalS.teamMode
            ? finalPieces[effectivePlayer].every(p => p === HOME_CENTER_POS[effectivePlayer]) &&
              (teamPartner ? finalPieces[teamPartner].every(p => p === HOME_CENTER_POS[teamPartner!]) : true)
            : finalPieces[effectivePlayer].every(p => p === HOME_CENTER_POS[effectivePlayer]);

          // গুটি ঠিক home-এ পৌঁছেছে কিনা (এবং আগে home-এ ছিল না)
          const pieceReachedHome =
            newPos === HOME_CENTER_POS[effectivePlayer] &&
            oldPos !== HOME_CENTER_POS[effectivePlayer];

          const homeMsg = pieceReachedHome
            ? `${finalS.playerNames[effectivePlayer]}-এর গুটি ঘরে পৌঁছেছে! বোনাস চাল।`
            : '';

          if (pieceReachedHome) playHomeSound();
          if (hasWon) playWinSound();

          setState(prev => ({
            ...prev,
            pieces: finalPieces,
            isAnimating: false,
            animPiece: null,
            winner: hasWon ? effectivePlayer : null,
            message: hasWon
              ? `${prev.playerNames[effectivePlayer]} জিতেছে! 🎉`
              : captureMsg || homeMsg || 'চমৎকার!',
            history: captureMsg
              ? [captureMsg, ...prev.history].slice(0, 5)
              : homeMsg
              ? [homeMsg, ...prev.history].slice(0, 5)
              : prev.history,
          }));

          if (hasWon) return;

          setTimeout(() => {
            const afterS = stateRef.current;
            const rolledSix = diceVal === 6;

            if (rolledSix || captureMsg || pieceReachedHome) {
              // ছয় উঠলে, কাটলে বা গুটি ঘরে পৌঁছালে আবার চালার সুযোগ
              const bonusReason = captureMsg
                ? `${afterS.playerNames[effectivePlayer]} আবার খেলবে (কেটেছে)!`
                : pieceReachedHome
                ? `${afterS.playerNames[effectivePlayer]} আবার খেলবে (গুটি ঘরে)!`
                : `${afterS.playerNames[effectivePlayer]} আবার খেলবে (ছয়)!`;
              setState(prev => ({
                ...prev,
                diceRolled: false,
                diceValue: null,
                message: captureMsg
                  ? `${prev.playerNames[effectivePlayer]} কাটল! আবার খেলুন।`
                  : pieceReachedHome
                  ? `${prev.playerNames[effectivePlayer]}-এর গুটি ঘরে! আবার খেলুন।`
                  : `${prev.playerNames[effectivePlayer]} ছয় পেয়েছে! আবার খেলুন।`,
                history: [bonusReason, ...stateRef.current.history].slice(0, 5),
              }));
            } else {
              // বোনাস না থাকলে পরের জনের চাল
              nextTurn();
            }
          }, 800);
        }, 420);
      }
    };

    setTimeout(doStep, 0);
  }, [nextTurn]);

  const resetGame = useCallback((newNames?: Record<PlayerColor, string>, newActivePlayers?: PlayerColor[], newTeamMode?: boolean) => {
    const names = newNames ?? stateRef.current.playerNames;
    const ap = newActivePlayers ?? stateRef.current.activePlayers;
    const tm = newTeamMode ?? stateRef.current.teamMode;
    const fresh = makeInitialState(names, ap, tm);
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
