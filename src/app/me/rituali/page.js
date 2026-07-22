"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { Check, Flame } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel } from "@/components/cp-style";
import RitualiAvatar from "@/components/RitualiAvatar";

/**
 * /me/rituali — centro controllo personale delle abitudini (CRAWL v1) + diario.
 * docs/RITUALI_PERSONALI.md — modulo personale, gated admin, isolato dai dati HOC.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const MOODS = ["giù", "fiacco", "ok", "bene", "su"]; // indice 0..4 → mood 1..5

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

  // Stato locale del diario (source of truth degli input), idratato una volta dal server.
  const [mood, setMood] = useState(null);
  const [effort, setEffort] = useState(3);
  const [note, setNote] = useState("");
  const hydrated = useRef(false);
  const noteTimer = useRef(null);

  useEffect(() => {
    if (data && !hydrated.current) {
      const j = data.today?.journal || {};
      setMood(typeof j.mood === "number" ? j.mood : null);
      setEffort(typeof j.effort === "number" ? j.effort : 3);
      setNote(typeof j.note === "string" ? j.note : "");
      hydrated.current = true;
    }
  }, [data]);

  function applyState(j) {
    if (j?.ok) {
      mutate({ config: data.config, today: j.today, adherence: j.adherence, streak: j.streak, traits: j.traits, planner: j.planner }, false);
    } else {
      mutate();
    }
  }

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
      applyState(await r.json());
    } catch {
      mutate();
    }
  }

  async function saveJournal(partial) {
    try {
      const r = await fetch("/api/me/rituali", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, journal: partial }),
      });
      applyState(await r.json());
    } catch { /* silenzioso: lo stato locale resta */ }
  }

  function onMood(m) { setMood(m); saveJournal({ mood: m }); }
  function onEffort(v) { setEffort(v); saveJournal({ effort: v }); }
  function onNote(v) {
    setNote(v);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => saveJournal({ note: v }), 800);
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
        <>
          {data.planner && (
            <CpCard style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <SectionLabel>Piano di oggi</SectionLabel>
                <span style={{ fontSize: 12.5, color: CP.textMuted }}>
                  {data.planner.total - data.planner.remaining}/{data.planner.total} fatti oggi
                </span>
              </div>
              {data.planner.next ? (
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={() => toggle(data.planner.next.habitId)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                      padding: "12px 14px", borderRadius: 11,
                      border: `1px solid ${CP.accent}66`, background: CP.accentSoft,
                      cursor: "pointer", fontFamily: FONTS.body,
                    }}
                  >
                    <span style={{
                      width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: `1.5px solid ${CP.accent}`, color: CP.accent,
                    }}>
                      <Check size={15} strokeWidth={3} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 11, color: CP.accentSoftText, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Adesso · {data.planner.next.slot}
                      </span>
                      <span style={{ display: "block", fontSize: 15, color: CP.textPrimary, fontWeight: 500 }}>{data.planner.next.label}</span>
                      <span style={{ display: "block", fontSize: 12, color: CP.textMuted }}>{data.planner.next.anchor}</span>
                    </span>
                  </button>
                  {data.planner.upNext?.length > 0 && (
                    <div style={{ fontSize: 12.5, color: CP.textMuted, marginTop: 10 }}>Poi: {data.planner.upNext.join(" · ")}</div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, color: CP.accentGreen, fontSize: 14 }}>
                  <Check size={16} strokeWidth={2.5} /> Tutto fatto per oggi. Bel lavoro.
                </div>
              )}
            </CpCard>
          )}
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
            </div>
          </div>

          {/* Diario di oggi */}
          <CpCard style={{ marginTop: 4 }}>
            <SectionLabel>Diario di oggi</SectionLabel>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 14 }}>
              {/* Umore */}
              <div style={{ flex: "1 1 240px", minWidth: 220 }}>
                <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 8 }}>Come ti senti</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {MOODS.map((label, i) => {
                    const val = i + 1;
                    const active = mood === val;
                    return (
                      <button
                        key={val}
                        onClick={() => onMood(val)}
                        style={{
                          flex: 1, padding: "8px 4px", borderRadius: 8,
                          border: `1px solid ${active ? CP.accent : CP.border}`,
                          background: active ? CP.accentSoft : CP.surface,
                          color: active ? CP.accentSoftText : CP.textMuted,
                          fontSize: 12, cursor: "pointer", fontFamily: FONTS.body,
                          fontWeight: active ? 500 : 400,
                        }}
                      >{label}</button>
                    );
                  })}
                </div>
              </div>
              {/* Sforzo */}
              <div style={{ flex: "1 1 240px", minWidth: 220 }}>
                <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 8 }}>Quanto ti è costato</div>
                <input
                  type="range" min={1} max={5} step={1} value={effort}
                  onChange={(e) => onEffort(Number(e.target.value))}
                  style={{ width: "100%", accentColor: CP.accent }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: CP.textMuted, marginTop: 2 }}>
                  <span>scorrevole</span><span>durissimo</span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 8 }}>Nota</div>
              <textarea
                value={note}
                onChange={(e) => onNote(e.target.value)}
                placeholder="Com'è andata oggi? Cosa ha funzionato, cosa no."
                rows={3}
                style={{
                  width: "100%", resize: "vertical",
                  background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 9,
                  padding: "10px 12px", color: CP.textPrimary, fontSize: 13.5,
                  fontFamily: FONTS.body, lineHeight: 1.5, outline: "none",
                }}
              />
            </div>
            <p style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.6, marginTop: 12 }}>
              La costanza si misura sugli ultimi 30 giorni, non a giorni consecutivi: saltare un giorno non azzera niente. I tratti dell'avatar crescono con quello che fai e si affievoliscono piano se molli — mai un castigo. Il diario si salva da solo.
            </p>
          </CpCard>
        </>
      )}
    </div>
  );
}
