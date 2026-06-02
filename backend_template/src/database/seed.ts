import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { DataSource, DataSourceOptions, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  AlertSeverity,
  CmsStatus,
  DoctorStatus,
  Gender,
  PregnancyStatus,
  ReimbursementRate,
  UserRole,
} from '../common/entities/enums';
import { User } from '../users/user.entity';
import { DoctorProfile } from '../doctors/doctor-profile.entity';
import { Patient } from '../patients/patient.entity';
import { Consultation } from '../consultations/consultation.entity';
import { ConsultationVitals } from '../consultations/consultation-vitals.entity';
import { Prescription } from '../prescriptions/prescription.entity';
import { PrescriptionMedication } from '../prescriptions/prescription-medication.entity';
import { PrescriptionPrintSnapshot } from '../prescriptions/prescription-print-snapshot.entity';
import { SafetyAlert } from '../prescriptions/safety-alert.entity';
import { PharmacyDispatch } from '../pharmacy/pharmacy-dispatch.entity';
import { Medicine } from '../medicines/medicine.entity';
import { MedicineContribution } from '../medicine-contributions/medicine-contribution.entity';
import { InteractionResult } from '../interactions/interaction-result.entity';
import { AuditEntry } from '../audit/audit-entry.entity';
import {
  ContactMessage,
  NewsletterSubscription,
  Partner,
  Post,
  Specialty,
  Testimonial,
  WhyFeature,
} from '../cms/cms.entities';

loadEnv();

async function run() {
  const config = new ConfigService();
  const entities = [
    User,
    DoctorProfile,
    Patient,
    Consultation,
    ConsultationVitals,
    Prescription,
    PrescriptionMedication,
    PrescriptionPrintSnapshot,
    SafetyAlert,
    PharmacyDispatch,
    Medicine,
    MedicineContribution,
    InteractionResult,
    AuditEntry,
    Post,
    Testimonial,
    Partner,
    Specialty,
    WhyFeature,
    ContactMessage,
    NewsletterSubscription,
  ];
  const synchronize = config.get<string>('DATABASE_SYNC', 'true') === 'true';
  const databaseType = config.get<string>('DATABASE_TYPE', 'sqlite');
  const databaseSsl = config.get<string>('DATABASE_SSL', 'false') === 'true';
  const rejectUnauthorized =
    config.get<string>('DATABASE_SSL_REJECT_UNAUTHORIZED', 'false') === 'true';
  const ssl = databaseSsl ? { rejectUnauthorized } : undefined;
  const options: DataSourceOptions =
    databaseType === 'postgres'
      ? {
          type: 'postgres',
          host: config.get<string>('DATABASE_HOST', 'localhost'),
          port: config.get<number>('DATABASE_PORT', 5432),
          username: config.get<string>('DATABASE_USER', 'postgres'),
          password: config.get<string>('DATABASE_PASSWORD', 'postgres'),
          database: config.get<string>('DATABASE_NAME', 'medcity_connect'),
          ssl,
          extra: ssl ? { ssl } : undefined,
          synchronize,
          entities,
        }
      : (() => {
          const database = config.get<string>(
            'SQLITE_DATABASE',
            './data/medcity.sqlite',
          );
          mkdirSync(dirname(database), { recursive: true });
          return {
            type: 'sqlite',
            database,
            synchronize,
            entities,
          };
        })();
  const dataSource = new DataSource(options);

  await dataSource.initialize();
  const users = dataSource.getRepository(User);
  const doctors = dataSource.getRepository(DoctorProfile);
  const patients = dataSource.getRepository(Patient);
  const medicines = dataSource.getRepository(Medicine);
  const interactions = dataSource.getRepository(InteractionResult);
  const posts = dataSource.getRepository(Post);
  const testimonials = dataSource.getRepository(Testimonial);
  const partners = dataSource.getRepository(Partner);
  const specialties = dataSource.getRepository(Specialty);
  const whyFeatures = dataSource.getRepository(WhyFeature);

  await ensureUser(users, {
    email: config.get<string>('SEED_ADMIN_EMAIL', 'admin@medcity.tn'),
    password: seedPassword(config, 'SEED_ADMIN_PASSWORD'),
    role: UserRole.Admin,
  });

  const doctorUser = await ensureUser(users, {
    email: 'dr.ahmed@medcity.tn',
    password: seedPassword(config, 'SEED_DOCTOR_AHMED_PASSWORD'),
    role: UserRole.Doctor,
  });
  await ensureDoctor(doctors, doctorUser, {
    firstName: 'Ahmed',
    lastName: 'Ben Ali',
    phone: '+216 71 234 567',
    fiscalNumber: 'MF-102948',
    specialty: 'Cardiologie',
    cnamCode: 'CNOM-102948',
    city: 'Tunis',
  });

  const secondDoctorUser = await ensureUser(users, {
    email: 'dr.rania@medcity.tn',
    password: seedPassword(config, 'SEED_DOCTOR_RANIA_PASSWORD'),
    role: UserRole.Doctor,
  });
  await ensureDoctor(doctors, secondDoctorUser, {
    firstName: 'Rania',
    lastName: 'Zouari',
    phone: '+216 55 345 678',
    fiscalNumber: 'MF-114772',
    specialty: 'Endocrinologie',
    cnamCode: 'CNOM-114772',
    city: 'Tunis',
  });

  await seedPatients(patients);
  await seedMedicines(medicines);
  await seedInteractions(interactions);
  await seedCms(posts, testimonials, partners, specialties, whyFeatures);

  await dataSource.destroy();
}

