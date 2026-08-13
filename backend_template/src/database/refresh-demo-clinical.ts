import '../types/pg';
import { Client } from 'pg';
import { config as loadEnv } from 'dotenv';

loadEnv();

const doctorAhmedId = '3208db86-5150-4e14-9473-686301fd670c';
const doctorRaniaId = '3352ca44-0fb8-4634-b032-2ec15994efcf';

const oldPrescriptionIds = [
  '2d59b5a4-6488-4fcc-9d75-e886da3f1361',
  'ab419180-4524-42df-9377-1fc6bcd05e9f',
  'c98c158d-a291-4b96-bac6-e147eebcb782',
  'e4b837fa-0b56-4482-812b-11f267da53ba',
  '636fccfe-68ca-4ea5-9cfb-530f4d2871cb',
  '57e36072-bd02-4f52-999c-c2ebc9fb18dd',
  '296a78aa-6c67-4ec5-85b5-0429ec0014e1',
  '1db3dde5-ffb8-41f9-a7f1-151d0f5542dc',
  'da448e8b-5213-4228-9eb5-eecb0661a673',
  'c2166dc4-2753-4588-bf66-fc51ce1e249d',
  '779880ba-7f57-4b9b-8b5a-3c8d112f2b93',
  'c9eb380e-15a4-4ae6-9fdd-a5294d0d328f',
  '3002c871-b83a-4567-8769-6a81b66935cb',
  '01761020-1074-4ccf-acff-696a3eff8cfe',
  '64721822-c5de-431e-ad0b-cc3739ac871b',
  '2d10c009-d30d-42e0-8cf2-c459fe67e177',
  '00da95cc-cf3c-4bd4-82b3-d0a3106457ad',
];

const oldConsultationIds = [
  '6743b871-4d02-45af-8597-f5e108180e6d',
  '71bdb216-8253-488f-9eb1-5167a939f2c8',
];

const demoPatientIds = [
  '25e97077-b778-49ef-b16b-b9348e8f6dd9',
  'aff379f5-dd7c-49f3-997f-c3a2cb56a06b',
  '015210b9-57fa-4146-b548-d2cfa95f125d',
  'b8000000-0000-4000-8000-000000000004',
  'b8000000-0000-4000-8000-000000000005',
];

const demoConsultationIds = [
  'c8000000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000002',
  'c8000000-0000-4000-8000-000000000003',
  'c8000000-0000-4000-8000-000000000004',
  'c8000000-0000-4000-8000-000000000005',
  'c8000000-0000-4000-8000-000000000006',
];

const demoPrescriptionIds = [
  'd8000000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000002',
  'd8000000-0000-4000-8000-000000000003',
  'd8000000-0000-4000-8000-000000000004',
  'd8000000-0000-4000-8000-000000000005',
  'd8000000-0000-4000-8000-000000000006',
];

const client = new Client({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT || 5432),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? {
          rejectUnauthorized:
            process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true',
        }
      : undefined,
  connectionTimeoutMillis: 10000,
});

type PatientSeed = {
  id: string;
  internalCode: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: 'male' | 'female' | 'other';
  phone1: string;
  profession: string;
  address: string;
  weightKg: number;
  heightCm: number;
  allergies: string[];
  currentMedications: Array<{ name: string; dose: string }>;
  comorbidities: string[];
  renal: Record<string, unknown>;
  liver: Record<string, unknown>;
  vitalsSnapshot: Record<string, unknown>;
  flags: string[];
  pregnancyStatus: 'not_pregnant' | 'pregnant' | 'unknown';
  pregnancyTrimester: number | null;
  missingData: string[];
  ownerDoctorId: string;
};

