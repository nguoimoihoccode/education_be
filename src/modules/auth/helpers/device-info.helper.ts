import { createHash } from 'crypto';
import type { Request } from 'express';

export interface DeviceInfo {
  fingerprint?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Extract device information from request
 */
export function extractDeviceInfo(req: Request): DeviceInfo {
  const ipAddress = getClientIp(req);
  const userAgent = req.get('user-agent') || '';

  // Get fingerprint from header (should be sent by client)
  const clientFingerprint = req.get('x-device-fingerprint');

  // Generate server-side fingerprint as fallback
  const fingerprintData = `${userAgent}|${ipAddress}`;
  const fingerprint =
    clientFingerprint ||
    createHash('sha256').update(fingerprintData).digest('hex');

  return {
    fingerprint,
    ipAddress,
    userAgent,
  };
}

/**
 * Get client IP address from request.
 *
 * `req.ip` resolves X-Forwarded-For through Express's `trust proxy` setting
 * (TRUST_PROXY_HOPS in main.ts), which is one hop in production because nginx
 * sits in front. Reading the raw header here instead used the *first* entry --
 * and nginx's `$proxy_add_x_forwarded_for` copies whatever the client sent into
 * that first slot -- so a caller could pick its own identity per request. The
 * login lockout is keyed on this value, so that was a free way to never trip it.
 */
function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
