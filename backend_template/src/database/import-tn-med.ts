import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sqlite3 from 'sqlite3';
import { DataSource, DataSourceOptions } from 'typeorm';
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
import {
  PregnancyStatus,
  ReimbursementRate,
} from '../common/entities/enums';
import { ConsultationVitals } from '../consultations/consultation-vitals.entity';
import { Consultation } from '../consultations/consultation.entity';
import { DoctorProfile } from '../doctors/doctor-profile.entity';
import { InteractionResult } from '../interactions/interaction-result.entity';
import { MedicineContribution } from '../medicine-contributions/medicine-contribution.entity';
import { Medicine } from '../medicines/medicine.entity';
import { Patient } from '../patients/patient.entity';
import { PharmacyDispatch } from '../pharmacy/pharmacy-dispatch.entity';
import { PrescriptionMedication } from '../prescriptions/prescription-medication.entity';
import { PrescriptionPrintSnapshot } from '../prescriptions/prescription-print-snapshot.entity';
import { Prescription } from '../prescriptions/prescription.entity';
import { SafetyAlert } from '../prescriptions/safety-alert.entity';
import { User } from '../users/user.entity';

loadEnv();

type SqliteRow = Record<string, string | number | null | undefined>;

type PriceInfo = {
  publicPrice?: number;
  referenceTariff?: number;
  reimbursementRate?: number;
  category?: string;
};

type SafetyInfo = {
  renalAdjust: boolean;
  hepaticAdjust: boolean;
  pregnancy: PregnancyStatus;
  contraindications: string[];
  posologyAdult?: string;
};

async function run() {
  const sqlitePath = resolve(
    process.env.TN_MED_SQLITE_PATH ??
      './data/tn-med-db-v1/database/TN_Med.db',
  );
  const importLimit = numberFrom(process.env.TN_MED_IMPORT_LIMIT);

  const sqlite = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY);
  const dataSource = new DataSource(dataSourceOptions());

  try {
    await dataSource.initialize();
    const medicines = dataSource.getRepository(Medicine);
    const existingRows = await medicines.find();
    const existingBySourceId = new Map(
      existingRows
        .filter((medicine) => medicine.sourceMedicineId)
        .map((medicine) => [medicine.sourceMedicineId as string, medicine]),
    );
    const existingByAmm = new Map(
      existingRows
        .filter((medicine) => medicine.amm)
        .map((medicine) => [medicine.amm as string, medicine]),
    );

    const [rows, priceByMedicineId, safetyByAmm] = await Promise.all([
      all<SqliteRow>(
        sqlite,
        `SELECT * FROM medicaments ORDER BY CAST(id_medicament AS INTEGER)${
          importLimit ? ' LIMIT ?' : ''
        }`,
        importLimit ? [importLimit] : [],
      ),
      loadPriceInfo(sqlite),
      loadSafetyInfo(sqlite),
    ]);

    let created = 0;
    let updated = 0;
    const batch: Medicine[] = [];

    for (const row of rows) {
      const sourceMedicineId = text(row.id_medicament);
      const amm = text(row.amm);
      const entity =
        (sourceMedicineId && existingBySourceId.get(sourceMedicineId)) ||
        (amm && existingByAmm.get(amm)) ||
        medicines.create();

      if (!entity.id) {
        created += 1;
      } else {
        updated += 1;
      }

      Object.assign(
        entity,
        mapTnMedRow(row, priceByMedicineId.get(sourceMedicineId), safetyByAmm.get(amm)),
      );
      batch.push(entity);

      if (batch.length >= 250) {
        await medicines.save(batch.splice(0, batch.length));
      }
    }

    if (batch.length > 0) {
      await medicines.save(batch);
    }

    console.log(
      `TN Med import OK: rows=${rows.length}, created=${created}, updated=${updated}, sqlite=${sqlitePath}`,
    );
  } finally {
    await dataSource.destroy().catch(() => undefined);
    sqlite.close();
  }
}

function dataSourceOptions(): DataSourceOptions {
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

  if (databaseType === 'postgres') {
    return {
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
    };
  }

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
}

