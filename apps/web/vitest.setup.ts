import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Unmounts between tests.
 *
 * Testing Library renders into a container it appends to `document.body`, and
 * without this they accumulate — so a query like "the listbox" starts matching
 * two elements and fails for a reason that has nothing to do with the assertion.
 */
afterEach(cleanup);

/*
 * jsdom implements no layout, so `scrollIntoView` does not exist on Element.
 *
 * The components call it to keep a highlighted row visible in a long list —
 * behaviour that cannot be asserted without layout anyway. Stubbed rather than
 * guarded at the call site: adding an `if (typeof … === 'function')` to
 * production code to satisfy a test environment is the wrong direction.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
