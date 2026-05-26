# MedCity Connect - Workflow UI/UX Test Cases

This document lists the workflow tests to validate the current frontend before connecting the NestJS backend.

Goal:

- Verify that admin and doctor workflows are easy to use.
- Verify that doctor/admin permissions are clear.
- Verify that the UI follows the current MedCity Connect design.
- Verify that workflows are synchronized between patient, consultation, prescription, pharmacy, medicines, contributions, and CMS.

## Test Accounts

Use the current demo accounts from the frontend:

```txt
Admin:
admin@medcity.tn / Admin123

Doctor:
dr.ahmed@medcity.tn / Medcity123
dr.rania@medcity.tn / Medcity123
```

## Global UI/UX Checklist

Apply this checklist to every page:

- Sidebar stays fixed and logout remains reachable.
- Page title is clear.
- Primary action button is visible without confusion.
- Search fields work for long lists.
- Modals open and close correctly.
- Empty states are understandable.
- Form required fields are visible.
- Validation errors or disabled states are clear.
- Buttons do exactly what their label says.
- Admin-only features are not visible in doctor workspace.
- The page does not show mojibake/encoding errors.
- Print/PDF pages hide web UI elements.

## 1. Authentication Workflow

### TC-AUTH-01 - Admin Login

Steps:

1. Open `/login`.
2. Enter `admin@medcity.tn`.
3. Enter `Admin123`.
4. Submit.

Expected:

- User is redirected to `/admin`.
- Admin sidebar is visible.
- Admin sees `Dashboard`, `Patients`, `Consultations`, `Pharmacy`, `Reports & Audit`, `Médecins`, `Contenu CMS`.
- Doctor-only contact page is not shown.

UX result expected:

- Login form is understandable.
- No encoding issues in footer or labels.

### TC-AUTH-02 - Doctor Login

Steps:

1. Open `/login`.
2. Enter `dr.ahmed@medcity.tn`.
3. Enter `Medcity123`.
4. Submit.

Expected:

- User is redirected to `/doctor`.
- Doctor sidebar is visible.
- Doctor sees `Patients`, `Consultations`, `New Prescription`, `Medicines`, `Contributions`, `Contact Admin`.
- Doctor does not see `Reports & Audit`.
- Doctor does not see `Pharmacy` management.

UX result expected:

- Doctor role feels simpler than admin role.
- No admin-only confusion.

### TC-AUTH-03 - Invalid Login

Steps:

1. Open `/login`.
2. Enter wrong email or password.
3. Submit.

Expected:

- User stays on login.
- Error message is shown.
- No dashboard access.

## 2. Admin Dashboard Workflow

### TC-ADMIN-01 - Admin Dashboard Overview

Route:

```txt
/admin
```

Steps:

1. Login as admin.
2. Open dashboard.
3. Review KPI cards and activity sections.

Expected:

- Dashboard content is readable.
- Cards use the same MedCity design.
- Buttons/links navigate to correct admin pages.

UX checks:

- Admin can understand platform status in less than 10 seconds.
- Main next actions are visible.

## 3. Admin Doctors Workflow

### TC-ADMIN-DOCTORS-01 - Add Doctor

Route:

```txt
/admin/doctors
```

Steps:

1. Click `Nouveau médecin`.
2. Fill doctor fields:
   - Prénom
   - Nom
   - Email
   - Role = doctor
   - N° du portable
   - Matricule fiscale
   - Spécialité
   - Établissement
   - Ville
3. Save.

Expected:

- Modal closes.
- New doctor appears in list.
- Search can find doctor by name, email, specialty, city, or fiscal number.

UX checks:

- Form should not ask for unrelated information first.
- Role is clear and fixed as `doctor`.

### TC-ADMIN-DOCTORS-02 - Edit Doctor

Steps:

1. Click `Modifier` on an existing doctor.
2. Change phone or matricule fiscale.
3. Save.

Expected:

- Updated values remain visible.
- No duplicate doctor is created.

### TC-ADMIN-DOCTORS-03 - Delete Doctor

Steps:

1. Click `Supprimer`.
2. Confirm deletion.

Expected:

- Doctor is removed from list.
- Confirmation modal prevents accidental deletion.

UX checks:

- Delete action is visually dangerous.
- Cancel is available.

## 4. Patient Workflow

### TC-PATIENT-01 - Add Patient With Administrative Fields

