import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ReindexKnowledgeDto {
  /**
   * Reindex a single lesson instead of the whole corpus. The full sweep is
   * incremental and cheap, but an admin who just edited one lesson should not
   * have to wait for every other one to be checked.
   */
  @IsOptional()
  @IsUUID()
  lessonId?: string;

  /**
   * Re-embed even where the content hash is unchanged. Required after changing
   * the embedding model or its width, since the text is identical but the stored
   * vectors no longer share a space with new query vectors.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
