import { strict as assert } from 'node:assert';
import { mkdirSync, rmSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  ContactMessage,
  ContactMessageStatus,
  NewsletterSubscription,
} from '../src/cms/cms.entities';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import {
  CmsStatus,
  ConsultationStatus,
  DoctorStatus,
  Gender,
  UserRole,
} from '../src/common/entities/enums';
import { Consultation } from '../src/consultations/consultation.entity';
import { ConsultationVitals } from '../src/consultations/consultation-vitals.entity';
import { DoctorProfile } from '../src/doctors/doctor-profile.entity';
import { Patient } from '../src/patients/patient.entity';
import { User } from '../src/users/user.entity';

const dataDir = join(process.cwd(), '.test-data');
const dbPath = join(dataDir, 'api-crud.sqlite');

process.env.API_PREFIX = 'api';
process.env.DATABASE_TYPE = 'sqlite';
process.env.SQLITE_DATABASE = dbPath;
process.env.DATABASE_SYNC = 'true';
process.env.JWT_SECRET = 'api-crud-secret';
process.env.JWT_REFRESH_SECRET = 'api-crud-refresh-secret';
process.env.CDSS_API_BASE_URL = 'http://127.0.0.1:9';
process.env.EMAIL_ENABLED = 'false';

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
};

type Paginated<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type ApiPost = {
  id: string;
  slug: string;
  title: string;
  status: CmsStatus;
  views: number;
};

type CmsTestimonial = {
  id: string;
  name: string;
  role: string;
  text: string;
  rating: number;
  active: boolean;
};

type CmsPartner = {
  id: string;
  name: string;
  logoUrl: string;
  active: boolean;
};

type CmsSpecialty = {
  id: string;
  name: string;
  description: string;
  active: boolean;
};

type CmsWhyFeature = {
  id: string;
  iconName: string;
  gradient: string;
  title: string;
  text: string;
  active: boolean;
};

async function main() {
  mkdirSync(dataDir, { recursive: true });
  rmSync(dbPath, { force: true });

  let app: INestApplication | undefined;
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
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

    const dataSource = app.get(DataSource);
    await seedUsers(dataSource);

    await app.listen(0, '127.0.0.1');
    const baseUrl = testBaseUrl(app);

    await expectStatus(baseUrl, '/api/patients', 401);
    const doctorAuth = await login(baseUrl, 'doctor.crud@medcity.tn', 'Medcity123');
    const adminAuth = await login(baseUrl, 'admin.crud@medcity.tn', 'Admin123');

    await verifyPatientCrud(baseUrl, doctorAuth.accessToken);
    await verifyConsultationCrud(baseUrl, doctorAuth.accessToken);
    await verifyCmsCrud(baseUrl, adminAuth.accessToken);
    await verifyPublicEngagementCrud(baseUrl, adminAuth.accessToken);

    console.log('NestJS API CRUD tests OK');
  } finally {
    await app?.close();
    rmSync(dbPath, { force: true });
  }
}

async function seedUsers(dataSource: DataSource) {
  const users = dataSource.getRepository(User);
  const doctors = dataSource.getRepository(DoctorProfile);

  await users.save(
    users.create({
      email: 'admin.crud@medcity.tn',
      passwordHash: await bcrypt.hash('Admin123', 4),
      role: UserRole.Admin,
      isActive: true,
    }),
  );

  const doctorUser = await users.save(
    users.create({
      email: 'doctor.crud@medcity.tn',
      passwordHash: await bcrypt.hash('Medcity123', 4),
      role: UserRole.Doctor,
      isActive: true,
    }),
  );

  await doctors.save(
    doctors.create({
      userId: doctorUser.id,
      firstName: 'Nadia',
      lastName: 'Crud',
      email: doctorUser.email,
      phone: '+21671000111',
      fiscalNumber: 'MF-CRUD-001',
      specialty: 'Medecine generale',
      cnamCode: 'CNAM-CRUD-001',
      address: 'Avenue des tests',
      city: 'Tunis',
      status: DoctorStatus.Active,
    }),
  );
}

