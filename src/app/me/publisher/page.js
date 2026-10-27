"use client";

/**
 * /me/publisher — la pagina del publisher su X (27/10/2026, disegno di Nicholas).
 * Ogni fan che arriva dal suo link apre una BUSTA: per 30 giorni si vede quanto spende,
 * al 30° giorno la busta si chiude (missione compiuta) e il compenso si sblocca e si somma.
 * Vede SOLO le sue buste: fan in codice (mai nome o username), niente fee, niente altri
 * publisher — il deal è una percentuale sulla spesa (lib/publisher-x getMyPublisher).
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2, Check, Hourglass, Wallet, Users, Percent } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, FilterChip, SectionTitle } from "@/components/ds";
import VetroScope, { useVetro } from "@/components/VetroScope";
import { KpiCard } from "@/components/VetroCharts";

const fetcher = async (url) => {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `Errore ${r.status}`);
  return j;
};
const usd = (n, dec = 2) => (n === null || n === undefined ? "—" : `$${new Intl.NumberFormat("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: "always" }).format(n)}`);
const int = (n) => new Intl.NumberFormat("it-IT", { useGrouping: "always" }).format(n || 0);
const pct = (f) => `${String(Math.round(f * 1000) / 10).replace(".", ",")}%`;
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const meseLungo = (m) => { const [y, mm] = String(m).split("-").map(Number); return `${MESI[mm - 1]} ${y}`; };
const dm = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" }) : "—"; };
const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const muted = { fontSize: 12.5, color: CP.textMuted };
const PAGE = 100;

const SORTS = [
  ["recent", "Ultimi entrati", (a, b) => String(b.entered).localeCompare(String(a.entered))],
  ["spent", "Spendono di più", (a, b) => b.spent - a.spent],
  ["closing", "Vicini alla chiusura", (a, b) => (a.closed - b.closed) || (b.day - a.day)],
  ["oldest", "Primi entrati", (a, b) => String(a.entered).localeCompare(String(b.entered))],
];

function Busta({ e, windowDays }) {
  const pctDone = Math.min(100, (e.day / windowDays) * 100);
  return (
    <div className="vt-glass" style={{ borderRadius: 16, padding: "12px 14px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "6px 14px", alignItems: "center" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14.5, fontWeight: 500, color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>Fan #{e.code}</span>
          <span style={muted}>{e.profile} · entrato il {dm(e.entered)}</span>
        </div>
      </div>
      <div style={{ textAlign: "right", fontSize: 15, fontWeight: 600, color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{usd(e.spent)}</div>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ height: 6, borderRadius: 4, background: CP.borderSoft, overflow: "hidden" }} aria-hidden>
          <div style={{ width: `${pctDone}%`, height: "100%", borderRadius: 4, background: e.closed ? CP.accentGreen : CP.accent }} />
        </div>
        <div style={{ ...muted, display: "flex", gap: 6, alignItems: "center" }}>
          {e.closed
            ? <><Check size={13} color={CP.accentGreen} /><span style={{ color: CP.accentGreen }}>Busta chiusa il {dm(e.closeAt)}: missione compiuta</span></>
            : <><Hourglass size={12} /><span>Giorno {e.day} di {windowDays} · si chiude il {dm(e.closeAt)}</span></>}
        </div>
      </div>
      <div style={{ textAlign: "right", ...muted }}>
        {e.closed ? <span style={{ color: CP.textPrimary }}>a te {usd(e.bonus)}</span> : <span>a te finora {usd(e.bonus)}</span>}
      </div>
    </div>
  );
}

export default function MyPublisherPage() {
  const { data, error, isLoading } = useSWR("/api/me/publisher", fetcher, { revalidateOnFocus: false });
  const [vetro] = useVetro();
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("recent");
  const [profile, setProfile] = useState("");
  const [shown, setShown] = useState(PAGE);

  const envs = useMemo(() => data?.envelopes || [], [data]);
  const profiles = useMemo(() => [...new Set(envs.map((e) => e.profile))].sort((a, b) => a.localeCompare(b, "it")), [envs]);
  const byProfile = envs.filter((e) => !profile || e.profile === profile);
  const counts = { all: byProfile.length, open: byProfile.filter((e) => !e.closed).length, closed: byProfile.filter((e) => e.closed).length };
  const list = useMemo(() => {
    const cmp = SORTS.find((s) => s[0] === sort)?.[2] || SORTS[0][2];
    return byProfile.filter((e) => status === "all" || (status === "open" ? !e.closed : e.closed)).sort(cmp);
  }, [byProfile, status, sort]);

  const month = thisMonth();
  const cur = data?.months?.find((m) => m.month === month) || { closed: 0, bonus: 0, base: data?.deal?.base || 0, total: data?.deal?.base || 0 };
  const sameRate = data?.deal?.rates?.every((r) => r.rate === data.deal.rate);

  return (
    <VetroScope on={vetro}>
      <div style={{ display: "grid", gap: 18, maxWidth: 1100, margin: "0 auto", padding: "8px 0 48px" }}>
        <PageHead title="I miei fan"
          subtitle="Ogni fan che arriva dal tuo link apre una busta: per 30 giorni conta tutto quello che spende. Al 30° giorno la busta si chiude e il tuo compenso si sblocca." />

        {error && <Notice danger>{error.message}</Notice>}
        {isLoading && <div style={{ ...muted, display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={14} />Carico le tue buste…</div>}
        {data && !data.linked && (
          <Notice>Questo account non è ancora collegato a un link. Chiedi a chi ti ha invitato di registrare la tua email come publisher: la pagina si riempie da sola al prossimo accesso.</Notice>
        )}

        {data?.linked && (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <KpiCard i={0} icon={Wallet} tone={2} label={`Sbloccato a ${meseLungo(month)}`} value={usd(cur.total)}
              sub={`${int(cur.closed)} buste chiuse: ${usd(cur.bonus)}${cur.base ? ` · base ${usd(cur.base, 0)}` : ""}`} />
            <KpiCard i={1} icon={Hourglass} tone={0} label="Sta maturando" value={usd(data.open.bonus)}
              sub={`${int(data.open.count)} buste aperte: si sbloccano al 30° giorno di ogni fan`} />
            <KpiCard i={2} icon={Users} tone={1} label="Fan nelle tue buste" value={int(envs.length)} sub="quelle aperte e le chiuse degli ultimi 3 mesi" />
            <KpiCard i={3} icon={Percent} tone={3} label="Il tuo deal" value={pct(data.deal.rate)}
              sub={`di quello che spendono i tuoi fan nei primi 30 giorni${data.deal.base ? `, più ${usd(data.deal.base, 0)} al mese` : ""}`} />
          </div>
          {!sameRate && data.deal.rates.length > 1 && (
            <div style={muted}>Percentuale per profilo: {data.deal.rates.map((r) => `${r.profile} ${pct(r.rate)}`).join(" · ")}.</div>
          )}

          <section style={{ display: "grid", gap: 10 }}>
            <SectionTitle aside="i fan sono in codice: il nome non serve per il tuo lavoro">Le tue buste</SectionTitle>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <FilterChip label={`Tutte (${int(counts.all)})`} active={status === "all"} onClick={() => { setStatus("all"); setShown(PAGE); }} />
              <FilterChip label={`Aperte (${int(counts.open)})`} active={status === "open"} onClick={() => { setStatus("open"); setShown(PAGE); }} />
              <FilterChip label={`Chiuse (${int(counts.closed)})`} active={status === "closed"} onClick={() => { setStatus("closed"); setShown(PAGE); }} />
              <span style={{ flex: 1 }} />
              {profiles.length > 1 && (
                <select value={profile} onChange={(e) => { setProfile(e.target.value); setShown(PAGE); }} aria-label="Profilo"
                  style={{ font: "inherit", fontSize: 13, padding: "7px 10px", borderRadius: 10, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontFamily: FONTS.body }}>
                  <option value="">Tutti i profili</option>
                  {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
              <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordina"
                style={{ font: "inherit", fontSize: 13, padding: "7px 10px", borderRadius: 10, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontFamily: FONTS.body }}>
                {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            {envs.length === 0 && <Notice>Ancora nessun fan dal tuo link. Appena qualcuno si iscrive, qui si apre la sua busta.</Notice>}
            {envs.length > 0 && list.length === 0 && <div style={muted}>Nessuna busta con questi filtri.</div>}
            <div style={{ display: "grid", gap: 8 }}>
              {list.slice(0, shown).map((e) => <Busta key={`${e.code}-${e.entered}`} e={e} windowDays={data.windowDays} />)}
            </div>
            {list.length > shown && (
              <button onClick={() => setShown((n) => n + PAGE)} style={{ justifySelf: "center", font: "inherit", fontSize: 13, padding: "8px 16px", borderRadius: 999, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, cursor: "pointer" }}>
                Mostra altre {int(Math.min(PAGE, list.length - shown))} di {int(list.length - shown)}
              </button>
            )}
          </section>

          {data.months.length > 0 && (
            <section className="vt-glass" style={{ borderRadius: 22, padding: 18, display: "grid", gap: 8 }}>
              <SectionTitle aside="ogni mese conta le buste che si sono chiuse in quel mese">Mese per mese</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 6, ...muted }}>
                <span>Mese</span><span style={{ textAlign: "right" }}>Buste chiuse</span><span style={{ textAlign: "right" }}>Hanno speso</span><span style={{ textAlign: "right" }}>A te</span>
              </div>
              {data.months.map((m) => (
                <div key={m.month} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 6, fontSize: 14, padding: "7px 0", borderTop: `1px solid ${CP.borderSoft}`, fontVariantNumeric: "tabular-nums", color: CP.textPrimary }}>
                  <span>{meseLungo(m.month)}{m.month === month ? <span style={muted}> · in corso</span> : null}</span>
                  <span style={{ textAlign: "right" }}>{int(m.closed)}</span>
                  <span style={{ textAlign: "right" }}>{usd(m.spent, 0)}</span>
                  <span style={{ textAlign: "right", fontWeight: 600 }}>{usd(m.total)}</span>
                </div>
              ))}
              <div style={muted}>«A te» = compenso delle buste chiuse{data.deal.base ? " più la base del mese" : ""}. Dati aggiornati a ieri sera ({dm(data.dataUntil)}).</div>
            </section>
          )}
        </>)}
      </div>
    </VetroScope>
  );
}
