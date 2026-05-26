import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { languages, translations, type Language } from "@/i18n/translations";

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dir: "ltr" | "rtl";
};

const I18nContext = createContext<I18nContextValue | null>(null);

const storageKey = "medcity-language";

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return "fr";
  const saved = window.localStorage.getItem(storageKey) as Language | null;
  if (saved && translations[saved]) return saved;
  const browserLanguage = window.navigator.language.toLowerCase();
  if (browserLanguage.startsWith("ar")) return "ar";
  if (browserLanguage.startsWith("en")) return "en";
  return "fr";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const current = languages.find((item) => item.code === language) ?? languages[0];

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = current.dir;
    window.localStorage.setItem(storageKey, language);
  }, [current.dir, language]);

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: string, params?: Record<string, string | number>) => {
      const template = translations[language][key] ?? translations.fr[key] ?? key;
      if (!params) return template;
      return Object.entries(params).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        template,
      );
    };
    return {
      language,
      setLanguage: setLanguageState,
      t,
      dir: current.dir,
    };
  }, [current.dir, language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
