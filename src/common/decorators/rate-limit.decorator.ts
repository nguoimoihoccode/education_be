import { Throttle } from '@nestjs/throttler';

const ONE_MINUTE_MS = 60_000;

export function AuthRateLimit() {
  return Throttle({
    default: {
      limit: 5,
      ttl: ONE_MINUTE_MS,
      blockDuration: ONE_MINUTE_MS,
    },
  });
}

export function UploadRateLimit() {
  return Throttle({
    default: {
      limit: 10,
      ttl: ONE_MINUTE_MS,
      blockDuration: ONE_MINUTE_MS,
    },
  });
}

export function ExpensiveActionRateLimit() {
  return Throttle({
    default: {
      limit: 20,
      ttl: ONE_MINUTE_MS,
      blockDuration: ONE_MINUTE_MS,
    },
  });
}
