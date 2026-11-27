"use client";

/**
 * /admin/schede-numeri — «Scheda numeri» delle creator (19/11/2026, SCOUTING_USE).
 *
 * Crei un link personale per una creator (nessun account), lei compila a capitoli e carica gli
 * screenshot delle sue statistiche accanto agli esempi; qui leggi la scheda: chi è, dove sta,
 * cosa fa e cosa farebbe, i suoi numeri. Gli screenshot si aprono solo da qui (Blob privato).
 * Logica in lib/creator-numeri*.js, pagina della creator in app/numeri/[token].
 */
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Plus, X, Copy, Check, ExternalLink, Trash2, RotateCcw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, Metric, Notice, DataTable, SectionTitle, EmptyState, card, BTN, BTN_PRIMARY } from "@/components/ds";
import { CHAPTERS, SHOT_STEPS, CONTENT_TYPES, CONTENT_LEVELS, groupFiles, firstRead } from "@/lib/creator-numeri-core";

const API = "/api/admin/schede-numeri";
const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(j?.error || `HTTP ${r.status}`), { status: r.status });
  return j;
};
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const STATE = {
  open: { label: "Da compilare", order: 1 },
  submitted: { label: "Inviata", order: 2 },
  expired: { label: "Scaduta", order: 0 },
};
const stateLabel = (l) => (l.state === "open" && l.updatedAt ? "In compilazione" : l.state === "open" && l.openedAt ? "Aperta" : STATE[l.state]?.label || l.state);

const input = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };
const lbl = { display: "block", fontSize: 12.5, color: CP.textSecondary, marginBottom: 5 };

