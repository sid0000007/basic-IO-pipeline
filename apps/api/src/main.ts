import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvService } from './config/config.module';
import { PrismaService } from './prisma/prisma.service';
import { seedAnonymousUser } from './common/seeding/anonymous-user';
import { seedProviderConfigs } from './common/seeding/provider-configs';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const env = app.get(EnvService);

  const prisma = app.get(PrismaService);
  await seedAnonymousUser(prisma);
  await seedProviderConfigs(prisma);

  app.enableCors({
    origin: env.get('CORS_ORIGIN'),
    credentials: false,
  });

  // /health/* stays at the root so liveness/readiness probes don't need to know
  // about API versioning. Everything else goes under /api/v1.
  app.setGlobalPrefix('api/v1', {
    exclude: ['health/live', 'health/ready'],
  });

  app.enableShutdownHooks();
  await app.listen(env.get('PORT'));
}

void bootstrap();
