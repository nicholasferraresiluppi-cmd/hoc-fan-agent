"use client";

// Canali Telegram (14/10/2026) — la mappa dei canali delle creator, compilata dai sales, e con il bot
// HOC dentro: chi entra, da quale link (una fonte = un link d'invito), quanti restano, e quanti
// abbonati porta su OnlyFans il link di tracciamento pubblicato nel canale.
// Logica in lib/telegram-channels-core.js (testata), dati in /api/admin/telegram-channels.

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Check, Copy, Plus, RefreshCw, Trash2, ExternalLink, Link2, X } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Metric, DataTable, Notice, SectionTitle, card, NUM, BTN_PRIMARY } from "@/components/ds";
import { Modal } from "@/components/cp-style";
import { fmtInt, fmtPct } from "@/lib/format";
import { confirmDialog } from "@/components/AppDialogs";
import { useInVetro } from "@/components/VetroScope";
import { Panel, HotTile, RankBars, GoalRing, Bars } from "@/components/VetroCharts";

const API = "/api/admin/telegram-channels";
const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
  if (!r.ok) throw new Error(d.error || "Operazione non riuscita");
  return d;
}

const btn = { display: "inline-flex", alignItems: "center", gap: 6, background: CP.surfaceAlt, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const btnPrimary = BTN_PRIMARY;
const input = { background: CP.bgSunken, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: FONTS.body, width: "100%", boxSizing: "border-box" };
const label = { display: "block", fontSize: 12, color: CP.textSecondary, margin: "12px 0 4px" };
const muted = { fontSize: 12, color: CP.textMuted };
const int = fmtInt;
const signed = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${int(n)}`);
const when = (ts) => (ts ? new Date(ts).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }) : "—");

const BOT_LABEL = { admin: "Bot dentro", membro: "Bot senza permessi", fuori: "Bot non c'è" };
function BotBadge({ ch }) {
  const st = ch.bot?.status;
  const ok = st === "admin" && ch.bot?.can_invite;
  const text = !ch.chat_id ? "Da collegare" : st === "admin" && !ch.bot?.can_invite ? "Manca il permesso link" : BOT_LABEL[st] || "Da verificare";
  const color = ok ? CP.accentGreen : CP.textMuted;
  return <span style={{ fontSize: 12, color, whiteSpace: "nowrap" }}>{ok ? "● " : "○ "}{text}</span>;
}

function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button style={{ ...btn, padding: "4px 8px" }} onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }} title="Copia il link">
      {done ? <Check size={13} /> : <Copy size={13} />}{done ? "Copiato" : "Copia"}
    </button>
  );
}

const EMPTY_ROW = { creators: [], url: "", kind: "canale" };

// Più creator per canale: chip delle scelte + tendina per aggiungerne una.
function CreatorPicker({ value, options, onChange }) {
  const left = options.filter((c) => !value.includes(c));
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {value.map((c) => (
        <button type="button" key={c} onClick={() => onChange(value.filter((x) => x !== c))} title="Togli" style={{ ...btn, padding: "4px 8px", fontSize: 12 }}>{c} <X size={12} /></button>
      ))}
      <select style={{ ...input, width: value.length ? 170 : "100%", flex: value.length ? "0 0 auto" : 1 }} value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
        <option value="">{value.length ? "+ un'altra creator" : "Scegli la creator…"}</option>
        {left.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}

// Aggiunta: N righe (creator + link + tipo), "Aggiungi un altro canale". Modifica: una riga sola.
function ChannelForm({ initial, preset, creators, onDone, onCancel }) {
  const editing = Boolean(initial?.id);
  const [rows, setRows] = useState(() => (editing ? [{ creators: initial.creators, url: initial.url, kind: initial.kind }] : [{ ...EMPTY_ROW, creators: preset ? [preset] : [] }]));
  const [manager, setManager] = useState(initial?.manager || "");
  const [note, setNote] = useState(initial?.note || "");
  const [err, setErr] = useState(null);
  const [badRow, setBadRow] = useState(null);
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => [...new Set([...creators, ...rows.flatMap((r) => r.creators)])].sort((a, b) => a.localeCompare(b)), [creators, rows]);
  const setRow = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null); setBadRow(null);
    try {
      if (editing) await post({ action: "save", id: initial.id, ...rows[0], manager, note });
      else await post({ action: "add", rows, manager, note });
      onDone();
    } catch (x) {
      setErr(x.message);
      const m = /^Riga (\d+)/.exec(x.message);
      if (m) setBadRow(Number(m[1]) - 1);
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit}>
      {rows.map((r, i) => (
        <div key={i} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${badRow === i ? CP.accentRed : CP.border}`, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: CP.textMuted }}>{editing ? "Canale" : `Canale ${i + 1}`}</span>
            {rows.length > 1 && <button type="button" style={{ ...btn, padding: "2px 8px", fontSize: 12 }} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Togli</button>}
          </div>
          <label style={label}>Creator (anche più di una, se il canale è in comune)</label>
          <CreatorPicker value={r.creators} options={options} onChange={(v) => setRow(i, { creators: v })} />
          <label style={label}>Link del canale</label>
          <input style={input} value={r.url} onChange={(e) => setRow(i, { url: e.target.value })} placeholder="t.me/nomecanale, @nomecanale o t.me/+codice" />
          <label style={label}>Tipo</label>
          <select style={input} value={r.kind} onChange={(e) => setRow(i, { kind: e.target.value })}>
            <option value="canale">Canale (solo lei pubblica)</option>
            <option value="gruppo">Gruppo (scrivono anche i fan)</option>
          </select>
        </div>
      ))}
      {!editing && (
        <button type="button" style={btn} onClick={() => setRows([...rows, { ...EMPTY_ROW, creators: rows[rows.length - 1]?.creators || [] }])}><Plus size={13} />Aggiungi un altro canale</button>
      )}
      <label style={label}>Chi lo gestisce{rows.length > 1 ? " (vale per tutti)" : ""}</label>
      <input style={input} value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Es. la creator, Antonio, l'agenzia…" />
      <label style={label}>Note</label>
      <input style={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Facoltative" />
      {err && <div style={{ color: CP.accentRed, fontSize: 13, marginTop: 12 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
        <button type="button" style={btn} onClick={onCancel}>Annulla</button>
        <button type="submit" style={btnPrimary} disabled={busy}>{busy ? "Salvo…" : editing ? "Salva" : rows.length > 1 ? `Salva ${rows.length} canali` : "Salva"}</button>
      </div>
    </form>
  );
}

// Link di tracciamento OnlyFans con "telegram"/"TG" nel nome: trovati da soli, per creator.
function OfBlock({ names, of }) {
  const list = names.map((n) => [n, of?.[n]]).filter(([, o]) => o);
  if (!list.length) return <div style={muted}>Nessun link di tracciamento OnlyFans con «Telegram» o «TG» nel nome per {names.join(", ")}.</div>;
  return list.map(([n, o]) => (
    <div key={n} style={{ marginBottom: 10 }}>
      {names.length > 1 && <div style={{ color: CP.textPrimary, marginBottom: 4 }}>{n}</div>}
      <DataTable
        minWidth={420}
        rows={o.links}
        defaultSort={{ key: "subs_30", dir: -1 }}
        columns={[
          { key: "name", label: "Link OnlyFans", render: (l) => <a href={l.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{l.name}</a> },
          { key: "subs_30", label: "Abbonati 30g", align: "right", render: (l) => int(l.subs_30) },
          { key: "clicks_30", label: "Clic 30g", align: "right", render: (l) => int(l.clicks_30) },
          { key: "subs", label: "Abbonati da sempre", align: "right", render: (l) => int(l.subs) },
        ]}
      />
    </div>
  ));
}

function DayBars({ days }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.joins, d.leaves)));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 64 }} aria-label="Entrate e uscite degli ultimi 30 giorni">
        {days.map((d) => (
          <div key={d.d} title={`${d.d.slice(8, 10)}/${d.d.slice(5, 7)}: ${d.joins} entrate, ${d.leaves} uscite`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ height: `${(d.joins / max) * 100}%`, background: CP.accent, borderRadius: "2px 2px 0 0", minHeight: d.joins ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div style={{ ...muted, display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span>{days[0] && `${days[0].d.slice(8, 10)}/${days[0].d.slice(5, 7)}`}</span><span>entrate al giorno, ultimi 30 giorni</span><span>oggi</span>
      </div>
    </div>
  );
}

function ChannelDetail({ ch, data, onChanged, onEdit, onClose }) {
  const [src, setSrc] = useState("instagram");
  const [lbl, setLbl] = useState("");
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const run = async (key, body) => {
    setBusy(key); setErr(null);
    try { await post(body); await onChanged(); } catch (x) { setErr(x.message); } finally { setBusy(null); }
  };
  const botName = data.bot?.username ? `@${data.bot.username}` : "il bot HOC";
  const live = ch.chat_id && ch.bot?.status === "admin";
  const st = ch.stats;
  const activeLinks = (ch.links || []).filter((l) => !l.revoked);

  return (
    <div style={{ fontSize: 13, color: CP.textSecondary }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <a href={ch.url} target="_blank" rel="noreferrer" style={{ color: CP.textPrimary, display: "inline-flex", gap: 4, alignItems: "center" }}>{ch.url.replace("https://", "")}<ExternalLink size={12} /></a>
        <BotBadge ch={ch} />
        <span style={{ flex: 1 }} />
        <button style={btn} onClick={onEdit}>Modifica</button>
        {data.bot_configured && <button style={btn} disabled={busy === "refresh"} onClick={() => run("refresh", { action: "refresh", id: ch.id })}><RefreshCw size={13} />{busy === "refresh" ? "Verifico…" : "Verifica"}</button>}
      </div>
      {err && <Notice danger>{err}</Notice>}

      {!live && (
        <Notice>
          <b style={{ fontWeight: 500, color: CP.textPrimary }}>Per vedere chi entra serve il bot nel canale.</b>{" "}
          Su Telegram: apri il canale → Amministratori → Aggiungi amministratore → cerca {botName} → lascia attivo il permesso «Invitare utenti tramite link» → Salva.
          {ch.handle ? " Poi premi «Verifica»." : " Il canale è privato: dopo averlo aggiunto, collegalo dalla lista «Bot aggiunto, da collegare» in questa pagina."}
          {!data.bot_configured && " (Il bot HOC non è ancora attivo: la mappa intanto si compila lo stesso.)"}
        </Notice>
      )}

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
        <Metric label="Iscritti" value={int(ch.members)} note={ch.members_at ? `letto ${when(ch.members_at)}` : null} />
        <Metric label="Ultimi 7 giorni" value={signed(ch.members_7d)} />
        <Metric label="Ultimi 30 giorni" value={signed(ch.members_30d)} />
      </div>

      <SectionTitle aside={live ? `dal ${new Date(ch.bot.at).toLocaleDateString("it-IT")}` : null}>Da dove entrano</SectionTitle>
      {st.totals.joins === 0 && <div style={{ ...muted, marginBottom: 10 }}>Nessuna entrata registrata. Si conta da quando il bot è nel canale: chi c'era prima non si vede.</div>}
      {st.bySource.length > 0 && (
        <DataTable
          minWidth={420}
          rows={st.bySource}
          defaultSort={{ key: "joins", dir: -1 }}
          columns={[
            { key: "label", label: "Fonte" },
            { key: "joins", label: "Entrati", align: "right", render: (r) => int(r.joins) },
            { key: "leaves", label: "Usciti", align: "right", render: (r) => int(r.leaves) },
            { key: "stay_rate", label: "Restano", align: "right", render: (r) => (r.stay_rate == null ? "—" : fmtPct(r.stay_rate)) },
          ]}
        />
      )}
      {st.totals.leaves_before_bot > 0 && <div style={{ ...muted, marginTop: 6 }}>{int(st.totals.leaves_before_bot)} uscite di iscritti entrati prima del bot (senza fonte).</div>}
      {st.days.some((d) => d.joins) && <div style={{ marginTop: 14 }}><DayBars days={st.days} /></div>}

      <SectionTitle>Link d'ingresso per fonte (facoltativi)</SectionTitle>
      <div style={{ ...muted, marginBottom: 8 }}>Lo stesso canale può avere più link per entrare: tutti portano qui dentro, ma ognuno conta chi lo usa. Se metti un link nella bio di Instagram e un altro su TikTok, sopra vedi quanti sono entrati da Instagram e quanti da TikTok. Senza, vedi solo il totale.</div>
      {activeLinks.map((l) => (
        <div key={l.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${CP.border}`, flexWrap: "wrap" }}>
          <span style={{ color: CP.textPrimary, minWidth: 140 }}>{l.name}</span>
          <code style={{ fontSize: 12, color: CP.textSecondary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{l.url}</code>
          <CopyBtn text={l.url} />
          <button style={{ ...btn, padding: "4px 8px" }} disabled={busy === l.key} onClick={async () => { if (await confirmDialog({ title: `Revocare il link «${l.name}»?`, message: "Chi lo usa non potrà più entrare da lì.", ok: "Revoca", danger: true })) run(l.key, { action: "revoke", id: ch.id, key: l.key }); }}>Revoca</button>
        </div>
      ))}
      {live ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <select style={{ ...input, width: 150 }} value={src} onChange={(e) => setSrc(e.target.value)}>
            {Object.entries(data.sources).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input style={{ ...input, flex: 1, minWidth: 140 }} value={lbl} onChange={(e) => setLbl(e.target.value)} placeholder="Dettaglio (es. bio, storia del 15/10)" maxLength={40} />
          <button style={btnPrimary} disabled={busy === "link"} onClick={() => run("link", { action: "link", id: ch.id, source: src, label: lbl }).then(() => setLbl(""))}><Link2 size={13} />{busy === "link" ? "Creo…" : "Crea link"}</button>
        </div>
      ) : <div style={muted}>I link si creano quando il bot è amministratore del canale.</div>}

      <SectionTitle>Da Telegram a OnlyFans</SectionTitle>
      <div style={{ ...muted, marginBottom: 8 }}>I link di tracciamento OnlyFans della creator con «Telegram» o «TG» nel nome, trovati da soli: non serve inserirli. Se una creator ha più canali, i numeri sono della creator, non del singolo canale.</div>
      <OfBlock names={ch.creators} of={data.of} />

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, gap: 8, flexWrap: "wrap" }}>
        <span style={muted}>{[ch.manager && `Gestito da ${ch.manager}`, ch.note].filter(Boolean).join(" · ")}</span>
        <button style={{ ...btn, color: CP.accentRed }} onClick={async () => { if (await confirmDialog({ title: "Togliere il canale dalla mappa?", message: "Si perdono anche i conteggi delle entrate.", ok: "Togli", danger: true })) run("del", { action: "delete", id: ch.id }).then(onClose); }}><Trash2 size={13} />Togli dalla mappa</button>
      </div>
    </div>
  );
}

function PendingRow({ p, channels, onDone }) {
  const candidates = channels.filter((c) => !c.chat_id);
  const [id, setId] = useState("");
  const [err, setErr] = useState(null);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${CP.border}`, flexWrap: "wrap" }}>
      <span style={{ color: CP.textPrimary, minWidth: 180 }}>{p.title || "Senza titolo"}{p.username && <span style={muted}> · @{p.username}</span>}</span>
      <span style={muted}>bot aggiunto {when(p.at)}</span>
      <span style={{ flex: 1 }} />
      <select style={{ ...input, width: 220 }} value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">È il canale di…</option>
        {candidates.map((c) => <option key={c.id} value={c.id}>{c.creators.join(", ")} · {c.url.replace("https://", "")}</option>)}
      </select>
      <button style={btnPrimary} disabled={!id} onClick={async () => { setErr(null); try { await post({ action: "connect", id, chat_id: p.chat_id }); onDone(); } catch (x) { setErr(x.message); } }}>Collega</button>
      {err && <div style={{ color: CP.accentRed, fontSize: 12, width: "100%" }}>{err}</div>}
    </div>
  );
}

// Vetro (30/10/2026): la domanda è «quali canali portano iscritti, e quanti passano su OnlyFans?».
// I canali in fila per entrati negli ultimi 30 giorni (un tocco apre il canale), sotto le entrate di
// tutti i canali giorno per giorno; accanto quanti canali hanno il bot dentro (senza, non si conta
// niente) e la scheda delle creator ancora senza canale in mappa.
function TelegramTop({ channels, missing, live, joins30, ofSubs30, onOpen }) {
  const j30 = (c) => c.stats.days.reduce((a, d) => a + d.joins, 0);
  const items = channels.map((c) => ({ c, v: j30(c) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v)
    .map(({ c, v }) => ({ label: `${c.creators.join(", ")} · ${c.title || c.url.replace("https://t.me/", "")}`, value: v, onClick: () => onOpen(c.id) }));
  const byDay = {};
  for (const c of channels) for (const d of c.stats.days) byDay[d.d] = (byDay[d.d] || 0) + d.joins;
  const days = Object.keys(byDay).sort();
  const of30 = channels.reduce((a, c) => a + (ofSubs30(c) || 0), 0);
  return (
    <div className="vt-row21" style={{ gap: 12, marginBottom: 16 }}>
      <Panel i={0} title="Chi porta iscritti" aside="entrati negli ultimi 30 giorni, solo canali col bot · tocca per il canale">
        {items.length ? <RankBars items={items} format={int} limit={8} /> : <div style={{ fontSize: 13.5, color: CP.textSecondary }}>Ancora nessuna entrata registrata: si conta da quando il bot è nel canale.</div>}
        {days.length > 1 && joins30 > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12.5, color: CP.textMuted, marginBottom: 6 }}>Entrate al giorno, tutti i canali</div>
            <Bars data={days.map((d) => byDay[d])} labels={days.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`)} height={110} format={(v) => int(v)} unit=" entrate" />
          </div>
        )}
      </Panel>
      <div className="vt-side" style={{ display: "grid", gap: 12, minWidth: 0, alignContent: "start" }}>
        <GoalRing i={1} pct={channels.length ? live / channels.length : 0} tone={channels.length && live === channels.length ? "good" : "near"} size={104}
          title="Canali col bot dentro" sub={`${int(live)} su ${int(channels.length)} · ${int(joins30)} entrati in 30 giorni${of30 ? ` · ${int(of30)} abbonati OF dai link TG` : ""}`} />
        <HotTile i={2} lvl={missing.length ? "ink" : "0"} label="Creator senza canale" value={int(missing.length)}
          sub={missing.length ? `${missing.slice(0, 4).join(", ")}${missing.length > 4 ? ` e altre ${missing.length - 4}` : ""} · le trovi in fondo` : "tutte le creator hanno un canale in mappa"} />
      </div>
    </div>
  );
}

export default function TelegramChannelsPage() {
  const { data, error, isLoading, mutate } = useSWR(API, fetcher, { revalidateOnFocus: false });
  const [form, setForm] = useState(null); // null | {} nuovo | { preset } | canale
  const [openId, setOpenId] = useState(null);
  const [setupMsg, setSetupMsg] = useState(null);
  const channels = data?.channels || [];
  const open = channels.find((c) => c.id === openId);

  // abbonati OF a 30 giorni dai link "Telegram"/"TG" delle creator del canale (della creator, non del canale)
  const ofSubs30 = (r) => { const v = r.creators.map((n) => data?.of?.[n]?.subs_30).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  const withChannel = new Set(channels.flatMap((c) => c.creators));
  const missing = (data?.creators || []).filter((c) => !withChannel.has(c));
  const live = channels.filter((c) => c.chat_id && c.bot?.status === "admin").length;
  const joins30 = channels.reduce((s, c) => s + c.stats.days.reduce((a, d) => a + d.joins, 0), 0);
  const inVetro = useInVetro();

  const columns = [
    { key: "creator", label: "Creator", render: (r) => r.creators.join(", "), sort: (r) => r.creators.join(", ") },
    { key: "title", label: "Canale", render: (r) => <span>{r.title || r.url.replace("https://t.me/", "")}<span style={muted}> · {r.kind}</span></span>, sort: (r) => r.title || r.url },
    { key: "bot", label: "Bot", render: (r) => <BotBadge ch={r} />, sort: (r) => (r.bot?.status === "admin" ? 1 : 0) },
    { key: "members", label: "Iscritti", align: "right", render: (r) => int(r.members) },
    { key: "members_7d", label: "7 giorni", align: "right", render: (r) => signed(r.members_7d) },
    { key: "joins30", label: "Entrati 30g", align: "right", render: (r) => int(r.stats.days.reduce((a, d) => a + d.joins, 0)), sort: (r) => r.stats.days.reduce((a, d) => a + d.joins, 0) },
    { key: "of", label: "Abbonati OF 30g", align: "right", render: (r) => { const v = ofSubs30(r); return v == null ? <span style={muted}>—</span> : int(v); }, sort: (r) => ofSubs30(r) ?? -1 },
  ];

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "8px 16px 40px", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Performance" }, { label: "Canali Telegram" }]}
        title="Canali Telegram"
        subtitle="La mappa dei canali delle creator. Con il bot HOC amministratore del canale vedi chi entra e quanti restano; dai link di tracciamento con «Telegram» o «TG» nel nome, quanti passano su OnlyFans."
        actions={<button style={btnPrimary} onClick={() => setForm({})}><Plus size={14} />Aggiungi canali</button>}
      />

      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && <div style={muted}>Carico…</div>}

      {data && (
        <>
          {data.all && !data.bot_configured && (
            <Notice>
              Il bot HOC non è ancora configurato: la mappa si compila già, le entrate per fonte partono quando è attivo. Servono in Vercel <code>TELEGRAM_BOT_TOKEN</code> (da @BotFather) e <code>TELEGRAM_WEBHOOK_SECRET</code>, poi «Registra webhook» qui.
            </Notice>
          )}
          {data.all && data.bot_configured && data.bot && !data.bot.webhook && (
            <Notice>
              Il bot @{data.bot.username} c'è ma Telegram non sa ancora dove mandare le entrate.{" "}
              <button style={{ ...btn, padding: "3px 8px" }} onClick={async () => { try { await post({ action: "setup" }); setSetupMsg("Webhook registrato"); mutate(); } catch (x) { setSetupMsg(x.message); } }}>Registra webhook</button>
              {setupMsg && <span style={{ marginLeft: 8 }}>{setupMsg}</span>}
            </Notice>
          )}
          {data.all && data.bot?.webhook_error && <Notice danger>Ultimo errore del webhook Telegram: {data.bot.webhook_error}</Notice>}

          {inVetro ? <TelegramTop channels={channels} missing={missing} live={live} joins30={joins30} ofSubs30={ofSubs30} onOpen={setOpenId} /> : (
          <section style={{ ...card, padding: "18px 20px", marginBottom: 16, display: "flex", gap: 32, flexWrap: "wrap" }}>
            <Metric label="Canali in mappa" value={int(channels.length)} />
            <Metric label="Creator senza canale" value={int(missing.length)} note={data.creators.length ? `su ${int(data.creators.length)}` : null} />
            <Metric label="Con il bot dentro" value={int(live)} />
            <Metric label="Entrati negli ultimi 30 giorni" value={int(joins30)} note="solo canali col bot" />
          </section>
          )}

          {data.pending.length > 0 && (
            <section style={{ ...card, padding: "14px 18px", marginBottom: 16 }}>
              <SectionTitle aside={`${data.pending.length}`}>Bot aggiunto, da collegare</SectionTitle>
              <div style={{ ...muted, marginBottom: 6 }}>Canali privati dove qualcuno ha aggiunto il bot: di' a quale canale della mappa corrispondono.</div>
              {data.pending.map((p) => <PendingRow key={p.chat_id} p={p} channels={channels} onDone={mutate} />)}
            </section>
          )}

          <DataTable
            rows={channels}
            columns={columns}
            defaultSort={{ key: "creator", dir: 1 }}
            onRowClick={(r) => setOpenId(r.id)}
            empty="Nessun canale in mappa. Aggiungi il primo con «Aggiungi canale»."
          />

          {missing.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <SectionTitle aside={int(missing.length)}>Creator senza canale in mappa</SectionTitle>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {missing.map((c) => (
                  <button key={c} style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => setForm({ preset: c })}>{c} <Plus size={12} /></button>
                ))}
              </div>
              <div style={{ ...muted, marginTop: 6 }}>Se una creator non ha un canale Telegram, lasciala qui: la lista serve a vedere chi manca.</div>
            </div>
          )}
          {data.of_error && <div style={{ ...muted, marginTop: 10 }}>Abbonati OF non disponibili: {data.of_error}</div>}
        </>
      )}

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? "Modifica canale" : "Aggiungi canali"} maxWidth={520}>
        {form && <ChannelForm initial={form.id ? form : null} preset={form.preset} creators={data?.creators || []} onCancel={() => setForm(null)} onDone={() => { setForm(null); mutate(); }} />}
      </Modal>
      <Modal open={Boolean(open)} onClose={() => setOpenId(null)} title={open ? `${open.creators.join(", ")} · ${open.title || "Telegram"}` : ""} maxWidth={720}>
        {open && <ChannelDetail ch={open} data={data} onChanged={mutate} onEdit={() => { setForm(open); setOpenId(null); }} onClose={() => setOpenId(null)} />}
      </Modal>
    </div>
  );
}
