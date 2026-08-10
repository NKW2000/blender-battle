'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AVATAR_ALLOWED_MIME,
  AVATAR_MAX_BYTES,
  BIO_MAX_LENGTH,
  ExperienceLevel,
  SHOWCASE_MAX_ITEMS,
  SOCIAL_LINK_KEYS,
  SOCIAL_LINK_LABELS,
  type PortfolioItem,
  type SocialLinks,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  OAuthProvider,
} from '@bb/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type UseFormRegister } from 'react-hook-form';
import { z } from 'zod';

import { ChunkyButton } from '@/components/arcade/chunky';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import {
  EmptyState,
  PANEL_ICON,
  Panel,
  PanelBody,
  PanelHeader,
  PanelTitle,
  Skeleton,
} from '@/components/ui/panel';
import {
  useForgotPassword,
  useLinkedAccounts,
  useResendVerification,
} from '@/features/auth/use-recovery';
import { useSession } from '@/features/auth/use-session';
import { usePortfolio, useUpdateProfile, useUploadAvatar } from '@/features/users/use-users';
import { collectFormMessages, notify } from '@/lib/notify';

/**
 * `.url()` requires an absolute URL, which is what keeps "javascript:…" and a
 * bare "example.com" out — the profile renders these as anchors, and either
 * would be a link that runs or breaks.
 */
const socialUrl = z.string().url('Include https://').optional().or(z.literal(''));

const profileSchema = z.object({
  /* Mirrors the server's rule exactly. The server still decides — it owns the
     unique index — but matching the shape here means a malformed name is
     refused before a round trip rather than after one. */
  username: z
    .string()
    .min(USERNAME_MIN_LENGTH, `At least ${USERNAME_MIN_LENGTH} characters`)
    .max(USERNAME_MAX_LENGTH, `At most ${USERNAME_MAX_LENGTH} characters`)
    .regex(
      USERNAME_PATTERN,
      'Letters, numbers, hyphens and underscores, starting and ending with a letter or number.',
    ),
  bio: z.string().max(BIO_MAX_LENGTH, `At most ${BIO_MAX_LENGTH} characters`).optional(),
  country: z
    .string()
    .length(2, 'Use a two-letter country code, for example GB')
    .optional()
    .or(z.literal('')),
  experienceLevel: z.nativeEnum(ExperienceLevel),
  /*
    Written out rather than generated. A mapped type here loses the per-key
    shape zod needs to infer the form's value type, and the cast that gets it
    compiling is the kind that hides a real mismatch later.

    Every URL field takes the same rule, defined once as `socialUrl`. `.url()` requires
    an absolute URL, which is what keeps "javascript:…" and bare "example.com"
    out — the profile renders these as anchors, and a relative or script URL
    there is a link that either breaks or runs.

    Discord is a handle, not a URL: there is no public profile page to link to.
  */
  socialLinks: z.object({
    website: socialUrl,
    artstation: socialUrl,
    sketchfab: socialUrl,
    behance: socialUrl,
    instagram: socialUrl,
    youtube: socialUrl,
    tiktok: socialUrl,
    facebook: socialUrl,
    twitter: socialUrl,
    discord: z.string().max(64, 'Keep it under 64 characters').optional().or(z.literal('')),
  }),
});

type ProfileInput = z.infer<typeof profileSchema>;

/** One editable link: which platform it is, and where it points. */
type SocialKey = keyof SocialLinks;

