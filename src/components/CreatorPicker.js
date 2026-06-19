"use client";

/**
 * CreatorPicker — selettore creator ricco (sostituisce la <datalist> nativa).
 *
 * - ricerca live in cima
 * - pill filtro lingua (Tutte / IT / EN / ESP …) derivata dal suffisso alias
 * - ogni riga: pallino-colore (creatorDotColor) + nome + chip lingua +
 *   barra volume (turni) + conteggio
 * - ordinato per volume desc, top in cima
 *
 * Props:
 *   aliases  : [{ alias, shifts }]  (da /api/admin/creator-aliases)
 *   value    : string  (alias selezionato)
 *   onSelect : (alias) => void
 *   placeholder?
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { Search, ChevronDown, X, Check } from "lucide-react";
import { CP, FONTS, creatorDotColor } from "@/lib/brand";

// "Giulia Ottorini - IT" → { name: "Giulia Ottorini", lang: "IT" }
function parseAlias(alias) {
  const m = (alias || "").match(/^(.*?)\s*[-–]\s*([A-Za-z]{2,4})\s*$/);
  if (m) return { name: m[1].trim(), lang: m[2].toUpperCase() };
  return { name: alias || "", lang: "" };
}

export default function CreatorPicker({ aliases = [], value = "", onSelect, placeholder = "scegli creator…" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const enriched = useMemo(() => {
    return (aliases || [])
      .map((a) => ({ ...a, ...parseAlias(a.alias) }))
      // Ordine alfabetico per nome (si cerca per nome, non per volume), poi
      // per lingua a parità di nome (es. Sara Sfamurri IT prima di EN).
      .sort((x, y) => x.name.localeCompare(y.name, "it", { sensitivity: "base" }) || (x.lang || "").localeCompare(y.lang || ""));
  }, [aliases]);

  const maxShifts = useMemo(() => Math.max(1, ...enriched.map((a) => a.shifts || 0)), [enriched]);

  const langCounts = useMemo(() => {
    const c = {};
    for (const a of enriched) if (a.lang) c[a.lang] = (c[a.lang] || 0) + 1;
    return c;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((a) => {
      if (langFilter && a.lang !== langFilter) return false;
      if (q && !a.alias.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriched, query, langFilter]);

  const selected = value ? parseAlias(value) : null;
  const langs = Object.keys(langCounts).sort();

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {/* Campo trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "9px 12px", background: CP.surface, border: `1px solid ${open ? CP.accent + "88" : CP.border}`,
          borderRadius: 8, color: value ? CP.textPrimary : CP.textMuted, fontSize: 13,
          fontFamily: FONTS.body, cursor: "pointer", textAlign: "left",
        }}
      >
        {value && <span style={{ width: 10, height: 10, borderRadius: "50%", background: creatorDotColor(value), flexShrink: 0 }} />}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value ? selected.name : placeholder}
        </span>
        {value && selected.lang && (
          <span style={langChip}>{selected.lang}</span>
        )}
        <ChevronDown size={15} color={CP.textMuted} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {/* Pannello */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 60,
          background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10,
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)", padding: 10, maxHeight: 420, display: "flex", flexDirection: "column",
        }}>
          {/* Ricerca */}
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search size={15} color={CP.textMuted} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="cerca creator…"
              style={{
                width: "100%", padding: "8px 12px 8px 34px", background: CP.bg, border: `1px solid ${CP.border}`,
                borderRadius: 7, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none",
              }}
            />
            {query && (
              <button onClick={() => setQuery("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: CP.textMuted, display: "inline-flex" }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Pill lingua */}
          {langs.length > 1 && (
            <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
              <Pill active={langFilter === ""} onClick={() => setLangFilter("")}>tutte · {enriched.length}</Pill>
              {langs.map((l) => (
                <Pill key={l} active={langFilter === l} onClick={() => setLangFilter(langFilter === l ? "" : l)}>
                  {l} · {langCounts[l]}
                </Pill>
              ))}
            </div>
          )}

          {/* Lista */}
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: CP.textMuted }}>Nessun creator trovato</div>
            )}
            {filtered.map((a) => {
              const col = creatorDotColor(a.alias);
              const isSel = a.alias === value;
              return (
                <button
                  key={a.alias}
                  onClick={() => { onSelect?.(a.alias); setOpen(false); setQuery(""); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 11, padding: "8px 9px",
                    background: isSel ? CP.surfaceAlt : "transparent", border: "none", borderRadius: 7,
                    cursor: "pointer", textAlign: "left", width: "100%",
                  }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = CP.surfaceAlt; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ width: 11, height: 11, borderRadius: "50%", background: col, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: CP.textPrimary, fontWeight: isSel ? 500 : 400, minWidth: 0, flex: "0 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{a.name}</span>
                  {a.lang && <span style={langChip}>{a.lang}</span>}
                  <span style={{ flex: 1, height: 4, borderRadius: 2, background: CP.border, position: "relative", minWidth: 30, maxWidth: 110 }}>
                    <span style={{ position: "absolute", inset: 0, width: `${Math.round(((a.shifts || 0) / maxShifts) * 100)}%`, background: col, borderRadius: 2 }} />
                  </span>
                  <span style={{ fontSize: 12, color: CP.textSecondary, fontFamily: FONTS.mono, minWidth: 44, textAlign: "right" }}>{a.shifts || 0} t</span>
                  {isSel && <Check size={14} color={CP.accentGreen} style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const langChip = {
  fontSize: 10, fontFamily: FONTS.mono, color: CP.textMuted,
  border: `1px solid ${CP.border}`, padding: "1px 6px", borderRadius: 4, flexShrink: 0,
};

function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11, fontFamily: FONTS.body, padding: "4px 11px", borderRadius: 999,
        background: active ? CP.accent : "transparent",
        color: active ? CP.accentInk : CP.textSecondary,
        border: `1px solid ${active ? CP.accent : CP.border}`,
        cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
