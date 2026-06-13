import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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

export type EducationSocialCommentResponse = {
  id: string;
  authorId: string;
  author: string;
  avatar?: string;
  content: string;
  createdAt: string;
  likes: number;
};

export type EducationSocialPostResponse = {
  id: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
    level: number;
    badge: string;
  };
  content: string;
  image?: string;
  likes: number;
  comments: EducationSocialCommentResponse[];
  shares: number;
  isLiked: boolean;
  isBookmarked: boolean;
  createdAt: string;
  tags: string[];
  type: EducationSocialPostType;
};

type FeedCommentRow = {
  id: string;
  authorId: number | string;
  author: string;
  avatar?: string | null;
  content: string;
  createdAt: Date | string;
  likes: number | string;
};

type FeedPostRow = {
  id: string;
  authorId: number | string;
  authorName: string;
  authorAvatar?: string | null;
  level: number | string | null;
  currentStreak: number | string | null;
  content: string;
  image?: string | null;
  likes: number | string;
  comments?: FeedCommentRow[] | null;
  shares: number | string;
  isLiked: boolean;
  isBookmarked: boolean;
  createdAt: Date | string;
  tags?: string[] | null;
  type: EducationSocialPostType;
};

type FeedEnvelopeRow = {
  total: number | string;
  data: FeedPostRow[];
};

type TrendingRow = {
  tag: string;
  count: number | string;
};

const LIKE_UNIQUE_CONSTRAINT = 'UQ_edu_social_post_likes_post_user';
const BOOKMARK_UNIQUE_CONSTRAINT = 'UQ_edu_social_post_bookmarks_post_user';

export function normalizeEducationSocialTags(tags?: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of tags ?? []) {
    const tag = rawTag.trim().replace(/^#+/, '').trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(tag);
    if (normalized.length === 10) {
      break;
    }
  }

  return normalized;
}

export function getEducationSocialBadge(
  level: number,
  currentStreak: number,
): string {
  if (level >= 20) {
    return 'trophy';
  }
  if (currentStreak >= 7) {
    return 'streak';
  }
  return 'learner';
}

