# MedCity Connect i18n Coverage Report

Date: 2026-05-21

## Status

The translation system is installed and working, but the application is not yet fully translated screen-by-screen.

## Implemented

- Global i18n provider with `fr`, `en`, and `ar`.
- Language switcher in the public navbar and login page.
- RTL direction support for Arabic via `document.documentElement.dir`.
- Shared/global areas:
  - Public navbar
  - Public footer
  - Login screen
  - Admin sidebar
  - Doctor sidebar
  - Doctor notifications dropdown
  - Patient add/edit form
- Workflow screens translated in this pass:
  - Doctor patient panel
  - Admin/CDSS patient list
  - Consultations list
  - Consultation create/edit dialog
  - Doctor contact admin screen
  - Prescription review queue
  - Public search results page

## Still Incomplete

These files still contain hardcoded visible UI strings and should be migrated next:

- `src/features/home/screens/HomeScreen.tsx`
- `src/features/doctors/screens/DoctorsDirectoryScreen.tsx`
- `src/features/blog/screens/BlogScreen.tsx`
- `src/features/contact/screens/ContactScreen.tsx`
- `src/features/admin/screens/AdminDashboardScreen.tsx`
- `src/features/admin/screens/AdminDoctorsScreen.tsx`
- `src/features/cms/screens/AdminCmsScreen.tsx`
- `src/features/cdss/screens/NewPrescriptionScreen.tsx`
- `src/features/cdss/screens/ConsultationDetailScreen.tsx`
- `src/features/cdss/screens/PharmacyScreen.tsx`
- `src/features/cdss/screens/MedicinesScreen.tsx`
- `src/features/cdss/screens/MedicineContributionsScreen.tsx`
- `src/features/cdss/screens/SettingsScreen.tsx`
- `src/features/cdss/screens/AuditScreen.tsx`
- `src/features/cdss/components/PatientSummary.tsx`
- `src/features/cdss/components/SendPrescriptionDialog.tsx`
- `src/features/cdss/components/SafetyPanel.tsx`
- `src/features/articles/screens/ArticleDetailScreen.tsx`

## Recommended Next Order

1. Public pages: home, doctors directory, blog, contact.
2. Critical doctor workflow: new prescription, patient summary, send prescription dialog, consultation detail.
3. Admin management: doctors, CMS, pharmacy, medicines, contributions.
4. Lower-priority admin/CDSS utilities: audit, settings, article detail.

## Verification

- `npm run typecheck` passes after the current i18n changes.
