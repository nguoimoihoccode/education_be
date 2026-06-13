import { configValidationSchema } from './config.validation';

describe('configValidationSchema', () => {
  const baseEnv = {
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_USERNAME: 'postgres',
    DB_PASSWORD: 'postgres',
    DB_DATABASE: 'stock_db',
    NODE_ENV: 'production',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/google/callback',
  };

  it('defaults ALLOW_DB_SYNC to false', () => {
    const result = configValidationSchema.validate(baseEnv);

    expect(result.error).toBeUndefined();
    expect(result.value.ALLOW_DB_SYNC).toBe(false);
  });

  it('allows explicit local schema synchronization', () => {
    const result = configValidationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'development',
      ALLOW_DB_SYNC: true,
    });

    expect(result.error).toBeUndefined();
    expect(result.value.ALLOW_DB_SYNC).toBe(true);
  });

  it('defaults TRUST_PROXY_HOPS to zero', () => {
    const result = configValidationSchema.validate(baseEnv);

    expect(result.error).toBeUndefined();
    expect(result.value.TRUST_PROXY_HOPS).toBe(0);
  });

  it('defaults EDUCATION_EXPORT_STORAGE_PATH for local exports', () => {
    const result = configValidationSchema.validate(baseEnv);

    expect(result.error).toBeUndefined();
    expect(result.value.EDUCATION_EXPORT_STORAGE_PATH).toBe(
      'exports/education',
    );
  });

  it('allows one trusted proxy hop for docker nginx', () => {
    const result = configValidationSchema.validate({
      ...baseEnv,
      TRUST_PROXY_HOPS: 1,
    });

    expect(result.error).toBeUndefined();
    expect(result.value.TRUST_PROXY_HOPS).toBe(1);
  });

  it('does not require Google OAuth variables when OAuth is not configured', () => {
    const {
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_CALLBACK_URL,
      ...env
    } = baseEnv;

    const result = configValidationSchema.validate(env);

    expect(result.error).toBeUndefined();
    expect(result.value.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(result.value.GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(result.value.GOOGLE_CALLBACK_URL).toBeUndefined();
  });
});
