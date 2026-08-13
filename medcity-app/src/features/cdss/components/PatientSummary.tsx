import type { Patient } from "@/lib/mock-data";
import { getPatientAge, getPatientFullName, getPatientGenderLabel, getPatientInitials } from "@/lib/mock-data";
import { AlertTriangle, Droplets, Pill, ShieldCheck, User } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export function PatientSummary({ patient }: { patient: Patient }) {
  const { language, t } = useI18n();
  const labels = language === "fr"
    ? { currentTreatment: "Traitement en cours", until: "jusqu'au", gfr: "DFG", renalStatus: "Statut rénal", weight: "Poids", height: "Taille", heartRate: "Fréquence cardiaque", bloodPressure: "Tension artérielle", temperature: "Température", oxygenSaturation: "Saturation O₂", note: "Note" }
    : language === "ar"
      ? { currentTreatment: "العلاج الحالي", until: "حتى", gfr: "معدل الترشيح الكبيبي", renalStatus: "حالة الكلى", weight: "الوزن", height: "الطول", heartRate: "معدل ضربات القلب", bloodPressure: "ضغط الدم", temperature: "درجة الحرارة", oxygenSaturation: "تشبع الأكسجين", note: "ملاحظة" }
      : { currentTreatment: "Current treatment", until: "until", gfr: "eGFR", renalStatus: "Renal status", weight: "Weight", height: "Height", heartRate: "Heart rate", bloodPressure: "Blood pressure", temperature: "Temperature", oxygenSaturation: "Oxygen saturation", note: "Note" };
  const formatValue = (value: string | number | undefined, suffix = "") => {
    if (value === undefined || value === null || value === "" || value === 0) return t("common.notProvided");
    return `${value}${suffix}`;
  };
  const renalStatus = formatClinicalStatusSafe(patient.renal.status, language);
  const liverStatus = formatClinicalStatusSafe(patient.liver.status, language);

  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <div className="bg-gradient-to-br from-primary-soft to-card px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
            {getPatientInitials(patient)}
          </div>
          <div>
            <div className="font-semibold text-base leading-tight">{getPatientFullName(patient)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {getPatientAge(patient)} {t("patients.ageUnit")} - {getPatientGenderLabel(patient)}
            </div>
            {patient.phone1 && <div className="mt-1 text-xs text-muted-foreground">{patient.phone1}</div>}
          </div>
        </div>
      </div>

      <div className="divide-y divide-border text-sm">
        {patient.missingData && patient.missingData.length > 0 && (
          <div className="px-5 py-3 bg-warning-soft/50 border-l-4 border-warning">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning-foreground mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-warning-foreground">{t("patientSummary.missingData")}</div>
                <ul className="mt-1 text-xs text-warning-foreground/90 list-disc list-inside">
                  {patient.missingData.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}

        <Section title={t("patientSummary.adminInfo")} icon={User}>
          <dl className="grid grid-cols-2 gap-y-2 text-xs">
            <dt className="text-muted-foreground">{t("patients.profession")}</dt>
            <dd className="font-medium">{patient.profession || t("common.notProvidedF")}</dd>
            <dt className="text-muted-foreground">{t("patients.internalCode")}</dt>
            <dd className="font-medium">{patient.internalCode || t("common.notProvided")}</dd>
            <dt className="text-muted-foreground">{t("patients.address")}</dt>
            <dd className="font-medium">{patient.address || t("common.notProvidedF")}</dd>
          </dl>
        </Section>

        {patient.flags.length > 0 && (
          <div className="px-5 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t("patientSummary.riskFlags")}</div>
            <div className="flex flex-wrap gap-1.5">
              {patient.flags.map((flag) => (
                <span key={flag} className="inline-flex items-center gap-1 rounded-full bg-warning-soft text-warning-foreground border border-warning/30 px-2 py-0.5 text-[11px] font-semibold">
                  <AlertTriangle className="h-3 w-3" /> {flag}
                </span>
              ))}
            </div>
          </div>
        )}

        <Section title={t("patientSummary.allergies")} icon={ShieldCheck} accent="critical">
          <div className="flex flex-wrap gap-1.5">
            {patient.allergies.length === 0 ? (
              <span className="text-xs text-muted-foreground">{t("patientSummary.noAllergy")}</span>
            ) : patient.allergies.map((allergy) => (
              <span key={allergy} className="inline-flex rounded-md bg-critical-soft text-critical border border-critical/30 px-2 py-0.5 text-xs font-medium">{allergy}</span>
            ))}
          </div>
        </Section>

        <Section title={t("patientSummary.currentMedications")} icon={Pill}>
          <ul className="space-y-1.5">
            {patient.currentMedications.length === 0 ? (
              <li className="text-xs text-muted-foreground">{t("patientSummary.noMedication")}</li>
            ) : patient.currentMedications.map((medication) => (
              <li key={`${medication.medicineId ?? medication.name}-${medication.prescriptionId ?? ""}`} className="flex justify-between gap-3 text-xs">
                <span className="min-w-0 font-medium">
                  <span className="block break-words">{medication.name}</span>
                  <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                    {medication.dci && <span className="block">DCI : {medication.dci}</span>}
                    {[medication.route, medication.frequency, medication.duration].filter(Boolean).join(" \u00b7 ") || labels.currentTreatment}
                    {medication.endsAt && ` \u00b7 ${labels.until} ${formatMedicationDate(medication.endsAt)}`}
                  </span>
                </span>
                <span className="shrink-0 text-right text-muted-foreground">{medication.dose || "—"}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("patientSummary.comorbidities")} icon={User}>
          <ul className="space-y-1 text-xs">
            {patient.comorbidities.length === 0 ? (
              <li className="text-muted-foreground">{t("patientSummary.noComorbidity")}</li>
            ) : patient.comorbidities.map((condition) => <li key={condition}>- {condition}</li>)}
          </ul>
        </Section>

        <Section title={t("patientSummary.renalLiver")} icon={ShieldCheck}>
          <dl className="grid grid-cols-2 gap-y-2 text-xs">
            <dt className="text-muted-foreground">{labels.gfr}</dt>
            <dd className="font-medium">{formatValue(patient.renal.gfr, " mL/min/1.73 m\u00b2")}</dd>
            <dt className="text-muted-foreground">{labels.renalStatus}</dt>
            <dd className="font-medium">{renalStatus}</dd>
            <dt className="text-muted-foreground">{t("patientSummary.liver")}</dt>
            <dd className="font-medium">{liverStatus}</dd>
            {patient.liver.note && (
              <>
                <dt className="text-muted-foreground">{labels.note}</dt>
                <dd className="font-medium">{patient.liver.note}</dd>
              </>
            )}
          </dl>
        </Section>

        <Section title={t("patientSummary.vitals")} icon={Droplets}>
          <dl className="grid grid-cols-2 gap-y-2 text-xs">
            <dt className="text-muted-foreground">{labels.weight}</dt>
            <dd className="font-medium">{formatValue(patient.weightKg, " kg")}</dd>
            <dt className="text-muted-foreground">{labels.height}</dt>
            <dd className="font-medium">{formatValue(patient.heightCm, " cm")}</dd>
            <dt className="text-muted-foreground">{labels.heartRate}</dt>
            <dd className="font-medium">{formatValue(patient.vitals.hr, " bpm")}</dd>
            <dt className="text-muted-foreground">{labels.bloodPressure}</dt>
            <dd className="font-medium">{formatValue(patient.vitals.bp)}</dd>
            <dt className="text-muted-foreground">{labels.temperature}</dt>
            <dd className="font-medium">{formatValue(patient.vitals.temp, " \u00b0C")}</dd>
            <dt className="text-muted-foreground">{labels.oxygenSaturation}</dt>
            <dd className="font-medium">{formatValue(patient.vitals.spo2, " %")}</dd>
          </dl>
        </Section>
      </div>
    </div>
  );
}

function formatMedicationDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("fr-FR");
}

function formatClinicalStatus(value: Exclude<Patient["renal"]["status"] | Patient["liver"]["status"], "unknown">, language: "fr" | "en" | "ar") {
  if (language === "fr") {
    return {
      normal: "Normal",
      mild: "Légère",
      moderate: "Modérée",
      severe: "Sévère",
      impaired: "Altérée",
    }[value];
  }
  if (language === "ar") {
    return {
      normal: "طبيعي",
      mild: "خفيفة",
      moderate: "متوسطة",
      severe: "شديدة",
      impaired: "متأثرة",
    }[value];
  }
  return {
    normal: "Normal",
    mild: "Mild",
    moderate: "Moderate",
    severe: "Severe",
    impaired: "Impaired",
  }[value];
}

function formatClinicalStatusSafe(
  value: Patient["renal"]["status"] | Patient["liver"]["status"],
  language: "fr" | "en" | "ar",
) {
  const labels: Record<string, Record<string, string>> = {
    fr: { normal: "Normal", mild: "Légère", moderate: "Modérée", severe: "Sévère", impaired: "Altérée", unknown: "Non renseigné" },
    en: { normal: "Normal", mild: "Mild", moderate: "Moderate", severe: "Severe", impaired: "Impaired", unknown: "Not provided" },
    ar: { normal: "طبيعي", mild: "خفيفة", moderate: "متوسطة", severe: "شديدة", impaired: "متأثرة", unknown: "غير معلوم" },
  };
  return labels[language][value] ?? labels[language].unknown;
}

function Section({
  title,
  icon: Icon,
  children,
  accent,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  accent?: "critical";
}) {
  return (
    <div className="px-5 py-3">
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2 ${accent === "critical" ? "text-critical" : "text-muted-foreground"}`}>
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {children}
    </div>
  );
}