/** Shows the shape each field wants, so nobody has to guess the URL form. */
const SOCIAL_PLACEHOLDER: Record<keyof SocialLinks, string> = {
  website: 'https://your-site.com',
  artstation: 'https://artstation.com/…',
  sketchfab: 'https://sketchfab.com/…',
  behance: 'https://behance.net/…',
  instagram: 'https://instagram.com/…',
  youtube: 'https://youtube.com/@…',
  tiktok: 'https://tiktok.com/@…',
  facebook: 'https://facebook.com/…',
  twitter: 'https://x.com/…',
  discord: 'yourhandle',
};

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
          username: user.username,
          bio: user.bio ?? '',
          country: user.country ?? '',
          experienceLevel: user.experienceLevel,
          socialLinks: {
            ...Object.fromEntries(
              SOCIAL_LINK_KEYS.map((key) => [key, user.socialLinks[key] ?? '']),
            ),
          },
        }
      : undefined,
  });

  /*
    Which platforms have a row on screen, in the order they were added.

    Kept beside the form values rather than derived from them, because a row the
    artist has just added has no value yet — deriving from "keys with a value"
    would delete the empty row on the very next render, before it could be
    typed into.
  */
  const [rows, setRows] = useState<SocialKey[] | null>(null);
  useEffect(() => {
    if (!user || rows) return;
    setRows(SOCIAL_LINK_KEYS.filter((key) => (user.socialLinks[key] ?? '').trim() !== ''));
  }, [user, rows]);

  const visibleRows = rows ?? [];
  const unusedKeys = SOCIAL_LINK_KEYS.filter((key) => !visibleRows.includes(key));

  const addRow = () => {
    const next = unusedKeys[0];
    if (next) setRows([...visibleRows, next]);
  };

  const removeRow = (key: SocialKey) => {
    // Clear the value too, or a removed row would still be submitted.
    setValue(`socialLinks.${key}`, '', { shouldDirty: true });
    setRows(visibleRows.filter((row) => row !== key));
  };

  /** Re-labelling a row carries its URL across and empties the old key. */
  const changeRowKey = (from: SocialKey, to: SocialKey) => {
    const current = watch(`socialLinks.${from}`) ?? '';
    setValue(`socialLinks.${from}`, '', { shouldDirty: true });
    setValue(`socialLinks.${to}`, current, { shouldDirty: true, shouldValidate: true });
    setRows(visibleRows.map((row) => (row === from ? to : row)));
  };

  if (!user) return null;

  const onSubmit = (values: ProfileInput) => {
    // Empty strings mean "not set", and the API's URL validator would reject them.
    const socialLinks = Object.fromEntries(
      Object.entries(values.socialLinks).filter(([, value]) => value !== ''),
    );

    updateProfile.mutate({
      // Sent only when actually changed, so an unrelated save cannot collide
      // with the unique index over a name that is already yours.
      username: values.username !== user?.username ? values.username : undefined,
      bio: values.bio || undefined,
      country: values.country || undefined,
      experienceLevel: values.experienceLevel,
      socialLinks,
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Settings" title="Your profile" />

      {/*
        Two columns rather than one narrow one.

        This page used to be capped at `max-w-2xl` while every other screen
        filled the chrome, so navigating into settings visibly narrowed the
        application. Removing the cap alone would have stretched the text inputs
        to the full width, which is worse; splitting it puts the avatar in a side
        column and leaves the form at roughly the width it already had.
      */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_1.6fr]">
      {/*
        A column, not a single card.

        The avatar panel is about 220px tall against a form nearly four times
        that, so the side column was mostly empty space. What fills it is the
        part of "your account" this screen never had: the address everything is
        sent to, whether it has been confirmed, how to change the password, and
        which providers the account can be signed in with.
      */}
      <div className="flex min-w-0 flex-col gap-8">
      <Panel>
        <PanelHeader tone="aqua" icon={PANEL_ICON.image}>
          <PanelTitle>Avatar</PanelTitle>
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
              className="flex h-24 w-24 items-center justify-center rounded-2xl border-[3px] border-ink bg-white/6 font-display text-2xl text-haze-5"
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

      <AccountPanel />
      <ConnectedAccountsPanel />
      </div>

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
              <label htmlFor="username" className="eyebrow">
                Name
              </label>
              <input
                id="username"
                maxLength={USERNAME_MAX_LENGTH}
                className="arcade-focus w-full rounded-2xl border-[3px] border-white/16 bg-white/6 px-4 py-3 font-bold text-cream outline-none transition-colors placeholder:text-[#6E67A0] focus:border-sun focus:bg-sun/10"
                {...register('username')}
              />
              <p className="text-xs font-extrabold text-haze-5">
                This is your profile address too — changing it changes the link.
              </p>
              {errors.username ? (
                <p role="alert" className="font-mono text-xs text-punch-soft">
                  {errors.username.message}
                </p>
              ) : null}
            </div>

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

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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

            <SocialLinkRows
              rows={visibleRows}
              errors={errors.socialLinks}
              onAdd={addRow}
              onRemove={removeRow}
              onChangeKey={changeRowKey}
              register={register}
            />
          </PanelBody>

          <div className="flex justify-end border-t border-edge px-5 py-4">
            <Button type="submit" disabled={!isDirty || updateProfile.isPending}>
              {updateProfile.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </Panel>
      </form>
      </div>

      {/* Full width on purpose: it is a gallery of finished work, and it was the
          one thing the old narrow column actually hurt. */}
      <ShowcasePicker username={user.username} initial={user.showcaseEntryIds ?? []} />
    </div>
  );
}

/**
 * The account itself: the address everything is sent to, and the password.
 *
 * Settings had neither. Your email was not shown anywhere in the application
 * once you had registered, so there was no way to check which address a
 * verification link had gone to, and no way to change a password without
 * signing out first and using "forgot password" from the login screen.
 */
function AccountPanel() {
  const { user } = useSession();
  const resend = useResendVerification();
  const forgot = useForgotPassword();

  if (!user) return null;

  const verified = Boolean(user.emailVerifiedAt);

  return (
    <Panel>
      <PanelHeader tone="sun" icon={PANEL_ICON.upload}>
        <PanelTitle>Account</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-black uppercase tracking-[1.2px] text-haze-5">
            Email
          </span>
          {/* `break-all`: an address is one unbroken token to the browser, and a
              long one would otherwise widen this panel past its column. */}
          <span className="break-all text-sm font-extrabold text-cream">{user.email}</span>

          <span
            className={`mt-1 w-fit rounded-full border-2 px-3 py-1 text-[11px] font-black uppercase tracking-[1px] ${
              verified
                ? 'border-mint bg-mint/14 text-mint'
                : 'border-sun bg-sun/14 text-sun'
            }`}
          >
            {verified ? 'Confirmed' : 'Not confirmed'}
          </span>

          {!verified ? (
            <>
              <p className="mt-1 text-xs font-extrabold leading-relaxed text-haze">
                Voting needs a confirmed address. Entering challenges does not.
              </p>
              <ChunkyButton
                size="sm"
                tone="cream"
                className="mt-1 w-full"
                onClick={() => resend.mutate()}
                disabled={resend.isPending}
              >
                {resend.isPending ? 'Sending…' : 'Send the link again'}
              </ChunkyButton>
              {resend.isSuccess ? (
                <p className="text-xs font-extrabold text-mint">Sent — check your spam folder.</p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 border-t-[3px] border-ink pt-4">
          <span className="text-[11px] font-black uppercase tracking-[1.2px] text-haze-5">
            Password
          </span>
          {/*
            A reset link rather than an old/new password pair.

            There is no authenticated change-password endpoint, and inventing one
            here would mean a second way to set a password with its own rules to
            keep in step with the first. Mailing the same link the login screen
            sends reuses a path that already revokes every session on success,
            which is the behaviour you want when a password changes.
          */}
          {forgot.isSuccess ? (
            <p className="text-xs font-extrabold text-mint">
              A reset link is on its way to {user.email}.
            </p>
          ) : (
            <>
              <p className="text-xs font-extrabold leading-relaxed text-haze">
                We email you a link. Using it signs you out everywhere else.
              </p>
              <ChunkyButton
                size="sm"
                tone="ghost"
                className="mt-1 w-full"
                onClick={() => forgot.mutate({ email: user.email })}
                disabled={forgot.isPending}
              >
                {forgot.isPending ? 'Sending…' : 'Change password'}
              </ChunkyButton>
            </>
          )}
        </div>

        <dl className="flex flex-col gap-2 border-t-[3px] border-ink pt-4 text-xs font-extrabold">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-haze-5">Joined</dt>
            <dd className="text-haze">{formatDate(user.joinedAt)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-haze-5">Role</dt>
            <dd className="uppercase text-haze">{user.role}</dd>
          </div>
        </dl>
      </PanelBody>
    </Panel>
  );
}

/**
 * Which providers this account can be signed in with.
 *
 * `/auth/oauth/linked` has been served the whole time with nothing calling it,
 * so an account could be connected to Google or Discord and no screen would say
 * so. Connecting is a redirect to the same endpoint the sign-in buttons use,
 * with the caller's id taken from their token rather than the query string.
 */
function ConnectedAccountsPanel() {
  const { data: linked, isLoading } = useLinkedAccounts();

  const providers: Array<{ id: OAuthProvider; label: string }> = [
    { id: OAuthProvider.GOOGLE, label: 'Google' },
    { id: OAuthProvider.DISCORD, label: 'Discord' },
  ];

  return (
    <Panel>
      <PanelHeader tone="mint" icon={PANEL_ICON.users}>
        <PanelTitle>Sign-in methods</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-2.5">
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          providers.map((provider) => {
            const account = linked?.find((item) => item.provider === provider.id);

            return (
              <div
                key={provider.id}
                className="flex min-w-0 items-center justify-between gap-3 rounded-[14px] border-[2.5px] border-ink bg-white/5 px-4 py-3"
                style={{ boxShadow: '0 4px 0 var(--color-ink)' }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-cream">{provider.label}</p>
                  {account ? (
                    <p className="truncate text-xs font-extrabold text-mint">
                      {account.handle ?? 'Connected'}
                    </p>
                  ) : (
                    <p className="text-xs font-extrabold text-haze-5">Not connected</p>
                  )}
                </div>

                {account ? (
                  <span className="shrink-0 text-xs font-black uppercase tracking-[1px] text-mint">
                    ✓
                  </span>
                ) : (
                  <ChunkyButton
                    size="sm"
                    tone="cream"
                    className="shrink-0"
                    onClick={() => {
                      const base =
                        process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
                      window.location.href = `${base}/auth/oauth/${provider.id}?link=1`;
                    }}
                  >
                    Connect
                  </ChunkyButton>
                )}
              </div>
            );
          })
        )}
      </PanelBody>
    </Panel>
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


/**
 * react-hook-form types a nested field's error as a union that includes a whole
 * error tree, so `.message` alone does not narrow to a string.
 */
function socialFieldError(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'message' in error) {
    const { message } = error as { message?: unknown };
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}


/**
 * The links, as rows you add rather than a fixed grid of every platform.
 *
 * The grid it replaces showed all ten fields at all times, so an artist with two
 * links scrolled past eight empty boxes to find them. A row is only here because
 * someone put it here.
 *
 * The platform is a dropdown rather than free text: the set is closed on the
 * contract, which is what lets the profile label each link and the API validate
 * it. A row's own platform stays in its options — otherwise the select would
 * render with nothing selected.
 */
function SocialLinkRows({
  rows,
  errors,
  onAdd,
  onRemove,
  onChangeKey,
  register,
}: {
  rows: SocialKey[];
  errors: Partial<Record<SocialKey, unknown>> | undefined;
  onAdd: () => void;
  onRemove: (key: SocialKey) => void;
  onChangeKey: (from: SocialKey, to: SocialKey) => void;
  register: UseFormRegister<ProfileInput>;
}) {
  const full = rows.length === SOCIAL_LINK_KEYS.length;

  return (
    <div className="flex flex-col gap-3">
      <span className="eyebrow">Links</span>

      {rows.length === 0 ? (
        <p className="text-xs font-extrabold text-bone-faint">
          No links yet. Add the places people can find your work.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {rows.map((key) => (
          <li key={key} className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
            <Select
              className="w-full sm:w-44"
              tone="field"
              ariaLabel={`Platform for link ${SOCIAL_LINK_LABELS[key]}`}
              value={key}
              onChange={(next) => onChangeKey(key, next as SocialKey)}
              options={SOCIAL_LINK_KEYS.filter(
                (option) => option === key || !rows.includes(option),
              ).map((option) => ({ value: option, label: SOCIAL_LINK_LABELS[option] }))}
            />

            {/*
              A bare input rather than `Field`: the row is already named by the
              select beside it, and Field always renders its label element — an
              empty one would take a line of space and say nothing. The name
              assistive tech needs comes from aria-label instead.
            */}
            <div className="min-w-0 flex-1">
              <input
                aria-label={`${SOCIAL_LINK_LABELS[key]} link`}
                placeholder={SOCIAL_PLACEHOLDER[key]}
                className={cn(
                  'arcade-focus h-12 w-full rounded-2xl border-[3px] bg-white/6 px-4 font-bold text-bone transition-colors placeholder:text-bone-faint/70 focus:border-aqua focus:bg-aqua/10',
                  socialFieldError(errors?.[key]) ? 'border-axis-x' : 'border-white/16',
                )}
                {...register(`socialLinks.${key}` as const)}
              />
              {socialFieldError(errors?.[key]) ? (
                <p role="alert" className="mt-1.5 text-xs font-bold text-axis-x">
                  {socialFieldError(errors?.[key])}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              aria-label={`Remove ${SOCIAL_LINK_LABELS[key]}`}
              onClick={() => onRemove(key)}
              className="arcade-focus flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-white/20 bg-white/6 text-bone-muted transition-colors hover:bg-white/16 hover:text-bone"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      {full ? (
        <p className="text-xs font-extrabold text-bone-faint">
          Every supported platform is listed.
        </p>
      ) : (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
            + Add link
          </Button>
        </div>
      )}
    </div>
  );
}
