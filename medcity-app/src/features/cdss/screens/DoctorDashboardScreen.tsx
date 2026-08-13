import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  FileClock,
  ShieldAlert,
  Users,
} from "lucide-react";

import { LoadingState } from "@/components/molecules/LoadingState";
import { notAssessedRiskMeta, riskMeta, statusMeta } from "@/lib/clinical-ui";
import { getDoctorDashboardSummary, listPrescriptions, type DoctorDashboardSummary } from "@/lib/backend-api";
import type { PrescriptionCase } from "@/lib/mock-data";
import { useI18n } from "@/i18n/I18nProvider";

const accentMap = {
  info: "bg-info-soft text-info",
  critical: "bg-critical-soft text-critical",
  success: "bg-success-soft text-success",
  primary: "bg-primary-soft text-primary",
} as const;

function Dashboard() {
  const { language } = useI18n();
  const [summary, setSummary] = useState<DoctorDashboardSummary | null>(null);
  const [prescriptions, setPrescriptions] = useState<PrescriptionCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [summaryResult, prescriptionsResult] = await Promise.allSettled([
          getDoctorDashboardSummary(),
          listPrescriptions(),
        ]);
        if (summaryResult.status === "fulfilled") setSummary(summaryResult.value);
        else {
          setSummary(null);
          setLoadError("Impossible de charger les indicateurs cliniques agrégés.");
        }
        setPrescriptions(prescriptionsResult.status === "fulfilled" ? prescriptionsResult.value : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => summary ? [
    {
      key: "patients",
      label: "Patients suivis",
      value: summary.patients.total,
      icon: Users,
      accent: "primary",
      helper: "Total exact depuis la base",
    },
    {
      key: "pending",
      label: "Prescriptions à revoir",
      value: summary.prescriptions.pendingReview,
      icon: ClipboardList,
      accent: "info",
      helper: "À revoir par le médecin",
    },
    {
      key: "highRisk",
      label: "Prescriptions à risque élevé",
      value: summary.prescriptions.highRisk,
      icon: ShieldAlert,
      accent: "critical",
      helper: "Nécessitent une attention clinique",
    },
    {
      key: "validated",
      label: "Prescriptions validées",
      value: summary.prescriptions.validated,
      icon: CheckCircle2,
      accent: "success",
      helper: "Cas confirmés",
    },
    {
      key: "upcoming",
      label: "Consultations à venir",
      value: summary.consultations.upcoming,
      icon: ClipboardList,
      accent: "info",
      helper: "Planifiées à partir de maintenant",
    },
  ] as const : [], [summary]);

  const recentPrescriptions = prescriptions.slice(0, 6);

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord clinique</h1>
        <p className="text-sm text-muted-foreground mt-1">
            Indicateurs agrégés depuis NestJS, actualisés à l’ouverture de la page.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
            summary && !loadError ? "border-success/30 bg-success-soft text-success" : "border-warning/30 bg-warning-soft text-warning-foreground"
          }`}>
            <span className={`h-2 w-2 rounded-full ${summary && !loadError ? "bg-success" : "bg-warning"}`} />
            {summary && !loadError ? "Données synchronisées" : "Données indisponibles"}
          </span>
          <Link
            href="/doctor/prescription/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-card transition-smooth hover:bg-primary/90"
          >
            Nouvelle prescription <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          {loadError} Les KPI ne sont pas remplacés par des zéros.
        </div>
      )}

      {loading ? (
        <LoadingState
            title="Chargement du tableau de bord clinique"
          subtitle="Synchronisation des patients et prescriptions depuis NestJS..."
        />
      ) : (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
            {stats.map((stat) => (
              <div key={stat.key} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-start justify-between">
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${accentMap[stat.accent]}`}>
                    <stat.icon className="h-4 w-4" />
                  </span>
                  {stat.accent === "critical" && stat.value > 0 && (
                    <span className="inline-flex h-2 w-2 rounded-full bg-critical animate-pulse-critical" />
                  )}
                </div>
                <div className="mt-4 text-3xl font-bold tracking-tight">{stat.value}</div>
                <div className="text-xs font-medium text-muted-foreground mt-1">{stat.label}</div>
                <div className="text-[11px] text-muted-foreground/80 mt-2">{stat.helper}</div>
              </div>
            ))}
          </div>

          {summary && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <DashboardPanel
                title="Priorités cliniques"
                subtitle="Les actions qui méritent une revue en premier."
              >
                <DashboardAction label="Prescriptions à revoir" value={summary.prescriptions.pendingReview} href="/doctor/prescriptions" tone="info" />
                <DashboardAction label="Risque élevé" value={summary.prescriptions.highRisk} href="/doctor/prescriptions" tone="critical" />
                <DashboardAction label="Brouillons à compléter" value={summary.prescriptions.drafts} href="/doctor/prescriptions" tone="muted" />
                <DashboardAction label="Prescriptions validées" value={summary.prescriptions.validated} href="/doctor/prescriptions" tone="success" />
                <DashboardAction label="Prescriptions annulées" value={summary.prescriptions.cancelled} href="/doctor/prescriptions" tone="muted" />
              </DashboardPanel>
              <DashboardPanel
                title="Activité des consultations"
                subtitle="Vue opérationnelle des consultations rattachées à votre compte."
              >
                <DashboardAction label="Consultations à venir" value={summary.consultations.upcoming} href="/doctor/consultations" tone="info" />
                <DashboardAction label="Consultations en cours" value={summary.consultations.inProgress} href="/doctor/consultations" tone="warning" />
                <DashboardAction label="Consultations terminées" value={summary.consultations.completed} href="/doctor/consultations" tone="success" />
                <DashboardAction label="Consultations annulées" value={summary.consultations.cancelled} href="/doctor/consultations" tone="muted" />
              </DashboardPanel>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold">Prescriptions récentes</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Les dossiers affichés proviennent de l’endpoint prescriptions de NestJS.
                </p>
              </div>
              <Link href="/doctor/prescriptions" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
                Voir tout <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            {recentPrescriptions.length ? (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Prescription</th>
                      <th className="px-5 py-3 font-semibold">Patient</th>
                      <th className="px-5 py-3 font-semibold">Diagnostic</th>
                      <th className="px-5 py-3 font-semibold">Traitement</th>
                      <th className="px-5 py-3 font-semibold">Statut</th>
                      <th className="px-5 py-3 font-semibold">Risque</th>
                      <th className="px-5 py-3 font-semibold">Dernière mise à jour</th>
                      <th className="px-5 py-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentPrescriptions.map((rx) => {
                      const patient = rx.patient;
                      const status = statusMeta[rx.status];
                      const risk = rx.riskAssessed && rx.risk ? riskMeta[rx.risk] : notAssessedRiskMeta;

                      return (
                        <tr key={rx.id} className="hover:bg-muted/40 transition-smooth">
                          <td className="px-5 py-3.5">
                            <div className="font-mono text-xs font-semibold text-primary whitespace-nowrap">
                              {rx.prescriptionNumber ?? "Référence non disponible"}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-1">Dossier clinique</div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="font-semibold">{patient?.name ?? "Patient non renseigné"}</div>
                            <div className="text-xs text-muted-foreground">
                              {patient ? `${patient.age} ans · ${patient.sex}` : "Profil patient incomplet"}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">{rx.diagnosis || "Diagnostic non renseigné"}</td>
                          <td className="px-5 py-3.5 min-w-48">
                            {rx.medications.length
                              ? `${rx.medications.slice(0, 2).map((medication) => medication.name).join(", ")}${rx.medications.length > 2 ? ` +${rx.medications.length - 2}` : ""}`
                              : "Aucun médicament enregistré"}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.cls}`}>
                              {getStatusLabel(rx.status, language)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${risk.cls}`}>
                              {getRiskLabel(rx.risk, rx.riskAssessed, language)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-muted-foreground">{rx.lastUpdate}</td>
                          <td className="px-5 py-3.5 text-right">
                            <Link href={`/doctor/prescription/${encodeURIComponent(rx.id)}/review`} className="inline-flex items-center gap-1 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-smooth">
                              Ouvrir <ArrowRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-sm text-muted-foreground">
                Aucune prescription n’est disponible pour le moment.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Dashboard;

function DashboardPanel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <FileClock className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4 space-y-1">{children}</div>
    </div>
  );
}

function DashboardAction({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href: string;
  tone: "info" | "critical" | "success" | "warning" | "muted";
}) {
  const toneClass = {
    info: "text-info",
    critical: "text-critical",
    success: "text-success",
    warning: "text-warning-foreground",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted/60 transition-smooth">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`inline-flex items-center gap-1 text-sm font-bold ${toneClass}`}>
        {value}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

function getStatusLabel(status: PrescriptionCase["status"], language: "fr" | "en" | "ar") {
  if (language === "en") return statusMeta[status].label;
  if (language === "ar") {
    return {
      draft: "مسودة",
      pending_review: "قيد المراجعة",
      validated: "تمت المصادقة",
      rejected: "مرفوضة",
      cancelled: "ملغاة",
    }[status];
  }
  return {
    draft: "Brouillon",
    pending_review: "À revoir",
    validated: "Validée",
    rejected: "Rejetée",
    cancelled: "Annulée",
  }[status];
}

function getRiskLabel(risk: PrescriptionCase["risk"], riskAssessed: boolean | undefined, language: "fr" | "en" | "ar") {
  if (!riskAssessed || !risk) {
    if (language === "ar") return "غير مُقيّم";
    if (language === "fr") return "Non évalué";
    return "Not assessed";
  }
  if (language === "en") return risk ? riskMeta[risk].label : "Not assessed";
  if (language === "ar") {
    return { high: "خطر مرتفع", medium: "خطر متوسط", low: "خطر منخفض" }[risk];
  }
  return { high: "Risque élevé", medium: "Risque modéré", low: "Risque faible" }[risk];
}
