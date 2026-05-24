import { z } from 'zod';

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // ── Phase 1 additions ──────────────────────────────────────────────────
  ANTHROPIC_API_KEY: z.string().min(1),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0),
    ),
  CHAT_CONTEXT_MESSAGE_LIMIT: z.coerce.number().int().min(1).max(200).default(20),

  // ── Phase 2 additions ──────────────────────────────────────────────────
  INGESTION_API_KEY: z.string().min(8),
  INGESTION_QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
  INGESTION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  PII_REDACTION_ENABLED: z
    .string()
    .default('false')
    .transform((s) => s === 'true' || s === '1'),

  // ── Phase 3 additions ──────────────────────────────────────────────────
  OPENAI_API_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  THROTTLER_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLER_CHAT_LIMIT: z.coerce.number().int().positive().default(30),
  THROTTLER_INGESTION_LIMIT: z.coerce.number().int().positive().default(600),
  RETENTION_DAYS: z.coerce.number().int().positive().default(90),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
