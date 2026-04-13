# JWT Security Implementation Guide

## Overview

This application uses an enhanced JWT authentication system with the following security features:

1. **RS256 (RSA) Asymmetric Encryption** - Instead of symmetric HS256
2. **Short-lived Access Tokens** - 15 minutes expiry
3. **Rotating Refresh Tokens** - 7 days expiry with automatic rotation
4. **Token Blacklist** - Immediate revocation capability
5. **Device Fingerprinting** - Track and validate device/session information

## Architecture

### Token Types

#### Access Token
- **Algorithm**: RS256 (RSA SHA-256)
- **Expiry**: 15 minutes (configurable)
- **Purpose**: Authorize API requests
- **Contains**: `userId`, `email`, `type: 'access'`
- **Signed with**: Private RSA key
- **Verified with**: Public RSA key

#### Refresh Token
- **Algorithm**: RS256 (RSA SHA-256)
- **Expiry**: 7 days (configurable)
- **Purpose**: Obtain new access tokens
- **Contains**: `userId`, `tokenId`, `type: 'refresh'`
- **Rotation**: Each use generates a new refresh token and revokes the old one
- **Storage**: Database with device information

### Security Features

#### 1. RSA Key Pair (RS256)

**Why RS256 over HS256?**
- Private key is kept secret, public key can be distributed
- More secure for distributed systems
- Prevents token forgery even if public key is exposed
- Industry standard for OAuth 2.0 and OpenID Connect

