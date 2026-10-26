"use client";

/**
 * /admin/retention — Retention delle creator dello split (16/10/2026).
 * Il «CRM fan» di management: chi tiene il fatturato in piedi, chi si è fermato,
 * quanti fan nuovi tornano. Calcolo in lib/retention-split (warehouse, solo HOC).
 * Stile fintech (scelto da Nicholas per il conto dello split): riquadro protagonista,
 * una scheda per pagina, numeri veri e una riga di lettura in parole.
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2, RefreshCw, Copy, ExternalLink } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { PageHead, Notice } from "@/components/ds";

const fetcher = async (url) => {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
};
const usd = (n) => (n === null || n === undefined ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD", maximumFractionDigits: 0, useGrouping: "always" }).format(n));
const pct = (f) => (f === null || f === undefined ? "—" : `${Math.round(f * 100)}%`);
const int = (n) => new Intl.NumberFormat("it-IT", { useGrouping: "always" }).format(n || 0);
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const mese = (m) => { const [y, mm] = m.split("-").map(Number); return `${MESI[mm - 1]} ${String(y).slice(2)}`; };

const tint = (c) => `color-mix(in srgb, ${c} 14%, transparent)`;
const Pill = ({ children, tone }) => <span style={{ display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 20, background: tint(tone || CP.textMuted), color: tone || CP.textSecondary }}>{children}</span>;
const muted = { fontSize: 12, color: CP.textMuted };
const btn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary };
const CONC = 0.4; // sopra il 40% dai 10 fan più grossi = dipende da pochi

/** Le righe di lettura di una pagina: regole fisse che citano il numero. */
function readings(p, splitRepeat) {
  const out = [];
  if (p.top10Share !== null && p.top10Share >= CONC) out.push(`Dipende da pochi: i 10 fan che spendono di più fanno il ${pct(p.top10Share)} degli ultimi 90 giorni (${usd(p.top10)} su ${usd(p.rev90)}). Se uno di loro smette, si sente subito.`);
  else if (p.top10Share !== null) out.push(`Fatturato distribuito: i 10 fan più grossi fanno il ${pct(p.top10Share)} degli ultimi 90 giorni.`);
  if (p.valuePaused > 0) out.push(`${int(p.valuePaused)} fan di valore (almeno ${usd(500)} nell'ultimo anno) non comprano da 1 a 4 mesi: prima spendevano circa ${usd(p.pausedMonthly)} al mese in tutto. Sono i primi da far riprendere in chat.`);
  if (p.valueLost > 0) out.push(`${int(p.valueLost)} fan di valore non comprano da più di 4 mesi.`);
  if (p.repeatRate !== null && splitRepeat !== null) {
    const d = p.repeatRate - splitRepeat;
    const cmp = Math.abs(d) < 0.03 ? "in linea con lo split" : d > 0 ? `meglio dello split (${pct(splitRepeat)})` : `peggio dello split (${pct(splitRepeat)})`;
    out.push(`Dei fan nuovi, il ${pct(p.repeatRate)} torna a comprare entro 60 giorni: ${cmp}.`);
  }
  return out;
}


const dmy = (d) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) : "—");
const SUB_TONE = () => ({ attivo: CP.accentGreen, scaduto: CP.accentRed, "non noto": null });

