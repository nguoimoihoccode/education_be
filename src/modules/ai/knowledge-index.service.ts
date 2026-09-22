import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Lesson } from '../education/entities/lesson.entity';
import { Vocabulary } from '../education/entities/vocabulary.entity';
import {
  KnowledgeChunkDraft,
  KnowledgeSourceType,
  chunkLessonCorpus,
} from './domain/knowledge-chunking.policy';
import { EmbeddingService } from './embedding.service';
import { AiKnowledgeChunk } from './entities/ai-knowledge-chunk.entity';
import { UUID_PATTERN, formatVector } from './knowledge.util';

/**
 * Writes the embedded corpus the retrieval tier searches. Indexing is scoped to
 * a lesson: a lesson and its vocabulary are one unit, so a rewrite replaces that
 * lesson's chunks without touching any other lesson's.
 */

export interface LessonIndexResult {
  lessonId: string;
  chunks: number;
  embedded: number;
  removed: number;
}

export interface ReindexSummary {
  lessons: number;
  chunks: number;
  embedded: number;
  removed: number;
  failed: number;
}

export interface ReindexOptions {
  /**
   * Re-embed even where the text is unchanged. Needed after the embedding model
   * or its width changes: the content hash is identical, so an incremental run
   * would keep vectors that no longer live in the same space as new queries.
   */
  force?: boolean;
}

/** A lesson holds one chunk per source type and index, so that pair identifies it. */
const chunkKey = (
  sourceType: KnowledgeSourceType,
  chunkIndex: number,
): string => `${sourceType}:${chunkIndex}`;

@Injectable()
export class KnowledgeIndexService {
  private readonly logger = new Logger(KnowledgeIndexService.name);

  constructor(
    @InjectRepository(AiKnowledgeChunk)
    private readonly chunksRepo: Repository<AiKnowledgeChunk>,
    @InjectRepository(Lesson)
    private readonly lessonsRepo: Repository<Lesson>,
    @InjectRepository(Vocabulary)
    private readonly vocabulariesRepo: Repository<Vocabulary>,
    private readonly embedding: EmbeddingService,
  ) {}

  /**
   * Whether indexing can embed anything. Callers that refresh the index from a
   * write path check this first so that a deployment which has not configured an
   * embedding provider yet stays quiet, instead of warning on every lesson save.
   */
  async isConfigured(): Promise<boolean> {
    return this.embedding.isConfigured();
  }

  async reindexLesson(
    lessonId: string,
    options: ReindexOptions = {},
  ): Promise<LessonIndexResult> {
    if (!UUID_PATTERN.test(lessonId)) {
      // Nothing to index and nothing to remove, so this is not worth throwing
      // over — the caller asked about an id that cannot exist.
      return { lessonId, chunks: 0, embedded: 0, removed: 0 };
    }

    const lesson = await this.lessonsRepo.findOne({ where: { id: lessonId } });

    // A deactivated lesson is no longer taught, so it must stop being citable:
    // leaving its chunks in place would let the tutor quote a lesson the learner
    // cannot open. A lesson deleted outright is caught by the orphan sweep.
    if (!lesson || !lesson.active) {
      const cleared = await this.chunksRepo.delete({ lessonId });
      return {
        lessonId,
        chunks: 0,
        embedded: 0,
        removed: cleared.affected ?? 0,
      };
    }

    const vocabularies = await this.vocabulariesRepo.find({
      where: { lessonId },
      order: { orderIndex: 'ASC' },
    });

    const drafts = chunkLessonCorpus({
      lesson: {
        lessonId: lesson.id,
        courseId: lesson.courseId,
        title: lesson.title,
        content: lesson.content,
      },
      vocabularies: vocabularies.map((item) => ({
        word: item.word,
        meaning: item.meaning,
        partOfSpeech: item.partOfSpeech,
        example: item.example,
        exampleTranslation: item.exampleTranslation,
        notes: item.notes,
      })),
    });

    const existing = await this.chunksRepo.find({ where: { lessonId } });
    const byKey = new Map(
      existing.map((row) => [chunkKey(row.sourceType, row.chunkIndex), row]),
    );

    const stale = drafts.filter((draft) => {
      const row = byKey.get(chunkKey(draft.sourceType, draft.chunkIndex));
      if (!row) {
        return true;
      }
      // A row written by a run that failed between storing the chunk and storing
      // its vector has the right hash and no vector. The hash alone would skip it
      // on every later run, leaving it permanently unretrievable.
      if (!row.embeddedAt) {
        return true;
      }
      return options.force === true || row.contentHash !== draft.contentHash;
    });

    const vectors =
      stale.length > 0
        ? await this.embedding.embed(stale.map((draft) => draft.content))
        : [];
    const vectorByKey = new Map(
      stale.map((draft, index) => [
        chunkKey(draft.sourceType, draft.chunkIndex),
        vectors[index],
      ]),
    );

    const keep = new Set(
      drafts.map((draft) => chunkKey(draft.sourceType, draft.chunkIndex)),
    );
    const dropped = existing
      .filter((row) => !keep.has(chunkKey(row.sourceType, row.chunkIndex)))
      .map((row) => row.id);

    await this.chunksRepo.manager.transaction(async (manager) => {
      // Chunks the lesson no longer has — its text got shorter, or its trailing
      // vocabulary items were deleted. Removed by primary key rather than by
      // index arithmetic, so a change to the chunking policy cannot strand a
      // stale tail behind.
      if (dropped.length > 0) {
        await manager.query(
          'DELETE FROM ai_knowledge_chunks WHERE id = ANY($1::uuid[])',
          [dropped],
        );
      }
      for (const draft of drafts) {
        await this.writeChunk(
          manager,
          draft,
          vectorByKey.get(chunkKey(draft.sourceType, draft.chunkIndex)) ?? null,
        );
      }
    });

    return {
      lessonId,
      chunks: drafts.length,
      embedded: stale.length,
      removed: dropped.length,
    };
  }

