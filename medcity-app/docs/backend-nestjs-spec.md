# MedCity Connect Backend Specification - NestJS

This document describes the backend structure needed for the current `medcity-app` frontend.
The target backend stack is NestJS.

## 1. Backend Goals

The backend should provide:

- Authentication for admin and doctor users.
- Doctor profile management.
- Patient administrative records.
- Consultation records.
- Consultation physical measurements when needed.
- Prescription and printable ordonnance generation.
- Pharmacy dispatch tracking, managed by admin only.
- Medicine database.
- Medicine contribution workflow from doctors to admin.
- CMS content for the public website.
- Audit trail for clinical decisions and prescription validation.

Important rule:

- Patient identity/contact data is stored on `Patient`.
- Physical measurements are not static patient fields. They belong to `ConsultationVitals`, because they are taken during consultations only when needed.
- Doctors can send prescriptions to a pharmacy, but doctors must not manage the pharmacy dispatch list. Pharmacy management is admin-only.

## 2. Suggested NestJS Modules

```txt
src/
  auth/
  users/
  doctors/
  patients/
  consultations/
  prescriptions/
  medicines/
  medicine-contributions/
  pharmacy/
  cms/
  audit/
  common/
```

Suggested responsibilities:

- `auth`: login, JWT, guards, roles.
- `users`: base account model.
- `doctors`: doctor profile and admin doctor management.
- `patients`: patient CRUD.
- `consultations`: appointments, notes, consultation vitals.
- `prescriptions`: prescriptions, medications, ordonnance print payload.
- `medicines`: Tunisian medicine database.
- `medicine-contributions`: doctor contributions and admin validation/refusal.
- `pharmacy`: admin pharmacy dispatch management.
- `cms`: posts, testimonials, partners, specialties, public home content.
- `audit`: prescription/CDSS audit logs.
- `common`: shared decorators, guards, DTO helpers, pagination.

## 3. Roles

```ts
type UserRole = "admin" | "doctor";
```

Access rules:

- `admin`: full access to admin dashboard, doctors, patients, CMS, pharmacy dispatches, audit, medicines, contributions.
- `doctor`: access to own workspace, patients, consultations, prescriptions, medicines, medicine contributions, contact admin.
- `doctor` must not access `/pharmacy` management endpoints except sending a prescription through a controlled endpoint.

## 4. Entities

### 4.1 User

Base authentication account.

```ts
User {
  id: string
  email: string
  passwordHash: string
  role: "admin" | "doctor"
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
```

Relations:

- `User 1--1 DoctorProfile` when role is `doctor`.

Recommended database table:

```txt
users
- id uuid pk
- email varchar unique not null
- password_hash varchar not null
- role enum(admin, doctor) not null
- is_active boolean default true
- created_at timestamp
- updated_at timestamp
```

### 4.2 DoctorProfile

Doctor profile fields requested for the project.

```ts
DoctorProfile {
  id: string
  userId: string
  firstName: string       // Prenom
  lastName: string        // Nom
  email: string
  phone: string           // N du portable
  fiscalNumber: string    // Matricule fiscale
  specialty?: string      // Example: Medecin de famille
  cnamCode?: string       // Code CNAM
  gsm?: string
  address?: string
  city?: string
  status: "active" | "inactive"
  createdAt: Date
  updatedAt: Date
}
```

Relations:

- `DoctorProfile 1--1 User`
- `DoctorProfile 1--N Consultation`
- `DoctorProfile 1--N Prescription`
- `DoctorProfile 1--N MedicineContribution`

Recommended table:

```txt
doctor_profiles
- id uuid pk
- user_id uuid fk users.id unique
- first_name varchar not null
- last_name varchar not null
- email varchar not null
- phone varchar not null
- fiscal_number varchar not null
- specialty varchar null
- cnam_code varchar null
- gsm varchar null
- address text null
- city varchar null
- status enum(active, inactive) default active
- created_at timestamp
- updated_at timestamp
```

### 4.3 Patient

