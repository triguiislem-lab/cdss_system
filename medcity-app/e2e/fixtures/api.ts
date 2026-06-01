import type { Page, Route } from "@playwright/test";

type UserRole = "admin" | "doctor";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const cmsHome = {
  posts: [
    {
      id: "post-cdss",
      title: "MedCity CDSS connecte au backend",
      slug: "medcity-cdss-connecte-backend",
      excerpt: "Validation automatique des prescriptions avec donnees backend.",
      content: "Le contenu public provient de l'API CMS et reste stable pendant les tests.",
      category: "Sante Numerique",
      tags: ["cdss", "backend"],
      author: "MedCity",
      imageUrl: "",
      coverColor: "from-blue-500 to-cyan-500",
      status: "published",
      featured: true,
      publishedAt: "2026-05-30T09:00:00.000Z",
      scheduledDate: "",
      views: 42,
      readTime: 2,
      commentsCount: 0,
      metaTitle: "MedCity CDSS",
      metaDescription: "CDSS public CMS smoke test",
      updatedAt: "2026-05-30T09:00:00.000Z",
    },
  ],
  testimonials: [
    {
      id: "testimonial-samar",
      name: "Dr. Samar Ben Ali",
      role: "Medecin test",
      text: "Le tableau de bord clinique charge les donnees rapidement.",
      rating: 5,
      active: true,
    },
  ],
  partners: [
    {
      id: "partner-pct",
      name: "Pharmacie Centrale de Tunisie",
      logoUrl: "",
      websiteUrl: "https://pct.tn",
      description: "Partenaire de donnees medicamenteuses",
      active: true,
    },
  ],
  specialties: [
    {
      id: "specialty-cardio",
      name: "Cardiologie",
      description: "Suivi cardiovasculaire et prevention.",
      iconName: "Heart",
      color: "text-red-500",
      bg: "bg-red-500/10",
      query: "cardiology",
      active: true,
    },
  ],
  whyFeatures: [
    {
      id: "why-safety",
      iconName: "Shield",
      gradient: "from-blue-600 to-cyan-500",
      title: "Securite de prescription",
      text: "Controle des risques, interactions et alertes critiques avant validation.",
      active: true,
    },
  ],
};

const patients = [
  {
    id: "patient-1042",
    firstName: "Eleanor",
    lastName: "Whitfield",
    birthDate: "1948-01-12",
    gender: "female",
    phone1: "+216 71 000 001",
    weightKg: 62,
    heightCm: 161,
    allergies: ["Penicillin"],
    currentMedications: [{ name: "Warfarin", dose: "5 mg daily" }],
    comorbidities: ["Atrial fibrillation", "CKD stage 3"],
    renal: { gfr: 42, status: "moderate" },
    liver: { status: "normal" },
    vitalsSnapshot: { hr: 78, bp: "138/82", temp: 36.8, spo2: 96 },
    flags: ["Polypharmacy"],
    missingData: ["Recent INR"],
    createdAt: "2026-05-30T09:00:00.000Z",
    updatedAt: "2026-05-30T09:00:00.000Z",
  },
  {
    id: "patient-1043",
    firstName: "Marcus",
    lastName: "Tanaka",
    birthDate: "1972-03-22",
    gender: "male",
    phone1: "+216 71 000 002",
    weightKg: 88,
    heightCm: 178,
    allergies: [],
    currentMedications: [],
    comorbidities: ["Hypertension"],
    renal: { gfr: 88, status: "normal" },
    liver: { status: "normal" },
    vitalsSnapshot: { hr: 72, bp: "128/78", temp: 36.6, spo2: 98 },
    flags: [],
    createdAt: "2026-05-30T09:00:00.000Z",
    updatedAt: "2026-05-30T09:00:00.000Z",
  },
];

