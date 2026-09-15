import { User } from '../users/entities/user.entity';

/**
 * `users.password_hash` has no `select: false`, so any `relations: { user }`
 * load pulls the bcrypt hash into the entity. School endpoints join users
 * (principal, homeroom teacher, assignment teacher) — redact before the
 * response is serialized. Mutates the in-memory entity; callers must not
 * re-save it afterwards.
 */
export function redactUserSecrets(user?: User | null): User | null {
  if (!user) return null;
  delete (user as { passwordHash?: string }).passwordHash;
  return user;
}
