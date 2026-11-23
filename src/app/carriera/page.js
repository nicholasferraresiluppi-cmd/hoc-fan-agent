"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { CP, FONTS } from "@/lib/brand";
import {
  PageHead, Tabs, Notice, EmptyState, SectionTitle, Spiega, Metric, DataTable, FilterBar, FilterChip,
  BTN, BTN_PRIMARY, card, ATTN, NUM,
} from "@/components/ds";
import { Modal } from "@/components/cp-style";
import { STATI, ESITI, FASI_REVISIONE, ECCEZIONE_MAX_GIORNI, SOGLIE } from "@/lib/carriera-core";
import {
  REGOLE_STATO, LIVELLI, LIVELLI_NOTE, FASCE_REGOLE, FASCE_NOTE, KPI, REVISIONE, RUOLI, ROUNDTABLE, CHANGELOG,
} from "@/lib/carriera-regole";

/**
 * /carriera — il sistema di performance management della chat in un posto solo (23/11/2026).
 * Schede per ruolo (decise dal server in /api/carriera):
 *   Le regole   tutti quelli che entrano (gli operatori non entrano: per loro /me/percorso, spenta)
 *   Quadro      admin e chi vede tutte le creator
 *   I miei profili  il sales coach (creator assegnate da Membri)
 *   Revisioni   il revisore qualità (ruolo qa_reviewer) e gli admin
 * Mappa del sistema: lavagna Miro «Sistema di performance management Chat Sales».
 * Colori: la fascia C NON è rossa (regola di stile: il rosso è per denaro negativo e allarmi,
 * mai per le persone) → si distingue per forma (sottolineato a puntini).
 */

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
  if (!r.ok && !j.error) j.error = `Errore ${r.status}`;
  return j;
};

