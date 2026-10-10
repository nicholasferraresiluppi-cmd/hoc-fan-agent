"use client";
/**
 * Analisi vendite (9-10/10/2026): come vanno le creator e perché, per i sales manager (formule in
 * lib/analisi-vendite-sql.js, verificate al centesimo contro Looker). Le pagine di Looker rifatte 1:1
 * stanno nel Report Looker (/admin/looker); la vecchia vista "Dati completi" a schede è stata tolta
 * (10/10) e i suoi link (?vista=dati&scheda=…) portano alla pagina Looker corrispondente.
 * Ognuno vede solo le creator che gli sono assegnate.
 */
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Sparkles } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Metric, DataTable, Notice, SectionTitle, card } from "@/components/ds";
import PeriodPicker from "@/components/PeriodPicker";
import { isDay, presetsFor } from "@/lib/period-range";

const DAY = 86400e3;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const yesterday = () => iso(Date.now() - DAY);

// useGrouping "always": in it-IT il browser non separa le migliaia sotto 10.000 ("8160") — qui sì ("8.160")
const money = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : `$${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" })}`);
const int = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : Math.round(Number(n)).toLocaleString("it-IT", { useGrouping: "always" }));
const pct = (v, d = 2) => (v == null || !Number.isFinite(Number(v)) ? "—" : `${(Number(v) * 100).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
// orari in UTC come in Looker: i giorni dei filtri sono giorni UTC, così una riga delle 23:59 resta nel suo giorno
const dt = (s) => (s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) : "—");
const dtLocal = (s) => (s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const dshort = (s) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—");
function Delta({ v }) {
  if (v == null || !Number.isFinite(v)) return <span style={{ color: CP.textMuted }}>—</span>;
  const up = v > 0;
  return <span style={{ color: up ? CP.accentGreen : v < 0 ? CP.accentRed : CP.textMuted, fontVariantNumeric: "tabular-nums" }}>{up ? "+" : v < 0 ? "−" : ""}{Math.abs(v * 100).toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%</span>;
}

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || "Errore"); e.info = j; throw e; }
  return j;
};

function BarsChart({ points, valueKey, label, fmt, max: maxIn }) {
  if (!points?.length) return null;
  const W = 760, H = 150, P = 26;
  const max = Math.max(1, maxIn || 0, ...points.map((p) => p[valueKey]));
  const bw = (W - P * 2) / points.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label={label}>
      {points.map((p, i) => {
        const h = (p[valueKey] / max) * (H - P * 2);
        return (
          <g key={p.key}>
            <rect x={P + bw * i + 2} y={H - P - h} width={Math.max(1, bw - 4)} height={h} fill={CP.accent} opacity={0.75}><title>{`${p.label}: ${fmt(p[valueKey])}`}</title></rect>
            {(points.length <= 24 || i % Math.ceil(points.length / 12) === 0) && <text x={P + bw * i + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={CP.textMuted}>{p.short}</text>}
          </g>
        );
      })}
      <text x={P} y={14} fontSize="10" fill={CP.textMuted}>{label} · max {fmt(max)}</text>
    </svg>
  );
}

const linkBtn = { border: "none", background: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 14, fontFamily: FONTS.body };

/* ───────── v2 (9/10/2026): si parte dalle creator, non dalle tabelle ───────── */

const STATUS = {
  "in-calo": { label: "In calo", color: CP.accentRed },
  stabile: { label: "Stabile", color: CP.textMuted },
  "in-crescita": { label: "In crescita", color: CP.accentGreen },
  "pochi-dati": { label: "Pochi dati", color: CP.textMuted },
};

function StatusChip({ status }) {
  const s = STATUS[status] || STATUS.stabile;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: CP.textSecondary, whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />{s.label}
    </span>
  );
}

function deltaText(v) {
  if (v == null || !Number.isFinite(v)) return null;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}%`;
}
const moneyShort = (n) => (n == null ? "—" : `$${Math.round(Number(n)).toLocaleString("it-IT", { useGrouping: "always" })}`);

