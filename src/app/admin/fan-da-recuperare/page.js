"use client";
/**
 * Fan da recuperare (10/10/2026): ogni mattina i fan che spendevano bene e si sono fermati, con il
 * perché e una bozza di ripresa PERSONALE scritta dall'AI dalle loro ultime chat (lib/recupero*).
 * La lista non scrive ai fan: propone. Chi la lavora segna a chi ha scritto, e dopo 7 giorni la
 * pagina mostra chi ha ricomprato (contattati contro non contattati).
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Copy, Check, Undo2, HeartHandshake } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, FilterChip, Notice, card } from "@/components/ds";
import VetroScope, { useVetro, VetroSwitch, useInVetro } from "@/components/VetroScope";
import { GoalRing, RankBars, MixBar } from "@/components/VetroCharts";

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Errore");
  return j;
};
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString("it-IT", { useGrouping: "always" })}`;
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const ago = (d) => (d == null ? "mai negli ultimi 60 giorni" : d === 0 ? "oggi" : d === 1 ? "ieri" : `${d} giorni fa`);
const dayLabel = (s) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : "");

export default function FanDaRecuperarePage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/recupero", fetcher, { revalidateOnFocus: false });
  const [who, setWho] = useState(null); // persona scelta
  const [show, setShow] = useState("todo"); // todo | done | all
  const [vetro, setVetro] = useVetro();

  const list = data?.list || [];
  const states = data?.states || {};
  const all = useMemo(() => list.flatMap((g) => g.fans), [list]);
  const done = all.filter((f) => states[f.key]);
  const value = all.reduce((s, f) => s + f.spent60, 0);

  const mark = async (key, status) => {
    mutate({ ...data, states: { ...states, [key]: status ? { status, at: new Date().toISOString() } : null } }, false);
    const r = await fetch("/api/admin/recupero", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, status }) });
    if (!r.ok) mutate();
  };

  const groups = list
    .filter((g) => !who || g.person === who)
    .map((g) => ({ ...g, fans: g.fans.filter((f) => (show === "all" ? true : show === "done" ? states[f.key] : !states[f.key])) }))
    .filter((g) => g.fans.length);

  return (
    <VetroScope on={vetro}>
    <div style={{ display: "grid", gap: 20, maxWidth: 1600, margin: "0 auto", padding: "8px 0 40px" }}>
      <PageHead crumbs={[{ label: "Performance" }]} title="Fan da recuperare"
        subtitle="Chi spendeva bene e si è fermato. Scrivigli una cosa sua, non un saluto."
        actions={<VetroSwitch on={vetro} set={setVetro} />} />

      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && <div style={{ ...card, padding: 24, color: CP.textMuted, fontSize: 14 }}>Carico la lista…</div>}
      {data?.empty && (
        <Notice>
          La lista si prepara di notte: la prima arriva domattina.
          {data.job?.status === "in_corso" ? " (In preparazione adesso.)" : ""}
        </Notice>
      )}

      {data && !data.empty && (
        <>
          <div style={{ fontSize: 15, color: CP.textSecondary, lineHeight: 1.6 }}>
            Lista di <span style={{ color: CP.textPrimary }}>{dayLabel(data.day)}</span>:{" "}
            <span style={{ color: CP.textPrimary }}>{all.length} fan</span> in {list.length} creator, che negli ultimi 60 giorni avevano speso{" "}
            <span style={{ color: CP.textPrimary }}>{money(value)}</span>. Lavorati {done.length}.
          </div>

          {vetro ? <VetroTop list={list} states={states} all={all} done={done} outcome={data.outcome} who={who} setWho={setWho} /> : <Outcome o={data.outcome} />}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <FilterChip label="Da fare" active={show === "todo"} onClick={() => setShow("todo")} />
            <FilterChip label={`Fatti (${done.length})`} active={show === "done"} onClick={() => setShow("done")} />
            <FilterChip label="Tutti" active={show === "all"} onClick={() => setShow("all")} />
            <span style={{ width: 1, height: 22, background: CP.border, margin: "0 4px" }} />
            <FilterChip label="Tutte le creator" active={!who} onClick={() => setWho(null)} />
            {list.map((g) => <FilterChip key={g.person} label={`${g.person} (${g.fans.filter((f) => !states[f.key]).length})`} active={who === g.person} onClick={() => setWho(g.person)} />)}
          </div>

          {!groups.length && <div style={{ ...card, padding: 24, color: CP.textMuted, fontSize: 14 }}>{show === "todo" ? "Fatto tutto qui. Domattina arriva la lista nuova." : "Niente da mostrare."}</div>}

          {groups.map((g) => (
            <section key={g.person} style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: CP.textPrimary }}>{g.person}</h2>
                <span style={{ fontSize: 13, color: CP.textMuted }}>{g.fans.length} fan · {money(g.fans.reduce((s, f) => s + f.spent60, 0))} in 60 giorni</span>
                {g.ai_ok === false && <span style={{ fontSize: 12, color: CP.accentRed }}>l&apos;AI non ha risposto per questa creator: solo i numeri</span>}
              </div>
              {g.fans.map((f) => <FanCard key={f.key} f={f} st={states[f.key]} onMark={(s) => mark(f.key, s)} />)}
            </section>
          ))}

          <div style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.6 }}>
            In lista: chi ha speso almeno $100 negli ultimi 60 giorni e non compra da 7-45 giorni, i 12 che valevano di più per creator. Chi segni non torna per 14 giorni.
            Il warehouse non dice se il fan è ancora abbonato: se il messaggio non parte, segna «Non serve». Le chat arrivano fino alla mattina di ieri.
            Perché e bozza sono dell&apos;AI (Sonnet 5) e sono controllate dal codice (niente sensi di colpa, prezzi, urgenza): rileggile sempre, le mandi tu.
          </div>
        </>
      )}
    </div>
    </VetroScope>
  );
}

// Stile vetro (29/10/2026): la domanda della pagina è «quanto c'è da lavorare oggi, dove, e funziona?».
// Quanti ne hai lavorati (anello), dove c'è più da recuperare (classifica per creator dei fan ancora da
// fare, clic = filtro), da quanto si sono fermati (prima i più freschi, più facili da riprendere) e il
// confronto contattati / non contattati. Stessi numeri della pagina, nessuna richiesta nuova.
const STOP_BUCKETS = [
  { label: "7-14 gg", max: 14, color: "var(--vt-c0)" },
  { label: "15-30 gg", max: 30, color: "var(--vt-c1)" },
  { label: "Oltre 30 gg", max: Infinity, color: "var(--vt-c2)" },
];
const H2 = { margin: 0, fontSize: 15, fontWeight: 500, color: CP.textPrimary };
function VetroTop({ list, states, all, done, outcome, who, setWho }) {
  const todo = all.filter((f) => !states[f.key]);
  const rate = all.length ? done.length / all.length : 0;
  const byCreator = list
    .map((g) => {
      const left = g.fans.filter((f) => !states[f.key]);
      return { label: g.person, value: left.reduce((s, f) => s + f.spent60, 0), n: left.length, onClick: () => setWho(who === g.person ? null : g.person) };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.value - a.value);
  const buckets = STOP_BUCKETS.map((b) => ({ ...b, value: 0 }));
  for (const f of todo) (buckets.find((b) => (f.days_since_buy ?? 99) <= b.max) || buckets[2]).value += 1;
  return (
    <div className="vt-row21" style={{ gap: 12 }}>
      <div style={{ display: "grid", gap: 12, minWidth: 0, alignContent: "start" }}>
        <section className="vt-glass" style={{ "--vt-i": 0, borderRadius: 20, padding: "16px 18px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <h2 style={H2}>Dove c&apos;è più da recuperare</h2>
            <span style={{ fontSize: 12.5, color: CP.textMuted }}>speso in 60 giorni dai fan ancora da lavorare · tocca una creator per filtrare</span>
          </div>
          {byCreator.length ? <RankBars items={byCreator} format={money} limit={8} /> : <div style={{ fontSize: 13.5, color: CP.textSecondary }}>Lavorati tutti. Domattina arriva la lista nuova.</div>}
        </section>
        {todo.length > 0 && (
          <section className="vt-glass" style={{ "--vt-i": 1, borderRadius: 20, padding: "16px 18px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <h2 style={H2}>Da quanto hanno smesso di comprare</h2>
              <span style={{ fontSize: 12.5, color: CP.textMuted }}>chi si è fermato da poco si riprende più facilmente</span>
            </div>
            <MixBar items={buckets} format={(v) => `${v} fan`} height={28} />
          </section>
        )}
      </div>
      <div style={{ display: "grid", gap: 12, minWidth: 0, alignContent: "start" }}>
        <GoalRing i={2} pct={rate} tone={todo.length === 0 ? "good" : "near"} size={112} title="Lavorati oggi"
          sub={`${done.length} su ${all.length} fan · ${money(todo.reduce((s, f) => s + f.spent60, 0))} ancora da lavorare`} />
        <section className="vt-glass" style={{ "--vt-i": 3, borderRadius: 20, padding: "16px 18px", display: "grid", gap: 10, minWidth: 0 }}>
          <h2 style={H2}>Funziona?</h2>
          {!outcome?.ready ? (
            <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>Il primo risultato arriva 7 giorni dopo i primi contatti segnati: qui vedrai quanti hanno ricomprato.</div>
          ) : (
            <>
              {[{ label: "Ricontattati", x: outcome.sent, c: CP.accentGreen }, { label: "In lista, non contattati", x: outcome.not_sent, c: "var(--vt-cx)" }].map((r) => (
                <div key={r.label} style={{ display: "grid", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, color: CP.textSecondary, fontVariantNumeric: "tabular-nums" }}>
                    <span>{r.label}</span>
                    <span><b style={{ color: CP.textPrimary, fontWeight: 600 }}>{pct(r.x.rate)}</b> · {r.x.rebought} su {r.x.fans}</span>
                  </div>
                  <div style={{ height: 12, borderRadius: 6, background: CP.track, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, (r.x.rate || 0) * 100)}%`, height: "100%", borderRadius: 6, background: r.c }} />
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 12.5, color: CP.textSecondary }}>Chi è stato ricontattato ha ricomprato per {money(outcome.sent.revenue)} (liste degli ultimi 30 giorni, acquisti entro {outcome.days} giorni).</div>
              <div style={{ fontSize: 12, color: CP.textMuted }}>Confronto indicativo: a chi scrivere lo sceglie chi lavora la lista, non è un esperimento a caso.</div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Outcome({ o }) {
  if (!o) return null;
  if (!o.ready) {
    return <div style={{ fontSize: 13, color: CP.textMuted }}>Il primo risultato arriva 7 giorni dopo i primi contatti segnati: qui vedrai quanti hanno ricomprato.</div>;
  }
  return (
    <div style={{ ...card, padding: 16, display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: CP.textMuted }}>Com&apos;è andata (liste degli ultimi 30 giorni, acquisti entro {o.days} giorni)</div>
      <div style={{ fontSize: 15, color: CP.textPrimary, lineHeight: 1.5 }}>
        Dei {o.sent.fans} fan ricontattati, <b style={{ fontWeight: 500 }}>{o.sent.rebought} hanno ricomprato ({pct(o.sent.rate)})</b> per {money(o.sent.revenue)}.
        {" "}Tra i {o.not_sent.fans} in lista non contattati: {o.not_sent.rebought} ({pct(o.not_sent.rate)}).
      </div>
      <div style={{ fontSize: 12, color: CP.textMuted }}>Confronto indicativo: a chi scrivere lo sceglie chi lavora la lista, non è un esperimento a caso.</div>
    </div>
  );
}

function FanCard({ f, st, onMark }) {
  const [copied, setCopied] = useState(false);
  const inVetro = useInVetro();
  const copy = async () => {
    try { await window.navigator.clipboard.writeText(f.messaggio); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* il testo resta selezionabile */ }
  };
  return (
    <div className={inVetro ? "vt-glass" : undefined} style={{ ...card, padding: 16, display: "grid", gap: 10, opacity: st ? 0.7 : 1 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>{f.username ? `@${f.username}` : `fan ${f.user_id}`}</span>
        <span style={{ fontSize: 12, color: CP.textMuted }}>{f.page}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: CP.textSecondary, fontVariantNumeric: "tabular-nums" }}>{money(f.spent60)} in 60 giorni · ultimo acquisto {ago(f.days_since_buy)}</span>
      </div>
      <div style={{ fontSize: 13, color: CP.textMuted, lineHeight: 1.5 }}>
        Ci ha scritto l&apos;ultima volta {ago(f.days_since_fan_msg)}{f.last_fan_text ? <>: <span style={{ color: CP.textSecondary }}>«{f.last_fan_text}»</span></> : null} · noi gli abbiamo scritto {ago(f.days_since_our_msg)}
      </div>
      {f.perche && <div style={{ fontSize: 14, color: CP.textPrimary, lineHeight: 1.5 }}><span style={{ color: CP.textMuted }}>Perché si è fermato: </span>{f.perche}</div>}

      {f.scrivere === "no" ? (
        <div style={{ fontSize: 14, color: CP.textSecondary, borderLeft: `2px solid ${CP.border}`, padding: "2px 0 2px 12px", lineHeight: 1.5 }}>
          <span style={{ color: CP.textPrimary }}>Meglio non scrivere adesso</span>{f.motivo_no ? `: ${f.motivo_no}` : "."}
        </div>
      ) : f.messaggio ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: CP.textMuted }}>Bozza da mandare (rileggila e falla tua)</div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 360px", fontSize: 15, color: CP.textPrimary, background: CP.accentSoft, border: `1px solid ${CP.accentDim}`, borderRadius: "14px 14px 4px 14px", padding: "10px 14px", lineHeight: 1.45, userSelect: "text" }}>
            {f.messaggio}
          </div>
          <button onClick={copy} style={btn(false)}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copiata" : "Copia"}</button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: CP.textMuted }}>{f.scartata ? `Nessuna bozza (${f.scartata}): scrivi tu, partendo da una cosa che ha detto.` : "Nessuna bozza."}</div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {st ? (
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: st.status === "mandato" ? CP.accentGreen : CP.textMuted }}>
              {st.status === "mandato" ? <HeartHandshake size={14} /> : null}{st.status === "mandato" ? "Scritto" : "Saltato"}
            </span>
            <button onClick={() => onMark(null)} style={{ ...btn(false), padding: "4px 10px", fontSize: 12 }}><Undo2 size={12} /> annulla</button>
          </>
        ) : (
          <>
            <button onClick={() => onMark("mandato")} style={btn(true)}>Gli ho scritto</button>
            <button onClick={() => onMark("saltato")} style={btn(false)}>Non serve</button>
          </>
        )}
      </div>
    </div>
  );
}

const btn = (primary) => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 8, cursor: "pointer", fontFamily: FONTS.body, fontSize: 13,
  border: primary ? "none" : `1px solid ${CP.border}`, background: primary ? CP.accent : "transparent", color: primary ? CP.accentInk : CP.textSecondary, fontWeight: primary ? 500 : 400,
});
