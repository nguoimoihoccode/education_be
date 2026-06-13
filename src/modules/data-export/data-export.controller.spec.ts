import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod, StreamableFile } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { RequestWithUser } from '../../common/types/auth.types';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';

describe('DataExportController', () => {
  it('registers the expected export routes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, DataExportController)).toBe(
      'education/exports',
    );
    expect(
      Reflect.getMetadata(METHOD_METADATA, DataExportController.prototype.list),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        DataExportController.prototype.create,
      ),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        DataExportController.prototype.download,
      ),
    ).toBe(RequestMethod.GET);
  });

  it('passes the JWT subject to the service for list/create/download', async () => {
    const service = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({
        id: 'export-1',
        date: '2026-06-13T00:00:00.000Z',
        format: 'json',
        status: 'completed',
        size: '1 KB',
        name: 'education-export-export-1.json',
      }),
      download: jest.fn().mockResolvedValue({
        buffer: Buffer.from('content'),
        fileName: 'education-export-export-1.json',
        contentType: 'application/json',
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [DataExportController],
      providers: [{ provide: DataExportService, useValue: service }],
    }).compile();
    const controller = moduleRef.get(DataExportController);
    const request = {
      user: {
        id: 7,
        sub: 7,
        email: 'learner@example.com',
        roles: ['user'],
      },
    } as RequestWithUser;
    const response = {
      setHeader: jest.fn(),
    } as never;

    await expect(controller.list(request)).resolves.toEqual([]);
    await expect(
      controller.create(request, {
        format: 'json',
        timeRange: 'all',
        dataTypes: {
          profile: true,
          progress: false,
          flashcards: false,
          quizzes: false,
          forum: false,
        },
      }),
    ).resolves.toEqual({
      id: 'export-1',
      date: '2026-06-13T00:00:00.000Z',
      format: 'json',
      status: 'completed',
      size: '1 KB',
      name: 'education-export-export-1.json',
    });

    await expect(
      controller.download(request, 'export-1', response),
    ).resolves.toBeInstanceOf(StreamableFile);
    expect(service.list).toHaveBeenCalledWith(7);
    expect(service.create).toHaveBeenCalledWith(7, expect.any(Object));
    expect(service.download).toHaveBeenCalledWith(7, 'export-1');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/json',
    );
  });
});
