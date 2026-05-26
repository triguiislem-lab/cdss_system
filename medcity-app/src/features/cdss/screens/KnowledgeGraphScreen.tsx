import { User, Stethoscope, Pill, AlertOctagon, FlaskConical, Activity, ArrowRight } from "lucide-react";

type NodeKind =
  | "patient"
  | "disease"
  | "drug"
  | "lab"
  | "interaction"
  | "contraindication"
  | "alternative";

interface GNode {
  id: string;
  label: string;
  sub?: string;
  kind: NodeKind;
  x: number;
  y: number;
}

interface GEdge {
  from: string;
  to: string;
  label: string;
  danger?: boolean;
}

const nodes: GNode[] = [
  { id: "patient", label: "Eleanor Whitfield", sub: "78F · 62 kg", kind: "patient", x: 50, y: 50 },
  { id: "ckd", label: "CKD stage 3", sub: "eGFR 42", kind: "disease", x: 22, y: 18 },
  { id: "afib", label: "Atrial fibrillation", kind: "disease", x: 78, y: 18 },
  { id: "warfarin", label: "Warfarin", sub: "Active med", kind: "drug", x: 82, y: 50 },
  { id: "amox", label: "Amoxicillin-clav.", sub: "Proposed", kind: "drug", x: 50, y: 85 },
  { id: "lab", label: "INR 2.4", kind: "lab", x: 92, y: 78 },
  { id: "interaction", label: "Major interaction", sub: "Bleeding ↑", kind: "interaction", x: 70, y: 70 },
  { id: "contra", label: "Renal dose adj.", kind: "contraindication", x: 22, y: 60 },
  { id: "alt", label: "Doxycycline", sub: "Safer alternative", kind: "alternative", x: 18, y: 88 },
];

const edges: GEdge[] = [
  { from: "patient", to: "ckd", label: "diagnosed with" },
  { from: "patient", to: "afib", label: "diagnosed with" },
  { from: "patient", to: "warfarin", label: "takes" },
  { from: "afib", to: "warfarin", label: "indication" },
  { from: "patient", to: "amox", label: "proposed" },
  { from: "warfarin", to: "lab", label: "monitored by" },
  { from: "warfarin", to: "interaction", label: "involved in", danger: true },
  { from: "amox", to: "interaction", label: "involved in", danger: true },
  { from: "ckd", to: "contra", label: "requires" },
  { from: "amox", to: "contra", label: "subject to" },
  { from: "amox", to: "alt", label: "replaceable by" },
];

const kindStyle: Record<
  NodeKind,
  {
    bg: string;
    text: string;
    border: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  patient: { bg: "bg-primary", text: "text-primary-foreground", border: "border-primary", icon: User },
  disease: { bg: "bg-info-soft", text: "text-info", border: "border-info/40", icon: Stethoscope },
  drug: { bg: "bg-card", text: "text-foreground", border: "border-border", icon: Pill },
  lab: { bg: "bg-card", text: "text-foreground", border: "border-border", icon: FlaskConical },
  interaction: { bg: "bg-critical-soft", text: "text-critical", border: "border-critical/40", icon: AlertOctagon },
  contraindication: { bg: "bg-warning-soft", text: "text-warning-foreground", border: "border-warning/40", icon: Activity },
  alternative: { bg: "bg-success-soft", text: "text-success", border: "border-success/40", icon: Pill },
};

export default function KnowledgeGraphPage() {
  const nodeById = (id: string) => nodes.find((n) => n.id === id)!;

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Knowledge graph</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visual reasoning behind today's prescription recommendations and warnings.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card shadow-card p-3">
          <div className="relative w-full aspect-[16/10] rounded-lg bg-[radial-gradient(circle_at_1px_1px,_oklch(0.92_0.006_240)_1px,_transparent_0)] bg-[length:18px_18px] overflow-hidden">
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
              {edges.map((e, i) => {
                const a = nodeById(e.from);
                const b = nodeById(e.to);
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={e.danger ? "oklch(0.55 0.24 27)" : "oklch(0.78 0.02 240)"}
                    strokeWidth={e.danger ? 0.4 : 0.25}
                    strokeDasharray={e.danger ? "0" : "0.8 0.8"}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>

            {nodes.map((n) => {
              const s = kindStyle[n.kind];
              const Icon = s.icon;
              return (
                <div
                  key={n.id}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border ${s.border} ${s.bg} ${s.text} shadow-card px-3 py-2 min-w-[110px] text-center transition-smooth hover:scale-105 ${n.kind === "interaction" ? "animate-pulse-critical" : ""}`}
                  style={{ left: `${n.x}%`, top: `${n.y}%` }}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    <span className="text-xs font-semibold">{n.label}</span>
                  </div>
                  {n.sub && <div className="text-[10px] mt-0.5 opacity-80">{n.sub}</div>}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            {(["patient", "disease", "drug", "interaction", "contraindication", "alternative", "lab"] as NodeKind[]).map((k) => {
              const s = kindStyle[k];
              return (
                <span key={k} className={`inline-flex items-center gap-1 rounded-full border ${s.border} ${s.bg} ${s.text} px-2 py-0.5 capitalize`}>
                  <s.icon className="h-3 w-3" /> {k}
                </span>
              );
            })}
          </div>
        </div>

        <aside className="rounded-xl border border-border bg-card shadow-card p-5">
          <h2 className="font-semibold">Reasoning path</h2>
          <p className="text-xs text-muted-foreground mt-1">Why we flagged this case.</p>
          <ol className="mt-4 space-y-3 text-sm">
            {[
              "Patient has CKD stage 3 (eGFR 42).",
              "Proposed drug requires renal dose adjustment.",
              "Patient is also on warfarin (anticoagulated).",
              "Amoxicillin-clav. + warfarin → INR elevation.",
              "Combined → major bleeding risk.",
              "Suggested action: switch to doxycycline OR adjust dose & monitor INR within 48 h.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-none h-6 w-6 rounded-full bg-primary-soft text-primary text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-5 rounded-lg bg-success-soft border border-success/30 p-3">
            <div className="text-xs font-semibold text-success flex items-center gap-1.5">
              <ArrowRight className="h-3.5 w-3.5" /> Recommendation
            </div>
            <p className="text-xs mt-1">Doxycycline 100 mg PO BID × 7 days — no warfarin interaction, renal-friendly.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

