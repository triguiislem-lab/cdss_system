import { strict as assert } from 'node:assert';
import { mkdirSync, rmSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { config as loadEnv } from 'dotenv';
import { raw } from 'express';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import {
  ConsultationStatus,
  DoctorStatus,
  Gender,
  UserRole,
} from '../src/common/entities/enums';
import { Consultation } from '../src/consultations/consultation.entity';
import { DoctorProfile } from '../src/doctors/doctor-profile.entity';
import { Patient } from '../src/patients/patient.entity';
import { User } from '../src/users/user.entity';

loadEnv({ path: join(process.cwd(), '..', '.env') });
loadEnv({ path: join(process.cwd(), '.env'), override: false });

const dataDir = join(process.cwd(), '.test-data');
const dbPath = join(dataDir, 'external-integrations.sqlite');
const target = process.env.EXTERNAL_TEST_TARGET || 'all';
const audioMode = process.env.EXTERNAL_AUDIO_MODE || 'upload-status';
const testEmail =
  process.env.EXTERNAL_TEST_EMAIL ||
  process.env.CONTACT_NOTIFICATION_TO ||
  'triguiislem1@gmail.com';

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
};

type AudioUploadResult = {
  ok: boolean;
  consultationId: string;
  bucket: string;
  path: string;
  bytes: number;
};

async function main() {
  if (process.env.RUN_EXTERNAL_INTEGRATION_TESTS !== 'true') {
    console.log(
      'External integration tests skipped. Set RUN_EXTERNAL_INTEGRATION_TESTS=true to run real Resend/Supabase/Kaggle checks.',
    );
    return;
  }

  if (target === 'all' || target === 'resend') {
    await verifyRealResend();
  }

  if (target === 'all' || target === 'audio') {
    await verifyRealSupabaseAndKaggleAudio();
  }

  console.log('External integration tests OK');
}

async function verifyRealResend() {
  requireEnv('RESEND_API_KEY');
  const from = process.env.RESEND_FROM || 'MedCity Connect <onboarding@resend.dev>';
  const body = {
    from,
    to: [testEmail],
    subject: 'MedCity external integration test',
    html: [
      '<h2>MedCity external integration test</h2>',
      '<p>Resend is reachable from the NestJS integration test environment.</p>',
      `<p>Sent at ${new Date().toISOString()}</p>`,
    ].join(''),
    text: `MedCity external integration test\nSent at ${new Date().toISOString()}`,
    tags: [{ name: 'event', value: 'external_integration_test' }],
  };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'medcity-connect-external-test/1.0',
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };

  assert.equal(
    response.status,
    200,
    `Resend returned ${response.status}: ${payload.message || payload.name || 'unknown error'}`,
  );
  assert.ok(payload.id, 'Resend did not return an email id');
  console.log(`Resend test email accepted: ${payload.id}`);
}

