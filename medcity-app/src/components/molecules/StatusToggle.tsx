import { ToggleLeft, ToggleRight } from "lucide-react";

export function StatusToggle({
  active,
  onToggle,
  activeLabel = "Actif",
  inactiveLabel = "Inactif",
}: {
  active: boolean;
  onToggle: () => void;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        active ? "bg-success-soft text-success border-success/30" : "bg-muted text-muted-foreground border-border"
      }`}
    >
      {active ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}
