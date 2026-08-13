import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type FirebaseMedicament = {
  id: string;
  idMedicament?: string;
  nomMedicament?: string;
  dciRaw?: string;
  dosage?: string;
  forme?: string;
  presentation?: string;
  laboratoire?: string;
  pays?: string;
  amm?: string;
  classeTherapeutique?: string;
  sousClasseTherapeutique?: string;
  cleMedicament?: string;
  dateAmm?: string;
  statutGp?: string;
  tableau?: string;
  veicStatus?: string;
  dureeConservation?: string;
  conditionnementPrimaire?: string;
  specificationConditionnement?: string;
  indicationsRaw?: string;
  detailUrl?: string;
  rcpUrl?: string;
  noticeUrl?: string;
  prixPublicMinTnd?: string;
  prixPublicMaxTnd?: string;
  tarifReferenceMinTnd?: string;
  tarifReferenceMaxTnd?: string;
  categorieRemboursement?: string;
  sourceReference?: string;
  sourcesPresentes?: string;
};

export type FirebaseClinicalRule = {
  population?: string;
  voieAdministration?: string;
  valeurDose?: string;
  uniteDose?: string;
  frequence?: string;
  duree?: string;
  conditionOuFacteur?: string;
  gravite?: string;
  actionRecommandee?: string;
  recommandation?: string;
  niveauAutorite?: string;
  niveauQualite?: string;
  accepteUsageClinique?: string;
  sourceSystem?: string;
  citationPreuve?: string;
  mecanisme?: string;
  effetClinique?: string;
  medicamentOuSubstanceCible?: string;
  statutRevision?: string;
};

export type FirebaseRawEvidence = {
  titreSection?: string;
  textePreuve?: string;
  langue?: string;
  sourceSystem?: string;
  sourceFile?: string;
  niveauAutorite?: string;
  confiance?: string;
  rangPreuve?: string;
  niveauQualite?: string;
  accepteUsageClinique?: string;
  statutRevision?: string;
};

export type FirebaseMedicineMedicalDetails = {
  medicaments: FirebaseMedicament[];
  classifications: Array<{
    classeTherapeutique?: string;
    sousClasseTherapeutique?: string;
    sourceClassification?: string;
  }>;
  substances: Array<{ dciSource?: string; ordreSubstance?: string }>;
  indications: Array<{
    indicationsRaw?: string;
    typeIndication?: string;
    statutValidation?: string;
  }>;
  documents: Array<{
    detailUrl?: string;
    rcpUrl?: string;
    noticeUrl?: string;
  }>;
  prices: Array<{
    sourceName?: string;
    prixNumerique?: string;
    prixPublicNumerique?: string;
    tarifReferenceNumerique?: string;
    rembourse?: string;
    rembourseNumerique?: string;
    tauxRemboursementNumerique?: string;
    categorie?: string;
  }>;
  posologies: FirebaseClinicalRule[];
  contraindications: FirebaseClinicalRule[];
  adverseEffects: FirebaseClinicalRule[];
  interactions: FirebaseClinicalRule[];
  safetyRules: FirebaseClinicalRule[];
  specialPopulations: FirebaseClinicalRule[];
  overdoseEvidence: FirebaseRawEvidence[];
};

type FirebaseQueryResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

@Injectable()
export class FirebaseMedicinesCatalog {
  private cachedMedicines?: FirebaseMedicament[];
  private cacheExpiresAt = 0;

  constructor(private readonly config: ConfigService) {}

  enabled() {
    return this.config.get<string>('MEDICINE_CATALOG_SOURCE', 'firebase') === 'firebase';
  }

  async list(): Promise<FirebaseMedicament[]> {
    if (this.cachedMedicines && Date.now() < this.cacheExpiresAt) {
      return this.cachedMedicines;
    }

    const result = await this.execute<{ medicaments: FirebaseMedicament[] }>(
      'ListMedicaments',
      {
        // ConfigModule reads values from .env as strings. Firebase Data
        // Connect validates this variable against the GraphQL Int type, so
        // normalize it before serializing the request body.
        limit: readIntegerConfig(this.config, 'FIREBASE_MEDICINES_FETCH_LIMIT', 6093, 1),
      },
    );
    this.cachedMedicines = result.medicaments ?? [];
    this.cacheExpiresAt =
      Date.now() +
      readIntegerConfig(this.config, 'FIREBASE_MEDICINES_CACHE_TTL_MS', 300_000, 0);
    return this.cachedMedicines;
  }

  async get(id: string): Promise<FirebaseMedicament | undefined> {
    const result = await this.execute<{ medicament?: FirebaseMedicament }>(
      'GetMedicament',
      { id: normalizeFirebaseUuid(id) },
    );
    return result.medicament;
  }

  async getMedicalDetails(idMedicament: string, amm: string) {
    return this.execute<FirebaseMedicineMedicalDetails>(
      'GetMedicamentMedicalDetails',
      { idMedicament, amm },
    );
  }

  private async execute<T>(operationName: string, variables: Record<string, unknown>) {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID', 'test-5d752');
    const location = this.config.get<string>('FIREBASE_DATACONNECT_LOCATION', 'us-east4');
    const service = this.config.get<string>(
      'FIREBASE_DATACONNECT_SERVICE',
      'test-5d752-service',
    );
    const connector = this.config.get<string>(
      'FIREBASE_DATACONNECT_CONNECTOR',
      'tn-med-connector',
    );
    const apiKey = this.config.get<string>(
      'FIREBASE_API_KEY',
      'AIzaSyC-VQrD3RPiZyqCLqweGk86ptPAGWzB-qU',
    );
    const appId = this.config.get<string>(
      'FIREBASE_APP_ID',
      '1:1049284848818:web:2818c155ad602bf1882dab',
    );
    const timeoutMs = readIntegerConfig(
      this.config,
      'FIREBASE_DATACONNECT_TIMEOUT_MS',
      15_000,
      1,
    );

    if (!apiKey || !appId) {
      throw new ServiceUnavailableException(
        'Firebase medicine catalogue is enabled but FIREBASE_API_KEY/FIREBASE_APP_ID are missing',
      );
    }

    const resource = `projects/${projectId}/locations/${location}/services/${service}/connectors/${connector}`;
    const url = `https://firebasedataconnect.googleapis.com/v1/${resource}:executeQuery?key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-firebase-gmpid': appId,
          'X-Goog-Api-Client': 'gl-js/ fire/medcity-backend',
        },
        body: JSON.stringify({ name: resource, operationName, variables }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as FirebaseQueryResponse<T>;
      if (!response.ok || payload.errors?.length || !payload.data) {
        const detail = payload.errors?.map((error) => error.message).filter(Boolean).join('; ');
        throw new Error(detail || `Firebase Data Connect returned HTTP ${response.status}`);
      }
      return payload.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(`Firebase medicine catalogue unavailable: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function readIntegerConfig(
  config: ConfigService,
  key: string,
  fallback: number,
  minimum: number,
) {
  const raw = config.get<unknown>(key);
  const value = typeof raw === 'number' ? raw : Number(raw);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(minimum, Math.trunc(value));
}

function normalizeFirebaseUuid(value: string) {
  const compact = value.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(compact)) return value;
  return [compact.slice(0, 8), compact.slice(8, 12), compact.slice(12, 16), compact.slice(16, 20), compact.slice(20)].join('-');
}
