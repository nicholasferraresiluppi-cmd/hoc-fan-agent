"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { Copy, Check, Clock, Snowflake, HelpCircle, Compass } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmt$, fmtInt } from "@/lib/format";
import { PageHead, SectionTitle, Notice, card, NUM } from "@/components/ds";
import SignalsStrip from "@/components/SignalsStrip";

/**
 * /me/turno — "Il mio turno" (pilota copilot, gate copilot.pilot).
 * Scheda-fan per l'operatore in turno: chi seguire ora, dov'era rimasta la
 * conversazione (ultima etichetta analisi), e la MOSSA suggerita. Suggerimenti,
 * mai copioni: decide e scrive sempre l'operatore. Niente di questa pagina
 * entra negli score. Ridisegno sul design system 26/09/2026: API e logica invariate.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());
const hhmm = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
const OBIEZIONE_LABEL = { prezzo: "prezzo", interesse: "interesse", tempo: "tempo", fiducia: "fiducia", nessuna: null };

const ctl = { background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: FONTS.body };
const subHead = { fontSize: 13, fontWeight: 500, color: CP.textSecondary, margin: "10px 0 8px" };

function EmptyCard({ icon, title, detail }) {
  return (
    <div style={{ ...card, padding: "28px 18px", marginBottom: 14, textAlign: "center" }}>
      {icon}
      <p style={{ color: CP.textSecondary, fontSize: 14, margin: icon ? "10px 0 4px" : "0 0 4px" }}>{title}</p>
      {detail && <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>{detail}</p>}
    </div>
  );
}

function StateChip({ row }) {
  const waiting = row.state === "waiting";
  const Icon = waiting ? Clock : Snowflake;
  const label = waiting
    ? `In attesa${row.hrs_since_fan != null ? ` da ${row.hrs_since_fan} h` : ""}`
    : `Si raffredda${row.hrs_since_active != null ? ` da ${Math.round(row.hrs_since_active / 24)} g` : ""}`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: waiting ? CP.accentSoftText : CP.textMuted, whiteSpace: "nowrap", ...NUM }}>
      <Icon size={12} /> {label}
    </span>
  );
}

function FanCard({ row, copied, onCopy }) {
  const l = row.label;
  return (
    <div style={{ ...card, padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => onCopy(row.username)}
          title="Copia @username (incollalo nella ricerca Infloww)"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${CP.border}`, borderRadius: 8, padding: "4px 10px", color: CP.textPrimary, fontFamily: FONTS.body, fontSize: 13, cursor: "pointer", maxWidth: "100%", overflowWrap: "anywhere" }}
        >
          @{row.username} {copied === row.username ? <Check size={13} color={CP.accentGreen} /> : <Copy size={13} color={CP.textMuted} />}
        </button>
        <span style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, ...NUM }} title="Quanto ha speso finora questo fan">{fmt$(row.ltv_usd || 0)}</span>
        <span style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>{fmtInt(row.txns)} acquisti · {fmtInt(row.msgs_30d)} messaggi negli ultimi 30 giorni</span>
        <StateChip row={row} />
        {l && OBIEZIONE_LABEL[l.obiezione] ? (
          <span style={{ fontSize: 12, color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 6, padding: "2px 8px" }}>
            Obiezione: {OBIEZIONE_LABEL[l.obiezione]}
          </span>
        ) : null}
      </div>
      {l?.sintesi ? (
        <p style={{ margin: "8px 0 0", fontSize: 13, color: CP.textMuted, lineHeight: 1.5 }}>
          Ultima conversazione ({l.day}): {l.sintesi}
        </p>
      ) : null}
      <div style={{ marginTop: 10, borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 10 }}>
        <p style={{ margin: 0, fontSize: 14, color: CP.textPrimary, fontWeight: 500 }}>→ {row.play.mossa}</p>
        {row.play.angolo ? <p style={{ margin: "5px 0 0", fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>{row.play.angolo}</p> : null}
        {row.play.offerta ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: CP.accentSoftText, display: "inline-block", background: CP.accentSoft, borderRadius: 6, padding: "3px 9px", ...NUM }}>{row.play.offerta}</p>
        ) : null}
        {row.play.freno ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: CP.textPrimary, borderLeft: `3px solid ${CP.accentRed}`, padding: "2px 0 2px 10px", lineHeight: 1.5 }}>
            <span style={{ color: CP.accentRed, fontWeight: 500 }}>Attenzione:</span> {row.play.freno}
          </p>
        ) : null}
        <p style={{ margin: "8px 0 0", fontSize: 12, color: CP.textMuted, lineHeight: 1.5 }}>Perché: {row.play.perche}</p>
      </div>
    </div>
  );
}

export default function MyShiftPage() {
  const [demoCreator, setDemoCreator] = useState("");
  const [adminCreators, setAdminCreators] = useState(null);
  const url = "/api/me/turno" + (demoCreator ? `?creator_id=${demoCreator}` : "");
  const { data, error, isLoading } = useSWR(url, fetcher, { revalidateOnFocus: false, refreshInterval: 5 * 60000 });
  // Profilo-segnali personale (own): indipendente dal turno attivo, quindi fetch a sé.
  const { data: sig } = useSWR("/api/me/signals", fetcher, { revalidateOnFocus: false });
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
    <div style={{ padding: "28px 24px 64px", maxWidth: 880, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Il mio quadro" }, { label: "Il mio turno" }]}
        title="Il mio turno"
        subtitle="Chi seguire adesso sui tuoi account in turno, dove si era fermata la conversazione e una mossa suggerita. Sono suggerimenti, non copioni: decidi e scrivi tu. Niente di questa pagina entra negli score."
        actions={creatorsForSelect ? (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: CP.textMuted, flexWrap: "wrap" }}>
            Controllo a campione (solo admin)
            <select value={demoCreator} onChange={(e) => setDemoCreator(e.target.value)} aria-label="Controllo a campione su un creator" style={ctl}>
              <option value="">Il mio turno</option>
              {creatorsForSelect.map((c) => (
                <option key={c.creator_id} value={c.creator_id}>{c.creator_name}</option>
              ))}
            </select>
          </label>
        ) : null}
      />

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14, marginBottom: 14 }}>Caricamento…</div>}

      {denied && (
        <EmptyCard icon={<HelpCircle size={28} color={CP.mutedIcons} />} title={data.error} />
      )}
      {error && !data && <Notice danger>Errore di rete: la pagina non si è caricata. Riprova tra poco.</Notice>}

      {data && !denied && !data.linked && data.mode !== "demo" && (
        <EmptyCard
          icon={<HelpCircle size={28} color={CP.mutedIcons} />}
          title={data.reason === "pilot_link_required"
            ? "Per aprire la tua scheda-turno serve il collegamento del tuo account operatore."
            : "Il tuo account non è ancora collegato a un profilo operatore."}
          detail="Lo fa un admin in un minuto: chiedi di collegare il tuo account al tuo nome operatore."
        />
      )}

      {data && !denied && data.mode !== "demo" && <SignalsStrip sig={sig} />}

      {data && !denied && data.linked && !data.shift && data.mode !== "demo" && (
        <EmptyCard
          icon={<Compass size={28} color={CP.mutedIcons} />}
          title="Nessun turno attivo adesso."
          detail={data.upcoming
            ? `Prossimo turno: ${hhmm(data.upcoming.start)}–${hhmm(data.upcoming.end)} (ora italiana).`
            : "Nessun turno nelle prossime 12 ore."}
        />
      )}

      {data?.shift && data.mode !== "demo" ? (
        <p style={{ fontSize: 14, color: CP.textSecondary, margin: "0 0 16px", ...NUM }}>
          In turno dalle {hhmm(data.shift.start)} alle {hhmm(data.shift.end)} (ora italiana)
          {data.shift.k > 1 ? <span style={{ color: CP.textMuted }}> · turno condiviso con altri operatori</span> : null}
        </p>
      ) : null}

      {data?.shift && data.mode !== "demo" && groups.length === 0 ? (
        <EmptyCard title="Nessun account di questo turno è tra i creator HOC attivi in chat: per ora non c'è nessuno da seguire." />
      ) : null}

      {groups.map((g) => {
        const waiting = g.rows.filter((r) => r.state === "waiting");
        const cooling = g.rows.filter((r) => r.state === "cooling");
        return (
          <section key={g.creator_id} style={{ marginBottom: 28 }}>
            <SectionTitle>{g.creator_name}</SectionTitle>
            {g.rows.length === 0 && (
              <p style={{ fontSize: 13, color: CP.textMuted, margin: 0 }}>Nessun fan in attesa o che si sta raffreddando: coda pulita.</p>
            )}
            {waiting.length > 0 && (
              <>
                <h3 style={subHead}>In attesa di risposta · rispondi prima a questi</h3>
                {waiting.map((r) => <FanCard key={r.user_id} row={r} copied={copied} onCopy={onCopy} />)}
              </>
            )}
            {cooling.length > 0 && (
              <>
                <h3 style={{ ...subHead, marginTop: 16 }}>Si stanno raffreddando · oggi un messaggio personale</h3>
                {cooling.map((r) => <FanCard key={r.user_id} row={r} copied={copied} onCopy={onCopy} />)}
              </>
            )}
          </section>
        );
      })}

      {data && !denied && (
        <p style={{ fontSize: 12, color: CP.textMuted, marginTop: 26, lineHeight: 1.55 }}>
          Dati riservati al tuo turno: quanto spendono i fan e le code non si condividono fuori da HOC Pro.
          Obiezioni e sintesi vengono dall&apos;analisi delle conversazioni e servono solo a darti il contesto:
          non entrano in nessuno score. Per trovare un fan, incolla l&apos;@username nella ricerca di Infloww.
        </p>
      )}
    </div>
  );
}