const patients: PatientSeed[] = [
  {
    id: demoPatientIds[0],
    internalCode: 'P-1042',
    firstName: 'Eleanor',
    lastName: 'Whitfield',
    birthDate: '1948-02-12',
    gender: 'female',
    phone1: '+216 20 104 200',
    profession: 'Retraitée',
    address: 'Tunis',
    weightKg: 62,
    heightCm: 161,
    allergies: ['Penicilline', 'Sulfamides'],
    currentMedications: [
      { name: 'Warfarine', dose: '5 mg, 1 fois par jour' },
      { name: 'Metformine', dose: '1000 mg, 2 fois par jour' },
    ],
    comorbidities: ['Diabète de type 2', 'Fibrillation atriale', 'IRC stade 3'],
    renal: { gfr: 42, status: 'moderate' },
    liver: { status: 'normal' },
    vitalsSnapshot: { hr: 78, bp: '138/82', temp: 36.8, spo2: 96 },
    flags: [],
    pregnancyStatus: 'not_pregnant',
    pregnancyTrimester: null,
    missingData: [],
    ownerDoctorId: doctorAhmedId,
  },
  {
    id: demoPatientIds[1],
    internalCode: 'P-1043',
    firstName: 'Marcus',
    lastName: 'Tanaka',
    birthDate: '1972-05-01',
    gender: 'male',
    phone1: '+216 20 104 300',
    profession: 'Ingénieur',
    address: 'Ariana',
    weightKg: 88,
    heightCm: 178,
    allergies: [],
    currentMedications: [{ name: 'Amlodipine', dose: '5 mg, 1 fois par jour' }],
    comorbidities: ['Hypertension artérielle', 'Hyperlipidémie'],
    renal: { gfr: 88, status: 'normal' },
    liver: { status: 'normal' },
    vitalsSnapshot: { hr: 72, bp: '128/78', temp: 36.6, spo2: 98 },
    flags: [],
    pregnancyStatus: 'unknown',
    pregnancyTrimester: null,
    missingData: [],
    ownerDoctorId: doctorAhmedId,
  },
  {
    id: demoPatientIds[2],
    internalCode: 'P-1044',
    firstName: 'Aisha',
    lastName: 'Okonkwo',
    birthDate: '1994-09-20',
    gender: 'female',
    phone1: '+216 20 104 400',
    profession: 'Enseignante',
    address: 'Sfax',
    weightKg: 68,
    heightCm: 167,
    allergies: ['Latex'],
    currentMedications: [
      { name: 'Lévothyroxine', dose: '75 microgrammes, 1 fois par jour' },
    ],
    comorbidities: ['Hypothyroïdie'],
    renal: { gfr: 102, status: 'normal' },
    liver: { status: 'normal' },
    vitalsSnapshot: { hr: 84, bp: '118/74', temp: 37.1, spo2: 99 },
    flags: [],
    pregnancyStatus: 'pregnant',
    pregnancyTrimester: 2,
    missingData: ['TSH récent'],
    ownerDoctorId: doctorRaniaId,
  },
  {
    id: demoPatientIds[3],
    internalCode: 'P-1050',
    firstName: 'Youssef',
    lastName: 'Gharbi',
    birthDate: '1965-11-08',
    gender: 'male',
    phone1: '+216 21 105 000',
    profession: 'Commerçant',
    address: 'Ben Arous',
    weightKg: 91,
    heightCm: 174,
    allergies: [],
    currentMedications: [
      { name: 'Ramipril', dose: '5 mg, 1 fois par jour' },
      { name: 'Metformine', dose: '850 mg, 2 fois par jour' },
      { name: 'Atorvastatine', dose: '20 mg, le soir' },
    ],
    comorbidities: ['Diabète de type 2', 'HTA', 'IRC stade 2'],
    renal: { gfr: 58, status: 'moderate' },
    liver: { status: 'normal' },
    vitalsSnapshot: { hr: 76, bp: '146/88', temp: 36.7, spo2: 97 },
    flags: ['polypharmacy'],
    pregnancyStatus: 'unknown',
    pregnancyTrimester: null,
    missingData: ['Albuminurie récente'],
    ownerDoctorId: doctorRaniaId,
  },
  {
    id: demoPatientIds[4],
    internalCode: 'P-1051',
    firstName: 'Meriem',
    lastName: 'Haddad',
    birthDate: '1989-06-18',
    gender: 'female',
    phone1: '+216 22 105 100',
    profession: 'Architecte',
    address: 'La Marsa',
    weightKg: 64,
    heightCm: 169,
    allergies: ['Pénicillines'],
    currentMedications: [],
    comorbidities: ['Asthme intermittent'],
    renal: { gfr: 96, status: 'normal' },
    liver: { status: 'normal' },
    vitalsSnapshot: { hr: 80, bp: '122/76', temp: 36.9, spo2: 98 },
    flags: [],
    pregnancyStatus: 'not_pregnant',
    pregnancyTrimester: null,
    missingData: [],
    ownerDoctorId: doctorRaniaId,
  },
];

type ConsultationSeed = {
  id: string;
  patientId: string;
  doctorId: string;
  reason: string;
  scheduledAt: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  diagnosis?: string;
  notes?: string;
  startedAt?: string;
  endedAt?: string;
};

