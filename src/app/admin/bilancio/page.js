"use client";

// Bilancio del mese (16/10/2026) — il foglio "Bilancio_unico_LIVE" di Nicholas in HOC Pro.
// La classifica di TUTTE le creator dello split: ogni sales manager la vede intera, anche se gli è
// assegnata una creator sola — è la classifica aziendale e serve a creare competizione (Nicholas).
// v2 (stesso giorno): si sceglie il GIORNO (frecce, calendario, mesi passati); creator raggruppate in
// ECOSISTEMI con il totale di squadra contro il goal; chi è indietro legge quanto SERVE al giorno,
// mai "in perdita" (Nicholas: "avevo paura che chi vede la sua creator in svantaggio si demoralizzi").
// Conti e definizioni in src/lib/bilancio-core.js. Goal condivisi con Revenue e chat.
// 26/10/2026: stile vetro (terza pagina della prova dopo Casa e Le mie creator): riquadri con i numeri,
// il mese che sale contro il mese prima e il ritmo del goal, il venduto per ecosistema. Col vetro spento
// la pagina è quella di prima. Anche qui niente rosso per chi è indietro: verde solo per «ci arriva».

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { RefreshCw, Pencil, Check, ChevronLeft, ChevronRight, CalendarDays, Plus } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, Notice, card } from "@/components/ds";
import { liveFetcher } from "@/components/LiveCreatorPicker";
import { MONTHS_IT } from "@/lib/format";
import VetroScope, { useVetro, VetroSwitch, VetroNum, useInVetro } from "@/components/VetroScope";
import { MonthArea, Gauge, GaugeKey, GoalRing } from "@/components/VetroCharts";

