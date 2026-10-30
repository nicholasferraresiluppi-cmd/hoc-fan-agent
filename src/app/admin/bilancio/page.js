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

import { Fragment, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { RefreshCw, Pencil, Check, ChevronLeft, ChevronRight, CalendarDays, Plus } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, Notice, card } from "@/components/ds";
import { liveFetcher } from "@/components/LiveCreatorPicker";
import { MONTHS_IT } from "@/lib/format";
import VetroScope, { useVetro, VetroSwitch } from "@/components/VetroScope";

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
        subtitle="Come il foglio Bilancio_unico_LIVE: andamento per paese, la giornata contro il target, il quadro per creator."
        actions={(
          <>
            <VetroSwitch on={vetro} set={setVetro} />
            {data?.canEdit && (
              <button onClick={() => setEditing((v) => !v)} style={btn(editing)}>
                {editing ? <Check size={14} /> : <Pencil size={14} />} {editing ? "Fatto" : "Goal, AM/SM ed ecosistemi"}
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
          <Sheet data={data} go={go} mine={mine} editing={editing} onSaved={() => mutate()} />
          {editing && <div style={{ marginTop: 22 }}><GroupEditor data={data} onSaved={() => mutate()} /></div>}
          {!ok(data.totals.goal) && <div style={{ marginTop: 12 }}><Notice>Nessun goal messo per {monthLabel(data.month)}: senza goal non c'è classifica, solo il venduto.</Notice></div>}
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

// ─── Il foglio (30/10/2026) ──────────────────────────────────────────────────
// Nicholas: «i bilanci che abbiamo in web app li vorrei vedere molto simili a quelli su Sheets».
// Stessa pianta del foglio Bilancio_unico_LIVE: in cima giorno, venduto del mese e proiezione; poi
// tre tabelle affiancate — andamento del mese per paese, la giornata contro il target, il quadro
// per creator (AM, SM, mese e proiezione). Le creator con più paesi prima, una riga per paese e il
// loro totale; poi i profili singolo paese; in fondo il totale generale. Colori del foglio tenuti
// leggeri (intestazioni per paese, totali in giallo, verde quando il target del giorno è preso);
// niente rosso per chi è indietro, come prima: si legge quanto serve al giorno.

const SH = { blue: "#4a7fd4", green: "#3f9b5a", grey: "#8a92a2", amber: "#d9a520", peach: "#e8a76a", navy: "#1f2a44" };
const COUNTRY_SHORT = { IT: "IT", EN: "ENG", ES: "ESP" };
const COUNTRY_TINT = { IT: SH.blue, EN: SH.green, ES: SH.grey };

/** Le righe come nel foglio: [{ kind:"multi", c, accounts }...], poi [{ kind:"single", c, a }...]. */
function sheetRows(creators) {
  const byName = (a, b) => a.name.localeCompare(b.name, "it");
  const multi = creators.filter((c) => c.accounts.length > 1).sort(byName);
  const single = creators.filter((c) => c.accounts.length === 1).sort(byName);
  return { multi, single };
}

function Sheet({ data, go, mine, editing, onSaved }) {
  const t = data.totals;
  const { multi, single } = useMemo(() => sheetRows(data.creators), [data]);
  return (
    <>
      <div className="vt-glass" style={{ ...card, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ background: SH.navy, color: "#fff", padding: "12px 18px", fontSize: 16, fontWeight: 600, letterSpacing: 0.2 }}>
          Bilancio creator · {monthLabel(data.month)} <span style={{ fontWeight: 400, opacity: 0.75 }}>· dati live dal warehouse</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <HeadCell label="Giorno" value={`${Number(data.asOf.slice(8))} di ${data.daysInMonth}`} note={data.live ? "in corso" : data.daysLeft ? "a fine giornata" : "mese chiuso"} />
          <HeadCell label="Revenue mese ad oggi" value={usd(t.mtd)} note={ok(t.goal) ? `${pct(t.pctActual)} del goal · ideale ${pct(data.idealPct)}` : null} />
          <HeadCell label={data.daysLeft ? "Proiezione fine mese" : "Chiuso a"} value={usd(data.daysLeft ? t.projection : t.mtd)} note={<StatusText r={t} closed={!data.daysLeft} />} />
          <HeadCell label="Goal del mese" value={usd(t.goal)} note={ok(t.targetDay) ? `${usd(t.targetDay)} al giorno` : "nessun goal messo"} />
          <HeadCell label="Mese precedente" value={usd(t.prev)} note={ok(t.deltaPrev) ? <span style={{ color: t.deltaPrev >= 0 ? CP.accentGreen : CP.textSecondary }}>{t.deltaPrev >= 0 ? "+" : "−"}${group(t.deltaPrev)}{data.daysLeft ? " nella proiezione" : ""}</span> : null} last />
        </div>
      </div>

      <div className="bil-grid">
        <Andamento data={data} go={go} />
        <Giornata data={data} multi={multi} single={single} />
        <Quadro data={data} multi={multi} single={single} mine={mine} editing={editing} onSaved={onSaved} />
        <Ecosistemi data={data} mine={mine} />
      </div>
      <style>{`
        .bil-grid { display: grid; gap: 16px; align-items: start; grid-template-columns: minmax(0, 1fr); }
        @media (min-width: 1100px) { .bil-grid { grid-template-columns: minmax(300px, 0.7fr) minmax(0, 1.9fr); grid-template-areas: "gio qua" "and eco"; } .bil-and { grid-area: and; } .bil-gio { grid-area: gio; } .bil-quadro { grid-area: qua; } .bil-eco { grid-area: eco; } }
        @media (min-width: 1900px) { .bil-grid { grid-template-columns: minmax(0, 0.95fr) minmax(0, 0.8fr) minmax(0, 1.9fr); grid-template-areas: "and gio qua" "and gio eco"; } }
      `}</style>
    </>
  );
}

function HeadCell({ label, value, note, last }) {
  return (
    <div style={{ padding: "12px 18px", borderRight: last ? "none" : `1px solid ${CP.borderSoft}`, borderTop: `1px solid ${CP.borderSoft}`, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: CP.textMuted }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: CP.textPrimary, marginTop: 2, ...NUM }}>{value}</div>
      {note && <div style={{ fontSize: 12, color: CP.textSecondary, marginTop: 2, ...NUM }}>{note}</div>}
    </div>
  );
}

function Block({ title, color, sub, className, children }) {
  return (
    <section className={className} style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 2px 8px", flexWrap: "wrap" }}>
        <span style={{ width: 4, height: 14, borderRadius: 2, background: color, alignSelf: "center" }} />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: CP.textPrimary }}>{title}</h2>
        {sub && <span style={{ fontSize: 12.5, color: CP.textMuted }}>{sub}</span>}
      </div>
      <div className="vt-glass" style={{ ...card, overflowX: "auto" }}>{children}</div>
    </section>
  );
}

const hd = (tint, align = "right") => ({ ...th, textAlign: align, background: tint ? alpha(tint, "24") : undefined, color: CP.textPrimary, fontWeight: 600, padding: "9px 12px" });
const cell = (extra) => ({ ...td, padding: "7px 12px", textAlign: "right", ...NUM, ...extra });
const TOTAL_BG = alpha(SH.amber, "2e");
const SUBTOTAL_BG = alpha(CP.textPrimary, "06");

function Tag({ country }) {
  return <span style={{ fontSize: 10.5, fontWeight: 600, padding: "1px 5px", borderRadius: 4, marginLeft: 6, color: COUNTRY_TINT[country] || CP.textMuted, background: alpha(COUNTRY_TINT[country] || CP.textMuted, "1c") }}>{COUNTRY_SHORT[country] || country}</span>;
}

function SectionRow({ label, span }) {
  return (
    <tr><td colSpan={span} style={{ ...td, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: CP.textSecondary, background: alpha(CP.textPrimary, "0a"), borderTop: `1px solid ${CP.border}` }}>{label}</td></tr>
  );
}

// ─── Andamento del mese (per paese) — clic su un giorno = vai a quel giorno ──

function Andamento({ data, go }) {
  const cols = data.countries;
  const tot = { total: 0 };
  for (const k of cols) tot[k] = 0;
  for (const d of data.days) if (!d.future) { for (const k of cols) tot[k] += d[k] || 0; tot.total += d.total || 0; }
  return (
    <Block className="bil-and" title="Andamento del mese" sub="per paese · tocca un giorno" color={SH.blue}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr>
          <th style={hd(SH.peach, "left")}>Giorno</th>
          {cols.map((k) => <th key={k} style={hd(COUNTRY_TINT[k])}>{COUNTRY_SHORT[k]}</th>)}
          <th style={hd(SH.amber)}>Totale</th>
        </tr></thead>
        <tbody>
          {data.days.map((d) => {
            const weekend = d.weekday === 0 || d.weekday === 6;
            const bg = d.selected ? alpha(CP.accent, "18") : null;
            return (
              <tr key={d.date} onClick={() => !d.future && go(d.date)} style={{ cursor: d.future ? "default" : "pointer", background: bg }}>
                <td style={cell({ textAlign: "left", color: d.future ? CP.textMuted : weekend ? CP.accent : CP.textPrimary, fontWeight: d.selected ? 600 : 400 })}>
                  {cap(WEEKDAYS[d.weekday]).slice(0, 3)} {d.day}{d.partial && <span style={{ color: CP.textMuted, fontSize: 11.5 }}> · in corso</span>}
                </td>
                {cols.map((k) => <td key={k} style={cell({ color: CP.textSecondary })}>{d.future ? "" : d[k] ? usd(d[k]) : "–"}</td>)}
                <td style={cell({ fontWeight: 500 })}>{d.future ? "" : usd(d.total)}</td>
              </tr>
            );
          })}
          <tr style={{ background: TOTAL_BG }}>
            <td style={cell({ textAlign: "left", fontWeight: 600 })}>Totale</td>
            {cols.map((k) => <td key={k} style={cell({ fontWeight: 600 })}>{usd(tot[k])}</td>)}
            <td style={cell({ fontWeight: 600 })}>{usd(tot.total)}</td>
          </tr>
        </tbody>
      </table>
    </Block>
  );
}

// ─── La giornata: entrate contro target ──────────────────────────────────────

function Giornata({ data, multi, single }) {
  const t = data.totals;
  return <GiornataBody data={data} t={t} multi={multi} single={single} Row={GRow} />;
}

const hit = (r) => ok(r.targetDay) && r.targetDay > 0 && r.day >= r.targetDay;
function GRow({ name, r, strong, bg }) {
  return (
    <tr style={{ background: bg }}>
      <td style={cell({ textAlign: "left", fontWeight: strong ? 600 : 400 })}>{name}</td>
      <td style={cell({ fontWeight: strong ? 600 : 500, background: hit(r) ? alpha(CP.accentGreen, "26") : undefined })}>{usd(r.day)}</td>
      <td style={cell({ color: CP.textSecondary, fontWeight: strong ? 600 : 400 })}>{usd(r.targetDay)}</td>
    </tr>
  );
}

function GiornataBody({ data, t, multi, single, Row }) {
  return (
    <Block className="bil-gio" title={data.live ? "La giornata (oggi)" : "La giornata"} sub={dayLabel(data.asOf)} color={SH.green}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr>
          <th style={hd(SH.green, "left")}>Creator</th>
          <th style={hd(CP.accent)}>{data.live ? "Entrate oggi" : "Entrate"}</th>
          <th style={hd(SH.blue)}>{data.live ? "Target oggi" : "Target"}</th>
        </tr></thead>
        <tbody>
          {multi.map((c) => (
            <Fragment key={c.slug}>
              {c.accounts.map((a) => <Row key={a.country} name={<>{c.name}<Tag country={a.country} /></>} r={a} />)}
              <Row name={`${c.name} totale`} r={c} strong bg={SUBTOTAL_BG} />
            </Fragment>
          ))}
          {single.length > 0 && <SectionRow label="Profili singolo paese" span={3} />}
          {single.map((c) => <Row key={c.slug} name={<>{c.name}<Tag country={c.accounts[0].country} /></>} r={c.accounts[0]} />)}
          <Row name="Totale generale" r={t} strong bg={TOTAL_BG} />
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: CP.textMuted, padding: "8px 12px 10px" }}>
        {data.live ? "Oggi cresce fino a mezzanotte (ora UTC, come nel foglio). " : ""}Verde = target del giorno preso.
      </div>
    </Block>
  );
}

