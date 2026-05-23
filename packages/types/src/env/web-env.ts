import { z } from 'zod';

export const webEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:3001'),
});

export type WebEnv = z.infer<typeof webEnvSchema>;
