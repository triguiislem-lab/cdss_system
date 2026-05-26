import { create } from "zustand";
import { persist } from "zustand/middleware";
import { tunisianMedicines, type TunisianMedicine, type DrugClass } from "@/lib/tunisia-medicines";

export type ContributionKind = "new_medicine" | "correction" | "note";
export type ContributionStatus = "pending" | "validated" | "refused";

export interface MedicineContribution {
  id: string;
  kind: ContributionKind;
  status: ContributionStatus;
  authorEmail: string;
  authorName: string;
  createdAt: string;
  // Target: for correction/note, references existing medicine. For new_medicine, optional.
  targetMedicineId?: string;
  targetMedicineDci?: string;
  // For correction: field name + old + new value
  field?: string;
  oldValue?: string;
  newValue?: string;
  // For note: free text
  note?: string;
  // For new_medicine: full payload
  newMedicine?: Partial<TunisianMedicine> & { dci: string };
  // Justification / source provided by author
  rationale?: string;
  // Review info
  reviewerEmail?: string;
  reviewerName?: string;
  reviewedAt?: string;
  refusalReason?: string;
}

interface ContributionsState {
  items: MedicineContribution[];
  addedMedicines: TunisianMedicine[]; // medicines created via validated contributions
  add: (c: Omit<MedicineContribution, "id" | "createdAt" | "status">) => string;
  validate: (id: string, reviewer: { email: string; name: string }) => void;
  refuse: (id: string, reviewer: { email: string; name: string }, reason: string) => void;
  remove: (id: string) => void;
}

const seed: MedicineContribution[] = [
  {
    id: "ctr-1001",
    kind: "correction",
    status: "pending",
    authorEmail: "doctor@medcity.tn",
    authorName: "Dr. Jordan Chen",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    targetMedicineId: "TN-003",
    targetMedicineDci: "Paracétamol",
    field: "posologyAdult",
    oldValue: "500 mg à 1 g x 3-4/jour, max 4 g/24 h.",
    newValue: "500 mg à 1 g toutes les 6 h, max 3 g/24 h chez sujet âgé ou < 50 kg.",
    rationale: "ANSM 2023 — réduction de la dose max chez patients à risque hépatique.",
  },
  {
    id: "ctr-1002",
    kind: "note",
    status: "pending",
    authorEmail: "doctor@medcity.tn",
    authorName: "Dr. Jordan Chen",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    targetMedicineId: "TN-007",
    targetMedicineDci: "Metformine",
    note: "Suspendre 48 h avant injection de produit de contraste iodé chez patient avec DFG entre 30-60.",
    rationale: "Recommandation SFR / HAS 2022.",
  },
  {
    id: "ctr-1003",
    kind: "new_medicine",
    status: "validated",
    authorEmail: "doctor@medcity.tn",
    authorName: "Dr. Jordan Chen",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
    reviewerEmail: "admin@medcity.tn",
    reviewerName: "Dr. Amira Ben Salah",
    reviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 80).toISOString(),
    newMedicine: {
      dci: "Bisoprolol",
      brands: ["Concor", "Cardicor"],
      atcCode: "C07AB07",
      drugClass: "Cardiologie",
      forms: ["2.5 mg cp.", "5 mg cp.", "10 mg cp."],
      laboratories: ["Merck", "SAIPH"],
      reimbursement: "100%",
      indication: "HTA, insuffisance cardiaque chronique stable.",
      contraindications: ["Asthme sévère", "BAV II/III non appareillé", "Bradycardie < 50/min"],
      posologyAdult: "1.25 à 10 mg/jour PO en 1 prise le matin.",
      pregnancy: "Précaution",
      renalAdjust: true,
      hepaticAdjust: false,
      priceTndApprox: 12.4,
    },
    rationale: "Molécule largement utilisée en Tunisie, absente du référentiel.",
  },
  {
    id: "ctr-1004",
    kind: "correction",
    status: "refused",
    authorEmail: "doctor@medcity.tn",
    authorName: "Dr. Jordan Chen",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 200).toISOString(),
    reviewerEmail: "admin@medcity.tn",
    reviewerName: "Dr. Amira Ben Salah",
    reviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 180).toISOString(),
    targetMedicineId: "TN-004",
    targetMedicineDci: "Ibuprofène",
    field: "pregnancy",
    oldValue: "Contre-indiqué",
    newValue: "Précaution",
    refusalReason: "Source insuffisante. Ibuprofène reste contre-indiqué au 3e trimestre (risque fœtal documenté).",
  },
];

