import { formatNumber } from '@/lib/utils';

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
