"use client";

// Modelle salary (26/11/2026) — il manuale del salary model e dove si trova ogni modella.
// Richiesta di Nicholas, dopo la call con Sol: il documento ClickUp era «troppo documento»; prima
// una lavagna Miro, poi qui («una sezione sulla nostra web app ci dà più libertà»).
// Tre schede: Dove sono (lette dalla lista ClickUp Candidate, si aggiornano da sole), Manuale
// (i 7 passi: chi, cosa, messaggi, attenzione), Messaggi (pronti da copiare, traduzione sotto).
// Contenuto in src/lib/salary-manuale.js, logica in src/lib/salary-modelle(-core).js.

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, Tabs, EmptyState, Disclosure, BTN, BTN_PRIMARY, card } from "@/components/ds";
import { STEPS, MESSAGES } from "@/lib/salary-manuale";

const errText = (s) => (s === 401 || s === 403 ? "Sessione scaduta o permessi insufficienti." : s >= 500 ? "Errore del server, riprova." : "Errore.");
const fetcher = (url) => fetch(url).then((r) => (r.ok ? r.json() : r.json().catch(() => ({})).then((d) => Promise.reject(new Error(d.error || errText(r.status))))));
const VIEWS = ["dove", "manuale", "messaggi"];
const MSG = Object.fromEntries(MESSAGES.map((m) => [m.id, m]));
const fmtDay = (ms) => (ms ? new Date(ms).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "");
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "");

const CSS = `
.sm-page{max-width:1600px;margin:0 auto;padding:24px 20px 72px}
.sm-funnel{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin:0 0 28px}
.sm-row{display:grid;grid-template-columns:280px minmax(0,1fr) 170px;gap:24px;align-items:start}
.sm-steps{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.sm-detail{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.sm-msgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(460px,1fr));gap:16px;align-items:start}
.sm-rail{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0;margin:0 0 20px}
.sm-btn:focus-visible{outline:2px solid ${CP.accent};outline-offset:2px}
@media (max-width:1100px){.sm-row{grid-template-columns:1fr}.sm-detail{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:699px){
  .sm-page{padding:16px 16px 64px}
  .sm-funnel,.sm-rail{display:flex;overflow-x:auto;scrollbar-width:none}
  .sm-funnel>*{min-width:120px}.sm-rail>*{min-width:96px}
  .sm-detail{grid-template-columns:1fr}
  .sm-msgs{grid-template-columns:1fr}
  .sm-steps span.sm-lab{display:none}
}`;

// ── pezzi ────────────────────────────────────────────────────────────────────
function List({ items, empty = "—" }) {
  if (!items?.length) return <p style={{ margin: 0, fontSize: 14, color: CP.textMuted }}>{empty}</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc", display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((t, i) => <li key={i} style={{ fontSize: 14, lineHeight: 1.45, color: CP.textPrimary }}>{t}</li>)}
    </ul>
  );
}

function MsgChip({ id, onOpen }) {
  const m = MSG[id];
  if (!m) return null;
  return (
    <button type="button" className="sm-btn" onClick={() => onOpen(id)}
      style={{ ...BTN, minHeight: 32, padding: "5px 10px", fontSize: 13, whiteSpace: "normal", textAlign: "left", justifyContent: "flex-start", maxWidth: "100%", background: CP.accentSoft, color: CP.accentSoftText, border: "1px solid transparent" }}>
      Messaggio {m.n} · {m.title}
    </button>
  );
}

function CopyButton({ text, label = "Copia" }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="sm-btn"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1600); } catch { /* clipboard negata: si seleziona a mano */ } }}
      style={{ ...(ok ? BTN : BTN_PRIMARY), minHeight: 34, padding: "6px 12px" }}>
      {ok ? <Check size={15} /> : <Copy size={15} />}{ok ? "Copiato" : label}
    </button>
  );
}

// Passo per passo di una modella: fatto / qui ora / da fare.
function Stepper({ step }) {
  return (
    <div className="sm-steps" aria-label={step >= 0 ? `Passo ${step + 1} di 7` : undefined}>
      {STEPS.map((s, i) => {
        const done = step > i, now = step === i;
        return (
          <div key={s.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ height: 8, borderRadius: 4, background: now ? CP.accent : done ? CP.accentGreen : CP.surfaceAlt }} />
            <span className="sm-lab" style={{ fontSize: 12, lineHeight: 1.3, color: now ? CP.textPrimary : done ? CP.textSecondary : CP.textMuted, fontWeight: now ? 500 : 400 }}>{s.title}</span>
          </div>
        );
      })}
    </div>
  );
}

