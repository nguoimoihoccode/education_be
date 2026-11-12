import { registerDecorator, ValidationOptions } from 'class-validator';

/** Short enough to remember, long enough that guessing is not free. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * bcrypt hashes only the first 72 bytes; anything past that is silently
 * ignored, so two different long passwords would authenticate each other.
 */
export const MAX_PASSWORD_LENGTH = 72;

/**
 * The passwords that top every breach corpus, lowercase, no duplicates. Proof
 * against a real list means a network call (HaveIBeenPwned) or a much larger
 * file; this catches the ones a person actually types when told "at least 8".
 */
const COMMON_PASSWORDS = new Set([
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '111111',
  '11111111',
  '000000',
  '00000000',
  '121212',
  '112233',
  '123123',
  '123321',
  '654321',
  '666666',
  '777777',
  '7777777',
  '888888',
  '999999',
  '12121212',
  '159753',
  '131313',
  'password',
  'password1',
  'password12',
  'password123',
  'password1234',
  'passw0rd',
  'p@ssw0rd',
  'qwerty',
  'qwerty12',
  'qwerty123',
  'qwertyui',
  'qwertyuiop',
  'qazwsx',
  '1qaz2wsx',
  'zxcvbnm',
  'asdfgh',
  'asdfghjkl',
  'abc123',
  'abc12345',
  'abcd1234',
  'a1b2c3d4',
  'admin',
  'admin123',
  'administrator',
  'root',
  'toor',
  'welcome',
  'welcome1',
  'welcome123',
  'letmein',
  'letmein1',
  'iloveyou',
  'iloveyou1',
  'monkey',
  'monkey123',
  'dragon',
  'master',
  'shadow',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'basketball',
  'soccer',
  'hockey',
  'batman',
  'superman',
  'starwars',
  'whatever',
  'trustno1',
  'jordan23',
  'michael',
  'jennifer',
  'jessica',
  'charlie',
  'michelle',
  'daniel123',
  'matthew',
  'thomas',
  'robert',
  'andrew',
  'summer2024',
  'summer2025',
  'spring2025',
  'vietnam',
  'vietnam123',
  'matkhau',
  'matkhau123',
  'maytinh',
  'tinhoc123',
  'hocsinh',
  'giaovien',
  'truonghoc',
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has((password || '').trim().toLowerCase());
}

/**
 * Rejects the passwords above. Exact matches only -- this is the second fence
 * next to MinLength, not a strength meter.
 */
export function IsNotCommonPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isNotCommonPassword',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Password is too common; choose something harder to guess',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          return typeof value !== 'string' || !isCommonPassword(value);
        },
      },
    });
  };
}
