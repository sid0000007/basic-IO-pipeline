import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { EnvService } from '../../config/config.module';

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Constant-time bearer-token guard for the ingestion endpoints.
 *
 * No DB lookup, no rotation: one static key from `INGESTION_API_KEY` env.
 * Phase 3+ may replace with rotatable keys / per-source keys.
 */
@Injectable()
export class IngestionApiKeyGuard implements CanActivate {
  constructor(private readonly env: EnvService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req: RequestWithHeaders = ctx.switchToHttp().getRequest();
    const header = req.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    const expected = this.env.get('INGESTION_API_KEY');
    if (!constantTimeEquals(token, expected)) {
      throw new UnauthorizedException('Invalid token');
    }
    return true;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
