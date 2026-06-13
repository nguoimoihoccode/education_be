import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EducationActivityType } from '../activity-log/entities/activity-log.entity';
import { UserStreak } from '../education/entities/user-streak.entity';
import { User } from '../users/entities/user.entity';
import {
  CreateEducationSocialCommentDto,
  CreateEducationSocialPostDto,
  EducationSocialFeedQueryDto,
} from './dto/social.dto';
import { EducationSocialPostBookmark } from './entities/social-post-bookmark.entity';
import { EducationSocialPostLike } from './entities/social-post-like.entity';
import { EducationSocialComment } from './entities/social-comment.entity';
import {
  EducationSocialPost,
  EducationSocialPostType,
} from './entities/social-post.entity';
import {
  EducationSocialService,
  getEducationSocialBadge,
  normalizeEducationSocialTags,
} from './education-social.service';

type RepositoryDouble<T extends object> = Pick<
  Repository<T>,
  'create' | 'save' | 'findOne'
>;

describe('EducationSocialService', () => {
  let postRepository: jest.Mocked<RepositoryDouble<EducationSocialPost>>;
  let commentRepository: jest.Mocked<RepositoryDouble<EducationSocialComment>>;
  let userRepository: jest.Mocked<Pick<Repository<User>, 'findOne'>>;
  let streakRepository: jest.Mocked<Pick<Repository<UserStreak>, 'findOne'>>;
  let dataSource: { query: jest.Mock; transaction: jest.Mock };
  let activityLogService: { recordBestEffort: jest.Mock };
  let service: EducationSocialService;

  beforeEach(() => {
    postRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    commentRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    userRepository = {
      findOne: jest.fn(),
    };
    streakRepository = {
      findOne: jest.fn(),
    };
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn(),
    };
    activityLogService = {
      recordBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    service = new EducationSocialService(
      postRepository as unknown as Repository<EducationSocialPost>,
      commentRepository as unknown as Repository<EducationSocialComment>,
      userRepository as unknown as Repository<User>,
      streakRepository as unknown as Repository<UserStreak>,
      dataSource as unknown as DataSource,
      activityLogService as unknown as ActivityLogService,
    );
  });

  it('normalizes tags while retaining the first display casing', () => {
    expect(
      normalizeEducationSocialTags([
        ' #HSK1 ',
        '##hsk1',
        '# Chinese ',
        '###',
        '',
        'Study',
      ]),
    ).toEqual(['HSK1', 'Chinese', 'Study']);

    expect(
      normalizeEducationSocialTags(
        Array.from({ length: 12 }, (_, index) => `#Tag${index}`),
      ),
    ).toHaveLength(10);
  });

  it('normalizes tags without locale-sensitive case folding', () => {
    const localeLowerCase = jest
      .spyOn(String.prototype, 'toLocaleLowerCase')
      .mockImplementation(() => {
        throw new Error('locale-sensitive folding must not be used');
      });

    try {
      expect(normalizeEducationSocialTags(['#Study', '#study'])).toEqual([
        'Study',
      ]);
      expect(localeLowerCase).not.toHaveBeenCalled();
    } finally {
      localeLowerCase.mockRestore();
    }
  });

  it('derives a deterministic badge from level and streak', () => {
    expect(getEducationSocialBadge(20, 0)).toBe('trophy');
    expect(getEducationSocialBadge(4, 7)).toBe('streak');
    expect(getEducationSocialBadge(4, 2)).toBe('learner');
  });

  it('validates post and comment DTO limits, URL, tags, enum, and defaults', async () => {
    const validPost = plainToInstance(CreateEducationSocialPostDto, {
      content: 'Study update',
      image: 'https://example.com/study.png',
      tags: ['HSK1'],
    });
    const invalidPost = plainToInstance(CreateEducationSocialPostDto, {
      content: 'x'.repeat(5001),
      image: 'not-a-url',
      tags: Array.from({ length: 11 }, (_, index) => `tag-${index}`),
      type: 'unknown',
    });
    const invalidComment = plainToInstance(CreateEducationSocialCommentDto, {
      content: 'x'.repeat(2001),
    });

    expect(await validate(validPost)).toEqual([]);
    expect(validPost.type).toBe(EducationSocialPostType.SHARE);
    expect(
      (await validate(invalidPost)).map((error) => error.property),
    ).toEqual(expect.arrayContaining(['content', 'image', 'tags', 'type']));
    expect(
      (await validate(invalidComment)).map((error) => error.property),
    ).toContain('content');
  });

  it('accepts only explicit HTTP and HTTPS image URLs', async () => {
    const httpPost = plainToInstance(CreateEducationSocialPostDto, {
      content: 'Local image',
      image: 'http://localhost:3000/image.png',
    });
    const httpsPost = plainToInstance(CreateEducationSocialPostDto, {
      content: 'Remote image',
      image: 'https://example.com/image.png',
    });
    const ftpPost = plainToInstance(CreateEducationSocialPostDto, {
      content: 'FTP image',
      image: 'ftp://example.com/image.png',
    });
    const protocolRelativePost = plainToInstance(CreateEducationSocialPostDto, {
      content: 'Protocol relative image',
      image: '//example.com/image.png',
    });

    expect(await validate(httpPost)).toEqual([]);
    expect(await validate(httpsPost)).toEqual([]);
    expect((await validate(ftpPost)).map(({ property }) => property)).toContain(
      'image',
    );
    expect(
      (await validate(protocolRelativePost)).map(({ property }) => property),
    ).toContain('image');
  });

  it('transforms and validates feed pagination and type', async () => {
    const defaults = plainToInstance(EducationSocialFeedQueryDto, {});
    const valid = plainToInstance(EducationSocialFeedQueryDto, {
      page: '2',
      limit: '100',
      type: EducationSocialPostType.QUESTION,
    });
    const invalid = plainToInstance(EducationSocialFeedQueryDto, {
      page: '0',
      limit: '101',
      type: 'unknown',
    });

    expect(await validate(defaults)).toEqual([]);
    expect(defaults).toMatchObject({ page: 1, limit: 20 });
    expect(await validate(valid)).toEqual([]);
    expect(valid).toMatchObject({
      page: 2,
      limit: 100,
      type: EducationSocialPostType.QUESTION,
    });
    expect((await validate(invalid)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'limit', 'type']),
    );
  });

  it('rejects whitespace-only post and comment content before saving', async () => {
    await expect(
      service.createPost(7, { content: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.addComment(7, 'post-1', { content: '\n\t' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(postRepository.save).not.toHaveBeenCalled();
    expect(commentRepository.save).not.toHaveBeenCalled();
  });

  it('returns a bounded filtered feed with exact FE mapping and metadata', async () => {
    dataSource.query.mockResolvedValue([
      {
        total: 21,
        data: [
          {
            id: 'post-1',
            authorId: 7,
            authorName: 'Learner',
            authorAvatar: null,
            level: 4,
            currentStreak: 8,
            content: 'Study update',
            image: null,
            likes: '1',
            comments: [],
            shares: 0,
            isLiked: true,
            isBookmarked: false,
            createdAt: '2026-06-12T10:00:00.000Z',
            tags: ['HSK1'],
            type: EducationSocialPostType.SHARE,
          },
        ],
      },
    ]);

    const result = await service.getFeed(7, {
      type: EducationSocialPostType.SHARE,
      page: 2,
      limit: 20,
    });

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $3 OFFSET $4'),
      [7, EducationSocialPostType.SHARE, 20, 20],
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
    const feedSql = dataSource.query.mock.calls[0][0] as string;
    expect(feedSql).toContain('post.type = $2::edu_social_post_type_enum');
    expect(feedSql).not.toContain('post.type::text');
    expect(feedSql).not.toContain('WITH filtered_posts AS');
    expect(feedSql).toMatch(/ORDER BY post\.created_at DESC, post\.id ASC/);
    expect(feedSql.indexOf('LIMIT $3 OFFSET $4')).toBeLessThan(
      feedSql.indexOf('FROM edu_social_comments comment'),
    );
    expect(result).toEqual({
      data: [
        {
          id: 'post-1',
          author: {
            id: '7',
            name: 'Learner',
            avatar: undefined,
            level: 4,
            badge: 'streak',
          },
          content: 'Study update',
          image: undefined,
          likes: 1,
          comments: [],
          shares: 0,
          isLiked: true,
          isBookmarked: false,
          createdAt: '2026-06-12T10:00:00.000Z',
          tags: ['HSK1'],
          type: EducationSocialPostType.SHARE,
        },
      ],
      meta: {
        page: 2,
        limit: 20,
        total: 21,
        totalPages: 2,
      },
    });
  });

  it('serializes feed and comment timestamps explicitly as UTC ISO strings', async () => {
    dataSource.query.mockResolvedValue([
      {
        total: 1,
        data: [
          {
            id: 'post-1',
            authorId: 7,
            authorName: 'Learner',
            authorAvatar: null,
            level: 1,
            currentStreak: 0,
            content: 'UTC post',
            image: null,
            likes: 0,
            comments: [
              {
                id: 'comment-1',
                authorId: 8,
                author: 'Commenter',
                avatar: null,
                content: 'UTC comment',
                createdAt: '2026-06-12T09:00:00.123Z',
                likes: 0,
              },
            ],
            shares: 0,
            isLiked: false,
            isBookmarked: false,
            createdAt: '2026-06-12T10:00:00.456Z',
            tags: [],
            type: EducationSocialPostType.SHARE,
          },
        ],
      },
    ]);

    const result = await service.getFeed(7, {});
    const feedSql = dataSource.query.mock.calls[0][0] as string;

    expect(feedSql).toMatch(
      /to_char\(\s*post\.created_at AT TIME ZONE 'UTC',\s*'YYYY-MM-DD"T"HH24:MI:SS\.MS"Z"'\s*\)/,
    );
    expect(feedSql).toMatch(
      /to_char\(\s*comment\.created_at AT TIME ZONE 'UTC',\s*'YYYY-MM-DD"T"HH24:MI:SS\.MS"Z"'\s*\)/,
    );
    expect(result.data[0].createdAt).toBe('2026-06-12T10:00:00.456Z');
    expect(result.data[0].comments[0].createdAt).toBe(
      '2026-06-12T09:00:00.123Z',
    );
  });

  it('rejects timezone-less timestamps returned by the feed query', async () => {
    dataSource.query.mockResolvedValue([
      {
        total: 1,
        data: [
          {
            id: 'post-1',
            authorId: 7,
            authorName: 'Learner',
            authorAvatar: null,
            level: 1,
            currentStreak: 0,
            content: 'Invalid timestamp',
            image: null,
            likes: 0,
            comments: [],
            shares: 0,
            isLiked: false,
            isBookmarked: false,
            createdAt: '2026-06-12 10:00:00',
            tags: [],
            type: EducationSocialPostType.SHARE,
          },
        ],
      },
    ]);

    await expect(service.getFeed(7, {})).rejects.toThrow(
      'Invalid UTC timestamp',
    );
  });

  it('limits each feed preview to the latest 100 comments then orders them ascending', async () => {
    dataSource.query.mockResolvedValue([{ total: 0, data: [] }]);

    await service.getFeed(7, {});

    const feedSql = dataSource.query.mock.calls[0][0] as string;
    const commentsStart = feedSql.indexOf('FROM edu_social_comments comment');
    const commentsLimit = feedSql.indexOf('LIMIT 100', commentsStart);

    expect(commentsStart).toBeGreaterThan(-1);
    expect(feedSql.slice(commentsStart, commentsLimit)).toMatch(
      /ORDER BY comment\.created_at DESC, comment\.id DESC/,
    );
    expect(commentsLimit).toBeGreaterThan(commentsStart);
    expect(feedSql).toMatch(
      /SELECT jsonb_agg\([\s\S]*ORDER BY limited_comment\.created_at ASC, limited_comment\.id ASC[\s\S]*FROM \([\s\S]*FROM edu_social_comments comment[\s\S]*ORDER BY comment\.created_at DESC, comment\.id DESC[\s\S]*LIMIT 100[\s\S]*\) limited_comment/,
    );
  });

  it('uses feed defaults and returns total metadata for an empty page', async () => {
    dataSource.query.mockResolvedValue([{ total: '7', data: [] }]);

    const result = await service.getFeed(7, {});

    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      7,
      null,
      20,
      0,
    ]);
    expect(result).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 7, totalPages: 1 },
    });
  });

  it('defaults missing author streak values and normalizes raw database values', async () => {
    dataSource.query.mockResolvedValue([
      {
        total: '1',
        data: [
          {
            id: 'post-1',
            authorId: '7',
            authorName: 'Learner',
            authorAvatar: '/avatar.png',
            level: null,
            currentStreak: null,
            content: 'Study update',
            image: 'https://example.com/study.png',
            likes: '2',
            comments: null,
            shares: '3',
            isLiked: true,
            isBookmarked: false,
            createdAt: '2026-06-12T10:00:00.000Z',
            tags: null,
            type: EducationSocialPostType.SHARE,
          },
        ],
      },
    ]);

    const result = await service.getFeed(7, {});

    expect(result.data[0]).toEqual({
      id: 'post-1',
      author: {
        id: '7',
        name: 'Learner',
        avatar: '/avatar.png',
        level: 1,
        badge: 'learner',
      },
      content: 'Study update',
      image: 'https://example.com/study.png',
      likes: 2,
      comments: [],
      shares: 3,
      isLiked: true,
      isBookmarked: false,
      createdAt: '2026-06-12T10:00:00.000Z',
      tags: [],
      type: EducationSocialPostType.SHARE,
    });
  });

  it('sorts comments stably and maps their exact FE shape', async () => {
    dataSource.query.mockResolvedValue([
      {
        total: 1,
        data: [
          {
            id: 'post-1',
            authorId: 7,
            authorName: 'Learner',
            authorAvatar: null,
            level: 1,
            currentStreak: 0,
            content: 'Question',
            image: null,
            likes: 0,
            comments: [
              {
                id: 'comment-b',
                authorId: 9,
                author: 'Second',
                avatar: null,
                content: 'B',
                createdAt: '2026-06-12T11:00:00.000Z',
                likes: '2',
              },
              {
                id: 'comment-c',
                authorId: 8,
                author: 'Same time',
                avatar: null,
                content: 'C',
                createdAt: '2026-06-12T10:00:00.000Z',
                likes: 0,
              },
              {
                id: 'comment-a',
                authorId: 8,
                author: 'First',
                avatar: '/avatar.png',
                content: 'A',
                createdAt: '2026-06-12T10:00:00.000Z',
                likes: 1,
              },
            ],
            shares: 0,
            isLiked: false,
            isBookmarked: true,
            createdAt: '2026-06-12T09:00:00.000Z',
            tags: [],
            type: EducationSocialPostType.QUESTION,
          },
        ],
      },
    ]);

    const result = await service.getFeed(7, {});

    expect(result.data[0].comments).toEqual([
      {
        id: 'comment-a',
        authorId: '8',
        author: 'First',
        avatar: '/avatar.png',
        content: 'A',
        createdAt: '2026-06-12T10:00:00.000Z',
        likes: 1,
      },
      {
        id: 'comment-c',
        authorId: '8',
        author: 'Same time',
        avatar: undefined,
        content: 'C',
        createdAt: '2026-06-12T10:00:00.000Z',
        likes: 0,
      },
      {
        id: 'comment-b',
        authorId: '9',
        author: 'Second',
        avatar: undefined,
        content: 'B',
        createdAt: '2026-06-12T11:00:00.000Z',
        likes: 2,
      },
    ]);
  });

  it('trims and creates a post, then records activity best effort', async () => {
    const savedPost = {
      id: 'post-1',
      authorId: 7,
      content: 'Study update',
      imageUrl: null,
      tags: ['HSK1', 'Chinese'],
      type: EducationSocialPostType.SHARE,
      sharesCount: 0,
      createdAt: new Date('2026-06-12T10:00:00.000Z'),
    } as EducationSocialPost;
    postRepository.create.mockImplementation(
      (input) => input as EducationSocialPost,
    );
    postRepository.save.mockResolvedValue(savedPost);
    userRepository.findOne.mockResolvedValue({
      id: 7,
      name: 'Learner',
      avatar: undefined,
    } as User);
    streakRepository.findOne.mockResolvedValue({
      level: 4,
      currentStreak: 8,
    } as UserStreak);

    const result = await service.createPost(7, {
      content: '  Study update  ',
      tags: [' #HSK1 ', '#hsk1', '#Chinese'],
    });

    expect(postRepository.create).toHaveBeenCalledWith({
      authorId: 7,
      content: 'Study update',
      imageUrl: null,
      tags: ['HSK1', 'Chinese'],
      type: EducationSocialPostType.SHARE,
    });
    expect(result.author.badge).toBe('streak');
    expect(result.comments).toEqual([]);
    expect(activityLogService.recordBestEffort).toHaveBeenCalledWith({
      userId: 7,
      type: EducationActivityType.SOCIAL,
      action: 'post_created',
      detail: 'Created a community post',
      metadata: {
        postId: 'post-1',
        sourceKey: 'social-post:post-1',
      },
    });
  });

  it('adds and maps a trimmed comment and records activity', async () => {
    postRepository.findOne.mockResolvedValue({
      id: 'post-1',
    } as EducationSocialPost);
    commentRepository.create.mockImplementation(
      (input) => input as EducationSocialComment,
    );
    commentRepository.save.mockResolvedValue({
      id: 'comment-1',
      postId: 'post-1',
      authorId: 7,
      content: 'Keep going',
      likesCount: 0,
      createdAt: new Date('2026-06-12T12:00:00.000Z'),
    } as EducationSocialComment);
    userRepository.findOne.mockResolvedValue({
      id: 7,
      name: 'Learner',
      avatar: '/avatar.png',
    } as User);

    const result = await service.addComment(7, 'post-1', {
      content: '  Keep going  ',
    });

    expect(commentRepository.create).toHaveBeenCalledWith({
      postId: 'post-1',
      authorId: 7,
      content: 'Keep going',
    });
    expect(result).toEqual({
      id: 'comment-1',
      authorId: '7',
      author: 'Learner',
      avatar: '/avatar.png',
      content: 'Keep going',
      createdAt: '2026-06-12T12:00:00.000Z',
      likes: 0,
    });
    expect(activityLogService.recordBestEffort).toHaveBeenCalledWith({
      userId: 7,
      type: EducationActivityType.SOCIAL,
      action: 'comment_created',
      detail: 'Commented on a community post',
      metadata: {
        postId: 'post-1',
        commentId: 'comment-1',
        sourceKey: 'social-comment:comment-1',
      },
    });
  });

  it('returns not found when adding a comment to an unknown post', async () => {
    postRepository.findOne.mockResolvedValue(null);

    await expect(
      service.addComment(7, 'missing', { content: 'Comment' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('toggles a like in a transaction and returns the current count', async () => {
    const likeRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((input) => input),
      save: jest.fn().mockResolvedValue({ id: 'like-1' }),
      remove: jest.fn(),
      count: jest.fn().mockResolvedValue(3),
    };
    const manager = createManagerDouble({
      post: { id: 'post-1' },
      likeRepository,
    });
    dataSource.transaction.mockImplementation(
      (callback: (entityManager: EntityManager) => unknown) =>
        callback(manager as unknown as EntityManager),
    );

    await expect(service.toggleLike(7, 'post-1')).resolves.toEqual({
      likes: 3,
      isLiked: true,
    });
    expect(manager.findOne).toHaveBeenCalledWith(
      EducationSocialPost,
      expect.objectContaining({
        where: { id: 'post-1' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(likeRepository.save).toHaveBeenCalledWith({
      postId: 'post-1',
      userId: 7,
    });
  });

  it('removes an existing like and returns the remaining count', async () => {
    const like = { id: 'like-1', postId: 'post-1', userId: 7 };
    const likeRepository = {
      findOne: jest.fn().mockResolvedValue(like),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn().mockResolvedValue(like),
      count: jest.fn().mockResolvedValue(2),
    };
    const manager = createManagerDouble({
      post: { id: 'post-1' },
      likeRepository,
    });
    dataSource.transaction.mockImplementation(
      (callback: (entityManager: EntityManager) => unknown) =>
        callback(manager as unknown as EntityManager),
    );

    await expect(service.toggleLike(7, 'post-1')).resolves.toEqual({
      likes: 2,
      isLiked: false,
    });
    expect(likeRepository.remove).toHaveBeenCalledWith(like);
    expect(likeRepository.save).not.toHaveBeenCalled();
  });

  it('removes an existing bookmark in a transaction', async () => {
    const bookmark = { id: 'bookmark-1', postId: 'post-1', userId: 7 };
    const bookmarkRepository = {
      findOne: jest.fn().mockResolvedValue(bookmark),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn().mockResolvedValue(bookmark),
    };
    const manager = createManagerDouble({
      post: { id: 'post-1' },
      bookmarkRepository,
    });
    dataSource.transaction.mockImplementation(
      (callback: (entityManager: EntityManager) => unknown) =>
        callback(manager as unknown as EntityManager),
    );

    await expect(service.toggleBookmark(7, 'post-1')).resolves.toEqual({
      isBookmarked: false,
    });
    expect(bookmarkRepository.remove).toHaveBeenCalledWith(bookmark);
  });

  it('creates a missing bookmark while holding the post lock', async () => {
    const bookmarkRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((input) => input),
      save: jest.fn().mockResolvedValue({ id: 'bookmark-1' }),
      remove: jest.fn(),
    };
    const manager = createManagerDouble({
      post: { id: 'post-1' },
      bookmarkRepository,
    });
    dataSource.transaction.mockImplementation(
      (callback: (entityManager: EntityManager) => unknown) =>
        callback(manager as unknown as EntityManager),
    );

    await expect(service.toggleBookmark(7, 'post-1')).resolves.toEqual({
      isBookmarked: true,
    });
    expect(manager.findOne).toHaveBeenCalledWith(
      EducationSocialPost,
      expect.objectContaining({
        where: { id: 'post-1' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(bookmarkRepository.save).toHaveBeenCalledWith({
      postId: 'post-1',
      userId: 7,
    });
  });

  it('returns not found when toggling an unknown post', async () => {
    const manager = createManagerDouble({ post: null });
    dataSource.transaction.mockImplementation(
      (callback: (entityManager: EntityManager) => unknown) =>
        callback(manager as unknown as EntityManager),
    );

    await expect(service.toggleLike(7, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.toggleBookmark(7, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('retries only the expected unique constraint race', async () => {
    dataSource.transaction
      .mockRejectedValueOnce({
        code: '23505',
        constraint: 'UQ_edu_social_post_likes_post_user',
      })
      .mockResolvedValueOnce({ likes: 1, isLiked: true });

    await expect(service.toggleLike(7, 'post-1')).resolves.toEqual({
      likes: 1,
      isLiked: true,
    });
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
  });

  it('does not hide unrelated unique violations or transaction errors', async () => {
    const unrelatedUniqueError = {
      code: '23505',
      constraint: 'UQ_users_email',
    };
    dataSource.transaction.mockRejectedValueOnce(unrelatedUniqueError);

    await expect(service.toggleLike(7, 'post-1')).rejects.toBe(
      unrelatedUniqueError,
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);

    const otherSocialConstraint = {
      code: '23505',
      constraint: 'UQ_edu_social_post_likes_post_user',
    };
    dataSource.transaction.mockRejectedValueOnce(otherSocialConstraint);

    await expect(service.toggleBookmark(7, 'post-1')).rejects.toBe(
      otherSocialConstraint,
    );

    const databaseError = new Error('database unavailable');
    dataSource.transaction.mockRejectedValueOnce(databaseError);

    await expect(service.toggleBookmark(7, 'post-1')).rejects.toBe(
      databaseError,
    );
  });

  it('queries real tag counts for the last 30 days and maps trending topics', async () => {
    dataSource.query.mockResolvedValue([
      { tag: 'HSK1', count: '24' },
      { tag: 'Chinese', count: 3 },
    ]);

    const result = await service.getTrending();

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringMatching(/unnest\(post\.tags\)[\s\S]*30 days/i),
    );
    const sql = dataSource.query.mock.calls[0][0] as string;
    expect(sql).toMatch(/GROUP BY lower\(tag\)/);
    expect(sql).toMatch(/ORDER BY count DESC, tag_key ASC/);
    expect(sql).toMatch(/LIMIT 10/);
    expect(result).toEqual([
      { tag: '#HSK1', posts: '24 posts' },
      { tag: '#Chinese', posts: '3 posts' },
    ]);
  });
});

function createManagerDouble(options: {
  post: { id: string } | null;
  likeRepository?: Record<string, jest.Mock>;
  bookmarkRepository?: Record<string, jest.Mock>;
}) {
  return {
    findOne: jest.fn().mockResolvedValue(options.post),
    getRepository: jest.fn((entity: object) => {
      if (entity === EducationSocialPostLike) {
        return options.likeRepository;
      }
      if (entity === EducationSocialPostBookmark) {
        return options.bookmarkRepository;
      }
      throw new Error('Unexpected repository');
    }),
  };
}
