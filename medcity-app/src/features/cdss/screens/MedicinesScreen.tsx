import { useEffect, useMemo, useState } from "react";
import { Search, Pill, Building2, FileText, AlertTriangle, Baby, Activity, ChevronRight, X } from "lucide-react";
import type { TunisianMedicine, DrugClass } from "@/lib/tunisia-medicines";
import { useI18n } from "@/i18n/I18nProvider";
import { listMedicineClasses, listMedicines } from "@/lib/backend-api";

const pregMeta: Record<TunisianMedicine["pregnancy"], string> = {
  Autorisé: "bg-success-soft text-success border-success/30",
  Précaution: "bg-warning-soft text-warning-foreground border-warning/30",
  "Contre-indiqué": "bg-critical-soft text-critical border-critical/30",
};

function MedicinesPage() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [klass, setKlass] = useState<DrugClass | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [medicines, setMedicines] = useState<TunisianMedicine[]>([]);
  const [drugClasses, setDrugClasses] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      const [apiMedicines, apiClasses] = await Promise.all([
        listMedicines(),
        listMedicineClasses(),
      ]);
      setMedicines(apiMedicines);
      setDrugClasses(apiClasses);
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return medicines.filter((m) => {
      if (klass !== "all" && m.drugClass !== klass) return false;
      if (!s) return true;
      return (
        m.dci.toLowerCase().includes(s) ||
        m.brands.some((b) => b.toLowerCase().includes(s)) ||
        m.atcCode.toLowerCase().includes(s) ||
        m.indication.toLowerCase().includes(s)
      );
    });
  }, [q, klass, medicines]);

  const selected = medicines.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("medicines.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("medicines.subtitle", { count: medicines.length })}</p>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
          <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("medicines.searchPlaceholder")} className="flex-1 bg-transparent outline-none" />
          </div>
          <select value={klass} onChange={(e) => setKlass(e.target.value as DrugClass | "all")} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <option value="all">{t("medicines.allClasses")}</option>
            {drugClasses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">{t("medicines.empty")}</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((m) => (
              <li key={m.id}>
                <button onClick={() => setSelectedId(m.id)} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-smooth text-left">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary flex-none"><Pill className="h-4 w-4" /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{m.dci}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{m.atcCode}</span>
                      <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium">{m.drugClass}</span>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pregMeta[m.pregnancy]}`}>{t("medicines.pregnancy")}: {m.pregnancy}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {t("medicines.tnBrands")}: <span className="text-foreground">{m.brands.join(", ")}</span> · {t("medicines.reimbursement")} {m.reimbursement} · ~{m.priceTndApprox.toFixed(1)} TND
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-none" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedId(null);
          }}
        >
          <div className="w-full sm:max-w-2xl rounded-t-xl sm:rounded-xl border border-border bg-card shadow-elevated max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-border bg-card">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg truncate">{selected.dci}</h3>
                  <span className="font-mono text-xs text-muted-foreground">{selected.atcCode}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{selected.drugClass} · {t("medicines.reimbursement")} {selected.reimbursement}</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="rounded-md p-2 hover:bg-muted" aria-label={t("common.close")}><X className="h-4 w-4" /></button>
            </div>

            <div className="p-5 space-y-5">
              <Section icon={Pill} title={t("medicines.brandsTitle")}>
                <div className="flex flex-wrap gap-1.5">
                  {selected.brands.map((b) => <span key={b} className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium">{b}</span>)}
                </div>
              </Section>

              <Section icon={Building2} title={t("medicines.labsTitle")}>
                <div className="text-sm">{selected.laboratories.join(" · ")}</div>
              </Section>

              <Section icon={FileText} title={t("medicines.formsTitle")}>
                <ul className="text-sm grid sm:grid-cols-2 gap-1">
                  {selected.forms.map((f) => <li key={f}>- {f}</li>)}
                </ul>
              </Section>

              <Section icon={Activity} title={t("medicines.indication")}>
                <p className="text-sm">{selected.indication}</p>
              </Section>

              <Section icon={Pill} title={t("medicines.adultDosage")}>
                <p className="text-sm">{selected.posologyAdult}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  {selected.renalAdjust && <span className="rounded-full border border-warning/40 bg-warning-soft text-warning-foreground px-2 py-0.5 font-semibold">{t("medicines.renalAdjust")}</span>}
                  {selected.hepaticAdjust && <span className="rounded-full border border-warning/40 bg-warning-soft text-warning-foreground px-2 py-0.5 font-semibold">{t("medicines.hepaticAdjust")}</span>}
                </div>
              </Section>

              <Section icon={AlertTriangle} title={t("medicines.contraindications")}>
                <ul className="text-sm space-y-1">
                  {selected.contraindications.map((c) => <li key={c} className="text-critical">- {c}</li>)}
                </ul>
              </Section>

              <Section icon={Baby} title={t("medicines.pregnancy")}>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${pregMeta[selected.pregnancy]}`}>{selected.pregnancy}</span>
              </Section>

              <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground">
                {t("medicines.priceSource", { price: selected.priceTndApprox.toFixed(2) })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      {children}
    </div>
  );
}

export default MedicinesPage;
