/**
 * Unit tests for Brewnet CLI validation helpers.
 *
 * @module tests/unit/cli/utils/validation
 */

import {
  validateProjectName,
  validateDomainName,
  validateTunnelToken,
  validateFreeDomainTld,
} from '../../../../packages/cli/src/utils/validation.js';

// ---------------------------------------------------------------------------
// validateProjectName
// ---------------------------------------------------------------------------

describe('validateProjectName', () => {
  describe('valid names', () => {
    it.each([
      'my-server',
      'ab',
      'a1',
      'homelab',
      'my-home-server',
      'server123',
      '0a',
      'a'.repeat(63),
    ])('accepts "%s"', (name) => {
      expect(validateProjectName(name)).toEqual({ valid: true });
    });
  });

  describe('empty / missing input', () => {
    it('rejects empty string', () => {
      const result = validateProjectName('');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });

    it('rejects non-string input (undefined cast)', () => {
      const result = validateProjectName(undefined as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });

    it('rejects non-string input (number cast)', () => {
      const result = validateProjectName(123 as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });
  });

  describe('length constraints', () => {
    it('rejects single character (too short)', () => {
      const result = validateProjectName('a');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/at least 2/);
    });

    it('rejects names longer than 63 characters', () => {
      const result = validateProjectName('a'.repeat(64));
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/at most 63/);
    });
  });

  describe('start / end character rules', () => {
    it('rejects name starting with a hyphen', () => {
      const result = validateProjectName('-server');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/must start with/);
    });

    it('rejects name ending with a hyphen', () => {
      const result = validateProjectName('server-');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/must end with/);
    });
  });

  describe('character set rules', () => {
    it('rejects uppercase letters', () => {
      const result = validateProjectName('MyServer');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/lowercase/);
    });

    it('rejects spaces', () => {
      const result = validateProjectName('my server');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects special characters (underscore)', () => {
      const result = validateProjectName('my_server');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/lowercase letters.*digits.*hyphens/);
    });

    it('rejects special characters (dot)', () => {
      const result = validateProjectName('my.server');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects emoji', () => {
      const result = validateProjectName('my-server-🚀');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('consecutive hyphens', () => {
    it('rejects names with double hyphens', () => {
      const result = validateProjectName('my--server');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/consecutive hyphens/);
    });

    it('rejects names with triple hyphens', () => {
      const result = validateProjectName('my---server');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/consecutive hyphens/);
    });
  });
});

// ---------------------------------------------------------------------------
// validateDomainName
// ---------------------------------------------------------------------------

