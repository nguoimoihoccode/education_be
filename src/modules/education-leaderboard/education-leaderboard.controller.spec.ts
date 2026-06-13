import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import type { RequestWithUser } from '../../common/types/auth.types';
import {
  LeaderboardCategory,
  LeaderboardPeriod,
  LeaderboardQueryDto,
} from './dto/leaderboard-query.dto';
import { EducationLeaderboardController } from './education-leaderboard.controller';
import { EducationLeaderboardModule } from './education-leaderboard.module';
import {
  EDUCATION_LEADERBOARD_CLOCK,
  EducationLeaderboardService,
} from './education-leaderboard.service';

describe('EducationLeaderboardController', () => {
  const request = {
    user: {
      id: 7,
      sub: 7,
      email: 'learner@example.com',
      roles: ['user'],
    },
  } as RequestWithUser;

  let service: Record<string, jest.Mock>;
  let controller: EducationLeaderboardController;

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      stats: jest.fn(),
      me: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [EducationLeaderboardController],
      providers: [{ provide: EducationLeaderboardService, useValue: service }],
    }).compile();

    controller = moduleRef.get(EducationLeaderboardController);
  });

  it('registers the exact protected leaderboard routes', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, EducationLeaderboardController),
    ).toBe('education/leaderboard');
    expectRoute('list', '/', RequestMethod.GET);
    expectRoute('stats', 'stats', RequestMethod.GET);
    expectRoute('me', 'me', RequestMethod.GET);

    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, EducationLeaderboardController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        EducationLeaderboardController.prototype.list,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        EducationLeaderboardController.prototype.stats,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        EducationLeaderboardController.prototype.me,
      ),
    ).toBeUndefined();
  });

  it('passes the JWT subject and query to list', async () => {
    const query = Object.assign(new LeaderboardQueryDto(), {
      period: LeaderboardPeriod.MONTH,
      category: LeaderboardCategory.LESSONS,
      page: 2,
    });
    service.list.mockResolvedValue({
      data: [],
      meta: { page: 2, limit: 20, total: 0, totalPages: 0 },
    });

    await expect(controller.list(request, query)).resolves.toEqual({
      data: [],
      meta: { page: 2, limit: 20, total: 0, totalPages: 0 },
    });
    expect(service.list).toHaveBeenCalledWith(7, query);
  });

  it('delegates stats without user-specific arguments', async () => {
    service.stats.mockResolvedValue({
      totalXp: 100,
      totalLessons: 2,
      totalQuizzesPassed: 1,
      totalHoursStudied: 1.5,
    });

    await expect(controller.stats()).resolves.toEqual({
      totalXp: 100,
      totalLessons: 2,
      totalQuizzesPassed: 1,
      totalHoursStudied: 1.5,
    });
    expect(service.stats).toHaveBeenCalledWith();
  });

  it('passes the JWT subject to the current-user ranking', async () => {
    service.me.mockResolvedValue({ id: '7', rank: 1 });

    await expect(controller.me(request)).resolves.toEqual({
      id: '7',
      rank: 1,
    });
    expect(service.me).toHaveBeenCalledWith(7);
  });
});

describe('EducationLeaderboardModule', () => {
  it('wires a DataSource-only read module and exports its service', () => {
    const imports =
      Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        EducationLeaderboardModule,
      ) ?? [];
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      EducationLeaderboardModule,
    ) as unknown[];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      EducationLeaderboardModule,
    ) as Array<unknown>;
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      EducationLeaderboardModule,
    ) as unknown[];

    expect(imports).toEqual([]);
    expect(controllers).toEqual([EducationLeaderboardController]);
    expect(providers).toEqual(
      expect.arrayContaining([
        EducationLeaderboardService,
        expect.objectContaining({
          provide: EDUCATION_LEADERBOARD_CLOCK,
          useValue: expect.any(Function),
        }),
      ]),
    );
    expect(exports).toEqual([EducationLeaderboardService]);
  });
});

function expectRoute(
  methodName: keyof EducationLeaderboardController,
  path: string,
  method: RequestMethod,
) {
  const handler = EducationLeaderboardController.prototype[methodName];
  expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
  expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
}
