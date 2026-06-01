import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { raw } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const apiPrefix = config
    .get<string>('API_PREFIX', 'api')
    .replace(/^\/|\/$/g, '');
  const rawAudioPath = apiPrefix
    ? `/${apiPrefix}/audio/upload`
    : '/audio/upload';

  app.use(
    rawAudioPath,
    raw({
      limit: config.get<string>('AUDIO_UPLOAD_LIMIT', '100mb'),
      type: [
        'audio/mpeg',
        'audio/mp3',
        'audio/webm',
        'audio/wav',
        'audio/wave',
        'audio/x-wav',
        'audio/mp4',
        'audio/m4a',
        'audio/ogg',
        'audio/flac',
        'application/octet-stream',
      ],
    }),
  );

  app.setGlobalPrefix(apiPrefix);
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
}

void bootstrap();
