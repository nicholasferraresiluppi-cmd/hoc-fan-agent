"use client";

// Revisione dei feedback sul voto AI (redesign DS 26/09/2026).
// Gli operatori mettono pollice su/giù al voto che il simulatore dà alla loro
// sessione; qui il sales manager legge la chat, scrive un commento e può
// proporla come esempio. Numero principale = feedback ancora da rivedere.
// Tolti: emoji del pollice (ora icona + parole), titolo in inglese.
// API, chiave del feedback e salvataggio invariati.
import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, SectionTitle, Notice, card } from "@/components/ds";

const lbl = { display: "block", fontSize: 13, color: CP.textSecondary, marginBottom: 6 };
const inp = { width: "100%", padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, boxSizing: "border-box" };

export default function ReviewPage() {
  const { isLoaded } = useUser();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [smComment, setSmComment] = useState("");
  const [outcome, setOutcome] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!isLoaded) return;
    fetch("/api/admin/sessions?limit=100")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setItems(data.feedback || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [isLoaded]);

  async function submitOverride() {
    if (!selected) return;
    const feedbackKey = `eval_feedback:${selected.timestamp}:${selected.userId}`;
    try {
      const res = await fetch("/api/admin/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackKey,
          smComment,
          outcome: outcome || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelected(null);
        setSmComment("");
        setOutcome("");
        // Refresh
        const r = await fetch("/api/admin/sessions?limit=100");
        const d = await r.json();
        setItems(d.feedback || []);
      } else {
        alert(data.error || "Errore");
      }
    } catch (e) {
      alert(e.message);
    }
  }

  if (!isLoaded) return <div style={{ color: CP.textMuted, padding: 40, fontFamily: FONTS.body }}>Caricamento…</div>;

  const toReview = items.filter((it) => !it.reviewed);
  const disagree = items.filter((it) => it.rating !== "up");
  const visible = filter === "todo" ? toReview : filter === "down" ? disagree : items;
  const isSel = (it) => selected?.timestamp === it.timestamp && selected?.userId === it.userId;

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Training" }, { label: "Revisione voti AI" }]}
        title="Revisione dei voti AI"
        subtitle="Dopo una sessione nel simulatore, l'operatore dice se è d'accordo con il voto dato dall'AI. Qui leggi la chat, scrivi il tuo commento e, se la sessione è un buon esempio (da imitare o da evitare), la proponi come esempio."
      />

      {error && <Notice danger>Errore: {String(error)}</Notice>}
      {loading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!loading && !error && (
        <HeroMetric
          label="Feedback da rivedere"
          value={fmtInt(toReview.length)}
          compare={items.length === 0 ? "Nessun feedback ricevuto finora." : `${fmtInt(items.length)} feedback in tutto negli ultimi 100.`}
        >
          {items.length > 0 && (
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Metric label="Operatore non d'accordo" value={fmtInt(disagree.length)} note="da guardare per primi" />
            </div>
          )}
        </HeroMetric>
      )}

      {items.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <FilterChip label={`Tutti · ${items.length}`} active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterChip label={`Da rivedere · ${toReview.length}`} active={filter === "todo"} onClick={() => setFilter("todo")} />
          <FilterChip label={`Non d'accordo · ${disagree.length}`} active={filter === "down"} onClick={() => setFilter("down")} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, alignItems: "start" }}>
        <div>
          <SectionTitle aside={items.length ? `${visible.length} mostrati` : null}>Feedback degli operatori</SectionTitle>
          {!loading && items.length === 0 && (
            <div style={{ ...card, padding: "16px 18px", color: CP.textSecondary, fontSize: 14, lineHeight: 1.5 }}>
              Nessun feedback ancora. Compare qui quando un operatore, a fine sessione nel simulatore, mette pollice su o giù al voto.
            </div>
          )}
          {items.length > 0 && visible.length === 0 && <div style={{ color: CP.textMuted, fontSize: 14 }}>Nessun feedback con questo filtro.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visible.map((it) => {
              const up = it.rating === "up";
              const sel = isSel(it);
              return (
                <button
                  key={`${it.timestamp}-${it.userId}`}
                  onClick={() => setSelected(it)}
                  style={{ ...card, textAlign: "left", width: "100%", padding: "12px 14px", cursor: "pointer", fontFamily: FONTS.body, background: sel ? CP.accentSoft : CP.surface, border: `1px solid ${sel ? CP.accent : CP.border}` }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {up ? <ThumbsUp size={14} color={CP.textSecondary} /> : <ThumbsDown size={14} color={CP.accentRed} />}
                    <span style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary }}>{it.scenarioId}</span>
                    <span style={{ fontSize: 12, color: up ? CP.textMuted : CP.accentRed }}>{up ? "d'accordo con il voto" : "non d'accordo con il voto"}</span>
                    <span style={{ fontSize: 12, color: it.reviewed ? CP.textMuted : CP.textSecondary, marginLeft: "auto" }}>{it.reviewed ? "rivisto" : "da rivedere"}</span>
                  </div>
                  <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4 }}>
                    {new Date(it.timestamp).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · utente …{it.userId?.slice(-6)}
                  </div>
                  {it.comment && <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 6, lineHeight: 1.45 }}>«{it.comment}»</div>}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <SectionTitle>Dettaglio</SectionTitle>
          {!selected && (
            <div style={{ ...card, padding: "16px 18px", color: CP.textMuted, fontSize: 14 }}>
              Scegli un feedback dall'elenco per leggere la chat e scrivere la tua revisione.
            </div>
          )}
          {selected && (
            <section style={{ ...card, padding: "16px 18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 14, marginBottom: 14 }}>
                <span style={{ color: CP.textMuted }}>Scenario</span><span style={{ color: CP.textPrimary }}>{selected.scenarioId}</span>
                <span style={{ color: CP.textMuted }}>L'operatore</span><span style={{ color: CP.textPrimary }}>{selected.rating === "up" ? "è d'accordo con il voto" : "non è d'accordo con il voto"}</span>
                <span style={{ color: CP.textMuted }}>Suo commento</span><span style={{ color: CP.textSecondary }}>{selected.comment || "—"}</span>
                {selected.scoreSnapshot && (<>
                  <span style={{ color: CP.textMuted }}>Voto AI</span>
                  <span style={{ color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{selected.scoreSnapshot.score}% · {selected.scoreSnapshot.stars} {Number(selected.scoreSnapshot.stars) === 1 ? "stella" : "stelle"}</span>
                </>)}
              </div>

              <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>La chat</div>
              <div style={{ background: CP.bg, border: `1px solid ${CP.borderSoft}`, padding: "10px 12px", borderRadius: 8, marginBottom: 16, maxHeight: 300, overflowY: "auto" }}>
                {(selected.messages || []).length === 0 && <div style={{ fontSize: 13, color: CP.textMuted }}>Nessun messaggio salvato.</div>}
                {(selected.messages || []).map((m, i) => (
                  <div key={i} style={{ marginBottom: 8, fontSize: 14, lineHeight: 1.5, color: CP.textSecondary }}>
                    <span style={{ color: m.role === "operator" ? CP.accentSoftText : CP.textPrimary, fontWeight: 500 }}>
                      {m.role === "operator" ? "Operatore" : m.role === "fan" || m.role === "assistant" ? "Fan" : m.role}:
                    </span>{" "}
                    {m.content}
                  </div>
                ))}
              </div>

              <label style={lbl} htmlFor="rv-comment">Il tuo commento</label>
              <textarea id="rv-comment" value={smComment} onChange={(e) => setSmComment(e.target.value)}
                style={{ ...inp, minHeight: 80, marginBottom: 14, resize: "vertical", lineHeight: 1.5 }} />

              <label style={lbl} htmlFor="rv-outcome">Proponi come esempio</label>
              <select id="rv-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} style={{ ...inp, marginBottom: 6 }}>
                <option value="">No</option>
                <option value="success">Sì, esempio da imitare</option>
                <option value="failure">Sì, esempio da evitare</option>
              </select>
              <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 14 }}>Finisce nell'elenco dei candidati a esempio; non cambia subito come vota l'AI.</div>

              <button onClick={submitOverride}
                style={{ padding: "8px 16px", background: CP.accent, border: `1px solid ${CP.accent}`, color: CP.accentInk, borderRadius: 8, fontWeight: 500, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body }}>
                Salva revisione
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