const NUM = { fontVariantNumeric: "tabular-nums" };
const ok = (v) => v != null && Number.isFinite(Number(v));
const group = (v) => Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const usd = (v) => (!ok(v) ? "—" : `${v < 0 ? "−" : ""}$${group(v)}`);
const pct = (v) => (!ok(v) ? "—" : `${Math.round(v * 100)}%`);
const hm = (iso) => (!iso ? "" : new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }));
const WEEKDAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const COUNTRY_LONG = { IT: "Italia", EN: "Inglese", ES: "Spagnolo" };
const addDays = (iso, k) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
const dayLabel = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_IT[d.getUTCMonth()]}`; };
const monthLabel = (m) => { const s = MONTHS_IT[Number(m.slice(5)) - 1]; return `${s.charAt(0).toUpperCase()}${s.slice(1)} ${m.slice(0, 4)}`; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pctColor = (r, ideal) => (ok(r.pctActual) && r.pctActual >= ideal ? CP.accentGreen : CP.textPrimary);

function readDay() {
  try { return new URLSearchParams(window.location.search).get("giorno") || null; } catch { return null; }
}

export default function BilancioPage() {
  const [day, setDay] = useState(null); // null = oggi
  const [ready, setReady] = useState(false);
  useEffect(() => { setDay(readDay()); setReady(true); }, []);
  const key = ready ? `/api/admin/bilancio${day ? `?date=${day}` : ""}` : null;
  const { data, error, isLoading, mutate } = useSWR(key, liveFetcher, { refreshInterval: day ? 0 : 10 * 60 * 1000, revalidateOnFocus: false, keepPreviousData: true });
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);

  const go = (d) => {
    const next = !d || (data && d >= data.today) ? null : d;
    setDay(next);
    try { const u = new URL(window.location.href); if (next) u.searchParams.set("giorno", next); else u.searchParams.delete("giorno"); window.history.replaceState(null, "", u); } catch { /* niente */ }
  };
  const refresh = async () => {
    setRefreshing(true);
    try { await mutate(await liveFetcher(`/api/admin/bilancio?refresh=1${day ? `&date=${day}` : ""}`), { revalidate: false }); } catch { /* resta il dato di prima */ }
    setRefreshing(false);
  };

  const mine = useMemo(() => new Set(data?.mine || []), [data]);
  const [vetro, setVetro] = useVetro();

  return (
    <VetroScope on={vetro}>
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "8px 16px 56px", fontFamily: FONTS.body }}>
      <PageHead
        title="Bilancio del mese"
        subtitle="Tutte le creator dello split, ognuna misurata sul suo goal, divise per ecosistema."
        actions={(
          <>
            <VetroSwitch on={vetro} set={setVetro} />
            {data?.canEdit && (
              <button onClick={() => setEditing((v) => !v)} style={btn(editing)}>
                {editing ? <Check size={14} /> : <Pencil size={14} />} {editing ? "Fatto" : "Goal ed ecosistemi"}
              </button>
            )}
            {data && (
              <button onClick={refresh} disabled={refreshing} style={btn(false)} title="Ricalcola adesso dal warehouse">
                <RefreshCw size={14} style={refreshing ? { animation: "spin 1s linear infinite" } : null} /> Aggiorna
              </button>
            )}
          </>
        )}
      />

      {data && <DayNav data={data} go={go} />}
      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && !data && <div className="vt-glass" style={{ ...card, padding: 24, color: CP.textMuted, fontSize: 14 }}>Sto sommando il venduto di tutte le creator…</div>}

      {data && (
        <div style={{ opacity: isLoading ? 0.55 : 1, transition: "opacity .15s" }}>
          <Summary data={data} />
          <Charts data={data} mine={mine} />
          {editing && <GroupEditor data={data} onSaved={() => mutate()} />}
          <div style={{ display: "grid", gap: 16 }}>
            {data.groups.map((g) => <Ecosystem key={g.id} g={g} data={data} mine={mine} editing={editing} onSaved={() => mutate()} />)}
          </div>
          {!ok(data.totals.goal) && <div style={{ marginTop: 12 }}><Notice>Nessun goal messo per {monthLabel(data.month)}: senza goal non c'è classifica, solo il venduto.</Notice></div>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, marginTop: 28, alignItems: "start" }}>
            <TheDay data={data} />
            <Days data={data} go={go} />
          </div>
          <Explain data={data} />
          <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 10 }}>Dati del warehouse aggiornati alle {hm(data.updated_at)}{data.live ? " · si aggiornano da soli ogni 10 minuti" : ""}.</div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
    </VetroScope>
  );
}

const btn = (strong) => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, fontSize: 13.5, fontWeight: 500, cursor: "pointer",
  background: strong ? CP.accent : CP.surface, color: strong ? CP.accentInk : CP.textPrimary, border: `1px solid ${strong ? CP.accent : CP.border}`,
});
const iconBtn = (disabled) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 999, cursor: disabled ? "default" : "pointer",
  background: CP.surface, color: disabled ? CP.textMuted : CP.textPrimary, border: `1px solid ${CP.border}`, opacity: disabled ? 0.45 : 1,
});

// ─── Il giorno: frecce, calendario, oggi ─────────────────────────────────────

function DayNav({ data, go }) {
  const atToday = data.asOf >= data.today;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "-4px 0 18px" }}>
      <button aria-label="Giorno prima" onClick={() => go(addDays(data.asOf, -1))} style={iconBtn(false)}><ChevronLeft size={16} /></button>
      <label style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 999, border: `1px solid ${CP.border}`, background: CP.surface, cursor: "pointer", fontSize: 14.5, fontWeight: 500, color: CP.textPrimary }}>
        <CalendarDays size={15} color={CP.textSecondary} />
        <span>{cap(dayLabel(data.asOf))}</span>
        {data.live && <span style={{ fontSize: 12, fontWeight: 500, color: CP.accentGreen }}>· in corso</span>}
        <input type="date" value={data.asOf} max={data.today} onChange={(e) => e.target.value && go(e.target.value)}
          aria-label="Scegli il giorno" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%" }} />
      </label>
      <button aria-label="Giorno dopo" disabled={atToday} onClick={() => !atToday && go(addDays(data.asOf, 1))} style={iconBtn(atToday)}><ChevronRight size={16} /></button>
      {!atToday && <button onClick={() => go(null)} style={{ ...btn(false), padding: "6px 12px", fontSize: 13 }}>Torna a oggi</button>}
      <span style={{ fontSize: 13, color: CP.textMuted }}>
        {data.live ? `giorno ${Number(data.asOf.slice(8))} di ${data.daysInMonth} · mancano ${data.daysLeft} giorni` : data.daysLeft ? `com'era a fine giornata · mancavano ${data.daysLeft} giorni` : `${monthLabel(data.month)} chiuso`}
      </span>
    </div>
  );
}

// ─── In cima: venduto, goal, arrivo, mese prima ─────────────────────────────

