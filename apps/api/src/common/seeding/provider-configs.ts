import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface ProviderSeed {
  provider: string;
  displayName: string;
  isEnabled: boolean;
  defaultModel: string;
  timeoutMs: number;
  settings: Prisma.InputJsonValue;
}

const PROVIDER_SEEDS: ReadonlyArray<ProviderSeed> = [
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    isEnabled: true,
    defaultModel: 'claude-sonnet-4-6',
    timeoutMs: 60_000,
    settings: { supportsStreaming: true, maxContextTokens: 200_000 },
  },
  {
    provider: 'openai',
    displayName: 'OpenAI',
    isEnabled: true,
    defaultModel: 'gpt-4.1-mini',
    timeoutMs: 60_000,
    settings: { supportsStreaming: true, maxContextTokens: 128_000 },
  },
  {
    provider: 'gemini',
    displayName: 'Google Gemini',
    isEnabled: true,
    defaultModel: 'gemini-2.5-flash',
    timeoutMs: 60_000,
    settings: { supportsStreaming: true, maxContextTokens: 1_048_576 },
  },
];

/**
 * Idempotent: creates each row on first boot; never overwrites afterwards.
 * This means operators can toggle `isEnabled` or change `defaultModel` in
 * the DB without the seed clobbering their edits on restart.
 */
export async function seedProviderConfigs(prisma: PrismaService): Promise<void> {
  for (const cfg of PROVIDER_SEEDS) {
    await prisma.providerConfig.upsert({
      where: { provider: cfg.provider },
      create: {
        provider: cfg.provider,
        displayName: cfg.displayName,
        isEnabled: cfg.isEnabled,
        defaultModel: cfg.defaultModel,
        timeoutMs: cfg.timeoutMs,
        settings: cfg.settings,
      },
      update: {},
    });
  }
}
