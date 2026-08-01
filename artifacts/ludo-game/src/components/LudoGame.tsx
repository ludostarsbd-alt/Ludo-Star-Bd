import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LudoBoard } from './LudoBoard';
import { DiceDisplay } from './DiceDisplay';
import { useLudo } from '../hooks/useLudo';
import { COLORS, PlayerColor } from '../types/ludo';
import { Trophy, RefreshCw, Dices, ChevronRight } from 'lucide-react';

export function LudoGame() {
  const { state, rollDice, movePiece, resetGame } = useLudo();

  const isCurrentTurnRolled = state.diceRolled;
  const hasValidMoves = state.diceRolled && !state.rollingAnim && !state.winner; // This is a simplification, exact validation is in hook
  
  return (
    <div className="min-h-[100dvh] w-full flex flex-col xl:flex-row items-center justify-center p-4 xl:p-8 gap-8 overflow-hidden text-slate-100">
      
      {/* BACKGROUND ELEMENTS */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
         <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full mix-blend-screen" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/20 blur-[100px] rounded-full mix-blend-screen" />
         <div className="absolute top-[40%] right-[10%] w-[30%] h-[30%] bg-green-500/10 blur-[80px] rounded-full mix-blend-screen" />
      </div>

      {/* MAIN GAME BOARD */}
      <div className="w-full max-w-[600px] flex-shrink-0 relative">
        <LudoBoard state={state} onPieceClick={movePiece} />
        
        {/* WIN SCREEN OVERLAY */}
        <AnimatePresence>
          {state.winner && (
            <motion.div 
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
              exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 rounded-[3%]"
            >
              <motion.div 
                initial={{ scale: 0.5, y: 50 }}
                animate={{ scale: 1, y: 0 }}
                className="glass-panel p-8 rounded-3xl flex flex-col items-center text-center shadow-2xl border-white/20 border"
                style={{
                  background: `linear-gradient(135deg, ${COLORS[state.winner].dark}88, rgba(20,20,30,0.9))`
                }}
              >
                <Trophy className="w-20 h-20 mb-4" style={{ color: COLORS[state.winner].light }} />
                <h2 className="text-4xl font-bold mb-2 uppercase tracking-wider" style={{ color: COLORS[state.winner].light }}>
                  {state.winner} Wins!
                </h2>
                <p className="text-slate-300 mb-8 font-medium">What a spectacular victory.</p>
                
                <button 
                  onClick={resetGame}
                  className="px-8 py-3 rounded-full font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                  style={{ backgroundColor: COLORS[state.winner].main, color: 'white' }}
                >
                  <RefreshCw className="w-5 h-5" /> Play Again
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* GAME PANEL */}
      <div className="w-full max-w-[600px] xl:max-w-[400px] xl:h-[600px] glass-panel rounded-3xl p-6 xl:p-8 flex flex-col justify-between z-10 relative shadow-2xl border-white/10">
        
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">
              LUDO
            </h1>
            <button 
              onClick={resetGame}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white"
              title="Reset Game"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {/* CURRENT TURN BADGE */}
          <div 
            className="rounded-2xl p-4 flex items-center justify-between border shadow-lg transition-colors duration-500"
            style={{ 
              backgroundColor: `${COLORS[state.currentPlayer].dark}40`,
              borderColor: `${COLORS[state.currentPlayer].main}40`,
              boxShadow: `0 4px 20px -5px ${COLORS[state.currentPlayer].dark}60`
            }}
          >
            <div>
              <p className="text-sm font-medium text-white/60 uppercase tracking-widest mb-1">Current Turn</p>
              <h2 
                className="text-2xl font-bold capitalize flex items-center gap-2"
                style={{ color: COLORS[state.currentPlayer].light }}
              >
                <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: COLORS[state.currentPlayer].main }} />
                {state.currentPlayer}
              </h2>
            </div>
            
            <DiceDisplay 
              value={state.diceValue} 
              rolling={state.rollingAnim} 
              color={COLORS[state.currentPlayer].main}
            />
          </div>

          {/* MAIN MESSAGE */}
          <div className="text-center py-4">
             <motion.p 
               key={state.message}
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               className="text-xl font-medium text-white/90 min-h-[2rem]"
             >
               {state.message}
             </motion.p>
          </div>

          {/* ACTION BUTTON */}
          <button
            onClick={rollDice}
            disabled={isCurrentTurnRolled || state.winner !== null || state.rollingAnim}
            className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
              !isCurrentTurnRolled && !state.winner && !state.rollingAnim
                ? 'hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl cursor-pointer'
                : 'opacity-50 cursor-not-allowed saturate-0'
            }`}
            style={{ 
              backgroundColor: COLORS[state.currentPlayer].main,
              color: 'white'
            }}
          >
            <Dices className="w-6 h-6" />
            {state.rollingAnim ? 'Rolling...' : isCurrentTurnRolled ? 'Waiting for move...' : 'Roll Dice'}
          </button>
        </div>

        {/* GAME LOG */}
        <div className="mt-8 pt-6 border-t border-white/10 flex-1 flex flex-col min-h-[140px]">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">Action Log</h3>
          <div className="flex-1 overflow-hidden relative">
            <div className="absolute inset-0 mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)]">
              <AnimatePresence initial={false}>
                {state.history.map((log, i) => (
                  <motion.div
                    key={`${log}-${i}`}
                    initial={{ opacity: 0, x: -20, height: 0 }}
                    animate={{ opacity: 1 - (i * 0.25), x: 0, height: 'auto' }}
                    className="flex items-start gap-2 mb-2 text-sm"
                    style={{ color: i === 0 ? 'white' : 'rgba(255,255,255,0.6)' }}
                  >
                    <ChevronRight className="w-4 h-4 mt-0.5 opacity-50 shrink-0" />
                    <span className="font-medium">{log}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
