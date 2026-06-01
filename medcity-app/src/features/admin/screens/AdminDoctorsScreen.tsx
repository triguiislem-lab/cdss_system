import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Edit2,
  FilePlus2,
  FileText,
  MapPin,
  Phone,
  Search,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { MetricCard } from "@/components/molecules/MetricCard";
import { CdssModal, FormField as Field } from "@/features/cdss/components/DialogPrimitives";
import { useI18n } from "@/i18n/I18nProvider";
import { createDoctor as createDoctorApi, deleteDoctor as deleteDoctorApi, listDoctors, updateDoctor as updateDoctorApi } from "@/lib/backend-api";

type DoctorStatus = "actif" | "inactif";

type AdminDoctor = {
  id: string;
  prenom?: string;
  nom: string;
  email?: string;
  role?: "doctor";
  matriculeFiscale?: string;
  specialite: string;
  hopital: string;
  ville: string;
  telephone: string;
  password?: string;
  patients: number;
  prescriptions: number;
  rating: number;
  statut: DoctorStatus;
  disponible: boolean;
};

function emptyDoctor(): AdminDoctor {
  return {
    id: `d-${Date.now()}`,
    prenom: "",
    nom: "",
    email: "",
    role: "doctor",
    matriculeFiscale: "",
    specialite: "",
    hopital: "",
    ville: "",
    telephone: "",
    password: "",
    patients: 0,
    prescriptions: 0,
    rating: 5,
    statut: "actif",
    disponible: true,
  };
}

function doctorDisplayName(doc: AdminDoctor) {
  const fullName = [doc.prenom, doc.nom].filter(Boolean).join(" ").trim();
  return fullName ? `Dr. ${fullName}` : `Dr. ${doc.nom}`;
}

