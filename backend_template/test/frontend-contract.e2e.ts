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
import { AuditEntry } from '../src/audit/audit-entry.entity';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import {
  AlertSeverity,
  CmsStatus,
  DoctorStatus,
  Gender,
  MedicationStatus,
  PregnancyStatus,
  PrescriptionStatus,
  ReimbursementRate,
  RiskLevel,
  UserRole,
} from '../src/common/entities/enums';
import {
  Partner,
  Post,
  Specialty,
  Testimonial,
  WhyFeature,
} from '../src/cms/cms.entities';
import { DoctorProfile } from '../src/doctors/doctor-profile.entity';
import { Medicine } from '../src/medicines/medicine.entity';
import { Patient } from '../src/patients/patient.entity';
import { PrescriptionMedication } from '../src/prescriptions/prescription-medication.entity';
import { Prescription } from '../src/prescriptions/prescription.entity';
import { SafetyAlert } from '../src/prescriptions/safety-alert.entity';
import { User } from '../src/users/user.entity';

const dataDir = join(process.cwd(), '.test-data');
const dbPath = join(dataDir, 'frontend-contract.sqlite');

process.env.API_PREFIX = 'api';
process.env.DATABASE_TYPE = 'sqlite';
process.env.SQLITE_DATABASE = dbPath;
process.env.DATABASE_SYNC = 'true';
process.env.JWT_SECRET = 'frontend-contract-secret';
process.env.JWT_REFRESH_SECRET = 'frontend-contract-refresh-secret';
process.env.CDSS_API_BASE_URL = 'http://127.0.0.1:9';

type Paginated<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
};

type CmsHome = {
  posts: Post[];
  testimonials: Testimonial[];
  partners: Partner[];
  specialties: Specialty[];
  whyFeatures: WhyFeature[];
};

type PublicDoctor = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  specialty?: string;
  city?: string;
  address?: string;
  status: DoctorStatus;
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
    await seedFrontendContractData(dataSource);

    await app.listen(0, '127.0.0.1');
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
    const port = (address as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    await verifyPublicContract(baseUrl);
    const doctorAuth = await login(baseUrl, 'dr.contract@medcity.tn', 'Medcity123');
    const adminAuth = await login(baseUrl, 'admin.contract@medcity.tn', 'Admin123');
    await verifyDoctorContract(baseUrl, doctorAuth.accessToken);
    await verifyAdminContract(baseUrl, adminAuth.accessToken);

    console.log('Frontend/NestJS contract OK');
  } finally {
    await app?.close();
    rmSync(dbPath, { force: true });
  }
}

