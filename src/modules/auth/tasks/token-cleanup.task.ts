import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from '../auth.service';

@Injectable()
export class TokenCleanupTask {
  private readonly logger = new Logger(TokenCleanupTask.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * Runs daily at 3:00 AM to clean up expired tokens and blacklist entries
   * This helps maintain database performance and remove stale data
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleTokenCleanup() {
    this.logger.log('Starting token cleanup task...');

    try {
      await this.authService.cleanupExpiredTokens();
      this.logger.log('Token cleanup completed successfully');
    } catch (error) {
      this.logger.error('Token cleanup failed', error.stack);
    }
  }

  /**
   * Optional: Run cleanup every 6 hours for high-traffic applications
   * Uncomment if you need more frequent cleanup
   */
  // @Cron(CronExpression.EVERY_6_HOURS)
  // async handleFrequentCleanup() {
  //   this.logger.log('Running frequent token cleanup...');
  //   try {
  //     await this.authService.cleanupExpiredTokens();
  //     this.logger.log('Frequent cleanup completed');
  //   } catch (error) {
  //     this.logger.error('Frequent cleanup failed', error.stack);
  //   }
  // }
}
