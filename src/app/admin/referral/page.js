"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Send } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, FilterChip, DataTable, Notice, SectionTitle, Disclosure, Tabs, BTN_PRIMARY } from "@/components/ds";
import { Modal } from "@/components/cp-style";
import { TutorialVideoButton } from "@/components/TutorialVideo";
import VetroScope, { useVetro, VetroSwitch, VetroNum } from "@/components/VetroScope";
import { Donut, KpiCard } from "@/components/VetroCharts";
import { Wallet, Hourglass, CircleCheck, Users, UserPlus, Repeat, Coins, Gift } from "lucide-react";
import { MilestoneRow, Steps, RulesList, StatusPill, PayslipCard, fmtEur, fmtUsd, fmtDay, monthLabel, box, pageWrap, NUM, shrinkImage, shotUrl, ShotButton } from "@/components/referral-ui";
import { payslipsCsv } from "@/lib/referral-core";
import { confirmDialog, alertDialog } from "@/components/AppDialogs";

/**
 * /admin/referral — «Porta un amico», lato HR (permesso referral.manage).
 * L'HR registra chi ha portato chi, segna gli step (colloquio, formazione) e i
 * pagamenti. Ogni persona portata si lega alla sua scheda del CRM (07/11/2026):
 * da lì arrivano chi è su Infloww, i turni CreatorsPro (e il primo turno), il
 * venduto e l'uscita.
 * Regole e cifre: lib/referral-core.js (versionate).
 */
const API = "/api/admin/referral";
const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({ error: "Risposta non valida" }));
  if (!r.ok && !j.error) j.error = "Errore di caricamento";
  return j;
};

const lbl = { display: "block", fontSize: 13, color: CP.textSecondary, margin: "12px 0 4px" };
const inp = { width: "100%", boxSizing: "border-box", padding: "9px 10px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body };
const btn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" };
const btnPrimary = BTN_PRIMARY;
const btnQuiet = { ...btn, background: "transparent", border: "none", color: CP.textSecondary, padding: "8px 4px" };

async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || "Errore");
  return j;
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function Actions({ busy, error, onSave, onDelete, saveLabel = "Salva", extra = null, saveStyle = null }) {
  return (
    <>
      {error && <div style={{ color: CP.accentRed, fontSize: 13, marginTop: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 18, alignItems: "center" }}>
        {extra}
        <button type="button" style={saveStyle || btnPrimary} disabled={busy} onClick={onSave}>{busy ? "Salvo…" : saveLabel}</button>
        {onDelete && <button type="button" style={{ ...btnQuiet, marginLeft: "auto" }} disabled={busy} onClick={onDelete}>Elimina</button>}
      </div>
    </>
  );
}

// ── Referente ───────────────────────────────────────────────────────────────
function ReferrerModal({ initial, onClose, onDone }) {
  // rec = il referente salvato (null finché è nuovo): «Salva e invita» lo crea e resta aperto sull'accesso
  const [rec, setRec] = useState(initial || null);
  const [f, setF] = useState({ name: initial?.name || "", email: initial?.email || "", phone: initial?.phone || "", instagram: initial?.instagram || "", note: initial?.note || "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [inviteMsg, setInviteMsg] = useState(null);
  const [other, setOther] = useState(null); // altra email della persona con cui ha già un account
  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async (data = f) => { const j = await post({ action: "saveReferrer", id: rec?.id, data }); setRec(j.result); return j.result; };
  const invite = async (id, force = false) => {
    const j = await post({ action: "invite", id, force });
    if (j.otherAccount) { setOther(j.otherAccount); setInviteMsg(null); onDone(false); return; }
    setOther(null);
    setInviteMsg(j.exists ? "Ha già un account HOC Pro: entrando con questa email vede la pagina, nessun invito serve." : j.url ? `Invito mandato. Link da girare se la mail non arriva: ${j.url}` : "Invito mandato.");
    if (!j.exists) setRec((r) => ({ ...r, invitedAt: Date.now() }));
    onDone(false);
  };
  const useOther = () => run(async () => {
    const data = { ...f, email: other };
    setF(data); await save(data); setOther(null);
    setInviteMsg(`Fatto: entrando in HOC Pro con ${other} vede la sua pagina. Nessun invito serve.`);
    onDone(false);
  });
  return (
    <Modal open onClose={onClose} title={rec?.id ? rec.name : "Nuovo referente"}>
      <Field label="Nome e cognome"><input style={inp} value={f.name} onChange={set("name")} autoFocus /></Field>
      <Field label="Email" hint="Quella con cui entra in HOC Pro: con questa vede solo i suoi guadagni. Se non ha ancora un account, l'invito arriva qui."><input style={inp} type="email" value={f.email} onChange={set("email")} /></Field>
      <Field label="Telefono"><input style={inp} value={f.phone} onChange={set("phone")} /></Field>
      <Field label="Profilo Instagram" hint="Il nome (es. giulia.bianchi) o il link. Serve a sapere quanti follower ha e quanti di loro vedono le storie.">
        <input style={inp} value={f.instagram} onChange={set("instagram")} placeholder="@" />
      </Field>
      {rec?.id && rec.instagram && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: CP.textSecondary, marginTop: 6 }}>
          <span style={{ flex: "1 1 240px" }}>
            {!rec.ig || rec.ig.handle !== rec.instagram ? "Profilo non ancora controllato."
              : rec.ig.exists ? <>@{rec.ig.handle}{rec.ig.fullName ? ` · ${rec.ig.fullName}` : ""} · <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{rec.ig.followers != null ? rec.ig.followers.toLocaleString("it-IT") : "?"} follower</b>{rec.ig.private ? " · privato" : ""} · controllato il {fmtDay(new Date(rec.ig.checkedAt).toISOString().slice(0, 10))}</>
              : <span style={{ color: CP.attn }}>@{rec.ig.handle}: profilo non trovato. Controlla com&apos;è scritto.</span>}
          </span>
          <button type="button" style={btn} disabled={busy || f.instagram !== (rec.instagram || "")} title={f.instagram !== (rec.instagram || "") ? "Salva prima il profilo" : ""}
            onClick={() => run(async () => { const j = await post({ action: "checkInstagram", id: rec.id }); setRec((x) => ({ ...x, ig: j.result })); onDone(false); })}>
            {rec.ig?.handle === rec.instagram ? "Controlla di nuovo" : "Controlla il profilo"}
          </button>
        </div>
      )}
      <Field label="Note (le vede solo l'HR)"><textarea style={{ ...inp, minHeight: 60 }} value={f.note} onChange={set("note")} /></Field>
      {rec?.id && (
        <div className="vt-glass" style={{ ...box, padding: 12, marginTop: 14, fontSize: 13, color: CP.textSecondary }}>
          {rec.userId ? "Account collegato: vede la sua pagina." : rec.invitedAt ? "Invito mandato, non ancora entrato." : "Non ha ancora accesso."}
          {!rec.userId && !other && (
            <div style={{ marginTop: 8 }}>
              <button type="button" style={btn} disabled={busy || !rec.email} onClick={() => run(() => invite(rec.id))}><Send size={14} /> {rec.invitedAt ? "Manda di nuovo l'invito" : "Invita in HOC Pro"}</button>
              <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4 }}>Con il solo ruolo Referente: vede soltanto «Porta un amico».</div>
            </div>
          )}
          {other && (
            <div style={{ marginTop: 8, color: CP.textPrimary, lineHeight: 1.5 }}>
              Nel CRM questa persona ha già un account HOC Pro con <b style={{ fontWeight: 500 }}>{other}</b>. Con l&apos;email scritta qui la sua pagina non la troverebbe, e l&apos;invito le creerebbe un secondo account.
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button type="button" style={btnPrimary} disabled={busy} onClick={useOther}>Usa {other}</button>
                <button type="button" style={btn} disabled={busy} onClick={() => run(() => invite(rec.id, true))}>Invita comunque</button>
              </div>
            </div>
          )}
          {inviteMsg && <div style={{ marginTop: 8, color: CP.textPrimary, wordBreak: "break-all" }}>{inviteMsg}</div>}
        </div>
      )}
      <Actions busy={busy} error={err}
        saveLabel={rec?.id ? "Salva" : "Salva senza invitare"}
        saveStyle={rec?.id ? null : btn}
        onSave={() => run(async () => {
          const before = rec?.instagram || null;
          const saved = await save();
          // profilo Instagram nuovo o cambiato: si controlla subito e il modulo resta aperto sul risultato
          if (saved.instagram && saved.instagram !== before) {
            try { const j = await post({ action: "checkInstagram", id: saved.id }); setRec({ ...saved, ig: j.result }); } catch (e) { setErr(e.message); }
            onDone(false);
            return;
          }
          onDone(true);
        })}
        extra={!rec?.id ? (
          <button type="button" style={{ ...btnPrimary, opacity: f.email.trim() ? 1 : 0.45, cursor: f.email.trim() ? "pointer" : "not-allowed" }} disabled={busy || !f.email.trim()} title={f.email.trim() ? "" : "Serve l'email per l'invito"}
            onClick={() => run(async () => { const r = await save(); onDone(false); await invite(r.id); })}><Send size={14} /> Salva e invita</button>
        ) : null}
        onDelete={rec?.id ? async () => { if (await confirmDialog({ title: "Eliminare il referente?", ok: "Elimina", danger: true })) run(async () => { await post({ action: "deleteReferrer", id: rec.id }); onDone(true); }); } : null} />
    </Modal>
  );
}