function Sparkline({ points, height = 36 }) {
  if (!points?.length) return null;
  const W = 240, H = height;
  const max = Math.max(1, ...points.map((p) => p.revenue));
  const step = points.length > 1 ? W / (points.length - 1) : W;
  const path = points.map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(H - 3 - (p.revenue / max) * (H - 6)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }} aria-hidden="true">
      <path d={path} fill="none" stroke={CP.accent} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function PersonCard({ p, onOpen }) {
  const m = p.metrics;
  const [main, ...more] = p.reasons;
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      style={{ ...card, padding: 16, display: "grid", gap: 10, cursor: "pointer", alignContent: "start" }} aria-label={`Apri ${p.name}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>{p.name}</div>
          {p.accounts.length > 1 && <div style={{ fontSize: 12, color: CP.textMuted }}>{p.accounts.map((a) => a.market || a.alias).join(" · ")}</div>}
        </div>
        <StatusChip status={p.status} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 500, color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{moneyShort(m.revenue)}</span>
        {deltaText(m.revenue_delta) && <span style={{ fontSize: 13, color: CP.textSecondary, fontVariantNumeric: "tabular-nums" }}>{deltaText(m.revenue_delta)} ({m.revenue_diff >= 0 ? "+" : "−"}{moneyShort(Math.abs(m.revenue_diff))})</span>}
      </div>
      <Sparkline points={p.daily} />
      {main && <div style={{ fontSize: 14, color: CP.textPrimary, lineHeight: 1.45 }}>{main.text}</div>}
      {more.slice(0, 2).map((r) => <div key={r.kind} style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.45 }}>{r.text}</div>)}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: CP.textMuted, borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 8 }}>
        <span>{int(m.subs)} nuovi abbonati</span>
        <span>{int(m.spenders)} fan che spendono</span>
        {m.spend_per_fan != null && <span>{moneyShort(m.spend_per_fan)} a testa</span>}
      </div>
    </div>
  );
}

function Fact({ label, now, prev, delta, hint }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontSize: 12, color: CP.textMuted }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 500, color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{now}</div>
      <div style={{ fontSize: 12, color: CP.textSecondary }}>{prev != null ? `prima ${prev}` : ""}{delta ? ` · ${delta}` : ""}</div>
      {hint && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

function CreatorDetail({ d, onBack, onDati }) {
  const p = d.person;
  if (!p) return <Notice>Nessun dato per questa creator nel periodo.</Notice>;
  const m = p.metrics;
  const pctOrDash = (v) => (v == null ? "—" : pct(v, 1));
  const linkCols = [
    { key: "link_name", label: "Link", render: (r) => r.link_name || "—" },
    { key: "clicks", label: "Click", align: "right", render: (r) => int(r.clicks) },
    { key: "subs", label: "Abbonati", align: "right", render: (r) => int(r.subs) },
    { key: "subs_delta", label: "rispetto a prima", align: "right", render: (r) => <Delta v={r.subs_delta} />, csv: (r) => r.subs_delta },
    { key: "cr", label: "Abbonati ogni 100 click", align: "right", render: (r) => (r.cr == null ? "—" : (r.cr * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })) },
    { key: "revenue", label: "Speso dai suoi fan", align: "right", render: (r) => money(r.revenue) },
  ];
  return (
    <div style={{ display: "grid", gap: 22 }}>
      <button onClick={onBack} style={{ ...linkBtn, justifySelf: "start" }}>← Tutte le creator</button>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 500, color: CP.textPrimary }}>{p.name}</h2>
          <div style={{ fontSize: 13, color: CP.textMuted }}>{p.accounts.map((a) => a.alias).join(" · ")}</div>
        </div>
        <StatusChip status={p.status} />
      </div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "baseline" }}>
        <Metric label="Revenue netta" value={money(m.revenue)} delta={deltaText(m.revenue_delta)} deltaLabel={`dal ${dshort(d.previous.from)} al ${dshort(d.previous.to)} (${money(m.revenue_prev)})`} />
        {m.revenue_base != null && (
          <Metric label="Rispetto al suo normale" value={deltaText(m.revenue_base_delta) || "—"} deltaLabel=""
            note={`livello normale ${moneyShort(m.revenue_base)}: mediana delle 8 settimane prima`} />
        )}
      </div>
      <section style={{ ...card, padding: 16, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, color: CP.textMuted }}>Perché</div>
        {p.reasons.map((r, i) => <div key={r.kind + i} style={{ fontSize: i ? 14 : 15, color: i ? CP.textSecondary : CP.textPrimary, lineHeight: 1.5 }}>{r.text}</div>)}
      </section>
      {p.status !== "pochi-dati" && p.reasons[0]?.kind !== "nodata" && <ChatPerche ids={p.ids} range={d.range} person={p} />}
      <div style={{ ...card, padding: 16 }}>
        <BarsChart label="Revenue al giorno" valueKey="revenue" fmt={moneyShort}
          points={p.daily.map((x) => ({ key: x.day, label: dshort(x.day), short: `${x.day.slice(8, 10)}/${x.day.slice(5, 7)}`, revenue: x.revenue }))} />
      </div>

      <section style={{ display: "grid", gap: 10 }}>
        <SectionTitle>I numeri che spiegano la revenue</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
          <Fact label="Fan che hanno speso" now={int(m.spenders)} prev={int(m.spenders_prev)} delta={deltaText(m.spenders_delta)} />
          <Fact label="Spesa media per fan" now={money(m.spend_per_fan)} prev={money(m.spend_per_fan_prev)} delta={deltaText(m.spend_per_fan_delta)} />
          <Fact label="Nuovi abbonati" now={int(m.subs)} prev={int(m.subs_prev)} delta={deltaText(m.subs_delta)} />
          <Fact label="Nuovi che hanno comprato" now={pctOrDash(m.cr)} prev={pctOrDash(m.cr_prev)} hint="Su 100 nuovi abbonati, quanti hanno speso qualcosa." />
          <Fact label="Speso il primo giorno da un nuovo abbonato" now={money(m.d0_per_sub)} prev={money(m.d0_per_sub_prev)} hint="In media, nel giorno in cui si abbona." />
          <Fact label="Click sui tracking link" now={int(m.clicks)} prev={int(m.clicks_prev)} delta={deltaText(m.clicks_delta)} />
          <Fact label="Chargeback" now={moneyShort(m.chargeback_amount)} prev={moneyShort(m.chargeback_amount_prev)} hint={m.chargebacks ? `${int(m.chargebacks)} nel periodo` : "Nessuno nel periodo"} />
        </div>
      </section>

      {p.accounts.length > 1 && (
        <section style={{ display: "grid", gap: 6 }}>
          <SectionTitle>Per mercato</SectionTitle>
          {p.accounts.map((a) => (
            <div key={a.creator_id} style={{ fontSize: 14, color: CP.textSecondary }}>
              <span style={{ color: CP.textPrimary }}>{a.alias}</span>: {money(a.revenue)} <span style={{ color: CP.textMuted }}>(prima {money(a.revenue_prev)}, {deltaText((a.revenue - a.revenue_prev) / (a.revenue_prev || 1)) || "—"})</span>
            </div>
          ))}
        </section>
      )}

      <section style={{ display: "grid", gap: 10 }}>
        <SectionTitle aside={`${d.links.total} link attivi`}>Da dove arrivano gli abbonati</SectionTitle>
        {d.links.falling.length > 0 && (
          <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>
            In calo: {d.links.falling.map((l) => `«${l.link_name || "senza nome"}» ${int(l.subs)} abbonati invece di ${int(l.subs_prev)}`).join("; ")}.
          </div>
        )}
        {d.links.fresh?.length > 0 && (
          <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>
            Link nuovi (nessun abbonato nel periodo prima): {d.links.fresh.map((l) => `«${l.link_name || "senza nome"}» ${int(l.subs)} abbonati, ${l.cr == null ? "—" : (l.cr * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })} ogni 100 click`).join("; ")}.
            {" "}Un traffico nuovo spesso converte in modo diverso: guardalo accanto a «nuovi che hanno comprato».
          </div>
        )}
        <DataTable columns={linkCols} rows={d.links.top} minWidth={700} empty="Nessun tracking link attivo nel periodo." />
        <div style={{ fontSize: 12, color: CP.textMuted }}>«Speso dai suoi fan» è quanto hanno speso nel periodo tutti i fan entrati da quel link, anche prima.</div>
      </section>

      {d.ticket.length > 0 && (
        <section style={{ display: "grid", gap: 6 }}>
          <SectionTitle aside="mese in corso">Come spendono</SectionTitle>
          {d.ticket.map((t) => (
            <div key={t.name} style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>
              <span style={{ color: CP.textPrimary }}>{t.name}</span>: metà delle {int(t.transactions)} transazioni è sotto {money(t.median)}; la media è {money(t.avg)}
              {t.median && t.avg / t.median >= 1.8 ? " — buona parte dell'incasso viene da poche vendite grandi." : "."}
            </div>
          ))}
        </section>
      )}

      {(d.welcome.length > 0 || d.welcomeMissing.length > 0) && (
        <section style={{ display: "grid", gap: 6 }}>
          <SectionTitle>Messaggio di benvenuto a pagamento</SectionTitle>
          {d.welcome.map((w) => (
            <div key={`${w.name}-${w.amount}`} style={{ fontSize: 14, color: CP.textSecondary }}>
              <span style={{ color: CP.textPrimary }}>{w.name}</span> a {money(w.amount)}: sbloccato da {int(w.unlocks)} nuovi abbonati su {int(w.subs)} ({pct(w.subs ? w.unlocks / w.subs : 0, 1)}), {money(w.revenue)}.
            </div>
          ))}
          {d.welcomeMissing.length > 0 && <div style={{ fontSize: 13, color: CP.textMuted }}>Nessun prezzo welcome registrato per {d.welcomeMissing.join(", ")}: gli sblocchi non si possono misurare.</div>}
        </section>
      )}

      {d.chargebacks.length > 0 && (
        <section style={{ display: "grid", gap: 6 }}>
          <SectionTitle>Ultimi chargeback</SectionTitle>
          {d.chargebacks.map((c, i) => (
            <div key={i} style={{ fontSize: 14, color: CP.textSecondary }}>{dt(c.chargeback_at)} · {c.username || c.user_id} · {c.payment_type} · {money(c.amount)}</div>
          ))}
        </section>
      )}

      <section style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {p.live && <a href={`/admin/le-mie-creator?creator=${encodeURIComponent(p.live)}`} style={actionBtn}>Chat e revenue dal vivo</a>}
        <a href="/admin/sales-coaching" style={actionBtn}>Coaching vendite</a>
        <button onClick={() => onDati(p.ids)} style={actionBtn}>Tutte le tabelle di {p.name}</button>
      </section>
    </div>
  );
}
const actionBtn = { display: "inline-flex", alignItems: "center", padding: "8px 14px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, textDecoration: "none", cursor: "pointer", fontFamily: FONTS.body };

// segnaposto mentre il warehouse calcola: la pagina ha già la sua forma, non un "caricamento" a vuoto
function SkeletonCards() {
  return (
    <div aria-label="Calcolo in corso" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 330px), 1fr))", gap: 14 }}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} style={{ ...card, padding: 18, display: "grid", gap: 12, animation: "av-pulse 1.4s ease-in-out infinite", animationDelay: `${i * 0.08}s` }}>
          <div style={{ height: 14, width: "45%", borderRadius: 6, background: CP.surfaceAlt }} />
          <div style={{ height: 26, width: "60%", borderRadius: 6, background: CP.surfaceAlt }} />
          <div style={{ height: 36, borderRadius: 6, background: CP.surfaceAlt, opacity: 0.6 }} />
          <div style={{ height: 12, width: "80%", borderRadius: 6, background: CP.surfaceAlt, opacity: 0.6 }} />
        </div>
      ))}
      <style>{"@keyframes av-pulse{0%,100%{opacity:.55}50%{opacity:1}}"}</style>
    </div>
  );
}

/* ───────── Perché, nelle chat (10/10/2026): l'AI legge le chat dei fan che hanno spostato la revenue ───────── */

const TIPO = { metodo: "Metodo di chi scrive", contenuto: "Contenuto della creator", prezzo: "Prezzo", fan: "Il fan", traffico: "Traffico", altro: "Altro" };
const CHI = { "sales manager": "Sales manager", operatore: "Operatori", creator: "Creator" };
const STEPS = [[0, "Scelgo i fan e faccio i conti"], [6, "Prendo le loro chat"], [14, "L'AI sta leggendo le chat: di solito 30-60 secondi"]];

function ChatPerche({ ids, range, person }) {
  const q = `creators=${ids.join(",")}&from=${range.from}&to=${range.to}`;
  const cached = useSWR(`/api/admin/analisi-vendite/perche?${q}`, fetcher, { revalidateOnFocus: false });
  const [run, setRun] = useState({ busy: false, started: 0, error: null, result: null });
  const [tick, setTick] = useState(0);
  useEffect(() => { setRun({ busy: false, started: 0, error: null, result: null }); }, [q]);
  useEffect(() => {
    if (!run.busy) return undefined;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [run.busy]);

  const start = async (refresh = false) => {
    setRun({ busy: true, started: Date.now(), error: null, result: null });
    try {
      for (let i = 0; i < 40; i++) {
        const r = await fetch("/api/admin/analisi-vendite/perche", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creators: ids, from: range.from, to: range.to, refresh: refresh && i === 0 }) });
        const j = await r.json().catch(() => ({}));
        if (r.status === 202) { await new Promise((res) => setTimeout(res, 5000)); continue; } // un collega la sta già facendo
        if (!r.ok) throw new Error(j.error || "Lettura non riuscita");
        setRun({ busy: false, started: 0, error: null, result: j.result });
        cached.mutate({ result: j.result }, false);
        return;
      }
      throw new Error("Ci sta mettendo troppo: riprova tra un minuto");
    } catch (e) {
      setRun({ busy: false, started: 0, error: e.message, result: null });
    }
  };

  const res = run.result || cached.data?.result;
  const down = (person.metrics.revenue_diff || 0) < 0;
  const secs = run.busy ? Math.round((Date.now() - run.started) / 1000) : 0;
  const step = [...STEPS].reverse().find(([t]) => secs >= t)?.[1];
  void tick;

  return (
    <section style={{ ...card, padding: 18, display: "grid", gap: 14, borderColor: res ? CP.border : CP.accentDim }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>
          <Sparkles size={16} color={CP.accentSoftText} /> Perché, nelle chat
        </div>
        {res?.status === "ok" && (
          <span style={{ fontSize: 12, color: CP.textMuted }}>
            letto dall&apos;AI su {res.read.fans} fan e {int(res.read.messages)} messaggi · {dtLocal(res.computed_at)}
            {" · "}<button onClick={() => start(true)} disabled={run.busy} style={{ ...linkBtn, fontSize: 12 }}>rileggi</button>
          </span>
        )}
      </div>

      {!res && !run.busy && (
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.5, flex: "1 1 320px" }}>
            I numeri dicono cosa è cambiato. Il perché sta nelle conversazioni: l&apos;AI legge le chat dei {down ? "fan che hanno smesso di spendere" : "fan che hanno speso di più"} e ti dice cosa è successo, con le frasi vere.
          </div>
          <button onClick={() => start(false)} disabled={cached.isLoading}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, border: "none", background: CP.accent, color: CP.accentInk, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body }}>
            <Sparkles size={15} /> Leggi le chat
          </button>
        </div>
      )}

      {run.busy && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 14, color: CP.textSecondary }}>{step}…</div>
          <div style={{ height: 4, borderRadius: 999, background: CP.surfaceAlt, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(95, (secs / 60) * 100)}%`, background: CP.accent, transition: "width 1s linear" }} />
          </div>
        </div>
      )}
      {run.error && <Notice danger>{run.error}</Notice>}

      {res?.status === "nothing" && <div style={{ fontSize: 14, color: CP.textSecondary }}>{res.message}</div>}
      {res?.status === "ok" && <PercheResult r={res} />}
    </section>
  );
}

