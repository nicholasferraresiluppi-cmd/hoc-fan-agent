"use client";

// Game film operatore — drill-down formativo del profilo-segnali (SEED).
// Vinte da imitare · perse da correggere · la mossa migliore dalla chat gemella.
// I transcript portano testo fan (pseudonimizzato): superficie admin/coach.
//
// Redesign 26/09/2026 (pannello tester SM/TL/UX): la riga di conteggi in alto
// non diceva cosa fare → numero principale = momenti nuovi da giudicare (è il
// lavoro del coach su questa pagina), vinte/perse accanto; card neutre (il
// verde/rosso resta solo sull'importo); filtri della libreria come FilterChip;
// colonne che non sforano più su telefono (minmax 420px → min(420px, 100%)).

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, SectionTitle, FilterChip, Notice, card, NUM } from "@/components/ds";
import { FILM_THRESHOLDS } from "@/lib/game-film-core";
import { LEGIT_REASONS } from "@/lib/film-library-core";

const T = FILM_THRESHOLDS; // soglie dal core versionato: il copy non va mai fuori sync

const STATUS_UI = {
  nuovo: { label: "nuovo", color: CP.accent },
  visto: { label: "visto", color: CP.textMuted },
  legittima: { label: "legittima", color: CP.accentBlue },
  da_coaching: { label: "da coaching", color: CP.accentRed },
};

const fetcher = (url) =>
  fetch(url).then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "Errore")))));

const usd = (v) => `$${Math.round(Number(v) || 0).toLocaleString("it-IT")}`;
const fmtDay = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};
const fmtTime = (ms) =>
  new Date(ms).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

const REASON = {
  mai_proposto: { label: "mai proposto un PPV", note: "Fan ingaggiato, nessuna offerta: la vendita non è mai partita." },
  gioco_timido: { label: "gioco timido", note: `Solo offerte piccole (< $${T.LOSS_LOW_PPV}): tanta relazione, poca proposta.` },
};

function Bubble({ m }) {
  const op = m.who === "op";
  return (
    <div style={{ display: "flex", justifyContent: op ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "78%",
          padding: "7px 11px",
          borderRadius: 10,
          fontSize: 12.5,
          lineHeight: 1.45,
          background: op ? CP.accentSoft : CP.bgSunken,
          border: `1px solid ${op ? CP.accentDim : CP.borderSoft}`,
          color: CP.textPrimary,
        }}
      >
        {m.price > 0 && (
          <span
            style={{
              display: "inline-block",
              marginRight: 7,
              padding: "1px 7px",
              borderRadius: 999,
              fontSize: 11,
              background: alpha(CP.accentGreen, "22"),
              border: `1px solid ${alpha(CP.accentGreen, "55")}`,
              color: CP.accentGreen,
              whiteSpace: "nowrap",
            }}
          >
            PPV {usd(m.price)}
          </span>
        )}
        {m.text || <span style={{ color: CP.textMuted }}>(media senza testo)</span>}
        <span style={{ marginLeft: 8, fontSize: 11, color: CP.textMuted, whiteSpace: "nowrap", ...NUM }}>{fmtTime(m.at)}</span>
      </div>
    </div>
  );
}

function Transcript({ messages, truncated }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, maxHeight: 420, overflowY: "auto", padding: "4px 2px" }}>
      {truncated && <div style={{ fontSize: 12, color: CP.textMuted, textAlign: "center" }}>… conversazione accorciata: mostrata la parte decisiva …</div>}
      {messages.map((m, i) => (
        <Bubble key={`${m.at}-${i}`} m={m} />
      ))}
    </div>
  );
}

function Ladder({ prices }) {
  if (!prices?.length) return <span style={{ color: CP.textMuted }}>nessun PPV proposto</span>;
  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
      {prices.map((p, i) => (
        <span key={i} style={{ fontSize: 12, padding: "1px 7px", borderRadius: 999, background: CP.surfaceAlt, border: `1px solid ${CP.borderSoft}`, color: CP.textSecondary, ...NUM }}>
          ${p}
        </span>
      ))}
    </span>
  );
}