function Summary({ data }) {
  const t = data.totals;
  const items = [
    { label: "Venduto del mese", value: usd(t.mtd), note: ok(t.goal) ? `${pct(t.pctActual)} del goal · ritmo ideale ${pct(data.idealPct)}` : null, noteColor: ok(t.pctActual) && t.pctActual >= data.idealPct ? CP.accentGreen : CP.textSecondary },
    { label: "Goal del mese", value: usd(t.goal), note: ok(t.targetDay) ? `${usd(t.targetDay)} al giorno` : "nessun goal messo" },
    { label: data.daysLeft ? "Arrivo previsto" : "Chiuso a", value: usd(data.daysLeft ? t.projection : t.mtd), note: <StatusText r={t} closed={!data.daysLeft} />, noteColor: CP.textSecondary },
    { label: "Mese precedente", value: usd(t.prev), note: ok(t.deltaPrev) ? `${t.deltaPrev >= 0 ? "+" : "−"}$${group(t.deltaPrev)}${data.daysLeft ? " nella proiezione" : ""}` : null, noteColor: ok(t.deltaPrev) && t.deltaPrev >= 0 ? CP.accentGreen : CP.textSecondary },
  ];
  // Col vetro i quattro numeri stanno dentro il riquadro della quota (Charts), accanto all'arco.
  if (useInVetro()) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 24 }}>
      {items.map((x) => (
        <div key={x.label} style={{ ...card, padding: "12px 14px", minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: CP.textSecondary }}>{x.label}</div>
          <div style={{ fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 500, color: CP.textPrimary, marginTop: 4, ...NUM }}>{x.value}</div>
          {x.note && <div style={{ fontSize: 12.5, color: x.noteColor || CP.textSecondary, marginTop: 4, ...NUM }}>{x.note}</div>}
        </div>
      ))}
    </div>
  );
}