const prescriptions = [
  {
    id: "rx-2087",
    prescriptionNumber: "RX-2087",
    patientId: "patient-1042",
    diagnosis: "Community-acquired pneumonia",
    status: "pending_review",
    risk: "high",
    notes: "Productive cough and fever.",
    doctor: { firstName: "Ahmed", lastName: "Ben Ali", email: "dr.ahmed@medcity.tn" },
    medications: [
      {
        id: "med-1",
        medicineName: "Amoxicillin-clavulanate",
        dosage: "875/125 mg",
        route: "PO",
        frequency: "BID",
        duration: "7 days",
        indication: "CAP",
        confidence: 82,
        status: "ai_proposed",
      },
    ],
    safetyAlerts: [
      {
        id: "alert-1",
        severity: "critical",
        title: "Major bleeding risk",
        drugsInvolved: ["Warfarin", "Amoxicillin-clavulanate"],
        explanation: "Potential INR elevation.",
        recommendedAction: "Monitor INR or choose alternative.",
        evidence: "Clinical guideline",
      },
    ],
    createdAt: "2026-05-30T09:00:00.000Z",
    updatedAt: "2026-05-30T09:10:00.000Z",
  },
  {
    id: "rx-2084",
    prescriptionNumber: "RX-2084",
    patientId: "patient-1043",
    diagnosis: "Hypertension follow-up",
    status: "validated",
    risk: "low",
    doctor: { firstName: "Ahmed", lastName: "Ben Ali", email: "dr.ahmed@medcity.tn" },
    medications: [],
    createdAt: "2026-05-30T08:00:00.000Z",
    updatedAt: "2026-05-30T08:30:00.000Z",
  },
];

const consultations = [
  {
    id: "consultation-5001",
    patientId: "patient-1042",
    patient: patients[0],
    doctor: { id: "doctor-ahmed", firstName: "Ahmed", lastName: "Ben Ali", email: "dr.ahmed@medcity.tn" },
    doctorId: "doctor-ahmed",
    reason: "Suivi pneumonie communautaire",
    scheduledAt: "2026-05-30T10:00:00.000Z",
    status: "scheduled",
    notes: "Controle clinique avant validation de prescription.",
    diagnosis: "Community-acquired pneumonia",
    recordingUrl: "",
    recordingDurationSec: 0,
    audioBucketPath: "",
    audioProcessingStatus: "",
    transcript: "",
    audioProcessingResult: null,
    createdAt: "2026-05-30T08:00:00.000Z",
  },
];

const consultationVitals = [
  {
    id: "vital-1",
    consultationId: "consultation-5001",
    patientId: "patient-1042",
    heartRate: 78,
    bloodPressure: "138/82",
    temperature: 36.8,
    oxygenSaturation: 96,
    respiratoryRate: 18,
    measuredAt: "2026-05-30T09:45:00.000Z",
    createdAt: "2026-05-30T09:45:00.000Z",
  },
];

const doctors = [
  {
    id: "doctor-ahmed",
    firstName: "Ahmed",
    lastName: "Ben Ali",
    email: "dr.ahmed@medcity.tn",
    phone: "+216 71 000 010",
    fiscalNumber: "MF-001",
    specialty: "Medecine generale",
    cnamCode: "CNAM-001",
    city: "Tunis",
    status: "active",
  },
];

const medicines = [
  {
    id: "TN-001",
    dci: "Paracetamol",
    brands: ["Doliprane"],
    atcCode: "N02BE01",
    drugClass: "Antalgique",
    forms: ["500 mg cp"],
    laboratories: ["MedCity Test"],
    reimbursement: "70%",
    indication: "Pain and fever",
    contraindications: ["Severe hepatic impairment"],
    posologyAdult: "500 mg to 1 g every 6 hours.",
    pregnancy: "Autorise",
    renalAdjust: false,
    hepaticAdjust: true,
    priceTndApprox: 3.2,
  },
];

const medicineContributions = [
  {
    id: "ctr-test-1",
    kind: "correction",
    status: "pending",
    authorEmail: "dr.ahmed@medcity.tn",
    authorName: "Dr. Ahmed Ben Ali",
    createdAt: "2026-05-30T09:20:00.000Z",
    targetMedicineId: "TN-001",
    targetMedicineDci: "Paracetamol",
    field: "posologyAdult",
    oldValue: "500 mg every 8 hours.",
    newValue: "500 mg to 1 g every 6 hours.",
    rationale: "Local formulary update",
  },
];

const audits = [
  {
    id: "audit-1",
    prescriptionId: "rx-2087",
    patientName: "Eleanor Whitfield",
    doctorName: "Dr. Ahmed Ben Ali",
    modelVersion: "CDSS test",
    recommendation: "Review high-risk interaction",
    doctorModification: "Pending",
    alertsOverridden: 0,
    finalStatus: "pending_review",
    timestamp: "2026-05-30 09:10",
  },
];

function paginated<T>(data: T[]) {
  return {
    data,
    meta: {
      page: 1,
      limit: 100,
      total: data.length,
      totalPages: 1,
    },
  };
}