@Injectable()
export class EducationSocialService {
  constructor(
    @InjectRepository(EducationSocialPost)
    private readonly postRepository: Repository<EducationSocialPost>,
    @InjectRepository(EducationSocialComment)
    private readonly commentRepository: Repository<EducationSocialComment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserStreak)
    private readonly streakRepository: Repository<UserStreak>,
    private readonly dataSource: DataSource,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async getFeed(
    currentUserId: number,
    query: EducationSocialFeedQueryDto,
  ): Promise<{
    data: EducationSocialPostResponse[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    const rows = await this.dataSource.query<FeedEnvelopeRow[]>(
      this.buildFeedQuery(),
      [currentUserId, query.type ?? null, limit, offset],
    );
    const envelope = rows[0] ?? { total: 0, data: [] };
    const total = Number(envelope.total);

    return {
      data: (envelope.data ?? []).map((post) => this.mapFeedPost(post)),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async createPost(
    currentUserId: number,
    dto: CreateEducationSocialPostDto,
  ): Promise<EducationSocialPostResponse> {
    const content = this.requireTrimmedContent(dto.content, 'Post content');
    const author = await this.findUser(currentUserId);
    const streak = await this.streakRepository.findOne({
      where: { userId: String(currentUserId) },
    });
    const post = this.postRepository.create({
      authorId: currentUserId,
      content,
      imageUrl: dto.image ?? null,
      tags: normalizeEducationSocialTags(dto.tags),
      type: dto.type ?? EducationSocialPostType.SHARE,
    });
    const savedPost = await this.postRepository.save(post);

    await this.activityLogService.recordBestEffort({
      userId: currentUserId,
      type: EducationActivityType.SOCIAL,
      action: 'post_created',
      detail: 'Created a community post',
      metadata: {
        postId: savedPost.id,
        sourceKey: `social-post:${savedPost.id}`,
      },
    });

    return this.mapCreatedPost(savedPost, author, streak);
  }

  async toggleLike(
    currentUserId: number,
    postId: string,
  ): Promise<{ likes: number; isLiked: boolean }> {
    return this.withUniqueConflictRetry(
      () =>
        this.dataSource.transaction(async (manager) => {
          await this.requireLockedPost(manager, postId);
          const repository = manager.getRepository(EducationSocialPostLike);
          const existing = await repository.findOne({
            where: { postId, userId: currentUserId },
          });
          let isLiked: boolean;

          if (existing) {
            await repository.remove(existing);
            isLiked = false;
          } else {
            await repository.save(
              repository.create({ postId, userId: currentUserId }),
            );
            isLiked = true;
          }

          const likes = await repository.count({ where: { postId } });
          return { likes, isLiked };
        }),
      LIKE_UNIQUE_CONSTRAINT,
    );
  }

  async toggleBookmark(
    currentUserId: number,
    postId: string,
  ): Promise<{ isBookmarked: boolean }> {
    return this.withUniqueConflictRetry(
      () =>
        this.dataSource.transaction(async (manager) => {
          await this.requireLockedPost(manager, postId);
          const repository = manager.getRepository(EducationSocialPostBookmark);
          const existing = await repository.findOne({
            where: { postId, userId: currentUserId },
          });

          if (existing) {
            await repository.remove(existing);
            return { isBookmarked: false };
          }

          await repository.save(
            repository.create({ postId, userId: currentUserId }),
          );
          return { isBookmarked: true };
        }),
      BOOKMARK_UNIQUE_CONSTRAINT,
    );
  }

  async addComment(
    currentUserId: number,
    postId: string,
    dto: CreateEducationSocialCommentDto,
  ): Promise<EducationSocialCommentResponse> {
    const content = this.requireTrimmedContent(dto.content, 'Comment content');
    const [post, author] = await Promise.all([
      this.postRepository.findOne({ where: { id: postId } }),
      this.findUser(currentUserId),
    ]);
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const comment = this.commentRepository.create({
      postId,
      authorId: currentUserId,
      content,
    });
    const savedComment = await this.commentRepository.save(comment);

    await this.activityLogService.recordBestEffort({
      userId: currentUserId,
      type: EducationActivityType.SOCIAL,
      action: 'comment_created',
      detail: 'Commented on a community post',
      metadata: {
        postId,
        commentId: savedComment.id,
        sourceKey: `social-comment:${savedComment.id}`,
      },
    });

    return this.mapComment({
      id: savedComment.id,
      authorId: currentUserId,
      author: this.getDisplayName(author),
      avatar: author.avatar,
      content: savedComment.content,
      createdAt: savedComment.createdAt,
      likes: savedComment.likesCount,
    });
  }

  async getTrending(): Promise<Array<{ tag: string; posts: string }>> {
    const rows = await this.dataSource.query<TrendingRow[]>(`
      WITH normalized_tags AS (
        SELECT
          post.id AS post_id,
          post.created_at,
          regexp_replace(btrim(raw_tag), '^#+', '') AS tag
        FROM edu_social_posts post
        CROSS JOIN LATERAL unnest(post.tags) AS raw_tag
        WHERE post.created_at >= now() - interval '30 days'
      ),
      counted_tags AS (
        SELECT
          lower(tag) AS tag_key,
          (array_agg(tag ORDER BY created_at ASC, post_id ASC))[1] AS tag,
          COUNT(DISTINCT post_id)::int AS count
        FROM normalized_tags
        WHERE tag <> ''
        GROUP BY lower(tag)
      )
      SELECT tag, count
      FROM counted_tags
      ORDER BY count DESC, tag_key ASC
      LIMIT 10
    `);

    return rows.map((row) => ({
      tag: `#${row.tag}`,
      posts: `${Number(row.count)} posts`,
    }));
  }

  private buildFeedQuery(): string {
    return `
      WITH filtered_posts AS (
        SELECT post.*
        FROM edu_social_posts post
        WHERE ($2::text IS NULL OR post.type::text = $2)
      ),
      post_count AS (
        SELECT COUNT(*)::int AS total
        FROM filtered_posts
      ),
      page_posts AS (
        SELECT *
        FROM filtered_posts
        ORDER BY created_at DESC, id ASC
        LIMIT $3 OFFSET $4
      )
      SELECT
        post_count.total,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', post.id,
              'authorId', post.author_id,
              'authorName', COALESCE(
                NULLIF(author.name, ''),
                NULLIF(author.username, ''),
                author.email
              ),
              'authorAvatar', author.avatar,
              'level', COALESCE(streak.level, 1),
              'currentStreak', COALESCE(streak.current_streak, 0),
              'content', post.content,
              'image', post.image_url,
              'likes', (
                SELECT COUNT(*)::int
                FROM edu_social_post_likes post_like
                WHERE post_like.post_id = post.id
              ),
              'comments', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', comment.id,
                    'authorId', comment.author_id,
                    'author', COALESCE(
                      NULLIF(comment_author.name, ''),
                      NULLIF(comment_author.username, ''),
                      comment_author.email
                    ),
                    'avatar', comment_author.avatar,
                    'content', comment.content,
                    'createdAt', comment.created_at,
                    'likes', comment.likes_count
                  )
                  ORDER BY comment.created_at ASC, comment.id ASC
                )
                FROM edu_social_comments comment
                INNER JOIN users comment_author
                  ON comment_author.id = comment.author_id
                WHERE comment.post_id = post.id
              ), '[]'::jsonb),
              'shares', post.shares_count,
              'isLiked', EXISTS (
                SELECT 1
                FROM edu_social_post_likes current_like
                WHERE current_like.post_id = post.id
                  AND current_like.user_id = $1
              ),
              'isBookmarked', EXISTS (
                SELECT 1
                FROM edu_social_post_bookmarks current_bookmark
                WHERE current_bookmark.post_id = post.id
                  AND current_bookmark.user_id = $1
              ),
              'createdAt', post.created_at,
              'tags', post.tags,
              'type', post.type
            )
            ORDER BY post.created_at DESC, post.id ASC
          ) FILTER (WHERE post.id IS NOT NULL),
          '[]'::jsonb
        ) AS data
      FROM post_count
      LEFT JOIN page_posts post ON TRUE
      LEFT JOIN users author ON author.id = post.author_id
      LEFT JOIN edu_user_streaks streak
        ON streak.user_id::text = post.author_id::text
      GROUP BY post_count.total
    `;
  }

  private mapFeedPost(post: FeedPostRow): EducationSocialPostResponse {
    const level = Number(post.level ?? 1);
    const currentStreak = Number(post.currentStreak ?? 0);
    const comments = [...(post.comments ?? [])]
      .sort((left, right) => {
        const dateDifference =
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime();
        return dateDifference || left.id.localeCompare(right.id);
      })
      .map((comment) => this.mapComment(comment));

    return {
      id: post.id,
      author: {
        id: String(post.authorId),
        name: post.authorName,
        avatar: post.authorAvatar ?? undefined,
        level,
        badge: getEducationSocialBadge(level, currentStreak),
      },
      content: post.content,
      image: post.image ?? undefined,
      likes: Number(post.likes),
      comments,
      shares: Number(post.shares),
      isLiked: Boolean(post.isLiked),
      isBookmarked: Boolean(post.isBookmarked),
      createdAt: this.toIsoString(post.createdAt),
      tags: post.tags ?? [],
      type: post.type,
    };
  }

  private mapCreatedPost(
    post: EducationSocialPost,
    author: User,
    streak: UserStreak | null,
  ): EducationSocialPostResponse {
    const level = streak?.level ?? 1;
    const currentStreak = streak?.currentStreak ?? 0;

    return {
      id: post.id,
      author: {
        id: String(author.id),
        name: this.getDisplayName(author),
        avatar: author.avatar ?? undefined,
        level,
        badge: getEducationSocialBadge(level, currentStreak),
      },
      content: post.content,
      image: post.imageUrl ?? undefined,
      likes: 0,
      comments: [],
      shares: post.sharesCount ?? 0,
      isLiked: false,
      isBookmarked: false,
      createdAt: this.toIsoString(post.createdAt),
      tags: post.tags ?? [],
      type: post.type,
    };
  }

  private mapComment(comment: FeedCommentRow): EducationSocialCommentResponse {
    return {
      id: comment.id,
      authorId: String(comment.authorId),
      author: comment.author,
      avatar: comment.avatar ?? undefined,
      content: comment.content,
      createdAt: this.toIsoString(comment.createdAt),
      likes: Number(comment.likes),
    };
  }

  private async findUser(userId: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private getDisplayName(user: User): string {
    return user.name?.trim() || user.username?.trim() || user.email;
  }

  private requireTrimmedContent(content: string, label: string): string {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} must not be empty`);
    }
    return trimmed;
  }

  private async requireLockedPost(
    manager: EntityManager,
    postId: string,
  ): Promise<void> {
    const post = await manager.findOne(EducationSocialPost, {
      where: { id: postId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
  }

  private async withUniqueConflictRetry<T>(
    operation: () => Promise<T>,
    constraint: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!this.isUniqueViolation(error, constraint)) {
        throw error;
      }
      return operation();
    }
  }

  private isUniqueViolation(error: unknown, constraint: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505' &&
      'constraint' in error &&
      error.constraint === constraint
    );
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }
}
