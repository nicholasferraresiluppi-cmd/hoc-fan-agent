"use client";

/**
 * /admin/persone/[id] — scheda persona 360 (timeline lifecycle).
 *
 * Stato corrente (livello/status dalla proiezione) + timeline degli eventi +
 * link alla scheda performance esistente. Stato vuoto onesto: se non ci sono
 * eventi, lo dice e spiega come si popola.
 */
import useSWR from "swr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CP, FONTS } from "@/lib/brand";
import { CpCard, SectionLabel } from "@/components/cp-style";
import { EVENT_TYPES, LEVEL_BY_ID } from "@/lib/person-events";
import { ChevronLeft, ExternalLink, UserPlus, TrendingUp, Award, ClipboardCheck, GraduationCap, MessageSquareWarning, Flag, FileText, LogOut, CalendarCheck, Users2, Layers, ListChecks } from "lucide-react";

const fetcher = async (url) => {
  const r = await fetch(url);
  if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; throw e; }
  return r.json();
};

const dtRome = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "short", year: "numeric" });
const fmtDate = (ms) => (ms ? dtRome.format(new Date(Number(ms))) : "—");

// Icona + tono semantico per tipo evento (verde=positivo, rosso=segnale HR).
const EV_ICON = {
  hire: UserPlus, graduation: GraduationCap, onboarding_phase: ListChecks, checkin: CalendarCheck, offboarding: LogOut,
  level_change: TrendingUp, step_change: TrendingUp, certification: Award, mentoring: Users2, band_assignment: Layers,
  qa_review: ClipboardCheck, coaching_session: GraduationCap, dispute_opened: MessageSquareWarning, dispute_resolved: MessageSquareWarning,
  hr_action: Flag, note: FileText,
};
const POSITIVE = new Set(["graduation", "level_change", "step_change", "certification"]);
const NEGATIVE = new Set(["dispute_opened", "hr_action", "offboarding"]);
const toneColor = (type) => (POSITIVE.has(type) ? CP.accentGreen : NEGATIVE.has(type) ? CP.accentRed : CP.accent);

function describe(ev) {
  const p = ev.payload || {};
  switch (ev.type) {
    case "hire": return "Assunzione";
    case "graduation": return "Graduazione → L1";
    case "onboarding_phase": return `Onboarding fase ${p.phase || "?"} · ${p.status || ""}`;
    case "level_change": return `Livello ${p.from || "?"} → ${p.to || "?"}${p.direction && p.direction !== "promotion" ? ` (${p.direction})` : ""}`;
    case "step_change": return `Step ${p.from ?? "?"} → ${p.to ?? "?"}${p.level ? ` · ${p.level}` : ""}`;
    case "certification": return `Certificazione ${p.tier || ""}${p.creator ? ` · ${p.creator}` : ""}`;
    case "qa_review": return `QA ${p.period || ""} · media ${p.avg ?? "—"} · ${p.pass ? "pass" : "fail"}`;
    case "coaching_session": return "Sessione coaching";
    case "mentoring": return `Mentoring${p.mentee ? ` · ${p.mentee}` : ""}`;
    case "dispute_opened": return `Contestazione aperta${p.metric ? ` · ${p.metric}` : ""}`;
    case "dispute_resolved": return `Contestazione ${p.outcome || "risolta"}`;
    case "hr_action": return `Azione HR · ${p.status || p.kind || ""}`;
    case "note": return p.text || "Nota";
    case "checkin": return `Check-in ${p.milestone || ""}`;
    case "offboarding": return "Uscita";
    default: return EVENT_TYPES[ev.type]?.label || ev.type;
  }
}

