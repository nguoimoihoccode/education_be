import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '../../common/cache/cache.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Lesson } from '../education/entities/lesson.entity';
import { Vocabulary } from '../education/entities/vocabulary.entity';
import { UsersModule } from '../users/users.module';
import { AiController } from './ai.controller';
import { AI_FETCH_CLIENT, AiService } from './ai.service';
import { AI_EMBEDDING_CLIENT, EmbeddingService } from './embedding.service';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiEmbeddingSettings } from './entities/ai-embedding-settings.entity';
import { AiKnowledgeChunk } from './entities/ai-knowledge-chunk.entity';
import { AiMessage } from './entities/ai-message.entity';
import { AiProviderSettings } from './entities/ai-provider-settings.entity';
import { KnowledgeContextService } from './knowledge-context.service';
import { KnowledgeIndexService } from './knowledge-index.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { KnowledgeReindexTask } from './tasks/knowledge-reindex.task';

@Module({
  imports: [
    UsersModule,
    // For the query-embedding cache. Without REDIS_URL this is the in-memory
    // layer, so the retrieval tier needs no infrastructure of its own.
    CacheModule,
    TypeOrmModule.forFeature([
      AiConversation,
      AiMessage,
      AiProviderSettings,
      AiEmbeddingSettings,
      AiKnowledgeChunk,
      // Read-only: the tutor grounds replies in lesson content, and indexing
      // reads it to embed. Registered here (rather than importing
      // EducationModule) so there is no module cycle.
      Lesson,
      Vocabulary,
    ]),
  ],
  controllers: [AiController],
  providers: [
    AiService,
    KnowledgeContextService,
    KnowledgeRetrievalService,
    KnowledgeIndexService,
    KnowledgeReindexTask,
    EmbeddingService,
    { provide: AI_FETCH_CLIENT, useValue: fetch },
    { provide: AI_EMBEDDING_CLIENT, useValue: fetch },
    RolesGuard,
  ],
  // Exported so EducationModule can refresh the index from its lesson and
  // vocabulary write paths. EducationModule already imports this module; the
  // dependency only runs one way, so there is no cycle.
  exports: [AiService, KnowledgeIndexService],
})
export class AiModule {}
