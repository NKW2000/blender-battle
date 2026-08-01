'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AVATAR_ALLOWED_MIME,
  AVATAR_MAX_BYTES,
  BIO_MAX_LENGTH,
  ExperienceLevel,
  SHOWCASE_MAX_ITEMS,
  type PortfolioItem,
} from '@bb/shared';
import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { EmptyState, Panel, PanelBody, PanelHeader, PanelTitle, Skeleton } from '@/components/ui/panel';
import { useSession } from '@/features/auth/use-session';
import { usePortfolio, useUpdateProfile, useUploadAvatar } from '@/features/users/use-users';
import { collectFormMessages, notify } from '@/lib/notify';

const profileSchema = z.object({
  bio: z.string().max(BIO_MAX_LENGTH, `At most ${BIO_MAX_LENGTH} characters`).optional(),
  country: z
    .string()
    .length(2, 'Use a two-letter country code, for example GB')
    .optional()
    .or(z.literal('')),
  experienceLevel: z.nativeEnum(ExperienceLevel),
  socialLinks: z.object({
    website: z.string().url('Include https://').optional().or(z.literal('')),
    artstation: z.string().url('Include https://').optional().or(z.literal('')),
    youtube: z.string().url('Include https://').optional().or(z.literal('')),
  }),
});

type ProfileInput = z.infer<typeof profileSchema>;

/** Title-cased labels, so the dropdown reads "Beginner" not "beginner". */
const EXPERIENCE_LABEL: Record<ExperienceLevel, string> = {
  [ExperienceLevel.BEGINNER]: 'Beginner',
  [ExperienceLevel.INTERMEDIATE]: 'Intermediate',
  [ExperienceLevel.ADVANCED]: 'Advanced',
  [ExperienceLevel.PROFESSIONAL]: 'Professional',
};

export default function ProfileSettingsPage() {

  const { user } = useSession();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const fileInput = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    values: user
      ? {
          bio: user.bio ?? '',
          country: user.country ?? '',
          experienceLevel: user.experienceLevel,
          socialLinks: {
            website: user.socialLinks.website ?? '',
            artstation: user.socialLinks.artstation ?? '',
            youtube: user.socialLinks.youtube ?? '',
          },
        }
      : undefined,
  });

  if (!user) return null;

  const onSubmit = (values: ProfileInput) => {
    // Empty strings mean "not set", and the API's URL validator would reject them.
    const socialLinks = Object.fromEntries(
      Object.entries(values.socialLinks).filter(([, value]) => value !== ''),
    );

    updateProfile.mutate({
      bio: values.bio || undefined,
      country: values.country || undefined,
      experienceLevel: values.experienceLevel,
      socialLinks,
    });
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <header>
        <p className="eyebrow">Settings</p>
        <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
          Your profile
        </h1>
      </header>

      <Panel>
        <PanelHeader>
          <PanelTitle className="text-sun">Avatar</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex items-center gap-5">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- already transformed by Cloudinary
            <img
              src={user.avatarUrl}
              alt=""
              className="h-24 w-24 rounded-2xl border-[3px] border-edge object-cover"
              style={{ boxShadow: '0 5px 0 var(--color-edge)' }}
            />
          ) : (
            <div
              className="flex h-24 w-24 items-center justify-center rounded-2xl border-[3px] border-edge bg-panel-raised font-display text-2xl text-bone-faint"
              style={{ boxShadow: '0 5px 0 var(--color-edge)' }}
            >
              {user.username.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={AVATAR_ALLOWED_MIME.join(',')}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadAvatar.mutate(file);
                event.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => fileInput.current?.click()}
              disabled={uploadAvatar.isPending}
            >
              {uploadAvatar.isPending ? 'Uploading…' : 'Choose image'}
            </Button>
            <p className="font-mono text-xs text-bone-faint">
              JPEG, PNG or WebP. Up to {AVATAR_MAX_BYTES / 1024 / 1024}MB.
            </p>
          </div>
        </PanelBody>
      </Panel>

      <form
        onSubmit={handleSubmit(onSubmit, (fieldErrors) =>
          notify.invalidForm(collectFormMessages(fieldErrors)),
        )}
        noValidate
      >
        <Panel>
          <PanelHeader>
            <PanelTitle>Details</PanelTitle>
          </PanelHeader>

          <PanelBody className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="bio" className="eyebrow">
                Bio
              </label>
              <textarea
                id="bio"
                rows={4}
                maxLength={BIO_MAX_LENGTH}
                className="arcade-focus w-full resize-none rounded-2xl border-[3px] border-white/16 bg-white/6 px-4 py-3 font-bold text-bone outline-none transition-colors placeholder:text-[#6E67A0] focus:border-select focus:bg-select/10"
                placeholder="Hard-surface modeller. Mostly sci-fi props."
                {...register('bio')}
              />
              {errors.bio ? (
                <p role="alert" className="font-mono text-xs text-axis-x">
                  {errors.bio.message}
                </p>
              ) : null}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Country"
                placeholder="GB"
                maxLength={2}
                hint="Two-letter code."
                error={errors.country?.message}
                {...register('country')}
              />

              <div className="flex flex-col gap-2">
                <label htmlFor="experienceLevel" className="eyebrow">
                  Experience
                </label>
                <Select
                  tone="field"
                  ariaLabel="Experience"
                  value={watch('experienceLevel') ?? ''}
                  onChange={(value) =>
                    setValue('experienceLevel', value as ExperienceLevel, {
                      shouldDirty: true,
                    })
                  }
                  options={Object.values(ExperienceLevel).map((level) => ({
                    value: level,
                    label: EXPERIENCE_LABEL[level] ?? level,
                  }))}
                />
              </div>
            </div>

            <Field
              label="Website"
              placeholder="https://"
              accent="aqua"
              error={errors.socialLinks?.website?.message}
              {...register('socialLinks.website')}
            />
            <Field
              label="ArtStation"
              placeholder="https://artstation.com/…"
              accent="aqua"
              error={errors.socialLinks?.artstation?.message}
              {...register('socialLinks.artstation')}
            />
            <Field
              label="YouTube"
              placeholder="https://youtube.com/@…"
              accent="aqua"
              error={errors.socialLinks?.youtube?.message}
              {...register('socialLinks.youtube')}
            />
          </PanelBody>

          <div className="flex justify-end border-t border-edge px-5 py-4">
            <Button type="submit" disabled={!isDirty || updateProfile.isPending}>
              {updateProfile.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </Panel>
      </form>

      <ShowcasePicker username={user.username} initial={user.showcaseEntryIds ?? []} />
    </div>
  );
}

