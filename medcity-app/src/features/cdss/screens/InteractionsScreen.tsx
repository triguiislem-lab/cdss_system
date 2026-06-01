import { useEffect, useState } from "react";
import { Plus, X, Search, ExternalLink } from "lucide-react";
import type { InteractionResult } from "@/lib/mock-data";
import { severityMeta, severityOrder } from "@/lib/clinical-ui";
import { useToast } from "@/hooks/use-toast";
import { listInteractions } from "@/lib/backend-api";

export default function InteractionChecker() {
  const [drugs, setDrugs] = useState<string[]>([
    "Warfarin",
    "Amoxicillin-clavulanate",
    "Apixaban",
    "Spironolactone",
    "Lisinopril",
    "Azithromycin",
    "Metoprolol",
  ]);
  const [input, setInput] = useState("");
  const [interactions, setInteractions] = useState<InteractionResult[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    void (async () => {
      try {
        setInteractions(await listInteractions());
      } catch {
        setInteractions([]);
      }
    })();
  }, []);

  const add = () => {
    const value = input.trim().slice(0, 80);
    if (!value || drugs.includes(value)) return;
    setDrugs((current) => [...current, value]);
    setInput("");
  };

  const remove = (drug: string) => setDrugs((current) => current.filter((value) => value !== drug));

  const visible = interactions.filter((entry) => drugs.includes(entry.drugA) && drugs.includes(entry.drugB));
  const grouped = severityOrder.map((sev) => ({ sev, items: visible.filter((entry) => entry.severity === sev) }));

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Drug interaction checker</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add medications to screen for interactions across vetted clinical sources.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card p-5">
        <div className="flex flex-wrap gap-2 mb-3">
          {drugs.map((drug) => (
            <span key={drug} className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft text-primary border border-primary/20 px-3 py-1 text-sm font-medium">
              {drug}
              <button onClick={() => remove(drug)} className="hover:text-critical transition-smooth">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Add a drug (e.g. Ibuprofen)..."
              className="flex-1 bg-transparent text-sm outline-none"
              maxLength={80}
            />
          </div>
          <button onClick={add} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-smooth">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {grouped.map(({ sev, items }) => {
          if (items.length === 0) return null;
          const meta = severityMeta[sev];
          return (
            <section key={sev}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                <h2 className="text-sm font-semibold uppercase tracking-wider">{meta.label}</h2>
                <span className="text-xs text-muted-foreground">({items.length})</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {items.map((entry) => (
                  <article key={entry.id} className={`rounded-xl border ${meta.border} ${meta.bg} p-4 ${sev === "critical" ? "ring-2 " + meta.ring : ""}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex rounded-md bg-card border border-border px-2 py-0.5 text-sm font-semibold">{entry.drugA}</span>
                      <span className="text-muted-foreground text-sm">↔</span>
                      <span className="inline-flex rounded-md bg-card border border-border px-2 py-0.5 text-sm font-semibold">{entry.drugB}</span>
                    </div>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div>
                        <dt className="font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">Mechanism</dt>
                        <dd className="mt-0.5">{entry.mechanism}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">Clinical consequence</dt>
                        <dd className="mt-0.5">{entry.consequence}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">Recommended action</dt>
                        <dd className="mt-0.5 font-medium">{entry.action}</dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      onClick={() =>
                        toast({
                          title: "Evidence source",
                          description: entry.evidence,
                        })
                      }
                      className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> {entry.evidence}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        {visible.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
              <Search className="h-5 w-5" />
            </div>
            <h3 className="mt-3 font-semibold">No interactions detected</h3>
            <p className="text-sm text-muted-foreground mt-1">Across the {drugs.length} drugs you've added.</p>
          </div>
        )}
      </div>
    </div>
  );
}
