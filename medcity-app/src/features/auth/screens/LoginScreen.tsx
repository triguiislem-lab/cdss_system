import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, KeyRound, Lock, LogIn, Mail, Stethoscope } from "lucide-react";
import { LanguageSwitcher } from "@/components/molecules/LanguageSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";
import { requestPasswordResetApi, resetPasswordApi } from "@/lib/backend-api";

type AuthMode = "login" | "request-reset" | "reset-password";

export default function LoginPage() {
  const { t } = useI18n();
  const { login, isAuthenticated, user } = useAuth();
  const [location, setLocation] = useLocation();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("dr.ahmed@medcity.tn");
  const [password, setPassword] = useState("Medcity123");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") ?? "";
    if (location.startsWith("/reset-password") && token) {
      setMode("reset-password");
      setResetToken(token);
      setPassword("");
      return;
    }
    if (isAuthenticated && user) {
      setLocation(user.role === "admin" ? "/admin" : "/doctor");
    }
  }, [isAuthenticated, location, setLocation, user]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    setTimeout(() => {
      void (async () => {
        try {
          const res = await login(email, password);
          if (res.ok) {
            setLocation(res.role === "admin" ? "/admin" : "/doctor");
          } else {
            setError(res.error || t("login.error"));
          }
        } finally {
          setLoading(false);
        }
      })();
    }, 600);
  };

  const onRequestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await requestPasswordResetApi(email);
      setSuccess("Si ce compte medecin existe, un lien de reinitialisation vient d'etre envoye par email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer le lien de reinitialisation.");
    } finally {
      setLoading(false);
    }
  };

  const onResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (password.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      await resetPasswordApi(resetToken, password);
      setSuccess("Mot de passe mis a jour. Vous pouvez maintenant vous connecter.");
      setMode("login");
      setLocation("/login");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lien de reinitialisation invalide ou expire.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setSuccess(null);
    if (nextMode === "login") {
      setLocation("/login");
    }
    if (nextMode !== "reset-password") {
      setResetToken("");
    }
  };

  const title =
    mode === "login"
      ? t("login.title")
      : mode === "request-reset"
        ? "Reinitialiser le mot de passe"
        : "Nouveau mot de passe";
  const subtitle =
    mode === "login"
      ? t("login.subtitle")
      : mode === "request-reset"
        ? "Recevez un lien securise sur l'adresse email du compte medecin."
        : "Definissez un nouveau mot de passe pour votre compte medecin.";

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
          <p className="mt-3 text-sm opacity-90 max-w-md">{t("login.heroText")}</p>
        </div>
        <div className="text-xs opacity-80">© 2026 MedCity Connect - {t("login.responsibility")}</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Stethoscope className="h-5 w-5" />
            </span>
            <div className="font-semibold text-foreground">MedCity Connect CDSS</div>
          </div>

          <div className="mb-5 flex justify-end lg:hidden">
            <LanguageSwitcher />
          </div>

          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>

          <form
            onSubmit={mode === "login" ? onSubmit : mode === "request-reset" ? onRequestReset : onResetPassword}
            className="mt-6 space-y-4"
          >
            {mode !== "reset-password" && (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("login.email")}</span>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                    placeholder="you@hospital.tn"
                  />
                </div>
              </label>
            )}

            {mode !== "request-reset" && (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {mode === "login" ? t("login.password") : "Nouveau mot de passe"}
                </span>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="flex-1 bg-transparent outline-none text-sm text-foreground"
                  />
                </div>
              </label>
            )}

            {mode === "reset-password" && (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Confirmer le mot de passe
                </span>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="flex-1 bg-transparent outline-none text-sm text-foreground"
                  />
                </div>
              </label>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-critical/30 bg-critical-soft p-2.5 text-xs text-critical">
                <AlertCircle className="h-4 w-4 flex-none mt-0.5" /> {error}
              </div>
            )}

            {success && (
              <div className="rounded-lg border border-success/30 bg-success-soft p-2.5 text-xs text-success">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-smooth disabled:opacity-60"
            >
              {mode === "login" ? <LogIn className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
              {loading
                ? t("login.submitting")
                : mode === "login"
                  ? t("login.submit")
                  : mode === "request-reset"
                    ? "Envoyer le lien"
                    : "Mettre a jour le mot de passe"}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between gap-3 text-xs">
            {mode === "login" ? (
              <button type="button" onClick={() => switchMode("request-reset")} className="font-semibold text-primary hover:underline">
                Mot de passe oublie ?
              </button>
            ) : (
              <button type="button" onClick={() => switchMode("login")} className="font-semibold text-primary hover:underline">
                Retour a la connexion
              </button>
            )}
          </div>

          {mode === "login" && (
            <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs">
              <div className="font-semibold text-foreground mb-1">{t("login.demoAccounts")}</div>
              <div className="text-muted-foreground">{t("login.doctor")} : dr.ahmed@medcity.tn / Medcity123</div>
              <div className="text-muted-foreground">{t("login.admin")} : admin@medcity.tn / Admin123</div>
            </div>
          )}

          <p className="mt-4 text-xs text-muted-foreground">{t("login.terms")}</p>
        </div>
      </div>
    </div>
  );
}
