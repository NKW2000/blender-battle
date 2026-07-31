'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * Chart primitives for the dashboards.
 *
 * Two deliberate choices, both from validating the palette rather than eyeballing it:
 *
 * 1. Every chart here is SINGLE-SERIES. Battles and signups are different
 *    measures on different scales, so they are separate charts — never two lines
 *    on one plot with two y-axes, which misrepresents both.
 * 2. Because each chart carries one series, no categorical palette is needed.
 *    That matters: the accent orange and the axis green fail deuteranopia
 *    separation against each other (ΔE 3.0, far below the 8.0 target), so using
 *    them as adjacent series colours would be unreadable for a red-green
 *    colourblind viewer. One hue per chart sidesteps it entirely, and category
 *    comparison below is encoded by bar length with a written label, never by hue.
 */

const AXIS_STYLE = {
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  fill: 'var(--color-bone-faint)',
} as const;

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="border border-edge bg-void px-3 py-2 font-mono text-xs">
      <p className="text-bone-faint">{label}</p>
      <p className="text-bone">
        {payload[0]?.value} {unit}
      </p>
    </div>
  );
}

/** Time series over the last fortnight. One measure, one colour, one axis. */
export function TimeSeriesChart({
  data,
  dataKey,
  unit,
  color = 'var(--color-select)',
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  unit: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        {/* Horizontal rules only, and recessive — the grid orients, it does not compete. */}
        <CartesianGrid stroke="var(--color-edge)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-edge)' }}
          // Every date label would collide at this width; the ends anchor it.
          interval="preserveStartEnd"
          tickFormatter={(value: string) => value.slice(5)}
        />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={40}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-panel-raised)' }}
          content={<ChartTooltip unit={unit} />}
        />
        <Bar dataKey={dataKey} fill={color} radius={[2, 2, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Magnitude comparison across categories. Bar length carries the value and the
 * category name is written on the axis, so identity never depends on colour —
 * which is why a single hue is correct here rather than one hue per bar.
 */
export function CategoryBarChart({
  data,
  dataKey,
  labelKey,
  unit,
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  labelKey: string;
  unit: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 36)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
      >
        <CartesianGrid stroke="var(--color-edge)" horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey={labelKey}
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={128}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-panel-raised)' }}
          content={<ChartTooltip unit={unit} />}
        />
        <Bar dataKey={dataKey} radius={[0, 2, 2, 0]} maxBarSize={18}>
          {data.map((row, index) => (
            <Cell key={index} fill="var(--color-select)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
