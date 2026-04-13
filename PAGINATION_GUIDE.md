# Pagination Implementation Guide

## Overview
This document explains how pagination is implemented across the API endpoints.

## Architecture

### Core Components

#### 1. Pagination Utilities (`src/common/utils/pagination.util.ts`)
- `PaginationOptions`: Interface for pagination parameters
- `PaginationMeta`: Metadata about pagination state
- `PaginatedResponse<T>`: Generic response wrapper for paginated data
- `createPaginationMeta()`: Creates pagination metadata
- `getPaginationOptions()`: Validates and processes pagination options

#### 2. Pagination DTO (`src/common/dto/pagination.dto.ts`)
- `PaginationDto`: Request DTO with validation
  - `page`: Page number (default: 1, min: 1)
  - `limit`: Items per page (default: 10, min: 1, max: 100)
  - `sortBy`: Sort field (default: 'createdAt')
  - `sortOrder`: Sort direction (default: 'DESC')

#### 3. Pagination Decorator (`src/common/decorators/pagination.decorator.ts`)
- `@Pagination()`: Custom decorator to extract pagination parameters from query string

## Usage Examples

### In Controllers

```typescript
import { Pagination } from '../../common/decorators/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Get('items')
async getItems(
  @Req() req: RequestWithUser,
  @Query('search') search?: string,
  @Pagination() pagination?: PaginationDto,
) {
  const userId = req.user?.sub;
  return this.service.getItems(userId, search, pagination?.page, pagination?.limit);
}
```

### In Services

```typescript
async getItems(
  userId: number,
  search?: string,
  page: number = 1,
  limit: number = 10,
): Promise<{ items: Item[]; total: number; page: number; limit: number; totalPages: number }> {
  const skip = (page - 1) * limit;

  const [items, total] = await this.itemRepository.findAndCount({
    where: { userId },
    skip,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  const totalPages = Math.ceil(total / limit);

  return { items, total, page, limit, totalPages };
}
```

### Response Format

All paginated endpoints return responses in this format:

```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 10,
    "totalItems": 100,
    "totalPages": 10,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

Or for specific endpoints:

```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "limit": 10,
  "totalPages": 10
}
```

## Implemented Endpoints

### Soulie Module

#### Friends
- **GET** `/soulie/friends?page=1&limit=10&q=search`
- Returns paginated friends list with search support

#### Discover Users
- **GET** `/soulie/friends/discover?page=1&limit=20&q=search`
- Returns paginated user suggestions with search support

#### Moments
- **GET** `/soulie/moments?box=received&page=1&limit=20`
- Returns paginated moments (sent/received)

#### Conversations
- **GET** `/soulie/conversations?page=1&limit=20&q=search`
- Returns paginated conversations with search support

### Education Module

#### Courses
- **GET** `/education/courses?languageId=1&level=beginner&page=1&limit=10`
- Returns paginated courses with filtering

#### Lessons
- **GET** `/education/courses/:courseId/lessons?page=1&limit=20`
- Returns paginated lessons for a course

#### Vocabulary
- **GET** `/education/lessons/:lessonId/vocabulary?page=1&limit=50`
- Returns paginated vocabulary for a lesson

## Query Parameters

### Standard Parameters
- `page`: Page number (default: 1, minimum: 1)
- `limit`: Items per page (default: 10, minimum: 1, maximum: 100)
- `sortBy`: Field to sort by (default: 'createdAt')
- `sortOrder`: Sort direction 'ASC' or 'DESC' (default: 'DESC')

### Example Requests

```bash
# Get first page with default settings
GET /api/soulie/friends

# Get second page with 20 items
GET /api/soulie/friends?page=2&limit=20

# Search with pagination
GET /api/soulie/friends?q=john&page=1&limit=10

# Sort by name ascending
GET /api/soulie/friends?sortBy=name&sortOrder=ASC
```

## Response Headers

All paginated responses include these headers:

```
X-Page: 1
X-Limit: 10
X-Total-Items: 100
X-Total-Pages: 10
X-Has-Next-Page: true
X-Has-Previous-Page: false
```

## Best Practices

### 1. Default Values
- Always provide sensible defaults for pagination parameters
- Use reasonable limits (max 100 items per page)

### 2. Performance
- Use database-level pagination (skip/take) for efficiency
- Consider cursor-based pagination for large datasets

### 3. Validation
- Validate all pagination parameters
- Ensure page and limit are positive integers
- Limit maximum items per page to prevent abuse

### 4. Consistency
- Use consistent response formats across all endpoints
- Include total count and page metadata
- Provide clear error messages for invalid parameters

## Error Handling

### Invalid Parameters
```json
{
  "statusCode": 400,
  "message": [
    "page must be greater than or equal to 1",
    "limit must not be greater than 100"
  ],
  "error": "Bad Request"
}
```

### Empty Results
```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "limit": 10,
  "totalPages": 0
}
```

## Migration Notes

### Breaking Changes
- Response format has changed to include pagination metadata
- Some endpoints now require pagination parameters

### Backward Compatibility
- Default values ensure existing clients continue to work
- Old response formats are extended, not replaced

## Testing

### Unit Tests
```typescript
describe('Pagination', () => {
  it('should create pagination meta', () => {
    const meta = createPaginationMeta(100, 2, 10);
    expect(meta.totalPages).toBe(10);
    expect(meta.hasNextPage).toBe(true);
    expect(meta.hasPreviousPage).toBe(true);
  });
});
```

### Integration Tests
```typescript
it('should return paginated results', async () => {
  const response = await request(app.getHttpServer())
    .get('/soulie/friends?page=1&limit=5')
    .expect(200);

  expect(response.body.items).toHaveLength(5);
  expect(response.body.total).toBeGreaterThan(0);
  expect(response.body.page).toBe(1);
});
```

## Performance Considerations

### Database Optimization
- Use indexed columns for sorting
- Consider adding composite indexes for frequently used queries
- Use `findAndCount()` for efficient total count

### Caching
- Consider caching frequently accessed pages
- Implement cache invalidation on data changes
- Use Redis for distributed caching

### Rate Limiting
- Apply rate limiting to prevent abuse
- Consider stricter limits for large page sizes
- Implement request throttling for expensive queries

## Future Enhancements

### Cursor-Based Pagination
- Implement cursor-based pagination for infinite scroll
- Support `after` and `before` cursors
- Improve performance for large datasets

### Advanced Filtering
- Add support for complex filtering
- Implement range queries (date ranges, numeric ranges)
- Support multiple filter combinations

### Metadata Enrichment
- Add estimated query time
- Include cache status
- Provide result relevance scores