const consultations: ConsultationSeed[] = [
  {
    id: demoConsultationIds[0],
    patientId: demoPatientIds[0],
    doctorId: doctorAhmedId,
    reason: 'Suivi anticoagulation et diabète',
    scheduledAt: '2026-08-07T09:00:00.000Z',
    status: 'completed',
    diagnosis: 'Fibrillation atriale et diabète de type 2 en suivi',
    notes: 'Renouvellement à contrôler avec le bilan biologique et l’INR.',
    startedAt: '2026-08-07T09:02:00.000Z',
    endedAt: '2026-08-07T09:24:00.000Z',
  },
  {
    id: demoConsultationIds[1],
    patientId: demoPatientIds[1],
    doctorId: doctorAhmedId,
    reason: 'Contrôle de l’hypertension artérielle',
    scheduledAt: '2026-08-08T10:30:00.000Z',
    status: 'completed',
    diagnosis: 'Hypertension artérielle essentielle stabilisée',
    notes: 'Poursuite du suivi tensionnel à domicile.',
    startedAt: '2026-08-08T10:31:00.000Z',
    endedAt: '2026-08-08T10:48:00.000Z',
  },
  {
    id: demoConsultationIds[2],
    patientId: demoPatientIds[2],
    doctorId: doctorRaniaId,
    reason: 'Suivi grossesse T2 et hypothyroïdie',
    scheduledAt: '2026-08-14T14:00:00.000Z',
    status: 'scheduled',
    notes: 'Apporter le dernier bilan TSH et le compte rendu obstétrical.',
  },
  {
    id: demoConsultationIds[3],
    patientId: demoPatientIds[3],
    doctorId: doctorRaniaId,
    reason: 'Évaluation rénale et revue de polymédication',
    scheduledAt: '2026-08-09T11:00:00.000Z',
    status: 'completed',
    diagnosis: 'IRC stade 2 avec HTA et diabète de type 2',
    notes: 'Revue des traitements en cours et rappel du contrôle de la fonction rénale.',
    startedAt: '2026-08-09T11:02:00.000Z',
    endedAt: '2026-08-09T11:28:00.000Z',
  },
  {
    id: demoConsultationIds[4],
    patientId: demoPatientIds[4],
    doctorId: doctorRaniaId,
    reason: 'Rendez-vous annulé par la patiente',
    scheduledAt: '2026-08-11T15:30:00.000Z',
    status: 'cancelled',
    notes: 'À reprogrammer selon les disponibilités de la patiente.',
  },
  {
    id: demoConsultationIds[5],
    patientId: demoPatientIds[4],
    doctorId: doctorRaniaId,
    reason: 'Évaluation d’une infection ORL avec allergie connue',
    scheduledAt: '2026-08-10T15:30:00.000Z',
    status: 'completed',
    diagnosis: 'Infection ORL suspectée, allergie aux pénicillines à respecter',
    notes: 'La proposition antibiotique a été rejetée et doit être remplacée.',
    startedAt: '2026-08-10T15:32:00.000Z',
    endedAt: '2026-08-10T15:50:00.000Z',
  },
];

type VitalSeed = {
  id: string;
  consultationId: string;
  patientId: string;
  heartRate: number;
  bloodPressure: string;
  temperature: number;
  heightCm: number;
  weightKg: number;
  oxygenSaturation: number;
  respiratoryRate: number;
  measuredAt: string;
  lastPeriodDate?: string;
};

const vitals: VitalSeed[] = [
  {
    id: 'f8000000-0000-4000-8000-000000000001',
    consultationId: demoConsultationIds[0],
    patientId: demoPatientIds[0],
    heartRate: 78,
    bloodPressure: '138/82',
    temperature: 36.8,
    heightCm: 161,
    weightKg: 62,
    oxygenSaturation: 96,
    respiratoryRate: 17,
    measuredAt: '2026-08-07T09:10:00.000Z',
  },
  {
    id: 'f8000000-0000-4000-8000-000000000002',
    consultationId: demoConsultationIds[1],
    patientId: demoPatientIds[1],
    heartRate: 72,
    bloodPressure: '128/78',
    temperature: 36.6,
    heightCm: 178,
    weightKg: 88,
    oxygenSaturation: 98,
    respiratoryRate: 16,
    measuredAt: '2026-08-08T10:36:00.000Z',
  },
  {
    id: 'f8000000-0000-4000-8000-000000000003',
    consultationId: demoConsultationIds[3],
    patientId: demoPatientIds[3],
    heartRate: 76,
    bloodPressure: '146/88',
    temperature: 36.7,
    heightCm: 174,
    weightKg: 91,
    oxygenSaturation: 97,
    respiratoryRate: 18,
    measuredAt: '2026-08-09T11:08:00.000Z',
  },
];

