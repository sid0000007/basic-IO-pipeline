import { config as loadDotenv } from 'dotenv';
import { apiEnvSchema, type ApiEnv } from '@olives/types';

// Load .env exactly once. No-op if the file is absent (which is the case
// in containerized environments where env vars come from the orchestrator).
loadDotenv();

export function loadEnv(): ApiEnv {
  const parsed = apiEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
