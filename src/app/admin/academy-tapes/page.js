"use client";

// Game tape — curatela (SEED): estrai i candidati dal warehouse, rivedi la
// conversazione, aggiungi titolo e note del coach, pubblica. Solo i tape
// pubblicati arrivano agli operatori (/academy/tapes).
//
// Redesign 26/09/2026 (pannello tester SM/TL/UX): la pagina vuota non diceva
// da dove partire né cosa succede dopo → tre passi in testa; campi del modulo
// con etichette in parole ("acquisto minimo" invece di "min $"); stati vuoti
// che spiegano; "PII" tradotto in "dati che rendono riconoscibile il fan".

import { useState } from "react";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, Notice, card, NUM } from "@/components/ds";
import TapeReplay from "@/components/TapeReplay";

const fetcher = (url) => fetch(url).then((r) => r.json());
const usd = (n) => `$${Math.round(Number(n) || 0).toLocaleString("it-IT")}`;

const inputStyle = {
  background: CP.bgSunken,
  border: `1px solid ${CP.border}`,
  borderRadius: 8,
  color: CP.textPrimary,
  fontSize: 13,
  padding: "8px 10px",
  outline: "none",
  fontFamily: FONTS.body,
};
const lbl = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: CP.textMuted };

function Curator({ tape, onSaved }) {
  const [title, setTitle] = useState(tape.title || "");
  const [notes, setNotes] = useState(tape.coach_notes || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function patch(body) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/academy-tapes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tape.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore");
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
      <label style={lbl}>
        Titolo che vedranno gli operatori
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="es. Doppio sblocco da $200 su fan nuovo in 8 ore"
          style={inputStyle}
        />
      </label>
      <label style={lbl}>
        Cosa deve notare l&apos;operatore
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Cosa rende questa vendita replicabile? (come ha preparato il terreno, quando ha detto il prezzo, come ha preparato l'acquisto successivo…)"
          rows={4}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
        />
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          disabled={busy}
          onClick={() => patch({ title, coach_notes: notes })}
          style={{
            background: CP.surface,
            color: CP.textPrimary,
            border: `1px solid ${CP.border}`,
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            fontFamily: FONTS.body,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          Salva titolo e note
        </button>
        <button
          disabled={busy}
          onClick={() => patch({ title, coach_notes: notes, published: !tape.published })}
          style={{
            background: tape.published ? CP.surface : CP.accent,
            color: tape.published ? CP.textSecondary : CP.accentInk,
            border: `1px solid ${tape.published ? CP.border : CP.accent}`,
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: FONTS.body,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {tape.published ? "Ritira dalla libreria" : "Pubblica nella libreria"}
        </button>
        {err && <span style={{ color: CP.accentRed, fontSize: 12.5 }}>{err}</span>}
      </div>
    </div>
  );
}

function TapeRow({ tape, open, onToggle, onSaved }) {
  const opLabel =
    tape.attribution === "singolo"
      ? tape.operators?.[0]
      : tape.attribution === "duo"
        ? `${(tape.operators || []).join(" + ")} (in coppia)`
        : "operatore non attribuito";
  return (
    <div style={{ ...card, borderColor: open ? CP.accentDim : CP.border }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{ all: "unset", boxSizing: "border-box", display: "block", width: "100%", padding: "14px 16px", cursor: "pointer" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500 }}>{tape.title || `${tape.creator_name} · ${tape.fan}`}</span>
          <span style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500, ...NUM }}>{usd(tape.total)}</span>
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: CP.textMuted, display: "flex", gap: 10, flexWrap: "wrap", ...NUM }}>
          <span>{tape.creator_name}</span>
          <span>{opLabel}</span>
          <span>{tape.buys?.length || 1} acquisti</span>
          <span title="Minuti di conversazione prima del primo acquisto">preparazione {tape.stats?.buildup_min ?? "?"} min</span>
          {tape.published && <span style={{ color: CP.accentSoftText }}>in libreria</span>}
          <span style={{ marginLeft: "auto", color: CP.accentSoftText }}>{open ? "chiudi" : "rivedi →"}</span>
        </div>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          <TapeReplay tape={tape} />
          <Curator tape={tape} onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}

const STEPS = [
  ["Estrai", "Scegli un creator: cerchiamo nelle chat reali le vendite migliori sopra la soglia."],
  ["Rivedi", "Apri un candidato, rileggi la conversazione, dagli un titolo e scrivi cosa deve notare l'operatore."],
  ["Pubblica", "Solo i tape pubblicati arrivano agli operatori, nella pagina Game tape, con il fan sotto pseudonimo."],
];

export default function AdminTapesPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/academy-tapes", fetcher);
  const [form, setForm] = useState({ creatorId: "", days: 30, minAmount: 100, maxTapes: 12 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [openId, setOpenId] = useState(null);

  const tapes = data?.tapes || [];
  const creators = data?.creators || [];
  const candidates = tapes.filter((t) => !t.published);
  const published = tapes.filter((t) => t.published);

  async function extract() {
    if (!form.creatorId) {
      setMsg({ err: true, text: "Scegli un creator." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/academy-tapes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Estrazione fallita");
      setMsg({
        err: false,
        text: `Estratti ${out.found} tape da ${out.sequences || 0} sequenze di vendita (${out.purchases} acquisti sopra la soglia). Li trovi qui sotto tra i candidati.`,
      });
      mutate();
    } catch (e) {
      setMsg({ err: true, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Training" }, { label: "Curatela tape" }]}
        title="Game tape: curatela"
        subtitle="Scegli le migliori vendite reali da far studiare agli operatori: estrai i candidati, rileggili, pubblica quelli che meritano la libreria."
      />

      {data?.error && <Notice danger>{data.error}</Notice>}
      {data && data.bigquery === false && (
        <Notice>Il collegamento al warehouse (BigQuery) non è configurato in questo ambiente: la lista si consulta, ma non si possono estrarre tape nuovi.</Notice>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 14 }}>
        {STEPS.map(([t, d], i) => (
          <div key={t} style={{ ...card, padding: "12px 14px", display: "flex", gap: 10 }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background: CP.accentSoft, color: CP.accentSoftText, fontSize: 12, display: "grid", placeItems: "center", flexShrink: 0, ...NUM }}>{i + 1}</span>
            <div>
              <div style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500 }}>{t}</div>
              <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.5 }}>{d}</div>
            </div>
          </div>
        ))}
      </div>

      <Notice>
        Prima di pubblicare leggi il testo: se contiene il nome vero del fan o altri dati che lo rendono riconoscibile, non pubblicare. La tua
        revisione è l&apos;ultimo controllo sui dati personali.
      </Notice>

      <SectionTitle>Estrai candidati</SectionTitle>
      <div style={{ ...card, padding: 16, marginBottom: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ ...lbl, flex: "1 1 220px" }}>
          Creator
          <select value={form.creatorId} onChange={(e) => setForm({ ...form, creatorId: e.target.value })} style={{ ...inputStyle, minWidth: 200 }}>
            <option value="">Scegli…</option>
            {creators.map((c) => (
              <option key={c.creator_id} value={c.creator_id}>
                {c.creator_name}
              </option>
            ))}
          </select>
        </label>
        <label style={lbl}>
          Ultimi giorni
          <input type="number" value={form.days} min={1} max={120} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} style={{ ...inputStyle, width: 90 }} />
        </label>
        <label style={lbl}>
          Acquisto minimo ($)
          <input type="number" value={form.minAmount} min={20} max={500} onChange={(e) => setForm({ ...form, minAmount: Number(e.target.value) })} style={{ ...inputStyle, width: 120 }} />
        </label>
        <label style={lbl}>
          Quanti tape al massimo
          <input type="number" value={form.maxTapes} min={1} max={30} onChange={(e) => setForm({ ...form, maxTapes: Number(e.target.value) })} style={{ ...inputStyle, width: 120 }} />
        </label>
        <button
          onClick={extract}
          disabled={busy || data?.bigquery === false}
          style={{
            background: CP.accent,
            color: CP.accentInk,
            border: "none",
            borderRadius: 8,
            padding: "9px 18px",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: FONTS.body,
            cursor: busy ? "wait" : "pointer",
            opacity: data?.bigquery === false ? 0.5 : 1,
          }}
        >
          {busy ? "Estraggo…" : "Estrai candidati"}
        </button>
      </div>

      {msg && <div style={{ fontSize: 13, color: msg.err ? CP.accentRed : CP.textSecondary, marginBottom: 16 }}>{msg.text}</div>}
      {data?.last_extract && !msg && (
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 16 }}>
          Ultima estrazione: {data.last_extract.creator_name || `#${data.last_extract.creator_id}`} ·{" "}
          {new Date(data.last_extract.at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })} · {data.last_extract.found} tape trovati
        </div>
      )}

      {isLoading ? (
        <div style={{ color: CP.textMuted, fontSize: 14 }}>Carico…</div>
      ) : (
        <>
          <div style={{ marginTop: 22 }}>
            <SectionTitle aside="da rivedere: clic per aprire la conversazione">Candidati ({candidates.length})</SectionTitle>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {candidates.length === 0 && (
              <Notice>Nessun candidato da rivedere. Scegli un creator qui sopra e premi &quot;Estrai candidati&quot;: i risultati compaiono qui.</Notice>
            )}
            {candidates.map((t) => (
              <TapeRow key={t.id} tape={t} open={openId === t.id} onToggle={() => setOpenId(openId === t.id ? null : t.id)} onSaved={mutate} />
            ))}
          </div>

          <div style={{ marginTop: 26 }}>
            <SectionTitle aside="quello che vedono gli operatori">In libreria ({published.length})</SectionTitle>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {published.length === 0 && <Notice>Ancora nessun tape pubblicato: per ora gli operatori non vedono niente nella pagina Game tape.</Notice>}
            {published.map((t) => (
              <TapeRow key={t.id} tape={t} open={openId === t.id} onToggle={() => setOpenId(openId === t.id ? null : t.id)} onSaved={mutate} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
