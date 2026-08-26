/**
 * Builds the soundtrack and muxes it onto a rendered video.
 *
 * The cues below are the same numbers as the scene boundaries in the ad
 * template, offset by the beat it takes a scene to arrive. They are written out
 * rather than derived because a soundtrack is a performance, not a calculation:
 * the applause starts *before* the winning score lands so that it feels like a
 * reaction rather than a result.
 *
 * Run: node mix.mjs <video.mp4> [-o out.mp4]
 */

import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ffmpeg from 'ffmpeg-static';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIO = join(HERE, 'audio');

/*
  Levels, in one place.

  The voice is the subject and everything else is furniture around it. These
  are deliberate and unequal: the synthesised applause peaks low, so it needs
  lifting, while the music was written quiet on purpose and needs holding down
  further still so it never competes with a line of speech.
*/
const GAIN = {
  music: 0.5,
  voice: 1.5,
  applause: 2.4,
  whistle: 0.55,
};

/** Every cue: which file, when it starts, and how loud. */
const CUES = [
  // A referee's whistle opens the film, before the first word.
  { file: 'whistle.wav', at: 0.12, gain: GAIN.whistle },
  // And again as the clock scene begins — the round starting.
  { file: 'whistle.wav', at: 14.15, gain: GAIN.whistle * 0.8 },

  /*
    Applause starts a beat before the top score finishes counting, so it reads
    as a crowd reacting to the result rather than being played at it, and runs
    on under the closing card.
  */
  { file: 'applause.wav', at: 30.4, gain: GAIN.applause },

  // The voiceover, one line per scene, each landing after its scene arrives.
  { file: 'trimmed/vo1.wav', at: 0.55, gain: GAIN.voice },
  { file: 'trimmed/vo2.wav', at: 6.35, gain: GAIN.voice },
  { file: 'trimmed/vo3.wav', at: 14.5, gain: GAIN.voice },
  { file: 'trimmed/vo4.wav', at: 21.5, gain: GAIN.voice },
  { file: 'trimmed/vo5.wav', at: 28.1, gain: GAIN.voice },
  { file: 'trimmed/vo6.wav', at: 33.5, gain: GAIN.voice },
];

const [video, ...rest] = process.argv.slice(2);
if (!video) throw new Error('Usage: node mix.mjs <video.mp4> [-o out.mp4]');

const outIndex = rest.indexOf('-o');
const out = resolve(HERE, outIndex >= 0 ? rest[outIndex + 1] : video.replace(/\.mp4$/, '-sound.mp4'));

const inputs = ['-i', resolve(HERE, video), '-i', join(AUDIO, 'music.wav')];
for (const cue of CUES) inputs.push('-i', join(AUDIO, cue.file));

/*
  Each cue is delayed to its start and then everything is summed.

  `adelay` wants milliseconds per channel, hence the pair. `normalize=0` on the
  mix matters: left on, ffmpeg divides every input by the number of inputs, so
  adding a one-second whistle would quietly drop the whole soundtrack by 9dB.
*/
const parts = [];
parts.push(`[1:a]volume=${GAIN.music},aformat=sample_rates=48000:channel_layouts=stereo[bed]`);

const labels = ['[bed]'];
CUES.forEach((cue, i) => {
  const label = `c${i}`;
  const ms = Math.round(cue.at * 1000);
  parts.push(
    `[${i + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,` +
      `volume=${cue.gain},adelay=${ms}|${ms}[${label}]`,
  );
  labels.push(`[${label}]`);
});

parts.push(
  `${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0[sum]`,
  // A limiter rather than a fader: the only moments that peak are the whistle
  // and the applause landing together, and ducking the whole mix for that would
  // be audible everywhere else.
  `[sum]alimiter=limit=0.95:level=disabled,loudnorm=I=-14:TP=-1.5:LRA=11[mixed]`,
);

execFileSync(
  ffmpeg,
  [
    '-y',
    ...inputs,
    '-filter_complex', parts.join(';'),
    '-map', '0:v',
    '-map', '[mixed]',
    // The picture is already encoded; re-encoding it here would cost a
    // generation of quality for nothing.
    '-c:v', 'copy',
    '-c:a', 'aac',
    /*
      Back to 48kHz explicitly.

      `loudnorm` resamples its output — to 96kHz here — and while most players
      cope, an unusual rate is the kind of thing a platform's transcoder
      rejects or silently mangles. 48k is what every video pipeline expects.
    */
    '-ar', '48000',
    '-b:a', '192k',
    // Ends with the picture, not with the longest audio tail.
    '-shortest',
    '-movflags', '+faststart',
    out,
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

console.log(`Wrote ${out}`);