Patient administrative data.

```ts
Patient {
  id: string
  firstName: string       // Prenom *
  lastName: string        // Nom *
  birthDate: Date         // Date de naissance *
  gender: "male" | "female" | "other" // Genre *
  phone1: string          // N du portable *
  phone2?: string
  phone3?: string
  profession?: string
  internalCode?: string
  address?: string
  createdAt: Date
  updatedAt: Date
}
```

Relations:

- `Patient 1--N Consultation`
- `Patient 1--N ConsultationVitals`
- `Patient 1--N Prescription`
- `Patient 1--N PharmacyDispatch`

Recommended table:

```txt
patients
- id uuid pk
- first_name varchar not null
- last_name varchar not null
- birth_date date not null
- gender enum(male, female, other) not null
- phone1 varchar not null
- phone2 varchar null
- phone3 varchar null
- profession varchar null
- internal_code varchar unique null
- address text null
- created_at timestamp
- updated_at timestamp
```

### 4.4 Consultation

Consultation or appointment record.

```ts
Consultation {
  id: string
  patientId: string
  doctorId: string
  reason?: string
  scheduledAt: Date
  status: "scheduled" | "in_progress" | "completed" | "cancelled"
  notes?: string
  diagnosis?: string
  startedAt?: Date
  endedAt?: Date
  recordingUrl?: string
  recordingDurationSec?: number
  createdAt: Date
  updatedAt: Date
}
```

Relations:

- `Consultation N--1 Patient`
- `Consultation N--1 DoctorProfile`
- `Consultation 1--N ConsultationVitals`
- `Consultation 1--N Prescription`

Recommended table:

```txt
consultations
- id uuid pk
- patient_id uuid fk patients.id
- doctor_id uuid fk doctor_profiles.id
- reason text null
- scheduled_at timestamp not null
- status enum(scheduled, in_progress, completed, cancelled) not null
- notes text null
- diagnosis text null
- started_at timestamp null
- ended_at timestamp null
- recording_url text null
- recording_duration_sec integer null
- created_at timestamp
- updated_at timestamp
```

### 4.5 ConsultationVitals

Physical measurements taken during a consultation.

These fields are optional because not every consultation needs every measurement.

```ts
ConsultationVitals {
  id: string
  consultationId: string
  patientId: string
  heartRate?: number          // Frequence cardiaque, bpm
  bloodPressure?: string      // Pression arterielle, mmHg, example: "120/80"
  temperature?: number        // Celsius
  heightCm?: number           // Taille
  weightKg?: number           // Poids
  maxWeightKg?: number        // Poids maximal
  lastPeriodDate?: Date       // DDR
  gad?: string                // GAD, keep flexible until medical meaning is fixed
  oxygenSaturation?: number   // SpO2 %
  respiratoryRate?: number    // Frequence respiratoire
  measuredAt: Date
  createdAt: Date
}
```

Relations:

- `ConsultationVitals N--1 Consultation`
- `ConsultationVitals N--1 Patient`

Recommended table:

```txt
consultation_vitals
- id uuid pk
- consultation_id uuid fk consultations.id
- patient_id uuid fk patients.id
- heart_rate integer null
- blood_pressure varchar null
- temperature decimal null
- height_cm decimal null
- weight_kg decimal null
- max_weight_kg decimal null
- last_period_date date null
- gad varchar null
- oxygen_saturation decimal null
- respiratory_rate integer null
- measured_at timestamp not null
- created_at timestamp
```

### 4.6 Prescription

Prescription header.

```ts
Prescription {
  id: string
  prescriptionNumber: string
  consultationId?: string
  patientId: string
  doctorId: string
  diagnosis?: string
  status: "draft" | "pending_review" | "validated" | "rejected" | "cancelled"
  risk?: "high" | "medium" | "low"
  notes?: string
  validatedAt?: Date
  printedAt?: Date
  createdAt: Date
  updatedAt: Date
}
```

Relations:

- `Prescription N--1 Patient`
- `Prescription N--1 DoctorProfile`
- `Prescription N--1 Consultation`
- `Prescription 1--N PrescriptionMedication`
- `Prescription 1--1 PrescriptionPrintSnapshot`
- `Prescription 1--N SafetyAlert`
- `Prescription 1--N AuditEntry`
- `Prescription 1--N PharmacyDispatch`

Recommended table:

```txt
prescriptions
- id uuid pk
- prescription_number varchar unique not null
- consultation_id uuid fk consultations.id null
- patient_id uuid fk patients.id
- doctor_id uuid fk doctor_profiles.id
- diagnosis text null
- status enum(draft, pending_review, validated, rejected, cancelled) not null
- risk enum(high, medium, low) null
- notes text null
- validated_at timestamp null
- printed_at timestamp null
- created_at timestamp
- updated_at timestamp
```

### 4.7 PrescriptionMedication

Medication lines inside a prescription.

```ts
PrescriptionMedication {
  id: string
  prescriptionId: string
  medicineId?: string
  medicineName: string
  dosage: string
  route?: string
  frequency: string
  duration?: string
  indication?: string
  instructions?: string
  confidence?: number
  status?: "ai_proposed" | "edited" | "validated" | "rejected"
  sortOrder: number
}
```

Recommended table:

```txt
prescription_medications
- id uuid pk
- prescription_id uuid fk prescriptions.id
- medicine_id uuid fk medicines.id null
- medicine_name varchar not null
- dosage varchar not null
- route varchar null
- frequency varchar not null
- duration varchar null
- indication text null
- instructions text null
- confidence integer null
- status enum(ai_proposed, edited, validated, rejected) null
- sort_order integer default 0
```

### 4.8 PrescriptionPrintSnapshot

Snapshot used for printing ordonnance documents.

This is important because the doctor profile or patient identity can change later. The printed ordonnance must keep the exact data used at print time.

```ts
PrescriptionPrintSnapshot {
  id: string
  prescriptionId: string
  doctorFirstName: string
  doctorLastName: string
  doctorSpecialty?: string
  doctorCnamCode?: string
  doctorFiscalNumber?: string
  doctorPhone?: string
  patientFirstName: string
  patientLastName: string
  patientBirthDate?: Date
  patientGender?: string
  footerNumber?: string
  printedAt: Date
}
```

Recommended table:

```txt
prescription_print_snapshots
- id uuid pk
- prescription_id uuid fk prescriptions.id unique
- doctor_first_name varchar not null
- doctor_last_name varchar not null
- doctor_specialty varchar null
- doctor_cnam_code varchar null
- doctor_fiscal_number varchar null
- doctor_phone varchar null
- patient_first_name varchar not null
- patient_last_name varchar not null
- patient_birth_date date null
- patient_gender varchar null
- footer_number varchar null
- printed_at timestamp not null
```

### 4.9 Medicine

Tunisian medicine database.

```ts
Medicine {
  id: string
  dci: string
  brands: string[]
  atcCode: string
  drugClass: string
  forms: string[]
  laboratories: string[]
  reimbursement: "100%" | "85%" | "40%" | "0%"
  indication: string
  contraindications: string[]
  posologyAdult: string
  pregnancy: "Autorise" | "Precaution" | "Contre-indique"
  renalAdjust: boolean
  hepaticAdjust: boolean
  priceTndApprox?: number
  createdAt: Date
  updatedAt: Date
}
```

Recommended table:

```txt
medicines
- id uuid pk
- dci varchar not null
- brands jsonb not null
- atc_code varchar not null
- drug_class varchar not null
- forms jsonb not null
- laboratories jsonb not null
- reimbursement enum(100%, 85%, 40%, 0%) not null
- indication text not null
- contraindications jsonb not null
- posology_adult text not null
- pregnancy enum(Autorise, Precaution, Contre-indique) not null
- renal_adjust boolean default false
- hepatic_adjust boolean default false
- price_tnd_approx decimal null
- created_at timestamp
- updated_at timestamp
```