async function loadPriceInfo(sqlite: sqlite3.Database) {
  const rows = await all<SqliteRow>(
    sqlite,
    `SELECT
      id_medicament,
      MAX(prix_public_numerique) AS public_price,
      MAX(tarif_reference_numerique) AS reference_tariff,
      MAX(taux_remboursement_numerique) AS reimbursement_rate,
      MAX(categorie) AS category
    FROM prix_remboursement
    WHERE id_medicament IS NOT NULL AND id_medicament != ''
    GROUP BY id_medicament`,
  );
  const map = new Map<string, PriceInfo>();
  for (const row of rows) {
    const id = text(row.id_medicament);
    if (!id) continue;
    map.set(id, {
      publicPrice: numberFrom(row.public_price),
      referenceTariff: numberFrom(row.reference_tariff),
      reimbursementRate: numberFrom(row.reimbursement_rate),
      category: text(row.category),
    });
  }
  return map;
}

async function loadSafetyInfo(sqlite: sqlite3.Database) {
  const [posologyRows, contraindicationRows, safetyRows] = await Promise.all([
    all<SqliteRow>(
      sqlite,
      `SELECT amm, recommandation
       FROM regles_posologie
       WHERE amm IS NOT NULL AND amm != '' AND recommandation IS NOT NULL AND recommandation != ''`,
    ),
    all<SqliteRow>(
      sqlite,
      `SELECT amm, condition_ou_facteur, action_recommandee, recommandation
       FROM regles_contre_indications
       WHERE amm IS NOT NULL AND amm != ''`,
    ),
    all<SqliteRow>(
      sqlite,
      `SELECT amm, population, condition_ou_facteur, action_recommandee, recommandation
       FROM regles_securite
       WHERE amm IS NOT NULL AND amm != ''
       UNION ALL
       SELECT amm, population, condition_ou_facteur, action_recommandee, recommandation
       FROM regles_populations_speciales
       WHERE amm IS NOT NULL AND amm != ''`,
    ),
  ]);

  const map = new Map<string, SafetyInfo>();
  const ensure = (amm: string) => {
    let info = map.get(amm);
    if (!info) {
      info = {
        renalAdjust: false,
        hepaticAdjust: false,
        pregnancy: PregnancyStatus.Authorized,
        contraindications: [],
      };
      map.set(amm, info);
    }
    return info;
  };

  for (const row of posologyRows) {
    const amm = text(row.amm);
    const recommendation = compact(text(row.recommandation), 500);
    if (!amm || !recommendation) continue;
    const info = ensure(amm);
    if (!info.posologyAdult) info.posologyAdult = recommendation;
  }

  for (const row of contraindicationRows) {
    const amm = text(row.amm);
    if (!amm) continue;
    const label =
      text(row.condition_ou_facteur) ||
      compact(text(row.recommandation), 160) ||
      text(row.action_recommandee);
    if (!label) continue;
    const info = ensure(amm);
    if (!info.contraindications.includes(label)) {
      info.contraindications.push(label);
    }
  }

  for (const row of safetyRows) {
    const amm = text(row.amm);
    if (!amm) continue;
    const haystack = [
      row.population,
      row.condition_ou_facteur,
      row.action_recommandee,
      row.recommandation,
    ]
      .map((value) => text(value).toLowerCase())
      .join(' ');
    const info = ensure(amm);
    if (haystack.includes('rénal') || haystack.includes('renal')) {
      info.renalAdjust = true;
    }
    if (haystack.includes('hépat') || haystack.includes('hepat')) {
      info.hepaticAdjust = true;
    }
    if (haystack.includes('grossesse')) {
      info.pregnancy = haystack.includes('contre')
        ? PregnancyStatus.Contraindicated
        : PregnancyStatus.Precaution;
    }
  }

  for (const info of map.values()) {
    info.contraindications = info.contraindications.slice(0, 6);
  }

  return map;
}

