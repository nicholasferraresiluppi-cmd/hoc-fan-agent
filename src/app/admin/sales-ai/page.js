"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, Notice, card, DataTable, Disclosure, FilterChip, SectionTitle } from "@/components/ds";

/**
 * /admin/sales-ai — Quartier generale del sales manager AI.
 *
 * Ogni notte gli uffici lavorano sui turni del giorno prima (dati → analisi →
 * garante → consegne). Qui la direzione vede cosa hanno fatto, legge i
 * feedback prima che arrivino a qualcuno e li approva, li corregge o li scarta.
 * Ispirato al "trading floor" che Nicholas ha indicato come modello (uffici con
 * un compito ciascuno, un ufficio rischi indipendente, un'incubatrice per le
 * idee non ancora provate).
 */

const fetcher = (u) => fetch(u, { cache: "no-store" }).then(async (r) => { const j = await r.json().catch(() => ({ error: "Risposta non valida" })); return r.ok ? j : { error: j.error || `Errore ${r.status}` }; });

const STATUS = {
  in_revisione: { label: "Da rivedere", tone: "accent" },
  bloccato: { label: "Bloccato dal Garante", tone: "red" },
  approvato: { label: "Approvato", tone: "green" },
  modificato: { label: "Corretto e approvato", tone: "green" },
  scartato: { label: "Scartato", tone: "muted" },
  non_consegnato: { label: "Pochi dati", tone: "muted" },
  in_lavorazione: { label: "In lavorazione", tone: "muted" },
};
const STAGE_OFFICE = { dati: "dati", analisi_invio: "analisi", analisi_attesa: "analisi", arbitro_invio: "consegne", arbitro_attesa: "consegne", fatto: "direzione" };

