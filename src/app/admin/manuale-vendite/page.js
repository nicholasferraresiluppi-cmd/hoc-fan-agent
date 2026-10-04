"use client";

import { useState } from "react";
import useSWR from "swr";
import { CP, alpha } from "@/lib/brand";
import { PageHead, Notice, card, SectionTitle } from "@/components/ds";
import { TutorialVideoCard } from "@/components/TutorialVideo";
import { VENDITA_SERIE } from "@/lib/tutorial-videos";

/**
 * /admin/manuale-vendite — il manuale di vendita per la direzione vendite.
 *
 * Capitoli e guide di profilo nati dallo studio di 26 mesi di chat (ottobre 2026):
 * stanno nel database dell'app (contengono estratti di chat reali con i nomi
 * oscurati), si aprono in una scheda nuova e li vede solo chi ha la vista
 * vendite su tutte le creator. Sotto, le PROVE: una creator, tre priorità, la
 * misura che si aggiorna da sola ogni lunedì contro le 4 settimane prima.
 */

const fetcher = (u) => fetch(u, { cache: "no-store" }).then(async (r) => { const j = await r.json().catch(() => ({ error: "Risposta non valida" })); return r.ok ? j : { error: j.error || `Errore ${r.status}` }; });
const fmtDate = (ms) => new Date(ms).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };

function Val({ v, unit }) {
  if (v == null) return <span style={{ color: CP.textMuted }}>—</span>;
  return <span>{unit === "$" ? `${v} $` : unit === "%" ? `${v}%` : v.toLocaleString("it-IT")}</span>;
}

function Delta({ base, v, meglio, unit }) {
  if (base == null || v == null || !meglio) return null;
  const d = Math.round((v - base) * 10) / 10;
  if (Math.abs(d) < (unit === "$" ? 1 : 0.5)) return <span style={{ color: CP.textMuted, fontSize: 12 }}> =</span>;
  const good = (d > 0) === (meglio === "su");
  return <span style={{ color: good ? CP.accentGreen : CP.accentRed, fontSize: 12 }}> {d > 0 ? "▲" : "▼"} {Math.abs(d)}{unit === "$" ? " $" : " pt"}</span>;
}

