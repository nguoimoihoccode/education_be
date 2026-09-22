import { ServiceUnavailableException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Lesson } from '../education/entities/lesson.entity';
import { Vocabulary } from '../education/entities/vocabulary.entity';
import { contentHash } from './domain/knowledge-chunking.policy';
import { EmbeddingService } from './embedding.service';
import { AiKnowledgeChunk } from './entities/ai-knowledge-chunk.entity';
import { KnowledgeIndexService } from './knowledge-index.service';

const LESSON_ID = '11111111-1111-4111-8111-111111111111';
const COURSE_ID = '33333333-3333-4333-8333-333333333333';

/** Two sentences, so the lesson chunks into at least one unit. */
const CONTENT = '<p>Câu một. Câu hai.</p>';

/** The plain text chunking produces for CONTENT, and what gets embedded. */
const PLAIN = 'Câu một. Câu hai.';

/** The hash a freshly indexed copy of CONTENT would carry. */
const CURRENT_HASH = contentHash(PLAIN);

describe('KnowledgeIndexService', () => {
  let chunksRepo: {
    find: jest.Mock;
    delete: jest.Mock;
    query: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let lessonsRepo: { findOne: jest.Mock; find: jest.Mock };
  let vocabulariesRepo: { find: jest.Mock };
  let embedding: { embed: jest.Mock; isConfigured: jest.Mock };
  let txQuery: jest.Mock;
  let service: KnowledgeIndexService;

  const lesson = (overrides: Partial<Lesson> = {}) =>
    ({
      id: LESSON_ID,
      courseId: COURSE_ID,
      title: 'Thì hiện tại tiếp diễn',
      content: CONTENT,
      active: true,
      ...overrides,
    }) as Lesson;

  const storedChunk = (
    overrides: Partial<AiKnowledgeChunk> = {},
  ): AiKnowledgeChunk =>
    ({
      id: 'chunk-1',
      sourceType: 'lesson',
      lessonId: LESSON_ID,
      courseId: COURSE_ID,
      chunkIndex: 0,
      title: 'Thì hiện tại tiếp diễn',
      content: PLAIN,
      contentHash: CURRENT_HASH,
      embeddedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    }) as AiKnowledgeChunk;

  beforeEach(() => {
    txQuery = jest.fn().mockResolvedValue(undefined);
    chunksRepo = {
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      query: jest.fn().mockResolvedValue([]),
      manager: {
        transaction: jest.fn(async (cb: (m: unknown) => Promise<void>) =>
          cb({ query: txQuery }),
        ),
      },
    };
    lessonsRepo = {
      findOne: jest.fn().mockResolvedValue(lesson()),
      find: jest.fn().mockResolvedValue([{ id: LESSON_ID }]),
    };
    vocabulariesRepo = { find: jest.fn().mockResolvedValue([]) };
    embedding = {
      embed: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
      isConfigured: jest.fn().mockResolvedValue(true),
    };

    service = new KnowledgeIndexService(
      chunksRepo as unknown as Repository<AiKnowledgeChunk>,
      lessonsRepo as unknown as Repository<Lesson>,
      vocabulariesRepo as unknown as Repository<Vocabulary>,
      embedding as unknown as EmbeddingService,
    );
  });

  describe('reindexLesson', () => {
    it('embeds and writes the lesson body', async () => {
      const result = await service.reindexLesson(LESSON_ID);

      expect(result.chunks).toBe(1);
      expect(result.embedded).toBe(1);
      expect(embedding.embed).toHaveBeenCalledWith([PLAIN]);
      expect(txQuery).toHaveBeenCalledTimes(1);
      expect(txQuery.mock.calls[0][0]).toContain(
        'INSERT INTO ai_knowledge_chunks',
      );
    });

    it('writes the vector as a literal cast to vector', async () => {
      await service.reindexLesson(LESSON_ID);

      const params = txQuery.mock.calls[0][1];
      expect(params).toContain('[0.1,0.2,0.3]');
      expect(txQuery.mock.calls[0][0]).toContain('$8::vector');
    });

    // Indexing is what makes the corpus cost money, so unchanged text must not be
    // re-embedded — that is what allows the nightly full sweep to be affordable.
    it('keeps the stored vector when the content hash is unchanged', async () => {
      chunksRepo.find.mockResolvedValue([storedChunk()]);

      const result = await service.reindexLesson(LESSON_ID);

      expect(result.embedded).toBe(0);
      expect(embedding.embed).not.toHaveBeenCalled();
      // The row is still upserted, but with a null vector: the SQL's COALESCE is
      // what keeps the stored one, so the chunk stays retrievable.
      expect((txQuery.mock.calls[0][1] as unknown[])[7]).toBeNull();
      expect(txQuery.mock.calls[0][0]).toContain('COALESCE(EXCLUDED.embedding');
    });

    it('re-embeds when the content changed', async () => {
      chunksRepo.find.mockResolvedValue([
        storedChunk({ contentHash: 'a-hash-from-the-old-text' }),
      ]);

      const result = await service.reindexLesson(LESSON_ID);

      expect(result.embedded).toBe(1);
      expect(embedding.embed).toHaveBeenCalled();
    });

    // A run that died between writing the chunk and storing its vector leaves the
    // right hash with no vector. Skipping on hash alone would strand it forever.
    it('re-embeds a chunk that has no stored vector yet', async () => {
      chunksRepo.find.mockResolvedValue([storedChunk({ embeddedAt: null })]);

      const result = await service.reindexLesson(LESSON_ID);

      expect(result.embedded).toBe(1);
      expect(embedding.embed).toHaveBeenCalled();
    });

    // The hash is identical after a model change, so without `force` the corpus
    // would keep vectors that no longer share a space with new query vectors.
    it('re-embeds unchanged content when forced', async () => {
      chunksRepo.find.mockResolvedValue([storedChunk()]);

      const result = await service.reindexLesson(LESSON_ID, { force: true });

      expect(result.embedded).toBe(1);
      expect(embedding.embed).toHaveBeenCalled();
    });

    it('removes its own chunks when the lesson is deactivated', async () => {
      lessonsRepo.findOne.mockResolvedValue(lesson({ active: false }));
      chunksRepo.delete.mockResolvedValue({ affected: 2 });

      const result = await service.reindexLesson(LESSON_ID);

      expect(chunksRepo.delete).toHaveBeenCalledWith({ lessonId: LESSON_ID });
      expect(result.removed).toBe(2);
      expect(embedding.embed).not.toHaveBeenCalled();
    });

    it('removes its own chunks when the lesson is gone', async () => {
      lessonsRepo.findOne.mockResolvedValue(null);

      await service.reindexLesson(LESSON_ID);

      expect(chunksRepo.delete).toHaveBeenCalledWith({ lessonId: LESSON_ID });
    });

    // An id that cannot exist must not reach the query at all.
    it('does nothing for a lesson id that is not a uuid', async () => {
      const result = await service.reindexLesson('not-a-uuid');

      expect(result).toEqual({
        lessonId: 'not-a-uuid',
        chunks: 0,
        embedded: 0,
        removed: 0,
      });
      expect(lessonsRepo.findOne).not.toHaveBeenCalled();
      expect(chunksRepo.delete).not.toHaveBeenCalled();
    });

    // A lesson whose text got shorter would otherwise keep an orphan tail that
    // still answers questions with text the lesson no longer contains.
    it('deletes the chunks the lesson no longer has', async () => {
      chunksRepo.find.mockResolvedValue([
        storedChunk({ id: 'keep-me', chunkIndex: 0 }),
        storedChunk({ id: 'drop-me', chunkIndex: 7 }),
      ]);

      const result = await service.reindexLesson(LESSON_ID);

      expect(result.removed).toBe(1);
      const [sql, params] = txQuery.mock.calls[0];
      expect(sql).toContain('DELETE FROM ai_knowledge_chunks WHERE id = ANY');
      // One parameter holding the whole id array, matching `$1::uuid[]`.
      expect(params).toEqual([['drop-me']]);
    });

    it('indexes the lesson vocabulary alongside its body', async () => {
      vocabulariesRepo.find.mockResolvedValue([
        {
          word: 'đang',
          meaning: 'in progress',
          partOfSpeech: 'adverb',
          example: null,
          exampleTranslation: null,
          notes: null,
        },
      ]);
      embedding.embed.mockResolvedValue([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]);

      const result = await service.reindexLesson(LESSON_ID);

      expect(result.chunks).toBe(2);
      const sourceTypes = txQuery.mock.calls.map(
        (call) => (call[1] as unknown[])[0],
      );
      expect(sourceTypes).toEqual(['lesson', 'vocabulary']);
      expect(embedding.embed).toHaveBeenCalledWith([
        PLAIN,
        'đang (adverb) — in progress',
      ]);
    });
  });

  describe('reindexAll', () => {
    it('walks every active lesson', async () => {
      lessonsRepo.find.mockResolvedValue([
        { id: LESSON_ID },
        { id: '22222222-2222-4222-8222-222222222222' },
      ]);
      embedding.embed.mockResolvedValue([[0.1, 0.2, 0.3]]);

      const summary = await service.reindexAll();

      expect(lessonsRepo.find).toHaveBeenCalledWith({
        where: { active: true },
        select: { id: true },
      });
      expect(summary.lessons).toBe(2);
      expect(summary.chunks).toBe(2);
    });

    // Reporting success while embedding nothing would leave the index empty and
    // the failure invisible.
    it('refuses to run with no embedding provider configured', async () => {
      embedding.isConfigured.mockResolvedValue(false);

      await expect(service.reindexAll()).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(lessonsRepo.find).not.toHaveBeenCalled();
    });

    // The sweep is the nightly safety net; finishing most of the corpus is worth
    // more than stopping at the first lesson the provider rejected.
    it('continues past a lesson that fails and counts it', async () => {
      lessonsRepo.find.mockResolvedValue([
        { id: LESSON_ID },
        { id: '22222222-2222-4222-8222-222222222222' },
      ]);
      let call = 0;
      embedding.embed.mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          throw new Error('provider exploded');
        }
        return [[0.1, 0.2, 0.3]];
      });

      const summary = await service.reindexAll();

      expect(summary.failed).toBe(1);
      expect(summary.lessons).toBe(1);
    });

    // A deactivated or deleted lesson is not in the active list, so the loop never
    // visits it — this sweep is the only thing that clears its chunks.
    it('removes chunks whose lesson is gone or inactive', async () => {
      // The loop visits the active lesson; the orphan sweep finds another.
      chunksRepo.query.mockResolvedValue([{ lesson_id: 'orphan-lesson' }]);
      chunksRepo.delete.mockResolvedValue({ affected: 3 });

      const summary = await service.reindexAll();

      const sweepSql = chunksRepo.query.mock.calls[0][0] as string;
      expect(sweepSql).toContain('LEFT JOIN edu_lessons');
      expect(sweepSql).toContain('l.active = true');
      expect(chunksRepo.delete).toHaveBeenCalledWith({
        lessonId: 'orphan-lesson',
      });
      expect(summary.removed).toBe(3);
    });
  });

  describe('status', () => {
    it('aggregates chunk counts, pending rows and last embed time', async () => {
      chunksRepo.query
        .mockResolvedValueOnce([
          { source_type: 'lesson', chunks: 4, embedded: 3 },
          { source_type: 'vocabulary', chunks: 2, embedded: 2 },
        ])
        .mockResolvedValueOnce([
          {
            chunks: 6,
            embedded: 5,
            lessons: 2,
            last_embedded_at: new Date('2026-01-02T03:04:05Z'),
          },
        ]);

      const result = await service.status();

      expect(result).toEqual({
        embeddingConfigured: true,
        lessons: 2,
        chunks: 6,
        embedded: 5,
        pending: 1,
        bySourceType: [
          { sourceType: 'lesson', chunks: 4, embedded: 3, pending: 1 },
          { sourceType: 'vocabulary', chunks: 2, embedded: 2, pending: 0 },
        ],
        lastEmbeddedAt: new Date('2026-01-02T03:04:05Z'),
      });
      // Counts must be cast to int in SQL, or node-postgres returns strings
      // (bare COUNT is bigint) and the FE gets "6" instead of 6.
      const groupedSql = chunksRepo.query.mock.calls[0][0] as string;
      expect(groupedSql).toContain('GROUP BY source_type');
      expect(groupedSql).toContain('::int');
    });

    it('reports an empty, unconfigured index as all zeros', async () => {
      embedding.isConfigured.mockResolvedValue(false);
      chunksRepo.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { chunks: 0, embedded: 0, lessons: 0, last_embedded_at: null },
        ]);

      const result = await service.status();

      expect(result).toEqual({
        embeddingConfigured: false,
        lessons: 0,
        chunks: 0,
        embedded: 0,
        pending: 0,
        bySourceType: [],
        lastEmbeddedAt: null,
      });
    });
  });
});
