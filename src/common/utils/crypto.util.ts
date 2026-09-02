import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'crypto';

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Código numérico de 6 dígitos para verificación de email (000000–999999). */
export function randomVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function normalizeVerificationCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fromUrl = trimmed.match(/[?&](?:code|token)=([^&\s#]+)/i)?.[1];
  const decoded = fromUrl
    ? decodeURIComponent(fromUrl.replace(/\+/g, '%20'))
    : trimmed;
  const digits = decoded.replace(/\D/g, '');
  return digits.length === 6 ? digits : null;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