### 4.10 MedicineContribution

Doctor contribution workflow for medicine corrections, notes, or new medicines.

```ts
MedicineContribution {
  id: string
  kind: "new_medicine" | "correction" | "note"
  status: "pending" | "validated" | "refused"
  authorDoctorId: string
  authorEmail: string
  authorName: string
  targetMedicineId?: string
  targetMedicineDci?: string
  field?: string
  oldValue?: string
  newValue?: string
  note?: string
  newMedicine?: Partial<Medicine> & { dci: string }
  rationale?: string
  reviewerAdminId?: string
  reviewerEmail?: string
  reviewerName?: string
  reviewedAt?: Date
  refusalReason?: string
  createdAt: Date
  updatedAt: Date
}
```

Relations:

- `MedicineContribution N--1 DoctorProfile`
- `MedicineContribution N--1 Medicine` optional
- `MedicineContribution N--1 User` optional reviewer admin

Recommended table:

```txt
medicine_contributions
- id uuid pk
- kind enum(new_medicine, correction, note)
- status enum(pending, validated, refused)
- author_doctor_id uuid fk doctor_profiles.id
- author_email varchar not null
- author_name varchar not null
- target_medicine_id uuid fk medicines.id null
- target_medicine_dci varchar null
- field varchar null
- old_value text null
- new_value text null
- note text null
- new_medicine jsonb null
- rationale text null
- reviewer_admin_id uuid fk users.id null
- reviewer_email varchar null
- reviewer_name varchar null
- reviewed_at timestamp null
- refusal_reason text null
- created_at timestamp
- updated_at timestamp
```

### 4.11 PharmacyDispatch

Admin-managed tracking of transmitted prescriptions.

Doctors can create/send a dispatch from the prescription screen, but the list and status management are admin-only.

Current supported statuses:

- `sent`
- `received`
- `cancelled`

Do not use these statuses yet:

- `preparing`
- `ready`
- `delivered`

```ts
PharmacyDispatch {
  id: string
  prescriptionId: string
  patientId: string
  patientName: string
  target: "pharmacist" | "patient"
  recipient: string
  channel: "email" | "sms" | "portal" | "fax"
  status: "sent" | "received" | "cancelled"
  note?: string
  sentAt: Date
  updatedAt: Date
}
```

Recommended table:

```txt
pharmacy_dispatches
- id uuid pk
- prescription_id uuid fk prescriptions.id
- patient_id uuid fk patients.id
- patient_name varchar not null
- target enum(pharmacist, patient)
- recipient varchar not null
- channel enum(email, sms, portal, fax)
- status enum(sent, received, cancelled)
- note text null
- sent_at timestamp
- updated_at timestamp
```

### 4.12 SafetyAlert

Clinical alerts related to a prescription or medication interaction.

```ts
SafetyAlert {
  id: string
  prescriptionId?: string
  severity: "critical" | "major" | "moderate" | "minor" | "info"
  title: string
  drugsInvolved: string[]
  explanation: string
  recommendedAction: string
  alternative?: string
  evidence: string
  evidenceUrl?: string
  createdAt: Date
}
```

Recommended table:

```txt
safety_alerts
- id uuid pk
- prescription_id uuid fk prescriptions.id null
- severity enum(critical, major, moderate, minor, info)
- title varchar not null
- drugs_involved jsonb not null
- explanation text not null
- recommended_action text not null
- alternative text null
- evidence text not null
- evidence_url text null
- created_at timestamp
```

### 4.13 InteractionResult

Drug-drug interaction reference or computed result.

```ts
InteractionResult {
  id: string
  drugA: string
  drugB: string
  severity: "critical" | "major" | "moderate" | "minor" | "info"
  mechanism: string
  consequence: string
  action: string
  evidence: string
}
```

Recommended table:

```txt
interaction_results
- id uuid pk
- drug_a varchar not null
- drug_b varchar not null
- severity enum(critical, major, moderate, minor, info)
- mechanism text not null
- consequence text not null
- action text not null
- evidence text not null
```

