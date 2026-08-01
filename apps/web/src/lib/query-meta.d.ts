import '@tanstack/react-query';

/**
 * Types the `meta` bag React Query passes through to the global cache handlers,
 * so the opt-out in `providers.tsx` is a checked field rather than a string
 * every call site has to spell correctly from memory.
 */
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /**
       * This mutation's failure is rendered next to the control that failed, so
       * the global handler must not also raise a toast for it.
       */
      inlineError?: boolean;
    };
  }
}
