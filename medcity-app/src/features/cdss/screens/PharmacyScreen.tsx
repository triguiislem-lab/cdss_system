import type { FormEvent } from "react";
import { useState } from "react";
import { Link } from "wouter";
import {
  Building2,
  CheckCircle2,
  Clock,
  Edit2,
  Filter,
  Globe,
  Mail,
  MessageSquare,
  Pill,
  Plus,
  Printer,
  Search,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import { CdssModal, FormField as Field } from "@/features/cdss/components/DialogPrimitives";
import {
  usePharmacyStore,
  type Dispatch as PharmacyDispatch,
  type DispatchChannel,
  type DispatchStatus,
  type DispatchTarget,
} from "@/lib/stores/pharmacy-store";
import { useI18n } from "@/i18n/I18nProvider";

type PharmacyForm = {
  id?: string;
  rxId: string;
  patientId: string;
  patientName: string;
  target: DispatchTarget;
  recipient: string;
  channel: DispatchChannel;
  status: DispatchStatus;
  note: string;
};

const statusMeta: Record<DispatchStatus, { labelKey: string; cls: string; icon: typeof Clock }> = {
  sent: { labelKey: "pharmacy.sent", cls: "bg-info-soft text-info border-info/30", icon: Clock },
  received: { labelKey: "pharmacy.received", cls: "bg-info-soft text-info border-info/30", icon: CheckCircle2 },
  cancelled: { labelKey: "pharmacy.cancelled", cls: "bg-muted text-muted-foreground border-border", icon: XCircle },
};

const channelIcon: Record<DispatchChannel, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  portal: Globe,
  fax: Printer,
};

function emptyDispatchForm(): PharmacyForm {
  return {
    rxId: "RX-",
    patientId: "P-",
    patientName: "",
    target: "pharmacist",
    recipient: "",
    channel: "portal",
    status: "sent",
    note: "",
  };
}

function dispatchToForm(dispatch: PharmacyDispatch): PharmacyForm {
  return {
    id: dispatch.id,
    rxId: dispatch.rxId,
    patientId: dispatch.patientId,
    patientName: dispatch.patientName,
    target: dispatch.target,
    recipient: dispatch.recipient,
    channel: dispatch.channel,
    status: dispatch.status,
    note: dispatch.note ?? "",
  };
}

