"use client";

/**
 * Command bar (⌘K / Ctrl+K) dello stile v3 (anteprima, 26/09/2026).
 * Caricata con next/dynamic SOLO alla prima apertura (vedi AppShell).
 *
 * Voci = pagine del menu (NAV_GROUPS + scorciatoie in cima alla Sidebar),
 * filtrate con canSee sui permessi di /api/whoami: non si propone una pagina
 * che risponderebbe "non hai il permesso". Ricerca per testo (senza accenti),
 * frecce + Invio, Esc chiude.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Search, CornerDownLeft, ArrowUp, ArrowDown, Compass, Signpost, LayoutDashboard, Bell } from "lucide-react";
import { NAV_GROUPS } from "@/components/Sidebar";
import { canSee } from "@/lib/nav-access";
import { CP, FONTS } from "@/lib/brand";

const silentFetcher = async (url) => {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

const TOP = [
  { href: "/admin", label: "Hub", icon: LayoutDashboard, group: "Generale" },
  { href: "/admin/alerts", label: "Alert operativi", icon: Bell, group: "Generale" },
  { href: "/welcome", label: "Welcome / Tour", icon: Compass, group: "Generale" },
  { href: "/guida", label: "Guida strumenti", icon: Signpost, group: "Generale" },
];

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function CommandBar({ open, onClose }) {
  const router = useRouter();
  const { data: me } = useSWR("/api/whoami", silentFetcher, { revalidateOnFocus: false });
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const restoreRef = useRef(null);

  const all = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const it of [...TOP, ...NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))]) {
      if (seen.has(it.href)) continue;
      seen.add(it.href);
      out.push(it);
    }
    // Permessi non ancora arrivati: si mostra tutto (come la Sidebar)
    return me?.authenticated ? out.filter((it) => canSee(it.href, me.capabilities, me.admin)) : out;
  }, [me]);

  const results = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) return all;
    const scored = [];
    for (const it of all) {
      const l = norm(it.label);
      const g = norm(it.group);
      let s = -1;
      if (l.startsWith(nq)) s = 0;
      else if (l.split(/\s+/).some((w) => w.startsWith(nq))) s = 1;
      else if (l.includes(nq)) s = 2;
      else if (g.includes(nq) || norm(it.href).includes(nq)) s = 3;
      if (s >= 0) scored.push([s, it]);
    }
    return scored.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  }, [all, q]);

  // Apertura: reset, focus nel campo; chiusura: focus restituito a chi aveva aperto
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement;
    setQ("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      try { restoreRef.current?.focus?.(); } catch {}
    };
  }, [open]);

  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (it) => {
    if (!it) return;
    onClose();
    router.push(it.href);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "Tab") { e.preventDefault(); } // focus intrappolato nel campo
  };

  // Raggruppa i risultati mantenendo l'ordine di rilevanza
  let lastGroup = null;
  const kbd = { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 20, height: 20, padding: "0 5px", borderRadius: 5, boxShadow: `0 0 0 1px ${CP.border} inset`, fontSize: 11, color: CP.textSecondary, fontFamily: FONTS.body };

  return (
    <div className="hoc-v3-cmdk-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 120, background: CP.scrim, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "12vh 16px 16px" }}>
      <div role="dialog" aria-modal="true" aria-label="Cerca una pagina" className="hoc-v3-cmdk"
        style={{ width: "min(620px, 100%)", maxHeight: "70vh", display: "flex", flexDirection: "column", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,.45)", overflow: "hidden", fontFamily: FONTS.body }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: `1px solid ${CP.border}` }}>
          <Search size={17} color={CP.textMuted} aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Cerca una pagina…"
            role="combobox"
            aria-expanded="true"
            aria-controls="hoc-cmdk-list"
            aria-activedescendant={results[active] ? `hoc-cmdk-${active}` : undefined}
            aria-autocomplete="list"
            style={{ flex: 1, height: 54, background: "transparent", border: "none", outline: "none", color: CP.textPrimary, fontSize: 16, fontFamily: FONTS.body }}
          />
          <button type="button" onClick={onClose} style={{ ...kbd, border: "none", background: "transparent", cursor: "pointer" }} aria-label="Chiudi">Esc</button>
        </div>
        <div ref={listRef} id="hoc-cmdk-list" role="listbox" aria-label="Pagine" style={{ overflowY: "auto", padding: "6px 8px 8px" }}>
          {results.length === 0 && (
            <div style={{ padding: "22px 12px", color: CP.textMuted, fontSize: 13, textAlign: "center" }}>Nessuna pagina per “{q}”.</div>
          )}
          {results.map((it, idx) => {
            const Icon = it.icon;
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            const sel = idx === active;
            return (
              <div key={it.href}>
                {header && <div style={{ padding: "10px 10px 5px", fontSize: 11.5, color: CP.textMuted }}>{header}</div>}
                <div
                  id={`hoc-cmdk-${idx}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={sel}
                  onMouseMove={() => { if (!sel) setActive(idx); }}
                  onClick={() => go(it)}
                  style={{
                    display: "flex", alignItems: "center", gap: 11, minHeight: 42, padding: "0 10px", borderRadius: 9, cursor: "pointer",
                    background: sel ? CP.accentSoft : "transparent",
                    boxShadow: sel ? `0 0 0 1px ${CP.accentDim} inset` : "none",
                    color: sel ? CP.textPrimary : CP.textSecondary, fontSize: 14,
                  }}
                >
                  {Icon && <Icon size={16} strokeWidth={1.8} aria-hidden="true" />}
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
                  <span style={{ fontSize: 11.5, color: CP.textMuted, fontFamily: FONTS.mono }}>{it.href}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="hoc-v3-cmdk-foot" style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 14px", borderTop: `1px solid ${CP.border}`, fontSize: 12, color: CP.textMuted }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={kbd}><ArrowUp size={11} /></span><span style={kbd}><ArrowDown size={11} /></span> scegli</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={kbd}><CornerDownLeft size={11} /></span> apri</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={kbd}>Esc</span> chiudi</span>
        </div>
      </div>
    </div>
  );
}
