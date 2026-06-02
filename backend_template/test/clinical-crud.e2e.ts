import { strict as assert } from 'node:assert';
import { mkdirSync, rmSync } from 'node:fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
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
  ContributionKind,
  ContributionStatus,
  DispatchChannel,
  DispatchStatus,
  DoctorStatus,
  Gender,
  MedicationStatus,
  PharmacyTarget,
  PregnancyStatus,
  PrescriptionStatus,
  ReimbursementRate,
  UserRole,
} from '../src/common/entities/enums';
import { DoctorProfile } from '../src/doctors/doctor-profile.entity';
import { InteractionResult } from '../src/interactions/interaction-result.entity';
import { MedicineContribution } from '../src/medicine-contributions/medicine-contribution.entity';
import { Medicine } from '../src/medicines/medicine.entity';
import { Patient } from '../src/patients/patient.entity';
import { PharmacyDispatch } from '../src/pharmacy/pharmacy-dispatch.entity';
import { PrescriptionMedication } from '../src/prescriptions/prescription-medication.entity';
import { Prescription } from '../src/prescriptions/prescription.entity';
import { SafetyAlert } from '../src/prescriptions/safety-alert.entity';
import { User } from '../src/users/user.entity';

const dataDir = join(process.cwd(), '.test-data');
const dbPath = join(dataDir, 'clinical-crud.sqlite');

process.env.API_PREFIX = 'api';
process.env.DATABASE_TYPE = 'sqlite';
process.env.SQLITE_DATABASE = dbPath;
process.env.DATABASE_SYNC = 'true';
process.env.JWT_SECRET = 'clinical-crud-secret';
process.env.JWT_REFRESH_SECRET = 'clinical-crud-refresh-secret';
process.env.EMAIL_ENABLED = 'false';
process.env.SUPABASE_BUCKET = 'clinical-test-audio';
process.env.CDSS_API_TIMEOUT_MS = '5000';
process.env.TRANSLATION_TIMEOUT_MS = '5000';

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

type DoctorSeed = {
  admin: User;
  doctorUser: User;
  doctor: DoctorProfile;
};

type TestContext = {
  patient: Patient;
  medicine: Medicine;
  prescription: Prescription;
};

type CdssDraftResponse = {
  saved: boolean;
  prescription?: Prescription;
  ia: {
    trace_id: string;
    status: string;
  };
};

async function main() {
  mkdirSync(dataDir, { recursive: true });
  rmSync(dbPath, { force: true });

  const translationServer = await startTranslationServer();
  const cdssServer = await startCdssServer();
  process.env.LIBRETRANSLATE_URL = translationServer.baseUrl;
  process.env.CDSS_API_BASE_URL = `${cdssServer.baseUrl}/v1`;

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
    await seedClinicalData(dataSource);

    await app.listen(0, '127.0.0.1');
    const baseUrl = testBaseUrl(app);

    const doctorAuth = await login(baseUrl, 'doctor.clinical@medcity.tn', 'Medcity123');
    const adminAuth = await login(baseUrl, 'admin.clinical@medcity.tn', 'Admin123');

    await verifyDoctorsCrud(baseUrl, adminAuth.accessToken, doctorAuth.accessToken);
    const context = await verifyMedicinesCrud(baseUrl, adminAuth.accessToken, doctorAuth.accessToken);
    await verifyPrescriptionsAndPharmacy(baseUrl, doctorAuth.accessToken, adminAuth.accessToken, context);
    await verifyMedicineContributions(baseUrl, doctorAuth.accessToken, adminAuth.accessToken, context.medicine);
    await verifyInteractions(baseUrl, doctorAuth.accessToken);
    await verifyCdssAdapter(baseUrl, doctorAuth.accessToken, context.patient.id);
    await verifyTranslations(baseUrl, doctorAuth.accessToken);
    await verifyAudioSmoke(baseUrl, doctorAuth.accessToken);
    await verifyMetrics(baseUrl);

    console.log('NestJS clinical/admin endpoint tests OK');
  } finally {
    await app?.close();
    await translationServer.close();
    await cdssServer.close();
    rmSync(dbPath, { force: true });
  }
}

