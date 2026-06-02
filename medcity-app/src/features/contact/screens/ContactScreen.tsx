import { useState, type FormEvent } from "react";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Phone, Mail, MapPin, Facebook, Instagram, Clock, Loader2, Send } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { createContactMessage } from "@/lib/backend-api";

export default function Contact() {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await createContactMessage({
        name: form.name,
        email: form.email,
        subject: form.subject.trim() || undefined,
        message: form.message,
        source: "public_contact",
      });
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("contact.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <section className="bg-primary py-16 px-4 text-center">
        <div className="container mx-auto max-w-3xl">
          <Badge className="bg-accent/20 text-accent border-accent/30 mb-4">{t("contact.badge")}</Badge>
          <h1 className="text-4xl font-bold text-white mb-4">{t("contact.title")}</h1>
          <p className="text-white/70 text-lg">{t("contact.subtitle")}</p>
        </div>
      </section>

      <section className="py-16 container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 max-w-5xl mx-auto">
          <div className="space-y-6">
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("contact.infoTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <ContactInfo icon={Phone} label={t("contact.phone")}>
                  <a href="tel:+21624232224" className="text-sm font-medium hover:text-accent transition-colors">
                    +216 24 23 22 24
                  </a>
                </ContactInfo>
                <ContactInfo icon={Mail} label={t("common.email")}>
                  <a href="mailto:contact@medcity.tn" className="text-sm font-medium hover:text-accent transition-colors">
                    contact@medcity.tn
                  </a>
                </ContactInfo>
                <ContactInfo icon={MapPin} label={t("contact.address")}>
                  <p className="text-sm font-medium">Tunis, Tunisie</p>
                </ContactInfo>
                <ContactInfo icon={Clock} label={t("contact.hours")}>
                  <p className="text-sm font-medium">{t("contact.weekdays")}</p>
                  <p className="text-xs text-muted-foreground">{t("contact.saturday")}</p>
                </ContactInfo>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("contact.social")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <a
                    href="https://www.facebook.com/people/Medcity/61572907067189/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-lg bg-blue-500/10 hover:bg-blue-500 hover:text-white transition-colors flex items-center justify-center text-blue-500"
                  >
                    <Facebook className="h-5 w-5" />
                  </a>
                  <a
                    href="https://www.instagram.com/medcity.health/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-lg bg-pink-500/10 hover:bg-pink-500 hover:text-white transition-colors flex items-center justify-center text-pink-500"
                  >
                    <Instagram className="h-5 w-5" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle>{t("contact.sendTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                {sent ? (
                  <div className="py-12 text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
                      <Send className="h-8 w-8 text-accent" />
                    </div>
                    <h3 className="text-xl font-semibold">{t("contact.sentTitle")}</h3>
                    <p className="text-muted-foreground text-sm">{t("contact.sentText")}</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => { setSent(false); setError(""); setForm({ name: "", email: "", subject: "", message: "" }); }}
                    >
                      {t("contact.sendAnother")}
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t("contact.fullName")} *</label>
                        <Input
                          placeholder={t("contact.namePlaceholder")}
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t("common.email")} *</label>
                        <Input
                          type="email"
                          placeholder={t("footer.newsletter.emailPlaceholder")}
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("common.subject")}</label>
                      <Input
                        placeholder={t("contact.subjectPlaceholder")}
                        value={form.subject}
                        onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("common.message")} *</label>
                      <textarea
                        className="w-full min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                        placeholder={t("contact.messagePlaceholder")}
                        value={form.message}
                        onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                        required
                      />
                    </div>
                    {error ? (
                      <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {error}
                      </p>
                    ) : null}
                    <Button type="submit" size="lg" className="w-full bg-accent hover:bg-accent/90 text-white" disabled={submitting}>
                      {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                      {submitting ? t("contact.submitting") : t("contact.submit")}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContactInfo({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        {children}
      </div>
    </div>
  );
}