async function post(body) {
  const r = await fetch("/api/carriera", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
  return j;
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const monthName = (ym) => (/^\d{4}-\d{2}$/.test(ym || "") ? MESI[Number(ym.slice(5)) - 1] : ym || "—");
const fmtIdx = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const fmtPct = (x) => (x == null ? "" : `${Math.round(x * 100)}%`);

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "9px 11px", background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none" };
const labelStyle = { display: "block", fontSize: 13, color: CP.textSecondary, margin: "12px 0 6px" };
const P = { margin: 0, fontSize: 14, lineHeight: 1.55, color: CP.textSecondary };

function FasciaTag({ f }) {
  if (!f) return <span style={{ color: CP.textMuted, fontSize: 13 }}>n/v</span>;
  const base = { display: "inline-block", minWidth: 22, textAlign: "center", padding: "1px 7px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${CP.border}` };
  if (f === "A") return <span style={{ ...base, background: CP.accentSoft || CP.surfaceAlt, color: CP.accentSoftText, borderColor: CP.accent }}>A</span>;
  // C: si distingue per FORMA (bordo tratteggiato), mai col rosso — il rosso è per denaro e allarmi, non per persone
  if (f === "C") return <span style={{ ...base, background: "transparent", color: CP.textPrimary, border: `1px dashed ${CP.borderStrong || CP.border}` }}>C</span>;
  return <span style={{ ...base, color: CP.textSecondary }}>B</span>;
}

function StatoText({ o }) {
  const s = STATI[o.stato]?.label || o.stato;
  const strong = o.stato === "revisione_dovuta" || o.stato === "in_revisione";
  return (
    <span style={{ fontSize: 13.5, color: strong ? CP.textPrimary : CP.textSecondary, fontWeight: strong ? 500 : 400 }}>
      {s}
      {o.exception && <span style={{ color: CP.textMuted }}> · fino al {fmtDate(o.exception.until)}</span>}
    </span>
  );
}

// ── tabella operatori (condivisa da Quadro, I miei profili, Revisioni) ─────────

function OperatorsTable({ rows, months, actions, empty }) {
  const m2 = monthName(months?.m2);
  const m1 = monthName(months?.m1);
  const columns = [
    {
      key: "name", label: "Operatore", sort: (o) => o.name,
      render: (o) => <Link href={`/leaderboard/operational/${encodeURIComponent(o.name)}`} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>{o.name}</Link>,
    },
    {
      key: "profile", label: "Profilo principale", sort: (o) => o.profile?.name || "",
      render: (o) => (o.profile ? <span>{o.profile.name}<span style={{ color: CP.textMuted }}> · {fmtPct(o.profile.share)} delle ore</span></span> : <span style={{ color: CP.textMuted }}>—</span>),
    },
    {
      key: "idx", label: "Resa 3 mesi", align: "right", sort: (o) => o.idx ?? -1,
      render: (o) => <span style={{ display: "inline-flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}><span style={NUM}>{fmtIdx(o.idx)}</span><FasciaTag f={o.fascia} /></span>,
    },
    { key: "m2", label: m2, align: "center", sort: (o) => o.m2 ?? -1, render: (o) => <span title={fmtIdx(o.m2)}><FasciaTag f={o.fascia_m2} /></span> },
    { key: "m1", label: m1, align: "center", sort: (o) => o.m1 ?? -1, render: (o) => <span title={fmtIdx(o.m1)}><FasciaTag f={o.fascia_m1} /></span> },
    { key: "stato", label: "Stato", sort: (o) => STATI[o.stato]?.order ?? 9, render: (o) => <StatoText o={o} /> },
  ];
  if (actions) columns.push({ key: "azione", label: "", render: (o) => actions(o) });
  return <DataTable columns={columns} rows={rows} minWidth={760} empty={empty || "Nessun operatore."} />;
}

// ── finestre di inserimento ─────────────────────────────────────────────────

function useSave(mutate, onDone) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (body) => {
    setBusy(true);
    setErr("");
    try {
      await post(body);
      await mutate();
      onDone?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, run };
}

function FormFoot({ busy, err, onCancel, label }) {
  return (
    <>
      {err && <p style={{ ...P, color: CP.accentRed, marginTop: 12 }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
        <button type="button" onClick={onCancel} style={BTN}>Annulla</button>
        <button type="submit" disabled={busy} style={{ ...BTN_PRIMARY, opacity: busy ? 0.6 : 1 }}>{busy ? "Salvo…" : label}</button>
      </div>
    </>
  );
}

function ExceptionModal({ target, onClose, mutate }) {
  const [motivo, setMotivo] = useState("");
  const [giorni, setGiorni] = useState(ECCEZIONE_MAX_GIORNI);
  const { busy, err, run } = useSave(mutate, onClose);
  if (!target) return null;
  return (
    <Modal open onClose={onClose} title={`Eccezione per ${target.name}`}>
      <form onSubmit={(e) => { e.preventDefault(); run({ action: "exception.add", operator: target.name, profile: target.profile?.name, motivo, giorni: Number(giorni) }); }}>
        <p style={P}>La revisione non parte finché l&apos;eccezione è attiva. Il motivo resta scritto e lo vede chi fa la calibrazione.</p>
        <label style={labelStyle} htmlFor="exc-motivo">Perché la tieni sul profilo</label>
        <textarea id="exc-motivo" rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} style={inputStyle} placeholder="Es. sta imparando un profilo nuovo da 3 settimane" />
        <label style={labelStyle} htmlFor="exc-giorni">Per quanti giorni (massimo {ECCEZIONE_MAX_GIORNI})</label>
        <input id="exc-giorni" type="number" min={1} max={ECCEZIONE_MAX_GIORNI} value={giorni} onChange={(e) => setGiorni(e.target.value)} style={{ ...inputStyle, width: 120 }} />
        <FormFoot busy={busy} err={err} onCancel={onClose} label="Salva l'eccezione" />
      </form>
    </Modal>
  );
}

function RoundtableModal({ profile, onClose, mutate }) {
  const [presenti, setPresenti] = useState("");
  const [visto, setVisto] = useState("");
  const [prova, setProva] = useState("");
  const { busy, err, run } = useSave(mutate, onClose);
  if (!profile) return null;
  return (
    <Modal open onClose={onClose} title={`Roundtable · ${profile}`}>
      <form onSubmit={(e) => { e.preventDefault(); run({ action: "roundtable.add", profile, presenti, visto, prova }); }}>
        <p style={P}>Tre righe, dopo la roundtable della settimana. Servono a sapere che è stata fatta e, due settimane dopo, se la prova ha funzionato.</p>
        <label style={labelStyle} htmlFor="rt-presenti">Quanti operatori c&apos;erano</label>
        <input id="rt-presenti" type="number" min={0} value={presenti} onChange={(e) => setPresenti(e.target.value)} style={{ ...inputStyle, width: 120 }} />
        <label style={labelStyle} htmlFor="rt-visto">Cosa si è visto</label>
        <textarea id="rt-visto" rows={3} value={visto} onChange={(e) => setVisto(e.target.value)} style={inputStyle} placeholder="La chat riuscita, quella persa, cosa ne è venuto fuori" />
        <label style={labelStyle} htmlFor="rt-prova">La prova della settimana</label>
        <input id="rt-prova" value={prova} onChange={(e) => setProva(e.target.value)} style={inputStyle} placeholder="Una cosa sola, con il numero che la giudica" />
        <FormFoot busy={busy} err={err} onCancel={onClose} label="Salva" />
      </form>
    </Modal>
  );
}

const NEXT_STEP = { colloquio: "colloquio", piano: "piano", verifica: "verifica" };

function ReviewStepModal({ review, step, onClose, mutate }) {
  const { user } = useUser();
  const [note, setNote] = useState("");
  const [ob1, setOb1] = useState("");
  const [ob2, setOb2] = useState("");
  const [allenamento, setAllenamento] = useState("");
  const [tipo, setTipo] = useState("");
  const [firmaRev, setFirmaRev] = useState(user?.fullName || "");
  const [firmaCoach, setFirmaCoach] = useState("");
  const { busy, err, run } = useSave(mutate, onClose);
  if (!review || !step) return null;
  const titles = { colloquio: "Colloquio", piano: "Piano di 6 settimane", verifica: "Verifica", esito: "Esito" };
  const payload = step === "piano" ? { obiettivi: [ob1, ob2], allenamento } : step === "esito" ? { tipo, note, firma_revisore: firmaRev, firma_coach: firmaCoach } : { note };
  return (
    <Modal open onClose={onClose} title={`${titles[step]} · ${review.operator}`} maxWidth={540}>
      <form onSubmit={(e) => { e.preventDefault(); run({ action: "review.step", id: review.id, step, payload }); }}>
        {(step === "colloquio" || step === "verifica") && (
          <>
            <label style={labelStyle} htmlFor="rv-note">{step === "colloquio" ? "Cosa vi siete detti" : "Com'è andata, con i numeri"}</label>
            <textarea id="rv-note" rows={5} value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
          </>
        )}
        {step === "piano" && (
          <>
            <p style={P}>Uno o due obiettivi in numeri. Il piano dura 6 settimane da oggi.</p>
            <label style={labelStyle} htmlFor="rv-ob1">Obiettivo 1</label>
            <input id="rv-ob1" value={ob1} onChange={(e) => setOb1(e.target.value)} style={inputStyle} placeholder="Es. resa rispetto ai colleghi almeno 0,90" />
            <label style={labelStyle} htmlFor="rv-ob2">Obiettivo 2 (facoltativo)</label>
            <input id="rv-ob2" value={ob2} onChange={(e) => setOb2(e.target.value)} style={inputStyle} />
            <label style={labelStyle} htmlFor="rv-all">Allenamento proposto</label>
            <input id="rv-all" value={allenamento} onChange={(e) => setAllenamento(e.target.value)} style={inputStyle} placeholder="Es. affiancamento su 3 turni, scenari Academy sul prezzo" />
          </>
        )}
        {step === "esito" && (
          <>
            <label style={labelStyle} htmlFor="rv-tipo">Esito</label>
            <select id="rv-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} style={inputStyle}>
              <option value="">Scegli…</option>
              {Object.entries(ESITI).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <label style={labelStyle} htmlFor="rv-enote">Note</label>
            <textarea id="rv-enote" rows={3} value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
            <label style={labelStyle} htmlFor="rv-f1">Firma del revisore qualità</label>
            <input id="rv-f1" value={firmaRev} onChange={(e) => setFirmaRev(e.target.value)} style={inputStyle} />
            <label style={labelStyle} htmlFor="rv-f2">Firma del sales coach di un altro profilo</label>
            <input id="rv-f2" value={firmaCoach} onChange={(e) => setFirmaCoach(e.target.value)} style={inputStyle} />
          </>
        )}
        <FormFoot busy={busy} err={err} onCancel={onClose} label="Salva" />
      </form>
    </Modal>
  );
}

// ── schede ──────────────────────────────────────────────────────────────────

const CHIPS = [
  ["tutti", "Tutti", () => true],
  ["guardare", "Da guardare", (o) => ["revisione_dovuta", "in_revisione", "eccezione", "attenzione"].includes(o.stato)],
  ["A", "Fascia A", (o) => o.fascia === "A"],
  ["B", "Fascia B", (o) => o.fascia === "B"],
  ["C", "Fascia C", (o) => o.fascia === "C"],
  ["nv", "Non valutabili", (o) => !o.fascia],
];

function QuadroTab({ data, me, onOpenReview, onException }) {
  const [chip, setChip] = useState("tutti");
  const [profile, setProfile] = useState("");
  const q = data.quadro;
  const base = profile ? q.operators.filter((o) => (o.profile?.name || "Senza profilo") === profile) : q.operators;
  const rows = base.filter(CHIPS.find((c) => c[0] === chip)[2]);
  const c = q.counts;
  const actions = (o) => {
    if (o.stato === "revisione_dovuta" && me.revisore) return <button type="button" style={{ ...BTN, minHeight: 32, padding: "5px 10px" }} onClick={() => onOpenReview(o)}>Apri revisione</button>;
    return null;
  };
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
        <Metric label="Fascia A" value={String(c.A)} />
        <Metric label="Fascia B" value={String(c.B)} />
        <Metric label="Fascia C" value={String(c.C)} />
        <Metric label="Non valutabili" value={String(c.nv)} />
        <Metric label="Revisioni dovute" value={String(c.dovute)} />
        <Metric label="In revisione" value={String(c.in_revisione)} />
        <Metric label="Eccezioni attive" value={String(c.eccezioni)} />
        <Metric label="Fermi da 3 settimane" value={String(c.fermi)} note="fuori da fasce e revisioni" />
      </div>
      <FilterBar onReset={chip !== "tutti" || profile ? () => { setChip("tutti"); setProfile(""); } : undefined}>
        {CHIPS.map(([k, l, fn]) => <FilterChip key={k} label={`${l} ${base.filter(fn).length}`} active={chip === k} onClick={() => setChip(k)} />)}
        <select aria-label="Profilo" value={profile} onChange={(e) => setProfile(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 13, marginLeft: 4 }}>
          <option value="">Tutti i profili</option>
          {q.profiles.map((p) => <option key={p.profile} value={p.profile}>{p.profile} ({p.n})</option>)}
        </select>
      </FilterBar>
      <OperatorsTable rows={rows} months={data.months} actions={actions} empty="Nessun operatore con questi filtri." />
      <div style={{ height: 24 }} />
      <SectionTitle aside={`settimana ${q.week.slice(-2)}`}>Per profilo</SectionTitle>
      <DataTable
        minWidth={640}
        rows={q.profiles}
        defaultSort={{ key: "dovute", dir: -1 }}
        columns={[
          { key: "profile", label: "Profilo", sort: (p) => p.profile, render: (p) => <button type="button" onClick={() => { setProfile(p.profile); setChip("tutti"); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ background: "none", border: "none", padding: 0, color: CP.textPrimary, cursor: "pointer", font: "inherit", fontWeight: 500 }}>{p.profile}</button> },
          { key: "n", label: "Operatori", align: "right", sort: (p) => p.n, render: (p) => <span style={NUM}>{p.n}</span> },
          { key: "A", label: "A", align: "right", sort: (p) => p.A, render: (p) => <span style={NUM}>{p.A}</span> },
          { key: "B", label: "B", align: "right", sort: (p) => p.B, render: (p) => <span style={NUM}>{p.B}</span> },
          { key: "C", label: "C", align: "right", sort: (p) => p.C, render: (p) => <span style={NUM}>{p.C}</span> },
          { key: "dovute", label: "Revisioni dovute", align: "right", sort: (p) => p.dovute, render: (p) => <span style={{ ...NUM, fontWeight: p.dovute ? 600 : 400, color: p.dovute ? CP.textPrimary : CP.textMuted }}>{p.dovute}</span> },
          { key: "rt", label: "Roundtable", sort: (p) => (p.roundtable ? 1 : 0), render: (p) => <span style={{ color: p.roundtable ? CP.textPrimary : CP.textMuted }}>{p.roundtable ? "Fatta" : "Da fare"}</span> },
        ]}
      />
    </>
  );
}

function ProfiliTab({ data, me, onException, onEndException, onRoundtable }) {
  const q = data.quadro;
  if (!q.profiles.length) {
    return (
      <EmptyState title="Nessun operatore sui tuoi profili">
        Le creator assegnate a te sono: {me.creators.join(", ") || "nessuna"}. Se manca qualcuno, chiedi di aggiornarle dalla pagina Membri.
      </EmptyState>
    );
  }
  const lastRt = (profile) => data.roundtables.find((r) => r.profile === profile) || null;
  const actions = (o) => {
    if (o.stato === "revisione_dovuta") return <button type="button" style={{ ...BTN, minHeight: 32, padding: "5px 10px" }} onClick={() => onException(o)}>Tienilo con un&apos;eccezione</button>;
    if (o.stato === "eccezione" && o.exception) return <button type="button" style={{ ...BTN, minHeight: 32, padding: "5px 10px" }} onClick={() => onEndException(o)}>Chiudi l&apos;eccezione</button>;
    return null;
  };
  return q.profiles.map((p) => {
    const ops = q.operators.filter((o) => (o.profile?.name || "Senza profilo") === p.profile);
    const rt = lastRt(p.profile);
    const rtThisWeek = rt && rt.week === q.week;
    return (
      <section key={p.profile} style={{ marginBottom: 28 }}>
        <SectionTitle aside={`${p.n} operatori · A ${p.A} · B ${p.B} · C ${p.C}`}>{p.profile}</SectionTitle>
        <div style={{ ...card, padding: "12px 16px", marginBottom: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px" }}>
            <div style={{ fontSize: 14, color: CP.textPrimary, fontWeight: 500 }}>Roundtable di questa settimana: {rtThisWeek ? "fatta" : "da fare"}</div>
            {rt && <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 4 }}>Ultima ({fmtDate(rt.at)}): prova «{rt.prova}»</div>}
          </div>
          <button type="button" style={rtThisWeek ? BTN : BTN_PRIMARY} onClick={() => onRoundtable(p.profile)}>{rtThisWeek ? "Aggiungi un'altra" : "Scrivi la roundtable"}</button>
        </div>
        <OperatorsTable rows={ops} months={data.months} actions={actions} />
      </section>
    );
  });
}

function Stepper({ fase }) {
  const idx = FASI_REVISIONE.findIndex(([k]) => k === fase);
  return (
    <ol style={{ display: "flex", gap: 6, listStyle: "none", padding: 0, margin: "8px 0 0", flexWrap: "wrap" }}>
      {FASI_REVISIONE.map(([k, l], i) => (
        <li key={k} style={{ fontSize: 12.5, padding: "3px 9px", borderRadius: 999, border: `1px solid ${i <= idx ? CP.accent : CP.border}`, color: i === idx ? CP.accentSoftText : i < idx ? CP.textSecondary : CP.textMuted }}>
          {i + 1}. {l}
        </li>
      ))}
    </ol>
  );
}

function ReviewCard({ r, onStep }) {
  const step = r.fase === "chiusa" ? null : NEXT_STEP[r.fase];
  return (
    <div style={{ ...card, padding: "14px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <Link href={`/leaderboard/operational/${encodeURIComponent(r.operator)}`} style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary, textDecoration: "none" }}>{r.operator}</Link>
        <span style={{ fontSize: 13, color: CP.textMuted }}>{r.profile || "—"} · aperta il {fmtDate(r.opened_at)} da {r.opened_by || "—"}</span>
      </div>
      {r.trigger && (
        <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 4 }}>
          Resa al momento dell&apos;apertura: <span style={NUM}>{fmtIdx(r.trigger.m2)}</span> e <span style={NUM}>{fmtIdx(r.trigger.m1)}</span> nei due mesi chiusi, <span style={NUM}>{fmtIdx(r.trigger.idx)}</span> sui 3 mesi.
        </div>
      )}
      <Stepper fase={r.fase} />
      <div style={{ display: "grid", gap: 8, marginTop: 10, fontSize: 13.5, color: CP.textSecondary, lineHeight: 1.5 }}>
        {r.colloquio && <div><b style={{ fontWeight: 500, color: CP.textPrimary }}>Colloquio ({fmtDate(r.colloquio.at)}):</b> {r.colloquio.note}</div>}
        {r.piano && <div><b style={{ fontWeight: 500, color: CP.textPrimary }}>Piano fino al {fmtDate(r.piano.fine)}:</b> {r.piano.obiettivi.join(" · ")}{r.piano.allenamento ? ` · allenamento: ${r.piano.allenamento}` : ""}</div>}
        {(r.verifiche || []).map((v, i) => <div key={i}><b style={{ fontWeight: 500, color: CP.textPrimary }}>Verifica {i + 1} ({fmtDate(v.at)}):</b> {v.note}</div>)}
        {r.esito && <div><b style={{ fontWeight: 500, color: CP.textPrimary }}>Esito: {ESITI[r.esito.tipo]}</b> · firmato da {r.esito.firma_revisore} e {r.esito.firma_coach}{r.esito.note ? ` · ${r.esito.note}` : ""}</div>}
      </div>
      {r.fase !== "chiusa" && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {step && <button type="button" style={BTN_PRIMARY} onClick={() => onStep(r, step)}>{step === "colloquio" ? "Scrivi il colloquio" : step === "piano" ? "Scrivi il piano" : "Aggiungi una verifica"}</button>}
          {r.piano && <button type="button" style={BTN} onClick={() => onStep(r, "esito")}>Chiudi con l&apos;esito</button>}
        </div>
      )}
    </div>
  );
}

function RevisioniTab({ data, onOpenReview, onStep }) {
  const daAprire = data.quadro.operators.filter((o) => o.stato === "revisione_dovuta");
  const open = data.reviews.filter((r) => r.fase !== "chiusa");
  const closed = data.reviews.filter((r) => r.fase === "chiusa");
  return (
    <>
      <SectionTitle aside={String(daAprire.length)}>Da aprire</SectionTitle>
      {daAprire.length ? (
        <OperatorsTable rows={daAprire} months={data.months} actions={(o) => <button type="button" style={{ ...BTN, minHeight: 32, padding: "5px 10px" }} onClick={() => onOpenReview(o)}>Apri revisione</button>} />
      ) : (
        <EmptyState title="Nessuna revisione da aprire">Nessuno è in fascia C in entrambi gli ultimi due mesi chiusi, oppure il sales coach ha scritto un&apos;eccezione.</EmptyState>
      )}
      <div style={{ height: 20 }} />
      <SectionTitle aside={String(open.length)}>In corso</SectionTitle>
      {open.length ? open.map((r) => <ReviewCard key={r.id} r={r} onStep={onStep} />) : <EmptyState title="Nessuna revisione in corso" />}
      {closed.length > 0 && (
        <>
          <div style={{ height: 20 }} />
          <SectionTitle aside={String(closed.length)}>Chiuse</SectionTitle>
          <DataTable
            minWidth={640}
            rows={closed}
            columns={[
              { key: "operator", label: "Operatore", sort: (r) => r.operator, render: (r) => r.operator },
              { key: "profile", label: "Profilo", sort: (r) => r.profile || "", render: (r) => r.profile || "—" },
              { key: "esito", label: "Esito", sort: (r) => r.esito?.tipo || "", render: (r) => ESITI[r.esito?.tipo] || "—" },
              { key: "closed", label: "Chiusa il", sort: (r) => r.closed_at || "", render: (r) => fmtDate(r.closed_at) },
              { key: "firme", label: "Firme", render: (r) => (r.esito ? `${r.esito.firma_revisore} · ${r.esito.firma_coach}` : "—") },
            ]}
          />
        </>
      )}
    </>
  );
}

function Box({ title, children, style }) {
  return (
    <div style={{ ...card, padding: "14px 16px", ...style }}>
      {title && <div style={{ fontSize: 14.5, fontWeight: 500, color: CP.textPrimary, marginBottom: 6 }}>{title}</div>}
      <div style={{ fontSize: 13.5, color: CP.textSecondary, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}
const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 10, marginBottom: 12 });

function RegoleTab() {
  return (
    <div style={{ maxWidth: 1100 }}>
      <Notice>Versione {REGOLE_STATO.version.replace("carriera-", "")} · {REGOLE_STATO.stato}. {REGOLE_STATO.nota}</Notice>

      <SectionTitle>I livelli</SectionTitle>
      <div style={grid(220)}>
        {LIVELLI.map((l) => (
          <Box key={l.titolo} title={`${l.id} · ${l.titolo}`}>
            {l.testo}
            {l.salire && <div style={{ marginTop: 6 }}><span style={{ color: CP.textPrimary }}>Per salire:</span> {l.salire}</div>}
          </Box>
        ))}
      </div>
      {LIVELLI_NOTE.map((n) => <p key={n} style={{ ...P, fontSize: 13.5, marginBottom: 4 }}>{n}</p>)}

      <div style={{ height: 24 }} />
      <SectionTitle aside={`soglie ${fmtIdx(SOGLIE.C)} e ${fmtIdx(SOGLIE.A)}`}>Le fasce A/B/C</SectionTitle>
      <div style={grid(260)}>
        {FASCE_REGOLE.map((f) => (
          <Box key={f.fascia} title={<span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><FasciaTag f={f.fascia} /> Vendi {f.soglia}</span>}>{f.cosa}</Box>
        ))}
      </div>
      {FASCE_NOTE.map((n) => <p key={n} style={{ ...P, fontSize: 13.5, marginBottom: 4 }}>{n}</p>)}

      <div style={{ height: 24 }} />
      <SectionTitle>Cosa conta e cosa no</SectionTitle>
      <div style={grid(280)}>
        <Box title="Conta">{KPI.conta.map(([t, d]) => <div key={t} style={{ marginBottom: 8 }}><span style={{ color: CP.textPrimary }}>{t}.</span> {d}</div>)}</Box>
        <Box title="Non conta">{KPI.non_conta.map(([t, d]) => <div key={t} style={{ marginBottom: 8 }}><span style={{ color: CP.textPrimary }}>{t}.</span> {d}</div>)}</Box>
        <Box title="Le regole">{KPI.regole.map(([t, d]) => <div key={t} style={{ marginBottom: 8 }}><span style={{ color: CP.textPrimary }}>{t}.</span> {d}</div>)}</Box>
      </div>
      <p style={{ ...P, fontSize: 13.5 }}>{KPI.limite_v01}</p>

      <div style={{ height: 24 }} />
      <SectionTitle>La revisione</SectionTitle>
      <div style={grid(190)}>
        {REVISIONE.passi.map(([t, d], i) => <Box key={t} title={`${i + 1}. ${t}`}>{d}</Box>)}
      </div>
      <div style={grid(260)}>
        {REVISIONE.esiti.map(([t, d]) => <Box key={t} title={t}>{d}</Box>)}
      </div>
      <p style={{ ...P, fontSize: 13.5 }}>{REVISIONE.eccezione}</p>

      <div style={{ height: 24 }} />
      <SectionTitle>Chi fa cosa</SectionTitle>
      <div style={grid(300)}>
        {RUOLI.map(([t, d]) => <Box key={t} title={t}>{d}</Box>)}
      </div>

      <div style={{ height: 24 }} />
      <SectionTitle aside="45 minuti, ogni settimana">La roundtable</SectionTitle>
      <div style={grid(190)}>
        {ROUNDTABLE.map(([t, min, d], i) => <Box key={t} title={`${i + 1}. ${t} (${min})`}>{d}</Box>)}
      </div>
      <p style={{ ...P, fontSize: 13.5 }}>Tenerla è un impegno del sales coach; per gli operatori partecipare resta libero, e chi non c&apos;è riceve il riassunto.</p>

      <div style={{ height: 24 }} />
      <Spiega label="Versioni del regolamento">
        {CHANGELOG.map(([v, d, txt]) => <div key={v}><span style={{ color: CP.textPrimary }}>{v.replace("carriera-", "")} · {d}</span> — {txt}</div>)}
      </Spiega>
    </div>
  );
}

// ── pagina ──────────────────────────────────────────────────────────────────

export default function CarrieraPage() {
  const { data, error, mutate, isLoading } = useSWR("/api/carriera", fetcher, { revalidateOnFocus: false });
  const [tab, setTab] = useState(null);
  const [excTarget, setExcTarget] = useState(null);
  const [rtProfile, setRtProfile] = useState(null);
  const [stepState, setStepState] = useState(null); // { review, step }
  const [msg, setMsg] = useState("");

  const tabs = useMemo(() => {
    if (!data?.tabs) return [["regole", "Le regole"]];
    const t = [];
    if (data.tabs.quadro) t.push(["quadro", "Quadro", data.quadro?.counts?.dovute || null]);
    if (data.tabs.profili) t.push(["profili", "I miei profili"]);
    if (data.tabs.revisioni) t.push(["revisioni", "Revisioni", (data.reviews || []).filter((r) => r.fase !== "chiusa").length || null]);
    t.push(["regole", "Le regole"]);
    return t;
  }, [data]);
  const active = tab && tabs.some(([k]) => k === tab) ? tab : tabs[0][0];

  const openReview = async (o) => {
    setMsg("");
    try {
      await post({ action: "review.open", operator: o.name });
      await mutate();
      setTab("revisioni");
    } catch (e) {
      setMsg(e.message);
    }
  };
  const endException = async (o) => {
    if (!o.exception?.id) return;
    if (!window.confirm(`Chiudere l'eccezione per ${o.name}? Se resta in fascia C, la revisione torna dovuta.`)) return;
    setMsg("");
    try {
      await post({ action: "exception.end", id: o.exception.id });
      await mutate();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const months = data?.months;
  const subtitle = "Livelli, fasce e revisioni: le stesse regole per tutti, scritte in un posto solo.";

  // Senza permesso (operatori, scope own): niente dati e niente regole. Le regole arrivano agli
  // operatori da /me/percorso, quando l'avvocato avrà dato l'ok (decisione del 23/11/2026).
  if (data?.error && !data.tabs) {
    return (
      <div style={{ padding: "28px 24px 64px", maxWidth: 1600, margin: "0 auto", fontFamily: FONTS.body }}>
        <PageHead title="Carriera" subtitle={subtitle} />
        <EmptyState title="Questa pagina è per chi segue i profili">
          La vedono i sales coach, il revisore qualità e gli admin. Il tuo percorso personale è in <Link href="/me/percorso" style={{ color: CP.accentSoftText }}>Il mio percorso</Link>.
        </EmptyState>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1600, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead title="Carriera" subtitle={subtitle} />
      {error && <Notice danger>Non riesco a leggere i dati: {String(error.message || error)}</Notice>}
      {data?.error && active !== "regole" && <Notice danger>{data.error}</Notice>}
      {msg && <Notice danger>{msg}</Notice>}

      <Tabs items={tabs} value={active} onChange={(k) => { setTab(k); setMsg(""); }} />

      {active !== "regole" && (isLoading || (!data && !error)) && <p style={P}>Caricamento…</p>}
      {active !== "regole" && data?.computing && <Notice>Sto calcolando le fasce dai dati della Squadra: torna tra un minuto.</Notice>}

      {active !== "regole" && data?.quadro && (
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 12, fontSize: 13, color: CP.textMuted }}>
          <span>Resa sui 3 mesi fino a {monthName(months?.cur)}{months?.infloww_until ? ` (dati Infloww fino al ${fmtDate(months.infloww_until)})` : ""} · mesi chiusi: {monthName(months?.m2)} e {monthName(months?.m1)}</span>
          {data.stale && <span style={ATTN}>dati di più di 30 ore fa</span>}
          {data.names_missing && <span style={ATTN}>nomi dei profili non disponibili</span>}
          <Spiega label="Come si calcola">
            <div>La resa è quanto vende la persona all&apos;ora diviso quanto venderebbero i colleghi sulla stessa modella e nella stessa fascia oraria (senza contare lei). 1,00 = come i colleghi.</div>
            <div>Fascia A da {fmtIdx(SOGLIE.A)} in su, C sotto {fmtIdx(SOGLIE.C)}. Un mese conta solo con abbastanza ore: altrimenti è «n/v», non valutabile, e non fa scattare niente.</div>
            <div>La revisione è dovuta con la fascia C in entrambi i mesi chiusi ({monthName(months?.m2)} e {monthName(months?.m1)}). Il profilo principale è quello dove la persona ha fatto più ore.</div>
            <div>{KPI.limite_v01}</div>
          </Spiega>
        </div>
      )}

      {active === "quadro" && data?.quadro && <QuadroTab data={data} me={data.me} onOpenReview={openReview} onException={setExcTarget} />}
      {active === "profili" && data?.quadro && <ProfiliTab data={data} me={data.me} onException={setExcTarget} onEndException={endException} onRoundtable={setRtProfile} />}
      {active === "revisioni" && data?.quadro && <RevisioniTab data={data} onOpenReview={openReview} onStep={(review, step) => setStepState({ review, step })} />}
      {active === "regole" && <RegoleTab />}

      <ExceptionModal key={`exc:${excTarget?.name || ""}`} target={excTarget} onClose={() => setExcTarget(null)} mutate={mutate} />
      <RoundtableModal key={`rt:${rtProfile || ""}`} profile={rtProfile} onClose={() => setRtProfile(null)} mutate={mutate} />
      {stepState && <ReviewStepModal review={stepState.review} step={stepState.step} onClose={() => setStepState(null)} mutate={mutate} />}
    </div>
  );
}