function ModelRow({ m, onMsg, onStep }) {
  const st = m.step >= 0 ? STEPS[m.step] : null;
  return (
    <article style={{ ...card, padding: "18px 20px", marginBottom: 12 }}>
      <div className="sm-row">
        <div>
          <div style={{ fontSize: 17, fontWeight: 500, color: CP.textPrimary }}>{m.label}</div>
          <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 2 }}>{[m.place, m.source].filter(Boolean).join(" · ")}</div>
          {m.info.length > 0 && (
            <dl style={{ margin: "12px 0 0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 13 }}>
              {m.info.map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt style={{ color: CP.textMuted }}>{k}</dt>
                  <dd style={{ margin: 0, color: CP.textPrimary }}>{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {m.step == null ? (
            <p style={{ margin: 0, fontSize: 14, color: CP.textSecondary }}>Stato «{m.status}» non è uno dei 7 passi: sistemalo sulla card ClickUp.</p>
          ) : m.step === -1 ? (
            <p style={{ margin: 0, fontSize: 14, color: CP.textSecondary }}>Scartata.</p>
          ) : (
            <>
              <Stepper step={m.step} />
              <div>
                <div style={{ fontSize: 12.5, color: CP.textMuted, marginBottom: 4 }}>Adesso · passo {st.n}, {st.title.toLowerCase()}</div>
                <div style={{ fontSize: 15, color: CP.textPrimary, lineHeight: 1.45 }}>{st.now}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {st.messages.map((id) => <MsgChip key={id} id={id} onOpen={onMsg} />)}
                  <button type="button" className="sm-btn" onClick={() => onStep(m.step)} style={{ ...BTN, minHeight: 32, padding: "4px 10px", fontSize: 13 }}>Il passo nel manuale</button>
                </div>
              </div>
            </>
          )}
          {m.last && (
            <div style={{ borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 10, fontSize: 13, lineHeight: 1.5, color: CP.textSecondary }}>
              <span style={{ color: CP.textMuted }}>Ultima nota{m.last.date ? ` · ${fmtDay(m.last.date)}` : ""}{m.last.by ? ` · ${m.last.by}` : ""}: </span>{m.last.text}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          {m.url && <a href={m.url} target="_blank" rel="noreferrer" className="sm-btn" style={{ ...BTN, minHeight: 34 }}><ExternalLink size={15} />Card ClickUp</a>}
          {m.updatedAt && <span style={{ fontSize: 12.5, color: CP.textMuted }}>Aggiornata il {fmtDay(m.updatedAt)}</span>}
          {m.assignees.length > 0 && <span style={{ fontSize: 12.5, color: CP.textMuted }}>Segue: {m.assignees.join(", ")}</span>}
        </div>
      </div>
    </article>
  );
}

// ── viste ────────────────────────────────────────────────────────────────────
function DoveView({ data, onMsg, onStep }) {
  const [openOut, setOpenOut] = useState(false);
  const live = data.models.filter((m) => m.step !== -1);
  const out = data.models.filter((m) => m.step === -1);
  return (
    <>
      <div className="sm-funnel">
        {STEPS.map((s, i) => {
          const n = data.counts.steps[i];
          return (
            <button key={s.key} type="button" className="sm-btn" onClick={() => onStep(i)}
              style={{ ...card, textAlign: "left", padding: "12px 14px", cursor: "pointer", fontFamily: FONTS.body, background: n ? CP.surface : "transparent", borderColor: n ? CP.accent : CP.border }}>
              <div style={{ fontSize: 12.5, color: CP.textMuted }}>{s.n}</div>
              <div style={{ fontSize: 14, color: CP.textPrimary, margin: "2px 0 8px", minHeight: 38, lineHeight: 1.35 }}>{s.title}</div>
              <div style={{ fontSize: 26, fontWeight: 500, color: n ? CP.textPrimary : CP.textMuted, fontVariantNumeric: "tabular-nums" }}>{n}</div>
            </button>
          );
        })}
      </div>
      {live.length ? live.map((m) => <ModelRow key={m.id} m={m} onMsg={onMsg} onStep={onStep} />) : (
        <EmptyState title="Nessuna modella nel percorso">Quando si trova una candidata, si apre la sua card nella lista ClickUp «Candidate» con lo stato «trovata»: compare qui da sola.</EmptyState>
      )}
      {out.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <Disclosure open={openOut} onToggle={() => setOpenOut((v) => !v)} title={`Scartate (${out.length})`} summary={out.map((m) => m.label).join(", ")}>
            {out.map((m) => <ModelRow key={m.id} m={m} onMsg={onMsg} onStep={onStep} />)}
          </Disclosure>
        </div>
      )}
    </>
  );
}

function Block({ title, children, tone }) {
  const warn = tone === "warn";
  return (
    <section style={{ ...card, padding: "16px 18px", borderLeft: `3px solid ${warn ? CP.gold : CP.border}` }}>
      <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 500, color: warn ? CP.gold : CP.textMuted }}>{title}</h3>
      {children}
    </section>
  );
}

function ManualeView({ step, setStep, models, onMsg }) {
  const s = STEPS[step];
  const here = models.filter((m) => m.step === step);
  return (
    <>
      <nav className="sm-rail" aria-label="Passi">
        {STEPS.map((x, i) => {
          const on = i === step, done = i < step;
          return (
            <button key={x.key} type="button" className="sm-btn" onClick={() => setStep(i)} aria-current={on ? "step" : undefined}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", fontFamily: FONTS.body, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative" }}>
              {i > 0 && <span aria-hidden style={{ position: "absolute", top: 17, right: "calc(50% + 24px)", width: "calc(100% - 48px)", height: 2, borderRadius: 1, background: done || on ? CP.accent : CP.border }} />}
              <span style={{ position: "relative", width: 36, height: 36, borderRadius: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 500,
                background: on ? CP.accent : done ? CP.accentSoft : CP.surface, color: on ? CP.accentInk : done ? CP.accentSoftText : CP.textSecondary, border: `1px solid ${on || done ? CP.accent : CP.border}` }}>{x.n}</span>
              <span style={{ fontSize: 13, lineHeight: 1.3, textAlign: "center", color: on ? CP.textPrimary : CP.textSecondary, fontWeight: on ? 500 : 400 }}>{x.title}</span>
            </button>
          );
        })}
      </nav>

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", margin: "0 0 14px" }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500, color: CP.textPrimary }}>{s.n}. {s.title}</h2>
        <span style={{ fontSize: 14, color: CP.textSecondary }}>{s.now}</span>
      </div>

      <div className="sm-detail">
        <Block title="Chi se ne occupa"><List items={s.who} /></Block>
        <Block title="Cosa si fa"><List items={s.does} /></Block>
        <Block title="Messaggi e domande">
          <List items={s.ask} />
          {s.messages.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, alignItems: "flex-start" }}>{s.messages.map((id) => <MsgChip key={id} id={id} onOpen={onMsg} />)}</div>}
        </Block>
        <Block title="Attenzione" tone={s.watch.length ? "warn" : undefined}><List items={s.watch} empty="Niente di particolare a questo passo." /></Block>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
        <span style={{ fontSize: 13.5, color: CP.textSecondary }}>
          {here.length ? <>A questo passo adesso: <b style={{ fontWeight: 500, color: CP.textPrimary }}>{here.map((m) => m.label).join(", ")}</b></> : "Nessuna modella a questo passo adesso."}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
          <button type="button" className="sm-btn" disabled={step === 0} onClick={() => setStep(step - 1)} style={{ ...BTN, opacity: step === 0 ? 0.5 : 1 }}><ChevronLeft size={15} />Passo prima</button>
          <button type="button" className="sm-btn" disabled={step === STEPS.length - 1} onClick={() => setStep(step + 1)} style={{ ...BTN, opacity: step === STEPS.length - 1 ? 0.5 : 1 }}>Passo dopo<ChevronRight size={15} /></button>
        </span>
      </div>
    </>
  );
}

