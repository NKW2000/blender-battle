/**
 * Synthesises the ad's sound bed: music, applause and a whistle.
 *
 * Nothing here is sampled. Downloading a stock loop means inheriting a licence
 * the project would then have to honour every time the video is re-cut, and a
 * "royalty free" file from an unclear source is a claim on someone's channel
 * waiting to happen. Everything below is generated from oscillators and noise,
 * so it belongs to this repository outright — and an arcade product is one of
 * the few places where a square wave is the right answer anyway.
 *
 * Run: node audio/synth.mjs
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const RATE = 48000;

/* ------------------------------------------------------------------ WAV */

function writeWav(path, left, right = left) {
  const frames = left.length;
  const data = Buffer.alloc(frames * 4); // 16-bit stereo

  for (let i = 0; i < frames; i += 1) {
    // Clamped, not wrapped: a sample past full scale must flatten rather than
    // fold over into a loud click.
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    data.writeInt16LE(Math.round(l * 32767), i * 4);
    data.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(2, 22); // stereo
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  writeFileSync(path, Buffer.concat([header, data]));
  console.log(`${path.split(/[\\/]/).pop()}  ${(frames / RATE).toFixed(2)}s`);
}

const seconds = (n) => Math.round(n * RATE);

/* -------------------------------------------------------- oscillators */

/** A deterministic noise source, so two runs produce the same file. */
function noise(seed = 1) {
  let state = seed >>> 0;
  return () => {
    // xorshift32 — cheap, and repeatable, which `Math.random` is not.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff) * 2 - 1;
  };
}

const square = (phase, duty = 0.5) => ((phase % 1) < duty ? 1 : -1);
const triangle = (phase) => 4 * Math.abs((phase % 1) - 0.5) - 1;

/** Exponential decay, the shape almost every percussive sound has. */
const decay = (t, tau) => Math.exp(-t / tau);

/** A one-pole low-pass, for taking the fizz off noise. */
function lowpass(cutoffHz) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoffHz) / RATE);
  let z = 0;
  return (x) => {
    z += a * (x - z);
    return z;
  };
}

/** A one-pole high-pass, built from its low-pass complement. */
function highpass(cutoffHz) {
  const lp = lowpass(cutoffHz);
  return (x) => x - lp(x);
}

/* ------------------------------------------------------------- applause */

/**
 * A crowd, built one pair of hands at a time.
 *
 * A single burst of filtered noise reads as static. What makes applause sound
 * like people is that it is hundreds of individual claps at slightly different
 * times, pitches and distances — so that is what this is, with the density
 * swelling and falling away rather than switching on.
 */
function applause(length = 6, seed = 7) {
  const n = seconds(length);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const rand = noise(seed);

  const claps = 2600;
  for (let i = 0; i < claps; i += 1) {
    const u = rand() * 0.5 + 0.5;

    /*
      Bunched towards the front.

      Applause arrives as a burst and thins out; distributing the claps evenly
      would give a flat wash that starts and stops like a switch.
    */
    const at = Math.pow(u, 0.7) * (length * 0.82) + 0.02;
    const start = seconds(at);
    if (start >= n) continue;

    // Each clap is a short noise transient. The pitch varies because hands and
    // rooms do.
    const tau = 0.006 + (rand() * 0.5 + 0.5) * 0.02;
    const bright = 1200 + (rand() * 0.5 + 0.5) * 2600;
    const hp = highpass(bright * 0.5);
    const lp = lowpass(bright * 3);

    // Where this person is standing.
    const pan = rand();
    const gainL = Math.sqrt((1 - pan) * 0.5 + 0.5) * 0.05;
    const gainR = Math.sqrt((1 + pan) * 0.5 * 0.5 + 0.5) * 0.05;

    const life = seconds(tau * 5);
    for (let s = 0; s < life && start + s < n; s += 1) {
      const t = s / RATE;
      const env = decay(t, tau);
      const sample = lp(hp(rand())) * env;
      left[start + s] += sample * gainL;
      right[start + s] += sample * gainR;
    }
  }

  // A gentle overall swell, so the crowd rises rather than appearing.
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    const swell = Math.min(1, t / 0.35) * decay(Math.max(0, t - length * 0.5), length * 0.4);
    left[i] *= swell;
    right[i] *= swell;
  }

  return { left, right };
}

/* -------------------------------------------------------------- whistle */

/**
 * A referee's whistle — the sound that starts a match.
 *
 * The warble is the whole character of it: a real whistle has a pea rattling
 * inside, which chops the tone a few dozen times a second. A clean sine at
 * 2.8kHz is a smoke alarm.
 */