async function seedFrontendContractData(dataSource: DataSource) {
  const users = dataSource.getRepository(User);
  const doctors = dataSource.getRepository(DoctorProfile);
  const patients = dataSource.getRepository(Patient);
  const prescriptions = dataSource.getRepository(Prescription);
  const medications = dataSource.getRepository(PrescriptionMedication);
  const alerts = dataSource.getRepository(SafetyAlert);
  const audits = dataSource.getRepository(AuditEntry);
  const medicines = dataSource.getRepository(Medicine);
  const posts = dataSource.getRepository(Post);
  const testimonials = dataSource.getRepository(Testimonial);
  const partners = dataSource.getRepository(Partner);
  const specialties = dataSource.getRepository(Specialty);
  const whyFeatures = dataSource.getRepository(WhyFeature);

  const admin = await users.save(
    users.create({
      email: 'admin.contract@medcity.tn',
      passwordHash: await bcrypt.hash('Admin123', 4),
      role: UserRole.Admin,
      isActive: true,
    }),
  );
  const doctorUser = await users.save(
    users.create({
      email: 'dr.contract@medcity.tn',
      passwordHash: await bcrypt.hash('Medcity123', 4),
      role: UserRole.Doctor,
      isActive: true,
    }),
  );
  assert.ok(admin.id, 'Admin seed user was not persisted');

  const doctor = await doctors.save(
    doctors.create({
      userId: doctorUser.id,
      firstName: 'Ahmed',
      lastName: 'Contract',
      email: doctorUser.email,
      phone: '+21671000010',
      fiscalNumber: 'MF-CONTRACT-001',
      specialty: 'Medecine generale',
      cnamCode: 'CNAM-CONTRACT-001',
      address: 'Rue de la synchronisation',
      city: 'Tunis',
      status: DoctorStatus.Active,
    }),
  );

  const patient = await patients.save(
    patients.create({
      firstName: 'Eleanor',
      lastName: 'Whitfield',
      birthDate: new Date('1948-01-12'),
      gender: Gender.Female,
      phone1: '+21671000001',
      profession: 'Retired teacher',
      internalCode: 'P-CONTRACT-001',
      address: 'Tunis',
      weightKg: 62,
      heightCm: 161,
      allergies: ['Penicillin'],
      currentMedications: [{ name: 'Warfarin', dose: '5 mg daily' }],
      comorbidities: ['Atrial fibrillation'],
      renal: { gfr: 42, status: 'moderate' },
      liver: { status: 'normal' },
      vitalsSnapshot: { hr: 78, bp: '138/82', temp: 36.8, spo2: 96 },
      flags: ['Polypharmacy'],
      missingData: ['Recent INR'],
    }),
  );

  const medicine = await medicines.save(
    medicines.create({
      dci: 'Paracetamol',
      brands: ['Doliprane'],
      atcCode: 'N02BE01',
      drugClass: 'Analgesique',
      forms: ['Tablet'],
      laboratories: ['MedCity Lab'],
      reimbursement: ReimbursementRate.Partial,
      indication: 'Pain and fever',
      contraindications: ['Severe hepatic impairment'],
      posologyAdult: '500 mg to 1 g every 6 hours',
      pregnancy: PregnancyStatus.Authorized,
      renalAdjust: false,
      hepaticAdjust: true,
      priceTndApprox: 3.5,
    }),
  );

  const prescription = await prescriptions.save(
    prescriptions.create({
      prescriptionNumber: 'RX-CONTRACT-001',
      patientId: patient.id,
      doctorId: doctor.id,
      diagnosis: 'Community-acquired pneumonia',
      status: PrescriptionStatus.PendingReview,
      risk: RiskLevel.High,
      notes: 'Contract test prescription',
    }),
  );
  await medications.save(
    medications.create({
      prescriptionId: prescription.id,
      medicineId: medicine.id,
      medicineName: 'Paracetamol',
      dosage: '500 mg',
      route: 'PO',
      frequency: 'TID',
      duration: '3 days',
      indication: 'Fever',
      confidence: 90,
      status: MedicationStatus.AiProposed,
      sortOrder: 0,
    }),
  );
  await alerts.save(
    alerts.create({
      prescriptionId: prescription.id,
      severity: AlertSeverity.Critical,
      title: 'Contract alert',
      drugsInvolved: ['Warfarin', 'Paracetamol'],
      explanation: 'Frontend needs alert-compatible payloads.',
      recommendedAction: 'Review before validation.',
      evidence: 'Contract test fixture',
    }),
  );
  await audits.save(
    audits.create({
      prescriptionId: prescription.id,
      patientName: 'Eleanor Whitfield',
      doctorName: 'Dr. Ahmed Contract',
      modelVersion: 'contract-test',
      recommendation: 'Review interaction',
      doctorModification: 'Pending',
      alertsOverridden: 0,
      finalStatus: PrescriptionStatus.PendingReview,
      timestamp: new Date('2026-05-30T09:00:00.000Z'),
    }),
  );

  await posts.save(
    posts.create({
      title: 'CDSS public contract article',
      slug: 'cdss-public-contract-article',
      excerpt: 'Public article used by frontend route tests.',
      content:
        'This article validates that the public CMS detail route is wired to NestJS.',
      category: 'Sante Numerique',
      tags: ['cdss', 'contract'],
      author: 'MedCity',
      coverColor: 'from-blue-500 to-cyan-500',
      status: CmsStatus.Published,
      featured: true,
      publishedAt: new Date('2026-05-30T08:00:00.000Z'),
      views: 10,
      readTime: 3,
      commentsCount: 0,
      metaTitle: 'CDSS public contract article',
      metaDescription: 'Frontend contract CMS article',
    }),
  );
  await testimonials.save(
    testimonials.create({
      name: 'Dr. Contract',
      role: 'Medecin',
      text: 'The CMS public home contract is stable.',
      rating: 5,
      active: true,
    }),
  );
  await partners.save(
    partners.create({
      name: 'Pharmacie Centrale de Tunisie',
      logoUrl: '',
      websiteUrl: 'https://pct.tn',
      description: 'Contract partner',
      active: true,
    }),
  );
  await specialties.save(
    specialties.create({
      name: 'Cardiologie',
      description: 'Suivi cardiovasculaire',
      iconName: 'Heart',
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      query: 'cardiology',
      active: true,
    }),
  );
  await whyFeatures.save(
    whyFeatures.create({
      iconName: 'Shield',
      gradient: 'from-blue-600 to-cyan-500',
      title: 'Securite de prescription',
      text: 'Verification des interactions et risques.',
      active: true,
    }),
  );
}

