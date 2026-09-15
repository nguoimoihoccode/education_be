import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../../../common/cache/cache.service';
import { Language, Course } from '../entities';
import { GetCoursesDto, CreateCourseDto, UpdateCourseDto } from '../dto';

const CATALOG_CACHE_TTL_SECONDS = 300;
const CATALOG_CACHE_PREFIX = 'edu:catalog:';

@Injectable()
export class CourseCatalogService {
  constructor(
    @InjectRepository(Language)
    private readonly languageRepository: Repository<Language>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    private readonly cache: CacheService = new CacheService(null),
  ) {}

  // ==================== LANGUAGES ====================
  async getLanguages(): Promise<Language[]> {
    const cacheKey = `${CATALOG_CACHE_PREFIX}languages`;
    const cached = await this.cache.get<Language[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const languages = await this.languageRepository.find({
      where: { active: true },
      order: { order: 'ASC', name: 'ASC' },
    });
    await this.cache.set(cacheKey, languages, CATALOG_CACHE_TTL_SECONDS);
    return languages;
  }

  async getLanguageById(id: string): Promise<Language> {
    const language = await this.languageRepository.findOne({ where: { id } });
    if (!language) {
      throw new NotFoundException('Language not found');
    }
    return language;
  }

  async resolveLanguageId(languageCode?: string): Promise<string> {
    const code = (languageCode || 'en').toLowerCase();
    const language = await this.languageRepository.findOne({ where: { code } });

    if (!language) {
      throw new NotFoundException(`Language not found for code: ${code}`);
    }

    return language.id;
  }

  // ==================== COURSES ====================
  async getCourses(dto: GetCoursesDto): Promise<{
    courses: Course[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { languageId, level, page = 1, limit = 10 } = dto;
    const cacheKey = `${CATALOG_CACHE_PREFIX}courses:${languageId ?? 'all'}:${level ?? 'all'}:${page}:${limit}`;
    const cached = await this.cache.get<{
      courses: Course[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(cacheKey);
    if (cached) {
      return cached;
    }

    const queryBuilder = this.courseRepository
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.language', 'language')
      .where('course.active = :active', { active: true });

    if (languageId) {
      queryBuilder.andWhere('course.languageId = :languageId', { languageId });
    }

    if (level) {
      queryBuilder.andWhere('course.level = :level', { level });
    }

    queryBuilder
      .orderBy('course.order', 'ASC')
      .addOrderBy('course.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [courses, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);
    const result = { courses, total, page, limit, totalPages };

    await this.cache.set(cacheKey, result, CATALOG_CACHE_TTL_SECONDS);
    return result;
  }

  async getCourseById(id: string): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: { id },
      relations: ['language', 'lessons'],
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return course;
  }

  async createCourse(dto: CreateCourseDto): Promise<Course> {
    const language = await this.getLanguageById(dto.languageId);
    const course = this.courseRepository.create({
      ...dto,
      language,
    });
    const saved = await this.courseRepository.save(course);
    await this.invalidateCatalogCache();
    return saved;
  }

  async updateCourse(id: string, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.getCourseById(id);
    Object.assign(course, dto);
    const saved = await this.courseRepository.save(course);
    await this.invalidateCatalogCache();
    return saved;
  }

  private async invalidateCatalogCache(): Promise<void> {
    await this.cache.deletePrefix(CATALOG_CACHE_PREFIX);
  }
}
