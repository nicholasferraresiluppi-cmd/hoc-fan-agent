"use client";
// Radar creator — vista "Oggi": il lavoro della mattina. Tre creator da guardare (scelte da
// fatti del radar: profilo a pagamento, format, crescita, novità), chi si muove, il percorso,
// le ultime segnalazioni e da dove vengono i dati.
import { useEffect, useMemo, useState } from "react";
import { CP, alpha } from "@/lib/brand";
import { pickToday, movers, whyLines, reviewQueue } from "@/lib/scouting-core";
import { SERIF, NUM, fmtN, fmtFull, fmtDate, btn, btnPrimary, btnQuiet, Initials, LinkChip, Growth, Spark, H2, BigNum, STAGE_LABEL } from "./radar-ui";


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
      {onValuta && toReview > 0 && (
        <button onClick={onValuta} style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "16px 18px", borderRadius: 14, border: `1px solid ${alpha(CP.gold, "77")}`, background: alpha(CP.gold, "10") }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ ...SERIF, fontSize: 24, lineHeight: 1.1 }}>{fmtFull(toReview)} creator col profilo a pagamento da valutare</span>
            <span style={{ fontSize: 13.5, color: CP.textSecondary }}>Una alla volta: scarta, vista o interessante.</span>
          </span>
          <span style={{ fontSize: 15, color: CP.gold, whiteSpace: "nowrap" }}>Inizia →</span>
        </button>
      )}
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
          <Segnalazioni rows={inboxRows(inbox, 10)} creators={creators} onOpen={onOpen} />
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

// ---------- Ultime segnalazioni: una riga per creator, esito in un'etichetta corta ----------

const handleOf = (x) => x.h || (String(x.text || "").match(/instagram\.com\/(?!reel\/|p\/)([A-Za-z0-9._]{1,30})/)?.[1]?.toLowerCase()) || null;

// Segnalazioni ripetute della stessa creator: resta la più recente, con quante volte.
function inboxRows(inbox, max) {
  const out = []; const at = new Map();
  for (const x of inbox) {
    const h = handleOf(x);
    if (h && at.has(h)) { out[at.get(h)].n++; continue; }
    if (h) at.set(h, out.length);
    out.push({ x, h, n: 1 });
    if (out.length >= max) break;
  }
  return out;
}

function inboxVerdict(x) {
  if (x.status === "in_lettura") return { key: "lettura", label: "In lettura", tone: "muted" };
  if (x.status === "errore" || x.status === "non_trovata" || x.status === "non_instagram") return { key: "rifare", label: "Non letta", tone: "attn" };
  if (x.status === "cancellata") return { key: "vuote", label: "Tolta dal radar", tone: "muted" };
  if (x.warn) return { key: "rifare", label: "Storia non letta", tone: "attn" };
  if (x.sig === "forte") return { key: "aprire", label: "Profilo a pagamento", tone: "gold", rank: 0 };
  if (x.sig === "debole") return { key: "aprire", label: "Da guardare", tone: "primary", rank: 1 };
  return { key: "vuote", label: "Nessun link", tone: "muted" };
}

// Il messaggio senza la parte che ripete il nome («@x aggiunta al radar · …»).
function inboxDetail(x, h) {
  if (x.status === "in_lettura") return null;
  let m = String(x.msg || "").replace(/\.$/, "");
  m = m.replace(/^@\S+ (aggiunta al radar|era già nel radar: aggiunta la segnalazione)( · )?/, (_, w) => (w.startsWith("era") ? "Già nel radar · " : ""));
  m = m.replace(/^da guardare: /, "").replace(/ · da guardare: /, " · ");
  m = m.replace(/prima storia in evidenza NON letta \(Instagram non ha risposto\): segnalala di nuovo per riprovare/, "Instagram non ha risposto sulla prima storia in evidenza");
  m = m.replace(/(^|· )nessun link né tag, in bio o nella prima storia in evidenza$/, "");
  m = m.replace(/ · $/, "").trim();
  return m ? m[0].toUpperCase() + m.slice(1) : null;
}

const shortBy = (by) => (by ? String(by).replace(/\s*\(fonte (\w+)\)/i, " · $1").split(" ").slice(0, 3).join(" ") : null);

const toneColor = (t) => (t === "gold" ? CP.gold : t === "attn" ? CP.attn : t === "primary" ? CP.textPrimary : CP.textMuted);

