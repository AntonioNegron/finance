// Password hashing (scrypt, Node's built-in standard slow hash) and lockout.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Format: scrypt$<log2 N>$<r>$<p>$<salt b64url>$<hash b64url>
const LOG_N = 15, R = 8, P = 1, KEYLEN = 32;
const MAXMEM = 128 * 1024 * 1024;

function derive(password: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEYLEN, { N: 2 ** logN, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, LOG_N, R, P);
  return ['scrypt', LOG_N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await derive(password, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * After MAX_FAILS wrong passwords in a row, refuse every login attempt for
 * LOCK_MS. Global (one user; behind Caddy every request has the same address).
 */
export const MAX_FAILS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export class Lockout {
  private fails = 0;
  private until = 0;
  locked(now = Date.now()) {
    return now < this.until;
  }
  /** Returns true if this failure started a lockout. */
  fail(now = Date.now()) {
    this.fails++;
    if (this.fails >= MAX_FAILS) {
      this.fails = 0;
      this.until = now + LOCK_MS;
      return true;
    }
    return false;
  }
  success() {
    this.fails = 0;
  }
}
