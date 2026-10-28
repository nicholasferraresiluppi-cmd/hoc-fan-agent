"use client";

import useSWR from "swr";
import { useState } from "react";
import { CP } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, SectionTitle, Notice, Disclosure } from "@/components/ds";
import { MissionRow, PayslipCard, Steps, RulesList, fmtEur, box, pageWrap } from "@/components/referral-ui";
import { missionProgress } from "@/lib/referral-core";
import VetroScope, { useVetro, VetroSwitch, VetroNum } from "@/components/VetroScope";
import { KpiCard } from "@/components/VetroCharts";
import { Wallet, Hourglass, CircleCheck, UserPlus } from "lucide-react";

/**
 * /me/porta-un-collega — «Porta un collega» visto da chi ha portato qualcuno.
 * Quanto ha guadagnato, quanto è in arrivo, e a che punto è ogni persona.
 * Solo i propri dati: l'API trova il referente dall'account (lib/referral).
 */
const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({ error: "Risposta non valida" }));
  if (!r.ok && !j.error) j.error = "Errore di caricamento";
  return j;
};

function RecruitCard({ r }) {
  const [open, setOpen] = useState(true);
  const earned = r.totals.guadagnato;
  const coming = r.totals.in_corso;
  return (
    <section className="vt-glass" style={{ ...box, padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 17, fontWeight: 500, margin: 0, color: CP.textPrimary, flex: 1 }}>{r.name}</h3>
        <div style={{ fontSize: 13, color: CP.textSecondary }}>
          Su questa persona hai guadagnato <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmtEur(earned)}</b>
          {coming > 0 && <> · <span style={{ color: CP.accentSoftText }}>{fmtEur(coming)} in arrivo questo mese</span></>}
        </div>
      </div>
      {r.exited && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4 }}>Non lavora più in agenzia: restano i premi già sbloccati.</div>}
      <Steps steps={r.steps} next={r.next} />
      {(() => {
        // il prossimo premio a turni e quanti turni mancano: la cosa da guardare insieme alla persona
        const nxt = r.milestones.find((m) => (m.kind === "shifts" || m.kind === "commission") && (m.status === "in_attesa" || m.status === "in_corso") && m.shiftsDone != null);
        if (!nxt || r.exited) return null;
        const target = nxt.kind === "shifts" ? nxt.shifts : nxt.shiftsTo;
        const left = Math.max(0, target - nxt.shiftsDone);
        const prizes = r.milestones.filter((m) => (m.shifts === target || m.shiftsTo === target) && m.status !== "pagato" && m.status !== "maturato");
        const what = prizes.map((m) => (m.kind === "shifts" ? fmtEur(m.amountEur) : `il ${String(m.pct * 100).replace(".", ",")}% sul venduto`)).join(" + ");
        return left > 0 ? (
          <div style={{ fontSize: 13, color: CP.textSecondary, margin: "2px 0 8px" }}>
            Prossimo premio: <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{what}</b> a {target} turni — ne mancano {left}.
          </div>
        ) : null;
      })()}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ background: "none", border: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
        {open ? "Nascondi le missioni" : "Vedi le missioni"}
      </button>
      {open && (() => {
        // le tappe fatte vengono dalle stesse voci della pagina: la missione «primo turno» si misura sulle tappe
        const st = Object.fromEntries(r.steps.map((s) => [s.key, s]));
        const pseudo = { interviewAt: st.interview?.done || null, trainingPassed: st.training?.done ? true : null, firstShiftAt: st.first_shift?.done || null };
        return <div style={{ marginTop: 6 }}>{r.milestones.map((m) => <MissionRow key={m.key} m={m} progress={missionProgress(m, pseudo)} />)}</div>;
      })()}
    </section>
  );
}