/**
 * Le segnalazioni divise per cosa chiedono: prima quelle da aprire (profilo a pagamento,
 * poi indizi), poi quelle da rifare, e in fondo in una riga sola quelle senza nulla.
 */
function Segnalazioni({ rows, creators, onOpen }) {
  const items = rows.map((r) => ({ ...r, v: inboxVerdict(r.x), c: r.h ? creators.find((y) => y.handles.includes(r.h)) : null }));
  const reading = items.filter((r) => r.v.key === "lettura");
  const open = items.filter((r) => r.v.key === "aprire").sort((a, b) => a.v.rank - b.v.rank);
  const redo = items.filter((r) => r.v.key === "rifare");
  const empty = items.filter((r) => r.v.key === "vuote");
  const counts = [
    open.filter((r) => r.v.rank === 0).length && `${open.filter((r) => r.v.rank === 0).length} col profilo a pagamento`,
    open.filter((r) => r.v.rank === 1).length && `${open.filter((r) => r.v.rank === 1).length} da guardare`,
    empty.length && `${empty.length} senza link`,
  ].filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <style>{`@keyframes ro-pulse{0%,100%{opacity:.35}50%{opacity:1}}.ro-sg-row:hover{background:${CP.hover || "transparent"}}`}</style>
      {counts.length > 0 && <p style={{ margin: 0, fontSize: 13.5, color: CP.textSecondary }}>{counts.join(" · ")}</p>}

      {reading.map(({ x, h }) => (
        <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: CP.textSecondary }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: CP.gold, animation: "ro-pulse 1.4s ease-in-out infinite" }} />
          <span>Sto leggendo <span style={{ color: CP.textPrimary }}>{h ? `@${h}` : "un link"}</span>…</span>
        </div>
      ))}

      {open.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: `1px solid ${CP.borderSoft || CP.border}` }}>
          {open.map((r) => <SegRow key={r.x.id} {...r} onOpen={onOpen} />)}
        </ul>
      )}

      {redo.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: CP.attn }}>Da segnalare di nuovo</span>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: `1px solid ${CP.borderSoft || CP.border}` }}>
            {redo.map((r) => <SegRow key={r.x.id} {...r} onOpen={onOpen} />)}
          </ul>
        </div>
      )}

      {empty.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13.5, color: CP.textMuted }}>
          <span>Senza link né tag:</span>
          {empty.map(({ x, h, c, n }) => (
            <button key={x.id} disabled={!c} onClick={() => c && onOpen(c)} style={{ all: "unset", cursor: c ? "pointer" : "default", padding: "4px 10px", borderRadius: 999, border: `1px solid ${CP.borderSoft || CP.border}`, color: CP.textSecondary }}>
              @{h}{n > 1 ? ` ×${n}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SegRow({ x, h, n, c, v, onOpen }) {
  const detail = inboxDetail(x, h);
  const stats = c ? [c.fol ? `${fmtN(c.fol)} follower` : null, c.medv ? `${fmtN(c.medv)} view a reel` : null].filter(Boolean).join(" · ") : "";
  const color = toneColor(v.tone);
  const inner = (
    <>
      <Initials name={h || "?"} size={44} pic={c?.pic} gold={v.tone === "gold"} />
      <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h ? `@${h}` : "Un link"}</span>
          <span style={{ marginLeft: "auto", flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />{v.label}
          </span>
        </span>
        {stats && <span style={{ fontSize: 13, color: CP.textSecondary, ...NUM }}>{stats}</span>}
        {detail && <span style={{ fontSize: 13.5, color: CP.textPrimary, lineHeight: 1.45, paddingLeft: 10, borderLeft: `2px solid ${alpha(color, "66")}` }}>{detail}</span>}
        <span style={{ fontSize: 12, color: CP.textMuted }}>{[shortBy(x.by), fmtDate(x.at), x.via === "iphone" ? "iPhone" : null, n > 1 ? `segnalata ${n} volte` : null].filter(Boolean).join(" · ")}</span>
      </span>
      {c && <span aria-hidden="true" style={{ alignSelf: "center", fontSize: 20, color: CP.textMuted }}>›</span>}
    </>
  );
  const st = { display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 4px", width: "100%", boxSizing: "border-box", textAlign: "left" };
  return (
    <li style={{ borderBottom: `1px solid ${CP.borderSoft || CP.border}` }}>
      {c ? <button className="ro-sg-row" onClick={() => onOpen(c)} style={{ all: "unset", cursor: "pointer", ...st }}>{inner}</button> : <div style={st}>{inner}</div>}
    </li>
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
