import {
  BadRequestException,
  ParseUUIDPipe,
  RequestMethod,
} from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import type { RequestWithUser } from '../../common/types/auth.types';
import {
  CreateEducationSocialCommentDto,
  CreateEducationSocialPostDto,
  EducationSocialFeedQueryDto,
} from './dto/social.dto';
import { EducationSocialController } from './education-social.controller';
import { EducationSocialService } from './education-social.service';

describe('EducationSocialController', () => {
  const request = {
    user: {
      id: 7,
      sub: 7,
      email: 'learner@example.com',
      roles: ['user'],
    },
  } as RequestWithUser;

  let service: Record<string, jest.Mock>;
  let controller: EducationSocialController;

  beforeEach(async () => {
    service = {
      getFeed: jest.fn(),
      createPost: jest.fn(),
      toggleLike: jest.fn(),
      toggleBookmark: jest.fn(),
      addComment: jest.fn(),
      getTrending: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [EducationSocialController],
      providers: [{ provide: EducationSocialService, useValue: service }],
    }).compile();

    controller = moduleRef.get(EducationSocialController);
  });

  it('registers the exact /social routes and HTTP methods', () => {
    expect(Reflect.getMetadata(PATH_METADATA, EducationSocialController)).toBe(
      'social',
    );
    expectRoute('getFeed', 'feed', RequestMethod.GET);
    expectRoute('createPost', 'posts', RequestMethod.POST);
    expectRoute('toggleLike', 'posts/:postId/like', RequestMethod.POST);
    expectRoute('toggleBookmark', 'posts/:postId/bookmark', RequestMethod.POST);
    expectRoute('addComment', 'posts/:postId/comments', RequestMethod.POST);
    expectRoute('getTrending', 'trending', RequestMethod.GET);
  });

  it('keeps every social route behind the global JWT guard', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, EducationSocialController),
    ).toBeUndefined();

    for (const methodName of [
      'getFeed',
      'createPost',
      'toggleLike',
      'toggleBookmark',
      'addComment',
      'getTrending',
    ] as const) {
      expect(
        Reflect.getMetadata(
          IS_PUBLIC_KEY,
          EducationSocialController.prototype[methodName],
        ),
      ).toBeUndefined();
    }
  });

  it.each(['toggleLike', 'toggleBookmark', 'addComment'] as const)(
    'validates %s postId as a UUID v4',
    async (methodName) => {
      const pipes = getPostIdPipes(methodName);
      const uuidPipe = pipes.find(
        (pipe): pipe is ParseUUIDPipe => pipe instanceof ParseUUIDPipe,
      );

      expect(uuidPipe).toBeDefined();
      await expect(
        uuidPipe!.transform('not-a-uuid', {
          type: 'param',
          metatype: String,
          data: 'postId',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        uuidPipe!.transform('11111111-1111-4111-8111-111111111111', {
          type: 'param',
          metatype: String,
          data: 'postId',
        }),
      ).resolves.toBe('11111111-1111-4111-8111-111111111111');
      await expect(
        uuidPipe!.transform('11111111-1111-3111-8111-111111111111', {
          type: 'param',
          metatype: String,
          data: 'postId',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('passes the JWT subject to feed and create post operations', async () => {
    const query = Object.assign(new EducationSocialFeedQueryDto(), {
      page: 2,
    });
    const createDto = Object.assign(new CreateEducationSocialPostDto(), {
      content: 'Study update',
    });

    service.getFeed.mockResolvedValue({ data: [], meta: { total: 0 } });
    service.createPost.mockResolvedValue({ id: 'post-1' });

    await expect(controller.getFeed(request, query)).resolves.toEqual({
      data: [],
      meta: { total: 0 },
    });
    await expect(controller.createPost(request, createDto)).resolves.toEqual({
      id: 'post-1',
    });

    expect(service.getFeed).toHaveBeenCalledWith(request.user!.sub, query);
    expect(service.createPost).toHaveBeenCalledWith(
      request.user!.sub,
      createDto,
    );
  });

  it('passes post IDs and JWT subject to all post mutations', async () => {
    const commentDto = Object.assign(new CreateEducationSocialCommentDto(), {
      content: 'Keep going',
    });

    service.toggleLike.mockResolvedValue({ likes: 1, isLiked: true });
    service.toggleBookmark.mockResolvedValue({ isBookmarked: true });
    service.addComment.mockResolvedValue({ id: 'comment-1' });

    await expect(controller.toggleLike(request, 'post-1')).resolves.toEqual({
      likes: 1,
      isLiked: true,
    });
    await expect(controller.toggleBookmark(request, 'post-1')).resolves.toEqual(
      { isBookmarked: true },
    );
    await expect(
      controller.addComment(request, 'post-1', commentDto),
    ).resolves.toEqual({ id: 'comment-1' });

    expect(service.toggleLike).toHaveBeenCalledWith(
      request.user!.sub,
      'post-1',
    );
    expect(service.toggleBookmark).toHaveBeenCalledWith(
      request.user!.sub,
      'post-1',
    );
    expect(service.addComment).toHaveBeenCalledWith(
      request.user!.sub,
      'post-1',
      commentDto,
    );
  });

  it('keeps trending protected and delegates without user-specific arguments', async () => {
    service.getTrending.mockResolvedValue([{ tag: '#HSK1', posts: '2 posts' }]);

    await expect(controller.getTrending()).resolves.toEqual([
      { tag: '#HSK1', posts: '2 posts' },
    ]);

    expect(service.getTrending).toHaveBeenCalledWith();
  });
});

function expectRoute(
  methodName: keyof EducationSocialController,
  path: string,
  method: RequestMethod,
) {
  const handler = EducationSocialController.prototype[methodName];
  expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
  expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
}

function getPostIdPipes(
  methodName: 'toggleLike' | 'toggleBookmark' | 'addComment',
): unknown[] {
  const metadata =
    Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      EducationSocialController,
      methodName,
    ) ?? {};
  const postIdArgument = Object.values(metadata).find(
    (argument) =>
      typeof argument === 'object' &&
      argument !== null &&
      'data' in argument &&
      argument.data === 'postId',
  ) as { pipes?: unknown[] } | undefined;

  return postIdArgument?.pipes ?? [];
}
