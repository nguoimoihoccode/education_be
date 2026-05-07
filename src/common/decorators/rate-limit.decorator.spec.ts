import 'reflect-metadata';
import {
  THROTTLER_BLOCK_DURATION,
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import {
  AuthRateLimit,
  ExpensiveActionRateLimit,
  UploadRateLimit,
} from './rate-limit.decorator';

describe('rate limit decorators', () => {
  it('applies a strict auth throttle', () => {
    class TestController {
      @AuthRateLimit()
      login() {
        return undefined;
      }
    }

    expect(
      Reflect.getMetadata(
        `${THROTTLER_LIMIT}default`,
        TestController.prototype.login,
      ),
    ).toBe(5);
    expect(
      Reflect.getMetadata(`${THROTTLER_TTL}default`, TestController.prototype.login),
    ).toBe(60_000);
    expect(
      Reflect.getMetadata(
        `${THROTTLER_BLOCK_DURATION}default`,
        TestController.prototype.login,
      ),
    ).toBe(60_000);
  });

  it('applies a tighter upload throttle', () => {
    class TestController {
      @UploadRateLimit()
      upload() {
        return undefined;
      }
    }

    expect(
      Reflect.getMetadata(
        `${THROTTLER_LIMIT}default`,
        TestController.prototype.upload,
      ),
    ).toBe(10);
  });

  it('applies an expensive action throttle', () => {
    class TestController {
      @ExpensiveActionRateLimit()
      generate() {
        return undefined;
      }
    }

    expect(
      Reflect.getMetadata(
        `${THROTTLER_LIMIT}default`,
        TestController.prototype.generate,
      ),
    ).toBe(20);
  });
});