export default function AdminDoctors() {
  const { t } = useI18n();
  const [doctors, setDoctors] = useState<AdminDoctor[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminDoctor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminDoctor | null>(null);

  async function refreshDoctors() {
    const apiDoctors = await listDoctors(search);
    setDoctors(apiDoctors.map((doctor) => ({
      id: doctor.id,
      prenom: doctor.firstName,
      nom: doctor.lastName,
      email: doctor.email,
      matriculeFiscale: doctor.fiscalNumber,
      specialite: doctor.specialty ?? "",
      hopital: "MedCity",
      ville: doctor.city ?? "",
      telephone: doctor.phone,
      patients: 0,
      prescriptions: 0,
      rating: 5,
      statut: doctor.status === "inactive" ? "inactif" : "actif",
      disponible: doctor.status !== "inactive",
    })));
  }

  useEffect(() => {
    void refreshDoctors();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter((doc) =>
      [doc.prenom, doc.nom, doc.email, doc.matriculeFiscale, doc.specialite, doc.hopital, doc.ville]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q)),
    );
  }, [doctors, search]);

  const stats = [
    { label: t("adminDoctors.stats.active"), value: doctors.filter((doc) => doc.statut === "actif").length, icon: CheckCircle2, cls: "text-success" },
    { label: t("adminDoctors.stats.available"), value: doctors.filter((doc) => doc.disponible).length, icon: Users, cls: "text-info" },
    { label: t("adminDoctors.stats.followedPatients"), value: doctors.reduce((sum, doc) => sum + doc.patients, 0), icon: Users, cls: "text-primary" },
    { label: t("adminDoctors.stats.prescriptions"), value: doctors.reduce((sum, doc) => sum + doc.prescriptions, 0), icon: FileText, cls: "text-warning-foreground" },
  ];

  function saveDoctor(nextDoctor: AdminDoctor) {
    void (async () => {
      const payload = {
        firstName: nextDoctor.prenom || nextDoctor.nom.split(" ")[0] || "Doctor",
        lastName: nextDoctor.prenom ? nextDoctor.nom : nextDoctor.nom.split(" ").slice(1).join(" ") || nextDoctor.nom,
        email: nextDoctor.email || `${Date.now()}@medcity.tn`,
        phone: nextDoctor.telephone,
        fiscalNumber: nextDoctor.matriculeFiscale || `MF-${Date.now()}`,
        specialty: nextDoctor.specialite,
        city: nextDoctor.ville,
      };
      const exists = doctors.some((doc) => doc.id === nextDoctor.id);
      if (exists) await updateDoctorApi(nextDoctor.id, payload);
      else await createDoctorApi({ ...payload, password: nextDoctor.password ?? "" });
      await refreshDoctors();
      setEditing(null);
    })();
  }

  function deleteDoctor() {
    if (!deleteTarget) return;
    void (async () => {
      await deleteDoctorApi(deleteTarget.id);
      setDeleteTarget(null);
      await refreshDoctors();
    })();
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("adminDoctors.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("adminDoctors.subtitle", { count: doctors.length })}</p>
        </div>
        <button
          onClick={() => setEditing(emptyDoctor())}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-card hover:bg-primary/90 transition-smooth"
        >
          <FilePlus2 className="h-4 w-4" /> {t("adminDoctors.new")}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <MetricCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} iconClassName={stat.cls} />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
          <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("adminDoctors.searchPlaceholder")}
              className="flex-1 bg-transparent outline-none"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">{t("adminDoctors.empty")}</div>
        ) : (
          <ul className="grid gap-0 divide-y divide-border">
            {filtered.map((doc) => {
              const initials = doctorDisplayName(doc)
                .split(" ")
                .filter((part) => part !== "Dr.")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              return (
                <li key={doc.id} className="p-5 hover:bg-muted/30 transition-smooth">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="h-11 w-11 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold">
                        {initials || "DR"}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold">{doctorDisplayName(doc)}</h2>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            doc.statut === "actif"
                              ? "bg-success-soft text-success border-success/30"
                              : "bg-muted text-muted-foreground border-border"
                          }`}
                          >
                            {doc.statut === "actif" ? t("adminDoctors.active") : t("adminDoctors.inactive")}
                          </span>
                          {doc.disponible && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-info/30 bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info">
                              <CheckCircle2 className="h-3 w-3" /> {t("adminDoctors.available")}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-primary font-medium mt-0.5">{doc.specialite}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {doc.hopital} - {doc.ville}</span>
                          <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {doc.telephone}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <strong>{doc.patients}</strong> {t("adminDoctors.patients")}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <strong>{doc.prescriptions}</strong> Rx
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-warning-soft px-2.5 py-1.5 text-warning-foreground">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <strong>{doc.rating}</strong>
                      </span>
                      <button
                        onClick={() => setEditing(doc)}
                        className="inline-flex items-center gap-1 rounded-lg border border-input bg-card px-2.5 py-1.5 font-semibold hover:bg-muted transition-smooth"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> {t("common.edit")}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(doc)}
                        className="inline-flex items-center gap-1 rounded-lg border border-critical/30 bg-critical-soft px-2.5 py-1.5 font-semibold text-critical hover:bg-critical/10 transition-smooth"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && (
        <DoctorModal
          doctor={editing}
          onClose={() => setEditing(null)}
          onSave={saveDoctor}
        />
      )}

      {deleteTarget && (
        <CdssModal title={t("adminDoctors.deleteTitle")} onClose={() => setDeleteTarget(null)} maxWidth="sm:max-w-md">
          <p className="text-sm text-muted-foreground">
            {t("adminDoctors.deleteText", { name: doctorDisplayName(deleteTarget) })}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-muted transition-smooth"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={deleteDoctor}
              className="rounded-lg bg-critical px-4 py-2 text-sm font-semibold text-critical-foreground hover:bg-critical/90 transition-smooth"
            >
              {t("common.delete")}
            </button>
          </div>
        </CdssModal>
      )}
    </div>
  );
}

function DoctorModal({
  doctor,
  onClose,
  onSave,
}: {
  doctor: AdminDoctor;
  onClose: () => void;
  onSave: (doctor: AdminDoctor) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<AdminDoctor>(doctor);
  const isNew = doctor.id.startsWith("d-");

  function update<K extends keyof AdminDoctor>(key: K, value: AdminDoctor[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ ...form, role: "doctor" });
  }

  return (
    <CdssModal title={doctor.nom ? t("adminDoctors.editTitle") : t("adminDoctors.newTitle")} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t("patients.firstName")}>
          <input required value={form.prenom ?? ""} onChange={(event) => update("prenom", event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label={t("patients.lastName")}>
          <input required value={form.nom} onChange={(event) => update("nom", event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label={t("common.email")}>
          <input required type="email" value={form.email ?? ""} onChange={(event) => update("email", event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label={t("adminDoctors.taxId")}>
          <input required value={form.matriculeFiscale ?? ""} onChange={(event) => update("matriculeFiscale", event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label={t("adminDoctors.role")}>
          <input value="doctor" disabled className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground" />
        </Field>
        <Field label={t("adminDoctors.specialty")}>
          <input required value={form.specialite} onChange={(event) => update("specialite", event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label={t("adminDoctors.facility")}>
          <input required value={form.hopital} onChange={(event) => update("hopital", event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label={t("adminDoctors.city")}>
          <input required value={form.ville} onChange={(event) => update("ville", event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label={t("adminDoctors.phone")}>
          <input required value={form.telephone} onChange={(event) => update("telephone", event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        {isNew && (
          <Field label="Mot de passe initial">
            <input required type="password" minLength={8} value={form.password ?? ""} onChange={(event) => update("password", event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </Field>
        )}
        <Field label={t("adminDoctors.status")}>
          <select value={form.statut} onChange={(event) => update("statut", event.target.value as DoctorStatus)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <option value="actif">{t("adminDoctors.active")}</option>
            <option value="inactif">{t("adminDoctors.inactive")}</option>
          </select>
        </Field>
        <Field label={t("adminDoctors.patients")}>
          <input type="number" min={0} value={form.patients} onChange={(event) => update("patients", Number(event.target.value))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label={t("adminDoctors.prescriptions")}>
          <input type="number" min={0} value={form.prescriptions} onChange={(event) => update("prescriptions", Number(event.target.value))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label={t("adminDoctors.rating")}>
          <input type="number" min={0} max={5} step="0.1" value={form.rating} onChange={(event) => update("rating", Number(event.target.value))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label={t("adminDoctors.availability")}>
          <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm">
            <input type="checkbox" checked={form.disponible} onChange={(event) => update("disponible", event.target.checked)} className="h-4 w-4 rounded border-input" />
            {t("adminDoctors.availableNow")}
          </label>
        </Field>
        <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-muted transition-smooth">
            {t("common.cancel")}
          </button>
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-smooth">
            {t("common.save")}
          </button>
        </div>
      </form>
    </CdssModal>
  );
}
