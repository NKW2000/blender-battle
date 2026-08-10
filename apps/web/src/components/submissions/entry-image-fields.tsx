'use client';

import {
  SUBMISSION_IMAGE_MAX_BYTES,
  SUBMISSION_IMAGE_SIZE,
  SUBMISSION_SIZE_HINT,
} from '@bb/shared';
import { useEffect, useRef, useState } from 'react';

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

    /*
      Checked before the dimensions, because a drop accepts anything the OS will
      hand over — a PDF, a .blend, a folder. `readImageSize` would reject those
      too, but with "could not read that image", which describes the symptom
      rather than the mistake.
    */
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, [slot]: 'That is not an image file.' }));
      onChange({ ...value, [slot]: null });
      return;
    }

    /*
      Size before dimensions.

      The server refuses an oversized upload too, but only after the bytes have
      crossed the wire — on a slow connection that is a long wait for a refusal.
      Checking here turns it into an instant answer, and the answer carries the
      actual repair: compression, not a smaller render.
    */
    if (file.size > SUBMISSION_IMAGE_MAX_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setErrors((prev) => ({
        ...prev,
        [slot]: `That file is ${mb}MB — the limit is ${SUBMISSION_IMAGE_MAX_BYTES / 1024 / 1024}MB. ${SUBMISSION_SIZE_HINT}`,
      }));
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
    /*
      Side by side, and square.

      They were full-width rows stacked vertically, which made each drop zone a
      wide, short rectangle — the wrong shape for a target that accepts a square
      1024x1024 image, and it pushed the submit button below the fold. Two square
      tiles read as "two images of the same kind", which is what they are.

      Stacked below `sm`, where two columns would be about 150px each.
    */
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <ImageField
        label="Final render"
        accent="sun"
        title="Drop your render"
        hint="or browse · PNG or JPEG"
        icon={
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <circle cx="8.5" cy="9" r="1.6" />
            <path d="M21 16l-5-5-6 6" />
          </svg>
        }
        file={value.image}
        error={errors.image}
        disabled={disabled}
        onPick={(file) => void pick('image', file)}
      />
      <ImageField
        label="Workspace photo"
        accent="aqua"
        title="Drop your workspace"
        hint="Your Blender window — proof it's yours"
        icon={
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
            <circle cx="12" cy="13" r="3.4" />
          </svg>
        }
        file={value.workspace}
        error={errors.workspace}
        disabled={disabled}
        onPick={(file) => void pick('workspace', file)}
      />
    </div>
  );
}

/*
  Written out per accent rather than interpolated.

  Tailwind scans source text for whole class names, so `border-${accent}` would
  compile to nothing and the field would lose its outline entirely — the kind of
  break that only shows in a production build.
*/
const ACCENT = {
  sun: {
    label: 'text-sun',
    idle: 'border-sun/50 bg-sun/5',
    hover: 'hover:border-sun hover:bg-sun/10',
    chip: 'bg-sun',
    browse: 'text-sun',
  },
  aqua: {
    label: 'text-aqua',
    idle: 'border-aqua/50 bg-aqua/5',
    hover: 'hover:border-aqua hover:bg-aqua/10',
    chip: 'bg-aqua',
    browse: 'text-aqua',
  },
} as const;

/**
 * One drop zone.
 *
 * A bare `<input type="file">` was doing this job, which said "no file chosen"
 * where the design asks for a target you can drag onto. The input is still
 * here — it is what makes the field keyboard-reachable and what opens the
 * picker — but it is visually hidden behind the zone rather than replaced by it.
 */
function ImageField({
  label,
  accent,
  title,
  hint,
  icon,
  file,
  error,
  disabled,
  onPick,
}: {
  label: string;
  accent: keyof typeof ACCENT;
  title: string;
  hint: string;
  icon: React.ReactNode;
  file: File | null;
  error: string | null;
  disabled?: boolean;
  onPick: (file: File | null) => void;
}) {
  const tone = ACCENT[accent];
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
    One object URL at a time, revoked when it is replaced or the field unmounts.
    Without the revoke the blob stays resident for the life of the document, and
    these are 1024×1024 images that someone may swap several times.
  */
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="flex flex-col">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className={`font-display text-[13px] font-bold uppercase tracking-[1.2px] ${tone.label}`}>
          {label}
        </span>
        <span className="text-xs font-extrabold text-haze-5">
          {SUBMISSION_IMAGE_SIZE}×{SUBMISSION_IMAGE_SIZE}
        </span>
      </div>

      <div
        /*
          The zone is the label for the hidden input, so a click anywhere on it
          opens the picker and the input stays the accessible control. `relative`
          + `overflow-hidden` so a chosen image can fill it edge to edge.
        */
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(false);
          onPick(event.dataTransfer.files?.[0] ?? null);
        }}
        onClick={() => inputRef.current?.click()}
        className={`relative flex aspect-square w-full min-h-[150px] cursor-pointer flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[18px] border-[3px] border-dashed p-5 text-center transition-colors ${
          error ? 'border-punch/60 bg-punch/5' : dragging ? 'border-mint bg-mint/10' : `${tone.idle} ${tone.hover}`
        } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-ink/85 px-3 py-2 text-left">
              <span className="truncate text-xs font-extrabold text-mint">✓ {file?.name}</span>
              <span className="shrink-0 text-xs font-extrabold text-haze">Replace</span>
            </div>
          </>
        ) : (
          <>
            <span
              className={`flex h-13 w-13 items-center justify-center rounded-[14px] border-[2.5px] border-ink text-ink ${tone.chip}`}
              style={{ boxShadow: '0 4px 0 var(--color-ink)' }}
            >
              {icon}
            </span>
            <span>
              <span className="block font-display text-base font-bold text-cream">{title}</span>
              <span className="mt-0.5 block text-[12.5px] font-extrabold text-haze-5">
                {hint === 'or browse · PNG or JPEG' ? (
                  <>
                    or <span className={tone.browse}>browse</span> · PNG or JPEG
                  </>
                ) : (
                  hint
                )}
              </span>
            </span>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          aria-label={label}
          onChange={(event) => onPick(event.target.files?.[0] ?? null)}
          onClick={(event) => {
            // The wrapper already forwards the click; without this the event
            // bubbles back up and reopens the picker a second time.
            event.stopPropagation();
            // Lets the same file be re-picked after it was rejected — otherwise
            // `change` never fires again and the field looks frozen.
            (event.target as HTMLInputElement).value = '';
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs font-extrabold text-punch-soft">
          {error}
        </p>
      ) : null}
    </div>
  );
}
