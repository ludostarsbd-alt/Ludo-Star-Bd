import { useState, useCallback, useRef, useEffect } from 'react';
import { GameState, PlayerColor, PiecePos, PLAYER_COLORS, START_INDEX, SAFE_CELLS } from '../types/ludo';

const INITIAL_STATE: GameState = {
  pieces: {
    red: [-1, -1, -1, -1],
    green: [-1, -1, -1, -1],
    blue: [-1, -1, -1, -1],
    yellow: [-1, -1, -1, -1],
  },
  currentPlayer: 'red',
  diceValue: null,
  diceRolled: false,
  winner: null,
  message: "Red's turn to roll!",
  rollingAnim: false,
  history: ["Game started! Red's turn."],
};

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
    if (pos === 57) continue; // finished
    
    if (pos === -1) {
      if (diceValue === 6) movable.push(i);
    } else {
      const newPos = pos + diceValue;
      if (newPos <= 57) movable.push(i); // Can move within track or home run without overshooting
    }
  }
  return movable;
}

export function useLudo() {
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const pushHistory = (msg: string) => {
    setState(s => ({
      ...s,
      history: [msg, ...s.history].slice(0, 5),
    }));
  };

  const nextTurn = useCallback(() => {
    setState(s => {
      const currentIdx = PLAYER_COLORS.indexOf(s.currentPlayer);
      const nextPlayer = PLAYER_COLORS[(currentIdx + 1) % 4];
      const history = [`${nextPlayer.charAt(0).toUpperCase() + nextPlayer.slice(1)}'s turn to roll.`, ...s.history].slice(0, 5);
      return {
        ...s,
        currentPlayer: nextPlayer,
        diceRolled: false,
        diceValue: null,
        message: `${nextPlayer.charAt(0).toUpperCase() + nextPlayer.slice(1)}'s turn!`,
        history
      };
    });
  }, []);

  const handleRollDice = useCallback(() => {
    if (state.diceRolled || state.winner || state.rollingAnim) return;

    setState(s => ({ ...s, rollingAnim: true, message: 'Rolling...' }));

    setTimeout(() => {
      const val = Math.floor(Math.random() * 6) + 1;
      
      setState(s => {
        const playerColorCap = s.currentPlayer.charAt(0).toUpperCase() + s.currentPlayer.slice(1);
        const history = [`${playerColorCap} rolled a ${val}!`, ...s.history].slice(0, 5);
        
        const newState = {
          ...s,
          rollingAnim: false,
          diceValue: val,
          diceRolled: true,
          message: `${playerColorCap} rolled ${val}!`,
          history
        };
        
        stateRef.current = newState; // update ref immediately
        return newState;
      });

      // After settling, check for valid moves
      setTimeout(() => {
        const current = stateRef.current;
        const movable = getMovablePieces(current.pieces, current.currentPlayer, val);
        if (movable.length === 0) {
          setState(s => ({ ...s, message: 'No valid moves. Skipping turn...' }));
          setTimeout(() => {
            nextTurn();
          }, 1500);
        } else if (movable.length === 1 && current.pieces[current.currentPlayer][movable[0]] !== -1 && false) {
           // Auto move if only 1 move is possible and it's not a yard piece? 
           // Usually it's fun to let the user click anyway. We'll let them click.
        } else {
           setState(s => ({ ...s, message: 'Select a piece to move.' }));
        }
      }, 500);

    }, 600);
  }, [state.diceRolled, state.winner, state.rollingAnim, nextTurn]);

  const handlePieceClick = useCallback((player: PlayerColor, pieceIndex: number) => {
    const s = stateRef.current;
    if (s.currentPlayer !== player || !s.diceRolled || !s.diceValue || s.winner) return;

    const movable = getMovablePieces(s.pieces, player, s.diceValue);
    if (!movable.includes(pieceIndex)) return;

    const oldPos = s.pieces[player][pieceIndex];
    let newPos = oldPos === -1 ? 0 : oldPos + s.diceValue;
    let message = '';
    let captureMsg = '';
    const newPieces = JSON.parse(JSON.stringify(s.pieces)) as GameState['pieces'];
    
    // Check capture
    if (newPos < 51) {
      const absIdx = (START_INDEX[player] + newPos) % 51;
      if (!SAFE_CELLS.has(absIdx)) {
        // Find if other players are on this absIdx
        for (const otherPlayer of PLAYER_COLORS) {
          if (otherPlayer === player) continue;
          for (let i = 0; i < 4; i++) {
            const opPos = newPieces[otherPlayer][i];
            if (opPos >= 0 && opPos < 51) {
              const opAbsIdx = (START_INDEX[otherPlayer] + opPos) % 51;
              if (opAbsIdx === absIdx) {
                // CAPTURE!
                newPieces[otherPlayer][i] = -1;
                captureMsg = `${player.charAt(0).toUpperCase() + player.slice(1)} captured ${otherPlayer}'s piece!`;
              }
            }
          }
        }
      }
    }

    newPieces[player][pieceIndex] = newPos;
    
    // Check win
    const hasWon = newPieces[player].every(p => p === 57);
    
    setState(prev => {
      const history = captureMsg 
        ? [captureMsg, ...prev.history].slice(0, 5)
        : prev.history;

      return {
        ...prev,
        pieces: newPieces,
        winner: hasWon ? player : null,
        message: hasWon ? `${player.toUpperCase()} WINS!` : (captureMsg || 'Nice move!'),
        history
      };
    });

    if (hasWon) return;

    // Extra turn if rolled 6 or captured
    setTimeout(() => {
      if (s.diceValue === 6 || captureMsg) {
        setState(prev => ({
          ...prev,
          diceRolled: false,
          diceValue: null,
          message: `${player.charAt(0).toUpperCase() + player.slice(1)} gets another turn!`,
          history: [`${player.charAt(0).toUpperCase() + player.slice(1)} gets another turn!`, ...stateRef.current.history].slice(0, 5)
        }));
      } else {
        nextTurn();
      }
    }, 800);

  }, [nextTurn]);

  const resetGame = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    rollDice: handleRollDice,
    movePiece: handlePieceClick,
    resetGame,
  };
}