async function seedClinicalData(dataSource: DataSource): Promise<DoctorSeed> {
  const users = dataSource.getRepository(User);
  const doctors = dataSource.getRepository(DoctorProfile);
  const interactions = dataSource.getRepository(InteractionResult);

  const admin = await users.save(
    users.create({
      email: 'admin.clinical@medcity.tn',
      passwordHash: await bcrypt.hash('Admin123', 4),
      role: UserRole.Admin,
      isActive: true,
    }),
  );
  const doctorUser = await users.save(
    users.create({
      email: 'doctor.clinical@medcity.tn',
      passwordHash: await bcrypt.hash('Medcity123', 4),
      role: UserRole.Doctor,
      isActive: true,
    }),
  );
  const doctor = await doctors.save(
    doctors.create({
      userId: doctorUser.id,
      firstName: 'Selma',
      lastName: 'Clinical',
      email: doctorUser.email,
      phone: '+21671000222',
      fiscalNumber: 'MF-CLINICAL-001',
      specialty: 'Medecine interne',
      cnamCode: 'CNAM-CLINICAL-001',
      address: 'Rue clinique',
      city: 'Tunis',
      status: DoctorStatus.Active,
    }),
  );

  await interactions.save(
    interactions.create({
      drugA: 'Warfarin',
      drugB: 'Ibuprofen',
      severity: AlertSeverity.Critical,
      mechanism: 'Anticoagulation and NSAID bleeding risk',
      consequence: 'Major bleeding',
      action: 'Avoid combination or monitor closely',
      evidence: 'Clinical interaction fixture',
    }),
  );

  return { admin, doctorUser, doctor };
}

async function verifyDoctorsCrud(
  baseUrl: string,
  adminToken: string,
  doctorToken: string,
) {
  const profile = await request<DoctorProfile>(baseUrl, '/api/doctors/me/profile', {
    headers: authHeaders(doctorToken),
  });
  assert.equal(profile.email, 'doctor.clinical@medcity.tn');

  const updatedProfile = await request<DoctorProfile>(
    baseUrl,
    '/api/doctors/me/profile',
    {
      method: 'PATCH',
      headers: authHeaders(doctorToken),
      body: JSON.stringify({ city: 'Sfax', gsm: '+21699000111' }),
    },
  );
  assert.equal(updatedProfile.city, 'Sfax');

  await expectStatus(baseUrl, '/api/doctors', 403, doctorToken);

  const created = await request<DoctorProfile>(
    baseUrl,
    '/api/doctors',
    {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        firstName: 'Rim',
        lastName: 'Automation',
        email: 'rim.automation@medcity.tn',
        phone: '+21671000333',
        fiscalNumber: 'MF-CLINICAL-002',
        specialty: 'Cardiologie',
        cnamCode: 'CNAM-CLINICAL-002',
        city: 'Tunis',
        password: 'Medcity123',
      }),
    },
    201,
  );
  assert.ok(created.id);

  const list = await request<Paginated<DoctorProfile>>(baseUrl, '/api/doctors?limit=50', {
    headers: authHeaders(adminToken),
  });
  assertPaginated(list);
  assert.ok(list.data.some((doctor) => doctor.id === created.id));

  const patched = await request<DoctorProfile>(
    baseUrl,
    `/api/doctors/${created.id}`,
    {
      method: 'PATCH',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ specialty: 'Pneumologie' }),
    },
  );
  assert.equal(patched.specialty, 'Pneumologie');

  const inactive = await request<DoctorProfile>(
    baseUrl,
    `/api/doctors/${created.id}/status`,
    {
      method: 'PATCH',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ status: DoctorStatus.Inactive }),
    },
  );
  assert.equal(inactive.status, DoctorStatus.Inactive);

  const publicDoctors = await request<Paginated<DoctorProfile>>(
    baseUrl,
    '/api/public/doctors?limit=50',
  );
  assert.ok(!publicDoctors.data.some((doctor) => doctor.id === created.id));

  const removed = await request<{ ok: boolean }>(
    baseUrl,
    `/api/doctors/${created.id}`,
    { method: 'DELETE', headers: authHeaders(adminToken) },
  );
  assert.equal(removed.ok, true);
}

