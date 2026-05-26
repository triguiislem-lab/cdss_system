import { languages, type Language } from "@/i18n/translations";
import { useI18n } from "@/i18n/I18nProvider";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useI18n();

  return (
    <div className="flex items-center gap-1" aria-label="Language selector">
      {languages.map((item) => (
        <button
          key={item.code}
          type="button"
          onClick={() => setLanguage(item.code as Language)}
          className={`rounded-full px-2 py-0.5 text-xs transition-smooth ${
            language === item.code
              ? "bg-white/20 font-bold text-current ring-1 ring-current/20"
              : "text-current/70 hover:text-current"
          }`}
          title={item.label}
        >
          {compact ? item.shortLabel : item.label}
        </button>
      ))}
    </div>
  );
}
