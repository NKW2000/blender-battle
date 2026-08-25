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

/*
 * jsdom implements no media queries, so `matchMedia` is simply absent.
 *
 * Components ask it one question — whether the reader has requested reduced
 * motion — and the honest default for a test environment is "no", because that
 * is the branch the great majority of readers get and therefore the one worth
 * exercising by default. A spec that cares about the other branch overrides
 * this for itself.
 *
 * Stubbed here rather than guarded at the call site: adding a
 * `typeof window.matchMedia === 'function'` check to production code to satisfy
 * a test environment would be letting the harness dictate the source.
 */
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
