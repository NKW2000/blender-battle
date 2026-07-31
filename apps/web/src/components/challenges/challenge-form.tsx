'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CHALLENGE_DESCRIPTION_MAX_LENGTH,
  CHALLENGE_TITLE_MAX_LENGTH,
  ChallengeVisibility,
  Difficulty,
  type ChallengeDetail,
} from '@bb/shared';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { useCategories } from '@/features/challenges/use-challenges';

/** Mirrors the backend DTO. The API re-validates all of it regardless. */
const challengeSchema = z.object({
  title: z.string().min(4, 'At least 4 characters').max(CHALLENGE_TITLE_MAX_LENGTH),
  description: z
    .string()
    .min(20, 'Give players enough to work from — at least 20 characters')
    .max(CHALLENGE_DESCRIPTION_MAX_LENGTH),
  difficulty: z.nativeEnum(Difficulty),
  categoryId: z.string().uuid('Pick a category'),
  blenderVersion: z
    .string()
    .regex(/^\d+\.\d+$/, 'Use a version like 4.2')
    .optional()
    .or(z.literal('')),
  visibility: z.nativeEnum(ChallengeVisibility),
});

export type ChallengeFormValues = z.infer<typeof challengeSchema>;

export function ChallengeForm({
  challenge,
  submitLabel,
  isSubmitting,
  onSubmit,
}: {
  challenge?: ChallengeDetail;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const { data: categories } = useCategories();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ChallengeFormValues>({
    resolver: zodResolver(challengeSchema),
    defaultValues: {
      title: challenge?.title ?? '',
      description: challenge?.description ?? '',
      difficulty: challenge?.difficulty ?? Difficulty.MEDIUM,
      categoryId: challenge?.category.id ?? '',
      blenderVersion: challenge?.blenderVersion ?? '',
      visibility: challenge?.visibility ?? ChallengeVisibility.PUBLIC,
    },
  });

  const submit = handleSubmit((values) => {
    onSubmit({
      title: values.title,
      description: values.description,
      difficulty: values.difficulty,
      categoryId: values.categoryId,
      blenderVersion: values.blenderVersion || undefined,
      visibility: values.visibility,
    });
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Panel>
        <PanelHeader>
          <PanelTitle>The brief</PanelTitle>
        </PanelHeader>

        <PanelBody className="flex flex-col gap-5">
          <Field
            label="Title"
            placeholder="Modular sci-fi corridor"
            error={errors.title?.message}
            {...register('title')}
          />

          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="eyebrow">
              Description
            </label>
            <div className="selection-frame">
              <span className="vertex-marks" aria-hidden="true" />
              <textarea
                id="description"
                rows={6}
                className="w-full resize-y border border-edge bg-panel px-3 py-2 text-sm outline-none focus:border-select"
                placeholder="What is being built, and what makes a good result?"
                {...register('description')}
              />
            </div>
            {errors.description ? (
              <p role="alert" className="font-mono text-xs text-axis-x">
                {errors.description.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="categoryId" className="eyebrow">
                Category
              </label>
              <Select
                tone="field"
                ariaLabel="Category"
                value={watch('categoryId') ?? ''}
                onChange={(value) => setValue('categoryId', value, { shouldDirty: true })}
                placeholder="Choose one"
                options={[
                  { value: '', label: 'Choose one' },
                  ...(categories ?? []).map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
                ]}
              />
              {errors.categoryId ? (
                <p role="alert" className="font-mono text-xs text-axis-x">
                  {errors.categoryId.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="difficulty" className="eyebrow">
                Difficulty
              </label>
              <Select
                tone="field"
                ariaLabel="Difficulty"
                value={watch('difficulty') ?? ''}
                onChange={(value) => setValue('difficulty', value as Difficulty, { shouldDirty: true })}
                options={Object.values(Difficulty).map((value) => ({
                  value,
                  label: value.charAt(0).toUpperCase() + value.slice(1),
                }))}
              />
            </div>
          </div>

          <Field
            label="Blender version"
            placeholder="4.2"
            error={errors.blenderVersion?.message}
            {...register('blenderVersion')}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Constraints</PanelTitle>
        </PanelHeader>

        <PanelBody className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="visibility" className="eyebrow">
              Visibility
            </label>
            <Select
              tone="field"
              ariaLabel="Visibility"
              value={watch('visibility') ?? ChallengeVisibility.PUBLIC}
              onChange={(value) =>
                setValue('visibility', value as ChallengeVisibility, { shouldDirty: true })
              }
              options={[
                { value: ChallengeVisibility.PUBLIC, label: 'Public', hint: 'Listed and drawn at random' },
                {
                  value: ChallengeVisibility.UNLISTED,
                  label: 'Unlisted',
                  hint: 'Direct link only, never drawn',
                },
                { value: ChallengeVisibility.PRIVATE, label: 'Private', hint: 'Only you and admins' },
              ]}
            />
          </div>
        </PanelBody>

        <div className="flex justify-end border-t border-edge px-5 py-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </Panel>
    </form>
  );
}