// ── Persona portata ─────────────────────────────────────────────────────────
// Etichetta di una scheda CRM nella tendina: nome e fase (con un pezzo d'id se due si chiamano uguale)
function crmLabels(people = []) {
  const count = {};
  for (const p of people) count[`${p.name}|${p.phase || ""}`] = (count[`${p.name}|${p.phase || ""}`] || 0) + 1;
  return people.map((p) => ({ ...p, label: [p.name, p.phase, count[`${p.name}|${p.phase || ""}`] > 1 ? p.id.slice(-4) : null].filter(Boolean).join(" · ") }));
}

function RecruitModal({ initial, data, onClose, onDone }) {
  // primo turno e uscita: nel modulo solo quelli scritti a mano (gli altri arrivano da CreatorsPro e dal CRM)
  const [f, setF] = useState({
    name: initial?.name || "", referrerId: initial?.referrerId || "", storyId: initial?.storyId || "",
    hrPersonId: initial?.hrPersonId || "",
    contactedAt: initial?.contactedAt || "", interviewAt: initial?.interviewAt || "", trainingAt: initial?.trainingAt || "",
    interviewPassed: initial?.interviewPassed == null ? "" : String(initial.interviewPassed),
    trainingPassed: initial?.trainingPassed == null ? "" : String(initial.trainingPassed),
    firstShiftAt: initial?.firstShiftSource === "cp" ? "" : initial?.firstShiftAt || "",
    exitedAt: initial?.exitSource === "crm" ? "" : initial?.exitedAt || "",
    note: initial?.note || "", shiftsManual: initial?.shiftsManual ?? "",
    bs1: initial?.blockSalesManual?.[0] ?? "", bs2: initial?.blockSalesManual?.[1] ?? "",
  });
  const people = useMemo(() => crmLabels(data.crmPeople || []), [data.crmPeople]);
  const takenCrm = useMemo(() => new Set(data.recruits.filter((r) => r.id !== initial?.id && r.hrPersonId).map((r) => r.hrPersonId)), [data.recruits, initial?.id]);
  const [crmText, setCrmText] = useState(() => people.find((p) => p.id === initial?.hrPersonId)?.label || "");
  const person = people.find((p) => p.id === f.hrPersonId) || null;
  const match = !f.hrPersonId && initial?.id ? data.crmMatches?.[initial.id] : null;
  const pickCrm = (text) => {
    setCrmText(text);
    const p = people.find((x) => x.label === text);
    setF((x) => ({ ...x, hrPersonId: p?.id || "", name: x.name || p?.name || "" }));
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const stories = data.stories.filter((s) => s.referrerId === f.referrerId);
  const saved = initial?.id ? data.recruits.find((r) => r.id === initial.id) : null;
  const tri = (v) => (v === "" ? null : v === "true");
  const payload = { ...f, blockSalesManual: [f.bs1, f.bs2], interviewPassed: tri(f.interviewPassed), trainingPassed: tri(f.trainingPassed) };
  return (
    <Modal open onClose={onClose} title={initial?.id ? initial.name : "Nuova persona portata"} maxWidth={620}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", columnGap: 14 }}>
        <Field label="Nome e cognome"><input style={inp} value={f.name} onChange={set("name")} /></Field>
        <Field label="Chi l'ha portata">
          <select style={inp} value={f.referrerId} onChange={set("referrerId")}>
            <option value="">Scegli…</option>
            {data.referrers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Arrivata da una storia?">
          <select style={inp} value={f.storyId} onChange={set("storyId")} disabled={!stories.length}>
            <option value="">{stories.length ? "No / non so" : "Nessuna storia di questo referente"}</option>
            {stories.map((s) => <option key={s.id} value={s.id}>Storie {s.agreedAt ? `concordate il ${fmtDay(s.agreedAt)}` : `proposte il ${fmtDay(s.sentAt)}`}</option>)}
          </select>
        </Field>
        <Field label="Scheda nel CRM" hint="Da qui arrivano chi è su Infloww e CreatorsPro, turni, venduto e uscita.">
          <input style={inp} list="ref-crm" value={crmText} onChange={(e) => pickCrm(e.target.value)} placeholder="Cerca per nome" />
          <datalist id="ref-crm">{people.filter((p) => !takenCrm.has(p.id)).map((p) => <option key={p.id} value={p.label} />)}</datalist>
        </Field>
        <Field label="Ha scritto a Claudia il" hint={`La prova vale per chi scrive entro il ${fmtDay(data.rules?.campaignUntil)}. Vuoto = giorno in cui la inserisci.`}>
          <input style={inp} type="date" value={f.contactedAt} onChange={set("contactedAt")} />
        </Field>
        <Field label="Colloquio"><input style={inp} type="date" value={f.interviewAt} onChange={set("interviewAt")} /></Field>
        <Field label="Esito del colloquio" hint={f.interviewPassed === "false" ? "Il percorso si chiude qui: i premi su questa persona non maturano." : null}>
          <select style={inp} value={f.interviewPassed} onChange={set("interviewPassed")}>
            <option value="">Non ancora</option><option value="true">Passato</option><option value="false">Non passato</option>
          </select>
        </Field>
        <Field label="Formazione"><input style={inp} type="date" value={f.trainingAt} onChange={set("trainingAt")} disabled={f.interviewPassed === "false"} /></Field>
        <Field label="Formazione superata?">
          <select style={inp} value={f.trainingPassed} onChange={set("trainingPassed")} disabled={f.interviewPassed === "false"}>
            <option value="">Non ancora</option><option value="true">Sì</option><option value="false">No</option>
          </select>
        </Field>
        <Field label="Primo turno in chat" hint={saved?.firstShiftSource === "cp" && !f.firstShiftAt
          ? `Letto da CreatorsPro: ${fmtDay(saved.firstShiftAt)}. Scrivilo solo per correggere.`
          : "Si legge da solo da CreatorsPro: il primo turno dopo la formazione superata. Scrivilo solo per correggere."}>
          <input style={inp} type="date" value={f.firstShiftAt} onChange={set("firstShiftAt")} disabled={f.trainingPassed !== "true"} />
        </Field>
        <Field label="Uscita" hint={saved?.exitSource === "crm" && !f.exitedAt
          ? `Dal CRM: scheda in «Uscita» dal ${fmtDay(saved.exitedAt)}.`
          : "Arriva dal CRM quando la scheda passa a «Uscita». Scrivila solo se serve."}>
          <input style={inp} type="date" value={f.exitedAt} onChange={set("exitedAt")} />
        </Field>
        <Field label="Turni fatti (a mano)" hint={saved ? `Da CreatorsPro: ${saved.milestones.find((m) => m.kind === "shifts")?.shiftsDone ?? "non letti"}. Lascia vuoto per il conteggio automatico.` : "Lascia vuoto: si contano da soli da CreatorsPro."}>
          <input style={inp} inputMode="numeric" value={f.shiftsManual} onChange={set("shiftsManual")} placeholder="automatico" />
        </Field>
        {String(f.shiftsManual).trim() !== "" && <>
          <Field label="Venduto turni 1-25 ($, a mano)" hint="Senza le date dei turni non si può ripartire il venduto Infloww: scrivilo tu.">
            <input style={inp} inputMode="decimal" value={f.bs1} onChange={set("bs1")} />
          </Field>
          <Field label="Venduto turni 26-50 ($, a mano)"><input style={inp} inputMode="decimal" value={f.bs2} onChange={set("bs2")} /></Field>
        </>}
      </div>
      <div className="vt-glass" style={{ ...box, padding: "10px 12px", marginTop: 14, fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>
        {person ? (person.operator
          ? <>Su Infloww è <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{person.operator}</b>: turni da CreatorsPro e venduto da Infloww arrivano da soli. <Link href={`/admin/hr/${person.id}`} style={{ color: CP.accentSoftText }}>Apri la scheda</Link></>
          : <>La scheda di {person.name} non è ancora collegata a Infloww: turni e venduto non si leggono. <Link href={`/admin/hr/${person.id}`} style={{ color: CP.accentSoftText }}>Collegala dalla scheda</Link> (riquadro «Su Infloww e CreatorsPro»).</>)
          : match ? <>Nel CRM c&apos;è la scheda di <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{match.name}</b>: è questa persona? <button type="button" style={{ ...btnQuiet, padding: 0, color: CP.accentSoftText }} onClick={() => pickCrm(people.find((p) => p.id === match.id)?.label || "")}>Sì, collega</button></>
          : f.interviewPassed === "false" ? <>Non presa al colloquio: la scheda nel CRM non serve.</>
          : f.trainingPassed === "true" ? <span style={{ color: CP.attn }}>Formazione superata: manda il modulo del CRM e collega la scheda appena c&apos;è. Senza, turni e venduto non si leggono.</span>
          : <>La scheda nel CRM arriva dopo la formazione, quando mandi il modulo. Quando c&apos;è, la colleghi da qui o dall&apos;avviso in cima alla pagina.</>}
      </div>
      <Field label="Note (le vede solo l'HR)"><textarea style={{ ...inp, minHeight: 56 }} value={f.note} onChange={set("note")} /></Field>

      {saved && (
        <div style={{ marginTop: 16 }}>
          <SectionTitle aside="i pagamenti si segnano da «Da pagare»">Premi</SectionTitle>
          <Steps steps={saved.steps.steps} next={saved.steps.next} />
          {saved.milestones.map((m) => (
            <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1 }}><MilestoneRow m={m} /></div>
              {m.status === "pagato" && <button type="button" style={btnQuiet} disabled={busy} onClick={async () => { if (await confirmDialog({ title: "Togliere il pagamento?", message: "L'importo tornerà a essere ricalcolato.", ok: "Togli", danger: true })) run(async () => { await post({ action: "unmarkPaid", key: m.key }); onDone(false); }); }}>Annulla</button>}
            </div>
          ))}
        </div>
      )}
      <Actions busy={busy} error={err}
        onSave={() => run(async () => { await post({ action: "saveRecruit", id: initial?.id, data: payload }); onDone(true); })}
        onDelete={initial?.id ? async () => { if (await confirmDialog({ title: "Eliminare questa persona dal programma?", ok: "Elimina", danger: true })) run(async () => { await post({ action: "deleteRecruit", id: initial.id }); onDone(true); }); } : null} />
    </Modal>
  );
}

// ── La scheda del CRM è arrivata (07/11/2026) ─────────────────────────────────
// La scheda nasce dopo la formazione, quando l'Area Partner manda il modulo: se nel
// CRM c'è UNA scheda con il nome di una persona portata non ancora collegata, si
// collega da qui con un clic (ognuna ricontrollata dal server).
function CrmArrivedNotice({ data, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const rows = data.recruits.filter((r) => !r.hrPersonId && data.crmMatches?.[r.id] && !(r.steps.closedWhy && !r.metrics?.started));
  if (!rows.length) return null;
  const link = async () => {
    setBusy(true); setErr(null);
    try {
      const j = await post({ action: "linkCrm", items: rows.map((r) => ({ recruitId: r.id, hrPersonId: data.crmMatches[r.id].id })) });
      if (j.result?.skipped?.length) setErr(j.result.skipped.map((s) => s.error).join(" · "));
      onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const names = rows.slice(0, 3).map((r) => { const m = data.crmMatches[r.id]; return `${r.name} (scheda ${m.name}${m.phase ? ` · ${m.phase}` : ""})`; }).join(", ") + (rows.length > 3 ? ` e altre ${rows.length - 3}` : "");
  return (
    <Notice>
      {rows.length === 1 ? "1 persona portata ha" : `${rows.length} persone portate hanno`} la scheda nel CRM: {names}. Collegala per leggere turni, venduto e uscita.{" "}
      <button type="button" style={{ ...btnQuiet, padding: 0, color: CP.accentSoftText, fontSize: "inherit" }} disabled={busy} onClick={link}>{busy ? "Collego…" : "Collega →"}</button>
      {err && <span style={{ color: CP.accentRed }}> {err}</span>}
    </Notice>
  );
}

// ── Storie ──────────────────────────────────────────────────────────────────
function storyCell(it) {
  if (!it || (!it.publishedAt && !it.pubShot)) return <span style={{ color: CP.textMuted }}>—</span>;
  if (it.verified === null) return <span style={{ color: CP.attn }}>da controllare</span>;
  if (it.verified === false) return <span style={{ color: CP.textMuted }}>non valida</span>;
  return <span>{fmtDay(it.publishedAt)}{it.views != null ? <span style={{ color: CP.textMuted }}> · {it.views.toLocaleString("it-IT")}</span> : null}</span>;
}

function StoryModal({ initial, data, onClose, onDone }) {
  const today = new Date().toISOString().slice(0, 10);
  const r = data.rules;
  // rec = la scheda come sta sul server (screen e letture AI arrivano da lì, salvati subito)
  const [rec, setRec] = useState(initial || null);
  const [f, setF] = useState({
    referrerId: initial?.referrerId || "", sentAt: initial?.sentAt || (initial?.id ? "" : today), chosen: initial?.chosen || "",
    agreedAt: initial?.agreedAt || "", note: initial?.note || "",
  });
  const toForm = (items = []) => Array.from({ length: r.storiesRequired }, (_, i) => {
    const it = items.find((x) => x.n === i + 1) || {};
    return { n: i + 1, proposal: it.proposal || "", publishedAt: it.publishedAt || "", views: it.views != null ? String(it.views) : "", verified: it.verified ?? null };
  });
  const [items, setItems] = useState(() => toForm(initial?.items));
  const [busy, setBusy] = useState(false);
  const [upBusy, setUpBusy] = useState(null);
  const [err, setErr] = useState(null);
  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setItem = (n, k, v) => setItems((list) => list.map((it) => {
    if (it.n !== n) return it;
    const next = { ...it, [k]: v };
    // una data scritta dall'Area Partner è già verificata (gli screen del referente si confermano a parte)
    if (k === "publishedAt") next.verified = v ? (srvItem(n)?.by === "referente" && it.verified !== true ? it.verified : true) : null;
    return next;
  }));
  const srvItem = (n) => { const it = rec?.items?.find((x) => x.n === n); return it ? { ...it, by: it.pubShot?.by || null } : null; };
  const followers = data.referrers.find((x) => x.id === f.referrerId)?.ig;
  const payload = () => ({ referrerId: f.referrerId, sentAt: f.sentAt, chosen: f.chosen, agreedAt: f.agreedAt, note: f.note, items });
  const upload = (n, kind) => async (file) => {
    setUpBusy(`${n}${kind}`); setErr(null);
    try {
      const img = await shrinkImage(file);
      const j = await post({ action: "attachShot", id: rec.id, n, kind, ...img });
      const story = j.result.story;
      setRec(story);
      // aggiorna solo la riga caricata: le modifiche non salvate alle altre restano
      const fresh = toForm(story.items).find((x) => x.n === n);
      setItems((list) => list.map((it) => (it.n === n ? { ...it, publishedAt: fresh.publishedAt, verified: fresh.verified, views: it.views || fresh.views } : it)));
      onDone(false);
    } catch (e) { setErr(e.message); } finally { setUpBusy(null); }
  };
  const verify = (n, ok) => run(async () => {
    const j = await post({ action: "verifyStory", id: rec.id, n, ok });
    setRec(j.result); setItems((list) => list.map((it) => (it.n === n ? { ...it, verified: ok } : it))); onDone(false);
  });
  return (
    <Modal open onClose={onClose} title={rec?.id ? "Storie Instagram" : "Nuove storie Instagram"}>
      <div style={{ fontSize: 13, color: CP.textSecondary }}>{fmtEur(r.storyEur)} quando le {r.storiesRequired} storie sono pubblicate e confermate entro {r.storyWindowDays} giorni dall&apos;ok. Un passaggio alla volta: ogni storia ha la sua riga.</div>
      <Field label="Chi le pubblica">
        <select style={inp} value={f.referrerId} onChange={set("referrerId")}>
          <option value="">Scegli…</option>
          {data.referrers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="1 · Proposte inviate il"><input style={inp} type="date" value={f.sentAt} onChange={set("sentAt")} /></Field>
        <Field label="2 · Storie scelte" hint="es. «1 e 2»"><input style={inp} value={f.chosen} onChange={set("chosen")} placeholder="—" /></Field>
        <Field label="3 · Ok dato il" hint="da qui i 30 giorni"><input style={inp} type="date" value={f.agreedAt} onChange={set("agreedAt")} /></Field>
      </div>
      {items.map((it) => {
        const srv = srvItem(it.n) || {};
        const pending = it.verified === null && (it.publishedAt || srv.pubShot);
        const reach = followers?.exists && followers.followers && it.views ? Math.round((Number(String(it.views).replace(/\D/g, "")) / followers.followers) * 1000) / 10 : null;
        const ai = srv.ai;
        return (
          <div key={it.n} style={{ border: `1px solid ${CP.border}`, borderRadius: 10, padding: "12px 14px", marginTop: 12, opacity: f.agreedAt ? 1 : 0.55 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
              <b style={{ fontSize: 14, fontWeight: 500 }}>Storia {it.n}</b>
              <span style={{ fontSize: 12, color: it.verified === true ? CP.accentGreen : pending ? CP.attn : CP.textMuted }}>
                {it.verified === true ? "confermata" : it.verified === false ? "screen non valido" : pending ? `caricata dal referente${srv.pubShot?.at ? ` il ${fmtDay(new Date(srv.pubShot.at).toISOString().slice(0, 10))}` : ""}: da controllare` : f.agreedAt ? "non ancora pubblicata" : "dopo l'ok"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1.4fr", gap: 12 }}>
              <Field label="Proposta"><input style={inp} value={it.proposal} onChange={(e) => setItem(it.n, "proposal", e.target.value)} placeholder="es. 2" disabled={!f.agreedAt} /></Field>
              <Field label="4 · Pubblicata il"><input style={inp} type="date" value={it.publishedAt} onChange={(e) => setItem(it.n, "publishedAt", e.target.value)} disabled={!f.agreedAt} /></Field>
              <Field label="5 · Visualizzazioni" hint={reach != null ? `${String(reach).replace(".", ",")}% dei suoi follower` : "dallo screen dopo 24 ore"}>
                <input style={inp} inputMode="numeric" value={it.views} onChange={(e) => setItem(it.n, "views", e.target.value)} disabled={!it.publishedAt} placeholder="—" />
              </Field>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
              {rec?.id ? (
                <>
                  {srv.pubShot && <a href={shotUrl(rec.id, it.n, "pub", srv.pubShot.at)} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: CP.accentSoftText }}>Vedi lo screen della storia</a>}
                  <ShotButton label={srv.pubShot ? "Cambia screen" : "Carica lo screen della storia"} disabled={!f.agreedAt || !rec.agreedAt} busy={upBusy === `${it.n}pub`} onFile={upload(it.n, "pub")} />
                  {srv.viewsShot && <a href={shotUrl(rec.id, it.n, "views", srv.viewsShot.at)} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: CP.accentSoftText }}>Vedi lo screen dopo 24 ore</a>}
                  <ShotButton label={srv.viewsShot ? "Cambia screen 24 ore" : "Carica lo screen dopo 24 ore"} disabled={!it.publishedAt && !srv.pubShot} busy={upBusy === `${it.n}views`} onFile={upload(it.n, "views")} />
                </>
              ) : <span style={{ fontSize: 12, color: CP.textMuted }}>Salva per caricare gli screen.</span>}
            </div>
            {ai && (
              <div style={{ fontSize: 12, color: CP.textSecondary, marginTop: 6 }}>
                {ai.ok
                  ? <>Letto dall&apos;AI: {[ai.views != null && `${ai.views.toLocaleString("it-IT")} visualizzazioni`, ai.accountsReached != null && `${ai.accountsReached.toLocaleString("it-IT")} account raggiunti`, ai.replies != null && `${ai.replies} risposte`, ai.linkClicks != null && `${ai.linkClicks} clic sul link`, ai.profileVisits != null && `${ai.profileVisits} visite al profilo`].filter(Boolean).join(" · ") || "nessun numero leggibile"}{ai.note ? ` — ${ai.note}` : ""}</>
                  : <>{ai.error}</>}
              </div>
            )}
            {pending && rec?.id && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" style={btnPrimary} disabled={busy || !it.publishedAt} onClick={() => verify(it.n, true)}>Confermo la storia</button>
                <button type="button" style={btn} disabled={busy} onClick={() => verify(it.n, false)}>Lo screen non va bene</button>
              </div>
            )}
            {it.verified === false && rec?.id && <button type="button" style={{ ...btn, marginTop: 8 }} disabled={busy || !it.publishedAt} onClick={() => verify(it.n, true)}>Confermo comunque</button>}
          </div>
        );
      })}
      <Field label="Note"><textarea style={{ ...inp, minHeight: 50 }} value={f.note} onChange={set("note")} /></Field>
      <Actions busy={busy} error={err}
        onSave={() => run(async () => { const j = await post({ action: "saveStory", id: rec?.id, data: payload() }); if (!rec?.id) { setRec(j.result); onDone(false); } else onDone(true); })}
        onDelete={rec?.id ? async () => { if (await confirmDialog({ title: "Eliminare queste storie?", ok: "Elimina", danger: true })) run(async () => { await post({ action: "deleteStory", id: rec.id }); onDone(true); }); } : null} />
    </Modal>
  );
}

// ── Cambio dollaro→euro del mese (lo inserisce l'HR) ────────────────────────
function FxPanel({ data, onDone }) {
  const months = [...new Set([...data.fxMonths, ...Object.keys(data.fx)])].sort().reverse();
  const [vals, setVals] = useState(() => Object.fromEntries(months.map((m) => [m, data.fx[m] != null ? String(data.fx[m]).replace(".", ",") : ""])));
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const save = async (m) => {
    setBusy(m); setMsg(null);
    try { await post({ action: "setFx", month: m, rate: vals[m] ?? "" }); onDone(); setMsg({ ok: true, text: `Cambio di ${monthLabel(m)} salvato.` }); }
    catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(null); }
  };
  return (
    <section className="vt-glass" style={{ ...box, padding: "14px 18px" }}>
      <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 8 }}>
        Le percentuali sul venduto maturano in dollari. Scrivi quanti euro vale 1 dollaro nel mese (es. 0,86): finché manca, la provvigione di quel mese resta in dollari e non si può segnare pagata.
      </div>
      {months.length === 0 && <div style={{ fontSize: 14, color: CP.textMuted }}>Nessun mese con provvigioni, per ora.</div>}
      {months.map((m) => (
        <div key={m} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
          <span style={{ flex: 1, fontSize: 14 }}>{monthLabel(m)}{data.fx[m] == null && <span style={{ color: CP.attn }}> · manca</span>}</span>
          <span style={{ fontSize: 13, color: CP.textMuted }}>1 $ =</span>
          <input style={{ ...inp, width: 90 }} inputMode="decimal" value={vals[m] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [m]: e.target.value }))} placeholder="0,86" />
          <span style={{ fontSize: 13, color: CP.textMuted }}>€</span>
          <button type="button" style={btn} disabled={busy === m} onClick={() => save(m)}>{busy === m ? "…" : "Salva"}</button>
        </div>
      ))}
      {msg && <div style={{ fontSize: 13, marginTop: 8, color: msg.ok ? CP.textSecondary : CP.accentRed }}>{msg.text}</div>}
    </section>
  );
}

