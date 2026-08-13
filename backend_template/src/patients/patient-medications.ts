export type PatientMedication = {
  name: string;
  dci?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  startedAt?: string;
  endsAt?: string;
  prescriptionId?: string;
  medicineId?: string;
};

type PrescriptionMedicationLine = {
  id?: string;
  medicineId?: string;
  medicineName?: string;
  dci?: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  duration?: string;
};

export function parseDurationToDays(duration?: string): number | undefined {
  const normalized = normalizeText(duration);
  if (!normalized) return undefined;

  const match = normalized.match(
    /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(jour|jours|j|day|days|d|semaine|semaines|week|weeks|w|mois|month|months)(?:\s|$)/,
  );
  if (!match) return undefined;

  const amount = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const unit = match[2];
  if (['semaine', 'semaines', 'week', 'weeks', 'w'].includes(unit)) {
    return Math.ceil(amount * 7);
  }
  if (['mois', 'month', 'months'].includes(unit)) {
    return Math.ceil(amount * 30);
  }
  return Math.ceil(amount);
}

export function calculateMedicationEndAt(
  startedAt: Date,
  duration?: string,
): string | undefined {
  const days = parseDurationToDays(duration);
  if (!days) return undefined;
  return new Date(startedAt.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function pruneExpiredPatientMedications(
  medications: PatientMedication[] | undefined,
  now = new Date(),
) {
  const current = Array.isArray(medications) ? medications : [];
  const active = current.filter((medication) => !isExpired(medication.endsAt, now));
  return {
    medications: active,
    changed: active.length !== current.length,
  };
}

export function reconcileValidatedPrescription(
  existingMedications: PatientMedication[] | undefined,
  prescriptionId: string,
  lines: PrescriptionMedicationLine[],
  startedAt = new Date(),
) {
  const { medications: active } = pruneExpiredPatientMedications(
    existingMedications,
    startedAt,
  );
  const reconciled = new Map<string, PatientMedication>();

  for (const medication of active) {
    const key = medicationKey(medication.medicineId, medication.name);
    if (key) reconciled.set(key, medication);
  }

  for (const line of lines) {
    const name = line.medicineName?.trim();
    if (!name) continue;
    const medication: PatientMedication = {
      name,
      dci: line.dci?.trim() || undefined,
      dose: line.dosage?.trim() || undefined,
      route: line.route?.trim() || undefined,
      frequency: line.frequency?.trim() || undefined,
      duration: line.duration?.trim() || undefined,
      startedAt: startedAt.toISOString(),
      endsAt: calculateMedicationEndAt(startedAt, line.duration),
      prescriptionId,
      medicineId: line.medicineId,
    };
    const key = medicationKey(medication.medicineId, medication.name);
    if (key) {
      for (const [existingKey, existing] of reconciled) {
        if (sameMedication(existing, medication)) {
          reconciled.delete(existingKey);
        }
      }
      reconciled.set(key, medication);
    }
  }

  return Array.from(reconciled.values());
}

function medicationKey(medicineId: string | undefined, name: string | undefined) {
  if (medicineId?.trim()) return `id:${medicineId.trim().toLowerCase()}`;
  const normalizedName = normalizeText(name).replace(/[^a-z0-9]+/g, '');
  return normalizedName ? `name:${normalizedName}` : undefined;
}

function sameMedication(left: PatientMedication, right: PatientMedication) {
  if (
    left.medicineId &&
    right.medicineId &&
    left.medicineId.toLowerCase() === right.medicineId.toLowerCase()
  ) {
    return true;
  }
  const leftDci = normalizeText(left.dci);
  const rightDci = normalizeText(right.dci);
  if (leftDci && rightDci && leftDci === rightDci) return true;
  return normalizeText(left.name) === normalizeText(right.name);
}

function isExpired(endsAt: string | undefined, now: Date) {
  if (!endsAt) return false;
  const end = new Date(endsAt);
  return !Number.isNaN(end.getTime()) && end.getTime() <= now.getTime();
}

function normalizeText(value?: string) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
