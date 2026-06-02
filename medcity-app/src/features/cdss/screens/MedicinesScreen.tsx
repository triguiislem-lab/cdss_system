import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Baby,
  Building2,
  ChevronRight,
  FileText,
  Package,
  Pill,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import type { DrugClass, TunisianMedicine } from "@/lib/tunisia-medicines";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void Promise.all([
        listMedicines({
          search: q,
          drugClass: klass === "all" ? undefined : klass,
          limit: 100,
        }),
        listMedicineClasses(),
      ])
        .then(([apiMedicines, apiClasses]) => {
          if (cancelled) return;
          setMedicines(apiMedicines);
          setDrugClasses(apiClasses);
          setSelectedId((current) =>
            current && !apiMedicines.some((medicine) => medicine.id === current)
              ? null
              : current,
          );
        })
        .catch((apiError: unknown) => {
          if (!cancelled) {
            setError(apiError instanceof Error ? apiError.message : "Erreur API");
            setMedicines([]);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [klass, q]);

  const selected = medicines.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("medicines.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("medicines.subtitle", { count: medicines.length })}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
          <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("medicines.searchPlaceholder")}
              className="flex-1 bg-transparent outline-none"
            />
          </div>
          <select
            value={klass}
            onChange={(e) => setKlass(e.target.value as DrugClass | "all")}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">{t("medicines.allClasses")}</option>
            {drugClasses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <LoadingRows />
        ) : error ? (
          <div className="p-12 text-center text-sm text-critical">{error}</div>
        ) : medicines.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            {t("medicines.empty")}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {medicines.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => setSelectedId(m.id)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-smooth text-left"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary flex-none">
                    <Pill className="h-4 w-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{medicineTitle(m)}</span>
                      {m.amm && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          AMM {m.amm}
                        </span>
                      )}
                      {m.genericStatus && (
                        <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium">
                          {m.genericStatus}
                        </span>
                      )}
                      {m.veicStatus && (
                        <span className="inline-flex rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                          {m.veicStatus}
                        </span>
                      )}
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pregMeta[m.pregnancy]}`}>
                        {t("medicines.pregnancy")}: {m.pregnancy}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      <span className="text-foreground">{m.dci}</span>
                      {suffixInline([m.dosage, m.form, m.presentation])}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {formatInline([m.drugClass, m.therapeuticSubclass, labsLabel(m), priceLabel(m)])}
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
          <div className="w-full sm:max-w-3xl rounded-t-xl sm:rounded-xl border border-border bg-card shadow-elevated max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-border bg-card">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg truncate">{medicineTitle(selected)}</h3>
                  {selected.amm && (
                    <span className="font-mono text-xs text-muted-foreground">
                      AMM {selected.amm}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatInline([selected.dci, selected.drugClass, selected.therapeuticSubclass])}
                </p>
              </div>
              <button onClick={() => setSelectedId(null)} className="rounded-md p-2 hover:bg-muted" aria-label={t("common.close")}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid sm:grid-cols-2 gap-3">
                <InfoCard label="Statut" value={selected.genericStatus} />
                <InfoCard label="VEIC" value={selected.veicStatus} />
                <InfoCard label="Tableau" value={selected.tableau} />
                <InfoCard label="Date AMM" value={selected.ammDate} />
              </div>

              <Section icon={Package} title={t("medicines.formsTitle")}>
                <div className="text-sm space-y-1">
                  <Row label="Dosage" value={selected.dosage} />
                  <Row label="Forme" value={selected.form} />
                  <Row label="Présentation" value={selected.presentation} />
                  <Row label="Conditionnement" value={formatInline([selected.primaryPackaging, selected.packagingSpecification])} />
                </div>
              </Section>

              <Section icon={Building2} title={t("medicines.labsTitle")}>
                <div className="text-sm">{labsLabel(selected) || "Non renseigné"}</div>
              </Section>

              <Section icon={FileText} title={t("medicines.indication")}>
                <p className="text-sm whitespace-pre-line">{selected.indication}</p>
              </Section>

              <Section icon={Activity} title={t("medicines.adultDosage")}>
                <p className="text-sm">{selected.posologyAdult}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  {selected.renalAdjust && (
                    <span className="rounded-full border border-warning/40 bg-warning-soft text-warning-foreground px-2 py-0.5 font-semibold">
                      {t("medicines.renalAdjust")}
                    </span>
                  )}
                  {selected.hepaticAdjust && (
                    <span className="rounded-full border border-warning/40 bg-warning-soft text-warning-foreground px-2 py-0.5 font-semibold">
                      {t("medicines.hepaticAdjust")}
                    </span>
                  )}
                </div>
              </Section>

              <Section icon={AlertTriangle} title={t("medicines.contraindications")}>
                {selected.contraindications.length > 0 ? (
                  <ul className="text-sm space-y-1">
                    {selected.contraindications.map((c) => (
                      <li key={c} className="text-critical">
                        - {c}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Non renseigné</p>
                )}
              </Section>

              <Section icon={Baby} title={t("medicines.pregnancy")}>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${pregMeta[selected.pregnancy]}`}>
                  {selected.pregnancy}
                </span>
              </Section>

              <Section icon={ShieldCheck} title={t("medicines.reimbursement")}>
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoCard label="Catégorie" value={selected.reimbursementCategory || selected.reimbursement} />
                  <InfoCard label="Taux" value={formatPercent(selected.reimbursementRatePercent)} />
                  <InfoCard label="Prix public" value={priceRangeLabel(selected)} />
                  <InfoCard label="Tarif référence" value={moneyLabel(selected.referenceTariffTnd)} />
                </div>
              </Section>

              <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground">
                {formatInline([
                  selected.sourceReference,
                  selected.sourceSystems?.join(", "),
                  selected.rcpUrl ? `RCP: ${selected.rcpUrl}` : "",
                  selected.noticeUrl ? `Notice: ${selected.noticeUrl}` : "",
                ]) || t("medicines.priceSource", { price: selected.priceTndApprox.toFixed(2) })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="divide-y divide-border" aria-busy="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-5 py-3.5">
          <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 rounded bg-muted animate-pulse" />
            <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
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

function InfoCard({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value || "Non renseigné"}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="font-semibold">{label}: </span>
      {value}
    </div>
  );
}

