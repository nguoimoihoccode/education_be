import { Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ChatContextDto } from './chat-context.dto';

export class AiChatDto {
  @IsString()
  @MinLength(1)
  message: string;

  @IsString()
  @IsOptional()
  conversationId?: string;

  /**
   * Validated as a nested DTO rather than a bare `@IsObject()`: the lesson id
   * inside it is used to query a uuid column, so it cannot be free-form.
   */
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => ChatContextDto)
  context?: ChatContextDto;
}