// Solo col vetro (26/10/2026, «per ogni pagina capiscine l'utilità»). La domanda del Bilancio è «chi arriva
// al goal?»: in alto il mese dello split contro il mese prima e il ritmo del goal, accanto l'arco della
// quota (fatto, dove dovremmo essere oggi, arrivo previsto) con i quattro numeri; sotto un anello per
// creator, in ordine di classifica (proiezione ÷ goal), come gli obiettivi del reel «Savings & Goals».
// Un clic sull'anello porta all'ecosistema della creator. Le creator senza goal restano fuori dagli anelli.
function Charts({ data, mine }) {
  const inVetro = useInVetro();
  if (!inVetro) return null;
  const t = data.totals;
  const cur = data.days.map((d) => d.total || 0);
  const upto = data.days.filter((d) => !d.future).length;
  const [y, m] = data.month.split("-").map(Number);
  const prevDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const curName = MONTHS_IT[m - 1], prevName = MONTHS_IT[(m + 10) % 12];
  const hasGoal = ok(t.goal);
  const ecoOf = new Map(data.groups.flatMap((g) => g.creators.map((c) => [c.slug, g.id])));
  const rings = (data.creators || []).filter((c) => ok(c.goal));
  const noGoal = (data.creators || []).filter((c) => !ok(c.goal)).length;
  const lines = [
    ["Venduto", usd(t.mtd), hasGoal ? `di ${usd(t.goal)} di goal` : null],
    [data.daysLeft ? "Arrivo previsto" : "Chiuso a", usd(data.daysLeft ? t.projection : t.mtd), <StatusText key="s" r={t} closed={!data.daysLeft} />],
    [data.daysLeft ? "Serve al giorno" : "Al giorno", usd(data.daysLeft ? t.needPerDay : t.perDay), data.daysLeft && ok(t.perDay) ? `oggi ne fa ${usd(t.perDay)}` : null],
    [cap(prevName), usd(t.prev), ok(t.deltaPrev) ? <span key="d" style={{ color: t.deltaPrev >= 0 ? CP.accentGreen : CP.textMuted }}>{t.deltaPrev >= 0 ? "+" : "−"}${group(t.deltaPrev)}{data.daysLeft ? " nella proiezione" : ""}</span> : null],
  ];
  return (
    <>
      <div className="vt-row21" style={{ marginBottom: 16 }}>
        <section className="vt-glass" style={{ "--vt-i": 1, borderRadius: 22, padding: 18, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: CP.textPrimary }}>{cap(curName)} di tutto lo split</div>
            <div style={{ fontSize: 12.5, color: CP.textMuted }}>venduto sommato giorno per giorno{data.live ? ", oggi in corso" : ""}</div>
          </div>
          <MonthArea cur={cur} prev={data.prevDaily || []} days={data.daysInMonth} prevDays={prevDays} upto={upto}
            goal={hasGoal ? t.goal : null} curLabel={cap(curName)} prevLabel={cap(prevName)} />
        </section>
        <section className="vt-glass" data-lvl={t.status === "arriva" ? 0 : undefined} style={{ "--vt-i": 2, borderRadius: 22, padding: 18, minWidth: 0, display: "grid", gap: 12, alignContent: "start" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: CP.textPrimary }}>Il goal dello split</div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            {hasGoal && <Gauge value={t.pctActual} mark={data.daysLeft ? data.idealPct : null} proj={data.daysLeft ? t.reach : null} good={t.status === "arriva"}
              centerSub={`del goal di ${curName}`} label={`Goal dello split a ${curName}`} />}
            <div style={{ display: "grid", gap: 10, flex: "1 1 150px", minWidth: 0 }}>
              {lines.map(([k, v, sub]) => (
                <div key={k} style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: CP.textMuted }}>{k}</div>
                  <div style={{ fontSize: 19, fontWeight: 600, color: CP.textPrimary, ...NUM }}><VetroNum value={v} /></div>
                  {sub && <div style={{ fontSize: 12, color: CP.textSecondary, ...NUM }}>{sub}</div>}
                </div>
              ))}
            </div>
          </div>
          {hasGoal && <GaugeKey proj={Boolean(data.daysLeft)} mark={Boolean(data.daysLeft)} good={t.status === "arriva"} />}
        </section>
      </div>
      {rings.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap", margin: "0 2px 10px" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: CP.textPrimary }}>Chi arriva al goal</div>
            <div style={{ fontSize: 12.5, color: CP.textMuted }}>in ordine di arrivo previsto sul proprio goal{noGoal ? ` · ${noGoal} senza goal, in fondo alla pagina` : ""}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {rings.map((c, i) => (
              <GoalRing key={c.slug} i={Math.min(i, 8)} pct={c.pctActual} mark={data.daysLeft ? data.idealPct : null}
                tone={c.status === "arriva" ? "good" : c.status === "vicina" ? "near" : null}
                title={<>{c.rank ? <span style={{ color: CP.textMuted, fontWeight: 400 }}>{c.rank}° </span> : null}{c.name}</>}
                sub={`${usdShort(c.mtd)} di ${usdShort(c.goal)}`} href={ecoOf.has(c.slug) ? `#eco-${ecoOf.get(c.slug)}` : undefined}
                highlight={mine.has(c.slug)} badge={<RingBadge r={c} closed={!data.daysLeft} />} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

const usdShort = (v) => (!ok(v) ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(1).replace(".", ",")}M` : v >= 1e4 ? `$${Math.round(v / 1e3)}k` : v >= 1e3 ? `$${(v / 1e3).toFixed(1).replace(".", ",")}k` : `$${Math.round(v)}`);

function RingBadge({ r, closed }) {
  const base = { fontSize: 11.5, fontWeight: 500, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap" };
  if (r.status === "arriva") return <span style={{ ...base, background: alpha(CP.accentGreen, "1f"), color: CP.accentGreen }}>{closed ? "goal raggiunto" : "ci arriva"}</span>;
  if (closed) return null;
  if (r.status === "vicina") return <span style={{ ...base, background: alpha(CP.accent, "1f"), color: CP.accent }}>ci è vicina</span>;
  if (ok(r.perDay) && ok(r.needPerDay)) return <span style={{ ...base, color: CP.textSecondary, fontWeight: 400 }}>+{usdShort(r.needPerDay - r.perDay)} al giorno</span>;
  return null;
}

function StatusText({ r, closed }) {
  if (closed) return r.status === "arriva" ? <span style={{ color: CP.accentGreen }}>goal raggiunto</span> : ok(r.pctActual) ? <span>{pct(r.pctActual)} del goal</span> : null;
  if (r.status === "arriva") return <span style={{ color: CP.accentGreen }}>arriva al goal</span>;
  if (r.status === "vicina") return <span style={{ color: CP.accent }}>è vicino al goal</span>;
  if (r.status === "sotto") return <span>servono {usd(r.needPerDay)} al giorno</span>;
  return null;
}

function Pill({ r }) {
  const base = { display: "inline-block", fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" };
  if (r.status === "arriva") return <span style={{ ...base, background: alpha(CP.accentGreen, "1f"), color: CP.accentGreen }}>ci arriva</span>;
  if (r.status === "vicina") return <span style={{ ...base, background: alpha(CP.accent, "1f"), color: CP.accent }}>ci è vicina</span>;
  if (r.status === "sotto" && ok(r.perDay) && ok(r.needPerDay)) return <span style={{ ...base, padding: "3px 0", color: CP.textSecondary, fontWeight: 400 }}>+{usd(r.needPerDay - r.perDay)} al giorno</span>;
  return null;
}

// ─── Un ecosistema: totale di squadra + le sue creator ──────────────────────

function Ecosystem({ g, data, mine, editing, onSaved }) {
  const pctOfGoal = ok(g.pctActual) ? Math.min(1, g.pctActual) : null;
  // Una creator da sola: il titolo È la sua riga → niente tabella che ripete gli stessi numeri
  // (restano le righe per paese se ha più account, e la tabella intera in modifica).
  const solo = g.creators.length === 1 ? g.creators[0] : null;
  const showTable = editing || !solo || solo.accounts.length > 1;
  const soloLine = solo ? [[...new Set(solo.accounts.map((a) => a.sm).filter(Boolean))].join(" · ") && `SM ${[...new Set(solo.accounts.map((a) => a.sm).filter(Boolean))].join(" · ")}`, [...new Set(solo.accounts.map((a) => a.am).filter(Boolean))].join(" · ") && `AM ${[...new Set(solo.accounts.map((a) => a.am).filter(Boolean))].join(" · ")}`].filter(Boolean).join(" · ") : null;
  const isMine = solo ? mine.has(solo.slug) : false;
  return (
    <section id={`eco-${g.id}`} className="vt-glass" data-lvl={g.status === "arriva" ? 0 : undefined} style={{ ...card, overflow: "hidden", scrollMarginTop: 80, ...(isMine ? { borderColor: alpha(CP.accent, "66") } : null) }}>
      <header style={{ padding: "16px 18px 14px", display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            {g.rank && <span style={{ fontSize: 13, fontWeight: 500, color: CP.textMuted, ...NUM }}>{g.rank}°</span>}
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: CP.textPrimary }}>{g.name}</h2>
            {isMine && <span style={{ fontSize: 11.5, color: CP.accent, fontWeight: 500 }}>la tua</span>}
          </div>
          <div style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 3 }}>{solo ? (soloLine || (solo.name !== g.name ? solo.name : "")) : g.creators.map((c) => c.name).join(" · ")}</div>
        </div>
        {ok(g.goal) && (
          <div style={{ display: "flex", gap: 22, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Stat label="venduto" value={usd(g.mtd)} sub={`di ${usd(g.goal)}`} />
            <Stat label="% goal" value={pct(g.pctActual)} color={pctColor(g, data.idealPct)} />
            {data.daysLeft > 0 && <Stat label="fa · serve al giorno" value={`${usd(g.perDay)} · ${usd(g.needPerDay)}`} />}
            <div style={{ paddingBottom: 3 }}><Pill r={g} /></div>
          </div>
        )}
      </header>
      {ok(g.goal) && (
        <div style={{ position: "relative", height: 6, margin: "0 18px 14px", borderRadius: 999, background: alpha(CP.textPrimary, "0f") }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(pctOfGoal || 0) * 100}%`, borderRadius: 999, background: g.status === "arriva" ? CP.accentGreen : CP.accent }} />
          {data.daysLeft > 0 && <div title={`ritmo ideale: ${pct(data.idealPct)}`} style={{ position: "absolute", left: `${data.idealPct * 100}%`, top: -4, bottom: -4, width: 2, borderRadius: 1, background: CP.textSecondary }} />}
        </div>
      )}
      {showTable && <div style={{ overflowX: "auto", borderTop: `1px solid ${CP.borderSoft}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left", ...stick(false) }}>Creator</th>
              <th style={th}>Venduto</th>
              <th style={th}>Goal</th>
              <th style={th}>% goal</th>
              {data.daysLeft > 0 && <th style={th} title="media al giorno sui giorni finiti">Fa al giorno</th>}
              {data.daysLeft > 0 && <th style={th} title="quanto al giorno da qui a fine mese per arrivare al goal">Serve al giorno</th>}
              <th style={{ ...th, textAlign: "left", width: 150 }} />
            </tr>
          </thead>
          <tbody>
            {g.creators.map((c) => <CreatorRows key={c.slug} c={c} data={data} mine={mine.has(c.slug)} editing={editing} onSaved={onSaved} hideMain={Boolean(solo) && !editing} />)}
          </tbody>
        </table>
      </div>}
    </section>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: CP.textMuted }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: color || CP.textPrimary, ...NUM, whiteSpace: "nowrap" }}>{value}{sub && <span style={{ fontSize: 12.5, fontWeight: 400, color: CP.textMuted }}> {sub}</span>}</div>
    </div>
  );
}

function CreatorRows({ c, data, mine, editing, onSaved, hideMain }) {
  const multi = c.accounts.length > 1;
  const single = !multi ? c.accounts[0] : null;
  const smList = [...new Set(c.accounts.map((a) => a.sm).filter(Boolean))].join(" · ");
  const rowBg = mine ? alpha(CP.accent, "12") : null;
  return (
    <>
      {!hideMain && <tr style={{ background: rowBg }}>
        <td style={{ ...td, ...stick(false, rowBg) }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontWeight: 500, color: CP.textPrimary }}>{c.name}</span>
            {mine && <span style={{ fontSize: 11, color: CP.accent, fontWeight: 500 }}>la tua</span>}
          </div>
          {!editing && (smList || single?.am) && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 1 }}>{[smList && `SM ${smList}`, single?.am && `AM ${single.am}`].filter(Boolean).join(" · ")}</div>}
          {editing && single && <People a={single} slug={c.slug} onSaved={onSaved} />}
        </td>
        <Nums r={c} data={data} strong goalEdit={single && editing ? { slug: c.slug, country: single.country, onSaved } : null} />
      </tr>}
      {multi && c.accounts.map((a) => (
        <tr key={a.country} style={{ background: rowBg }}>
          <td style={{ ...sub, paddingLeft: 28, ...stick(true, rowBg) }}>
            {COUNTRY_LONG[a.country] || a.country}
            {editing && <People a={a} slug={c.slug} onSaved={onSaved} />}
          </td>
          <Nums r={a} data={data} isSub showPill={hideMain} goalEdit={editing ? { slug: c.slug, country: a.country, onSaved } : null} />
        </tr>
      ))}
    </>
  );
}

function Nums({ r, data, strong, isSub, goalEdit, showPill }) {
  const base = { ...(isSub ? sub : td), textAlign: "right", ...NUM, ...(strong ? { fontWeight: 500 } : null) };
  return (
    <>
      <td style={base}>{usd(r.mtd)}</td>
      <td style={{ ...base, color: CP.textSecondary }}>{goalEdit ? <EditCell value={r.goal} numeric save={(v) => put({ creator: goalEdit.slug, country: goalEdit.country, date: data.asOf, goal: v === "" ? null : Number(v) }, goalEdit.onSaved)} /> : usd(r.goal)}</td>
      <td style={{ ...base, color: pctColor(r, data.idealPct) }}>{pct(r.pctActual)}</td>
      {data.daysLeft > 0 && <td style={base}>{usd(r.perDay)}</td>}
      {data.daysLeft > 0 && <td style={{ ...base, color: CP.textSecondary }}>{r.status === "arriva" ? "—" : usd(r.needPerDay)}</td>}
      <td style={{ ...(isSub ? sub : td), paddingLeft: 16 }}>{(!isSub || showPill) && <Pill r={r} />}</td>
    </>
  );
}

function People({ a, slug, onSaved }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
      <EditCell value={a.sm} placeholder="SM" save={(v) => put({ creator: slug, country: a.country, sm: v }, onSaved)} />
      <EditCell value={a.am} placeholder="AM" save={(v) => put({ creator: slug, country: a.country, am: v }, onSaved)} />
    </div>
  );
}

async function put(body, onSaved) {
  const r = await fetch("/api/admin/bilancio", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Salvataggio non riuscito");
  onSaved?.();
}

function EditCell({ value, numeric, placeholder, save }) {
  const [v, setV] = useState(value ?? "");
  const [state, setState] = useState(null); // null | "saving" | "ok" | messaggio d'errore
  useEffect(() => { setV(value ?? ""); }, [value]);
  const commit = async () => {
    if (String(v) === String(value ?? "")) return;
    setState("saving");
    try { await save(String(v).trim()); setState("ok"); } catch (e) { setState(e.message); }
  };
  const err = state && state !== "saving" && state !== "ok";
  return (
    <input
      value={v}
      inputMode={numeric ? "numeric" : undefined}
      placeholder={placeholder || (numeric ? "goal $" : "—")}
      title={err ? state : placeholder}
      onChange={(e) => { setV(numeric ? e.target.value.replace(/[^\d]/g, "") : e.target.value); setState(null); }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{
        width: numeric ? 92 : 104, padding: "4px 8px", borderRadius: 6, fontSize: 12.5, fontWeight: 400, textAlign: numeric ? "right" : "left", ...NUM,
        background: CP.bg, color: CP.textPrimary,
        border: `1px solid ${err ? CP.accentRed : state === "ok" ? CP.accentGreen : CP.border}`,
      }}
    />
  );
}

// ─── Editor degli ecosistemi (solo admin) ───────────────────────────────────

function GroupEditor({ data, onSaved }) {
  const init = () => {
    const groups = (data.groupsDef || []).map((g) => ({ ...g, slugs: [...g.slugs] }));
    const of = {};
    for (const g of groups) for (const s of g.slugs) of[s] = g.id;
    return { groups, of };
  };
  const [st, setSt] = useState(init);
  const [msg, setMsg] = useState(null);
  const ids = st.groups.map((g) => g.id);
  const rename = (id, name) => setSt((s) => ({ ...s, groups: s.groups.map((g) => (g.id === id ? { ...g, name } : g)) }));
  const assign = (slug, id) => setSt((s) => ({ ...s, of: { ...s.of, [slug]: id || undefined } }));
  const add = () => setSt((s) => {
    let k = s.groups.length + 1; while (s.groups.some((g) => g.id === `eco-${k}`)) k++;
    return { ...s, groups: [...s.groups, { id: `eco-${k}`, name: `Ecosistema ${k}`, slugs: [] }] };
  });
  const save = async () => {
    setMsg("Salvo…");
    const groups = st.groups.map((g) => ({ id: g.id, name: g.name, slugs: data.allCreators.map((c) => c.slug).filter((s) => st.of[s] === g.id) }));
    try {
      const r = await fetch("/api/admin/bilancio", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ groups }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Salvataggio non riuscito");
      setMsg("Salvato"); onSaved?.();
    } catch (e) { setMsg(e.message); }
  };
  return (
    <section className="vt-glass" style={{ ...card, padding: "16px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>Ecosistemi</h2>
        <span style={{ fontSize: 12.5, color: CP.textMuted, maxWidth: 720 }}>Un gruppo di creator che condividono le persone. Ogni creator sta in un solo ecosistema; senza ecosistema finisce in «Altre creator». Goal, SM e AM si cambiano direttamente nelle tabelle sotto.</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {st.groups.map((g) => (
          <input key={g.id} value={g.name} onChange={(e) => rename(g.id, e.target.value)} aria-label="Nome dell'ecosistema"
            style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.bg, color: CP.textPrimary, fontSize: 13, width: 170 }} />
        ))}
        <button onClick={add} style={{ ...btn(false), padding: "6px 12px", fontSize: 13 }}><Plus size={14} /> Nuovo ecosistema</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
        {data.allCreators.map((c) => (
          <label key={c.slug} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13, color: CP.textPrimary, padding: "6px 10px", borderRadius: 8, background: alpha(CP.textPrimary, "06") }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            <select value={ids.includes(st.of[c.slug]) ? st.of[c.slug] : ""} onChange={(e) => assign(c.slug, e.target.value)}
              style={{ fontSize: 12.5, padding: "3px 6px", borderRadius: 6, border: `1px solid ${CP.border}`, background: CP.bg, color: CP.textPrimary, maxWidth: 130 }}>
              <option value="">nessuno</option>
              {st.groups.map((g) => <option key={g.id} value={g.id}>{g.name || "senza nome"}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <button onClick={save} style={btn(true)}><Check size={14} /> Salva gli ecosistemi</button>
        {msg && <span style={{ fontSize: 13, color: msg === "Salvato" ? CP.accentGreen : CP.textSecondary }}>{msg}</span>}
      </div>
    </section>
  );
}

// ─── La giornata scelta ──────────────────────────────────────────────────────

function TheDay({ data }) {
  const rows = data.creators.flatMap((c) => (c.accounts.length > 1 ? c.accounts.map((a) => ({ name: `${c.name} ${a.country}`, ...a })) : [{ name: c.name, ...c.accounts[0] }]));
  rows.sort((a, b) => (b.day || 0) - (a.day || 0));
  const t = data.totals;
  const prevLabel = data.prevDayDate ? dayLabel(data.prevDayDate).split(" ").slice(0, 2).join(" ") : null;
  return (
    <section style={{ minWidth: 0 }}>
      <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 10px", color: CP.textPrimary }}>
        La giornata <span style={{ color: CP.textMuted, fontWeight: 400, fontSize: 13.5 }}>{dayLabel(data.asOf)}{data.live ? " · in corso" : ""}</span>
      </h2>
      <div className="vt-glass" style={{ ...card, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "left" }}>Creator</th>
            {prevLabel && <th style={th}>{prevLabel}</th>}
            <th style={th}>Entrate</th>
            <th style={th}>Target</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.creator_id}>
                <td style={td}>{r.name}</td>
                {prevLabel && <td style={{ ...td, textAlign: "right", ...NUM, color: ok(r.targetDay) && r.prevDay >= r.targetDay ? CP.accentGreen : CP.textSecondary }}>{usd(r.prevDay)}</td>}
                <td style={{ ...td, textAlign: "right", ...NUM, fontWeight: 500, color: ok(r.targetDay) && r.day >= r.targetDay ? CP.accentGreen : CP.textPrimary }}>{usd(r.day)}</td>
                <td style={{ ...td, textAlign: "right", ...NUM, color: CP.textMuted }}>{usd(r.targetDay)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, fontWeight: 500, borderTop: `1px solid ${CP.borderStrong}` }}>Totale</td>
              {prevLabel && <td style={{ ...td, fontWeight: 500, textAlign: "right", ...NUM, borderTop: `1px solid ${CP.borderStrong}` }}>{usd(t.prevDay)}</td>}
              <td style={{ ...td, fontWeight: 500, textAlign: "right", ...NUM, borderTop: `1px solid ${CP.borderStrong}` }}>{usd(t.day)}</td>
              <td style={{ ...td, fontWeight: 500, textAlign: "right", ...NUM, borderTop: `1px solid ${CP.borderStrong}` }}>{usd(t.targetDay)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: CP.textMuted, padding: "8px 14px 12px" }}>
          {data.live ? "Oggi è in corso e cresce fino a mezzanotte (ora UTC, come nel foglio). " : ""}Verde = target del giorno raggiunto.
        </div>
      </div>
    </section>
  );
}

// ─── Andamento del mese (clic su un giorno = vai a quel giorno) ─────────────

function Days({ data, go }) {
  const cols = data.countries;
  const days = data.days.filter((d) => !d.future);
  return (
    <section style={{ minWidth: 0 }}>
      <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 10px", color: CP.textPrimary }}>
        Andamento di {monthLabel(data.month).toLowerCase()} <span style={{ color: CP.textMuted, fontWeight: 400, fontSize: 13.5 }}>tocca un giorno per aprirlo</span>
      </h2>
      <div className="vt-glass" style={{ ...card, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Giorno</th>
              {cols.map((k) => <th key={k} style={th}>{k}</th>)}
              <th style={th}>Totale</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const weekend = d.weekday === 0 || d.weekday === 6;
              const bg = d.selected ? alpha(CP.accent, "14") : null;
              return (
                <tr key={d.date} onClick={() => go(d.date)} style={{ cursor: "pointer", background: bg }}>
                  <td style={{ ...td, color: weekend ? CP.gold : CP.textPrimary, fontWeight: d.selected ? 500 : 400 }}>
                    {WEEKDAYS[d.weekday]} {d.day}{d.partial && <span style={{ color: CP.textMuted, fontSize: 12, fontWeight: 400 }}> · in corso</span>}
                  </td>
                  {cols.map((k) => <td key={k} style={{ ...td, textAlign: "right", ...NUM, color: CP.textSecondary }}>{d[k] ? usd(d[k]) : "–"}</td>)}
                  <td style={{ ...td, textAlign: "right", ...NUM, fontWeight: 500 }}>{usd(d.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Come si legge ───────────────────────────────────────────────────────────

function Explain({ data }) {
  return (
    <details style={{ marginTop: 24, fontSize: 13, color: CP.textSecondary, lineHeight: 1.6 }}>
      <summary style={{ cursor: "pointer", color: CP.textPrimary }}>Come si calcola</summary>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        <li><b>Venduto</b>: il netto delle vendite dal warehouse, per giorno (ora UTC), fino al giorno scelto. Sono gli stessi numeri dei fogli-creator.</li>
        <li><b>% goal</b>: venduto diviso goal. È verde quando è pari o sopra il ritmo ideale ({pct(data.idealPct)}: {data.closedDays} giorni finiti su {data.daysInMonth}).</li>
        <li><b>Fa al giorno</b>: la media dei giorni finiti. <b>Serve al giorno</b>: quanto manca al goal diviso i giorni che restano.</li>
        <li><b>Ci arriva</b>: a questo ritmo supera il goal. <b>Ci è vicina</b>: fa almeno il 90% di quello che le serve. Altrimenti si legge quanto le serve in più al giorno.</li>
        <li><b>Ecosistemi</b>: gruppi di creator che condividono le persone. Il totale dell'ecosistema si misura sulla somma dei goal; gli ecosistemi sono in ordine di quanto arrivano vicino al loro goal.</li>
        <li><b>Il giorno</b>: con le frecce o il calendario rivedi com'era la situazione a fine di un giorno passato, anche nei mesi chiusi.</li>
        <li>I goal sono gli stessi di Revenue e chat: cambiarli qui li cambia anche lì. Le creator sono quelle dello split.</li>
      </ul>
    </details>
  );
}

const th = { padding: "10px 14px", fontSize: 12, fontWeight: 500, color: CP.textMuted, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap", textAlign: "right" };
const td = { padding: "10px 14px", borderBottom: `1px solid ${CP.borderSoft}`, color: CP.textPrimary, whiteSpace: "nowrap" };
const SUB_BG = alpha(CP.textPrimary, "05");
const sub = { ...td, padding: "6px 14px", fontSize: 12.5, color: CP.textSecondary, background: SUB_BG };
// Colonna Creator ferma a sinistra quando la tabella scorre (telefono): fondo PIENO (CP.panel),
// altrimenti i numeri che scorrono sotto si leggono in trasparenza nello stile Casa.
const stick = (isSub, tint) => {
  const layers = [isSub && SUB_BG, tint].filter(Boolean).map((c) => `linear-gradient(${c}, ${c})`);
  return { position: "sticky", left: 0, zIndex: 1, background: layers.length ? `${layers.join(", ")}, ${CP.panel}` : CP.panel };
};
