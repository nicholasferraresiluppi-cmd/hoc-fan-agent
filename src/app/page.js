"use client";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";
import { TRAINING_SCENARIOS, QUICK_CHALLENGES } from "@/lib/training-scenarios";
import { CREATOR_PERSONAS } from "@/lib/creator-personas";
import { FAN_ARCHETYPES, getFanArchetypeById } from "@/lib/fan-archetypes";
import PlayerCard from "@/components/PlayerCard";
import { PlayerCardSkeleton, XPBarSkeleton, GridSkeleton } from "@/components/Skeleton";
import { FONTS, CP, alpha } from "@/lib/brand";
import { PageHead, Notice, card, NUM } from "@/components/ds";
import { ArrowLeft, Lock, Star } from "lucide-react";
import CoachPanel from "@/components/CoachPanel";
import SignalsPanel from "@/components/SignalsPanel";
import { canSee } from "@/lib/nav-access";

// Pick a random archetype weighted by difficulty (favor medium/common ones)
function pickRandomArchetype() {
  const pool = FAN_ARCHETYPES;
  if (!pool?.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// =========================================================
// CONSTANTS & DATA
// =========================================================

// Competenze valutate dal coach AI. Una sola tinta per le barre (design system:
// un solo accento): la differenza la fa l'etichetta, non il colore.
const SKILL_DIMENSIONS = [
  { key: "naturalezza", label: "Naturalezza" },
  { key: "esclusivita", label: "Esclusività" },
  { key: "dipendenza", label: "Dipendenza" },
  { key: "conversione", label: "Conversione" },
  { key: "tono", label: "Tono" },
  { key: "gestione_obiezioni", label: "Gestione obiezioni" },
];

// Stili condivisi della pagina (solo token CP, seguono il tema chiaro/scuro).
const WRAP = { padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body };
const BTN = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" };
const BTN_PRIMARY = { ...BTN, background: CP.accent, color: CP.accentInk, border: `1px solid ${CP.accent}` };
const BTN_SECONDARY = { ...BTN, background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}` };
const BTN_OFF = { ...BTN, background: CP.surfaceAlt, color: CP.textMuted, border: `1px solid ${CP.border}`, cursor: "not-allowed" };
const CHIP = { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textSecondary, textDecoration: "none", whiteSpace: "nowrap" };
const CHIP_ACCENT = { ...CHIP, border: `1px solid ${alpha(CP.accent, "55")}`, background: CP.accentSoft, color: CP.accentSoftText };
const INPUT = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none" };
// Card cliccabile: il bordo passa all'accento al passaggio del mouse.
const CLICK_CARD = { ...card, padding: "18px 20px", cursor: "pointer", textAlign: "left", display: "block", width: "100%", fontFamily: FONTS.body, color: CP.textPrimary, textDecoration: "none", transition: "border-color .15s" };
const hoverBorder = {
  onMouseEnter: (e) => { e.currentTarget.style.borderColor = CP.accent; },
  onMouseLeave: (e) => { e.currentTarget.style.borderColor = CP.border; },
};

function BackButton({ onClick }) {
  return (
    <button onClick={onClick} style={BTN_SECONDARY}>
      <ArrowLeft size={15} /> Indietro
    </button>
  );
}

// Valutazione a stelle (1-5): icone al posto delle emoji.
function Stars({ value, size = 28 }) {
  return (
    <div style={{ display: "inline-flex", gap: 6 }} aria-label={`${value} stelle su 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} color={i < value ? CP.accent : CP.border} fill={i < value ? CP.accent : "none"} />
      ))}
    </div>
  );
}

// Riquadro di feedback con un segno di colore a sinistra (segnale, non superficie).
function FeedbackBox({ title, tone, children }) {
  const edge = tone === "good" ? CP.accentGreen : tone === "bad" ? CP.accentRed : CP.accent;
  return (
    <section style={{ ...card, borderLeft: `3px solid ${edge}`, padding: "16px 18px", marginBottom: 14, textAlign: "left" }}>
      <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>{title}</h2>
      {children}
    </section>
  );
}

function BulletList({ items, empty }) {
  if (!items || items.length === 0) return <p style={{ margin: 0, fontSize: 14, color: CP.textMuted }}>{empty}</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: 20, color: CP.textPrimary, fontSize: 14, lineHeight: 1.55 }}>
      {items.map((s, i) => <li key={i} style={{ marginBottom: 6 }}>{s}</li>)}
    </ul>
  );
}

// Category metadata — scenarios counts are computed dynamically from TRAINING_SCENARIOS
const TRAINING_CATEGORIES = [
  {
    id: "le-basi-della-chat",
    name: "Le basi",
    icon: "",
    description: "Aprire la conversazione senza fare spam",
    difficulty: 1,
  },
  {
    id: "mass-e-conversione",
    name: "Messaggi di massa e conversione",
    icon: "",
    description: "Trasformare i messaggi di massa in vendite",
    difficulty: 2,
  },
  {
    id: "custom-e-upsell",
    name: "Custom e upsell",
    icon: "",
    description: "Proporre contenuti su misura e alzare la spesa",
    difficulty: 3,
  },
  {
    id: "recuperi-e-retention",
    name: "Recuperi e retention",
    icon: "",
    description: "Tenere i fan che stanno per disdire",
    difficulty: 4,
  },
  {
    id: "script-avanzati",
    name: "Script avanzati",
    icon: "",
    description: "Tecniche di chiusura avanzate",
    difficulty: 5,
  },
  {
    id: "righe-rosse-compliance",
    name: "Righe rosse — compliance",
    icon: "",
    description: "Il fan spinge sulle righe rosse",
    difficulty: 5,
  },
];

// Helper: get real scenarios for a category from TRAINING_SCENARIOS
function getScenariosForCategory(categoryId) {
  const cat = TRAINING_SCENARIOS.find((c) => c.categoryId === categoryId);
  return cat?.scenarios || [];
}

// =========================================================
// Main App Component
// =========================================================