function seedPassword(config: ConfigService, key: string) {
  return (
    config.get<string>(key) ??
    config.get<string>('SEED_DOCTOR_DEFAULT_PASSWORD') ??
    randomUUID()
  );
}

async function ensureUser(
  users: Repository<User>,
  input: { email: string; password: string; role: UserRole },
) {
  const existing = await users.findOne({ where: { email: input.email } });
  if (existing) {
    console.log(`User ${input.email} already exists`);
    return existing;
  }

  const user = await users.save(
    users.create({
      email: input.email,
      role: input.role,
      isActive: true,
      passwordHash: await bcrypt.hash(input.password, 12),
    }),
  );
  console.log(`Created user ${input.email}`);
  return user;
}

async function ensureDoctor(
  doctors: Repository<DoctorProfile>,
  user: User,
  input: Omit<Partial<DoctorProfile>, 'user' | 'userId'> & {
    firstName: string;
    lastName: string;
    phone: string;
    fiscalNumber: string;
  },
) {
  const existing = await doctors.findOne({ where: { userId: user.id } });
  if (existing) return existing;
  return doctors.save(
    doctors.create({
      ...input,
      email: user.email,
      userId: user.id,
      status: DoctorStatus.Active,
    }),
  );
}

async function seedPatients(
  patients: Repository<Patient>,
) {
  const rows: Array<Partial<Patient> & { internalCode: string }> = [
    {
      internalCode: 'P-1042',
      firstName: 'Eleanor',
      lastName: 'Whitfield',
      birthDate: new Date('1948-02-12'),
      gender: Gender.Female,
      phone1: '+216 20 104 200',
      profession: 'Retraitee',
      address: 'Tunis',
      weightKg: 62,
      heightCm: 161,
      allergies: ['Penicillin', 'Sulfa drugs'],
      currentMedications: [
        { name: 'Warfarin', dose: '5 mg daily' },
        { name: 'Metformin', dose: '1000 mg BID' },
      ],
      comorbidities: ['Type 2 diabetes', 'Atrial fibrillation', 'CKD stage 3'],
      renal: { gfr: 42, status: 'moderate' },
      liver: { status: 'normal' },
      vitalsSnapshot: { hr: 78, bp: '138/82', temp: 36.8, spo2: 96 },
      flags: ['Elderly', 'Polypharmacy', 'Renal impairment'],
    },
    {
      internalCode: 'P-1043',
      firstName: 'Marcus',
      lastName: 'Tanaka',
      birthDate: new Date('1972-05-01'),
      gender: Gender.Male,
      phone1: '+216 20 104 300',
      profession: 'Ingenieur',
      address: 'Ariana',
      weightKg: 88,
      heightCm: 178,
      allergies: [],
      currentMedications: [{ name: 'Amlodipine', dose: '5 mg daily' }],
      comorbidities: ['Hypertension', 'Hyperlipidemia'],
      renal: { gfr: 88, status: 'normal' },
      liver: { status: 'normal' },
      vitalsSnapshot: { hr: 72, bp: '128/78', temp: 36.6, spo2: 98 },
      flags: [],
    },
    {
      internalCode: 'P-1044',
      firstName: 'Aisha',
      lastName: 'Okonkwo',
      birthDate: new Date('1994-09-20'),
      gender: Gender.Female,
      phone1: '+216 20 104 400',
      profession: 'Enseignante',
      address: 'Sfax',
      weightKg: 68,
      heightCm: 167,
      allergies: ['Latex'],
      currentMedications: [{ name: 'Levothyroxine', dose: '75 mcg daily' }],
      comorbidities: ['Hypothyroidism'],
      renal: { gfr: 102, status: 'normal' },
      liver: { status: 'normal' },
      vitalsSnapshot: { hr: 84, bp: '118/74', temp: 37.1, spo2: 99 },
      flags: ['Pregnancy T2'],
      missingData: ['Recent TSH'],
    },
  ];

  for (const row of rows) {
    const existing = await patients.findOne({
      where: { internalCode: row.internalCode },
    });
    if (existing) continue;
    await patients.save(patients.create(row));
    console.log(`Created patient ${row.internalCode}`);
  }
}