async function verifyMedicinesCrud(
  baseUrl: string,
  adminToken: string,
  doctorToken: string,
): Promise<TestContext> {
  await expectStatus(baseUrl, '/api/medicines', 401);
  await expectStatus(baseUrl, '/api/medicines', 403, doctorToken, {
    method: 'POST',
    body: JSON.stringify(medicinePayload('Forbiddenol')),
  });

  const medicine = await request<Medicine>(
    baseUrl,
    '/api/medicines',
    {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify(medicinePayload('Paracetamol Clinical')),
    },
    201,
  );
  assert.equal(medicine.dci, 'Paracetamol Clinical');

  const listed = await request<Paginated<Medicine>>(
    baseUrl,
    `/api/medicines?limit=50&drugClass=${encodeURIComponent('Antalgique')}`,
    { headers: authHeaders(doctorToken) },
  );
  assertPaginated(listed);
  assert.ok(listed.data.some((item) => item.id === medicine.id));

  const searched = await request<Medicine[]>(
    baseUrl,
    '/api/medicines/search?q=paracetamol',
    { headers: authHeaders(doctorToken) },
  );
  assert.ok(searched.some((item) => item.id === medicine.id));

  const classes = await request<string[]>(baseUrl, '/api/medicines/classes', {
    headers: authHeaders(doctorToken),
  });
  assert.ok(classes.includes('Antalgique'));

  const patched = await request<Medicine>(
    baseUrl,
    `/api/medicines/${medicine.id}`,
    {
      method: 'PATCH',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ priceTndApprox: 4.2, hepaticAdjust: true }),
    },
  );
  assert.equal(Number(patched.priceTndApprox), 4.2);
  assert.equal(patched.hepaticAdjust, true);

  const patient = await request<Patient>(
    baseUrl,
    '/api/patients',
    {
      method: 'POST',
      headers: authHeaders(doctorToken),
      body: JSON.stringify({
        firstName: 'Youssef',
        lastName: 'Clinical',
        birthDate: '1968-05-18',
        gender: Gender.Male,
        phone1: '+21622123456',
        currentMedications: [{ name: 'Warfarin', dose: '5 mg' }],
        allergies: ['Ibuprofen'],
        renal: { gfr: 58, status: 'mild' },
      }),
    },
    201,
  );

  const prescription = await createPrescription(baseUrl, doctorToken, patient.id, medicine.id, 9);
  return { patient, medicine, prescription };
}

