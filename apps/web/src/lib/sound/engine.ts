/**
 * The sound engine.
 *
 * Every effect is synthesised with oscillators rather than loaded from audio
 * files. That is a deliberate trade: the whole kit costs zero network bytes and
 * nothing to license, and short square/triangle blips are exactly the register
 * this arcade language already speaks in. Sampled audio would be larger, slower
 * to start, and no better for sounds this short.
 *
 * The context is created lazily on the first play, because browsers refuse to
 * start an AudioContext outside a user gesture and a suspended one created at
 * import time would leave every later sound silent.
 */

export type SoundName =
  | 'press'
  | 'select'
  | 'searching'
  | 'matchFound'
  | 'tick'
  | 'reelStep'
  | 'start'
  | 'vote'
  | 'reaction'
  | 'win'
  | 'lose';

let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

const STORAGE_KEY = 'bb.muted';

export function isMuted(): boolean {
  return muted;
}

export function loadMutePreference(): boolean {
  if (typeof window === 'undefined') return false;
  muted = window.localStorage.getItem(STORAGE_KEY) === '1';
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  }
  if (master && context) {
    master.gain.setTargetAtTime(next ? 0 : 0.9, context.currentTime, 0.01);
  }
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(context.destination);
  }

  // Autoplay policy parks the context in "suspended" until a gesture resumes it.
  if (context.state === 'suspended') void context.resume();
  return context;
}

/**
 * One oscillator voice.
 *
 * `from`/`to` sweep the pitch, which is what separates a rising "found it" from
 * a falling "you lost" without needing different waveforms for each.
 */
function tone(options: {
  from: number;
  to?: number;
  duration: number;
  delay?: number;
  type?: OscillatorType;
  gain?: number;
}): void {
  const ctx = ensureContext();
  if (!ctx || !master) return;

  const start = ctx.currentTime + (options.delay ?? 0);
  const end = start + options.duration;

  const osc = ctx.createOscillator();
  osc.type = options.type ?? 'square';
  osc.frequency.setValueAtTime(options.from, start);
  if (options.to && options.to !== options.from) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), end);
  }

  // Short attack, exponential decay. A raw gate would click audibly at these
  // durations, which is the one artefact that makes synthesised UI sound cheap.
  const envelope = ctx.createGain();
  const peak = options.gain ?? 0.22;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(envelope);
  envelope.connect(master);
  osc.start(start);
  osc.stop(end + 0.02);
}

const RECIPES: Record<SoundName, () => void> = {
  // Blunt and short: this fires on every button in the app, so it has to survive
  // being heard hundreds of times without becoming irritating.
  press: () => tone({ from: 320, to: 200, duration: 0.07, gain: 0.16 }),
  select: () => tone({ from: 520, to: 660, duration: 0.06, type: 'triangle', gain: 0.14 }),
  searching: () => tone({ from: 440, to: 520, duration: 0.09, type: 'triangle', gain: 0.12 }),

  // Rising three-note arpeggio — the single most important sound in the app.
  matchFound: () => {
    tone({ from: 523, duration: 0.1, gain: 0.2 });
    tone({ from: 659, duration: 0.1, delay: 0.09, gain: 0.2 });
    tone({ from: 880, to: 1046, duration: 0.22, delay: 0.18, gain: 0.24 });
  },

  tick: () => tone({ from: 880, duration: 0.06, type: 'square', gain: 0.18 }),

  /**
   * One card passing the pointer on the reel.
   *
   * Much quieter and shorter than `tick`: this fires many times a second while
   * the reel spins, so anything with body to it turns into a drone. It is a
   * detent click, not a note.
   */
  reelStep: () => tone({ from: 1400, to: 1150, duration: 0.022, type: 'square', gain: 0.05 }),
  start: () => {
    tone({ from: 660, duration: 0.1, gain: 0.24 });
    tone({ from: 1320, to: 1600, duration: 0.32, delay: 0.08, gain: 0.26 });
  },

  vote: () => tone({ from: 600, to: 900, duration: 0.1, type: 'triangle', gain: 0.18 }),
  reaction: () => tone({ from: 780, to: 1100, duration: 0.08, type: 'sine', gain: 0.16 }),

  win: () => {
    tone({ from: 523, duration: 0.12, gain: 0.24 });
    tone({ from: 659, duration: 0.12, delay: 0.11, gain: 0.24 });
    tone({ from: 784, duration: 0.12, delay: 0.22, gain: 0.24 });
    tone({ from: 1046, duration: 0.4, delay: 0.33, gain: 0.26 });
  },
  lose: () => {
    tone({ from: 392, duration: 0.16, type: 'sawtooth', gain: 0.18 });
    tone({ from: 330, duration: 0.16, delay: 0.14, type: 'sawtooth', gain: 0.18 });
    tone({ from: 247, to: 160, duration: 0.5, delay: 0.28, type: 'sawtooth', gain: 0.2 });
  },
};

export function playSound(name: SoundName): void {
  if (muted) return;
  try {
    RECIPES[name]();
  } catch {
    // Audio is decoration. A blocked or unavailable context must never take a
    // click handler down with it.
  }
}