function MessageCard({ m, highlight }) {
  const step = STEPS.find((s) => s.key === m.step);
  const full = m.parts ? m.parts.map((p) => p.text).join("\n\n") : m.text;
  return (
    <article id={`msg-${m.id}`} style={{ ...card, padding: "18px 20px", borderColor: highlight ? CP.accent : CP.border, boxShadow: highlight ? `0 0 0 3px ${CP.sel}` : "none", scrollMarginTop: 90 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: CP.textPrimary }}>{m.n}. {m.title}</div>
          <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 3 }}>{m.from} · {m.where}{step ? ` · passo ${step.n}, ${step.title.toLowerCase()}` : ""}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, padding: "3px 8px", borderRadius: 6, background: CP.surfaceAlt, color: CP.textSecondary }}>{m.lang}</span>
      </div>
      {m.parts ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {m.parts.map((p) => (
            <div key={p.from}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: CP.textPrimary }}>{p.from}</span>
                <span style={{ marginLeft: "auto" }}><CopyButton text={p.text} label={`Copia di ${p.from}`} /></span>
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 14.5, lineHeight: 1.55, color: CP.textPrimary }}>{p.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <>
          <p style={{ margin: "0 0 12px", whiteSpace: "pre-wrap", fontSize: 14.5, lineHeight: 1.55, color: CP.textPrimary }}>{m.text}</p>
          <CopyButton text={full} />
        </>
      )}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${CP.borderSoft}` }}>
        <div style={{ fontSize: 12.5, color: CP.textMuted, marginBottom: 4 }}>Traduzione</div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: CP.textSecondary, fontStyle: "italic" }}>{m.it}</p>
      </div>
      {m.note && <p style={{ margin: "10px 0 0", fontSize: 13, color: CP.textSecondary }}><b style={{ fontWeight: 500, color: CP.textPrimary }}>Nota:</b> {m.note}</p>}
    </article>
  );
}

function MessaggiView({ focus }) {
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`msg-${focus}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);
  return (
    <>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: CP.textSecondary }}>Cambia &lt;nome&gt;, &lt;paese&gt; e &lt;ora&gt; prima di mandare. La traduzione sotto ogni messaggio non si copia.</p>
      <div className="sm-msgs">{MESSAGES.map((m) => <MessageCard key={m.id} m={m} highlight={focus === m.id} />)}</div>
    </>
  );
}

