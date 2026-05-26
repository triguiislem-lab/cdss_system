import { STATS_ADMIN } from "@/data/mock-clinical";
import { useI18n } from "@/i18n/I18nProvider";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileText,
  Shield,
  Stethoscope,
  TrendingUp,
  UserCheck,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

type Accent = "info" | "success" | "warning" | "critical" | "primary" | "muted";

type KpiItem = {
  labelKey: string;
  value: number | string;
  subKey: string;
  trend: string;
  up: boolean;
  icon: LucideIcon;
  accent: Accent;
};

const accentMap: Record<Accent, string> = {
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning-foreground",
  critical: "bg-critical-soft text-critical",
  primary: "bg-primary-soft text-primary",
  muted: "bg-muted text-muted-foreground",
};

const KPI: KpiItem[] = [
  { labelKey: "adminDashboard.kpi.patients", value: STATS_ADMIN.totalPatients, subKey: "adminDashboard.kpi.thisMonth12", trend: "+5.1%", up: true, icon: Users, accent: "info" },
  { labelKey: "adminDashboard.kpi.doctors", value: STATS_ADMIN.totalMedecins, subKey: "adminDashboard.kpi.thisMonth2", trend: "+6.2%", up: true, icon: UserCheck, accent: "primary" },
  { labelKey: "adminDashboard.kpi.consultationsToday", value: STATS_ADMIN.consultationsAujourdHui, subKey: "adminDashboard.kpi.completed38", trend: "+8.3%", up: true, icon: Stethoscope, accent: "success" },
  { labelKey: "adminDashboard.kpi.prescriptionsIssued", value: STATS_ADMIN.prescriptionsEmises, subKey: "adminDashboard.kpi.platformTotal", trend: "+12.7%", up: true, icon: FileText, accent: "warning" },
  { labelKey: "adminDashboard.kpi.teleconsultations", value: STATS_ADMIN.teleconsultations, subKey: "adminDashboard.kpi.thisMonth", trend: "+18.5%", up: true, icon: Video, accent: "info" },
  { labelKey: "adminDashboard.kpi.interactionAlerts", value: STATS_ADMIN.alertesInteractions, subKey: "adminDashboard.kpi.toProcess", trend: "-2", up: false, icon: AlertTriangle, accent: "critical" },
  { labelKey: "adminDashboard.kpi.complianceRate", value: `${STATS_ADMIN.tauxConformite}%`, subKey: "adminDashboard.kpi.gdprCnam", trend: "+0.3%", up: true, icon: Shield, accent: "success" },
  { labelKey: "adminDashboard.kpi.pendingValidation", value: STATS_ADMIN.prescriptionsEnAttente, subKey: "adminDashboard.kpi.prescriptions", trend: "-3", up: false, icon: Clock, accent: "muted" },
];

const ACTIVITY = [
  { descKey: "adminDashboard.activity.rxGenerated", detail: "Mohamed Trabelsi", time: "12 min", icon: FileText, accent: "success" as Accent },
  { descKey: "adminDashboard.activity.interactionDetected", detail: "Warfarine + Ibuprofene", time: "28 min", icon: AlertTriangle, accent: "critical" as Accent },
  { descKey: "adminDashboard.activity.newPatient", detailKey: "adminDashboard.activity.newPatientDetail", time: "1h", icon: Users, accent: "info" as Accent },
  { descKey: "adminDashboard.activity.consultationCompleted", detail: "Karim Meddeb - Dr. Ben Ali", time: "1h 20min", icon: CheckCircle2, accent: "success" as Accent },
  { descKey: "adminDashboard.activity.rxValidated", detail: "Fatima Chaabane", time: "2h", icon: FileText, accent: "success" as Accent },
  { descKey: "adminDashboard.activity.gdprAudit", detailKey: "adminDashboard.activity.autoAnalysisOk", time: "3h", icon: Shield, accent: "primary" as Accent },
];

const SPECIALITES = [
  { name: "Cardiologie", n: 48, pct: 85 },
  { name: "Diabetologie", n: 36, pct: 64 },
  { name: "Pneumologie", n: 29, pct: 52 },
  { name: "Neurologie", n: 22, pct: 39 },
  { name: "Chirurgie Esthetique", n: 18, pct: 32 },
];

const COMPLIANCE_ITEMS = [
  { labelKey: "adminDashboard.compliance.aes", ok: true },
  { labelKey: "adminDashboard.compliance.consent", ok: true },
  { labelKey: "adminDashboard.compliance.auditTrail", ok: true },
  { labelKey: "adminDashboard.compliance.mfa", ok: false },
  { labelKey: "adminDashboard.compliance.annualReport", ok: false },
];

export default function AdminDashboard() {
  const { t, language } = useI18n();
  const today = new Date().toLocaleDateString(language === "ar" ? "ar-TN" : language === "en" ? "en-US" : "fr-TN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("adminDashboard.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">
            {today} - {t("adminDashboard.platformAdmin")}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
          {t("adminDashboard.systemOperational")}
        </span>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {KPI.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.labelKey} className="rounded-xl border border-border bg-card p-4 shadow-card transition-smooth hover:shadow-elevated">
              <div className="flex items-start justify-between">
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${accentMap[kpi.accent]}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${kpi.up ? "bg-success-soft text-success" : "bg-warning-soft text-warning-foreground"}`}>
                  <ArrowUpRight className={`h-3 w-3 ${kpi.up ? "" : "rotate-180"}`} />
                  {kpi.trend}
                </span>
              </div>
              <div className="mt-4 text-3xl font-bold tracking-tight">{kpi.value}</div>
              <div className="text-xs font-medium text-muted-foreground mt-1">{t(kpi.labelKey)}</div>
              <div className="text-[11px] text-muted-foreground/80 mt-2">{t(kpi.subKey)}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 rounded-xl border border-border bg-card shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="text-base font-semibold">{t("adminDashboard.recentActivity")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t("adminDashboard.recentActivityHelp")}</p>
            </div>
            <button className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
              {t("adminDashboard.viewAll")} <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <ul className="divide-y divide-border">
            {ACTIVITY.map((item) => {
              const Icon = item.icon;
              return (
                <li key={`${item.descKey}-${item.time}`} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-smooth">
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${accentMap[item.accent]}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{t(item.descKey)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.detailKey ? t(item.detailKey) : item.detail}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">{t("adminDashboard.ago", { time: item.time })}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-card">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> {t("adminDashboard.loadBySpecialty")}
              </h2>
            </div>
            <div className="p-5 space-y-4">
              {SPECIALITES.map((specialite) => (
                <div key={specialite.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{specialite.name}</span>
                    <span className="text-xs font-bold">{specialite.n}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${specialite.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-card">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-success" /> {t("adminDashboard.gdprCompliance")}
              </h2>
              <div className="flex items-center gap-2 mt-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-success" style={{ width: "82%" }} />
                </div>
                <span className="text-sm font-bold">82%</span>
              </div>
            </div>
            <div className="p-5 space-y-2.5">
              {COMPLIANCE_ITEMS.map((item) => (
                <div key={item.labelKey} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{t(item.labelKey)}</span>
                  {item.ok ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                      <CheckCircle2 className="h-3 w-3" /> {t("adminDashboard.compliant")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-foreground">
                      <Clock className="h-3 w-3" /> {t("adminDashboard.inProgress")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
