import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiChatDto } from './dto/ai-chat.dto';

type FetchLike = typeof fetch;

export const AI_FETCH_CLIENT = 'AI_FETCH_CLIENT';

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

@Injectable()
export class AiService {
  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(AI_FETCH_CLIENT)
    private readonly fetchClient: FetchLike = fetch,
  ) {}

  async chat(dto: AiChatDto): Promise<{ reply: string }> {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('AI tutor is not configured');
    }

    const baseUrl = this.configService.get<string>(
      'GROQ_BASE_URL',
      'https://api.groq.com/openai/v1',
    );
    const model = this.configService.get<string>(
      'AI_MODEL',
      'llama-3.3-70b-versatile',
    );
    const maxTokens = this.configService.get<number>('AI_TUTOR_MAX_TOKENS', 700);
    const temperature = this.configService.get<number>('AI_TUTOR_TEMPERATURE', 0.4);

    try {
      const response = await this.fetchClient(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are a practical language tutor. Answer clearly, keep responses concise, include examples, and offer a short practice prompt when useful.',
            },
            { role: 'user', content: dto.message },
          ],
          max_tokens: maxTokens,
          temperature,
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq request failed with status ${response.status}`);
      }

      const data = (await response.json()) as GroqChatResponse;
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        throw new Error('Groq returned an empty tutor response');
      }

      return { reply };
    } catch {
      throw new ServiceUnavailableException('AI tutor service unavailable');
    }
  }
}
