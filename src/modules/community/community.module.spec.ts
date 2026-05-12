import { Test } from '@nestjs/testing';
import { CommunityController } from './community.controller';
import { CommunityModule } from './community.module';
import { CommunityService } from './community.service';

describe('CommunityModule', () => {
  it('provides the community controller and service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommunityModule],
    }).compile();

    expect(moduleRef.get(CommunityController)).toBeInstanceOf(CommunityController);
    expect(moduleRef.get(CommunityService)).toBeInstanceOf(CommunityService);
  });
});
