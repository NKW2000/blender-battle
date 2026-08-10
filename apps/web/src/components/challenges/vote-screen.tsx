'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ChevronIcon } from '@/components/ui/icons';
import { useSession } from '@/features/auth/use-session';
import { useSound } from '@/features/sound/use-sound';
import { useVoteEvent, type EventDetail, type EventEntry } from '@/features/challenges/use-events';

/**
 * The vote screen, ported from the "Blender Battle" design canvas.
 *
 * A vertical wheel of entries on the left — one card in focus, the rest stacked,
 * scaled back and blurred — beside a fixed reference panel on the right.
 *
 * The ballot is anonymous and final. During voting the server sends the image
 * only — no author, no vote count — so a card is judged on the work alone. A
 * vote is confirmed, then cast once and cannot be changed: pressing it opens a
 * dialog, and after it lands every card locks until the next challenge. The
 * names and the tally appear only when voting closes, on the finished screen.
 *
 * Deliberately *not* called a "blind ballot". That is the rooms mechanic, which
 * additionally shuffles the order per voter and time-boxes each entry; here you
 * browse the wheel at your own pace and vote when you like. Both hide the
 * author, so both are anonymous — only one takes the pacing out of your hands,
 * and calling them the same thing made two different promises sound identical.
 *
 * The wheel is a transform-only layout: every card is absolutely positioned and
 * offset by `translateY((i - active) * 100%)`, so moving the focus is one state
 * change rather than a reflow, and the eased transform does the animation. It
 * loops — stepping past the last entry wraps to the first, and vice versa.
 */
