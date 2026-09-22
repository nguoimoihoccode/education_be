/**
 * Pure rendering of retrieved chunks into the prompt's reference block. Kept in
 * `domain/` with a spec like the other policies, and free of Nest/TypeORM, so the
 * budget behaviour can be tested without a database or a provider.
 */

export const REFERENCE_OPEN = '=== TRÍCH ĐOẠN THAM KHẢO TỪ KHOÁ HỌC ===';
export const REFERENCE_CLOSE = '=== HẾT TRÍCH ĐOẠN ===';

/**
 * Ceiling on the reference block. The chunk count is capped too, but six chunks
 * of the maximum chunk size would still be a far larger block than any lesson
 * context — past a point, more source material makes the answer worse, not
 * better, because the actual question loses salience among it.
 */
export const REFERENCE_CHAR_BUDGET = 4000;

export interface ReferenceChunk {
  title: string;
  content: string;
}

/**
 * The labelled source block, or null when nothing fits. Chunks arrive already
 * ordered by distance, so the budget is spent on the closest ones first and the
 * block is dropped entirely rather than emitted empty — an empty header would
 * tell the model material was supplied when none was.
 *
 * A chunk too large to fit is skipped rather than ending the block: one long
 * chunk at the top would otherwise hide every shorter, still-relevant match
 * behind it, and the learner would be told the material does not cover a
 * question the corpus does in fact answer.
 */
export const renderReferenceBlock = (
  chunks: ReferenceChunk[],
): string | null => {
  const kept: string[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const entry = `[${chunk.title}]\n${chunk.content}`;
    if (used + entry.length > REFERENCE_CHAR_BUDGET) {
      continue;
    }
    kept.push(entry);
    used += entry.length;
  }

  if (kept.length === 0) {
    return null;
  }

  return [REFERENCE_OPEN, ...kept, REFERENCE_CLOSE].join('\n\n');
};
