import { StreakService } from './streak.service';

const createStreakRepository = () => {
  const repository: any = {
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  repository.createQueryBuilder = jest.fn(() => {
    const builder: any = {};
    for (const method of ['insert', 'into', 'values', 'orIgnore']) {
      builder[method] = jest.fn().mockReturnValue(builder);
    }
    builder.execute = jest.fn().mockResolvedValue(undefined);
    return builder;
  });
  repository.manager = {
    transaction: jest.fn(async (work: (manager: unknown) => unknown) =>
      work({ getRepository: () => repository }),
    ),
  };
  return repository;
};

describe('StreakService', () => {
  const startOfDay = (offsetDays = 0) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    return date;
  };

  const createService = () => {
    const repository = createStreakRepository();
    return { service: new StreakService(repository), repository };
  };

  describe('getUserStreak', () => {
    it('returns the existing streak without inserting', async () => {
      const { service, repository } = createService();
      const streak = { userId: 'user-1', currentStreak: 3 };
      repository.findOne.mockResolvedValue(streak);

      await expect(service.getUserStreak('user-1')).resolves.toBe(streak);
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('insert-or-ignores when the row does not exist yet', async () => {
      const { service, repository } = createService();
      const created = { userId: 'user-1', currentStreak: 0 };
      repository.findOne.mockResolvedValue(null);
      repository.findOneOrFail.mockResolvedValue(created);

      await expect(service.getUserStreak('user-1')).resolves.toBe(created);
      expect(repository.createQueryBuilder).toHaveBeenCalled();
      const builder = repository.createQueryBuilder.mock.results[0].value;
      expect(builder.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateStreak', () => {
    it('starts a streak on the first recorded activity', async () => {
      const { service, repository } = createService();
      repository.findOne.mockResolvedValue({
        userId: 'user-1',
        currentStreak: 0,
        longestStreak: 0,
        totalDays: 0,
        totalXp: 0,
        level: 1,
      });

      const streak = await service.updateStreak('user-1');

      expect(streak.currentStreak).toBe(1);
      expect(streak.longestStreak).toBe(1);
      expect(streak.totalDays).toBe(1);
      expect(streak.totalXp).toBe(10);
      expect(streak.lastActivityDate).toEqual(startOfDay());
      expect(repository.createQueryBuilder).toHaveBeenCalled();
      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('keeps counters on a same-day repeat but still awards XP', async () => {
      const { service, repository } = createService();
      repository.findOne.mockResolvedValue({
        userId: 'user-1',
        currentStreak: 4,
        longestStreak: 7,
        totalDays: 20,
        totalXp: 90,
        level: 1,
        lastActivityDate: startOfDay(),
      });

      const streak = await service.updateStreak('user-1');

      expect(streak.currentStreak).toBe(4);
      expect(streak.totalDays).toBe(20);
      expect(streak.totalXp).toBe(100);
      expect(streak.level).toBe(2);
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('extends the streak on a consecutive day', async () => {
      const { service, repository } = createService();
      repository.findOne.mockResolvedValue({
        userId: 'user-1',
        currentStreak: 6,
        longestStreak: 6,
        totalDays: 30,
        totalXp: 50,
        level: 1,
        lastActivityDate: startOfDay(-1),
      });

      const streak = await service.updateStreak('user-1');

      expect(streak.currentStreak).toBe(7);
      expect(streak.longestStreak).toBe(7);
      expect(streak.totalDays).toBe(31);
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('resets the streak after a gap without losing total days', async () => {
      const { service, repository } = createService();
      repository.findOne.mockResolvedValue({
        userId: 'user-1',
        currentStreak: 9,
        longestStreak: 12,
        totalDays: 40,
        totalXp: 50,
        level: 1,
        lastActivityDate: startOfDay(-5),
      });

      const streak = await service.updateStreak('user-1');

      expect(streak.currentStreak).toBe(1);
      expect(streak.longestStreak).toBe(12);
      expect(streak.totalDays).toBe(41);
      expect(repository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordActivity', () => {
    it('skips the write for a same-day flashcard review without XP', async () => {
      const { service, repository } = createService();
      const streak = {
        userId: 'user-1',
        currentStreak: 2,
        longestStreak: 5,
        totalXp: 40,
        lastActivityDate: startOfDay(),
      };
      repository.findOne.mockResolvedValue(streak);

      await service.recordActivity('user-1', { trackTotalDays: false });

      expect(repository.save).not.toHaveBeenCalled();
    });

    it('moves the streak for a flashcard review on a new day without XP or total days', async () => {
      const { service, repository } = createService();
      repository.findOne.mockResolvedValue({
        userId: 'user-1',
        currentStreak: 2,
        longestStreak: 5,
        totalDays: 8,
        totalXp: 40,
        lastActivityDate: startOfDay(-1),
      });

      const streak = await service.recordActivity('user-1', {
        trackTotalDays: false,
      });

      expect(streak.currentStreak).toBe(3);
      expect(streak.longestStreak).toBe(5);
      expect(streak.totalDays).toBe(8);
      expect(streak.totalXp).toBe(40);
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('joins the caller transaction instead of opening its own when a runner is given', async () => {
      const { service, repository } = createService();
      repository.findOne.mockResolvedValue({
        userId: 'user-1',
        currentStreak: 1,
        longestStreak: 1,
        totalDays: 1,
        totalXp: 0,
        level: 1,
        lastActivityDate: null,
      });
      const runner = {
        getRepository: jest.fn(() => repository),
      };

      const streak = await service.updateStreak('user-1', runner as never);

      expect(streak.totalXp).toBe(10);
      // The runner's repository was used; no nested transaction was opened.
      expect(runner.getRepository).toHaveBeenCalled();
      expect(repository.manager.transaction).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledTimes(1);
    });
  });
});
