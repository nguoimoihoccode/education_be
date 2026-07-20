import { decryptSecret, encryptSecret } from './ai-crypto.util';

describe('ai-crypto.util', () => {
  const key = Buffer.alloc(32, 7).toString('base64'); // 32 bytes base64

  it('round-trips a secret', () => {
    const sealed = encryptSecret('gsk_test_secret', key);
    expect(sealed).not.toContain('gsk_test_secret');
    expect(decryptSecret(sealed, key)).toBe('gsk_test_secret');
  });

  it('throws on wrong key', () => {
    const sealed = encryptSecret('secret', key);
    const other = Buffer.alloc(32, 9).toString('base64');
    expect(() => decryptSecret(sealed, other)).toThrow();
  });
});
