/**
 * Unit tests for the Brewnet confusion-free password generator.
 *
 * @see packages/cli/src/utils/password.ts
 */

import { generatePassword } from '../../../../packages/cli/src/utils/password.js';

// ---------------------------------------------------------------------------
// Character sets — must match the source module exactly
// ---------------------------------------------------------------------------
const LOWERCASE = 'abcdefghijkmnpqrstuvwxyz'; // 24 chars (no 'l', 'o')
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 24 chars (no 'I', 'O')
const DIGITS = '23456789'; // 8 chars (no '0', '1')
const FULL_CHARSET = LOWERCASE + UPPERCASE + DIGITS; // 56 chars

const EXCLUDED_CHARS = ['0', '1', 'I', 'O', 'o', 'l'];

// ---------------------------------------------------------------------------
// Charset invariants
// ---------------------------------------------------------------------------
describe('generatePassword — charset', () => {
  it('lowercase subset has exactly 24 characters (excludes "l" and "o")', () => {
    expect(LOWERCASE).toHaveLength(24);
    expect(LOWERCASE).not.toContain('o');

    // Verify it contains every lowercase letter except 'o' and 'l'
    for (let c = 97; c <= 122; c++) {
      const ch = String.fromCharCode(c);
      if (ch === 'o' || ch === 'l') {
        expect(LOWERCASE).not.toContain(ch);
      } else {
        expect(LOWERCASE).toContain(ch);
      }
    }
  });

  it('uppercase subset has exactly 24 characters (A-H, J-N, P-Z — excludes "I", "O")', () => {
    expect(UPPERCASE).toHaveLength(24);
    expect(UPPERCASE).not.toContain('I');
    expect(UPPERCASE).not.toContain('O');

    for (let c = 65; c <= 90; c++) {
      const ch = String.fromCharCode(c);
      if (ch === 'I' || ch === 'O') {
        expect(UPPERCASE).not.toContain(ch);
      } else {
        expect(UPPERCASE).toContain(ch);
      }
    }
  });

  it('digit subset has exactly 8 characters (2-9 — excludes "0", "1")', () => {
    expect(DIGITS).toHaveLength(8);
    expect(DIGITS).not.toContain('0');
    expect(DIGITS).not.toContain('1');

    for (let d = 2; d <= 9; d++) {
      expect(DIGITS).toContain(String(d));
    }
  });

  it('full charset has exactly 56 characters (24 + 24 + 8)', () => {
    expect(FULL_CHARSET).toHaveLength(56);
  });
});

// ---------------------------------------------------------------------------
// Default length
// ---------------------------------------------------------------------------
describe('generatePassword — default length', () => {
  it('returns a 16-character password when called with no arguments', () => {
    const pw = generatePassword();
    expect(pw).toHaveLength(16);
  });
});

// ---------------------------------------------------------------------------
// Custom length
// ---------------------------------------------------------------------------
describe('generatePassword — custom length', () => {
  it.each([1, 4, 8, 16, 20, 32, 64, 128])(
    'generates a password of length %i',
    (len) => {
      const pw = generatePassword(len);
      expect(pw).toHaveLength(len);
    },
  );

  it('generates a 20-character password for admin use', () => {
    const pw = generatePassword(20);
    expect(pw).toHaveLength(20);
  });
});

