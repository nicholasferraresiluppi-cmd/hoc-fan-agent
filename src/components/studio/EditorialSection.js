"use client";

/**
 * Studio social — Editoriale (16/10/2026): la settimana come UNA storia.
 * In alto la storia (premessa → svolta → finale aperto, e il ponte Instagram → Telegram → OnlyFans),
 * sotto la griglia dei 7 giorni: i reel di Instagram e i messaggi del canale per momento del giorno.
 * Un clic su un pezzo lo apre; il «+» lo crea già agganciato a giorno, momento e storia.
 * Avviso se in un giorno manca il link OnlyFans su Telegram (regola di Nicholas: almeno uno al giorno).
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Pencil, AlertTriangle } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { SectionTitle, card, alpha } from "@/components/ds";
import { STATUSES } from "@/lib/studio-social-core";
import { TG_SLOTS, TG_ROLES, IG_ROLES, weekStartOf, weekDays, editorialGrid, dailyLinkGaps, hasOfLink } from "@/lib/studio-editorial-core";
import { romeLocalToMs } from "@/lib/studio-telegram-core";

const field = { width: "100%", padding: "8px 10px", background: CP.panel, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, boxSizing: "border-box" };
const btn = (primary) => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
  fontFamily: FONTS.body, cursor: "pointer",
  background: primary ? CP.accent : "transparent", color: primary ? CP.accentInk : CP.textPrimary,
  border: primary ? "none" : `1px solid ${CP.border}`,
});
const shift = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric" });
const fmtLong = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long" });
const TG_STATUS = { bozza: "bozza", programmato: "programmato", inviato: "uscito", errore: "non partito" };

function L({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12, minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 4 }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 12, color: CP.textMuted, marginTop: 3 }}>{hint}</span>}
    </label>
  );
}

function ArcModal({ arc, weekStart, onClose, onSave, onDelete }) {
  const [f, setF] = useState(() => ({ weekStart, title: "", premessa: "", svolta: "", finale: "", ponte: "", status: "bozza", ...arc }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => { setBusy(true); setErr(null); try { await onSave(f); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} title={`La storia della settimana · dal ${fmtLong(f.weekStart)}`} maxWidth={680}>
      <L label="Titolo" hint="Come la chiameresti tu, in quattro parole"><input style={field} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Marco non molla" /></L>
      <L label="Premessa (lunedì)" hint="Cosa succede all'inizio: la situazione che apre la curiosità"><textarea style={{ ...field, minHeight: 64 }} value={f.premessa} onChange={(e) => setF({ ...f, premessa: e.target.value })} /></L>
      <L label="Svolta (metà settimana)" hint="Cosa cambia: spesso la decide un sondaggio del canale"><textarea style={{ ...field, minHeight: 64 }} value={f.svolta} onChange={(e) => setF({ ...f, svolta: e.target.value })} /></L>
      <L label="Finale aperto (fine settimana)" hint="Come si chiude senza chiudersi: cosa resta da sapere"><textarea style={{ ...field, minHeight: 64 }} value={f.finale} onChange={(e) => setF({ ...f, finale: e.target.value })} /></L>
      <L label="Il ponte" hint="Cosa Instagram lascia in sospeso, cosa racconta solo il canale, cosa è il pezzo più privato (OnlyFans)"><textarea style={{ ...field, minHeight: 64 }} value={f.ponte} onChange={(e) => setF({ ...f, ponte: e.target.value })} /></L>
      <L label="Stato">
        <select style={field} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="bozza">Bozza</option><option value="approvata">Approvata</option>
        </select>
      </L>
      {err && <div style={{ color: CP.accentRed, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={btn(true)} disabled={busy} onClick={save}>{busy ? "Salvataggio…" : "Salva"}</button>
        {f.id && <button style={{ ...btn(false), marginLeft: "auto", color: CP.accentRed }} disabled={busy} onClick={() => confirm("Eliminare la storia? I contenuti restano, senza storia.") && onDelete(f)}>Elimina</button>}
      </div>
    </Modal>
  );
}

export default function EditorialSection({ today, items, posts, arcs, onOpenItem, onNewItem, onOpenPost, onNewPost, onSaveArc, onDeleteArc }) {
  const [week, setWeek] = useState(() => weekStartOf(today));
  const [arcOpen, setArcOpen] = useState(false);
  const days = useMemo(() => weekDays(week), [week]);
  const arc = (arcs || []).find((a) => a.weekStart === week) || null;
  const grid = useMemo(() => editorialGrid(days, items, posts), [days, items, posts]);
  const gaps = useMemo(() => dailyLinkGaps(posts, days).filter((g) => g.day >= today), [posts, days, today]);
  const roleLabel = (k) => TG_ROLES.find((r) => r.key === k)?.label;

  const chip = (label, sub, onClick, tone) => (
    <button onClick={onClick} style={{ display: "block", width: "100%", textAlign: "left", background: CP.panel, border: `1px solid ${tone ? alpha(tone, "88") : CP.border}`, borderRadius: 7, padding: "5px 7px", marginBottom: 4, cursor: "pointer", fontFamily: FONTS.body }}>
      <div style={{ fontSize: 12, color: CP.textPrimary, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 1 }}>{sub}</div>}
    </button>
  );
  const add = (onClick, label) => (
    <button onClick={onClick} aria-label={label} title={label} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "3px 0", background: "none", border: `1px dashed ${CP.borderSoft}`, borderRadius: 7, color: CP.textMuted, cursor: "pointer" }}><Plus size={12} /></button>
  );

  return (
    <div style={{ marginBottom: 24 }}>
      <SectionTitle aside={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button style={{ ...btn(false), padding: "5px 8px" }} onClick={() => setWeek(shift(week, -7))} aria-label="Settimana prima"><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 13, color: CP.textSecondary, minWidth: 128, textAlign: "center" }}>{week === weekStartOf(today) ? "Questa settimana" : `dal ${fmtLong(week)}`}</span>
          <button style={{ ...btn(false), padding: "5px 8px" }} onClick={() => setWeek(shift(week, 7))} aria-label="Settimana dopo"><ChevronRight size={14} /></button>
        </div>
      }>Editoriale</SectionTitle>

      <div style={{ ...card, padding: 16, marginBottom: 10 }}>
        {arc ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 500, color: CP.textPrimary }}>{arc.title}</div>
              <span style={{ fontSize: 12, color: arc.status === "approvata" ? CP.accentGreen : CP.textMuted }}>{arc.status === "approvata" ? "approvata" : "bozza"}</span>
              <button style={{ ...btn(false), padding: "3px 8px", marginLeft: "auto" }} onClick={() => setArcOpen(true)}><Pencil size={12} aria-hidden="true" /> Modifica</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 14 }}>
              {[["Premessa", arc.premessa], ["Svolta", arc.svolta], ["Finale aperto", arc.finale], ["Il ponte", arc.ponte]].map(([k, v]) => (
                <div key={k}><div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 3 }}>{k}</div><div style={{ fontSize: 13, color: v ? CP.textSecondary : CP.textMuted, lineHeight: 1.5 }}>{v || "Da scrivere"}</div></div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, color: CP.textSecondary, flex: 1, minWidth: 220 }}>Questa settimana non ha ancora una storia. Ogni reel e ogni messaggio del canale ne è un pezzo: si parte da qui.</div>
            <button style={btn(true)} onClick={() => setArcOpen(true)}><Plus size={13} aria-hidden="true" /> Scrivi la storia</button>
          </div>
        )}
      </div>

      {gaps.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", padding: "8px 10px", border: `1px solid ${alpha(CP.accentRed, "55")}`, borderRadius: 8 }}>
          <AlertTriangle size={14} style={{ color: CP.accentRed, marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
          <span>Manca il link OnlyFans su Telegram: {gaps.map((g) => fmtDay(g.day)).join(", ")}. Almeno un messaggio al giorno lo deve avere.</span>
        </div>
      )}

      <div style={{ overflowX: "auto", border: `1px solid ${CP.borderSoft}`, borderRadius: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "110px repeat(7, minmax(120px, 1fr))", minWidth: 110 + 7 * 120 }}>
          <div style={{ padding: 8, background: CP.bgSunken }} />
          {days.map((d) => (
            <div key={d} style={{ padding: 8, background: CP.bgSunken, fontSize: 12, fontWeight: d === today ? 600 : 500, color: d === today ? CP.textPrimary : CP.textSecondary, borderLeft: `1px solid ${CP.borderSoft}` }}>
              {d === today ? `Oggi · ${fmtDay(d)}` : fmtDay(d)}
            </div>
          ))}

          <div style={{ padding: 8, fontSize: 12, color: CP.textSecondary, borderTop: `1px solid ${CP.borderSoft}` }}>Instagram<div style={{ fontSize: 11, color: CP.textMuted }}>reel e storie</div></div>
          {grid.map((g) => (
            <div key={g.day} style={{ padding: 6, borderTop: `1px solid ${CP.borderSoft}`, borderLeft: `1px solid ${CP.borderSoft}`, minWidth: 0 }}>
              {g.ig.map((it) => (
                <div key={it.id}>{chip(it.title, [STATUSES.find((s) => s.key === it.status)?.label, IG_ROLES.find((r) => r.key === it.arcRole)?.label].filter(Boolean).join(" · "), () => onOpenItem(it), it.arcId && arc && it.arcId === arc.id ? CP.accent : null)}</div>
              ))}
              {add(() => onNewItem({ day: g.day, arcId: arc?.id || null }), "Nuovo contenuto Instagram")}
            </div>
          ))}

          {TG_SLOTS.map((slot) => (
            <div key={slot.key} style={{ display: "contents" }}>
              <div style={{ padding: 8, fontSize: 12, color: CP.textSecondary, borderTop: `1px solid ${CP.borderSoft}` }} title={slot.hint}>Telegram<div style={{ fontSize: 11, color: CP.textMuted }}>{slot.label.toLowerCase()} · {slot.time}</div></div>
              {grid.map((g) => (
                <div key={g.day} style={{ padding: 6, borderTop: `1px solid ${CP.borderSoft}`, borderLeft: `1px solid ${CP.borderSoft}`, minWidth: 0 }}>
                  {g.tg[slot.key].map((p) => (
                    <div key={p.id}>{chip(p.poll ? `Sondaggio: ${p.poll.question}` : (p.text || "(solo foto)"), [TG_STATUS[p.status], roleLabel(p.role), hasOfLink(p) ? "link OF" : null, p.pin ? "fissato" : null].filter(Boolean).join(" · "), () => onOpenPost(p), p.status === "programmato" || p.status === "inviato" ? CP.accentGreen : null)}</div>
                  ))}
                  {add(() => onNewPost({ sendAt: romeLocalToMs(`${g.day}T${slot.time}`), slot: slot.key, arcId: arc?.id || null }), `Nuovo messaggio Telegram (${slot.label.toLowerCase()})`)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 6 }}>Bordo viola: pezzi della storia della settimana. Bordo verde: messaggi approvati o usciti. Il canale non permette risposte: l'interazione sono i sondaggi.</div>

      {arcOpen && <ArcModal arc={arc} weekStart={week} onClose={() => setArcOpen(false)} onSave={async (a) => { await onSaveArc(a); setArcOpen(false); }} onDelete={async (a) => { await onDeleteArc(a); setArcOpen(false); }} />}
    </div>
  );
}
