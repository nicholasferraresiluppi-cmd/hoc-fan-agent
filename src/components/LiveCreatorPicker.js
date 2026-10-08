"use client";

// Scelta della creator per Revenue e Chat (strumento "Revenue e chat"): la stessa scelta vale
// nelle due schede (localStorage) e finisce nell'indirizzo (?creator=…) così un link si può
// girare già aperto sulla creator giusta. L'elenco lo decide l'API (solo le creator assegnate).

import { useEffect, useState } from "react";
import { CP, FONTS } from "@/lib/brand";

const KEY = "hoc:live:creator";

/** [slug | "" (= lascia scegliere all'API) | null (non ancora letto), setSlug] */
export function useLiveCreator() {
  const [slug, setSlug] = useState(null);
  useEffect(() => {
    let v = null;
    try { v = new URLSearchParams(window.location.search).get("creator"); } catch {}
    if (!v) { try { v = localStorage.getItem(KEY); } catch {} }
    setSlug(v || "");
  }, []);
  const set = (s) => {
    setSlug(s);
    try { localStorage.setItem(KEY, s); } catch {}
    try { const u = new URL(window.location.href); u.searchParams.set("creator", s); window.history.replaceState(null, "", u); } catch {}
  };
  return [slug, set];
}

export function CreatorPills({ creators, current, onChange }) {
  if (!creators?.length) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
      <span style={{ fontSize: 12.5, color: CP.textMuted, marginRight: 2 }}>Creator</span>
      {creators.map((c) => {
        const on = c.slug === current;
        return (
          <button key={c.slug} onClick={() => onChange(c.slug)}
            style={{ padding: "7px 14px", borderRadius: 8, fontSize: 13.5, cursor: "pointer", fontFamily: FONTS.body, fontWeight: on ? 500 : 400,
              border: `1px solid ${on ? CP.accent : CP.border}`, background: on ? CP.accent : CP.surface, color: on ? CP.accentInk : CP.textPrimary }}>
            {c.name}{c.countries.length > 1 ? ` · ${c.countries.join(" + ")}` : ""}
          </button>
        );
      })}
    </div>
  );
}

/** fetch JSON che, in caso di errore, porta con sé l'elenco delle creator visibili (403). */
export const liveFetcher = (url) =>
  fetch(url).then((r) =>
    r.ok
      ? r.json()
      : r.json().catch(() => ({})).then((d) => {
          const e = new Error(d.error || (r.status === 401 || r.status === 403 ? "Non hai il permesso per vedere questi dati." : r.status >= 500 ? "Calcolo fallito o troppo lungo — riprova." : "Errore."));
          e.creators = d.creators || [];
          return Promise.reject(e);
        })
  );
