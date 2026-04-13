"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";

const HOC_COLORS = {
  bgDark: "#0B0B0F",
  white: "#FFFFFF",
  gray: "#9CA3AF",
  orange: "#F59E0B",
  gradient: "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)",
};

export default function ReviewPage() {
  const { isLoaded, user } = useUser();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [smComment, setSmComment] = useState("");
  const [outcome, setOutcome] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    fetch("/api/admin/sessions?limit=100")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setItems(data.feedback || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [isLoaded]);

  async function submitOverride() {
    if (!selected) return;
    const feedbackKey = `eval_feedback:${selected.timestamp}:${selected.userId}`;
    try {
      const res = await fetch("/api/admin/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackKey,
          smComment,
          outcome: outcome || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelected(null);
        setSmComment("");
        setOutcome("");
        // Refresh
        const r = await fetch("/api/admin/sessions?limit=100");
        const d = await r.json();
        setItems(d.feedback || []);
      } else {
        alert(data.error || "Errore");
      }
    } catch (e) {
      alert(e.message);
    }
  }

  if (!isLoaded) return <div style={{ color: "#fff", padding: 40 }}>Loading...</div>;

  return (
    <div style={{ background: HOC_COLORS.bgDark, minHeight: "100vh", color: HOC_COLORS.white, padding: "2rem" }}>
      <h1 style={{ background: HOC_COLORS.gradient, backgroundClip: "text", color: "transparent", fontWeight: 900 }}>
        SM Review Dashboard
      </h1>
      <p style={{ color: HOC_COLORS.gray }}>
        Feedback recenti degli operatori sulle valutazioni AI. Rivedi, correggi, promuovi ad esempi d&apos;oro.
      </p>

      {error && <p style={{ color: "#EF4444" }}>Errore: {error}</p>}
      {loading && <p>Caricamento...</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginTop: "2rem" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem" }}>Feedback ({items.length})</h2>
          {items.length === 0 && <p style={{ color: HOC_COLORS.gray }}>Nessun feedback ancora.</p>}
          {items.map((it) => (
            <div
              key={`${it.timestamp}-${it.userId}`}
              onClick={() => setSelected(it)}
              style={{
                background: selected?.timestamp === it.timestamp ? `${HOC_COLORS.orange}20` : `${HOC_COLORS.white}08`,
                border: `1px solid ${it.reviewed ? "#10B98155" : HOC_COLORS.white + "20"}`,
                borderRadius: "0.5rem",
                padding: "0.75rem",
                marginBottom: "0.5rem",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {it.rating === "up" ? "👍" : "👎"} {it.scenarioId}
              </div>
              <div style={{ fontSize: "0.8rem", color: HOC_COLORS.gray }}>
                {new Date(it.timestamp).toLocaleString("it-IT")} • user {it.userId?.slice(-6)}
                {it.reviewed ? " • ✅ reviewed" : ""}
              </div>
              {it.comment && <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>&quot;{it.comment}&quot;</div>}
            </div>
          ))}
        </div>

        <div>
          <h2 style={{ fontSize: "1.1rem" }}>Dettaglio</h2>
          {!selected && <p style={{ color: HOC_COLORS.gray }}>Seleziona un feedback a sinistra.</p>}
          {selected && (
            <div>
              <div style={{ background: `${HOC_COLORS.white}05`, padding: "1rem", borderRadius: "0.5rem", marginBottom: "1rem" }}>
                <p><strong>Scenario:</strong> {selected.scenarioId}</p>
                <p><strong>Rating operatore:</strong> {selected.rating}</p>
                <p><strong>Commento:</strong> {selected.comment || "—"}</p>
                {selected.scoreSnapshot && (
                  <p><strong>Score AI:</strong> {selected.scoreSnapshot.score}% ({selected.scoreSnapshot.stars}⭐)</p>
                )}
              </div>

              <h3 style={{ fontSize: "0.95rem" }}>Messaggi</h3>
              <div style={{ background: `${HOC_COLORS.white}05`, padding: "0.75rem", borderRadius: "0.5rem", marginBottom: "1rem", maxHeight: "300px", overflowY: "auto" }}>
                {(selected.messages || []).map((m, i) => (
                  <div key={i} style={{ marginBottom: "0.5rem" }}>
                    <strong style={{ color: m.role === "operator" ? HOC_COLORS.orange : "#60A5FA" }}>
                      [{m.role}]:
                    </strong>{" "}
                    {m.content}
                  </div>
                ))}
              </div>

              <label style={{ fontSize: "0.9rem" }}>Commento SM:</label>
              <textarea
                value={smComment}
                onChange={(e) => setSmComment(e.target.value)}
                style={{ width: "100%", minHeight: "80px", padding: "0.5rem", background: `${HOC_COLORS.white}05`, border: `1px solid ${HOC_COLORS.white}30`, borderRadius: "0.5rem", color: HOC_COLORS.white, marginBottom: "0.75rem" }}
              />

              <label style={{ fontSize: "0.9rem" }}>Promuovi ad esempio:</label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                style={{ display: "block", width: "100%", padding: "0.5rem", background: `${HOC_COLORS.white}05`, border: `1px solid ${HOC_COLORS.white}30`, borderRadius: "0.5rem", color: HOC_COLORS.white, marginBottom: "1rem" }}
              >
                <option value="">— nessuno —</option>
                <option value="success">✅ Golden success</option>
                <option value="failure">❌ Golden failure (anti-pattern)</option>
              </select>

              <button
                onClick={submitOverride}
                style={{ padding: "0.6rem 1.5rem", background: HOC_COLORS.gradient, border: "none", color: HOC_COLORS.bgDark, borderRadius: "0.5rem", fontWeight: 700, cursor: "pointer" }}
              >
                Salva review
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