// ─── Quadro per creator: mese + proiezione ───────────────────────────────────

function Quadro({ data, multi, single, mine, editing, onSaved }) {
  const open = data.daysLeft > 0;
  const span = open ? 10 : 8;
  const ctx = { data, open, editing, onSaved };
  return <QuadroBody data={data} open={open} span={span} multi={multi} single={single} mine={mine} ctx={ctx} />;
}

function QRow({ name, r, acc, slug, strong, bg, rank, isMine, data, open, editing, onSaved }) {
    const rowBg = isMine ? alpha(CP.accent, "12") : bg;
    return (
      <tr style={{ background: rowBg }}>
        <td style={cell({ textAlign: "center", color: CP.textMuted, width: 36 })}>{rank ? `${rank}°` : ""}</td>
        <td style={cell({ textAlign: "left", fontWeight: strong ? 600 : 400, ...stick(false, rowBg) })}>
          {name}{isMine && <span style={{ fontSize: 11, color: CP.accent, fontWeight: 500, marginLeft: 6 }}>la tua</span>}
        </td>
        <td style={cell({ textAlign: "left", color: CP.textSecondary })}>{acc ? (editing ? <EditCell value={acc.am} placeholder="AM" save={(v) => put({ creator: slug, country: acc.country, am: v }, onSaved)} /> : acc.am || "") : ""}</td>
        <td style={cell({ textAlign: "left", color: CP.textSecondary })}>{acc ? (editing ? <EditCell value={acc.sm} placeholder="SM" save={(v) => put({ creator: slug, country: acc.country, sm: v }, onSaved)} /> : acc.sm || "") : ""}</td>
        <td style={cell({ fontWeight: strong ? 600 : 500 })}>{usd(r.mtd)}</td>
        <td style={cell({ color: CP.textSecondary, fontWeight: strong ? 600 : 400 })}>
          {acc && editing ? <EditCell value={r.goal} numeric save={(v) => put({ creator: slug, country: acc.country, date: data.asOf, goal: v === "" ? null : Number(v) }, onSaved)} /> : usd(r.goal)}
        </td>
        <td style={cell({ color: pctColor(r, data.idealPct), fontWeight: strong ? 600 : 400 })}>{pct(r.pctActual)}</td>
        {open && <td style={cell({ fontWeight: strong ? 600 : 400 })}>{usd(r.projection)}</td>}
        {open && <td style={cell({ color: CP.textSecondary })}>{r.status === "arriva" ? <span style={{ color: CP.accentGreen }}>ci arriva</span> : r.status === "vicina" ? <span style={{ color: CP.accent }}>vicina · {usd(r.needPerDay)}</span> : usd(r.needPerDay)}</td>}
        <td style={cell({ color: CP.textMuted })}>{usd(r.prev)}</td>
      </tr>
    );
}

