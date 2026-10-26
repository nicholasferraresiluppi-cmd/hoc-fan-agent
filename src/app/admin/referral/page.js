"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { Plus, Send } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, FilterChip, DataTable, Notice, SectionTitle, Disclosure } from "@/components/ds";
import { Modal } from "@/components/cp-style";
import { MilestoneRow, Steps, RulesList, StatusPill, fmtEur, fmtDay, monthLabel, box, pageWrap, NUM } from "@/components/referral-ui";

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
        <div style={{ ...box, padding: 12, marginTop: 14, fontSize: 13, color: CP.textSecondary }}>
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
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const stories = data.stories.filter((s) => s.referrerId === f.referrerId);
  const saved = initial?.id ? data.recruits.find((r) => r.id === initial.id) : null;
  const payload = { ...f, trainingPassed: f.trainingPassed === "" ? null : f.trainingPassed === "true" };
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
        <Field label="Primo turno in chat" hint="Sblocca il premio del primo turno e fa partire i 3 mesi.">
          <input style={inp} type="date" value={f.firstShiftAt} onChange={set("firstShiftAt")} disabled={f.trainingPassed !== "true"} />
        </Field>
        <Field label="Uscita (se è andata via)"><input style={inp} type="date" value={f.exitedAt} onChange={set("exitedAt")} /></Field>
        <Field label="Turni fatti (a mano)" hint={saved ? `Da CreatorsPro: ${saved.milestones.find((m) => m.kind === "shifts")?.shiftsDone ?? "non letti"}. Lascia vuoto per il conteggio automatico.` : "Lascia vuoto: si contano da soli da CreatorsPro."}>
          <input style={inp} inputMode="numeric" value={f.shiftsManual} onChange={set("shiftsManual")} placeholder="automatico" />
        </Field>
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
    <section style={{ ...box, padding: "14px 18px" }}>
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

// ── Pagina ──────────────────────────────────────────────────────────────────
const TABS = [
  ["topay", "Da pagare"], ["recruits", "Persone portate"], ["referrers", "Referenti"], ["stories", "Storie"], ["fx", "Cambio"], ["crm", "Dal CRM"], ["log", "Registro"],
];