function PercheResult({ r }) {
  const a = r.analysis;
  const st = r.stats || {};
  const facts = [
    r.dir === "down" && st.base_fans ? `${int(st.stopped)} fan su ${int(st.base_fans)} che spendevano almeno $50 hanno smesso di comprare` : null,
    r.dir === "up" && st.fans ? `${int(st.fans)} fan hanno più che raddoppiato la spesa (${moneyShort(st.spent_prev)} → ${moneyShort(st.spent_cur)})` : null,
    r.dir === "down" && st.fans ? `${int(st.fan_silent)} di loro non ci hanno più scritto` : null,
    r.dir === "down" && st.fans ? `a ${int(st.us_silent)} non abbiamo scritto niente noi` : null,
    ...(r.blasts || []).slice(0, 2).map((b) => `“${b.t.length > 40 ? `${b.t.slice(0, 40)}…` : b.t}” mandato uno per uno a ${int(b.fans)} fan in ${b.minutes || 1} minuti`),
  ].filter(Boolean);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {facts.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {facts.map((f) => <span key={f} style={{ fontSize: 12, color: CP.textSecondary, background: CP.surfaceAlt, borderRadius: 999, padding: "5px 10px" }}>{f}</span>)}
        </div>
      )}
      <div style={{ fontSize: 17, lineHeight: 1.5, color: CP.textPrimary, maxWidth: 820 }}>{a.sintesi}</div>

      <div style={{ display: "grid", gap: 12 }}>
        {a.cause.map((c, i) => (
          <div key={i} style={{ border: `1px solid ${CP.borderSoft}`, borderRadius: 12, padding: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: CP.textMuted, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
              <span style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>{c.titolo}</span>
              <span style={{ fontSize: 11, color: CP.accentSoftText, background: CP.accentSoft, borderRadius: 999, padding: "2px 8px" }}>{TIPO[c.tipo] || c.tipo}</span>
              {c.fan_letti > 0 && <span style={{ fontSize: 12, color: CP.textMuted }}>vista in {c.fan_letti} fan su {r.read.fans} letti</span>}
            </div>
            <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>{c.spiegazione}</div>
            {c.esempi.length > 0 && (
              <div style={{ display: "grid", gap: 6 }}>
                {c.esempi.map((e, j) => (
                  <div key={j} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: CP.textMuted, width: 240, flex: "0 0 auto", paddingTop: 6 }}>
                      {e.chi === "noi" ? "Noi a" : "Il fan"} {e.username ? `@${e.username}` : e.fan}{e.spent_prev ? ` (aveva speso ${moneyShort(e.spent_prev)})` : ""}
                    </span>
                    <span style={{ fontSize: 14, color: CP.textPrimary, maxWidth: 560, padding: "6px 11px",
                      // chi parla si legge dalla FORMA, non solo dal colore: nello stile Casa i due fondi sono quasi uguali
                      ...(e.chi === "noi"
                        ? { background: CP.accentSoft, border: `1px solid ${CP.accentDim}`, borderRadius: "12px 12px 4px 12px" }
                        : { background: "transparent", border: `1px dashed ${CP.border}`, borderRadius: "12px 12px 12px 4px" }) }}>
                      {e.citazione}{e.ppv ? <span style={{ color: CP.textMuted }}> · PPV ${e.ppv}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {a.azioni.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 13, color: CP.textMuted }}>Cosa fare questa settimana</div>
          {a.azioni.map((x, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.5 }}>
              <span style={{ minWidth: 110, color: CP.textMuted }}>{CHI[x.chi] || x.chi}</span>
              <span style={{ color: CP.textPrimary }}>{x.cosa}</span>
            </div>
          ))}
        </div>
      )}
      {r.fans?.length > 0 && (
        <details style={{ fontSize: 13, color: CP.textSecondary }}>
          <summary style={{ cursor: "pointer", color: CP.textMuted }}>I {r.fans.length} fan letti (F01 = {r.dir === "down" ? "chi ha perso di più" : "chi è cresciuto di più"})</summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: "4px 18px", marginTop: 8 }}>
            {r.fans.map((f) => (
              <span key={f.label} style={{ fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: CP.textMuted }}>{f.label}</span> {f.username ? `@${f.username}` : `id ${f.user_id}`} · {moneyShort(f.prev)} → {moneyShort(f.cur)}
              </span>
            ))}
          </div>
        </details>
      )}
      <div style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.5 }}>
        {a.limiti} I conti in alto sono del codice; la lettura è dell&apos;AI. Le frasi citate sono state controllate parola per parola nelle chat
        ({a.citazioni.verificate} vere{a.citazioni.scartate ? `, ${a.citazioni.scartate} scartate perché non trovate` : ""}).
      </div>
    </div>
  );
}

