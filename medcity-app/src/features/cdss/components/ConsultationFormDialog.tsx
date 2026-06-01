import { useEffect, useState } from "react";
import { FormField as Field, SearchablePicker } from "@/features/cdss/components/DialogPrimitives";
import { getPatientFullName, type Patient } from "@/lib/mock-data";
import { useI18n } from "@/i18n/I18nProvider";
import { useAuth } from "@/contexts/AuthContext";
import { createConsultation, getConsultation, listDoctors, listPatients, updateConsultation } from "@/lib/backend-api";

interface Props {
  open: boolean;
  onClose: () => void;
  editingId?: string;
}

export function ConsultationFormDialog({ open, onClose, editingId }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Array<{ id: string; firstName: string; lastName: string; specialty?: string }>>([]);
  const [patientId, setPatientId] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [reason, setReason] = useState("");
  const [doctor, setDoctor] = useState(user?.role === "doctor" ? [user.prenom, user.nom].filter(Boolean).join(" ") : "MedCity");
  const [doctorId, setDoctorId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
  const selectedPatient = patients.find((p) => p.id === patientId);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [apiPatients, apiDoctors] = await Promise.all([
        listPatients(),
        user?.role === "admin" ? listDoctors() : Promise.resolve([]),
      ]);
      setPatients(apiPatients);
      setDoctors(apiDoctors);
      if (!editingId && apiPatients[0]) setPatientId(apiPatients[0].id);
      if (!editingId && apiDoctors[0]) {
        setDoctorId(apiDoctors[0].id);
        setDoctor(`${apiDoctors[0].firstName} ${apiDoctors[0].lastName}`.trim());
      }
      if (!editingId) return;
      const existing = await getConsultation(editingId);
      setPatientId(existing.patientId);
      setPatientQuery(`${existing.patientName} ${existing.patientId}`);
      setReason(existing.reason);
      setDoctor(existing.doctor);
      setScheduledAt(new Date(existing.scheduledAt).toISOString().slice(0, 16));
    })();
  }, [editingId, open, user?.role]);

  if (!open) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const iso = new Date(scheduledAt).toISOString();
    void (async () => {
      if (editingId) {
        await updateConsultation(editingId, { patientId, doctorId: doctorId || undefined, reason, scheduledAt: iso });
      } else {
        await createConsultation({ patientId, doctorId: doctorId || undefined, reason, scheduledAt: iso, notes: "" });
      }
      onClose();
    })();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-xl border border-border bg-card shadow-elevated p-5 space-y-4">
        <div>
          <h3 className="font-semibold">{editingId ? t("consultations.edit") : t("consultations.new")}</h3>
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
          <input required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("consultations.reasonPlaceholder")} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("common.doctor")}>
            {user?.role === "admin" ? (
              <select
                value={doctorId}
                onChange={(event) => {
                  const next = doctors.find((item) => item.id === event.target.value);
                  setDoctorId(event.target.value);
                  if (next) setDoctor(`${next.firstName} ${next.lastName}`.trim());
                }}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                required
              >
                {doctors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {`${item.firstName} ${item.lastName}`.trim()} {item.specialty ? `- ${item.specialty}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input value={doctor} disabled className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground" />
            )}
          </Field>
          <Field label={t("common.dateTime")}>
            <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">{t("common.cancel")}</button>
          <button type="submit" disabled={!patientId || (user?.role === "admin" && !doctorId)} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{editingId ? t("common.save") : t("common.create")}</button>
        </div>
      </form>
    </div>
  );
}
