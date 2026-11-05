"use client";

// Presenze Discord (03/11/2026) — chi è stato nelle stanze vocali del server «HOC House of Creators»,
// quanto, con il microfono aperto o chiuso e con chi. Dati dal bot presenze (lib/presenze-discord),
// giornata dalle 05:00 alle 05:00. Sezione riservata (lib/presenze-access): il file non contiene dati.

import { useMemo, useState } from "react";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Tabs, Metric, DataTable, Notice, SectionTitle, EmptyState, FilterBar, Segmented, Spiega, alpha } from "@/components/ds";
import { fmtInt } from "@/lib/format";

const API = "/api/admin/presenze-discord";
const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });

const TZ = "Europe/Rome";
const muted = { fontSize: 12, color: CP.textMuted };
const para = { fontSize: 14, color: CP.textSecondary, lineHeight: 1.55, margin: "0 0 12px", maxWidth: 780 };
const selectStyle = { background: CP.bgSunken, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: FONTS.body };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "0 0 18px" };

const dur = (ms) => {
  if (!ms) return "—";
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : m > 0 ? `${m}m` : `${Math.round(ms / 1000)}s`;
};
const pct = (a, b) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");
const hm = (t) => new Intl.DateTimeFormat("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(t));
const dayLabel = (day, opts = { weekday: "long", day: "numeric", month: "long" }) =>
  new Intl.DateTimeFormat("it-IT", { timeZone: TZ, ...opts }).format(new Date(`${day}T12:00:00Z`));
const shortDay = (day) => dayLabel(day, { weekday: "short", day: "2-digit", month: "2-digit" });

/** Barra della giornata 05→05: un blocco per segmento, pieno con microfono aperto, tenue con microfono chiuso. */
function Giornata({ from, to, segments }) {
  const span = to - from, ticks = [0, 4, 8, 12, 16, 20, 24];
  return (
    <div style={{ margin: "4px 0 18px" }}>
      <div style={{ position: "relative", height: 26, borderRadius: 6, background: CP.bgSunken, border: `1px solid ${CP.borderSoft}`, overflow: "hidden" }}>
        {segments.map((s, i) => (
          <div key={i} title={`${hm(s.start)}–${s.live ? "ora" : hm(s.end)} · ${s.channel} · microfono ${s.micOff ? "chiuso" : "aperto"}`}
            style={{ position: "absolute", top: 3, bottom: 3, left: `${(100 * (s.start - from)) / span}%`, width: `max(2px, ${(100 * (s.end - s.start)) / span}%)`, borderRadius: 3, background: s.micOff ? alpha(CP.accent, "55") : CP.accent }} />
        ))}
      </div>
      <div style={{ position: "relative", height: 16, marginTop: 4 }}>
        {ticks.map((h) => (
          <span key={h} style={{ ...muted, position: "absolute", left: `${(100 * h) / 24}%`, transform: h === 0 ? "none" : h === 24 ? "translateX(-100%)" : "translateX(-50%)" }}>
            {String((5 + h) % 24).padStart(2, "0")}:00
          </span>
        ))}
      </div>
      <div style={{ ...muted, display: "flex", gap: 14, marginTop: 6 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: CP.accent, marginRight: 5 }} />Microfono aperto</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: alpha(CP.accent, "55"), marginRight: 5 }} />Microfono chiuso</span>
      </div>
    </div>
  );
}

