import { useEffect, useMemo, useState } from "react";
import { Save, UserPlus, X } from "lucide-react";
import type { Patient } from "@/lib/mock-data";
import { createPatient, updatePatient, type PatientPayload } from "@/lib/backend-api";
import { FormField as Field } from "@/features/cdss/components/DialogPrimitives";
import { useI18n } from "@/i18n/I18nProvider";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Patient | null;
  onSaved?: (p: Patient) => void;
}

type PatientFormState = {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: "male" | "female" | "other";
  phone1: string;
  phone2: string;
  phone3: string;
  profession: string;
  internalCode: string;
  address: string;
  allergiesText: string;
  currentMedicationsText: string;
  comorbiditiesText: string;
};

const emptyForm: PatientFormState = {
  firstName: "",
  lastName: "",
  birthDate: "",
  gender: "female",
  phone1: "",
  phone2: "",
  phone3: "",
  profession: "",
  internalCode: "",
  address: "",
  allergiesText: "",
  currentMedicationsText: "",
  comorbiditiesText: "",
};

function splitLegacyName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.slice(0, -1).join(" ") || parts[0] || "",
    lastName: parts.length > 1 ? parts.at(-1) ?? "" : "",
  };
}

function formFromPatient(patient?: Patient | null): PatientFormState {
  if (!patient) return emptyForm;
  const legacy = splitLegacyName(patient.name);
  return {
    firstName: patient.firstName ?? legacy.firstName,
    lastName: patient.lastName ?? legacy.lastName,
    birthDate: patient.birthDate ?? "",
    gender: patient.gender ?? (patient.sex === "M" ? "male" : "female"),
    phone1: patient.phone1 ?? "",
    phone2: patient.phone2 ?? "",
    phone3: patient.phone3 ?? "",
    profession: patient.profession ?? "",
    internalCode: patient.internalCode ?? "",
    address: patient.address ?? "",
    allergiesText: patient.allergies.join("\n"),
    currentMedicationsText: patient.currentMedications.map((medication) => [medication.name, medication.dose].filter(Boolean).join(" | ")).join("\n"),
    comorbiditiesText: patient.comorbidities.join("\n"),
  };
}

function parseLineList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMedicationLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...doseParts] = line.split("|").map((part) => part.trim());
      return {
        name,
        dose: doseParts.join(" | "),
      };
    })
    .filter((medication) => medication.name);
}

export function PatientFormDialog({ open, onClose, editing, onSaved }: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [form, setForm] = useState<PatientFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(formFromPatient(editing));
  }, [editing, open]);

  const title = useMemo(() => (editing ? t("patients.edit") : t("patients.add")), [editing, t]);

  if (!open) return null;

  function update<K extends keyof PatientFormState>(key: K, value: PatientFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const phone1 = form.phone1.trim();
    if (!firstName || !lastName || !form.birthDate || !phone1) return;

    const payload: PatientPayload = {
      firstName,
      lastName,
      birthDate: form.birthDate,
      gender: form.gender,
      phone1,
      phone2: form.phone2.trim() || undefined,
      phone3: form.phone3.trim() || undefined,
      profession: form.profession.trim() || undefined,
      internalCode: form.internalCode.trim() || undefined,
      address: form.address.trim() || undefined,
      allergies: parseLineList(form.allergiesText),
      currentMedications: parseMedicationLines(form.currentMedicationsText),
      comorbidities: parseLineList(form.comorbiditiesText),
      renal: editing?.renal ?? { gfr: 90, status: "normal" },
      liver: editing?.liver ?? { status: "normal" },
      vitalsSnapshot: editing?.vitals ?? { hr: 0, bp: "", temp: 0, spo2: 0 },
      flags: editing?.flags ?? [],
      missingData: editing?.missingData,
      weightKg: editing?.weightKg ?? 0,
      heightCm: editing?.heightCm ?? 0,
    };

    setSaving(true);
    try {
      const saved = editing
        ? await updatePatient(editing.id, payload)
        : await createPatient(payload);
      onSaved?.(saved);
      onClose();
    } catch (error) {
      toast({
        title: "Patient non enregistre",
        description: error instanceof Error ? error.message : "Impossible de joindre le backend.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted" aria-label={t("common.close")}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <section className="rounded-xl border border-border bg-muted/20 p-4">
            <h3 className="text-sm font-semibold">{t("patients.generalInfo")}</h3>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={`${t("patients.firstName")} *`}>
                <input required value={form.firstName} onChange={(event) => update("firstName", event.target.value)} className={input} />
              </Field>
              <Field label={`${t("patients.lastName")} *`}>
                <input required value={form.lastName} onChange={(event) => update("lastName", event.target.value)} className={input} />
              </Field>
              <Field label={`${t("patients.birthDate")} *`}>
                <input required type="date" value={form.birthDate} onChange={(event) => update("birthDate", event.target.value)} className={input} />
              </Field>
              <Field label={`${t("patients.gender")} *`}>
                <select value={form.gender} onChange={(event) => update("gender", event.target.value as PatientFormState["gender"])} className={input}>
                  <option value="female">{t("patients.female")}</option>
                  <option value="male">{t("patients.male")}</option>
                  <option value="other">{t("patients.other")}</option>
                </select>
              </Field>
              <Field label={`${t("patients.phone1")} *`}>
                <input required value={form.phone1} onChange={(event) => update("phone1", event.target.value)} className={input} placeholder="+216 ..." />
              </Field>
              <Field label={t("patients.phone2")}>
                <input value={form.phone2} onChange={(event) => update("phone2", event.target.value)} className={input} placeholder="+216 ..." />
              </Field>
              <Field label={t("patients.phone3")}>
                <input value={form.phone3} onChange={(event) => update("phone3", event.target.value)} className={input} placeholder="+216 ..." />
              </Field>
              <Field label={t("patients.profession")}>
                <input value={form.profession} onChange={(event) => update("profession", event.target.value)} className={input} />
              </Field>
              <Field label={t("patients.internalCode")}>
                <input value={form.internalCode} onChange={(event) => update("internalCode", event.target.value)} className={input} />
              </Field>
              <Field label={t("patients.address")}>
                <input value={form.address} onChange={(event) => update("address", event.target.value)} className={input} />
              </Field>
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
            <h3 className="text-sm font-semibold">Clinical information</h3>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <Field label={t("patientSummary.allergies")}>
                <textarea
                  value={form.allergiesText}
                  onChange={(event) => update("allergiesText", event.target.value)}
                  rows={3}
                  className={`${input} resize-y`}
                  placeholder={"Penicilline\nLatex"}
                />
              </Field>
              <Field label={t("patientSummary.currentMedications")}>
                <textarea
                  value={form.currentMedicationsText}
                  onChange={(event) => update("currentMedicationsText", event.target.value)}
                  rows={3}
                  className={`${input} resize-y`}
                  placeholder={"Metformine | 500 mg x 2/jour\nAmlodipine | 5 mg/jour"}
                />
              </Field>
              <Field label={t("patientSummary.comorbidities")}>
                <textarea
                  value={form.comorbiditiesText}
                  onChange={(event) => update("comorbiditiesText", event.target.value)}
                  rows={3}
                  className={`${input} resize-y`}
                  placeholder={"Diabete type 2\nHypertension"}
                />
              </Field>
            </div>
          </section>

          <p className="mt-3 rounded-lg border border-info/20 bg-info-soft px-3 py-2 text-xs text-info">
            {t("patients.vitalsNote")}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold transition-smooth hover:bg-muted">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:bg-primary/90 disabled:opacity-60">
            <Save className="h-4 w-4" /> {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20";
