"use client";
// Radar creator — "Segnala una creator" (rifatta il 21/10/2026 sul feedback di Nicholas: «non si
// capisce se la creator c'era già… è venuta fuori da me o da te? devi verificare subito»).
// Tre momenti nella stessa finestra: il link (si incolla con un tocco), poi la segnalazione che si
// segue dal vivo — chi l'aveva trovata per primo lo dice SUBITO, poi numeri e prima storia in
// evidenza riletti adesso — e il risultato con «Apri la scheda». Il Comando rapido dell'iPhone sta
// a parte. Anche la riga delle «Ultime segnalazioni» (SignalRow) vive qui: stesse parole ovunque.
import { useEffect, useMemo, useState } from "react";
import { CP, alpha } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { useIsPhone } from "@/lib/use-phone";
import { parseInstagramLink, signalOrigin } from "@/lib/scouting-core";
import { btn, btnPrimary, btnQuiet, input, SERIF, NUM, fmtFull, fmtN, fmtDate, Initials } from "./radar-ui";

const WHY_CHIPS = ["Personaggio fisso", "Reel virale", "Format che si ripete", "Estetica", "Famosa"];

export default function RadarSegnala({ open, onClose, me, onSent, inbox = [], creators = [], onOpen }) {
  const [view, setView] = useState("link"); // link | segue | iphone
  const [text, setText] = useState("");
  const [chips, setChips] = useState([]);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sent, setSent] = useState(null); // l'elemento appena messo in coda (con `pre`)
  const phone = useIsPhone();

  useEffect(() => { if (open) { setView("link"); setErr(null); } }, [open]);

  const parsed = useMemo(() => parseInstagramLink(text), [text]);
  const live = (sent && inbox.find((x) => x.id === sent.id)) || sent;

  async function paste() {
    setErr(null);
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText(t.trim());
      else setErr("Negli appunti non c'è niente: copia il link da Instagram.");
    } catch { setErr("Il telefono non ha dato gli appunti: tieni premuto nel campo e scegli Incolla."); }
  }

  async function send(e) {
    e?.preventDefault();
    if (!parsed) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/admin/scouting/segnala", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, why: [...chips, why.trim()].filter(Boolean).join(", "), by: me }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Errore");
      setSent(d.item);
      setText(""); setWhy(""); setChips([]);
      setView("segue");
      onSent?.();
    } catch (er) { setErr(er.message); } finally { setBusy(false); }
  }

  const title = view === "iphone" ? "Dall'iPhone, con un tocco" : view === "segue" ? "Segnalazione" : "Segnala una creator";
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={520}>
      {view === "link" && (
        <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <p style={{ margin: 0, ...SERIF, fontStyle: "italic", fontSize: 21, lineHeight: 1.3, color: CP.textSecondary }}>Copia il link da Instagram, il resto lo fa il radar.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {!parsed && (
              <button type="button" onClick={paste} style={{ ...btnPrimary, justifyContent: "center", minHeight: 56, fontSize: 16, borderRadius: 16 }}>Incolla il link</button>
            )}
            <label htmlFor="rs-link" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Link del profilo o del reel</label>
            <input id="rs-link" value={text} onChange={(e) => setText(e.target.value)} placeholder={parsed ? "" : "oppure scrivilo: instagram.com/… o @nome"} style={{ ...input, minHeight: 48, fontSize: 15, borderRadius: 14 }} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoFocus={!phone} />
            {text.trim() && (parsed
              ? <LinkPreview parsed={parsed} creators={creators} />
              : <span style={{ fontSize: 13.5, color: CP.attn }}>Non è un link di Instagram.</span>)}
          </div>

          {parsed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 13.5, color: CP.textSecondary }}>Cosa ti ha colpito? <span style={{ color: CP.textMuted }}>facoltativo</span></span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {WHY_CHIPS.map((c) => {
                  const on = chips.includes(c);
                  return (
                    <button key={c} type="button" aria-pressed={on} onClick={() => setChips((x) => (on ? x.filter((y) => y !== c) : [...x, c]))}
                      style={{ ...btn, minHeight: 36, padding: "6px 14px", fontSize: 13.5, background: on ? alpha(CP.gold, "18") : "transparent", borderColor: on ? alpha(CP.gold, "88") : CP.border, color: on ? CP.textPrimary : CP.textSecondary }}>{c}</button>
                  );
                })}
              </div>
              <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="o scrivilo tu" aria-label="Perché ti ha colpito" style={{ ...input, borderRadius: 12 }} maxLength={160} />
            </div>
          )}

          {parsed && <button type="submit" style={{ ...btnPrimary, justifyContent: "center", minHeight: 52, fontSize: 16, borderRadius: 16 }} disabled={busy}>{busy ? "Invio…" : "Segnala"}</button>}
          {err && <p role="alert" style={{ margin: 0, fontSize: 14, color: CP.attn }}>{err}</p>}
          <p style={{ margin: 0, fontSize: 13, color: CP.textMuted }}>Ti dice subito se il radar la conosceva già e chi l&apos;ha trovata per primo. Poi rilegge numeri e prima storia in evidenza (circa 3 centesimi).</p>

          <button type="button" onClick={() => setView("iphone")} style={{ ...btnQuiet, justifyContent: "space-between", borderTop: `1px solid ${CP.borderSoft || CP.border}`, borderRadius: 0, padding: "16px 0 4px", color: CP.textPrimary, fontSize: 14.5 }}>
            <span>Dall&apos;iPhone: Condividi → Radar HOC</span><span aria-hidden="true" style={{ color: CP.textMuted }}>›</span>
          </button>
        </form>
      )}

      {view === "segue" && live && (
        <SignalLive item={live} me={me} creators={creators}
          onOpen={(c) => { onClose?.(); onOpen?.(c); }}
          onAnother={() => { setSent(null); setView("link"); }} />
      )}

      {view === "iphone" && <ShortcutSetup me={me} onBack={() => setView("link")} />}
    </Modal>
  );
}

