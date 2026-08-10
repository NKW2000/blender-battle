'use client';

import { ChallengeAssetType, type ChallengeAsset, type TagSummary } from '@bb/shared';
import Link from 'next/link';
import { useState } from 'react';

import {
  PANEL_ICON,
  Panel,
  PanelBody,
  PanelHeader,
  PanelTile,
  PanelTitle,
} from '@/components/ui/panel';

/**
 * The brief, in the arcade language.
 *
 * A challenge is written once and read in two places — the catalogue entry at
 * `/challenges/[slug]` and the live competition at `/events/[id]` — and the
 * handoff design draws it once. These pieces are that drawing, shared, so the
 * two screens cannot drift into two different answers to "what does this
 * challenge ask for". They did: the event page was rebuilt to the design and
 * the catalogue entry was left on the old flat panels, which is how someone
 * clicking the same challenge from two places saw two products.
 *
 * Everything here is presentational and takes plain data, so it does not care
 * which of the two payload shapes it was handed.
 */

/** The subset of a challenge these panels read. Both detail shapes satisfy it. */
export interface BriefLike {
  description: string;
  objectives: string[];
  rules: string | null;
  allowedAssets: string | null;
  forbiddenAssets: string | null;
  blenderVersion: string | null;
  estimatedMinutes: number;
  rewardXp: number;
  tags: TagSummary[];
  assets: ChallengeAsset[];
}

/** A stat tile from the design's brief header. Now the shared panel tile. */
export function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <PanelTile className={`min-w-[110px] flex-1 ${accent ? 'bg-sun/10' : ''}`}>
      <div className="text-[11px] font-black uppercase tracking-[1.2px] text-haze-5">{label}</div>
      <div
        className={`mt-1 font-display text-[22px] font-bold ${accent ? 'text-sun' : 'text-cream'}`}
      >
        {value}
      </div>
    </PanelTile>
  );
}

export function BriefPanel({ brief }: { brief: BriefLike }) {
  return (
    <Panel>
      <PanelHeader tone="ember" icon={PANEL_ICON.lines}>
        <PanelTitle>The brief</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-5.5">
        <div className="flex flex-wrap gap-3">
          <Stat label="Time" value={`${brief.estimatedMinutes} min`} />
          <Stat label="Reward" value={`${brief.rewardXp} XP`} accent />
          {/* Dropped rather than shown empty when the manager left it unset —
              the design has no state for a tile with no value. */}
          {brief.blenderVersion ? <Stat label="Blender" value={brief.blenderVersion} /> : null}
        </div>

        {/* `whitespace-pre-line`: managers write these with paragraph breaks,
            and collapsing them turns a brief into a wall. */}
        <p className="whitespace-pre-line text-base font-extrabold leading-[1.55] text-haze">
          {brief.description}
        </p>
      </PanelBody>
    </Panel>
  );
}

/** The numbered criteria. Colours cycle so a long list stays readable. */
const CRITERION_TONE = ['bg-ember', 'bg-aqua', 'bg-sun', 'bg-mint', 'bg-punch'] as const;