type PrescriptionSeed = {
  id: string;
  number: string;
  consultationId: string;
  patientId: string;
  doctorId: string;
  diagnosis: string;
  status: 'draft' | 'pending_review' | 'validated' | 'rejected';
  risk?: 'high' | 'medium' | 'low';
  notes: string;
  aiStatus?: string;
  aiBlocked: boolean;
  aiReviewRequired: boolean;
  validatedAt?: string;
};

const prescriptions: PrescriptionSeed[] = [
  {
    id: demoPrescriptionIds[0],
    number: 'DEMO-RX-20260812-001',
    consultationId: demoConsultationIds[0],
    patientId: demoPatientIds[0],
    doctorId: doctorAhmedId,
    diagnosis: 'Fibrillation atriale et diabète de type 2 en suivi',
    status: 'validated',
    risk: 'medium',
    notes: 'Ordonnance de renouvellement après vérification du contexte patient.',
    aiStatus: 'reviewed',
    aiBlocked: false,
    aiReviewRequired: false,
    validatedAt: '2026-08-07T09:26:00.000Z',
  },
  {
    id: demoPrescriptionIds[1],
    number: 'DEMO-RX-20260812-002',
    consultationId: demoConsultationIds[1],
    patientId: demoPatientIds[1],
    doctorId: doctorAhmedId,
    diagnosis: 'Hypertension artérielle essentielle stabilisée',
    status: 'validated',
    risk: 'low',
    notes: 'Traitement maintenu avec suivi tensionnel.',
    aiStatus: 'reviewed',
    aiBlocked: false,
    aiReviewRequired: false,
    validatedAt: '2026-08-08T10:50:00.000Z',
  },
  {
    id: demoPrescriptionIds[2],
    number: 'DEMO-RX-20260812-003',
    consultationId: demoConsultationIds[2],
    patientId: demoPatientIds[2],
    doctorId: doctorRaniaId,
    diagnosis: 'Hypothyroïdie pendant grossesse T2',
    status: 'pending_review',
    risk: 'medium',
    notes: 'Revue nécessaire après réception du dernier dosage de TSH.',
    aiStatus: 'review_required',
    aiBlocked: false,
    aiReviewRequired: true,
  },
  {
    id: demoPrescriptionIds[3],
    number: 'DEMO-RX-20260812-004',
    consultationId: demoConsultationIds[3],
    patientId: demoPatientIds[3],
    doctorId: doctorRaniaId,
    diagnosis: 'Diabète de type 2 avec IRC stade 2',
    status: 'draft',
    risk: 'medium',
    notes: 'Brouillon à compléter après le contrôle de la fonction rénale.',
    aiStatus: 'draft',
    aiBlocked: false,
    aiReviewRequired: false,
  },
  {
    id: demoPrescriptionIds[4],
    number: 'DEMO-RX-20260812-005',
    consultationId: demoConsultationIds[0],
    patientId: demoPatientIds[0],
    doctorId: doctorAhmedId,
    diagnosis: 'Suspicion d’infection nécessitant une vérification des interactions',
    status: 'pending_review',
    risk: 'high',
    notes: 'Validation bloquée tant que le risque Warfarine–antibiotique n’est pas résolu.',
    aiStatus: 'blocked',
    aiBlocked: true,
    aiReviewRequired: true,
  },
  {
    id: demoPrescriptionIds[5],
    number: 'DEMO-RX-20260812-006',
    consultationId: demoConsultationIds[5],
    patientId: demoPatientIds[4],
    doctorId: doctorRaniaId,
    diagnosis: 'Prescription refusée : allergie connue aux pénicillines',
    status: 'rejected',
    risk: 'high',
    notes: 'La ligne médicamenteuse a été rejetée et doit être remplacée par le médecin.',
    aiStatus: 'rejected',
    aiBlocked: true,
    aiReviewRequired: true,
  },
];

type MedicationSeed = {
  id: string;
  prescriptionId: string;
  dci: string;
  name: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  indication: string;
  instructions: string;
  status: 'ai_proposed' | 'edited' | 'validated' | 'rejected';
};