async function verifyPrescriptionsAndPharmacy(
  baseUrl: string,
  doctorToken: string,
  adminToken: string,
  context: TestContext,
) {
  const { patient, prescription } = context;
  assert.equal(prescription.status, PrescriptionStatus.Draft);
  assert.equal(prescription.medications.length, 9);

  const listed = await request<Paginated<Prescription>>(
    baseUrl,
    `/api/prescriptions?patientId=${patient.id}&limit=50`,
    { headers: authHeaders(doctorToken) },
  );
  assertPaginated(listed);
  assert.ok(listed.data.some((item) => item.id === prescription.id));

  const added = await request<Prescription>(
    baseUrl,
    `/api/prescriptions/${prescription.id}/medications`,
    {
      method: 'POST',
      headers: authHeaders(doctorToken),
      body: JSON.stringify({
        medicineName: 'Omeprazole',
        dosage: '20 mg',
        route: 'PO',
        frequency: 'QD',
        duration: '7 days',
        status: MedicationStatus.Edited,
      }),
    },
    201,
  );
  assert.equal(added.medications.length, 10);
  const addedMedication = added.medications.find(
    (medication) => medication.medicineName === 'Omeprazole',
  );
  assert.ok(addedMedication);

  const updatedMedication = await request<Prescription>(
    baseUrl,
    `/api/prescriptions/${prescription.id}/medications/${addedMedication.id}`,
    {
      method: 'PATCH',
      headers: authHeaders(doctorToken),
      body: JSON.stringify({
        medicineName: 'Omeprazole',
        dosage: '40 mg',
        route: 'PO',
        frequency: 'QD',
        duration: '7 days',
        status: MedicationStatus.Edited,
      }),
    },
  );
  assert.equal(
    updatedMedication.medications.find((item) => item.id === addedMedication.id)
      ?.dosage,
    '40 mg',
  );

  const removedMedication = await request<Prescription>(
    baseUrl,
    `/api/prescriptions/${prescription.id}/medications/${addedMedication.id}`,
    { method: 'DELETE', headers: authHeaders(doctorToken) },
  );
  assert.ok(
    !removedMedication.medications.some((item) => item.id === addedMedication.id),
  );

  const alerts = await request<SafetyAlert[]>(
    baseUrl,
    `/api/prescriptions/${prescription.id}/safety-check`,
    { method: 'POST', headers: authHeaders(doctorToken) },
    201,
  );
  assert.ok(alerts.some((alert) => alert.title === 'Polypharmacy review'));

  const alertList = await request<SafetyAlert[]>(
    baseUrl,
    `/api/prescriptions/${prescription.id}/safety-alerts`,
    { headers: authHeaders(doctorToken) },
  );
  assert.ok(alertList.length >= 1);

  const snapshot = await request<Prescription>(
    baseUrl,
    `/api/prescriptions/${prescription.id}/print-snapshot`,
    { method: 'POST', headers: authHeaders(doctorToken) },
    201,
  );
  assert.ok(snapshot.printedAt);
  assert.ok(snapshot.printSnapshot);

  const ordonnance = await request<{
    prescriptionNumber: string;
    footerNumber?: string;
    medications: PrescriptionMedication[];
  }>(baseUrl, `/api/prescriptions/${prescription.id}/ordonnance`, {
    headers: authHeaders(doctorToken),
  });
  assert.equal(ordonnance.footerNumber, ordonnance.prescriptionNumber);
  assert.ok(ordonnance.medications.length >= 9);

  const pharmacyDispatch = await request<PharmacyDispatch>(
    baseUrl,
    `/api/prescriptions/${prescription.id}/send-to-pharmacy`,
    {
      method: 'POST',
      headers: authHeaders(doctorToken),
      body: JSON.stringify({
        recipient: 'pharmacy@example.com',
        channel: DispatchChannel.Email,
        note: 'Dispatch to pharmacy test',
      }),
    },
    201,
  );
  assert.equal(pharmacyDispatch.target, PharmacyTarget.Pharmacist);

  const patientDispatch = await request<PharmacyDispatch>(
    baseUrl,
    `/api/prescriptions/${prescription.id}/send-to-patient`,
    {
      method: 'POST',
      headers: authHeaders(doctorToken),
      body: JSON.stringify({
        recipient: 'patient@example.com',
        channel: DispatchChannel.Email,
      }),
    },
    201,
  );
  assert.equal(patientDispatch.target, PharmacyTarget.Patient);

  const manualDispatch = await request<PharmacyDispatch>(
    baseUrl,
    '/api/pharmacy/dispatches',
    {
      method: 'POST',
      headers: authHeaders(doctorToken),
      body: JSON.stringify({
        prescriptionId: prescription.id,
        target: PharmacyTarget.Patient,
        recipient: '+21622000000',
        channel: DispatchChannel.Sms,
        note: 'Manual dispatch test',
      }),
    },
    201,
  );
  assert.equal(manualDispatch.status, DispatchStatus.Sent);

  const dispatchList = await request<Paginated<PharmacyDispatch>>(
    baseUrl,
    `/api/pharmacy/dispatches?target=${PharmacyTarget.Patient}&limit=50`,
    { headers: authHeaders(doctorToken) },
  );
  assertPaginated(dispatchList);
  assert.ok(dispatchList.data.some((item) => item.id === manualDispatch.id));

  const received = await request<PharmacyDispatch>(
    baseUrl,
    `/api/pharmacy/dispatches/${manualDispatch.id}/status`,
    {
      method: 'PATCH',
      headers: authHeaders(doctorToken),
      body: JSON.stringify({ status: DispatchStatus.Received }),
    },
  );
  assert.equal(received.status, DispatchStatus.Received);

  const updatedDispatch = await request<PharmacyDispatch>(
    baseUrl,
    `/api/pharmacy/dispatches/${manualDispatch.id}`,
    {
      method: 'PATCH',
      headers: authHeaders(doctorToken),
      body: JSON.stringify({ note: 'Manual dispatch updated' }),
    },
  );
  assert.equal(updatedDispatch.note, 'Manual dispatch updated');

  const removedDispatch = await request<{ ok: boolean }>(
    baseUrl,
    `/api/pharmacy/dispatches/${manualDispatch.id}`,
    { method: 'DELETE', headers: authHeaders(doctorToken) },
  );
  assert.equal(removedDispatch.ok, true);

  const validated = await request<Prescription>(
    baseUrl,
    `/api/prescriptions/${prescription.id}/validate`,
    { method: 'POST', headers: authHeaders(doctorToken) },
    201,
  );
  assert.equal(validated.status, PrescriptionStatus.Validated);
  assert.ok(validated.validatedAt);

  const auditEntries = await request<Paginated<AuditEntry>>(
    baseUrl,
    '/api/audit?limit=50',
    { headers: authHeaders(adminToken) },
  );
  assertPaginated(auditEntries);
  const validateAudit = auditEntries.data.find(
    (entry) => entry.prescriptionId === prescription.id,
  );
  assert.ok(validateAudit);

  const prescriptionAudit = await request<AuditEntry[]>(
    baseUrl,
    `/api/audit/prescriptions/${prescription.id}`,
    { headers: authHeaders(adminToken) },
  );
  assert.ok(prescriptionAudit.length >= 1);
  const auditById = await request<AuditEntry>(
    baseUrl,
    `/api/audit/${validateAudit.id}`,
    { headers: authHeaders(adminToken) },
  );
  assert.equal(auditById.id, validateAudit.id);

  const secondPrescription = await createPrescription(
    baseUrl,
    doctorToken,
    patient.id,
    undefined,
    1,
  );
  const rejected = await request<Prescription>(
    baseUrl,
    `/api/prescriptions/${secondPrescription.id}/reject`,
    { method: 'POST', headers: authHeaders(doctorToken) },
    201,
  );
  assert.equal(rejected.status, PrescriptionStatus.Rejected);

  const deleted = await request<{ ok: boolean }>(
    baseUrl,
    `/api/prescriptions/${secondPrescription.id}`,
    { method: 'DELETE', headers: authHeaders(doctorToken) },
  );
  assert.equal(deleted.ok, true);
}