async function verifyPatientCrud(baseUrl: string, token: string) {
  const created = await createPatient(baseUrl, token, {
    firstName: 'Amira',
    lastName: 'Mansouri',
    birthDate: '1989-04-12',
    gender: Gender.Female,
    phone1: '+21622111222',
    profession: 'Teacher',
    internalCode: 'CRUD-PATIENT-001',
    address: 'Tunis',
    weightKg: 68,
    heightCm: 166,
    allergies: ['Penicillin'],
    currentMedications: [{ name: 'Metformin', dose: '500 mg' }],
    comorbidities: ['Diabetes'],
    renal: { gfr: 92, status: 'normal' },
    liver: { status: 'normal' },
    vitalsSnapshot: { hr: 72, bp: '120/80', temp: 36.7, spo2: 98 },
    flags: ['crud-test'],
    missingData: ['HbA1c'],
  });
  assert.equal(created.firstName, 'Amira');
  assert.ok(created.id);

  const fetched = await request<Patient>(baseUrl, `/api/patients/${created.id}`, {
    headers: authHeaders(token),
  });
  assert.equal(fetched.internalCode, 'CRUD-PATIENT-001');
  assert.deepEqual(fetched.allergies, ['Penicillin']);

  const list = await request<Paginated<Patient>>(baseUrl, '/api/patients?limit=50', {
    headers: authHeaders(token),
  });
  assertPaginated(list);
  assert.ok(list.data.some((patient) => patient.id === created.id));

  const updated = await request<Patient>(
    baseUrl,
    `/api/patients/${created.id}`,
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ phone2: '+21622555666', weightKg: 70 }),
    },
  );
  assert.equal(updated.phone2, '+21622555666');
  assert.equal(Number(updated.weightKg), 70);

  const deleted = await request<{ ok: boolean }>(
    baseUrl,
    `/api/patients/${created.id}`,
    { method: 'DELETE', headers: authHeaders(token) },
  );
  assert.equal(deleted.ok, true);
  await expectStatus(baseUrl, `/api/patients/${created.id}`, 404, token);
}

async function verifyConsultationCrud(baseUrl: string, token: string) {
  const patient = await createPatient(baseUrl, token, {
    firstName: 'Karim',
    lastName: 'Jaziri',
    birthDate: '1975-10-03',
    gender: Gender.Male,
    phone1: '+21622999888',
    internalCode: 'CRUD-CONSULTATION-PATIENT',
  });

  const created = await request<Consultation>(
    baseUrl,
    '/api/consultations',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        patientId: patient.id,
        reason: 'Consultation CRUD initiale',
        scheduledAt: '2026-06-03T09:00:00.000Z',
        notes: 'Premier rendez-vous automatise',
      }),
    },
    201,
  );
  assert.equal(created.patientId, patient.id);
  assert.equal(created.status, ConsultationStatus.Scheduled);

  const started = await request<Consultation>(
    baseUrl,
    `/api/consultations/${created.id}/start`,
    { method: 'PATCH', headers: authHeaders(token) },
  );
  assert.equal(started.status, ConsultationStatus.InProgress);
  assert.ok(started.startedAt);

  const updated = await request<Consultation>(
    baseUrl,
    `/api/consultations/${created.id}`,
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({
        diagnosis: 'Bronchite simple',
        transcript: 'Le patient rapporte une toux depuis trois jours.',
        audioProcessingStatus: 'completed',
      }),
    },
  );
  assert.equal(updated.diagnosis, 'Bronchite simple');
  assert.equal(updated.audioProcessingStatus, 'completed');

  const vital = await request<ConsultationVitals>(
    baseUrl,
    `/api/consultations/${created.id}/vitals`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        heartRate: 76,
        bloodPressure: '124/78',
        temperature: 37.1,
        oxygenSaturation: 97,
        respiratoryRate: 18,
        measuredAt: '2026-06-03T09:10:00.000Z',
      }),
    },
    201,
  );
  assert.equal(vital.patientId, patient.id);
  assert.equal(vital.heartRate, 76);

  const vitals = await request<ConsultationVitals[]>(
    baseUrl,
    `/api/consultations/${created.id}/vitals`,
    { headers: authHeaders(token) },
  );
  assert.equal(vitals.length, 1);

  const patientVitals = await request<ConsultationVitals[]>(
    baseUrl,
    `/api/patients/${patient.id}/vitals`,
    { headers: authHeaders(token) },
  );
  assert.equal(patientVitals.length, 1);

  const completed = await request<Consultation>(
    baseUrl,
    `/api/consultations/${created.id}/complete`,
    { method: 'PATCH', headers: authHeaders(token) },
  );
  assert.equal(completed.status, ConsultationStatus.Completed);
  assert.ok(completed.endedAt);

  const filtered = await request<Paginated<Consultation>>(
    baseUrl,
    `/api/consultations?patientId=${patient.id}&status=${ConsultationStatus.Completed}`,
    { headers: authHeaders(token) },
  );
  assertPaginated(filtered);
  assert.equal(filtered.data[0]?.id, created.id);

  const deleted = await request<{ ok: boolean }>(
    baseUrl,
    `/api/consultations/${created.id}`,
    { method: 'DELETE', headers: authHeaders(token) },
  );
  assert.equal(deleted.ok, true);
  await expectStatus(baseUrl, `/api/consultations/${created.id}`, 404, token);
}

