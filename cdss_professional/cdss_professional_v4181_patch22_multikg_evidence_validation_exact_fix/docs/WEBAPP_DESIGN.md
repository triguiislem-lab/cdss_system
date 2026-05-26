# Webapp Design For The Tunisia CDSS Prescription System

Date: 2026-04-30

This document defines a practical webapp design for the Clinical Decision Support System (CDSS) in this repository. The app is intended for clinician-in-the-loop prescription drafting, safety review, Tunisia localization, evidence inspection, and audit traceability.

The system must never present generated output as an automatically approved prescription. Every draft is a clinical proposal that requires qualified clinician review.

## Product Goal

Build a web interface that lets a clinician:

1. Enter patient and consultation context.
2. Generate a draft therapeutic plan through the existing CDSS API.
3. Review safety findings before considering any medication.
4. Inspect the clinical reasoning, evidence, Tunisia-localized products, and pipeline traces.
5. Fetch an audit record by `trace_id` for review, debugging, or governance.

## Existing Backend Contract

The webapp should use the current FastAPI API.

Base route:

```text
/v1
```

Main endpoints:

```text
POST /v1/prescriptions/draft
POST /v1/prescriptions/validate
POST /v1/prescriptions/localize
GET  /v1/prescriptions/audit/{trace_id}
GET  /v1/prescriptions/audit/{trace_id}/review-packet
GET  /health
```

Primary backend files:

```text
apps/api/main.py
apps/api/routers/prescriptions.py
apps/api/schemas.py
libs/contracts/patient.py
libs/contracts/prescription.py
libs/contracts/evidence.py
libs/contracts/safety.py
libs/contracts/execution.py
```

Main request model:

```json
{
  "request_id": "demo-001",
  "patient": {
    "patient_id": "p-001",
    "age_years": 34,
    "sex": "female",
    "weight_kg": 67,
    "pregnant": false,
    "breastfeeding": false,
    "renal_impairment": false,
    "hepatic_impairment": false,
    "known_allergies": ["penicillin"],
    "current_medications": ["metformin"],
    "chronic_conditions": []
  },
  "consultation": {
    "language": "fr",
    "doctor_notes": "Patient with fever, sore throat, and body aches for 2 days.",
    "transcript": [
      {"speaker": "doctor", "text": "What brings you in today?"},
      {"speaker": "patient", "text": "I have fever, sore throat, and body aches."}
    ]
  }
}
```

Main response model:

```text
PipelineExecutionRecord
```

Important response fields:

```text
request_id
status
blocked
trace_id
created_at
snapshot
evidence
draft_plan
safety
proposal
stage_traces
localization_skipped_reason
```

## Recommended Frontend Stack

Use a focused single-page webapp:

```text
React + TypeScript + Vite
TanStack Query for API calls and cache
React Hook Form + Zod for forms and validation
Tailwind CSS or a small local design system
Lucide React for icons
```

Suggested project location:

```text
apps/web/
```

Suggested frontend structure:

```text
apps/web/
  src/
    api/
      client.ts
      prescriptions.ts
      types.ts
    components/
      AppShell.tsx
      StatusBadge.tsx
      SafetyBanner.tsx
      StageTraceTimeline.tsx
      EvidencePanel.tsx
      MedicationTable.tsx
      LocalizedProductTable.tsx
    features/
      draft/
        DraftPage.tsx
        PatientForm.tsx
        ConsultationForm.tsx
        DraftResults.tsx
      audit/
        AuditLookupPage.tsx
      review/
        ReviewPacketPage.tsx
    styles/
      globals.css
    App.tsx
    main.tsx
```

## User Roles

### Clinician

Primary user. Enters case information, reviews the generated plan, checks contraindications and warnings, and decides whether the proposal is clinically acceptable.

### Clinical Reviewer

Reviews audit traces and review packets after the fact. Needs evidence, stage traces, safety findings, and blocked reasons.

### Technical Operator

Checks backend health, runtime status, failed stages, localization behavior, and audit records.

