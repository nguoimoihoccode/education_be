import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AiKnowledgeSourceType {
  LESSON = 'lesson',
  VOCABULARY = 'vocabulary',
}

/**
 * One embedded piece of the academic corpus.
 *
 * `lesson_id` is the indexing unit, not a generic `source_id`: every chunk comes
 * from a lesson (either its body or its vocabulary list), so re-indexing a lesson
 * is a single delete by that column, and no chunk can ever be orphaned from the
 * lesson it belongs to.
 *
 * There is no foreign key to `edu_lessons`, matching `ai_conversations.lesson_id`.
 * Chunks for a lesson that was deleted outright are removed by the reconciling
 * reindex rather than by a cascade, so a delete can never fail on the index.
 *
 * The three indexes below are the ordinary ones. The fourth,
 * `IDX_ai_knowledge_chunks_embedding`, is HNSW with `vector_cosine_ops` and is
 * deliberately NOT declared here: TypeORM has no operator-class option, so a
 * declared index would be a btree and a schema diff would propose replacing the
 * real one with it. It exists only in migration `1890000000000`, which means a
 * generated migration for this table is expected to show index churn — write
 * migrations for this table by hand, as this repo already does.
 */
@Entity('ai_knowledge_chunks')
@Index(
  'UQ_ai_knowledge_chunks_source',
  ['sourceType', 'lessonId', 'chunkIndex'],
  { unique: true },
)
@Index('IDX_ai_knowledge_chunks_lesson', ['lessonId'])
@Index('IDX_ai_knowledge_chunks_course', ['courseId'])
export class AiKnowledgeChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'source_type',
    type: 'enum',
    enum: AiKnowledgeSourceType,
    enumName: 'ai_knowledge_source_type_enum',
  })
  sourceType: AiKnowledgeSourceType;

  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId: string;

  @Column({ name: 'course_id', type: 'uuid', nullable: true })
  courseId?: string | null;

  @Column({ name: 'chunk_index', type: 'integer' })
  chunkIndex: number;

  @Column({ type: 'varchar', length: 512 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  /** sha256 of `content`; lets a re-index skip embedding text that did not change. */
  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash: string;

  /**
   * Only narrow operations need the vector, and a 1536-float column is not
   * something to drag along on every read, so it is excluded by default. Raw SQL
   * still sees it. Width is fixed by `EMBEDDING_DIMENSIONS`; changing the
   * embedding model to a different width means re-embedding and altering this
   * column, which is why the settings table records the width.
   *
   * The width comes from `length`, not from the type string: TypeORM knows
   * `vector` as a length-bearing type and renders it as `vector(1536)`. That
   * matters — declared as a bare `type: 'vector'` a schema diff reads the column
   * as width-less and proposes `DROP COLUMN embedding; ADD embedding vector`,
   * which would silently discard the corpus and invalidate the HNSW index. The
   * literal 1536 is not imported from `embedding.service`, which would make an
   * entity depend on a service that depends on another entity; migration spec
   * `1890000000000` asserts the column, the default and the migration all agree.
   */
  @Column({ type: 'vector', length: 1536, nullable: true, select: false })
  embedding?: string | null;

  @Column({ name: 'embedded_at', type: 'timestamptz', nullable: true })
  embeddedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
