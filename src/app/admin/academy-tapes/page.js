"use client";

// Game tape — curatela (SEED): estrai i candidati dal warehouse, rivedi la
// conversazione, aggiungi titolo e note del coach, pubblica. Solo i tape
// pubblicati arrivano agli operatori (/academy/tapes).

import { useState } from "react";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";
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
};

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
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titolo del tape (es. Doppio sblocco da $200 su fan nuovo in 8 ore)"
        style={inputStyle}
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Note del coach: cosa rende questa azione replicabile? (build-up, timing del prezzo, semina del prossimo acquisto…)"
        rows={4}
        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          disabled={busy}
          onClick={() => patch({ title, coach_notes: notes })}
          style={{
            background: CP.surfaceAlt,
            color: CP.textPrimary,
            border: `1px solid ${CP.border}`,
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          Salva curatela
        </button>
        <button
          disabled={busy}
          onClick={() => patch({ title, coach_notes: notes, published: !tape.published })}
          style={{
            background: tape.published ? CP.surfaceAlt : CP.accent,
            color: tape.published ? CP.textSecondary : CP.accentInk,
            border: `1px solid ${tape.published ? CP.border : CP.accent}`,
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 500,
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
        ? (tape.operators || []).join(" + ")
        : "non attribuito";
  return (
    <div style={{ background: CP.surface, border: `1px solid ${open ? CP.accentDim : CP.border}`, borderRadius: 12 }}>
      <button
        onClick={onToggle}
        style={{ all: "unset", boxSizing: "border-box", display: "block", width: "100%", padding: "14px 16px", cursor: "pointer" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500 }}>
            {tape.title || `${tape.creator_name} · ${tape.fan}`}
          </span>
          <span style={{ fontSize: 13, color: CP.accentGreen }}>{usd(tape.total)}</span>
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: CP.textMuted, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span>{tape.creator_name}</span>
          <span>{opLabel}</span>
          <span>{tape.buys?.length || 1} acquisti</span>
          <span>build-up {tape.stats?.buildup_min ?? "?"} min</span>
          {tape.published && <span style={{ color: CP.accentGreen }}>pubblicato</span>}
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
        text: `Estratti ${out.found} tape da ${out.sequences || 0} sequenze (${out.purchases} acquisti sopra soglia).`,
      });
      mutate();
    } catch (e) {
      setMsg({ err: true, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px 64px" }}>
      <PageHeader
        section="Admin · Academy"
        title="Game tape — curatela"
        subtitle="Estrai le migliori azioni di vendita reali dal warehouse, rivedile e pubblica quelle che meritano la libreria. Gli operatori vedono solo i tape pubblicati, con fan pseudonimizzato. La revisione prima del publish è anche un controllo PII: se il testo contiene il nome reale del fan o altri dati identificativi, non pubblicare."
      />

      {data?.error && (
        <div style={{ padding: 14, borderRadius: 10, background: CP.surface, border: `1px solid ${CP.accentRed}55`, color: CP.accentRed, fontSize: 13, marginBottom: 16 }}>
          {data.error}
        </div>
      )}
      {data && data.bigquery === false && (
        <div style={{ padding: 14, borderRadius: 10, background: CP.surface, border: `1px solid ${CP.border}`, color: CP.textSecondary, fontSize: 13, marginBottom: 16 }}>
          BigQuery non configurato in questo ambiente: la lista è consultabile ma l&apos;estrazione è disabilitata.
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          padding: 16,
          background: CP.surface,
          border: `1px solid ${CP.border}`,
          borderRadius: 12,
          marginBottom: 10,
        }}
      >
        <select
          value={form.creatorId}
          onChange={(e) => setForm({ ...form, creatorId: e.target.value })}
          style={{ ...inputStyle, minWidth: 220 }}
        >
          <option value="">Creator…</option>
          {creators.map((c) => (
            <option key={c.creator_id} value={c.creator_id}>
              {c.creator_name}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 12, color: CP.textMuted }}>
          giorni{" "}
          <input
            type="number"
            value={form.days}
            min={1}
            max={120}
            onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
            style={{ ...inputStyle, width: 64 }}
          />
        </label>
        <label style={{ fontSize: 12, color: CP.textMuted }}>
          min ${" "}
          <input
            type="number"
            value={form.minAmount}
            min={20}
            max={500}
            onChange={(e) => setForm({ ...form, minAmount: Number(e.target.value) })}
            style={{ ...inputStyle, width: 72 }}
          />
        </label>
        <label style={{ fontSize: 12, color: CP.textMuted }}>
          max tape{" "}
          <input
            type="number"
            value={form.maxTapes}
            min={1}
            max={30}
            onChange={(e) => setForm({ ...form, maxTapes: Number(e.target.value) })}
            style={{ ...inputStyle, width: 60 }}
          />
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
            cursor: busy ? "wait" : "pointer",
            opacity: data?.bigquery === false ? 0.5 : 1,
          }}
        >
          {busy ? "Estraggo…" : "Estrai candidati"}
        </button>
      </div>

      {msg && (
        <div style={{ fontSize: 13, color: msg.err ? CP.accentRed : CP.accentGreen, marginBottom: 16 }}>
          {msg.text}
        </div>
      )}
      {data?.last_extract && !msg && (
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 16 }}>
          Ultima estrazione: {data.last_extract.creator_name || `#${data.last_extract.creator_id}`} ·{" "}
          {new Date(data.last_extract.at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })} ·{" "}
          {data.last_extract.found} tape trovati
        </div>
      )}

      {isLoading ? (
        <div style={{ color: CP.textMuted, fontSize: 14 }}>Carico…</div>
      ) : (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, fontFamily: FONTS.display, margin: "18px 0 10px" }}>
            Candidati ({candidates.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {candidates.length === 0 && (
              <div style={{ fontSize: 13, color: CP.textMuted }}>Nessun candidato: lancia un&apos;estrazione.</div>
            )}
            {candidates.map((t) => (
              <TapeRow key={t.id} tape={t} open={openId === t.id} onToggle={() => setOpenId(openId === t.id ? null : t.id)} onSaved={mutate} />
            ))}
          </div>

          <h2 style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, fontFamily: FONTS.display, margin: "26px 0 10px" }}>
            Pubblicati ({published.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {published.length === 0 && (
              <div style={{ fontSize: 13, color: CP.textMuted }}>Ancora niente in libreria.</div>
            )}
            {published.map((t) => (
              <TapeRow key={t.id} tape={t} open={openId === t.id} onToggle={() => setOpenId(openId === t.id ? null : t.id)} onSaved={mutate} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
