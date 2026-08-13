import { Patient } from './patient.entity';

export const PATIENT_FLAG_POLICY = {
  elderlyAgeYears: 65,
  polypharmacyMedicationCount: 5,
  renalImpairmentGfr: 60,
} as const;

const DERIVED_FLAG_KEYS = new Set([
  'elderly',
  'polypharmacy',
  'renal impairment',
]);

/**
 * Computes risk labels from the current patient record. These values are
 * response-level data and are intentionally not persisted in `flags`.
 */
export function derivePatientFlags(patient: Pick<
  Patient,
  'birthDate' | 'currentMedications' | 'renal' | 'gender' | 'pregnancyStatus' | 'pregnancyTrimester'
>) {
  const computedFlags: string[] = [];
  const age = calculatePatientAge(patient.birthDate);
  const medicationCount = (patient.currentMedications ?? [])
    .filter((medication) => medication?.name?.trim()).length;
  const gfr = patient.renal?.gfr;
  const renalStatus = patient.renal?.status?.trim().toLocaleLowerCase();

  if (age !== undefined && age >= PATIENT_FLAG_POLICY.elderlyAgeYears) {
    computedFlags.push('Elderly');
  }
  if (medicationCount >= PATIENT_FLAG_POLICY.polypharmacyMedicationCount) {
    computedFlags.push('Polypharmacy');
  }
  if (
    (renalStatus && renalStatus !== 'normal') ||
    (typeof gfr === 'number' && Number.isFinite(gfr) && gfr < PATIENT_FLAG_POLICY.renalImpairmentGfr)
  ) {
    computedFlags.push('Renal impairment');
  }

  if (
    patient.gender?.toLocaleLowerCase() === 'female' &&
    patient.pregnancyStatus === 'pregnant' &&
    [1, 2, 3].includes(Number(patient.pregnancyTrimester))
  ) {
    computedFlags.push(`Pregnancy T${patient.pregnancyTrimester}`);
  }

  return computedFlags;
}

/**
 * Keeps manually curated labels while removing legacy copies of labels that
 * are now derived. This prevents stale seed values from reappearing.
 */
export function buildPatientFlags(patient: Pick<
  Patient,
  'flags' | 'birthDate' | 'currentMedications' | 'renal' | 'gender' | 'pregnancyStatus' | 'pregnancyTrimester'
>) {
  const manualFlags = uniqueFlags(
    (patient.flags ?? []).filter((flag) => !isDerivedFlag(flag)),
  );
  const computedFlags = derivePatientFlags(patient);

  return {
    flags: uniqueFlags([...manualFlags, ...computedFlags]),
    computedFlags,
  };
}

function isDerivedFlag(flag: string) {
  const normalized = flag.trim().toLocaleLowerCase();
  return DERIVED_FLAG_KEYS.has(normalized) || /^pregnancy\s*\(?t[123]\)?$/.test(normalized);
}

function calculatePatientAge(birthDate?: Date | string) {
  if (!birthDate) return undefined;
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return undefined;

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : undefined;
}

function uniqueFlags(flags: string[]) {
  return [...new Set(flags.map((flag) => flag.trim()).filter(Boolean))];
}
