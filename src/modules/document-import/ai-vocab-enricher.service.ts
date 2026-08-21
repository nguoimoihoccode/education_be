import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';

export type EnrichedCard = {
  front: string;
  back: string;
  pronunciation?: string;
  example?: string;
  exampleTranslation?: string;
  difficulty?: number;
  source: 'ai';
};

export type EnrichVocabularyInput = {
  rawText: string;
  seedTerms?: string[];
  language?: string;
  maxCards?: number;
};

type AiCardsResponse = {
  cards?: Array<{
    front?: string;
    back?: string;
    pronunciation?: string;
    example?: string;
    exampleTranslation?: string;
    difficulty?: number;
  }>;
};

@Injectable()
export class AiVocabEnricherService {
  private readonly logger = new Logger(AiVocabEnricherService.name);

  constructor(private readonly aiService: AiService) {}

  async enrichVocabulary(
    input: EnrichVocabularyInput,
  ): Promise<EnrichedCard[] | null> {
    const maxCards = Math.min(40, Math.max(1, input.maxCards ?? 20));
    const rawText = (input.rawText || '').slice(0, 6000);
    const seedTerms = (input.seedTerms || [])
      .filter(Boolean)
      .slice(0, maxCards);
    const language = input.language || 'en';

    const system = [
      'You extract language-learning flashcards from document text.',
      'Return JSON shape: {"cards":[{"front":"term","back":"definition","pronunciation":"optional","example":"optional","exampleTranslation":"optional","difficulty":1}]}',
      'front is the word/phrase; back is a clear definition/translation.',
      'Prefer seed terms when provided. difficulty is 1-5 integer.',
      'Only include cards with non-empty front and back.',
    ].join(' ');

    const user = [
      `Language: ${language}`,
      `Max cards: ${maxCards}`,
      seedTerms.length
        ? `Seed terms: ${JSON.stringify(seedTerms)}`
        : 'Seed terms: []',
      'Document text:',
      rawText,
    ].join('\n');

    try {
      const data = await this.aiService.completeJson<AiCardsResponse>({
        system,
        user,
      });

      const cards = Array.isArray(data?.cards) ? data.cards : [];
      return cards
        .map((card) => {
          const front = (card.front || '').trim();
          const back = (card.back || '').trim();
          if (!front || !back) {
            return null;
          }
          const enriched: EnrichedCard = {
            front,
            back,
            source: 'ai',
          };
          if (card.pronunciation?.trim()) {
            enriched.pronunciation = card.pronunciation.trim();
          }
          if (card.example?.trim()) {
            enriched.example = card.example.trim();
          }
          if (card.exampleTranslation?.trim()) {
            enriched.exampleTranslation = card.exampleTranslation.trim();
          }
          if (
            typeof card.difficulty === 'number' &&
            !Number.isNaN(card.difficulty)
          ) {
            enriched.difficulty = card.difficulty;
          }
          return enriched;
        })
        .filter((card): card is EnrichedCard => card !== null)
        .slice(0, maxCards);
    } catch (error) {
      this.logger.warn(
        `AI vocab enrich failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
