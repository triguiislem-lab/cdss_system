import { Link } from "wouter";

import { ClipboardList, AlertTriangle, FileQuestion, CheckCircle2, ShieldAlert, ArrowUpRight, ArrowRight } from "lucide-react";
import { dashboardStats, prescriptions } from "@/lib/mock-data";
import { usePatientStore } from "@/lib/stores/patient-store";
import { riskMeta, statusMeta } from "@/lib/clinical-ui";


const stats = [
  { key: "pending", label: "Pending prescriptions", value: dashboardStats.pending, icon: ClipboardList, accent: "info", trend: "+2 today" },
  { key: "highRisk", label: "High-risk prescriptions", value: dashboardStats.highRisk, icon: ShieldAlert, accent: "critical", trend: "Needs attention" },
  { key: "missing", label: "Missing patient data", value: dashboardStats.missingData, icon: FileQuestion, accent: "warning", trend: "Block validation" },
  { key: "valid", label: "Recent validations", value: dashboardStats.recentValidations, icon: CheckCircle2, accent: "success", trend: "Last 24 h" },
  { key: "alerts", label: "Critical alerts today", value: dashboardStats.criticalAlertsToday, icon: AlertTriangle, accent: "critical", trend: "Reviewed: 0" },
] as const;

const accentMap = {
  info: "bg-info-soft text-info",
  critical: "bg-critical-soft text-critical",
  warning: "bg-warning-soft text-warning-foreground",
  success: "bg-success-soft text-success",
} as const;

function Dashboard() {
  const patients = usePatientStore((s) => s.patients);
  const patientById = (id: string) => patients.find((p) => p.id === id);

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clinical dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Wednesday, April 29, 2026 · Internal Medicine ward</p>
        </div>
        <Link href="/doctor/prescription/new" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-card transition-smooth hover:bg-primary/90">
          New prescription <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <div key={s.key} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between">
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${accentMap[s.accent]}`}>
                <s.icon className="h-4 w-4" />
              </span>
              {s.accent === "critical" && s.value > 0 && (
                <span className="inline-flex h-2 w-2 rounded-full bg-critical animate-pulse-critical" />
              )}
            </div>
            <div className="mt-4 text-3xl font-bold tracking-tight">{s.value}</div>
            <div className="text-xs font-medium text-muted-foreground mt-1">{s.label}</div>
            <div className="text-[11px] text-muted-foreground/80 mt-2">{s.trend}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold">Recent prescription cases</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Doctor remains responsible for final validation on every case.</p>
          </div>
          <Link href="/doctor/prescriptions" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
            View all <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
              <tr>
                <th className="px-5 py-3 font-semibold">Patient</th>
                <th className="px-5 py-3 font-semibold">Diagnosis</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Risk</th>
                <th className="px-5 py-3 font-semibold">Last update</th>
                <th className="px-5 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {prescriptions.map((rx) => {
                const p = patientById(rx.patientId);
                const stMeta = statusMeta[rx.status];
                const rkMeta = riskMeta[rx.risk];
                return (
                  <tr key={rx.id} className="hover:bg-muted/40 transition-smooth">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold">{p?.name}</div>
                      <div className="text-xs text-muted-foreground">{p?.id} · {p?.age}{p?.sex} · {rx.id}</div>
                    </td>
                    <td className="px-5 py-3.5">{rx.diagnosis}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${stMeta.cls}`}>{stMeta.label}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${rkMeta.cls}`}>{rkMeta.label}</span>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{rx.lastUpdate}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href="/doctor/prescriptions" className="inline-flex items-center gap-1 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-smooth">
                        Review <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
