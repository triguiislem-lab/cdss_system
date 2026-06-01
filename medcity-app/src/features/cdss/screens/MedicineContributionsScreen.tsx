import { Link } from "wouter";

import { useEffect, useMemo, useState } from "react";
import { Plus, CheckCircle2, XCircle, Clock, FileEdit, FilePlus2, StickyNote, Pill, User, Calendar, AlertTriangle, ShieldCheck } from "lucide-react";
import type { DrugClass, TunisianMedicine } from "@/lib/tunisia-medicines";
import { type ContributionKind, type ContributionStatus, type MedicineContribution, editableFields } from "@/lib/stores/medicine-contributions-store";
import { useAuth } from "@/contexts/AuthContext";
import { CdssModal, DetailRow as Row, FormField as Field, FormLabel as Label, SearchablePicker } from "@/features/cdss/components/DialogPrimitives";
import { createMedicineContribution, listMedicineClasses, listMedicineContributions, listMedicines, refuseMedicineContribution, validateMedicineContribution } from "@/lib/backend-api";


const kindMeta: Record<ContributionKind, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  new_medicine: { label: "Nouveau médicament", icon: FilePlus2, cls: "bg-primary-soft text-primary border-primary/30" },
  correction:   { label: "Correction",          icon: FileEdit,  cls: "bg-warning-soft text-warning-foreground border-warning/30" },
  note:         { label: "Note / précision",    icon: StickyNote, cls: "bg-info-soft text-info border-info/30" },
};

const statusMeta: Record<ContributionStatus, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  pending:   { label: "En attente", icon: Clock,        cls: "bg-muted text-muted-foreground border-border" },
  validated: { label: "Validé",     icon: CheckCircle2, cls: "bg-success-soft text-success border-success/30" },
  refused:   { label: "Refusé",     icon: XCircle,      cls: "bg-critical-soft text-critical border-critical/30" },
};