async function verifyRealSupabaseAndKaggleAudio() {
  requireStorageEnv();
  requireEnv('KAGGLE_USERNAME');
  requireEnv('KAGGLE_KEY');
  requireEnv('KAGGLE_KERNEL_REF');

  process.env.API_PREFIX = 'api';
  process.env.DATABASE_TYPE = 'sqlite';
  process.env.SQLITE_DATABASE = dbPath;
  process.env.DATABASE_SYNC = 'true';
  process.env.JWT_SECRET = 'external-integration-secret';
  process.env.JWT_REFRESH_SECRET = 'external-integration-refresh-secret';
  process.env.EMAIL_ENABLED = 'false';
  process.env.CDSS_API_BASE_URL = 'http://127.0.0.1:9/v1';

  if (audioMode === 'start-processing' || audioMode === 'full') {
    process.env.DELETE_SUPABASE_AFTER_KAGGLE =
      process.env.DELETE_SUPABASE_AFTER_KAGGLE || 'true';
  }

  mkdirSync(dataDir, { recursive: true });
  rmSync(dbPath, { force: true });

  let app: INestApplication | undefined;
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(
      '/api/audio/upload',
      raw({
        limit: '10mb',
        type: [
          'audio/wav',
          'audio/wave',
          'audio/x-wav',
          'audio/webm',
          'application/octet-stream',
        ],
      }),
    );
    const config = app.get(ConfigService);
    app.setGlobalPrefix(config.get<string>('API_PREFIX', 'api'));
    app.enableCors({ origin: true, credentials: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    const seeded = await seedExternalAudioData(app.get(DataSource));
    await app.listen(0, '127.0.0.1');
    const baseUrl = testBaseUrl(app);
    const auth = await login(baseUrl, 'external.audio@medcity.tn', 'Medcity123');

    const uploadTarget = await request<{
      consultationId: string;
      bucket: string;
      path: string;
      uploadUrl: string;
    }>(
      baseUrl,
      '/api/audio/create-upload-url',
      {
        method: 'POST',
        headers: authHeaders(auth.accessToken),
        body: JSON.stringify({
          consultationId: seeded.consultation.id,
          filename: 'external-test.wav',
          contentType: 'audio/wav',
        }),
      },
      201,
    );
    assert.equal(uploadTarget.consultationId, seeded.consultation.id);

    const upload = await binaryRequest<AudioUploadResult>(
      baseUrl,
      uploadTarget.uploadUrl,
      {
        method: 'POST',
        headers: {
          ...authHeaders(auth.accessToken),
          'content-type': 'audio/wav',
        },
        body: makeSilentWav(),
      },
      201,
    );
    assert.equal(upload.ok, true);
    assert.equal(upload.path, uploadTarget.path);
    console.log(`Supabase audio upload OK: ${upload.bucket}/${upload.path}`);

    const afterUpload = await request<Consultation>(
      baseUrl,
      `/api/consultations/${seeded.consultation.id}`,
      { headers: authHeaders(auth.accessToken) },
    );
    assert.equal(afterUpload.audioProcessingStatus, 'uploaded');

    const kaggleStatus = await request<{ ok: boolean; stdout: string }>(
      baseUrl,
      '/api/kaggle/status',
      { headers: authHeaders(auth.accessToken) },
    );
    assert.equal(kaggleStatus.ok, true);
    console.log(`Kaggle status OK: ${String(kaggleStatus.stdout || '').trim()}`);

    if (audioMode === 'start-processing' || audioMode === 'full') {
      const processing = await request<{
        ok: boolean;
        status: string;
        datasetStatus?: string;
        kernelCommand?: string;
      }>(
        baseUrl,
        '/api/audio/start-processing',
        {
          method: 'POST',
          headers: authHeaders(auth.accessToken),
          body: JSON.stringify({
            consultationId: seeded.consultation.id,
            bucketPath: upload.path,
          }),
        },
        201,
      );
      assert.equal(processing.ok, true);
      assert.equal(processing.status, 'kaggle_running');
      console.log(
        `Kaggle audio processing started: dataset=${processing.datasetStatus || 'unknown'}`,
      );
    }

    if (audioMode === 'full') {
      await waitForKaggleCompletion(baseUrl, auth.accessToken);
      const output = await request<{
        ok: boolean;
        resultJson?: unknown;
      }>(
        baseUrl,
        '/api/kaggle/fetch-output',
        { method: 'POST', headers: authHeaders(auth.accessToken) },
        201,
      );
      assert.equal(output.ok, true);
      assert.ok(output.resultJson, 'Kaggle output did not include resultJson');
      console.log('Kaggle output fetched and persisted.');
    }
  } finally {
    await app?.close();
    rmSync(dbPath, { force: true });
  }
}

async function seedExternalAudioData(dataSource: DataSource) {
  const users = dataSource.getRepository(User);
  const doctors = dataSource.getRepository(DoctorProfile);
  const patients = dataSource.getRepository(Patient);
  const consultations = dataSource.getRepository(Consultation);

  const user = await users.save(
    users.create({
      email: 'external.audio@medcity.tn',
      passwordHash: await bcrypt.hash('Medcity123', 4),
      role: UserRole.Doctor,
      isActive: true,
    }),
  );
  const doctor = await doctors.save(
    doctors.create({
      userId: user.id,
      firstName: 'External',
      lastName: 'Audio',
      email: user.email,
      phone: '+21671000444',
      fiscalNumber: 'MF-EXTERNAL-AUDIO',
      specialty: 'Medecine generale',
      cnamCode: 'CNAM-EXTERNAL-AUDIO',
      city: 'Tunis',
      status: DoctorStatus.Active,
    }),
  );
  const patient = await patients.save(
    patients.create({
      firstName: 'External',
      lastName: 'Patient',
      birthDate: new Date('1980-01-01'),
      gender: Gender.Other,
      phone1: '+21622000444',
    }),
  );
  const consultation = await consultations.save(
    consultations.create({
      patientId: patient.id,
      doctorId: doctor.id,
      reason: 'External audio integration test',
      scheduledAt: new Date(),
      status: ConsultationStatus.Scheduled,
      notes: 'Real Supabase/Kaggle audio test fixture.',
    }),
  );

  return { user, doctor, patient, consultation };
}

async function waitForKaggleCompletion(baseUrl: string, token: string) {
  const timeoutMs = Number(process.env.EXTERNAL_KAGGLE_WAIT_TIMEOUT_MS || 900000);
  const intervalMs = Number(process.env.EXTERNAL_KAGGLE_WAIT_INTERVAL_MS || 30000);
  const started = Date.now();

  while (Date.now() - started <= timeoutMs) {
    const status = await request<{ stdout: string }>(baseUrl, '/api/kaggle/status', {
      headers: authHeaders(token),
    });
    const stdout = String(status.stdout || '').toLowerCase();
    if (stdout.includes('complete')) return;
    if (stdout.includes('error') || stdout.includes('failed')) {
      throw new Error(`Kaggle kernel failed: ${status.stdout}`);
    }
    await sleep(intervalMs);
  }

  throw new Error(`Kaggle kernel did not complete within ${timeoutMs}ms`);
}

async function login(baseUrl: string, email: string, password: string) {
  const auth = await request<AuthResponse>(
    baseUrl,
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    201,
  );
  assert.ok(auth.accessToken);
  return auth;
}

async function request<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
  expectedStatus = 200,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  const bodyText = await response.text();
  assert.equal(
    response.status,
    expectedStatus,
    `${path} returned ${response.status}: ${bodyText}`,
  );
  return (bodyText ? JSON.parse(bodyText) : undefined) as T;
}