/** Sotto il campo: chi è (se il radar la conosce) o che tipo di link è. Solo dati già in pagina. */
function LinkPreview({ parsed, creators }) {
  const h = parsed.handle;
  const c = h ? creators.find((x) => x.handles.includes(h)) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14, background: CP.surface, border: `1px solid ${CP.border}` }}>
      <Initials name={c?.name || h || "reel"} pic={c?.pic} size={40} />
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis" }}>{h ? `@${h}` : "Un reel"}</span>
        <span style={{ fontSize: 13, color: c ? CP.gold : CP.textMuted }}>{c ? "Già nel radar" : h ? "Profilo di Instagram" : "Il radar trova chi l'ha pubblicato"}</span>
      </span>
    </div>
  );
}

const STEPS_PROFILE = [["account", "Account riconosciuto"], ["profilo", "Numeri del profilo"], ["storia", "Prima storia in evidenza"]];

/** La segnalazione dal vivo: chi l'aveva trovata (subito), i passi, poi il risultato. */
function SignalLive({ item, me, creators, onOpen, onAnother }) {
  const h = item.h;
  const c = h ? creators.find((x) => x.handles.includes(h)) : null;
  const o = signalOrigin(item, { me });
  const reading = item.status === "in_lettura";
  const failed = o?.kind === "errore";
  const steps = [...(item.text && /\/(reel|reels|p|tv)\//i.test(item.text) ? [["reel", "Reel letto: chi l'ha pubblicato"]] : []), ...STEPS_PROFILE];
  const order = steps.map((s) => s[0]);
  const at = reading ? (item.step ? order.indexOf(item.step) : h ? order.indexOf("account") + 1 : 0) : order.length;
  const skipped = !reading && item.status === "gia_nel_radar" && item.checked === false;
  const accent = o?.kind === "nuova" || (o?.kind === "lettura" && !item.pre?.known && item.pre?.h) ? CP.gold : failed ? CP.attn : CP.textPrimary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }} aria-live="polite">
      <style>{"@keyframes rsspin{to{transform:rotate(360deg)}}.rs-spin{animation:rsspin .8s linear infinite}@media (prefers-reduced-motion: reduce){.rs-spin{animation:none}}"}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Initials name={c?.name || h || "?"} pic={c?.pic} size={60} gold={o?.kind === "nuova"} />
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 18, overflow: "hidden", textOverflow: "ellipsis" }}>{h ? `@${h}` : "Leggo il link…"}</span>
          {c?.name && !c.name.startsWith("@") && <span style={{ fontSize: 14, color: CP.textSecondary }}>{c.name}</span>}
        </span>
      </div>

      {o && (
        <div style={{ borderLeft: `2px solid ${accent}`, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...SERIF, fontSize: 26, lineHeight: 1.15, color: accent }}>{o.title}</span>
          {o.line && <span style={{ fontSize: 14.5, color: CP.textSecondary }}>{o.line}</span>}
        </div>
      )}

      {!failed && (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map(([id, label], i) => {
            const done = skipped ? i === 0 : i < at;
            const now = reading && i === at;
            return (
              <li key={id} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14.5, color: done ? CP.textPrimary : now ? CP.textSecondary : CP.textMuted }}>
                <StepDot state={done ? "done" : now ? "now" : "wait"} />
                <span>{label}{now ? "…" : ""}{skipped && i > 0 ? " · già ricontrollata nelle ultime ore" : ""}</span>
              </li>
            );
          })}
        </ol>
      )}

      {!reading && !failed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: `1px solid ${CP.borderSoft || CP.border}`, paddingTop: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
            <Fig v={fmtFull(item.fol ?? c?.fol)} l="follower" />
            <Fig v={fmtFull(item.medv ?? c?.medv)} l="view per reel" />
          </div>
          <FoundLine link={item.link} />
          {item.warn && <p style={{ margin: 0, fontSize: 13.5, color: CP.attn }}>{item.msg}</p>}
          {(item.match || []).map((m) => (
            <p key={m.h} style={{ margin: 0, fontSize: 14, color: CP.textSecondary }}>Forse è la stessa persona di <strong style={{ color: CP.textPrimary, fontWeight: 600 }}>@{m.h}</strong> — {m.reason}. Si collega dalla scheda.</p>
          ))}
        </div>
      )}
      {failed && item.msg && o.line !== item.msg && <p style={{ margin: 0, fontSize: 14, color: CP.attn }}>{item.msg}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {c && <button style={{ ...btnPrimary, justifyContent: "center", minHeight: 50, fontSize: 15.5, borderRadius: 16 }} onClick={() => onOpen(c)}>Apri la scheda</button>}
        <button style={{ ...btn, justifyContent: "center", minHeight: 48, borderRadius: 16 }} onClick={onAnother}>Segnalane un&apos;altra</button>
        {reading && <span style={{ fontSize: 13, color: CP.textMuted, textAlign: "center" }}>Puoi chiudere: la segnalazione continua e la ritrovi in «Ultime segnalazioni».</span>}
      </div>
    </div>
  );
}

