import { CacheService } from '../../../common/cache/cache.service';
import { CourseCatalogService } from './course-catalog.service';

const createRepository = (): Record<string, any> => {
  const repository: Record<string, any> = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  // One shared builder instance: every createQueryBuilder() call returns the
  // same stub so tests can configure getManyAndCount once.
  const builder: Record<string, any> = {};
  for (const method of [
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'skip',
    'take',
  ]) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.getManyAndCount = jest.fn();
  repository.createQueryBuilder = jest.fn(() => builder);
  return repository;
};

describe('CourseCatalogService caching', () => {
  const language = { id: 'lang-1', name: 'English', active: true };
  const course = { id: 'course-1', title: 'Starter', language };

  const createService = () => {
    const languageRepository = createRepository();
    const courseRepository = createRepository();
    const cache = new CacheService(null);
    const service = new CourseCatalogService(
      languageRepository as never,
      courseRepository as never,
      cache,
    );
    return { service, languageRepository, courseRepository, cache };
  };

  it('serves repeated getLanguages calls from the cache', async () => {
    const { service, languageRepository } = createService();
    languageRepository.find.mockResolvedValue([language]);

    const first = await service.getLanguages();
    const second = await service.getLanguages();

    expect(second).toEqual(first);
    expect(languageRepository.find).toHaveBeenCalledTimes(1);
  });

  it('caches getCourses per filter combination', async () => {
    const { service, courseRepository } = createService();
    const builder = courseRepository.createQueryBuilder() as Record<
      string,
      any
    >;
    builder.getManyAndCount.mockResolvedValue([[course], 1]);
    (courseRepository.createQueryBuilder as jest.Mock).mockClear();

    const first = await service.getCourses({ page: 1, limit: 10 });
    const second = await service.getCourses({ page: 1, limit: 10 });
    await service.getCourses({ page: 2, limit: 10 });

    expect(second).toEqual(first);
    expect(courseRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('invalidates cached catalog entries when a course is created', async () => {
    const { service, courseRepository, languageRepository } = createService();
    languageRepository.findOne.mockResolvedValue(language);
    const builder = courseRepository.createQueryBuilder() as Record<
      string,
      any
    >;
    builder.getManyAndCount.mockResolvedValue([[course], 1]);
    (courseRepository.createQueryBuilder as jest.Mock).mockClear();

    await service.getCourses({ page: 1, limit: 10 });
    await service.createCourse({
      title: 'New course',
      languageId: 'lang-1',
    } as never);
    await service.getCourses({ page: 1, limit: 10 });

    expect(courseRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('invalidates cached catalog entries when a course is updated', async () => {
    const { service, courseRepository } = createService();
    courseRepository.findOne.mockResolvedValue({ ...course, title: 'Old' });
    const builder = courseRepository.createQueryBuilder() as Record<
      string,
      any
    >;
    builder.getManyAndCount.mockResolvedValue([[course], 1]);
    (courseRepository.createQueryBuilder as jest.Mock).mockClear();

    await service.getCourses({ page: 1, limit: 10 });
    await service.updateCourse('course-1', { title: 'Renamed' } as never);
    await service.getCourses({ page: 1, limit: 10 });

    expect(courseRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
  });
});
