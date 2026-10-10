import { ClerkProvider } from "@clerk/nextjs";
import { itIT } from "@clerk/localizations";

// Testi di accesso (03/10/2026): il nome dell'applicazione su Clerk è ancora quello storico
// ("HOC Fan Agent"), quindi il sottotitolo si scrive qui; avvisi di accesso negato in italiano.
const LOCALE = {
  ...itIT,
  signIn: { ...itIT.signIn, start: { ...itIT.signIn?.start, title: "Accedi", subtitle: "a HOC Pro, con il tuo account aziendale" } },
  unstable__errors: {
    ...itIT.unstable__errors,
    not_allowed_access: "Questo account non è stato invitato. Entra con l'account a cui è arrivato l'invito, oppure chiedi un invito a chi gestisce HOC Pro.",
    sign_up_restricted: "Questo account non è stato invitato. Entra con l'account a cui è arrivato l'invito, oppure chiedi un invito a chi gestisce HOC Pro.",
  },
};
import Providers from "@/components/Providers";
import AppShell from "@/components/AppShell";
import "./globals.css";
import { themeCss, CP } from "@/lib/brand";
import { Manrope, Instrument_Serif, Cinzel } from "next/font/google";

// Caratteri dello stile v3 "Casa" (anteprima): serviti dal nostro dominio da
// next/font, con misure di riserva calcolate (niente salto al caricamento).
// Usati solo sotto data-style="v3" tramite --f-sans / --f-display.
// Manrope per l'interfaccia, Instrument Serif per titoli e numeri protagonisti
// (mai nelle tabelle). Gli stessi di "La casa" (26/09 notte).
const fSans = Manrope({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], display: "swap", variable: "--f-sans" });
const fSig = Instrument_Serif({ subsets: ["latin", "latin-ext"], weight: "400", style: ["normal", "italic"], display: "swap", variable: "--f-display" });
// Carattere del logo (03/10/2026, scelta "E" del board): Cinzel, solo per la scritta del marchio.
const fBrand = Cinzel({ subsets: ["latin"], weight: ["500"], display: "swap", variable: "--f-brand" });

export const metadata = {
  title: "HOC Pro",
  description: "La console operativa di House of Creators: performance, training, compensation e team.",
  // aggiunta alla schermata Home dell'iPhone: si apre a schermo intero col nome giusto
  appleWebApp: { capable: true, title: "HOC Pro", statusBarStyle: "black-translucent" },
};

export const viewport = { themeColor: "#08090c" };

export default function RootLayout({ children }) {
  // `dynamic` (Clerk 6): ripristina il comportamento di Clerk 5 — stato auth
  // letto a ogni richiesta e nessuna pagina prerenderizzata statica. Senza,
  // Next 15 prova a prerenderizzare le pagine client (useSearchParams senza
  // Suspense → build rotta) e il primo paint non conosce l'utente.
  return (
    <ClerkProvider
      dynamic
      localization={LOCALE}
      appearance={{
        variables: {
          colorPrimary: CP.accent,
          colorBackground: CP.bg,
          colorText: CP.textPrimary,
          colorInputBackground: CP.surface,
          colorInputText: CP.textPrimary,
          fontFamily: "var(--cp-font)",
        },
        elements: {
          formButtonPrimary: "bg-[var(--cp-accent)] hover:bg-[var(--cp-accent)] text-[var(--cp-accentInk)]",
          card: "bg-[var(--cp-surface)] border border-[var(--cp-border)]",
          headerTitle: "text-[var(--cp-textPrimary)]",
          headerSubtitle: "text-[var(--cp-textMuted)]",
          socialButtonsBlockButton: "bg-[var(--cp-surface)] border-[var(--cp-border)] text-[var(--cp-textPrimary)]",
          formFieldLabel: "text-[var(--cp-textSecondary)]",
          formFieldInput: "bg-[var(--cp-surface)] border-[var(--cp-border)] text-[var(--cp-textPrimary)]",
          footerActionLink: "text-[var(--cp-accent)] hover:text-[var(--cp-accentSoftText)]",
          // UserButton popover (account menu)
          userButtonPopoverCard: "bg-[var(--cp-surface)] border border-[var(--cp-border)]",
          userButtonPopoverMain: "bg-[var(--cp-surface)]",
          userButtonPopoverActions: "bg-[var(--cp-surface)]",
          userButtonPopoverActionButton: "text-[var(--cp-textPrimary)] hover:bg-[var(--cp-surfaceAlt)]",
          userButtonPopoverActionButtonText: "text-[var(--cp-textPrimary)]",
          userButtonPopoverActionButtonIcon: "text-[var(--cp-accent)]",
          userButtonPopoverFooter: "bg-[var(--cp-bgSunken)] border-t border-[var(--cp-borderSoft)]",
          userPreviewMainIdentifier: "text-[var(--cp-textPrimary)]",
          userPreviewSecondaryIdentifier: "text-[var(--cp-textSecondary)]",
          // Generic menu items (covers org switcher etc.)
          menuItem: "text-[var(--cp-textPrimary)] hover:bg-[var(--cp-surfaceAlt)]",
          menuList: "bg-[var(--cp-surface)]",
        },
      }}
    >
      <html lang="it" data-theme="light" className={`${fSans.variable} ${fSig.variable} ${fBrand.variable}`} suppressHydrationWarning>
        <head>
          {/* Tema chiaro/scuro: variabili dei due temi + scelta salvata applicata PRIMA
              del primo disegno (niente lampo del tema sbagliato). Default: scuro. */}
          <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
          <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("hoc:theme")==="dark")document.documentElement.removeAttribute("data-theme");if(localStorage.getItem("hoc:style")==="v3"){document.documentElement.setAttribute("data-style","v3");if(!sessionStorage.getItem("hoc:intro")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.classList.add("casa-intro");sessionStorage.setItem("hoc:intro","1")}}}catch(e){}` }} />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap"
            rel="stylesheet"
          />
        </head>
        <body style={{ background: "var(--cp-bg)", color: "var(--cp-textPrimary)", minHeight: "100vh", fontFamily: "var(--cp-font)" }}>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
