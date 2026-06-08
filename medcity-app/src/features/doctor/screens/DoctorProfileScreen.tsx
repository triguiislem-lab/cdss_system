import type { ComponentType, FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  Stethoscope,
  UserCircle,
} from "lucide-react";

import { LoadingState } from "@/components/molecules/LoadingState";
import { useToast } from "@/hooks/use-toast";
import { getDoctorProfile, updateDoctorProfile } from "@/lib/backend-api";

type ProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  fiscalNumber: string;
  specialty: string;
  cnamCode: string;
  gsm: string;
  address: string;
  city: string;
};

const emptyProfile: ProfileForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  fiscalNumber: "",
  specialty: "",
  cnamCode: "",
  gsm: "",
  address: "",
  city: "",
};

export default function DoctorProfileScreen() {
  const { toast } = useToast();
  const [form, setForm] = useState<ProfileForm>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadProfile() {
    setLoading(true);
    setError("");
    try {
      const profile = await getDoctorProfile();
      setForm({
        firstName: profile.firstName ?? "",
        lastName: profile.lastName ?? "",
        email: profile.email ?? "",
        phone: profile.phone ?? "",
        fiscalNumber: profile.fiscalNumber ?? "",
        specialty: profile.specialty ?? "",
        cnamCode: profile.cnamCode ?? "",
        gsm: profile.gsm ?? "",
        address: profile.address ?? "",
        city: profile.city ?? "",
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger le profil.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const saved = await updateDoctorProfile(form);
      setForm({
        firstName: saved.firstName ?? "",
        lastName: saved.lastName ?? "",
        email: saved.email ?? "",
        phone: saved.phone ?? "",
        fiscalNumber: saved.fiscalNumber ?? "",
        specialty: saved.specialty ?? "",
        cnamCode: saved.cnamCode ?? "",
        gsm: saved.gsm ?? "",
        address: saved.address ?? "",
        city: saved.city ?? "",
      });
      toast({
        title: "Profil mis a jour",
        description: "Les informations du compte medecin ont ete synchronisees.",
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer le profil.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <LoadingState title="Chargement du profil" subtitle="Recuperation des informations medecin..." />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Profil medecin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informations professionnelles utilisees par l'espace docteur et les ordonnances.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadProfile()}
          disabled={saving || loading}
          className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50 transition-smooth"
        >
          <RefreshCw className="h-4 w-4" />
          Recharger
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical">
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
        </div>
      )}

      <form onSubmit={saveProfile} className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="xl:col-span-2 rounded-xl border border-border bg-card shadow-card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Identite et contact</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
            <Field label="Prenom" icon={UserCircle}>
              <input required value={form.firstName} onChange={(event) => update("firstName", event.target.value)} className={fieldInputClass} />
            </Field>
            <Field label="Nom" icon={UserCircle}>
              <input required value={form.lastName} onChange={(event) => update("lastName", event.target.value)} className={fieldInputClass} />
            </Field>
            <Field label="Email de connexion" icon={Mail}>
              <input required type="email" value={form.email} onChange={(event) => update("email", event.target.value)} className={fieldInputClass} />
            </Field>
            <Field label="Telephone" icon={Phone}>
              <input required value={form.phone} onChange={(event) => update("phone", event.target.value)} className={fieldInputClass} />
            </Field>
            <Field label="GSM" icon={Phone}>
              <input value={form.gsm} onChange={(event) => update("gsm", event.target.value)} className={fieldInputClass} />
            </Field>
            <Field label="Ville" icon={MapPin}>
              <input value={form.city} onChange={(event) => update("city", event.target.value)} className={fieldInputClass} />
            </Field>
            <Field label="Adresse cabinet" icon={MapPin} className="md:col-span-2">
              <textarea value={form.address} onChange={(event) => update("address", event.target.value)} rows={3} className={`${fieldInputClass} resize-none`} />
            </Field>
          </div>
        </section>

        <aside className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Informations ordinales</h2>
          </div>
          <div className="space-y-4 p-5">
            <Field label="Specialite" icon={Stethoscope}>
              <input value={form.specialty} onChange={(event) => update("specialty", event.target.value)} className={fieldInputClass} />
            </Field>
            <Field label="Matricule fiscal" icon={Building2}>
              <input required value={form.fiscalNumber} onChange={(event) => update("fiscalNumber", event.target.value)} className={fieldInputClass} />
            </Field>
            <Field label="Code CNAM" icon={ShieldCheck}>
              <input value={form.cnamCode} onChange={(event) => update("cnamCode", event.target.value)} className={fieldInputClass} />
            </Field>
            <div className="rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
              <span className="inline-flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                Compte actif
              </span>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-smooth"
            >
              <Save className="h-4 w-4" />
              {saving ? "Enregistrement..." : "Enregistrer le profil"}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  className = "",
  children,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`space-y-1.5 ${className}`}>
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      {children}
    </label>
  );
}

const fieldInputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20";
