import { Link } from "wouter";
import { Phone, Facebook, Instagram, MapPin, Mail, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export function Footer() {
  const { t } = useI18n();

  return (
    <footer>
      {/* Newsletter strip */}
      <div className="relative overflow-hidden text-white" style={{ background: "linear-gradient(135deg, #0a1628 0%, #0d2d5e 40%, #1565c0 75%, #1e82d4 100%)", minHeight: 280 }}>
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #60a5fa, transparent 70%)" }} />
        <div className="absolute -bottom-20 left-1/4 w-72 h-72 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #38bdf8, transparent 70%)" }} />
        <div className="absolute top-0 right-96 w-52 h-52 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #93c5fd, transparent 70%)" }} />
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

        <div className="absolute right-0 bottom-0 h-full hidden lg:flex items-end" style={{ width: 320 }}>
          <img
            src="/doctor-hero.png"
            alt="MedCity doctor"
            className="h-full w-auto object-contain object-bottom"
            style={{ filter: "drop-shadow(-12px 0 40px rgba(96,216,250,0.20))", maxHeight: 340 }}
          />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-8 md:px-16 lg:px-24 py-14 lg:py-16 lg:max-w-[calc(100%-340px)]">
          <h3 className="text-3xl md:text-4xl xl:text-5xl font-extrabold leading-tight mb-3">
            {t("footer.newsletter.title")}<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg, #60d8fa, #a5f3fc)" }}>
              {t("footer.newsletter.highlight")}
            </span>
          </h3>
          <p className="text-white/70 text-base md:text-lg mb-8 max-w-lg">
            {t("footer.newsletter.text")}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
            <div className="relative flex-1">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="email"
                placeholder={t("footer.newsletter.emailPlaceholder")}
                className="h-12 w-full pl-10 pr-4 rounded-xl text-sm bg-white border-0 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 placeholder:text-slate-400 text-slate-800 shadow-lg"
              />
            </div>
            <button
              className="h-12 px-8 rounded-xl text-sm font-bold text-white whitespace-nowrap transition-all hover:scale-105 active:scale-95 shadow-xl"
              style={{ background: "linear-gradient(135deg, #06b6d4, #0891b2)" }}
            >
              {t("footer.newsletter.cta")}
            </button>
          </div>

          <div className="flex flex-wrap gap-5 mt-5">
            {["footer.newsletter.benefit1", "footer.newsletter.benefit2", "footer.newsletter.benefit3"].map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span className="text-xs text-white/60">{t(item)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            {/* Brand */}
            <div className="md:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-accent text-white font-bold text-lg leading-none">+</div>
                <span className="font-bold text-xl tracking-tight">
                  <span className="text-accent">Med</span><span className="text-white">City</span>
                  <span className="text-white/60 text-sm font-normal ml-1">Connect</span>
                </span>
              </Link>
              <p className="text-sm text-white/70 leading-relaxed mb-6">
                {t("footer.brandText")}
              </p>
              <div className="flex gap-4">
                <a href="https://www.facebook.com/people/Medcity/61572907067189/" target="_blank" rel="noopener noreferrer"
                   className="w-9 h-9 rounded-full bg-white/10 hover:bg-accent transition-colors flex items-center justify-center">
                  <Facebook className="h-4 w-4" />
                </a>
                <a href="https://www.instagram.com/medcity.health/" target="_blank" rel="noopener noreferrer"
                   className="w-9 h-9 rounded-full bg-white/10 hover:bg-accent transition-colors flex items-center justify-center">
                  <Instagram className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Navigation */}
            <div>
              <h3 className="font-semibold mb-5 text-white">{t("footer.navigation")}</h3>
              <ul className="space-y-3 text-sm text-white/70">
                <li><Link href="/" className="hover:text-accent transition-colors">{t("nav.home")}</Link></li>
                <li><Link href="/doctors" className="hover:text-accent transition-colors">{t("nav.doctors")}</Link></li>
                <li><Link href="/blog" className="hover:text-accent transition-colors">{t("nav.blog")}</Link></li>
                <li><Link href="/contact" className="hover:text-accent transition-colors">{t("nav.contact")}</Link></li>
              </ul>
            </div>

            {/* Specialties */}
            <div>
              <h3 className="font-semibold mb-5 text-white">{t("footer.specialties")}</h3>
              <ul className="space-y-3 text-sm text-white/70">
                <li>Pneumologie</li>
                <li>Neurologie</li>
                <li>Orthopédie</li>
                <li>Cardiologie</li>
                <li>Chirurgie esthétique</li>
                <li>Soins Infirmiers</li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h3 className="font-semibold mb-5 text-white">{t("footer.contact")}</h3>
              <ul className="space-y-4 text-sm text-white/70">
                <li className="flex items-start gap-3">
                  <Phone className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                  <a href="tel:+21624232224" className="hover:text-accent transition-colors">+216 24 23 22 24</a>
                </li>
                <li className="flex items-start gap-3">
                  <Mail className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                  <a href="mailto:contact@medcity.tn" className="hover:text-accent transition-colors">contact@medcity.tn</a>
                </li>
                <li className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                  <span>Tunis, Tunisie</span>
                </li>
              </ul>

            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 py-5 px-4">
          <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/50">
            <p>&copy; {new Date().getFullYear()} MedCity Connect. {t("footer.rights")}</p>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white transition-colors">{t("footer.privacy")}</a>
              <a href="#" className="hover:text-white transition-colors">{t("footer.terms")}</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