async function binaryRequest<T>(
  baseUrl: string,
  path: string,
  options: RequestInit,
  expectedStatus = 200,
) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const bodyText = await response.text();
  assert.equal(
    response.status,
    expectedStatus,
    `${path} returned ${response.status}: ${bodyText}`,
  );
  return (bodyText ? JSON.parse(bodyText) : undefined) as T;
}

function requireStorageEnv() {
  const hasRest = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasS3 = Boolean(
    process.env.SUPABASE_S3_ENDPOINT &&
      process.env.SUPABASE_S3_ACCESS_KEY_ID &&
      process.env.SUPABASE_S3_SECRET_ACCESS_KEY,
  );
  assert.ok(
    hasRest || hasS3,
    'Missing Supabase storage credentials. Configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or SUPABASE_S3_*.',
  );
}

function requireEnv(key: string) {
  assert.ok(process.env[key], `Missing required environment variable: ${key}`);
}

function makeSilentWav(seconds = 1, sampleRate = 16000) {
  const samples = seconds * sampleRate;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function testBaseUrl(app: INestApplication) {
  const server = app.getHttpServer() as {
    address: () => AddressInfo | string | null;
  };
  const address = server.address();
  assert.notEqual(address, null, 'NestJS test server did not expose a port');
  assert.notEqual(
    typeof address,
    'string',
    'NestJS test server unexpectedly listened on a pipe',
  );
  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

function authHeaders(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