export default function PortaUnCollegaPage() {
  const { data, error, isLoading } = useSWR("/api/me/referral", fetcher, { revalidateOnFocus: false });
  const [rulesOpen, setRulesOpen] = useState(false);
  const [vetro, setVetro] = useVetro();

  return (
    <VetroScope on={vetro}>
    <div style={{ ...pageWrap, maxWidth: 1200, "--ref-r": vetro ? "22px" : "10px" }}>
      <PageHead
        crumbs={[{ label: "Il mio quadro" }, { label: "Porta un collega" }]}
        title="Porta un collega"
        actions={<VetroSwitch on={vetro} set={setVetro} />}
        subtitle="Chi porti in agenzia e quanto stai guadagnando su ognuno, passo per passo: dal colloquio al primo turno, fino ai 75 turni."
      />

      {isLoading && <div className="vt-glass" style={{ ...box, padding: 16, color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {(error || data?.error) && <Notice danger>Non riesco a caricare i tuoi dati. Ricarica la pagina tra qualche minuto.</Notice>}

      {data && !data.error && !data.linked && (
        <>
          <section className="vt-glass" style={{ ...box, padding: "18px 20px", marginBottom: 14 }}>
            <SectionTitle>Come funziona</SectionTitle>
            <p style={{ fontSize: 14, color: CP.textSecondary, margin: "0 0 14px", lineHeight: 1.55 }}>
              Conosci qualcuno che sarebbe bravo in chat? Segnalalo all&apos;HR. Quando entra, qui vedrai a che punto è e quanto stai guadagnando.
              Per ora non risulta nessuna persona portata da te: se l&apos;hai già segnalata, chiedi all&apos;HR di collegarla alla tua email.
            </p>
            <RulesList rules={data.rules} />
          </section>
        </>
      )}

      {data?.linked && (
        <>
          {vetro ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 14 }}>
              <KpiCard i={0} icon={Wallet} tone={0} label="Hai guadagnato" value={<VetroNum value={fmtEur(data.totals.guadagnato)} />} sub={data.totals.senzaCambioUsd > 0 ? `in più $${data.totals.senzaCambioUsd.toLocaleString("it-IT")} di percentuali in attesa del cambio` : "pagato e da pagare"} />
              <KpiCard i={1} icon={CircleCheck} tone={3} label="Già pagati" value={<VetroNum value={fmtEur(data.totals.pagato)} />} sub={data.totals.maturato > 0 ? `${fmtEur(data.totals.maturato)} arrivano col prossimo pagamento` : "nessun premio in sospeso"} />
              <KpiCard i={2} icon={Hourglass} tone={1} label="In arrivo questo mese" value={<VetroNum value={fmtEur(data.totals.in_corso)} />} sub="cresce con le vendite" />
              <KpiCard i={3} icon={UserPlus} tone={4} label="Persone portate" value={<VetroNum value={String(data.recruits.length)} />} sub="conta chi resta, non quanti" />
            </div>
          ) : (
          <HeroMetric
            label="Hai guadagnato"
            value={fmtEur(data.totals.guadagnato)}
            compare={[
              data.totals.pagato > 0 && `${fmtEur(data.totals.pagato)} già pagati`,
              data.totals.maturato > 0 && `${fmtEur(data.totals.maturato)} da pagare`,
            ].filter(Boolean).join(" · ") || "Ancora nessun premio sbloccato"}
            hint={data.totals.senzaCambioUsd > 0
              ? `In più $${data.totals.senzaCambioUsd.toLocaleString("it-IT")} di percentuali: diventano euro quando l'HR inserisce il cambio del mese.`
              : "Da pagare = sbloccato, arriva col prossimo pagamento."}
          >
            <Metric label="In arrivo questo mese" value={fmtEur(data.totals.in_corso)} note="cresce con le vendite" />
            <Metric label="Persone portate" value={String(data.recruits.length)} />
          </HeroMetric>
          )}

          {data.recruits.length === 0 && (
            <Notice>Non hai ancora persone collegate. Quando l&apos;HR registra qualcuno che hai portato, lo trovi qui.</Notice>
          )}
          {data.recruits.map((r) => <RecruitCard key={r.id} r={r} />)}

          {data.payslips?.length > 0 && (
            <section style={{ marginBottom: 14 }}>
              <SectionTitle aside="ogni missione completata entra nei premi del mese">I tuoi premi, mese per mese</SectionTitle>
              {data.payslips.map((b) => <PayslipCard key={b.month} slip={b} showName={false} />)}
            </section>
          )}

          {data.stories.length > 0 && (
            <section className="vt-glass" style={{ ...box, padding: "14px 18px", marginBottom: 14 }}>
              <SectionTitle>Le tue storie Instagram</SectionTitle>
              {data.stories.map((s) => <MissionRow key={s.id} m={s} progress={missionProgress(s)} />)}
            </section>
          )}

          <Disclosure open={rulesOpen} onToggle={() => setRulesOpen((v) => !v)} title="Come si guadagna" summary="storie, primo turno, premi ogni 25 turni, percentuale sul venduto">
            <RulesList rules={data.rules} />
          </Disclosure>
        </>
      )}
    </div>
    </VetroScope>
  );
}