### 4.14 AuditEntry

Audit trail, visible to admin only.

```ts
AuditEntry {
  id: string
  prescriptionId: string
  patientName: string
  doctorName: string
  modelVersion?: string
  recommendation?: string
  doctorModification?: string
  alertsOverridden: number
  overrideReason?: string
  finalStatus: string
  timestamp: Date
}
```

Recommended table:

```txt
audit_entries
- id uuid pk
- prescription_id uuid fk prescriptions.id
- patient_name varchar not null
- doctor_name varchar not null
- model_version varchar null
- recommendation text null
- doctor_modification text null
- alerts_overridden integer default 0
- override_reason text null
- final_status varchar not null
- timestamp timestamp not null
```

## 5. CMS Entities

### 5.1 Post

```ts
Post {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  category: string
  tags: string[]
  author: string
  imageUrl?: string
  coverColor?: string
  status: "published" | "draft" | "archived"
  featured: boolean
  publishedAt?: Date
  scheduledDate?: Date
  views: number
  readTime: number
  commentsCount: number
  metaTitle?: string
  metaDescription?: string
  createdAt: Date
  updatedAt: Date
}
```

### 5.2 Testimonial

```ts
Testimonial {
  id: string
  name: string
  role: string
  text: string
  rating: number
  active: boolean
  createdAt: Date
  updatedAt: Date
}
```

### 5.3 Partner

```ts
Partner {
  id: string
  name: string
  logoUrl: string
  websiteUrl?: string
  description?: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}
```

### 5.4 Specialty

```ts
Specialty {
  id: string
  name: string
  description: string
  iconName?: string
  color?: string
  bg?: string
  query?: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}
```

### 5.5 WhyFeature

```ts
WhyFeature {
  id: string
  iconName: string
  gradient: string
  title: string
  text: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}
```

## 6. Main Relationships

```txt
User 1--1 DoctorProfile

DoctorProfile 1--N Consultation
DoctorProfile 1--N Prescription
DoctorProfile 1--N MedicineContribution

Patient 1--N Consultation
Patient 1--N ConsultationVitals
Patient 1--N Prescription
Patient 1--N PharmacyDispatch

Consultation 1--N ConsultationVitals
Consultation 1--N Prescription

Prescription 1--N PrescriptionMedication
Prescription 1--1 PrescriptionPrintSnapshot
Prescription 1--N SafetyAlert
Prescription 1--N AuditEntry
Prescription 1--N PharmacyDispatch

Medicine 1--N MedicineContribution
```

## 7. REST API Endpoints

Use `/api` as global prefix.

### 7.1 Auth

```txt
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/refresh
```

Login body:

```ts
{
  email: string
  password: string
}
```

Login response:

```ts
{
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    role: "admin" | "doctor"
    doctorProfile?: DoctorProfile
  }
}
```

### 7.2 Doctors

Admin endpoints:

```txt
GET    /api/doctors
GET    /api/doctors/:id
POST   /api/doctors
PATCH  /api/doctors/:id
DELETE /api/doctors/:id
PATCH  /api/doctors/:id/status
```

Doctor self endpoint:

```txt
GET    /api/doctors/me/profile
PATCH  /api/doctors/me/profile
```

Create doctor body:

```ts
{
  firstName: string
  lastName: string
  email: string
  phone: string
  fiscalNumber: string
  specialty?: string
  cnamCode?: string
  gsm?: string
  password: string
}
```

### 7.3 Patients

```txt
GET    /api/patients
GET    /api/patients/:id
POST   /api/patients
PATCH  /api/patients/:id
DELETE /api/patients/:id
GET    /api/patients/:id/consultations
GET    /api/patients/:id/prescriptions
GET    /api/patients/:id/vitals
```

Create patient body:

```ts
{
  firstName: string
  lastName: string
  birthDate: string
  gender: "male" | "female" | "other"
  phone1: string
  phone2?: string
  phone3?: string
  profession?: string
  internalCode?: string
  address?: string
}
```

