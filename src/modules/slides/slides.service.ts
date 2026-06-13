import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../education/entities/lesson.entity';
import {
  CreateSlideDeckDto,
  GenerateSlideDeckDto,
  UpdateSlideDeckDto,
} from './dto/slide-deck.dto';
import {
  SlideDeck,
  SlideDeckSourceType,
  SlideDeckStatus,
  SlideItem,
  SlideType,
} from './entities/slide-deck.entity';

@Injectable()
export class SlidesService {
  constructor(
    @InjectRepository(SlideDeck)
    private readonly slideDeckRepository: Repository<SlideDeck>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  async generate(
    userId: number,
    dto: GenerateSlideDeckDto,
  ): Promise<SlideDeck> {
    const sourceText = await this.getSourceText(dto);
    const title = this.deriveTitle(sourceText, dto.prompt);
    const slides = this.buildSlides(title, sourceText, dto.slideCount);

    return this.slideDeckRepository.save(
      this.slideDeckRepository.create({
        title,
        description: `Generated ${dto.slideCount}-slide deck`,
        sourceType: dto.sourceType,
        sourceLessonId: dto.lessonId,
        template: dto.template,
        status: SlideDeckStatus.DRAFT,
        slides,
        createdById: userId,
      }),
    );
  }

  async create(userId: number, dto: CreateSlideDeckDto): Promise<SlideDeck> {
    this.validateSlides(dto.slides);
    return this.slideDeckRepository.save(
      this.slideDeckRepository.create({
        ...dto,
        status: SlideDeckStatus.DRAFT,
        createdById: userId,
      }),
    );
  }

  findMine(userId: number): Promise<SlideDeck[]> {
    return this.slideDeckRepository.find({
      where: { createdById: userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async findOne(id: string, userId?: number): Promise<SlideDeck> {
    const deck = await this.slideDeckRepository.findOne({ where: { id } });
    if (!deck) {
      throw new NotFoundException('Slide deck not found');
    }
    if (
      deck.status !== SlideDeckStatus.PUBLISHED &&
      deck.createdById !== userId
    ) {
      throw new ForbiddenException('Slide deck is not published');
    }
    return deck;
  }

  async update(
    id: string,
    userId: number,
    dto: UpdateSlideDeckDto,
  ): Promise<SlideDeck> {
    const deck = await this.findOwned(id, userId);
    if (dto.slides) {
      this.validateSlides(dto.slides);
    }
    Object.assign(deck, dto);
    return this.slideDeckRepository.save(deck);
  }

  async remove(id: string, userId: number): Promise<{ deleted: true }> {
    const deck = await this.findOwned(id, userId);
    await this.slideDeckRepository.remove(deck);
    return { deleted: true };
  }

  async publish(id: string, userId: number): Promise<SlideDeck> {
    const deck = await this.findOwned(id, userId);
    deck.status = SlideDeckStatus.PUBLISHED;
    return this.slideDeckRepository.save(deck);
  }

  findPublishedByLesson(lessonId: string): Promise<SlideDeck[]> {
    return this.slideDeckRepository.find({
      where: { sourceLessonId: lessonId, status: SlideDeckStatus.PUBLISHED },
      order: { updatedAt: 'DESC' },
    });
  }

  private async findOwned(id: string, userId: number): Promise<SlideDeck> {
    const deck = await this.slideDeckRepository.findOne({ where: { id } });
    if (!deck) {
      throw new NotFoundException('Slide deck not found');
    }
    if (deck.createdById !== userId) {
      throw new ForbiddenException('You can only modify your own slide decks');
    }
    return deck;
  }

  private async getSourceText(dto: GenerateSlideDeckDto): Promise<string> {
    if (dto.sourceType === SlideDeckSourceType.PROMPT) {
      return dto.prompt ?? '';
    }

    const lesson = await this.lessonRepository.findOne({
      where: { id: dto.lessonId },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    return [lesson.title, lesson.description, lesson.content]
      .filter(Boolean)
      .join('\n\n');
  }

  private deriveTitle(sourceText: string, prompt?: string): string {
    const firstLine = (prompt || sourceText).split('\n')[0]?.trim();
    return firstLine?.slice(0, 80) || 'AI Slide Deck';
  }

  private buildSlides(
    title: string,
    sourceText: string,
    slideCount: number,
  ): SlideItem[] {
    const topics = this.extractTopics(sourceText, slideCount - 2);
    const slides: SlideItem[] = [
      {
        id: crypto.randomUUID(),
        order: 0,
        type: SlideType.TITLE,
        content: { title, subtitle: 'AI-generated lesson slides' },
      },
    ];

    const quizIndex =
      slideCount >= 5 ? Math.max(2, Math.floor(slideCount / 2)) : -1;
    for (let index = 1; index < slideCount - 1; index += 1) {
      const topic = topics[index - 1] ?? `Key idea ${index}`;
      if (index === quizIndex) {
        slides.push({
          id: crypto.randomUUID(),
          order: index,
          type: SlideType.QUIZ,
          content: {
            question: `Which statement best matches "${topic}"?`,
            options: [topic, 'Unrelated detail', 'Opposite meaning'],
            answer: topic,
            explanation: `This answer matches the lesson focus: ${topic}.`,
          },
        });
      } else {
        slides.push({
          id: crypto.randomUUID(),
          order: index,
          type: SlideType.CONTENT,
          content: {
            title: topic,
            bullets: this.makeBullets(topic),
          },
        });
      }
    }

    slides.push({
      id: crypto.randomUUID(),
      order: slideCount - 1,
      type: SlideType.SUMMARY,
      content: {
        title: 'Summary',
        bullets: topics.slice(0, 4).map((topic) => `Remember: ${topic}`),
      },
    });

    this.validateSlides(slides);
    return slides;
  }

  private extractTopics(sourceText: string, count: number): string[] {
    const cleaned = sourceText
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const sentences = cleaned
      .split(/[.!?。！？]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const topics = sentences
      .map((sentence) => sentence.slice(0, 72))
      .filter((sentence) => sentence.length > 8);
    while (topics.length < count) {
      topics.push(`Core concept ${topics.length + 1}`);
    }
    return topics.slice(0, count);
  }

  private makeBullets(topic: string): string[] {
    return [
      `Understand ${topic}`,
      `See one clear example`,
      `Practice with a short question`,
    ];
  }

  private validateSlides(slides: SlideItem[]): void {
    if (!slides.length || slides.length > 12) {
      throw new BadRequestException('Slide deck must contain 1 to 12 slides');
    }
    if (slides[0].type !== SlideType.TITLE) {
      throw new BadRequestException('First slide must be a title slide');
    }
    if (slides[slides.length - 1].type !== SlideType.SUMMARY) {
      throw new BadRequestException('Last slide must be a summary slide');
    }
    const allowed = new Set(Object.values(SlideType));
    for (const [index, slide] of slides.entries()) {
      if (!allowed.has(slide.type)) {
        throw new BadRequestException(
          `Unsupported slide type at index ${index}`,
        );
      }
      slide.order = index;
    }
  }
}
