import { Injectable } from '@nestjs/common';
import { KeywordDto } from './dto/document-import-response.dto';

interface KeywordExtractionOptions {
  minKeywordLength?: number;
  maxKeywords?: number;
  language?: string;
}

@Injectable()
export class KeywordExtractionService {
  private readonly commonWords = new Set([
    // English common words
    'the',
    'be',
    'to',
    'of',
    'and',
    'a',
    'in',
    'that',
    'have',
    'i',
    'it',
    'for',
    'not',
    'on',
    'with',
    'he',
    'as',
    'you',
    'do',
    'at',
    'this',
    'but',
    'his',
    'by',
    'from',
    'they',
    'we',
    'say',
    'her',
    'she',
    'or',
    'an',
    'will',
    'my',
    'one',
    'all',
    'would',
    'there',
    'their',
    'what',
    'so',
    'up',
    'out',
    'if',
    'about',
    'who',
    'get',
    'which',
    'go',
    'me',
    'when',
    'make',
    'can',
    'like',
    'time',
    'no',
    'just',
    'him',
    'know',
    'take',
    'people',
    'into',
    'year',
    'your',
    'good',
    'some',
    'could',
    'them',
    'see',
    'other',
    'than',
    'then',
    'now',
    'look',
    'only',
    'come',
    'its',
    'over',
    'think',
    'also',
    'back',
    'after',
    'use',
    'two',
    'how',
    'our',
    'work',
    'first',
    'well',
    'way',
    'even',
    'new',
    'want',
    'because',
    'any',
    'these',
    'give',
    'day',
    'most',
    'us',
    'is',
    'are',
    'was',
    'were',
    'been',
    'being',
    'has',
    'had',
    'having',
    'does',
    'did',
    'doing',
    'should',
    'must',
    'might',
    'may',
    'could',
    'would',
    'will',
    'shall',
    'can',
    'need',
    'dare',
    'ought',
    'used',
    'ought',
    ' Vietnamese common words',
    'là',
    'của',
    'và',
    'có',
    'được',
    'trong',
    'một',
    'những',
    'để',
    'với',
    'các',
    'không',
    'này',
    'nhưng',
    'nếu',
    'như',
    'thì',
    'về',
    'đó',
    'ra',
    'lên',
    'vào',
    'đi',
    'đến',
    'từ',
    'nào',
    'mà',
    'cũng',
    'nhiều',
    'đã',
    'vẫn',
    'chưa',
    'sẽ',
    'cần',
    'phải',
    'nên',
    'có thể',
    'thường',
    'luôn',
    'rất',
    'hơn',
    'nhất',
    'đây',
    'khi',
    'sau',
    'trước',
    'giữa',
    'qua',
    'lại',
    'đang',
    'đã',
    'chỉ',
    'còn',
    'hết',
    'bị',
    'gì',
    'ai',
    'ở',
    'theo',
    'cho',
    'vì',
    'tại',
    'bằng',
    'trên',
    'dưới',
    'sau',
    'trước',
    'bên',
    'ngoài',
    'trong',
    'nơi',
    'làm',
    'nói',
    'xem',
    'biết',
    'muốn',
    'thích',
    'yêu',
    'ghét',
    'sợ',
    'học',
    'làm',
    'viết',
    'đọc',
    'nghe',
    'nói',
    'bán',
    'mua',
    'cho',
    'nhận',
    'gửi',
    'lấy',
    'bắt',
    'dừng',
    'chạy',
    'đi',
    'đến',
    'về',
    'ra',
    'vào',
    'lên',
    'xuống',
    'qua',
    'lại',
    'tiếp',
    'ngay',
    'bây',
    'giờ',
    'hôm',
    'nay',
    'mai',
    'qua',
    'kia',
    'này',
    'đó',
    'kia',
  ]);

  extractKeywords(
    text: string,
    options: KeywordExtractionOptions = {},
  ): KeywordDto[] {
    const {
      minKeywordLength = 3,
      maxKeywords = 100,
      language = 'en',
    } = options;

    // Normalize text
    const normalizedText = this.normalizeText(text);

    // Tokenize text
    const words = this.tokenizeText(normalizedText);

    // Filter and count word frequencies
    const wordFrequency = new Map<string, number>();
    const wordContexts = new Map<string, string[]>();

    words.forEach((word, index) => {
      if (this.isValidKeyword(word, minKeywordLength)) {
        const lowerWord = word.toLowerCase();

        wordFrequency.set(lowerWord, (wordFrequency.get(lowerWord) || 0) + 1);

        // Store context (surrounding words)
        const contextStart = Math.max(0, index - 3);
        const contextEnd = Math.min(words.length, index + 4);
        const context = words
          .slice(contextStart, contextEnd)
          .join(' ')
          .substring(0, 200);

        if (!wordContexts.has(lowerWord)) {
          wordContexts.set(lowerWord, []);
        }
        const contexts = wordContexts.get(lowerWord)!;
        if (contexts.length < 3) {
          contexts.push(context);
        }
      }
    });

    // Convert to array and sort by frequency
    const keywords = Array.from(wordFrequency.entries())
      .map(([keyword, frequency]) => ({
        keyword,
        frequency,
        context: wordContexts.get(keyword)?.[0] || '',
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, maxKeywords);

    return keywords;
  }

  private normalizeText(text: string): string {
    return text
      .replace(/[^\p{L}\p{N}\s]/gu, ' ') // Remove special characters but keep letters, numbers, and spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private tokenizeText(text: string): string[] {
    return text.split(' ').filter((word) => word.length > 0);
  }

  private isValidKeyword(word: string, minLength: number): boolean {
    const lowerWord = word.toLowerCase();

    // Check length
    if (lowerWord.length < minLength) {
      return false;
    }

    // Check if it's a common word
    if (this.commonWords.has(lowerWord)) {
      return false;
    }

    // Check if it's purely numeric
    if (/^\d+$/.test(lowerWord)) {
      return false;
    }

    // Check if it contains at least one letter
    if (!/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(lowerWord)) {
      return false;
    }

    return true;
  }

  extractPhrases(
    text: string,
    options: KeywordExtractionOptions = {},
  ): string[] {
    const { maxKeywords = 50 } = options;
    const normalizedText = this.normalizeText(text);
    const words = this.tokenizeText(normalizedText);

    const phrases = new Map<string, number>();

    // Extract 2-word and 3-word phrases
    for (let phraseLength = 2; phraseLength <= 3; phraseLength++) {
      for (let i = 0; i <= words.length - phraseLength; i++) {
        const phrase = words
          .slice(i, i + phraseLength)
          .join(' ')
          .toLowerCase();

        // Check if all words in phrase are valid
        const isValidPhrase = words
          .slice(i, i + phraseLength)
          .every((word) => this.isValidKeyword(word, 3));

        if (isValidPhrase) {
          phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
        }
      }
    }

    // Return top phrases
    return Array.from(phrases.entries())
      .filter(([_, count]) => count >= 2) // Only include phrases that appear at least twice
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([phrase]) => phrase);
  }
}