const medications: MedicationSeed[] = [
  {
    id: '98000000-0000-4000-8000-000000000001',
    prescriptionId: demoPrescriptionIds[0],
    dci: 'Warfarine',
    name: 'Warfarine 5 mg',
    dosage: '5 mg',
    route: 'PO',
    frequency: '1 fois par jour',
    duration: '30 jours',
    indication: 'Prévention thromboembolique dans la fibrillation atriale',
    instructions: 'Prendre à heure fixe et maintenir le suivi INR selon prescription.',
    status: 'validated',
  },
  {
    id: '98000000-0000-4000-8000-000000000002',
    prescriptionId: demoPrescriptionIds[1],
    dci: 'Amlodipine',
    name: 'Amlodipine 5 mg',
    dosage: '5 mg',
    route: 'PO',
    frequency: '1 fois par jour',
    duration: '3 mois',
    indication: 'Hypertension artérielle',
    instructions: 'Poursuivre la mesure de la tension à domicile.',
    status: 'validated',
  },
  {
    id: '98000000-0000-4000-8000-000000000003',
    prescriptionId: demoPrescriptionIds[2],
    dci: 'Lévothyroxine',
    name: 'Lévothyroxine 75 microgrammes',
    dosage: '75 microgrammes',
    route: 'PO',
    frequency: '1 fois par jour le matin',
    duration: '30 jours',
    indication: 'Hypothyroïdie',
    instructions: 'Confirmer le dosage avec le bilan TSH récent avant validation.',
    status: 'edited',
  },
  {
    id: '98000000-0000-4000-8000-000000000004',
    prescriptionId: demoPrescriptionIds[3],
    dci: 'Metformine',
    name: 'Metformine 850 mg',
    dosage: '850 mg',
    route: 'PO',
    frequency: '2 fois par jour au cours des repas',
    duration: '30 jours',
    indication: 'Diabète de type 2',
    instructions: 'Ne pas valider avant la revue de la fonction rénale.',
    status: 'ai_proposed',
  },
  {
    id: '98000000-0000-4000-8000-000000000005',
    prescriptionId: demoPrescriptionIds[4],
    dci: 'Amoxicilline acide clavulanique',
    name: 'Amoxicilline/acide clavulanique',
    dosage: '875/125 mg',
    route: 'PO',
    frequency: '2 fois par jour',
    duration: '7 jours',
    indication: 'Infection bactérienne à confirmer',
    instructions: 'Ne pas valider sans arbitrage du risque avec la Warfarine.',
    status: 'ai_proposed',
  },
  {
    id: '98000000-0000-4000-8000-000000000006',
    prescriptionId: demoPrescriptionIds[5],
    dci: 'Amoxicilline',
    name: 'Amoxicilline 500 mg',
    dosage: '500 mg',
    route: 'PO',
    frequency: '3 fois par jour',
    duration: '7 jours',
    indication: 'Proposition non retenue',
    instructions: 'Ligne rejetée en raison de l’allergie documentée.',
    status: 'rejected',
  },
];

const safetyAlerts = [
  {
    id: 'a8000000-0000-4000-8000-000000000001',
    prescriptionId: demoPrescriptionIds[2],
    severity: 'info',
    title: 'Grossesse T2 : bilan TSH à confirmer',
    drugsInvolved: ['Lévothyroxine'],
    explanation:
      'La patiente est documentée enceinte au deuxième trimestre et le dernier dosage TSH manque dans le dossier.',
    recommendedAction: 'Vérifier le bilan TSH et confirmer la posologie avant validation.',
    alternative: null,
    evidence: 'Données cliniques du dossier patient',
  },
  {
    id: 'a8000000-0000-4000-8000-000000000002',
    prescriptionId: demoPrescriptionIds[4],
    severity: 'critical',
    title: 'Interaction Warfarine–amoxicilline à évaluer',
    drugsInvolved: ['Warfarine', 'Amoxicilline acide clavulanique'],
    explanation:
      'Le traitement anticoagulant actuel peut être associé à une augmentation du risque hémorragique avec cet antibiotique.',
    recommendedAction: 'Remplacer ou justifier la ligne et organiser un contrôle INR rapproché.',
    alternative: 'Choisir une alternative après réévaluation de l’indication et des allergies.',
    evidence: 'Base interaction locale CDSS',
  },
  {
    id: 'a8000000-0000-4000-8000-000000000003',
    prescriptionId: demoPrescriptionIds[5],
    severity: 'major',
    title: 'Allergie aux pénicillines documentée',
    drugsInvolved: ['Amoxicilline'],
    explanation:
      'Le dossier patient contient une allergie connue aux pénicillines.',
    recommendedAction: 'Remplacer le traitement et documenter la décision du médecin.',
    alternative: 'Rechercher une alternative compatible avec le contexte clinique.',
    evidence: 'Allergies déclarées dans le dossier patient',
  },
];

