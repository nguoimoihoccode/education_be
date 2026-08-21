import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PaginationDto } from '../dto/pagination.dto';

const toPositiveInt = (value: unknown, fallback: number): number => {
  const raw =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

export const Pagination = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const query = request.query;

    const paginationDto = new PaginationDto();
    paginationDto.page = clamp(toPositiveInt(query.page, 1), 1, 10_000);
    paginationDto.limit = clamp(toPositiveInt(query.limit, 10), 1, 100);
    paginationDto.sortBy =
      typeof query.sortBy === 'string' && query.sortBy.trim()
        ? query.sortBy
        : 'createdAt';
    paginationDto.sortOrder = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    return paginationDto;
  },
);