function Prova({ p, metriche, onMisura, busy }) {
  const weeks = (p.settimane || []).slice().sort((a, b) => a.i - b.i);
  const th = { textAlign: "left", fontSize: 12, color: CP.textSecondary, fontWeight: 500, padding: "8px 10px", borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", borderBottom: `1px solid ${CP.border}`, fontSize: 14, whiteSpace: "nowrap" };
  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{p.nome || `Creator ${p.creatorId}`}</div>
          <div style={{ fontSize: 13, color: CP.textSecondary }}>Avvio {fmtDate(p.start)} · base = le 4 settimane prima · ogni lunedì si aggiunge la settimana appena chiusa</div>
        </div>
        <button onClick={() => onMisura(p.id)} disabled={busy} style={{ font: "inherit", fontSize: 13, padding: "6px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: "transparent", color: CP.textPrimary, cursor: "pointer" }}>{busy ? "Misuro…" : "Misura adesso"}</button>
      </div>
      {p.errore && <div style={{ marginTop: 10 }}><Notice danger>Ultima misura non riuscita: {p.errore}</Notice></div>}
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
          <thead><tr><th style={th}>Cosa misuriamo</th><th style={th}>Base</th>{weeks.map((w) => <th key={w.i} style={th}>Settimana {w.i}</th>)}</tr></thead>
          <tbody>
            {metriche.map((m) => (
              <tr key={m.key}>
                <td style={{ ...td, whiteSpace: "normal" }}>
                  {m.priorita && <span style={{ fontSize: 11, color: CP.accentSoftText, background: CP.accentSoft, borderRadius: 999, padding: "1px 8px", marginRight: 8 }}>Priorità {m.priorita}</span>}
                  {m.label}
                </td>
                <td style={td}><Val v={p.baseline?.metriche?.[m.key]} unit={m.unit} /></td>
                {weeks.map((w) => <td key={w.i} style={td}><Val v={w.metriche?.[m.key]} unit={m.unit} /><Delta base={p.baseline?.metriche?.[m.key]} v={w.metriche?.[m.key]} meglio={m.meglio} unit={m.unit} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!weeks.length && <p style={{ fontSize: 13, color: CP.textSecondary, marginTop: 10 }}>La prima settimana si misura il lunedì dopo che si è chiusa.</p>}
      <p style={{ fontSize: 12, color: CP.textMuted, marginTop: 10 }}>Proposte personali: esclusi benvenuto e invii di massa. Una proposta è comprata se arriva un acquisto dello stesso importo entro 24 ore. "Prima il sì, poi il prezzo" non si misura dai numeri: lo si vede leggendo le chat.</p>
    </div>
  );
}

export default function ManualeVendite() {
  const { data, mutate } = useSWR("/api/admin/manuale", fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ creatorId: "1000000358", nome: "Martina Scavo", start: nextMonday() });
  const [msg, setMsg] = useState(null);
  const post = async (body, key) => {
    setBusy(key); setMsg(null);
    const r = await fetch("/api/admin/manuale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) setMsg(j.error || `Errore ${r.status}`); else mutate();
  };
  const docs = data?.docs || [];
  const inp = { font: "inherit", fontSize: 14, padding: "7px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary };
  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHead crumbs={["Performance"]} title="Manuale vendite" subtitle="Cosa fa vendere davvero, misurato su 26 mesi di chat: i capitoli del manuale, le guide di profilo e le prove sul campo." />
      {data?.error && <Notice danger>{data.error}</Notice>}
      <Notice>Materiale interno per la direzione vendite: contiene estratti di chat reali con i nomi dei fan oscurati. Agli operatori arriva in un'altra forma (regole, video, colloquio con il sales manager), dopo il via dell'avvocato.</Notice>

      <SectionTitle>Documenti</SectionTitle>
      {!data && <p style={{ color: CP.textSecondary }}>Carico…</p>}
      {data && !docs.length && !data.error && <p style={{ color: CP.textSecondary }}>Nessun documento caricato.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 28 }}>
        {docs.map((d) => (
          <a key={d.slug} href={`/api/admin/manuale/doc/${d.slug}`} target="_blank" rel="noopener noreferrer" style={{ ...card, padding: 16, textDecoration: "none", color: CP.textPrimary, display: "block" }}>
            <div style={{ fontSize: 12, color: CP.textSecondary }}>{d.kind}</div>
            <div style={{ fontSize: 16, fontWeight: 500, margin: "4px 0 8px" }}>{d.title}</div>
            <div style={{ fontSize: 12, color: CP.textMuted }}>Aggiornato {fmtDate(d.updated_at)} · si apre in una scheda nuova</div>
          </a>
        ))}
      </div>

      <SectionTitle aside="6 episodi · circa 5 minuti in tutto · si guardano in ordine">Video · Il percorso di una vendita</SectionTitle>
      <p style={{ color: CP.textSecondary, fontSize: 13.5, margin: "-4px 0 12px", maxWidth: 760 }}>Una coach, Vera, segue un fan dal primo messaggio al giorno dopo l'acquisto: ogni episodio è un passo e riprende la domanda lasciata da quello prima. Chat ricostruite, numeri dallo studio. Per ora li vede solo la direzione vendite: agli operatori arrivano dopo la vostra approvazione.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12, marginBottom: 28 }}>
        {VENDITA_SERIE.map((v) => <TutorialVideoCard key={v.id} video={v} />)}
      </div>

      <SectionTitle>Prove sul campo</SectionTitle>
      {(data?.prove || []).map((p) => <Prova key={p.id} p={p} metriche={data.metriche || []} busy={busy === p.id} onMisura={(id) => post({ action: "misura", id }, id)} />)}
      <div style={{ ...card, padding: 16, background: alpha(CP.accentSoft, "55") }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>Avvia una prova</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input style={inp} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome creator" />
          <input style={{ ...inp, width: 140 }} value={form.creatorId} onChange={(e) => setForm({ ...form, creatorId: e.target.value })} placeholder="ID creator" />
          <input style={inp} type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          <button onClick={() => post({ action: "prova", ...form }, "new")} disabled={busy === "new"} style={{ font: "inherit", fontSize: 14, padding: "7px 14px", borderRadius: 8, border: "none", background: CP.accent, color: CP.accentInk, cursor: "pointer" }}>{busy === "new" ? "Avvio e misuro la base…" : "Avvia"}</button>
        </div>
        <p style={{ fontSize: 12, color: CP.textSecondary, margin: "8px 0 0" }}>Il giorno di avvio è quello da cui il team applica le tre priorità della guida. Alla creazione si misura subito la base (4 settimane prima).</p>
        {msg && <div style={{ marginTop: 8 }}><Notice danger>{msg}</Notice></div>}
      </div>
    </div>
  );
}