function useDiag(view, range, ids, enabled = true) {
  const url = useMemo(() => {
    const q = new URLSearchParams({ view, from: range.from, to: range.to });
    if (ids?.length) q.set("creators", ids.join(","));
    return `/api/admin/analisi-vendite?${q}`;
  }, [view, range.from, range.to, ids?.join(",")]);
  return useSWR(enabled ? url : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
}

function readUrl() {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  return { vista: q.get("vista"), scheda: q.get("scheda"), creator: q.get("creator"), creators: (q.get("creators") || "").split(",").map(Number).filter(Boolean), giorni: Number(q.get("giorni")) || null, dal: q.get("dal"), al: q.get("al") };
}
function writeUrl(params) {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) q.set(k, Array.isArray(v) ? v.join(",") : String(v));
  const s = q.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
}

// vecchie schede di "Dati completi" → pagina corrispondente del Report Looker
const SCHEDA_TO_PAGE = {
  recap: "recap-dashboard", conversioni: "conversion-analytics", rapporto: "sales-ratio", "meta-mese": "detailed-kpi",
  transazioni: "transactions-details", "nuovi-abbonati": "dashboard", tracking: "clicks-overall", copertura: "creators-reach",
  notifiche: "subs-notifications", welcome: "welcome-mass-unlocks", "ricerca-fan": "user-research",
};
const lookerHref = (page, ids) => `/admin/looker?pagina=${page}${ids?.length ? `&creators=${ids.join(",")}` : ""}`;

