"use client";
// Radar creator — vista "Oggi": il lavoro della mattina. Tre creator da guardare (scelte da
// fatti del radar: profilo a pagamento, format, crescita, novità), chi si muove, il percorso,
// le ultime segnalazioni e da dove vengono i dati.
import { useMemo } from "react";
import { CP, alpha } from "@/lib/brand";
import { pickToday, movers, whyLines } from "@/lib/scouting-core";
import { SERIF, NUM, fmtFull, fmtDate, btn, btnPrimary, btnQuiet, Initials, LinkChip, Growth, Spark, H2, BigNum, STAGE_LABEL } from "./radar-ui";


export default function RadarOggi({ newCut, data, creators, profilesBy, onOpen, act, busy, inbox, onSegnala }) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>
      <section aria-label="Il radar in numeri" className="ro-nums" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "24px 40px", borderTop: `1px solid ${CP.border}`, borderBottom: `1px solid ${CP.border}`, padding: "26px 0" }}>
        <BigNum value={fmtFull(creators.length)} label="creator italiane seguite" />
        <BigNum value={fmtFull(paid)} label="con un profilo a pagamento" gold />
        <BigNum value={fmtFull(fmt)} label="con un format che si ripete" />
        <BigNum value={fmtFull(contacted)} label="contattate · in attesa del parere legale" />
      </section>

      <section aria-labelledby="r-oggi" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <H2 id="r-oggi" sub="Profilo a pagamento, qualcosa di riconoscibile, ancora da valutare. Cambiano appena le valuti.">Da guardare oggi</H2>
          {newWeek > 0 && <span style={{ fontSize: 14, color: CP.textSecondary }}>{newWeek} nuove con profilo a pagamento questa settimana</span>}
        </div>
        {today.length === 0 ? (
          <p style={{ color: CP.textSecondary, margin: 0 }}>Nessuna creator da valutare con un profilo a pagamento: le hai già guardate tutte.</p>
        ) : (
          <div className="ro-today" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 36 }}>
            {today.map((c, i) => {
              const why = whyLines(c, { newCut });
              return (
                <article key={c.id} style={{ display: "flex", flexDirection: "column", gap: 16, borderTop: `1px solid ${i === 0 ? CP.gold : CP.borderStrong || CP.border}`, paddingTop: 20 }}>
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
                    <button style={btn} disabled={busy} onClick={() => act({ action: "stage", id: c.id, stage: "interessante" }, `${c.name}: interessante.`)}>Interessante</button>
                    <button style={btnQuiet} disabled={busy} onClick={() => act({ action: "stage", id: c.id, stage: "scartata" }, `${c.name}: scartata.`)}>Scarta</button>
                  </div>
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
                <span style={{ color: x.status === "nuova" && x.sig === "forte" ? CP.gold : x.status === "errore" || x.status === "non_trovata" ? CP.attn : CP.textSecondary, fontSize: 13 }}>{x.msg}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
