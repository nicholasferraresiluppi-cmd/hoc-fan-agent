"use client";

import { useState } from "react";
import useSWR from "swr";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, card } from "@/components/ds";

/**
 * /me/allenatore — "Il mio allenatore" (scope own).
 * Ogni mattina, dopo un turno da solo, un feedback sul turno di ieri: una cosa
 * fatta bene (con le tue parole), una cosa da provare oggi, due numeri da
 * guardare domani. Lo prepara il sales manager AI, lo rivede una persona prima
 * che arrivi qui. Tu rispondi: lo provi, o proponi la tua idea; e dici se ti è
 * stato utile. Il giorno dopo il feedback parte da lì.
 */
const fetcher = (u) => fetch(u, { cache: "no-store" }).then((r) => r.json());
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, color: CP.textSecondary, cursor: "pointer", fontFamily: FONTS.body };
const btnPrimary = { padding: "8px 14px", background: CP.accent, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, color: CP.accentInk, cursor: "pointer", fontFamily: FONTS.body };

function dayLabel(d) {
  const dt = new Date(`${d}T12:00:00Z`);
  return dt.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

function Item({ it, readOnly, onSaved }) {
  const [commit, setCommit] = useState(it.reply?.commitment || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function send(patch) {
    setBusy(true); setErr(null);
    const r = await fetch("/api/me/allenatore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day: it.day, key: it.key, ...patch }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setErr(j.error || "Errore."); else onSaved();
  }
  return (
    <article style={{ ...card, padding: "18px 20px", marginBottom: 14 }}>
      <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 10 }}>Il tuo turno di {dayLabel(it.day)}</div>
      <div style={{ whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.6, color: CP.textPrimary }}>{it.message}</div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${CP.borderSoft}` }}>
        <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>
          {it.leva ? <>Oggi provi «{it.leva.titolo.toLowerCase()}»? Scrivilo con parole tue, o proponi un'altra idea:</> : "Vuoi provare qualcosa nel prossimo turno? Scrivilo qui:"}
        </div>
        <textarea value={commit} onChange={(e) => setCommit(e.target.value)} disabled={readOnly} rows={2} placeholder="es. «Oggi provo a mandare il PPV solo mentre mi scrive»" style={{ width: "100%", boxSizing: "border-box", background: CP.bg, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: 10, fontSize: 14, fontFamily: FONTS.body, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button disabled={busy || readOnly || !commit.trim()} onClick={() => send({ commitment: commit })} style={btnPrimary}>{it.reply?.commitment ? "Aggiorna" : "Ci provo"}</button>
          <span style={{ fontSize: 13, color: CP.textMuted, marginLeft: 8 }}>Ti è stato utile?</span>
          <button disabled={busy || readOnly} onClick={() => send({ rating: "utile" })} style={{ ...btnGhost, borderColor: it.reply?.rating === "utile" ? CP.accent : CP.border, color: it.reply?.rating === "utile" ? CP.accentSoftText : CP.textSecondary }}><ThumbsUp size={14} /> Sì</button>
          <button disabled={busy || readOnly} onClick={() => send({ rating: "non_utile" })} style={{ ...btnGhost, borderColor: it.reply?.rating === "non_utile" ? CP.accent : CP.border, color: it.reply?.rating === "non_utile" ? CP.accentSoftText : CP.textSecondary }}><ThumbsDown size={14} /> No</button>
        </div>
        {err && <div style={{ marginTop: 6, fontSize: 13, color: CP.accentRed }}>{err}</div>}
      </div>
    </article>
  );
}

export default function MyCoachPage() {
  const { data, error, mutate, isLoading } = useSWR("/api/me/allenatore", fetcher, { revalidateOnFocus: false });
  const items = data?.items || [];
  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 760, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Il mio quadro" }, { label: "Il mio allenatore" }]}
        title="Il mio allenatore"
        subtitle="Dopo ogni turno in cui hai lavorato da solo trovi qui un feedback: una cosa che hai fatto bene, con le tue parole, e una sola cosa da provare oggi. Lo rivede sempre una persona prima che arrivi a te. Non entra nello score né nel compenso."
      />
      {isLoading && <div style={{ color: CP.textMuted }}>Caricamento…</div>}
      {error && <Notice danger>Errore di rete: riprova tra poco.</Notice>}
      {data?.error && <Notice danger>{data.error}</Notice>}
      {data && data.linked === false && <Notice>Il tuo account non è ancora collegato al tuo nome da operatore: chiedi a un admin di collegarlo.</Notice>}
      {data?.linked && data.active === false && <Notice>Il tuo allenatore non è ancora attivo. Quando lo sarà, trovi qui il feedback dei tuoi turni.</Notice>}
      {data?.preview && <Notice>Anteprima come operatore: sola lettura.</Notice>}
      {data?.active && items.length === 0 && <Notice>Ancora nessun feedback: arriva la mattina dopo un turno in cui hai lavorato da solo e mandato qualche PPV.</Notice>}
      {items.map((it) => <Item key={`${it.day}-${it.key}`} it={it} readOnly={!!data.preview} onSaved={() => mutate()} />)}
    </div>
  );
}