export function JudgedOnPanel({ objectives }: { objectives: string[] }) {
  return (
    <Panel>
      <PanelHeader tone="mint" icon={PANEL_ICON.check}>
        <PanelTitle>Judged on</PanelTitle>
      </PanelHeader>
      <ol className="flex flex-1 flex-col justify-center gap-3.5 px-5 py-5 sm:px-6.5">
        {objectives.map((objective, i) => (
          <li key={objective} className="flex items-center gap-3.5">
            <span
              className={`flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg border-[2.5px] border-ink font-display text-[13px] font-bold text-ink ${
                CRITERION_TONE[i % CRITERION_TONE.length]
              }`}
              style={{ boxShadow: '0 3px 0 var(--color-ink)' }}
            >
              {i + 1}
            </span>
            <span className="font-display text-[17px] font-bold text-cream">{objective}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/**
 * The reference carousel.
 *
 * The design draws three slides with hard-coded captions; the count here is
 * whatever the challenge has. Below two images the arrows and dots are pointless
 * furniture, so they are not rendered — and with none, neither is the panel.
 */
export function ReferencePanel({ references }: { references: ChallengeAsset[] }) {
  const [index, setIndex] = useState(0);
  const count = references.length;

  // Clamped rather than trusted: a manager can remove a reference while the page
  // is open, and the poll would otherwise leave the track scrolled to a slide
  // that no longer exists.
  const current = count > 0 ? Math.min(index, count - 1) : 0;

  if (count === 0) {
    return (
      <Panel>
        <PanelHeader tone="punch" icon={PANEL_ICON.image}>
        <PanelTitle>Reference</PanelTitle>
      </PanelHeader>
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <p className="text-center text-sm font-extrabold text-haze-5">
            No reference images for this challenge.
          </p>
        </div>
      </Panel>
    );
  }

  const go = (next: number) => setIndex(((next % count) + count) % count);

  return (
    <Panel>
      <PanelHeader tone="punch" icon={PANEL_ICON.image}>
        <PanelTitle>Reference</PanelTitle>
      </PanelHeader>

      <div className="flex flex-1 flex-col px-5 py-5 sm:px-6.5 sm:py-6">
        <div
          /*
            `aspect` and `max-h` are what make this safe standing alone.

            `flex-1` alone has nothing to grow into in a column with no height of
            its own, so the slides fell back to their natural size — a 1024²
            reference rendered a 1208px-tall panel on the catalogue page, where
            this card spans the full width with no sibling to take its height
            from. Beside the entry panel on the event page it was fine, which is
            exactly why it was invisible until this moved.

            The ratio gives a definite height when nothing else does; `flex-1`
            still stretches it to a taller neighbour, and `max-h` stops a wide
            viewport turning the reference into a billboard.
          */
          className="relative aspect-[16/10] max-h-[600px] min-h-[240px] flex-1 overflow-hidden rounded-2xl border-[3px] border-ink bg-arcade-deep"
          style={{ boxShadow: '0 5px 0 var(--color-ink)' }}
        >
          <div
            className="flex h-full transition-transform duration-[450ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
            style={{ transform: `translateX(-${current * 100}%)` }}
          >
            {references.map((asset, i) => (
              <div key={asset.id} className="h-full w-full flex-none">
                {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-sized asset */}
                <img
                  src={asset.url}
                  alt={`Reference ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>

          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full border-2 border-white/20 bg-ink/78 px-3 py-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-ink bg-mint" />
            <span className="text-[11px] font-black tracking-[.6px] text-cream">Reference</span>
          </div>

          {count > 1 ? (
            <>
              <span
                className="pointer-events-none absolute right-3 top-3 rounded-full border-2 border-ink bg-sun px-2.5 py-1 font-display text-xs font-bold text-ink"
                style={{ boxShadow: '0 2px 0 var(--color-ink)' }}
              >
                {current + 1} / {count}
              </span>

              <CarouselArrow side="left" onClick={() => go(current - 1)} />
              <CarouselArrow side="right" onClick={() => go(current + 1)} />
            </>
          ) : null}
        </div>

        {count > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-2.5">
            {references.map((asset, i) => (
              <button
                key={asset.id}
                type="button"
                aria-label={`Reference ${i + 1}`}
                aria-current={i === current}
                onClick={() => go(i)}
                className={`h-[11px] cursor-pointer rounded-full border-2 border-ink transition-all duration-300 ${
                  i === current ? 'w-[26px] bg-sun' : 'w-[11px] bg-white/25'
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function CarouselArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous reference' : 'Next reference'}
      className={`arcade-focus absolute top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[13px] border-[2.5px] border-ink bg-cream text-xl font-black text-ink transition-transform hover:translate-y-[calc(-50%+2px)] active:translate-y-[calc(-50%+4px)] ${
        side === 'left' ? 'left-3' : 'right-3'
      }`}
      style={{ boxShadow: '0 4px 0 var(--color-ink)' }}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}

/**
 * Rules, downloadable files and tags.
 *
 * Not in the design, because the challenge it was drawn against has none of the
 * three. They are part of a brief and a manager can fill them in, so they render
 * in the same language when present and take no space when absent — which is
 * what makes the design's own sample render exactly as drawn.
 */
export function Extras({ brief }: { brief: BriefLike }) {
  const files = brief.assets.filter((asset) => asset.type === ChallengeAssetType.REFERENCE_FILE);
  const hasRules = Boolean(brief.rules || brief.allowedAssets || brief.forbiddenAssets);

  if (!hasRules && files.length === 0 && brief.tags.length === 0) return null;

  return (
    <div className="flex flex-col gap-[clamp(14px,1.8vw,24px)]">
      <div className="grid grid-cols-1 items-stretch gap-[clamp(14px,1.8vw,24px)] lg:grid-cols-[1.15fr_.85fr]">
        {hasRules ? (
          <Panel>
            <PanelHeader tone="punch" icon={PANEL_ICON.lines}>
        <PanelTitle>Rules</PanelTitle>
      </PanelHeader>
            <div className="flex flex-col gap-4 px-5 py-6 text-[15px] font-extrabold leading-[1.55] sm:px-6.5">
              {brief.rules ? <p className="whitespace-pre-line text-haze">{brief.rules}</p> : null}
              {brief.allowedAssets ? (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[1.2px] text-mint">
                    Allowed
                  </p>
                  <p className="mt-1 text-haze">{brief.allowedAssets}</p>
                </div>
              ) : null}
              {brief.forbiddenAssets ? (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[1.2px] text-punch-soft">
                    Not allowed
                  </p>
                  <p className="mt-1 text-haze">{brief.forbiddenAssets}</p>
                </div>
              ) : null}
            </div>
          </Panel>
        ) : null}

        {files.length > 0 ? (
          <Panel>
            <PanelHeader tone="aqua" icon={PANEL_ICON.file}>
        <PanelTitle>Files</PanelTitle>
      </PanelHeader>
            <div className="flex flex-col gap-2.5 px-5 py-6 sm:px-6.5">
              {files.map((asset) => (
                <a
                  key={asset.id}
                  href={asset.url}
                  download
                  rel="noopener noreferrer nofollow"
                  className="flex min-w-0 items-center justify-between gap-3 rounded-[14px] border-[2.5px] border-ink bg-white/5 px-4 py-3 text-[13px] font-extrabold text-haze transition-colors hover:bg-white/10 hover:text-cream"
                  style={{ boxShadow: '0 4px 0 var(--color-ink)' }}
                >
                  <span className="truncate">{asset.filename}</span>
                  <span className="shrink-0 text-haze-5">{Math.round(asset.bytes / 1024)} KB</span>
                </a>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>

      {brief.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2.5">
          {brief.tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/challenges?tag=${tag.slug}`}
              className="rounded-[14px] border-[3px] border-white/16 bg-white/6 px-4 py-2 text-[13px] font-extrabold text-haze transition-colors hover:border-ink hover:bg-sun hover:text-ink"
            >
              {tag.name}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Difficulty as the design's pill.
 *
 * A tinted fill with a matching 2px border and no ink outline — the one badge in
 * this language that is not a sticker, because it labels the title rather than
 * acting.
 */
export const DIFFICULTY_PILL = {
  easy: 'text-mint border-mint bg-mint/14',
  medium: 'text-aqua border-aqua bg-aqua/14',
  hard: 'text-punch-soft border-punch-soft bg-punch/14',
} as const;

export function DifficultyPill({ difficulty }: { difficulty: keyof typeof DIFFICULTY_PILL }) {
  return (
    <span
      className={`rounded-full border-2 px-3 py-1 font-display text-xs font-bold uppercase tracking-[.5px] ${DIFFICULTY_PILL[difficulty]}`}
    >
      {difficulty}
    </span>
  );
}

/** The breadcrumb strip above every brief title. */
export function BriefCrumbs({
  backHref,
  backLabel,
  category,
  children,
}: {
  backHref: string;
  backLabel: string;
  category: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Link
        href={backHref}
        className="text-[13px] font-black uppercase tracking-[1.4px] text-haze-5 transition-colors hover:text-cream"
      >
        ← {backLabel}
      </Link>
      <span className="font-black text-haze-6">/</span>
      <span className="text-[13px] font-black uppercase tracking-[1.4px] text-aqua">{category}</span>
      {children}
    </div>
  );
}

/** The title, at the design's clamp. */
export function BriefTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1
      /* The design's own clamp. `break-words` is the one addition: at the 38px
         floor a single long title word would otherwise run off a 375px screen,
         and the canvas only ever had to render "The couch". */
      className="mt-2.5 break-words font-display text-[clamp(38px,5.4vw,68px)] font-bold uppercase leading-[1.05] tracking-[-.5px] text-cream"
      style={{ textShadow: '0 5px 0 rgba(14,11,43,.4)' }}
    >
      {children}
    </h1>
  );
}