const snapshots = [
  {
    id: '88000000-0000-4000-8000-000000000001',
    prescriptionId: demoPrescriptionIds[0],
    doctorFirstName: 'Ahmed',
    doctorLastName: 'Ben Ali',
    doctorSpecialty: 'Cardiologie',
    doctorCnamCode: 'CNOM-102948',
    doctorFiscalNumber: 'MF-102948',
    doctorPhone: '+216 71 234 567',
    patientFirstName: 'Eleanor',
    patientLastName: 'Whitfield',
    patientBirthDate: '1948-02-12',
    patientGender: 'female',
    footerNumber: 'DEMO-RX-20260812-001',
    printedAt: '2026-08-07T09:28:00.000Z',
  },
  {
    id: '88000000-0000-4000-8000-000000000002',
    prescriptionId: demoPrescriptionIds[1],
    doctorFirstName: 'Ahmed',
    doctorLastName: 'Ben Ali',
    doctorSpecialty: 'Cardiologie',
    doctorCnamCode: 'CNOM-102948',
    doctorFiscalNumber: 'MF-102948',
    doctorPhone: '+216 71 234 567',
    patientFirstName: 'Marcus',
    patientLastName: 'Tanaka',
    patientBirthDate: '1972-05-01',
    patientGender: 'male',
    footerNumber: 'DEMO-RX-20260812-002',
    printedAt: '2026-08-08T10:52:00.000Z',
  },
];

const dispatches = [
  {
    id: '78000000-0000-4000-8000-000000000001',
    prescriptionId: demoPrescriptionIds[0],
    patientId: demoPatientIds[0],
    patientName: 'Eleanor Whitfield',
    target: 'patient',
    recipient: 'eleanor.whitfield@example.test',
    channel: 'portal',
    status: 'received',
    note: 'Ordonnance disponible dans le portail patient.',
    sentAt: '2026-08-07T09:30:00.000Z',
  },
  {
    id: '78000000-0000-4000-8000-000000000002',
    prescriptionId: demoPrescriptionIds[1],
    patientId: demoPatientIds[1],
    patientName: 'Marcus Tanaka',
    target: 'pharmacist',
    recipient: 'pharmacie.demo@example.test',
    channel: 'email',
    status: 'sent',
    note: 'Transmission de démonstration à la pharmacie.',
    sentAt: '2026-08-08T10:55:00.000Z',
  },
];

const audits = prescriptions
  .filter((prescription) => prescription.status !== 'draft')
  .map((prescription, index) => {
    const patient = patients.find((row) => row.id === prescription.patientId)!;
    const doctor = prescription.doctorId === doctorAhmedId ? 'Ahmed Ben Ali' : 'Rania Zouari';
    return {
      id: `e8000000-0000-4000-8000-00000000000${index + 1}`,
      prescriptionId: prescription.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      doctorName: doctor,
      modelVersion: 'demo-clinical-v1',
      recommendation:
        prescription.status === 'validated'
          ? 'Aucune alerte bloquante après revue du contexte.'
          : 'Revue médicale nécessaire avant toute validation.',
      doctorModification:
        prescription.status === 'validated'
          ? 'Validation après vérification du dossier.'
          : prescription.status === 'rejected'
            ? 'Prescription rejetée avec motif documenté.'
            : 'Prescription maintenue en revue clinique.',
      alertsOverridden: 0,
      overrideReason: null,
      finalStatus: prescription.status,
      timestamp: prescription.validatedAt ?? '2026-08-12T10:00:00.000Z',
    };
  });

async function query(text: string, values: unknown[] = []) {
  return client.query(text, values);
}

async function deletePrescriptionTree(ids: string[]) {
  await query('DELETE FROM audit_entries WHERE prescription_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM pharmacy_dispatches WHERE prescription_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM prescription_print_snapshots WHERE prescription_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM safety_alerts WHERE prescription_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM prescription_medications WHERE prescription_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM prescriptions WHERE id = ANY($1::uuid[])', [ids]);
}

async function cleanKnownTestRows() {
  await deletePrescriptionTree(oldPrescriptionIds);
  await query('DELETE FROM consultation_vitals WHERE consultation_id = ANY($1::uuid[])', [oldConsultationIds]);
  await query('DELETE FROM consultations WHERE id = ANY($1::uuid[])', [oldConsultationIds]);
  await query(
    `DELETE FROM patients
     WHERE id IN (
       '6c63d9d8-cd8d-41d4-aeaa-58accf8f12c4'::uuid,
       '3fabebc4-1475-497f-b0a2-a76099d7ff76'::uuid
     )`,
  );
}