async function verifyCmsCrud(baseUrl: string, token: string) {
  const post = await request<ApiPost>(
    baseUrl,
    '/api/cms/posts',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        title: 'Article CRUD CMS',
        slug: 'article-crud-cms',
        excerpt: 'Article cree par test API.',
        content: 'Contenu de validation CRUD CMS.',
        category: 'Tests',
        tags: ['crud', 'cms'],
        author: 'Automation',
        status: CmsStatus.Published,
        featured: true,
        publishedAt: '2026-06-03T08:00:00.000Z',
        views: 0,
        readTime: 2,
        commentsCount: 0,
      }),
    },
    201,
  );
  assert.equal(post.slug, 'article-crud-cms');

  const publicPost = await request<ApiPost>(
    baseUrl,
    '/api/public/posts/article-crud-cms',
  );
  assert.equal(publicPost.status, CmsStatus.Published);
  assert.ok(publicPost.views >= 1);

  const patchedPost = await request<ApiPost>(
    baseUrl,
    `/api/cms/posts/${post.id}`,
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ title: 'Article CRUD CMS modifie' }),
    },
  );
  assert.equal(patchedPost.title, 'Article CRUD CMS modifie');

  await verifyCmsCollectionCrud<CmsTestimonial>(
    baseUrl,
    token,
    'testimonials',
    {
      name: 'Dr. Testimonial',
      role: 'Medecin',
      text: 'Le CRUD CMS est couvert.',
      rating: 5,
      active: true,
    },
    { active: false },
    (created, updated) => {
      assert.equal(created.rating, 5);
      assert.equal(updated.active, false);
    },
  );

  await verifyCmsCollectionCrud<CmsPartner>(
    baseUrl,
    token,
    'partners',
    {
      name: 'Partenaire CRUD',
      logoUrl: 'https://example.com/logo.png',
      websiteUrl: 'https://example.com',
      description: 'Partenaire de test',
      active: true,
    },
    { active: false },
    (created, updated) => {
      assert.equal(created.name, 'Partenaire CRUD');
      assert.equal(updated.active, false);
    },
  );

  await verifyCmsCollectionCrud<CmsSpecialty>(
    baseUrl,
    token,
    'specialties',
    {
      name: 'Specialite CRUD',
      description: 'Description test',
      iconName: 'Heart',
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      query: 'crud',
      active: true,
    },
    { description: 'Description modifiee' },
    (created, updated) => {
      assert.equal(created.active, true);
      assert.equal(updated.description, 'Description modifiee');
    },
  );

  await verifyCmsCollectionCrud<CmsWhyFeature>(
    baseUrl,
    token,
    'why-features',
    {
      iconName: 'Shield',
      gradient: 'from-blue-500 to-cyan-500',
      title: 'Pourquoi CRUD',
      text: 'Validation automatique',
      active: true,
    },
    { title: 'Pourquoi CRUD modifie' },
    (created, updated) => {
      assert.equal(created.text, 'Validation automatique');
      assert.equal(updated.title, 'Pourquoi CRUD modifie');
    },
  );

  const home = await request<{
    posts: ApiPost[];
    testimonials: CmsTestimonial[];
    partners: CmsPartner[];
    specialties: CmsSpecialty[];
    whyFeatures: CmsWhyFeature[];
  }>(baseUrl, '/api/public/home');
  assert.ok(home.posts.some((item) => item.id === post.id));

  const removedPost = await request<{ ok: boolean }>(
    baseUrl,
    `/api/cms/posts/${post.id}`,
    { method: 'DELETE', headers: authHeaders(token) },
  );
  assert.equal(removedPost.ok, true);
  await expectStatus(baseUrl, `/api/cms/posts/${post.id}`, 404, token);
}

