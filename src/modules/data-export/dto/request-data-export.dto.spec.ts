import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  EducationExportFormat,
  EducationExportTimeRange,
} from '../entities/data-export.entity';
import { RequestDataExportDto } from './request-data-export.dto';

describe('RequestDataExportDto', () => {
  it('accepts a valid export request with at least one selected dataset', async () => {
    const dto = plainToInstance(RequestDataExportDto, {
      format: EducationExportFormat.JSON,
      timeRange: EducationExportTimeRange.ALL,
      dataTypes: {
        profile: true,
        progress: false,
        flashcards: false,
        quizzes: false,
        forum: false,
      },
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects custom formats, custom time ranges, and empty selections', async () => {
    const dto = plainToInstance(RequestDataExportDto, {
      format: 'custom',
      timeRange: 'custom',
      dataTypes: {
        profile: false,
        progress: false,
        flashcards: false,
        quizzes: false,
        forum: false,
      },
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['format', 'timeRange', 'dataTypes']),
    );
  });
});