export default function AnalisiVenditePage() {
  const [ready, setReady] = useState(false);
  const [range, setRange] = useState(() => presetsFor(yesterday())[0]); // ultimi 7 giorni, fino a ieri
  const [person, setPerson] = useState(null); // nome della persona aperta

  useEffect(() => {
    const u = readUrl();
    const linked = isDay(u.dal) && isDay(u.al) ? { from: u.dal, to: u.al } : null;
    if (u.vista === "dati") { window.location.replace(lookerHref(SCHEDA_TO_PAGE[u.scheda] || "recap-dashboard", u.creators)); return; }
    if (u.creator) setPerson(u.creator);
    if (linked) setRange(linked);
    else if (u.giorni >= 1 && u.giorni <= 400) setRange({ from: iso(Date.now() - u.giorni * DAY), to: yesterday() }); // link vecchi con ?giorni=
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const def = presetsFor(yesterday())[0];
    const moved = range.from !== def.from || range.to !== def.to;
    writeUrl({ creator: person, dal: moved ? range.from : null, al: moved ? range.to : null });
  }, [ready, person, range.from, range.to]);

  const list = useDiag("diagnosi", range, null);
  const persons = list.data?.persons || [];
  const open = persons.find((p) => p.name === person) || null;
  const detail = useDiag("creator", range, open ? open.ids : null, Boolean(open));
  const showDetail = Boolean(person && open);

  const goDati = (ids) => { window.location.href = lookerHref("recap-dashboard", ids); };

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 1280, margin: "0 auto", padding: "8px 0 40px" }}>
      <PageHead crumbs={[{ label: "Performance" }]} title="Analisi vendite"
        subtitle="Come vanno le tue creator e perché. Prima chi sta perdendo di più." />

      <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <PeriodPicker value={range} onChange={setRange} max={yesterday()} loading={list.isLoading && Boolean(list.data)} />
            <span style={{ flex: 1 }} />
            <a href={lookerHref("recap-dashboard", open ? open.ids : [])} style={{ ...linkBtn, textDecoration: "none" }}>Report Looker (le pagine di Looker Studio) →</a>
          </div>

          {list.error && <Notice danger>{list.error.message}</Notice>}
          {list.data?.empty && <Notice>{list.data.message}</Notice>}
          {!list.data && !list.error && <SkeletonCards />}

          {showDetail ? (
            detail.data?.person && detail.data.view === "creator" ? (
              <div style={{ opacity: detail.isLoading ? 0.6 : 1 }}>
                <CreatorDetail d={detail.data} onBack={() => setPerson(null)} onDati={goDati} />
              </div>
            ) : detail.error ? <Notice danger>{detail.error.message}</Notice> : <div style={{ ...card, padding: 24, color: CP.textMuted, fontSize: 14 }}>Apro {person}…</div>
          ) : list.data?.persons && (
            <>
              <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>
                {list.data.summary.down > 0 && <><span style={{ color: CP.textPrimary }}>{list.data.summary.down} in calo</span>, </>}
                {list.data.summary.steady} stabili, {list.data.summary.up} in crescita{list.data.summary.few ? `, ${list.data.summary.few} con pochi dati` : ""}.
                {" "}In tutto {moneyShort(list.data.summary.revenue)}{deltaText(list.data.summary.revenue_delta) ? ` (${deltaText(list.data.summary.revenue_delta)} sul periodo prima)` : ""}.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 330px), 1fr))", gap: 14, opacity: list.isLoading ? 0.6 : 1 }}>
                {persons.map((p) => <PersonCard key={p.name} p={p} onOpen={() => { setPerson(p.name); window.scrollTo?.(0, 0); }} />)}
              </div>
              <div style={{ fontSize: 12, color: CP.textMuted }}>
                «In calo» = almeno −10% e almeno −$300 rispetto al periodo prima. Revenue netta come in Looker; i fan che spendono sono persone distinte nel periodo.
                {list.data.source === "backup" ? " Fonte: copia di sicurezza nostra (il warehouse dell'altra parte non risponde)." : ""}
              </div>
            </>
          )}
      </>
    </div>
  );
}
