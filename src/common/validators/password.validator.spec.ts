import { isCommonPassword, MIN_PASSWORD_LENGTH } from './password.validator';

describe('isCommonPassword', () => {
  it.each([
    'password',
    'Password123',
    '12345678',
    'qwerty123',
    'vietnam123',
    '  Admin123  ',
  ])('rejects %s', (password) => {
    expect(isCommonPassword(password)).toBe(true);
  });

  it.each(['Tr0ub4dor&3', 'vi-et-nam-2026', 'KhoaHoc@2026'])(
    'accepts %s',
    (password) => {
      expect(isCommonPassword(password)).toBe(false);
    },
  );
});

describe('MIN_PASSWORD_LENGTH', () => {
  it('is at least 8 characters', () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
  });
});