Route:

```txt
/doctor/patients
```

or

```txt
/admin/patients
```

Steps:

1. Click `New patient` or `Ajouter Patient`.
2. Fill required fields:
   - Prénom
   - Nom
   - N° du portable
   - Date de naissance
   - Genre
3. Optionally fill:
   - N° portable 2
   - N° portable 3
   - Profession
   - Code interne
   - Addresse
4. Save.

Expected:

- Patient is created.
- Patient appears in list.
- List displays administrative information, not fixed physical measurements.

UX checks:

- Form matches the backend model.
- Required fields are obvious.
- No physical measurements are requested in patient creation.

### TC-PATIENT-02 - Search Patient

Steps:

1. Use patient search.
2. Search by first name.
3. Search by last name.
4. Search by phone.
5. Search by internal code.

Expected:

- Patient is found in all relevant cases.
- Search works better than a long select list.

### TC-PATIENT-03 - Edit Patient

Steps:

1. Open patient list.
2. Click edit.
3. Change phone or profession.
4. Save.

Expected:

- Patient information updates.
- Existing prescriptions/consultations are still linked to same patient ID.

### TC-PATIENT-04 - Delete Patient

Steps:

1. Click delete.
2. Confirm.

Expected:

- Patient is removed.
- Confirmation modal prevents accidental deletion.

Important future backend rule:

- Backend should prevent deletion if patient has prescriptions/consultations unless using soft delete.

## 5. Consultation Workflow

### TC-CONSULT-01 - Create Consultation

Route:

```txt
/doctor/consultations
```

Steps:

1. Click create consultation.
2. Search patient by name or ID.
3. Select patient.
4. Enter motif.
5. Select date/time.
6. Save.

Expected:

- Consultation appears in list.
- Patient name and ID are correct.
- No default patient is silently selected.

UX checks:

- Patient search is practical for long lists.
- Doctor understands which patient is selected.

### TC-CONSULT-02 - Consultation Detail

Route:

```txt
/doctor/consultations/:consultationId
```

Steps:

1. Open a consultation.
2. Review patient card.
3. Add diagnosis.
4. Add clinical notes.
5. Save.

Expected:

- Diagnosis and notes are saved.
- Doctor can navigate back to consultations.
- Doctor can create prescription from this consultation.

### TC-CONSULT-03 - Add Physical Measurements When Needed

Route:

```txt
/doctor/consultations/:consultationId
```

Steps:

1. Open consultation detail.
2. In `Mesures physiques`, fill some measurements:
   - Fréquence cardiaque
   - Pression artérielle
   - Température
   - Taille
   - Poids
   - DDR
   - GAD
   - Saturation en oxygène
   - Fréquence respiratoire
3. Save measurements.

Expected:

- Measurements are saved under the consultation.
- Patient profile itself is not changed as if those measurements were static.
- Recent measurement entry appears in consultation detail.

UX checks:

- It is clear that measurements are optional.
- Doctor is not forced to fill all measurements.

## 6. Prescription Workflow

### TC-RX-01 - Create New Prescription From Patient

Route:

```txt
/doctor/patients
```

Steps:

1. Select a patient.
2. Click `New Rx`.
3. Confirm patient is preselected in prescription page.
4. Enter diagnosis.
5. Generate prescription proposal.

Expected:

- Patient is selected because the action came from patient context.
- Prescription generation is disabled or blocked if no patient is selected.
- Doctor can review medication rows.

UX checks:

- Doctor always knows which patient the prescription belongs to.

### TC-RX-02 - Create New Prescription Without Patient

Route:

```txt
/doctor/prescription/new
```

Steps:

1. Open new prescription directly.
2. Do not select patient.
3. Try to generate.

Expected:

- App asks doctor to select a patient.
- No default patient is used.
- Search patient field is visible.

### TC-RX-03 - Edit Medication Proposal

Steps:

1. Generate proposal.
2. Edit medication dose/frequency/duration.
3. Remove one medication.
4. Validate or save.

Expected:

- Edited row clearly changes status.
- Removed row disappears.
- Doctor remains responsible for final decision.

### TC-RX-04 - Prescription Review Queue

Route:

```txt
/doctor/prescriptions
```

or

```txt
/admin/cdss/prescription/review
```

Steps:

1. Open prescription review.
2. Filter high-risk if available.
3. Open prescription.

