import { useEffect, useState } from "react";
import { usePatientStore } from "@/lib/stores/patient-store";
import { useConsultationStore } from "@/lib/stores/consultation-store";
import { FormField as Field, SearchablePicker } from "@/features/cdss/components/DialogPrimitives";
import { getPatientFullName } from "@/lib/mock-data";
import { useI18n } from "@/i18n/I18nProvider";

interface Props {
  open: boolean;
  onClose: () => void;
  editingId?: string;
}

export function ConsultationFormDialog({ open, onClose, editingId }: Props) {
  const { t } = useI18n();
  const patients = usePatientStore((s) => s.patients);
  const add = useConsultationStore((s) => s.add);
  const update = useConsultationStore((s) => s.update);
  const existing = useConsultationStore((s) => (editingId ? s.consultations.find((c) => c.id === editingId) : undefined));

  const [patientId, setPatientId] = useState(patients[0]?.id ?? "");
  const [patientQuery, setPatientQuery] = useState("");
  const [reason, setReason] = useState("");
  const [doctor, setDoctor] = useState("Dr. Jordan Chen");
  const [scheduledAt, setScheduledAt] = useState(() => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
  const selectedPatient = patients.find((p) => p.id === patientId);

  useEffect(() => {
    if (existing) {
      setPatientId(existing.patientId);
      setPatientQuery(`${existing.patientName} ${existing.patientId}`);
      setReason(existing.reason);
      setDoctor(existing.doctor);
      setScheduledAt(new Date(existing.scheduledAt).toISOString().slice(0, 16));
    }
  }, [existing]);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;
    const iso = new Date(scheduledAt).toISOString();
    if (existing) {
      update(existing.id, { patientId, patientName: getPatientFullName(patient), reason, doctor, scheduledAt: iso });
    } else {
      add({
        patientId, patientName: getPatientFullName(patient), doctor, reason,
        scheduledAt: iso, status: "scheduled", notes: "",
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-xl border border-border bg-card shadow-elevated p-5 space-y-4">
        <div>
          <h3 className="font-semibold">{existing ? t("consultations.edit") : t("consultations.new")}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("consultations.formHelp")}</p>
        </div>

        <Field label={t("common.patient")}>
          <SearchablePicker
            items={patients}
            selectedId={patientId}
            query={patientQuery}
            onQueryChange={setPatientQuery}
            onSelect={(patient) => {
              setPatientId(patient.id);
              setPatientQuery(`${getPatientFullName(patient)} ${patient.id}`);
            }}
            getId={(patient) => patient.id}
            getSearchText={(patient) => `${getPatientFullName(patient)} ${patient.id}`}
            placeholder={t("consultations.patientSearch")}
            emptyLabel={t("consultations.noPatient")}
            renderItem={(patient) => (
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold">{getPatientFullName(patient)}</span>
                <span className="text-xs opacity-75">{patient.id}</span>
              </span>
            )}
          />
          {selectedPatient && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("consultations.selection", { name: getPatientFullName(selectedPatient), id: selectedPatient.id })}
            </p>
          )}
        </Field>

        <Field label={t("common.reason")}>
          <input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("consultations.reasonPlaceholder")} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("common.doctor")}>
            <input value={doctor} onChange={(e) => setDoctor(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label={t("common.dateTime")}>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">{t("common.cancel")}</button>
          <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{existing ? t("common.save") : t("common.create")}</button>
        </div>
      </form>
    </div>
  );
}