export default function Home() {
  const { user, isLoaded } = useUser();
  const operatorName = user?.firstName || "Operatore";

  // Navigation State
  const [screen, setScreen] = useState("home");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState(null);

  // Profile/Stats State
  const [operatorXP, setOperatorXP] = useState(0);
  const [operatorLevel, setOperatorLevel] = useState(1);
  const [skillDimensions, setSkillDimensions] = useState({
    naturalezza: 0,
    esclusivita: 0,
    dipendenza: 0,
    conversione: 0,
    tono: 0,
    gestione_obiezioni: 0,
  });
  const [recentScenarios, setRecentScenarios] = useState([]);

  // SWR-cached fetches — stale-while-revalidate keeps navigation snappy
  const swrKey = isLoaded && user ? true : null;
  const { data: meStatsRaw, error: meStatsErr } = useSWR(swrKey ? "/api/me-stats" : null);
  const { data: whoamiRaw } = useSWR(swrKey ? "/api/whoami" : null);
  const { data: dailyDrillRaw } = useSWR(swrKey ? "/api/daily-drill" : null);
  const { data: profileRaw } = useSWR(swrKey ? "/api/profile" : null);

  const meStats = meStatsRaw?.skills ? meStatsRaw : null;
  const dailyDrill = dailyDrillRaw || null;
  const roleInfo = whoamiRaw
    ? {
        role: whoamiRaw?.role || "operator",
        roles: Array.isArray(whoamiRaw?.roles) && whoamiRaw.roles.length ? whoamiRaw.roles : [whoamiRaw?.role || "operator"],
        team: whoamiRaw?.team || null,
        admin: !!whoamiRaw?.admin,
      }
    : null;
  const seniority = profileRaw?.seniority || null;
  const league = profileRaw?.league || null;
  const certifications = profileRaw?.certifications || [];

  // Semina XP / livello / skill dal profilo persistito appena arriva, così la
  // progressione sopravvive al reload (prima restava sempre a livello 1 / 0 XP).
  useEffect(() => {
    if (!profileRaw) return;
    if (typeof profileRaw.xp === "number") setOperatorXP(profileRaw.xp);
    if (typeof profileRaw.level === "number") setOperatorLevel(profileRaw.level);
    if (profileRaw.skillDimensions) {
      setSkillDimensions((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(profileRaw.skillDimensions)) {
          if (k in next && v && typeof v.average === "number") {
            next[k] = Math.round(v.average);
          }
        }
        return next;
      });
    }
  }, [profileRaw]);

  const certByCreator = Object.fromEntries((certifications || []).map((c) => [c.creatorId, c]));

  // Chat State
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [maxMessages, setMaxMessages] = useState(1);
  const [fanState, setFanState] = useState({ interest: 5, trust: 5, irritation: 0, attachment: 3 });
  const [sessionScore, setSessionScore] = useState(null);
  const [sessionFeedback, setSessionFeedback] = useState(null);
  const [feedbackRating, setFeedbackRating] = useState(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState(null);
  const [selectedArchetype, setSelectedArchetype] = useState(null);
  const [pendingScenario, setPendingScenario] = useState(null);
  const [pendingQueue, setPendingQueue] = useState([]); // operator messages queued awaiting fan reply
  const [queueCountdown, setQueueCountdown] = useState(0); // seconds remaining (0 = inactive)
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const queueTimerRef = useRef(null);
  const queueTickRef = useRef(null);
  const messagesRef = useRef([]);
  const fanStateRef = useRef({ interest: 5, trust: 5, irritation: 0, attachment: 3 });
  const selectedScenarioRef = useRef(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { fanStateRef.current = fanState; }, [fanState]);
  useEffect(() => { selectedScenarioRef.current = selectedScenario; }, [selectedScenario]);

  // Quick Challenge State
  const [quickChallengeIndex, setQuickChallengeIndex] = useState(0);
  const [quickChallengeResponse, setQuickChallengeResponse] = useState("");
  const [quickChallengeEval, setQuickChallengeEval] = useState(null);
  const [feedbackError, setFeedbackError] = useState(false);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------

  // Flush the queued operator messages to the fan (Claude) and get a reply.
  const flushQueue = async () => {
    if (queueTimerRef.current) { clearTimeout(queueTimerRef.current); queueTimerRef.current = null; }
    if (queueTickRef.current) { clearInterval(queueTickRef.current); queueTickRef.current = null; }
    setQueueCountdown(0);

    const scenario = selectedScenarioRef.current;
    if (!scenario) return;

    const currentMessages = messagesRef.current;
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMessages,
          scenarioId: scenario.id,
          creatorId: selectedCreator?.id,
          archetypeId: selectedArchetype?.id,
          fanState: fanStateRef.current,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages((prev) => [...prev, { role: "fan", content: data.reply }]);
        if (data.fanState) setFanState(data.fanState);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "fan", content: "[Errore risposta fan - riprova]" },
        ]);
      }
    } catch (err) {
      console.error("flushQueue error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "fan", content: "[Errore di rete - riprova]" },
      ]);
    } finally {
      setIsTyping(false);
      setPendingQueue([]);
      // Re-focus input so operator can keep typing without clicking
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const startOrResetQueueTimer = () => {
    if (queueTimerRef.current) clearTimeout(queueTimerRef.current);
    if (queueTickRef.current) clearInterval(queueTickRef.current);
    setQueueCountdown(4);
    queueTickRef.current = setInterval(() => {
      setQueueCountdown((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    queueTimerRef.current = setTimeout(() => {
      flushQueue();
    }, 4000);
  };

  // Enqueue an operator message. Starts/resets a 4s timer;
  // if no more messages arrive, the queue is flushed to the fan.
  const sendMessage = async () => {
    if (!inputText.trim() || isTyping || !selectedScenario) return;

    const userMsg = { role: "operator", content: inputText.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setPendingQueue((prev) => [...prev, userMsg.content]);
    setInputText("");
    setMessageCount((c) => c + 1);
    startOrResetQueueTimer();
    // Keep focus on input so operator can chain messages
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // "Invia ora" — skip the 4s wait and send immediately
  const sendNow = () => {
    flushQueue();
  };

  // Called when the operator picks a creator from the persona modal
  const startScenarioWithCreator = async (scenario, creator) => {
    setSelectedScenario(scenario);
    setSelectedCreator(creator);
    const archetype = pickRandomArchetype();
    setSelectedArchetype(archetype);
    setPendingScenario(null);
    setMessages([]);
    setMessageCount(0);
    setMaxMessages(scenario.maxMessages || 6);
    setSessionScore(null);
    setSessionFeedback(null);
    setFeedbackRating(null);
    setFeedbackComment("");
    setFeedbackSent(false);
    setPendingQueue([]);
    setFanState({ interest: 5, trust: 5, irritation: 0, attachment: 3 });
    setScreen("scenario-play");

    setIsTyping(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "operator",
              content: "[Inizia la conversazione con il tuo primo messaggio da fan, come descritto nel tuo personaggio.]",
            },
          ],
          scenarioId: scenario.id,
          creatorId: creator?.id,
          archetypeId: archetype?.id,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages([{ role: "fan", content: data.reply }]);
      }
    } catch (e) {
      console.error("Opening fan msg error:", e);
    } finally {
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const endScenario = async () => {
    if (!selectedScenario) return;
    setIsTyping(true);

    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          scenarioId: selectedScenario.id,
          creatorId: selectedCreator?.id,
          archetypeId: selectedArchetype?.id,
        }),
      });
      const data = await res.json();

      if (data.score) {
        const s = data.score;
        setSessionScore({
          score: s.overall ?? 0,
          xp: s.xp ?? 0,
          stars: s.stars ?? Math.max(1, Math.min(5, Math.round((s.overall || 0) / 20))),
          skills: s.skills,
          goal_achieved: s.goal_achieved,
          compliance: s.compliance || null,
          compliance_fail: !!s.compliance_fail,
          signals: s.signals || null,
        });
        setSessionFeedback({
          strengths: s.strengths || [],
          improvements: s.improvements || [],
          best_message: s.best_message,
          worst_message: s.worst_message,
          tip: s.tip,
        });

        // Il profilo è persistito server-side da /api/score (atomico col
        // punteggio). Qui solo aggiornamento ottimistico per feedback immediato;
        // il valore autorevole riarriva da /api/profile al prossimo load.
        if (s.skills || typeof s.xp === "number") {
          setOperatorXP((prev) => {
            const nextXp = prev + (s.xp || 0);
            setOperatorLevel(Math.floor(nextXp / 500) + 1);
            return nextXp;
          });
          if (s.skills) {
            setSkillDimensions((prev) => {
              const next = { ...prev };
              Object.keys(s.skills).forEach((k) => {
                // Media pesata 70% vecchio / 30% nuovo (o valore nuovo se primo).
                next[k] = prev[k] > 0
                  ? Math.round(prev[k] * 0.7 + s.skills[k] * 0.3)
                  : s.skills[k];
              });
              return next;
            });
          }
          setRecentScenarios((prev) => [
            {
              title: selectedScenario.title,
              score: s.overall,
              xp: s.xp,
              date: "Oggi",
            },
            ...prev,
          ].slice(0, 5));
        }
      } else {
        setSessionScore({ score: 0, xp: 0, stars: 1 });
        setSessionFeedback({
          strengths: [],
          improvements: ["Errore nella valutazione. Riprova."],
        });
      }
    } catch (err) {
      console.error("endScenario error:", err);
      setSessionScore({ score: 0, xp: 0, stars: 1 });
      setSessionFeedback({
        strengths: [],
        improvements: ["Errore di rete. Riprova."],
      });
    } finally {
      setIsTyping(false);
    }
  };

  const submitQuickChallenge = async () => {
    if (!quickChallengeResponse.trim()) return;
    const currentChallenge = QUICK_CHALLENGES[quickChallengeIndex % QUICK_CHALLENGES.length];
    if (!currentChallenge) return;

    setIsTyping(true);
    try {
      const res = await fetch("/api/quick-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: currentChallenge.id,
          operatorResponse: quickChallengeResponse,
        }),
      });
      const data = await res.json();
      if (data.evaluation) {
        setQuickChallengeEval(data.evaluation);
      } else {
        setQuickChallengeEval({
          stars: 0,
          good: "",
          improve: data.error || "Errore nella valutazione",
          examples: [],
        });
      }
    } catch (err) {
      console.error("quickChallenge error:", err);
      setQuickChallengeEval({
        stars: 0,
        good: "",
        improve: "Errore di rete",
        examples: [],
      });
    } finally {
      setIsTyping(false);
    }
  };

  const nextQuickChallenge = () => {
    setQuickChallengeIndex((prev) => prev + 1);
    setQuickChallengeResponse("");
    setQuickChallengeEval(null);
  };

  // -------------------------------------------------------
  // SCREEN: HOME
  // -------------------------------------------------------

  if (screen === "home" && isLoaded) {
    const activeCerts = (certifications || []).filter((c) => c.level > 0);
    const ROLE_LABEL = {
      admin: "Admin",
      sales_manager: "Sales manager",
      qa_reviewer: "QA reviewer",
      team_lead: "Team lead",
      operator: "Operatore",
    };
    const nonOpRoles = (roleInfo?.roles || []).filter((r) => r !== "operator");
    const shownRoles = nonOpRoles.slice(0, 2);
    const extraRoles = nonOpRoles.length - shownRoles.length;
    const TIER_LABEL = { junior: "Junior", senior: "Senior", master: "Master" };

    const headChips = (
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {league?.tier && league.tier !== "unranked" && (
          <Link href="/leaderboard/leghe"
            title={`Lega ${league.tier} — stagione ${league.seasonKey}${league.rank ? ` • rank #${league.rank}` : ""}`}
            style={CHIP}>
            Lega {league.tier}
          </Link>
        )}
        {seniority?.tier && (
          <span title={`Livello ${seniority.tier} — ${seniority.stats?.totalSessions || 0} sessioni`}
            style={seniority.tier === "master" ? CHIP_ACCENT : CHIP}>
            {TIER_LABEL[seniority.tier] || seniority.tier}
          </span>
        )}
        {activeCerts.length > 0 && (
          <Link href="/profilo/certificazioni" title="Le tue certificazioni per creator" style={CHIP}>
            Certificazioni <span style={NUM}>{activeCerts.slice(0, 3).map((c) => `L${c.level}`).join(" ")}</span>
            <span style={{ ...NUM, color: CP.textPrimary }}>· {activeCerts.length}</span>
          </Link>
        )}
        {shownRoles.map((r) => {
          const isCustom = typeof r === "string" && r.startsWith("c:");
          const label = isCustom ? r.slice(2) : ROLE_LABEL[r] || r;
          return (
            <span key={r} title={roleInfo?.team ? `Team: ${roleInfo.team}` : "Senza team"} style={CHIP}>
              {label}
            </span>
          );
        })}
        {extraRoles > 0 && (
          <span title={nonOpRoles.join(", ")} style={{ fontSize: 12, color: CP.textMuted }}>+{extraRoles}</span>
        )}
        {nonOpRoles.length > 0 && roleInfo?.team && (
          <span style={{ fontSize: 12, color: CP.textMuted }}>· {roleInfo.team}</span>
        )}
      </div>
    );

    return (
      <div style={WRAP}>
        <PageHead
          title={`Ciao, ${operatorName}`}
          subtitle="Qui ti alleni sulle chat: scenari guidati con un fan simulato, sfide veloci e l'allenamento del giorno."
          actions={headChips}
        />

        {/* Hero: progresso + azioni principali (sx) · card giocatore (dx) */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 28, alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 420px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {!meStats && !meStatsErr && !(meStatsRaw && !meStats) && (
              <div style={{ ...card, padding: "16px 18px" }}>
                <XPBarSkeleton />
              </div>
            )}
            {!meStats && (meStatsErr || meStatsRaw) && (
              <Notice>Non riesco a caricare i tuoi progressi in questo momento. Puoi comunque allenarti: i risultati vengono salvati.</Notice>
            )}
            {meStats && (() => {
              const THRESHOLDS = { junior: 30, senior: 100 };
              const NEXT = { junior: "Senior", senior: "Master", master: null };
              const tier = seniority?.tier || "junior";
              const sess = seniority?.stats?.totalSessions ?? meStats.totalSessions ?? 0;
              const nextTier = NEXT[tier];
              const isMax = !nextTier;
              const target = tier === "junior" ? THRESHOLDS.junior : tier === "senior" ? THRESHOLDS.senior : sess;
              const prev = tier === "junior" ? 0 : tier === "senior" ? THRESHOLDS.junior : THRESHOLDS.senior;
              const pct = isMax ? 100 : Math.min(100, Math.max(0, Math.round(((sess - prev) / (target - prev)) * 100)));
              const remaining = isMax ? 0 : Math.max(0, target - sess);
              return (
                <div style={{ ...card, padding: "16px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, fontSize: 13, gap: 12 }}>
                    <span style={{ color: CP.textPrimary, fontWeight: 500 }}>Livello {TIER_LABEL[tier] || tier}</span>
                    {!isMax && <span style={{ color: CP.textMuted }}>prossimo: {nextTier}</span>}
                    {isMax && <span style={{ color: CP.accentSoftText }}>Livello massimo</span>}
                  </div>
                  <div style={{ position: "relative", height: 10, background: CP.surfaceAlt, borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: CP.accent, transition: "width .5s ease" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8, fontSize: 12, gap: 12, ...NUM }}>
                    <span style={{ color: CP.textSecondary }}>{sess}{!isMax ? `/${target}` : ""} sessioni</span>
                    {!isMax && <span style={{ color: CP.textMuted }}>{remaining} al prossimo livello</span>}
                  </div>
                </div>
              );
            })()}

            {/* Azioni principali */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <button
                onClick={() => setScreen("training-hub")}
                style={{ ...card, background: CP.accent, border: `1px solid ${CP.accent}`, padding: "16px 18px", cursor: "pointer", textAlign: "left", color: CP.accentInk, fontFamily: FONTS.body }}
              >
                <div style={{ fontSize: 13, opacity: 0.85 }}>Entra in</div>
                <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", marginTop: 2 }}>Allenamento</div>
                <div style={{ fontSize: 13, marginTop: 4, opacity: 0.85 }}>Scenari guidati con coaching AI</div>
              </button>
              <button
                onClick={() => {
                  setQuickChallengeIndex(0);
                  setQuickChallengeResponse("");
                  setQuickChallengeEval(null);
                  setScreen("quick-challenge");
                }}
                style={{ ...CLICK_CARD, padding: "16px 18px" }}
                {...hoverBorder}
              >
                <div style={{ fontSize: 13, color: CP.accentSoftText }}>Sfida</div>
                <div style={{ fontSize: 20, fontWeight: 500, marginTop: 2 }}>Veloce</div>
                <div style={{ fontSize: 13, marginTop: 4, color: CP.textMuted }}>3 msg · 30s</div>
              </button>
            </div>
          </div>

          {/* Card giocatore (scheletro finché meStats non è arrivato) */}
          <div style={{ flex: "0 1 320px", minWidth: 0, display: "flex", justifyContent: "center", margin: "0 auto" }}>
            {meStats ? (
              (() => {
                const POS = { operator: "OP", team_lead: "TL", sales_manager: "SM", qa_reviewer: "QA", admin: "AD" };
                const primary = roleInfo?.roles?.find((r) => POS[r]) || roleInfo?.role || "operator";
                const leagueTier = league?.tier || "unranked";
                const seniorityTier = seniority?.tier || "junior";
                return (
                  <PlayerCard
                    name={operatorName}
                    position={POS[primary] || "OP"}
                    overall={meStats.overall}
                    skills={meStats.skills}
                    league={leagueTier}
                    seniority={seniorityTier}
                    certifications={certifications}
                    totalSessions={meStats.totalSessions}
                    compact={true}
                  />
                );
              })()
            ) : (
              !meStatsErr && !meStatsRaw && <PlayerCardSkeleton compact={true} />
            )}
          </div>
        </div>

        {/* Allenamento del giorno */}
        {dailyDrill?.drill?.scenario && (
          <section
            style={{
              ...card,
              borderLeft: `3px solid ${dailyDrill.completed ? CP.accentGreen : CP.accent}`,
              padding: "16px 18px",
              marginBottom: 28,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 14,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>Allenamento del giorno</h2>
                {dailyDrill.mandatory && !dailyDrill.completed && <span style={CHIP_ACCENT}>Obbligatorio</span>}
                {!dailyDrill.mandatory && !dailyDrill.completed && <span style={CHIP}>Opzionale</span>}
                {dailyDrill.streak > 0 && (
                  <span style={{ ...CHIP, ...NUM }}>{dailyDrill.streak} {dailyDrill.streak === 1 ? "giorno" : "giorni"} di fila</span>
                )}
              </div>
              <div style={{ color: CP.textPrimary, fontSize: 14 }}>
                {dailyDrill.completed ? "Completato per oggi, ottimo lavoro." : dailyDrill.drill.scenario.title}
              </div>
              {!dailyDrill.completed && (
                <div style={{ color: CP.textMuted, fontSize: 13, marginTop: 4 }}>
                  Completa lo scenario di oggi per non interrompere la serie.
                </div>
              )}
            </div>
            {!dailyDrill.completed && (
              <button
                onClick={() => {
                  const cat = TRAINING_CATEGORIES.find((c) => c.id === dailyDrill.drill.scenario.categoryId);
                  if (cat) {
                    setSelectedCategory(cat);
                    setScreen("category-detail");
                  }
                }}
                style={BTN_PRIMARY}
              >
                Inizia ora →
              </button>
            )}
          </section>
        )}

        {/* Certificazioni per creator */}
        {CREATOR_PERSONAS?.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>Certificazioni per creator</h2>
              <Link href="/profilo/certificazioni" style={{ fontSize: 13, color: CP.accentSoftText, textDecoration: "none" }}>
                Vedi tutte →
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {CREATOR_PERSONAS.map((cr) => {
                const cert = certByCreator?.[cr.id];
                const lvl = cert?.level || 0;
                const unlocked = lvl > 0;
                const levelLabel = unlocked ? (cert?.meta?.label || `L${lvl}`) : "Da sbloccare";
                const sess = cert?.sessions || 0;
                const avg = cert?.avgOverall || 0;
                const NEXT_THRESH = { 0: { s: 10, a: 65, label: "L1" }, 1: { s: 25, a: 75, label: "L2" }, 2: { s: 50, a: 85, label: "L3" }, 3: null };
                const next = NEXT_THRESH[lvl];
                const progress = next ? Math.min(100, Math.round((sess / next.s) * 100)) : 100;
                return (
                  <div
                    key={cr.id}
                    style={{
                      ...card,
                      border: `1px solid ${unlocked ? alpha(CP.accent, "55") : CP.border}`,
                      padding: "12px 14px",
                      opacity: unlocked ? 1 : 0.8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary, lineHeight: 1.3 }}>{cr.name}</div>
                        <div style={{ fontSize: 12, color: unlocked ? CP.accentSoftText : CP.textMuted, marginTop: 2 }}>{levelLabel}</div>
                      </div>
                      {!unlocked && <Lock size={16} color={CP.textMuted} style={{ flexShrink: 0 }} />}
                      {unlocked && <span style={{ ...CHIP_ACCENT, ...NUM }}>L{lvl}</span>}
                    </div>
                    <div style={{ height: 6, background: CP.surfaceAlt, borderRadius: 999, overflow: "hidden", marginBottom: 6 }}>
                      <div style={{ width: `${progress}%`, height: "100%", background: unlocked ? CP.accent : CP.textMuted, transition: "width .4s ease" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: CP.textMuted, ...NUM }}>
                      <span>{sess} sessioni · media {avg || "—"}</span>
                      <span>{next ? `→ ${next.label}` : "Massimo"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Altre sezioni */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 28 }}>
          <button onClick={() => setScreen("profile")} style={CLICK_CARD} {...hoverBorder}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>La tua card</div>
            <div style={{ fontSize: 13, color: CP.textMuted }}>Statistiche e progressi</div>
          </button>

          {/* Area admin — solo per chi può aprire l'Hub (prima la vedevano anche gli operatori) */}
          {canSee("/admin", whoamiRaw?.capabilities, !!whoamiRaw?.admin) && whoamiRaw?.authenticated && (
            <Link href="/admin" style={CLICK_CARD} {...hoverBorder}>
              <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Area admin</div>
              <div style={{ fontSize: 13, color: CP.textMuted }}>Accessi, classifiche, dashboard dei sales manager</div>
            </Link>
          )}

          {/* Playbook — libreria formativa visibile a tutti gli operatori */}
          <Link href="/playbook" style={CLICK_CARD} {...hoverBorder}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Playbook</div>
            <div style={{ fontSize: 13, color: CP.textMuted }}>Libreria di esempi reali per la tua formazione</div>
          </Link>
        </div>

        {/* Attività recente (solo questa sessione del browser) */}
        <section>
          <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>Attività recente</h2>
          {recentScenarios.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: CP.textMuted }}>
              Qui compaiono gli scenari che completi mentre questa pagina è aperta.
            </p>
          ) : (
            <div style={{ ...card, overflow: "hidden" }}>
              {recentScenarios.map((scenario, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderTop: i > 0 ? `1px solid ${CP.borderSoft}` : "none",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: CP.textPrimary }}>{scenario.title}</div>
                    <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>{scenario.date}</div>
                  </div>
                  <div style={{ textAlign: "right", ...NUM }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary }}>{scenario.score}%</div>
                    <div style={{ fontSize: 12, color: CP.textMuted }}>+{scenario.xp} XP</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // -------------------------------------------------------
  // SCREEN: TRAINING HUB
  // -------------------------------------------------------

  if (screen === "training-hub" && isLoaded) {
    return (
      <div style={WRAP}>
        <PageHead
          title="Allenamento"
          subtitle="Scegli una categoria: ognuna ha scenari di chat con un fan simulato, dal più semplice al più difficile."
          actions={<BackButton onClick={() => setScreen("home")} />}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {TRAINING_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat);
                setScreen("scenario-list");
              }}
              style={CLICK_CARD}
              {...hoverBorder}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>{cat.name}</h2>
                <div style={{ display: "flex", gap: 4, paddingTop: 6 }} aria-label={`Difficoltà ${cat.difficulty} su 5`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: i < cat.difficulty ? CP.accent : CP.border,
                      }}
                    />
                  ))}
                </div>
              </div>
              <p style={{ margin: "0 0 14px", color: CP.textSecondary, fontSize: 14, lineHeight: 1.5 }}>{cat.description}</p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderTop: `1px solid ${CP.borderSoft}`,
                  paddingTop: 10,
                  fontSize: 13,
                  ...NUM,
                }}
              >
                <span style={{ color: CP.textMuted }}>{getScenariosForCategory(cat.id).length} scenari</span>
                <span style={{ color: CP.textSecondary }}>Difficoltà {cat.difficulty}/5</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // SCREEN: SCENARIO LIST
  // -------------------------------------------------------

  if (screen === "scenario-list" && selectedCategory && isLoaded) {
    const scenarioCards = getScenariosForCategory(selectedCategory.id);

    return (
      <div style={WRAP}>
        {/* Scelta della creator */}
        {pendingScenario && (
          <div
            onClick={() => setPendingScenario(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: alpha(CP.bgSunken, "cc"),
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                ...card,
                padding: "22px 22px 18px",
                maxWidth: 720,
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              <h2 style={{ margin: "0 0 4px", color: CP.textPrimary, fontSize: 20, fontWeight: 500 }}>
                Scegli la creator per questo scenario
              </h2>
              <p style={{ margin: "0 0 18px", color: CP.textSecondary, fontSize: 14, lineHeight: 1.5 }}>
                &ldquo;{pendingScenario.title}&rdquo;: il tono da usare cambia in base alla creator.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {CREATOR_PERSONAS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => startScenarioWithCreator(pendingScenario, c)}
                    style={{ ...CLICK_CARD, padding: "14px 16px" }}
                    {...hoverBorder}
                  >
                    <div style={{ fontWeight: 500, color: CP.textPrimary, fontSize: 15, marginBottom: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {c.name}
                      {certByCreator[c.id]?.level > 0 && (
                        <span title={`Certificazione ${certByCreator[c.id].meta?.label || ""}`} style={{ ...CHIP_ACCENT, padding: "1px 8px", ...NUM }}>
                          L{certByCreator[c.id].level}
                        </span>
                      )}
                    </div>
                    <div style={{ color: CP.accentSoftText, fontSize: 12, marginBottom: 6 }}>{c.archetype}</div>
                    <div style={{ color: CP.textMuted, fontSize: 13, lineHeight: 1.4 }}>
                      {c.shortDescription.substring(0, 90)}...
                    </div>
                    {/* Emoji tipiche della creator: contenuto didattico (come scrive lei), non decorazione */}
                    <div style={{ marginTop: 8, fontSize: 16 }}>
                      {(c.emojis.primary || []).slice(0, 5).join(" ")}
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setPendingScenario(null)} style={{ ...BTN_SECONDARY, marginTop: 16 }}>
                Annulla
              </button>
            </div>
          </div>
        )}

        <PageHead
          title={selectedCategory.name}
          subtitle={`${selectedCategory.description}. Scegli uno scenario, poi la creator con cui giocarlo.`}
          actions={<BackButton onClick={() => setScreen("training-hub")} />}
        />

        {scenarioCards.length === 0 && (
          <Notice>Questa categoria non ha ancora scenari. Torna indietro e scegline un&apos;altra.</Notice>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {scenarioCards.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => {
                setPendingScenario(scenario);
              }}
              style={CLICK_CARD}
              {...hoverBorder}
            >
              <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>{scenario.title}</h2>
              <p style={{ margin: "0 0 14px", color: CP.textSecondary, fontSize: 14, lineHeight: 1.5 }}>{scenario.description}</p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderTop: `1px solid ${CP.borderSoft}`,
                  paddingTop: 10,
                  fontSize: 13,
                  ...NUM,
                }}
              >
                <span style={{ color: CP.textMuted }}>Difficoltà {scenario.difficulty}/5</span>
                <span style={{ color: CP.textSecondary }}>{scenario.maxMessages || 6} turni</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // SCREEN: SCENARIO PLAY
  // -------------------------------------------------------

  if (screen === "scenario-play" && selectedScenario && isLoaded) {
    const irritated = (fanState.irritation || 0) > 0;
    return (
      <div
        style={{
          background: CP.bg,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          fontFamily: FONTS.body,
        }}
      >
        {/* Barra in alto */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "12px 20px",
            borderBottom: `1px solid ${CP.border}`,
            background: CP.surface,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>{selectedScenario.title}</h1>
          <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
            {/* Stato del fan: aggiornato dal simulatore a ogni risposta */}
            <span title="Interesse del fan" style={{ color: CP.textMuted }}>
              Interesse <span style={{ color: CP.textPrimary, fontWeight: 500, ...NUM }}>{fanState.interest}</span>
            </span>
            <span title="Fiducia del fan" style={{ color: CP.textMuted }}>
              Fiducia <span style={{ color: CP.textPrimary, fontWeight: 500, ...NUM }}>{fanState.trust}</span>
            </span>
            <span title="Irritazione del fan" style={{ color: CP.textMuted }}>
              Irritazione <span style={{ color: irritated ? CP.accentRed : CP.textPrimary, fontWeight: 500, ...NUM }}>{fanState.irritation}</span>
            </span>
            <span title="Attaccamento (leva esclusività + dipendenza)" style={{ color: CP.textMuted }}>
              Attaccamento <span style={{ color: CP.textPrimary, fontWeight: 500, ...NUM }}>{fanState.attachment ?? 3}</span>
            </span>
            {selectedCreator && <span style={CHIP_ACCENT}>{selectedCreator.name}</span>}
            {selectedArchetype && (
              <span title={`${selectedArchetype.name} — ${selectedArchetype.profile}`} style={CHIP}>
                {selectedArchetype.name}
              </span>
            )}
            <span style={{ color: CP.textSecondary, ...NUM }}>
              {messageCount} {messageCount === 1 ? "messaggio" : "messaggi"}
            </span>
            <button
              onClick={endScenario}
              disabled={messageCount < 3}
              title={messageCount < 3 ? "Servono almeno 3 messaggi per terminare" : undefined}
              style={{ ...(messageCount < 3 ? BTN_OFF : BTN_PRIMARY), padding: "8px 16px" }}
            >
              Termina
            </button>
          </div>
        </div>

        {/* Conversazione */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: msg.role === "operator" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "min(70%, 560px)",
                  minWidth: 0,
                  padding: "10px 14px",
                  borderRadius: 14,
                  fontSize: 14,
                  lineHeight: 1.5,
                  overflowWrap: "anywhere",
                  background: msg.role === "operator" ? CP.accent : CP.surface,
                  border: msg.role === "operator" ? `1px solid ${CP.accent}` : `1px solid ${CP.border}`,
                  color: msg.role === "operator" ? CP.accentInk : CP.textPrimary,
                  borderBottomRightRadius: msg.role === "operator" ? 4 : 14,
                  borderBottomLeftRadius: msg.role === "operator" ? 14 : 4,
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isTyping && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }} aria-label="Il fan sta scrivendo">
              {[0, 0.2, 0.4].map((d) => (
                <div
                  key={d}
                  style={{
                    width: 8,
                    height: 8,
                    background: CP.textMuted,
                    borderRadius: "50%",
                    animation: `bounce 1.4s infinite ${d}s`,
                  }}
                />
              ))}
            </div>
          )}

          {sessionScore && (
            <div style={{ ...card, borderLeft: `3px solid ${CP.accentGreen}`, padding: "12px 16px", marginTop: 8 }}>
              <p style={{ margin: 0, fontWeight: 500, color: CP.textPrimary, fontSize: 14 }}>
                Scenario completato. Apri i risultati per vedere com&apos;è andata.
              </p>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Scrittura */}
        {!sessionScore && (
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${CP.border}`, background: CP.surface }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <input
                ref={inputRef}
                type="text"
                placeholder={pendingQueue.length > 0 ? "Scrivi un altro messaggio..." : "Scrivi un messaggio..."}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                autoFocus
                style={{ ...INPUT, flex: "1 1 220px", minWidth: 0, padding: "10px 14px" }}
              />
              <button
                onClick={sendMessage}
                disabled={!inputText.trim() || isTyping}
                style={!inputText.trim() ? BTN_OFF : BTN_PRIMARY}
              >
                Invia
              </button>
              {pendingQueue.length > 0 && !isTyping && (
                <button
                  onClick={sendNow}
                  title="Invia subito al fan senza aspettare il timer"
                  style={{ ...BTN_SECONDARY, color: CP.accentSoftText, borderColor: alpha(CP.accent, "55") }}
                >
                  Invia ora →
                </button>
              )}
            </div>
            {pendingQueue.length > 0 && queueCountdown > 0 && !isTyping && (
              <p style={{ margin: "6px 0 0", color: CP.accentSoftText, fontSize: 13, ...NUM }}>
                {pendingQueue.length} {pendingQueue.length === 1 ? "messaggio in coda" : "messaggi in coda"} · il fan risponde tra {queueCountdown}s (scrivi ancora per aggiungerne un altro)
              </p>
            )}
            {messageCount >= 15 && pendingQueue.length === 0 && !isTyping && (
              <p style={{ margin: "6px 0 0", color: CP.textMuted, fontSize: 13 }}>
                Conversazione lunga: quando vuoi, clicca &ldquo;Termina&rdquo; per vedere i risultati.
              </p>
            )}
            <CoachPanel
              draft={inputText}
              scenarioId={selectedScenario?.id}
              creatorId={selectedCreator?.id}
              archetypeId={selectedArchetype?.id}
              fanState={fanState}
              onApplyAlternative={(text) => setInputText(text)}
            />
          </div>
        )}

        {sessionScore && (
          <div
            style={{
              padding: "14px 20px",
              borderTop: `1px solid ${CP.border}`,
              background: CP.surface,
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => {
                setMessages([
                  {
                    role: "fan",
                    content: "Ciao! Sono nuovo qui, mi piace molto il tuo profilo 👀",
                  },
                ]);
                setMessageCount(1);
                setSessionScore(null);
                setInputText("");
              }}
              style={BTN_SECONDARY}
            >
              Riprova
            </button>
            <button onClick={() => setScreen("scenario-results")} style={BTN_PRIMARY}>
              Vedi risultati
            </button>
          </div>
        )}

        <style>{`
          @keyframes bounce {
            0%, 80%, 100% { opacity: 0.3; }
            40% { opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // -------------------------------------------------------
  // SCREEN: SCENARIO RESULTS
  // -------------------------------------------------------

  if (screen === "scenario-results" && sessionScore && isLoaded) {
    const stars = sessionScore.stars || 3;
    return (
      <div style={{ ...WRAP, maxWidth: 800 }}>
        <PageHead
          title="Risultato dello scenario"
          subtitle={selectedScenario?.title ? `${selectedScenario.title}: cosa è andato bene e cosa allenare la prossima volta.` : "Cosa è andato bene e cosa allenare la prossima volta."}
        />

        {/* Punteggio */}
        <section style={{ ...card, padding: "22px", marginBottom: 14, textAlign: "center" }}>
          <Stars value={stars} />
          <div style={{ fontSize: 56, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1, color: CP.textPrimary, margin: "12px 0 6px", ...NUM }}>
            {sessionScore.score}%
          </div>
          <p style={{ margin: 0, color: CP.textSecondary, fontSize: 15 }}>
            Hai guadagnato <span style={{ color: CP.accentSoftText, fontWeight: 500, ...NUM }}>+{sessionScore.xp} XP</span>
          </p>
        </section>

        {/* Compliance fail — riga rossa violata: azzera il risultato */}
        {sessionScore.compliance_fail && (
          <FeedbackBox title="Violazione compliance: sessione azzerata" tone="bad">
            <p style={{ margin: "0 0 8px", color: CP.textPrimary, fontSize: 14, lineHeight: 1.5 }}>
              Hai superato una riga rossa. Sul lavoro vero questo congela le promozioni: qui la sessione non dà XP, a prescindere da quanto è andata bene la chat.
            </p>
            {(sessionScore.compliance?.violations || []).length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 20, color: CP.accentRed, fontSize: 14 }}>
                {sessionScore.compliance.violations.map((v, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{v}</li>
                ))}
              </ul>
            )}
          </FeedbackBox>
        )}

        {/* Feedback */}
        {sessionFeedback && (
          <>
            <FeedbackBox title="Cosa hai fatto bene" tone="good">
              <BulletList items={sessionFeedback.strengths} empty="Il coach non ha segnalato punti di forza in questa sessione." />
            </FeedbackBox>
            <FeedbackBox title="Dove migliorare">
              <BulletList items={sessionFeedback.improvements} empty="Nessun punto da migliorare segnalato." />
            </FeedbackBox>
          </>
        )}

        {sessionScore?.signals && (
          <div style={{ marginBottom: 14, textAlign: "left" }}>
            <SignalsPanel data={sessionScore.signals} />
          </div>
        )}

        {/* Feedback sulla valutazione AI */}
        <section style={{ ...card, padding: "16px 18px", marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 4px", color: CP.textPrimary, fontSize: 16, fontWeight: 500 }}>
            La valutazione ti sembra corretta?
          </h2>
          <p style={{ margin: "0 0 12px", color: CP.textMuted, fontSize: 13 }}>
            Il tuo parere aiuta a migliorare il coach AI.
          </p>
          {feedbackSent ? (
            <p style={{ color: CP.textPrimary, fontSize: 14, margin: 0 }}>Grazie per il feedback.</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <button
                  onClick={() => setFeedbackRating("up")}
                  aria-pressed={feedbackRating === "up"}
                  style={{
                    ...BTN_SECONDARY,
                    padding: "8px 16px",
                    background: feedbackRating === "up" ? alpha(CP.accentGreen, "22") : CP.surface,
                    borderColor: feedbackRating === "up" ? CP.accentGreen : CP.border,
                  }}
                >
                  Giusta
                </button>
                <button
                  onClick={() => setFeedbackRating("down")}
                  aria-pressed={feedbackRating === "down"}
                  style={{
                    ...BTN_SECONDARY,
                    padding: "8px 16px",
                    background: feedbackRating === "down" ? alpha(CP.accentRed, "22") : CP.surface,
                    borderColor: feedbackRating === "down" ? CP.accentRed : CP.border,
                  }}
                >
                  Sbagliata
                </button>
              </div>
              {feedbackRating && (
                <>
                  <textarea
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    placeholder="Dicci perché (facoltativo, ma molto utile)..."
                    style={{
                      ...INPUT,
                      width: "100%",
                      boxSizing: "border-box",
                      minHeight: 70,
                      padding: 12,
                      marginBottom: 10,
                      resize: "vertical",
                    }}
                  />
                  {feedbackError && (
                    <Notice danger>Invio non riuscito: controlla la connessione e riprova.</Notice>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        setFeedbackError(false);
                        await fetch("/api/evaluation-feedback", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            scenarioId: selectedScenario?.id,
                            rating: feedbackRating,
                            comment: feedbackComment,
                            scoreSnapshot: sessionScore,
                            messages,
                          }),
                        });
                        setFeedbackSent(true);
                      } catch (err) {
                        console.error("Feedback error:", err);
                        setFeedbackError(true);
                      }
                    }}
                    style={{ ...BTN_PRIMARY, padding: "8px 18px" }}
                  >
                    Invia feedback
                  </button>
                </>
              )}
            </>
          )}
        </section>

        {/* Azioni */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => setScreen("training-hub")} style={BTN_SECONDARY}>
            Torna all&apos;allenamento
          </button>
          <button
            onClick={() => {
              setSelectedScenario(null);
              setScreen("scenario-list");
            }}
            style={BTN_PRIMARY}
          >
            Prossimo scenario →
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // SCREEN: QUICK CHALLENGE
  // -------------------------------------------------------

  if (screen === "quick-challenge" && isLoaded) {
    const challenges = QUICK_CHALLENGES;
    const currentChallenge = challenges[quickChallengeIndex % challenges.length];

    return (
      <div style={{ ...WRAP, maxWidth: 760 }}>
        <PageHead
          title="Sfida veloce"
          subtitle="Una situazione e un messaggio del fan: scrivi la tua risposta e ricevi subito un giudizio con esempi."
          actions={<BackButton onClick={() => setScreen("home")} />}
        />

        <p style={{ color: CP.textMuted, fontSize: 13, margin: "0 0 14px", ...NUM }}>
          Sfida {quickChallengeIndex + 1} di 10
        </p>

        {!currentChallenge && (
          <Notice>Nessuna sfida disponibile al momento.</Notice>
        )}

        {currentChallenge && !quickChallengeEval ? (
          <>
            {/* Situazione */}
            <section style={{ ...card, padding: "16px 18px", marginBottom: 16 }}>
              <div style={{ color: CP.textMuted, fontSize: 13, marginBottom: 6 }}>Situazione</div>
              <p style={{ margin: 0, color: CP.textPrimary, fontSize: 16, fontWeight: 500, lineHeight: 1.5 }}>
                {currentChallenge.situation}
              </p>
            </section>

            {/* Messaggio del fan */}
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
              <div
                style={{
                  background: CP.surface,
                  border: `1px solid ${CP.border}`,
                  padding: "10px 14px",
                  borderRadius: 14,
                  borderBottomLeftRadius: 4,
                  maxWidth: "min(80%, 520px)",
                }}
              >
                <p style={{ margin: 0, color: CP.textPrimary, fontSize: 14, lineHeight: 1.5 }}>{currentChallenge.fanMessage}</p>
              </div>
            </div>

            {/* Risposta */}
            <textarea
              placeholder="Scrivi la tua risposta..."
              value={quickChallengeResponse}
              onChange={(e) => setQuickChallengeResponse(e.target.value)}
              style={{
                ...INPUT,
                width: "100%",
                boxSizing: "border-box",
                padding: 14,
                fontSize: 15,
                resize: "vertical",
                minHeight: 100,
                marginBottom: 14,
              }}
            />

            <button
              onClick={submitQuickChallenge}
              disabled={!quickChallengeResponse.trim() || isTyping}
              style={{ ...(!quickChallengeResponse.trim() ? BTN_OFF : BTN_PRIMARY), width: "100%", padding: "12px 18px" }}
            >
              {isTyping ? "Valutazione in corso..." : "Valuta la risposta"}
            </button>
          </>
        ) : currentChallenge ? (
          <>
            <div style={{ marginBottom: 16, textAlign: "center" }}>
              <Stars value={quickChallengeEval.stars} size={24} />
            </div>

            <FeedbackBox title="Cosa hai fatto bene" tone="good">
              <p style={{ margin: 0, color: CP.textPrimary, fontSize: 14, lineHeight: 1.55 }}>{quickChallengeEval.good || "—"}</p>
            </FeedbackBox>

            <FeedbackBox title="Cosa migliorare">
              <p style={{ margin: 0, color: CP.textPrimary, fontSize: 14, lineHeight: 1.55 }}>{quickChallengeEval.improve}</p>
            </FeedbackBox>

            <section style={{ ...card, padding: "16px 18px", marginBottom: 20 }}>
              <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>Esempi di risposte ideali</h2>
              {quickChallengeEval.examples.length === 0 ? (
                <p style={{ margin: 0, fontSize: 14, color: CP.textMuted }}>Nessun esempio per questa sfida.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {quickChallengeEval.examples.map((ex, i) => (
                    <p
                      key={i}
                      style={{
                        margin: 0,
                        padding: "10px 12px",
                        background: CP.surfaceAlt,
                        borderRadius: 8,
                        color: CP.textPrimary,
                        fontSize: 14,
                        lineHeight: 1.5,
                      }}
                    >
                      &ldquo;{ex}&rdquo;
                    </p>
                  ))}
                </div>
              )}
            </section>

            <button onClick={nextQuickChallenge} style={{ ...BTN_PRIMARY, width: "100%", padding: "12px 18px" }}>
              Prossima sfida →
            </button>
          </>
        ) : null}
      </div>
    );
  }

  // -------------------------------------------------------
  // SCREEN: OPERATOR PROFILE
  // -------------------------------------------------------

  if (screen === "profile" && isLoaded) {
    const strengths = SKILL_DIMENSIONS.filter((d) => skillDimensions[d.key] >= 75)
      .map((d) => d.label);
    const improvements = SKILL_DIMENSIONS.filter((d) => skillDimensions[d.key] < 75)
      .map((d) => d.label);

    return (
      <div style={{ ...WRAP, maxWidth: 1000 }}>
        <PageHead
          title="La tua card"
          subtitle="Il tuo livello, i punti esperienza e le competenze valutate dal coach AI negli scenari."
          actions={<BackButton onClick={() => setScreen("home")} />}
        />

        {/* Scheda */}
        <section
          style={{
            ...card,
            padding: "20px 22px",
            marginBottom: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ color: CP.textSecondary, fontSize: 13, marginBottom: 4 }}>Operatore</div>
            <div style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 500, color: CP.textPrimary, letterSpacing: "-0.01em" }}>
              {operatorName}
            </div>
            <div style={{ color: CP.textSecondary, fontSize: 14, ...NUM }}>
              Livello {operatorLevel} · {operatorXP} XP totali
            </div>
          </div>
          <div>
            <div style={{ color: CP.textSecondary, fontSize: 13 }}>Certificazione</div>
            <div style={{ marginTop: 4, fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>Senior Operator</div>
          </div>
        </section>

        {/* Competenze */}
        <section style={{ ...card, padding: "18px 20px", marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>Competenze</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {SKILL_DIMENSIONS.map((dim) => (
              <div key={dim.key}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
                  <span style={{ color: CP.textPrimary }}>{dim.label}</span>
                  <span style={{ color: CP.textPrimary, fontWeight: 500, ...NUM }}>{skillDimensions[dim.key]}%</span>
                </div>
                <div style={{ background: CP.surfaceAlt, borderRadius: 999, height: 8, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      background: CP.accent,
                      width: `${skillDimensions[dim.key]}%`,
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Punti di forza e aree di miglioramento */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 14 }}>
          <FeedbackBox title="Punti di forza" tone="good">
            <BulletList items={strengths} empty="Nessuna competenza è ancora sopra 75: continua ad allenarti." />
          </FeedbackBox>
          <FeedbackBox title="Aree di miglioramento">
            <BulletList items={improvements} empty="Tutte le competenze sono sopra 75." />
          </FeedbackBox>
        </div>

        {/* Attività recente */}
        <section style={{ ...card, padding: "16px 18px" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 500, color: CP.textPrimary }}>Attività recente</h2>
          {recentScenarios.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: CP.textMuted }}>
              Qui compaiono gli scenari che completi mentre questa pagina è aperta.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recentScenarios.map((scenario, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 0",
                    borderTop: i > 0 ? `1px solid ${CP.borderSoft}` : "none",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: CP.textPrimary }}>{scenario.title}</div>
                    <div style={{ marginTop: 2, color: CP.textMuted, fontSize: 12 }}>{scenario.date}</div>
                  </div>
                  <div style={{ color: CP.textPrimary, fontWeight: 500, fontSize: 14, ...NUM }}>{scenario.score}%</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // Caricamento
  if (!isLoaded) {
    return (
      <div style={WRAP}>
        <p style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</p>
      </div>
    );
  }

  // Schermata non riconosciuta (es. stato incoerente): mai pagina bianca.
  return (
    <div style={WRAP}>
      <Notice>Questa schermata non è disponibile. Torna alla home per continuare ad allenarti.</Notice>
      <button onClick={() => setScreen("home")} style={BTN_SECONDARY}>
        <ArrowLeft size={15} /> Torna alla home
      </button>
    </div>
  );
}