async function verifyMedicineContributions(
  baseUrl: string,
  doctorToken: string,
  adminToken: string,
  medicine: Medicine,
) {
  const correction = await request<MedicineContribution>(
    baseUrl,
    '/api/medicine-contributions',
    {
      method: 'POST',
      headers: authHeaders(doctorToken),
      body: JSON.stringify({
        kind: ContributionKind.Correction,
        targetMedicineId: medicine.id,
        field: 'posologyAdult',
        oldValue: medicine.posologyAdult,
        newValue: '500 mg every 8 hours',
        rationale: 'Updated local guideline',
      }),
    },
    201,
  );
  assert.equal(correction.status, ContributionStatus.Pending);
  assert.equal(correction.targetMedicineDci, medicine.dci);

  await expectStatus(baseUrl, `/api/medicine-contributions/${correction.id}/validate`, 403, doctorToken, {
    method: 'POST',
  });

  const validated = await request<MedicineContribution>(
    baseUrl,
    `/api/medicine-contributions/${correction.id}/validate`,
    { method: 'POST', headers: authHeaders(adminToken) },
    201,
  );
  assert.equal(validated.status, ContributionStatus.Validated);
  assert.equal(validated.reviewerEmail, 'admin.clinical@medcity.tn');

  const newMedicineContribution = await request<MedicineContribution>(
    baseUrl,
    '/api/medicine-contributions',
    {
      method: 'POST',
      headers: authHeaders(doctorToken),
      body: JSON.stringify({
        kind: ContributionKind.NewMedicine,
        newMedicine: medicinePayload('Crud Contribution Medicine'),
        rationale: 'New medicine contribution test',
      }),
    },
    201,
  );
  await request<MedicineContribution>(
    baseUrl,
    `/api/medicine-contributions/${newMedicineContribution.id}/validate`,
    { method: 'POST', headers: authHeaders(adminToken) },
    201,
  );
  const createdMedicine = await request<Medicine[]>(
    baseUrl,
    '/api/medicines/search?q=crud%20contribution',
    { headers: authHeaders(adminToken) },
  );
  assert.ok(createdMedicine.some((item) => item.dci === 'Crud Contribution Medicine'));

  const note = await request<MedicineContribution>(
    baseUrl,
    '/api/medicine-contributions',
    {
      method: 'POST',
      headers: authHeaders(doctorToken),
      body: JSON.stringify({
        kind: ContributionKind.Note,
        targetMedicineId: medicine.id,
        note: 'Note contribution to refuse',
      }),
    },
    201,
  );
  const refused = await request<MedicineContribution>(
    baseUrl,
    `/api/medicine-contributions/${note.id}/refuse`,
    {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ refusalReason: 'Insufficient evidence' }),
    },
    201,
  );
  assert.equal(refused.status, ContributionStatus.Refused);
  assert.equal(refused.refusalReason, 'Insufficient evidence');

  const doctorList = await request<Paginated<MedicineContribution>>(
    baseUrl,
    `/api/medicine-contributions?kind=${ContributionKind.Correction}&limit=50`,
    { headers: authHeaders(doctorToken) },
  );
  assertPaginated(doctorList);
  assert.ok(doctorList.data.some((item) => item.id === correction.id));

  const adminList = await request<Paginated<MedicineContribution>>(
    baseUrl,
    `/api/medicine-contributions?status=${ContributionStatus.Refused}&limit=50`,
    { headers: authHeaders(adminToken) },
  );
  assert.ok(adminList.data.some((item) => item.id === note.id));

  const removed = await request<{ ok: boolean }>(
    baseUrl,
    `/api/medicine-contributions/${note.id}`,
    { method: 'DELETE', headers: authHeaders(adminToken) },
  );
  assert.equal(removed.ok, true);
}

