"use client";

/**
 * /hr/modulo/[token] — modulo "i tuoi dati" per la persona (Centro HR, 29/09/2026).
 *
 * Pagina ESTERNA, senza chrome interno (AppShell.isBareRoute): chi la apre può
 * non avere un account. Tutto passa da /api/hr/modulo/[token] (il token è
 * l'auth). Due passi: 1) dati + consenso privacy obbligatorio, 2) documento
 * d'identità e CV (facoltativi, finiscono come allegati su ClickUp).
 * Il codice fiscale già inserito non viene mai rimandato al browser.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CP, FONTS } from "@/lib/brand";
import { FIELD_BY_KEY, FORM_KEYS, validateCodiceFiscale } from "@/lib/hr-fields";
import { lbl, btnPrimary, btnGhost, FieldInput, fmtDate } from "@/components/hr-ui";
import { cfCoherence } from "@/lib/hr-comuni";

const GROUPS = [
  { title: "Chi sei", keys: ["firstName", "surname", "dateOfBirth", "gender", "nationality", "birthPlace", "codiceFiscale"] },
  { title: "Dove vivi", keys: ["residenceComune", "location", "residenceCap"] },
  { title: "Come contattarti", keys: ["personalEmail", "personalPhone", "linkedin"] },
  { title: "Il tuo lavoro", keys: ["currentJob", "partitaIva", "spokenLanguages", "timeSlots"] },
  { title: "Le tue competenze", keys: ["skillLevels", "learnWish", "personalInterests"] },
];
const LABELS = {
  firstName: "Nome", surname: "Cognome", location: "Città in cui vivi", currentJob: "Che cosa fai oggi (mansione)", nationality: "Nazionalità", spokenLanguages: "Lingue che parli",
  partitaIva: "Hai una partita IVA?", timeSlots: "Fasce orarie in cui sei disponibile", personalInterests: "Interessi (facoltativo)",
  linkedin: "Profilo LinkedIn (facoltativo)", birthPlace: "Dove sei nato/a", 
  location: "Indirizzo (via e numero civico)", residenceCap: "CAP / codice postale", residenceComune: "Dove vivi", skillLevels: "Cosa sai fare, e a che livello",
  learnWish: "Cosa ti piacerebbe imparare (facoltativo)", gender: "Genere",
};

const page = { minHeight: "100vh", background: CP.bg, color: CP.textPrimary, fontFamily: FONTS.body, padding: "32px 16px 64px" };
const col = { maxWidth: 640, margin: "0 auto" };
const box = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, padding: "16px 18px", marginBottom: 14 };

function Shell({ children }) {
  return (
    <main style={page}>
      <div style={col}>
        <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 6 }}>House of Creators</div>
        {children}
      </div>
    </main>
  );
}

export default function HrFormPage() {
  const { token } = useParams();
  const [ctx, setCtx] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [data, setData] = useState({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [step, setStep] = useState("form"); // form → files → done
  const [cfNote, setCfNote] = useState(null);
  const [cfWarn, setCfWarn] = useState(null); // avvisi di coerenza CF ↔ data/genere/luogo (non bloccanti)

  useEffect(() => {
    let alive = true;
    fetch(`/api/hr/modulo/${token}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!alive) return;
      if (!r.ok || !j.ok) { setLoadErr(j.error || "Link non valido."); return; }
      setCtx(j);
      if (j.done) setStep("done");
      setData({ ...j.prefill });
    }).catch(() => alive && setLoadErr("Connessione non riuscita. Riprova tra poco."));
    return () => { alive = false; };
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!String(data.firstName || "").trim()) { setErr("Scrivi il tuo nome."); return; }
    if (data.codiceFiscale) {
      const r = validateCodiceFiscale(data.codiceFiscale);
      if (!r.ok) { setErr(`Codice fiscale: ${r.error}`); return; }
    }
    if (data.codiceFiscale && !cfWarn) {
      const w = cfCoherence(data.codiceFiscale, { dob: data.dateOfBirth, gender: data.gender, birth: data.birthPlace });
      if (w.length) { setCfWarn(w); return; }
    }
    if (!consent) { setErr("Per inviare serve il consenso all'informativa privacy."); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/hr/modulo/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, consent: true }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `Invio non riuscito (${r.status}).`);
      setCfNote(j.cfNote || null);
      setStep(j.uploadsEnabled ? "files" : "done");
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  if (loadErr) return <Shell><h1 style={{ fontSize: 24, fontWeight: 500, margin: "0 0 8px" }}>Link non disponibile</h1><p style={{ color: CP.textSecondary, fontSize: 15 }}>{loadErr}</p></Shell>;
  if (!ctx) return <Shell><p style={{ color: CP.textMuted }}>Caricamento…</p></Shell>;

  if (step === "done") {
    return (
      <Shell>
        <h1 style={{ fontSize: 24, fontWeight: 500, margin: "0 0 8px" }}>Grazie, abbiamo i tuoi dati</h1>
        <p style={{ color: CP.textSecondary, fontSize: 15, lineHeight: 1.55 }}>Puoi chiudere questa pagina. Se devi correggere qualcosa, chiedi a chi ti ha mandato il link di mandartene uno nuovo.</p>
        {cfNote && <p style={{ color: CP.textSecondary, fontSize: 14 }}>Il codice fiscale non è stato registrato per un problema tecnico nostro: te lo richiederemo.</p>}
      </Shell>
    );
  }

  if (step === "files") return <Shell><FilesStep token={token} max={ctx.maxUploadBytes} onDone={() => setStep("done")} /></Shell>;

  return (
    <Shell>
      <h1 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 6px", letterSpacing: "-0.01em" }}>I tuoi dati</h1>
      <p style={{ color: CP.textSecondary, fontSize: 15, lineHeight: 1.55, margin: "0 0 18px" }}>
        Controlla e completa le informazioni che ci servono per lavorare insieme. Ci vogliono pochi minuti. Il link vale fino al {fmtDate(ctx.expiresAt)} e si usa una volta sola. Non ti chiediamo l'IBAN.
      </p>
      <form onSubmit={submit} noValidate>
        {GROUPS.map((g) => (
          <section key={g.title} style={box}>
            <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 12px" }}>{g.title}</h2>
            <div style={{ display: "grid", gap: 12 }}>
              {g.keys.filter((k) => FORM_KEYS.includes(k)).map((k) => {
                const f = FIELD_BY_KEY[k];
                const cfOff = k === "codiceFiscale" && !ctx.cfEnabled;
                return (
                  <div key={k}>
                    <label id={`f-${k}-l`} htmlFor={`f-${k}`} style={lbl}>{LABELS[k] || f.label}{k === "firstName" ? " *" : ""}</label>
                    {cfOff ? (
                      <span style={{ fontSize: 13, color: CP.textMuted }}>Al momento non possiamo raccogliere il codice fiscale da qui: te lo chiederemo a parte.</span>
                    ) : (
                      <FieldInput id={`f-${k}`} field={f} value={data[k]} options={ctx.options?.[k]} onChange={(v) => { setData({ ...data, [k]: v }); if (["codiceFiscale", "dateOfBirth", "gender", "birthPlace"].includes(k)) setCfWarn(null); }} />
                    )}
                    {k === "codiceFiscale" && ctx.cfPresent && !cfOff && <span style={{ fontSize: 12, color: CP.textMuted }}>Lo abbiamo già: lascia vuoto per non cambiarlo.</span>}
                    {k === "codiceFiscale" && !cfOff && <span style={{ display: "block", fontSize: 12, color: CP.textMuted }}>Lo conserviamo cifrato.</span>}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <section style={box}>
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 8px" }}>Privacy</h2>
          <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.55, padding: "10px 12px", background: CP.surfaceAlt, borderRadius: 8, marginBottom: 12 }}>
            Informativa privacy (in revisione legale). Il testo definitivo sarà pubblicato qui prima dell'uso con le persone.
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: CP.textPrimary, cursor: "pointer" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3, accentColor: CP.accent }} required />
            <span>Ho letto l'informativa privacy e acconsento al trattamento dei miei dati per la gestione del rapporto di collaborazione.</span>
          </label>
        </section>

        {cfWarn && (
          <div role="alert" style={{ ...box, borderColor: CP.accent }}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Controlla il codice fiscale</div>
            <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>{cfWarn.map((w) => <li key={w}>{w[0].toUpperCase() + w.slice(1)}.</li>)}</ul>
            <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 10 }}>A volte dipende da un comune che nel frattempo è stato unito a un altro. Se i dati sono giusti, puoi inviare lo stesso.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setCfWarn(null)} style={btnGhost}>Correggo</button>
              <button type="submit" style={btnPrimary}>Sono giusti, invia</button>
            </div>
          </div>
        )}
        {err && <div role="alert" style={{ color: CP.accentRed, fontSize: 14, margin: "0 0 12px" }}>{err}</div>}
        <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}>{busy ? "Invio…" : "Invia i miei dati"}</button>
      </form>
    </Shell>
  );
}

function FilesStep({ token, max, onDone }) {
  const [state, setState] = useState({ document: null, cv: null }); // null | "busy" | "ok" | "errore…"
  const up = async (kind, file) => {
    if (!file) return;
    if (file.size > max) { setState((s) => ({ ...s, [kind]: "File troppo grande: massimo 10 MB." })); return; }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) { setState((s) => ({ ...s, [kind]: "Formato non ammesso: solo PDF, JPG o PNG." })); return; }
    setState((s) => ({ ...s, [kind]: "busy" }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/hr/modulo/${token}/file?kind=${kind}`, { method: "POST", body: fd });
      const j = await r.json().catch(() => null);
      if (r.status === 413) throw new Error("Il file è troppo pesante per il caricamento: prova con un PDF compresso o una foto più leggera (meglio sotto i 4 MB).");
      if (!r.ok || !j?.ok) throw new Error(j?.error || `Caricamento non riuscito (${r.status}).`);
      setState((s) => ({ ...s, [kind]: "ok" }));
    } catch (e) { setState((s) => ({ ...s, [kind]: e.message })); }
  };
  const Item = ({ kind, title, hint }) => {
    const st = state[kind];
    return (
      <div style={{ padding: "12px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
        <div style={{ fontSize: 15, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: CP.textMuted, marginBottom: 8 }}>{hint}</div>
        {st === "ok" ? <span style={{ fontSize: 14, color: CP.accentGreen }}>Caricato</span> : (
          <>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={st === "busy"} onChange={(e) => up(kind, e.target.files?.[0])} style={{ fontSize: 14, color: CP.textSecondary }} aria-label={title} />
            {st === "busy" && <span style={{ fontSize: 13, color: CP.textMuted, marginLeft: 8 }}>Carico…</span>}
            {st && st !== "busy" && <div role="alert" style={{ fontSize: 13, color: CP.accentRed, marginTop: 6 }}>{st}</div>}
          </>
        )}
      </div>
    );
  };
  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 500, margin: "0 0 6px" }}>Dati inviati. Ultimo passo: i documenti</h1>
      <p style={{ color: CP.textSecondary, fontSize: 15, lineHeight: 1.55, margin: "0 0 14px" }}>Facoltativo ma utile. PDF, JPG o PNG, massimo 10 MB ciascuno. Hai un'ora di tempo.</p>
      <section style={box}>
        <Item kind="document" title="Documento d'identità" hint="Fronte e retro nello stesso file, se puoi." />
        <Item kind="cv" title="Curriculum (CV)" hint="L'ultima versione che hai." />
      </section>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onDone} style={btnPrimary}>Ho finito</button>
        {!state.document && !state.cv && <button type="button" onClick={onDone} style={btnGhost}>Salta per ora</button>}
      </div>
    </>
  );
}