/** Fan di valore in pausa di una pagina, nominati: la lista da dare ai chatter. */
function PausedFans({ creatorId, name }) {
  const { data, error, isLoading } = useSWR(`/api/admin/retention/fans?creator=${creatorId}`, fetcher, { revalidateOnFocus: false });
  const [copied, setCopied] = useState(false);
  if (isLoading) return <div style={{ ...muted, display: "flex", gap: 6, alignItems: "center" }}><Loader2 size={13} />Carico i fan in pausa (fino a mezzo minuto la prima volta del giorno)…</div>;
  if (error) return <Notice danger>{error.message}</Notice>;
  if (!data) return null;
  const fans = data.fans || [];
  const tone = SUB_TONE();
  const copy = async () => {
    const lines = fans.map((f) => `${f.username ? "@" + f.username : f.name || f.userId} — spendeva ~${usd(f.monthly)}/mese — fermo da ${f.days} gg — abbonamento ${f.sub}${f.fanLast && (!f.ourLast || f.fanLast > f.ourLast) ? " — ha scritto per ultimo, da rispondere" : ""}`);
    try { await navigator.clipboard.writeText(`Fan da far riprendere · ${name}\n` + lines.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { alert("Copia non riuscita"); }
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>Da far riprendere ({fans.length})</span>
        {fans.length > 0 && <button style={{ ...btn, padding: "5px 10px", fontSize: 12 }} onClick={copy}><Copy size={13} />{copied ? "Copiata" : "Copia la lista per i chatter"}</button>}
      </div>
      <div style={{ ...muted, marginBottom: 8 }}>
        Fan di valore fermi da 1 a 4 mesi, dal più prezioso. Negli ultimi 30 giorni ne sono tornati {int(data.returned?.fans)}{data.returned?.fans ? `, che hanno speso ${usd(data.returned.spentSince)}` : ""}.
        Abbonamento = stato all'ultimo messaggio visto.
      </div>
      {fans.length === 0 && <div style={muted}>Nessun fan di valore in pausa su questa pagina.</div>}
      {fans.map((f) => {
        const unanswered = f.fanLast && (!f.ourLast || f.fanLast > f.ourLast);
        return (
          <div key={f.userId} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, padding: "8px 0", borderTop: `1px solid ${CP.borderSoft}`, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name || f.username || f.userId}{f.username ? <span style={{ color: CP.textMuted, fontSize: 12 }}> @{f.username}</span> : null}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "3px 0" }}>
                <Pill tone={tone[f.sub]}>abbonamento {f.sub}</Pill>
                {unanswered && <Pill tone={CP.accentSoftText}>ha scritto per ultimo</Pill>}
              </div>
              <div style={muted}>Ultimo acquisto {dmy(f.lastBuy)} · ultimo messaggio suo {dmy(f.fanLast)}, nostro {dmy(f.ourLast)} · {usd(f.r365)} nell'ultimo anno</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{usd(f.monthly)}<span style={{ ...muted }}>/mese</span></div>
              <div style={muted}>fermo da {f.days} gg</div>
              <a href={`https://onlyfans.com/my/chats/chat/${f.userId}/`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: CP.accentSoftText, display: "inline-flex", gap: 4, alignItems: "center" }}>Apri chat<ExternalLink size={11} /></a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Detail({ p, splitRepeat }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 8 }}>
        {readings(p, splitRepeat).map((r, i) => <div key={i} style={{ fontSize: 14, lineHeight: 1.5, color: CP.textSecondary }}>{r}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        {[
          ["Revenue 90 giorni", usd(p.rev90), `${int(p.payers90)} fan paganti`],
          ["Top 10 fan", usd(p.top10), `${pct(p.top10Share)} del totale`],
          ["Fan di valore attivi", int(p.valueActive), `su ${int(p.valueFans)} nell'ultimo anno`],
          ["In pausa (1-4 mesi)", int(p.valuePaused), `circa ${usd(p.pausedMonthly)}/mese`],
          ["Persi (oltre 4 mesi)", int(p.valueLost), ""],
          ["Fan nuovi 90 giorni", int(p.new90), p.repeatRate !== null ? `${pct(p.repeatRate)} torna entro 60 giorni` : ""],
        ].map(([l, v, n]) => (
          <div key={l} style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: 12 }}>
            <div style={muted}>{l}</div>
            <div style={{ fontSize: 20, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{v}</div>
            {n && <div style={muted}>{n}</div>}
          </div>
        ))}
      </div>
      <PausedFans creatorId={p.creator_id} name={p.name} />
      {p.cohorts.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Fan nuovi mese per mese</div>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 1fr", gap: 6, ...muted, paddingBottom: 4 }}><span>Mese</span><span style={{ textAlign: "right" }}>Fan nuovi</span><span style={{ textAlign: "right" }}>Spesa primo mese</span><span style={{ textAlign: "right" }}>Tornati entro 60 gg</span></div>
          {p.cohorts.map((c) => (
            <div key={c.month} style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 1fr", gap: 6, fontSize: 13, padding: "5px 0", borderTop: `1px solid ${CP.borderSoft}`, fontVariantNumeric: "tabular-nums" }}>
              <span>{mese(c.month)}</span>
              <span style={{ textAlign: "right" }}>{int(c.fans)}</span>
              <span style={{ textAlign: "right" }}>{usd(c.spend30)}</span>
              <span style={{ textAlign: "right", color: c.ripe ? CP.textPrimary : CP.textMuted }}>{c.ripe ? `${pct(c.fans ? c.back / c.fans : 0)} (${int(c.back)})` : "ancora presto"}</span>
            </div>
          ))}
          {p.cohorts.some((c) => !c.ripe) && <div style={{ ...muted, marginTop: 6 }}>«Ancora presto»: non sono passati 60 giorni per tutti i fan del mese.</div>}
        </div>
      )}
    </div>
  );
}

export default function RetentionPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/retention", fetcher, { revalidateOnFocus: false });
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const pages = data?.pages || [];
  const S = useMemo(() => {
    const sum = (f) => pages.reduce((s, p) => s + (f(p) || 0), 0);
    const ripe = sum((p) => p.newRipe);
    return {
      rev90: sum((p) => p.rev90), paused: sum((p) => p.valuePaused), pausedMonthly: sum((p) => p.pausedMonthly),
      active: sum((p) => p.valueActive), lost: sum((p) => p.valueLost), new90: sum((p) => p.new90),
      repeat: ripe > 0 ? sum((p) => p.newRepeat) / ripe : null,
      concentrated: pages.filter((p) => p.top10Share !== null && p.top10Share >= CONC).length,
    };
  }, [pages]);
  const refresh = async () => { setBusy(true); try { await mutate(await fetcher("/api/admin/retention?refresh=1"), { revalidate: false }); } catch (e) { alert(e.message); } finally { setBusy(false); } };
  const cur = pages.find((p) => p.creator_id === open);

  return (
    <div style={{ padding: "24px 16px 80px", maxWidth: 1600, margin: "0 auto" }}>
      <PageHead
        crumbs={[{ label: "Comp & Ben" }, { label: "Retention fan" }]}
        title="Retention fan"
        subtitle="Per ogni pagina del tuo split: quanto dipende da pochi fan, quali fan di valore si sono fermati (con la lista da far riprendere ai chatter), quanti fan nuovi tornano. Dati del warehouse, solo HOC, aggiornati una volta al giorno."
        actions={<button style={btn} onClick={refresh} disabled={busy}>{busy ? <Loader2 size={14} /> : <RefreshCw size={14} />}Ricalcola</button>}
      />
      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && <div style={{ color: CP.textMuted, display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={14} />Calcolo dal warehouse (fino a mezzo minuto la prima volta del giorno)…</div>}
      {data && !pages.length && <Notice>Nessuna creator nello split, oppure nessun dato nel warehouse.</Notice>}

      {pages.length > 0 && (<>
        <div style={{ background: CP.textPrimary, color: CP.bg, borderRadius: 18, padding: "22px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.65 }}>Fan di valore in pausa</div>
            <div style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{int(S.paused)}</div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 4 }}>spendevano circa {usd(S.pausedMonthly)} al mese · fermi da 1 a 4 mesi</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 18, rowGap: 3, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ opacity: 0.65 }}>Revenue 90 giorni</span><span style={{ textAlign: "right" }}>{usd(S.rev90)}</span>
            <span style={{ opacity: 0.65 }}>Fan di valore attivi</span><span style={{ textAlign: "right" }}>{int(S.active)}</span>
            <span style={{ opacity: 0.65 }}>Persi (oltre 4 mesi)</span><span style={{ textAlign: "right" }}>{int(S.lost)}</span>
            <span style={{ opacity: 0.65 }}>Nuovi che tornano</span><span style={{ textAlign: "right" }}>{pct(S.repeat)}</span>
          </div>
        </div>
        <div style={{ ...muted, marginBottom: 14 }}>
          Fan di valore = almeno {usd(500)} spesi nell'ultimo anno su quella pagina. {S.concentrated > 0 ? `${S.concentrated} pagine dipendono da pochi fan (i 10 più grossi fanno il 40% o più).` : ""} {data.cached ? "Calcolato oggi." : ""}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
          {pages.map((p) => {
            const conc = p.top10Share !== null && p.top10Share >= CONC;
            const repeatTone = p.repeatRate === null || S.repeat === null ? null : p.repeatRate < S.repeat - 0.03 ? CP.accentSoftText : p.repeatRate > S.repeat + 0.03 ? CP.accentGreen : null;
            return (
              <button key={p.creator_id} onClick={() => setOpen(p.creator_id)} style={{ textAlign: "left", cursor: "pointer", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 14, padding: 16, color: CP.textPrimary, fontFamily: FONTS.body, display: "grid", gap: 6, alignContent: "start" }}>
                <span style={{ fontSize: 13, color: CP.textSecondary }}>{p.name}</span>
                <div style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>{usd(p.rev90)}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <Pill tone={conc ? CP.accentSoftText : null}>top 10 fan {pct(p.top10Share)}</Pill>
                  {p.valuePaused > 0 && <Pill tone={CP.accentSoftText}>{int(p.valuePaused)} in pausa</Pill>}
                  {p.repeatRate !== null && <Pill tone={repeatTone}>{pct(p.repeatRate)} dei nuovi torna</Pill>}
                </div>
                <div style={muted}>{p.valuePaused > 0 ? `In pausa: circa ${usd(p.pausedMonthly)}/mese` : "Nessun fan di valore in pausa"} · {int(p.valueActive)} attivi</div>
              </button>
            );
          })}
        </div>
      </>)}

      <Modal open={Boolean(cur)} onClose={() => setOpen(null)} title={cur?.name || ""} maxWidth={760}>
        {cur && <Detail p={cur} splitRepeat={S.repeat} />}
      </Modal>
    </div>
  );
}
