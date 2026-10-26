"use client";

import useSWR from "swr";
import { useState } from "react";
import { CP } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, SectionTitle, Notice, Disclosure } from "@/components/ds";
import { MilestoneRow, Steps, RulesList, StatusPill, fmtEur, fmtDay, box, pageWrap } from "@/components/referral-ui";

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
  const [open, setOpen] = useState(false);
  const earned = r.totals.guadagnato;
  const coming = r.totals.in_corso;
  return (
    <section style={{ ...box, padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 17, fontWeight: 500, margin: 0, color: CP.textPrimary, flex: 1 }}>{r.name}</h3>
        <div style={{ fontSize: 13, color: CP.textSecondary }}>
          Su questa persona hai guadagnato <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{fmtEur(earned)}</b>
          {coming > 0 && <> · <span style={{ color: CP.accentSoftText }}>{fmtEur(coming)} in arrivo questo mese</span></>}
        </div>
      </div>
      {r.exited && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4 }}>Non lavora più in agenzia: restano i premi già sbloccati.</div>}
      <Steps steps={r.steps} next={r.next} />
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ background: "none", border: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: 13, font: "inherit" }}>
        {open ? "Nascondi i premi" : "Vedi i premi uno per uno"}
      </button>
      {open && <div style={{ marginTop: 6 }}>{r.milestones.map((m) => <MilestoneRow key={m.key} m={m} />)}</div>}
    </section>
  );
}

export default function PortaUnCollegaPage() {
  const { data, error, isLoading } = useSWR("/api/me/referral", fetcher, { revalidateOnFocus: false });
  const [rulesOpen, setRulesOpen] = useState(false);

  return (
    <div style={pageWrap}>
      <PageHead
        crumbs={[{ label: "Il mio quadro" }, { label: "Porta un collega" }]}
        title="Porta un collega"
        subtitle="Chi porti in agenzia e quanto stai guadagnando su ognuno, passo per passo: dal colloquio al primo turno, fino al terzo mese."
      />

      {isLoading && <div style={{ ...box, padding: 16, color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {(error || data?.error) && <Notice danger>Non riesco a caricare i tuoi dati. Ricarica la pagina tra qualche minuto.</Notice>}

      {data && !data.error && !data.linked && (
        <>
          <section style={{ ...box, padding: "18px 20px", marginBottom: 14 }}>
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
          <HeroMetric
            label="Hai guadagnato"
            value={fmtEur(data.totals.guadagnato)}
            compare={[
              data.totals.pagato > 0 && `${fmtEur(data.totals.pagato)} già pagati`,
              data.totals.maturato > 0 && `${fmtEur(data.totals.maturato)} da pagare`,
            ].filter(Boolean).join(" · ") || "Ancora nessun premio sbloccato"}
            hint="Da pagare = sbloccato, arriva col prossimo pagamento."
          >
            <Metric label="In arrivo questo mese" value={fmtEur(data.totals.in_corso)} note="cresce con le vendite" />
            <Metric label="Persone portate" value={String(data.recruits.length)} />
          </HeroMetric>

          {data.recruits.length === 0 && (
            <Notice>Non hai ancora persone collegate. Quando l&apos;HR registra qualcuno che hai portato, lo trovi qui.</Notice>
          )}
          {data.recruits.map((r) => <RecruitCard key={r.id} r={r} />)}

          {data.stories.length > 0 && (
            <section style={{ ...box, padding: "14px 18px", marginBottom: 14 }}>
              <SectionTitle>Le tue storie Instagram</SectionTitle>
              {data.stories.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
                  <div style={{ flex: 1, fontSize: 14, color: CP.textPrimary }}>
                    {s.published} su {data.rules.storiesRequired} pubblicate
                    <div style={{ fontSize: 12, color: CP.textMuted }}>{s.status === "pagato" ? `pagato il ${fmtDay(s.paidAt)}` : s.why || (s.unlockedAt ? `sbloccato il ${fmtDay(s.unlockedAt)}` : "")}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{fmtEur(s.amountEur)}</div>
                  <StatusPill status={s.status} />
                </div>
              ))}
            </section>
          )}

          <Disclosure open={rulesOpen} onToggle={() => setRulesOpen((v) => !v)} title="Come si guadagna" summary="storie, primo turno, tre mesi, percentuale sul venduto">
            <RulesList rules={data.rules} />
          </Disclosure>
        </>
      )}
    </div>
  );
}