export default function SchedeNumeriPage() {
  const { data, error, isLoading, mutate } = useSWR(API, fetcher, { revalidateOnFocus: false });
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    try { const t = new URLSearchParams(window.location.search).get("t"); if (t) setSel(t); } catch { /* niente */ }
  }, []);

  const links = data?.links || [];
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function create() {
    if (!name.trim()) return;
    setCreating(true); setFeedback(null);
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), note: note.trim() }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setCreated({ name: name.trim(), link: `${origin}/numeri/${j.token}` });
      setName(""); setNote("");
      await mutate();
    } catch (e) { setFeedback(e.message); } finally { setCreating(false); }
  }

  const sent = links.filter((l) => l.state === "submitted").length;
  const inProgress = links.filter((l) => l.state === "open" && l.updatedAt).length;
  const columns = [
    { key: "name", label: "Creator", render: (l) => <span style={{ fontWeight: 500 }}>{l.stageName || l.name}{l.stageName && l.stageName !== l.name ? <span style={{ color: CP.textMuted, fontWeight: 400 }}> · {l.name}</span> : null}</span> },
    { key: "state", label: "Stato", sort: (l) => STATE[l.state]?.order ?? 0, render: (l) => <span style={{ color: l.state === "submitted" ? CP.textPrimary : CP.textSecondary }}>{stateLabel(l)}</span> },
    { key: "call", label: "Prima lettura", sort: (l) => (l.call ? 1 : 0), render: (l) => l.call ? <span style={{ color: CP.accent, fontWeight: 500 }}>Da chiamare</span> : <span style={{ color: CP.textMuted }}>—</span> },
    { key: "files", label: "Screenshot", align: "right", render: (l) => fmtInt(l.files) },
    { key: "updatedAt", label: "Ultima modifica", align: "right", sort: (l) => l.submittedAt || l.updatedAt || 0, render: (l) => <span style={{ color: CP.textSecondary }}>{fmtDate(l.submittedAt || l.updatedAt)}</span> },
    { key: "createdAt", label: "Creato", align: "right", render: (l) => <span style={{ color: CP.textSecondary }}>{fmtDate(l.createdAt)}</span> },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1400, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Radar creator", href: "/admin/scouting" }, { label: "Schede numeri" }]}
        title="Schede numeri"
        subtitle="Un link personale per una creator che vuoi valutare. Lei racconta chi è e cosa fa, e carica gli screenshot delle sue statistiche accanto a un esempio di cosa inquadrare. Qui leggi tutto in una scheda."
        actions={!error && (
          <button onClick={() => { setFormOpen(!formOpen); setCreated(null); }} style={formOpen ? BTN : BTN_PRIMARY}>
            {formOpen ? <X size={15} /> : <Plus size={15} />}{formOpen ? "Chiudi" : "Nuovo link"}
          </button>
        )}
      />

      {error && <Notice danger={error.status !== 403}>{error.status === 403 ? "Pagina riservata a chi usa il Radar creator." : `Non riesco a caricare le schede: ${error.message}`}</Notice>}
      {data && !data.uploads && <Notice>Il caricamento degli screenshot non è attivo in questo ambiente (manca il collegamento al Blob): i link funzionano ma la creator non può caricare file.</Notice>}

      {!error && formOpen && (
        <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
          <SectionTitle>Nuovo link</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12, alignItems: "end" }}>
            <label style={{ minWidth: 0 }}><span style={lbl}>Per chi è (la creator lo vede nel saluto)</span><input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Giulia" /></label>
            <label style={{ minWidth: 0 }}><span style={lbl}>Nota per voi (facoltativa, lei non la vede)</span><input style={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. arriva da Marco" /></label>
            <div><button onClick={create} disabled={creating || !name.trim()} style={{ ...BTN_PRIMARY, opacity: creating || !name.trim() ? 0.5 : 1 }}>{creating ? "Creo…" : "Crea il link"}</button></div>
          </div>
          {feedback && <div style={{ color: CP.accentRed, fontSize: 13, marginTop: 10 }}>{feedback}</div>}
          {created && <CopyLink label={`Link per ${created.name}`} link={created.link} />}
          <p style={{ color: CP.textMuted, fontSize: 13, margin: "12px 0 0", lineHeight: 1.5 }}>Il link vale 30 giorni. Lei non ha bisogno di un account: compila dal telefono, si salva da solo e può riprendere quando vuole. Quando invia ti arriva un avviso su WhatsApp.</p>
        </section>
      )}

      {!error && isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {!error && !isLoading && links.length === 0 && (
        <EmptyState title="Nessuna scheda ancora">
          Crea un link con «Nuovo link», mandalo alla creator su WhatsApp o Telegram e quando ha finito la scheda compare qui.
        </EmptyState>
      )}

      {!error && links.length > 0 && (
        <>
          <section style={{ ...card, padding: "16px 18px", marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Link creati" value={fmtInt(links.length)} />
            <Metric label="In compilazione" value={fmtInt(inProgress)} />
            <Metric label="Inviate" value={fmtInt(sent)} />
          </section>
          <DataTable columns={columns} rows={links.map((l) => ({ ...l, id: l.token }))} defaultSort={{ key: "updatedAt", dir: -1 }}
            onRowClick={(l) => setSel(sel === l.token ? null : l.token)} selected={(l) => l.token === sel} minWidth={640} maxHeight={420} />
          <div style={{ fontSize: 12.5, color: CP.textMuted, margin: "8px 0 14px" }}>Clicca una riga per aprire la scheda o copiare il link.</div>
        </>
      )}

      {sel && <Detail token={sel} origin={origin} onClose={() => setSel(null)} onChanged={mutate} />}
    </div>
  );
}

function CopyLink({ label, link }) {
  const [ok, setOk] = useState(false);
  return (
    <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: CP.surfaceAlt, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color: CP.textSecondary }}>{label}</span>
      <code style={{ fontSize: 13, color: CP.textPrimary, wordBreak: "break-all", flex: "1 1 260px" }}>{link}</code>
      <button style={BTN} onClick={() => { navigator.clipboard?.writeText(link).then(() => { setOk(true); setTimeout(() => setOk(false), 1600); }).catch(() => {}); }}>
        {ok ? <Check size={14} /> : <Copy size={14} />}{ok ? "Copiato" : "Copia"}
      </button>
    </div>
  );
}

