import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  // Database
  DB_HOST: Joi.string().required().description('Database host'),
  DB_PORT: Joi.number().default(5432).description('Database port'),
  DB_USERNAME: Joi.string().required().description('Database username'),
  DB_PASSWORD: Joi.string().allow('').description('Database password'),
  DB_DATABASE: Joi.string().required().description('Database name'),
  ALLOW_DB_SYNC: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false)
    .description('Allow TypeORM schema synchronize. Local development only.'),

  // JWT
  JWT_SECRET: Joi.string()
    .optional()
    .min(16)
    .description('Legacy JWT secret (optional)'),
  JWT_REFRESH_SECRET: Joi.string()
    .optional()
    .min(16)
    .description('Legacy refresh secret (optional)'),
  JWT_PRIVATE_KEY: Joi.string()
    .optional()
    .description('RS256 private key in PEM format (supports escaped newlines)'),
  JWT_PUBLIC_KEY: Joi.string()
    .optional()
    .description('RS256 public key in PEM format (supports escaped newlines)'),
  JWT_PRIVATE_KEY_PATH: Joi.string()
    .optional()
    .description('Path to private key PEM file'),
  JWT_PUBLIC_KEY_PATH: Joi.string()
    .optional()
    .description('Path to public key PEM file'),

  // Server
  PORT: Joi.number().default(3000).description('Server port'),
  TRUST_PROXY_HOPS: Joi.number()
    .integer()
    .min(0)
    .max(5)
    .default(0)
    .description('Number of trusted reverse proxy hops for client IPs'),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development')
    .description('Node environment'),

  // Frontend
  FRONTEND_URL: Joi.string()
    .uri()
    .default('http://localhost:5173')
    .description('Frontend URL for CORS'),

  // Google OAuth (optional)
  GOOGLE_CLIENT_ID: Joi.string()
    .optional()
    .description('Google OAuth client ID'),
  GOOGLE_CLIENT_SECRET: Joi.string()
    .optional()
    .description('Google OAuth client secret'),
  GOOGLE_CALLBACK_URL: Joi.string()
    .optional()
    .description('Google OAuth callback URL'),

  // Supabase (optional)
  SUPABASE_URL: Joi.string().optional().description('Supabase project URL'),
  SUPABASE_ANON_KEY: Joi.string().optional().description('Supabase anon key'),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string()
    .optional()
    .description('Supabase service role key'),

  // Media uploads
  MEDIA_STORAGE_PATH: Joi.string()
    .default('uploads')
    .description('Local storage path for uploaded media'),
  MEDIA_PUBLIC_BASE_URL: Joi.string()
    .uri()
    .optional()
    .description('Public base URL used to build media URLs'),

  // Rate Limiting
  THROTTLE_TTL: Joi.number()
    .default(60)
    .description('Rate limit TTL in seconds'),
  THROTTLE_LIMIT: Joi.number()
    .default(100)
    .description('Rate limit max requests'),
});