async function verifyPublicContract(baseUrl: string) {
  const health = await request<{ status: string }>(baseUrl, '/api/health');
  assert.equal(health.status, 'ok');

  const home = await request<CmsHome>(baseUrl, '/api/public/home');
  assert.equal(home.posts[0]?.slug, 'cdss-public-contract-article');
  assert.equal(home.testimonials[0]?.active, true);
  assert.equal(home.partners[0]?.name, 'Pharmacie Centrale de Tunisie');
  assert.equal(home.specialties[0]?.name, 'Cardiologie');
  assert.equal(home.whyFeatures[0]?.title, 'Securite de prescription');

  const post = await request<Post>(
    baseUrl,
    '/api/public/posts/cdss-public-contract-article',
  );
  assert.equal(post.status, CmsStatus.Published);
  assert.ok(post.views >= 11);

  const publicDoctors = await request<Paginated<PublicDoctor>>(
    baseUrl,
    '/api/public/doctors?limit=100',
  );
  assertPaginated(publicDoctors);
  assert.equal(publicDoctors.data[0]?.status, DoctorStatus.Active);
  assert.equal(publicDoctors.data[0]?.specialty, 'Medecine generale');
}

async function verifyDoctorContract(baseUrl: string, accessToken: string) {
  const me = await request<{ email: string; role: UserRole }>(
    baseUrl,
    '/api/auth/me',
    { headers: authHeaders(accessToken) },
  );
  assert.equal(me.role, UserRole.Doctor);

  const patients = await request<Paginated<Patient>>(
    baseUrl,
    '/api/patients?limit=100',
    { headers: authHeaders(accessToken) },
  );
  assertPaginated(patients);
  assert.equal(patients.data[0]?.firstName, 'Eleanor');
  assert.ok(Array.isArray(patients.data[0]?.allergies));

  const prescriptions = await request<Paginated<Prescription>>(
    baseUrl,
    '/api/prescriptions?limit=100',
    { headers: authHeaders(accessToken) },
  );
  assertPaginated(prescriptions);
  assert.equal(prescriptions.data[0]?.diagnosis, 'Community-acquired pneumonia');
  assert.ok(Array.isArray(prescriptions.data[0]?.medications));
  assert.equal(prescriptions.data[0]?.medications[0]?.medicineName, 'Paracetamol');

  const medicines = await request<Paginated<Medicine>>(
    baseUrl,
    '/api/medicines?limit=100',
    { headers: authHeaders(accessToken) },
  );
  assertPaginated(medicines);
  assert.equal(medicines.data[0]?.dci, 'Paracetamol');

  const classes = await request<string[]>(baseUrl, '/api/medicines/classes', {
    headers: authHeaders(accessToken),
  });
  assert.ok(classes.includes('Analgesique'));
}

async function verifyAdminContract(baseUrl: string, accessToken: string) {
  const doctors = await request<Paginated<DoctorProfile>>(
    baseUrl,
    '/api/doctors?limit=100',
    { headers: authHeaders(accessToken) },
  );
  assertPaginated(doctors);
  assert.equal(doctors.data[0]?.email, 'dr.contract@medcity.tn');

  const posts = await request<Post[]>(baseUrl, '/api/cms/posts', {
    headers: authHeaders(accessToken),
  });
  assert.equal(posts[0]?.slug, 'cdss-public-contract-article');

  const audits = await request<Paginated<AuditEntry>>(
    baseUrl,
    '/api/audit?limit=100',
    { headers: authHeaders(accessToken) },
  );
  assertPaginated(audits);
  assert.equal(audits.data[0]?.patientName, 'Eleanor Whitfield');
}

async function login(baseUrl: string, email: string, password: string) {
  const auth = await request<AuthResponse>(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, 201);
  assert.ok(auth.accessToken);
  assert.ok(auth.refreshToken);
  assert.equal(auth.user.email, email);
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