function QuadroBody({ data, open, span, multi, single, mine, ctx }) {
  const Row = QRow;
  return (
    <Block className="bil-quadro" title="Quadro per creator" sub="mese + proiezione · posizione = arrivo previsto sul proprio goal" color={SH.navy}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
        <thead><tr>
          <th style={hd(SH.navy, "center")} title="Classifica: arrivo previsto diviso il proprio goal">Pos.</th>
          <th style={{ ...hd(SH.navy, "left"), ...stick(false, alpha(SH.navy, "24")) }}>Creator</th>
          <th style={hd(SH.navy, "left")}>AM</th>
          <th style={hd(SH.navy, "left")}>SM</th>
          <th style={hd(SH.navy)}>Revenue attuale</th>
          <th style={hd(SH.navy)}>Goal</th>
          <th style={hd(SH.navy)} title={`ritmo ideale ${pct(data.idealPct)}`}>% goal</th>
          {open && <th style={hd(SH.navy)}>Proiezione</th>}
          {open && <th style={hd(SH.navy)} title="quanto al giorno da qui a fine mese per arrivare al goal">Serve al giorno</th>}
          <th style={hd(SH.navy)}>Mese prima</th>
        </tr></thead>
        <tbody>
          {multi.map((c) => (
            <Fragment key={c.slug}>
              {c.accounts.map((a) => <Row {...ctx} key={a.country} name={<>{c.name}<Tag country={a.country} /></>} r={a} acc={a} slug={c.slug} isMine={mine.has(c.slug)} />)}
              <Row {...ctx} name={`${c.name} totale`} r={c} strong bg={SUBTOTAL_BG} rank={c.rank} isMine={mine.has(c.slug)} />
            </Fragment>
          ))}
          {single.length > 0 && <SectionRow label="Profili singolo paese" span={span} />}
          {single.map((c) => <Row {...ctx} key={c.slug} name={<>{c.name}<Tag country={c.accounts[0].country} /></>} r={c} acc={c.accounts[0]} slug={c.slug} rank={c.rank} isMine={mine.has(c.slug)} />)}
          <Row {...ctx} name="Totale generale" r={data.totals} strong bg={TOTAL_BG} />
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: CP.textMuted, padding: "8px 12px 10px" }}>
        % goal verde = pari o sopra il ritmo ideale ({pct(data.idealPct)}).{open ? " Serve al giorno = quanto manca al goal diviso i giorni che restano." : ""}
      </div>
    </Block>
  );
}

