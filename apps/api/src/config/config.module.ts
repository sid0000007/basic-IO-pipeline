import { Global, Injectable, Module } from '@nestjs/common';
import type { ApiEnv } from '@olives/types';
import { loadEnv } from './env';

const ENV_TOKEN = 'ENV';

@Injectable()
export class EnvService {
  constructor(private readonly env: ApiEnv) {}

  get<K extends keyof ApiEnv>(key: K): ApiEnv[K] {
    return this.env[key];
  }
}

@Global()
@Module({
  providers: [
    {
      provide: ENV_TOKEN,
      useFactory: (): ApiEnv => loadEnv(),
    },
    {
      provide: EnvService,
      useFactory: (env: ApiEnv): EnvService => new EnvService(env),
      inject: [ENV_TOKEN],
    },
  ],
  exports: [EnvService],
})
export class ConfigModule {}
