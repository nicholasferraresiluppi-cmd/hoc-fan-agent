"use client";

/**
 * Studio social — agente qualità dentro la scheda di un contenuto (16/10/2026).
 * Si sceglie il video montato dal computer: il browser misura la parte tecnica ed estrae i
 * fotogrammi, l'AI li legge con le foto di riferimento, il server scrive gli esiti. Qui si vede la
 * TAVOLA per chi approva: voci con ok/dubbio/errore e il secondo, fotogrammi accanto ai riferimenti.
 * L'ok finale della Qualità resta di una persona.
 */
import { useState } from "react";
import { ScanEye } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { alpha, NUM } from "@/components/ds";
import { QUALITY_CHECKS } from "@/lib/studio-social-core";
import { HUMAN_ONLY_CHECKS, fmtSec, estimateQcCost } from "@/lib/studio-quality-core";

const ESITO = {
  ok: { label: "ok", color: CP.accentGreen },
  dubbio: { label: "da guardare", color: CP.textSecondary },
  errore: { label: "errore", color: CP.accentRed },
};
const SHORT = { volto: "È lei", anatomia: "Mani, occhi, pelle", coerenza: "Coerenza tra i tagli", montaggio: "Montaggio", testo: "Testi e sottotitoli", aggancio: "Primi 2 secondi", audio: "Audio", etichetta_ai: "Etichetta AI" };

