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

/**
 * Every sound the app can make.
 *
 * Trimmed from eleven. The four that went — a matchmaking fanfare, a
 * queue-search blip, a reel detent and a reaction pop — belonged to features
 * that were removed or never built, and an unused recipe reads as a sound
 * somebody forgot to trigger rather than one nobody wanted. `win` and `lose`
 * were also unplayed and were wired up instead of deleted.
 */
export type SoundName =
  | 'press'
  | 'select'
  | 'tick'
  | 'start'
  | 'vote'
  | 'win'
  | 'lose'
  | 'reelTick'
  | 'reelLock';

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

  // The pre-round countdown: a tick per second, then a different note on zero.
  tick: () => tone({ from: 880, duration: 0.06, type: 'square', gain: 0.18 }),
  start: () => {
    tone({ from: 660, duration: 0.1, gain: 0.24 });
    tone({ from: 1320, to: 1600, duration: 0.32, delay: 0.08, gain: 0.26 });
  },

  vote: () => tone({ from: 600, to: 900, duration: 0.1, type: 'triangle', gain: 0.18 }),

  /*
    One card passing the marker on the challenge machine.

    Deliberately not `tick`. That one is a countdown beep — 880Hz, a quarter of
    a second of gain, pitched to be *noticed* once a second. Fired thirty times
    in four seconds it stops being a machine and becomes an alarm.

    This is short, quiet and high, so what carries is the rhythm rather than the
    note: the ear hears a rattle that slows, which is the whole sound of a reel
    coming to rest. The pitch wanders a little each time because a real
    mechanism never strikes twice identically, and a perfectly repeated click is
    the thing that reads as synthetic.
  */
  reelTick: () =>
    tone({
      from: 1250 + Math.random() * 280,
      to: 820,
      duration: 0.028,
      type: 'square',
      gain: 0.055,
    }),

  /*
    The card locking under the rails.

    A low thunk for the mechanism landing and a bright fifth above it for the
    result being announced — the two halves of "it stopped" and "here it is".
    Louder than the ticks by a wide margin, because it is the one moment in the
    sequence that means something.
  */
  reelLock: () => {
    tone({ from: 180, to: 120, duration: 0.16, type: 'square', gain: 0.22 });
    tone({ from: 660, to: 990, duration: 0.22, delay: 0.04, type: 'triangle', gain: 0.2 });
  },

  // Played once when a room's result first appears, to whoever placed.
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
