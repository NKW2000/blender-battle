'use client';

import { SUBMISSION_IMAGE_SIZE } from '@bb/shared';
import { useState } from 'react';

/**
 * The pair of images every submission is made of: the final render and a shot
 * of the workspace it was built in.
 *
 * Shared by rooms and public challenges. Both take the same two files under the
 * same rule, and when this lived twice the two copies had already begun to
 * differ — one asked for a 3D model where the other asked for a photo. One
 * component means one answer to what a submission is.
 */

/** Reads the real pixel dimensions, since the file name says nothing. */
export function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

export interface EntryImages {
  image: File | null;
  workspace: File | null;
}

/**
 * Both fields, with the size rule enforced as the file is picked.
 *
 * Checked here as well as on the server, and the server's check is the one that
 * counts — this only exists so the artist finds out immediately rather than
 * after an upload that was always going to be refused.
 */
export function EntryImageFields({
  value,
  onChange,
  disabled,
}: {
  value: EntryImages;
  onChange: (next: EntryImages) => void;
  disabled?: boolean;
}) {
  const [errors, setErrors] = useState<{ image: string | null; workspace: string | null }>({
    image: null,
    workspace: null,
  });

  const pick = async (slot: keyof EntryImages, file: File | null) => {
    if (!file) {
      setErrors((prev) => ({ ...prev, [slot]: null }));
      onChange({ ...value, [slot]: null });
      return;
    }

    try {
      const { width, height } = await readImageSize(file);
      if (width !== SUBMISSION_IMAGE_SIZE || height !== SUBMISSION_IMAGE_SIZE) {
        // Cleared rather than kept: a rejected file left in the input looks
        // accepted, and the submit button would then lie about being ready.
        setErrors((prev) => ({
          ...prev,
          [slot]: `Must be exactly ${SUBMISSION_IMAGE_SIZE}×${SUBMISSION_IMAGE_SIZE}px — that one is ${width}×${height}.`,
        }));
        onChange({ ...value, [slot]: null });
        return;
      }
      setErrors((prev) => ({ ...prev, [slot]: null }));
      onChange({ ...value, [slot]: file });
    } catch {
      setErrors((prev) => ({ ...prev, [slot]: 'Could not read that image.' }));
      onChange({ ...value, [slot]: null });
    }
  };

  return (
    <>
      <ImageField
        label={`Final render — ${SUBMISSION_IMAGE_SIZE}×${SUBMISSION_IMAGE_SIZE}`}
        accentClass="file:bg-sun"
        file={value.image}
        error={errors.image}
        disabled={disabled}
        onPick={(file) => void pick('image', file)}
      />
      <ImageField
        label={`Workspace photo — ${SUBMISSION_IMAGE_SIZE}×${SUBMISSION_IMAGE_SIZE}`}
        accentClass="file:bg-aqua"
        file={value.workspace}
        error={errors.workspace}
        disabled={disabled}
        onPick={(file) => void pick('workspace', file)}
        hint="Your Blender window while building — it is what shows the piece is yours."
      />
    </>
  );
}

function ImageField({
  label,
  accentClass,
  file,
  error,
  hint,
  disabled,
  onPick,
}: {
  label: string;
  accentClass: string;
  file: File | null;
  error: string | null;
  hint?: string;
  disabled?: boolean;
  onPick: (file: File | null) => void;
}) {
  return (
    <label className="block">
      <span className="eyebrow text-aqua">{label}</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event) => onPick(event.target.files?.[0] ?? null)}
        className={`mt-2 w-full text-sm font-bold text-bone-muted file:mr-3 file:rounded-lg file:border-[3px] file:border-edge ${accentClass} file:px-3 file:py-2 file:font-display file:font-bold file:text-edge disabled:opacity-50`}
      />
      {error ? (
        <p role="alert" className="mt-1.5 text-xs font-bold text-punch-soft">
          {error}
        </p>
      ) : file ? (
        <p className="mt-1.5 text-xs font-bold text-mint">✓ {file.name}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs font-bold text-bone-faint">{hint}</p>
      ) : null}
    </label>
  );
}
