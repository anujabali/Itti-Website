/**
 * Form 1 — basic information.
 *
 * The overlay itself is imported directly from its `.astro` file; a TypeScript
 * barrel cannot re-export an Astro component, and pretending otherwise is what
 * made this module fail to typecheck.
 */

export * from './types';
export * from './validation';
export * from './schema';
export * from './cities';
