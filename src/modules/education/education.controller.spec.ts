import { EducationController } from './education.controller';
import { UnauthorizedException } from '@nestjs/common';

describe('EducationController authenticated user id handling', () => {
  const createService = () => ({
    getTodayPlan: jest.fn().mockResolvedValue({}),
    getTodayRecommendations: jest.fn().mockResolvedValue({}),
    getLearningCoachSummary: jest.fn().mockResolvedValue({}),
    markTodayPlanTaskComplete: jest.fn().mockResolvedValue({}),
    completeLesson: jest.fn().mockResolvedValue({}),
    markTodayPlanTasksCompleteByTarget: jest.fn().mockResolvedValue(undefined),
  });

  it('uses the JWT subject as a string for today plan reads', async () => {
    const service = createService();
    const controller = new EducationController(service as any);

    await controller.getTodayPlan({ user: { sub: 42 } } as any);

    expect(service.getTodayPlan).toHaveBeenCalledWith('42');
  });

  it('uses the JWT subject as a string for today recommendations', async () => {
    const service = createService();
    const controller = new EducationController(service as any);

    await controller.getTodayRecommendations({ user: { sub: 42 } } as any);

    expect(service.getTodayRecommendations).toHaveBeenCalledWith('42');
  });

  it('uses the JWT subject as a string for learning coach summary', async () => {
    const service = createService();
    const controller = new EducationController(service as any);

    await controller.getLearningCoachSummary({ user: { sub: 42 } } as any);

    expect(service.getLearningCoachSummary).toHaveBeenCalledWith('42');
  });

  it('uses the JWT subject as a string for explicit today plan completion', async () => {
    const service = createService();
    const controller = new EducationController(service as any);

    await controller.completeTodayPlanTask(
      { user: { sub: 42 } } as any,
      'quick-quiz',
    );

    expect(service.markTodayPlanTaskComplete).toHaveBeenCalledWith(
      '42',
      'quick-quiz',
    );
  });

  it('uses the JWT subject as a string when marking completed lesson tasks', async () => {
    const service = createService();
    const controller = new EducationController(service as any);

    await controller.completeLesson({ user: { sub: 42 } } as any, 'lesson-1', {
      timeSpent: 120,
    });

    expect(service.completeLesson).toHaveBeenCalledWith('42', 'lesson-1', {
      timeSpent: 120,
    });
    expect(service.markTodayPlanTasksCompleteByTarget).toHaveBeenCalledWith(
      '42',
      '/education/lessons/lesson-1',
    );
  });

  it('awaits today plan marking before returning completed lesson result', async () => {
    const service = createService();
    const controller = new EducationController(service as any);
    const calls: string[] = [];
    service.completeLesson.mockImplementation(async () => {
      calls.push('lesson');
      return { id: 'lesson-progress' };
    });
    service.markTodayPlanTasksCompleteByTarget.mockImplementation(async () => {
      calls.push('marked');
    });

    const result = await controller.completeLesson(
      { user: { sub: 42 } } as any,
      'lesson-1',
      { timeSpent: 120 },
    );

    expect(result).toEqual({ id: 'lesson-progress' });
    expect(calls).toEqual(['lesson', 'marked']);
  });

  it('rejects protected reads without an authenticated user', async () => {
    const service = createService();
    const controller = new EducationController(service as any);

    await expect(controller.getTodayPlan({} as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.getTodayPlan).not.toHaveBeenCalled();
  });

  it('rejects learning coach summary without an authenticated user', async () => {
    const service = createService();
    const controller = new EducationController(service as any);

    await expect(
      controller.getLearningCoachSummary({} as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.getLearningCoachSummary).not.toHaveBeenCalled();
  });
});
