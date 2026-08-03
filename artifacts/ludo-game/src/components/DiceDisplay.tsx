import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DiceDisplayProps {
  value: number | null;
  rolling: boolean;
  color: string;
  onClick?: () => void;
  disabled?: boolean;
  size?: number; // px, default 72
}

const DOT_POSITIONS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [28, 72], [72, 28], [72, 72]],
  5: [[28, 28], [28, 72], [50, 50], [72, 28], [72, 72]],
  6: [[28, 20], [28, 50], [28, 80], [72, 20], [72, 50], [72, 80]],
};

export function DiceDisplay({ value, rolling, color, onClick, disabled, size = 72 }: DiceDisplayProps) {
  const [displayValue, setDisplayValue] = React.useState<number>(value || 1);
  const canClick = onClick && !disabled && !rolling;
  const dotSize = Math.max(4, Math.round(size * 0.15));

  React.useEffect(() => {
    if (rolling) {
      const interval = setInterval(() => {
        setDisplayValue(Math.floor(Math.random() * 6) + 1);
      }, 35); // very fast flicker
      return () => clearInterval(interval);
    } else if (value !== null) {
      setDisplayValue(value);
    }
    return undefined;
  }, [rolling, value]);

  const dots = DOT_POSITIONS[(displayValue as keyof typeof DOT_POSITIONS) || 1];

  return (
    <motion.div
      className="relative bg-white rounded-md shadow-lg flex items-center justify-center border-2 select-none flex-shrink-0"
      style={{
        width: size,
        height: size,
        borderColor: color,
        cursor: canClick ? 'pointer' : 'default',
      }}
      animate={
        rolling
          ? { rotate: [0, 180, 360], scale: [1, 1.15, 1, 1.15, 1] }
          : { rotate: 0, scale: 1 }
      }
      transition={{ duration: 0.18, ease: 'linear', repeat: rolling ? Infinity : 0 }}
      whileHover={canClick ? { scale: 1.12 } : {}}
      whileTap={canClick ? { scale: 0.9 } : {}}
      onClick={canClick ? onClick : undefined}
    >
      {/* Pulse ring when ready to roll */}
      {canClick && (
        <motion.div
          className="absolute inset-[-3px] rounded-xl pointer-events-none"
          style={{ border: `2px solid ${color}` }}
          animate={{ opacity: [0.7, 0, 0.7], scale: [1, 1.15, 1] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div className="absolute" style={{ inset: size * 0.1 }}>
        <AnimatePresence mode="popLayout">
          <motion.div
            key={displayValue}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.12 }}
            className="w-full h-full relative"
          >
            {dots.map(([cx, cy], i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  backgroundColor: color,
                  width: dotSize,
                  height: dotSize,
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
