"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// =========================================================
// Fan profiles (mirrored client-side for UI display)
// =========================================================
const FAN_PROFILES = [
  {
    id: "curious_cold",
    name: "Fan Freddo Curioso",
    emoji: "🧊",
    description: "Segue la creator da poco, curioso ma distaccato. Risponde a monosillabi.",
    difficulty: 2,
    tags: ["Facile-Medio", "Escalation", "Apertura"],
  },
  {
    id: "emotional_attached",
    name: "Fan Affezionato Emotivo",
    emoji: "💕",
    description: "Fan di lunga data, legato emotivamente. Scrive molto, chiede attenzioni.",
    difficulty: 1,
    tags: ["Facile", "Emotivo", "Alto spender"],
  },
  {
    id: "price_objector",
    name: "Fan Obiettore sul Prezzo",
    emoji: "💸",
    description: "Gli piace la creator ma obietta SEMPRE sul prezzo. Vuole sconti.",
    difficulty: 3,
    tags: ["Medio", "Negoziazione", "Reframing"],
  },
  {
    id: "cancellation_risk",
    name: "Fan a Rischio Cancellazione",
    emoji: "🚪",
    description: "Sta per cancellare l'abbonamento. Disilluso, poco attivo. Il più difficile.",
    difficulty: 5,
    tags: ["Molto Difficile", "Retention", "Empatia"],
  },
  {
    id: "flirty_tirekicker",
    name: "Fan Provocatore / Scroccone",
    emoji: "😏",
    description: "Flirta molto, chiede contenuti gratis, prova a ottenere preview senza pagare.",
    difficulty: 4,
    tags: ["Difficile", "Controllo", "Sfida"],
  },
];

const DIFFICULTY_COLORS = {
  1: "bg-green-500/20 text-green-400 border-green-500/30",
  2: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  3: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  4: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  5: "bg-red-500/20 text-red-400 border-red-500/30",
};

const SIGNAL_STYLES = {
  green: { bg: "bg-emerald-500/20", border: "border-emerald-500/40", text: "text-emerald-400", dot: "bg-emerald-400", label: "Ottimo" },
  yellow: { bg: "bg-yellow-500/20", border: "border-yellow-500/40", text: "text-yellow-400", dot: "bg-yellow-400", label: "Ok" },
  red: { bg: "bg-red-500/20", border: "border-red-500/40", text: "text-red-400", dot: "bg-red-400", label: "Errore" },
};