// ── Panoramica: dove sta andando il programma ───────────────────────────────
const fmtUsdShort = (v) => (v == null ? "—" : "$" + Math.round(v).toLocaleString("it-IT", { useGrouping: "always" }));
const fmtPctIt = (v) => (v == null ? "—" : `${String(v).replace(".", ",")}%`);

function Bar({ value, max, label }) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <div title={label} style={{ flex: "1 1 120px", minWidth: 80, height: 14, background: CP.surfaceAlt, borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${w}%`, height: "100%", background: CP.accent, borderRadius: "0 4px 4px 0" }} />
    </div>
  );
}

function Overview({ d, rules, onOpenReferrer, vetro }) {
  const top = d.funnel[0].n;
  const e = d.economics;
  const maxTrend = Math.max(1, ...d.trend.map((x) => x.referred));
  const firstTurns = d.funnel.find((f) => f.key === "first_shift").n;
  const at25 = d.funnel.find((f) => f.key === "s25").n;
  if (top === 0 && d.storyStats.proposed === 0) {
    return <Notice>Il programma non ha ancora dati. Quando l&apos;HR registra le prime persone portate e le prime storie, qui si vede dove sta andando: chi porta persone che restano, quanto rendono le storie, quanto costa rispetto a quello che porta.</Notice>;
  }
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {vetro ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <KpiCard i={0} icon={UserPlus} tone={0} label="Persone portate" value={<VetroNum value={String(top)} />} sub={`${d.storyStats.recruitsFromStories} arrivate da una storia`} />
          <KpiCard i={1} icon={Users} tone={1} label="Arrivate al primo turno" value={<VetroNum value={String(firstTurns)} />} sub={top ? `${fmtPctIt(d.funnel[3].pct)} delle segnalate` : null} />
          <KpiCard i={2} icon={Repeat} tone={3} label={`Arrivate a ${rules.pctBlock} turni`} value={<VetroNum value={String(at25)} />} sub={top ? `${fmtPctIt(d.funnel[4].pct)} delle segnalate: le persone che restano` : null} />
          <KpiCard i={3} icon={Coins} tone={4} label="Costo per persona a 25 turni" value={e.costPer25 != null ? <VetroNum value={fmtEur(e.costPer25)} /> : "—"} sub="premi maturati e pagati ÷ persone a 25 turni" />
        </div>
      ) : (
      <section className="vt-glass" style={{ ...box, padding: "16px 18px", display: "flex", gap: 28, flexWrap: "wrap" }}>
        <Metric label="Persone portate" value={String(top)} />
        <Metric label="Arrivate al primo turno" value={String(firstTurns)} note={top ? `${fmtPctIt(d.funnel[3].pct)} delle segnalate` : null} />
        <Metric label="Arrivate a 25 turni" value={String(at25)} note={top ? `${fmtPctIt(d.funnel[4].pct)} delle segnalate` : null} />
        <Metric label="Costo per persona a 25 turni" value={e.costPer25 != null ? fmtEur(e.costPer25) : "—"} note="premi maturati e pagati ÷ persone a 25 turni" />
      </section>
      )}

      <section className="vt-glass" style={{ ...box, padding: "16px 18px" }}>
        <SectionTitle aside="quante persone arrivano a ogni tappa">Dalla segnalazione ai 75 turni</SectionTitle>
        {d.funnel.map((f, i) => (
          <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "5px 0" }}>
            <span style={{ width: 130, flexShrink: 0, fontSize: 13, color: CP.textSecondary }}>{f.label}</span>
            <Bar value={f.n} max={top} label={`${f.label}: ${f.n} su ${top}`} />
            <span style={{ width: 84, flexShrink: 0, textAlign: "right", fontSize: 13, whiteSpace: "nowrap", ...NUM }}>
              <b style={{ fontWeight: 500, color: CP.textPrimary }}>{f.n}</b>
              {i > 0 && <span style={{ color: CP.textMuted }}> · {fmtPctIt(f.pct)}</span>}
            </span>
          </div>
        ))}
        <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 6 }}>Le persone entrate da poco non hanno ancora avuto il tempo di arrivare alle tappe dopo: l&apos;imbuto si legge meglio sui mesi passati.</div>
      </section>

      <section className="vt-glass" style={{ ...box, padding: "16px 18px" }}>
        <SectionTitle aside={`ordinati per persone arrivate a ${rules.pctBlock} turni, poi per venduto a turno`}>Reference di qualità</SectionTitle>
        <div style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
          Una reference vale quando la persona resta e vende. <b style={{ fontWeight: 500 }}>Tenuta</b> = quante delle persone «decise» (arrivate a {rules.pctBlock} turni o uscite prima) sono arrivate a {rules.pctBlock} turni; sotto {d.minDecided} persone decise non si giudica.
          {" "}<b style={{ fontWeight: 500 }}>Venduto a turno</b> = nei primi {rules.pctBlock} turni, confrontato con la media del programma{d.avgRate != null ? ` (${fmtUsdShort(d.avgRate)})` : ""}; conta solo chi ha almeno {d.minShiftsRate} turni.
        </div>
        <DataTable
          empty="Nessun referente con persone portate."
          rows={d.quality.map((q) => ({ ...q, id: q.referrerId }))}
          onRowClick={(q) => onOpenReferrer(q.referrerId)}
          columns={[
            { key: "name", label: "Referente" },
            { key: "referred", label: "Portate", align: "right" },
            { key: "reached25", label: `A ${rules.pctBlock} turni`, align: "right" },
            { key: "tenurePct", label: "Tenuta", align: "right", render: (q) => q.fewData ? <span style={{ color: CP.textMuted }}>pochi dati ({q.decided})</span> : fmtPctIt(q.tenurePct), sort: (q) => q.tenurePct ?? -1 },
            { key: "perShift", label: "Venduto a turno", align: "right", render: (q) => q.perShift == null ? "—" : <span>{fmtUsdShort(q.perShift)}{q.vsAvg != null && <span style={{ color: CP.textMuted }}> · {q.vsAvg >= 1 ? "+" : "−"}{Math.abs(Math.round((q.vsAvg - 1) * 100))}% sulla media</span>}</span>, sort: (q) => q.perShift ?? -1 },
            { key: "salesTotal", label: "Venduto totale", align: "right", render: (q) => fmtUsdShort(q.salesTotal) },
          ]}
        />
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <section className="vt-glass" style={{ ...box, padding: "16px 18px" }}>
          <SectionTitle>Storie Instagram</SectionTitle>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 12 }}>
            <Metric label="Pubblicate" value={`${d.storyStats.published} su ${d.storyStats.agreed}`} note={d.storyStats.publishers === 1 ? "da 1 persona" : `da ${d.storyStats.publishers} persone diverse`} />
            <Metric label="Scadute" value={String(d.storyStats.expired)} note={`${d.storyStats.open} ancora aperte`} />
            <Metric label="In attesa dell'ok" value={String(d.storyStats.pending)} note="proposte inviate" />
            <Metric label="Visualizzazioni" value={d.storyStats.views != null ? d.storyStats.views.toLocaleString("it-IT") : "—"} note={d.storyStats.reachAvg != null ? `in media il ${String(d.storyStats.reachAvg).replace(".", ",")}% dei follower` : d.storyStats.viewsReported ? `dopo 24 ore, da ${d.storyStats.viewsReported} ${d.storyStats.viewsReported === 1 ? "persona" : "persone"}` : "nessuna ancora segnata"} />
            <Metric label="Persone arrivate da una storia" value={String(d.storyStats.recruitsFromStories)} note={d.storyStats.recruitsPerStory != null ? `${String(d.storyStats.recruitsPerStory).replace(".", ",")} per storia pubblicata` : null} />
          </div>
          {vetro && d.storyStats.agreed > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Donut size={130} items={[
                { label: "Pubblicate in tempo", value: d.storyStats.published, color: "var(--vt-c0)" },
                { label: "Ancora aperte", value: d.storyStats.open, color: "var(--vt-c2)" },
                { label: "Scadute", value: d.storyStats.expired, color: "var(--vt-cx)" },
              ].filter((x) => x.value > 0)} center={String(d.storyStats.agreed)} centerSub="storie" format={(v) => String(v)} />
            </div>
          )}
          {d.storyStats.byReferrer.length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 4 }}>Chi ha pubblicato</div>
              {d.storyStats.byReferrer.map((x) => (
                <div key={x.referrerId} style={{ display: "flex", gap: 10, padding: "6px 0", borderTop: `1px solid ${CP.borderSoft}`, fontSize: 13 }}>
                  <span style={{ flex: 1 }}>{x.name}</span>
                  <span style={{ color: CP.textSecondary, ...NUM }}>{x.agreed === 1 ? (x.published ? "storie pubblicate" : "storie non pubblicate") : `${x.published} volte su ${x.agreed}`}</span>
                  <span style={{ width: 110, textAlign: "right", ...NUM }}>{x.recruits} {x.recruits === 1 ? "persona" : "persone"}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 10, lineHeight: 1.5 }}>
            Tenuta a {rules.pctBlock} turni: arrivate da una storia {d.channel.withStory.pct != null ? fmtPctIt(d.channel.withStory.pct) : `pochi dati (${d.channel.withStory.decided})`}, senza storia {d.channel.withoutStory.pct != null ? fmtPctIt(d.channel.withoutStory.pct) : `pochi dati (${d.channel.withoutStory.decided})`}.
          </div>
        </section>

        <section className="vt-glass" style={{ ...box, padding: "16px 18px" }}>
          <SectionTitle>Quanto costa e quanto porta</SectionTitle>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Metric label="Premi maturati e pagati" value={fmtEur(e.costEur)} note={`${fmtEur(e.paidEur)} già pagati`} />
            <Metric label="Venduto delle persone portate" value={fmtUsdShort(e.salesUsd)} note="da Infloww, dal primo turno" />
            <Metric label="Utile stimato per l'agenzia" value={e.marginEur != null ? fmtEur(e.marginEur) : "—"} note={e.marginEur != null ? `22,7% del venduto al cambio medio ${String(e.fxAvg).replace(".", ",")}` : "serve almeno un cambio del mese"} />
          </div>
          {vetro && e.marginEur > 0 && (
            <div style={{ marginTop: 14 }}>
              <Donut size={130} items={[
                { label: "Utile che resta all'agenzia", value: Math.max(0, Math.round(e.marginEur - e.costEur)), color: "var(--vt-c0)" },
                { label: "Costo del programma", value: Math.round(e.costEur), color: "var(--vt-c2)" },
              ]} center={fmtPctIt(e.costOnMarginPct)} centerSub="costo" format={(v) => fmtEur(v)} />
            </div>
          )}
          {e.costOnMarginPct != null && (
            <div style={{ fontSize: 14, color: CP.textPrimary, marginTop: 12 }}>
              Il programma costa il <b style={{ fontWeight: 500 }}>{fmtPctIt(e.costOnMarginPct)}</b> dell&apos;utile che le persone portate hanno generato finora.
            </div>
          )}
          <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8, lineHeight: 1.5 }}>
            Stima: 22,7% è il margine netto medio dell&apos;agenzia sul venduto (file Finance, novembre 2025 → giugno 2026). È un tetto: parte di quelle vendite l&apos;avrebbe fatta comunque un altro operatore.
          </div>
        </section>
      </div>

      {d.trend.length > 0 && (
        <section className="vt-glass" style={{ ...box, padding: "16px 18px" }}>
          <SectionTitle aside="persone segnalate nel mese · primi turni nel mese">Andamento</SectionTitle>
          {d.trend.map((x) => (
            <div key={x.month} style={{ display: "flex", alignItems: "center", gap: "4px 12px", padding: "5px 0", flexWrap: "wrap" }}>
              <span style={{ width: 120, fontSize: 13, color: CP.textSecondary }}>{monthLabel(x.month)}</span>
              <Bar value={x.referred} max={maxTrend} label={`${monthLabel(x.month)}: ${x.referred} segnalate, ${x.started} primi turni`} />
              <span style={{ marginLeft: "auto", textAlign: "right", fontSize: 13, whiteSpace: "nowrap", ...NUM }}>
                <b style={{ fontWeight: 500 }}>{x.referred}</b> {x.referred === 1 ? "segnalata" : "segnalate"}<span style={{ color: CP.textMuted }}> · {x.started} {x.started === 1 ? "primo turno" : "primi turni"}</span>
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ── Buste del mese (27/10/2026) ─────────────────────────────────────────────
// Ogni missione completata finisce nella busta del mese del suo referente:
// l'HR la paga in un bonifico, la stampa o la scarica per la contabilità.
function downloadCsv(name, text) {
  // BOM: Excel riconosce gli accenti
  const url = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function printSlip(slip) {
  // stampa con colori fissi (la carta non segue il tema dell'app)
  const rows = slip.lines.map((l) => `<tr><td>${esc(l.label)}${l.recruitName ? ` · ${esc(l.recruitName)}` : ""}</td><td>${l.unlockedAt ? esc(fmtDay(l.unlockedAt)) : "—"}</td><td class="r">${l.amountEur != null ? esc(fmtEur(l.amountEur)) : esc(fmtUsd(l.amountUsd)) + " (manca il cambio)"}</td><td>${l.status === "pagato" ? "pagato il " + esc(fmtDay(l.paidAt)) : "da pagare"}</td></tr>`).join("");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Premi ${esc(slip.name)} ${esc(slip.month)}</title><style>body{font:14px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#111;margin:40px}h1{font-size:20px;margin:0}p{color:#555;margin:4px 0 20px}table{width:100%;border-collapse:collapse}td,th{padding:8px 6px;border-bottom:1px solid #ddd;text-align:left}th{font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.05em}.r{text-align:right}tfoot td{font-weight:600;border-bottom:0}</style></head><body><h1>Porta un amico · premi di ${esc(monthLabel(slip.month))}</h1><p>${esc(slip.name)} · House of Creators</p><table><thead><tr><th>Premio</th><th>Sbloccato</th><th class="r">Importo</th><th>Stato</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">Totale</td><td class="r">${esc(fmtEur(slip.totalEur))}</td><td>${slip.dueEur > 0 ? esc(fmtEur(slip.dueEur)) + " da pagare" : "tutto pagato"}</td></tr></tfoot></table></body></html>`);
  w.document.close(); w.focus(); w.print();
}

