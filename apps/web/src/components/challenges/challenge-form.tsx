'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CHALLENGE_DESCRIPTION_MAX_LENGTH,
  CHALLENGE_MAX_OBJECTIVES,
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
import { collectFormMessages, notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

/** Mirrors the backend DTO. The API re-validates all of it regardless. */
const challengeSchema = z.object({
  title: z.string().min(4, 'At least 4 characters').max(CHALLENGE_TITLE_MAX_LENGTH),
  description: z
    .string()
    .min(20, 'Give players enough to work from — at least 20 characters')
    .max(CHALLENGE_DESCRIPTION_MAX_LENGTH),
  difficulty: z.nativeEnum(Difficulty),
  categoryId: z.string().uuid('Pick a category'),
  /*
    Required here, though the API only insists on it at publish time. The form
    used not to send objectives at all, so every challenge was created with an
    empty list and then refused to publish — the author hit the wall only after
    the work of writing the brief, with no field on the page to fix it. Asking
    for one sentence up front removes the dead end entirely.
  */
  objectives: z
    .array(z.string().trim().min(1, 'Write the objective or remove the empty line').max(200))
    .min(1, 'Add at least one objective — it is what players are judged on')
    .max(CHALLENGE_MAX_OBJECTIVES),
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
      objectives: challenge?.objectives?.length ? challenge.objectives : [''],
      blenderVersion: challenge?.blenderVersion ?? '',
      visibility: challenge?.visibility ?? ChallengeVisibility.PUBLIC,
    },
  });

  const submit = handleSubmit(
    (values) => {
      onSubmit({
        title: values.title,
        description: values.description,
        difficulty: values.difficulty,
        categoryId: values.categoryId,
        objectives: values.objectives.map((o) => o.trim()).filter(Boolean),
        blenderVersion: values.blenderVersion || undefined,
        visibility: values.visibility,
      });
    },
    // The per-field messages below the inputs say what to fix; this only says
    // that the submit was refused, which is otherwise invisible when the first
    // bad field has scrolled out of view.
    (fieldErrors) => notify.invalidForm(collectFormMessages(fieldErrors)),
  );

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
                className={cn(
                  'w-full resize-y border bg-panel px-3 py-2 text-sm outline-none focus:border-select',
                  errors.description ? 'border-axis-x' : 'border-edge',
                )}
                placeholder="What is being built, and what makes a good result?"
                {...register('description')}
              />
            </div>
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

          <ObjectiveList
            values={watch('objectives') ?? ['']}
            invalid={Boolean(errors.objectives)}
            onChange={(next) => setValue('objectives', next, { shouldDirty: true, shouldValidate: true })}
          />

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


/**
 * The judging criteria, one line each.
 *
 * A plain repeating text field rather than anything cleverer: the value is an
 * array of short strings, and the only operations that matter are add, edit and
 * remove. The last row cannot be deleted — a challenge with no objectives is
 * exactly the state that could not be published, so the form does not offer a
 * way back into it.
 */
function ObjectiveList({
  values,
  invalid,
  onChange,
}: {
  values: string[];
  invalid: boolean;
  onChange: (next: string[]) => void;
}) {
  const rows = values.length ? values : [''];

  const setAt = (index: number, value: string) =>
    onChange(rows.map((row, i) => (i === index ? value : row)));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow">Objectives</span>
        <span className="text-[11px] font-extrabold text-bone-faint">
          {rows.length} / {CHALLENGE_MAX_OBJECTIVES}
        </span>
      </div>

      <p className="text-xs font-extrabold text-bone-faint">
        What players are judged on. At least one is required to publish.
      </p>

      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => (
          // Index as key: the rows have no identity of their own, and reordering
          // is not offered, so position is a stable enough handle.
          <li key={index} className="flex items-center gap-2">
            <input
              value={row}
              onChange={(event) => setAt(index, event.target.value)}
              maxLength={200}
              aria-label={`Objective ${index + 1}`}
              placeholder="Silhouette reads clearly from three metres"
              className={cn(
                'arcade-focus h-11 min-w-0 flex-1 rounded-xl border-[3px] bg-white/6 px-3 font-bold text-bone transition-colors placeholder:text-bone-faint/70 focus:border-select focus:bg-select/10',
                invalid ? 'border-axis-x' : 'border-white/16',
              )}
            />
            <button
              type="button"
              aria-label={`Remove objective ${index + 1}`}
              disabled={rows.length === 1}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              className="arcade-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-white/20 bg-white/6 text-bone-muted transition-colors hover:bg-white/16 hover:text-bone disabled:cursor-not-allowed disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      {rows.length < CHALLENGE_MAX_OBJECTIVES ? (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...rows, ''])}>
            + Add objective
          </Button>
        </div>
      ) : null}
    </div>
  );
}