Query params:

```txt
GET /api/patients?search=&page=&limit=&gender=
```

### 7.4 Consultations

```txt
GET    /api/consultations
GET    /api/consultations/:id
POST   /api/consultations
PATCH  /api/consultations/:id
DELETE /api/consultations/:id
PATCH  /api/consultations/:id/start
PATCH  /api/consultations/:id/complete
PATCH  /api/consultations/:id/cancel
GET    /api/consultations/:id/vitals
POST   /api/consultations/:id/vitals
```

Create consultation body:

```ts
{
  patientId: string
  doctorId?: string
  reason?: string
  scheduledAt: string
  notes?: string
}
```

Create vitals body:

```ts
{
  heartRate?: number
  bloodPressure?: string
  temperature?: number
  heightCm?: number
  weightKg?: number
  maxWeightKg?: number
  lastPeriodDate?: string
  gad?: string
  oxygenSaturation?: number
  respiratoryRate?: number
  measuredAt?: string
}
```

### 7.5 Prescriptions

```txt
GET    /api/prescriptions
GET    /api/prescriptions/:id
POST   /api/prescriptions
PATCH  /api/prescriptions/:id
DELETE /api/prescriptions/:id
POST   /api/prescriptions/:id/medications
PATCH  /api/prescriptions/:id/medications/:medicationId
DELETE /api/prescriptions/:id/medications/:medicationId
POST   /api/prescriptions/:id/validate
POST   /api/prescriptions/:id/reject
POST   /api/prescriptions/:id/print-snapshot
GET    /api/prescriptions/:id/ordonnance
POST   /api/prescriptions/:id/send-to-pharmacy
POST   /api/prescriptions/:id/send-to-patient
```

Create prescription body:

```ts
{
  patientId: string
  consultationId?: string
  diagnosis?: string
  notes?: string
  medications: Array<{
    medicineId?: string
    medicineName: string
    dosage: string
    route?: string
    frequency: string
    duration?: string
    indication?: string
    instructions?: string
  }>
}
```

Send to pharmacy body:

```ts
{
  recipient: string
  channel: "email" | "sms" | "portal" | "fax"
  note?: string
}
```

Important access rule:

- Doctors may call `POST /api/prescriptions/:id/send-to-pharmacy`.
- Doctors may not call admin pharmacy list/update/delete endpoints.

### 7.6 Pharmacy Dispatches

Admin-only management.

```txt
GET    /api/pharmacy/dispatches
GET    /api/pharmacy/dispatches/:id
POST   /api/pharmacy/dispatches
PATCH  /api/pharmacy/dispatches/:id
DELETE /api/pharmacy/dispatches/:id
PATCH  /api/pharmacy/dispatches/:id/status
```

Allowed statuses:

```ts
"sent" | "received" | "cancelled"
```

Query params:

```txt
GET /api/pharmacy/dispatches?search=&status=&target=&page=&limit=
```

### 7.7 Medicines

```txt
GET    /api/medicines
GET    /api/medicines/:id
POST   /api/medicines
PATCH  /api/medicines/:id
DELETE /api/medicines/:id
GET    /api/medicines/search?q=
GET    /api/medicines/classes
```

Query params:

```txt
GET /api/medicines?search=&drugClass=&pregnancy=&renalAdjust=&hepaticAdjust=&page=&limit=
```

### 7.8 Medicine Contributions

Doctor and admin.

```txt
GET    /api/medicine-contributions
GET    /api/medicine-contributions/:id
POST   /api/medicine-contributions
DELETE /api/medicine-contributions/:id
POST   /api/medicine-contributions/:id/validate
POST   /api/medicine-contributions/:id/refuse
```

Create contribution body:

```ts
{
  kind: "new_medicine" | "correction" | "note"
  targetMedicineId?: string
  field?: string
  oldValue?: string
  newValue?: string
  note?: string
  newMedicine?: Partial<Medicine> & { dci: string }
  rationale?: string
}
```