function SchedaGiorno({ id, day }) {
  const { data, error, isLoading } = useSWR(`${API}?view=person&id=${id}&day=${day}`, fetcher, { revalidateOnFocus: false });
  if (isLoading) return <p style={muted}>Caricamento…</p>;
  if (error) return <Notice danger>{error.message}</Notice>;
  if (!data.segments.length) return <EmptyState title="Nessuna presenza in questa giornata">Nelle stanze vocali non risulta mai entrata/o tra le 05:00 di {dayLabel(day)} e le 05:00 del giorno dopo.</EmptyState>;
  const segs = data.segments, tot = segs.reduce((a, s) => a + (s.end - s.start), 0);
  const sum = (f) => segs.reduce((a, s) => a + (f(s) ? s.end - s.start : 0), 0);
  const mic = sum((s) => !s.micOff), deaf = sum((s) => s.deaf), screen = sum((s) => s.screen), cam = sum((s) => s.camera);
  const live = segs.some((s) => s.live);
  const perChan = Object.entries(segs.reduce((a, s) => ({ ...a, [s.channel]: (a[s.channel] || 0) + s.end - s.start }), {})).sort((a, b) => b[1] - a[1]);
  const tlCols = [
    { key: "start", label: "Orario", render: (t) => `${hm(t.start)}–${t.live ? "ora" : hm(t.end)}` },
    { key: "channel", label: "Stanza" },
    { key: "ms", label: "Durata", align: "right", render: (t) => dur(t.ms) },
    { key: "mic", label: "Microfono aperto", align: "right", render: (t) => pct(t.mic, t.ms) },
    { key: "deaf", label: "Cuffie disattivate", align: "right", render: (t) => dur(t.deaf) },
    { key: "extra", label: "Schermo · camera", sortable: false, render: (t) => [t.screen && "schermo", t.camera && "camera"].filter(Boolean).join(" · ") || "—" },
  ];
  return (
    <>
      <div style={grid}>
        <Metric label="In vocale" value={dur(tot)} />
        <Metric label="Ingressi" value={fmtInt(segs.filter((s) => s.join).length)} />
        <Metric label="Primo ingresso · ultima uscita" value={`${hm(segs[0].start)} · ${live ? "dentro ora" : hm(segs.at(-1).end)}`} />
        <Metric label="Microfono aperto" value={pct(mic, tot)} note={dur(mic)} />
        <Metric label="Cuffie disattivate" value={dur(deaf)} />
        <Metric label="Schermo · camera" value={`${dur(screen)} · ${dur(cam)}`} />
      </div>
      <Giornata from={data.from} to={data.to} segments={segs} />
      <SectionTitle>Cronologia</SectionTitle>
      <div style={{ margin: "0 0 18px" }}>
        <DataTable columns={tlCols} rows={data.timeline.map((t, i) => ({ ...t, id: i }))} minWidth={720} density="compact" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
        <div>
          <SectionTitle>Stanze</SectionTitle>
          <DataTable columns={[{ key: "n", label: "Stanza" }, { key: "ms", label: "Tempo", align: "right", render: (r) => dur(r.ms) }]}
            rows={perChan.map(([n, ms]) => ({ id: n, n, ms }))} minWidth={280} density="compact" />
        </div>
        <div>
          <SectionTitle>Insieme a</SectionTitle>
          <DataTable columns={[{ key: "name", label: "Persona" }, { key: "ms", label: "Tempo insieme", align: "right", render: (r) => dur(r.ms) }]}
            rows={data.companions.map((c) => ({ ...c, id: c.name }))} minWidth={280} density="compact" empty="Sempre da sola/o nella stanza." />
        </div>
      </div>
    </>
  );
}

function SchedaStorico({ id }) {
  const { data, error, isLoading } = useSWR(`${API}?view=range&id=${id}&days=30`, fetcher, { revalidateOnFocus: false });
  if (isLoading) return <p style={muted}>Caricamento…</p>;
  if (error) return <Notice danger>{error.message}</Notice>;
  const days = data.days, present = days.filter((d) => d.ms > 0), tot = present.reduce((a, d) => a + d.ms, 0), max = Math.max(1, ...days.map((d) => d.ms));
  return (
    <>
      <div style={grid}>
        <Metric label="Giorni presente" value={`${present.length} su ${days.length}`} />
        <Metric label="Tempo totale" value={dur(tot)} />
        <Metric label="Media nei giorni di presenza" value={present.length ? dur(tot / present.length) : "—"} />
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90, margin: "0 0 6px", padding: "0 2px" }}>
        {[...days].reverse().map((d) => (
          <div key={d.day} title={`${shortDay(d.day)} · ${d.ms ? dur(d.ms) : "assente"}`}
            style={{ flex: 1, minWidth: 4, height: d.ms ? `${Math.max(4, (90 * d.ms) / max)}px` : 2, borderRadius: 2, background: d.ms ? CP.accent : CP.borderSoft }} />
        ))}
      </div>
      <p style={{ ...muted, margin: "0 0 14px" }}>Una barra per giornata, dalla più vecchia a oggi. Dati disponibili dal {dayLabel(new Date(data.trackingSince).toISOString().slice(0, 10))}.</p>
      <DataTable
        columns={[
          { key: "day", label: "Giornata", render: (d) => shortDay(d.day) },
          { key: "ms", label: "In vocale", align: "right", render: (d) => (d.ms ? dur(d.ms) : <span style={muted}>assente</span>) },
          { key: "joins", label: "Ingressi", align: "right", render: (d) => (d.ms ? fmtInt(d.joins) : "—") },
          { key: "mic", label: "Microfono aperto", align: "right", render: (d) => (d.ms ? pct(d.mic, d.ms) : "—") },
          { key: "first", label: "Dalle · alle", render: (d) => (d.ms ? `${hm(d.first)} · ${d.live ? "ora" : hm(d.last)}` : "—") },
          { key: "channels", label: "Stanze", sortable: false, render: (d) => (d.channels || []).join(", ") || "—" },
        ]}
        rows={days.map((d) => ({ ...d, id: d.day }))} minWidth={820} density="compact" />
    </>
  );
}

