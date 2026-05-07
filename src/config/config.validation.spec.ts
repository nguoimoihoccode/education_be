import { configValidationSchema } from './config.validation';

describe('configValidationSchema', () => {
  const baseEnv = {
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_USERNAME: 'postgres',
    DB_PASSWORD: 'postgres',
    DB_DATABASE: 'stock_db',
    NODE_ENV: 'production',
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

  it('allows one trusted proxy hop for docker nginx', () => {
    const result = configValidationSchema.validate({
      ...baseEnv,
      TRUST_PROXY_HOPS: 1,
    });

    expect(result.error).toBeUndefined();
    expect(result.value.TRUST_PROXY_HOPS).toBe(1);
  });
});
