import { Pencil, X } from "lucide-react";
import type { Medication } from "@/lib/mock-data";
import type { TunisianMedicine } from "@/lib/tunisia-medicines";

export function PrescriptionMedicationRow({
  med,
  onChange,
  onRemove,
  medicineOptions = [],
  medicineSearchLoading = false,
  selectedMedicine,
  onMedicineSearch,
  onSelectMedicine,
}: {
  med: Medication;
  onChange: (patch: Partial<Medication>) => void;
  onRemove: () => void;
  medicineOptions?: TunisianMedicine[];
  medicineSearchLoading?: boolean;
  selectedMedicine?: TunisianMedicine;
  onMedicineSearch?: (query: string) => void;
  onSelectMedicine?: (medicine: TunisianMedicine) => void;
}) {
  const confColor = med.confidence >= 85 ? "bg-success" : med.confidence >= 65 ? "bg-warning" : "bg-critical";
  const confText = med.confidence >= 85 ? "text-success" : med.confidence >= 65 ? "text-warning-foreground" : "text-critical";
  const statusBadge =
    med.status === "edited"
      ? "bg-info-soft text-info border-info/30"
      : med.status === "validated"
        ? "bg-success-soft text-success border-success/30"
        : med.status === "rejected"
          ? "bg-critical-soft text-critical border-critical/30"
          : "bg-muted text-muted-foreground border-border";
  const statusLabel = med.status === "ai_proposed" ? "AI proposed" : med.status.replace("_", " ");
  const isAiProposed = med.status === "ai_proposed";
  const canSearchMedicines = !isAiProposed && !!onMedicineSearch && !!onSelectMedicine;
  const medicationDetails = (
    <>
      <MedicationField label="Dose" value={med.dose} onChange={(value) => onChange({ dose: value })} placeholder="Ex. 500 mg" />
      <MedicationField label="Route" value={med.route} onChange={(value) => onChange({ route: value })} placeholder="Ex. PO" />
      <MedicationField label="Frequency" value={med.frequency} onChange={(value) => onChange({ frequency: value })} placeholder="Ex. 3x/day" />
      <MedicationField label="Duration" value={med.duration} onChange={(value) => onChange({ duration: value })} placeholder="Ex. 7 days" />
      <MedicationField label="Indication" value={med.indication} onChange={(value) => onChange({ indication: value })} placeholder="Ex. Infection" className="col-span-2 sm:col-span-1" />
    </>
  );

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {isAiProposed ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={med.name}
                  onChange={(event) => onChange({ name: event.target.value })}
                  className="min-w-0 flex-1 font-semibold bg-transparent outline-none border-b border-transparent focus:border-ring px-0.5"
                />
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${statusBadge}`}>
                  <Pencil className="h-2.5 w-2.5" /> {statusLabel}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">{medicationDetails}</div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${statusBadge}`}>
                  <Pencil className="h-2.5 w-2.5" /> Clinician entry
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <MedicationField
                  label="Medicine name"
                  value={med.name}
                  onChange={(value) => {
                    onChange({ name: value, medicineId: undefined });
                    onMedicineSearch?.(value);
                  }}
                  placeholder="Ex. Amoxicilline"
                  className="col-span-2 sm:col-span-3"
                />
                {canSearchMedicines && (
                  <div className="col-span-2 sm:col-span-3">
                    {medicineSearchLoading && (
                      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        Searching TN Med catalog...
                      </div>
                    )}
                    {!medicineSearchLoading && medicineOptions.length > 0 && (
                      <div className="rounded-md border border-border bg-background shadow-card overflow-hidden">
                        {medicineOptions.map((medicine) => {
                          const productName = medicine.localProductName || medicine.brands?.[0] || medicine.dci;
                          const details = [medicine.dci, medicine.dosage || medicine.forms?.[0], medicine.form, medicine.laboratories?.[0]].filter(Boolean).join(" - ");
                          return (
                            <button
                              key={medicine.id}
                              type="button"
                              onClick={() => onSelectMedicine?.(medicine)}
                              className="w-full px-3 py-2 text-left text-xs hover:bg-muted transition-smooth border-b border-border last:border-b-0"
                            >
                              <div className="font-semibold text-foreground">{productName}</div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">{details}</div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {selectedMedicine && (
                      <div className="rounded-md border border-info/30 bg-info-soft/40 px-3 py-2 text-xs">
                        <div className="font-semibold text-info">TN Med product selected</div>
                        <div className="mt-0.5 text-muted-foreground">
                          {[selectedMedicine.dci, selectedMedicine.dosage || selectedMedicine.forms?.[0], selectedMedicine.pregnancy].filter(Boolean).join(" - ")}
                        </div>
                        {selectedMedicine.posologyAdult && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Posology: {selectedMedicine.posologyAdult}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {medicationDetails}
              </div>
            </>
          )}
        </div>
        <button onClick={onRemove} className="text-muted-foreground hover:text-critical transition-smooth p-1 rounded-md" aria-label="Remove">
          <X className="h-4 w-4" />
        </button>
      </div>
      {isAiProposed ? (
        <div className="mt-3 flex items-center gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AI confidence</div>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-xs">
            <div className={`h-full ${confColor}`} style={{ width: `${med.confidence}%` }} />
          </div>
          <div className={`text-xs font-semibold ${confText}`}>{med.confidence}%</div>
        </div>
      ) : (
        <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Clinician entry</div>
      )}
    </div>
  );
}

function MedicationField({
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, 100))}
        maxLength={100}
        placeholder={placeholder}
        className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring/20"
      />
    </div>
  );
}
