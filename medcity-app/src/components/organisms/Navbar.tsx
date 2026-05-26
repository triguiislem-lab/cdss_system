import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useGetSearchSuggestions } from "@/lib/api-client";
import { Search, Loader2, Phone } from "lucide-react";
import { Input } from "@/components/atoms/input";
import { Button } from "@/components/atoms/button";
import { LanguageSwitcher } from "@/components/molecules/LanguageSwitcher";
import { useI18n } from "@/i18n/I18nProvider";

export function Navbar() {
  const { t } = useI18n();
  const [location, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: suggestions, isLoading } = useGetSearchSuggestions(
    { query: searchQuery },
    { query: { enabled: searchQuery.length > 2 } }
  );

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowSuggestions(false);
      setLocation(`/search?query=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const isSearchPage = location.startsWith("/search");

  return (
    <>
      {/* Top bar */}
      <div className="bg-primary text-primary-foreground text-sm py-1.5 px-4">
        <div className="container mx-auto flex items-center justify-between">
          <a href="tel:+21624232224" className="flex items-center gap-1.5 hover:text-primary-foreground/80 transition-colors">
            <Phone className="h-3.5 w-3.5" />
            <span>+216 24 23 22 24</span>
          </a>
          <LanguageSwitcher compact />
        </div>
      </div>

      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0 transition-transform hover:scale-105 active:scale-95">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-accent text-white font-bold text-lg leading-none">+</div>
            <span className="font-bold text-xl tracking-tight">
              <span className="text-accent">Med</span><span className="text-primary">City</span>
              <span className="text-muted-foreground text-sm font-normal ml-1">Connect</span>
            </span>
          </Link>

          {/* Search bar (search/advanced pages) */}
          {isSearchPage && (
            <div className="flex-1 max-w-2xl hidden md:block" ref={containerRef}>
              <form onSubmit={handleSearch} className="relative">
                <div className="relative flex items-center">
                  <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder={t("navbar.searchPlaceholder")}
                    className="pl-9 pr-12 w-full bg-muted/50 border-transparent focus-visible:bg-background focus-visible:ring-accent shadow-none transition-colors"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    className="absolute right-1 h-7 w-7 text-muted-foreground hover:text-accent"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
                {showSuggestions && searchQuery.length > 2 && (
                  <div className="absolute top-full mt-1 w-full bg-popover border rounded-md shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 z-50">
                    {isLoading ? (
                      <div className="p-4 flex items-center justify-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        <span className="text-sm">{t("common.loading")}</span>
                      </div>
                    ) : suggestions?.suggestions && suggestions.suggestions.length > 0 ? (
                      <ul className="py-2">
                        {suggestions.suggestions.map((suggestion, i) => (
                          <li key={i}>
                            <button
                              type="button"
                              className="w-full text-left px-4 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none transition-colors"
                              onClick={() => {
                                setSearchQuery(suggestion);
                                setShowSuggestions(false);
                                setLocation(`/search?query=${encodeURIComponent(suggestion)}`);
                              }}
                            >
                              <div className="flex items-center">
                                <Search className="h-3 w-3 mr-2 text-muted-foreground opacity-50" />
                                <span>{suggestion}</span>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-4 text-sm text-muted-foreground text-center">{t("common.noSuggestion")}</div>
                    )}
                  </div>
                )}
              </form>
            </div>
          )}

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-1 shrink-0">
            <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors px-3 py-2">
              {t("nav.home")}
            </Link>
            <Link href="/doctors" className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors px-3 py-2">
              {t("nav.doctors")}
            </Link>
            <Link href="/blog" className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors px-3 py-2">
              {t("nav.blog")}
            </Link>
            <Link href="/contact" className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors px-3 py-2">
              {t("nav.contact")}
            </Link>
            <Link href="/login">
              <Button variant="outline" size="sm" className="ml-2 border-accent text-accent hover:bg-accent hover:text-white">
                {t("nav.login")}
              </Button>
            </Link>
          </nav>

          {/* Mobile menu button */}
          <button
            className="md:hidden flex items-center p-2 rounded-md text-muted-foreground hover:text-accent"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={t("navbar.toggleMenu")}
          >
            <span className="text-xl">{mobileOpen ? "×" : "☰"}</span>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t bg-background px-4 py-4 space-y-2 animate-in slide-in-from-top-2">
            <Link href="/" className="block text-sm font-medium py-2 hover:text-accent transition-colors" onClick={() => setMobileOpen(false)}>
              {t("nav.home")}
            </Link>
            <Link href="/doctors" className="block text-sm font-medium py-2 hover:text-accent transition-colors" onClick={() => setMobileOpen(false)}>
              {t("nav.doctors")}
            </Link>
            <Link href="/blog" className="block text-sm font-medium py-2 hover:text-accent transition-colors" onClick={() => setMobileOpen(false)}>
              {t("nav.blog")}
            </Link>
            <Link href="/contact" className="block text-sm font-medium py-2 hover:text-accent transition-colors" onClick={() => setMobileOpen(false)}>
              {t("nav.contact")}
            </Link>
            <div className="flex gap-2 pt-2">
              <Link href="/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                <Button variant="outline" size="sm" className="w-full border-accent text-accent">
                  {t("nav.login")}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
