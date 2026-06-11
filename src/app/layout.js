import { ClerkProvider } from "@clerk/nextjs";
import { itIT } from "@clerk/localizations";
import Providers from "@/components/Providers";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata = {
  title: "HOC Pro — Academy",
  description: "L'Academy dei chatter di House of Creators. Allena, compete, sali in classifica.",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider
      localization={itIT}
      appearance={{
        variables: {
          colorPrimary: "#8b7cf6",
          colorBackground: "#0c0f14",
          colorText: "#f2f4f8",
          colorInputBackground: "#151a22",
          colorInputText: "#f2f4f8",
          fontFamily: "Inter, system-ui, sans-serif",
        },
        elements: {
          formButtonPrimary: "bg-[#8b7cf6] hover:bg-[#7a6ae0] text-[#14101f]",
          card: "bg-[#151a22] border border-[#232b3a]",
          headerTitle: "text-[#F5F6F8]",
          headerSubtitle: "text-[#8c95a8]",
          socialButtonsBlockButton: "bg-[#151a22] border-[#232b3a] text-[#f2f4f8]",
          formFieldLabel: "text-[#cdd3de]",
          formFieldInput: "bg-[#151a22] border-[#232b3a] text-[#f2f4f8]",
          footerActionLink: "text-[#8b7cf6] hover:text-[#b9aef9]",
          // UserButton popover (account menu)
          userButtonPopoverCard: "bg-[#151a22] border border-[#232b3a]",
          userButtonPopoverMain: "bg-[#151a22]",
          userButtonPopoverActions: "bg-[#151a22]",
          userButtonPopoverActionButton: "text-[#f2f4f8] hover:bg-[#20283a]",
          userButtonPopoverActionButtonText: "text-[#f2f4f8]",
          userButtonPopoverActionButtonIcon: "text-[#8b7cf6]",
          userButtonPopoverFooter: "bg-[#08090F] border-t border-[#1B1E26]",
          userPreviewMainIdentifier: "text-[#F5F6F8]",
          userPreviewSecondaryIdentifier: "text-[#B9BDC7]",
          // Generic menu items (covers org switcher etc.)
          menuItem: "text-[#F5F6F8] hover:bg-[#1B1E26]",
          menuList: "bg-[#111318]",
        },
      }}
    >
      <html lang="it">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@700;800&family=JetBrains+Mono:wght@500;700&display=swap"
            rel="stylesheet"
          />
        </head>
        <body style={{ background: "#08090F", color: "#F5F6F8", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
