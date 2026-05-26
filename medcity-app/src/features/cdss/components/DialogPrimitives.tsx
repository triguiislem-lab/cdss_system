import { X } from "lucide-react";
import type { ReactNode } from "react";

export function CdssModal({
  children,
  onClose,
  title,
  maxWidth = "sm:max-w-2xl",
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  maxWidth?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`w-full ${maxWidth} rounded-t-xl sm:rounded-xl border border-border bg-card shadow-elevated max-h-[92vh] overflow-y-auto`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-border bg-card">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="rounded-md p-2 hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function FormLabel({ children }: { children: ReactNode }) {
  return <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</label>;
}

export function FormField({
  label,
  children,
  className = "",
  full = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  full?: boolean;
}) {
  return (
    <div className={`block ${full ? "sm:col-span-2" : ""} ${className}`}>
      <FormLabel>{label}</FormLabel>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-3 py-1 border-b border-border/50 last:border-0">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

export function SearchablePicker<T>({
  items,
  selectedId,
  query,
  onQueryChange,
  onSelect,
  getId,
  getSearchText,
  renderItem,
  placeholder,
  emptyLabel = "Aucun résultat",
  limit = 8,
}: {
  items: T[];
  selectedId: string;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (item: T) => void;
  getId: (item: T) => string;
  getSearchText: (item: T) => string;
  renderItem: (item: T, selected: boolean) => ReactNode;
  placeholder: string;
  emptyLabel?: string;
  limit?: number;
}) {
  const needle = query.trim().toLowerCase();
  const filtered = (needle ? items.filter((item) => getSearchText(item).toLowerCase().includes(needle)) : items).slice(0, limit);

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          filtered.map((item) => {
            const id = getId(item);
            const selected = id === selectedId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(item)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition-smooth ${
                  selected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {renderItem(item, selected)}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