export default function QualityAgent({ pid, item, refs = [], onResult }) {
  const [stage, setStage] = useState(null);
  const [err, setErr] = useState(null);
  const ai = item.aiReview;
  const base = `/api/admin/studio-social/${encodeURIComponent(pid)}`;

  const run = async (file) => {
    setErr(null);
    try {
      const { analyzeVideo } = await import("@/lib/video-check-client");
      const { tech, frames } = await analyzeVideo(file, { onStage: setStage, ai: !!item.ai });
      // lo stesso file diventa il video del contenuto: è quello che uscirà su Instagram
      setStage("Salvo il video nell'app…");
      const { upload } = await import("@vercel/blob/client");
      const safe = (file.name || "reel.mp4").replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
      const blob = await upload(`studio/${pid}/video/${item.id}/${safe}`, file, {
        access: "private", handleUploadUrl: `${base}/video`, clientPayload: item.id, contentType: file.type, multipart: file.size > 20e6,
        onUploadProgress: (e) => setStage(`Salvo il video nell'app (${Math.round(e?.percentage || 0)}%)…`),
      }).catch((e) => { throw new Error(/content type/i.test(e?.message) ? "Formato non ammesso: MP4, MOV o WebM" : `Salvataggio del video non riuscito: ${e?.message || "riprova"}`); });
      const att = await fetch(`${base}/video`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "attach", itemId: item.id, path: blob.pathname, name: file.name, size: file.size, contentType: file.type }) });
      const attJ = await att.json().catch(() => null);
      if (!att.ok) throw new Error(attJ?.error || "Video non collegato al contenuto");
      const post = async (body) => {
        const r = await fetch(`${base}/quality`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error || (r.status === 413 ? "Pacchetto troppo pesante: riprova" : `Errore ${r.status}`));
        return j;
      };
      // fotogrammi a pacchetti sotto ~3,5 MB (limite del server per richiesta)
      const runId = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");
      let pack = []; let size = 0; let sent = 0;
      const flush = async () => { if (!pack.length) return; await post({ action: "frames", itemId: item.id, runId, frames: pack }); sent += pack.length; pack = []; size = 0; setStage(`Carico i fotogrammi (${sent} di ${frames.length})…`); };
      for (const f of frames) { if (size + f.dataUrl.length > 3.5e6) await flush(); pack.push(f); size += f.dataUrl.length; }
      await flush();
      const est = estimateQcCost(frames.length, refs.length);
      setStage(`L'AI guarda ${frames.length} fotogrammi (circa ${Math.max(1, Math.round(est * 100))} centesimi, 1-2 minuti)…`);
      const j = await post({ action: "run", itemId: item.id, runId, tech });
      onResult?.(j.item);
    } catch (e) { setErr(e.message); } finally { setStage(null); }
  };

  const flagged = new Set();
  if (ai?.answer) for (const v of Object.values(ai.answer.voci || {})) if (v.esito !== "ok") (v.secondi || []).forEach((s) => flagged.add(Math.round(s * 10)));
  const isFlagged = (t) => [...flagged].some((x) => Math.abs(x - Math.round(t * 10)) <= 3);

  return (
    <div style={{ border: `1px solid ${CP.border}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, flex: 1, minWidth: 200 }}>Controllo AI del video</div>
        {item.id ? (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: stage ? "wait" : "pointer", background: CP.accent, color: CP.accentInk, opacity: stage ? 0.6 : 1 }}>
            <ScanEye size={14} aria-hidden="true" /> {ai ? "Ricontrolla un video" : "Controlla il video"}
            <input type="file" accept="video/mp4,video/quicktime,video/webm" hidden disabled={!!stage} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) run(f); }} />
          </label>
        ) : <span style={{ fontSize: 12, color: CP.textMuted }}>Salva il contenuto prima di controllarne il video</span>}
      </div>
      <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4, lineHeight: 1.45 }}>
        Scegli il video montato dal computer: viene salvato nell'app (è quello che uscirà su Instagram, niente scambi di file) e all'AI vanno i fotogrammi (uno ogni mezzo secondo, uno ogni terzo di secondo se ci sono parti AI, e prima/dopo ogni taglio). I fotogrammi sono campioni: l'AI segnala, l'ok lo dai tu guardando il video intero.
        {!refs.length && " Mancano le foto di riferimento del volto: segnale con la stella nella sezione Foto."}
      </div>
      {stage && <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 8 }}>{stage}</div>}
      {err && <div style={{ fontSize: 13, color: CP.accentRed, marginTop: 8 }}>{err}</div>}

      {ai && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 8 }}>
            Ultimo controllo {new Date(ai.at).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            {ai.tech?.name ? ` · ${ai.tech.name}` : ""} · {ai.tech?.width}×{ai.tech?.height}, {Number(ai.tech?.duration || 0).toFixed(1)} s · {ai.frames?.length || 0} fotogrammi · {ai.cost_usd != null ? `${(ai.cost_usd * 100).toFixed(0)} centesimi` : ""}
          </div>
          {ai.answer?.sintesi && <div style={{ fontSize: 14, color: CP.textPrimary, lineHeight: 1.5, marginBottom: 10 }}>{ai.answer.sintesi}</div>}

          <div style={{ fontSize: 13, color: CP.textPrimary, marginBottom: 4 }}>
            Tecnico: <span style={{ color: ai.technical?.outcome === "ok" ? CP.accentGreen : ai.technical?.outcome === "blocca" ? CP.accentRed : CP.textSecondary }}>{ai.technical?.outcome === "ok" ? "ok" : ai.technical?.outcome === "blocca" ? "da rifare" : "attenzione"}</span>
          </div>
          {[...(ai.technical?.problems || []), ...(ai.technical?.warnings || [])].map((p, i) => <div key={i} style={{ fontSize: 12, color: CP.textSecondary, paddingLeft: 10 }}>· {p}</div>)}

          <div style={{ marginTop: 10 }}>
            {QUALITY_CHECKS.filter((c) => ai.answer?.voci?.[c.key] || HUMAN_ONLY_CHECKS.includes(c.key)).filter((c) => !c.ai || item.ai).map((c) => {
              const v = ai.answer?.voci?.[c.key];
              const e = v ? ESITO[v.esito] : null;
              return (
                <div key={c.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 150px) minmax(0, 1fr)", gap: 10, padding: "6px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
                  <div style={{ fontSize: 13, color: CP.textPrimary }}>
                    {SHORT[c.key] || c.key}
                    {HUMAN_ONLY_CHECKS.includes(c.key) && <div style={{ fontSize: 11, color: CP.textMuted }}>la spunti tu</div>}
                  </div>
                  <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.45 }}>
                    {e ? <span style={{ color: e.color, fontWeight: 500 }}>{e.label}</span> : <span style={{ color: CP.textMuted }}>{c.key === "audio" ? "ascoltalo tu (l'AI non sente)" : "decidi tu"}</span>}
                    {v?.secondi?.length ? <span style={{ ...NUM }}> · {v.secondi.map(fmtSec).join(", ")}</span> : null}
                    {v?.nota && <div>{v.nota}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {ai.answer?.testo_letto && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 12, color: CP.textSecondary, cursor: "pointer" }}>Testi letti nel video</summary>
              <div style={{ fontSize: 12, color: CP.textSecondary, whiteSpace: "pre-wrap", marginTop: 4 }}>{ai.answer.testo_letto}</div>
            </details>
          )}

          <div style={{ fontSize: 12, color: CP.textMuted, margin: "12px 0 6px" }}>La tavola: riferimenti a sinistra, fotogrammi letti (bordo rosso dove l'AI ha visto qualcosa)</div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6 }}>
            {refs.map((id) => (
              <div key={id} style={{ flex: "0 0 auto", width: 84 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${base}/photo?p=${id}`} alt="Riferimento" style={{ width: 84, height: 150, objectFit: "cover", borderRadius: 6, display: "block", border: `2px solid ${CP.accent}` }} />
                <div style={{ fontSize: 11, color: CP.textMuted, textAlign: "center" }}>riferimento</div>
              </div>
            ))}
            {(ai.frames || []).map((f, i) => (
              <div key={i} style={{ flex: "0 0 auto", width: 84 }}>
                {f.path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${base}/quality?item=${encodeURIComponent(item.id)}&i=${i}&r=${ai.runId}`} alt={`Fotogramma a ${fmtSec(f.t)}`} style={{ width: 84, height: 150, objectFit: "cover", borderRadius: 6, display: "block", border: `2px solid ${isFlagged(f.t) ? CP.accentRed : alpha(CP.border, "ff")}` }} />
                ) : <div style={{ width: 84, height: 150, borderRadius: 6, background: CP.bgSunken }} />}
                <div style={{ fontSize: 11, color: isFlagged(f.t) ? CP.accentRed : CP.textMuted, textAlign: "center", ...NUM }}>{fmtSec(f.t)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
