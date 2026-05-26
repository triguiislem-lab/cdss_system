# Backend / Frontend Synchronization Report

Date: 2026-05-20

Backend folder:

```txt
medcity-app/backend_template
```

Frontend folder:

```txt
medcity-app
```

## Summary

The NestJS backend is structurally aligned with the target MedCity Connect data model.

However, the frontend is not yet fully connected to this backend. Most medical workflows still use frontend mock data and Zustand persisted stores.

Current status:

```txt
Backend contract: mostly ready
Frontend runtime API integration: not ready yet
```

## Backend Build Status

Command tested:

```txt
npm run build
```

Result:

```txt
PASS
```

The backend compiles successfully.

## Backend Modules Present

The backend includes these modules:

- `auth`
- `users`
- `doctors`
- `patients`
- `consultations`
- `prescriptions`
- `pharmacy`
- `medicines`
- `medicine-contributions`
- `interactions`
- `audit`
- `cms`

This matches the expected backend structure from `docs/backend-nestjs-spec.md`.

## API Prefix

Backend global prefix:

```txt
/api
```

Configured in:

```txt
backend_template/src/main.ts
```

This matches the frontend public article search convention, but the medical frontend modules do not yet call these backend APIs.

## Frontend Current Data Source

The frontend currently uses:

- `src/lib/mock-data.ts`
- `src/lib/stores/patient-store.ts`
- `src/lib/stores/consultation-store.ts`
- `src/lib/stores/pharmacy-store.ts`
- `src/lib/stores/medicine-contributions-store.ts`
- `src/contexts/AuthContext.tsx`
- `src/contexts/CmsContext.tsx`

Only PubMed/search-related pages use `fetch` through:

```txt
src/lib/api-client.ts
```

Medical workflows are still local/mock based.

## Main Synchronization Gap

The backend is ready to receive data, but the frontend is not sending data to it yet.

Examples:

- Creating a patient updates Zustand/local storage, not `POST /api/patients`.
- Creating consultation updates Zustand/local storage, not `POST /api/consultations`.
- Adding vitals updates Zustand/local storage, not `POST /api/consultations/:id/vitals`.
- Sending prescription to pharmacy updates local pharmacy store, not `POST /api/prescriptions/:id/send-to-pharmacy`.
- Doctor/admin login uses frontend mock users, not `POST /api/auth/login`.

## Contract Alignment Matrix

| Domain | Backend Status | Frontend Model Status | Runtime Sync |
|---|---|---|---|
| Auth | Ready | Mock auth still used | Not connected |
| Doctors | Ready | Admin doctor UI mostly aligned | Not connected |
| Patients | Ready | Fields aligned with backend | Not connected |
| Consultations | Ready | Fields mostly aligned | Not connected |
| Consultation vitals | Ready | UI added in consultation detail | Not connected |
| Prescriptions | Ready | UI uses demo prescriptions | Not connected |
| Pharmacy dispatches | Ready/admin-only | UI admin-only + doctor send action | Not connected |
| Medicines | Ready | UI uses static Tunisian medicine list | Not connected |
| Contributions | Ready | UI uses local contribution store | Not connected |
| Interactions | Ready | UI uses static/mock interaction data | Not connected |
| Audit | Ready/admin-only | UI uses mock audit data | Not connected |
| CMS | Ready | UI uses `CmsContext` local state | Not connected |

## Endpoint Alignment

### Auth

Backend:

```txt
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/refresh
POST /api/auth/logout
```

Frontend currently:

```txt
src/contexts/AuthContext.tsx
```

Issue:

- Frontend still uses hardcoded users.
- Backend seed default account is `admin@medcity.test / Admin123!`, while frontend uses `admin@medcity.tn / Admin123`.

Recommended fix:

- Update backend seed to include frontend demo accounts, or update frontend login credentials.
- Replace mock login with API login.
- Store JWT access token and refresh token.

### Patients

Backend:

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

Frontend current:

```txt
src/lib/stores/patient-store.ts
src/features/cdss/components/PatientFormDialog.tsx
src/features/cdss/screens/PatientPanelScreen.tsx
src/features/cdss/screens/PatientsScreen.tsx
```

Alignment:

- Fields are now mostly aligned:
  - `firstName`
  - `lastName`
  - `birthDate`
  - `gender`
  - `phone1`
  - `phone2`
  - `phone3`
  - `profession`
  - `internalCode`
  - `address`

Issue:

- Frontend still keeps legacy CDSS fields on `Patient` for compatibility.
- Backend patient is administrative only, which is correct.

Recommended fix:

- Create `src/services/patients-api.ts`.
- Replace Zustand patient CRUD with React Query API calls.
- Keep a mapper for legacy display until all CDSS screens use backend models.

### Consultations

Backend:

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

Frontend current:

```txt
src/lib/stores/consultation-store.ts
src/features/cdss/components/ConsultationFormDialog.tsx
src/features/cdss/screens/ConsultationDetailScreen.tsx
```

Alignment:

- Consultation vitals model is aligned.
- UI records vitals only during consultation.

Issue:

- Still local store, not API.

Recommended fix:

- Create `src/services/consultations-api.ts`.
- Use backend endpoints for consultation creation, update, status lifecycle, and vitals.

### Prescriptions