describe('validateDomainName', () => {
  describe('valid domains', () => {
    it.each([
      'example.com',
      'sub.example.com',
      'my-server.example.co',
      'deep.sub.domain.example.org',
      'a1.io',
      'xn--nxasmq6b.example.com', // punycode-style label
    ])('accepts "%s"', (domain) => {
      expect(validateDomainName(domain)).toEqual({ valid: true });
    });
  });

  describe('empty / missing input', () => {
    it('rejects empty string', () => {
      const result = validateDomainName('');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });

    it('rejects non-string input', () => {
      const result = validateDomainName(null as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });
  });

  describe('label count', () => {
    it('rejects single label with no TLD', () => {
      const result = validateDomainName('localhost');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/at least two labels/);
    });
  });

  describe('overall length', () => {
    it('rejects domains longer than 253 characters', () => {
      // Build a domain that exceeds 253 chars: many "a." labels + "com"
      const longDomain = ('a'.repeat(50) + '.').repeat(5) + 'com'; // 50*5 + 5 dots + 3 = 258
      const result = validateDomainName(longDomain);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/at most 253/);
    });
  });

  describe('label validation', () => {
    it('rejects label starting with a hyphen', () => {
      const result = validateDomainName('-bad.com');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid label/i);
    });

    it('rejects label ending with a hyphen', () => {
      const result = validateDomainName('bad-.com');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid label/i);
    });

    it('rejects empty label (consecutive dots)', () => {
      const result = validateDomainName('example..com');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/empty labels/);
    });

    it('rejects label exceeding 63 characters', () => {
      const longLabel = 'a'.repeat(64) + '.com';
      const result = validateDomainName(longLabel);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid label/i);
    });
  });

  describe('TLD validation', () => {
    it('rejects numeric TLD', () => {
      const result = validateDomainName('example.123');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid TLD/i);
    });

    it('rejects single-character TLD', () => {
      const result = validateDomainName('example.a');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid TLD/i);
    });

    it('rejects TLD with hyphen', () => {
      const result = validateDomainName('example.co-m');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid TLD/i);
    });
  });

  describe('spaces and special characters', () => {
    it('rejects domain with spaces', () => {
      const result = validateDomainName('my domain.com');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects domain with underscores', () => {
      const result = validateDomainName('my_domain.com');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// validateTunnelToken
// ---------------------------------------------------------------------------

describe('validateTunnelToken', () => {
  // A realistic-looking fake JWT token (>50 chars, starts with eyJ, valid base64url chars)
  const VALID_TOKEN =
    'eyJhIjoiYjEyMzQ1Njc4OTAiLCJ0IjoiYWJjZGVmZy1oaWprbG1uby1wcXJzdHV2In0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_here';

  describe('valid tokens', () => {
    it('accepts a well-formed JWT-like token', () => {
      expect(validateTunnelToken(VALID_TOKEN)).toEqual({ valid: true });
    });

    it('accepts token with underscores and hyphens (base64url)', () => {
      const token = 'eyJ' + 'A-B_C='.repeat(10) + 'abcdef';
      expect(validateTunnelToken(token)).toEqual({ valid: true });
    });
  });

  describe('empty / missing input', () => {
    it('rejects empty string', () => {
      const result = validateTunnelToken('');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });

    it('rejects non-string input', () => {
      const result = validateTunnelToken(undefined as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });
  });

  describe('prefix validation', () => {
    it('rejects token not starting with "eyJ"', () => {
      const result = validateTunnelToken('abc' + 'x'.repeat(50));
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/must start with "eyJ"/);
    });

    it('rejects token starting with lowercase "eyj"', () => {
      const result = validateTunnelToken('eyj' + 'x'.repeat(50));
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/must start with "eyJ"/);
    });
  });

  describe('length validation', () => {
    it('rejects token shorter than 50 characters', () => {
      const result = validateTunnelToken('eyJ' + 'a'.repeat(10));
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/too short/);
    });

    it('accepts token with exactly 50 characters', () => {
      const token = 'eyJ' + 'a'.repeat(47);
      expect(validateTunnelToken(token)).toEqual({ valid: true });
    });
  });

  describe('character validation', () => {
    it('rejects token with spaces', () => {
      const result = validateTunnelToken('eyJ' + 'a'.repeat(44) + ' ab');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/invalid characters/i);
    });

    it('rejects token with special characters', () => {
      const result = validateTunnelToken('eyJ' + 'a'.repeat(44) + '!@#');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/invalid characters/i);
    });
  });
});

// ---------------------------------------------------------------------------
// validateFreeDomainTld
// ---------------------------------------------------------------------------

describe('validateFreeDomainTld', () => {
  describe('accepted TLDs', () => {
    it.each(['.dpdns.org', '.qzz.io', '.us.kg'])(
      'accepts "%s"',
      (tld) => {
        expect(validateFreeDomainTld(tld)).toEqual({ valid: true });
      },
    );

    it('accepts TLD without leading dot (auto-normalized)', () => {
      expect(validateFreeDomainTld('dpdns.org')).toEqual({ valid: true });
      expect(validateFreeDomainTld('qzz.io')).toEqual({ valid: true });
      expect(validateFreeDomainTld('us.kg')).toEqual({ valid: true });
    });
  });

  describe('rejected TLDs', () => {
    it.each(['.com', '.org', '.io', '.net', '.example.com', '.xyz', '.free.domain'])(
      'rejects "%s"',
      (tld) => {
        const result = validateFreeDomainTld(tld);
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/Invalid free domain TLD/i);
        expect(result.error).toMatch(/Allowed values/);
      },
    );

    it('rejects arbitrary string', () => {
      const result = validateFreeDomainTld('random-tld');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid free domain TLD/i);
    });
  });

  describe('empty / missing input', () => {
    it('rejects empty string', () => {
      const result = validateFreeDomainTld('');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });

    it('rejects non-string input', () => {
      const result = validateFreeDomainTld(null as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });
  });
});
