import { useState } from "react";
import type { SafetyAlert } from "@/lib/mock-data";
import { severityMeta, severityOrder } from "@/lib/clinical-ui";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Replace,
  SlidersHorizontal,
  Eye,
  ShieldOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/I18nProvider";

const sevIcons = {
  critical: AlertTriangle,
  major: AlertCircle,
  moderate: AlertCircle,
  minor: Info,
  info: CheckCircle2,
} as const;

export type SafetyPanelAction = "replace" | "adjust_dose" | "monitor" | "override";

export type SafetyPanelDecision = {
  action: SafetyPanelAction;
  reason?: string;
  persisted?: boolean;
};

type SafetyPanelProps = {
  alerts: SafetyAlert[];
  decisions?: Record<string, SafetyPanelDecision>;
  onAction?: (action: SafetyPanelAction, alert: SafetyAlert, reason?: string) => void | Promise<void>;
};

export function SafetyPanel({ alerts, decisions = {}, onAction }: SafetyPanelProps) {
  const { t } = useI18n();
  const [overrideOpen, setOverrideOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const grouped = severityOrder.map((sev) => ({ sev, items: alerts.filter((a) => a.severity === sev) }));
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{t("safety.title")}</h3>
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-critical text-critical-foreground px-2.5 py-0.5 text-xs font-semibold animate-pulse-critical">
              <AlertTriangle className="h-3 w-3" /> {criticalCount} {t("safety.critical")}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t("safety.validationHelp")}</p>
      </div>

      <div className="max-h-[calc(100vh-12rem)] overflow-y-auto scrollbar-thin divide-y divide-border">
        {alerts.length === 0 && (
          <div className="p-5 text-sm text-muted-foreground">
            {t("safety.emptyCatalog")}
          </div>
        )}
        {grouped.map(({ sev, items }) => {
          if (items.length === 0) return null;
          const meta = severityMeta[sev];
          const Icon = sevIcons[sev];
          return (
            <div key={sev} className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-2 w-2 rounded-full ${meta.dot}`} />
                <span className="text-xs font-semibold uppercase tracking-wider">{meta.label}</span>
                <span className="text-xs text-muted-foreground">({items.length})</span>
              </div>
              {items.map((a) => {
                const canReplace = Boolean(a.alternative?.trim());
                const canAdjustDose = hasDoseGuidance(a.recommendedAction);
                const canMonitor = a.severity !== "info";
                const canOverride = a.severity === "critical" || a.severity === "major";
                const hasOperationalAction = canReplace || canAdjustDose || canMonitor || canOverride;
                return (
                <article key={a.id} className={`rounded-lg border ${meta.border} ${meta.bg} p-3.5 ${sev === "critical" ? "ring-2 " + meta.ring : ""}`}>
                  <div className="flex items-start gap-2">
                    <Icon className={`h-4 w-4 mt-0.5 flex-none ${meta.text}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${meta.text}`}>{a.title}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {a.drugsInvolved.map((d) => (
                          <span key={d} className="inline-flex rounded bg-card border border-border px-1.5 py-0.5 text-[11px] font-medium">{d}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 text-xs text-foreground/90">
                    <div>
                      <div className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">{t("safety.risk")}</div>
                      <p className="mt-0.5">{a.explanation}</p>
                    </div>
                    <div>
                      <div className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">{t("safety.recommendedAction")}</div>
                      <p className="mt-0.5">{a.recommendedAction}</p>
                    </div>
                    {a.alternative && (
                      <div className="rounded-md bg-card border border-border px-2.5 py-1.5">
                        <div className="font-semibold text-[11px] uppercase tracking-wider text-success">{t("safety.suggestedAlternative")}</div>
                        <p className="text-foreground mt-0.5">{a.alternative}</p>
                      </div>
                    )}
                    {a.evidenceUrl ? (
                      <a
                        href={a.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> {a.evidence}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          toast({
                            title: t("safety.evidenceTitle"),
                            description: a.evidence,
                          })
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Source : {a.evidence}
                      </button>
                    )}
                  </div>

                  {hasOperationalAction ? <div className="mt-3 grid grid-cols-2 gap-1.5">
                    {canReplace && <ActionBtn
                      icon={Replace}
                      onClick={() => {
                        if (onAction) {
                          void onAction("replace", a);
                          return;
                        }
                        toast({
                          title: t("safety.replaceSuggestedTitle"),
                          description: a.alternative ?? a.recommendedAction,
                        });
                      }}
                    >
                      {t("safety.replaceDrug")}
                    </ActionBtn>}
                    {canAdjustDose && <ActionBtn
                      icon={SlidersHorizontal}
                      onClick={() => {
                        if (onAction) {
                          void onAction("adjust_dose", a);
                          return;
                        }
                        toast({
                          title: t("safety.doseGuidanceTitle"),
                          description: a.recommendedAction,
                        });
                      }}
                    >
                      {t("safety.adjustDose")}
                    </ActionBtn>}
                    {canMonitor && <ActionBtn
                      icon={Eye}
                      onClick={() => {
                        if (onAction) {
                          void onAction("monitor", a);
                          return;
                        }
                        toast({
                          title: t("safety.monitoringTitle"),
                          description: t("safety.monitoringDescription", { title: a.title }),
                        });
                      }}
                    >
                      {t("safety.monitor")}
                    </ActionBtn>}
                    {canOverride && <ActionBtn icon={ShieldOff} onClick={() => setOverrideOpen(overrideOpen === a.id ? null : a.id)} variant="warning">
                      {t("safety.override")}
                    </ActionBtn>}
                  </div> : (
                    <div className="mt-3 rounded-md border border-border/70 bg-card/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                      {t("safety.noActionRequired")}
                    </div>
                  )}

                  {decisions[a.id] && (
                    <div className="mt-2 rounded-md border border-success/30 bg-success-soft/60 px-2.5 py-1.5 text-[11px] text-success">
                      {t("safety.actionRecorded", {
                        action: decisionLabel(decisions[a.id].action, t),
                        status: t(decisions[a.id].persisted ? "safety.actionPersisted" : "safety.actionPending"),
                      })}
                    </div>
                  )}

                  {overrideOpen === a.id && (
                    <div className="mt-3 rounded-md border border-warning/40 bg-warning-soft/50 p-3">
                      <div className="text-[11px] font-semibold text-warning-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> {t("safety.overrideHelp")}
                      </div>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value.slice(0, 500))}
                        rows={3}
                        maxLength={500}
                        placeholder={t("safety.overridePlaceholder")}
                        className="mt-2 w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring/20"
                      />
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-muted-foreground">{reason.length}/500</span>
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => { setOverrideOpen(null); setReason(""); }} className="rounded-md border border-input bg-card px-2.5 py-1 text-[11px] font-semibold hover:bg-muted">{t("common.cancel")}</button>
                          <button
                            type="button"
                            disabled={reason.trim().length < 20}
                            onClick={() => {
                              if (onAction) {
                                void onAction("override", a, reason.trim());
                              } else {
                                toast({
                                  title: t("safety.overrideRecordedTitle"),
                                  description: t("safety.overrideRecordedDescription"),
                                });
                              }
                              setOverrideOpen(null);
                              setReason("");
                            }}
                            className="rounded-md bg-warning text-warning-foreground px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {t("safety.confirmOverride")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function decisionLabel(action: SafetyPanelAction, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (action === "replace") return t("safety.replaceDrug");
  if (action === "adjust_dose") return t("safety.adjustDose");
  if (action === "monitor") return t("safety.monitor");
  return t("safety.override");
}

function hasDoseGuidance(value: string) {
  return /\b\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*(?:mg|g|mcg|µg|ml|mL|%|UI)\b/i.test(value);
}

function ActionBtn({ icon: Icon, children, onClick, variant = "default" }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; onClick?: () => void; variant?: "default" | "warning" }) {
  const cls = variant === "warning"
    ? "border-warning/40 bg-card text-warning-foreground hover:bg-warning-soft"
    : "border-input bg-card hover:bg-muted";
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-smooth ${cls}`}>
      <Icon className="h-3 w-3" /> {children}
    </button>
  );
}

export { ChevronDown, ChevronUp };
