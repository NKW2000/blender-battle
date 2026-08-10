import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Select } from './select';

/**
 * The hand-built combobox.
 *
 * Rebuilding a native `<select>` buys visual control and takes on its
 * accessibility in exchange — keyboard navigation, focus management, and what a
 * screen reader is told. None of that is visible to someone testing with a
 * mouse, which is how `aria-activedescendant` came to be set on the listbox: an
 * element with `tabIndex={-1}` that never receives focus, so the highlight
 * moved with the arrow keys and nothing was ever announced.
 *
 * These assert the parts of the WAI-ARIA select-only combobox pattern that
 * cannot be seen.
 */

const OPTIONS = [
  { value: 'easy', label: 'Beginner' },
  { value: 'medium', label: 'Intermediate' },
  { value: 'hard', label: 'Advanced' },
];

/** Stateful wrapper — the component is controlled, so a test needs the state. */
function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <Select ariaLabel="Difficulty" value={value} onChange={setValue} options={OPTIONS} />;
}

const combobox = () => screen.getByRole('combobox', { name: 'Difficulty' });

describe('Select — semantics', () => {
  it('exposes a labelled combobox that reports whether it is open', async () => {
    render(<Harness />);

    expect(combobox()).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(combobox());
    expect(combobox()).toHaveAttribute('aria-expanded', 'true');
  });

  it('points at the listbox it controls, only while open', async () => {
    render(<Harness />);
    expect(combobox()).not.toHaveAttribute('aria-controls');

    await userEvent.click(combobox());

    const listbox = screen.getByRole('listbox');
    expect(combobox()).toHaveAttribute('aria-controls', listbox.id);
  });

  it('marks the chosen option as selected', async () => {
    render(<Harness initial="medium" />);
    await userEvent.click(combobox());

    expect(screen.getByRole('option', { name: /Intermediate/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: /Advanced/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});

describe('Select — keyboard', () => {
  it('announces the active option from the element that has focus', async () => {
    /*
      The regression this file exists for.

      Focus never leaves the button, so `aria-activedescendant` has to be on the
      button — a screen reader reads the active descendant of the focused
      element and nowhere else. It used to sit on the listbox, where it was
      inert.
    */
    render(<Harness />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');

    const active = combobox().getAttribute('aria-activedescendant');
    expect(active).toBeTruthy();
    expect(document.getElementById(active!)).toHaveAttribute('role', 'option');
  });

  it('opens on ArrowUp as well as ArrowDown', async () => {
    // Both open the list in the WAI pattern. Handling only one is a gap a
    // mouse user never meets and a keyboard user meets immediately.
    render(<Harness />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowUp}');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('moves the active option with the arrow keys', async () => {
    render(<Harness />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    const first = combobox().getAttribute('aria-activedescendant');

    await userEvent.keyboard('{ArrowDown}');
    expect(combobox().getAttribute('aria-activedescendant')).not.toBe(first);
  });

  it('jumps to the first and last option with Home and End', async () => {
    render(<Harness />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{End}');

    expect(
      document.getElementById(combobox().getAttribute('aria-activedescendant')!),
    ).toHaveTextContent('Advanced');

    await userEvent.keyboard('{Home}');
    expect(
      document.getElementById(combobox().getAttribute('aria-activedescendant')!),
    ).toHaveTextContent('Beginner');
  });

  it('commits with Enter and closes', async () => {
    render(<Harness />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combobox()).toHaveTextContent('Intermediate');
  });

  it('closes on Escape without changing the value', async () => {
    render(<Harness initial="easy" />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combobox()).toHaveTextContent('Beginner');
  });

  it('is reachable by Tab and skipped when disabled', async () => {
    const { rerender } = render(
      <Select ariaLabel="Difficulty" value="" onChange={() => {}} options={OPTIONS} />,
    );
    await userEvent.tab();
    expect(combobox()).toHaveFocus();

    rerender(
      <Select ariaLabel="Difficulty" value="" onChange={() => {}} options={OPTIONS} disabled />,
    );
    expect(combobox()).toBeDisabled();
  });
});