/**
 * Curate the profile showcase: pick up to ten of your finished works and order
 * them. The profile gallery shows them in this order.
 *
 * Its own panel with its own save, separate from the react-hook-form above,
 * because it is list state (ordered ids), not field state, and mixing the two
 * into one form would only complicate both.
 */
function ShowcasePicker({ username, initial }: { username: string; initial: string[] }) {
  const { data: portfolio, isLoading } = usePortfolio(username);
  const update = useUpdateProfile();

  // Every finished work is eligible now — an entry is a pair of images.
  const eligible = useMemo(() => portfolio ?? [], [portfolio]);
  const byId = useMemo(() => new Map(eligible.map((item) => [item.id, item])), [eligible]);

  // Start from the saved selection; ids that no longer qualify are filtered out
  // for display/save via `valid` below, but kept in state so a transient load is
  // not destructive.
  const [selected, setSelected] = useState<string[]>(() => initial.slice(0, SHOWCASE_MAX_ITEMS));

  const valid = selected.filter((id) => byId.has(id));
  const dirty = valid.join(',') !== initial.filter((id) => byId.has(id)).join(',');

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length >= SHOWCASE_MAX_ITEMS
          ? current
          : [...current, id],
    );

  const move = (id: string, dir: -1 | 1) =>
    setSelected((current) => {
      const i = current.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= current.length) return current;
      const next = [...current];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const save = () => update.mutate({ showcaseEntryIds: valid });

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle className="text-sun">Showcase</PanelTitle>
        <span
          className="rounded-full border-2 border-edge bg-aqua px-3.5 py-1 font-display text-xs font-bold text-edge"
          style={{ boxShadow: '0 3px 0 var(--color-edge)' }}
        >
          {valid.length}/{SHOWCASE_MAX_ITEMS}
        </span>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-4">
        <p className="text-sm font-bold text-bone-muted">
          Pin the works that headline your profile. Tap to add or remove; use the arrows on a
          selected work to set the order they appear in the gallery.
        </p>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-xl" />
            ))}
          </div>
        ) : eligible.length === 0 ? (
          <EmptyState
            title="No finished works yet"
            description="Enter a public challenge and submit your render and workspace photo — once it finishes voting, it becomes pinnable here."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {eligible.map((item) => {
              const order = valid.indexOf(item.id);
              const on = order >= 0;
              return (
                <ShowcaseTile
                  key={item.id}
                  item={item}
                  order={on ? order + 1 : null}
                  canMoveUp={on && order > 0}
                  canMoveDown={on && order < valid.length - 1}
                  onToggle={() => toggle(item.id)}
                  onUp={() => move(item.id, -1)}
                  onDown={() => move(item.id, 1)}
                />
              );
            })}
          </div>
        )}

        {update.error ? (
          <p role="alert" className="text-sm font-bold text-punch-soft">
            {update.error.message}
          </p>
        ) : null}
      </PanelBody>

      {eligible.length > 0 ? (
        <div className="flex justify-end border-t border-edge px-5 py-4">
          <Button
            type="button"
            variant="secondary"
            onClick={save}
            disabled={!dirty || update.isPending}
          >
            {update.isPending ? 'Saving…' : 'Save showcase'}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

function ShowcaseTile({
  item,
  order,
  canMoveUp,
  canMoveDown,
  onToggle,
  onUp,
  onDown,
}: {
  item: PortfolioItem;
  order: number | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const on = order !== null;
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className={`group relative aspect-square overflow-hidden rounded-xl border-[3px] transition-colors ${
          on ? 'border-sun' : 'border-white/16 hover:border-white/40'
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
        <img src={item.imageUrl} alt={item.challengeTitle} className="h-full w-full object-cover" />
        <span
          className={`absolute inset-0 transition-opacity ${on ? 'bg-edge/40' : 'bg-edge/0 group-hover:bg-edge/20'}`}
        />
        {on ? (
          <span
            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-edge bg-sun font-display text-sm font-bold text-edge"
            style={{ boxShadow: '0 2px 0 var(--color-edge)' }}
          >
            {order}
          </span>
        ) : null}
      </button>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-mono text-[0.625rem] text-bone-faint" title={item.challengeTitle}>
          {item.challengeTitle}
        </span>
        {on ? (
          <span className="flex shrink-0 gap-0.5">
            <button
              type="button"
              onClick={onUp}
              disabled={!canMoveUp}
              aria-label="Move earlier"
              className="flex h-5 w-5 items-center justify-center rounded border border-white/20 text-xs text-bone-muted disabled:opacity-30 hover:text-sun"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={onDown}
              disabled={!canMoveDown}
              aria-label="Move later"
              className="flex h-5 w-5 items-center justify-center rounded border border-white/20 text-xs text-bone-muted disabled:opacity-30 hover:text-sun"
            >
              ↓
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}
