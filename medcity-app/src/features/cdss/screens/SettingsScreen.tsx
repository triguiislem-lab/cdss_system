import { useState } from "react";
import { Save, Brain, ShieldAlert, Database, Network, Users, Download } from "lucide-react";
import type { Severity } from "@/lib/mock-data";
import { severityMeta, severityOrder } from "@/lib/clinical-ui";
import { useToast } from "@/hooks/use-toast";
import { SettingsCard as Card, SettingsRow as Row, SettingsToggle as Toggle } from "@/features/cdss/components/SettingsPrimitives";
import { useI18n } from "@/i18n/I18nProvider";

export default function CdssSettingsPage() {
  const { t } = useI18n();
  const [model, setModel] = useState("MedCity Connect LLM v3.2.1");
  const [drugDb, setDrugDb] = useState("Lexicomp + RxNorm (combined)");
  const [kgSource, setKgSource] = useState("SNOMED CT + DrugBank");
  const [thresholds, setThresholds] = useState<Record<Severity, boolean>>({
    critical: true,
    major: true,
    moderate: true,
    minor: false,
    info: false,
  });
  const [rules, setRules] = useState({
    requireOverrideJustification: true,
    blockValidationOnMissingData: true,
    requireINRForAnticoagulants: true,
    showConfidenceScores: true,
  });
  const { toast } = useToast();

  function downloadFile(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("settings.subtitle")}
        </p>
      </div>

      <Card icon={Brain} title={t("settings.modelConfig")} desc={t("settings.modelDesc")}>
        <Row label={t("settings.modelVersion")}>
          <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-md border border-input bg-card px-3 py-2 text-sm">
            <option>MedCity Connect LLM v3.2.1</option>
            <option>MedCity Connect LLM v3.2.0</option>
            <option>MedCity Connect LLM v3.1.4</option>
          </select>
        </Row>
        <Toggle label={t("settings.showConfidence")} checked={rules.showConfidenceScores} onChange={(value) => setRules((current) => ({ ...current, showConfidenceScores: value }))} />
      </Card>

      <Card icon={ShieldAlert} title={t("settings.safetyRules")} desc={t("settings.safetyDesc")}>
        <Toggle label={t("settings.requireOverride")} checked={rules.requireOverrideJustification} onChange={(value) => setRules((current) => ({ ...current, requireOverrideJustification: value }))} />
        <Toggle label={t("settings.blockMissing")} checked={rules.blockValidationOnMissingData} onChange={(value) => setRules((current) => ({ ...current, blockValidationOnMissingData: value }))} />
        <Toggle label={t("settings.requireInr")} checked={rules.requireINRForAnticoagulants} onChange={(value) => setRules((current) => ({ ...current, requireINRForAnticoagulants: value }))} />
      </Card>

      <Card icon={ShieldAlert} title={t("settings.thresholds")} desc={t("settings.thresholdsDesc")}>
        <div className="grid sm:grid-cols-5 gap-2">
          {severityOrder.map((sev) => {
            const meta = severityMeta[sev];
            const active = thresholds[sev];
            return (
              <button
                key={sev}
                onClick={() => setThresholds((current) => ({ ...current, [sev]: !current[sev] }))}
                className={`rounded-lg border px-3 py-2.5 text-left transition-smooth ${active ? `${meta.bg} ${meta.border} ${meta.text}` : "bg-card border-border text-muted-foreground"}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                  <span className="text-xs font-semibold uppercase">{meta.label}</span>
                </div>
                <div className="text-[11px] mt-1">{active ? t("settings.surfaced") : t("settings.hidden")}</div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card icon={Database} title={t("settings.drugDb")} desc={t("settings.drugDbDesc")}>
        <Row label={t("settings.activeSource")}>
          <select value={drugDb} onChange={(e) => setDrugDb(e.target.value)} className="rounded-md border border-input bg-card px-3 py-2 text-sm">
            <option>Lexicomp + RxNorm (combined)</option>
            <option>FDA Orange Book</option>
            <option>BNF (UK)</option>
            <option>Vidal (FR)</option>
          </select>
        </Row>
      </Card>

      <Card icon={Network} title={t("settings.kgSource")} desc={t("settings.kgDesc")}>
        <Row label={t("settings.activeSource")}>
          <select value={kgSource} onChange={(e) => setKgSource(e.target.value)} className="rounded-md border border-input bg-card px-3 py-2 text-sm">
            <option>SNOMED CT + DrugBank</option>
            <option>UMLS Metathesaurus</option>
            <option>Custom in-house graph</option>
          </select>
        </Row>
      </Card>

      <Card icon={Users} title={t("settings.roles")} desc={t("settings.rolesDesc")}>
        <ul className="divide-y divide-border text-sm">
          {[
            { name: "Dr. Jordan Chen", role: "Prescriber · Admin" },
            { name: "Dr. Priya Patel", role: "Prescriber" },
            { name: "Sam Reyes, RN", role: "Pharmacist reviewer" },
            { name: "Compliance team", role: "Audit (read-only)" },
          ].map((user) => (
            <li key={user.name} className="flex items-center justify-between py-2.5">
              <span className="font-medium">{user.name}</span>
              <span className="text-xs text-muted-foreground">{user.role}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card icon={Download} title={t("settings.exportTitle")} desc={t("settings.exportDesc")}>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              downloadFile("audit-log.csv", "section,status\ncdss,enabled\n", "text/csv;charset=utf-8;");
              toast({ title: t("settings.auditPreparedTitle"), description: t("settings.auditPreparedDescription") });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted transition-smooth"
          >
            <Download className="h-4 w-4" /> {t("settings.exportAudit")}
          </button>
          <button
            onClick={() => {
              const payload = JSON.stringify({ model, drugDb, kgSource, thresholds, rules }, null, 2);
              downloadFile("prescription-settings.json", payload, "application/json;charset=utf-8;");
              toast({ title: t("settings.settingsPreparedTitle"), description: t("settings.settingsPreparedDescription") });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted transition-smooth"
          >
            <Download className="h-4 w-4" /> {t("settings.exportRx")}
          </button>
        </div>
      </Card>

      <div className="flex justify-end">
        <button
          onClick={() =>
            toast({
              title: t("settings.savedTitle"),
              description: t("settings.savedDescription"),
            })
          }
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-card hover:bg-primary/90 transition-smooth"
        >
          <Save className="h-4 w-4" /> {t("settings.saveChanges")}
        </button>
      </div>
    </div>
  );
}
