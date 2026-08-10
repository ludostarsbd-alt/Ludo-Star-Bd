let audioContext: AudioContext | null = null;
let resumePromise: Promise<void> | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioContext ??= new AudioContextCtor();
  return audioContext;
}

function withAudio(callback: (context: AudioContext) => void) {
  const context = getAudioContext();
  if (!context) return;

  // Mobile browsers create Web Audio in a suspended state until the first
  // user gesture. Wait for the unlock before scheduling tones; scheduling
  // while suspended can otherwise produce no audible output.
  if (context.state === "suspended") {
    resumePromise ??= context.resume().finally(() => {
      resumePromise = null;
    });
    void resumePromise.then(() => callback(context)).catch(() => undefined);
    return;
  }
  callback(context);
}

function tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0) {
  withAudio((context) => {
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
  });
}

export function playDiceRollSound() {
  tone(180, 0.08, "square", 0.09);
  tone(290, 0.09, "square", 0.07, 0.08);
  tone(430, 0.08, "square", 0.05, 0.16);
}

export function playMoveStepSound() {
  tone(420, 0.06, "sine", 0.055);
}

export function playCaptureSound() {
  tone(150, 0.14, "sawtooth", 0.12);
  tone(90, 0.18, "triangle", 0.09, 0.08);
}

export function playHomeSound() {
  tone(520, 0.1, "sine", 0.08);
  tone(700, 0.14, "sine", 0.1, 0.1);
  tone(900, 0.18, "sine", 0.08, 0.22);
}

export function playWinSound() {
  tone(523, 0.14, "triangle", 0.1);
  tone(659, 0.14, "triangle", 0.1, 0.14);
  tone(784, 0.24, "triangle", 0.12, 0.28);
}