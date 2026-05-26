import { Link, useLocation, useParams } from "wouter";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  Download,
  FilePlus2,
  Mic,
  Pause,
  Pencil,
  Play,
  Save,
  Square,
  Trash2,
  User,
} from "lucide-react";
import { ConsultationFormDialog } from "@/features/cdss/components/ConsultationFormDialog";
import { useConsultationStore } from "@/lib/stores/consultation-store";
import { useI18n } from "@/i18n/I18nProvider";

function fmtDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export default function ConsultationDetailPage({ basePath = "/doctor" }: { basePath?: string }) {
  const { t } = useI18n();
  const params = useParams<{ consultationId: string }>();
  const [, setLocation] = useLocation();
  const consultation = useConsultationStore((state) => state.consultations.find((entry) => entry.id === params.consultationId));
  const allVitals = useConsultationStore((state) => state.vitals);
  const update = useConsultationStore((state) => state.update);
  const remove = useConsultationStore((state) => state.remove);
  const addVitals = useConsultationStore((state) => state.addVitals);
  const consultationVitals = useMemo(
    () => allVitals.filter((entry) => entry.consultationId === params.consultationId),
    [allVitals, params.consultationId],
  );

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notes, setNotes] = useState(consultation?.notes ?? "");
  const [diagnosis, setDiagnosis] = useState(consultation?.diagnosis ?? "");
  const [savedFlash, setSavedFlash] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | undefined>(consultation?.recordingUrl);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [vitalsDraft, setVitalsDraft] = useState({
    heartRate: "",
    bloodPressure: "",
    temperature: "",
    heightCm: "",
    weightKg: "",
    maxWeightKg: "",
    lastPeriodDate: "",
    gad: "",
    oxygenSaturation: "",
    respiratoryRate: "",
  });

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (mediaRef.current?.state === "recording") mediaRef.current.stop();
      mediaRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (!consultation) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">{t("consultation.notFound")}</p>
        <Link href={`${basePath}/consultations`} className="inline-flex mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          {t("consultation.back")}
        </Link>
      </div>
    );
  }

  const startRecording = async () => {
    setRecordingError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        const duration = Math.round((Date.now() - startedAtRef.current) / 1000);
        setAudioUrl(url);
        update(consultation.id, {
          recordingUrl: url,
          recordingDurationSec: duration,
          endedAt: new Date().toISOString(),
          status: "completed",
        });
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 1000);
      setRecording(true);
      setPaused(false);
      update(consultation.id, { status: "in_progress", startedAt: new Date().toISOString() });
    } catch {
      setRecordingError(t("consultation.micError"));
    }
  };

  const togglePause = () => {
    if (!mediaRef.current) return;
    if (paused) {
      mediaRef.current.resume();
      setPaused(false);
    } else {
      mediaRef.current.pause();
      setPaused(true);
    }
  };

  const stopRecording = () => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
    setRecording(false);
    setPaused(false);
  };

  const saveNotes = () => {
    update(consultation.id, { notes, diagnosis });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const numberOrUndefined = (value: string) => {
    if (!value.trim()) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const saveVitals = () => {
    addVitals({
      consultationId: consultation.id,
      patientId: consultation.patientId,
      heartRate: numberOrUndefined(vitalsDraft.heartRate),
      bloodPressure: vitalsDraft.bloodPressure.trim() || undefined,
      temperature: numberOrUndefined(vitalsDraft.temperature),
      heightCm: numberOrUndefined(vitalsDraft.heightCm),
      weightKg: numberOrUndefined(vitalsDraft.weightKg),
      maxWeightKg: numberOrUndefined(vitalsDraft.maxWeightKg),
      lastPeriodDate: vitalsDraft.lastPeriodDate || undefined,
      gad: vitalsDraft.gad.trim() || undefined,
      oxygenSaturation: numberOrUndefined(vitalsDraft.oxygenSaturation),
      respiratoryRate: numberOrUndefined(vitalsDraft.respiratoryRate),
    });
    setVitalsDraft({
      heartRate: "",
      bloodPressure: "",
      temperature: "",
      heightCm: "",
      weightKg: "",
      maxWeightKg: "",
      lastPeriodDate: "",
      gad: "",
      oxygenSaturation: "",
      respiratoryRate: "",
    });
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`${basePath}/consultations`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {t("consultations.title")}
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-xl font-bold truncate">{consultation.id} - {consultation.patientName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLocation(`${basePath}/prescription/new?patientId=${encodeURIComponent(consultation.patientId)}`)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <FilePlus2 className="h-4 w-4" /> {t("consultation.prescribe")}
          </button>
          <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">
            <Pencil className="h-4 w-4" /> {t("common.edit")}
          </button>
          <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-critical/30 text-critical bg-card px-3 py-2 text-sm font-semibold hover:bg-critical-soft">
            <Trash2 className="h-4 w-4" /> {t("common.delete")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <aside className="lg:col-span-4 space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-card p-5">
            <h2 className="font-semibold">{t("consultation.patient")}</h2>
            <Link href={`${basePath}/patients/${consultation.patientId}`} className="mt-3 flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/40">
              <div className="h-10 w-10 rounded-full bg-primary-soft text-primary flex items-center justify-center">
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{consultation.patientName}</div>
                <div className="text-xs text-muted-foreground">{consultation.patientId}</div>
              </div>
            </Link>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">{t("common.reason")}</dt><dd className="font-medium text-right">{consultation.reason}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">{t("common.doctor")}</dt><dd className="font-medium">{consultation.doctor}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">{t("consultation.scheduled")}</dt><dd className="font-medium flex items-center gap-1"><CalendarClock className="h-3 w-3" />{new Date(consultation.scheduledAt).toLocaleString("fr-FR")}</dd></div>
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t("patientSummary.vitals")}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("consultation.vitalsHelp")}</p>
              </div>
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <VitalsInput label="FC" unit="bpm" value={vitalsDraft.heartRate} onChange={(value) => setVitalsDraft((current) => ({ ...current, heartRate: value }))} />
              <VitalsInput label="TA" unit="mmHg" value={vitalsDraft.bloodPressure} onChange={(value) => setVitalsDraft((current) => ({ ...current, bloodPressure: value }))} />
              <VitalsInput label="Temp." unit="C" value={vitalsDraft.temperature} onChange={(value) => setVitalsDraft((current) => ({ ...current, temperature: value }))} />
              <VitalsInput label="Taille" unit="cm" value={vitalsDraft.heightCm} onChange={(value) => setVitalsDraft((current) => ({ ...current, heightCm: value }))} />
              <VitalsInput label="Poids" unit="kg" value={vitalsDraft.weightKg} onChange={(value) => setVitalsDraft((current) => ({ ...current, weightKg: value }))} />
              <VitalsInput label="Poids max" unit="kg" value={vitalsDraft.maxWeightKg} onChange={(value) => setVitalsDraft((current) => ({ ...current, maxWeightKg: value }))} />
              <VitalsInput label="SpO2" unit="%" value={vitalsDraft.oxygenSaturation} onChange={(value) => setVitalsDraft((current) => ({ ...current, oxygenSaturation: value }))} />
              <VitalsInput label="FR" unit="/min" value={vitalsDraft.respiratoryRate} onChange={(value) => setVitalsDraft((current) => ({ ...current, respiratoryRate: value }))} />
              <label className="col-span-2 block text-xs">
                <span className="font-semibold text-muted-foreground">DDR</span>
                <input
                  type="date"
                  value={vitalsDraft.lastPeriodDate}
                  onChange={(event) => setVitalsDraft((current) => ({ ...current, lastPeriodDate: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <VitalsInput label="GAD" value={vitalsDraft.gad} onChange={(value) => setVitalsDraft((current) => ({ ...current, gad: value }))} className="col-span-2" />
            </div>
            <button onClick={saveVitals} className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              {t("consultation.saveVitals")}
            </button>
            {consultationVitals.length > 0 && (
              <div className="mt-4 space-y-2">
                {consultationVitals.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                    <div className="font-semibold">{new Date(entry.measuredAt).toLocaleString("fr-FR")}</div>
                    <div className="mt-1 text-muted-foreground">
                      {[
                        entry.heartRate ? `FC ${entry.heartRate} bpm` : "",
                        entry.bloodPressure ? `TA ${entry.bloodPressure}` : "",
                        entry.temperature ? `Temp ${entry.temperature} C` : "",
                        entry.weightKg ? `Poids ${entry.weightKg} kg` : "",
                        entry.oxygenSaturation ? `SpO2 ${entry.oxygenSaturation}%` : "",
                      ].filter(Boolean).join(" · ") || t("consultation.freeVitals")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="lg:col-span-8 space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{t("consultation.recordingTitle")}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{t("consultation.recordingHelp")}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${recording ? "bg-critical-soft text-critical animate-pulse-critical" : "bg-muted text-muted-foreground"}`}>
                <span className={`h-2 w-2 rounded-full ${recording ? "bg-critical" : "bg-muted-foreground"}`} />
                {recording ? (paused ? t("consultation.paused") : t("consultation.recording")) : t("consultation.inactive")}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {!recording && consultation.status !== "completed" && (
                <button onClick={startRecording} className="inline-flex items-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-success-foreground hover:bg-success/90 shadow-card">
                  <Mic className="h-4 w-4" /> {t("consultation.start")}
                </button>
              )}
              {recording && (
                <>
                  <button onClick={togglePause} className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">
                    {paused ? <><Play className="h-4 w-4" /> {t("consultation.resume")}</> : <><Pause className="h-4 w-4" /> {t("consultation.pause")}</>}
                  </button>
                  <button onClick={stopRecording} className="inline-flex items-center gap-2 rounded-lg bg-critical text-critical-foreground px-4 py-2.5 text-sm font-semibold hover:bg-critical/90 shadow-card">
                    <Square className="h-4 w-4" /> {t("consultation.finish")}
                  </button>
                </>
              )}
              {!recording && consultation.status === "completed" && (
                <button onClick={startRecording} className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">
                  <Mic className="h-4 w-4" /> {t("consultation.resumeRecording")}
                </button>
              )}
              <div className="font-mono text-2xl tabular-nums ml-auto">{fmtDuration(elapsed || consultation.recordingDurationSec || 0)}</div>
            </div>

            {recordingError && <div className="mt-3 rounded-lg border border-critical/30 bg-critical-soft p-2.5 text-xs text-critical">{recordingError}</div>}

            {audioUrl && (
              <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("consultation.playback")}</div>
                  <a href={audioUrl} download={`${consultation.id}.webm`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Download className="h-3 w-3" /> {t("consultation.download")}
                  </a>
                </div>
                <audio controls src={audioUrl} className="w-full" />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card shadow-card p-5">
            <h2 className="font-semibold">{t("consultation.notesTitle")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("consultation.notesHelp")}</p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("rx.diagnosis")}</span>
                <input value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} placeholder={t("rx.diagnosisPlaceholder")} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("rx.clinicalNotes")}</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={10} placeholder={t("consultation.notesPlaceholder")} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y" />
              </label>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("consultation.characters", { count: notes.length })}</span>
                <button onClick={saveNotes} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  <Save className="h-4 w-4" /> {savedFlash ? t("consultation.saved") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {editOpen && <ConsultationFormDialog open onClose={() => setEditOpen(false)} editingId={consultation.id} />}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-elevated p-5">
            <h3 className="font-semibold">{t("consultations.deleteTitle")}</h3>
            <p className="text-sm text-muted-foreground mt-2">{t("consultations.deleteDescription")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">{t("common.cancel")}</button>
              <button
                onClick={() => {
                  remove(consultation.id);
                  setLocation(`${basePath}/consultations`);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-critical text-critical-foreground px-3 py-2 text-sm font-semibold hover:bg-critical/90"
              >
                <Trash2 className="h-4 w-4" /> {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VitalsInput({
  label,
  value,
  onChange,
  unit,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit?: string;
  className?: string;
}) {
  return (
    <label className={`block text-xs ${className}`}>
      <span className="font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-input bg-background">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2 text-sm outline-none"
        />
        {unit && <span className="pr-2 text-[11px] text-muted-foreground">{unit}</span>}
      </div>
    </label>
  );
}

