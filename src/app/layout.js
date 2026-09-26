import { ClerkProvider } from "@clerk/nextjs";
import { itIT } from "@clerk/localizations";
import Providers from "@/components/Providers";
import AppShell from "@/components/AppShell";
import "./globals.css";
import { themeCss, CP } from "@/lib/brand";
import { Jost, Cormorant_Garamond } from "next/font/google";

// Caratteri dello stile v3 (anteprima): serviti dal nostro dominio da next/font,
// con misure di riserva calcolate (niente salto al caricamento). Usati solo
// sotto data-style="v3" tramite --f-sans / --f-display.
// "Couture" (26/09 sera): Jost per l'interfaccia, Cormorant Garamond per numeri
// protagonisti e titoli di pagina (mai nelle tabelle).
const fSans = Jost({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--f-sans" });
const fSig = Cormorant_Garamond({ subsets: ["latin", "latin-ext"], weight: ["500", "600"], style: ["normal", "italic"], display: "swap", variable: "--f-display" });

export const metadata = {
  title: "HOC Pro",
  description: "La console operativa di House of Creators: performance, training, compensation e team.",
};

export default function RootLayout({ children }) {
  // `dynamic` (Clerk 6): ripristina il comportamento di Clerk 5 — stato auth
  // letto a ogni richiesta e nessuna pagina prerenderizzata statica. Senza,
  // Next 15 prova a prerenderizzare le pagine client (useSearchParams senza
  // Suspense → build rotta) e il primo paint non conosce l'utente.
  return (
    <ClerkProvider
      dynamic
      localization={itIT}
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
      <html lang="it" data-theme="light" className={`${fSans.variable} ${fSig.variable}`} suppressHydrationWarning>
        <head>
          {/* Tema chiaro/scuro: variabili dei due temi + scelta salvata applicata PRIMA
              del primo disegno (niente lampo del tema sbagliato). Default: scuro. */}
          <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
          <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("hoc:theme")==="dark")document.documentElement.removeAttribute("data-theme");if(localStorage.getItem("hoc:style")==="v3")document.documentElement.setAttribute("data-style","v3")}catch(e){}` }} />
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
