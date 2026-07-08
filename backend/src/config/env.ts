import { z } from 'zod';

const RawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL_FLASH: z.string().default('gemini-2.5-flash'),
  GEMINI_MODEL_PRO: z.string().default('gemini-2.5-pro'),
  GEMINI_MODEL_EMBED: z.string().default('text-embedding-004'),

  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),

  ADMIN_UIDS: z.string().default(''),

  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  CROWD_SIM_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),

  GEMINI_BUCKET_SIZE: z.coerce.number().int().positive().default(12),
  GEMINI_BUCKET_REFILL_PER_MIN: z.coerce.number().int().positive().default(12),
});

const parsed = RawEnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isDev: raw.NODE_ENV === 'development',
  isProd: raw.NODE_ENV === 'production',
  adminUids: new Set(raw.ADMIN_UIDS.split(/\s+/).filter(Boolean)),
  allowedOrigins: raw.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
} as const;

export type Env = typeof env;
