"use client";

/**
 * /admin/hr/[id]/contratto — prepara e invia il contratto (SEED, 10/10/2026).
 *
 * Un percorso dall'alto in basso: 1) modello e condizioni, 2) documento d'identità (letto
 * dall'allegato e confrontato con la scheda), 3) anteprima del PDF esatto, 4) invio in firma.
 * Si arriva qui dalla scheda persona, dal controllo contratti e dal link nel task ClickUp.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ScanLine, Send, RefreshCw, Save, ExternalLink } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Notice, card } from "@/components/ds";
import { lbl, input, btnPrimary, btnGhost, fetcher, postJson, fmtDate, fmtDateTime } from "@/components/hr-ui";

const Step = ({ n, title, done, children, aside }) => (
  <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 600, background: done ? CP.accentGreen : CP.accentSoft, color: done ? "#0b0f17" : CP.accentSoftText }}>{done ? "✓" : n}</span>
      <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 500, color: CP.textPrimary, flex: 1 }}>{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);

export default function ContractFunnelPage() {
  const { id } = useParams();
  const { data, error, mutate } = useSWR(id ? `/api/admin/hr/people/${id}/contract` : null, fetcher, { revalidateOnFocus: false });
  const [tplId, setTplId] = useState("");
  const [terms, setTerms] = useState(null);
  const [doc, setDoc] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [preview, setPreview] = useState(0);
  const [confirmMismatch, setConfirmMismatch] = useState(false);
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    if (!data) return;
    setTplId(data.templateId);
    setTerms(data.terms);
    setDoc(data.idDoc || { type: "", number: "", issuer: "", expiry: "" });
  }, [data]);

  const tpl = data?.templates?.find((t) => t.id === tplId);
  const has = (ph) => Boolean(tpl?.fields?.includes(ph));
  const setT = (k, v) => setTerms((t) => ({ ...t, [k]: v }));
  const run = async (key, fn, okText) => {
    setBusy(key); setNotice(null);
    try { const j = await fn(); if (j?.templateId) await mutate(j, { revalidate: false }); else await mutate(); if (okText) setNotice({ ok: true, text: typeof okText === "function" ? okText(j) : okText }); setPreview((p) => p + 1); return j; }
    catch (e) { setNotice({ ok: false, text: e.message }); return null; }
    finally { setBusy(null); }
  };
  const save = () => run("save", () => postJson(`/api/admin/hr/people/${id}/contract`, { action: "save", templateId: tplId, terms }), "Condizioni salvate.");
  const readId = () => run("read", () => postJson(`/api/admin/hr/people/${id}/contract`, { action: "read-id" }), (j) => `Documento letto (${(j?.readFiles || []).map((f) => f.title).join(", ")}). Controlla i dati qui sotto.`);
  const saveId = () => run("saveid", () => postJson(`/api/admin/hr/people/${id}/contract`, { action: "save-id", idDoc: doc }), "Dati del documento salvati.");
  const send = async () => {
    if (!confirm(`Invio il contratto in firma a ${terms?.email}${testMode ? " come PROVA (non vincolante)" : ""}?`)) return;
    await run("send", () => postJson(`/api/admin/hr/people/${id}/contract`, { action: "send", confirmMismatch, testMode }), (j) => j.testMode
      ? `Inviato come PROVA${j.forcedTest ? " (il piano Dropbox Sign non ha invii API reali disponibili)" : ""}: arriva con la filigrana e non vale come contratto.`
      : "Contratto inviato in firma. Stato del contratto: «Firma richiesta». Quando firma, il CRM se ne accorge da solo.");
  };

  if (error) return <Wrap id={id}><Notice danger={error.status !== 403}>{error.status === 403 ? "Pagina riservata agli admin." : error.message}</Notice></Wrap>;
  if (!data || !terms || !doc) return <Wrap id={id}><div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div></Wrap>;

  const dirty = tplId !== data.templateId || JSON.stringify(terms) !== JSON.stringify(data.terms);
  const mismatch = data.checks.some((c) => c.ok === false);
  const docDone = Boolean(data.idDoc?.number) && !data.missing.some((m) => m.key.startsWith("id"));
  const canSend = !dirty && data.missing.length === 0 && (!mismatch || confirmMismatch) && !data.person.archived;

  return (
    <Wrap id={id} name={data.person.name}>
      {notice && <Notice danger={!notice.ok}>{notice.text}</Notice>}
      {data.sent && (
        <Notice>
          Contratto già inviato il {fmtDateTime(data.sent.at)}{data.sent.testMode ? " come PROVA (non vincolante)" : ""}. Puoi prepararne e inviarne un altro: il precedente resta su Dropbox Sign.
        </Notice>
      )}

      <Step n={1} title="Modello e condizioni" done={!dirty && !data.missing.some((m) => !m.key.startsWith("id"))} aside={dirty ? <span style={{ fontSize: 12.5, color: CP.attn }}>modifiche non salvate</span> : null}>
        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={lbl}>Modello</span>
          <select style={input} value={tplId} onChange={(e) => setTplId(e.target.value)}>
            {data.templates.map((t) => <option key={t.id} value={t.id}>{t.label}{t.id === data.suggestion.templateId ? " · suggerito" : ""}</option>)}
          </select>
          <span style={{ fontSize: 12, color: CP.textMuted }}>
            Suggerito dalla mansione nella scheda ({data.person.mansioni.join(", ") || "non indicata"}) e dalla residenza. {data.suggestion.note || ""} Testo identico al contratto firmato il {tpl?.source}: si cambiano solo i dati qui sotto.
          </span>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: 10 }}>
          <Field label="Email a cui arriva il contratto"><input style={input} type="email" value={terms.email} onChange={(e) => setT("email", e.target.value)} /></Field>
          <Field label="Genere (nato/nata, il Sig./la Sig.ra)">
            <select style={input} value={terms.gender} onChange={(e) => setT("gender", e.target.value)}><option value="">—</option><option value="Female">Femminile</option><option value="Male">Maschile</option></select>
          </Field>
          {has("mansione") && <Field label="Mansione (come si scrive nel contratto)"><input style={input} value={terms.mansione} onChange={(e) => setT("mansione", e.target.value)} placeholder="Sales Manager" /></Field>}
          {has("importo") && (
            <Field label="Compenso mensile">
              <span style={{ display: "flex", gap: 6 }}>
                <select style={{ ...input, width: 90 }} value={terms.valuta} onChange={(e) => setT("valuta", e.target.value)}>{["EUR", "USD", "CHF", "GBP"].map((v) => <option key={v}>{v}</option>)}</select>
                <input style={input} inputMode="decimal" value={terms.importo} onChange={(e) => setT("importo", e.target.value)} placeholder="2000" />
              </span>
            </Field>
          )}
          {has("dispositivi") && <Field label="Dispositivi in comodato d'uso"><input style={input} value={terms.dispositivi} onChange={(e) => setT("dispositivi", e.target.value)} placeholder="iPhone 12" /></Field>}
        </div>
        {has("descrizione") && <Field label="Cosa farà (art. 1.3, anche nel patto di non concorrenza)" style={{ marginTop: 10 }}><textarea style={{ ...input, minHeight: 70, resize: "vertical" }} value={terms.descrizione} onChange={(e) => setT("descrizione", e.target.value)} /></Field>}
        {has("compenso_en") && <Field label="Compensation (art. 4.1, in English)" style={{ marginTop: 10 }}><textarea style={{ ...input, minHeight: 60 }} value={terms.compensoEn} onChange={(e) => setT("compensoEn", e.target.value)} placeholder="3$/h plus a percentage of the total gross sales relating to the Author's texts, to be agreed with the Account Manager." /></Field>}
        {has("importo") && (
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 10, fontSize: 14, color: CP.textPrimary }}>
            {tpl?.lang === "it" && <label><input type="checkbox" checked={terms.minimoGarantito !== false} onChange={(e) => setT("minimoGarantito", e.target.checked)} /> «minimo garantito»</label>}
            <label><input type="checkbox" checked={terms.incentivi !== false} onChange={(e) => setT("incentivi", e.target.checked)} /> clausola sugli incentivi</label>
          </div>
        )}
        <div style={{ marginTop: 12 }}><button type="button" onClick={save} disabled={busy === "save" || !dirty} style={{ ...btnPrimary, opacity: busy === "save" || !dirty ? 0.5 : 1 }}><Save size={14} /> {busy === "save" ? "Salvo…" : "Salva"}</button></div>
      </Step>

      <Step n={2} title="Documento d'identità" done={docDone && !mismatch}>
        <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
          Si legge dal documento che la persona ha caricato col modulo (allegato al suo task ClickUp) e si confronta con la scheda. Ogni lettura costa circa 3 centesimi e manda le immagini al fornitore dell'AI; i dati letti si salvano cifrati per 120 giorni.
        </p>
        <button type="button" onClick={readId} disabled={busy === "read" || !data.person.clickupTaskId} style={{ ...btnGhost, opacity: busy === "read" ? 0.5 : 1 }}><ScanLine size={14} /> {busy === "read" ? "Leggo il documento…" : data.idDoc?.via === "letto dal documento" ? "Rileggi dal documento" : "Leggi dal documento"}</button>
        {data.idDoc?.at && <span style={{ fontSize: 12.5, color: CP.textMuted, marginLeft: 10 }}>{data.idDoc.via} il {fmtDateTime(data.idDoc.at)}{data.idDoc.files?.length ? ` · ${data.idDoc.files.join(", ")}` : ""}</span>}
        {data.idDoc?.notes && <div style={{ fontSize: 13, color: CP.attn, marginTop: 6 }}>Nota della lettura: {data.idDoc.notes}</div>}
        {data.checks.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 4 }}>
            {data.checks.map((c) => (
              <li key={c.key} style={{ fontSize: 13.5, color: CP.textPrimary }}>
                <span style={{ color: c.ok === true ? CP.accentGreen : c.ok === false ? CP.accentRed : CP.textMuted, fontWeight: 600, marginRight: 6 }}>{c.ok === true ? "✓" : c.ok === false ? "✗" : "–"}</span>
                {c.label}: <span style={{ color: CP.textSecondary }}>{c.detail}</span>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 10, marginTop: 12 }}>
          <Field label="Tipo"><input style={input} value={doc.type} onChange={(e) => setDoc({ ...doc, type: e.target.value })} placeholder="carta di identità" /></Field>
          <Field label="Numero"><input style={input} value={doc.number} onChange={(e) => setDoc({ ...doc, number: e.target.value })} /></Field>
          <Field label="Rilasciato da"><input style={input} value={doc.issuer} onChange={(e) => setDoc({ ...doc, issuer: e.target.value })} placeholder="comune di Modena" /></Field>
          <Field label="Scadenza"><input style={input} type="date" value={doc.expiry || ""} onChange={(e) => setDoc({ ...doc, expiry: e.target.value })} /></Field>
        </div>
        <div style={{ marginTop: 10 }}><button type="button" onClick={saveId} disabled={busy === "saveid"} style={btnGhost}><Save size={14} /> Salva i dati del documento</button></div>
      </Step>

      <Step n={3} title="Anteprima" done={data.missing.length === 0} aside={<a href={`/api/admin/hr/people/${id}/contract/pdf?v=${preview}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: CP.accentSoftText, textDecoration: "none" }}>Apri in una scheda <ExternalLink size={12} style={{ verticalAlign: "-1px" }} /></a>}>
        {data.missing.length > 0
          ? <Notice danger>Mancano: {data.missing.map((m) => m.label).join(", ")}. Nell'anteprima compaiono tra parentesi quadre.</Notice>
          : <p style={{ fontSize: 13, color: CP.accentGreen, margin: "0 0 8px" }}>Tutti i dati ci sono. Questo è il PDF esatto che partirà.</p>}
        {dirty && <p style={{ fontSize: 13, color: CP.attn, margin: "0 0 8px" }}>Salva le condizioni per vederle nell'anteprima.</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}><button type="button" onClick={() => setPreview((p) => p + 1)} style={{ ...btnGhost, padding: "5px 10px", fontSize: 12 }}><RefreshCw size={12} /> Aggiorna</button></div>
        <iframe key={preview} title="Anteprima del contratto" src={`/api/admin/hr/people/${id}/contract/pdf?v=${preview}`} style={{ width: "100%", height: "min(78vh, 900px)", border: `1px solid ${CP.border}`, borderRadius: 8, background: "#fff" }} />
      </Step>

      <Step n={4} title="Invia in firma" done={Boolean(data.sent && !data.sent.testMode)}>
        <p style={{ fontSize: 13.5, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.55 }}>
          Parte da Dropbox Sign a <b style={{ color: CP.textPrimary }}>{terms.email || "—"}</b> e a <b style={{ color: CP.textPrimary }}>contact@houseofcreators.com</b> per la firma di House of Creators. Lo stato del contratto diventa «Firma richiesta»; quando firma, il PDF firmato finisce sul suo task ClickUp da solo.
        </p>
        {mismatch && (
          <label style={{ display: "block", fontSize: 13.5, color: CP.accentRed, marginBottom: 8 }}>
            <input type="checkbox" checked={confirmMismatch} onChange={(e) => setConfirmMismatch(e.target.checked)} /> Il documento non coincide con la scheda (vedi sopra): ho controllato e invio comunque.
          </label>
        )}
        <label style={{ display: "block", fontSize: 13.5, color: CP.textPrimary, marginBottom: 12 }}>
          <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} /> Invio di prova (gratuito, con filigrana, non vale come contratto)
        </label>
        <button type="button" onClick={send} disabled={!canSend || busy === "send"} style={{ ...btnPrimary, opacity: !canSend || busy === "send" ? 0.5 : 1 }}><Send size={14} /> {busy === "send" ? "Invio…" : "Invia in firma"}</button>
        {!canSend && <div style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 6 }}>{dirty ? "Prima salva le condizioni." : data.missing.length ? "Completa i dati mancanti." : mismatch && !confirmMismatch ? "Conferma il controllo del documento." : ""}</div>}
      </Step>
    </Wrap>
  );
}

function Field({ label, children, style }) {
  return <label style={{ display: "block", ...style }}><span style={lbl}>{label}</span>{children}</label>;
}

function Wrap({ id, name, children }) {
  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 980, margin: "0 auto", fontFamily: FONTS.body }}>
      <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 10 }}>
        <Link href="/admin/hr" style={{ color: CP.textSecondary, textDecoration: "none" }}>Persone</Link> · <Link href={`/admin/hr/${id}`} style={{ color: CP.textSecondary, textDecoration: "none" }}>{name || "Scheda"}</Link> · <Link href="/admin/hr/contratti" style={{ color: CP.textSecondary, textDecoration: "none" }}>Contratti</Link>
      </div>
      <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 600, color: CP.textPrimary }}>Contratto{name ? ` · ${name}` : ""}</h1>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: CP.textSecondary }}>Prepara, controlla e invia in firma. Il testo è quello dei contratti già firmati: cambiano solo i dati.</p>
      {children}
    </div>
  );
}
