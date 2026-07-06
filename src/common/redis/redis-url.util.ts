/**
 * Render Redis (y otros managed) solo soportan DB 0.
 * URLs tipo redis://host:6379/22 provocan ERR Only 0th database is supported.
 */
export function normalizeRedisUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.pathname = '/0';
    return parsed.toString();
  } catch {
    return rawUrl.replace(/\/\d+$/, '/0');
  }
}
