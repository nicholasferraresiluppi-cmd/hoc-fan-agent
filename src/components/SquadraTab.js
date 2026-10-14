"use client";

// Coaching vendite → scheda Squadra (14/10/2026). Chi della squadra dello split sa
// vendere rispetto alla modella su cui lavora, con presenza e partita IVA dal CRM,
// busta del mese scorso, contatto per la partita IVA e "Segna come uscita".
// Calcolo e scelte in src/lib/squadra-core.js. Accanto c'è l'indice di resa della
// chat (scheda Operatori): sono due misure diverse e quando non sono d'accordo la
// riga è da guardare con calma, non da decidere.

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CP, FONTS, alpha } from "@/lib/brand";
import { Metric, FilterChip, DataTable, Notice, NUM, card } from "@/components/ds";
import { nameKey, measuresDisagree } from "@/lib/squadra-core";

const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });

const MONTHS_IT = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const monthName = (ym) => (ym ? MONTHS_IT[Number(ym.slice(5, 7)) - 1] : "");
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "–");
const fx = (v, d = 2) => (v == null ? "–" : v.toFixed(d).replace(".", ","));
// punto delle migliaia anche a 4 cifre ($4.283): toLocaleString("it-IT") non lo mette
const usd = (n) => (n == null ? "–" : `$${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`);

const CONTACT = [
  ["", "—"],
  ["da_contattare", "Da contattare"],
  ["contattato", "Contattato"],
  ["aperta", "P. IVA aperta"],
  ["no", "Non interessato"],
];
const CONTACT_ORDER = { da_contattare: 0, contattato: 1, aperta: 2, no: 3, "": 9 };

const ctl = { background: CP.bgSunken, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "6px 9px", fontSize: 13, fontFamily: FONTS.body };
const btnSm = { background: CP.surfaceAlt, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "5px 9px", fontSize: 12, cursor: "pointer", fontFamily: FONTS.body, whiteSpace: "nowrap" };

