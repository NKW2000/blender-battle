'use client';

import { useState } from 'react';

import { SoundOffIcon, SoundOnIcon } from '@/components/ui/icons';
import { useMuteToggle } from '@/features/sound/use-sound';

/**
 * Mute switch for the whole sound kit.
 *
 * Sound defaults on because the effects are tied to deliberate actions rather
 * than playing on their own, but anything that makes noise has to be one click
 * from silent — especially on a page people leave open while they work.
 */
export function SoundToggle() {
  const { muted, toggle } = useMuteToggle();
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={toggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-pressed={muted}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      title={muted ? 'Sound off' : 'Sound on'}
      className="arcade-focus flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white/20 bg-white/6 transition-colors hover:border-white/40"
    >
      {/* The waves only animate on hover — a speaker permanently emitting arcs
          in the header would compete with everything else on the page. */}
      {muted ? <SoundOffIcon size={26} /> : <SoundOnIcon size={26} animate={hovered} />}
    </button>
  );
}
