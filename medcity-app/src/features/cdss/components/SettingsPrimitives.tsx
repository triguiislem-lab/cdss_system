import type { ReactNode } from "react";

export function SettingsCard({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <header className="px-5 py-4 border-b border-border flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </header>
      <div className="p-5 space-y-3">{children}</div>
    </section>
  );
}

export function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

export function SettingsToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center justify-between w-full text-left gap-3 group">
      <span className="text-sm font-medium">{label}</span>
      <span className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-smooth ${checked ? "bg-primary" : "bg-border"}`}>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-card shadow transition-smooth ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}
