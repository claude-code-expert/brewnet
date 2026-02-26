/**
 * Brewnet CLI — Confusion-Free Password Generator (T016)
 *
 * Generates cryptographically random passwords using a charset
 * that excludes visually ambiguous characters:
 *
 *   Lowercase:  a-k, m-n, p-z  (excludes 'l', 'o')
 *   Uppercase:  A-H, J-N, P-Z  (excludes 'I', 'O')
 *   Digits:     2-9  (excludes '0', '1')
 *
 * This prevents user confusion when reading credentials on screen
 * or copying them from terminal output.
 *
 * @module utils/password
 */

import { randomBytes } from 'node:crypto';

/**
 * The confusion-free character set (56 characters).
 *
 * - Lowercase (24): abcdefghijkmnpqrstuvwxyz  (excludes 'l', 'o')
 * - Uppercase (24): ABCDEFGHJKLMNPQRSTUVWXYZ  (excludes 'I', 'O')
 * - Digits     (8): 23456789                  (excludes '0', '1')
 */
const CHARSET =
  'abcdefghijkmnpqrstuvwxyz' +
  'ABCDEFGHJKLMNPQRSTUVWXYZ' +
  '23456789';

const CHARSET_LEN = CHARSET.length; // 56

/**
 * Generate a confusion-free random password.
 *
 * Uses `node:crypto.randomBytes` for cryptographic randomness.
 * Rejection sampling ensures uniform distribution: each random byte
 * is only accepted if it falls within a range that is evenly
 * divisible by the charset length, eliminating modulo bias.
 *
 * @param length - Password length. Defaults to 16, admin passwords use 20.
 * @returns A random password string containing only confusion-free characters.
 *
 * @example
 * ```ts
 * const userPassword = generatePassword();       // 16 chars
 * const adminPassword = generatePassword(20);    // 20 chars
 * ```
 */
export function generatePassword(length: number = 16): string {
  if (length < 1) {
    throw new RangeError('Password length must be at least 1');
  }

  // Largest multiple of CHARSET_LEN that fits in a byte (0-255).
  // For CHARSET_LEN=57: floor(256/57)*57 = 4*57 = 228.
  // Any random byte >= 228 is rejected to avoid modulo bias.
  const limit = Math.floor(256 / CHARSET_LEN) * CHARSET_LEN;

  const result: string[] = [];

  while (result.length < length) {
    // Request a batch of random bytes (over-allocate to minimize iterations)
    const batchSize = Math.max(length - result.length, 32);
    const bytes = randomBytes(batchSize);

    for (let i = 0; i < bytes.length && result.length < length; i++) {
      const byte = bytes[i]!;
      if (byte < limit) {
        result.push(CHARSET[byte % CHARSET_LEN]!);
      }
      // else: reject (modulo bias range) and try the next byte
    }
  }

  return result.join('');
}
