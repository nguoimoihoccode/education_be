import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EducationActivityType } from '../activity-log/entities/activity-log.entity';
import { FlashcardDeck } from '../education/entities/flashcard-deck.entity';
import { Flashcard } from '../education/entities/flashcard.entity';
import { QuizSession } from '../education/entities/quiz-session.entity';
import { ReviewSession } from '../education/entities/review-session.entity';
import { UserCourse } from '../education/entities/user-course.entity';
import { UserLesson } from '../education/entities/user-lesson.entity';
import { EducationSocialComment } from '../education-social/entities/social-comment.entity';
import { EducationSocialPost } from '../education-social/entities/social-post.entity';
import { User } from '../users/entities/user.entity';
import {
  EducationExportFormat,
  EducationExportStatus,
  EducationExportTimeRange,
  EducationDataExport,
} from './entities/data-export.entity';
import { DataExportService } from './data-export.service';

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(),
}));

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  readFile: jest.fn(),
  rename: jest.fn(),
  unlink: jest.fn(),
  writeFile: jest.fn(),
}));

const mockedFs = fsPromises as jest.Mocked<typeof fsPromises>;
const mockedRandomUUID = randomUUID as jest.MockedFunction<typeof randomUUID>;

describe('DataExportService', () => {
  const user = {
    id: 7,
    email: 'learner@example.com',
    name: 'Learner',
    username: 'learner',
    avatar: null,
    phone: null,
    provider: 'email',
    providerId: null,
    roles: ['USER'],
    isTeacher: false,
    teacherVerified: false,
    teacherBio: null,
    lastSeenAt: new Date('2026-06-12T12:00:00.000Z'),
    createdAt: new Date('2026-06-10T12:00:00.000Z'),
    updatedAt: new Date('2026-06-12T12:30:00.000Z'),
  } as User;

  const baseDataExport = {
    id: 'export-1',
    userId: 7,
    format: EducationExportFormat.JSON,
    timeRange: EducationExportTimeRange.ALL,
    dataTypes: {
      profile: true,
      progress: false,
      flashcards: false,
      quizzes: false,
      forum: false,
    },
    status: EducationExportStatus.COMPLETED,
    fileName: 'education-export-export-1.json',
    filePath: '/tmp/exports/7/education-export-export-1.json',
    fileSize: 1536,
    errorMessage: null,
    createdAt: new Date('2026-06-13T00:00:00.000Z'),
    completedAt: new Date('2026-06-13T00:00:00.000Z'),
  } as EducationDataExport;

  let service: DataExportService;
  let userRepository: { findOne: jest.Mock };
  let userCourseRepository: { find: jest.Mock };
  let userLessonRepository: { find: jest.Mock };
  let flashcardDeckRepository: { find: jest.Mock };
  let flashcardRepository: { find: jest.Mock };
  let reviewSessionRepository: { find: jest.Mock };
  let quizSessionRepository: { find: jest.Mock };
  let socialPostRepository: { find: jest.Mock };
  let socialCommentRepository: { find: jest.Mock };
  let dataExportRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let activityLogService: { recordBestEffort: jest.Mock };

  beforeEach(async () => {
    mockedRandomUUID.mockReturnValue('export-1');
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.rename.mockResolvedValue(undefined);
    mockedFs.unlink.mockResolvedValue(undefined);
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue(Buffer.from('file-content'));

    userRepository = { findOne: jest.fn().mockResolvedValue(user) };
    userCourseRepository = { find: jest.fn().mockResolvedValue([]) };
    userLessonRepository = { find: jest.fn().mockResolvedValue([]) };
    flashcardDeckRepository = { find: jest.fn().mockResolvedValue([]) };
    flashcardRepository = { find: jest.fn().mockResolvedValue([]) };
    reviewSessionRepository = { find: jest.fn().mockResolvedValue([]) };
    quizSessionRepository = { find: jest.fn().mockResolvedValue([]) };
    socialPostRepository = { find: jest.fn().mockResolvedValue([]) };
    socialCommentRepository = { find: jest.fn().mockResolvedValue([]) };
    dataExportRepository = {
      find: jest.fn().mockResolvedValue([baseDataExport]),
      findOne: jest.fn().mockResolvedValue(baseDataExport),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        ...value,
        createdAt: value.createdAt ?? new Date('2026-06-13T00:00:00.000Z'),
      })),
    };
    activityLogService = {
      recordBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DataExportService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        {
          provide: getRepositoryToken(UserCourse),
          useValue: userCourseRepository,
        },
        {
          provide: getRepositoryToken(UserLesson),
          useValue: userLessonRepository,
        },
        {
          provide: getRepositoryToken(FlashcardDeck),
          useValue: flashcardDeckRepository,
        },
        {
          provide: getRepositoryToken(Flashcard),
          useValue: flashcardRepository,
        },
        {
          provide: getRepositoryToken(ReviewSession),
          useValue: reviewSessionRepository,
        },
        {
          provide: getRepositoryToken(QuizSession),
          useValue: quizSessionRepository,
        },
        {
          provide: getRepositoryToken(EducationSocialPost),
          useValue: socialPostRepository,
        },
        {
          provide: getRepositoryToken(EducationSocialComment),
          useValue: socialCommentRepository,
        },
        {
          provide: getRepositoryToken(EducationDataExport),
          useValue: dataExportRepository,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('exports/education') },
        },
        { provide: ActivityLogService, useValue: activityLogService },
      ],
    }).compile();

    service = moduleRef.get(DataExportService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists export history with human-readable file size', async () => {
    const items = await service.list(7);

    expect(items).toEqual([
      {
        id: 'export-1',
        date: '2026-06-13T00:00:00.000Z',
        format: EducationExportFormat.JSON,
        status: EducationExportStatus.COMPLETED,
        size: '1.5 KB',
        name: 'education-export-export-1.json',
      },
    ]);
  });

  it('creates a json export and writes the file atomically', async () => {
    const result = await service.create(7, {
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

    expect(mockedFs.mkdir).toHaveBeenCalledWith(
      'exports/education/7',
      expect.objectContaining({ recursive: true }),
    );
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      'exports/education/7/export-1.tmp',
      expect.any(Buffer),
    );
    const payload = JSON.parse(
      (mockedFs.writeFile.mock.calls[0]?.[1] as Buffer).toString('utf8'),
    );
    expect(payload.profile[0]).toMatchObject({
      id: '7',
      email: 'learner@example.com',
    });
    expect(mockedFs.rename).toHaveBeenCalledWith(
      'exports/education/7/export-1.tmp',
      'exports/education/7/education-export-export-1.json',
    );
    expect(activityLogService.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        type: EducationActivityType.SYSTEM,
        action: 'data_export_created',
      }),
    );
    expect(result).toMatchObject({
      id: 'export-1',
      date: '2026-06-13T00:00:00.000Z',
      format: EducationExportFormat.JSON,
      status: EducationExportStatus.COMPLETED,
      name: 'education-export-export-1.json',
    });
    expect(result.size).toEqual(expect.any(String));
  });

  it('returns the stored export file for download', async () => {
    const file = await service.download(7, 'export-1');

    expect(mockedFs.readFile).toHaveBeenCalledWith(
      '/tmp/exports/7/education-export-export-1.json',
    );
    expect(file).toEqual({
      buffer: Buffer.from('file-content'),
      fileName: 'education-export-export-1.json',
      contentType: 'application/json',
    });
  });
});
