import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * Rate limits an authenticated caller by account, not by IP. A scraper cannot
 * dodge the limit by rotating addresses, and a whole school behind one NAT
 * does not share a single budget. Anonymous requests still fall back to the IP.
 * Runs after JwtAuthGuard, so `req.user` is already populated.
 *
 * Every blocked request is logged with the account, method and route (never
 * the query string or body) so bulk downloading shows up in the logs.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger('RateLimit');

  protected getTracker(req: Record<string, any>): Promise<string> {
    const id = req.user?.id ?? req.user?.sub;
    if (Number.isInteger(id)) return Promise.resolve(`user:${id}`);
    return Promise.resolve(req.ips?.length ? req.ips[0] : req.ip);
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const req = context.switchToHttp().getRequest<Record<string, any>>();
    const route: string =
      req.route?.path ?? String(req.originalUrl ?? req.url ?? '').split('?')[0];
    this.logger.warn(
      `rate_limit_exceeded tracker=${detail.tracker} method=${req.method} route=${route} limit=${detail.limit}/${Math.round(detail.ttl / 1000)}s hits=${detail.totalHits}`,
    );
    return super.throwThrottlingException(context, detail);
  }
}
