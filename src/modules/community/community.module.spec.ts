import { Test } from '@nestjs/testing';
import { CommunityController } from './community.controller';
import { CommunityModule } from './community.module';
import { CommunityService } from './community.service';

describe('CommunityModule', () => {
  it('provides the community controller and service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommunityModule],
    }).compile();

    expect(moduleRef.get(CommunityController)).toBeInstanceOf(
      CommunityController,
    );
    expect(moduleRef.get(CommunityService)).toBeInstanceOf(CommunityService);
  });

  it('passes authenticated user id into membership actions', () => {
    const service = {
      joinGroup: jest.fn(),
      leaveGroup: jest.fn(),
      registerEvent: jest.fn(),
      unregisterEvent: jest.fn(),
    } as unknown as CommunityService;
    const controller = new CommunityController(service);
    const req = { user: { sub: 42 } };

    controller.joinGroup(req, 'hsk-beginners');
    controller.leaveGroup(req, 'hsk-beginners');
    controller.registerEvent(req, 'weekly-quiz-sprint');
    controller.unregisterEvent(req, 'weekly-quiz-sprint');

    expect(service.joinGroup).toHaveBeenCalledWith(42, 'hsk-beginners');
    expect(service.leaveGroup).toHaveBeenCalledWith(42, 'hsk-beginners');
    expect(service.registerEvent).toHaveBeenCalledWith(
      42,
      'weekly-quiz-sprint',
    );
    expect(service.unregisterEvent).toHaveBeenCalledWith(
      42,
      'weekly-quiz-sprint',
    );
  });

  it('returns personalized group and event status after user actions', () => {
    const service = new CommunityService();

    service.joinGroup(42, 'hsk-beginners');
    service.registerEvent(42, 'weekly-quiz-sprint');

    expect(service.getGroups({ userId: 42 }).data[0].isJoined).toBe(true);
    expect(service.getGroups({ userId: 7 }).data[0].isJoined).toBe(false);
    expect(service.getEvents({ userId: 42 }).data[0].isRegistered).toBe(true);
    expect(service.getEvents({ userId: 7 }).data[0].isRegistered).toBe(false);
  });
});