export default function PersonaSchedaPage() {
  const params = useParams();
  const id = params?.id;
  const { data, error, isLoading } = useSWR(id ? `/api/admin/person/${encodeURIComponent(id)}` : null, fetcher, { revalidateOnFocus: false });
  const denied = error && (error.status === 401 || error.status === 403);

  const back = (
    <Link href="/admin/persone" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: CP.surfaceAlt, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textSecondary, fontSize: 12, fontWeight: 500, padding: "6px 12px", textDecoration: "none", marginBottom: 18 }}>
      <ChevronLeft size={15} strokeWidth={1.8} /> tutte le persone
    </Link>
  );

  const st = data?.state;
  const level = st?.level ? (LEVEL_BY_ID[st.level] || { id: st.level, title: st.level }) : null;
  const events = data?.events || [];

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 24px 80px", fontFamily: FONTS.body, color: CP.textSecondary }}>
      {back}
      {denied && <Notice>Accesso riservato agli admin (SEED).</Notice>}
      {error && !denied && <Notice>Errore nel caricamento ({String(error.status || error.message)}).</Notice>}
      {isLoading && <Skeleton />}

      {data && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            <h1 style={{ fontFamily: FONTS.display, fontSize: 26, fontWeight: 500, margin: 0, color: CP.textPrimary, letterSpacing: "-0.01em" }}>{data.name}</h1>
            {level && <span style={{ background: CP.accentSoft, color: CP.accentSoftText, borderRadius: 6, fontSize: 12, fontWeight: 500, padding: "3px 9px" }}>{level.id} · {level.title}</span>}
            <span style={{ fontSize: 12, color: st?.status === "active" ? CP.accentGreen : CP.textMuted }}>● {st?.status || "unknown"}</span>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 22, fontSize: 12.5, color: CP.textMuted }}>
            <span style={{ fontFamily: FONTS.mono }}>employeeId {data.person_id}</span>
            {st?.hired_at && <span>in HOC dal {fmtDate(st.hired_at)}</span>}
            <Link href={`/leaderboard/operational/${encodeURIComponent(data.name)}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: CP.accent, textDecoration: "none" }}>
              <ExternalLink size={13} strokeWidth={1.8} /> scheda performance (score, comp)
            </Link>
          </div>

          <SectionLabel style={{ display: "block", marginBottom: 12 }}>Timeline ciclo di vita</SectionLabel>
          {events.length === 0 ? (
            <Notice>
              Nessun evento in timeline per questo operatore. Gli eventi (assunzione, certificazioni, QA, coaching, dispute) si popolano quando le people-feature vengono usate su questa persona, e poi si importano dal backfill. Per ora la performance è nella <Link href={`/leaderboard/operational/${encodeURIComponent(data.name)}`} style={{ color: CP.accent }}>scheda operatore</Link>.
            </Notice>
          ) : (
            <CpCard padding="18px 20px">
              <ul style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
                {events.map((ev, i) => {
                  const Icon = EV_ICON[ev.type] || FileText;
                  const color = toneColor(ev.type);
                  const cat = EVENT_TYPES[ev.type]?.category || "";
                  return (
                    <li key={ev.id || i} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 12, alignItems: "start", padding: "10px 0", borderBottom: i < events.length - 1 ? `1px solid ${CP.borderSoft}` : "none" }}>
                      <span style={{ width: 26, height: 26, borderRadius: 999, background: color + "1f", display: "grid", placeItems: "center", marginTop: 1 }}>
                        <Icon size={14} strokeWidth={1.8} color={color} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: CP.textPrimary, fontWeight: 500 }}>{describe(ev)}</div>
                        {cat && <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 2 }}>{cat}{ev.source ? ` · ${ev.source}` : ""}</div>}
                      </div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 11.5, color: CP.textMuted, whiteSpace: "nowrap" }}>{fmtDate(ev.at)}</div>
                    </li>
                  );
                })}
              </ul>
            </CpCard>
          )}
        </>
      )}
    </div>
  );
}

function Notice({ children }) {
  return (
    <CpCard style={{ marginBottom: 18, borderColor: CP.borderStrong }}>
      <div style={{ fontSize: 13.5, color: CP.textSecondary, lineHeight: 1.55 }}>{children}</div>
    </CpCard>
  );
}
function Skeleton() {
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[0, 1, 2, 3].map((i) => <div key={i} style={{ height: 40, background: CP.surface, border: `1px solid ${CP.borderSoft}`, borderRadius: 8 }} />)}</div>;
}
