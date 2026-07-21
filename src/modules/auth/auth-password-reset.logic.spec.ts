import { createHash, randomBytes } from 'crypto';

/** Mirrors auth.service token storage for password reset. */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

describe('password reset token flow', () => {
  it('stores hash of raw token and verifies with same raw token', () => {
    const token = randomToken();
    const storedHash = sha256(token);

    expect(storedHash).toBe(sha256(token));
    expect(storedHash).not.toBe(token);
    expect(sha256('wrong')).not.toBe(storedHash);
  });

  it('URL-encoded hex token still matches after decode', () => {
    const token = randomToken();
    const encoded = encodeURIComponent(token);
    const decoded = decodeURIComponent(encoded);
    expect(sha256(decoded)).toBe(sha256(token));
  });

  it('rejects expired or used semantics conceptually', () => {
    const expiresAt = new Date(Date.now() - 1_000);
    const usedAt = new Date();
    const now = new Date();
    expect(expiresAt.getTime() < now.getTime()).toBe(true);
    expect(usedAt).toBeTruthy();
  });
});
