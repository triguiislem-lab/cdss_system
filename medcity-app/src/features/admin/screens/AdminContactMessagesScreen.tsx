import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Inbox,
  Mail,
  RefreshCw,
  Search,
} from "lucide-react";

import { LoadingState } from "@/components/molecules/LoadingState";
import {
  type ApiContactMessage,
  listContactMessages,
  updateContactMessageStatus,
} from "@/lib/backend-api";

type ContactStatus = ApiContactMessage["status"];

const statusLabels: Record<ContactStatus, string> = {
  new: "Nouveau",
  read: "Lu",
  resolved: "Resolue",
};

const statusClass: Record<ContactStatus, string> = {
  new: "border-warning/30 bg-warning-soft text-warning-foreground",
  read: "border-info/30 bg-info-soft text-info",
  resolved: "border-success/30 bg-success-soft text-success",
};

export default function AdminContactMessagesScreen() {
  const [messages, setMessages] = useState<ApiContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ContactStatus>("all");
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setMessages(await listContactMessages());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger les messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return messages.filter((message) => {
      const statusMatches = statusFilter === "all" || message.status === statusFilter;
      if (!statusMatches) return false;
      if (!q) return true;
      return [message.name, message.email, message.subject, message.message, message.source]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q));
    });
  }, [messages, search, statusFilter]);

  const counts = {
    total: messages.length,
    new: messages.filter((message) => message.status === "new").length,
    read: messages.filter((message) => message.status === "read").length,
    resolved: messages.filter((message) => message.status === "resolved").length,
  };

  async function setStatus(message: ApiContactMessage, status: ContactStatus) {
    setUpdatingId(message.id);
    setError("");
    try {
      const updated = await updateContactMessageStatus(message.id, status);
      setMessages((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Impossible de changer le statut.");
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gestion des contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Messages publics et demandes docteur recus par le backend puis notifies via Resend.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50 transition-smooth"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Recharger
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Total" value={counts.total} icon={Inbox} />
        <Metric label="Nouveaux" value={counts.new} icon={Mail} className="text-warning-foreground bg-warning-soft" />
        <Metric label="Lus" value={counts.read} icon={Mail} className="text-info bg-info-soft" />
        <Metric label="Resolus" value={counts.resolved} icon={CheckCircle2} className="text-success bg-success-soft" />
      </div>

      <section className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher nom, email, sujet, message..."
              className="flex-1 bg-transparent outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | ContactStatus)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">Tous les statuts</option>
            <option value="new">Nouveau</option>
            <option value="read">Lu</option>
            <option value="resolved">Resolue</option>
          </select>
        </div>

        {error && (
          <div className="m-4 rounded-lg border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical">
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </span>
          </div>
        )}

        {loading ? (
          <div className="p-4">
            <LoadingState title="Chargement des messages" subtitle="Lecture des demandes contact..." />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Aucun message trouve.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((message) => (
              <li key={message.id} className="p-5 hover:bg-muted/30 transition-smooth">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{message.subject || "Sans objet"}</h2>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass[message.status]}`}>
                        {statusLabels[message.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {message.name} - {message.email} - {message.source} - {formatDate(message.createdAt)}
                    </p>
                  </div>
                  <a
                    href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject || "MedCity"}`)}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-xs font-semibold hover:bg-muted transition-smooth"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Repondre
                  </a>
                </div>
                <p className="mt-4 whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm leading-relaxed">
                  {message.message}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(["new", "read", "resolved"] as ContactStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void setStatus(message, status)}
                      disabled={updatingId === message.id || message.status === status}
                      className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50 transition-smooth"
                    >
                      {updatingId === message.id ? "Mise a jour..." : statusLabels[status]}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  className = "text-primary bg-primary-soft",
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${className}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="mt-3 text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
