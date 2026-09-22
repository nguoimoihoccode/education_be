import { createHash } from 'crypto';
import { toPlainText } from './plain-text.policy';

/**
 * Pure chunking for the RAG index. Kept free of TypeORM/Nest so it can be
 * unit-tested directly, matching the `education/domain` convention.
 *
 * Chunk identity is `(sourceType, lessonId, chunkIndex)`: a lesson and its
 * vocabulary both belong to one lesson, so the lesson id is the indexing unit
 * and re-indexing a lesson replaces all of its chunks in one delete.
 */

export type KnowledgeSourceType = 'lesson' | 'vocabulary';

export interface KnowledgeChunkDraft {
  sourceType: KnowledgeSourceType;
  lessonId: string;
  courseId: string | null;
  chunkIndex: number;
  title: string;
  content: string;
  contentHash: string;
}

export interface LessonChunkInput {
  lessonId: string;
  courseId: string | null;
  title: string;
  content: string | null | undefined;
}

export interface VocabularyChunkInput {
  lessonId: string;
  courseId: string | null;
  lessonTitle: string;
  items: VocabularyItemInput[];
}

export interface VocabularyItemInput {
  word: string;
  meaning: string;
  partOfSpeech?: string | null;
  example?: string | null;
  exampleTranslation?: string | null;
  notes?: string | null;
}

/** ~800 tokens at roughly 4 characters per token. */
export const CHUNK_MAX_CHARS = 3200;

/** Carried into the next chunk so a fact split across a boundary stays findable. */
export const CHUNK_OVERLAP_CHARS = 400;

/**
 * Vocabulary entries are short; grouping them keeps a chunk a meaningful
 * retrieval unit instead of one embedding per word.
 */
export const VOCAB_ITEMS_PER_CHUNK = 15;

export const contentHash = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

export const renderVocabularyLine = (item: VocabularyItemInput): string => {
  const head = item.partOfSpeech
    ? `${item.word} (${item.partOfSpeech})`
    : item.word;
  const parts = [`${head} — ${item.meaning}`];

  if (item.example) {
    parts.push(
      item.exampleTranslation
        ? `Ví dụ: ${item.example} (${item.exampleTranslation})`
        : `Ví dụ: ${item.example}`,
    );
  }
  if (item.notes) {
    parts.push(`Ghi chú: ${item.notes}`);
  }

  return parts.join('. ');
};

/** Only a sentence that alone exceeds the budget is ever cut mid-sentence. */
const hardSplit = (text: string, max: number): string[] => {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += max) {
    out.push(text.slice(i, i + max));
  }
  return out;
};

const SENTENCE_END = /(?<=[.!?…])\s+/;

/**
 * Flatten plain text into sentence-sized units, none larger than the budget.
 * Splitting on sentences rather than a fixed width matters twice over: a chunk
 * that begins mid-word embeds as noise, and the overlap below can only land on
 * a sentence boundary if the units were sentences to begin with.
 */
const toUnits = (text: string): string[] =>
  text
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s*\n\s*/g, ' ').trim())
    .filter((block) => block.length > 0)
    .flatMap((block) =>
      block
        .split(SENTENCE_END)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 0)
        .flatMap((sentence) =>
          sentence.length <= CHUNK_MAX_CHARS
            ? [sentence]
            : hardSplit(sentence, CHUNK_MAX_CHARS),
        ),
    );

/** Tail of a chunk, sentence-aligned, within the overlap budget. */
const overlapSeed = (chunk: string): string => {
  const tail = chunk.slice(-CHUNK_OVERLAP_CHARS);
  const boundary = tail.search(/[.!?…]\s/);
  return (boundary >= 0 ? tail.slice(boundary + 1) : tail).trim();
};

const buildChunks = (units: string[]): string[] => {
  const chunks: string[] = [];
  let current = '';

  for (const unit of units) {
    const candidate = current ? `${current} ${unit}` : unit;

    if (current && candidate.length > CHUNK_MAX_CHARS) {
      chunks.push(current);
      const seed = overlapSeed(current);
      // The overlap is a recall aid, never a reason to blow the budget, so when
      // both cannot fit it is the overlap that is dropped, not the unit.
      current =
        seed && seed.length + unit.length + 1 <= CHUNK_MAX_CHARS
          ? `${seed} ${unit}`
          : unit;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
};

export const chunkLesson = (input: LessonChunkInput): KnowledgeChunkDraft[] => {
  const text = toPlainText(input.content);
  if (!text) {
    return [];
  }

  const chunks = buildChunks(toUnits(text));

  return chunks.map((content, index) => ({
    sourceType: 'lesson' as const,
    lessonId: input.lessonId,
    courseId: input.courseId,
    chunkIndex: index,
    title:
      chunks.length > 1 ? `${input.title} (phần ${index + 1})` : input.title,
    content,
    contentHash: contentHash(content),
  }));
};

export const chunkVocabulary = (
  input: VocabularyChunkInput,
): KnowledgeChunkDraft[] => {
  const lines = input.items
    .filter((item) => item.word && item.meaning)
    .map(renderVocabularyLine)
    .filter((line) => line.length > 0);

  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += VOCAB_ITEMS_PER_CHUNK) {
    chunks.push(lines.slice(i, i + VOCAB_ITEMS_PER_CHUNK).join('\n'));
  }

  const label = `Từ vựng bài: ${input.lessonTitle}`;

  return chunks.map((content, index) => ({
    sourceType: 'vocabulary' as const,
    lessonId: input.lessonId,
    courseId: input.courseId,
    chunkIndex: index,
    title: chunks.length > 1 ? `${label} (phần ${index + 1})` : label,
    content,
    contentHash: contentHash(content),
  }));
};

/**
 * Everything one lesson contributes to the index: its body plus its vocabulary.
 *
 * Both tiers go through here on purpose. What the tutor is handed for the lesson
 * the learner is already in, and what retrieval can later find for a question
 * asked elsewhere, are then the same units — so neither can drift from the other
 * as chunking changes.
 */
export const chunkLessonCorpus = (input: {
  lesson: LessonChunkInput;
  vocabularies: VocabularyItemInput[];
}): KnowledgeChunkDraft[] => [
  ...chunkLesson(input.lesson),
  ...chunkVocabulary({
    lessonId: input.lesson.lessonId,
    courseId: input.lesson.courseId,
    lessonTitle: input.lesson.title,
    items: input.vocabularies,
  }),
];
