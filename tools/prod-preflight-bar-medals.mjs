/**
 * @deprecated Use `tools/bar-medal-db-check.mjs` (preflight mode).
 * Kept so old docs/scripts keep working.
 */
process.env.BAR_MEDAL_CHECK_MODE = process.env.BAR_MEDAL_CHECK_MODE || 'preflight';
await import('./bar-medal-db-check.mjs');