function Chip({ tone = "muted", children }) {
  const c = tone === "green" ? CP.accentGreen : tone === "red" ? CP.accentRed : tone === "accent" ? CP.accentSoftText : CP.textSecondary;
  const bg = tone === "accent" ? CP.accentSoft : tone === "muted" ? "transparent" : alpha(c, "18");
  return <span style={{ display: "inline-block", fontSize: 12, fontWeight: 500, color: c, background: bg, border: tone === "muted" ? `1px solid ${CP.border}` : "none", borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap" }}>{children}</span>;
}

const ago = (t) => {
  if (!t) return "";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "ora";
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h fa` : `${Math.round(h / 24)} g fa`;
};
const usd = (v) => `${(Number(v) || 0).toFixed(2).replace(".", ",")} $`;

export default function SalesAiHQ() {
  const [day, setDay] = useState(null);
  const [sel, setSel] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const q = day ? `?day=${day}` : "";
  const { data, error, mutate } = useSWR(`/api/admin/sales-ai${q}`, fetcher, { refreshInterval: 20000, revalidateOnFocus: false });
  useEffect(() => { if (!day && data?.day) setDay(data.day); }, [data, day]);

  if (error) return <Wrap><Notice danger>Errore di rete: la pagina non si è caricata.</Notice></Wrap>;
  if (!data) return <Wrap><div style={{ color: CP.textMuted }}>Caricamento…</div></Wrap>;
  if (data.error) return <Wrap><Notice danger>{data.error}</Notice></Wrap>;

  const job = data.job;
  const activeOffice = job?.status === "in_corso" ? STAGE_OFFICE[job.stage] : null;
  const lastByOffice = {};
  for (const e of data.events || []) if ((!e.day || e.day === data.day) && !lastByOffice[e.office]) lastByOffice[e.office] = e;
  const toReview = (data.items || []).filter((x) => x.status === "in_revisione" || x.status === "bloccato").length;

  return (
    <Wrap>
      <PageHead
        crumbs={[{ label: "Vendite" }, { label: "Sales manager AI" }]}
        title="Quartier generale vendite"
        subtitle="Ogni notte gli uffici leggono i turni del giorno prima e preparano un feedback per ogni operatore che ha lavorato da solo. Niente arriva a un operatore senza passare da qui: lo approvi, lo correggi o lo scarti. È coaching: non entra in score, compensi o decisioni HR."
      />

      {/* ticker */}
      <div style={{ ...card, padding: "10px 16px", marginBottom: 14, display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13, color: CP.textSecondary }}>
        <span>Notte del <b style={{ color: CP.textPrimary }}>{data.day}</b></span>
        <span>{job ? (job.status === "in_corso" ? <Chip tone="accent">in corso · {job.stage.replace("_", " ")}</Chip> : job.status === "errore" ? <Chip tone="red">errore</Chip> : <Chip tone="green">chiusa</Chip>) : <Chip>non partita</Chip>}</span>
        <span>Spesa AI oggi <b style={{ color: CP.textPrimary }}>{usd(data.spend_today_usd)}</b> su {usd(data.config.daily_cap_usd)}</span>
        {job?.spend_usd != null && <span>Questa notte <b style={{ color: CP.textPrimary }}>{usd(job.spend_usd)}</b></span>}
        <span>Da rivedere <b style={{ color: toReview ? CP.accentSoftText : CP.textPrimary }}>{toReview}</b></span>
        <span>Operatori: {data.config.operator_visible ? <b style={{ color: CP.accentGreen }}>vedono i feedback approvati</b> : <b style={{ color: CP.textPrimary }}>non vedono ancora nulla</b>}</span>
      </div>

      {/* pianta degli uffici */}
      <SectionTitle>Gli uffici</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginBottom: 22 }}>
        {data.offices.map((o) => {
          const live = activeOffice === o.id;
          const last = lastByOffice[o.id];
          return (
            <div key={o.id} style={{ ...card, padding: "14px 16px", borderColor: live ? CP.accent : CP.border, boxShadow: live ? `0 0 0 3px ${alpha(CP.accent, "22")}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: live ? CP.accent : last && Date.now() - last.at < 36 * 3600e3 ? CP.accentGreen : CP.border }} />
                <b style={{ fontSize: 14, color: CP.textPrimary }}>{o.nome}</b>
                <span style={{ marginLeft: "auto", fontSize: 11, color: CP.textMuted }}>{o.tipo}</span>
              </div>
              <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.45, minHeight: 36 }}>{o.ruolo}</div>
              {last && (
                <div style={{ marginTop: 10, fontSize: 12.5, color: CP.textPrimary, background: CP.surfaceAlt, borderRadius: "10px 10px 10px 2px", padding: "7px 10px", lineHeight: 1.4 }}>
                  {last.text}<div style={{ fontSize: 11, color: CP.textMuted, marginTop: 3 }}>{ago(last.at)}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* giorni */}
      {data.days?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {data.days.slice(0, 10).map((d) => <FilterChip key={d} label={d} active={d === data.day} onClick={() => { setDay(d); setSel(null); }} />)}
        </div>
      )}

      {/* coda di revisione */}
      <SectionTitle aside={job?.result ? `${job.result.in_revisione} passati dal Garante · ${job.result.bloccati} bloccati · ${job.result.non_consegnati} con pochi dati` : null}>Feedback della notte</SectionTitle>
      {(data.items || []).length === 0 ? (
        <Notice>{job ? "Nessun feedback per questa notte (ancora in corso, o nessun operatore da solo con abbastanza PPV)." : "Questa notte non è partita. Il sistema gira da solo alle 5 del mattino, ora italiana."}</Notice>
      ) : (
        <DataTable
          minWidth={720}
          columns={[
            { key: "operator", label: "Operatore", render: (r) => <b style={{ fontWeight: 500 }}>{r.operator}</b> },
            { key: "ppv", label: "PPV a mano", align: "right", num: true },
            { key: "status", label: "Stato", render: (r) => <Chip tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label || r.status}</Chip> },
            { key: "leva_titolo", label: "Da provare", render: (r) => r.leva_titolo || <span style={{ color: CP.textMuted }}>—</span> },
            { key: "problemi", label: "Garante", render: (r) => (r.problemi?.length ? <span style={{ color: CP.accentRed }}>{r.problemi.length} {r.problemi.length === 1 ? "problema" : "problemi"}</span> : <span style={{ color: CP.textMuted }}>ok</span>), sort: (r) => r.problemi?.length || 0 },
            { key: "reply", label: "Risposta", render: (r) => (r.reply ? `${r.reply.rating === "utile" ? "Utile" : r.reply.rating === "non_utile" ? "Non utile" : ""}${r.reply.commitment ? " · ci prova" : ""}` : <span style={{ color: CP.textMuted }}>—</span>) },
          ]}
          rows={data.items}
          onRowClick={(r) => setSel(r.key)}
          selected={(r) => r.key === sel}
        />
      )}

      {sel && <Detail day={data.day} k={sel} onDone={() => mutate()} onClose={() => setSel(null)} />}

      {/* regole del gioco */}
      <div style={{ marginTop: 26 }}>
        <SectionTitle>Le leve: cosa si può consigliare e cosa è ancora in incubatrice</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
          {Object.entries(data.levers).map(([k, l]) => (
            <div key={k} style={{ ...card, padding: "12px 14px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <b style={{ fontSize: 13.5, color: CP.textPrimary, fontWeight: 500 }}>{l.titolo}</b>
                <span style={{ marginLeft: "auto" }}><Chip tone={l.prescrivibile ? "green" : "muted"}>{l.prescrivibile ? "si consiglia" : "incubatrice"}</Chip></span>
              </div>
              <div style={{ fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.5 }}>{l.evidenza}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 8 }}>Una leva passa da incubatrice a "si consiglia" solo dopo una prova sui dati che mostri che fa guadagnare di più senza togliere proposte (studio 6 mesi, 257 operatori: la % di PPV comprati non predice i soldi, il numero di proposte sì).</p>
      </div>

      {/* registro della notte */}
      {job && (
        <div style={{ marginTop: 22 }}>
          <Disclosure open={logOpen} onToggle={() => setLogOpen((v) => !v)} title="Registro della notte" summary={`${job.log.length} voci · ${job.skipped.length} operatori non analizzati · ${job.errors.length} errori`}>
            <Registro job={job} />
          </Disclosure>
        </div>
      )}

      {data.is_admin && <Config cfg={data.config} onSaved={() => mutate()} day={data.day} />}
    </Wrap>
  );
}

function Registro({ job }) {
  return (
    <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.6 }}>
      {job.log.map((l, i) => <div key={i}><span style={{ color: CP.textMuted, fontVariantNumeric: "tabular-nums" }}>{new Date(l.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span> · <b style={{ fontWeight: 500 }}>{l.office}</b> · {l.text}</div>)}
      {job.skipped.length > 0 && <div style={{ marginTop: 10 }}><b style={{ fontWeight: 500 }}>Non analizzati:</b> {job.skipped.map((s) => `${s.operator} (${s.reason})`).join("; ")}</div>}
      {job.errors.length > 0 && <div style={{ marginTop: 10, color: CP.accentRed }}>{job.errors.map((e, i) => <div key={i}>{e.stage}: {e.error}</div>)}</div>}
    </div>
  );
}

function Detail({ day, k, onDone, onClose }) {
  const { data, mutate } = useSWR(`/api/admin/sales-ai?day=${day}&key=${encodeURIComponent(k)}`, fetcher, { revalidateOnFocus: false });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState({});
  useEffect(() => { if (data?.feedback) setText(data.feedback.edited_message || data.feedback.message || ""); }, [data]);
  if (!data) return <div style={{ ...card, padding: 18, marginTop: 14, color: CP.textMuted }}>Caricamento…</div>;
  if (data.error) return <Notice danger>{data.error}</Notice>;
  const fb = data.feedback;
  const arb = fb.arbiter || {};
  const original = fb.message || "";

  async function review(decision) {
    setBusy(true); setMsg(null);
    const edited = text.trim() !== original.trim();
    const r = await fetch("/api/admin/sales-ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "review", day, key: k, decision: decision === "approva" && edited ? "modifica" : decision, message: text }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setMsg({ danger: true, text: j.error || "Errore" });
    else { setMsg({ text: j.status === "scartato" ? "Scartato: non arriverà all'operatore." : "Fatto: è nella sua pagina appena la visibilità agli operatori è accesa." }); await mutate(); onDone(); }
  }
  async function recheck() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/sales-ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "recheck", day, key: k }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { text: j.guard?.ok ? "Ora passa il Garante." : "Il Garante lo blocca ancora." } : { danger: true, text: j.error || "Errore" });
    await mutate(); onDone();
  }
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <section style={{ ...card, padding: "18px 20px", marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0, color: CP.textPrimary }}>{fb.operator}</h2>
        <Chip tone={STATUS[fb.status]?.tone}>{STATUS[fb.status]?.label || fb.status}</Chip>
        {arb.confidenza && <span style={{ fontSize: 12.5, color: CP.textMuted }}>confidenza {arb.confidenza}</span>}
        <button onClick={onClose} style={{ marginLeft: "auto", ...btnGhost }}>Chiudi</button>
      </div>

      {fb.guard?.problems?.length > 0 && (
        <Notice danger>
          <b>Il Garante ha bloccato questo feedback:</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{fb.guard.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
          Puoi correggere il testo qui sotto e approvarlo, scartarlo, oppure <button onClick={recheck} disabled={busy} style={{ background: "none", border: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer", font: "inherit" }}>ripassarlo dal Garante</button> (se le regole sono cambiate).
        </Notice>
      )}
      {data.pack?.acquisti_finestra_aperta && <p style={{ fontSize: 12.5, color: CP.textMuted, margin: "0 0 10px" }}>Gli acquisti dei PPV di ieri possono arrivare fino a 72 ore dopo: il numero dei comprati è ancora un minimo.</p>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 18 }}>
        <div>
          <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>Il messaggio che riceverebbe (puoi correggerlo)</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} style={{ width: "100%", boxSizing: "border-box", background: CP.bg, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: 12, fontSize: 14, lineHeight: 1.55, fontFamily: FONTS.body, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button disabled={busy || (fb.status === "bloccato" && text.trim() === original.trim())} onClick={() => review("approva")} style={btnPrimary}>{text.trim() !== original.trim() ? "Salva correzione e approva" : "Approva"}</button>
            <button disabled={busy} onClick={() => review("blocca")} style={btnGhost}>Scarta</button>
          </div>
          {msg && <div style={{ marginTop: 8, fontSize: 13, color: msg.danger ? CP.accentRed : CP.accentGreen }}>{msg.text}</div>}
          {data.reply && (
            <div style={{ marginTop: 14, fontSize: 13, color: CP.textSecondary }}>
              <b style={{ fontWeight: 500 }}>Risposta dell'operatore:</b> {data.reply.rating === "utile" ? "utile" : data.reply.rating === "non_utile" ? "non utile" : "—"}{data.reply.commitment ? ` · «${data.reply.commitment}»` : ""}{data.reply.note ? ` · ${data.reply.note}` : ""}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>I numeri del turno</div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <tbody>{data.metrics.map((m) => <tr key={m.key} style={{ borderTop: `1px solid ${CP.borderSoft}` }}><td style={{ padding: "5px 0", color: CP.textSecondary }}>{m.label}</td><td style={{ textAlign: "right", color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{m.value}</td></tr>)}</tbody>
          </table>
          {arb.per_la_direzione && (
            <div style={{ marginTop: 14, fontSize: 13, color: CP.textPrimary, background: CP.surfaceAlt, borderRadius: 8, padding: "10px 12px", lineHeight: 1.5 }}>
              <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 4 }}>Per la direzione (da dire a voce, non va all'operatore)</div>{arb.per_la_direzione}
            </div>
          )}
          {arb.incubatrice?.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>
              <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 4 }}>Idee per l'incubatrice (da provare sui dati prima di consigliarle)</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{arb.incubatrice.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        <Disclosure open={!!open.q} onToggle={() => toggle("q")} title="Report del manager qualità chat" summary="come l'ha letto un ex top chatter"><Pre>{fb.reports?.qualita || "Mancante."}</Pre></Disclosure>
        <Disclosure open={!!open.d} onToggle={() => toggle("d")} title="Report del manager dati" summary="numeri, situazioni, campioni"><Pre>{fb.reports?.dati || "Mancante."}</Pre></Disclosure>
        <Disclosure open={!!open.v} onToggle={() => toggle("v")} title="Verifica delle citazioni" summary="controllo del codice su ogni frase citata dai manager"><Pre>{fb.verification || "—"}</Pre></Disclosure>
        <Disclosure open={!!open.m} onToggle={() => toggle("m")} title="I momenti del turno" summary={`${data.pack?.moments?.length || 0} PPV mandati a mano, con la chat intorno`}>
          <div style={{ display: "grid", gap: 10 }}>
            {(data.pack?.moments || []).map((m) => (
              <div key={m.id} style={{ border: `1px solid ${CP.borderSoft}`, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 12.5, color: CP.textSecondary, marginBottom: 4 }}><b style={{ fontWeight: 500, color: CP.textPrimary }}>{m.id}</b> · {m.price} $ · {m.venduto ? <span style={{ color: CP.accentGreen }}>comprato</span> : "non comprato (finora)"} · {m.scambi_ora_prima} scambi nell'ora prima · fan {m.min_da_ultimo_msg_fan == null ? "mai scritto" : `ha scritto ${m.min_da_ultimo_msg_fan} min prima`}{m.caption_bassa_resa ? " · caption che non vende" : ""}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                  {m.chat.map((c, i) => <div key={i} style={{ color: c.who === "FAN" ? CP.textSecondary : CP.textPrimary }}><span style={{ color: CP.textMuted }}>{c.hhmm} {c.who === "FAN" ? "fan" : "op"}</span> {c.text}{c.ppv ? <b style={{ color: CP.accentSoftText, fontWeight: 500 }}> [PPV {c.ppv} $]</b> : ""}</div>)}
                </div>
              </div>
            ))}
          </div>
        </Disclosure>
      </div>
    </section>
  );
}

function Config({ cfg, onSaved, day }) {
  const [pilot, setPilot] = useState(cfg.pilot_creators.join(", "));
  const [cap, setCap] = useState(cfg.daily_cap_usd);
  const [vis, setVis] = useState(cfg.operator_visible);
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [msg, setMsg] = useState(null);
  const [run, setRun] = useState(null);
  async function save() {
    const r = await fetch("/api/admin/sales-ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "config", pilot_creators: pilot.split(/[\s,]+/).filter(Boolean), daily_cap_usd: cap, operator_visible: vis, enabled }) });
    setMsg(r.ok ? "Salvato." : "Errore nel salvataggio."); onSaved();
  }
  async function start() {
    setRun("Avvio…");
    const r = await fetch("/api/cron/sales-ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day, force: true }) });
    const j = await r.json().catch(() => ({}));
    setRun(r.ok ? `Partita (${j.stage || j.action}). Gli uffici continuano da soli: la pagina si aggiorna.` : j.error || "Errore");
    onSaved();
  }
  const inp = { background: CP.bg, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: FONTS.body };
  return (
    <section style={{ ...card, padding: "16px 18px", marginTop: 22 }}>
      <SectionTitle>Impostazioni (solo admin)</SectionTitle>
      <div style={{ display: "grid", gap: 12, fontSize: 13, color: CP.textSecondary, maxWidth: 640 }}>
        <label>Creator in pilota (id del warehouse, separati da virgola)<br /><input value={pilot} onChange={(e) => setPilot(e.target.value)} style={{ ...inp, width: "100%", marginTop: 4 }} /></label>
        <label>Tetto di spesa AI al giorno ($)<br /><input type="number" min={0} max={20} step={0.5} value={cap} onChange={(e) => setCap(e.target.value)} style={{ ...inp, width: 120, marginTop: 4 }} /></label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Gli uffici lavorano ogni notte</label>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="checkbox" checked={vis} onChange={(e) => setVis(e.target.checked)} style={{ marginTop: 3 }} /> <span>Gli operatori vedono i feedback approvati nella loro pagina «Il mio allenatore». <span style={{ color: CP.accentRed }}>Accendere solo dopo il via dell'avvocato</span> (valutazione automatica dei lavoratori: AI Act e Statuto art. 4).</span></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={save} style={btnPrimary}>Salva</button>
          <button onClick={start} style={btnGhost}>Rifai la notte del {day}</button>
        </div>
        {msg && <div style={{ color: CP.accentGreen }}>{msg}</div>}
        {run && <div>{run}</div>}
      </div>
    </section>
  );
}

const btnPrimary = { padding: "8px 14px", background: CP.accent, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, color: CP.accentInk, cursor: "pointer", fontFamily: FONTS.body };
const btnGhost = { padding: "8px 14px", background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, color: CP.textSecondary, cursor: "pointer", fontFamily: FONTS.body };
const Pre = ({ children }) => <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.55, color: CP.textPrimary }}>{children}</div>;
const Wrap = ({ children }) => <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>{children}</div>;
