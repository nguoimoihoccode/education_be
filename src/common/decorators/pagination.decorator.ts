import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PaginationDto } from '../dto/pagination.dto';

export const Pagination = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const query = request.query;

    const paginationDto = new PaginationDto();
    paginationDto.page = query.page ? parseInt(query.page) : 1;
    paginationDto.limit = query.limit ? parseInt(query.limit) : 10;
    paginationDto.sortBy = query.sortBy || 'createdAt';
    paginationDto.sortOrder = (query.sortOrder || 'DESC') as 'ASC' | 'DESC';

    return paginationDto;
  },
);