function Payslips({ data, onDone }) {
  const months = [...new Set(data.payslips.map((b) => b.month))];
  const [month, setMonth] = useState(months[0] || null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const slips = data.payslips.filter((b) => b.month === month);
  const payAll = async (slip) => {
    const ready = slip.lines.filter((l) => l.status !== "pagato" && l.amountEur != null);
    if (!ready.length || !(await confirmDialog(`Segnare pagati ${ready.length} premi a ${slip.name} per ${fmtEur(ready.reduce((a, l) => a + l.amountEur, 0))}? Gli importi si congelano.`))) return;
    setBusy(slip.referrerId); setErr(null);
    for (const l of ready) { try { await post({ action: "markPaid", key: l.key }); } catch (e) { setErr(`${l.label}: ${e.message}`); break; } }
    setBusy(null); onDone();
  };
  if (!months.length) return <Notice>Ancora nessun premio: quando un referente completa una missione, il premio entra nei premi del mese.</Notice>;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {months.map((m) => <FilterChip key={m} active={m === month} onClick={() => setMonth(m)} label={monthLabel(m)} />)}
        <span style={{ flex: 1 }} />
        <button type="button" style={btn} onClick={() => downloadCsv(`porta-un-amico-premi-${month}.csv`, payslipsCsv(slips))}>Scarica il mese (CSV)</button>
      </div>
      <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 10 }}>Ogni premio entra nel mese in cui si è sbloccato. Un riepilogo = un bonifico al referente.</div>
      {err && <Notice danger>{err}</Notice>}
      {slips.map((b) => (
        <PayslipCard key={b.referrerId} slip={b} actions={<>
          {b.dueEur > 0 && <button type="button" style={btnPrimary} disabled={busy != null} onClick={() => payAll(b)}>{busy === b.referrerId ? "…" : "Segna pagato tutto"}</button>}
          <button type="button" style={btn} onClick={() => printSlip(b)}>Stampa</button>
          <button type="button" style={btn} onClick={() => downloadCsv(`premi-${b.name.replace(/\s+/g, "-").toLowerCase()}-${b.month}.csv`, payslipsCsv([b]))}>CSV</button>
        </>} />
      ))}
    </div>
  );
}

