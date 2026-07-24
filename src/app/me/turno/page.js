"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { Copy, Check, Clock, Snowflake, HelpCircle, Compass } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";

/**
 * /me/turno — "Il mio turno" (pilota copilot, gate copilot.pilot).
 * Scheda-fan per l'operatore in turno: chi seguire ora, dov'era rimasto
 * (ultima etichetta analisi), e la MOSSA suggerita. Suggerimenti, mai copioni:
 * decide e scrive sempre l'operatore. Niente di questa pagina entra negli score.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());
const hhmm = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
const usd = (v) => "$" + Number(v || 0).toLocaleString("it-IT", { maximumFractionDigits: 0 });
const OBIEZIONE_LABEL = { prezzo: "prezzo", interesse: "interesse", tempo: "tempo", fiducia: "fiducia", nessuna: null };

function StateChip({ row }) {
  const waiting = row.state === "waiting";
  const Icon = waiting ? Clock : Snowflake;
  const color = waiting ? CP.accentAmber || "#d9a44a" : CP.accent;
  const label = waiting
    ? `In attesa ${row.hrs_since_fan != null ? `${row.hrs_since_fan}h` : ""}`
    : `Si raffredda ${row.hrs_since_active != null ? `${Math.round(row.hrs_since_active / 24)}g` : ""}`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color, whiteSpace: "nowrap" }}>
      <Icon size={12} /> {label}
    </span>
  );
}

function FanCard({ row, copied, onCopy }) {
  const l = row.label;
  return (
    <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => onCopy(row.username)}
          title="Copia @username (incollalo nella ricerca Infloww)"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, padding: "4px 10px", color: CP.textPrimary, fontFamily: FONTS.mono, fontSize: 13, cursor: "pointer" }}
        >
          @{row.username} {copied === row.username ? <Check size={13} color={CP.accentGreen} /> : <Copy size={13} color={CP.textMuted} />}
        </button>
        <span style={{ fontFamily: FONTS.mono, fontSize: 13.5, color: CP.textPrimary }}>{usd(row.ltv_usd)}</span>
        <span style={{ fontSize: 12, color: CP.textMuted }}>{row.txns} acquisti · {row.msgs_30d} msg/30g</span>
        <StateChip row={row} />
        {l && OBIEZIONE_LABEL[l.obiezione] ? (
          <span style={{ fontSize: 11.5, color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 6, padding: "2px 8px" }}>
            obiezione: {OBIEZIONE_LABEL[l.obiezione]}
          </span>
        ) : null}
      </div>
      {l?.sintesi ? (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: CP.textMuted, lineHeight: 1.45 }}>
          Ultima conversazione ({l.day}): {l.sintesi}
        </p>
      ) : null}
      <div style={{ marginTop: 10, borderTop: `1px solid ${CP.borderSoft || CP.border}`, paddingTop: 10 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: CP.textPrimary, fontWeight: 600 }}>→ {row.play.mossa}</p>
        {row.play.angolo ? <p style={{ margin: "5px 0 0", fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.5 }}>{row.play.angolo}</p> : null}
        {row.play.offerta ? (
          <p style={{ margin: "7px 0 0", fontSize: 12.5, color: CP.accentSoftText, fontFamily: FONTS.mono, display: "inline-block", background: CP.accentSoft, border: `1px solid ${CP.accent}44`, borderRadius: 7, padding: "3px 9px" }}>{row.play.offerta}</p>
        ) : null}
        {row.play.freno ? (
          <p style={{ margin: "7px 0 0", fontSize: 12, color: CP.accentRed, background: "rgba(240,140,140,.09)", border: `1px solid ${CP.accentRed}33`, borderRadius: 7, padding: "5px 9px", fontWeight: 500 }}>Freno · {row.play.freno}</p>
        ) : null}
        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: CP.textMuted }}>perché: {row.play.perche}</p>
      </div>
    </div>
  );
}

export default function MyShiftPage() {
  const [demoCreator, setDemoCreator] = useState("");
  const [adminCreators, setAdminCreators] = useState(null);
  const url = "/api/me/turno" + (demoCreator ? `?creator_id=${demoCreator}` : "");
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, refreshInterval: 5 * 60000 });
  const [copied, setCopied] = useState(null);
  const onCopy = useCallback((username) => {
    try {
      navigator.clipboard.writeText(username).catch(() => {});
      setCopied(username);
      setTimeout(() => setCopied((c) => (c === username ? null : c)), 1400);
    } catch {}
  }, []);

  useEffect(() => {
    if (data?.admin_creators) setAdminCreators(data.admin_creators);
  }, [data?.admin_creators]);
  const creatorsForSelect = data?.admin_creators || adminCreators;
  const groups = data?.groups || [];
  const denied = data?.error && !data?.groups;

  return (
    <div style={{ padding: "32px 24px 64px", maxWidth: 880, margin: "0 auto" }}>
      <PageHeader
        section="Il mio quadro"
        title="Il mio turno"
        subtitle="Chi seguire ora sui tuoi account in turno, dov'era rimasta la conversazione e la mossa suggerita. Suggerimenti, non copioni: decidi tu e scrivi tu. Niente di questa pagina entra negli score."
      />

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}

      {denied && (
        <CpCard>
          <div style={{ textAlign: "center", padding: "30px 16px" }}>
            <HelpCircle size={30} color={CP.mutedIcons} />
            <p style={{ color: CP.textSecondary, fontSize: 14.5, margin: "12px 0 6px" }}>{data.error}</p>
          </div>
        </CpCard>
      )}
      {error && !data && (
        <CpCard><p style={{ color: CP.accentRed, fontSize: 13.5, margin: 0 }}>Errore di rete: riprova.</p></CpCard>
      )}

      {data && !denied && !data.linked && data.mode !== "demo" && (
        <CpCard>
          <div style={{ textAlign: "center", padding: "30px 16px" }}>
            <HelpCircle size={30} color={CP.mutedIcons} />
            <p style={{ color: CP.textSecondary, fontSize: 14.5, margin: "12px 0 6px" }}>
              {data.reason === "pilot_link_required"
                ? "Per il pilota serve il collegamento esplicito del tuo account operatore."
                : "Account non ancora collegato a un profilo operatore."}
            </p>
            <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>Lo fa un admin in un minuto: chiedi di collegare il tuo account al tuo nome operatore.</p>
          </div>
        </CpCard>
      )}

      {creatorsForSelect ? (
        <div style={{ marginBottom: 18, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: CP.textMuted }}>Spot-check (solo scope all):</span>
          <select
            value={demoCreator}
            onChange={(e) => setDemoCreator(e.target.value)}
            style={{ background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 13 }}
          >
            <option value="">— il mio turno —</option>
            {creatorsForSelect.map((c) => (
              <option key={c.creator_id} value={c.creator_id}>{c.creator_name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {data && !denied && data.linked && !data.shift && data.mode !== "demo" && (
        <CpCard>
          <div style={{ textAlign: "center", padding: "26px 16px" }}>
            <Compass size={28} color={CP.mutedIcons} />
            <p style={{ color: CP.textSecondary, fontSize: 14.5, margin: "12px 0 6px" }}>Nessun turno attivo adesso.</p>
            {data.upcoming ? (
              <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>
                Prossimo turno: {hhmm(data.upcoming.start)}–{hhmm(data.upcoming.end)} (ora italiana).
              </p>
            ) : (
              <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>Nessun turno nelle prossime 12 ore.</p>
            )}
          </div>
        </CpCard>
      )}

      {data?.shift && data.mode !== "demo" ? (
        <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 16px" }}>
          In turno {hhmm(data.shift.start)}–{hhmm(data.shift.end)} (ora italiana)
          {data.shift.k > 1 ? <span style={{ color: CP.textMuted }}> · profilo coseller</span> : null}
        </p>
      ) : null}

      {data?.shift && data.mode !== "demo" && groups.length === 0 ? (
        <CpCard><p style={{ color: CP.textMuted, fontSize: 13.5, margin: 0 }}>Nessun account del turno è tra i creator HOC attivi in chat: scheda vuota.</p></CpCard>
      ) : null}

      {groups.map((g) => {
        const waiting = g.rows.filter((r) => r.state === "waiting");
        const cooling = g.rows.filter((r) => r.state === "cooling");
        return (
          <div key={g.creator_id} style={{ marginBottom: 28 }}>
            <SectionLabel>{g.creator_name}</SectionLabel>
            {g.rows.length === 0 && (
              <p style={{ fontSize: 13, color: CP.textMuted }}>Nessun fan in attesa o in raffreddamento sopra la soglia — coda pulita.</p>
            )}
            {waiting.length > 0 && (
              <>
                <p style={{ fontSize: 12, color: CP.textMuted, margin: "10px 0 8px", textTransform: "uppercase", letterSpacing: 0.4 }}>In attesa · rispondi prima a questi</p>
                {waiting.map((r) => <FanCard key={r.user_id} row={r} copied={copied} onCopy={onCopy} />)}
              </>
            )}
            {cooling.length > 0 && (
              <>
                <p style={{ fontSize: 12, color: CP.textMuted, margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: 0.4 }}>Si raffreddano · un tocco personale oggi</p>
                {cooling.map((r) => <FanCard key={r.user_id} row={r} copied={copied} onCopy={onCopy} />)}
              </>
            )}
          </div>
        );
      })}

      {data && !denied && (
        <p style={{ fontSize: 11.5, color: CP.textMuted, marginTop: 26, lineHeight: 1.5 }}>
          Dati riservati al tuo turno: valore fan e code non si condividono fuori da HOC Pro. Le etichette
          (obiezioni, sintesi) vengono dall'analisi contenuto e servono solo al contesto: non entrano in
          nessuno score. L'@username si incolla nella ricerca Infloww.
        </p>
      )}
    </div>
  );
}