async function verifyInteractions(baseUrl: string, token: string) {
  const list = await request<Paginated<InteractionResult>>(
    baseUrl,
    '/api/interactions?search=warfarin&limit=50',
    { headers: authHeaders(token) },
  );
  assertPaginated(list);
  assert.ok(list.data.some((interaction) => interaction.drugA === 'Warfarin'));

  const checked = await request<InteractionResult[]>(
    baseUrl,
    '/api/interactions/check',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ drugs: ['Warfarin', 'Ibuprofen'] }),
    },
    201,
  );
  assert.equal(checked[0]?.severity, AlertSeverity.Critical);
}

async function verifyCdssAdapter(baseUrl: string, token: string, patientId: string) {
  const analysis = await request<{ status: string }>(
    baseUrl,
    '/api/cdss/prescriptions/analyze',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        patientId,
        diagnosis: 'Angine',
        notes: 'Fievre et douleur gorge',
        save: false,
      }),
    },
    201,
  );
  assert.equal(analysis.status, 'analyzed');

  const draft = await request<CdssDraftResponse>(
    baseUrl,
    '/api/cdss/prescriptions/draft',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        patientId,
        diagnosis: 'Angine',
        notes: 'Fievre et douleur gorge',
        save: false,
      }),
    },
    201,
  );
  assert.equal(draft.saved, false);
  assert.equal(draft.ia.trace_id, 'trace-clinical-test');

  const savedDraft = await request<CdssDraftResponse>(
    baseUrl,
    '/api/cdss/prescriptions/draft',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        patientId,
        diagnosis: 'Angine',
        notes: 'Sauvegarder la proposition',
        save: true,
      }),
    },
    201,
  );
  assert.equal(savedDraft.saved, true);
  assert.ok(savedDraft.prescription?.id);
  assert.equal(savedDraft.prescription?.status, PrescriptionStatus.PendingReview);

  const validation = await request<{ status: string }>(
    baseUrl,
    '/api/cdss/prescriptions/validate-plan',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        patientId,
        plan: { medications: [{ name: 'Amoxicillin' }] },
      }),
    },
    201,
  );
  assert.equal(validation.status, 'validated');

  const formulary = await request<{ results: Array<{ name: string }> }>(
    baseUrl,
    '/api/cdss/formulary/search?query=amox&limit=5',
    { headers: authHeaders(token) },
  );
  assert.equal(formulary.results[0]?.name, 'Amoxicillin');

  const kg = await request<{ facts: Array<{ subject: string }> }>(
    baseUrl,
    '/api/cdss/kg/search?query=angine&limit=5&route=oral',
    { headers: authHeaders(token) },
  );
  assert.equal(kg.facts[0]?.subject, 'Angine');

  const audit = await request<{ trace_id: string }>(
    baseUrl,
    '/api/cdss/prescriptions/audit/trace-clinical-test',
    { headers: authHeaders(token) },
  );
  assert.equal(audit.trace_id, 'trace-clinical-test');
}

