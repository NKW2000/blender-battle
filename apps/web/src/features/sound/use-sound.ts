'use client';

import { useCallback, useEffect, useState } from 'react';

import { isMuted, loadMutePreference, playSound, setMuted, type SoundName } from '@/lib/sound/engine';

/**
 * Plays a named effect.
 *
 * Returns a stable callback so it can sit in effect dependency arrays without
 * re-running them — several callers fire sounds from effects keyed on a phase
 * change, and an unstable reference there would retrigger the sound.
 */
export function useSound() {
  return useCallback((name: SoundName) => playSound(name), []);
}

/** The mute toggle, backed by localStorage so the choice survives a reload. */
export function useMuteToggle() {
  const [mutedState, setMutedState] = useState(false);

  // Read after mount rather than during render: localStorage does not exist on
  // the server, and seeding state from it would desync hydration.
  useEffect(() => {
    setMutedState(loadMutePreference());
  }, []);

  const toggle = useCallback(() => {
    const next = !isMuted();
    setMuted(next);
    setMutedState(next);
    // Confirm audibly when switching sound back on — silence is ambiguous.
    if (!next) playSound('select');
  }, []);

  return { muted: mutedState, toggle };
}
