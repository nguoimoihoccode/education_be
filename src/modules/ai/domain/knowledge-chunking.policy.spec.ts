import {
  CHUNK_MAX_CHARS,
  VOCAB_ITEMS_PER_CHUNK,
  chunkLesson,
  chunkVocabulary,
  contentHash,
  renderVocabularyLine,
} from './knowledge-chunking.policy';

const lesson = (content: string | null, title = 'Bài 1') => ({
  lessonId: 'lesson-1',
  courseId: 'course-1',
  title,
  content,
});

/** Long enough to need more than one chunk, with sentence boundaries to cut on. */
const longLessonText = (sentences: number): string =>
  Array.from(
    { length: sentences },
    (_, i) => `Câu số ${i} giải thích một phần của bài học này.`,
  ).join(' ');

describe('chunkLesson', () => {
  it('produces nothing when the lesson has no usable content', () => {
    expect(chunkLesson(lesson(null))).toEqual([]);
    expect(chunkLesson(lesson(''))).toEqual([]);
    expect(chunkLesson(lesson('<div>  </div>'))).toEqual([]);
  });

  it('indexes lesson content as plain text, not markup', () => {
    const [chunk] = chunkLesson(lesson('<p>Thì hiện tại đơn</p>'));

    expect(chunk.content).toBe('Thì hiện tại đơn');
    expect(chunk.sourceType).toBe('lesson');
    expect(chunk.lessonId).toBe('lesson-1');
    expect(chunk.courseId).toBe('course-1');
    expect(chunk.chunkIndex).toBe(0);
    expect(chunk.title).toBe('Bài 1');
  });

  it('keeps a normal lesson to a single chunk', () => {
    const chunks = chunkLesson(lesson('<p>Một đoạn ngắn.</p>'));

    expect(chunks).toHaveLength(1);
  });

  it('splits a long lesson and numbers the parts', () => {
    const chunks = chunkLesson(lesson(longLessonText(400)));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
    expect(chunks[0].title).toBe('Bài 1 (phần 1)');
    expect(chunks[1].title).toBe('Bài 1 (phần 2)');
  });

  it('never exceeds the chunk budget', () => {
    const chunks = chunkLesson(lesson(longLessonText(400)));

    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    }
  });

  // Without overlap a fact sitting on a boundary is retrievable from neither
  // chunk, which is the classic chunking recall failure.
  it('carries the tail of one chunk into the next', () => {
    const chunks = chunkLesson(lesson(longLessonText(400)));
    const sentences = chunks[0].content.split(/(?<=\.)\s+/);
    const lastSentence = sentences[sentences.length - 1];

    expect(chunks[1].content).toContain(lastSentence);
  });

  it('breaks up a single block that is larger than the budget on its own', () => {
    const oneHugeParagraph = 'x'.repeat(CHUNK_MAX_CHARS * 2 + 500);

    const chunks = chunkLesson(lesson(oneHugeParagraph));

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    }
  });

  it('hashes content so an unchanged lesson can skip re-embedding', () => {
    const first = chunkLesson(lesson('<p>Ổn định</p>'));
    const second = chunkLesson(lesson('<p>Ổn định</p>'));
    const changed = chunkLesson(lesson('<p>Đã sửa</p>'));

    expect(first[0].contentHash).toBe(second[0].contentHash);
    expect(first[0].contentHash).not.toBe(changed[0].contentHash);
    expect(first[0].contentHash).toBe(contentHash('Ổn định'));
  });
});

describe('renderVocabularyLine', () => {
  it('renders word, part of speech, meaning and example', () => {
    expect(
      renderVocabularyLine({
        word: 'book',
        meaning: 'quyển sách',
        partOfSpeech: 'noun',
        example: 'I read a book',
        exampleTranslation: 'Tôi đọc một quyển sách',
      }),
    ).toBe(
      'book (noun) — quyển sách. Ví dụ: I read a book (Tôi đọc một quyển sách)',
    );
  });

  it('omits optional parts instead of leaving placeholders', () => {
    expect(renderVocabularyLine({ word: 'go', meaning: 'đi' })).toBe('go — đi');
  });
});

describe('chunkVocabulary', () => {
  const items = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      word: `word-${i}`,
      meaning: `nghĩa-${i}`,
    }));

  const input = (count: number) => ({
    lessonId: 'lesson-1',
    courseId: 'course-1',
    lessonTitle: 'Bài 1',
    items: items(count),
  });

  it('produces nothing when the lesson has no vocabulary', () => {
    expect(chunkVocabulary(input(0))).toEqual([]);
  });

  it('groups a small word list into one chunk', () => {
    const chunks = chunkVocabulary(input(5));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].sourceType).toBe('vocabulary');
    expect(chunks[0].title).toBe('Từ vựng bài: Bài 1');
    expect(chunks[0].content).toContain('word-0 — nghĩa-0');
  });

  it('splits a long word list into groups', () => {
    const chunks = chunkVocabulary(input(VOCAB_ITEMS_PER_CHUNK * 2 + 1));

    expect(chunks).toHaveLength(3);
    expect(chunks[0].content.split('\n')).toHaveLength(VOCAB_ITEMS_PER_CHUNK);
  });

  it('skips entries that are missing a word or a meaning', () => {
    const chunks = chunkVocabulary({
      lessonId: 'lesson-1',
      courseId: null,
      lessonTitle: 'Bài 1',
      items: [
        { word: 'ok', meaning: 'tốt' },
        { word: '', meaning: 'thiếu từ' },
        { word: 'thiếu nghĩa', meaning: '' },
      ],
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('ok — tốt');
  });
});