async function verifyTranslations(baseUrl: string, token: string) {
  const languages = await request<Array<{ code: string }>>(
    baseUrl,
    '/api/translations/languages',
    { headers: authHeaders(token) },
  );
  assert.ok(languages.some((language) => language.code === 'fr'));

  const translated = await request<{ translatedText: string }>(
    baseUrl,
    '/api/translations/translate',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        text: 'bonjour',
        source: 'fr',
        target: 'en',
      }),
    },
    201,
  );
  assert.equal(translated.translatedText, 'hello');

  const fields = await request<{
    fields: Record<string, Record<string, string>>;
  }>(
    baseUrl,
    '/api/translations/translate-fields',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        fields: { title: 'bonjour' },
        source: 'fr',
        targets: ['en', 'ar'],
      }),
    },
    201,
  );
  assert.equal(fields.fields.title.en, 'hello');
  assert.equal(fields.fields.title.ar, 'مرحبا');
}

async function verifyAudioSmoke(baseUrl: string, token: string) {
  const target = await request<{
    method: string;
    bucket: string;
    path: string;
    uploadUrl: string;
  }>(
    baseUrl,
    '/api/audio/create-upload-url',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        consultationId: 'clinical-audio-001',
        filename: 'recording.webm',
        contentType: 'audio/webm',
      }),
    },
    201,
  );
  assert.equal(target.bucket, 'clinical-test-audio');
  assert.equal(target.path, 'consultations/clinical-audio-001/raw.webm');

  await expectStatus(baseUrl, '/api/audio/create-upload-url', 400, token, {
    method: 'POST',
    body: JSON.stringify({
      consultationId: 'clinical-audio-001',
      filename: 'not-audio.txt',
      contentType: 'text/plain',
    }),
  });

  await expectStatus(baseUrl, '/api/audio/start-processing', 400, token, {
    method: 'POST',
    body: JSON.stringify({
      consultationId: 'clinical-audio-001',
      bucketPath: 'consultations/another/raw.webm',
    }),
  });
}

