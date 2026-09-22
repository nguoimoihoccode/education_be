import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  /**
   * Must be a UUID because it is used to look the lesson up (`Lesson.id` is a
   * uuid column). A free-form string would reach Postgres as an invalid uuid and
   * fail the query on every later message in the conversation.
   */
  @IsOptional()
  @IsUUID()
  lessonId?: string;
}