// Barra del giudizio del coach: persiste sull'id stabile (registro, non nota
// volatile). "Il film propone, il coach decide" — qui decide.
function JudgmentBar({ m, operator, onJudged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [showReasons, setShowReasons] = useState(false);
  const [path, setPath] = useState(null);
  const st = m.judgment?.status || "nuovo";
  const s = STATUS_UI[st] || STATUS_UI.nuovo;

  async function judge(status, reason) {
    // "altro" senza nota = registro muto (l'anti-pattern che la tassonomia
    // chiusa vuole evitare): la nota qui è obbligatoria.
    let note = null;
    if (reason === "altro") {
      note = (window.prompt("Motivo (obbligatorio per 'altro'):") || "").trim();
      if (!note) return;
    }
    setBusy(true);
    setErr(null);
    setShowReasons(false);
    try {
      const res = await fetch("/api/admin/operator-film/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator, key: m.key, status, reason, note }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Giudizio fallito");
      if (j.path) setPath(j.path);
      onJudged?.(m.key, j.moment?.judgment || { status, reason });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const btn = { background: CP.surface, color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "5px 11px", fontSize: 12, cursor: busy ? "wait" : "pointer", fontFamily: FONTS.body };
  return (
    <div style={{ marginTop: 9 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span
          title={m.judgment?.note || undefined}
          style={{ fontSize: 12, color: s.color, background: alpha(s.color, "1c"), border: `1px solid ${alpha(s.color, "55")}`, padding: "2px 9px", borderRadius: 999 }}
        >
          {st === "legittima" && m.judgment?.reason ? `legittima · ${(LEGIT_REASONS[m.judgment.reason] || m.judgment.reason).toLowerCase().slice(0, 34)}` : s.label}
        </span>
        {st === "nuovo" && (
          <button style={btn} disabled={busy} onClick={() => judge("visto")}>
            Visto
          </button>
        )}
        {m.kind === "loss" && st !== "legittima" && (
          <button style={btn} disabled={busy} onClick={() => setShowReasons(!showReasons)}>
            Persa legittima…
          </button>
        )}
        {st !== "da_coaching" && (
          <button style={{ ...btn, color: CP.textPrimary }} disabled={busy} onClick={() => judge("da_coaching")}>
            Da coaching
          </button>
        )}
        {m.judgment?.at && <span style={{ fontSize: 12, color: CP.textMuted }}>{new Date(m.judgment.at).toLocaleDateString("it-IT")}</span>}
      </div>
      {showReasons && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
          {Object.entries(LEGIT_REASONS).map(([k, label]) => (
            <button key={k} style={btn} disabled={busy} title={label} onClick={() => judge("legittima", k)}>
              {label.length > 42 ? label.slice(0, 40) + "…" : label}
            </button>
          ))}
        </div>
      )}
      {path?.scenarios?.length > 0 && (
        <div style={{ marginTop: 7, fontSize: 12, color: CP.textSecondary }}>
          Percorso suggerito: {path.scenarios.map((sc) => sc.title).join(" · ")}{" "}
          <Link href="/" style={{ color: CP.accentSoftText, textDecoration: "none" }}>
            apri Academy →
          </Link>
        </div>
      )}
      {err && <div style={{ marginTop: 6, fontSize: 12, color: CP.accentRed }}>{err}</div>}
    </div>
  );
}

function MomentCard({ m, tone, twin, onOpenTwin, operator, onJudged }) {
  const [open, setOpen] = useState(false);
  const reason = m.reason ? REASON[m.reason] : null;
  return (
    <div style={{ ...card, padding: "13px 15px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 9, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary }}>{m.fan}</span>
          {tone === "win" ? (
            <span style={{ fontSize: 13, color: CP.accentGreen, fontWeight: 500, ...NUM }}>{usd(m.bought)} chiusi</span>
          ) : (
            <span style={{ fontSize: 12.5, color: CP.accentRed }} title={reason?.note}>
              $0 — {reason?.label || "occasione scivolata"}
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>
          {fmtDay(m.day)} · il fan ha scritto {m.fan_msgs} volte · {m.op_msgs} risposte
          {m.span_min > 0 ? ` · ${m.span_min} min` : ""}
        </span>
      </div>

      <div style={{ marginTop: 7, fontSize: 12, color: CP.textSecondary, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: CP.textMuted }}>Prezzi PPV proposti:</span> <Ladder prices={m.ppv_ladder} />
        {tone === "win" && m.buys?.length > 1 && <span style={{ color: CP.textMuted }}>· {m.buys.length} acquisti</span>}
      </div>

      {tone === "loss" && (
        <div style={{ marginTop: 9, fontSize: 12.5, color: CP.textSecondary, padding: "8px 11px", background: CP.bgSunken, border: `1px solid ${CP.borderSoft}`, borderRadius: 8 }}>
          <span style={{ color: CP.textMuted }}>Come potevi giocarla — </span>
          {twin ? (
            <>
              {twin.creator_id === m.creator_id ? "stesso creator, ingaggio simile" : "ingaggio simile"}, gestita da manuale con {twin.fan}:{" "}
              <span style={{ color: CP.accentGreen }}>{usd(twin.bought)}</span>, scala{" "}
              {twin.ppv_ladder?.length ? twin.ppv_ladder.map((p) => `$${p}`).join(" → ") : "—"}.
              {twin.creator_id !== m.creator_id && (
                <span
                  title="La vinta comparabile è su un altro creator: contesto e pricing possono differire"
                  style={{ marginLeft: 6, fontSize: 11, padding: "1px 7px", borderRadius: 999, background: alpha(CP.accentBlue, "22"), border: `1px solid ${alpha(CP.accentBlue, "55")}`, color: CP.accentBlue, whiteSpace: "nowrap" }}
                >
                  creator diverso
                </span>
              )}{" "}
              <button onClick={() => onOpenTwin(twin.key)} style={{ background: "none", border: "none", color: CP.accentSoftText, cursor: "pointer", fontSize: 12.5, padding: 0 }}>
                apri la gemella →
              </button>
            </>
          ) : onOpenTwin ? (
            <span style={{ color: CP.textMuted }}>nessuna vinta comparabile nel periodo.</span>
          ) : (
            <span style={{ color: CP.textMuted }}>gemella non calcolata per i momenti d&apos;archivio (aprila dalle colonne sopra se è nel top).</span>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        style={{ marginTop: 10, background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontFamily: FONTS.body }}
      >
        {open ? "Chiudi conversazione" : "Leggi la conversazione"}
      </button>
      {open && <Transcript messages={m.messages} truncated={m.truncated} />}

      {operator && <JudgmentBar m={m} operator={operator} onJudged={onJudged} />}
    </div>
  );
}

// "Tutti i momenti": la libreria completa — la risposta a "come arrivo alle
// altre 22". Filtri per stato; i momenti fuori dal top si aprono on-demand.
function LibrarySection({ library, operator, topKeys, onOpenTop, onJudged }) {
  const [filter, setFilter] = useState(null);
  const [opened, setOpened] = useState({}); // key → card fetchata on-demand
  const [loadingKey, setLoadingKey] = useState(null);
  const [err, setErr] = useState(null);
  if (!library || !library.moments?.length) return null;
  const c = library.counts || {};

  async function openMoment(key) {
    if (loadingKey) return; // un fetch alla volta: niente query BQ doppie
    if (topKeys.has(key)) return onOpenTop(key);
    if (opened[key]) {
      setOpened((o) => ({ ...o, [key]: null }));
      return;
    }
    setLoadingKey(key);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/operator-film/moment?operator=${encodeURIComponent(operator)}&key=${encodeURIComponent(key)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Transcript non disponibile");
      setOpened((o) => ({ ...o, [key]: j.moment }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoadingKey(null);
    }
  }

  const shown = library.moments.filter((m) => !filter || (m.judgment?.status || "nuovo") === filter);
  // il colore di stato resta sul badge della riga; il filtro usa il chip standard
  const chip = (key, label, n) => (
    <FilterChip key={key || "all"} label={`${label} (${n})`} active={filter === key} onClick={() => setFilter(filter === key ? null : key)} />
  );

  return (
    <section style={{ marginTop: 28 }}>
      <SectionTitle>Tutti i momenti in libreria ({c.total})</SectionTitle>
      <p style={{ fontSize: 13, color: CP.textMuted, margin: "-4px 0 10px", lineHeight: 1.5 }}>
        La libreria cresce a ogni estrazione e i tuoi giudizi restano. I momenti già mostrati sopra si raggiungono con un clic; gli altri si
        caricano quando li apri.
      </p>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
        {chip("nuovo", "Nuovi da giudicare", c.nuovi || 0)}
        {chip("visto", "Visti", c.visti || 0)}
        {chip("legittima", "Perse legittime", c.legittime || 0)}
        {chip("da_coaching", "Da coaching", c.da_coaching || 0)}
      </div>
      {err && <div style={{ fontSize: 12, color: CP.accentRed, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {shown.map((m) => {
          const st = STATUS_UI[m.judgment?.status || "nuovo"];
          const openedCard = opened[m.key];
          return (
            <div key={m.key}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", padding: "8px 12px", background: CP.surface, border: `1px solid ${CP.borderSoft}`, borderRadius: 8, fontSize: 13, ...NUM }}>
                <span style={{ color: m.kind === "win" ? CP.accentGreen : CP.accentRed, minWidth: 42 }}>{m.kind === "win" ? "vinta" : "persa"}</span>
                <span style={{ color: CP.textMuted }}>{fmtDay(m.day)}</span>
                <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{m.fan}</span>
                <span style={{ color: CP.textMuted }}>fan {m.fan_msgs}×</span>
                {m.kind === "win" ? (
                  <span style={{ color: CP.accentGreen }}>{usd(m.bought)}</span>
                ) : (
                  <span style={{ color: CP.textSecondary }}>{REASON[m.reason]?.label || "—"}</span>
                )}
                <span style={{ fontSize: 12, color: st.color, background: alpha(st.color, "1c"), border: `1px solid ${alpha(st.color, "55")}`, padding: "1px 8px", borderRadius: 999 }}>{st.label}</span>
                <button
                  onClick={() => openMoment(m.key)}
                  style={{ marginLeft: "auto", background: "none", border: "none", color: CP.accentSoftText, cursor: "pointer", fontSize: 13, fontFamily: FONTS.body }}
                >
                  {loadingKey === m.key ? "carico…" : topKeys.has(m.key) ? "vai alla card ↑" : openedCard ? "chiudi" : "apri"}
                </button>
              </div>
              {openedCard && (
                <div style={{ marginTop: 6 }}>
                  <MomentCard m={{ ...openedCard, judgment: m.judgment || openedCard.judgment }} tone={openedCard.kind === "win" ? "win" : "loss"} operator={operator} onJudged={onJudged} />
                </div>
              )}
            </div>
          );
        })}
        {shown.length === 0 && <div style={{ fontSize: 13, color: CP.textMuted }}>Nessun momento con questo stato.</div>}
      </div>
    </section>
  );
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // percent-encoding malformato: usa il grezzo (pattern di [employee])
  }
}

export default function OperatorFilmPage() {
  const params = useParams();
  const router = useRouter();
  const operator = safeDecode(String(params?.operator || ""));
  const { data, error, isLoading, mutate } = useSWR(
    operator ? `/api/admin/operator-film?operator=${encodeURIComponent(operator)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [busy, setBusy] = useState(false);
  const [refreshErr, setRefreshErr] = useState(null);
  const [highlight, setHighlight] = useState(null);

  async function refresh() {
    setBusy(true);
    setRefreshErr(null);
    try {
      const res = await fetch(`/api/admin/operator-film?operator=${encodeURIComponent(operator)}`, { method: "POST" });
      const fresh = await res.json();
      if (res.ok) mutate(fresh, { revalidate: false });
      else setRefreshErr(fresh.error || "Ricalcolo fallito");
    } catch (e) {
      setRefreshErr(e.message || "Ricalcolo fallito");
    } finally {
      setBusy(false);
    }
  }

  const winByKey = useMemo(() => new Map((data?.wins || []).map((w) => [w.key, w])), [data]);
  // key dei momenti già montati nel payload (top): dalla libreria si scrolla, non si rifetcha
  const topKeys = useMemo(() => new Set([...(data?.wins || []), ...(data?.losses || [])].map((m) => m.key)), [data]);

  function openTwin(key) {
    setHighlight(key);
    const el = document.getElementById(`moment-${key}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // dopo un giudizio: revalida (GET in cache 6h → veloce; attachLibrary porta
  // giudizi e conteggi freschi su card e coda)
  const onJudged = () => mutate();

  const btnTop = { background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
  const col = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 18, alignItems: "start" };

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Training" }, { label: "Profilo operatore", href: "/admin/operator-signals" }, { label: operator }]}
        title={`Game film: ${operator}`}
        subtitle="Le vendite riuscite da studiare e le occasioni scivolate da correggere, dalle sue conversazioni reali. Ogni occasione persa è accostata a una vendita riuscita simile dello stesso operatore: il 'come potevi giocarla' viene dal suo lavoro, non dalla teoria. Fan sotto pseudonimo. Materiale di coaching, non score."
        actions={
          <>
            <button onClick={() => router.push("/admin/operator-signals")} style={btnTop}>
              ← Profili
            </button>
            <button onClick={refresh} disabled={busy} style={{ ...btnTop, cursor: busy ? "wait" : "pointer" }}>
              {busy ? "Ricalcolo…" : "Ricalcola"}
            </button>
          </>
        }
      />

      {refreshErr && <Notice danger>Ricalcolo fallito: {refreshErr}.</Notice>}

      {error ? (
        <Notice danger>Non riesco a montare il film: {error.message}.</Notice>
      ) : isLoading || !data ? (
        <div style={{ color: CP.textMuted, fontSize: 14 }}>Monto il film dalle conversazioni reali… (la prima volta richiede qualche secondo)</div>
      ) : (
        <>
          <HeroMetric
            label="Momenti nuovi da giudicare"
            value={data.library?.counts?.nuovi ?? 0}
            compare={data.library?.counts?.nuovi > 0 ? "leggi la conversazione, poi segna: visto, persa legittima o da coaching" : "sei in pari: nessun momento nuovo"}
            hint={`${data.single_shifts} turni da solo · ${data.conversations?.toLocaleString("it-IT")} conversazioni analizzate`}
          >
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Metric label="Vendite riuscite" value={data.totals?.wins ?? 0} note={`il fan ha speso almeno $${T.WIN_MIN_BOUGHT}`} />
              <Metric label="Occasioni scivolate" value={data.totals?.losses ?? 0} note="fan coinvolto, uscito a $0" />
            </div>
          </HeroMetric>

          {data.totals?.wins === 0 && data.totals?.losses === 0 ? (
            <Notice>
              Nessun momento rilevante nel periodo: servono turni con un solo operatore in chat e conversazioni sostanziose. I turni in coppia non
              entrano (non si sa con certezza chi ha scritto): è il limite dichiarato del film.
            </Notice>
          ) : (
            <div style={col}>
              <section>
                <SectionTitle aside={data.wins.length < (data.totals?.wins || 0) ? `prime ${data.wins.length} di ${data.totals.wins}` : null}>Vendite riuscite da studiare</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.wins.map((m) => (
                    <div key={m.key} id={`moment-${m.key}`} style={highlight === m.key ? { outline: `2px solid ${CP.accent}`, borderRadius: 12 } : undefined}>
                      <MomentCard m={m} tone="win" operator={operator} onJudged={onJudged} />
                    </div>
                  ))}
                  {data.wins.length === 0 && <div style={{ fontSize: 13, color: CP.textMuted }}>Nessuna vendita da almeno ${T.WIN_MIN_BOUGHT} nel periodo.</div>}
                </div>
              </section>

              <section>
                <SectionTitle aside={data.losses.length < (data.totals?.losses || 0) ? `prime ${data.losses.length} di ${data.totals.losses}` : null}>Occasioni scivolate</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.losses.map((m) => (
                    <div key={m.key} id={`moment-${m.key}`} style={highlight === m.key ? { outline: `2px solid ${CP.accent}`, borderRadius: 12 } : undefined}>
                      <MomentCard m={m} tone="loss" twin={m.twin_key ? winByKey.get(m.twin_key) : null} onOpenTwin={openTwin} operator={operator} onJudged={onJudged} />
                    </div>
                  ))}
                  {data.losses.length === 0 && <div style={{ fontSize: 13, color: CP.textMuted }}>Nessuna occasione scivolata: tutti i fan coinvolti hanno ricevuto un&apos;offerta vera.</div>}
                </div>
              </section>
            </div>
          )}

          <LibrarySection library={data.library} operator={operator} topKeys={topKeys} onOpenTop={openTwin} onJudged={onJudged} />

          <div style={{ marginTop: 18, fontSize: 12, color: CP.textMuted, lineHeight: 1.6 }}>
            <strong style={{ fontWeight: 500, color: CP.textSecondary }}>Vinta</strong>: il fan ha comprato ≥ ${T.WIN_MIN_BOUGHT} nella finestra del turno (+2h di coda) — attribuzione indicativa, non
            contabile; un acquisto a cavallo di due turni ravvicinati (&lt; 2h) può comparire in entrambi.{" "}
            <strong style={{ fontWeight: 500, color: CP.textSecondary }}>Persa</strong>: fan ingaggiato (≥ {T.LOSS_MIN_FAN_MSGS} messaggi) uscito a $0 con gioco PPV assente o timido (mai un&apos;offerta ≥ $
            {T.LOSS_LOW_PPV}); chi ha giocato offerte vere senza chiudere NON è contato come persa. <strong style={{ fontWeight: 500, color: CP.textSecondary }}>Una persa può avere ragioni legittime</strong>{" "}
            (richieste fuori policy, rischio refund, fan problematico): leggi la conversazione prima di farne coaching — il film propone, il coach decide.
            Solo turni a operatore singolo. Transcript con fan pseudonimizzati, visibili solo qui (superficie admin). Metodologia {data.version}. Aggiornato{" "}
            {data.generated_at ? new Date(data.generated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "—"}.{data.cached ? " (cache)" : ""}{" "}
            <Link href="/admin/academy-tapes" style={{ color: CP.accentSoftText, textDecoration: "none" }}>
              Per pubblicare una vinta agli operatori passa dalla curatela game tape →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
