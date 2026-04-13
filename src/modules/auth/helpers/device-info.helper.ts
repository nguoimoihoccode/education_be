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
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  // Check for forwarded IP (when behind proxy/load balancer)
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = req.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
}