async function resetDemoRows() {
  await deletePrescriptionTree(demoPrescriptionIds);
  await query('DELETE FROM consultation_vitals WHERE consultation_id = ANY($1::uuid[])', [demoConsultationIds]);
  await query('DELETE FROM consultations WHERE id = ANY($1::uuid[])', [demoConsultationIds]);
}

async function upsertPatients() {
  for (const patient of patients) {
    await query(
      `INSERT INTO patients (
        id, first_name, last_name, birth_date, gender, phone1, profession, address,
        weight_kg, height_cm, internal_code, allergies, current_medications,
        comorbidities, renal, liver, vitals_snapshot, flags, pregnancy_status,
        pregnancy_trimester, missing_data, owner_doctor_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22
      )
      ON CONFLICT (internal_code) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        birth_date = EXCLUDED.birth_date,
        gender = EXCLUDED.gender,
        phone1 = EXCLUDED.phone1,
        profession = EXCLUDED.profession,
        address = EXCLUDED.address,
        weight_kg = EXCLUDED.weight_kg,
        height_cm = EXCLUDED.height_cm,
        allergies = EXCLUDED.allergies,
        current_medications = EXCLUDED.current_medications,
        comorbidities = EXCLUDED.comorbidities,
        renal = EXCLUDED.renal,
        liver = EXCLUDED.liver,
        vitals_snapshot = EXCLUDED.vitals_snapshot,
        flags = EXCLUDED.flags,
        pregnancy_status = EXCLUDED.pregnancy_status,
        pregnancy_trimester = EXCLUDED.pregnancy_trimester,
        missing_data = EXCLUDED.missing_data,
        owner_doctor_id = EXCLUDED.owner_doctor_id,
        updated_at = NOW()`,
      [
        patient.id,
        patient.firstName,
        patient.lastName,
        patient.birthDate,
        patient.gender,
        patient.phone1,
        patient.profession,
        patient.address,
        patient.weightKg,
        patient.heightCm,
        patient.internalCode,
        JSON.stringify(patient.allergies),
        JSON.stringify(patient.currentMedications),
        JSON.stringify(patient.comorbidities),
        JSON.stringify(patient.renal),
        JSON.stringify(patient.liver),
        JSON.stringify(patient.vitalsSnapshot),
        JSON.stringify(patient.flags),
        patient.pregnancyStatus,
        patient.pregnancyTrimester,
        JSON.stringify(patient.missingData),
        patient.ownerDoctorId,
      ],
    );
  }
}

async function insertConsultations() {
  for (const consultation of consultations) {
    await query(
      `INSERT INTO consultations (
        id, patient_id, doctor_id, reason, scheduled_at, status, diagnosis, notes,
        started_at, ended_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        consultation.id,
        consultation.patientId,
        consultation.doctorId,
        consultation.reason,
        consultation.scheduledAt,
        consultation.status,
        consultation.diagnosis ?? null,
        consultation.notes ?? null,
        consultation.startedAt ?? null,
        consultation.endedAt ?? null,
      ],
    );
  }
}

async function insertVitals() {
  for (const vital of vitals) {
    await query(
      `INSERT INTO consultation_vitals (
        id, consultation_id, patient_id, heart_rate, blood_pressure, temperature,
        height_cm, weight_kg, oxygen_saturation, respiratory_rate, measured_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        vital.id,
        vital.consultationId,
        vital.patientId,
        vital.heartRate,
        vital.bloodPressure,
        vital.temperature,
        vital.heightCm,
        vital.weightKg,
        vital.oxygenSaturation,
        vital.respiratoryRate,
        vital.measuredAt,
      ],
    );
  }
}

