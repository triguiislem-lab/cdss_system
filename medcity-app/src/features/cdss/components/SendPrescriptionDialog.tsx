import { useState } from "react";
import { X, Send, User, Building2 } from "lucide-react";
import type { DispatchChannel, DispatchTarget } from "@/lib/stores/pharmacy-store";
import { useI18n } from "@/i18n/I18nProvider";
import { sendPrescriptionToTarget } from "@/lib/backend-api";

interface Props {
  open: boolean;
  onClose: () => void;
  rxId: string;
  patientId: string;
  patientName: string;
  defaultTarget?: DispatchTarget;
}

const TUNISIAN_PHARMACIES = [
  "Pharmacie El Manar",
  "Pharmacie Centrale Tunis",
  "Pharmacie Les Berges du Lac",
  "Pharmacie Ennasr",
  "Pharmacie La Marsa",
];

export function SendPrescriptionDialog({ open, onClose, rxId, patientId, patientName, defaultTarget = "pharmacist" }: Props) {
  const { t } = useI18n();
  const [target, setTarget] = useState<DispatchTarget>(defaultTarget);
  const [recipient, setRecipient] = useState(defaultTarget === "pharmacist" ? TUNISIAN_PHARMACIES[0] : "");
  const [channel, setChannel] = useState<DispatchChannel>(defaultTarget === "pharmacist" ? "portal" : "email");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  if (!open) return null;

  const handleSubmit = () => {
    if (!recipient.trim()) return;
    void (async () => {
      await sendPrescriptionToTarget({
        prescriptionId: rxId,
        target,
        recipient: recipient.trim(),
        channel,
        note: note.trim() || undefined,
      });
      setSent(true);
      setTimeout(() => { setSent(false); onClose(); }, 1200);
    })();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-elevated">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="font-semibold">{t("sendRx.title")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{rxId} · {patientName}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted" aria-label={t("common.close")}><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sendRx.recipient")}</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => { setTarget("pharmacist"); setRecipient(TUNISIAN_PHARMACIES[0]); setChannel("portal"); }}
                className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-smooth ${target === "pharmacist" ? "border-primary bg-primary-soft text-primary" : "border-input hover:bg-muted"}`}
              >
                <Building2 className="h-4 w-4" /> {t("sendRx.pharmacist")}
              </button>
              <button
                onClick={() => { setTarget("patient"); setRecipient(""); setChannel("email"); }}
                className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-smooth ${target === "patient" ? "border-primary bg-primary-soft text-primary" : "border-input hover:bg-muted"}`}
              >
                <User className="h-4 w-4" /> {t("common.patient")}
              </button>
            </div>
          </div>

          {target === "pharmacist" ? (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("nav.pharmacy")}</span>
              <select value={recipient} onChange={(e) => setRecipient(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                {TUNISIAN_PHARMACIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sendRx.patientContact")}</span>
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="patient@example.com" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </label>
          )}

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sendRx.channel")}</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value as DispatchChannel)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {target === "pharmacist" ? (
                <>
                  <option value="portal">{t("sendRx.pharmacyPortal")}</option>
                  <option value="fax">{t("sendRx.secureFax")}</option>
                  <option value="email">{t("common.email")}</option>
                </>
              ) : (
                <>
                  <option value="email">{t("common.email")}</option>
                  <option value="sms">SMS</option>
                  <option value="portal">{t("sendRx.patientPortal")}</option>
                </>
              )}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("sendRx.note")}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t("sendRx.notePlaceholder")} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y" />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border">
          <button onClick={onClose} className="rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">{t("common.cancel")}</button>
          <button onClick={handleSubmit} disabled={!recipient.trim() || sent} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Send className="h-4 w-4" /> {sent ? t("sendRx.sent") : t("sendRx.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
