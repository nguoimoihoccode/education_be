# API Documentation - Add User Profile to Auth Responses

## Overview

This document describes the required API changes for the frontend authentication system to include user profile data in login and register responses.

## Current State

Currently, the auth API returns only tokens:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Required Changes

### 1. Login Response (`POST /auth/login`)

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (Success - 200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "displayName": "Nguyễn Văn A",
    "avatar": "https://example.com/avatars/user_123.jpg",
    "phone": "+84912345678",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-03-20T14:45:00Z"
  }
}
```

**Response (Error - 401):**
```json
{
  "message": "Invalid email or password",
  "code": "INVALID_CREDENTIALS"
}
```

---

### 2. Register Response (`POST /auth/register`)

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "displayName": "Nguyễn Văn A"
}
```

**Response (Success - 201):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user_456",
    "email": "user@example.com",
    "displayName": "Nguyễn Văn A",
    "avatar": null,
    "phone": null,
    "createdAt": "2024-04-01T08:00:00Z",
    "updatedAt": "2024-04-01T08:00:00Z"
  }
}
```

**Response (Error - 400):**
```json
{
  "message": "Email already exists",
  "code": "EMAIL_EXISTS"
}
```

---

### 3. Google OAuth Callback (`GET /auth/google/callback`)

**Endpoint:** `GET /api/auth/google/callback?code=...`

**Response (Success - 200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "google_user_789",
    "email": "user@gmail.com",
    "displayName": "Google User",
    "avatar": "https://lh3.googleusercontent.com/a/...",
    "phone": null,
    "createdAt": "2024-04-01T08:00:00Z",
    "updatedAt": "2024-04-01T08:00:00Z"
  }
}
```

---

### 4. Refresh Token (`POST /auth/refresh`)

**Endpoint:** `POST /api/auth/refresh`

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (Success - 200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "displayName": "Nguyễn Văn A",
    "avatar": "https://example.com/avatars/user_123.jpg",
    "phone": "+84912345678",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-03-20T14:45:00Z"
  }
}
```

---

## User Object Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique user identifier (UUID) |
| `email` | string | Yes | User email address |
| `displayName` | string | Yes | User's display name |
| `avatar` | string? | No | URL to user avatar image |
| `phone` | string? | No | User phone number |
| `createdAt` | ISO8601 string | Yes | Account creation timestamp |
| `updatedAt` | ISO8601 string | Yes | Last profile update timestamp |

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_CREDENTIALS` | 401 | Email or password is incorrect |
| `EMAIL_EXISTS` | 400 | Email is already registered |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token is invalid or expired |
| `USER_NOT_FOUND` | 404 | User account not found |
| `ACCOUNT_DISABLED` | 403 | User account has been disabled |

---

## Implementation Notes

### For NestJS Backend

1. Update `AuthResponse` DTO to include user data:
```typescript
// auth/dto/auth-response.dto.ts
export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
```

2. Update `AuthService.login()` to return user with tokens:
```typescript
async login(loginDto: LoginDto): Promise<AuthResponseDto> {
  const user = await this.validateUser(loginDto.email, loginDto.password);
  const tokens = await this.generateTokens(user);
  return {
    ...tokens,
    user: this.userService.toDto(user),
  };
}
```

3. Ensure `UserResponseDto` includes all required fields.

### For Spring Boot Backend

1. Update `TokenResponse` class:
```java
public class TokenResponse {
    private String accessToken;
    private String refreshToken;
    private UserResponse user;
}
```

2. Update `AuthController.login()` to return user data.

---

## Frontend Integration

The frontend expects the response structure as documented above. After backend changes:

1. Clear browser localStorage (`auth-storage`)
2. Test login flow
3. Verify user data appears in Redux/Zustand store
4. Test all auth scenarios (login, register, Google OAuth, refresh)

---

## Migration Guide

### Phase 1: Backend Changes
- [ ] Update login endpoint to return user
- [ ] Update register endpoint to return user
- [ ] Update refresh token endpoint to return user
- [ ] Update Google OAuth callback to return user

### Phase 2: Testing
- [ ] Test login with valid credentials
- [ ] Test login with invalid credentials
- [ ] Test register new account
- [ ] Test token refresh
- [ ] Test OAuth flow

### Phase 3: Deployment
- [ ] Deploy backend changes
- [ ] Deploy frontend changes
- [ ] Monitor for errors

---

## Questions?

Contact the frontend team for clarifications.