// ── pagina ───────────────────────────────────────────────────────────────────
export default function SalaryModellePage() {
  const { data, error, mutate, isLoading } = useSWR("/api/admin/salary-modelle", fetcher, { revalidateOnFocus: false });
  const [view, setView] = useState("dove");
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState(null);
  const [busy, setBusy] = useState(false);

  // la scheda aperta sta nell'indirizzo (#manuale, #messaggi): il link si può mandare
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (VIEWS.includes(h)) setView(h);
  }, []);
  const go = (v) => { setView(v); if (v !== "messaggi") setFocus(null); window.history.replaceState(null, "", v === "dove" ? window.location.pathname : `#${v}`); };
  const openMsg = (id) => { go("messaggi"); setFocus(id); };
  const openStep = (i) => { stepSet.current = true; setStep(i); go("manuale"); };

  // il manuale si apre sul passo della modella più avanti (dove c'è lavoro adesso)
  const firstLive = useMemo(() => data?.models?.find((m) => m.step >= 0), [data]);
  const stepSet = useRef(false);
  useEffect(() => { if (firstLive && !stepSet.current) { stepSet.current = true; setStep(firstLive.step); } }, [firstLive]);

  async function refresh() {
    setBusy(true);
    try { await mutate(await fetcher("/api/admin/salary-modelle?force=1"), { revalidate: false }); } catch (e) { /* l'errore lo mostra la prossima lettura */ } finally { setBusy(false); }
  }

  const models = data?.models || [];
  const active = data?.counts?.active ?? 0;

  return (
    <div className="sm-page">
      <style>{CSS}</style>
      <PageHead
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Marketing" }]}
        title="Modelle salary"
        line2="dalla prima chat alla prima paga"
        subtitle="Dove si trova ogni modella, cosa si fa a ogni passo e i messaggi pronti. Le modelle arrivano da sole dalla lista ClickUp «Candidate»: per spostarne una si cambia lo stato della sua card."
        actions={view === "dove" ? (
          <button type="button" className="sm-btn" onClick={refresh} disabled={busy} style={{ ...BTN, opacity: busy ? 0.6 : 1 }}>
            <RefreshCw size={15} />{busy ? "Leggo ClickUp…" : "Aggiorna"}
          </button>
        ) : null}
      />

      <Tabs
        items={[["dove", "Dove sono", data ? active : ""], ["manuale", "Manuale", "7 passi"], ["messaggi", "Messaggi", MESSAGES.length]]}
        value={view} onChange={go}
        aside={view === "dove" && data?.at ? <span style={{ fontSize: 12.5, color: CP.textMuted }}>Da ClickUp · {fmtDay(data.at)} {fmtTime(data.at)}</span> : null}
        style={{ marginBottom: 24 }}
      />

      {data?.demo && <Notice>Dati di prova: in locale manca la chiave ClickUp, quindi queste tre modelle sono finte. In produzione la lista è quella vera.</Notice>}
      {error && view !== "messaggi" && <Notice danger>{error.message}</Notice>}

      {view === "dove" && (isLoading ? <p style={{ color: CP.textMuted }}>Leggo la lista Candidate…</p> : data ? <DoveView data={data} onMsg={openMsg} onStep={openStep} /> : null)}
      {view === "manuale" && <ManualeView step={step} setStep={setStep} models={models} onMsg={openMsg} />}
      {view === "messaggi" && <MessaggiView focus={focus} />}
    </div>
  );
}
