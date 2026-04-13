import "./globals.css";

export const metadata = {
  title: "HOC Fan Agent — Simulatore Operatori",
  description: "Agente AI per screening e training operatori House of Creators",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body className="bg-gray-950 text-white min-h-screen">{children}</body>
    </html>
  );
}
