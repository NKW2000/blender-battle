import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageHeader } from './page-header';

/**
 * The one heading every screen opens with.
 *
 * There were two of these and they disagreed: most pages had an eyebrow above a
 * `text-2xl` title, while rooms and public challenges had a bare `text-3xl`
 * with no eyebrow and no uppercase. Consolidating them is only worth anything
 * if it stays consolidated, and the failure mode is silent — a page grows its
 * own header again and looks almost right.
 *
 * So these assert the shape rather than the pixels: exactly one `h1`, the
 * eyebrow above it, and the optional parts genuinely optional.
 */
describe('PageHeader', () => {
  it('renders the eyebrow and the page title', () => {
    render(<PageHeader eyebrow="Administration" title="Users" />);

    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
  });

  it('is the only h1 on the page it heads', () => {
    // A second `h1` is how a screen reader's document outline stops meaning
    // anything, and it is exactly what having two header patterns produced.
    const { container } = render(
      <PageHeader eyebrow="Catalogue" title="Challenges" description="Browse every brief." />,
    );

    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('omits the description when there is none', () => {
    const { container } = render(<PageHeader eyebrow="Settings" title="Your profile" />);

    expect(container.querySelectorAll('p')).toHaveLength(1); // the eyebrow only
  });

  it('renders an action beside the title', () => {
    render(
      <PageHeader
        eyebrow="Authoring"
        title="Your challenges"
        action={<button type="button">New challenge</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'New challenge' })).toBeInTheDocument();
  });
});