## Main Screens

## 1. Prescription Draft Screen

Route:

```text
/
/draft
```

Purpose:

Collect a clinical case and submit it to `POST /v1/prescriptions/draft`.

Layout:

- Left panel: patient and consultation input.
- Right panel: generated result, safety state, and evidence.
- Persistent top status strip: backend health, current request id, trace id after generation.

Patient fields:

- Patient ID
- Age
- Sex
- Weight
- Pregnant
- Breastfeeding
- Renal impairment
- Hepatic impairment
- Known allergies
- Current medications
- Chronic conditions

Consultation fields:

- Language: `fr`, `ar`, `en`, or free text value
- Doctor notes
- Transcript turns with speaker selector: doctor, patient, system

Primary actions:

- Generate draft
- Reset case
- Load demo case from `examples/request_demo.json`

Result states:

- Idle: no case submitted yet.
- Loading: draft request in progress.
- Ready for review: `status = ready_for_review` and `blocked = false`.
- Blocked: `blocked = true` or safety finding has `blocked = true`.
- Error: network or validation failure.

## 2. Draft Review Screen

This can be part of `/draft` after submission, or a separate route:

```text
/draft/:traceId
```

Purpose:

Show the generated `PipelineExecutionRecord` in a clinician-friendly review layout.

Top summary:

- Status badge: blocked or ready for review
- Route recommendation: `prescription`, `review`, `emergency`, or `non_pharma`
- Trace ID
- Created timestamp
- Confidence if present
- Localization skipped reason if present

Core panels:

- Safety findings
- Draft therapeutic plan
- Localized Tunisia products
- Clinical snapshot
- Evidence
- Stage traces

## 3. Safety Review Panel

Purpose:

Make risk and blocking reasons impossible to miss.

Input:

```text
safety.findings
proposal.blocked_reasons
proposal.review_notes
blocked
status
```

Display:

- Critical findings first.
- Warning findings second.
- Informational findings last.
- Show medication, category, rule id, evidence source, and recommended action when available.

Visual priority:

- Critical blocked: red banner, clear "Blocked" state.
- Warning: amber banner.
- Info: neutral compact row.

Required copy:

```text
Draft must be reviewed and approved by a qualified clinician.
```

## 4. Therapeutic Plan Panel

Purpose:

Display the generated treatment plan without implying it is final.

Input:

```text
draft_plan
proposal.plan
```

Fields:

- Problem summary
- Medications
- Non-drug recommendations
- Monitoring
- Unresolved questions
- Generation notes
- Triage recommendation
- Confidence

Medication table columns:

- Active ingredient
- Indication
- Dose
- Frequency
- Duration
- Route
- Rationale
- Safety considerations

Supporting evidence should be expandable per medication.

## 5. Tunisia Localization Panel

Purpose:

Show locally matched products from Tunisia runtime assets when localization is available.

Input:

```text
proposal.localized_medications
evidence.local_products
localization_skipped_reason
```

Columns:

- Local product name
- Generic active ingredient
- Strength
- Dosage form
- Market
- Match confidence
- Reimbursement note
- Localization notes

If localization is skipped, show the reason in a neutral warning panel. The app must not hide the draft plan just because localization was skipped.

## 6. Evidence Panel

Purpose:

Let clinicians and reviewers see why the system produced the draft.

Input:

```text
evidence.vector_chunks
evidence.graph_facts
evidence.local_products
evidence.retrieval_plan
evidence.merged_summary
```

Tabs:

- Summary
- Text evidence
- Knowledge graph facts
- Local formulary
- Retrieval plan

Text evidence card:

- Title
- Source
- Score
- Content excerpt
- Metadata drawer

Knowledge graph fact row:

- Subject
- Predicate
- Object
- Score
- Provenance

Retrieval plan:

- Primary terms
- Patient context tokens
- Queries grouped by source: vector, kg, local formulary

## 7. Clinical Snapshot Panel

Purpose:

Show what the system understood from the patient and consultation.

Input:

