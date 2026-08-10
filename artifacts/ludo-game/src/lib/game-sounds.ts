let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioContext ??= new AudioContextCtor();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0) {
  const context = getAudioContext();
  if (!context) return;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function playDiceRollSound() {
  tone(180, 0.07, "square", 0.035);
  tone(260, 0.08, "square", 0.025, 0.08);
}

export function playMoveStepSound() {
  tone(420, 0.045, "sine", 0.018);
}

export function playCaptureSound() {
  tone(150, 0.12, "sawtooth", 0.04);
  tone(90, 0.16, "triangle", 0.03, 0.08);
}