Expected:

- Patient identity is clear.
- Risk/status badges are understandable.
- Navigation opens correct patient/prescription context.

## 7. Ordonnance Print / Send Workflow

### TC-ORD-01 - Print Ordonnance

Route:

```txt
/doctor/prescription/:rxId/ordonnance
```

Steps:

1. Open ordonnance.
2. Click `Imprimer / PDF`.
3. Inspect print preview.

Expected:

- Only ordonnance content appears.
- Sidebar, header, buttons, route/footer URL, and web page UI are hidden.
- Doctor/patient/prescription content remains visible.

UX checks:

- Printed document looks professional.
- Layout matches the shared ordonnance structure.

### TC-ORD-02 - Send Prescription To Pharmacy

Steps:

1. Open ordonnance.
2. Click `Envoyer au pharmacien`.
3. Choose recipient/channel.
4. Send.

Expected:

- Dispatch is created with status `sent`.
- Doctor can send prescription but cannot manage full pharmacy list.

Synchronization check:

- Admin should see dispatch in `/admin/cdss/pharmacy`.

### TC-ORD-03 - Send Prescription To Patient

Steps:

1. Open ordonnance.
2. Click `Envoyer au patient`.
3. Enter patient contact.
4. Send.

Expected:

- Dispatch is created with target `patient`.
- Status starts as `sent`.

## 8. Admin Pharmacy Workflow

### TC-PHARMACY-01 - Admin Can Manage Dispatches

Route:

```txt
/admin/cdss/pharmacy
```

Steps:

1. Login as admin.
2. Open pharmacy page.
3. Search by patient, pharmacy, or RX.
4. Filter by:
   - all
   - pharmacist
   - patient
   - sent
   - received
   - cancelled
5. Edit a dispatch.
6. Update status.

Expected:

- Admin can manage dispatches.
- Available statuses are only `Envoyée`, `Reçue`, `Annulée`.
- Removed statuses are not visible:
   - `En préparation`
   - `Prête`
   - `Délivrée`

### TC-PHARMACY-02 - Doctor Cannot Manage Pharmacy

Route:

```txt
/doctor/pharmacy
```

Steps:

1. Login as doctor.
2. Try opening `/doctor/pharmacy`.

Expected:

- Page is not available from sidebar.
- Route should not expose pharmacy management.
- Doctor can only send prescription from ordonnance page.

## 9. Medicines Workflow

### TC-MED-01 - Search Medicine

Route:

```txt
/doctor/medicines
```

or

```txt
/admin/cdss/medicines
```

Steps:

1. Search by DCI.
2. Search by brand.
3. Open medicine detail.

Expected:

- Search is responsive.
- Medicine details are readable.
- Contraindications, pregnancy, renal/hepatic adjustment are visible.

UX checks:

- Long medicine list does not require scrolling through a select.

## 10. Medicine Contribution Workflow

### TC-CONTRIB-01 - Doctor Creates Contribution

Route:

```txt
/doctor/medicine-contributions
```

Steps:

1. Create contribution.
2. Choose one type:
   - new medicine
   - correction
   - note
3. Search medicine when contribution concerns an existing medication.
4. Add rationale/source.
5. Submit.

Expected:

- Contribution appears with status `pending`.
- Doctor can understand that admin must review it.

### TC-CONTRIB-02 - Admin Reviews Contribution

Route:

```txt
/admin/cdss/medicine-contributions
```

Steps:

1. Login as admin.
2. Open contributions.
3. Validate one contribution.
4. Refuse one contribution with reason.

Expected:

- Validated contribution updates status.
- Refused contribution stores refusal reason.
- Doctor notification should relate to contribution update.

Synchronization check:

- Doctor should see contribution status update.

## 11. Drug Interaction Workflow

### TC-INTERACTION-01 - Check Drug Interaction

Route:

```txt
/doctor/interactions
```

or

```txt
/admin/cdss/interactions
```

Steps:

1. Add two medicines.
2. Run check.
3. Read interaction result.

Expected:

- Severity is clear.
- Mechanism, consequence, and action are readable.
- Doctor understands clinical recommendation is decision support only.

## 12. CMS Workflow

### TC-CMS-01 - Admin Edits Public Content

Route:

```txt
/admin/cms
```

Steps:

1. Open CMS.
2. Edit a post/testimonial/specialty/partner/feature.
3. Toggle active status.
4. Save.

