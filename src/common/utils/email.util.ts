/**
 * Emails are matched case-insensitively, the way every mail provider treats
 * them. Storing the raw input let `A@x.com` and `a@x.com` become two accounts,
 * and made a user who typed a different case unable to log in.
 */
export const normalizeEmail = (email: string): string =>
  (email || '').trim().toLowerCase();
