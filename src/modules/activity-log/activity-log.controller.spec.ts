import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { RequestWithUser } from '../../common/types/auth.types';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from './activity-log.service';

describe('ActivityLogController', () => {
  it('exposes only the GET /education/logs read endpoint', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ActivityLogController)).toBe(
      'education/logs',
    );
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        ActivityLogController.prototype.list,
      ),
    ).toBe(RequestMethod.GET);
  });

  it('passes the authenticated JWT subject and query to the service', async () => {
    const activityLogService = {
      list: jest.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, totalPages: 0 },
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ActivityLogController],
      providers: [
        {
          provide: ActivityLogService,
          useValue: activityLogService,
        },
      ],
    }).compile();
    const controller = moduleRef.get(ActivityLogController);
    const query = { page: 1, limit: 20 };
    const request = {
      user: {
        id: 7,
        sub: 7,
        email: 'learner@example.com',
        roles: ['user'],
      },
    } as RequestWithUser;

    const result = await controller.list(request, query);

    expect(activityLogService.list).toHaveBeenCalledWith(7, query);
    expect(result).toEqual({
      data: [],
      meta: { total: 0, page: 1, totalPages: 0 },
    });
  });
});