async function seedMedicines(
  medicines: Repository<Medicine>,
) {
  const rows: Array<Partial<Medicine> & { dci: string }> = [
    {
      dci: 'Amoxicilline acide clavulanique',
      brands: ['Augmentin'],
      atcCode: 'J01CR02',
      drugClass: 'Antibiotique beta-lactamine',
      forms: ['Comprime', 'Suspension buvable'],
      laboratories: ['GSK'],
      reimbursement: ReimbursementRate.High,
      indication: 'Infections bacteriennes sensibles',
      contraindications: ['Allergie aux penicillines'],
      posologyAdult: '875/125 mg deux fois par jour selon indication.',
      pregnancy: PregnancyStatus.Precaution,
      renalAdjust: true,
      hepaticAdjust: false,
      priceTndApprox: 18,
    },
    {
      dci: 'Azithromycine',
      brands: ['Zithromax'],
      atcCode: 'J01FA10',
      drugClass: 'Macrolide',
      forms: ['Comprime', 'Suspension buvable'],
      laboratories: ['Pfizer'],
      reimbursement: ReimbursementRate.Partial,
      indication: 'Infections respiratoires et ORL sensibles',
      contraindications: ['Hypersensibilite aux macrolides'],
      posologyAdult: '500 mg une fois par jour selon indication.',
      pregnancy: PregnancyStatus.Precaution,
      renalAdjust: false,
      hepaticAdjust: true,
      priceTndApprox: 22,
    },
  ];

  for (const row of rows) {
    const existing = await medicines.findOne({ where: { dci: row.dci } });
    if (existing) continue;
    await medicines.save(medicines.create(row));
    console.log(`Created medicine ${row.dci}`);
  }
}

async function seedInteractions(
  interactions: Repository<InteractionResult>,
) {
  const rows: Array<Partial<InteractionResult> & { drugA: string; drugB: string }> = [
    {
      drugA: 'Warfarin',
      drugB: 'Amoxicilline acide clavulanique',
      severity: AlertSeverity.Critical,
      mechanism: 'Modification de la flore intestinale et risque d augmentation de l INR.',
      consequence: 'Risque hemorragique majeur.',
      action: 'Eviter si possible ou controler INR rapidement avec adaptation posologique.',
      evidence: 'Base interaction locale CDSS',
    },
    {
      drugA: 'Azithromycine',
      drugB: 'Metoprolol',
      severity: AlertSeverity.Minor,
      mechanism: 'Risque faible d effet additif sur la conduction cardiaque.',
      consequence: 'Bradycardie ou trouble du rythme peu probable mais possible chez patient fragile.',
      action: 'Surveillance clinique si facteurs de risque.',
      evidence: 'Base interaction locale CDSS',
    },
  ];

  for (const row of rows) {
    const existing = await interactions.findOne({
      where: { drugA: row.drugA, drugB: row.drugB },
    });
    if (existing) continue;
    await interactions.save(interactions.create(row));
    console.log(`Created interaction ${row.drugA} / ${row.drugB}`);
  }
}

