"use client";

/**
 * /grazie — dire grazie a un collega (27/09/2026). Dal pannello cultura: riconoscimento specifico e
 * sul comportamento, privato a chi lo riceve (lo condivide solo lui/lei se vuole), nessun contatore,
 * nessuna classifica. Vedi lib/grazie.js.
 */
import { useState } from "react";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, Notice, card } from "@/components/ds";

const fetcher = (u) => fetch(u).then((r) => r.json());
const when = (ts) => new Date(ts).toLocaleDateString("it-IT", { day: "numeric", month: "long" });
const field = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };

export default function GraziePage() {
  const { data, mutate } = useSWR("/api/grazie", fetcher, { revalidateOnFocus: false });
  const [to, setTo] = useState("");
  const [pratica, setPratica] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch("/api/grazie", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, pratica, text }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ err: true, text: j.error || "Non inviato" });
    setMsg({ text: `Mandato a ${j.item?.to?.name}. Lo vede solo lei/lui.` });
    setText(""); setPratica(""); setTo("");
    mutate();
  };
  const share = async (id, on) => {
    await fetch("/api/grazie", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "share", id, on }) });
    mutate();
  };

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 820, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead title="Dire grazie" line2="Specifico, sul comportamento."
        subtitle="Un grazie vale di più quando dice cosa ha fatto la persona e che effetto ha avuto. Arriva solo a chi lo riceve: se vuole, può mostrarlo nella pagina «Come lavoriamo». Niente conteggi, niente classifiche." />

      <form onSubmit={send} style={{ ...card, padding: "18px 20px", marginBottom: 28, display: "grid", gap: 12 }}>
        <label style={{ fontSize: 13, color: CP.textSecondary }}>A chi
          <select required value={to} onChange={(e) => setTo(e.target.value)} style={{ ...field, marginTop: 6 }}>
            <option value="">Scegli un collega</option>
            {(data?.people || []).map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: CP.textSecondary }}>Quale pratica (facoltativo)
          <select value={pratica} onChange={(e) => setPratica(e.target.value)} style={{ ...field, marginTop: 6 }}>
            <option value="">—</option>
            {(data?.pratiche || []).map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: CP.textSecondary }}>Cosa ha fatto, e che effetto ha avuto
          <textarea required minLength={8} maxLength={280} rows={3} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Es. Grazie per il riepilogo della call con la creator: mi ha evitato di rileggere tutto il gruppo." style={{ ...field, marginTop: 6, resize: "vertical" }} />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="submit" disabled={busy} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: CP.accent, color: CP.accentInk, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body }}>{busy ? "Invio…" : "Manda il grazie"}</button>
          {msg && <span style={{ fontSize: 13, color: msg.err ? CP.accentRed : CP.textSecondary }}>{msg.text}</span>}
        </div>
      </form>

      <SectionTitle aside="solo tu li vedi, finché non scegli di mostrarli">Ricevuti</SectionTitle>
      {!(data?.received || []).length ? <Notice>Ancora nessuno. Quando qualcuno ti ringrazia, lo trovi qui.</Notice> : (
        <div style={{ display: "grid", gap: 10, marginBottom: 28 }}>
          {data.received.map((t) => (
            <div key={t.id} style={{ ...card, padding: "14px 16px" }}>
              <div style={{ fontSize: 14, color: CP.textPrimary, lineHeight: 1.55 }}>{t.text}</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8, fontSize: 12.5, color: CP.textMuted }}>
                <span>da {t.from?.name} · {when(t.at)}{t.pratica && t.pratica !== "Altro" ? ` · ${t.pratica}` : ""}</span>
                <button type="button" onClick={() => share(t.id, !t.shared)} style={{ marginLeft: "auto", background: "none", border: `1px solid ${CP.border}`, borderRadius: 999, padding: "4px 10px", fontSize: 12.5, color: t.shared ? CP.accentSoftText : CP.textSecondary, cursor: "pointer" }}>
                  {t.shared ? "Mostrato in «Come lavoriamo» · ritira" : "Mostralo in «Come lavoriamo»"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(data?.sent || []).length > 0 && (
        <>
          <SectionTitle>Mandati da te</SectionTitle>
          <div style={{ display: "grid", gap: 8 }}>
            {data.sent.map((t) => (
              <div key={t.id} style={{ fontSize: 13.5, color: CP.textSecondary, lineHeight: 1.5 }}>A <b style={{ fontWeight: 500, color: CP.textPrimary }}>{t.to?.name}</b> · {when(t.at)}: {t.text}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