async function insertPrescriptions() {
  for (const prescription of prescriptions) {
    await query(
      `INSERT INTO prescriptions (
        id, prescription_number, consultation_id, patient_id, doctor_id, diagnosis,
        status, risk, notes, ai_status, ai_blocked, ai_review_required, validated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        prescription.id,
        prescription.number,
        prescription.consultationId,
        prescription.patientId,
        prescription.doctorId,
        prescription.diagnosis,
        prescription.status,
        prescription.risk ?? null,
        prescription.notes,
        prescription.aiStatus ?? null,
        prescription.aiBlocked,
        prescription.aiReviewRequired,
        prescription.validatedAt ?? null,
      ],
    );
  }
}

async function insertMedications() {
  for (const medication of medications) {
    await query(
      `INSERT INTO prescription_medications (
        id, prescription_id, medicine_id, medicine_dci, medicine_name, dosage, route,
        frequency, duration, indication, instructions, status, sort_order
      ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0)`,
      [
        medication.id,
        medication.prescriptionId,
        medication.dci,
        medication.name,
        medication.dosage,
        medication.route,
        medication.frequency,
        medication.duration,
        medication.indication,
        medication.instructions,
        medication.status,
      ],
    );
  }
}

async function insertAlerts() {
  for (const alert of safetyAlerts) {
    await query(
      `INSERT INTO safety_alerts (
        id, prescription_id, severity, title, drugs_involved, explanation,
        recommended_action, alternative, evidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        alert.id,
        alert.prescriptionId,
        alert.severity,
        alert.title,
        JSON.stringify(alert.drugsInvolved),
        alert.explanation,
        alert.recommendedAction,
        alert.alternative,
        alert.evidence,
      ],
    );
  }
}

async function insertSnapshots() {
  for (const snapshot of snapshots) {
    await query(
      `INSERT INTO prescription_print_snapshots (
        id, prescription_id, doctor_first_name, doctor_last_name, doctor_specialty,
        doctor_cnam_code, doctor_fiscal_number, doctor_phone, patient_first_name,
        patient_last_name, patient_birth_date, patient_gender, footer_number, printed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        snapshot.id,
        snapshot.prescriptionId,
        snapshot.doctorFirstName,
        snapshot.doctorLastName,
        snapshot.doctorSpecialty,
        snapshot.doctorCnamCode,
        snapshot.doctorFiscalNumber,
        snapshot.doctorPhone,
        snapshot.patientFirstName,
        snapshot.patientLastName,
        snapshot.patientBirthDate,
        snapshot.patientGender,
        snapshot.footerNumber,
        snapshot.printedAt,
      ],
    );
  }
}

async function insertDispatches() {
  for (const dispatch of dispatches) {
    await query(
      `INSERT INTO pharmacy_dispatches (
        id, prescription_id, patient_id, patient_name, target, recipient, channel,
        status, note, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        dispatch.id,
        dispatch.prescriptionId,
        dispatch.patientId,
        dispatch.patientName,
        dispatch.target,
        dispatch.recipient,
        dispatch.channel,
        dispatch.status,
        dispatch.note,
        dispatch.sentAt,
      ],
    );
  }
}

async function insertAudits() {
  for (const audit of audits) {
    await query(
      `INSERT INTO audit_entries (
        id, prescription_id, patient_name, doctor_name, model_version,
        recommendation, doctor_modification, alerts_overridden, override_reason,
        final_status, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        audit.id,
        audit.prescriptionId,
        audit.patientName,
        audit.doctorName,
        audit.modelVersion,
        audit.recommendation,
        audit.doctorModification,
        audit.alertsOverridden,
        audit.overrideReason,
        audit.finalStatus,
        audit.timestamp,
      ],
    );
  }
}

async function run() {
  await client.connect();
  await client.query('BEGIN');
  try {
    await cleanKnownTestRows();
    await resetDemoRows();
    await upsertPatients();
    await insertConsultations();
    await insertVitals();
    await insertPrescriptions();
    await insertMedications();
    await insertAlerts();
    await insertSnapshots();
    await insertDispatches();
    await insertAudits();
    await client.query('COMMIT');

    const summary = await query(`
      SELECT
        (SELECT COUNT(*) FROM patients) AS patients,
        (SELECT COUNT(*) FROM consultations) AS consultations,
        (SELECT COUNT(*) FROM consultation_vitals) AS vitals,
        (SELECT COUNT(*) FROM prescriptions) AS prescriptions,
        (SELECT COUNT(*) FROM prescription_medications) AS prescription_medications,
        (SELECT COUNT(*) FROM safety_alerts) AS safety_alerts,
        (SELECT COUNT(*) FROM prescription_print_snapshots) AS print_snapshots,
        (SELECT COUNT(*) FROM pharmacy_dispatches) AS dispatches,
        (SELECT COUNT(*) FROM audit_entries) AS audit_entries,
        (SELECT COUNT(*) FROM medicines) AS medicines
    `);
    console.log(JSON.stringify({ refreshed: true, summary: summary.rows[0] }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