export default function PharmacyPage({ basePath = "/doctor" }: { basePath?: string }) {
  const { t } = useI18n();
  const dispatches = usePharmacyStore((state) => state.dispatches);
  const send = usePharmacyStore((state) => state.send);
  const update = usePharmacyStore((state) => state.update);
  const updateStatus = usePharmacyStore((state) => state.updateStatus);
  const remove = usePharmacyStore((state) => state.remove);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DispatchStatus | "all" | "pharmacist" | "patient">("all");
  const [editing, setEditing] = useState<PharmacyForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PharmacyDispatch | null>(null);

  const filtered = dispatches.filter((dispatch) => {
    if (filter === "pharmacist" || filter === "patient") {
      if (dispatch.target !== filter) return false;
    } else if (filter !== "all" && dispatch.status !== filter) {
      return false;
    }

    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      dispatch.patientName.toLowerCase().includes(needle) ||
      dispatch.recipient.toLowerCase().includes(needle) ||
      dispatch.rxId.toLowerCase().includes(needle)
    );
  });

  const counts = {
    pharmacist: dispatches.filter((dispatch) => dispatch.target === "pharmacist").length,
    patient: dispatches.filter((dispatch) => dispatch.target === "patient").length,
    sent: dispatches.filter((dispatch) => dispatch.status === "sent").length,
    received: dispatches.filter((dispatch) => dispatch.status === "received").length,
  };

  function saveDispatch(form: PharmacyForm) {
    const data = {
      rxId: form.rxId,
      patientId: form.patientId,
      patientName: form.patientName,
      target: form.target,
      recipient: form.recipient,
      channel: form.channel,
      status: form.status,
      note: form.note,
    };

    if (form.id) update(form.id, data);
    else send(data);

    setEditing(null);
  }

  function deleteDispatch() {
    if (!deleteTarget) return;
    remove(deleteTarget.id);
    setDeleteTarget(null);
  }

  const filterLabel = (status: DispatchStatus | "all" | "pharmacist" | "patient") => {
    if (status === "all") return t("common.all");
    if (status === "pharmacist") return t("sendRx.pharmacist");
    if (status === "patient") return t("common.patient");
    return t(statusMeta[status].labelKey);
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("pharmacy.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("pharmacy.subtitle")}</p>
        </div>
        <button
          onClick={() => setEditing(emptyDispatchForm())}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-card hover:bg-primary/90 transition-smooth"
        >
          <Plus className="h-4 w-4" /> {t("pharmacy.newDispatch")}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t("pharmacy.toPharmacist"), value: counts.pharmacist, icon: Building2, cls: "text-primary" },
          { label: t("pharmacy.toPatient"), value: counts.patient, icon: User, cls: "text-info" },
          { label: t("pharmacy.sentPlural"), value: counts.sent, icon: Clock, cls: "text-warning-foreground" },
          { label: t("pharmacy.receivedPlural"), value: counts.received, icon: CheckCircle2, cls: "text-success" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card shadow-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{stat.label}</span>
              <stat.icon className={`h-4 w-4 ${stat.cls}`} />
            </div>
            <div className="mt-2 text-2xl font-bold">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
          <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("pharmacy.searchPlaceholder")}
              className="flex-1 bg-transparent outline-none"
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
            {(["all", "pharmacist", "patient", "sent", "received", "cancelled"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-smooth ${
                  filter === status ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {filterLabel(status)}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <Pill className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            {t("pharmacy.empty")}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((dispatch) => {
              const status = statusMeta[dispatch.status] ?? statusMeta.sent;
              const ChannelIcon = channelIcon[dispatch.channel];
              const TargetIcon = dispatch.target === "pharmacist" ? Building2 : User;

              return (
                <li key={dispatch.id} className="p-5 hover:bg-muted/30 transition-smooth">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{dispatch.id}</span>
                        <Link href={`${basePath}/prescription/${dispatch.rxId}/ordonnance`} className="font-mono text-xs text-primary hover:underline">
                          {dispatch.rxId}
                        </Link>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.cls}`}>
                          <status.icon className="h-3 w-3" /> {t(status.labelKey)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold">
                        <TargetIcon className="h-4 w-4 text-muted-foreground" />
                        {dispatch.recipient}
                        <span className="text-muted-foreground font-normal">-</span>
                        <span className="font-normal text-muted-foreground">{dispatch.patientName}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <ChannelIcon className="h-3 w-3" /> {dispatch.channel}
                        </span>
                        <span>{t("pharmacy.sentAt", { date: new Date(dispatch.sentAt).toLocaleString("fr-FR") })}</span>
                      </div>
                      {dispatch.note && <p className="mt-2 text-xs text-muted-foreground italic">"{dispatch.note}"</p>}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <select
                        value={dispatch.status}
                        onChange={(event) => updateStatus(dispatch.id, event.target.value as DispatchStatus)}
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs font-medium"
                      >
                        {(Object.keys(statusMeta) as DispatchStatus[]).map((statusKey) => (
                          <option key={statusKey} value={statusKey}>{t(statusMeta[statusKey].labelKey)}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setEditing(dispatchToForm(dispatch))}
                        className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2 py-1.5 text-xs font-semibold hover:bg-muted transition-smooth"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> {t("common.edit")}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(dispatch)}
                        className="inline-flex items-center gap-1 rounded-md border border-critical/30 bg-critical-soft px-2 py-1.5 text-xs font-semibold text-critical hover:bg-critical/10 transition-smooth"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && (
        <PharmacyDispatchModal
          form={editing}
          onClose={() => setEditing(null)}
          onSave={saveDispatch}
        />
      )}

      {deleteTarget && (
        <CdssModal title={t("pharmacy.deleteTitle")} onClose={() => setDeleteTarget(null)} maxWidth="sm:max-w-md">
          <p className="text-sm text-muted-foreground">
            {t("pharmacy.deleteText", { id: deleteTarget.id, patient: deleteTarget.patientName })}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-muted transition-smooth"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={deleteDispatch}
              className="rounded-lg bg-critical px-4 py-2 text-sm font-semibold text-critical-foreground hover:bg-critical/90 transition-smooth"
            >
              {t("common.delete")}
            </button>
          </div>
        </CdssModal>
      )}
    </div>
  );
}

function PharmacyDispatchModal({
  form,
  onClose,
  onSave,
}: {
  form: PharmacyForm;
  onClose: () => void;
  onSave: (form: PharmacyForm) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<PharmacyForm>(form);

  function update<K extends keyof PharmacyForm>(key: K, value: PharmacyForm[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <CdssModal title={form.id ? t("pharmacy.editDispatch") : t("pharmacy.newDispatch")} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t("pharmacy.rx")}>
          <input
            required
            value={draft.rxId}
            onChange={(event) => update("rxId", event.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label={t("pharmacy.patientId")}>
          <input
            required
            value={draft.patientId}
            onChange={(event) => update("patientId", event.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label={t("common.patient")}>
          <input
            required
            value={draft.patientName}
            onChange={(event) => update("patientName", event.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label={t("pharmacy.recipient")}>
          <select
            value={draft.target}
            onChange={(event) => update("target", event.target.value as DispatchTarget)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="pharmacist">{t("sendRx.pharmacist")}</option>
            <option value="patient">{t("common.patient")}</option>
          </select>
        </Field>
        <Field label={draft.target === "pharmacist" ? t("nav.pharmacy") : t("sendRx.patientContact")} full>
          <input
            required
            value={draft.recipient}
            onChange={(event) => update("recipient", event.target.value)}
            placeholder={draft.target === "pharmacist" ? "Ex. Pharmacie El Manar" : "Ex. patient@email.com"}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label={t("sendRx.channel")}>
          <select
            value={draft.channel}
            onChange={(event) => update("channel", event.target.value as DispatchChannel)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="portal">{t("pharmacy.portal")}</option>
            <option value="email">{t("common.email")}</option>
            <option value="sms">SMS</option>
            <option value="fax">Fax</option>
          </select>
        </Field>
        <Field label={t("pharmacy.status")}>
          <select
            value={draft.status}
            onChange={(event) => update("status", event.target.value as DispatchStatus)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {(Object.keys(statusMeta) as DispatchStatus[]).map((status) => (
              <option key={status} value={status}>{t(statusMeta[status].labelKey)}</option>
            ))}
          </select>
        </Field>
        <Field label={t("sendRx.note")} full>
          <textarea
            value={draft.note}
            onChange={(event) => update("note", event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-muted transition-smooth"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-smooth"
          >
            {t("common.save")}
          </button>
        </div>
      </form>
    </CdssModal>
  );
}