function whistle(length = 0.85) {
  const n = seconds(length);
  const out = new Float32Array(n);
  const rand = noise(21);

  let phase = 0;
  let warblePhase = 0;

  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;

    // Rises quickly at the front, as breath pressure comes up.
    const pitch = 2550 + Math.min(1, t / 0.09) * 320 + Math.sin(t * 9) * 25;
    phase += pitch / RATE;
    warblePhase += 34 / RATE;

    const warble = 0.72 + 0.28 * Math.abs(Math.sin(warblePhase * Math.PI));
    const attack = Math.min(1, t / 0.035);
    const release = t > length - 0.16 ? Math.max(0, (length - t) / 0.16) : 1;

    // The breath behind the tone.
    const air = rand() * 0.06;

    out[i] =
      (Math.sin(phase * Math.PI * 2) * 0.55 + Math.sin(phase * Math.PI * 4) * 0.12 + air) *
      warble * attack * release * 0.5;
  }

  return { left: out, right: out };
}

/* ---------------------------------------------------------------- music */

/**
 * The bed: a driving arcade loop that stays under the voice.
 *
 * Written in A minor at 124bpm, which is quick enough to feel like a contest
 * and slow enough that the eighth notes do not fight the speech. Everything is
 * mixed deliberately quiet — this is the floor of the mix, not the subject.
 */
function music(length = 40) {
  const n = seconds(length);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const rand = noise(99);

  const bpm = 124;
  const beat = 60 / bpm;
  const step = beat / 2; // eighth notes

  const A = 220;
  const semitone = (k) => A * Math.pow(2, k / 12);

  // A minor: root, minor third, fifth, octave — the shape of almost every
  // arcade theme ever written.
  const arp = [0, 3, 7, 12, 7, 3];
  const bassLine = [0, 0, -5, -5, -3, -3, -7, -7];

  const hatFilter = highpass(6500);

  const totalSteps = Math.floor(length / step);
  for (let s = 0; s < totalSteps; s += 1) {
    const at = seconds(s * step);
    const bar = Math.floor(s / 8);

    /*
      The first eight seconds are sparse.

      The opening line of voiceover lands there, and a full arrangement under
      the first thing anyone hears is how a bed turns into noise.
    */
    const intro = s * step < 8 ? 0.45 : 1;

    // --- bass ---------------------------------------------------------
    {
      const note = semitone(bassLine[s % bassLine.length] - 24);
      const life = seconds(step * 0.9);
      for (let i = 0; i < life && at + i < n; i += 1) {
        const t = i / RATE;
        const env = Math.min(1, t / 0.004) * decay(t, 0.13);
        const v = square(note * t, 0.5) * env * 0.10 * intro;
        left[at + i] += v;
        right[at + i] += v;
      }
    }

    // --- arpeggio -----------------------------------------------------
    {
      const note = semitone(arp[s % arp.length] + 12);
      const life = seconds(step * 0.8);
      for (let i = 0; i < life && at + i < n; i += 1) {
        const t = i / RATE;
        const env = Math.min(1, t / 0.003) * decay(t, 0.075);
        const v = triangle(note * t) * env * 0.055 * intro;
        // Wide, so the middle stays clear for the voice.
        left[at + i] += v * 1.15;
        right[at + i] += v * 0.85;
      }
    }

    // --- kick, on every beat -------------------------------------------
    if (s % 2 === 0) {
      const life = seconds(0.16);
      for (let i = 0; i < life && at + i < n; i += 1) {
        const t = i / RATE;
        // Pitch drops fast — that sweep is what makes a sine sound like a drum.
        const f = 105 * decay(t, 0.03) + 42;
        const env = decay(t, 0.11);
        const v = Math.sin(2 * Math.PI * f * t) * env * 0.22 * intro;
        left[at + i] += v;
        right[at + i] += v;
      }
    }

    // --- hat, off the beat ---------------------------------------------
    if (s % 2 === 1) {
      const life = seconds(0.05);
      for (let i = 0; i < life && at + i < n; i += 1) {
        const t = i / RATE;
        const env = decay(t, 0.014);
        const v = hatFilter(rand()) * env * 0.035 * intro;
        left[at + i] += v * 0.8;
        right[at + i] += v * 1.2;
      }
    }

    // --- a snare to close each fourth bar --------------------------------
    if (bar % 4 === 3 && s % 8 === 7) {
      const life = seconds(0.2);
      const body = highpass(900);
      for (let i = 0; i < life && at + i < n; i += 1) {
        const t = i / RATE;
        const env = decay(t, 0.055);
        const v = body(rand()) * env * 0.16 * intro;
        left[at + i] += v;
        right[at + i] += v;
      }
    }
  }

  // Fade the last two seconds so the loop can end without a cut.
  const fade = seconds(2);
  for (let i = 0; i < fade; i += 1) {
    const g = 1 - i / fade;
    left[n - fade + i] *= g;
    right[n - fade + i] *= g;
  }

  return { left, right };
}

/* ----------------------------------------------------------------- main */

const clap = applause(6);
writeWav(join(HERE, 'applause.wav'), clap.left, clap.right);

const pip = whistle();
writeWav(join(HERE, 'whistle.wav'), pip.left, pip.right);

const bed = music(40);
writeWav(join(HERE, 'music.wav'), bed.left, bed.right);