// ── Pagina ──────────────────────────────────────────────────────────────────
const TABS = [
  ["overview", "Panoramica"], ["topay", "Da pagare"], ["slips", "Premi del mese"], ["recruits", "Persone portate"], ["referrers", "Referenti"], ["stories", "Storie"], ["fx", "Cambio"], ["crm", "Dal CRM"], ["log", "Registro"],
];

export default function ReferralAdminPage() {
  const { data, error, isLoading, mutate } = useSWR(API, fetcher, { revalidateOnFocus: false });
  const [vetro, setVetro] = useVetro();
  const [tab, setTab] = useState("overview");
  const [modal, setModal] = useState(null); // { kind, initial }
  const [busyKey, setBusyKey] = useState(null);
  const [payErr, setPayErr] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const refName = useMemo(() => Object.fromEntries((data?.referrers || []).map((r) => [r.id, r.name])), [data]);
  const done = (close) => { mutate(); if (close) setModal(null); };
  const ok = data && !data.error;

  const totals = useMemo(() => {
    if (!ok) return null;
    const toPay = data.toPay.reduce((a, m) => a + (m.amountEur || 0), 0);
    const toPayUsd = data.toPay.reduce((a, m) => a + (m.amountEur == null ? m.amountUsd || 0 : 0), 0);
    const paid = data.referrers.reduce((a, r) => a + r.totals.pagato, 0);
    const running = data.referrers.reduce((a, r) => a + r.totals.in_corso, 0);
    return { toPay: Math.round(toPay * 100) / 100, toPayUsd: Math.round(toPayUsd * 100) / 100, paid, running };
  }, [data, ok]);

  const pay = async (key) => {
    setBusyKey(key); setPayErr(null);
    try { await post({ action: "markPaid", key }); mutate(); } catch (e) { setPayErr(e.message); } finally { setBusyKey(null); }
  };

  const guessReferrer = (s) => data.referrers.find((r) => s.referredBy && r.name.toLowerCase().includes(s.referredBy.trim().toLowerCase()));
  const addFromCrm = async (s) => {
    let ref = guessReferrer(s);
    // chi ha segnalato non è ancora referente: lo si crea con il nome scritto nel modulo
    if (!ref && s.referredBy && (await confirmDialog(`«${s.referredBy}» non è ancora tra i referenti. Lo aggiungo?`))) {
      try { const j = await post({ action: "saveReferrer", data: { name: s.referredBy } }); ref = j.result; await mutate(); }
      catch (e) { alertDialog(e.message); return; }
    }
    setModal({ kind: "recruit", initial: { name: s.name, hrPersonId: s.hrPersonId, referrerId: ref?.id || "" } });
  };

  return (
    <VetroScope on={vetro}>
    <div style={{ ...pageWrap, maxWidth: 1600, "--ref-r": vetro ? "22px" : "10px" }}>
      <PageHead
        crumbs={[{ label: "People" }, { label: "Porta un amico" }]}
        title="Porta un amico"
        subtitle="Chi ha portato chi, a che punto è ogni persona e cosa va pagato. I turni arrivano da CreatorsPro, il venduto da Infloww (ripartito sui turni)."
        actions={<>
          <VetroSwitch on={vetro} set={setVetro} />
          <TutorialVideoButton id="porta-un-collega" />
          {ok && <><button type="button" style={btn} onClick={() => setModal({ kind: "referrer" })}><Plus size={14} /> Referente</button>
          <button type="button" style={btn} onClick={() => setModal({ kind: "story" })}><Plus size={14} /> Storie</button>
          <button type="button" style={btnPrimary} onClick={() => setModal({ kind: "recruit" })}><Plus size={14} /> Persona portata</button></>}
        </>}
      />

      {isLoading && <div className="vt-glass" style={{ ...box, padding: 16, color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {(error || data?.error) && <Notice danger>{data?.error || "Non riesco a caricare i dati."}</Notice>}

      {ok && (
        <>
          {vetro ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 14 }}>
              <button type="button" onClick={() => setTab("topay")} aria-label="Da pagare adesso: apri la scheda" style={{ display: "grid", background: "none", border: 0, padding: 0, margin: 0, textAlign: "left", font: "inherit", color: "inherit", borderRadius: 22, cursor: "pointer", minWidth: 0 }}>
                <KpiCard i={0} icon={Wallet} tone={0} label="Da pagare adesso" value={<VetroNum value={fmtEur(totals.toPay)} />} sub={`${data.toPay.length} premi sbloccati${totals.toPayUsd > 0 ? ` · in più ${fmtUsd(totals.toPayUsd)} aspettano il cambio` : ""}`} />
              </button>
              <KpiCard i={1} icon={Hourglass} tone={1} label="In maturazione questo mese" value={<VetroNum value={fmtEur(totals.running)} />} sub="stima, cresce con le vendite" />
              <KpiCard i={2} icon={CircleCheck} tone={3} label="Già pagati" value={<VetroNum value={fmtEur(totals.paid)} />} sub="importi congelati al pagamento" />
              <KpiCard i={3} icon={Gift} tone={4} label="Referenti" value={<VetroNum value={String(data.referrers.length)} />} sub={(() => { const k = data.referrers.filter((r) => r.userId).length; return k === 1 ? "1 vede la sua pagina" : `${k} vedono la loro pagina`; })()} />
            </div>
          ) : (
          <HeroMetric label="Da pagare adesso" value={fmtEur(totals.toPay)} compare={`${data.toPay.length} premi sbloccati e non ancora pagati`} hint={totals.toPayUsd > 0 ? `In più $${totals.toPayUsd} di percentuali che aspettano il cambio del mese (tab «Cambio»)` : null}>
            <Metric label="In maturazione questo mese" value={fmtEur(totals.running)} note="stima, cresce con le vendite" />
            <Metric label="Già pagati" value={fmtEur(totals.paid)} />
            <Metric label="Referenti" value={String(data.referrers.length)} note={(() => { const k = data.referrers.filter((r) => r.userId).length; return k === 1 ? "1 vede la sua pagina" : `${k} vedono la loro pagina`; })()} />
          </HeroMetric>
          )}

          <CrmArrivedNotice data={data} onDone={() => mutate()} />

          <Tabs value={tab} onChange={setTab}
            items={TABS.map(([k, l]) => [k, l, k === "topay" ? data.toPay.length : k === "crm" ? data.suggestions.length : k === "fx" ? (data.fxMonths.filter((m) => data.fx[m] == null).length ? `${data.fxMonths.filter((m) => data.fx[m] == null).length} da inserire` : null) : null])} />

          {tab === "overview" && (
            <Overview vetro={vetro} d={data.dashboard} rules={data.rules} onOpenReferrer={(id) => { const r = data.referrers.find((x) => x.id === id); if (r) setModal({ kind: "referrer", initial: r }); }} />
          )}

          {tab === "topay" && (
            <>
              {payErr && <Notice danger>{payErr}</Notice>}
              {data.toPay.length > 0 && (
                <section className="vt-glass" style={{ ...box, padding: "10px 16px", marginBottom: 12 }}>
                  <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 4 }}>Per referente: un bonifico a testa</div>
                  {Object.entries(data.toPay.reduce((acc, m) => { (acc[m.referrerId] ||= []).push(m); return acc; }, {})).map(([rid, items]) => {
                    const ready = items.filter((m) => m.amountEur != null);
                    const tot = Math.round(ready.reduce((a, m) => a + m.amountEur, 0) * 100) / 100;
                    const waiting = items.length - ready.length;
                    return (
                      <div key={rid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0", borderTop: `1px solid ${CP.borderSoft}`, flexWrap: "wrap" }}>
                        <span style={{ flex: 1, fontSize: 14 }}>{refName[rid] || "—"}<span style={{ color: CP.textMuted, fontSize: 12 }}> · {items.length} {items.length === 1 ? "premio" : "premi"}{waiting ? `, ${waiting} in attesa del cambio` : ""}</span></span>
                        <span style={{ fontSize: 14, fontWeight: 500, ...NUM }}>{fmtEur(tot)}</span>
                        <button type="button" style={btn} disabled={!ready.length || busyKey != null} onClick={async () => {
                          if (!(await confirmDialog(`Segnare pagati ${ready.length} premi a ${refName[rid]} per ${fmtEur(tot)}? Gli importi si congelano.`))) return;
                          setPayErr(null);
                          for (const m of ready) {
                            setBusyKey(m.key);
                            try { await post({ action: "markPaid", key: m.key }); } catch (e) { setPayErr(`${m.label}: ${e.message}`); break; }
                          }
                          setBusyKey(null); mutate();
                        }}>Segna pagato tutto</button>
                      </div>
                    );
                  })}
                </section>
              )}
              <DataTable
                empty="Niente da pagare: quando un premio si sblocca compare qui."
                rows={data.toPay.map((m) => ({ ...m, id: m.key }))}
                defaultSort={{ key: "unlockedAt", dir: 1 }}
                columns={[
                  { key: "ref", label: "Referente", render: (m) => refName[m.referrerId] || "—", sort: (m) => refName[m.referrerId] || "" },
                  { key: "what", label: "Premio", render: (m) => <span>{m.label}{m.recruitName && <span style={{ color: CP.textMuted }}> · {m.recruitName}</span>}</span>, sort: (m) => m.label },
                  { key: "unlockedAt", label: "Sbloccato", render: (m) => fmtDay(m.unlockedAt), sort: (m) => m.unlockedAt || "" },
                  { key: "amountEur", label: "Importo", align: "right", render: (m) => m.amountEur == null
                    ? <span>{fmtUsd(m.amountUsd)}<span style={{ color: CP.attn, fontSize: 12 }}> · manca il cambio</span></span>
                    : <span>{fmtEur(m.amountEur)}{m.amountUsd != null && <span style={{ color: CP.textMuted, fontSize: 12 }}> · {fmtUsd(m.amountUsd)}</span>}</span> },
                  { key: "pay", label: "", sortable: false, align: "right", render: (m) => (
                    <button type="button" style={btn} disabled={busyKey === m.key} onClick={async (e) => { e.stopPropagation(); if (await confirmDialog(`Segnare pagato ${fmtEur(m.amountEur)} a ${refName[m.referrerId]}? L'importo si congela.`)) pay(m.key); }}>
                      {busyKey === m.key ? "…" : "Segna pagato"}
                    </button>
                  ) },
                ]}
              />
            </>
          )}

          {tab === "slips" && <Payslips data={data} onDone={() => mutate()} />}

          {tab === "recruits" && (
            <DataTable
              empty="Nessuna persona portata. Aggiungila con «Persona portata» o dal tab «Dal CRM»."
              rows={data.recruits}
              onRowClick={(r) => setModal({ kind: "recruit", initial: r })}
              defaultSort={{ key: "createdAt", dir: -1 }}
              columns={[
                { key: "name", label: "Persona", render: (r) => <span>{r.name}{r.exitedAt && <span style={{ color: CP.textMuted }}> · uscita</span>}{r.outOfCampaign && <span style={{ color: CP.attn }} title={`Primo contatto il ${fmtDay(r.contactDay)}: dopo la fine della prova`}> · fuori dalla prova</span>}</span> },
                { key: "ref", label: "Portata da", muted: true, render: (r) => refName[r.referrerId] || "—", sort: (r) => refName[r.referrerId] || "" },
                { key: "next", label: "A che punto è", sort: (r) => r.steps.next || "", render: (r) => {
                  const st = r.steps.steps.find((s) => s.key === r.steps.next);
                  return st ? <span>Prossimo: {st.label}</span> : <span style={{ color: CP.textMuted }}>{r.steps.closedWhy || "Percorso finito"}</span>;
                } },
                { key: "infloww", label: "Collegamento", muted: true, sort: (r) => r.inflowwName || (r.hrPersonId ? "~" : "~~"), render: (r) => r.inflowwName
                  ? r.inflowwName
                  : r.hrPersonId ? <span style={{ color: CP.attn }}>scheda senza Infloww</span>
                  : data.crmMatches?.[r.id] ? <span style={{ color: CP.attn }}>scheda da collegare</span>
                  : r.steps.closedWhy && !r.metrics?.started ? "—"
                  : r.trainingPassed === true ? <span style={{ color: CP.attn }}>manca la scheda CRM</span>
                  : "scheda dopo la formazione" },
                { key: "earned", label: "Maturato", align: "right", render: (r) => fmtEur(r.totals.guadagnato), sort: (r) => r.totals.guadagnato },
                { key: "running", label: "In corso", align: "right", render: (r) => fmtEur(r.totals.in_corso), sort: (r) => r.totals.in_corso },
                { key: "createdAt", label: "Segnalata", align: "right", render: (r) => r.createdAt ? new Date(r.createdAt).toLocaleDateString("it-IT") : "—", sort: (r) => r.createdAt || 0 },
              ]}
            />
          )}

          {tab === "referrers" && (
            <DataTable
              empty="Nessun referente. Aggiungilo con «Referente»."
              rows={data.referrers}
              onRowClick={(r) => setModal({ kind: "referrer", initial: r })}
              defaultSort={{ key: "earned", dir: -1 }}
              columns={[
                { key: "name", label: "Referente" },
                { key: "access", label: "Accesso", muted: true, render: (r) => r.userId ? "Vede la sua pagina" : r.invitedAt ? "Invitato" : r.email ? "Non ancora" : "Manca l'email", sort: (r) => (r.userId ? 2 : r.invitedAt ? 1 : 0) },
                { key: "ig", label: "Instagram", muted: true, render: (r) => (!r.instagram ? "—" : r.ig?.exists && r.ig.handle === r.instagram ? `@${r.instagram} · ${r.ig.followers != null ? r.ig.followers.toLocaleString("it-IT") : "?"}` : r.ig && !r.ig.exists && r.ig.handle === r.instagram ? `@${r.instagram} · non trovato` : `@${r.instagram}`), sort: (r) => r.ig?.followers ?? -1 },
                { key: "recruitCount", label: "Persone", align: "right" },
                { key: "storyCount", label: "Storie", align: "right" },
                { key: "earned", label: "Maturato", align: "right", render: (r) => fmtEur(r.totals.guadagnato), sort: (r) => r.totals.guadagnato },
                { key: "paid", label: "Pagato", align: "right", render: (r) => fmtEur(r.totals.pagato), sort: (r) => r.totals.pagato },
              ]}
            />
          )}

          {tab === "stories" && (
            <DataTable
              empty="Nessuna storia registrata."
              rows={data.stories}
              onRowClick={(s) => setModal({ kind: "story", initial: s })}
              defaultSort={{ key: "stage", dir: 1 }}
              columns={[
                { key: "ref", label: "Referente", render: (s) => refName[s.referrerId] || "—", sort: (s) => refName[s.referrerId] || "" },
                { key: "stage", label: "A che punto", render: (s) => <span style={{ color: s.stage?.late ? CP.attn : CP.textPrimary }}>{s.stage?.label || "—"}</span>, sort: (s) => s.stage?.step ?? 0 },
                { key: "s1", label: "Storia 1", render: (s) => storyCell(s.items?.[0]), sort: (s) => s.items?.[0]?.publishedAt || "" },
                { key: "s2", label: "Storia 2", render: (s) => storyCell(s.items?.[1]), sort: (s) => s.items?.[1]?.publishedAt || "" },
                { key: "views", label: "Visualizzazioni", align: "right", render: (s) => (s.views != null ? s.views.toLocaleString("it-IT") : "—"), sort: (s) => s.views ?? -1 },
                { key: "reach", label: "Dei follower", align: "right", render: (s) => (s.reach != null ? `${String(s.reach).replace(".", ",")}%` : "—"), sort: (s) => s.reach ?? -1 },
                { key: "due", label: "Entro il", render: (s) => fmtDay(s.milestone.dueBy) || "—", sort: (s) => s.milestone.dueBy || "" },
                { key: "status", label: "Premio", align: "right", render: (s) => <StatusPill status={s.milestone.status} />, sort: (s) => s.milestone.status },
              ]}
            />
          )}

          {tab === "fx" && <FxPanel key={JSON.stringify(data.fx) + data.fxMonths.join()} data={data} onDone={() => mutate()} />}

          {tab === "crm" && (
            <section className="vt-glass" style={{ ...box, padding: "14px 18px" }}>
              <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 8 }}>
                Persone del CRM che nel modulo hanno scelto «Me l&apos;ha consigliato qualcuno» e non sono ancora nel programma. Chi le ha segnalate l&apos;hanno scritto loro: controlla prima di collegare.
              </div>
              {data.suggestions.length === 0 && <div style={{ fontSize: 14, color: CP.textMuted }}>Nessuna.</div>}
              {data.suggestions.map((s) => (
                <div key={s.hrPersonId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: CP.textMuted }}>Segnalata da: {s.referredBy || "non scritto"}{s.referredBy && (guessReferrer(s) ? " · già referente" : " · non ancora referente")}{s.phase && ` · ${s.phase}`}</div>
                  </div>
                  <button type="button" style={btn} onClick={() => addFromCrm(s)}><Plus size={14} /> Aggiungi</button>
                </div>
              ))}
            </section>
          )}

          {tab === "log" && (
            <section className="vt-glass" style={{ ...box, padding: "10px 18px" }}>
              {data.audit.length === 0 && <div style={{ fontSize: 14, color: CP.textMuted, padding: "6px 0" }}>Ancora nessuna azione.</div>}
              {data.audit.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "7px 0", borderTop: i ? `1px solid ${CP.borderSoft}` : "none", fontSize: 13 }}>
                  <span style={{ color: CP.textMuted, minWidth: 128, ...NUM }}>{new Date(a.at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  <span style={{ flex: 1 }}>{a.actorName || "—"} · {a.action}{a.name ? ` · ${a.name}` : ""}{a.amountEur != null ? ` · ${fmtEur(a.amountEur)}` : ""}</span>
                </div>
              ))}
            </section>
          )}

          <div style={{ marginTop: 18 }}>
            <Disclosure open={rulesOpen} onToggle={() => setRulesOpen((v) => !v)} title="Le regole del programma" summary={`versione ${data.rules.version}`}>
              <RulesList rules={data.rules} />
            </Disclosure>
          </div>

          {modal?.kind === "referrer" && <ReferrerModal initial={modal.initial} onClose={() => setModal(null)} onDone={done} />}
          {modal?.kind === "recruit" && <RecruitModal initial={modal.initial} data={data} onClose={() => setModal(null)} onDone={done} />}
          {modal?.kind === "story" && <StoryModal initial={modal.initial} data={data} onClose={() => setModal(null)} onDone={done} />}
        </>
      )}
    </div>
    </VetroScope>
  );
}