  /**
   * Reconcile the whole corpus. Incremental by default: `contentHash` is what
   * makes running this nightly affordable, since an unchanged corpus costs one
   * query per lesson and no provider calls at all.
   */
  async reindexAll(options: ReindexOptions = {}): Promise<ReindexSummary> {
    // Checked up front: a sweep that embeds nothing would otherwise report
    // success and quietly leave the index empty.
    if (!(await this.embedding.isConfigured())) {
      throw new ServiceUnavailableException(
        'Embedding provider is not configured',
      );
    }

    const lessons = await this.lessonsRepo.find({
      where: { active: true },
      select: { id: true },
    });

    const summary: ReindexSummary = {
      lessons: 0,
      chunks: 0,
      embedded: 0,
      removed: 0,
      failed: 0,
    };

    for (const lesson of lessons) {
      try {
        const result = await this.reindexLesson(lesson.id, options);
        summary.lessons += 1;
        summary.chunks += result.chunks;
        summary.embedded += result.embedded;
        summary.removed += result.removed;
      } catch (err) {
        // One lesson must not end the sweep. This run is the safety net for
        // writes that were missed, and finishing most of the corpus is worth
        // more than stopping at the first lesson the provider rejected.
        summary.failed += 1;
        this.logger.warn(
          `Reindex failed for lesson ${lesson.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    summary.removed += await this.sweepOrphans();

    return summary;
  }

  /**
   * Chunks whose lesson is gone or has been deactivated.
   *
   * `reindexLesson` clears a deactivated lesson, but the sweep above only visits
   * active lessons — so a lesson that was deactivated or deleted since the last
   * run is never visited by it at all, and would keep its chunks forever. This is
   * the only path that removes them.
   */
  private async sweepOrphans(): Promise<number> {
    // Annotated rather than asserted: `query` is untyped, so the row shape has to
    // be stated here — this SQL is the only place Postgres's column names appear.
    const rows: Array<{ lesson_id: string }> = await this.chunksRepo.query(
      `SELECT DISTINCT c.lesson_id
         FROM ai_knowledge_chunks c
         LEFT JOIN edu_lessons l ON l.id = c.lesson_id AND l.active = true
        WHERE l.id IS NULL`,
    );

    let removed = 0;
    for (const row of rows) {
      const cleared = await this.chunksRepo.delete({ lessonId: row.lesson_id });
      removed += cleared.affected ?? 0;
    }
    return removed;
  }

  /**
   * Raw SQL rather than a repository upsert: the vector column needs an explicit
   * `::vector` cast, which TypeORM cannot express for a type it does not know.
   * The `COALESCE`s keep the stored vector and timestamp when this run skipped
   * re-embedding, so an unchanged chunk keeps the embedding it already had.
   */
  private async writeChunk(
    manager: EntityManager,
    draft: KnowledgeChunkDraft,
    vector: number[] | null,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO ai_knowledge_chunks
         (source_type, lesson_id, course_id, chunk_index, title, content, content_hash, embedding, embedded_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, now())
       ON CONFLICT (source_type, lesson_id, chunk_index) DO UPDATE SET
         course_id = EXCLUDED.course_id,
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         content_hash = EXCLUDED.content_hash,
         embedding = COALESCE(EXCLUDED.embedding, ai_knowledge_chunks.embedding),
         embedded_at = COALESCE(EXCLUDED.embedded_at, ai_knowledge_chunks.embedded_at),
         updated_at = now()`,
      [
        draft.sourceType,
        draft.lessonId,
        draft.courseId,
        draft.chunkIndex,
        draft.title,
        draft.content,
        draft.contentHash,
        formatVector(vector),
        vector ? new Date() : null,
      ],
    );
  }
}
