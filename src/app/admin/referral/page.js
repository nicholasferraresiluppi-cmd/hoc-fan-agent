"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { Plus, Send } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, FilterChip, DataTable, Notice, SectionTitle, Disclosure } from "@/components/ds";
import { Modal } from "@/components/cp-style";
import { TutorialVideoButton } from "@/components/TutorialVideo";
import VetroScope, { useVetro, VetroSwitch, VetroNum } from "@/components/VetroScope";
import { Donut, KpiCard } from "@/components/VetroCharts";
import { Wallet, Hourglass, CircleCheck, Users, UserPlus, Repeat, Coins, Gift } from "lucide-react";
import { MilestoneRow, Steps, RulesList, StatusPill, PayslipCard, fmtEur, fmtUsd, fmtDay, monthLabel, box, pageWrap, NUM } from "@/components/referral-ui";
import { payslipsCsv } from "@/lib/referral-core";

/**
 * /admin/referral — «Porta un collega», lato HR (permesso referral.manage).
 * L'HR registra chi ha portato chi, segna gli step (colloquio, formazione,
 * primo turno, uscita) e i pagamenti. Il venduto arriva da solo da Infloww.
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
const btnPrimary = { ...btn, background: CP.accent, color: CP.accentInk, borderColor: CP.accent };
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

function Actions({ busy, error, onSave, onDelete, saveLabel = "Salva" }) {
  return (
    <>
      {error && <div style={{ color: CP.accentRed, fontSize: 13, marginTop: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 18, alignItems: "center" }}>
        <button type="button" style={btnPrimary} disabled={busy} onClick={onSave}>{busy ? "Salvo…" : saveLabel}</button>
        {onDelete && <button type="button" style={{ ...btnQuiet, marginLeft: "auto" }} disabled={busy} onClick={onDelete}>Elimina</button>}
      </div>
    </>
  );
}

// ── Referente ───────────────────────────────────────────────────────────────
function ReferrerModal({ initial, onClose, onDone }) {
  const [f, setF] = useState({ name: initial?.name || "", email: initial?.email || "", phone: initial?.phone || "", note: initial?.note || "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [inviteMsg, setInviteMsg] = useState(null);
  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open onClose={onClose} title={initial?.id ? initial.name : "Nuovo referente"}>
      <Field label="Nome e cognome"><input style={inp} value={f.name} onChange={set("name")} autoFocus /></Field>
      <Field label="Email" hint="Con questa email, entrando in HOC Pro, vede solo i suoi guadagni."><input style={inp} type="email" value={f.email} onChange={set("email")} /></Field>
      <Field label="Telefono"><input style={inp} value={f.phone} onChange={set("phone")} /></Field>
      <Field label="Note (le vede solo l'HR)"><textarea style={{ ...inp, minHeight: 60 }} value={f.note} onChange={set("note")} /></Field>
      {initial?.id && (
        <div className="vt-glass" style={{ ...box, padding: 12, marginTop: 14, fontSize: 13, color: CP.textSecondary }}>
          {initial.userId ? "Account collegato: vede la sua pagina." : initial.invitedAt ? "Invito mandato, non ancora entrato." : "Non ha ancora accesso."}
          {!initial.userId && (
            <div style={{ marginTop: 8 }}>
              <button type="button" style={btn} disabled={busy || !initial.email} onClick={() => run(async () => {
                const j = await post({ action: "invite", id: initial.id });
                setInviteMsg(j.exists ? "Ha già un account HOC Pro: entrando con questa email vede la pagina, nessun invito serve." : j.url ? `Invito mandato. Link da girare se la mail non arriva: ${j.url}` : "Invito mandato.");
                onDone(false);
              })}><Send size={14} /> Invita in HOC Pro</button>
              <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4 }}>Con il solo ruolo Referente: vede soltanto «Porta un collega».</div>
              {inviteMsg && <div style={{ marginTop: 8, color: CP.textPrimary, wordBreak: "break-all" }}>{inviteMsg}</div>}
            </div>
          )}
        </div>
      )}
      <Actions busy={busy} error={err}
        onSave={() => run(async () => { await post({ action: "saveReferrer", id: initial?.id, data: f }); onDone(true); })}
        onDelete={initial?.id ? () => confirm("Eliminare il referente?") && run(async () => { await post({ action: "deleteReferrer", id: initial.id }); onDone(true); }) : null} />
    </Modal>
  );
}

// ── Persona portata ─────────────────────────────────────────────────────────
function RecruitModal({ initial, data, onClose, onDone }) {
  const [f, setF] = useState({
    name: initial?.name || "", referrerId: initial?.referrerId || "", storyId: initial?.storyId || "",
    hrPersonId: initial?.hrPersonId || "", inflowwName: initial?.inflowwName || "",
    interviewAt: initial?.interviewAt || "", trainingAt: initial?.trainingAt || "",
    trainingPassed: initial?.trainingPassed == null ? "" : String(initial.trainingPassed),
    firstShiftAt: initial?.firstShiftAt || "", exitedAt: initial?.exitedAt || "",
    note: initial?.note || "", shiftsManual: initial?.shiftsManual ?? "",
    bs1: initial?.blockSalesManual?.[0] ?? "", bs2: initial?.blockSalesManual?.[1] ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const stories = data.stories.filter((s) => s.referrerId === f.referrerId);
  const saved = initial?.id ? data.recruits.find((r) => r.id === initial.id) : null;
  const payload = { ...f, blockSalesManual: [f.bs1, f.bs2], trainingPassed: f.trainingPassed === "" ? null : f.trainingPassed === "true" };
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
            {stories.map((s) => <option key={s.id} value={s.id}>Storie del {fmtDay(s.agreedAt)}</option>)}
          </select>
        </Field>
        <Field label="Nome su Infloww" hint="Serve per leggere da solo il venduto del mese.">
          <input style={inp} list="ref-infloww" value={f.inflowwName} onChange={set("inflowwName")} placeholder="Scegli dall'elenco" />
          <datalist id="ref-infloww">{data.inflowwNames.map((n) => <option key={n} value={n} />)}</datalist>
        </Field>
        <Field label="Colloquio"><input style={inp} type="date" value={f.interviewAt} onChange={set("interviewAt")} /></Field>
        <Field label="Formazione"><input style={inp} type="date" value={f.trainingAt} onChange={set("trainingAt")} /></Field>
        <Field label="Formazione superata?">
          <select style={inp} value={f.trainingPassed} onChange={set("trainingPassed")}>
            <option value="">Non ancora</option><option value="true">Sì</option><option value="false">No</option>
          </select>
        </Field>
        <Field label="Primo turno in chat" hint="Sblocca il premio del primo turno e fa partire il conteggio dei turni.">
          <input style={inp} type="date" value={f.firstShiftAt} onChange={set("firstShiftAt")} disabled={f.trainingPassed !== "true"} />
        </Field>
        <Field label="Uscita (se è andata via)"><input style={inp} type="date" value={f.exitedAt} onChange={set("exitedAt")} /></Field>
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
      <Field label="Note (le vede solo l'HR)"><textarea style={{ ...inp, minHeight: 56 }} value={f.note} onChange={set("note")} /></Field>

      {saved && (
        <div style={{ marginTop: 16 }}>
          <SectionTitle aside="i pagamenti si segnano da «Da pagare»">Premi</SectionTitle>
          <Steps steps={saved.steps.steps} next={saved.steps.next} />
          {saved.milestones.map((m) => (
            <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1 }}><MilestoneRow m={m} /></div>
              {m.status === "pagato" && <button type="button" style={btnQuiet} disabled={busy} onClick={() => confirm("Togliere il pagamento? L'importo tornerà a essere ricalcolato.") && run(async () => { await post({ action: "unmarkPaid", key: m.key }); onDone(false); })}>Annulla</button>}
            </div>
          ))}
        </div>
      )}
      <Actions busy={busy} error={err}
        onSave={() => run(async () => { await post({ action: "saveRecruit", id: initial?.id, data: payload }); onDone(true); })}
        onDelete={initial?.id ? () => confirm("Eliminare questa persona dal programma?") && run(async () => { await post({ action: "deleteRecruit", id: initial.id }); onDone(true); }) : null} />
    </Modal>
  );
}

// ── Storie ──────────────────────────────────────────────────────────────────
function StoryModal({ initial, data, onClose, onDone }) {
  const pub = initial?.publishedAt || [];
  const [f, setF] = useState({ referrerId: initial?.referrerId || "", agreedAt: initial?.agreedAt || new Date().toISOString().slice(0, 10), p1: pub[0] || "", p2: pub[1] || "", note: initial?.note || "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const r = data.rules;
  return (
    <Modal open onClose={onClose} title={initial?.id ? "Storie Instagram" : "Nuove storie Instagram"}>
      <div style={{ fontSize: 13, color: CP.textSecondary }}>{fmtEur(r.storyEur)} quando le {r.storiesRequired} storie sono pubblicate entro {r.storyWindowDays} giorni dall&apos;accordo.</div>
      <Field label="Chi le pubblica">
        <select style={inp} value={f.referrerId} onChange={set("referrerId")}>
          <option value="">Scegli…</option>
          {data.referrers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <Field label="Accordo con l'HR"><input style={inp} type="date" value={f.agreedAt} onChange={set("agreedAt")} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="1ª storia pubblicata il"><input style={inp} type="date" value={f.p1} onChange={set("p1")} /></Field>
        <Field label="2ª storia pubblicata il"><input style={inp} type="date" value={f.p2} onChange={set("p2")} /></Field>
      </div>
      <Field label="Note"><textarea style={{ ...inp, minHeight: 50 }} value={f.note} onChange={set("note")} /></Field>
      <Actions busy={busy} error={err}
        onSave={() => run(async () => { await post({ action: "saveStory", id: initial?.id, data: { referrerId: f.referrerId, agreedAt: f.agreedAt, publishedAt: [f.p1, f.p2], note: f.note } }); onDone(true); })}
        onDelete={initial?.id ? () => confirm("Eliminare queste storie?") && run(async () => { await post({ action: "deleteStory", id: initial.id }); onDone(true); }) : null} />
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
  if (top === 0 && d.storyStats.agreed === 0) {
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
  w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Premi ${esc(slip.name)} ${esc(slip.month)}</title><style>body{font:14px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#111;margin:40px}h1{font-size:20px;margin:0}p{color:#555;margin:4px 0 20px}table{width:100%;border-collapse:collapse}td,th{padding:8px 6px;border-bottom:1px solid #ddd;text-align:left}th{font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.05em}.r{text-align:right}tfoot td{font-weight:600;border-bottom:0}</style></head><body><h1>Porta un collega · premi di ${esc(monthLabel(slip.month))}</h1><p>${esc(slip.name)} · House of Creators</p><table><thead><tr><th>Premio</th><th>Sbloccato</th><th class="r">Importo</th><th>Stato</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">Totale</td><td class="r">${esc(fmtEur(slip.totalEur))}</td><td>${slip.dueEur > 0 ? esc(fmtEur(slip.dueEur)) + " da pagare" : "tutto pagato"}</td></tr></tfoot></table></body></html>`);
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
    if (!ready.length || !confirm(`Segnare pagati ${ready.length} premi a ${slip.name} per ${fmtEur(ready.reduce((a, l) => a + l.amountEur, 0))}? Gli importi si congelano.`)) return;
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
        <button type="button" style={btn} onClick={() => downloadCsv(`porta-un-collega-premi-${month}.csv`, payslipsCsv(slips))}>Scarica il mese (CSV)</button>
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
    if (!ref && s.referredBy && confirm(`«${s.referredBy}» non è ancora tra i referenti. Lo aggiungo?`)) {
      try { const j = await post({ action: "saveReferrer", data: { name: s.referredBy } }); ref = j.result; await mutate(); }
      catch (e) { alert(e.message); return; }
    }
    setModal({ kind: "recruit", initial: { name: s.name, hrPersonId: s.hrPersonId, referrerId: ref?.id || "" } });
  };

  return (
    <VetroScope on={vetro}>
    <div style={{ ...pageWrap, maxWidth: 1600, "--ref-r": vetro ? "22px" : "10px" }}>
      <PageHead
        crumbs={[{ label: "People" }, { label: "Porta un collega" }]}
        title="Porta un collega"
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

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {TABS.map(([k, l]) => (
              <FilterChip key={k} active={tab === k} onClick={() => setTab(k)}
                attn={k === "fx" && data.fxMonths.some((m) => data.fx[m] == null)}
                label={k === "topay" ? `${l} · ${data.toPay.length}` : k === "crm" ? `${l} · ${data.suggestions.length}` : k === "fx" ? `${l} · ${data.fxMonths.filter((m) => data.fx[m] == null).length} da inserire` : l} />
            ))}
          </div>

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
                          if (!confirm(`Segnare pagati ${ready.length} premi a ${refName[rid]} per ${fmtEur(tot)}? Gli importi si congelano.`)) return;
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
                    <button type="button" style={btn} disabled={busyKey === m.key} onClick={(e) => { e.stopPropagation(); if (confirm(`Segnare pagato ${fmtEur(m.amountEur)} a ${refName[m.referrerId]}? L'importo si congela.`)) pay(m.key); }}>
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
                { key: "name", label: "Persona", render: (r) => <span>{r.name}{r.exitedAt && <span style={{ color: CP.textMuted }}> · uscita</span>}</span> },
                { key: "ref", label: "Portata da", muted: true, render: (r) => refName[r.referrerId] || "—", sort: (r) => refName[r.referrerId] || "" },
                { key: "next", label: "A che punto è", sort: (r) => r.steps.next || "", render: (r) => {
                  const st = r.steps.steps.find((s) => s.key === r.steps.next);
                  return st ? <span>Prossimo: {st.label}</span> : <span style={{ color: CP.textMuted }}>{r.steps.closedWhy || "Percorso finito"}</span>;
                } },
                { key: "infloww", label: "Infloww", muted: true, render: (r) => r.inflowwName || (r.metrics?.started && !r.exitedAt ? <span style={{ color: CP.attn }}>da collegare</span> : "—"), sort: (r) => r.inflowwName || "" },
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
              defaultSort={{ key: "agreedAt", dir: -1 }}
              columns={[
                { key: "ref", label: "Referente", render: (s) => refName[s.referrerId] || "—", sort: (s) => refName[s.referrerId] || "" },
                { key: "agreedAt", label: "Accordo", render: (s) => fmtDay(s.agreedAt) },
                { key: "pub", label: "Pubblicate", render: (s) => `${s.publishedAt.length} su ${data.rules.storiesRequired}`, sort: (s) => s.publishedAt.length },
                { key: "due", label: "Entro il", render: (s) => fmtDay(s.milestone.dueBy), sort: (s) => s.milestone.dueBy },
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