async function seedCms(
  posts: Repository<Post>,
  testimonials: Repository<Testimonial>,
  partners: Repository<Partner>,
  specialties: Repository<Specialty>,
  whyFeatures: Repository<WhyFeature>,
) {
  const postRows: Array<Partial<Post> & { slug: string }> = [
    {
      title: 'Aide a la prescription: securiser les decisions cliniques',
      slug: 'aide-prescription-securiser-decisions-cliniques',
      excerpt:
        'Comment un CDSS peut aider les medecins a verifier les risques medicamenteux avant validation.',
      content:
        'Le systeme CDSS MedCity centralise les donnees patient, les traitements en cours et les interactions afin de fournir une aide a la prescription plus structuree.',
      category: 'Sante Numerique',
      tags: ['cdss', 'prescription', 'securite'],
      author: 'MedCity',
      imageUrl:
        'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&q=80',
      coverColor: 'from-cyan-500 to-blue-600',
      status: CmsStatus.Published,
      featured: true,
      publishedAt: new Date(),
      views: 0,
      readTime: 3,
      commentsCount: 0,
      metaTitle: 'Aide a la prescription | MedCity',
      metaDescription:
        'Aide a la prescription et verification des interactions medicamenteuses.',
    },
    {
      title: 'Interactions medicamenteuses: points de vigilance',
      slug: 'interactions-medicamenteuses-points-vigilance',
      excerpt:
        'Les interactions doivent etre interpretees avec le contexte clinique du patient.',
      content:
        'Age, insuffisance renale, grossesse, allergies et polymedication modifient le niveau de risque reel associe aux interactions.',
      category: 'Medicaments',
      tags: ['interactions', 'medicaments', 'risque'],
      author: 'Equipe clinique MedCity',
      imageUrl:
        'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200&q=80',
      coverColor: 'from-emerald-500 to-teal-600',
      status: CmsStatus.Published,
      featured: false,
      publishedAt: new Date(),
      views: 0,
      readTime: 4,
      commentsCount: 0,
      metaTitle: 'Interactions medicamenteuses | MedCity',
      metaDescription:
        'Points de vigilance sur les interactions medicamenteuses.',
    },
  ];

  for (const row of postRows) {
    const existing = await posts.findOne({ where: { slug: row.slug } });
    if (!existing) {
      await posts.save(posts.create(row));
      console.log(`Created CMS post ${row.slug}`);
    }
  }

  const testimonialRows: Array<Partial<Testimonial> & { name: string }> = [
    {
      name: 'Dr. Ahmed Ben Ali',
      role: 'Cardiologue',
      text: 'La validation des prescriptions est plus claire et plus rapide.',
      rating: 5,
      active: true,
    },
    {
      name: 'Dr. Rania Zouari',
      role: 'Endocrinologue',
      text: 'Les alertes contextualisees aident a mieux prioriser les risques.',
      rating: 5,
      active: true,
    },
  ];

  for (const row of testimonialRows) {
    const existing = await testimonials.findOne({ where: { name: row.name } });
    if (!existing) {
      await testimonials.save(testimonials.create(row));
      console.log(`Created CMS testimonial ${row.name}`);
    }
  }

  const partnerRows: Array<Partial<Partner> & { name: string }> = [
    {
      name: 'Pharmacie Centrale de Tunisie',
      logoUrl: '',
      websiteUrl: 'https://pct.tn',
      description: 'Referencement et distribution du medicament en Tunisie.',
      active: true,
    },
    {
      name: 'Pharmaghreb',
      logoUrl:
        'https://medcity.tn/wp-content/uploads/2025/04/Pharmaghreb-e1745837900416-1024x300.webp',
      websiteUrl: 'https://pharmaghreb.com',
      description: 'Partenaire pharmaceutique regional.',
      active: true,
    },
  ];

  for (const row of partnerRows) {
    const existing = await partners.findOne({ where: { name: row.name } });
    if (!existing) {
      await partners.save(partners.create(row));
      console.log(`Created CMS partner ${row.name}`);
    }
  }

  const specialtyRows: Array<Partial<Specialty> & { name: string }> = [
    {
      name: 'Cardiologie',
      description: 'Suivi cardiovasculaire, hypertension et traitements a risque.',
      iconName: 'Heart',
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      query: 'cardiology cardiovascular',
      active: true,
    },
    {
      name: 'Endocrinologie',
      description: 'Diabete, thyroide et maladies metaboliques.',
      iconName: 'Activity',
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      query: 'endocrinology diabetes',
      active: true,
    },
    {
      name: 'Pneumologie',
      description: 'Pathologies respiratoires et suivi des traitements inhalés.',
      iconName: 'Wind',
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      query: 'pneumology respiratory',
      active: true,
    },
  ];

  for (const row of specialtyRows) {
    const existing = await specialties.findOne({ where: { name: row.name } });
    if (!existing) {
      await specialties.save(specialties.create(row));
      console.log(`Created CMS specialty ${row.name}`);
    }
  }

  const featureRows: Array<Partial<WhyFeature> & { title: string }> = [
    {
      iconName: 'ShieldCheck',
      gradient: 'from-emerald-600 to-teal-500',
      title: 'Securite de prescription',
      text: 'Analyse des interactions, allergies et facteurs patient avant validation.',
      active: true,
    },
    {
      iconName: 'Network',
      gradient: 'from-blue-600 to-cyan-500',
      title: 'Coordination medecin-patient',
      text: 'Partage structure des ordonnances et suivi des decisions cliniques.',
      active: true,
    },
    {
      iconName: 'Brain',
      gradient: 'from-violet-600 to-indigo-500',
      title: 'Aide IA contextualisee',
      text: 'Suggestions basees sur le contexte clinique et les donnees medicamenteuses.',
      active: true,
    },
  ];

  for (const row of featureRows) {
    const existing = await whyFeatures.findOne({ where: { title: row.title } });
    if (!existing) {
      await whyFeatures.save(whyFeatures.create(row));
      console.log(`Created CMS feature ${row.title}`);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
