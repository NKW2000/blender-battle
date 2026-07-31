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

export function ChallengeCard({ challenge }: { challenge: ChallengeSummary }) {
  const isDraft = challenge.status === ChallengeStatus.DRAFT;

  return (
    <Link
      href={`/challenges/${challenge.slug}`}
      className="arcade-press group flex flex-col overflow-hidden rounded-[20px] border-4 border-edge bg-panel-raised [--press-depth:5px]"
      style={{ boxShadow: '0 6px 0 var(--color-edge)' }}
    >
      <div className="relative aspect-square overflow-hidden border-b-4 border-edge bg-void">
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
