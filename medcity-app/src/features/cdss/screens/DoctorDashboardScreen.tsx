import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  ShieldAlert,
  Users,
} from "lucide-react";

import { LoadingState } from "@/components/molecules/LoadingState";
import { riskMeta, statusMeta } from "@/lib/clinical-ui";
import { listPatients, listPrescriptions } from "@/lib/backend-api";
import type { Patient, PrescriptionCase } from "@/lib/mock-data";

const accentMap = {
  info: "bg-info-soft text-info",
  critical: "bg-critical-soft text-critical",
  success: "bg-success-soft text-success",
  primary: "bg-primary-soft text-primary",
} as const;

function Dashboard() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [apiPatients, apiPrescriptions] = await Promise.all([
          listPatients(),
          listPrescriptions(),
        ]);
        setPatients(apiPatients);
        setPrescriptions(apiPrescriptions);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const patientById = (id: string) => patients.find((patient) => patient.id === id);

  const stats = useMemo(() => [
    {
      key: "patients",
      label: "Tracked patients",
      value: patients.length,
      icon: Users,
      accent: "primary",
      helper: "Backend patients",
    },
    {
      key: "pending",
      label: "Pending prescriptions",
      value: prescriptions.filter((rx) => rx.status === "pending_review").length,
      icon: ClipboardList,
      accent: "info",
      helper: "Waiting doctor review",
    },
    {
      key: "highRisk",
      label: "High-risk prescriptions",
      value: prescriptions.filter((rx) => rx.risk === "high").length,
      icon: ShieldAlert,
      accent: "critical",
      helper: "Needs attention",
    },
    {
      key: "validated",
      label: "Validated prescriptions",
      value: prescriptions.filter((rx) => rx.status === "validated").length,
      icon: CheckCircle2,
      accent: "success",
      helper: "Confirmed cases",
    },
  ] as const, [patients, prescriptions]);

  const recentPrescriptions = prescriptions.slice(0, 6);

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clinical dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Patients and prescriptions synchronized from the NestJS backend.
          </p>
        </div>
        <Link
          href="/doctor/prescription/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-card transition-smooth hover:bg-primary/90"
        >
          New prescription <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {loading ? (
        <LoadingState
          title="Chargement du dashboard clinique"
          subtitle="Synchronisation des patients et prescriptions depuis NestJS..."
        />
      ) : (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
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

          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold">Recent prescription cases</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Data displayed here is fetched from the NestJS prescriptions endpoint.
                </p>
              </div>
              <Link href="/doctor/prescriptions" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            {recentPrescriptions.length ? (
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
                    {recentPrescriptions.map((rx) => {
                      const patient = patientById(rx.patientId);
                      const status = statusMeta[rx.status];
                      const risk = riskMeta[rx.risk];

                      return (
                        <tr key={rx.id} className="hover:bg-muted/40 transition-smooth">
                          <td className="px-5 py-3.5">
                            <div className="font-semibold">{patient?.name ?? "Patient inconnu"}</div>
                            <div className="text-xs text-muted-foreground">
                              {[patient?.id, patient ? `${patient.age}${patient.sex}` : undefined, rx.id].filter(Boolean).join(" - ")}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">{rx.diagnosis}</td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.cls}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${risk.cls}`}>
                              {risk.label}
                            </span>
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
            ) : (
              <div className="p-8 text-sm text-muted-foreground">
                No prescription case is available yet.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Dashboard;