// ─── Ecosistemi: il totale di squadra contro la somma dei goal ───────────────

function Ecosistemi({ data, mine }) {
  const open = data.daysLeft > 0;
  const groups = data.groups.filter((g) => !g.other || data.groups.length > 1);
  if (!groups.length) return null;
  return (
    <Block className="bil-eco" title="Ecosistemi" sub="gruppi di creator che condividono le persone · in ordine di arrivo sul goal" color={CP.accent}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
          <thead><tr>
            <th style={hd(CP.accent, "center")}>Pos.</th>
            <th style={hd(CP.accent, "left")}>Ecosistema</th>
            <th style={hd(CP.accent)}>Revenue attuale</th>
            <th style={hd(CP.accent)}>Goal</th>
            <th style={hd(CP.accent)}>% goal</th>
            {open && <th style={hd(CP.accent)}>Proiezione</th>}
            {open && <th style={hd(CP.accent)}>Serve al giorno</th>}
          </tr></thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} style={{ background: g.creators.some((c) => mine.has(c.slug)) ? alpha(CP.accent, "12") : null }}>
                <td style={cell({ textAlign: "center", color: CP.textMuted, width: 36 })}>{g.rank ? `${g.rank}°` : ""}</td>
                <td style={cell({ textAlign: "left", whiteSpace: "normal" })}>
                  <div style={{ fontWeight: 600 }}>{g.name}</div>
                  <div style={{ fontSize: 12, color: CP.textMuted }}>{g.creators.map((c) => c.name).join(" · ")}</div>
                </td>
                <td style={cell({ fontWeight: 500 })}>{usd(g.mtd)}</td>
                <td style={cell({ color: CP.textSecondary })}>{usd(g.goal)}</td>
                <td style={cell({ color: pctColor(g, data.idealPct) })}>{pct(g.pctActual)}</td>
                {open && <td style={cell()}>{usd(g.projection)}</td>}
                {open && <td style={cell({ color: CP.textSecondary })}>{g.status === "arriva" ? <span style={{ color: CP.accentGreen }}>ci arriva</span> : usd(g.needPerDay)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
    </Block>
  );
}

function StatusText({ r, closed }) {
  if (closed) return r.status === "arriva" ? <span style={{ color: CP.accentGreen }}>goal raggiunto</span> : ok(r.pctActual) ? <span>{pct(r.pctActual)} del goal</span> : null;
  if (r.status === "arriva") return <span style={{ color: CP.accentGreen }}>arriva al goal</span>;
  if (r.status === "vicina") return <span style={{ color: CP.accent }}>è vicino al goal</span>;
  if (r.status === "sotto") return <span>servono {usd(r.needPerDay)} al giorno</span>;
  return null;
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