function StepDot({ state }) {
  const s = 18;
  if (state === "done") return (
    <svg width={s} height={s} viewBox="0 0 18 18" aria-hidden="true" style={{ flex: "0 0 auto" }}><circle cx="9" cy="9" r="8.5" fill={alpha(CP.accentGreen, "22")} stroke={CP.accentGreen} /><path d="M5.2 9.3l2.4 2.4 5-5.2" fill="none" stroke={CP.accentGreen} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
  if (state === "now") return <span aria-hidden="true" className="rs-spin" style={{ width: s, height: s, flex: "0 0 auto", borderRadius: "50%", border: `2px solid ${CP.border}`, borderTopColor: CP.textPrimary }} />;
  return <span aria-hidden="true" style={{ width: s, height: s, flex: "0 0 auto", borderRadius: "50%", border: `1.5px dashed ${CP.border}` }} />;
}

function Fig({ v, l }) {
  return (
    <div>
      <div style={{ ...SERIF, fontSize: 30, lineHeight: 1.05, ...NUM }}>{v}</div>
      <div style={{ fontSize: 12.5, color: CP.textMuted }}>{l}</div>
    </div>
  );
}

/** Il link trovato, in una riga. */
function FoundLine({ link }) {
  if (!link) return <p style={{ margin: 0, fontSize: 14.5, color: CP.textSecondary }}>Nessun link né tag, in bio o nella prima storia in evidenza.</p>;
  const strong = link.strength >= 2;
  return (
    <p style={{ margin: 0, fontSize: 15, color: strong ? CP.gold : CP.textPrimary }}>
      {strong ? `${link.label} trovato` : `Da guardare: ${link.label === "Link" ? "c'è un link" : link.label}`} <span style={{ color: CP.textSecondary }}>{link.where}</span>
    </p>
  );
}

/**
 * Una riga di «Ultime segnalazioni»: foto, @nome, chi l'ha trovata per primo, cosa c'è.
 * Tutta la riga apre la scheda. Le segnalazioni di prima del 21/10 non hanno `known`:
 * l'origine si ricava dal profilo (src, firstSeen, by).
 */
export function SignalRow({ item: x, me, creators, profilesBy, onOpen }) {
  const c = x.h ? creators.find((y) => y.handles.includes(x.h)) : null;
  const o = signalOrigin(x, { me, profile: x.h ? profilesBy?.[x.h] : null });
  const tone = o.kind === "nuova" ? CP.gold : o.kind === "errore" || x.warn ? CP.attn : o.kind === "lettura" ? CP.textMuted : CP.textSecondary;
  const pill = o.kind === "nuova" ? "Nuova" : o.kind === "gia" ? "Già nel radar" : o.kind === "lettura" ? "In verifica" : "Non letta";
  const link = c?.link;
  const body = (
    <>
      <Initials name={c?.name || x.h || "?"} pic={c?.pic} size={44} gold={o.kind === "nuova"} />
      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: CP.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.h ? `@${x.h}` : x.text.slice(0, 40)}</span>
          <span style={{ flex: "0 0 auto", fontSize: 11.5, letterSpacing: ".02em", color: tone, border: `1px solid ${o.kind === "nuova" ? alpha(CP.gold, "77") : CP.border}`, borderRadius: 999, padding: "1px 8px" }}>{pill}</span>
        </span>
        <span style={{ fontSize: 13.5, color: o.kind === "errore" ? CP.attn : CP.textSecondary }}>
          {o.short}
        </span>
        {o.kind !== "errore" && o.kind !== "lettura" && (
          <span style={{ fontSize: 13, color: link?.strength >= 2 ? CP.gold : CP.textMuted }}>
            {link ? `${link.strength >= 2 ? link.label : `Da guardare: ${link.tag ? `tagga @${link.tag}` : link.label === "Link" ? "c'è un link" : link.label}`} ${linkWhereShort(link)}` : "Nessun link trovato"}
            {c?.fol ? <span style={{ color: CP.textMuted }}> · {fmtN(c.fol)} follower</span> : null}
          </span>
        )}
        <span style={{ fontSize: 12, color: CP.textMuted }}>{sameAs(x.by, me) ? "Segnalata da te" : `Segnalata da ${x.by || "—"}`} · {fmtDate(x.at)}{x.via === "iphone" ? " · iPhone" : ""}</span>
      </span>
    </>
  );
  const row = { display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 0", borderBottom: `1px solid ${CP.borderSoft || CP.border}`, width: "100%", boxSizing: "border-box", textAlign: "left" };
  return (
    <li>
      {c ? <button onClick={() => onOpen(c)} style={{ all: "unset", cursor: "pointer", ...row }}>{body}<span aria-hidden="true" style={{ color: CP.textMuted, alignSelf: "center", fontSize: 18 }}>›</span></button> : <div style={row}>{body}</div>}
    </li>
  );
}

const sameAs = (a, b) => !!a && !!b && a.trim().toLowerCase() === String(b).trim().toLowerCase();
const linkWhereShort = (l) => (l.where === "tag" ? `tramite @${l.via}` : l.where === "evidenza" ? "nella prima evidenza" : "in bio");

/** Il Comando rapido «Radar HOC»: chiave personale + installazione. */
function ShortcutSetup({ me, onBack }) {
  const [token, setToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function makeToken() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/admin/scouting/shortcut-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: me }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Errore");
      setToken(d.token);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(token); setCopied(true); } catch { setCopied(false); }
  }
  const stepN = (n) => <span aria-hidden="true" style={{ width: 28, height: 28, flex: "0 0 auto", borderRadius: "50%", border: `1px solid ${CP.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13.5, ...NUM }}>{n}</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ margin: 0, ...SERIF, fontStyle: "italic", fontSize: 21, lineHeight: 1.3, color: CP.textSecondary }}>Da un reel o un profilo su Instagram: Condividi → Radar HOC. Ti risponde se la conoscevamo già.</p>
      <div style={{ display: "flex", gap: 12 }}>
        {stepN(1)}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 15 }}>Crea la tua chiave personale</span>
          {token ? (
            <>
              <code style={{ ...input, fontSize: 13, wordBreak: "break-all", userSelect: "all" }}>{token}</code>
              <button type="button" style={{ ...btnPrimary, justifyContent: "center", borderRadius: 14 }} onClick={copy}>{copied ? "Copiata" : "Copia la chiave"}</button>
              <span style={{ fontSize: 12.5, color: CP.textMuted }}>Si vede una volta sola: se la perdi, creane una nuova.</span>
            </>
          ) : (
            <button type="button" style={{ ...btn, justifyContent: "center", borderRadius: 14 }} disabled={busy} onClick={makeToken}>{busy ? "Creo…" : "Crea la mia chiave"}</button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {stepN(2)}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
          <span style={{ fontSize: 15 }}>Aggiungi il Comando rapido sull&apos;iPhone e incolla la chiave quando la chiede</span>
          <a href="/radar-hoc.shortcut" style={{ ...btn, justifyContent: "center", borderRadius: 14 }}>Apri il Comando rapido</a>
        </div>
      </div>
      {err && <p role="alert" style={{ margin: 0, fontSize: 14, color: CP.attn }}>{err}</p>}
      <button type="button" style={{ ...btnQuiet, alignSelf: "flex-start" }} onClick={onBack}>‹ Torna a Segnala</button>
    </div>
  );
}
