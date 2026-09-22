/**
 * Shared low-level helpers for the knowledge index. Both exist for the same
 * reason: their values end up bound against columns Postgres types strictly, so
 * a malformed one fails at runtime as a query error rather than at build time.
 */

/**
 * pgvector has no TypeORM column type, so a vector is written as its literal
 * text form and cast in SQL (`$1::vector`). Depending on Postgres to infer the
 * cast from the target column would work for an INSERT and silently not for
 * other shapes, so the cast is always explicit.
 */
export const formatVector = (vector: number[] | null): string | null =>
  vector ? `[${vector.join(',')}]` : null;

/**
 * `Lesson.id` is a uuid column, and lesson ids reach the server from the client
 * (a query param, a conversation row written before validation existed). A
 * non-uuid has to be rejected before it becomes an invalid-uuid query error on
 * every message of a conversation.
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
