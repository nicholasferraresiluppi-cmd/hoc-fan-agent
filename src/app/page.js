"use client";

import { useState, useRef, useEffect } from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import { TRAINING_SCENARIOS, QUICK_CHALLENGES } from "@/lib/training-scenarios";

// =========================================================
// CONSTANTS & DATA
// =========================================================

const HOC_COLORS = {
  bgDark: "#0D0D0D",
  white: "#FFFFFF",
  orange: "#F5A623",
  purple: "#8B5CF6",
  gray: "#888888",
  gradient: "linear-gradient(135deg, #8B5CF6 0%, #F5A623 100%)",
};

const SKILL_DIMENSIONS = [
  { key: "naturalezza", label: "Naturalezza", color: "#10B981" },
  { key: "conversione", label: "Conversione", color: "#F5A623" },
  { key: "gestione_obiezioni", label: "Gestione Obiezioni", color: "#8B5CF6" },
  { key: "retention", label: "Retention", color: "#3B82F6" },
  { key: "tono", label: "Tono", color: "#EC4899" },
];

// Category metadata — scenarios counts are computed dynamically from TRAINING_SCENARIOS
const TRAINING_CATEGORIES = [
  {
    id: "le-basi-della-chat",
    name: "Le Basi",
    icon: "🏁",
    description: "Opening conversations, no spam",
    difficulty: 1,
  },
  {
    id: "mass-e-conversione",
    name: "Mass & Conversione",
    icon: "📢",
    description: "Convert mass messages to sales",
    difficulty: 2,
  },
  {
    id: "custom-e-upsell",
    name: "Custom & Upsell",
    icon: "💎",
    description: "Upselling and custom content",
    difficulty: 3,
  },
  {
    id: "recuperi-e-retention",
    name: "Recuperi & Retention",
    icon: "🔓",
    description: "Save cancellation-risk fans",
    difficulty: 4,
  },
  {
    id: "script-avanzati",
    name: "Script Avanzati",
    icon: "🚀",
    description: "Advanced closing patterns",
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
    conversione: 0,
    gestione_obiezioni: 0,
    retention: 0,
    tono: 0,
  });
  const [recentScenarios, setRecentScenarios] = useState([]);

  // Chat State
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [maxMessages, setMaxMessages] = useState(1);
  const [sessionScore, setSessionScore] = useState(null);
  const [sessionFeedback, setSessionFeedback] = useState(null);
  const chatEndRef = useRef(null);

  // Quick Challenge State
  const [quickChallengeIndex, setQuickChallengIndex] = useState(0);
  const [quickChallengeResponse, setQuickChallengeResponse] = useState("");
  const [quickChallengeEval, setQuickChallengeEval] = useState(null);

  // Leaderboard State
  const [leaderboard] = useState([
    
    
    
  ]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------

  const sendMessage = async () => {
    if (!inputText.trim() || isTyping || !selectedScenario) return;

    const userMsg = { role: "operator", content: inputText.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText("");
    setMessageCount(messageCount + 1);
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          scenarioId: selectedScenario.id,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages((prev) => [...prev, { role: "fan", content: data.reply }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "fan", content: "[Errore risposta fan - riprova]" },
        ]);
      }
    } catch (err) {
      console.error("sendMessage error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "fan", content: "[Errore di rete - riprova]" },
      ]);
    } finally {
      setIsTyping(false);
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
        });
        setSessionFeedback({
          strengths: s.strengths || [],
          improvements: s.improvements || [],
          best_message: s.best_message,
          worst_message: s.worst_message,
          tip: s.tip,
        });

        // Update profile persistently
        if (s.skills && s.xp) {
          try {
            await fetch("/api/profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                skills: s.skills,
                xpEarned: s.xp,
              }),
            });
            setOperatorXP((prev) => prev + (s.xp || 0));
            setSkillDimensions((prev) => {
              const next = { ...prev };
              Object.keys(s.skills).forEach((k) => {
                // Weighted average: 70% old, 30% new (or if first time, use new directly)
                next[k] = prev[k] > 0
                  ? Math.round(prev[k] * 0.7 + s.skills[k] * 0.3)
                  : s.skills[k];
              });
              return next;
            });
            setRecentScenarios((prev) => [
              {
                title: selectedScenario.title,
                score: s.overall,
                xp: s.xp,
                date: "Oggi",
              },
              ...prev,
            ].slice(0, 5));
          } catch (e) {
            console.error("Profile update error:", e);
          }
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
    return (
      <div style={{ backgroundColor: HOC_COLORS.bgDark, minHeight: "100vh" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1.5rem 2rem",
            borderBottom: `1px solid ${HOC_COLORS.purple}20`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ fontSize: "2rem" }}>🌴</span>
            <h1
              style={{
                margin: 0,
                fontSize: "1.75rem",
                fontWeight: 900,
                color: HOC_COLORS.white,
              }}
            >
              HOC Fan Agent
            </h1>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              cursor: "pointer",
            }}
          >
            <span style={{ color: HOC_COLORS.gray, fontSize: "0.9rem" }}>
              {operatorName}
            </span>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-9 h-9",
                },
              }}
            />
          </div>
        </div>

        {/* Main Content */}
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
          {/* Greeting */}
          <div style={{ marginBottom: "3rem" }}>
            <h2
              style={{
                fontSize: "2rem",
                fontWeight: 900,
                color: HOC_COLORS.white,
                margin: "0 0 0.5rem 0",
              }}
            >
              Ciao, {operatorName}! 👋
            </h2>
            <p style={{ color: HOC_COLORS.gray, margin: 0 }}>
              Continua il tuo percorso di formazione
            </p>
          </div>

          {/* Quick Stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "1.5rem",
              marginBottom: "3rem",
            }}
          >
            {/* XP Card */}
            <div
              style={{
                background: `linear-gradient(135deg, ${HOC_COLORS.purple}30 0%, ${HOC_COLORS.orange}20 100%)`,
                border: `2px solid ${HOC_COLORS.purple}`,
                borderRadius: "1rem",
                padding: "1.5rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <p
                    style={{
                      color: HOC_COLORS.gray,
                      fontSize: "0.85rem",
                      margin: "0 0 0.5rem 0",
                      textTransform: "uppercase",
                    }}
                  >
                    Livello
                  </p>
                  <h3 style={{ margin: 0, fontSize: "2.5rem", fontWeight: 900 }}>
                    {operatorLevel}
                  </h3>
                </div>
                <span style={{ fontSize: "3rem" }}>⭐</span>
              </div>
              <div style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
                <div
                  style={{
                    background: `${HOC_COLORS.purple}40`,
                    height: "8px",
                    borderRadius: "4px",
                    marginBottom: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      background: HOC_COLORS.orange,
                      height: "100%",
                      borderRadius: "4px",
                      width: "65%",
                    }}
                  />
                </div>
                <p style={{ margin: 0, color: HOC_COLORS.gray, fontSize: "0.8rem" }}>
                  {operatorXP} XP
                </p>
              </div>
            </div>

            {/* Leaderboard Preview */}
            <div
              style={{
                background: `${HOC_COLORS.purple}10`,
                border: `2px solid ${HOC_COLORS.purple}30`,
                borderRadius: "1rem",
                padding: "1.5rem",
              }}
            >
              <p
                style={{
                  color: HOC_COLORS.gray,
                  fontSize: "0.85rem",
                  margin: "0 0 1rem 0",
                  textTransform: "uppercase",
                }}
              >
                🏆 Top 3 Operatori
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {leaderboard.map((op, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.5rem",
                      borderRadius: "0.5rem",
                      background: `${HOC_COLORS.white}05`,
                    }}
                  >
                    <span style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                      {["🥇", "🥈", "🥉"][i]} {op.name}
                    </span>
                    <span style={{ color: HOC_COLORS.orange, fontWeight: 700 }}>
                      L{op.level}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Sections */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "2rem",
              marginBottom: "3rem",
            }}
          >
            {/* Training - Main CTA */}
            <div
              onClick={() => setScreen("training-hub")}
              style={{
                background: HOC_COLORS.gradient,
                border: `5px solid ${HOC_COLORS.orange}`,
                borderRadius: "1.5rem",
                padding: "2rem",
                cursor: "pointer",
                transition: "transform 0.3s, box-shadow 0.3s",
                gridColumn: "span 2",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = `0 20px 40px ${HOC_COLORS.orange}40`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <h3
                style={{
                  margin: "0 0 0.5rem 0",
                  fontSize: "1.5rem",
                  fontWeight: 900,
                  color: HOC_COLORS.white,
                }}
              >
                💪 Training
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "1.1rem",
                  color: `${HOC_COLORS.white}e0`,
                  fontWeight: 500,
                }}
              >
                Migliora le tue skill con scenari guidati
              </p>
            </div>

            {/* Quick Challenge */}
            <div
              onClick={() => {
                setQuickChallengeIndex(0);
                setQuickChallengeResponse("");
                setQuickChallengeEval(null);
                setScreen("quick-challenge");
              }}
              style={{
                background: `${HOC_COLORS.orange}15`,
                border: `5px solid ${HOC_COLORS.orange}`,
                borderRadius: "1.5rem",
                padding: "1.5rem",
                cursor: "pointer",
                transition: "transform 0.3s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-4px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            >
              <h3
                style={{
                  margin: "0 0 0.5rem 0",
                  fontSize: "1.25rem",
                  fontWeight: 900,
                  color: HOC_COLORS.orange,
                }}
              >
                ⚡ Sfida Veloce
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.95rem",
                  color: HOC_COLORS.gray,
                }}
              >
                3 messaggi, 30 secondi
              </p>
            </div>

            {/* Profile */}
            <div
              onClick={() => setScreen("profile")}
              style={{
                background: `${HOC_COLORS.purple}15`,
                border: `5px solid ${HOC_COLORS.purple}`,
                borderRadius: "1.5rem",
                padding: "1.5rem",
                cursor: "pointer",
                transition: "transform 0.3s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-4px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            >
              <h3
                style={{
                  margin: "0 0 0.5rem 0",
                  fontSize: "1.25rem",
                  fontWeight: 900,
                  color: HOC_COLORS.purple,
                }}
              >
                📊 Il tuo Profilo
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.95rem",
                  color: HOC_COLORS.gray,
                }}
              >
                Statistiche e progressi
              </p>
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: 900,
                color: HOC_COLORS.white,
                marginBottom: "1rem",
              }}
            >
              📋 Attività Recente
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {recentScenarios.map((scenario, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "1rem",
                    background: `${HOC_COLORS.white}08`,
                    border: `1px solid ${HOC_COLORS.white}10`,
                    borderRadius: "0.75rem",
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: "0 0 0.25rem 0",
                        fontWeight: 600,
                        color: HOC_COLORS.white,
                      }}
                    >
                      {scenario.title}
                    </p>
                    <p style={{ margin: 0, color: HOC_COLORS.gray, fontSize: "0.85rem" }}>
                      {scenario.date}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p
                      style={{
                        margin: "0 0 0.25rem 0",
                        fontWeight: 700,
                        color: HOC_COLORS.orange,
                      }}
                    >
                      {scenario.score}%
                    </p>
                    <p style={{ margin: 0, color: HOC_COLORS.gray, fontSize: "0.85rem" }}>
                      +{scenario.xp} XP
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // SCREEN: TRAINING HUB
  // -------------------------------------------------------

  if (screen === "training-hub" && isLoaded) {
    return (
      <div style={{ backgroundColor: HOC_COLORS.bgDark, minHeight: "100vh" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1.5rem 2rem",
            borderBottom: `1px solid ${HOC_COLORS.purple}20`,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "1.75rem",
                fontWeight: 900,
                color: HOC_COLORS.white,
              }}
            >
              💪 Training Hub
            </h1>
            <p style={{ color: HOC_COLORS.gray, margin: "0.5rem 0 0 0" }}>
              Scegli una categoria per iniziare
            </p>
          </div>
          <button
            onClick={() => setScreen("home")}
            style={{
              background: "transparent",
              border: "none",
              color: HOC_COLORS.gray,
              fontSize: "1.2rem",
              cursor: "pointer",
              padding: "0.5rem 1rem",
              transition: "color 0.3s",
            }}
            onMouseEnter={(e) => (e.target.style.color = HOC_COLORS.white)}
            onMouseLeave={(e) => (e.target.style.color = HOC_COLORS.gray)}
          >
            ← Indietro
          </button>
        </div>

        {/* Categories Grid */}
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "2rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {TRAINING_CATEGORIES.map((cat) => (
            <div
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat);
                setScreen("scenario-list");
              }}
              style={{
                background: `${HOC_COLORS.white}08`,
                border: `5px solid ${HOC_COLORS.purple}`,
                borderRadius: "1rem",
                padding: "1.5rem",
                cursor: "pointer",
                transition: "all 0.3s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = HOC_COLORS.orange;
                e.currentTarget.style.transform = "translateY(-4px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = HOC_COLORS.purple;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "1rem",
                }}
              >
                <span style={{ fontSize: "2.5rem" }}>{cat.icon}</span>
                <div
                  style={{
                    display: "flex",
                    gap: "0.25rem",
                  }}
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: i < cat.difficulty ? HOC_COLORS.orange : `${HOC_COLORS.white}20`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <h3
                style={{
                  margin: "0 0 0.5rem 0",
                  fontSize: "1.1rem",
                  fontWeight: 900,
                  color: HOC_COLORS.white,
                }}
              >
                {cat.name}
              </h3>
              <p
                style={{
                  margin: "0 0 1rem 0",
                  color: HOC_COLORS.gray,
                  fontSize: "0.9rem",
                }}
              >
                {cat.description}
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderTop: `1px solid ${HOC_COLORS.white}10`,
                  paddingTop: "1rem",
                }}
              >
                <span style={{ color: HOC_COLORS.gray, fontSize: "0.85rem" }}>
                  {getScenariosForCategory(cat.id).length} scenari
                </span>
                <span style={{ color: HOC_COLORS.orange, fontWeight: 700 }}>
                  Difficoltà {cat.difficulty}/5
                </span>
              </div>
            </div>
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
      <div style={{ backgroundColor: HOC_COLORS.bgDark, minHeight: "100vh" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1.5rem 2rem",
            borderBottom: `1px solid ${HOC_COLORS.purple}20`,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "1.75rem",
                fontWeight: 900,
                color: HOC_COLORS.white,
              }}
            >
              {selectedCategory.icon} {selectedCategory.name}
            </h1>
            <p style={{ color: HOC_COLORS.gray, margin: "0.5rem 0 0 0" }}>
              {selectedCategory.description}
            </p>
          </div>
          <button
            onClick={() => setScreen("training-hub")}
            style={{
              background: "transparent",
              border: "none",
              color: HOC_COLORS.gray,
              fontSize: "1.2rem",
              cursor: "pointer",
              padding: "0.5rem 1rem",
              transition: "color 0.3s",
            }}
            onMouseEnter={(e) => (e.target.style.color = HOC_COLORS.white)}
            onMouseLeave={(e) => (e.target.style.color = HOC_COLORS.gray)}
          >
            ← Indietro
          </button>
        </div>

        {/* Scenario Cards */}
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "2rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {scenarioCards.map((scenario) => (
            <div
              key={scenario.id}
              onClick={async () => {
                setSelectedScenario(scenario);
                setMessages([]);
                setMessageCount(0);
                setMaxMessages(scenario.maxMessages || 6);
                setSessionScore(null);
                setSessionFeedback(null);
                setScreen("scenario-play");

                // Fetch opening message from fan (AI-generated)
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
                }
              }}
              style={{
                background: `${HOC_COLORS.white}08`,
                border: `2px solid ${HOC_COLORS.purple}`,
                borderRadius: "1rem",
                padding: "1.5rem",
                cursor: "pointer",
                transition: "all 0.3s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = HOC_COLORS.orange;
                e.currentTarget.style.transform = "translateY(-4px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = HOC_COLORS.purple;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <h3
                style={{
                  margin: "0 0 0.5rem 0",
                  fontWeight: 900,
                  color: HOC_COLORS.white,
                }}
              >
                {scenario.title}
              </h3>
              <p
                style={{
                  margin: "0 0 1rem 0",
                  color: HOC_COLORS.gray,
                  fontSize: "0.9rem",
                }}
              >
                {scenario.description}
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderTop: `1px solid ${HOC_COLORS.white}10`,
                  paddingTop: "1rem",
                }}
              >
                <span style={{ color: HOC_COLORS.gray, fontSize: "0.85rem" }}>
                  Difficoltà: {scenario.difficulty}/5
                </span>
                <span style={{ color: HOC_COLORS.orange, fontWeight: 700 }}>
                  {scenario.maxMessages || 6} turni
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // SCREEN: SCENARIO PLAY
  // -------------------------------------------------------

  if (screen === "scenario-play" && selectedScenario && isLoaded) {
    return (
      <div
        style={{
          backgroundColor: HOC_COLORS.bgDark,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 1.5rem",
            borderBottom: `1px solid ${HOC_COLORS.purple}20`,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontWeight: 900,
                color: HOC_COLORS.white,
              }}
            >
              {selectedScenario.title}
            </h3>
          </div>
          <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
            <span style={{ color: HOC_COLORS.orange, fontWeight: 700 }}>
              {messageCount}/{maxMessages}
            </span>
            <button
              onClick={endScenario}
              disabled={messageCount < 3}
              style={{
                background: messageCount < 3 ? `${HOC_COLORS.gray}40` : HOC_COLORS.orange,
                border: "none",
                color: HOC_COLORS.bgDark,
                padding: "0.6rem 1.2rem",
                borderRadius: "0.5rem",
                fontWeight: 700,
                cursor: messageCount < 3 ? "not-allowed" : "pointer",
                transition: "opacity 0.3s",
              }}
            >
              Termina
            </button>
          </div>
        </div>

        {/* Chat Area */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
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
                  maxWidth: "70%",
                  padding: "1rem",
                  borderRadius: "1rem",
                  background:
                    msg.role === "operator"
                      ? HOC_COLORS.gradient
                      : `${HOC_COLORS.white}10`,
                  color: HOC_COLORS.white,
                  borderBottomRightRadius: msg.role === "operator" ? "0.25rem" : "1rem",
                  borderBottomLeftRadius: msg.role === "operator" ? "1rem" : "0.25rem",
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isTyping && (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  background: HOC_COLORS.orange,
                  borderRadius: "50%",
                  animation: "bounce 1.4s infinite",
                }}
              />
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  background: HOC_COLORS.orange,
                  borderRadius: "50%",
                  animation: "bounce 1.4s infinite 0.2s",
                }}
              />
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  background: HOC_COLORS.orange,
                  borderRadius: "50%",
                  animation: "bounce 1.4s infinite 0.4s",
                }}
              />
            </div>
          )}

          {sessionScore && (
            <div
              style={{
                background: `${HOC_COLORS.green}20`,
                border: `2px solid ${HOC_COLORS.green}`,
                borderRadius: "1rem",
                padding: "1.5rem",
                marginTop: "1rem",
              }}
            >
              <p style={{ margin: 0, fontWeight: 700, color: "#10B981" }}>
                Scenario completato!
              </p>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        {!sessionScore && (
          <div style={{ padding: "1.5rem", borderTop: `1px solid ${HOC_COLORS.purple}20` }}>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem" }}>
              <input
                type="text"
                placeholder="Scrivi un messaggio..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                disabled={isTyping || messageCount >= maxMessages}
                style={{
                  flex: 1,
                  padding: "0.75rem 1rem",
                  background: `${HOC_COLORS.white}10`,
                  border: `1px solid ${HOC_COLORS.purple}30`,
                  borderRadius: "0.5rem",
                  color: HOC_COLORS.white,
                  fontSize: "0.95rem",
                  outline: "none",
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!inputText.trim() || isTyping || messageCount >= maxMessages}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: !inputText.trim() ? `${HOC_COLORS.gray}40` : HOC_COLORS.orange,
                  border: "none",
                  color: HOC_COLORS.bgDark,
                  borderRadius: "0.5rem",
                  fontWeight: 700,
                  cursor: !inputText.trim() ? "not-allowed" : "pointer",
                  transition: "opacity 0.3s",
                }}
              >
                Invia
              </button>
            </div>
            {messageCount >= maxMessages && (
              <p style={{ margin: "0.5rem 0 0 0", color: HOC_COLORS.gray, fontSize: "0.85rem" }}>
                Hai raggiunto il numero massimo di messaggi. Clicca "Termina" per vedere i risultati.
              </p>
            )}
          </div>
        )}

        {sessionScore && (
          <div
            style={{
              padding: "1.5rem",
              borderTop: `1px solid ${HOC_COLORS.purple}20`,
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
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
              style={{
                padding: "0.75rem 1.5rem",
                background: `${HOC_COLORS.white}15`,
                border: `2px solid ${HOC_COLORS.white}30`,
                color: HOC_COLORS.white,
                borderRadius: "0.5rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Riprova
            </button>
            <button
              onClick={() => setScreen("scenario-results")}
              style={{
                padding: "0.75rem 1.5rem",
                background: HOC_COLORS.gradient,
                border: "none",
                color: HOC_COLORS.bgDark,
                borderRadius: "0.5rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Vedi Risultati
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
      <div style={{ backgroundColor: HOC_COLORS.bgDark, minHeight: "100vh" }}>
        <div
          style={{
            maxWidth: "800px",
            margin: "0 auto",
            padding: "3rem 2rem",
            textAlign: "center",
          }}
        >
          {/* Stars */}
          <div style={{ fontSize: "3rem", marginBottom: "1.5rem" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i}>{i < stars ? "⭐" : "☆"}</span>
            ))}
          </div>

          {/* Score */}
          <h1
            style={{
              fontSize: "3.5rem",
              fontWeight: 900,
              margin: "0 0 0.5rem 0",
              background: HOC_COLORS.gradient,
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {sessionScore.score}%
          </h1>
          <p style={{ color: HOC_COLORS.gray, fontSize: "1.1rem", marginBottom: "2rem" }}>
            Hai guadagnato <span style={{ color: HOC_COLORS.orange, fontWeight: 700 }}>
              +{sessionScore.xp} XP
            </span>
          </p>

          {/* Feedback */}
          {sessionFeedback && (
            <>
              <div
                style={{
                  background: `${HOC_COLORS.white}08`,
                  border: `2px solid #10B981`,
                  borderRadius: "1rem",
                  padding: "1.5rem",
                  marginBottom: "1.5rem",
                  textAlign: "left",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 1rem 0",
                    color: "#10B981",
                    fontWeight: 900,
                  }}
                >
                  💪 Cosa hai fatto bene
                </h3>
                <ul style={{ margin: 0, paddingLeft: "1.5rem", color: HOC_COLORS.white }}>
                  {sessionFeedback.strengths.map((s, i) => (
                    <li key={i} style={{ marginBottom: "0.5rem" }}>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              <div
                style={{
                  background: `${HOC_COLORS.orange}15`,
                  border: `2px solid ${HOC_COLORS.orange}`,
                  borderRadius: "1rem",
                  padding: "1.5rem",
                  marginBottom: "2rem",
                  textAlign: "left",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 1rem 0",
                    color: HOC_COLORS.orange,
                    fontWeight: 900,
                  }}
                >
                  📌 Dove migliorare
                </h3>
                <ul style={{ margin: 0, paddingLeft: "1.5rem", color: HOC_COLORS.white }}>
                  {sessionFeedback.improvements.map((imp, i) => (
                    <li key={i} style={{ marginBottom: "0.5rem" }}>
                      {imp}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => setScreen("training-hub")}
              style={{
                padding: "0.75rem 1.5rem",
                background: `${HOC_COLORS.white}15`,
                border: `2px solid ${HOC_COLORS.white}30`,
                color: HOC_COLORS.white,
                borderRadius: "0.5rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Torna al Training
            </button>
            <button
              onClick={() => {
                setSelectedScenario(null);
                setScreen("scenario-list");
              }}
              style={{
                padding: "0.75rem 1.5rem",
                background: HOC_COLORS.gradient,
                border: "none",
                color: HOC_COLORS.bgDark,
                borderRadius: "0.5rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Prossimo Scenario →
            </button>
          </div>
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
      <div style={{ backgroundColor: HOC_COLORS.bgDark, minHeight: "100vh" }}>
        <div
          style={{
            maxWidth: "700px",
            margin: "0 auto",
            padding: "2rem",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "2rem",
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: "1.75rem",
                fontWeight: 900,
                color: HOC_COLORS.white,
              }}
            >
              ⚡ Sfida Veloce
            </h1>
            <button
              onClick={() => setScreen("home")}
              style={{
                background: "transparent",
                border: "none",
                color: HOC_COLORS.gray,
                fontSize: "1rem",
                cursor: "pointer",
                padding: "0.5rem 1rem",
              }}
            >
              ← Indietro
            </button>
          </div>

          {/* Progress */}
          <p
            style={{
              color: HOC_COLORS.gray,
              fontSize: "0.9rem",
              marginBottom: "2rem",
            }}
          >
            {quickChallengeIndex + 1}/10 sfide completate
          </p>

          {!quickChallengeEval ? (
            <>
              {/* Situation */}
              <div
                style={{
                  background: `${HOC_COLORS.white}08`,
                  border: `2px solid ${HOC_COLORS.purple}`,
                  borderRadius: "1rem",
                  padding: "1.5rem",
                  marginBottom: "2rem",
                }}
              >
                <p
                  style={{
                    color: HOC_COLORS.gray,
                    fontSize: "0.9rem",
                    margin: "0 0 1rem 0",
                    textTransform: "uppercase",
                  }}
                >
                  Situazione
                </p>
                <p
                  style={{
                    margin: 0,
                    color: HOC_COLORS.white,
                    fontSize: "1.1rem",
                    fontWeight: 600,
                  }}
                >
                  {currentChallenge.situation}
                </p>
              </div>

              {/* Fan Message */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  marginBottom: "2rem",
                }}
              >
                <div
                  style={{
                    background: `${HOC_COLORS.white}10`,
                    padding: "1rem",
                    borderRadius: "1rem",
                    borderBottomLeftRadius: "0.25rem",
                    maxWidth: "60%",
                  }}
                >
                  <p style={{ margin: 0, color: HOC_COLORS.white }}>
                    {currentChallenge.fanMessage}
                  </p>
                </div>
              </div>

              {/* Response Input */}
              <textarea
                placeholder="Scrivi la tua risposta..."
                value={quickChallengeResponse}
                onChange={(e) => setQuickChallengeResponse(e.target.value)}
                style={{
                  width: "100%",
                  padding: "1rem",
                  background: `${HOC_COLORS.white}10`,
                  border: `1px solid ${HOC_COLORS.purple}30`,
                  borderRadius: "0.75rem",
                  color: HOC_COLORS.white,
                  fontSize: "1rem",
                  fontFamily: "'Poppins', sans-serif",
                  resize: "vertical",
                  minHeight: "100px",
                  marginBottom: "1.5rem",
                  outline: "none",
                }}
              />

              {/* Submit Button */}
              <button
                onClick={submitQuickChallenge}
                disabled={!quickChallengeResponse.trim() || isTyping}
                style={{
                  width: "100%",
                  padding: "1rem",
                  background: !quickChallengeResponse.trim()
                    ? `${HOC_COLORS.gray}40`
                    : HOC_COLORS.gradient,
                  border: "none",
                  color: HOC_COLORS.bgDark,
                  borderRadius: "0.75rem",
                  fontWeight: 700,
                  fontSize: "1rem",
                  cursor: !quickChallengeResponse.trim() ? "not-allowed" : "pointer",
                  transition: "opacity 0.3s",
                }}
              >
                {isTyping ? "Valutazione in corso..." : "Valuta Risposta"}
              </button>
            </>
          ) : (
            <>
              {/* Evaluation Results */}
              <div style={{ marginBottom: "2rem" }}>
                <div style={{ fontSize: "2rem", marginBottom: "1rem", textAlign: "center" }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i}>{i < quickChallengeEval.stars ? "⭐" : "☆"}</span>
                  ))}
                </div>
              </div>

              <div
                style={{
                  background: `#10B98120`,
                  border: `2px solid #10B981`,
                  borderRadius: "1rem",
                  padding: "1.5rem",
                  marginBottom: "1.5rem",
                }}
              >
                <p style={{ margin: "0 0 0.5rem 0", color: "#10B981", fontWeight: 700 }}>
                  ✅ Cosa hai fatto bene
                </p>
                <p style={{ margin: 0, color: HOC_COLORS.white }}>
                  {quickChallengeEval.good}
                </p>
              </div>

              <div
                style={{
                  background: `${HOC_COLORS.orange}20`,
                  border: `2px solid ${HOC_COLORS.orange}`,
                  borderRadius: "1rem",
                  padding: "1.5rem",
                  marginBottom: "2rem",
                }}
              >
                <p style={{ margin: "0 0 0.5rem 0", color: HOC_COLORS.orange, fontWeight: 700 }}>
                  💡 Cosa migliorare
                </p>
                <p style={{ margin: 0, color: HOC_COLORS.white }}>
                  {quickChallengeEval.improve}
                </p>
              </div>

              <div
                style={{
                  background: `${HOC_COLORS.purple}20`,
                  border: `2px solid ${HOC_COLORS.purple}`,
                  borderRadius: "1rem",
                  padding: "1.5rem",
                  marginBottom: "2rem",
                }}
              >
                <p style={{ margin: "0 0 1rem 0", color: HOC_COLORS.purple, fontWeight: 700 }}>
                  💭 Esempi di risposte ideali
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {quickChallengeEval.examples.map((ex, i) => (
                    <p
                      key={i}
                      style={{
                        margin: 0,
                        padding: "0.75rem",
                        background: `${HOC_COLORS.white}05`,
                        borderRadius: "0.5rem",
                        color: HOC_COLORS.white,
                        fontSize: "0.9rem",
                      }}
                    >
                      "{ex}"
                    </p>
                  ))}
                </div>
              </div>

              {/* Next Challenge Button */}
              <button
                onClick={nextQuickChallenge}
                style={{
                  width: "100%",
                  padding: "1rem",
                  background: HOC_COLORS.gradient,
                  border: "none",
                  color: HOC_COLORS.bgDark,
                  borderRadius: "0.75rem",
                  fontWeight: 700,
                  fontSize: "1rem",
                  cursor: "pointer",
                }}
              >
                Prossima Sfida →
              </button>
            </>
          )}
        </div>
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
      <div style={{ backgroundColor: HOC_COLORS.bgDark, minHeight: "100vh" }}>
        <div
          style={{
            maxWidth: "1000px",
            margin: "0 auto",
            padding: "2rem",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "2rem",
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: "1.75rem",
                fontWeight: 900,
                color: HOC_COLORS.white,
              }}
            >
              📊 Il Tuo Profilo
            </h1>
            <button
              onClick={() => setScreen("home")}
              style={{
                background: "transparent",
                border: "none",
                color: HOC_COLORS.gray,
                fontSize: "1rem",
                cursor: "pointer",
                padding: "0.5rem 1rem",
              }}
            >
              ← Indietro
            </button>
          </div>

          {/* Profile Card */}
          <div
            style={{
              background: HOC_COLORS.gradient,
              border: `5px solid ${HOC_COLORS.orange}`,
              borderRadius: "1.5rem",
              padding: "2rem",
              marginBottom: "2rem",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "2rem",
            }}
          >
            <div>
              <p
                style={{
                  color: `${HOC_COLORS.white}90`,
                  fontSize: "0.9rem",
                  margin: "0 0 0.5rem 0",
                  textTransform: "uppercase",
                }}
              >
                Operatore
              </p>
              <h2
                style={{
                  margin: "0 0 1rem 0",
                  fontSize: "2rem",
                  fontWeight: 900,
                  color: HOC_COLORS.white,
                }}
              >
                {operatorName}
              </h2>
              <p
                style={{
                  color: `${HOC_COLORS.white}80`,
                  margin: 0,
                }}
              >
                Livello {operatorLevel} • {operatorXP} XP totali
              </p>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "4rem", marginBottom: "0.5rem" }}>🎖️</span>
              <p style={{ margin: 0, color: `${HOC_COLORS.white}90`, fontSize: "0.9rem" }}>
                Certificazione{" "}
              </p>
              <p style={{ margin: "0.5rem 0 0 0", fontWeight: 700, color: HOC_COLORS.white }}>
                Senior Operator
              </p>
            </div>
          </div>

          {/* Skill Dimensions */}
          <div
            style={{
              background: `${HOC_COLORS.white}08`,
              border: `2px solid ${HOC_COLORS.purple}`,
              borderRadius: "1rem",
              padding: "2rem",
              marginBottom: "2rem",
            }}
          >
            <h3
              style={{
                margin: "0 0 1.5rem 0",
                fontSize: "1.25rem",
                fontWeight: 900,
                color: HOC_COLORS.white,
              }}
            >
              💪 Skill Dimensions
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {SKILL_DIMENSIONS.map((dim) => (
                <div key={dim.key}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        color: HOC_COLORS.white,
                      }}
                    >
                      {dim.label}
                    </span>
                    <span style={{ color: dim.color, fontWeight: 700 }}>
                      {skillDimensions[dim.key]}%
                    </span>
                  </div>
                  <div
                    style={{
                      background: `${HOC_COLORS.white}10`,
                      borderRadius: "0.5rem",
                      height: "10px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        background: dim.color,
                        width: `${skillDimensions[dim.key]}%`,
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Strengths & Improvements */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1.5rem",
              marginBottom: "2rem",
            }}
          >
            <div
              style={{
                background: `#10B98120`,
                border: `2px solid #10B981`,
                borderRadius: "1rem",
                padding: "1.5rem",
              }}
            >
              <h3
                style={{
                  margin: "0 0 1rem 0",
                  color: "#10B981",
                  fontWeight: 900,
                }}
              >
                💪 Punti di Forza
              </h3>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "1.5rem",
                  color: HOC_COLORS.white,
                }}
              >
                {strengths.map((s, i) => (
                  <li key={i} style={{ marginBottom: "0.5rem" }}>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <div
              style={{
                background: `${HOC_COLORS.orange}20`,
                border: `2px solid ${HOC_COLORS.orange}`,
                borderRadius: "1rem",
                padding: "1.5rem",
              }}
            >
              <h3
                style={{
                  margin: "0 0 1rem 0",
                  color: HOC_COLORS.orange,
                  fontWeight: 900,
                }}
              >
                📌 Aree di Miglioramento
              </h3>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "1.5rem",
                  color: HOC_COLORS.white,
                }}
              >
                {improvements.map((imp, i) => (
                  <li key={i} style={{ marginBottom: "0.5rem" }}>
                    {imp}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recent Activity */}
          <div
            style={{
              background: `${HOC_COLORS.white}08`,
              border: `2px solid ${HOC_COLORS.white}20`,
              borderRadius: "1rem",
              padding: "1.5rem",
            }}
          >
            <h3
              style={{
                margin: "0 0 1rem 0",
                fontSize: "1.1rem",
                fontWeight: 900,
                color: HOC_COLORS.white,
              }}
            >
              📋 Attività Recente
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {recentScenarios.map((scenario, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem",
                    background: `${HOC_COLORS.white}05`,
                    borderRadius: "0.5rem",
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, color: HOC_COLORS.white }}>
                      {scenario.title}
                    </p>
                    <p style={{ margin: "0.25rem 0 0 0", color: HOC_COLORS.gray, fontSize: "0.85rem" }}>
                      {scenario.date}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, color: HOC_COLORS.orange, fontWeight: 700 }}>
                      {scenario.score}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading State
  if (!isLoaded) {
    return (
      <div
        style={{
          backgroundColor: HOC_COLORS.bgDark,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <span style={{ fontSize: "3rem", marginBottom: "1rem", display: "block" }}>
            🌴
          </span>
          <p style={{ color: HOC_COLORS.gray }}>Caricamento...</p>
        </div>
      </div>
    );
  }

  return null;
}
