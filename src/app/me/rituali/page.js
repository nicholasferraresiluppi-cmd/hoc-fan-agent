"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Check, Flame } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";
import RitualiAvatar from "@/components/RitualiAvatar";

/**
 * /me/rituali — centro controllo personale delle abitudini (CRAWL v1).
 * docs/RITUALI_PERSONALI.md — modulo personale, gated admin, isolato dai dati HOC.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

function localTodayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function stageLabel(adh) {
  if (adh >= 90) return "al meglio";
  if (adh >= 75) return "in slancio";
  if (adh >= 55) return "in forma";
  if (adh >= 30) return "in cammino";
  if (adh > 0) return "in avvio";
  return "si comincia";
}

function LevelDots({ level }) {
  return (
    <span style={{ display: "inline-flex", gap: 3, marginLeft: "auto" }}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: "50%",
          background: i < level ? CP.accent : CP.surfaceAlt,
        }} />
      ))}
    </span>
  );
}

export default function RitualiPage() {
  const today = useMemo(localTodayISO, []);
  const { data, isLoading, mutate } = useSWR(`/api/me/rituali?date=${today}`, fetcher, {
    revalidateOnFocus: false,
  });

  const doneSet = new Set(data?.today?.done || []);

  async function toggle(habitId) {
    if (!data?.config) return;
    const isDone = doneSet.has(habitId);
    const optimisticDone = isDone
      ? (data.today?.done || []).filter((x) => x !== habitId)
      : [...(data.today?.done || []), habitId];
    mutate({ ...data, today: { ...data.today, done: optimisticDone } }, false);
    try {
      const r = await fetch("/api/me/rituali", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, habitId, done: !isDone }),
      });
      const j = await r.json();
      if (j?.ok) {
        mutate({ config: data.config, today: j.today, adherence: j.adherence, streak: j.streak, traits: j.traits }, false);
      } else {
        mutate();
      }
    } catch {
      mutate();
    }
  }

  const config = data?.config;
  const adherence = data?.adherence ?? 0;
  const streak = data?.streak ?? 0;
  const traits = data?.traits || {};

  return (
    <div style={{ padding: "32px 24px 64px", maxWidth: 920, margin: "0 auto" }}>
      <PageHeader
        section="Il mio quadro"
        title="I miei rituali"
        subtitle="Il tuo centro controllo personale. Spunti le abitudini di oggi e il tuo avatar cresce con quello che fai davvero — non è un gioco a punti: la costanza si vede su di te."
      />

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data?.error && (
        <CpCard><p style={{ color: CP.textSecondary, fontSize: 14, margin: 0 }}>{data.error}</p></CpCard>
      )}

      {config && !data?.error && (
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Colonna avatar */}
          <CpCard style={{ flex: "1 1 260px", minWidth: 260, textAlign: "center" }}>
            <RitualiAvatar adherence={adherence} traits={traits} size={220} />
            <div style={{ marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8 }}>
                <span style={{ fontFamily: FONTS.display, fontSize: 30, fontWeight: 500, color: CP.textPrimary, fontVariantNumeric: "tabular-nums" }}>{adherence}%</span>
                <span style={{ fontSize: 13, color: CP.accentSoftText }}>{stageLabel(adherence)}</span>
              </div>
              <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>costanza · ultimi 30 giorni</div>
              {streak > 0 && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, padding: "4px 11px", borderRadius: 999, background: CP.accentSoft, color: CP.accentSoftText, fontSize: 12.5 }}>
                  <Flame size={13} strokeWidth={2} /> {streak} {streak === 1 ? "giorno" : "giorni"} di fila
                </div>
              )}
            </div>

            {/* Tratti per pilastro */}
            <div style={{ marginTop: 18, textAlign: "left" }}>
              <SectionLabel>Come stai crescendo</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {config.pillars.map((p) => {
                  const t = traits[p.trait] || { level: 0 };
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: CP.textSecondary }}>
                      <span>{p.label}</span>
                      <LevelDots level={t.level} />
                    </div>
                  );
                })}
              </div>
            </div>
          </CpCard>

          {/* Colonna abitudini */}
          <div style={{ flex: "2 1 380px", minWidth: 300 }}>
            {config.pillars.map((p) => {
              const habits = config.habits.filter((h) => h.pillar === p.id);
              if (!habits.length) return null;
              return (
                <div key={p.id} style={{ marginBottom: 18 }}>
                  <SectionLabel style={{ textTransform: "uppercase", letterSpacing: "0.06em", color: CP.textMuted }}>{p.label}</SectionLabel>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                    {habits.map((h) => {
                      const done = doneSet.has(h.id);
                      return (
                        <button
                          key={h.id}
                          onClick={() => toggle(h.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            width: "100%", textAlign: "left",
                            padding: "12px 14px", borderRadius: 11,
                            border: `1px solid ${done ? CP.accent + "88" : CP.border}`,
                            background: done ? CP.accentSoft : CP.surface,
                            cursor: "pointer", transition: "background 0.12s, border-color 0.12s",
                            fontFamily: FONTS.body,
                          }}
                        >
                          <span style={{
                            width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            border: `1.5px solid ${done ? CP.accent : CP.mutedIcons}`,
                            background: done ? CP.accent : "transparent",
                            color: CP.accentInk,
                          }}>
                            {done && <Check size={15} strokeWidth={3} />}
                          </span>
                          <span style={{ fontSize: 14, color: done ? CP.textPrimary : CP.textSecondary }}>{h.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <p style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.6, marginTop: 4 }}>
              La costanza si misura sugli ultimi 30 giorni, non a giorni consecutivi: saltare un giorno non azzera niente. I tratti dell'avatar crescono con quello che fai e si affievoliscono piano se molli — mai un castigo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
