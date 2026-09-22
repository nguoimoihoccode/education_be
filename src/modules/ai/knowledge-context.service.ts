import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../education/entities/lesson.entity';
import { Vocabulary } from '../education/entities/vocabulary.entity';
import {
  KnowledgeChunkDraft,
  chunkLessonCorpus,
} from './domain/knowledge-chunking.policy';
import { toPlainText } from './domain/plain-text.policy';
import { UUID_PATTERN } from './knowledge.util';

/**
 * Builds the grounding text handed to the tutor. This is the scoped tier: when a
 * conversation is attached to a lesson we already know exactly which content is
 * relevant, so it is read directly instead of being searched for.
 */

/** Ceiling on grounding text, so retrieved content cannot crowd out chat history. */
export const LESSON_CONTEXT_CHAR_BUDGET = 8000;

const CONTEXT_OPEN = '=== NỘI DUNG BÀI HỌC ĐANG HỌC (nguồn tham khảo) ===';
const CONTEXT_CLOSE = '=== HẾT NGUỒN THAM KHẢO ===';

@Injectable()
export class KnowledgeContextService {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonsRepo: Repository<Lesson>,
    @InjectRepository(Vocabulary)
    private readonly vocabulariesRepo: Repository<Vocabulary>,
  ) {}

  /**
   * Grounding block for a lesson, or null when there is nothing to ground on.
   *
   * `lessonId` is checked before it reaches the query: it is client-supplied and
   * `Lesson.id` is a uuid column, so a non-uuid would be an invalid-uuid query
   * error on every message of the conversation. The DTOs reject those now, but a
   * row written before that validation existed must not brick a conversation.
   */
  async buildLessonContext(
    lessonId: string | null | undefined,
  ): Promise<string | null> {
    if (!lessonId || !UUID_PATTERN.test(lessonId)) {
      return null;
    }

    const lesson = await this.lessonsRepo.findOne({ where: { id: lessonId } });
    if (!lesson || !lesson.active) {
      return null;
    }

    const vocabularies = await this.vocabulariesRepo.find({
      where: { lessonId: lesson.id },
      order: { orderIndex: 'ASC' },
    });

    const body = this.fitToBudget(this.buildDrafts(lesson, vocabularies));

    // The title alone is worth grounding on: a video-only lesson has no text
    // body, but the tutor still learns which lesson is being studied.
    const header = [`Bài: ${lesson.title}`];
    const description = toPlainText(lesson.description);
    if (description) {
      header.push(`Mô tả: ${description}`);
    }

    return [
      CONTEXT_OPEN,
      ...header,
      ...(body ? [body] : []),
      CONTEXT_CLOSE,
    ].join('\n');
  }

  private buildDrafts(
    lesson: Lesson,
    vocabularies: Vocabulary[],
  ): KnowledgeChunkDraft[] {
    return chunkLessonCorpus({
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
  }

  /**
   * Take whole chunks until the budget runs out. A long lesson is truncated
   * rather than silently blowing the prompt; the dropped tail stays reachable
   * through retrieval once that tier is in place.
   */
  private fitToBudget(drafts: KnowledgeChunkDraft[]): string {
    const kept: string[] = [];
    let used = 0;

    for (const draft of drafts) {
      if (used + draft.content.length > LESSON_CONTEXT_CHAR_BUDGET) {
        break;
      }
      kept.push(draft.content);
      used += draft.content.length;
    }

    return kept.join('\n\n');
  }
}
