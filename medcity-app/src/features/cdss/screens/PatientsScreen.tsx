import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ClipboardList, FilePlus2, Search } from "lucide-react";
import {
  getPatientAge,
  getPatientFullName,
  getPatientGenderLabel,
  getPatientInitials,
  getPatientSearchText,
  patients,
  prescriptions,
} from "@/lib/mock-data";
import { useI18n } from "@/i18n/I18nProvider";

export default function CdssPatientsPage({ basePath = "/admin/cdss" }: { basePath?: string }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const chartBasePath = basePath === "/doctor" ? "/doctor/patients" : "/admin/patients";

  const filteredPatients = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return patients;
    return patients.filter((patient) => getPatientSearchText(patient).includes(needle));
  }, [query]);

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("nav.patients")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("patients.panelCount", { count: patients.length })}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm w-full sm:w-72">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("patients.searchExtended")}
            className="flex-1 bg-transparent outline-none"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filteredPatients.map((patient) => {
          const patientPrescriptions = prescriptions.filter((entry) => entry.patientId === patient.id);
          return (
            <div
              key={patient.id}
              className="rounded-xl border border-border bg-card p-5 shadow-card transition-smooth hover:shadow-elevated"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold">
                    {getPatientInitials(patient)}
                  </div>
                  <div>
                    <div className="font-semibold">{getPatientFullName(patient)}</div>
                    <div className="text-xs text-muted-foreground">
                      {patient.id} · {getPatientAge(patient)} {t("patients.ageUnit")} · {getPatientGenderLabel(patient)}
                    </div>
                  </div>
                </div>
                {patient.missingData && patient.missingData.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft text-warning-foreground px-2 py-0.5 text-[11px] font-semibold border border-warning/30">
                    <AlertTriangle className="h-3 w-3" /> {t("patients.dataBadge")}
                  </span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-y-2 text-xs">
                <div className="text-muted-foreground">{t("patients.mobile")}</div>
                <div className="font-medium">{patient.phone1 || t("common.notProvided")}</div>
                <div className="text-muted-foreground">{t("patients.profession")}</div>
                <div className="font-medium">{patient.profession || t("common.notProvidedF")}</div>
                <div className="text-muted-foreground">{t("patients.internalCode")}</div>
                <div className="font-medium">{patient.internalCode || patient.id}</div>
                <div className="text-muted-foreground">{t("patients.prescriptions")}</div>
                <div className="font-medium">{patientPrescriptions.length}</div>
              </div>

              {patient.flags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {patient.flags.map((flag) => (
                    <span
                      key={flag}
                      className="inline-flex items-center rounded-full bg-warning-soft text-warning-foreground border border-warning/30 px-2 py-0.5 text-[11px] font-medium"
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Link
                  href={`${basePath}/prescription/new?patientId=${encodeURIComponent(patient.id)}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-smooth"
                >
                  <FilePlus2 className="h-3.5 w-3.5" /> {t("patients.newRx")}
                </Link>
                <Link
                  href={`${chartBasePath}/${patient.id}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-xs font-semibold hover:bg-muted transition-smooth"
                >
                  <ClipboardList className="h-3.5 w-3.5" /> {t("patients.prescriptions")}
                </Link>
                <Link
                  href={`${chartBasePath}/${patient.id}`}
                  className="inline-flex items-center justify-center rounded-lg border border-input bg-card px-3 py-2 text-xs font-semibold hover:bg-muted transition-smooth"
                >
                  {t("patients.openChart")}
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {filteredPatients.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("patients.noPatientFor", { query })}
        </div>
      )}
    </div>
  );
}