function Bravura({ v }) {
  if (v == null) return <span style={{ color: CP.textMuted, fontSize: 12 }}>non confrontabile</span>;
  const c = v >= 1.25 ? CP.accentGreen : v < 0.7 ? CP.accentRed : CP.textPrimary;
  const w = Math.min(v, 2.5) / 2.5;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
      <span aria-hidden="true" style={{ position: "relative", width: 64, height: 6, borderRadius: 3, background: CP.borderSoft }}>
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${w * 100}%`, borderRadius: 3, background: alpha(c, "aa") }} />
        <span style={{ position: "absolute", left: `${(1 / 2.5) * 100}%`, top: -3, bottom: -3, width: 1, background: CP.textMuted }} />
      </span>
      <span style={{ color: c, ...NUM, minWidth: 34, textAlign: "right" }}>{fx(v)}</span>
    </span>
  );
}

function Chip({ children, tone }) {
  const color = tone === "warn" ? CP.accentSoftText : tone === "bad" ? CP.accentRed : tone === "good" ? CP.accentGreen : CP.textMuted;
  return <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 10, border: `1px solid ${alpha(color, "66")}`, color, whiteSpace: "nowrap" }}>{children}</span>;
}

function ContactCell({ row, onSave }) {
  const v = row.contact?.stato || "";
  return (
    <select
      aria-label={`Contatto partita IVA per ${row.name}`}
      value={v}
      onChange={(e) => onSave(row, { stato: e.target.value })}
      style={{ ...ctl, padding: "4px 6px", fontSize: 12, color: v === "aperta" ? CP.accentGreen : v === "da_contattare" ? CP.accentSoftText : CP.textPrimary }}
    >
      {CONTACT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}

function NoteCell({ row, onSave }) {
  const [val, setVal] = useState(row.contact?.nota || "");
  const saved = row.contact?.nota || "";
  return (
    <input
      aria-label={`Nota per ${row.name}`}
      value={val}
      maxLength={300}
      placeholder="es. chiamato 15/10"
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => { if (val.trim() !== saved) onSave(row, { nota: val.trim() }); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{ ...ctl, padding: "4px 7px", fontSize: 12, width: 170 }}
    />
  );
}

function ExitCell({ row, onExit }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!row.person) return <span style={{ color: CP.textMuted, fontSize: 12 }}>non nel CRM</span>;
  if (row.person.fase === "Uscita") return <span style={{ color: CP.textMuted, fontSize: 12 }}>uscita</span>;
  if (!ask) return <button type="button" style={btnSm} onClick={() => setAsk(true)}>Segna uscita</button>;
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button type="button" disabled={busy} style={{ ...btnSm, borderColor: CP.accentRed, color: CP.accentRed }}
        onClick={async () => { setBusy(true); await onExit(row); setBusy(false); setAsk(false); }}>
        {busy ? "Salvo…" : "Conferma uscita"}
      </button>
      <button type="button" style={btnSm} onClick={() => setAsk(false)}>Annulla</button>
    </span>
  );
}

export default function SquadraTab({ splitId, names, coachingOps }) {
  const url = `/api/admin/sales-coaching/squadra${splitId ? `?split=${encodeURIComponent(splitId)}` : ""}`;
  const { data, error, mutate, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, refreshInterval: (d) => (d?.computing && !d?.rows ? 15000 : 0) });
  const [presence, setPresence] = useState("qui");
  const [contactF, setContactF] = useState("");
  const [onlyFlag, setOnlyFlag] = useState(false);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState(null);

  const coachIdx = useMemo(() => {
    const m = new Map();
    for (const o of coachingOps || []) if (o.reliable) m.set(nameKey(o.op), o.index_net);
    return m;
  }, [coachingOps]);

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows.map((r) => {
      const chat = coachIdx.get(nameKey(r.name)) ?? null;
      return { ...r, id: r.name, chat, disagree: measuresDisagree(r.idx, chat), ck: CONTACT_ORDER[r.contact?.stato || ""] };
    });
  }, [data?.rows, coachIdx]);

  const filtered = rows.filter((r) => {
    if (presence === "qui" && (r.presence.key === "uscita" || r.presence.key === "fermo")) return false;
    if (presence === "via" && !(r.presence.key === "uscita" || r.presence.key === "fermo")) return false;
    if (contactF === "none" && r.contact?.stato) return false;
    if (contactF && contactF !== "none" && r.contact?.stato !== contactF) return false;
    if (onlyFlag && !r.disagree) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!r.name.toLowerCase().includes(s) && !(r.contact?.nota || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });
  // posizione = tra le righe che stai guardando (con "Ancora qui" non conta chi è uscito)
  const rankOf = new Map([...filtered].filter((r) => r.idx != null).sort((a, b) => b.idx - a.idx).map((r, i) => [r.name, i + 1]));
  const visible = filtered.map((r) => ({ ...r, rank: rankOf.get(r.name) ?? null }));

  async function saveContact(row, patch) {
    mutate((d) => d && { ...d, rows: d.rows.map((x) => (x.name === row.name ? { ...x, contact: { ...(x.contact || {}), ...patch } } : x)) }, false);
    const r = await fetch("/api/admin/sales-coaching/squadra", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "contact", name: row.name, ...patch }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setMsg(r?.ok ? { ok: true, text: `Salvato: ${row.name}` } : { ok: false, text: j.error || "Non salvato: riprova." });
    if (!r?.ok) mutate();
  }

  async function markExit(row) {
    const r = await fetch(`/api/admin/hr/people/${encodeURIComponent(row.person.id)}/phase`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "exit" }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) {
      setMsg({ ok: true, text: `${row.name} segnato come uscito nel CRM (fine collaborazione oggi; la data si cambia dalla scheda).` });
      mutate();
    } else setMsg({ ok: false, text: r?.status === 403 ? "Segnare un'uscita è riservato agli admin." : j.error || "Uscita non salvata." });
  }

  if (error) return <Notice danger>{error.message}</Notice>;
  if (isLoading || !data) return <p style={{ fontSize: 13, color: CP.textMuted }}>Caricamento…</p>;
  if (data.computing && !data.rows) return <Notice>Sto preparando la squadra (circa 20 secondi). La pagina si aggiorna da sola.</Notice>;

  const m = data.months;
  const here = rows.filter((r) => r.presence.key !== "uscita" && r.presence.key !== "fermo");
  const lowSenior = here.filter((r) => (r.tenure || 0) >= 4 && r.m1 != null && r.m2 != null && r.m1 < 0.7 && r.m2 < 0.7);
  const noPiva = here.filter((r) => r.person?.piva === "No");
  const toCall = here.filter((r) => r.contact?.stato === "da_contattare");
  const cname = (cid) => names?.[String(cid)] || `#${cid}`;

  const cols = [
    { key: "rank", label: "#", align: "right", render: (r) => <span style={{ color: CP.textMuted, fontSize: 12 }}>{r.rank ?? "–"}</span> },
    { key: "name", label: "Operatore", render: (r) => <Link href={`/leaderboard/operational/${encodeURIComponent(r.name)}`} style={{ color: CP.textPrimary, textDecoration: "none" }}>{r.name}</Link> },
    { key: "piva", label: "P. IVA", sort: (r) => r.person?.piva || "", render: (r) => r.person?.piva || <span style={{ color: CP.textMuted }}>n/d</span> },
    { key: "idx", label: "Bravura", align: "right", render: (r) => <Bravura v={r.idx} /> },
    { key: "m2", label: monthName(m.m2), align: "right", muted: true, render: (r) => fx(r.m2) },
    { key: "m1", label: monthName(m.m1), align: "right", muted: true, render: (r) => fx(r.m1) },
    { key: "chat", label: "Indice chat", align: "right", render: (r) => r.chat == null ? <span style={{ color: CP.textMuted }}>–</span> : <span title={r.disagree ? "Le due misure non sono d'accordo: da guardare" : undefined} style={{ color: r.disagree ? CP.accentSoftText : CP.textSecondary, ...NUM }}>{fx(r.chat)}{r.disagree ? " ≠" : ""}</span> },
    { key: "sph", label: "$/ora di turno", align: "right", render: (r) => (r.sph == null ? "–" : `${r.sph}`) },
    { key: "exp", label: "Attesi", align: "right", muted: true, render: (r) => (r.exp == null ? "–" : `${r.exp}`) },
    { key: "h", label: "Ore di turno", align: "right", muted: true },
    { key: "tenure", label: "Mesi di buste", align: "right", muted: true, render: (r) => r.tenure ?? "–" },
    { key: "crs", label: "Modelle (quota ore)", sortable: false, muted: true, render: (r) => <span style={{ fontSize: 12, whiteSpace: "normal", display: "inline-block", minWidth: 170 }}>{r.top.map(([c, s]) => `${cname(c)} ${Math.round(s * 100)}%`).join(" · ") || "–"}</span> },
    { key: "night", label: "Notte", align: "right", muted: true, render: (r) => (r.night == null ? "–" : `${Math.round(r.night * 100)}%`) },
    { key: "busta", label: `Busta ${monthName(m.busta)}`, align: "right", render: (r) => <span title={r.busta_status?.length ? `Stato busta: ${r.busta_status.join(", ")}` : undefined}>{usd(r.busta)}</span> },
    { key: "presence", label: "Presenza", sort: (r) => r.presence.label, render: (r) => {
      const tone = r.presence.key === "attiva" ? "good" : r.presence.key === "uscita" || r.presence.key === "fermo" ? "bad" : r.presence.key === "no_crm" ? "warn" : null;
      const chip = <Chip tone={tone}>{r.presence.label}</Chip>;
      return <span title={`Ultimo turno ${dmy(r.last_shift)}`}>{r.person ? <Link href={`/admin/hr/${r.person.id}`} style={{ textDecoration: "none" }}>{chip}</Link> : chip}</span>;
    } },
    { key: "ck", label: "Contatto P. IVA", render: (r) => <ContactCell row={r} onSave={saveContact} /> },
    { key: "nota", label: "Nota", sortable: false, render: (r) => <NoteCell key={`${r.name}:${r.contact?.nota || ""}`} row={r} onSave={saveContact} /> },
    { key: "flags", label: "Avvisi", sortable: false, render: (r) => <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>{r.flags.map((f) => <Chip key={f} tone="warn">{f}</Chip>)}</span> },
    { key: "exit", label: "Uscita", sortable: false, render: (r) => <ExitCell row={r} onExit={markExit} /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontSize: 17, fontWeight: 500, color: CP.textPrimary, margin: 0 }}>Chi sa vendere, a parità di modella e fascia oraria{data.split ? ` · ${data.split.name}` : " · tutta HOC"}</h2>
        <p style={{ fontSize: 12, color: CP.textMuted, margin: 0, lineHeight: 1.55, maxWidth: 860 }}>
          Bravura = venduto (Infloww) per ora di turno, diviso quello dei colleghi sulla stessa modella e nella stessa fascia oraria; 1,00 = come loro. Periodo dal 1 {monthName(m.m2)} al {dmy(m.infloww_until)} (ultimo export Infloww). Le ore di turno, per modella e fascia, vengono dal calendario CreatorsPro, usato solo come calendario: le ore «attive» di Infloww cambiano definizione da un mese all'altro e non sono confrontabili. {data.split ? "In squadra chi fa almeno metà delle ore sulle modelle dello split." : "Scegli uno split per vedere solo la sua squadra."} L'indice chat è quello della scheda Operatori: una misura diversa, solo sui PPV in chat.
        </p>
      </div>

      {data.stale && <Notice>I dati sono di più di un giorno fa ({new Date(data.generated_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}): il ricalcolo notturno non è passato.</Notice>}

      <div style={{ ...card, padding: "16px 18px", display: "flex", gap: 28, flexWrap: "wrap" }}>
        <Metric label="In squadra, ancora qui" value={String(here.length)} note={`${rows.length - here.length} usciti o fermi da 3 settimane`} />
        <Metric label="Con esperienza e bassi in tutti e due i mesi" value={String(lowSenior.length)} note={`almeno 4 mesi di buste, bravura sotto 0,70 a ${monthName(m.m2)} e ${monthName(m.m1)}`} attn={lowSenior.length > 0} />
        <Metric label="Senza partita IVA" value={String(noPiva.length)} note={`${here.filter((r) => !r.person).length} non nel CRM: partita IVA non nota`} />
        <Metric label="Da contattare" value={String(toCall.length)} note="segnati per la partita IVA" />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <FilterChip label={`Ancora qui (${here.length})`} active={presence === "qui"} onClick={() => setPresence("qui")} />
        <FilterChip label={`Tutti (${rows.length})`} active={presence === ""} onClick={() => setPresence("")} />
        <FilterChip label={`Usciti o fermi (${rows.length - here.length})`} active={presence === "via"} onClick={() => setPresence("via")} />
        <FilterChip label={`Misure in disaccordo (${rows.filter((r) => r.disagree).length})`} active={onlyFlag} onClick={() => setOnlyFlag(!onlyFlag)} />
        <label htmlFor="sq-contact" style={{ fontSize: 12, color: CP.textMuted, marginLeft: 8 }}>Contatto</label>
        <select id="sq-contact" value={contactF} onChange={(e) => setContactF(e.target.value)} style={ctl}>
          <option value="">Tutti</option>
          <option value="none">Senza stato</option>
          {CONTACT.slice(1).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input id="sq-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nome o nota" aria-label="Cerca nome o nota" style={{ ...ctl, minWidth: 180 }} />
        <span style={{ fontSize: 12, color: CP.textMuted }}>{visible.length} su {rows.length}</span>
      </div>

      <DataTable columns={cols} rows={visible} defaultSort={{ key: "idx", dir: -1 }} minWidth={1700} maxHeight="72vh" empty="Nessun operatore con questi filtri." />

      <p style={{ fontSize: 12, color: CP.textMuted, margin: 0, lineHeight: 1.55, maxWidth: 900 }}>
        Come leggerla: misura solo la vendita, non la qualità delle conversazioni né la presenza. Correlazione, non causa. Avvisi: «poche ore» sotto 100 ore di turno; «nuovo» fino a 3 mesi di buste (un nuovo in fondo è normale); «altalenante» se i due mesi distano più di 0,5; «pochi colleghi» se il confronto si regge su meno di 3 colleghi. Mesi di buste contati dal {monthName(data.tenure_from)} {data.tenure_from?.slice(0, 4)}: il massimo vuol dire «da allora o prima». Notte = quota di ore fra mezzanotte e mattina. Busta = totale delle buste CreatorsPro del mese (passa sopra per lo stato: le buste aperte possono ancora cambiare). Presenza dal CRM persone; «Nessun turno da 3 settimane» = ultimo turno più vecchio di 21 giorni. Contatto e nota si salvano da soli e li vede chi ha accesso a questa pagina. Dati del {new Date(data.generated_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}, ricalcolati ogni notte.
      </p>

      {msg && (
        <div role="status" style={{ position: "fixed", bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", left: "50%", transform: "translateX(-50%)", zIndex: 50, background: CP.panel || CP.surface, border: `1px solid ${msg.ok ? CP.border : CP.accentRed}`, color: msg.ok ? CP.textPrimary : CP.accentRed, borderRadius: 10, padding: "10px 14px", fontSize: 13, display: "flex", gap: 12, alignItems: "center", maxWidth: "calc(100vw - 32px)" }}>
          <span>{msg.text}</span>
          <button type="button" style={btnSm} onClick={() => setMsg(null)}>Chiudi</button>
        </div>
      )}
    </div>
  );
}
