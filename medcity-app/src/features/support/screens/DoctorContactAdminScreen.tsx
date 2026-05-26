import { useState, type FormEvent } from "react";
import { Mail, MessageSquare, Send, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/I18nProvider";

const ADMIN_EMAIL = "admin@medcity.tn";
const CATEGORY_KEYS = [
  "contactAdmin.category.clinicalSupport",
  "contactAdmin.category.contribution",
  "contactAdmin.category.prescriptionIssue",
  "contactAdmin.category.access",
  "contactAdmin.category.other",
] as const;

export default function DoctorContactAdmin() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>(CATEGORY_KEYS[0]);
  const [message, setMessage] = useState("");
  const [sentMessages, setSentMessages] = useState<Array<{ subject: string; category: string; message: string; at: string }>>([]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) return;

    setSentMessages((current) => [
      {
        subject,
        category,
        message,
        at: new Date().toLocaleString("fr-FR"),
      },
      ...current,
    ]);
    setSubject("");
    setMessage("");
    toast({
      title: t("contactAdmin.toastTitle"),
      description: t("contactAdmin.toastDescription"),
    });
  }

  const mailto = `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(subject || t("contactAdmin.mailSubject"))}&body=${encodeURIComponent(
    `${t("contactAdmin.mailBodyDoctor")}: ${user?.nom ?? t("login.doctor")}\n${t("common.email")}: ${user?.email ?? ""}\n${t("common.category")}: ${t(category)}\n\n${message}`,
  )}`;

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("contactAdmin.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("contactAdmin.subtitle")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="lg:col-span-7 rounded-xl border border-border bg-card shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("contactAdmin.newMessage")}</h2>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("common.category")}</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  {CATEGORY_KEYS.map((key) => (
                    <option key={key} value={key}>{t(key)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("common.subject")}</span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder={t("contactAdmin.subjectPlaceholder")}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("common.message")}</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={7}
                placeholder={t("contactAdmin.messagePlaceholder")}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </label>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <a
                href={mailto}
                className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-muted transition-smooth"
              >
                <Mail className="h-4 w-4" /> {t("contactAdmin.openEmail")}
              </a>
              <button
                type="submit"
                disabled={!subject.trim() || !message.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-smooth"
              >
                <Send className="h-4 w-4" /> {t("contactAdmin.send")}
              </button>
            </div>
          </form>
        </section>

        <aside className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-card p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" />
              <h2 className="font-semibold">{t("contactAdmin.channel")}</h2>
            </div>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{t("contactAdmin.channelHelp")}</p>
            <div className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
              <div className="font-semibold text-muted-foreground">{t("contactAdmin.adminEmail")}</div>
              <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary hover:underline">{ADMIN_EMAIL}</a>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">{t("contactAdmin.recent")}</h2>
            </div>
            {sentMessages.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">{t("contactAdmin.empty")}</div>
            ) : (
              <div className="divide-y divide-border">
                {sentMessages.map((item) => (
                  <article key={`${item.at}-${item.subject}`} className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-primary/30 bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {t(item.category)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{item.at}</span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold">{item.subject}</h3>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{item.message}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