function jwtForRole(role: UserRole) {
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64");
  return `e30.${payload}.signature`;
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
    return;
  }

  await route.fulfill({
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function parseLoginRole(route: Route): UserRole {
  const rawBody = route.request().postData();
  if (!rawBody) return "doctor";

  try {
    const credentials = JSON.parse(rawBody) as { email?: string };
    return credentials.email?.toLowerCase().includes("admin") ? "admin" : "doctor";
  } catch {
    return "doctor";
  }
}

export async function mockMedcityApi(page: Page) {
  await page.route(/\/api\/public\/home$/, (route) => fulfillJson(route, cmsHome));
  await page.route(/\/api\/public\/posts\/[^/]+$/, (route) => fulfillJson(route, cmsHome.posts[0]));
  await page.route(/\/api\/public\/doctors(?:\?.*)?$/, (route) => fulfillJson(route, paginated(doctors)));

  await page.route(/\/api\/auth\/login$/, (route) => {
    const role = parseLoginRole(route);
    return fulfillJson(route, {
      accessToken: jwtForRole(role),
      refreshToken: `refresh-${role}`,
      user: {
        id: role === "admin" ? "admin-1" : "doctor-ahmed",
        email: role === "admin" ? "admin@medcity.tn" : "dr.ahmed@medcity.tn",
        role,
      },
    });
  });

  await page.route(/\/api\/patients(?:\?.*)?$/, (route) => fulfillJson(route, paginated(patients)));
  await page.route(/\/api\/prescriptions(?:\?.*)?$/, (route) => fulfillJson(route, paginated(prescriptions)));
  await page.route(/\/api\/consultations(?:\?.*)?$/, (route) => fulfillJson(route, paginated(consultations)));
  await page.route(/\/api\/consultations\/[^/]+\/vitals$/, (route) => fulfillJson(route, consultationVitals));
  await page.route(/\/api\/consultations\/[^/]+$/, (route) => fulfillJson(route, consultations[0]));
  await page.route(/\/api\/audio\/upload(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    const consultationId = url.searchParams.get("consultationId") || "consultation-5001";
    return fulfillJson(route, {
      ok: true,
      consultationId,
      bucket: "temp-consultation-audio",
      path: `consultations/${consultationId}/raw.webm`,
      bytes: route.request().postDataBuffer()?.byteLength ?? 1024,
      message: "Audio uploaded to Supabase Storage",
    });
  });
  await page.route(/\/api\/audio\/start-processing$/, (route) => fulfillJson(route, {
    ok: true,
    status: "kaggle_running",
    consultationId: "consultation-5001",
    bucketPath: "consultations/consultation-5001/raw.webm",
    datasetStatus: "versioned",
    datasetId: "test/cdss-temp-consultation-audio",
    kernelCommand: "kaggle kernels push -p runtime/kernel",
  }));
  await page.route(/\/api\/kaggle\/status$/, (route) => fulfillJson(route, {
    ok: true,
    command: "kaggle kernels status test/cdss-audio-processor",
    stdout: "complete",
    stderr: "",
  }));
  await page.route(/\/api\/kaggle\/fetch-output$/, (route) => fulfillJson(route, {
    ok: true,
    command: "kaggle kernels output test/cdss-audio-processor -p runtime/outputs -o",
    stdout: "",
    stderr: "",
    outputDir: "runtime/outputs",
    resultJson: {
      status: "completed_transcription",
      consultation_id: "consultation-5001",
      final_transcript: "Patient reports cough and fever.",
      transcript: "Patient reports cough and fever.",
      asr: { selected_engine: "linto", fallback_used: false },
      medical_extraction: {
        symptoms_detected: ["cough", "fever"],
        medications_detected: [],
        safety_flags: [],
      },
      safety_validation: { requires_physician_validation: true },
    },
  }));
  await page.route(/\/api\/doctors(?:\?.*)?$/, (route) => fulfillJson(route, paginated(doctors)));
  await page.route(/\/api\/cms\/posts$/, (route) => fulfillJson(route, cmsHome.posts));
  await page.route(/\/api\/medicines(?:\?.*)?$/, (route) => fulfillJson(route, paginated(medicines)));
  await page.route(/\/api\/medicine-contributions(?:\?.*)?$/, (route) => fulfillJson(route, paginated(medicineContributions)));
  await page.route(/\/api\/audit(?:\?.*)?$/, (route) => fulfillJson(route, paginated(audits)));
}