// ---------------------------------------------------------------------------
// Confusion-free characters only
// ---------------------------------------------------------------------------
describe('generatePassword — confusion-free charset enforcement', () => {
  it('never contains excluded characters (0, 1, I, O, o, l)', () => {
    // Generate many passwords to increase confidence
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword(32);
      for (const ch of EXCLUDED_CHARS) {
        expect(pw).not.toContain(ch);
      }
    }
  });

  it('every character belongs to the allowed charset', () => {
    const charsetSet = new Set(FULL_CHARSET);
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword(32);
      for (const ch of pw) {
        expect(charsetSet.has(ch)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// RangeError for invalid length
// ---------------------------------------------------------------------------
describe('generatePassword — validation', () => {
  it('throws RangeError when length is 0', () => {
    expect(() => generatePassword(0)).toThrow(RangeError);
    expect(() => generatePassword(0)).toThrow('Password length must be at least 1');
  });

  it('throws RangeError when length is negative', () => {
    expect(() => generatePassword(-1)).toThrow(RangeError);
    expect(() => generatePassword(-100)).toThrow(RangeError);
  });

  it('does NOT throw for length = 1', () => {
    expect(() => generatePassword(1)).not.toThrow();
    expect(generatePassword(1)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Uniqueness (statistical)
// ---------------------------------------------------------------------------
describe('generatePassword — uniqueness', () => {
  it('produces distinct passwords across 100 consecutive calls', () => {
    const passwords = new Set<string>();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      passwords.add(generatePassword());
    }

    // With 57^16 possible passwords, collisions in 100 tries are
    // astronomically unlikely. We allow at most 1 duplicate to
    // avoid flaky failures from cosmic-ray bit-flips.
    expect(passwords.size).toBeGreaterThanOrEqual(iterations - 1);
  });

  it('two successive calls return different passwords', () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Character-type mix (statistical)
// ---------------------------------------------------------------------------
describe('generatePassword — character-type distribution', () => {
  const lowercaseSet = new Set(LOWERCASE);
  const uppercaseSet = new Set(UPPERCASE);
  const digitSet = new Set(DIGITS);

  /**
   * For a 16-char password drawn uniformly from 57 chars:
   *   P(lowercase) ~= 25/57 ~= 0.439
   *   P(uppercase) ~= 24/57 ~= 0.421
   *   P(digit)     ~= 8/57  ~= 0.140
   *
   * The probability of a 16-char password containing NO characters
   * of a given type is very small (e.g. no digits: (49/57)^16 ~ 0.045).
   * Over 50 iterations the chance of ALL 50 missing a type is negligible.
   */
  it('includes at least one lowercase letter in most generated passwords', () => {
    let hasLowerCount = 0;
    const trials = 50;

    for (let i = 0; i < trials; i++) {
      const pw = generatePassword();
      if ([...pw].some((ch) => lowercaseSet.has(ch))) {
        hasLowerCount++;
      }
    }

    // Expect at least 90% to contain lowercase
    expect(hasLowerCount).toBeGreaterThanOrEqual(Math.floor(trials * 0.9));
  });

  it('includes at least one uppercase letter in most generated passwords', () => {
    let hasUpperCount = 0;
    const trials = 50;

    for (let i = 0; i < trials; i++) {
      const pw = generatePassword();
      if ([...pw].some((ch) => uppercaseSet.has(ch))) {
        hasUpperCount++;
      }
    }

    expect(hasUpperCount).toBeGreaterThanOrEqual(Math.floor(trials * 0.9));
  });

  it('includes at least one digit in most generated passwords', () => {
    let hasDigitCount = 0;
    const trials = 50;

    for (let i = 0; i < trials; i++) {
      const pw = generatePassword();
      if ([...pw].some((ch) => digitSet.has(ch))) {
        hasDigitCount++;
      }
    }

    // Digits are rarer (8/57), so we lower the threshold to 80%
    expect(hasDigitCount).toBeGreaterThanOrEqual(Math.floor(trials * 0.8));
  });

  it('a batch of 20 passwords collectively uses all three character types', () => {
    let seenLower = false;
    let seenUpper = false;
    let seenDigit = false;

    for (let i = 0; i < 20; i++) {
      const pw = generatePassword();
      for (const ch of pw) {
        if (lowercaseSet.has(ch)) seenLower = true;
        if (uppercaseSet.has(ch)) seenUpper = true;
        if (digitSet.has(ch)) seenDigit = true;
      }
      if (seenLower && seenUpper && seenDigit) break;
    }

    expect(seenLower).toBe(true);
    expect(seenUpper).toBe(true);
    expect(seenDigit).toBe(true);
  });
});
