import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Stethoscope, Mail, Lock, LogIn, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageSwitcher } from "@/components/molecules/LanguageSwitcher";
import { useI18n } from "@/i18n/I18nProvider";

export default function LoginPage() {
  const { t } = useI18n();
  const { login, isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("dr.ahmed@medcity.tn");
  const [password, setPassword] = useState("Medcity123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      setLocation(user.role === "admin" ? "/admin" : "/doctor");
    }
  }, [isAuthenticated, user, setLocation]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    setTimeout(() => {
        const res = login(email, password);
        setLoading(false);
        if (res.ok) {
            setLocation(res.role === "admin" ? "/admin" : "/doctor");
        } else {
            setError(res.error || t("login.error"));
        }
    }, 600);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <Stethoscope className="h-5 w-5" />
            </span>
            <div>
              <div className="font-semibold">MedCity Connect</div>
              <div className="text-xs opacity-80 uppercase tracking-wider">CDSS - v3.2.1</div>
            </div>
          </div>
          <LanguageSwitcher compact />
        </div>
        <div>
          <h1 className="text-3xl font-bold leading-tight">{t("login.heroTitle")}</h1>
          <p className="mt-3 text-sm opacity-90 max-w-md">
            {t("login.heroText")}
          </p>
        </div>
        <div className="text-xs opacity-80">© 2026 MedCity Connect - {t("login.responsibility")}</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Stethoscope className="h-5 w-5" /></span>
            <div className="font-semibold text-foreground">MedCity Connect CDSS</div>
          </div>

          <div className="mb-5 flex justify-end lg:hidden">
            <LanguageSwitcher />
          </div>

          <h2 className="text-2xl font-bold text-foreground">{t("login.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("login.subtitle")}</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("login.email")}</span>
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground" placeholder="you@hospital.tn" />
              </div>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("login.password")}</span>
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="flex-1 bg-transparent outline-none text-sm text-foreground" />
              </div>
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-critical/30 bg-critical-soft p-2.5 text-xs text-critical">
                <AlertCircle className="h-4 w-4 flex-none mt-0.5" /> {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-smooth disabled:opacity-60">
              <LogIn className="h-4 w-4" /> {loading ? t("login.submitting") : t("login.submit")}
            </button>
          </form>

          <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs">
            <div className="font-semibold text-foreground mb-1">{t("login.demoAccounts")}</div>
            <div className="text-muted-foreground">{t("login.doctor")} : dr.ahmed@medcity.tn / Medcity123</div>
            <div className="text-muted-foreground">{t("login.admin")} : admin@medcity.tn / Admin123</div>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            {t("login.terms")}
          </p>
        </div>
      </div>
    </div>
  );
}

