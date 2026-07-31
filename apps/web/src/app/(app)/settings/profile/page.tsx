'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AVATAR_ALLOWED_MIME, AVATAR_MAX_BYTES, BIO_MAX_LENGTH, ExperienceLevel } from '@bb/shared';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { useSession } from '@/features/auth/use-session';
import { useUpdateProfile, useUploadAvatar } from '@/features/users/use-users';

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
    <div className="flex max-w-2xl flex-col gap-8">
      <header>
        <p className="eyebrow">Settings</p>
        <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
          Your profile
        </h1>
      </header>

      <Panel>
        <PanelHeader>
          <PanelTitle>Avatar</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex items-center gap-5">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- already transformed by Cloudinary
            <img
              src={user.avatarUrl}
              alt=""
              className="h-20 w-20 rounded-2xl border-[3px] border-edge object-cover"
              style={{ boxShadow: '0 4px 0 var(--color-edge)' }}
            />
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl border-[3px] border-edge bg-panel-raised font-display text-2xl text-bone-faint"
              style={{ boxShadow: '0 4px 0 var(--color-edge)' }}
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
              size="sm"
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

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
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
              error={errors.socialLinks?.website?.message}
              {...register('socialLinks.website')}
            />
            <Field
              label="ArtStation"
              placeholder="https://artstation.com/…"
              error={errors.socialLinks?.artstation?.message}
              {...register('socialLinks.artstation')}
            />
            <Field
              label="YouTube"
              placeholder="https://youtube.com/@…"
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
    </div>
  );
}
