import { ChallengeStatus, Difficulty, type ChallengeSummary } from '@bb/shared';
import Link from 'next/link';

import { cn } from '@/lib/utils';

/**
 * Difficulty uses the axis triad already established for battle outcomes —
 * green/blue/red reading as easy/medium/hard. It is the same visual grammar the
 * profile page uses for wins/draws/losses, so a reader learns it once.
 */
const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'text-axis-y border-axis-y/40',
  [Difficulty.MEDIUM]: 'text-axis-z border-axis-z/40',
  [Difficulty.HARD]: 'text-axis-x border-axis-x/40',
};

export function DifficultyBadge({
  difficulty,
  className,
}: {
  difficulty: Difficulty;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'rounded-full border-2 px-2.5 py-0.5 font-display text-[0.6875rem] font-bold uppercase tracking-[0.14em]',
        DIFFICULTY_COLOR[difficulty],
        className,
      )}
    >
      {difficulty}
    </span>
  );
}

/**
 * Status, in the same pill construction as difficulty.
 *
 * It used to be a square 1px box in a mono face, left over from before the
 * arcade language — sitting directly beside a rounded, two-pixel, display-face
 * DifficultyBadge, which made the pair read as two different systems. Sharing
 * the shape means the only thing that distinguishes them is the colour, which
 * is what the colour is for.
 *
 * Published is deliberately absent from the callers that hide it: it is the
 * ordinary state, and a badge on every ordinary thing stops being a signal.
 */
const STATUS_COLOR: Record<ChallengeStatus, string> = {
  [ChallengeStatus.PUBLISHED]: 'text-axis-y border-axis-y/40',
  [ChallengeStatus.DRAFT]: 'text-select border-select/40',
  [ChallengeStatus.ARCHIVED]: 'text-bone-faint border-white/20',
};

export function StatusBadge({
  status,
  className,
}: {
  status: ChallengeStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'rounded-full border-2 px-2.5 py-0.5 font-display text-[0.6875rem] font-bold uppercase tracking-[0.14em]',
        STATUS_COLOR[status],
        className,
      )}
    >
      {status}
    </span>
  );
}

export function ChallengeCard({ challenge }: { challenge: ChallengeSummary }) {
  const isDraft = challenge.status === ChallengeStatus.DRAFT;

  return (
    <Link
      href={`/challenges/${challenge.slug}`}
      className="arcade-press group flex flex-col overflow-hidden rounded-[22px] border-[3px] border-ink bg-white/4 [--press-depth:5px]"
      style={{ boxShadow: '0 6px 0 var(--color-edge)' }}
    >
      <div className="relative aspect-square overflow-hidden border-b-[3px] border-ink bg-arcade-deep">
        {challenge.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a pre-sized asset
          <img
            src={challenge.coverImageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          // No reference image: fall back to the viewport grid rather than a grey
          // placeholder box, so an empty card still belongs to the same world.
          <div className="viewport-grid h-full w-full" />
        )}

        {isDraft ? (
          <span className="absolute left-3 top-3 rounded-full border-2 border-select/50 bg-void/85 px-2.5 py-0.5 font-display text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-select">
            Draft
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">{challenge.category.name}</span>
          <DifficultyBadge difficulty={challenge.difficulty} />
        </div>

        <h3 className="font-display text-base font-semibold uppercase leading-tight tracking-tight text-bone transition-colors group-hover:text-select">
          {challenge.title}
        </h3>

        <p className="line-clamp-2 text-sm text-bone-muted">{challenge.shortDescription}</p>

        <dl className="mt-auto flex items-center gap-4 font-mono text-xs text-bone-faint">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Estimated time</dt>
            <dd>{challenge.estimatedMinutes} min</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Reward</dt>
            <dd className="text-select">{challenge.rewardXp} XP</dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}
