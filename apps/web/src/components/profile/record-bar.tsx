import { formatNumber } from '@/lib/utils';

/**
 * Win/draw/loss record.
 *
 * The three colours are Blender's X/Y/Z axis gizmo colours, used here because the
 * audience already reads that triad as "three distinct things" without a legend.
 * The bar is proportional, and every segment is also labelled with its count, so
 * the information survives colour blindness and greyscale printing — colour is
 * reinforcement, never the only channel.
 */
export function RecordBar({
  wins,
  draws,
  losses,
}: {
  wins: number;
  draws: number;
  losses: number;
}) {
  const total = wins + draws + losses;

  if (total === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="h-1.5 w-full rounded-full bg-edge" aria-hidden="true" />
        <p className="text-sm text-bone-muted">No battles yet.</p>
      </div>
    );
  }

  const segments = [
    { label: 'Wins', value: wins, color: 'var(--color-axis-y)' },
    { label: 'Draws', value: draws, color: 'var(--color-axis-z)' },
    { label: 'Losses', value: losses, color: 'var(--color-axis-x)' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={`${wins} wins, ${draws} draws, ${losses} losses`}
      >
        {segments.map((segment) => (
          <span
            key={segment.label}
            style={{
              width: `${(segment.value / total) * 100}%`,
              backgroundColor: segment.color,
            }}
          />
        ))}
      </div>

      <dl className="flex gap-6">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-baseline gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-[3px]"
              style={{ backgroundColor: segment.color }}
              aria-hidden="true"
            />
            <dt className="eyebrow">{segment.label}</dt>
            <dd className="font-mono text-sm text-bone">{formatNumber(segment.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The dashboard stat tile: translucent ink-bordered chip, hard offset shadow,
 * a big Fredoka numeral that carries an accent colour per metric — the same
 * chunky-sticker language as the rest of the arcade UI, dark variant for
 * panels that already sit on the indigo dashboard background.
 */
export function StatTile({
  label,
  value,
  color = 'text-bone',
}: {
  label: string;
  value: string | number;
  /** A `text-*` colour class for the numeral, e.g. `text-mint`. */
  color?: string;
}) {
  return (
    <div
      className="rounded-2xl border-[3px] border-edge bg-white/[0.04] px-5 py-4"
      style={{ boxShadow: '0 6px 0 var(--color-edge)' }}
    >
      <p className="font-display text-[0.6875rem] font-bold uppercase tracking-wider text-bone-faint">
        {label}
      </p>
      <p className={`mt-1.5 font-display text-3xl font-bold leading-none ${color}`}>
        {typeof value === 'number' ? formatNumber(value) : value}
      </p>
    </div>
  );
}
