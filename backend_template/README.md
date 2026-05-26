# MedCity Connect Backend

NestJS backend scaffold for the `medcity-app` frontend.

## Stack

- NestJS
- TypeORM
- SQLite by default, with optional PostgreSQL
- JWT auth with admin and doctor roles
- `class-validator` request validation

## Quick Start

```bash
cp .env.example .env
npm install
npm run seed
npm run start:dev
```

The API prefix is `/api` by default.
By default, data is stored in `data/medcity.sqlite`.

## SQLite Database File

The default `.env` settings use:

```env
DATABASE_TYPE=sqlite
SQLITE_DATABASE=./data/medcity.sqlite
DATABASE_SYNC=true
```

When you run `npm run seed` or start the API, TypeORM creates the SQLite database file and tables automatically. All records created through the API are saved in `data/medcity.sqlite`.

## Implemented Modules

- `auth`: login, refresh, me, logout placeholder
- `doctors`: admin doctor management and doctor self-profile
- `patients`: administrative patient records
- `consultations`: appointments, notes, lifecycle actions, consultation vitals
- `prescriptions`: prescription headers, medication lines, validation, print snapshots, ordonnance payloads, safety alerts, dispatch creation
- `pharmacy`: admin-only dispatch list/status management
- `medicines`: Tunisian medicine database CRUD/search/classes
- `medicine-contributions`: doctor contributions and admin validation/refusal
- `interactions`: interaction reference list and check endpoint
- `audit`: admin-only prescription audit trail
- `cms`: admin CMS plus public website endpoints

## Important Access Rules

- Admin endpoints are protected with `@Roles(UserRole.Admin)`.
- Doctors can create dispatches only through prescription endpoints:
  - `POST /api/prescriptions/:id/send-to-pharmacy`
  - `POST /api/prescriptions/:id/send-to-patient`
- Doctors cannot access `/api/pharmacy/dispatches`.
- Patient identity/contact data lives on `Patient`.
- Physical measurements live on `ConsultationVitals`.

## Minimum Frontend Connection Endpoints

The project includes the minimum endpoints listed in the specification, including:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET/POST/PATCH/DELETE /api/patients`
- `GET/POST/PATCH /api/consultations`
- `POST /api/consultations/:id/vitals`
- `GET/POST /api/prescriptions`
- `GET /api/prescriptions/:id/ordonnance`
- `POST /api/prescriptions/:id/send-to-pharmacy`
- `GET /api/medicines`
- `GET/POST /api/medicine-contributions`
- `GET /api/pharmacy/dispatches`
- `PATCH /api/pharmacy/dispatches/:id/status`
- `GET /api/public/home`

## Notes

`DATABASE_SYNC=true` is convenient for local development. Use migrations instead for production.
