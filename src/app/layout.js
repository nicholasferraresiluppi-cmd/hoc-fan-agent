import { ClerkProvider } from "@clerk/nextjs";
import { itIT } from "@clerk/localizations";
import Providers from "@/components/Providers";
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
          colorPrimary: "#D4AF7A",
          colorBackground: "#08090F",
          colorText: "#F5F6F8",
          colorInputBackground: "#1B1E26",
          colorInputText: "#F5F6F8",
          fontFamily: "Inter, system-ui, sans-serif",
        },
        elements: {
          formButtonPrimary: "bg-[#D4AF7A] hover:bg-[#B89158] text-[#08090F]",
          card: "bg-[#111318] border border-[#1B1E26]",
          headerTitle: "text-[#F5F6F8]",
          headerSubtitle: "text-[#6B7080]",
          socialButtonsBlockButton: "bg-[#1B1E26] border-[#2A2E39] text-[#F5F6F8]",
          formFieldLabel: "text-[#B9BDC7]",
          formFieldInput: "bg-[#1B1E26] border-[#2A2E39] text-[#F5F6F8]",
          footerActionLink: "text-[#D4AF7A] hover:text-[#E8D4B0]",
          // UserButton popover (account menu)
          userButtonPopoverCard: "bg-[#111318] border border-[#1B1E26]",
          userButtonPopoverMain: "bg-[#111318]",
          userButtonPopoverActions: "bg-[#111318]",
          userButtonPopoverActionButton: "text-[#F5F6F8] hover:bg-[#1B1E26]",
          userButtonPopoverActionButtonText: "text-[#F5F6F8]",
          userButtonPopoverActionButtonIcon: "text-[#D4AF7A]",
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
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