export function VoteScreen({ event }: { event: EventDetail }) {
  const { user } = useSession();
  const vote = useVoteEvent(event.id);
  const play = useSound();
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<string | null>(event.myVoteEntryId);
  const [burstId, setBurstId] = useState<string | null>(null);
  // The entry awaiting confirmation. Non-null while the "vote for this?" dialog
  // is open; cleared on confirm or cancel.
  const [pending, setPending] = useState<EventEntry | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const wheelAtRef = useRef(0);

  const entries = event.entries;
  const count = entries.length;
  // One vote, final: once cast, the whole ballot locks for this voter.
  const hasVoted = picked !== null;
  /*
    Only artists who entered may vote, and the server refuses anyone else.

    Shown as a disabled ballot with an explanation rather than a hidden one:
    hiding it would leave a viewer who arrived from a shared link staring at a
    page with no obvious reason why they cannot take part, and an enabled button
    that returns 403 is worse still.
  */
  const didEnter = event.myEntryId !== null;
  /*
    A confirmed address, too — the server refuses a vote without one.

    Reflected here rather than left to the 403, for the same reason the
    entrants-only rule is: a button that looks live and then fails reads as a
    broken site, and the remedy (check your inbox) is not something anyone
    guesses from an error toast.
  */
  const isVerified = Boolean(user?.emailVerifiedAt);
  const canVote = didEnter && isVerified && !hasVoted;

  const step = useCallback(
    (dir: number) => {
      // Wraps at both ends, so holding a direction cycles the wheel endlessly.
      setActive((current) => (count === 0 ? 0 : (current + dir + count) % count));
    },
    [count],
  );

  // Keep the focus in range if the entry list shrinks under a poll (an entry
  // hidden by a moderator), otherwise `active` would point past the end and the
  // wheel would show a blank slot.
  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, count - 1)));
  }, [count]);

  // Reconcile the local pick with the server's record whenever a refetch brings
  // a new value — but never while a vote is in flight, or the background poll
  // would yank the highlight off the entry the user just clicked before the
  // write lands. This is what keeps the pick correct across the 15s poll and a
  // second open tab, rather than frozen at whatever it was on first mount.
  useEffect(() => {
    if (vote.isPending) return;
    setPicked(event.myVoteEntryId);
  }, [event.myVoteEntryId, vote.isPending]);

  // A press only asks. Nothing is sent until the dialog is confirmed, and a
  // voter who has already voted, or is looking at their own entry, cannot open
  // it at all.
  const requestVote = (entry: EventEntry) => {
    if (!canVote || entry.id === event.myEntryId) return;
    setPending(entry);
  };

  const confirmVote = () => {
    const entry = pending;
    setPending(null);
    if (!entry) return;

    // Optimistic: the ballot locks immediately. A rejection unwinds it.
    setPicked(entry.id);
    setBurstId(entry.id);
    play('vote');
    setTimeout(() => setBurstId(null), 700);
    vote.mutate(entry.id, { onError: () => setPicked(event.myVoteEntryId) });
  };

  // Scroll and arrow keys move the focus, throttled so one wheel notch is one
  // step rather than a blur of them. Bound to the wheel region, not the window,
  // so scrolling the reference panel or the page is unaffected.
  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;

    const onWheel = (wheelEvent: WheelEvent) => {
      const now = Date.now();
      if (now - wheelAtRef.current < 420) return;
      wheelAtRef.current = now;
      step(wheelEvent.deltaY > 0 ? 1 : -1);
    };
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'ArrowDown') {
        keyEvent.preventDefault();
        step(1);
      } else if (keyEvent.key === 'ArrowUp') {
        keyEvent.preventDefault();
        step(-1);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [step]);

  if (count === 0) {
    return (
      <div className="rounded-[26px] border-4 border-edge bg-panel/60 p-10 text-center">
        <p className="font-display text-lg font-bold text-bone">No entries</p>
        <p className="mt-1 text-sm font-extrabold text-bone-faint">
          Nobody entered before the deadline.
        </p>
      </div>
    );
  }

  const pickedIndex = entries.findIndex((entry) => entry.id === picked);

  return (
    <div className="grid grid-cols-1 gap-[clamp(16px,2.4vw,34px)] lg:grid-cols-[1.25fr_.9fr]">
      {/* --- The wheel --------------------------------------------------------- */}
      <div className="flex min-h-0 flex-col">
        {/*
          Says why the ballot is locked, rather than leaving a viewer to work it
          out from greyed-out buttons. The reason is worth stating plainly: it
          is the thing that stops a handful of throwaway accounts deciding the
          winner, and it reads as a rule rather than a fault with their account.
        */}
        {!didEnter ? (
          <div
            role="note"
            className="mb-3 rounded-2xl border-[3px] border-edge bg-panel-raised px-4 py-3"
          >
            <p className="font-display text-sm font-bold text-bone">Voting is for entrants</p>
            <p className="mt-1 text-xs font-extrabold leading-relaxed text-bone-muted">
              Only artists who entered this challenge can vote on it — it is what keeps a
              handful of new accounts from deciding the result. You can still look through
              every entry.
            </p>
          </div>
        ) : !isVerified ? (
          <div
            role="note"
            className="mb-3 rounded-2xl border-[3px] border-edge bg-panel-raised px-4 py-3"
          >
            <p className="font-display text-sm font-bold text-bone">Confirm your email to vote</p>
            <p className="mt-1 text-xs font-extrabold leading-relaxed text-bone-muted">
              Your entry is in and will be judged either way. Voting is the one thing that
              needs a confirmed address — check your inbox, or send a new link from the
              banner at the top of the page.
            </p>
          </div>
        ) : null}

        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="font-display text-sm font-semibold uppercase tracking-[2px] text-aqua">
            Entries · {count}
          </span>
          <span className="text-sm font-extrabold text-bone-faint">
            {active + 1} / {count}
          </span>
        </div>

        <div
          ref={wheelRef}
          /* Square: every entry is 1024x1024, so a wheel of any other ratio
             crops the work being judged. Capped so it cannot become a
             viewport-tall square on a wide screen. */
          className="relative mx-auto aspect-square w-full max-w-[600px] overflow-hidden rounded-[26px] border-4 border-ink"
          style={{ background: 'rgba(14,11,43,.42)', boxShadow: 'inset 0 0 70px rgba(0,0,0,.55)' }}
        >
          <div className="absolute inset-0">
            {entries.map((entry, index) => {
              const off = index - active;
              const on = off === 0;
              const dist = Math.min(Math.abs(off), 3);
              const scale = on ? 1 : 1 - dist * 0.07;
              const isMine = entry.id === event.myEntryId;
              const voted = picked === entry.id;

              return (
                <div
                  key={entry.id}
                  className="absolute inset-x-0 top-0 flex h-full"
                  style={{
                    padding: '6% 8%',
                    transform: `translateY(${off * 100}%) scale(${scale})`,
                    opacity: on ? 1 : Math.max(0, 0.42 - dist * 0.1),
                    filter: on ? 'none' : `blur(${dist * 1.2}px)`,
                    pointerEvents: on ? 'auto' : 'none',
                    transition:
                      'transform .62s cubic-bezier(.22,1.2,.3,1), opacity .45s ease, filter .45s ease',
                  }}
                >
                  <div
                    className="flex min-h-0 flex-1 flex-col rounded-[22px] p-3.5"
                    style={
                      on
                        ? {
                            background: '#FFF6E9',
                            border: '4px solid #0E0B2B',
                            boxShadow: `0 12px 0 ${voted ? '#FFD23F' : '#0E0B2B'}`,
                            transition: 'box-shadow .3s ease',
                            animation: burstId === entry.id ? 'bbPulse .55s ease' : undefined,
                          }
                        : {
                            background: 'rgba(255,255,255,.06)',
                            border: '4px solid rgba(255,255,255,.14)',
                          }
                    }
                  >
                    <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border-[3px] border-edge bg-void">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
                      <img
                        src={entry.imageUrl}
                        alt={`Entry ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <div
                        className="absolute left-2.5 top-2.5 rounded-full px-3 py-1 font-display text-xs font-bold"
                        style={
                          voted
                            ? { background: '#FFD23F', color: '#0E0B2B', border: '2px solid #0E0B2B' }
                            : isMine
                              ? {
                                  background: 'rgba(255,61,154,.9)',
                                  color: '#FFF6E9',
                                  border: '2px solid #0E0B2B',
                                }
                              : {
                                  background: 'rgba(14,11,43,.78)',
                                  color: '#FFF6E9',
                                  border: '2px solid rgba(255,255,255,.2)',
                                }
                        }
                      >
                        {isMine ? 'Your entry' : voted ? '✓ Voted' : `Entry ${index + 1}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-3.5">
                      <div
                        className="flex h-11 w-11 flex-none items-center justify-center rounded-xl font-display text-lg font-bold"
                        style={{
                          background: '#FFD23F',
                          border: '3px solid #0E0B2B',
                          boxShadow: '0 4px 0 #0E0B2B',
                          color: '#0E0B2B',
                        }}
                      >
                        {/* Anonymous while voting: a star for your own, a mask
                            for every other — no initial that could hint who. */}
                        {isMine ? '★' : '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className="font-display text-lg font-bold leading-tight"
                          style={{ color: on ? '#0E0B2B' : '#E7E2FF' }}
                        >
                          {isMine ? 'Your entry' : `Entry ${index + 1}`}
                        </div>
                        <div
                          className="text-xs font-extrabold"
                          style={{ color: on ? '#4A4470' : '#9E96D2' }}
                        >
                          {/* No tally during voting — it is revealed only at the
                              finish, so nobody votes toward a leader. */}
                          Anonymous
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => requestVote(entry)}
                        disabled={isMine || !canVote}
                        className="flex-none rounded-[13px] font-display text-[15px] font-bold"
                        style={
                          voted
                            ? {
                                color: '#0E0B2B',
                                background: 'linear-gradient(180deg,#FFE580,#FFD23F)',
                                border: '3px solid #0E0B2B',
                                boxShadow: '0 5px 0 #0E0B2B',
                                padding: '11px 20px',
                              }
                            : isMine || !canVote
                              ? {
                                  color: '#9E96D2',
                                  background: 'rgba(255,255,255,.06)',
                                  border: '3px solid rgba(255,255,255,.14)',
                                  padding: '11px 20px',
                                  cursor: 'not-allowed',
                                }
                              : {
                                  color: '#0E0B2B',
                                  background: '#FFD23F',
                                  border: '3px solid #0E0B2B',
                                  boxShadow: '0 5px 0 #0E0B2B',
                                  padding: '11px 20px',
                                }
                        }
                      >
                        {voted
                          ? '✓ Voted'
                          : isMine
                            ? 'Yours'
                            : hasVoted
                              ? 'Locked'
                              : !didEnter
                                ? 'Entrants only'
                                : !isVerified
                                  ? 'Confirm email'
                                  : 'Vote'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Top and bottom fades, so stacked cards dissolve into the frame. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[14%]"
            style={{ background: 'linear-gradient(#171149,rgba(23,17,73,0))' }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[14%]"
            style={{ background: 'linear-gradient(rgba(23,17,73,0),#171149)' }}
          />

          {/* Prev / dots / next rail. */}
          <div className="absolute right-3.5 top-1/2 z-[4] flex -translate-y-1/2 flex-col items-center gap-2.5">
            <WheelArrow direction="up" onClick={() => step(-1)} />
            {entries.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                aria-label={`Go to entry ${index + 1}`}
                onClick={() => setActive(index)}
                className="rounded-full p-0"
                style={
                  index === active
                    ? {
                        width: 13,
                        height: 13,
                        background: '#FFD23F',
                        border: '3px solid #0E0B2B',
                        boxShadow: '0 0 0 4px rgba(255,210,63,.22)',
                        transition: 'all .2s',
                        cursor: 'pointer',
                      }
                    : {
                        width: 11,
                        height: 11,
                        background: 'rgba(255,255,255,.22)',
                        border: '2px solid rgba(14,11,43,.6)',
                        transition: 'all .2s',
                        cursor: 'pointer',
                      }
                }
              />
            ))}
            <WheelArrow direction="down" onClick={() => step(1)} />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 text-sm font-extrabold text-bone-faint">
          <span>Scroll or use ↑ ↓ to browse — it loops.</span>
          <span className="h-0.5 flex-1 bg-white/10" />
          <span
            className="rounded-full px-3 py-1"
            style={
              hasVoted
                ? { background: 'rgba(255,210,63,.16)', color: '#FFDC5C', border: '2px solid #FFD23F' }
                : { color: '#8E86C9' }
            }
          >
            {/* Anonymous and final: acknowledge the vote without naming the entry —
                names come only at the reveal. */}
            {hasVoted && pickedIndex >= 0
              ? `Vote cast — Entry ${pickedIndex + 1}, final`
              : 'One vote, and it is final — choose carefully'}
          </span>
        </div>
      </div>

      {/* --- Reference panel --------------------------------------------------- */}
      <div className="flex min-h-0 flex-col">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="font-display text-sm font-semibold uppercase tracking-[2px] text-[#FFDC5C]">
            Reference
          </span>
          <span className="text-sm font-extrabold text-bone-faint">The brief</span>
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col gap-3 rounded-[26px] p-3.5"
          style={{ background: '#FFF6E9', border: '4px solid #0E0B2B', boxShadow: '0 12px 0 #0E0B2B' }}
        >
          {/* Square, for the same reason as the ballot beside it. */}
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border-[3px] border-ink bg-arcade-deep">
            {event.referenceImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset
              <img
                src={event.referenceImageUrl}
                alt="The challenge reference"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm font-extrabold text-bone-faint">
                No reference image on this challenge
              </div>
            )}
            <div
              className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{ background: 'rgba(14,11,43,.78)', border: '2px solid rgba(255,255,255,.2)' }}
            >
              <span
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ background: '#5EF0DE', border: '1.5px solid #0E0B2B' }}
              />
              <span className="font-display text-[10px] font-black uppercase tracking-wider text-cream">
                Reference
              </span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 font-display text-lg font-bold" style={{ color: '#0E0B2B' }}>
              What to judge
            </div>
            <div className="flex flex-col gap-1.5">
              {(event.objectives.length > 0
                ? event.objectives.slice(0, 4)
                : ['Faithfulness to the brief', 'Modelling and topology', 'Lighting and final render']
              ).map((objective, index) => (
                <div
                  key={objective}
                  className="flex items-center gap-2.5 text-[13px] font-extrabold"
                  style={{ color: '#4A4470' }}
                >
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-[3px]"
                    style={{
                      background: ['#FFD23F', '#22D3EE', '#5EF0DE', '#FF3D9A'][index % 4],
                      border: '2px solid #0E0B2B',
                    }}
                  />
                  {objective}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* One press, then this. The vote is final, so it is confirmed before it
          is sent — the same guard the concede action uses. */}
      <ConfirmDialog
        open={pending !== null}
        title="Cast this vote?"
        description="Your vote is final — it can't be changed or moved, and the button is gone until the next challenge. Choose the entry you think deserves to win."
        confirmLabel="Vote"
        cancelLabel="Keep looking"
        tone="default"
        busy={vote.isPending}
        onConfirm={confirmVote}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

function WheelArrow({ direction, onClick }: { direction: 'up' | 'down'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'up' ? 'Previous entry' : 'Next entry'}
      className="arcade-press flex h-[42px] w-[42px] items-center justify-center rounded-xl font-display text-base font-bold [--press-depth:4px]"
      style={{
        background: '#FFF6E9',
        border: '3px solid #0E0B2B',
        boxShadow: '0 4px 0 #0E0B2B',
        color: '#0E0B2B',
      }}
    >
      <ChevronIcon direction={direction} size={16} />
    </button>
  );
}