function medicineTitle(medicine: TunisianMedicine) {
  return medicine.localProductName || medicine.brands[0] || medicine.dci;
}

function labsLabel(medicine: TunisianMedicine) {
  return medicine.laboratories.filter(Boolean).join(" · ");
}

function priceLabel(medicine: TunisianMedicine) {
  return priceRangeLabel(medicine) || moneyLabel(medicine.priceTndApprox);
}

function priceRangeLabel(medicine: TunisianMedicine) {
  if (medicine.publicPriceMinTnd !== undefined && medicine.publicPriceMaxTnd !== undefined) {
    if (medicine.publicPriceMinTnd === medicine.publicPriceMaxTnd) return moneyLabel(medicine.publicPriceMinTnd);
    return `${moneyLabel(medicine.publicPriceMinTnd)} - ${moneyLabel(medicine.publicPriceMaxTnd)}`;
  }
  return moneyLabel(medicine.publicPriceMinTnd ?? medicine.publicPriceMaxTnd);
}

function moneyLabel(value?: number) {
  if (value === undefined || value <= 0) return "";
  return `${value.toFixed(3)} TND`;
}

function formatPercent(value?: number) {
  if (value === undefined) return undefined;
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

function formatInline(values: Array<string | undefined>) {
  const filtered = values.filter((value): value is string => Boolean(value?.trim()));
  return filtered.join(" · ");
}

function suffixInline(values: Array<string | undefined>) {
  const formatted = formatInline(values);
  return formatted ? ` · ${formatted}` : "";
}

export default MedicinesPage;