export default function ReferralAdminPage() {
  const { data, error, isLoading, mutate } = useSWR(API, fetcher, { revalidateOnFocus: false });
  const [tab, setTab] = useState("topay");
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

  const addFromCrm = (s) => {
    const guess = data.referrers.find((r) => s.referredBy && r.name.toLowerCase().includes(s.referredBy.trim().toLowerCase()));
    setModal({ kind: "recruit", initial: { name: s.name, hrPersonId: s.hrPersonId, referrerId: guess?.id || "" } });
  };

  return (
    <div style={{ ...pageWrap, maxWidth: 1180 }}>
      <PageHead
        crumbs={[{ label: "People" }, { label: "Porta un collega" }]}
        title="Porta un collega"
        subtitle="Chi ha portato chi, a che punto è ogni persona e cosa va pagato. Il venduto del primo e del secondo mese arriva da Infloww, i turni da CreatorsPro."
        actions={ok && <>
          <button type="button" style={btn} onClick={() => setModal({ kind: "referrer" })}><Plus size={14} /> Referente</button>
          <button type="button" style={btn} onClick={() => setModal({ kind: "story" })}><Plus size={14} /> Storie</button>
          <button type="button" style={btnPrimary} onClick={() => setModal({ kind: "recruit" })}><Plus size={14} /> Persona portata</button>
        </>}
      />

      {isLoading && <div style={{ ...box, padding: 16, color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {(error || data?.error) && <Notice danger>{data?.error || "Non riesco a caricare i dati."}</Notice>}

      {ok && (
        <>
          <HeroMetric label="Da pagare adesso" value={fmtEur(totals.toPay)} compare={`${data.toPay.length} premi sbloccati e non ancora pagati`} hint={totals.toPayUsd > 0 ? `In più $${totals.toPayUsd} di percentuali che aspettano il cambio del mese (tab «Cambio»)` : null}>
            <Metric label="In maturazione questo mese" value={fmtEur(totals.running)} note="stima, cresce con le vendite" />
            <Metric label="Già pagati" value={fmtEur(totals.paid)} />
            <Metric label="Persone portate" value={String(data.recruits.length)} note={`${data.referrers.length} referenti`} />
          </HeroMetric>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {TABS.map(([k, l]) => (
              <FilterChip key={k} active={tab === k} onClick={() => setTab(k)}
                attn={k === "fx" && data.fxMonths.some((m) => data.fx[m] == null)}
                label={k === "topay" ? `${l} · ${data.toPay.length}` : k === "crm" ? `${l} · ${data.suggestions.length}` : k === "fx" ? `${l} · ${data.fxMonths.filter((m) => data.fx[m] == null).length} da inserire` : l} />
            ))}
          </div>

          {tab === "topay" && (
            <>
              {payErr && <Notice danger>{payErr}</Notice>}
              <DataTable
                empty="Niente da pagare: quando un premio si sblocca compare qui."
                rows={data.toPay.map((m) => ({ ...m, id: m.key }))}
                defaultSort={{ key: "unlockedAt", dir: 1 }}
                columns={[
                  { key: "ref", label: "Referente", render: (m) => refName[m.referrerId] || "—", sort: (m) => refName[m.referrerId] || "" },
                  { key: "what", label: "Premio", render: (m) => <span>{m.label}{m.recruitName && <span style={{ color: CP.textMuted }}> · {m.recruitName}</span>}</span>, sort: (m) => m.label },
                  { key: "unlockedAt", label: "Sbloccato", render: (m) => fmtDay(m.unlockedAt), sort: (m) => m.unlockedAt || "" },
                  { key: "amountEur", label: "Importo", align: "right", render: (m) => m.amountEur == null
                    ? <span>${m.amountUsd}<span style={{ color: CP.attn, fontSize: 12 }}> · manca il cambio</span></span>
                    : <span>{fmtEur(m.amountEur)}{m.amountUsd != null && <span style={{ color: CP.textMuted, fontSize: 12 }}> · ${m.amountUsd}</span>}</span> },
                  { key: "pay", label: "", sortable: false, align: "right", render: (m) => (
                    <button type="button" style={btn} disabled={busyKey === m.key} onClick={(e) => { e.stopPropagation(); if (confirm(`Segnare pagato ${fmtEur(m.amountEur)} a ${refName[m.referrerId]}? L'importo si congela.`)) pay(m.key); }}>
                      {busyKey === m.key ? "…" : "Segna pagato"}
                    </button>
                  ) },
                ]}
              />
            </>
          )}

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
                  return st ? <span>Prossimo: {st.label}</span> : <span style={{ color: CP.textMuted }}>{r.exitedAt ? "Uscita" : "Percorso finito"}</span>;
                } },
                { key: "infloww", label: "Infloww", muted: true, render: (r) => r.inflowwName || <span style={{ color: CP.attn }}>da collegare</span>, sort: (r) => r.inflowwName || "" },
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
            <section style={{ ...box, padding: "14px 18px" }}>
              <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 8 }}>
                Persone del CRM che nel modulo hanno scelto «Me l&apos;ha consigliato qualcuno» e non sono ancora nel programma. Chi le ha segnalate l&apos;hanno scritto loro: controlla prima di collegare.
              </div>
              {data.suggestions.length === 0 && <div style={{ fontSize: 14, color: CP.textMuted }}>Nessuna.</div>}
              {data.suggestions.map((s) => (
                <div key={s.hrPersonId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: CP.textMuted }}>Segnalata da: {s.referredBy || "non scritto"}{s.phase && ` · ${s.phase}`}</div>
                  </div>
                  <button type="button" style={btn} onClick={() => addFromCrm(s)}><Plus size={14} /> Aggiungi</button>
                </div>
              ))}
            </section>
          )}

          {tab === "log" && (
            <section style={{ ...box, padding: "10px 18px" }}>
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
  );
}