function Detail({ token, origin, onClose, onChanged }) {
  const { data, error, mutate } = useSWR(`${API}/${token}`, fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  if (error) return <Notice danger>{error.status === 404 ? "Scheda non trovata (forse cancellata)." : error.message}</Notice>;
  if (!data) return <div style={{ color: CP.textMuted, fontSize: 14 }}>Apro la scheda…</div>;
  const a = data.answers || {};
  const byStep = groupFiles(data.files);
  const fileUrl = (p) => `${API}/${token}/file?p=${encodeURIComponent(p)}`;

  async function reopen() {
    setBusy(true);
    await fetch(API, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "reopen" }) }).catch(() => {});
    await Promise.all([mutate(), onChanged()]); setBusy(false);
  }
  async function remove() {
    setBusy(true);
    await fetch(`${API}?t=${token}`, { method: "DELETE" }).catch(() => {});
    await onChanged(); setBusy(false); onClose();
  }

  const levels = Object.fromEntries(CONTENT_LEVELS.map((l) => [l.id, CONTENT_TYPES.filter((t) => a.content?.[t.id] === l.id).map((t) => t.label)]));
  const socials = [["Instagram", a.ig], ["TikTok", a.tiktok], ["X", a.x], ["Telegram", a.telegram], ["OnlyFans", a.onlyfans], ["Fanvue", a.fanvue], ["Altri", a.otherSocial]].filter(([, v]) => v);

  return (
    <section style={{ ...card, padding: "18px 20px", display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: CP.textPrimary }}>{a.stageName || data.name}</h2>
        <span style={{ fontSize: 13, color: CP.textMuted }}>{stateLabel({ ...data, updatedAt: data.updatedAt })}{data.submittedAt ? ` il ${fmtDate(data.submittedAt)}` : ""} · link creato il {fmtDate(data.createdAt)}{data.note ? ` · ${data.note}` : ""}</span>
        <button onClick={onClose} style={{ ...BTN, marginLeft: "auto", padding: "5px 10px" }}><X size={13} /> Chiudi</button>
      </div>
      <CopyLink label="Link della creator" link={`${origin}/numeri/${token}`} />

      <FirstRead r={firstRead(a)} />

      <Block title="Chi è">
        <Pairs rows={[["Nome con cui lavora", a.stageName], ["Nome vero", a.realName], ["Città", a.city], ["Dove scriverle", a.contact], ["Maggiorenne", a.adult ? "Confermato" : "Non confermato"], ["Lingue", a.languages]]} />
        {socials.length > 0 && <Pairs rows={socials.map(([k, v]) => [k, <SocialLink key={k} v={v} />])} />}
      </Block>

      <Block title="Contenuti">
        <Pairs rows={[["Lo fa già", levels.si.join(", ") || "—"], ["Lo farebbe", levels.farei.join(", ") || "—"], ["No", levels.no.join(", ") || "—"], ["Mostra il viso", a.face]]} />
      </Block>

      <Block title="La sua pagina">
        <Pairs rows={[["Piattaforma", a.platform], ["Abbonamento", a.subPrice], ["Tipo di pagina", a.pageKind], ["Da quando", a.since], ["Guadagno di un mese normale (dichiarato)", a.earnBand], ["Nuovi iscritti al giorno (dichiarati)", a.subsPerDay], ["Visualizzazioni al mese sui social (dichiarate)", a.viewsBand]]} />
      </Block>

      {CHAPTERS.filter((c) => SHOT_STEPS.some((s) => s.chapter === c.id)).map((c) => (
        <Block key={c.id} title={c.id === "pagina" ? "Screenshot della pagina" : c.id === "social" ? "Screenshot di Instagram e TikTok" : "Altri screenshot"}>
          <div style={{ display: "grid", gap: 14 }}>
            {SHOT_STEPS.filter((s) => s.chapter === c.id).map((s) => {
              const fs = byStep[s.id] || [];
              const skipped = a.skip?.[s.id];
              if (s.optional && !fs.length) return null;
              return (
                <div key={s.id} style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14.5, fontWeight: 500, color: CP.textPrimary }}>{s.title}</span>
                    <span style={{ fontSize: 12.5, color: CP.textMuted }}>{s.period}</span>
                    {!fs.length && <span style={{ fontSize: 12.5, color: CP.textMuted }}>{skipped ? "· dice di non averlo" : "· non caricato"}</span>}
                  </div>
                  {!fs.length && a.manual?.[s.id] && <div style={{ fontSize: 14, color: CP.textPrimary }}><span style={{ color: CP.textSecondary }}>Scritto a mano: </span>{a.manual[s.id]}</div>}
                  {s.read && <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5, maxWidth: 760 }}>{s.read}</div>}
                  {fs.length > 0 && (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {fs.map((f) => (
                        <a key={f.pathname} href={fileUrl(f.pathname)} target="_blank" rel="noreferrer" title="Apri a grandezza piena"
                          style={{ display: "block", width: 150, aspectRatio: "9 / 16", borderRadius: 8, overflow: "hidden", border: `1px solid ${CP.border}`, background: CP.surfaceAlt, position: "relative" }}>
                          <img src={fileUrl(f.pathname)} alt={s.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }} />
                          <ExternalLink size={13} style={{ position: "absolute", top: 6, right: 6, color: "#fff", filter: "drop-shadow(0 0 2px rgba(0,0,0,.6))" }} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Block>
      ))}

      <Block title="Le sue risposte">
        <Pairs rows={[
          ["Contenuti già pronti", a.readyContent], ["Contenuti nuovi a settimana", a.perWeek], ["Chi risponde in chat oggi", a.chatToday],
          ["Agenzie precedenti e vincoli", a.agency], ["Ore al giorno", a.hours], ["Quando può iniziare", a.start], ["Tempo e obiettivo", a.timeGoal],
          ["Profili bloccati o limitati", a.banned ? `${a.banned}${a.banDetail ? `: ${a.banDetail}` : ""}` : null], ["Altro", a.notes],
        ]} />
      </Block>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${CP.border}`, paddingTop: 14 }}>
        {data.state === "submitted" && <button style={BTN} disabled={busy} onClick={reopen}><RotateCcw size={14} /> Riapri per farle aggiungere qualcosa</button>}
        {!confirmDel
          ? <button style={BTN} disabled={busy} onClick={() => setConfirmDel(true)}><Trash2 size={14} /> Cancella scheda</button>
          : <>
              <span style={{ fontSize: 13, color: CP.textSecondary, alignSelf: "center" }}>Si cancellano risposte e screenshot, per sempre. Il link smette di funzionare.</span>
              <button style={{ ...BTN, color: CP.accentRed }} disabled={busy} onClick={remove}>Sì, cancella</button>
              <button style={BTN} onClick={() => setConfirmDel(false)}>Annulla</button>
            </>}
      </div>
    </section>
  );
}

function FirstRead({ r }) {
  if (!r.reasons.length && !r.notes.length) return null;
  return (
    <div style={{ display: "grid", gap: 6, padding: "12px 14px", borderRadius: 10, background: CP.surfaceAlt, border: `1px solid ${CP.border}` }}>
      <div style={{ fontSize: 14.5, fontWeight: 500, color: r.call ? CP.accent : CP.textPrimary }}>{r.call ? "Prima lettura: da chiamare" : "Prima lettura"}</div>
      {r.reasons.map((x) => <div key={x} style={{ fontSize: 13.5, color: CP.textPrimary }}>{x}</div>)}
      {r.notes.map((x) => <div key={x} style={{ fontSize: 13.5, color: CP.textSecondary }}>Da sapere: {x.charAt(0).toLowerCase() + x.slice(1)}</div>)}
      <div style={{ fontSize: 12.5, color: CP.textMuted, lineHeight: 1.5 }}>Soglie del vecchio «Audit modella» su numeri che scrive lei: dicono chi guardare per prima, non quanto può rendere. Confrontali con gli screenshot.</div>
    </div>
  );
}

function Block({ title, children }) {
  return <div style={{ display: "grid", gap: 10 }}><SectionTitle>{title}</SectionTitle>{children}</div>;
}
function Pairs({ rows }) {
  const shown = rows.filter(([, v]) => v != null && v !== "");
  if (!shown.length) return <div style={{ fontSize: 13.5, color: CP.textMuted }}>Niente compilato.</div>;
  return (
    <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(140px, 240px) minmax(0, 1fr)", gap: "8px 16px", fontSize: 14 }}>
      {shown.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt style={{ color: CP.textSecondary }}>{k}</dt>
          <dd style={{ margin: 0, color: CP.textPrimary, whiteSpace: "pre-wrap", minWidth: 0, overflowWrap: "anywhere" }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
function SocialLink({ v }) {
  const s = String(v).trim();
  const href = /^https?:\/\//i.test(s) ? s : /^[\w.-]+\.[a-z]{2,}\//i.test(s) ? `https://${s}` : null;
  return href ? <a href={href} target="_blank" rel="noreferrer" style={{ color: CP.accent }}>{s}</a> : <span>{s}</span>;
}