function ContributionsPage({ basePath = "/doctor" }: { basePath?: string }) {
  const { user: authUser } = useAuth();
  const user = authUser ? { email: authUser.email, name: authUser.nom } : null;
  const [items, setItems] = useState<MedicineContribution[]>([]);

  const [tab, setTab] = useState<ContributionStatus | "all">("pending");
  const [openCreate, setOpenCreate] = useState(false);
  const [refuseTarget, setRefuseTarget] = useState<MedicineContribution | null>(null);
  const [viewTarget, setViewTarget] = useState<MedicineContribution | null>(null);

  async function refresh() {
    setItems(await listMedicineContributions());
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(
    () => (tab === "all" ? items : items.filter((i) => i.status === tab)),
    [items, tab],
  );

  const counts = useMemo(() => ({
    pending: items.filter((i) => i.status === "pending").length,
    validated: items.filter((i) => i.status === "validated").length,
    refused: items.filter((i) => i.status === "refused").length,
    all: items.length,
  }), [items]);

  const handleValidate = (c: MedicineContribution) => {
    if (!user) return;
    if (c.authorEmail === user.email) {
      alert("Vous ne pouvez pas valider votre propre contribution. Un autre médecin doit la relire.");
      return;
    }
    void (async () => {
      await validateMedicineContribution(c.id);
      await refresh();
    })();
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contributions médicaments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Proposez de nouveaux médicaments, corrigez ou complétez les fiches existantes. Chaque contribution doit être validée par un autre médecin.
          </p>
        </div>
        <button
          onClick={() => setOpenCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-card hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nouvelle contribution
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        {(["pending", "validated", "refused", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-smooth ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t === "pending" ? "En attente" : t === "validated" ? "Validées" : t === "refused" ? "Refusées" : "Toutes"}
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${tab === t ? "bg-primary-foreground/20" : "bg-muted"}`}>{counts[t]}</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Aucune contribution dans cette catégorie.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((c) => {
              const Kind = kindMeta[c.kind];
              const Stat = statusMeta[c.status];
              const isOwn = user?.email === c.authorEmail;
              return (
                <li key={c.id} className="p-4 lg:p-5 hover:bg-muted/30 transition-smooth">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${Kind.cls} flex-none`}>
                      <Kind.icon className="h-4 w-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${Kind.cls}`}>
                          {Kind.label}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${Stat.cls}`}>
                          <Stat.icon className="h-3 w-3" /> {Stat.label}
                        </span>
                        <span className="font-semibold">
                          {c.kind === "new_medicine" ? (c.newMedicine?.dci ?? "Nouveau") : c.targetMedicineDci}
                        </span>
                        {c.field && <span className="font-mono text-[11px] text-muted-foreground">champ: {c.field}</span>}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {c.authorName}</span>
                        <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(c.createdAt).toLocaleString("fr-FR")}</span>
                        {c.reviewerName && <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Revu par {c.reviewerName}</span>}
                      </div>
                      {c.kind === "correction" && (
                        <div className="mt-2 grid sm:grid-cols-2 gap-2 text-xs">
                          <div className="rounded-md border border-border bg-muted/40 p-2">
                            <div className="font-semibold text-muted-foreground mb-0.5">Avant</div>
                            <div className="line-through opacity-70">{c.oldValue || "—"}</div>
                          </div>
                          <div className="rounded-md border border-success/30 bg-success-soft p-2">
                            <div className="font-semibold text-success mb-0.5">Proposé</div>
                            <div>{c.newValue || "—"}</div>
                          </div>
                        </div>
                      )}
                      {c.kind === "note" && (
                        <p className="mt-2 text-sm rounded-md border border-info/30 bg-info-soft p-2">{c.note}</p>
                      )}
                      {c.kind === "new_medicine" && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {c.newMedicine?.drugClass} · {c.newMedicine?.atcCode} · {c.newMedicine?.brands?.join(", ")}
                        </p>
                      )}
                      {c.rationale && (
                        <p className="mt-2 text-xs text-muted-foreground italic">Justification : « {c.rationale} »</p>
                      )}
                      {c.refusalReason && (
                        <p className="mt-2 text-xs rounded-md border border-critical/30 bg-critical-soft text-critical p-2">
                          <strong>Motif du refus :</strong> {c.refusalReason}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 ml-auto">
                      <button onClick={() => setViewTarget(c)} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                        Détails
                      </button>
                      {c.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleValidate(c)}
                            disabled={isOwn}
                            title={isOwn ? "Vous ne pouvez pas valider votre propre contribution" : "Valider cette contribution"}
                            className="inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-success-foreground hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Valider
                          </button>
                          <button
                            onClick={() => setRefuseTarget(c)}
                            disabled={isOwn}
                            title={isOwn ? "Vous ne pouvez pas refuser votre propre contribution" : "Refuser cette contribution"}
                            className="inline-flex items-center gap-1.5 rounded-md bg-critical px-3 py-1.5 text-xs font-semibold text-critical-foreground hover:bg-critical/90 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <XCircle className="h-3.5 w-3.5" /> Refuser
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-info/30 bg-info-soft p-3 text-xs text-info">
        <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
        Règle de gouvernance : un médecin ne peut pas valider sa propre contribution. Le refus doit toujours être motivé.
        Voir aussi <Link href={`${basePath}/medicines`} className="font-semibold underline">base medicaments Tunisie</Link>.
      </div>

      {openCreate && <CreateDialog onClose={() => { setOpenCreate(false); void refresh(); }} />}
      {refuseTarget && (
        <RefuseDialog
          contribution={refuseTarget}
          onClose={() => setRefuseTarget(null)}
          onSubmit={(reason) => {
            if (!user) return;
            void (async () => {
              await refuseMedicineContribution(refuseTarget.id, reason);
              await refresh();
            })();
            setRefuseTarget(null);
          }}
        />
      )}
      {viewTarget && <DetailsDialog contribution={viewTarget} onClose={() => setViewTarget(null)} />}
    </div>
  );
}

/* ---------------- Create dialog ---------------- */

function CreateDialog({ onClose }: { onClose: () => void }) {
  const { user: authUser } = useAuth();
  const user = authUser ? { email: authUser.email, name: authUser.nom } : null;
  const [kind, setKind] = useState<ContributionKind>("correction");
  const [medicines, setMedicines] = useState<TunisianMedicine[]>([]);
  const [classes, setClasses] = useState<string[]>([]);

  // Correction / note fields
  const [targetId, setTargetId] = useState<string>("");
  const [medicineQuery, setMedicineQuery] = useState("");
  const [field, setField] = useState<string>("posologyAdult");
  const [newValue, setNewValue] = useState("");
  const [note, setNote] = useState("");
  const [rationale, setRationale] = useState("");

  // New medicine fields
  const [nm, setNm] = useState<Partial<TunisianMedicine> & { dci: string }>({
    dci: "",
    atcCode: "",
    drugClass: "Antalgique",
    brands: [],
    forms: [],
    laboratories: [],
    contraindications: [],
    reimbursement: "0%",
    indication: "",
    posologyAdult: "",
    pregnancy: "Précaution",
    priceTndApprox: 0,
    renalAdjust: false,
    hepaticAdjust: false,
  });
  const [nmBrands, setNmBrands] = useState("");
  const [nmForms, setNmForms] = useState("");
  const [nmLabs, setNmLabs] = useState("");
  const [nmCi, setNmCi] = useState("");

  useEffect(() => {
    void (async () => {
      const [apiMedicines, apiClasses] = await Promise.all([listMedicines(), listMedicineClasses()]);
      setMedicines(apiMedicines);
      setClasses(apiClasses);
      if (!targetId && apiMedicines[0]) setTargetId(apiMedicines[0].id);
    })();
  }, []);

  const targetMed = medicines.find((m) => m.id === targetId);
  const oldValue = useMemo(() => {
    if (!targetMed) return "";
    const v = targetMed[field as keyof TunisianMedicine];
    return Array.isArray(v) ? v.join(", ") : String(v ?? "");
  }, [targetMed, field]);

  const canSubmit = () => {
    if (!rationale.trim()) return false;
    if (kind === "correction") return !!newValue.trim() && !!targetMed;
    if (kind === "note") return !!note.trim() && !!targetMed;
    if (kind === "new_medicine") return !!nm.dci.trim() && !!nm.atcCode?.trim() && !!nm.indication?.trim();
    return false;
  };

  const submit = () => {
    if (!user) return;
    const base = {
      authorEmail: user.email,
      authorName: user.name,
      rationale: rationale.trim(),
    };
    if (kind === "correction" && targetMed) {
      void createMedicineContribution({
        kind: "correction",
        targetMedicineId: targetMed.id,
        field,
        oldValue,
        newValue: newValue.trim(),
        rationale: base.rationale,
      });
    } else if (kind === "note" && targetMed) {
      void createMedicineContribution({
        kind: "note",
        targetMedicineId: targetMed.id,
        note: note.trim(),
        rationale: base.rationale,
      });
    } else if (kind === "new_medicine") {
      void createMedicineContribution({
        kind: "new_medicine",
        newMedicine: {
          ...nm,
          brands: nmBrands.split(",").map((s) => s.trim()).filter(Boolean),
          forms: nmForms.split(",").map((s) => s.trim()).filter(Boolean),
          laboratories: nmLabs.split(",").map((s) => s.trim()).filter(Boolean),
          contraindications: nmCi.split(",").map((s) => s.trim()).filter(Boolean),
        },
        rationale: base.rationale,
      });
    }
    onClose();
  };

  return (
    <CdssModal onClose={onClose} title="Nouvelle contribution">
      <div className="space-y-4">
        <div>
          <Label>Type de contribution</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
            {(Object.keys(kindMeta) as ContributionKind[]).map((k) => {
              const K = kindMeta[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex items-start gap-2 rounded-lg border p-3 text-left text-sm transition-smooth ${
                    kind === k ? `${K.cls} ring-2 ring-primary/40` : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <K.icon className="h-4 w-4 mt-0.5 flex-none" />
                  <div>
                    <div className="font-semibold">{K.label}</div>
                    <div className="text-[11px] opacity-80">
                      {k === "new_medicine" && "Proposer une fiche absente du référentiel."}
                      {k === "correction" && "Corriger un champ d'une fiche existante."}
                      {k === "note" && "Ajouter une précision clinique."}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {(kind === "correction" || kind === "note") && (
          <div>
            <Label>Médicament concerné</Label>
            <div className="mt-1">
              <SearchablePicker
                items={medicines}
                selectedId={targetId}
                query={medicineQuery}
                onQueryChange={setMedicineQuery}
                onSelect={(medicine) => {
                  setTargetId(medicine.id);
                  setMedicineQuery(`${medicine.dci} ${medicine.atcCode}`);
                }}
                getId={(medicine) => medicine.id}
                getSearchText={(medicine) => `${medicine.dci} ${medicine.atcCode} ${medicine.drugClass} ${medicine.brands.join(" ")}`}
                placeholder="Rechercher par DCI, spécialité, ATC ou classe"
                emptyLabel="Aucun médicament trouvé"
                renderItem={(medicine) => (
                  <span className="flex flex-col gap-0.5">
                    <span className="font-semibold">{medicine.dci}</span>
                    <span className="text-xs opacity-75">{medicine.atcCode} · {medicine.drugClass}</span>
                  </span>
                )}
              />
            </div>
          </div>
        )}

        {kind === "correction" && (
          <>
            <div>
              <Label>Champ à corriger</Label>
              <select value={field} onChange={(e) => setField(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {editableFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Valeur actuelle</Label>
              <div className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{oldValue || "—"}</div>
            </div>
            <div>
              <Label>Nouvelle valeur proposée *</Label>
              <textarea value={newValue} onChange={(e) => setNewValue(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </>
        )}

        {kind === "note" && (
          <div>
            <Label>Note / précision clinique *</Label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Ex. Suspendre 48 h avant injection de produit de contraste iodé…" />
          </div>
        )}

        {kind === "new_medicine" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="DCI *"><input value={nm.dci} onChange={(e) => setNm({ ...nm, dci: e.target.value })} className={inputCls} /></Field>
            <Field label="Code ATC *"><input value={nm.atcCode ?? ""} onChange={(e) => setNm({ ...nm, atcCode: e.target.value })} className={inputCls} /></Field>
            <Field label="Classe">
              <select value={nm.drugClass} onChange={(e) => setNm({ ...nm, drugClass: e.target.value as DrugClass })} className={inputCls}>
                {classes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Remboursement CNAM">
              <select value={nm.reimbursement} onChange={(e) => setNm({ ...nm, reimbursement: e.target.value as TunisianMedicine["reimbursement"] })} className={inputCls}>
                <option>100%</option><option>85%</option><option>40%</option><option>0%</option>
              </select>
            </Field>
            <Field label="Spécialités (virgule)"><input value={nmBrands} onChange={(e) => setNmBrands(e.target.value)} className={inputCls} placeholder="Concor, Cardicor" /></Field>
            <Field label="Laboratoires (virgule)"><input value={nmLabs} onChange={(e) => setNmLabs(e.target.value)} className={inputCls} placeholder="Merck, SAIPH" /></Field>
            <Field label="Formes & dosages (virgule)" full><input value={nmForms} onChange={(e) => setNmForms(e.target.value)} className={inputCls} placeholder="5 mg cp., 10 mg cp." /></Field>
            <Field label="Indication *" full><textarea value={nm.indication} onChange={(e) => setNm({ ...nm, indication: e.target.value })} rows={2} className={inputCls} /></Field>
            <Field label="Posologie adulte" full><textarea value={nm.posologyAdult} onChange={(e) => setNm({ ...nm, posologyAdult: e.target.value })} rows={2} className={inputCls} /></Field>
            <Field label="Contre-indications (virgule)" full><input value={nmCi} onChange={(e) => setNmCi(e.target.value)} className={inputCls} /></Field>
            <Field label="Grossesse">
              <select value={nm.pregnancy} onChange={(e) => setNm({ ...nm, pregnancy: e.target.value as TunisianMedicine["pregnancy"] })} className={inputCls}>
                <option>Autorisé</option><option>Précaution</option><option>Contre-indiqué</option>
              </select>
            </Field>
            <Field label="Prix moyen (TND)"><input type="number" step="0.1" value={nm.priceTndApprox} onChange={(e) => setNm({ ...nm, priceTndApprox: parseFloat(e.target.value) || 0 })} className={inputCls} /></Field>
          </div>
        )}

        <div>
          <Label>Justification / source *</Label>
          <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Ex. HAS 2023, Vidal Tunisie, étude clinique…" />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button onClick={onClose} className="rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted">Annuler</button>
          <button onClick={submit} disabled={!canSubmit()} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            Soumettre pour validation
          </button>
        </div>
      </div>
    </CdssModal>
  );
}

/* ---------------- Refuse dialog ---------------- */

function RefuseDialog({ contribution, onClose, onSubmit }: { contribution: MedicineContribution; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <CdssModal onClose={onClose} title="Refuser la contribution">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Vous êtes sur le point de refuser la contribution proposée par <strong className="text-foreground">{contribution.authorName}</strong>.
          Le motif sera communiqué à l'auteur et conservé dans l'historique.
        </p>
        <div>
          <Label>Motif du refus *</Label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Ex. Source insuffisante, contradiction avec recommandation HAS 2023…"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button onClick={onClose} className="rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted">Annuler</button>
          <button
            onClick={() => onSubmit(reason.trim())}
            disabled={!reason.trim()}
            className="rounded-md bg-critical px-4 py-2 text-sm font-semibold text-critical-foreground hover:bg-critical/90 disabled:opacity-50"
          >
            Confirmer le refus
          </button>
        </div>
      </div>
    </CdssModal>
  );
}

/* ---------------- Details dialog ---------------- */

function DetailsDialog({ contribution, onClose }: { contribution: MedicineContribution; onClose: () => void }) {
  const c = contribution;
  return (
    <CdssModal onClose={onClose} title="Détails de la contribution">
      <div className="space-y-3 text-sm">
        <Row label="Type" value={kindMeta[c.kind].label} />
        <Row label="Statut" value={statusMeta[c.status].label} />
        <Row label="Auteur" value={`${c.authorName} (${c.authorEmail})`} />
        <Row label="Créé le" value={new Date(c.createdAt).toLocaleString("fr-FR")} />
        {c.targetMedicineDci && <Row label="Médicament" value={c.targetMedicineDci} />}
        {c.field && <Row label="Champ" value={c.field} />}
        {c.oldValue && <Row label="Valeur initiale" value={c.oldValue} />}
        {c.newValue && <Row label="Valeur proposée" value={c.newValue} />}
        {c.note && <Row label="Note" value={c.note} />}
        {c.newMedicine && (
          <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1">
            <div className="font-semibold flex items-center gap-1.5"><Pill className="h-4 w-4 text-primary" /> {c.newMedicine.dci}</div>
            <div className="text-xs text-muted-foreground">ATC {c.newMedicine.atcCode} · {c.newMedicine.drugClass}</div>
            <div className="text-xs">Spécialités : {c.newMedicine.brands?.join(", ") || "—"}</div>
            <div className="text-xs">Indication : {c.newMedicine.indication}</div>
            <div className="text-xs">Posologie : {c.newMedicine.posologyAdult}</div>
          </div>
        )}
        {c.rationale && <Row label="Justification" value={c.rationale} />}
        {c.reviewerName && <Row label="Relecteur" value={`${c.reviewerName} — ${c.reviewedAt ? new Date(c.reviewedAt).toLocaleString("fr-FR") : ""}`} />}
        {c.refusalReason && <Row label="Motif de refus" value={c.refusalReason} />}
        <div className="flex justify-end pt-3 border-t border-border">
          <button onClick={onClose} className="rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted">Fermer</button>
        </div>
      </div>
    </CdssModal>
  );
}

/* ---------------- UI primitives ---------------- */

const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export default ContributionsPage;