Refuse body:

```ts
{
  refusalReason: string
}
```

### 7.9 Safety / Interactions

```txt
POST   /api/interactions/check
GET    /api/interactions
POST   /api/prescriptions/:id/safety-check
GET    /api/prescriptions/:id/safety-alerts
```

Check interactions body:

```ts
{
  drugs: string[]
  patientId?: string
}
```

### 7.10 Audit

Admin-only.

```txt
GET    /api/audit
GET    /api/audit/:id
GET    /api/audit/prescriptions/:prescriptionId
```

Query params:

```txt
GET /api/audit?doctorId=&patientId=&from=&to=&status=&page=&limit=
```

### 7.11 CMS

Admin endpoints:

```txt
GET    /api/cms/posts
GET    /api/cms/posts/:id
POST   /api/cms/posts
PATCH  /api/cms/posts/:id
DELETE /api/cms/posts/:id

GET    /api/cms/testimonials
POST   /api/cms/testimonials
PATCH  /api/cms/testimonials/:id
DELETE /api/cms/testimonials/:id

GET    /api/cms/partners
POST   /api/cms/partners
PATCH  /api/cms/partners/:id
DELETE /api/cms/partners/:id

GET    /api/cms/specialties
POST   /api/cms/specialties
PATCH  /api/cms/specialties/:id
DELETE /api/cms/specialties/:id

GET    /api/cms/why-features
POST   /api/cms/why-features
PATCH  /api/cms/why-features/:id
DELETE /api/cms/why-features/:id
```

Public endpoints:

```txt
GET    /api/public/home
GET    /api/public/posts
GET    /api/public/posts/:slug
GET    /api/public/testimonials
GET    /api/public/partners
GET    /api/public/specialties
```

## 8. NestJS Implementation Notes

### 8.1 Guards and Decorators

Recommended:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
```

Create:

```txt
common/decorators/roles.decorator.ts
common/guards/jwt-auth.guard.ts
common/guards/roles.guard.ts
```

### 8.2 Validation

Use:

```txt
class-validator
class-transformer
ValidationPipe
```

Enable globally:

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

### 8.3 Pagination Response Format

Use one consistent format:

```ts
{
  data: T[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}
```

### 8.4 Error Format

Recommended:

```ts
{
  statusCode: number
  message: string | string[]
  error: string
  timestamp: string
  path: string
}
```

### 8.5 Encoding

Use UTF-8 everywhere:

- Database encoding: UTF-8.
- API responses: UTF-8 JSON.
- Seed files saved as UTF-8.

Do not seed mojibake text like:

```txt
MÃ©decin
PrÃ©caution
EnvoyÃ©e
```

Use:

```txt
Médecin
Précaution
Envoyée
```

## 9. Recommended First Backend Milestones

1. Create auth, users, doctors.
2. Create patients CRUD.
3. Create consultations and consultation vitals.
4. Create prescriptions and prescription medications.
5. Create ordonnance print payload endpoint.
6. Create send-to-pharmacy endpoint for doctors.
7. Create admin-only pharmacy dispatch management.
8. Create medicines database.
9. Create medicine contribution workflow.
10. Create CMS.
11. Create audit trail.

## 10. Minimum API Needed To Connect Current Frontend

If you want to connect the frontend quickly, start with these endpoints:

```txt
POST /api/auth/login
GET  /api/auth/me

GET  /api/patients
POST /api/patients
PATCH /api/patients/:id
DELETE /api/patients/:id

GET  /api/consultations
POST /api/consultations
PATCH /api/consultations/:id
POST /api/consultations/:id/vitals

GET  /api/prescriptions
POST /api/prescriptions
GET  /api/prescriptions/:id/ordonnance
POST /api/prescriptions/:id/send-to-pharmacy

GET  /api/medicines
GET  /api/medicine-contributions
POST /api/medicine-contributions

GET  /api/pharmacy/dispatches
PATCH /api/pharmacy/dispatches/:id/status

GET  /api/public/home
```

