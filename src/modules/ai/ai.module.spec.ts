import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiModule } from './ai.module';
import { AiService } from './ai.service';

describe('AiModule', () => {
  it('provides the AI controller and service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AiModule],
    }).compile();

    expect(moduleRef.get(AiController)).toBeInstanceOf(AiController);
    expect(moduleRef.get(AiService)).toBeInstanceOf(AiService);
  });
});
