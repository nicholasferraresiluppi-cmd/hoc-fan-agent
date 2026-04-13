import { ClerkProvider } from "@clerk/nextjs";
import { itIT } from "@clerk/localizations";
import "./globals.css";

export const metadata = {
  title: "HOC Fan Agent — Simulatore Operatori",
  description: "Agente AI per screening e training operatori House of Creators",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider
      localization={itIT}
      appearance={{
        variables: {
          colorPrimary: "#6366f1",
          colorBackground: "#111827",
          colorText: "#f9fafb",
          colorInputBackground: "#1f2937",
          colorInputText: "#f9fafb",
        },
        elements: {
          formButtonPrimary: "bg-indigo-600 hover:bg-indigo-500",
          card: "bg-gray-900 border border-gray-800",
          headerTitle: "text-white",
          headerSubtitle: "text-gray-400",
          socialButtonsBlockButton: "bg-gray-800 border-gray-700 text-white",
          formFieldLabel: "text-gray-300",
          formFieldInput: "bg-gray-800 border-gray-700 text-white",
          footerActionLink: "text-indigo-400 hover:text-indigo-300",
        },
      }}
    >
      <html lang="it">
        <body className="bg-gray-950 text-white min-h-screen">{children}</body>
      </html>
    </ClerkProvider>
  );
}