Backend:

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
POST   /api/prescriptions/:id/safety-check
GET    /api/prescriptions/:id/safety-alerts
```

Frontend current:

```txt
src/lib/mock-data.ts
src/features/cdss/screens/NewPrescriptionScreen.tsx
src/features/cdss/screens/PrescriptionReviewScreen.tsx
src/features/cdss/screens/OrdonnanceScreen.tsx
```

Issue:

- Prescription creation/review/ordonnance still uses mock prescription list.

Recommended fix:

- Create `src/services/prescriptions-api.ts`.
- Replace mock prescription cases with backend queries.
- Ensure ordonnance page uses `GET /api/prescriptions/:id/ordonnance`.

### Pharmacy

Backend:

```txt
GET    /api/pharmacy/dispatches
GET    /api/pharmacy/dispatches/:id
POST   /api/pharmacy/dispatches
PATCH  /api/pharmacy/dispatches/:id
DELETE /api/pharmacy/dispatches/:id
PATCH  /api/pharmacy/dispatches/:id/status
```

Access:

```txt
Admin only
```

Doctor send endpoints:

```txt
POST /api/prescriptions/:id/send-to-pharmacy
POST /api/prescriptions/:id/send-to-patient
```

Frontend current:

```txt
src/lib/stores/pharmacy-store.ts
src/features/cdss/components/SendPrescriptionDialog.tsx
src/features/cdss/screens/PharmacyScreen.tsx
```

Alignment:

- Doctor no longer has `/doctor/pharmacy`.
- Admin has pharmacy management.
- Status enum aligned:
  - `sent`
  - `received`
  - `cancelled`

Issue:

- Dispatches still stored locally.

Recommended fix:

- Doctor send dialog should call prescription send endpoints.
- Admin pharmacy screen should call `/api/pharmacy/dispatches`.

### Medicines

Backend:

```txt
GET    /api/medicines
GET    /api/medicines/search?q=
GET    /api/medicines/classes
GET    /api/medicines/:id
POST   /api/medicines
PATCH  /api/medicines/:id
DELETE /api/medicines/:id
```

Frontend current:

```txt
src/lib/tunisia-medicines.ts
```

Issue:

- UI uses static local medicine list.

Recommended fix:

- Replace local list with `/api/medicines`.
- Keep local list only as seed data for backend.

### Medicine Contributions

Backend:

```txt
GET    /api/medicine-contributions
GET    /api/medicine-contributions/:id
POST   /api/medicine-contributions
DELETE /api/medicine-contributions/:id
POST   /api/medicine-contributions/:id/validate
POST   /api/medicine-contributions/:id/refuse
```

Frontend current:

```txt
src/lib/stores/medicine-contributions-store.ts
```

Issue:

- Contributions are local only.

Recommended fix:

- Create API service and connect doctor/admin screens to backend.

### CMS

Backend:

```txt
GET/POST/PATCH/DELETE /api/cms/posts
GET/POST/PATCH/DELETE /api/cms/testimonials
GET/POST/PATCH/DELETE /api/cms/partners
GET/POST/PATCH/DELETE /api/cms/specialties
GET/POST/PATCH/DELETE /api/cms/why-features

GET /api/public/home
GET /api/public/posts
GET /api/public/posts/:slug
GET /api/public/testimonials
GET /api/public/partners
GET /api/public/specialties
```

Frontend current:

```txt
src/contexts/CmsContext.tsx
```

Issue:

- CMS is local context only.

Recommended fix:

- Replace CMS context operations with backend API calls.

## Important Mismatches To Fix

### 1. Auth Credentials Mismatch

Frontend uses:

```txt
admin@medcity.tn / Admin123
dr.ahmed@medcity.tn / Medcity123
```

Backend seed default uses:

```txt
admin@medcity.test / Admin123!
```

Fix options:

- Update `.env` seed values and seed doctor accounts.
- Or update frontend test credentials.

Recommended:

- Seed backend with the same admin and doctor accounts used by the frontend.

### 2. Frontend Has No Medical API Client

Current API client only handles PubMed/search:

```txt
src/lib/api-client.ts
```

Needed:

```txt
src/services/http-client.ts
src/services/auth-api.ts
src/services/patients-api.ts
src/services/consultations-api.ts
src/services/prescriptions-api.ts
src/services/pharmacy-api.ts
src/services/medicines-api.ts
src/services/contributions-api.ts
src/services/cms-api.ts
```

### 3. Frontend State Is Still Mock/Zustand

The following should be replaced or backed by API:

```txt
src/lib/stores/patient-store.ts
src/lib/stores/consultation-store.ts
src/lib/stores/pharmacy-store.ts
src/lib/stores/medicine-contributions-store.ts
src/contexts/AuthContext.tsx
src/contexts/CmsContext.tsx
```

### 4. Pagination Shape

Backend list endpoints return:

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

Frontend screens currently expect plain arrays in many places.

Fix:

- Update list screens to read `response.data`.
- Use `response.meta` for pagination later.

### 5. Backend Uses UUID IDs

Frontend mock IDs use values like:

```txt
P-1042
RX-2087
C-3001
```

Backend uses UUID primary keys.

Fix:

- Use backend `id` for relations.
- Add display fields like `prescriptionNumber` if human-readable IDs are needed.

## Recommended Integration Order

1. Connect auth first.
2. Connect patients CRUD.
3. Connect consultations CRUD.
4. Connect consultation vitals.
5. Connect prescriptions and ordonnance.
6. Connect send-to-pharmacy/send-to-patient.
7. Connect admin pharmacy dispatches.
8. Connect medicines.
9. Connect medicine contributions.
10. Connect CMS.
11. Connect audit.

## Final Verdict

The backend is mostly synchronized at the schema/API design level.

The frontend is not yet synchronized at runtime because it still reads/writes local mock stores for the main medical workflows.

Next development step:

```txt
Create frontend API services and replace local stores screen by screen.
```