function Persona({ person, day, onClose }) {
  const [vista, setVista] = useState("giorno");
  return (
    <div style={{ margin: "18px 0 24px", padding: "16px 18px", borderRadius: 12, border: `1px solid ${CP.border}`, background: CP.surface }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "0 0 12px" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 500, color: CP.textPrimary }}>{person.name}</div>
          <div style={muted}>{person.mansione}</div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Segmented value={vista} onChange={setVista} items={[["giorno", dayLabel(day, { weekday: "short", day: "numeric", month: "short" })], ["storico", "Ultimi 30 giorni"]]} />
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: CP.textMuted, cursor: "pointer", fontSize: 13, fontFamily: FONTS.body }}>Chiudi</button>
        </div>
      </div>
      {vista === "giorno" ? <SchedaGiorno id={person.id} day={day} /> : <SchedaStorico id={person.id} />}
    </div>
  );
}

export default function PresenzeDiscordPage() {
  const days = useSWR(`${API}?view=days`, fetcher, { revalidateOnFocus: false });
  const [day, setDay] = useState(null);
  const current = day || days.data?.today;
  const { data, error, isLoading } = useSWR(current ? `${API}?view=day&day=${current}` : null, fetcher, { revalidateOnFocus: false, refreshInterval: current === days.data?.today ? 120_000 : 0 });
  const [tab, setTab] = useState("dentro");
  const [mansione, setMansione] = useState("tutte");
  const [cerca, setCerca] = useState("");
  const [sel, setSel] = useState(null);

  const groupsPresent = useMemo(() => {
    if (!data) return [];
    const has = new Set([...data.people, ...data.notSeen].map((p) => p.mansione));
    return data.groups.filter((g) => has.has(g));
  }, [data]);
  const match = (p) => (mansione === "tutte" || p.mansione === mansione) && (!cerca.trim() || p.name.toLowerCase().includes(cerca.trim().toLowerCase()));
  const people = useMemo(() => (data ? data.people.filter(match).map((p) => ({ ...p })) : []), [data, mansione, cerca]); // eslint-disable-line react-hooks/exhaustive-deps
  const notSeen = useMemo(() => (data ? data.notSeen.filter(match) : []), [data, mansione, cerca]); // eslint-disable-line react-hooks/exhaustive-deps

  const err = days.error || error;
  const tot = people.reduce((a, p) => a + p.ms, 0), mic = people.reduce((a, p) => a + p.mic, 0);
  const partial = data && data.trackingSince > data.from;
  const isToday = current && current === days.data?.today;

  const cols = [
    { key: "name", label: "Persona", render: (p) => <span><span style={{ color: CP.textPrimary }}>{p.name}</span><br /><span style={muted}>{p.mansione}</span></span> },
    { key: "ms", label: "In vocale", align: "right", render: (p) => dur(p.ms) },
    { key: "joins", label: "Ingressi", align: "right", render: (p) => fmtInt(p.joins) },
    { key: "micPct", label: "Microfono aperto", align: "right", sort: (p) => (p.ms ? p.mic / p.ms : 0), render: (p) => pct(p.mic, p.ms) },
    { key: "deaf", label: "Cuffie disattivate", align: "right", render: (p) => dur(p.deaf) },
    { key: "first", label: "Dalle · alle", render: (p) => `${hm(p.first)} · ${p.live ? "dentro ora" : hm(p.last)}` },
    { key: "channels", label: "Stanze", sortable: false, render: (p) => <span style={{ color: CP.textSecondary }}>{p.channels.join(", ")}</span> },
  ];
  const outByGroup = groupsPresent.map((g) => [g, notSeen.filter((p) => p.mansione === g)]).filter(([, l]) => l.length);

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 16px 64px", fontFamily: FONTS.body }}>
      <PageHead title="Presenze Discord" subtitle="Chi è stato nelle stanze vocali del server, quanto e con chi · giornata dalle 05:00 alle 05:00" />
      {err && <Notice danger>{err.message}</Notice>}
      {(days.isLoading || (isLoading && !data)) && !err && <p style={muted}>Caricamento…</p>}

      {days.data && (
        <FilterBar onReset={mansione !== "tutte" || cerca ? () => { setMansione("tutte"); setCerca(""); } : undefined}>
          <select aria-label="Giornata" value={current || ""} onChange={(e) => { setDay(e.target.value); setSel(null); }} style={selectStyle}>
            {days.data.days.map((d) => <option key={d} value={d}>{d === days.data.today ? `Oggi, ${dayLabel(d)}` : dayLabel(d)}</option>)}
          </select>
          {groupsPresent.length > 1 && (
            <select aria-label="Mansione" value={mansione} onChange={(e) => setMansione(e.target.value)} style={selectStyle}>
              <option value="tutte">Tutte le mansioni</option>
              {groupsPresent.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          <input aria-label="Cerca una persona" placeholder="Cerca una persona" value={cerca} onChange={(e) => setCerca(e.target.value)} style={{ ...selectStyle, minWidth: 200 }} />
        </FilterBar>
      )}

      {data && (
        <>
          {partial && <Notice>Dati parziali per questa giornata: il bot ha iniziato a contare alle {hm(data.trackingSince)}.</Notice>}
          <div style={grid}>
            <Metric label="Entrati" value={fmtInt(people.length)} />
            <Metric label="Non entrati" value={fmtInt(notSeen.length)} attn={notSeen.length > 0} />
            <Metric label="Tempo totale" value={dur(tot)} />
            <Metric label="Media a testa" value={people.length ? dur(tot / people.length) : "—"} />
            <Metric label="Microfono aperto" value={pct(mic, tot)} />
          </div>
          <Spiega style={{ margin: "0 0 16px" }}>
            <span>La giornata va dalle 05:00 alle 05:00 del giorno dopo (ora italiana): chi si collega dopo mezzanotte resta nella giornata a cui appartiene. {isToday ? "Oggi si aggiorna ogni due minuti." : ""}</span>
            <span>Contano solo le stanze vocali; la stanza AFK e i bot sono esclusi. Un ingresso è il passaggio da scollegato a collegato: cambiare stanza non conta come nuovo ingresso.</span>
            <span>La mansione si legge dal ruolo Discord; chi ha più ruoli va nel più alto (Project Manager, poi Account Manager, Sales Manager, Formatore, Area HR, Area Social, Admin). «Operatori» è chi ha altri ruoli (creator, team).</span>
            <span>«Microfono aperto» è la parte del tempo in vocale col microfono acceso; «cuffie disattivate» è il tempo collegato senza sentire. «Insieme a» somma il tempo passato nella stessa stanza con ciascuna persona.</span>
          </Spiega>
          <Tabs value={tab} onChange={setTab} items={[["dentro", "Chi è entrato", people.length], ["fuori", "Non entrati", notSeen.length], ["stanze", "Per stanza", data.channels.length]]} />

          {tab === "dentro" && (
            <>
              {!people.length ? (
                <EmptyState title="Nessuna presenza">Con questi filtri nessuno è entrato nelle stanze vocali in questa giornata.</EmptyState>
              ) : (
                <DataTable columns={cols} rows={people} defaultSort={{ key: "ms", dir: -1 }} minWidth={1000} maxHeight={560}
                  onRowClick={(p) => setSel(p)} selected={(p) => p.id === sel?.id} />
              )}
              {sel && <Persona key={`${sel.id}-${current}`} person={sel} day={current} onClose={() => setSel(null)} />}
            </>
          )}

          {tab === "fuori" && (
            <>
              <p style={para}>Chi è nel server e in questa giornata non è mai entrato in una stanza vocale. Clicca un nome per vedere i suoi ultimi 30 giorni.</p>
              {!outByGroup.length && <EmptyState title="Nessuno">Con questi filtri sono entrati tutti.</EmptyState>}
              {outByGroup.map(([g, list]) => (
                <div key={g} style={{ margin: "0 0 16px" }}>
                  <SectionTitle aside={<span style={muted}>{list.length}</span>}>{g}</SectionTitle>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {list.map((p) => (
                      <button key={p.id} type="button" onClick={() => setSel(p)}
                        style={{ fontSize: 13, fontFamily: FONTS.body, padding: "4px 10px", borderRadius: 999, cursor: "pointer", border: `1px solid ${sel?.id === p.id ? CP.accent : CP.border}`, background: sel?.id === p.id ? CP.accentSoft : CP.surface, color: CP.textPrimary }}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {sel && <Persona key={`${sel.id}-${current}-out`} person={sel} day={current} onClose={() => setSel(null)} />}
            </>
          )}

          {tab === "stanze" && (
            <DataTable
              columns={[{ key: "name", label: "Stanza" }, { key: "ms", label: "Tempo totale", align: "right", render: (c) => dur(c.ms) }, { key: "people", label: "Persone", align: "right", render: (c) => fmtInt(c.people) }]}
              rows={data.channels} defaultSort={{ key: "ms", dir: -1 }} minWidth={480} empty="Nessuna stanza usata in questa giornata." />
          )}
        </>
      )}
    </div>
  );
}
