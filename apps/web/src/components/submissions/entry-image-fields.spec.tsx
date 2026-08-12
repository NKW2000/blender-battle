import { SUBMISSION_IMAGE_MAX_BYTES, SUBMISSION_IMAGE_SIZE } from '@bb/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryImageFields, type EntryImages } from './entry-image-fields';

/**
 * Picking the two images.
 *
 * Reported as "I upload both and press submit and nothing happens, and after a
 * refresh the photos are gone". Two very different faults produce that
 * sentence: the upload failing silently, or the files never reaching the form
 * in the first place — in which case the submit button was disabled the whole
 * time and never sent anything at all.
 *
 * These cover the second one, driving real `File` objects through the real
 * input, because every rejection path here is supposed to be visible and a
 * silent one is indistinguishable from a broken picker.
 */

/*
  jsdom does not decode images, so `img.onload` never fires and `readImageSize`
  would hang forever. Standing in for the decode with a controllable size is the
  only way to exercise the dimension rule at all — everything around it is the
  component's own logic.
*/
/*
  Defined once, for the life of the file, and never restored.

  This jsdom has neither method — object URLs are a browser affordance it does
  not implement — so there is nothing to put back, and restoring "the original"
  means restoring `undefined`. That is what broke the first attempt: Testing
  Library's unmount runs in its own `afterEach`, after this file's, so the
  preview effect's cleanup reached for `revokeObjectURL` a moment after the
  teardown had removed it again. Each test file gets its own environment, so
  leaving them in place leaks nothing.
*/
Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  value: () => 'blob:stub',
});
Object.defineProperty(URL, 'revokeObjectURL', {
  configurable: true,
  value: () => undefined,
});

let decoded: { width: number; height: number } | 'error' = {
  width: SUBMISSION_IMAGE_SIZE,
  height: SUBMISSION_IMAGE_SIZE,
};

beforeEach(() => {
  decoded = { width: SUBMISSION_IMAGE_SIZE, height: SUBMISSION_IMAGE_SIZE };

  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;

      set src(_value: string) {
        queueMicrotask(() => {
          if (decoded === 'error') {
            this.onerror?.();
            return;
          }
          this.naturalWidth = decoded.width;
          this.naturalHeight = decoded.height;
          this.onload?.();
        });
      }
    },
  );

  /*
    Patched onto the real `URL` rather than replacing it.

    Swapping the whole global loses everything else on it, and the preview
    effect's cleanup runs *after* the globals are restored — so a replaced `URL`
    leaves `revokeObjectURL` missing exactly when unmount reaches for it.
  */
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A file of a given size, without allocating that many bytes. */
function makeFile(name: string, bytes: number) {
  const file = new File(['x'], name, { type: 'image/png' });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

const ok = () => makeFile('render.png', 500_000);

/** The real parent's shape: controlled state, exactly as the pages hold it. */
function Harness({ onChange }: { onChange?: (next: EntryImages) => void } = {}) {
  const [files, setFiles] = useState<EntryImages>({ image: null, workspace: null });

  return (
    <>
      <EntryImageFields
        value={files}
        onChange={(next) => {
          setFiles(next);
          onChange?.(next);
        }}
      />
      <span data-testid="state">
        {files.image ? 'image' : '-'}/{files.workspace ? 'workspace' : '-'}
      </span>
    </>
  );
}

const inputs = () => screen.getAllByLabelText(/final render|workspace photo/i);

describe('picking an entry image', () => {
  it('accepts a valid render and reports it to the parent', async () => {
    // The whole reported failure, at its root: if this does not happen the
    // submit button never enables and pressing it does nothing.
    render(<Harness />);

    await userEvent.upload(inputs()[0]!, ok());

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('image/-'));
  });

  it('accepts both, so the form can actually be submitted', async () => {
    render(<Harness />);

    await userEvent.upload(inputs()[0]!, makeFile('render.png', 400_000));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('image/-'));

    await userEvent.upload(inputs()[1]!, makeFile('workspace.png', 400_000));

    /*
      The second pick must not lose the first.

      `pick` spreads the `value` prop it closed over, and it awaits a decode
      before writing — so a stale closure here would drop whichever image was
      chosen first, and the button would never enable no matter how many times
      someone tried.
    */
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('image/workspace'),
    );
  });

  it('explains an oversized file rather than dropping it silently', async () => {
    render(<Harness />);

    await userEvent.upload(inputs()[0]!, makeFile('huge.png', SUBMISSION_IMAGE_MAX_BYTES + 1));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/limit is 2MB/i);
    // The repair, not just the refusal.
    expect(alert).toHaveTextContent(/compression/i);
    expect(screen.getByTestId('state')).toHaveTextContent('-/-');
  });

  it('explains the wrong dimensions', async () => {
    decoded = { width: 800, height: 600 };
    render(<Harness />);

    await userEvent.upload(inputs()[0]!, ok());

    expect(await screen.findByRole('alert')).toHaveTextContent('800×600');
  });

  it('explains a file it cannot decode', async () => {
    // A HEIC from a phone lands here: the browser will not decode it, and
    // without a message the zone simply stays empty.
    decoded = 'error';
    render(<Harness />);

    await userEvent.upload(inputs()[0]!, ok());

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not read/i);
  });

  it('clears a stale error once a good file replaces a bad one', async () => {
    decoded = { width: 800, height: 600 };
    render(<Harness />);

    await userEvent.upload(inputs()[0]!, ok());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    decoded = { width: SUBMISSION_IMAGE_SIZE, height: SUBMISSION_IMAGE_SIZE };
    await userEvent.upload(inputs()[0]!, ok());

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByTestId('state')).toHaveTextContent('image/-');
  });
});
