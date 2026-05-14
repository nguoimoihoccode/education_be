import { Injectable } from '@nestjs/common';

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable()
export class CommunityService {
  private readonly groups = [
    {
      id: 'hsk-beginners',
      name: 'HSK Beginners',
      description: 'Cùng học HSK 1-2, luyện từ vựng và chia sẻ mẹo ghi nhớ.',
      members: 1280,
      icon: 'BookOpen',
      color: 'emerald',
      gradient: 'from-emerald-500 to-teal-500',
      category: 'Chinese',
      isJoined: false,
      posts: 342,
      lastActive: '10 phút trước',
    },
    {
      id: 'daily-speaking',
      name: 'Daily Speaking Practice',
      description:
        'Nhóm luyện nói mỗi ngày với prompt ngắn và phản hồi từ cộng đồng.',
      members: 860,
      icon: 'Mic',
      color: 'violet',
      gradient: 'from-violet-500 to-indigo-500',
      category: 'Speaking',
      isJoined: true,
      posts: 214,
      lastActive: '25 phút trước',
    },
  ];

  private readonly events = [
    {
      id: 'weekly-quiz-sprint',
      title: 'Weekly Quiz Sprint',
      description: 'Hoàn thành 5 quiz trong tuần để nhận huy hiệu luyện tập.',
      date: '2026-05-18',
      time: '20:00',
      type: 'challenge' as const,
      participants: 312,
      maxParticipants: 1000,
      isRegistered: false,
      reward: '300 XP',
      host: 'EduPro Team',
    },
    {
      id: 'flashcard-workshop',
      title: 'Flashcard Workshop',
      description: 'Cách biến tài liệu cá nhân thành bộ flashcard dễ ôn.',
      date: '2026-05-21',
      time: '19:30',
      type: 'workshop' as const,
      participants: 74,
      maxParticipants: 120,
      isRegistered: true,
      reward: 'Workshop notes',
      host: 'Learning Coach',
    },
  ];

  private readonly threads = [
    {
      id: 'tone-practice',
      title: 'Làm sao phân biệt thanh 2 và thanh 3 khi nghe nhanh?',
      category: 'Pronunciation',
      author: 'Mai Anh',
      authorLevel: 8,
      replies: 18,
      views: 420,
      likes: 56,
      lastReply: '15 phút trước',
      isPinned: true,
      isSolved: false,
      tags: ['listening', 'tones', 'hsk1'],
    },
    {
      id: 'srs-timing',
      title: 'Nên review flashcard lúc nào để giữ streak bền hơn?',
      category: 'Study Tips',
      author: 'Quang Huy',
      authorLevel: 12,
      replies: 9,
      views: 260,
      likes: 31,
      lastReply: '1 giờ trước',
      isSolved: true,
      tags: ['srs', 'flashcards', 'streak'],
    },
  ];

  private readonly resources = [
    {
      id: 'hsk1-core-deck',
      title: 'HSK 1 Core Vocabulary Deck',
      type: 'deck' as const,
      author: 'EduPro Team',
      downloads: 1890,
      rating: 4.8,
      ratingCount: 236,
      language: 'Chinese',
    },
    {
      id: 'tone-guide',
      title: 'Quick Guide: Mandarin Tones',
      type: 'guide' as const,
      author: 'Lan Nguyen',
      downloads: 620,
      rating: 4.7,
      ratingCount: 88,
      language: 'Chinese',
    },
  ];

  private readonly topMembers = [
    {
      name: 'Mai Anh',
      badge: 'Tone Master',
      level: 18,
      xp: 48200,
      streak: 62,
      contributions: 142,
    },
    {
      name: 'Quang Huy',
      badge: 'SRS Pro',
      level: 15,
      xp: 37100,
      streak: 48,
      contributions: 96,
    },
    {
      name: 'Minh Khoa',
      badge: 'Quiz Ace',
      level: 13,
      xp: 29800,
      streak: 35,
      contributions: 74,
    },
  ];

  getGroups(params: PaginationParams = {}) {
    return this.paginate(this.groups, params);
  }

  joinGroup(userId: number, groupId: string) {
    void userId;
    return { isJoined: this.groups.some((group) => group.id === groupId) };
  }

  leaveGroup(userId: number, groupId: string) {
    void userId;
    void groupId;
    return { isJoined: false };
  }

  getEvents(params: PaginationParams = {}) {
    return this.paginate(this.events, params);
  }

  registerEvent(userId: number, eventId: string) {
    void userId;
    return { isRegistered: this.events.some((event) => event.id === eventId) };
  }

  unregisterEvent(userId: number, eventId: string) {
    void userId;
    void eventId;
    return { isRegistered: false };
  }

  getThreads(params: PaginationParams = {}) {
    return this.paginate(this.threads, params);
  }

  getResources(params: PaginationParams = {}) {
    return this.paginate(this.resources, params);
  }

  getTopMembers(limit = 10) {
    return this.topMembers.slice(0, limit);
  }

  getStats() {
    return {
      totalMembers: this.groups.reduce((sum, group) => sum + group.members, 0),
      totalDiscussions: this.threads.reduce(
        (sum, thread) => sum + thread.replies,
        0,
      ),
      totalResources: this.resources.length,
      eventsThisMonth: this.events.length,
    };
  }

  private paginate<T>(
    items: T[],
    params: PaginationParams,
  ): PaginatedResponse<T> {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
    const start = (page - 1) * limit;
    const data = items.slice(start, start + limit);

    return {
      data,
      meta: {
        page,
        limit,
        total: items.length,
        totalPages: Math.ceil(items.length / limit),
      },
    };
  }
}
