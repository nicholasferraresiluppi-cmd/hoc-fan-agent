"use client";

import { useEffect, useState } from "react";
import AdminNav from "@/components/AdminNav";

const C = {
  bgDark: "#0a0b1a",
  orange: "#FF6B35",
  purple: "#8B5CF6",
  green: "#10B981",
  yellow: "#F59E0B",
  red: "#EF4444",
  white: "#F9FAFB",
  gray: "#9CA3AF",
  gold: "#FFD700",
};

const CARDS = [
  { href: "/admin/dashboard", title: "📊 Dashboard SM", desc: "KPI per operatore, trend 7/30g, alert, heatmap skill×creator", color: C.orange },
  { href: "/admin/review", title: "🔍 Review sessioni", desc: "Rivedi valutazioni recenti, correggi score e aggiungi commenti", color: C.purple },
  { href: "/admin/outcomes", title: "💰 Outcomes reali", desc: "Inserisci revenue, PPV, retention settimanali per validare le valutazioni AI", color: C.green },
  { href: "/admin/creators", title: "👤 Creator persona", desc: "Visualizza tone card, ganci emotivi e vocabolario dei 3 creator pilota", color: C.yellow },
  { href: "/admin/fan-archetypes", title: "👥 Fan Archetypes", desc: "12 tipologie di fan (Whale, Lonely, Negoziatore, Fragile…) con strategie ottimali", color: C.purple },
  { href: "/admin/seniority", title: "🎖️ Seniority", desc: "Tier Junior/Senior/Master auto-calcolati + override manuale", color: C.yellow },
  { href: "/admin/seed", title: "🌱 Seed demo data", desc: "Popola l'app con 10 operatori fittizi + 60 giorni di sessioni per testare", color: C.green },
  { href: "/admin/access", title: "🔐 Gestione accessi", desc: "Aggiungi/rimuovi admin via email, senza redeploy", color: C.red },
  { href: "/admin/ruoli", title: "🛡️ Ruoli & capabilities", desc: "Assegna ruoli (multi) — predefiniti + custom", color: C.purple },
  { href: "/admin/ruoli-custom", title: "🎖️ Ruoli custom", desc: "Crea ruoli personalizzati con capability e scope", color: C.purple },
  { href: "/admin/team", title: "👥 Team", desc: "Crea team, assegna operatori, nomina team lead", color: C.orange },
  { href: "/leaderboard", title: "🏆 Classifica (vista utenti)", desc: "Apri la classifica come la vedono gli operatori", color: C.orange },
  { href: "/leaderboard/storico", title: "🏛️ Hall of Fame", desc: "Albo storico dei campioni settimanali", color: C.gold },
];

export default function AdminHub() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/whoami")
      .then((r) => r.json())
      .then((d) => { setMe(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const notAdmin = !loading && me && !me.admin;

  return (
    <div style={{ background: C.bgDark, minHeight: "100vh", color: C.white, padding: "2rem" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.75rem" }}>🛠️ Area Admin</h1>
          <a href="/" style={{ color: C.orange, textDecoration: "none", fontSize: "0.9rem" }}>← Home</a>
        </div>
        <p style={{ color: C.gray, margin: "0 0 1.25rem 0", fontSize: "0.9rem" }}>
          Tutti gli strumenti di gestione in un posto solo.
        </p>

        <AdminNav />

        {loading && <div style={{ color: C.gray }}>Caricamento...</div>}

        {notAdmin && (
          <div style={{ padding: "1.25rem", background: `${C.yellow}15`, border: `1px solid ${C.yellow}`, borderRadius: "0.75rem", marginBottom: "1.5rem", color: C.yellow }}>
            <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>⚠️ Non sei admin</div>
            <div style={{ color: C.white, fontSize: "0.9rem" }}>
              Puoi comunque vedere la home admin, ma i dati dentro le sezioni non caricheranno.
              Vai su <a href="/admin/access" style={{ color: C.orange }}>🔐 Gestione accessi</a> per le istruzioni di bootstrap.
            </div>
          </div>
        )}

        {me?.admin && (
          <div style={{ padding: "0.75rem 1rem", background: `${C.green}15`, border: `1px solid ${C.green}`, borderRadius: "0.5rem", marginBottom: "1.5rem", fontSize: "0.85rem", color: C.green }}>
            ✓ Sei admin — accesso a tutte le sezioni abilitato
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          {CARDS.map((c) => (
            <a
              key={c.href}
              href={c.href}
              style={{
                display: "block",
                padding: "1.25rem",
                background: `${c.color}10`,
                border: `2px solid ${c.color}40`,
                borderRadius: "0.85rem",
                textDecoration: "none",
                transition: "transform 0.2s, border-color 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.borderColor = c.color; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = `${c.color}40`; }}
            >
              <h3 style={{ margin: "0 0 0.4rem 0", fontSize: "1.1rem", fontWeight: 800, color: c.color }}>{c.title}</h3>
              <p style={{ margin: 0, color: C.gray, fontSize: "0.85rem", lineHeight: 1.4 }}>{c.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