// =========================================================
// Main App
// =========================================================
export default function Home() {
  const [screen, setScreen] = useState("landing"); // landing | setup | chat | scoring | results | analytics
  const [operatorName, setOperatorName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyValid, setApiKeyValid] = useState(null);
  const [selectedFan, setSelectedFan] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [score, setScore] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("screening");
  const [sessionHistory, setSessionHistory] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]); // {index, signal, tip, pattern_detected, score_delta}
  const [liveFeedback, setLiveFeedback] = useState(null); // feedback corrente visibile
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [analyticsData, setAnalyticsData] = useState({ ranking: [], sessions: [] });
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    const saved = typeof window !== "undefined" && localStorage.getItem("hoc_api_key");
    const savedName = typeof window !== "undefined" && localStorage.getItem("hoc_operator_name");
    if (saved) { setApiKey(saved); setApiKeyValid(true); }
    if (savedName) { setOperatorName(savedName); }
  }, []);

  // -------------------------------------------------------
  // API Key validation
  // -------------------------------------------------------
  const validateApiKey = async () => {
    if (!apiKey.startsWith("sk-ant-")) {
      setApiKeyValid(false);
      setError("La chiave deve iniziare con sk-ant-");
      return;
    }
    setError("");
    setApiKeyValid(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("hoc_api_key", apiKey);
      localStorage.setItem("hoc_operator_name", operatorName);
    }
  };

  // -------------------------------------------------------
  // Get real-time feedback (training mode only)
  // -------------------------------------------------------
  const getFeedback = useCallback(async (allMessages, operatorMessage, msgIndex) => {
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          fanProfileId: selectedFan.id,
          apiKey,
          lastOperatorMessage: operatorMessage,
        }),
      });
      const data = await res.json();
      if (data.feedback) {
        const fb = { ...data.feedback, index: msgIndex };
        setFeedbacks((prev) => [...prev, fb]);
        setLiveFeedback(fb);
        // Nascondi dopo 4 secondi
        setTimeout(() => setLiveFeedback(null), 4000);
      }
    } catch (e) {
      // Feedback fallisce silenziosamente
    }
  }, [selectedFan, apiKey]);

  // -------------------------------------------------------
  // Send message
  // -------------------------------------------------------
  const sendMessage = async () => {
    if (!inputText.trim() || isTyping) return;

    const operatorText = inputText.trim();
    const newMsg = { role: "operator", content: operatorText };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setInputText("");
    setIsTyping(true);
    setError("");

    // Feedback in tempo reale (solo training, in parallelo)
    if (mode === "training" && selectedFan) {
      getFeedback(updatedMessages, operatorText, updatedMessages.length - 1);
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          fanProfileId: selectedFan.id,
          apiKey,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Errore di connessione");
        setIsTyping(false);
        return;
      }

      const delay = 1000 + Math.random() * 2000;
      setTimeout(() => {
        setMessages((prev) => [...prev, { role: "fan", content: data.reply }]);
        setIsTyping(false);
      }, delay);
    } catch (err) {
      setError("Errore di rete. Controlla la connessione.");
      setIsTyping(false);
    }
  };

  // -------------------------------------------------------
  // Save session to KV
  // -------------------------------------------------------
  const saveSession = async (scoreData) => {
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorName,
          mode,
          fanProfileId: selectedFan.id,
          fanName: selectedFan.name,
          fanDifficulty: selectedFan.difficulty,
          messageCount: messages.length,
          messages,
          score: scoreData,
          feedbacks,
          duration: sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 1000) : 0,
        }),
      });
    } catch (e) {
      // Salvataggio fallisce silenziosamente
    }
  };

  // -------------------------------------------------------
  // End session and get score
  // -------------------------------------------------------
  const endSession = async () => {
    if (messages.length < 4) {
      setError("Servono almeno 4 messaggi per una valutazione.");
      return;
    }

    setScreen("scoring");
    setError("");

    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          fanProfileId: selectedFan.id,
          apiKey,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Errore nella valutazione");
        setScreen("chat");
        return;
      }

      setScore(data.score);

      // Salva nello storico locale
      setSessionHistory((prev) => [
        ...prev,
        {
          fan: selectedFan,
          score: data.score,
          messageCount: messages.length,
          timestamp: new Date().toLocaleString("it-IT"),
        },
      ]);

      // Salva nel database KV
      await saveSession(data.score);

      setScreen("results");
    } catch (err) {
      setError("Errore di rete durante la valutazione.");
      setScreen("chat");
    }
  };

  // -------------------------------------------------------
  // Start new session
  // -------------------------------------------------------
  const startNewSession = (fan) => {
    setSelectedFan(fan);
    setMessages([]);
    setScore(null);
    setFeedbacks([]);
    setLiveFeedback(null);
    setError("");
    setSessionStartTime(Date.now());
    setScreen("chat");

    setIsTyping(true);
    setTimeout(async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "operator", content: "[Il fan ha appena aperto la chat]" }],
            fanProfileId: fan.id,
            apiKey,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setMessages([{ role: "fan", content: data.reply }]);
        }
      } catch (e) {}
      setIsTyping(false);
    }, 1500);
  };

  // -------------------------------------------------------
  // Load analytics
  // -------------------------------------------------------
  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const [rankingRes, sessionsRes] = await Promise.all([
        fetch("/api/sessions/stats"),
        fetch("/api/sessions"),
      ]);
      const rankingData = await rankingRes.json();
      const sessionsData = await sessionsRes.json();
      setAnalyticsData({
        ranking: rankingData.ranking || [],
        sessions: sessionsData.sessions || [],
      });
    } catch (e) {
      setAnalyticsData({ ranking: [], sessions: [] });
    }
    setAnalyticsLoading(false);
  };

  // -------------------------------------------------------
  // Get feedback for a message by index
  // -------------------------------------------------------
  const getFeedbackForMessage = (index) => {
    return feedbacks.find((f) => f.index === index);
  };

  // -------------------------------------------------------
  // SCREEN: Landing
  // -------------------------------------------------------
  if (screen === "landing") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="max-w-lg w-full space-y-8 text-center">
          <div>
            <div className="text-5xl mb-4">🎭</div>
            <h1 className="text-3xl font-bold">HOC Fan Agent</h1>
            <p className="text-gray-400 mt-2">
              Simulatore AI per screening e training operatori
            </p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Il tuo nome"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition"
            />

            <div className="relative">
              <input
                type="password"
                placeholder="API Key Anthropic (sk-ant-...)"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setApiKeyValid(null);
                }}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition"
              />
              {apiKeyValid === true && (
                <span className="absolute right-3 top-3.5 text-green-400">✓</span>
              )}
              {apiKeyValid === false && (
                <span className="absolute right-3 top-3.5 text-red-400">✗</span>
              )}
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setMode("screening");
                  validateApiKey().then(() => {
                    if (operatorName.trim() && apiKey.startsWith("sk-ant-")) {
                      setScreen("setup");
                    }
                  });
                }}
                disabled={!operatorName.trim() || !apiKey.trim()}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-medium transition"
              >
                🎯 Screening
              </button>
              <button
                onClick={() => {
                  setMode("training");
                  validateApiKey().then(() => {
                    if (operatorName.trim() && apiKey.startsWith("sk-ant-")) {
                      setScreen("setup");
                    }
                  });
                }}
                disabled={!operatorName.trim() || !apiKey.trim()}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-medium transition"
              >
                💪 Training
              </button>
            </div>

            {/* Analytics button */}
            <button
              onClick={() => {
                if (operatorName.trim() && apiKey.startsWith("sk-ant-")) {
                  validateApiKey().then(() => {
                    loadAnalytics();
                    setScreen("analytics");
                  });
                }
              }}
              disabled={!operatorName.trim() || !apiKey.trim()}
              className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/50 disabled:text-gray-600 border border-gray-700 rounded-xl text-sm text-gray-300 transition"
            >
              📊 Dashboard Analytics
            </button>

            <p className="text-xs text-gray-500">
              La API key resta nel tuo browser. Non viene salvata da nessuna parte.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // SCREEN: Setup (Fan selection)
  // -------------------------------------------------------
  if (screen === "setup") {
    return (
      <div className="min-h-screen p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">
              {mode === "screening" ? "🎯 Screening Test" : "💪 Training Session"}
            </h2>
            <p className="text-gray-400 mt-1">
              {mode === "screening"
                ? "Scegli un fan. Hai una conversazione per dimostrare le tue skill."
                : "Scegli un fan su cui allenarti. Riceverai feedback in tempo reale."}
            </p>
          </div>
          <button
            onClick={() => setScreen("landing")}
            className="text-gray-400 hover:text-white transition"
          >
            ← Indietro
          </button>
        </div>

        <div className="grid gap-4">
          {FAN_PROFILES.map((fan) => (
            <button
              key={fan.id}
              onClick={() => startNewSession(fan)}
              className="w-full text-left p-5 bg-gray-800/50 border border-gray-700/50 rounded-xl hover:border-indigo-500/50 hover:bg-gray-800 transition group"
            >
              <div className="flex items-start gap-4">
                <span className="text-3xl">{fan.emoji}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg group-hover:text-indigo-400 transition">
                      {fan.name}
                    </h3>
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-2 h-2 rounded-full ${
                            i < fan.difficulty ? "bg-red-400" : "bg-gray-700"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm mt-1">{fan.description}</p>
                  <div className="flex gap-2 mt-3">
                    {fan.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          DIFFICULTY_COLORS[fan.difficulty]
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {sessionHistory.length > 0 && (
          <div className="mt-10">
            <h3 className="text-lg font-semibold mb-4 text-gray-300">
              📊 Sessioni di questa sessione
            </h3>
            <div className="space-y-2">
              {sessionHistory.map((session, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span>{session.fan.emoji}</span>
                    <span className="text-gray-300">{session.fan.name}</span>
                    <span className="text-gray-500">{session.messageCount} msg</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-emerald-400">C:{session.score.closer}</span>
                    <span className="text-indigo-400">B:{session.score.builder}</span>
                    <span className="text-red-400">S:{session.score.spammer}</span>
                    <span className="font-bold text-white">{session.score.overall}/100</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------
  // SCREEN: Chat (with real-time feedback in training)
  // -------------------------------------------------------
  if (screen === "chat") {
    return (
      <div className="h-screen flex flex-col max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{selectedFan.emoji}</span>
            <div>
              <h3 className="font-semibold">{selectedFan.name}</h3>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-gray-400">Online</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{messages.length} msg</span>
            <button
              onClick={endSession}
              className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm hover:bg-red-500/30 transition"
            >
              Termina e Valuta
            </button>
          </div>
        </div>

        {/* Live feedback banner (training only) */}
        {mode === "training" && liveFeedback && (
          <div
            className={`mx-4 mt-2 px-4 py-2 rounded-lg border text-sm flex items-center gap-3 transition-all ${
              SIGNAL_STYLES[liveFeedback.signal]?.bg
            } ${SIGNAL_STYLES[liveFeedback.signal]?.border}`}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${SIGNAL_STYLES[liveFeedback.signal]?.dot}`} />
            <span className={SIGNAL_STYLES[liveFeedback.signal]?.text}>
              {liveFeedback.tip}
            </span>
            {liveFeedback.pattern_detected && liveFeedback.pattern_detected !== "null" && (
              <span className="text-xs text-gray-400 ml-auto">
                🧠 {liveFeedback.pattern_detected}
              </span>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 chat-scroll">
          <div className="text-center py-3">
            <span className="text-xs text-gray-500 bg-gray-800/50 px-3 py-1 rounded-full">
              {mode === "screening"
                ? "🎯 Screening — Dimostra le tue skill"
                : "💪 Training — Feedback attivo"}
            </span>
          </div>

          {messages.map((msg, i) => {
            const fb = mode === "training" ? getFeedbackForMessage(i) : null;
            return (
              <div key={i}>
                <div
                  className={`flex ${
                    msg.role === "operator" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="flex flex-col items-end max-w-[75%]">
                    <div
                      className={`px-4 py-2.5 rounded-2xl ${
                        msg.role === "operator"
                          ? "bg-indigo-600 text-white rounded-br-md"
                          : "bg-gray-800 text-gray-100 rounded-bl-md"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {/* Feedback dot under operator messages */}
                    {fb && msg.role === "operator" && (
                      <div className="flex items-center gap-1.5 mt-1 mr-1">
                        <div className={`w-2 h-2 rounded-full ${SIGNAL_STYLES[fb.signal]?.dot}`} />
                        <span className={`text-xs ${SIGNAL_STYLES[fb.signal]?.text}`}>
                          {SIGNAL_STYLES[fb.signal]?.label}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-md flex gap-1.5">
                <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot" />
                <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot" />
                <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot" />
              </div>
            </div>
          )}

          {error && (
            <div className="text-center">
              <span className="text-xs text-red-400 bg-red-500/10 px-3 py-1 rounded-full">
                {error}
              </span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex gap-2">
            <input
              ref={inputRef}
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
              disabled={isTyping}
              className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={!inputText.trim() || isTyping}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl transition font-medium"
            >
              ↑
            </button>
          </div>
          {mode === "training" && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              💡 I pallini sotto i tuoi messaggi indicano la qualità: 🟢 ottimo 🟡 ok 🔴 errore
            </p>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // SCREEN: Scoring (loading)
  // -------------------------------------------------------
  if (screen === "scoring") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-6">
          <div className="text-5xl pulse-score">🧠</div>
          <h2 className="text-2xl font-bold">Analisi in corso...</h2>
          <p className="text-gray-400">
            Sto valutando la conversazione con {selectedFan.emoji}{" "}
            {selectedFan.name}
          </p>
          <div className="flex justify-center gap-2">
            <div className="w-2 h-2 bg-indigo-400 rounded-full typing-dot" />
            <div className="w-2 h-2 bg-indigo-400 rounded-full typing-dot" />
            <div className="w-2 h-2 bg-indigo-400 rounded-full typing-dot" />
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // SCREEN: Results
  // -------------------------------------------------------
  if (screen === "results" && score) {
    const getProfileColor = (label) => {
      if (label?.includes("Closer")) return "text-emerald-400";
      if (label?.includes("Builder")) return "text-indigo-400";
      if (label?.includes("Spammer")) return "text-red-400";
      return "text-yellow-400";
    };

    const getOverallGrade = (overall) => {
      if (overall >= 85) return { label: "Eccellente", color: "text-emerald-400", emoji: "🏆" };
      if (overall >= 70) return { label: "Buono", color: "text-green-400", emoji: "✅" };
      if (overall >= 55) return { label: "Sufficiente", color: "text-yellow-400", emoji: "⚠️" };
      if (overall >= 40) return { label: "Insufficiente", color: "text-orange-400", emoji: "❌" };
      return { label: "Non adatto", color: "text-red-400", emoji: "🚫" };
    };

    const grade = getOverallGrade(score.overall);

    // Feedback summary for training
    const greenCount = feedbacks.filter((f) => f.signal === "green").length;
    const yellowCount = feedbacks.filter((f) => f.signal === "yellow").length;
    const redCount = feedbacks.filter((f) => f.signal === "red").length;

    return (
      <div className="min-h-screen p-6 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">{grade.emoji}</div>
          <h2 className="text-3xl font-bold">
            {operatorName} — {grade.label}
          </h2>
          <p className={`text-xl mt-1 ${getProfileColor(score.profile_label)}`}>
            Profilo: {score.profile_label}
          </p>
          <p className="text-gray-400 text-sm mt-2">
            vs {selectedFan.emoji} {selectedFan.name} (Difficoltà{" "}
            {selectedFan.difficulty}/5)
          </p>
        </div>

        {/* Score bars */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { key: "closer", label: "Closer", color: "bg-emerald-500", textColor: "text-emerald-400" },
            { key: "builder", label: "Builder", color: "bg-indigo-500", textColor: "text-indigo-400" },
            { key: "spammer", label: "Spammer", color: "bg-red-500", textColor: "text-red-400" },
          ].map(({ key, label, color, textColor }) => (
            <div key={key} className="bg-gray-800/50 rounded-xl p-4 text-center">
              <p className={`text-sm ${textColor} mb-1`}>{label}</p>
              <p className="text-3xl font-bold">{score[key]}</p>
              <div className="w-full bg-gray-700 rounded-full h-2 mt-3">
                <div
                  className={`${color} h-2 rounded-full transition-all duration-1000`}
                  style={{ width: `${score[key]}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Overall */}
        <div className="bg-gray-800/50 rounded-xl p-6 mb-8 text-center">
          <p className="text-gray-400 text-sm">Punteggio Complessivo</p>
          <p className={`text-6xl font-bold ${grade.color}`}>
            {score.overall}
            <span className="text-2xl text-gray-500">/100</span>
          </p>
          <div className="flex justify-center gap-4 mt-3 text-sm">
            {score.sale_achieved ? (
              <span className="text-emerald-400">💰 Vendita ottenuta</span>
            ) : (
              <span className="text-gray-500">💰 Nessuna vendita</span>
            )}
            {score.fan_retained ? (
              <span className="text-indigo-400">🔒 Fan mantenuto</span>
            ) : (
              <span className="text-red-400">🚪 Fan perso</span>
            )}
          </div>
        </div>

        {/* Real-time feedback summary (training only) */}
        {mode === "training" && feedbacks.length > 0 && (
          <div className="bg-gray-800/50 rounded-xl p-5 mb-6">
            <h3 className="font-semibold mb-3">⚡ Feedback in tempo reale</h3>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
                <span className="text-sm text-gray-300">{greenCount} ottimi</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="text-sm text-gray-300">{yellowCount} ok</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <span className="text-sm text-gray-300">{redCount} errori</span>
              </div>
            </div>
          </div>
        )}

        {/* Pattern analysis */}
        <div className="bg-gray-800/50 rounded-xl p-6 mb-6">
          <h3 className="font-semibold mb-4">🧠 Pattern di Andrea Spagnuolo</h3>
          <div className="space-y-3">
            {score.patterns_used?.map((p, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 bg-gray-900/50 rounded-lg"
              >
                <span className="text-lg mt-0.5">
                  {p.used
                    ? p.effectiveness === "alta" ? "🟢"
                    : p.effectiveness === "media" ? "🟡" : "🟠"
                    : "⚫"}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.pattern}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        p.effectiveness === "alta"
                          ? "bg-green-500/20 text-green-400"
                          : p.effectiveness === "media"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : p.effectiveness === "bassa"
                          ? "bg-orange-500/20 text-orange-400"
                          : "bg-gray-700 text-gray-400"
                      }`}
                    >
                      {p.effectiveness || "non usato"}
                    </span>
                  </div>
                  {p.example && (
                    <p className="text-xs text-gray-400 mt-1 italic">
                      &quot;{p.example}&quot;
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Strengths & Weaknesses */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-800/50 rounded-xl p-5">
            <h3 className="font-semibold text-emerald-400 mb-3">💪 Punti di Forza</h3>
            <ul className="space-y-2">
              {score.strengths?.map((s, i) => (
                <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">•</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-5">
            <h3 className="font-semibold text-orange-400 mb-3">📌 Da Migliorare</h3>
            <ul className="space-y-2">
              {score.weaknesses?.map((w, i) => (
                <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                  <span className="text-orange-400 mt-0.5">•</span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {score.tip && (
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-5 mb-8">
            <p className="text-sm text-indigo-300">
              <span className="font-semibold">💡 Consiglio:</span> {score.tip}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => startNewSession(selectedFan)}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl transition"
          >
            🔄 Riprova stesso fan
          </button>
          <button
            onClick={() => setScreen("setup")}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition font-medium"
          >
            Scegli un altro fan →
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // SCREEN: Analytics Dashboard
  // -------------------------------------------------------
  if (screen === "analytics") {
    return (
      <div className="min-h-screen p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">📊 Dashboard Analytics</h2>
            <p className="text-gray-400 mt-1">
              Ranking operatori, progressi e storico sessioni
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={loadAnalytics}
              className="text-gray-400 hover:text-white transition text-sm"
            >
              🔄 Aggiorna
            </button>
            <button
              onClick={() => setScreen("landing")}
              className="text-gray-400 hover:text-white transition"
            >
              ← Indietro
            </button>
          </div>
        </div>

        {analyticsLoading ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4 pulse-score">📊</div>
            <p className="text-gray-400">Caricamento dati...</p>
          </div>
        ) : (
          <>
            {/* Ranking */}
            <div className="bg-gray-800/50 rounded-xl p-6 mb-8">
              <h3 className="font-semibold text-lg mb-4">🏆 Ranking Operatori</h3>
              {analyticsData.ranking.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  Nessuna sessione salvata ancora. Completa qualche sessione per vedere il ranking.
                  {"\n\n"}Nota: serve configurare Vercel KV per lo storico. Vai su Vercel Dashboard → Storage → Create → KV.
                </p>
              ) : (
                <div className="space-y-3">
                  {analyticsData.ranking.map((op, i) => (
                    <div
                      key={op.operatorName}
                      className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl font-bold text-gray-500 w-8">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                        </span>
                        <div>
                          <p className="font-semibold">{op.operatorName}</p>
                          <p className="text-xs text-gray-500">
                            {op.totalSessions} sessioni · {op.salesAchieved} vendite · {op.fansRetained} fan mantenuti
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-xs text-emerald-400">Closer</p>
                          <p className="font-bold">{op.avgCloser}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-indigo-400">Builder</p>
                          <p className="font-bold">{op.avgBuilder}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-red-400">Spammer</p>
                          <p className="font-bold">{op.avgSpammer}</p>
                        </div>
                        <div className="text-center border-l border-gray-700 pl-4">
                          <p className="text-xs text-gray-400">Overall</p>
                          <p className="font-bold text-xl">{op.avgOverall}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-yellow-400">Best</p>
                          <p className="font-bold">{op.bestScore}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent sessions */}
            <div className="bg-gray-800/50 rounded-xl p-6">
              <h3 className="font-semibold text-lg mb-4">📋 Sessioni Recenti</h3>
              {analyticsData.sessions.length === 0 ? (
                <p className="text-gray-500 text-sm">Nessuna sessione ancora.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto chat-scroll">
                  {analyticsData.sessions.slice(0, 50).map((session) => {
                    const fan = FAN_PROFILES.find((f) => f.id === session.fanProfileId);
                    return (
                      <div
                        key={session.id}
                        className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            session.mode === "screening"
                              ? "bg-indigo-500/20 text-indigo-400"
                              : "bg-emerald-500/20 text-emerald-400"
                          }`}>
                            {session.mode === "screening" ? "🎯" : "💪"}
                          </span>
                          <span className="font-medium">{session.operatorName}</span>
                          <span>{fan?.emoji || "❓"}</span>
                          <span className="text-gray-500">{session.fanName}</span>
                          <span className="text-gray-600">{session.messageCount} msg</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-emerald-400">C:{session.score?.closer}</span>
                          <span className="text-indigo-400">B:{session.score?.builder}</span>
                          <span className="text-red-400">S:{session.score?.spammer}</span>
                          <span className="font-bold">{session.score?.overall}/100</span>
                          <span className="text-gray-600 text-xs">
                            {new Date(session.timestamp).toLocaleDateString("it-IT")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return null;
}
