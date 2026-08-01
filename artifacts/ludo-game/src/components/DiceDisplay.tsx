import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DiceDisplayProps {
  value: number | null;
  rolling: boolean;
  color: string;
  onClick?: () => void;
  disabled?: boolean;
}

const DOT_POSITIONS = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [25, 75], [75, 25], [75, 75]],
  5: [[25, 25], [25, 75], [50, 50], [75, 25], [75, 75]],
  6: [[25, 20], [25, 50], [25, 80], [75, 20], [75, 50], [75, 80]],
};

export function DiceDisplay({ value, rolling, color, onClick, disabled }: DiceDisplayProps) {
  const [displayValue, setDisplayValue] = React.useState<number>(value || 6);
  const canClick = onClick && !disabled && !rolling;

  React.useEffect(() => {
    if (rolling) {
      const interval = setInterval(() => {
        setDisplayValue(Math.floor(Math.random() * 6) + 1);
      }, 80);
      return () => clearInterval(interval);
    } else if (value !== null) {
      setDisplayValue(value);
    }
  }, [rolling, value]);

  const dots = DOT_POSITIONS[(displayValue as keyof typeof DOT_POSITIONS) || 1];

  return (
    <motion.div
      className="relative w-20 h-20 bg-white rounded-2xl shadow-xl flex items-center justify-center border-4 select-none"
      style={{
        borderColor: color,
        cursor: canClick ? 'pointer' : 'default',
        boxShadow: canClick
          ? `0 0 0 0 ${color}88, 0 8px 32px -4px ${color}66`
          : undefined,
      }}
      animate={
        rolling
          ? { rotate: [0, 90, 180, 270, 360], scale: [1, 1.1, 1] }
          : { rotate: 0, scale: 1 }
      }
      transition={{ duration: 0.4, ease: 'linear', repeat: rolling ? Infinity : 0 }}
      whileHover={canClick ? { scale: 1.1, boxShadow: `0 0 24px 6px ${color}88` } : {}}
      whileTap={canClick ? { scale: 0.93 } : {}}
      onClick={canClick ? onClick : undefined}
    >
      {/* Pulse ring when ready to roll */}
      {canClick && (
        <motion.div
          className="absolute inset-[-4px] rounded-2xl pointer-events-none"
          style={{ border: `3px solid ${color}` }}
          animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.12, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div className="absolute inset-2">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={displayValue}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.15 }}
            className="w-full h-full relative"
          >
            {dots.map(([cx, cy], i) => (
              <div
                key={i}
                className="absolute w-3 h-3 rounded-full"
                style={{
                  backgroundColor: color,
                  left: `${cx}%`,
                  top: `${cy}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
