import type { ComponentType, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  MailCheck,
  RefreshCw,
  Search,
  Send,
  Users,
} from "lucide-react";

import { LoadingState } from "@/components/molecules/LoadingState";
import { useToast } from "@/hooks/use-toast";
import {
  type ApiNewsletterSubscription,
  type NewsletterCampaignResult,
  listNewsletterSubscriptions,
  sendNewsletterCampaign,
} from "@/lib/backend-api";

export default function AdminNewsletterScreen() {
  const { toast } = useToast();
  const [subscriptions, setSubscriptions] = useState<ApiNewsletterSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [campaign, setCampaign] = useState({
    subject: "",
    message: "",
  });
  const [lastResult, setLastResult] = useState<NewsletterCampaignResult | null>(null);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setSubscriptions(await listNewsletterSubscriptions());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger les abonnes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subscriptions;
    return subscriptions.filter((subscription) =>
      [subscription.email, subscription.source, subscription.status]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q)),
    );
  }, [subscriptions, search]);

  const activeCount = subscriptions.filter((subscription) => subscription.status === "active").length;

  async function sendCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    setLastResult(null);
    try {
      const result = await sendNewsletterCampaign(campaign);
      setLastResult(result);
      toast({
        title: "Campagne traitee par Resend",
        description: `${result.sent} envoyes, ${result.skipped} ignores, ${result.failed} echoues.`,
      });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Impossible d'envoyer la campagne.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Newsletter</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Abonnes publics et campagnes envoyees via Resend depuis le domaine configure.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || sending}
          className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50 transition-smooth"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Recharger
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Metric label="Abonnes total" value={subscriptions.length} icon={Users} />
        <Metric label="Actifs" value={activeCount} icon={CheckCircle2} className="bg-success-soft text-success" />
        <Metric label="Dernier envoi" value={lastResult ? lastResult.sent : 0} icon={MailCheck} className="bg-info-soft text-info" />
      </div>

      {error && (
        <div className="rounded-lg border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical">
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <form onSubmit={sendCampaign} className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Envoyer une campagne</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Destinataires actifs: {activeCount}
            </p>
          </div>
          <div className="space-y-4 p-5">
            <label className="space-y-1.5 block">
              <span className="text-xs font-semibold text-muted-foreground">Sujet</span>
              <input
                required
                minLength={3}
                value={campaign.subject}
                onChange={(event) => setCampaign((current) => ({ ...current, subject: event.target.value }))}
                className={fieldInputClass}
                placeholder="Actualites MedCity"
              />
            </label>
            <label className="space-y-1.5 block">
              <span className="text-xs font-semibold text-muted-foreground">Message</span>
              <textarea
                required
                minLength={10}
                rows={9}
                value={campaign.message}
                onChange={(event) => setCampaign((current) => ({ ...current, message: event.target.value }))}
                className={`${fieldInputClass} resize-none`}
                placeholder="Contenu de la newsletter..."
              />
            </label>
            <button
              type="submit"
              disabled={sending || activeCount === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-smooth"
            >
              <Send className="h-4 w-4" />
              {sending ? "Envoi via Resend..." : "Envoyer aux abonnes actifs"}
            </button>

            {lastResult && (
              <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground">Resultat Resend</div>
                <div className="mt-1">
                  Total {lastResult.total} - Envoyes {lastResult.sent} - Skipped {lastResult.skipped} - Echoues {lastResult.failed}
                </div>
              </div>
            )}
          </div>
        </form>

        <section className="xl:col-span-2 rounded-xl border border-border bg-card shadow-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher email, source, statut..."
                className="flex-1 bg-transparent outline-none"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-4">
              <LoadingState title="Chargement newsletter" subtitle="Lecture des abonnes newsletter..." />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Aucun abonne trouve.</div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((subscription) => (
                <li key={subscription.id} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/30 transition-smooth">
                  <div className="min-w-0">
                    <div className="font-semibold">{subscription.email}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Source {subscription.source} - {formatDate(subscription.createdAt)}
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    subscription.status === "active"
                      ? "border-success/30 bg-success-soft text-success"
                      : "border-muted bg-muted text-muted-foreground"
                  }`}>
                    {subscription.status === "active" ? "Actif" : "Desabonne"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  className = "bg-primary-soft text-primary",
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

const fieldInputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20";
