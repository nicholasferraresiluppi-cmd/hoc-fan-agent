"use client";

/**
 * /admin/publisher-x — Publisher su X (27/10/2026).
 * Quanto pagare chi pubblica su X per portare sub: fan per fan, ognuno sui suoi
 * primi 30 giorni, dal link da cui è entrato (warehouse, hoc.newsubs_spending).
 * Si assegna ogni link X a un publisher, si fissano fee, chatter, quota e base:
 * la pagina fa il conto del mese. Logica in lib/publisher-x-core (testata).
 */
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2, RefreshCw, Copy, ExternalLink, Plus, Save } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { PageHead, HeroMetric, Metric, FilterChip, DataTable, Notice, SectionTitle, card } from "@/components/ds";
import { DEFAULT_FEE, WHALE_SHARE, publisherRate, linkKey } from "@/lib/publisher-x-core";

const API = "/api/admin/publisher-x";
const fetcher = async (url) => {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `Errore ${r.status}`);
  return j;
};
const usd = (n, dec = 0) => (n === null || n === undefined ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD", minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: "always" }).format(n));
const usd2 = (n) => usd(n, 2);
const int = (n) => new Intl.NumberFormat("it-IT", { useGrouping: "always" }).format(n || 0);
const pctTxt = (f) => (f === null || f === undefined ? "—" : `${Math.round(f * 1000) / 10}%`.replace(".", ","));
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const meseLungo = (m) => { const [y, mm] = m.split("-").map(Number); return `${MESI[mm - 1]} ${y}`; };
const dmy = (d) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}` : "—");
const muted = { fontSize: 12, color: CP.textMuted };
const btn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary };
const btnMain = { ...btn, background: CP.accent, border: `1px solid ${CP.accent}`, color: "#fff" };
const input = { padding: "6px 8px", borderRadius: 6, fontSize: 13, fontFamily: FONTS.body, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, minWidth: 0 };

function lastMonths(n = 6) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(x.toISOString().slice(0, 7));
  }
  return out;
}

/** La torta da 100 $ con le regole attuali: la spiegazione in parole che sta sopra le leve. */
function Torta({ fee, settings }) {
  const { clean, rate } = publisherRate(fee, settings);
  const creator = 100 * (1 - fee), agency = 100 * fee, chatter = 100 * Math.min(fee, settings.chatterPct), pub = 100 * rate, rest = agency - chatter - pub;
  const parts = [["Creator", creator, CP.borderStrong], ["Chatter", chatter, CP.accentDim], ["Publisher", pub, CP.accent], ["Agenzia", rest, CP.accentGreen]];
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: CP.textSecondary }}>
        Un fan portato dal publisher spende {usd(100)} nei suoi primi 30 giorni. Alla creator vanno {usd(creator)}, all'agenzia {usd(agency)} (fee {pctTxt(fee)}).
        Dall'agenzia si paga il chatter: {usd(chatter)}. Restano {usd(100 * clean)} puliti, e il publisher ne prende {pctTxt(settings.sharePct)}: <b style={{ color: CP.textPrimary }}>{usd2(pub)}</b>. All'agenzia restano {usd2(rest)}.
        In breve: {pctTxt(rate)} di ogni dollaro speso dai suoi fan, più la base fissa.
      </div>
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: CP.borderSoft }} aria-hidden>
        {parts.map(([l, v, c]) => <div key={l} style={{ width: `${Math.max(0, v)}%`, background: c }} title={`${l} ${usd2(v)}`} />)}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", ...muted }}>
        {parts.map(([l, v, c]) => <span key={l} style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l} {usd2(v)}</span>)}
      </div>
    </div>
  );
}

/** I fan di un publisher nel mese: nome, giorno di ingresso, spesa a 0/7/30 giorni. */
function PublisherFans({ month, name }) {
  const { data, error, isLoading } = useSWR(`${API}/fans?month=${month}&publisher=${encodeURIComponent(name)}`, fetcher, { revalidateOnFocus: false });
  const [copied, setCopied] = useState(false);
  if (isLoading) return <div style={{ ...muted, display: "flex", gap: 6, alignItems: "center" }}><Loader2 size={13} />Carico i fan…</div>;
  if (error) return <Notice danger>{error.message}</Notice>;
  const p = data?.publisher;
  if (!p) return null;
  const copy = async () => {
    const head = "fan;profilo;link;entrato;spesa_7gg;spesa_30gg;30gg_chiusi;al_publisher";
    const lines = p.fans.map((f) => [f.username ? "@" + f.username : f.userId, f.creatorName, f.linkName, String(f.subStart).slice(0, 10), f.d7, f.d30, f.mature ? "si" : "no", f.bonus].join(";"));
    try { await navigator.clipboard.writeText([head, ...lines].join("\n")); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { alert("Copia non riuscita"); }
  };
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <Metric label="Fan nuovi portati" value={int(p.subs)} note={p.immature ? `${int(p.immature)} ancora sotto i 30 giorni` : "tutti con 30 giorni chiusi"} />
        <Metric label="Hanno speso (30 gg)" value={usd(p.spend30)} />
        <Metric label="Bonus" value={usd2(p.bonus)} note={`base ${usd(p.base)}`} />
        <Metric label="Da pagare" value={usd2(p.total)} note={p.final ? "conto definitivo" : `provvisorio, si chiude il ${dmy(data.closesOn)}`} />
      </div>
      {p.topShare !== null && p.topShare >= WHALE_SHARE && p.subs > 1 && (
        <Notice>Un solo fan fa il {pctTxt(p.topShare)} della spesa del mese ({usd(p.fans[0].d30)} su {usd(p.spend30)}). Il bonus è giusto, ma non dice quanto è bravo il publisher: guarda anche quanti fan porta e quanto spendono gli altri.</Notice>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={muted}>Dal fan che ha speso di più. Spesa al netto della quota OnlyFans, contata dal giorno di ingresso di ogni fan.</span>
        {p.fans.length > 0 && <button style={{ ...btn, padding: "5px 10px", fontSize: 12 }} onClick={copy}><Copy size={13} />{copied ? "Copiata" : "Copia per foglio di calcolo"}</button>}
      </div>
      {p.fans.length === 0 && <div style={muted}>Nessun fan nuovo da questi link nel mese.</div>}
      <div style={{ maxHeight: 420, overflow: "auto" }}>
        {p.fans.map((f) => (
          <div key={`${f.creatorId}-${f.userId}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, padding: "8px 0", borderTop: `1px solid ${CP.borderSoft}`, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.username ? `@${f.username}` : f.userId}</div>
              <div style={muted}>{f.creatorName} · {f.linkName} · entrato il {dmy(String(f.subStart).slice(0, 10))} · 7 gg {usd2(f.d7)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{usd2(f.d30)}</div>
              <div style={{ ...muted, color: f.mature ? CP.textMuted : CP.accentSoftText }}>{f.mature ? `al publisher ${usd2(f.bonus)}` : "30 giorni non ancora chiusi"}</div>
              <a href={`https://onlyfans.com/my/chats/chat/${f.userId}/`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: CP.accentSoftText, display: "inline-flex", gap: 4, alignItems: "center" }}>Apri chat<ExternalLink size={11} /></a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PublisherXPage() {
  const months = useMemo(() => lastMonths(6), []);
  const [month, setMonth] = useState(months[1]); // il mese scorso: il primo che si può pagare
  const { data, error, isLoading, mutate } = useSWR(`${API}?month=${month}`, fetcher, { revalidateOnFocus: false });
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [onlyX, setOnlyX] = useState(true);
  const [adding, setAdding] = useState({ creatorId: "", linkName: "", publisher: "" });

  useEffect(() => { if (data?.config && !draft) setDraft(data.config); }, [data, draft]);
  const cfg = draft || data?.config;
  const dirty = Boolean(draft && data?.config && JSON.stringify({ s: draft.settings, f: draft.fees, l: draft.links }) !== JSON.stringify({ s: data.config.settings, f: data.config.fees, l: data.config.links }));

  const links = data?.links || [];
  const pubNames = useMemo(() => [...new Set((cfg?.links || []).map((l) => l.publisher))].sort((a, b) => a.localeCompare(b, "it")), [cfg]);
  const creators = useMemo(() => {
    const m = new Map();
    for (const l of links) if (!m.has(l.creatorId)) m.set(l.creatorId, l.creatorName);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [links]);

  const assignOf = (row) => (cfg?.links || []).find((l) => linkKey(l.creatorId, l.linkName) === row.key);
  const setAssign = (row, patch) => setDraft((d) => {
    const cur = d.links.filter((l) => linkKey(l.creatorId, l.linkName) !== row.key);
    const prev = d.links.find((l) => linkKey(l.creatorId, l.linkName) === row.key) || { creatorId: row.creatorId, linkName: row.linkName, publisher: "", from: null };
    const next = { ...prev, ...patch };
    return { ...d, links: next.publisher.trim() ? [...cur, next] : cur };
  });
  const setSetting = (k, v) => setDraft((d) => ({ ...d, settings: { ...d.settings, [k]: v } }));
  const setFee = (id, v) => setDraft((d) => ({ ...d, fees: { ...d.fees, [id]: v } }));

  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: draft, rev: data.config.rev }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Salvataggio non riuscito");
      setDraft(null);
      await mutate();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const refresh = async () => { setBusy(true); try { await mutate(await fetcher(`${API}?month=${month}&refresh=1`), { revalidate: false }); } catch (e) { alert(e.message); } finally { setBusy(false); } };
  const addLink = () => {
    const id = Number(adding.creatorId);
    const name = adding.linkName.trim();
    const who = adding.publisher.trim();
    if (!id || !name || !who) return;
    setAssign({ key: linkKey(id, name), creatorId: id, linkName: name }, { publisher: who });
    setAdding({ creatorId: "", linkName: "", publisher: "" });
  };

  const pubs = data?.publishers || [];
  const T = pubs.reduce((s, p) => ({ total: s.total + p.total, subs: s.subs + p.subs, margin: s.margin + p.margin, immature: s.immature + p.immature }), { total: 0, subs: 0, margin: 0, immature: 0 });
  const shownLinks = links.filter((l) => !onlyX || l.isX || l.publisher);
  const settings = cfg?.settings;

  return (
    <div style={{ padding: "24px 16px 80px", maxWidth: 1600, margin: "0 auto" }}>
      <PageHead
        crumbs={[{ label: "Comp & Ben" }, { label: "Publisher X" }]}
        title="Publisher X"
        subtitle="Quanto pagare chi porta sub da X. Ogni fan si conta dal suo giorno di ingresso per 30 giorni, dal link da cui è arrivato: la spesa viene dal warehouse (solo HOC, aggiornata a ieri). Assegna i link ai publisher, fissa le regole, la pagina fa il conto del mese."
        actions={<>
          {dirty && <button style={btnMain} onClick={save} disabled={busy}>{busy ? <Loader2 size={14} /> : <Save size={14} />}Salva le modifiche</button>}
          <button style={btn} onClick={refresh} disabled={busy}>{busy ? <Loader2 size={14} /> : <RefreshCw size={14} />}Ricalcola</button>
        </>}
      />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {months.map((m) => <FilterChip key={m} label={meseLungo(m)} active={m === month} onClick={() => { if (dirty && !confirm("Hai modifiche non salvate. Cambiare mese le tiene in sospeso, salvale prima per vederle nel conto. Continuare?")) return; setMonth(m); }} />)}
      </div>

      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && <div style={{ color: CP.textMuted, display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}><Loader2 size={14} />Calcolo dal warehouse…</div>}

      {data && cfg && (<>
        <HeroMetric
          label={`Da pagare ai publisher per ${meseLungo(month)}`}
          value={usd(T.total)}
          compare={pubs.length ? `${int(pubs.length)} publisher · ${int(T.subs)} fan nuovi portati · all'agenzia restano ${usd(T.margin)} dopo creator, chatter e publisher` : "Nessun publisher ancora: assegna un link qui sotto."}
          hint={T.immature > 0 ? `Provvisorio: ${int(T.immature)} fan non hanno ancora chiuso i 30 giorni. Il conto di ${meseLungo(month)} è definitivo dal ${dmy(data.closesOn)}.` : pubs.length ? "Conto definitivo: tutti i fan del mese hanno chiuso i 30 giorni." : null}
        />

        {pubs.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <SectionTitle aside="clicca un publisher per vedere i suoi fan uno per uno">Publisher del mese</SectionTitle>
            <DataTable
              rows={pubs.map((p) => ({ ...p, id: p.name }))}
              onRowClick={(p) => setOpen(p.name)}
              defaultSort={{ key: "total", dir: -1 }}
              columns={[
                { key: "name", label: "Publisher", render: (p) => <span><span style={{ fontWeight: 500 }}>{p.name}</span><br /><span style={muted}>{p.creators.join(", ")}{p.topShare !== null && p.topShare >= WHALE_SHARE && p.subs > 1 ? ` · un fan fa il ${pctTxt(p.topShare)}` : ""}</span></span> },
                { key: "subs", label: "Fan nuovi", align: "right", render: (p) => int(p.subs) },
                { key: "spend30", label: "Spesa 30 gg", align: "right", render: (p) => usd(p.spend30) },
                { key: "bonus", label: "Bonus", align: "right", render: (p) => usd2(p.bonus) },
                { key: "base", label: "Base", align: "right", render: (p) => usd(p.base) },
                { key: "total", label: "Da pagare", align: "right", render: (p) => <b>{usd2(p.total)}</b> },
                { key: "margin", label: "Resta all'agenzia", align: "right", render: (p) => <span style={{ color: p.margin < 0 ? CP.accentRed : CP.textPrimary }}>{usd(p.margin)}</span> },
                { key: "final", label: "Stato", sort: (p) => (p.final ? 1 : 0), render: (p) => <span style={muted}>{p.final ? "definitivo" : `provvisorio · ${int(p.immature)} aperti`}</span> },
              ]}
            />
          </section>
        )}

        <section style={{ marginBottom: 24 }}>
          <SectionTitle aside={`fan nuovi di ${meseLungo(month)}; la spesa media è sugli ultimi 6 mesi, solo fan con 30 giorni chiusi`}>Link e publisher</SectionTitle>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <FilterChip label={`Link X e assegnati (${int(links.filter((l) => l.isX || l.publisher).length)})`} active={onlyX} onClick={() => setOnlyX(true)} />
            <FilterChip label={`Tutti (${int(links.length)})`} active={!onlyX} onClick={() => setOnlyX(false)} />
          </div>
          <DataTable
            rows={shownLinks.map((l) => ({ ...l, id: l.key }))}
            defaultSort={{ key: "subsMonth", dir: -1 }}
            minWidth={980}
            empty="Nessun link X con fan negli ultimi 6 mesi."
            columns={[
              { key: "creatorName", label: "Profilo", render: (l) => <span>{l.creatorName}{l.missing && <><br /><span style={{ ...muted, color: CP.accentSoftText }}>link senza fan da 6 mesi: controlla il nome</span></>}</span> },
              { key: "linkName", label: "Link", render: (l) => <span style={{ fontSize: 13 }}>{l.linkName}</span> },
              { key: "publisher", label: "Publisher", sort: (l) => assignOf(l)?.publisher || "", render: (l) => (
                <input list="pubx-names" placeholder="nessuno" value={assignOf(l)?.publisher || ""} onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setAssign(l, { publisher: e.target.value })} style={{ ...input, width: 140 }} aria-label={`Publisher del link ${l.linkName}`} />
              ) },
              { key: "from", label: "Conta dal", sortable: false, render: (l) => assignOf(l) ? (
                <input type="date" value={assignOf(l)?.from || ""} onChange={(e) => setAssign(l, { from: e.target.value || null })} style={{ ...input, width: 140 }} aria-label="Conta i fan entrati da questo giorno" />
              ) : <span style={muted}>—</span> },
              { key: "subsMonth", label: "Fan nuovi nel mese", align: "right", render: (l) => int(l.subsMonth) },
              { key: "avgD7", label: "Spesa media 7 gg", align: "right", render: (l) => usd2(l.avgD7) },
              { key: "avgD30", label: "Spesa media 30 gg", align: "right", render: (l) => <span>{usd2(l.avgD30)}<br /><span style={muted}>su {int(l.mature6m)} fan</span></span> },
              { key: "perSubToPublisher", label: "Al publisher per fan", align: "right", render: (l) => usd2(l.perSubToPublisher) },
            ]}
          />
          <datalist id="pubx-names">{pubNames.map((n) => <option key={n} value={n} />)}</datalist>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <span style={muted}>Un link X che non riconosco dal nome?</span>
            <select value={adding.creatorId} onChange={(e) => setAdding((a) => ({ ...a, creatorId: e.target.value }))} style={input} aria-label="Profilo">
              <option value="">Profilo</option>
              {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input placeholder="nome esatto del link" value={adding.linkName} onChange={(e) => setAdding((a) => ({ ...a, linkName: e.target.value }))} style={{ ...input, width: 220 }} />
            <input list="pubx-names" placeholder="publisher" value={adding.publisher} onChange={(e) => setAdding((a) => ({ ...a, publisher: e.target.value }))} style={{ ...input, width: 140 }} />
            <button style={{ ...btn, padding: "6px 10px" }} onClick={addLink} disabled={!adding.creatorId || !adding.linkName.trim() || !adding.publisher.trim()}><Plus size={13} />Aggiungi</button>
          </div>
          <div style={{ ...muted, marginTop: 6 }}>Per i profili che non sono in elenco serve almeno un link X con fan. Dopo aver aggiunto, salva e ricalcola: il link compare con i suoi numeri.</div>
        </section>

        <section style={{ ...card, padding: 18, display: "grid", gap: 16 }}>
          <SectionTitle aside="valgono per tutti i publisher e tutti i mesi">Regole del conto</SectionTitle>
          {settings && <Torta fee={DEFAULT_FEE} settings={settings} />}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {[
              ["chatterPct", "Provvigione chatter", "%", 100],
              ["sharePct", "Quota al publisher (del pulito)", "%", 100],
              ["baseUsd", "Base fissa al mese", "$", 1],
            ].map(([k, label, unit, mul]) => (
              <label key={k} style={{ display: "grid", gap: 4, fontSize: 13, color: CP.textSecondary }}>
                {label}
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="number" min="0" step={unit === "%" ? "0.5" : "50"} value={Math.round(settings[k] * mul * 100) / 100}
                    onChange={(e) => setSetting(k, (Number(e.target.value) || 0) / mul)} style={{ ...input, width: 100 }} />
                  <span style={muted}>{unit}</span>
                </span>
              </label>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Fee dell'agenzia per profilo</div>
            <div style={{ ...muted, marginBottom: 8 }}>La fee vera sta nel conto dello split, riservato alla contabilità: qui si scrive a mano. Dove non la scrivi vale {pctTxt(DEFAULT_FEE)}. Con una fee bassa il publisher prende poco: con 23% e chatter al 15% restano 8 centesimi puliti per dollaro.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
              {creators.map((c) => {
                const set = cfg.fees?.[c.id] !== undefined;
                const fee = set ? cfg.fees[c.id] : DEFAULT_FEE;
                return (
                  <label key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 10px", border: `1px solid ${CP.borderSoft}`, borderRadius: 8 }}>
                    <span style={{ color: set ? CP.textPrimary : CP.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                      <input type="number" min="0" max="100" step="0.5" value={Math.round(fee * 1000) / 10} onChange={(e) => setFee(c.id, (Number(e.target.value) || 0) / 100)} style={{ ...input, width: 64 }} aria-label={`Fee ${c.name}`} />
                      <span style={muted}>%</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div style={muted}>
            Come si legge: si contano solo i fan nuovi su quel profilo (chi si riabbona non è merito del link). La spesa è quella dei primi 30 giorni di ogni fan, al netto della quota OnlyFans, e comprende l'abbonamento.
            Un fan entrato da meno di 30 giorni ha ancora una spesa parziale: per questo un mese è definitivo solo 30 giorni dopo la sua fine.
            {data.config.at ? ` Regole salvate il ${new Date(data.config.at).toLocaleDateString("it-IT")}.` : ""}
          </div>
        </section>
      </>)}

      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open ? `${open} · ${meseLungo(month)}` : ""} maxWidth={760}>
        {open && <PublisherFans month={month} name={open} />}
      </Modal>
    </div>
  );
}
