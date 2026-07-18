import { z } from 'zod';

const RawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // DashScope (Qwen) — OpenAI-compatible endpoint. See ADR 0003.
  DASHSCOPE_API_KEY: z.string().min(1).optional(),
  DASHSCOPE_BASE_URL: z
    .string()
    .url()
    .default('https://dashscope-intl.aliyuncs.com/compatible-mode/v1'),
  QWEN_MODEL_CHAT: z.string().default('qwen-plus'),
  QWEN_MODEL_VL: z.string().default('qwen-vl-max'),
  QWEN_MODEL_EMBED: z.string().default('text-embedding-v3'),
  // A deliberately modest per-call ceiling keeps public chat responses useful
  // without allowing one request to consume an unbounded provider quota.
  QWEN_MAX_TOKENS: z.coerce
    .number()
    .int()
    .positive()
    .default(1_200)
    .transform((value) => Math.min(value, 2_000)),
  // Reasoning ("thinking") mode for the concierge. off | low | medium | high.
  // Maps to DashScope's enable_thinking + thinking_budget on Qwen3 models.
  QWEN_REASONING: z.enum(['off', 'low', 'medium', 'high']).default('off'),

  // Google Routes API key for outdoor (GPS → stadium) routing. Optional: without
  // it the find_outdoor_route tool degrades gracefully instead of crashing.
  GOOGLE_ROUTES_API_KEY: z.string().min(1).optional(),

  // Firebase Auth Project ID
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),

  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  CROWD_SIM_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),

  // LLM concurrency guard (token bucket). See ADR 0007.
  LLM_BUCKET_SIZE: z.coerce.number().int().positive().default(12),
  LLM_BUCKET_REFILL_PER_MIN: z.coerce.number().int().positive().default(12),
  LLM_MAX_QUEUE: z.coerce.number().int().positive().max(100).default(24),
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
  allowedOrigins: raw.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
} as const;

export type Env = typeof env;
