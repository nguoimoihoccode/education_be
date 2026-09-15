import { UnauthorizedException } from '@nestjs/common';
import type { RequestWithUser } from '../../common/types/auth.types';

/** Extract the acting user id from a guarded request (JwtAuthGuard runs first). */
export function requireUserId(req: RequestWithUser): number {
  const sub = req.user?.sub;
  if (typeof sub !== 'number') {
    throw new UnauthorizedException('Authentication required');
  }
  return sub;
}