export const useContributionsStore = create<ContributionsState>()(
  persist(
    (set, get) => ({
      items: seed,
      addedMedicines: [],
      add: (c) => {
        const id = `ctr-${Date.now()}`;
        const item: MedicineContribution = {
          ...c,
          id,
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        set({ items: [item, ...get().items] });
        return id;
      },
      validate: (id, reviewer) => {
        const items = get().items.map((it) => {
          if (it.id !== id) return it;
          return {
            ...it,
            status: "validated" as const,
            reviewerEmail: reviewer.email,
            reviewerName: reviewer.name,
            reviewedAt: new Date().toISOString(),
          };
        });
        // If new medicine validated, register it
        const target = items.find((x) => x.id === id);
        let added = get().addedMedicines;
        if (target?.kind === "new_medicine" && target.newMedicine?.dci) {
          const nm = target.newMedicine;
          const newMed: TunisianMedicine = {
            id: `TN-CTR-${id}`,
            dci: nm.dci,
            brands: nm.brands ?? [],
            atcCode: nm.atcCode ?? "—",
            drugClass: (nm.drugClass as DrugClass) ?? "Antalgique",
            forms: nm.forms ?? [],
            laboratories: nm.laboratories ?? [],
            reimbursement: nm.reimbursement ?? "0%",
            indication: nm.indication ?? "",
            contraindications: nm.contraindications ?? [],
            posologyAdult: nm.posologyAdult ?? "",
            pregnancy: nm.pregnancy ?? "Précaution",
            renalAdjust: nm.renalAdjust ?? false,
            hepaticAdjust: nm.hepaticAdjust ?? false,
            priceTndApprox: nm.priceTndApprox ?? 0,
          };
          added = [...added, newMed];
        }
        set({ items, addedMedicines: added });
      },
      refuse: (id, reviewer, reason) => {
        set({
          items: get().items.map((it) =>
            it.id === id
              ? {
                  ...it,
                  status: "refused" as const,
                  reviewerEmail: reviewer.email,
                  reviewerName: reviewer.name,
                  reviewedAt: new Date().toISOString(),
                  refusalReason: reason,
                }
              : it,
          ),
        });
      },
      remove: (id) => set({ items: get().items.filter((x) => x.id !== id) }),
    }),
    { name: "medcity-connect-contributions", version: 1 },
  ),
);

// Helper: get all medicines (base + validated contributed)
export function useAllMedicines(): TunisianMedicine[] {
  const added = useContributionsStore((s) => s.addedMedicines);
  return [...tunisianMedicines, ...added];
}

export const editableFields: { key: keyof TunisianMedicine; label: string }[] = [
  { key: "dci", label: "DCI" },
  { key: "brands", label: "Spécialités (séparées par virgule)" },
  { key: "atcCode", label: "Code ATC" },
  { key: "drugClass", label: "Classe thérapeutique" },
  { key: "forms", label: "Formes & dosages (virgule)" },
  { key: "laboratories", label: "Laboratoires (virgule)" },
  { key: "reimbursement", label: "Remboursement CNAM" },
  { key: "indication", label: "Indication" },
  { key: "contraindications", label: "Contre-indications (virgule)" },
  { key: "posologyAdult", label: "Posologie adulte" },
  { key: "pregnancy", label: "Grossesse" },
  { key: "priceTndApprox", label: "Prix (TND)" },
];



