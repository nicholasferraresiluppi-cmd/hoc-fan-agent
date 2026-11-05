"use client";
// Radar creator — vista "Oggi": il lavoro della mattina. Tre creator da guardare (scelte da
// fatti del radar: profilo a pagamento, format, crescita, novità), chi si muove, il percorso,
// le ultime segnalazioni e da dove vengono i dati.
import { useEffect, useMemo, useState } from "react";
import { CP, alpha } from "@/lib/brand";
import { pickToday, movers, whyLines, reviewQueue, RATINGS } from "@/lib/scouting-core";
import HeroHead, { BigNum as HeroNum } from "@/components/HeroHead";
import { SERIF, NUM, fmtFull, fmtDate, btn, btnPrimary, btnQuiet, Initials, LinkChip, Growth, Spark, H2, STAGE_LABEL, RatingChips } from "./radar-ui";


export default function RadarOggi({ newCut, data, creators, profilesBy, onOpen, act, busy, inbox, onSegnala, onValuta, onReload }) {
  const today = useMemo(() => pickToday(creators, { n: 3, newCut }), [creators, newCut]);
  const moving = useMemo(() => movers(creators, 5), [creators]);
  const counts = data.counts || {};
  const paid = creators.filter((c) => c.sig === "forte").length;
  const fmt = creators.filter((c) => c.fmt && c.fmt !== "nessuno").length;
  const newWeek = creators.filter((c) => c.firstSeen && c.firstSeen >= newCut && c.sig === "forte").length;
  const contacted = (counts.contattata || 0) + (counts.trattativa || 0) + (counts.firmata || 0);
  const ref = data.refresh || {};
  const stages = ["da_valutare", "interessante", "contattata", "trattativa", "firmata"];
  const maxStage = Math.max(1, ...stages.map((s) => counts[s] || 0));

  const toReview = reviewQueue(creators, { scope: "paid", newCut }).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>
      <style>{RO_CSS}</style>
      <HeroHead
        eyebrow="Radar creator · oggi"
        title={toReview ? "Da valutare ci sono" : "Il radar segue"}
        accent={toReview ? `${fmtFull(toReview)} creator` : `${fmtFull(creators.length)} creator`}
        sub={toReview ? "Tutte col profilo a pagamento. Una alla volta: un voto per ognuna." : "Nessuna col profilo a pagamento resta da valutare: le hai guardate tutte."}
        numbers={<>
          <HeroNum label="Creator seguite" value={creators.length} />
          <HeroNum label="Con profilo a pagamento" value={paid} strong />
          <HeroNum label="Con un format" value={fmt} />
          <HeroNum label="Contattate" value={contacted} title="In attesa del parere legale" />
        </>}
        actions={onValuta && toReview > 0 ? <button style={btnPrimary} onClick={onValuta}>Inizia a valutare</button> : null}
        style={{ marginBottom: -20 }}
      />

      <section aria-labelledby="r-oggi" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <H2 id="r-oggi" sub="Profilo a pagamento, qualcosa di riconoscibile, ancora da valutare. Cambiano appena le valuti.">Da guardare oggi</H2>
          {newWeek > 0 && <span style={{ fontSize: 14, color: CP.textSecondary }}>{newWeek} nuove con profilo a pagamento questa settimana</span>}
        </div>
        {today.length === 0 ? (
          <p style={{ color: CP.textSecondary, margin: 0 }}>Nessuna creator da valutare con un profilo a pagamento: le hai già guardate tutte.</p>
        ) : (
          <div className="ro-today" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            {today.map((c, i) => {
              const why = whyLines(c, { newCut });
              return (
                <article key={c.id} className="ro-card" style={{ display: "flex", flexDirection: "column", gap: 16, borderRadius: 18, border: `1px solid ${i === 0 ? alpha(CP.gold, "88") : CP.borderSoft || CP.border}`, background: i === 0 ? `radial-gradient(ellipse at 15% 0%, ${alpha(CP.gold, "14")}, transparent 60%), ${CP.surface}` : CP.surface, padding: 20, animationDelay: `${i * 70}ms` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <Initials name={c.name} gold={i === 0} pic={c.pic} />
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <button onClick={() => onOpen(c)} style={{ ...btnQuiet, padding: 0, minHeight: 0, color: CP.textPrimary, fontSize: 16, fontWeight: 600, justifyContent: "flex-start" }}>{c.name}</button>
                      <span style={{ fontSize: 13.5, color: CP.textSecondary }}>{[c.g, c.nic].filter(Boolean).join(" · ")}</span>
                    </div>
                  </div>
                  <p style={{ margin: 0, ...SERIF, fontSize: 22, lineHeight: 1.3, color: CP.textPrimary }}>{why[0] || "Profilo a pagamento da valutare."}</p>
                  {why.length > 1 && <p style={{ margin: 0, fontSize: 14, color: CP.textSecondary }}>{why.slice(1).join(" ")}</p>}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                    <Fig v={fmtFull(c.fol)} l="follower" />
                    <Fig v={fmtFull(c.medv)} l="view per reel" />
                    <Fig v={<Growth v={c.g4} />} l="in 4 settimane" />
                  </div>
                  <LinkChip link={c.link} sig={c.sig} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button style={btnPrimary} onClick={() => onOpen(c)}>Apri la scheda</button>
                  </div>
                  <RatingChips value={c.rating} disabled={busy} onRate={(id) => act({ action: "review", id: c.id, decision: id }, `${c.name}: ${RATINGS.find((r) => r.id === id).label}.`)} />
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 56 }}>
        <section aria-labelledby="r-muove" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <H2 id="r-muove" sub="Le crescite più forti delle ultime 4 settimane, tra chi ha un profilo a pagamento.">Chi si muove</H2>
          {moving.length === 0 ? (
            <p style={{ color: CP.textSecondary, margin: 0, fontSize: 14 }}>Serve un mese di storico settimanale: i numeri si leggono ogni settimana da ottobre, la classifica compare da novembre.</p>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {moving.map((c) => (
                <li key={c.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 72px 56px", alignItems: "center", gap: 14, padding: "13px 0", borderBottom: `1px solid ${CP.borderSoft || CP.border}` }}>
                  <span style={{ minWidth: 0 }}>
                    <button onClick={() => onOpen(c)} style={{ ...btnQuiet, padding: 0, minHeight: 0, color: CP.textPrimary, fontWeight: 500 }}>{c.name}</button>
                    <span style={{ color: CP.textMuted, fontSize: 13 }}> · {c.nic || c.g}</span>
                  </span>
                  <Spark hist={profilesBy[c.handles[0]]?.hist} />
                  <span style={{ textAlign: "right" }}><Growth v={c.g4} /></span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="r-percorso" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <H2 id="r-percorso" sub="Dove sono le creator, dalla prima occhiata alla firma.">Il percorso</H2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {stages.map((s) => {
              const n = counts[s] || 0;
              return (
                <div key={s} style={{ display: "grid", gridTemplateColumns: "110px minmax(0,1fr) 56px", alignItems: "center", gap: 12, color: n ? CP.textPrimary : CP.textMuted }}>
                  <span style={{ fontSize: 14 }}>{STAGE_LABEL[s]}</span>
                  <span style={{ height: 6, borderRadius: 3, width: n ? `${Math.max(2, (n / maxStage) * 100)}%` : 2, background: s === "da_valutare" ? alpha(CP.textPrimary, "66") : n ? CP.gold : CP.border }} />
                  <span style={{ textAlign: "right", ...NUM }}>{fmtFull(n)}</span>
                </div>
              );
            })}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: CP.textSecondary, borderTop: `1px solid ${CP.borderSoft || CP.border}`, paddingTop: 12 }}>I contatti si sbloccano col parere dell&apos;avvocato. Fino ad allora il radar serve a scegliere bene.</p>
        </section>
      </div>

      <section aria-labelledby="r-segn" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <H2 id="r-segn" sub="Dall'app o dal Comando rapido dell'iPhone: il radar legge il profilo e la prima storia in evidenza.">Ultime segnalazioni</H2>
          <button style={btn} onClick={onSegnala}>Segnala una creator</button>
        </div>
        {inbox.length === 0 ? (
          <p style={{ color: CP.textSecondary, margin: 0, fontSize: 14 }}>Ancora nessuna segnalazione.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {inbox.slice(0, 6).map((x) => (
              <li key={x.id} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "4px 16px", padding: "11px 0", borderBottom: `1px solid ${CP.borderSoft || CP.border}`, fontSize: 14 }}>
                <span>{x.h ? <button onClick={() => { const c = creators.find((y) => y.handles.includes(x.h)); if (c) onOpen(c); }} style={{ ...btnQuiet, padding: 0, minHeight: 0, color: CP.textPrimary }}>@{x.h}</button> : <span style={{ color: CP.textSecondary }}>{x.text.slice(0, 60)}</span>}
                  <span style={{ color: CP.textMuted, fontSize: 12.5 }}> · {x.by || "—"} · {fmtDate(x.at)}{x.via === "iphone" ? " · iPhone" : ""}</span></span>
                <span style={{ color: x.sig === "forte" && x.status !== "errore" ? CP.gold : x.warn || x.status === "errore" || x.status === "non_trovata" ? CP.attn : x.sig === "debole" ? CP.textPrimary : CP.textSecondary, fontSize: 13 }}>{x.msg}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.canAdmin && <HlReread st={data.hlReread} onReload={onReload} />}

      <footer style={{ display: "flex", flexWrap: "wrap", gap: "6px 28px", fontSize: 13, color: CP.textMuted, borderTop: `1px solid ${CP.borderSoft || CP.border}`, paddingTop: 16 }}>
        <span>{ref.lastCompletedAt ? `Ultimo giro dei numeri: ${fmtDate(ref.lastCompletedAt)}${ref.lastUpdated ? `, ${fmtFull(ref.lastUpdated)} account letti` : ""}` : "Numeri della ricerca di ottobre"}</span>
        <span>{ref.pausedUntil && Date.now() < ref.pausedUntil ? `Giro settimanale in pausa fino al ${fmtDate(ref.pausedUntil)}` : "Giro settimanale attivo"}</span>
        <span>Dati da profili pubblici, ridotti al minimo · nessun contatto prima del parere legale</span>
      </footer>
    </div>
  );
}

function Fig({ v, l }) {
  return (
    <div>
      <div style={{ fontSize: 19, ...NUM }}>{v}</div>
      <div style={{ fontSize: 12.5, color: CP.textMuted }}>{l}</div>
    </div>
  );
}

const usd = (v) => `${(Number(v) || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

/**
 * Rilettura delle prime storie in evidenza (16/10/2026, solo admin): rilegge una volta le creator
 * ancora da valutare senza profilo a pagamento, seguendo anche gli account taggati.
 */
function HlReread({ st, onReload }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const running = st?.status === "in_corso";
  useEffect(() => {
    if (!running || !onReload) return undefined;
    const t = setInterval(() => onReload(), 30000);
    return () => clearInterval(t);
  }, [running, onReload]);
  async function send(action) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/admin/scouting/hl-reread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
      onReload?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  const found = st?.found || {};
  const tally = st?.status ? `${fmtFull(st.done || 0)} di ${fmtFull(st.total || 0)} rilette · ${fmtFull(found.link || 0)} con un link e ${fmtFull(found.tag || 0)} con un tag nella prima storia${found.forte ? ` · ${fmtFull(found.forte)} col profilo a pagamento` : ""} · spesi ${usd(st.spentUsd)} su ${usd(st.capUsd)}` : null;
  const extra = st?.status && (st.gone || st.failed) ? `${st.gone ? `${fmtFull(st.gone)} private o sparite` : ""}${st.gone && st.failed ? " · " : ""}${st.failed ? `${fmtFull(st.failed)} non lette per errore di Instagram` : ""}` : null;
  const head = !st?.status ? "Rileggi le prime storie in evidenza"
    : running ? "Rilettura delle prime storie in evidenza in corso"
    : st.status === "fatta" ? `Rilettura finita il ${fmtDate(st.endedAt)}`
    : st.status === "tetto" ? "Rilettura fermata: raggiunto il tetto di spesa"
    : "Rilettura fermata";
  return (
    <section aria-labelledby="r-hlr" style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${CP.borderSoft || CP.border}`, paddingTop: 18 }}>
      <h3 id="r-hlr" style={{ margin: 0, fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>{head}</h3>
      <p style={{ margin: 0, fontSize: 14, color: CP.textSecondary, maxWidth: 760 }}>
        {!st?.status
          ? "Le creator ancora da valutare e senza profilo a pagamento vengono rilette una volta, seguendo anche gli account taggati nella prima storia in evidenza. Chi ha un link o un tag finisce in Esplora › Indizi da verificare. Circa 2 centesimi a creator, tetto 25 $."
          : tally}
      </p>
      {extra && <p style={{ margin: 0, fontSize: 13, color: CP.textMuted }}>{extra}</p>}
      {st?.lastError && running && <p style={{ margin: 0, fontSize: 13, color: CP.attn }}>Ultimo intoppo: {st.lastError} — il giro riprova da solo.</p>}
      {err && <p role="alert" style={{ margin: 0, fontSize: 13, color: CP.attn }}>{err}</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {running
          ? <button style={btn} disabled={busy} onClick={() => send("stop")}>Ferma</button>
          : st?.status === "fatta"
            ? null
            : <button style={btn} disabled={busy} onClick={() => send("start")}>{st?.status ? "Rileggi quelle rimaste" : "Avvia la rilettura"}</button>}
      </div>
    </section>
  );
}

// Schede di «Da guardare oggi»: entrano una dopo l'altra e si sollevano al passaggio (stile reel).
const RO_CSS = `
.ro-card{animation:roIn .45s cubic-bezier(.2,.7,.2,1) both;transition:transform .18s ease, box-shadow .18s ease}
@media (hover:hover){.ro-card:hover{transform:translateY(-3px);box-shadow:0 10px 28px -14px rgba(0,0,0,.35)}}
@keyframes roIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.ro-card{animation:none;transition:none}.ro-card:hover{transform:none}}
`;
