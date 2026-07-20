import { MODULE_METADATA } from '@nestjs/common/constants';
import type { DynamicModule, Provider } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiModule } from './ai.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiMessage } from './entities/ai-message.entity';
import { AiProviderSettings } from './entities/ai-provider-settings.entity';

describe('AiModule', () => {
  it('registers AI entities and provides controller/service', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, AiModule) ?? [];
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AiModule,
    ) as unknown[];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AiModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      AiModule,
    ) as unknown[];

    const typeOrmFeature = imports[0] as DynamicModule;
    const providerTokens = (typeOrmFeature.providers ?? []).map(
      (provider: Provider) =>
        typeof provider === 'object' && 'provide' in provider
          ? provider.provide
          : provider,
    );

    expect(providerTokens).toContain(getRepositoryToken(AiConversation));
    expect(providerTokens).toContain(getRepositoryToken(AiMessage));
    expect(providerTokens).toContain(getRepositoryToken(AiProviderSettings));
    expect(controllers).toEqual([AiController]);
    expect(providers).toEqual(
      expect.arrayContaining([
        AiService,
        expect.objectContaining({ provide: expect.anything() }),
      ]),
    );
    expect(exports).toEqual([AiService]);
  });
});