async function verifyCmsCollectionCrud<T extends { id: string }>(
  baseUrl: string,
  token: string,
  collection: string,
  createPayload: Record<string, unknown>,
  updatePayload: Record<string, unknown>,
  assertResult: (created: T, updated: T) => void,
) {
  const created = await request<T>(
    baseUrl,
    `/api/cms/${collection}`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(createPayload),
    },
    201,
  );
  assert.ok(created.id);

  const list = await request<T[]>(baseUrl, `/api/cms/${collection}`, {
    headers: authHeaders(token),
  });
  assert.ok(list.some((item) => item.id === created.id));

  const updated = await request<T>(
    baseUrl,
    `/api/cms/${collection}/${created.id}`,
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(updatePayload),
    },
  );
  assertResult(created, updated);

  const removed = await request<{ ok: boolean }>(
    baseUrl,
    `/api/cms/${collection}/${created.id}`,
    { method: 'DELETE', headers: authHeaders(token) },
  );
  assert.equal(removed.ok, true);
}

async function verifyPublicEngagementCrud(baseUrl: string, adminToken: string) {
  const contact = await request<ContactMessage>(
    baseUrl,
    '/api/public/contact-messages',
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'Dr. Contact CRUD',
        email: 'contact.crud@example.com',
        subject: 'Question API',
        message: 'Message public de test CRUD.',
        source: 'api_crud_test',
      }),
    },
    201,
  );
  assert.equal(contact.status, ContactMessageStatus.New);

  const contacts = await request<ContactMessage[]>(
    baseUrl,
    '/api/cms/contact-messages',
    { headers: authHeaders(adminToken) },
  );
  assert.ok(contacts.some((item) => item.id === contact.id));

  const readContact = await request<ContactMessage>(
    baseUrl,
    `/api/cms/contact-messages/${contact.id}/status`,
    {
      method: 'PATCH',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ status: ContactMessageStatus.Read }),
    },
  );
  assert.equal(readContact.status, ContactMessageStatus.Read);

  const subscription = await request<NewsletterSubscription>(
    baseUrl,
    '/api/public/newsletter-subscriptions',
    {
      method: 'POST',
      body: JSON.stringify({
        email: 'newsletter.crud@example.com',
        source: 'api_crud_test',
      }),
    },
    201,
  );
  assert.equal(subscription.email, 'newsletter.crud@example.com');

  const sameSubscription = await request<NewsletterSubscription>(
    baseUrl,
    '/api/public/newsletter-subscriptions',
    {
      method: 'POST',
      body: JSON.stringify({
        email: 'newsletter.crud@example.com',
        source: 'api_crud_test_repeat',
      }),
    },
    201,
  );
  assert.equal(sameSubscription.id, subscription.id);
  assert.equal(sameSubscription.source, 'api_crud_test_repeat');

  const subscriptions = await request<NewsletterSubscription[]>(
    baseUrl,
    '/api/cms/newsletter-subscriptions',
    { headers: authHeaders(adminToken) },
  );
  assert.ok(subscriptions.some((item) => item.id === subscription.id));
}

async function createPatient(
  baseUrl: string,
  token: string,
  payload: Record<string, unknown>,
) {
  return request<Patient>(
    baseUrl,
    '/api/patients',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    },
    201,
  );
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
  assert.ok(auth.refreshToken);
  assert.equal(auth.user.email, email);
  return auth;
}

async function expectStatus(
  baseUrl: string,
  path: string,
  expectedStatus: number,
  token?: string,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? authHeaders(token) : undefined,
  });
  const body = await response.text();
  assert.equal(
    response.status,
    expectedStatus,
    `${path} returned ${response.status}: ${body}`,
  );
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

function assertPaginated<T>(value: Paginated<T>) {
  assert.ok(Array.isArray(value.data), 'Expected paginated data array');
  assert.equal(value.meta.page, 1);
  assert.ok(value.meta.total >= value.data.length);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