Expected:

- Changes are reflected in CMS state.
- UI uses MedCity admin design, not imported PubMed design.

UX checks:

- CMS sections are easy to distinguish.
- Buttons and modals match the rest of admin UI.

## 13. Reports & Audit Workflow

### TC-AUDIT-01 - Admin Audit Access

Route:

```txt
/admin/cdss/audit
```

Steps:

1. Login as admin.
2. Open Reports & Audit.
3. Search/filter audit entries.
4. Export if button exists.

Expected:

- Audit page is visible to admin.
- Audit is not visible to doctor.

### TC-AUDIT-02 - Doctor Audit Restriction

Steps:

1. Login as doctor.
2. Check sidebar.
3. Try to find audit/reports.

Expected:

- Doctor has no audit sidebar item.
- Doctor workflow stays clinical, not administrative.

## 14. Contact Admin Workflow

### TC-CONTACT-01 - Doctor Sends Message To Admin

Route:

```txt
/doctor/contact-admin
```

Steps:

1. Login as doctor.
2. Open Contact Admin.
3. Select issue type.
4. Write message.
5. Send.

Expected:

- Confirmation/toast appears.
- Notification model should later sync to admin backend.

UX checks:

- Doctor has a clear path to ask admin for help.

## 15. Notification Workflow

### TC-NOTIF-01 - Doctor Notification Dropdown

Steps:

1. Login as doctor.
2. Click notification bell.

Expected:

- Notifications relate to:
   - admin messages
   - contribution updates
   - prescription documents
- Notifications are not generic or unrelated.

UX checks:

- Notification text is clear and encoded correctly.

## 16. Permission Matrix

| Feature | Admin | Doctor |
|---|---:|---:|
| Dashboard | Yes | Yes |
| Manage doctors | Yes | No |
| CMS | Yes | No |
| Patients | Yes | Yes |
| Consultations | Yes | Yes |
| New prescription | Yes | Yes |
| Prescription review | Yes | Yes |
| Print ordonnance | Yes | Yes |
| Send prescription to pharmacy | Yes | Yes |
| Manage pharmacy dispatch list | Yes | No |
| Medicines | Yes | Yes |
| Medicine contributions | Yes | Yes |
| Validate/refuse contributions | Yes | No |
| Drug interactions | Yes | Yes |
| Reports & audit | Yes | No |
| Contact admin | No | Yes |

## 17. Synchronization Tests

### TC-SYNC-01 - Patient To Prescription

Flow:

```txt
Patient list -> New Rx -> Prescription page
```

Expected:

- Selected patient ID is preserved.
- Prescription page does not use another patient.

### TC-SYNC-02 - Consultation To Prescription

Flow:

```txt
Consultation detail -> Prescrire -> Prescription page
```

Expected:

- Same patient is selected.
- Diagnosis/consultation context should be reusable when backend is connected.

### TC-SYNC-03 - Prescription To Pharmacy Admin

Flow:

```txt
Doctor ordonnance -> Envoyer au pharmacien -> Admin pharmacy
```

Expected:

- Admin sees the dispatch.
- Status starts as `sent`.
- Doctor cannot edit admin pharmacy status list.

### TC-SYNC-04 - Contribution Doctor To Admin

Flow:

```txt
Doctor contribution -> Admin contribution review -> Doctor notification
```

Expected:

- Contribution starts as `pending`.
- Admin can validate/refuse.
- Doctor receives status update.

## 18. Current Risks To Watch

- Some seed/mock data may still use legacy clinical patient fields for CDSS compatibility.
- Real backend should separate patient administrative fields from consultation vitals.
- Doctor/admin synchronization is currently frontend store/mock based; backend persistence is still needed.
- Notifications are currently static/mock and should be connected to backend events.
- Build warning exists because local Node version is older than Vite recommendation.
- Bundle is large; later code-splitting may improve performance.

## 19. Recommended Manual Test Order

1. Login as doctor.
2. Create patient.
3. Create consultation for patient.
4. Add consultation vitals.
5. Create prescription from consultation.
6. Print ordonnance.
7. Send ordonnance to pharmacy.
8. Login as admin.
9. Confirm pharmacy dispatch appears.
10. Manage doctor list.
11. Review medicine contribution.
12. Check audit visibility.
13. Confirm doctor cannot access admin-only features.