**Key Generation**:
```bash
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

**Key Locations**:
- `keys/private.pem` - Used for signing tokens (NEVER commit to git)
- `keys/public.pem` - Used for verifying tokens

#### 2. Token Rotation

**How it Works**:
1. User authenticates → Receives access + refresh token
2. Access token expires after 15 minutes
3. Client sends refresh token to `/auth/refresh`
4. Server validates refresh token:
   - Checks if not revoked
   - Checks if not expired
   - Validates device fingerprint (if provided)
5. Server creates NEW tokens:
   - New access token
   - New refresh token with new `tokenId`
6. Server marks OLD refresh token as revoked:
   - Sets `isRevoked = true`
   - Sets `replacedBy = <new_token_id>`
7. Client receives new tokens and discards old ones

**Benefits**:
- Prevents refresh token reuse attacks
- Limits damage if refresh token is stolen
- Provides audit trail of token rotation
- Detects potential token theft (if old token is used after rotation)

#### 3. Token Blacklist

**Purpose**: Immediate token revocation before natural expiry

**Use Cases**:
- User logout (revoke all their refresh tokens)
- User password change (revoke all tokens)
- Suspicious activity detected
- Admin-initiated revocation

**Implementation**:
- `TokenBlacklist` entity stores revoked access tokens
- JWT middleware checks blacklist before accepting token
- Cleanup task removes expired blacklisted tokens

**Database Schema**:
```sql
CREATE TABLE token_blacklist (
  id UUID PRIMARY KEY,
  token TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  reason VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_token_blacklist_token ON token_blacklist(token);
CREATE INDEX idx_token_blacklist_user_id ON token_blacklist(user_id);
CREATE INDEX idx_token_blacklist_expires_at ON token_blacklist(expires_at);
```

#### 4. Device Fingerprinting

**What is Tracked**:
- Device fingerprint (client-generated unique ID)
- IP address
- User agent string

**How it Works**:
1. Client generates a stable device fingerprint (using browser/device characteristics)
2. Client sends fingerprint in `x-device-fingerprint` header
3. Server hashes: `SHA256(fingerprint + ipAddress + userAgent)`
4. Hash is stored with refresh token
5. On token refresh, server validates the device hasn't changed

**Benefits**:
- Detect token theft (different device using stolen token)
- Enable "logout from other devices" feature
- Provide user visibility into active sessions
- Geographic/device-based security policies

**Security Note**: 
- Hashed to prevent storing raw device info
- IP changes are tolerated for mobile users (can be made optional)
- Validation failure can trigger re-authentication

## API Flow

### 1. Registration/Login

**Endpoint**: `POST /auth/register` or `POST /auth/login`

**Request Headers**:
```
x-device-fingerprint: <client-generated-fingerprint>
```

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response**:
```json
{
  "user": {
    "userId": 1,
    "email": "user@example.com",
    "name": "John Doe"
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

**Device Info Extraction**:
```typescript
// Automatically extracted from request
{
  fingerprint: req.headers['x-device-fingerprint'],
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
}
```

### 2. Token Refresh

**Endpoint**: `POST /auth/refresh`

**Request Headers**:
```
Authorization: Bearer <refresh_token>
x-device-fingerprint: <same-fingerprint-as-login>
```

**Response**:
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."  // New refresh token
}
```

**Important**: 
- Old refresh token is now REVOKED and cannot be reused
- Client MUST store and use the new refresh token

### 3. Logout

**Endpoint**: `POST /auth/logout`

**Request Headers**:
```
Authorization: Bearer <access_token>
```

**What Happens**:
1. Current refresh token is revoked
2. Access token is added to blacklist
3. User must re-authenticate to get new tokens

### 4. Logout from All Devices

**Endpoint**: `POST /auth/logout-all`

**Request Headers**:
```
Authorization: Bearer <access_token>
```

**What Happens**:
1. ALL user's refresh tokens are revoked
2. Current access token is blacklisted
3. All other sessions become invalid on next API call

## Environment Configuration

```bash
# .env file

# RS256 Keys (stored in keys/ directory)
# No need to configure secrets in .env anymore

# Optional: Override default expiry times
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

# Database configuration (required)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=yourpassword
DB_DATABASE=stock_db
```

## Frontend Integration

### 1. Generate Device Fingerprint

```typescript
// utils/deviceFingerprint.ts
import FingerprintJS from '@fingerprintjs/fingerprintjs';

let deviceFingerprint: string | null = null;

export async function getDeviceFingerprint(): Promise<string> {
  if (deviceFingerprint) return deviceFingerprint;
  
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  deviceFingerprint = result.visitorId;
  
  return deviceFingerprint;
}
```

### 2. API Client with Auto-Refresh

```typescript
// api/client.ts
import axios from 'axios';
import { getDeviceFingerprint } from '../utils/deviceFingerprint';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Add device fingerprint to all requests
api.interceptors.request.use(async (config) => {
  const fingerprint = await getDeviceFingerprint();
  config.headers['x-device-fingerprint'] = fingerprint;
  
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const fingerprint = await getDeviceFingerprint();
        
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL}/auth/refresh`,
          {},
          {
            headers: {
              Authorization: `Bearer ${refreshToken}`,
              'x-device-fingerprint': fingerprint,
            },
          }
        );
        
        const { accessToken, refreshToken: newRefreshToken } = response.data;
        
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', newRefreshToken); // Important!
        
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;
```

### 3. Login/Register

```typescript
// api/auth.ts
import api from './client';

export async function login(email: string, password: string) {
  const response = await api.post('/auth/login', { email, password });
  const { accessToken, refreshToken, user } = response.data;
  
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  
  return user;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
}
```

## Security Best Practices

### 1. Private Key Management

- **NEVER** commit `private.pem` to version control
- Store in secure location with restricted permissions
- Use environment-specific keys (dev, staging, prod)
- Rotate keys periodically (with migration plan)
- Consider using secrets management service (AWS Secrets Manager, HashiCorp Vault)

```bash
# Set restrictive permissions
chmod 600 keys/private.pem
chmod 644 keys/public.pem
```

### 2. Token Storage (Frontend)

- **localStorage**: Vulnerable to XSS but persistent
- **sessionStorage**: Cleared on tab close
- **httpOnly cookies**: Best security but needs CORS setup
- **Memory only**: Most secure but lost on refresh

**Recommendation**: Use httpOnly cookies for production

### 3. Token Expiry Tuning

Balance between security and user experience:

| Use Case | Access Token | Refresh Token |
|----------|--------------|---------------|
| High Security (Banking) | 5-10 minutes | 1 day |
| Standard (This App) | 15 minutes | 7 days |
| Low Security (Internal Tools) | 1 hour | 30 days |

### 4. Rate Limiting

Protect token endpoints from brute force:

```typescript
// Already implemented in app.module.ts
ThrottlerModule.forRoot([{
  ttl: 60000, // 1 minute
  limit: 10,  // 10 requests per minute
}])
```

### 5. HTTPS Only

- All token transmission MUST use HTTPS
- Use HSTS headers to force HTTPS
- Set secure flag on cookies

## Maintenance Tasks

### 1. Cleanup Expired Tokens

A scheduled task should periodically clean up:
- Expired refresh tokens
- Expired blacklisted access tokens

```typescript
// auth.service.ts
async cleanupExpiredTokens(): Promise<void> {
  const now = new Date();
  
  // Delete expired refresh tokens
  await this.refreshTokenRepository.delete({
    expiresAt: LessThan(now),
  });
  
  // Delete expired blacklisted tokens
  await this.tokenBlacklistRepository.delete({
    expiresAt: LessThan(now),
  });
}
```

**Recommended**: Run daily at low-traffic hours

### 2. Monitor Token Usage

Track metrics:
- Token refresh rate (high rate = short expiry or token theft)
- Failed refresh attempts (may indicate attack)
- Blacklist size (large = many logouts or security events)
- Device mismatches (potential token theft)

### 3. Audit Trail

Log important events:
- All login/logout events
- Token refresh with device info
- Token revocations
- Device fingerprint mismatches

## Troubleshooting

### Error: "Private key not found"

**Cause**: `keys/private.pem` doesn't exist

**Solution**:
```bash
cd stock-be
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

### Error: "Token has been revoked"

**Cause**: Trying to use old refresh token after rotation

**Solution**: Ensure frontend always uses the latest refresh token from the last `/auth/refresh` response

### Error: "Device fingerprint mismatch"

**Cause**: Device info changed (IP, user agent, or fingerprint)

**Solutions**:
1. Re-authenticate the user
2. Make device validation more lenient (allow IP changes for mobile)
3. Implement "trust this device" flow

### Error: "Token blacklisted"

**Cause**: Token was explicitly revoked (logout, password change, etc.)

**Solution**: User needs to re-authenticate

## Migration from HS256 to RS256

If upgrading from old implementation:

1. Generate RSA keys
2. Deploy new code
3. Old HS256 tokens will fail validation
4. Users will be automatically logged out
5. Users re-authenticate and get RS256 tokens

**Graceful Migration** (optional):
- Support both HS256 and RS256 during transition period
- Check token algorithm before verification
- Gradually migrate users to RS256
- Remove HS256 support after migration window

## References

- [RFC 7519 - JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [RFC 7523 - JWT Profile for OAuth 2.0](https://tools.ietf.org/html/rfc7523)
- [OWASP JWT Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [Auth0 JWT Best Practices](https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-token-best-practices)