```text
snapshot
```

Sections:

- Patient profile
- Normalized symptoms
- Suspected conditions
- Disease tags
- Missing critical information
- Risk flags
- Vulnerable flags
- Normalized runtime text
- Extracted context
- Route recommendation

Use collapsible JSON display for `extracted_context` because it can be technical.

## 8. Stage Trace Timeline

Purpose:

Make the pipeline transparent and debuggable.

Input:

```text
stage_traces
```

Stages:

```text
clinical_understanding
retrieval
generation
safety
localization
audit
```

Each stage row:

- Stage name
- Status: ok, skipped, or error
- Duration in milliseconds
- Detail, if present

If a stage failed, expand its detail automatically.

## 9. Audit Lookup Screen

Route:

```text
/audit
```

Purpose:

Fetch a previous execution record by trace id.

API:

```text
GET /v1/prescriptions/audit/{trace_id}
```

Controls:

- Trace ID input
- Fetch audit
- Fetch review packet

Display:

- Same review layout as the draft result.
- Clear 404 state if no record exists.

## 10. Review Packet Screen

Route:

```text
/review/:traceId
```

Purpose:

Display `ClinicianReviewPacket` for governance and human review.

API:

```text
GET /v1/prescriptions/audit/{trace_id}/review-packet
```

Required sections:

- Patient snapshot
- Evidence bundle
- Proposal
- Safety report
- Review notes

## Navigation

Use a compact application shell, not a marketing landing page.

Primary navigation:

- Draft
- Audit
- Review packet
- Runtime health

Header content:

- App name: Tunisia CDSS
- Backend health indicator
- Current environment label if available

Footer or persistent note:

```text
Clinical decision support only. Final prescription decisions remain with the clinician.
```

## Visual Design Direction

The app should feel like a clinical operations tool:

- Dense, readable, and calm.
- High contrast for clinical safety states.
- Minimal decoration.
- Clear hierarchy between input, output, safety, and evidence.
- Tables for medications and local products.
- Tabs for evidence categories.
- Collapsible sections for technical details.

Avoid:

- Marketing hero sections.
- Decorative gradients as the main visual system.
- Oversized cards for every section.
- Hiding safety findings behind secondary interactions.

Recommended color roles:

```text
Background: near-white or light gray
Text: dark neutral
Primary action: clinical blue or teal
Critical: red
Warning: amber
Success/ready: green
Info/neutral: slate gray
```

## Interaction Rules

The webapp should protect the clinician from misreading the output.

Rules:

1. Show blocked status at the top of the result.
2. Show safety findings before the medication plan.
3. Never label a generated plan as "approved".
4. Keep evidence accessible from every result.
5. Keep the trace id visible after generation.
6. Preserve the submitted request payload in local UI state for review.
7. Display backend validation errors field-by-field when possible.
8. Disable the generate button while a draft request is running.
9. Let users copy the trace id and request id.
10. Show localization skipped reason when localization does not run.

## Frontend API Types

Generate TypeScript types from the FastAPI OpenAPI schema if possible.

Suggested command after backend is running:

```bash
npx openapi-typescript http://127.0.0.1:8000/openapi.json -o apps/web/src/api/openapi.d.ts
```

If manual types are used first, mirror these backend models:

```text
PatientProfile
ConsultationInput
TranscriptTurn
ConsultationRequest
PipelineExecutionRecord
PatientSnapshot
EvidenceBundle
TherapeuticPlan
MedicationDraft
LocalizedMedication
SafetyReport
SafetyFinding
StageTrace
ClinicianReviewPacket
```

## API Client Behavior

Configure the API base URL through an environment variable:

```text
VITE_API_BASE_URL=http://127.0.0.1:8000/v1
```

Recommended client functions:

```text
health()
draftPrescription(payload)
validatePrescription(payload)
localizePrescription(payload)
getAuditRecord(traceId)
getReviewPacket(traceId)
```

Error handling:

- Network error: show retry option.
- HTTP 422: show validation details near form fields.
- HTTP 404 audit lookup: show "No audit record found".
- HTTP 500: show general backend error and keep submitted form data visible.

## Runtime Health Screen

Route:

```text
/health
```

Purpose:

Show whether the API is reachable.

Minimum:

- `GET /health` status
- API base URL
- Last checked timestamp
- Manual refresh button

Future extension:

- Surface diagnostics from `tools/runtime_component_diagnostics.py` output if the backend exposes it later.

## Form Validation

Client-side validation should match backend constraints:

- `patient_id` required.
- `age_years` must be between 0 and 130 when provided.
- `weight_kg` must be greater than 0 when provided.
- `sex` must be one of: male, female, other, unknown.
- transcript turns must have non-empty text.
- language defaults to `fr`.

Use tag inputs for:

- Known allergies
- Current medications
- Chronic conditions

## Accessibility

Clinical safety states must not rely on color alone.

Requirements:

- Use labels such as Critical, Warning, Blocked, Ready for review.
- Keyboard navigable forms and tabs.
- Visible focus states.
- Sufficient contrast for red and amber states.
- Tables must have clear column headers.
- Long evidence content should remain selectable text.

## Security And Privacy

The webapp will handle clinical data, so default to conservative behavior.

Minimum rules:

- Do not send patient data to third-party analytics.
- Do not log full request payloads in the browser console.
- Keep local storage disabled for patient records unless explicitly required.
- If local persistence is later added, make it opt-in and clearly visible.
- Use HTTPS in deployed environments.
- Add authentication before any real clinical deployment.

## Implementation Phases

### Phase 1: Usable Local Webapp

Goal:

Create the first working UI for local development and demos.

Scope:

- Vite React app in `apps/web`.
- Draft form.
- Draft result layout.
- Safety findings.
- Medication plan.
- Localized products.
- Evidence tabs.
- Stage traces.
- Audit lookup by trace id.

### Phase 2: Clinician Review Workflow

Goal:

Improve review ergonomics.

Scope:

- Dedicated review packet route.
- Better blocked-state workflow.
- Export or print-friendly review packet.
- Form presets for common test scenarios.
- Side-by-side request and response comparison.

### Phase 3: Deployment Readiness UI

Goal:

Support controlled pilot deployment.

Scope:

- Authentication.
- Role-aware navigation.
- Governance status display.
- Runtime diagnostics display.
- Audit search and filtering.
- Deployment-mode warnings.

## Acceptance Criteria For Phase 1

The Phase 1 webapp is complete when:

1. A clinician can submit the demo request from `examples/request_demo.json`.
2. The app calls `POST /v1/prescriptions/draft`.
3. The app displays `status`, `blocked`, `trace_id`, and `route_recommendation`.
4. Safety findings appear before medications.
5. Draft medications display dose, frequency, duration, route, rationale, and safety considerations.
6. Localized Tunisia products display when present.
7. Evidence can be inspected by vector chunks, graph facts, local products, and retrieval plan.
8. Stage traces show every pipeline stage with status and duration.
9. The user can fetch the same result later by `trace_id`.
10. The UI clearly states that clinician review is required.

## Suggested Development Commands

Backend:

```bash
pip install -e ".[dev]"
uvicorn apps.api.main:app --reload
```

Frontend:

```bash
cd apps/web
npm install
npm run dev
```

Tests:

```bash
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest -q
npm run lint
npm run test
```

## Open Design Questions

These can be answered during implementation:

- Should the first release support French only, or French plus Arabic and English labels?
- Should audit records be searchable by patient id, request id, or only trace id?
- Should the app include a printable prescription-style output, or only a review packet?
- Should users be allowed to edit a generated plan before calling `/validate`?
- Should the frontend expose deployment governance status directly?

## Recommended First Implementation Path

Start with a single route:

```text
/draft
```

Implement the draft form and result review view first. Once the response is displayed correctly, add `/audit` and reuse the same result components. This keeps the app aligned with the current backend while leaving room for a richer clinician review workflow later.
