"use client";

// "A chi scrivere adesso" (09/10/2026, dalla prova d'uso con utenti sintetici: il numero dei fan
// in attesa non diceva cosa fare). In cima alla scheda live: chi è di turno, e la coda dei fan in
// attesa ordinata per priorità con la ragione scritta (regola in src/lib/live-priority.js).

import { useMemo, useState } from "react";
import { UserCheck, UserX, Clock, ExternalLink } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { prioritizeQueue, shiftStatus } from "@/lib/live-priority";
import { Section, hm, waitColor } from "./ui";

const TIER = [
  { color: CP.gold, label: "spende" },
  { color: CP.accent, label: "ha comprato" },
  { color: CP.accentGreen, label: "nuovo" },
  { color: CP.textMuted, label: "" },
];
const SHOW = 8;

const waitText = (m) => (m < 1 ? "adesso" : m < 60 ? `da ${m} min` : `da ${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim());
const firstName = (n) => String(n || "").split(" ")[0];

export function ShiftStrip({ list }) {
  const s = shiftStatus(list);
  if (!list) return null;
  const pill = (bg, border, children) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "10px 14px", fontSize: 13.5, color: CP.textPrimary, marginBottom: 12 }}>{children}</div>
  );
  const next = s.next.length ? <span style={{ color: CP.textSecondary }}>· poi {s.next.map((x) => x.member).join(" e ")} alle {hm(s.next[0].start)}</span> : null;
  if (s.empty) return pill(CP.surface, CP.border, <><Clock size={16} color={CP.textMuted} /> Nessuno di turno adesso {next}</>);
  if (s.unchecked)
    return pill(alpha(CP.accentRed, "12"), alpha(CP.accentRed, "44"),
      <><UserX size={16} color={CP.accentRed} /> <b style={{ fontWeight: 600 }}>Turno iniziato alle {hm(s.current[0].start)} ma {s.current.map((x) => firstName(x.member)).join(" e ")} non {s.current.length > 1 ? "hanno" : "ha"} timbrato l&apos;entrata</b> {next}</>);
  return pill(alpha(CP.accentGreen, "10"), alpha(CP.accentGreen, "3a"),
    <><UserCheck size={16} color={CP.accentGreen} /> Di turno ora: <b style={{ fontWeight: 600 }}>{s.current.map((x) => x.member).join(" e ")}</b>
      <span style={{ color: CP.textSecondary }}>fino alle {hm(s.current[0].end)}</span> {next}</>);
}

export default function NextUp({ queue, shifts }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(() => prioritizeQueue(queue), [queue]);
  const shown = all ? rows : rows.slice(0, SHOW);
  const spenders = rows.filter((r) => r.tier <= 1).length;

  return (
    <Section title="A chi scrivere adesso" aside={rows.length ? `${rows.length} in attesa${spenders ? ` · ${spenders} hanno già comprato` : ""}` : null}
      tip="Fan il cui ultimo messaggio, delle ultime 24 ore, non ha ancora risposta. Ordine: prima chi ha speso almeno $100 negli ultimi 60 giorni, poi chi ha già comprato, poi i nuovi abbonati della settimana, poi gli altri; dentro ogni gruppo chi aspetta da più tempo.">
      <ShiftStrip list={shifts} />
      {!rows.length ? (
        <div style={{ fontSize: 14, color: CP.textSecondary, padding: "6px 2px" }}>Nessun fan in attesa di risposta. Ottimo.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {shown.map((r) => {
            const t = TIER[r.tier];
            return (
              <a key={r.user_id} href={`https://onlyfans.com/my/chats/chat/${r.user_id}`} target="_blank" rel="noreferrer"
                style={{ display: "grid", gridTemplateColumns: "6px 1fr auto", gap: 12, alignItems: "center", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 14, padding: "10px 14px 10px 10px", textDecoration: "none", color: CP.textPrimary, fontFamily: FONTS.body }}>
                <span style={{ alignSelf: "stretch", borderRadius: 4, background: t.color }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <b style={{ fontWeight: 600, fontSize: 14 }}>{r.username || `u${r.user_id}`}</b>
                    <span style={{ fontSize: 12.5, color: r.tier < 3 ? t.color : CP.textSecondary, fontWeight: 500 }}>{r.reason}</span>
                  </div>
                  {r.preview && <div style={{ fontSize: 12.5, color: CP.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>«{r.preview}»</div>}
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: waitColor(r.last_fan_at) }}>{waitText(r.wait_min)}</div>
                  <div style={{ fontSize: 12, color: CP.textMuted, display: "inline-flex", gap: 4, alignItems: "center" }}>apri chat <ExternalLink size={11} /></div>
                </div>
              </a>
            );
          })}
          {rows.length > SHOW && (
            <button onClick={() => setAll(!all)} style={{ justifySelf: "start", padding: "6px 12px", borderRadius: 999, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body }}>
              {all ? "Mostra solo i primi" : `Mostra tutti (${rows.length})`}
            </button>
          )}
        </div>
      )}
    </Section>
  );
}
