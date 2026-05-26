import { Pencil, X } from "lucide-react";
import type { Medication } from "@/lib/mock-data";

export function PrescriptionMedicationRow({
  med,
  onChange,
  onRemove,
}: {
  med: Medication;
  onChange: (patch: Partial<Medication>) => void;
  onRemove: () => void;
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

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={med.name}
              onChange={(event) => onChange({ name: event.target.value })}
              className="font-semibold bg-transparent outline-none border-b border-transparent focus:border-ring px-0.5"
            />
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${statusBadge}`}>
              <Pencil className="h-2.5 w-2.5" /> {statusLabel}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <MedicationField label="Dose" value={med.dose} onChange={(value) => onChange({ dose: value })} />
            <MedicationField label="Route" value={med.route} onChange={(value) => onChange({ route: value })} />
            <MedicationField label="Frequency" value={med.frequency} onChange={(value) => onChange({ frequency: value })} />
            <MedicationField label="Duration" value={med.duration} onChange={(value) => onChange({ duration: value })} />
            <MedicationField label="Indication" value={med.indication} onChange={(value) => onChange({ indication: value })} className="col-span-2 sm:col-span-1" />
          </div>
        </div>
        <button onClick={onRemove} className="text-muted-foreground hover:text-critical transition-smooth p-1 rounded-md" aria-label="Remove">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AI confidence</div>
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-xs">
          <div className={`h-full ${confColor}`} style={{ width: `${med.confidence}%` }} />
        </div>
        <div className={`text-xs font-semibold ${confText}`}>{med.confidence}%</div>
      </div>
    </div>
  );
}

function MedicationField({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, 100))}
        maxLength={100}
        className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring/20"
      />
    </div>
  );
}