function mapTnMedRow(
  row: SqliteRow,
  priceInfo?: PriceInfo,
  safetyInfo?: SafetyInfo,
): Partial<Medicine> {
  const sourceMedicineId = text(row.id_medicament);
  const localProductName = text(row.nom_medicament);
  const dci = text(row.dci_raw) || localProductName || `TN_MED_${sourceMedicineId}`;
  const form = text(row.forme);
  const dosage = text(row.dosage);
  const presentation = text(row.presentation);
  const publicPriceMinTnd =
    numberFrom(row.prix_public_min_tnd) ?? priceInfo?.publicPrice;
  const publicPriceMaxTnd =
    numberFrom(row.prix_public_max_tnd) ?? priceInfo?.publicPrice;
  const referenceTariffTnd =
    numberFrom(row.tarif_reference_max_tnd) ?? priceInfo?.referenceTariff;
  const reimbursementRatePercent = priceInfo?.reimbursementRate;
  const reimbursementCategory =
    text(row.categorie_remboursement) || priceInfo?.category;
  const pregnancy = safetyInfo?.pregnancy ?? PregnancyStatus.Precaution;

  return {
    sourceMedicineId,
    sourceKey: text(row.cle_medicament),
    localProductName,
    dci,
    brands: unique([localProductName].filter(Boolean)),
    atcCode: '',
    drugClass: text(row.classe_therapeutique) || 'Non classe',
    therapeuticSubclass: text(row.sous_classe_therapeutique),
    forms: unique([formatForm(dosage, form, presentation)].filter(Boolean)),
    laboratories: unique([text(row.laboratoire)].filter(Boolean)),
    dosage,
    form,
    presentation,
    amm: text(row.amm),
    ammDate: text(row.date_amm),
    genericStatus: text(row.statut_gp),
    tableau: text(row.tableau),
    veicStatus: text(row.veic_status),
    conservationDurationMonths: text(row.duree_conservation),
    primaryPackaging: text(row.conditionnement_primaire),
    packagingSpecification: text(row.specification_conditionnement),
    reimbursement: inferReimbursement(
      reimbursementRatePercent,
      reimbursementCategory,
    ),
    reimbursementCategory,
    reimbursementRatePercent,
    referenceTariffTnd,
    publicPriceMinTnd,
    publicPriceMaxTnd,
    indication:
      cleanClinicalText(text(row.indications_raw)) ||
      'Indication source non renseignee dans TN Med.',
    contraindications: safetyInfo?.contraindications ?? [],
    posologyAdult:
      safetyInfo?.posologyAdult ?? 'Posologie a verifier dans le RCP local.',
    pregnancy,
    renalAdjust: safetyInfo?.renalAdjust ?? false,
    hepaticAdjust: safetyInfo?.hepaticAdjust ?? false,
    priceTndApprox: averagePrice(publicPriceMinTnd, publicPriceMaxTnd),
    detailUrl: text(row.detail_url),
    rcpUrl: text(row.rcp_url),
    noticeUrl: text(row.notice_url),
    sourceReference: text(row.source_reference),
    sourceSystems: splitSources(text(row.sources_presentes)),
  };
}

function all<T extends SqliteRow>(
  database: sqlite3.Database,
  sql: string,
  params: Array<string | number> = [],
) {
  return new Promise<T[]>((resolvePromise, reject) => {
    database.all(sql, params, (error, rows: T[]) => {
      if (error) reject(error);
      else resolvePromise(rows);
    });
  });
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function numberFrom(value: unknown) {
  const normalized = text(value).replace(',', '.');
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function splitSources(value: string) {
  return unique(value.split(';'));
}

function formatForm(dosage: string, form: string, presentation: string) {
  return [dosage, form, presentation].filter(Boolean).join(' - ');
}

function averagePrice(min?: number, max?: number) {
  if (min !== undefined && max !== undefined) return (min + max) / 2;
  return min ?? max;
}

function inferReimbursement(rate?: number, category?: string) {
  if (rate !== undefined) {
    if (rate >= 95) return ReimbursementRate.Full;
    if (rate >= 70) return ReimbursementRate.High;
    if (rate > 0) return ReimbursementRate.Partial;
  }
  return category ? ReimbursementRate.Partial : ReimbursementRate.None;
}

function cleanClinicalText(value: string) {
  return [...value]
    .map((character) => (character.charCodeAt(0) < 32 ? ' ' : character))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value: string, maxLength: number) {
  const cleaned = cleanClinicalText(value);
  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength - 3)}...`
    : cleaned;
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
