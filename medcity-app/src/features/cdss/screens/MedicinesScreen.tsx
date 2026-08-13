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
import { getMedicine, listMedicineClasses, listMedicinesPage } from "@/lib/backend-api";

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
  const [selectedMedicine, setSelectedMedicine] = useState<TunisianMedicine | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [medicines, setMedicines] = useState<TunisianMedicine[]>([]);
  const [drugClasses, setDrugClasses] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void Promise.all([
        listMedicinesPage({
          search: q,
          drugClass: klass === "all" ? undefined : klass,
          page,
          limit: 25,
        }),
        listMedicineClasses(),
      ])
        .then(([medicinePage, apiClasses]) => {
          if (cancelled) return;
          const apiMedicines = medicinePage.data;
          setMedicines(apiMedicines);
          setDrugClasses(apiClasses);
          setTotal(medicinePage.meta.total);
          setTotalPages(medicinePage.meta.totalPages);
          setSelectedId((current) => {
            if (current && !apiMedicines.some((medicine) => medicine.id === current)) {
              setSelectedMedicine(null);
              return null;
            }
            return current;
          });
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
  }, [klass, page, q]);

  useEffect(() => {
    setPage(1);
  }, [klass, q]);

  const selected =
    selectedMedicine ?? medicines.find((medicine) => medicine.id === selectedId) ?? null;

  async function openMedicine(medicine: TunisianMedicine) {
    setSelectedId(medicine.id);
    setSelectedMedicine(medicine);
    setDetailLoading(true);
    setDetailError(null);
    try {
      setSelectedMedicine(await getMedicine(medicine.id));
    } catch (apiError) {
      setDetailError(
        apiError instanceof Error ? apiError.message : "Détails médicaux indisponibles",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function closeMedicine() {
    setSelectedId(null);
    setSelectedMedicine(null);
    setDetailError(null);
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("medicines.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("medicines.subtitle", { count: total })}
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
          <>
            <ul className="divide-y divide-border">
            {medicines.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => void openMedicine(m)}
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
                        {lowerLabel(t("medicines.pregnancy"))}: {m.pregnancy}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 whitespace-normal break-words">
                      <span className="text-foreground">{m.dci}</span>
                      {suffixInline([m.dosage, m.form, m.presentation])}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 whitespace-normal break-words">
                      {formatInline([m.drugClass, m.therapeuticSubclass, labsLabel(m), priceLabel(m)])}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-none" />
                </button>
              </li>
            ))}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm">
              <span className="text-muted-foreground">
                Page {page} sur {totalPages} · {total} médicaments
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-md border border-border px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Précédent
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="rounded-md border border-border px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Suivant
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeMedicine();
          }}
        >
          <div className="w-full sm:max-w-3xl rounded-t-xl sm:rounded-xl border border-border bg-card shadow-elevated max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-border bg-card">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg whitespace-normal break-words">{medicineTitle(selected)}</h3>
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
              <button onClick={closeMedicine} className="rounded-md p-2 hover:bg-muted" aria-label={t("common.close")}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {detailLoading && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Chargement des détails médicaux Firebase…
                </div>
              )}
              {detailError && (
                <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning-foreground">
                  {detailError}. Les informations du catalogue restent affichées.
                </div>
              )}
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
                <div className="text-sm">{labsLabel(selected) || "non renseigné"}</div>
              </Section>

              <Section icon={FileText} title={t("medicines.indication")}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {selected.indication || "non renseigné"}
                </p>
              </Section>

              <Section icon={Activity} title={t("medicines.adultDosage")}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {selected.posologyAdult || "non renseigné"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  {selected.renalAdjust && (
                    <span className="rounded-full border border-warning/40 bg-warning-soft text-warning-foreground px-2 py-0.5 font-semibold">
                      {lowerLabel(t("medicines.renalAdjust"))}
                    </span>
                  )}
                  {selected.hepaticAdjust && (
                    <span className="rounded-full border border-warning/40 bg-warning-soft text-warning-foreground px-2 py-0.5 font-semibold">
                      {lowerLabel(t("medicines.hepaticAdjust"))}
                    </span>
                  )}
                </div>
              </Section>

              <Section icon={AlertTriangle} title={t("medicines.contraindications")}>
                {selected.contraindications.length > 0 ? (
                  <ul className="text-sm space-y-1">
                    {selected.contraindications.map((c) => (
                      <li key={c} className="text-critical break-words">
                        - {c}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">non renseigné</p>
                )}
              </Section>

              <Section icon={AlertTriangle} title="effets indésirables">
                <DetailList values={selected.adverseEffects} />
              </Section>

              <Section icon={ShieldCheck} title="interactions médicamenteuses">
                <DetailList values={selected.interactions} />
              </Section>

              <Section icon={AlertTriangle} title="mises en garde et précautions">
                <DetailList values={selected.warnings} />
              </Section>

              <Section icon={Baby} title="populations spéciales">
                <DetailList values={selected.specialPopulations} />
              </Section>

              <Section icon={Activity} title="surdosage">
                <DetailList values={selected.overdose} />
              </Section>

              <Section icon={FileText} title="documents réglementaires">
                {toHttpUrl(selected.rcpUrl) ? (
                  <a
                    href={toHttpUrl(selected.rcpUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-md border border-primary/30 bg-primary-soft px-3 py-2 text-sm font-semibold text-primary hover:underline"
                  >
                    Consulter le RCP
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">RCP non disponible en lien direct</p>
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
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {lowerLabel(title)}
      </div>
      {children}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="text-[11px] font-semibold text-muted-foreground">{lowerLabel(label)}</div>
      <div className="mt-0.5 text-sm font-semibold">{value || "non renseigné"}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="font-semibold">{lowerLabel(label)}: </span>
      {value}
    </div>
  );
}

function DetailList({ values }: { values?: string[] }) {
  if (!values?.length) {
    return <p className="text-sm text-muted-foreground">non renseigné</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {values.map((value) => (
        <li key={value} className="whitespace-pre-wrap break-words">
          - {value}
        </li>
      ))}
    </ul>
  );
}

function toHttpUrl(value?: string) {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (/^www\./i.test(candidate)) return `https://${candidate}`;
  return undefined;
}

function lowerLabel(value: string) {
  return value.toLocaleLowerCase();
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