async function verifyMetrics(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/metrics`);
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.ok(text.includes('medcity_api_info'));
  assert.ok(text.includes('medcity_http_requests_total'));
}

async function createPrescription(
  baseUrl: string,
  token: string,
  patientId: string,
  medicineId?: string,
  medicationCount = 1,
) {
  const medications = Array.from({ length: medicationCount }, (_, index) => ({
    medicineId: index === 0 ? medicineId : undefined,
    medicineName: index === 0 ? 'Paracetamol Clinical' : `Medication ${index + 1}`,
    dosage: index === 0 ? '500 mg' : '1 cp',
    route: 'PO',
    frequency: index === 0 ? 'TID' : 'QD',
    duration: '3 days',
    indication: 'Clinical test',
    status: MedicationStatus.AiProposed,
    sortOrder: index,
  }));

  return request<Prescription>(
    baseUrl,
    '/api/prescriptions',
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        patientId,
        diagnosis: 'Syndrome febrile',
        notes: 'Prescription de test clinique',
        medications,
      }),
    },
    201,
  );
}

function medicinePayload(dci: string) {
  return {
    dci,
    brands: [dci],
    atcCode: 'N02BE01',
    drugClass: 'Antalgique',
    forms: ['Tablet'],
    laboratories: ['MedCity Test Lab'],
    reimbursement: ReimbursementRate.Partial,
    indication: 'Pain and fever',
    contraindications: ['Severe hepatic impairment'],
    posologyAdult: '500 mg to 1 g every 6 hours',
    pregnancy: PregnancyStatus.Authorized,
    renalAdjust: false,
    hepaticAdjust: false,
    priceTndApprox: 3.5,
  };
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
  options: RequestInit = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? authHeaders(token) : {}),
      ...options.headers,
    },
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

async function startTranslationServer() {
  return startJsonServer((request) => {
    if (request.method === 'GET' && request.url === '/languages') {
      return [
        { code: 'fr', name: 'French' },
        { code: 'en', name: 'English' },
        { code: 'ar', name: 'Arabic' },
      ];
    }
    if (request.method === 'POST' && request.url === '/translate') {
      return { translatedText: translationFor(request.body) };
    }
    return { error: 'not found' };
  });
}

async function startCdssServer() {
  return startJsonServer((request) => {
    if (request.url?.startsWith('/v1/prescriptions/formulary/search')) {
      return { results: [{ name: 'Amoxicillin', dci: 'amoxicillin' }] };
    }
    if (request.url?.startsWith('/v1/prescriptions/kg/search')) {
      return { facts: [{ subject: 'Angine', predicate: 'treated_by' }] };
    }
    if (request.url?.startsWith('/v1/prescriptions/audit/')) {
      return { trace_id: request.url.split('/').pop(), status: 'found' };
    }
    if (request.method === 'POST' && request.url === '/v1/prescriptions/analyze') {
      return { status: 'analyzed', request: request.body };
    }
    if (request.method === 'POST' && request.url === '/v1/prescriptions/validate') {
      return { status: 'validated', findings: [] };
    }
    if (request.method === 'POST' && request.url === '/v1/prescriptions/draft') {
      return {
        trace_id: 'trace-clinical-test',
        status: 'drafted',
        blocked: false,
        doctor_final_validation_required: true,
        draft_plan: {
          problem_summary: 'Angine probable',
          confidence: 0.82,
          medications: [
            {
              active_ingredient: 'Amoxicillin',
              indication: 'Angine',
              dose: '1 g',
              frequency: 'BID',
              duration: '7 days',
              route: 'oral',
              rationale: 'Fixture CDSS draft',
            },
          ],
          generation_notes: ['Fixture generated'],
        },
        safety: {
          findings: [
            {
              severity: 'warning',
              category: 'Review',
              message: 'Validate allergy status',
              medication: 'Amoxicillin',
              recommended_action: 'Confirm no allergy before validation',
              evidence_source: 'Fixture CDSS',
            },
          ],
        },
        proposal: {
          clinician_review_required: true,
          review_notes: ['Doctor review required'],
        },
      };
    }
    return { error: 'not found' };
  });
}

async function startJsonServer(
  handler: (request: { method?: string; url?: string; body?: unknown }) => unknown,
) {
  const server = createServer(async (req, res) => {
    const body = await readJson(req);
    const payload = handler({ method: req.method, url: req.url, body });
    sendJson(res, payload);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.notEqual(address, null, 'fake server did not expose a port');
  assert.notEqual(typeof address, 'string', 'fake server unexpectedly used a pipe');
  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    server,
  };
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return undefined;
  return JSON.parse(text) as unknown;
}

function sendJson(res: ServerResponse, payload: unknown) {
  const status =
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    (payload as { error?: string }).error === 'not found'
      ? 404
      : 200;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function translationFor(body: unknown) {
  if (
    typeof body === 'object' &&
    body !== null &&
    'target' in body &&
    'q' in body
  ) {
    const target = String((body as { target: unknown }).target);
    if (target === 'en') return 'hello';
    if (target === 'ar') return 'مرحبا';
    return String((body as { q: unknown }).q);
  }
  return '';
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
