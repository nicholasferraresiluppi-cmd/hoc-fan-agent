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
    <div style={{ display: "grid", gap: 20, maxWidth: 1080, margin: "0 auto", padding: "8px 0 40px" }}>
      <PageHead crumbs={[{ label: "Performance" }]} title="Fan da recuperare"
        subtitle="Chi spendeva bene e si è fermato. Scrivigli una cosa sua, non un saluto." />

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

          <Outcome o={data.outcome} />

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
  const copy = async () => {
    try { await window.navigator.clipboard.writeText(f.messaggio); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* il testo resta selezionabile */ }
  };
  return (
    <div style={{ ...card, padding: 16, display: "grid", gap: 10, opacity: st ? 0.7 : 1 }}>
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
