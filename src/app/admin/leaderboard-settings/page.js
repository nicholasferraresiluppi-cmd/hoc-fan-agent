"use client";

// Impostazioni leaderboard operativa = la formula dello score Mestiere (Infloww).
// Ridisegno 26/09/2026 (design system): KPI con nome in italiano e cosa misurano,
// soglie spiegate come "% della media del gruppo", avviso esplicito che salvare
// qui cambia SUBITO la formula attiva (anche sui mesi passati) senza backtest,
// con rimando alle Bozze formula; barra di salvataggio sempre visibile con lo
// stato "modifiche non salvate". API, validazioni e conferme invariate.

import { useState, useEffect } from "react";
import Link from "next/link";
import { FlaskConical, History } from "lucide-react";
import { FONTS, CP } from "@/lib/brand";
import { PageHead, SectionTitle, Notice, NUM, card } from "@/components/ds";

// KPI: nome in italiano + cosa misura (il nome Infloww resta sotto, piccolo)
const KPI_LABELS = {
  fan_cvr: { it: "Conversione fan", hint: "quota dei fan in chat che comprano", src: "Fan CVR" },
  unlock_rate: { it: "Contenuti sbloccati", hint: "quota dei PPV mandati che vengono aperti a pagamento", src: "Unlock Rate" },
  avg_earnings_per_paying_fan: { it: "Incasso per fan pagante", hint: "quanto spende in media chi compra", src: "Avg Earnings / Paying Fan" },
  golden_ratio: { it: "Golden ratio", hint: "indice calcolato da Infloww", src: "Golden Ratio" },
  sales_per_hour: { it: "Vendite all'ora", hint: "incasso diviso ore timbrate", src: "Sales / Hour" },
  avg_revenue_per_fan: { it: "Incasso per fan", hint: "incasso diviso tutti i fan in chat", src: "Avg Revenue / Fan" },
  avg_length_of_conversation: { it: "Lunghezza delle conversazioni", hint: "media per conversazione", src: "Avg Length of Conv." },
  input_per_message: { it: "Input per messaggio", hint: "metrica Infloww", src: "Input per Message" },
  messages_sent_per_hour: { it: "Messaggi all'ora", hint: "messaggi mandati diviso ore timbrate", src: "Messages / Hour" },
};

// Ordine canonico dei KPI nella tabella
const KPI_ORDER = [
  "fan_cvr",
  "unlock_rate",
  "avg_earnings_per_paying_fan",
  "golden_ratio",
  "sales_per_hour",
  "avg_revenue_per_fan",
  "avg_length_of_conversation",
  "input_per_message",
  "messages_sent_per_hour",
];

// Quali KPI sono "clock-in only" (non presenti in withoutClockIn)
const CLOCK_IN_ONLY = new Set(["sales_per_hour", "messages_sent_per_hour"]);

const nf = (v, d = 2) => (v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }));

export default function LeaderboardSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [weights, setWeights] = useState(null);
  const [thresholds, setThresholds] = useState(null);
  const [tiers, setTiers] = useState(null);
  const [isCustom, setIsCustom] = useState({});
  const [saved, setSaved] = useState(null); // ultima versione caricata/salvata, per "modifiche non salvate"

  async function loadSettings() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/leaderboard-settings");
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Errore nel caricamento.");
        setLoading(false);
        return;
      }
      setWeights(deepCopy(data.weights));
      setThresholds(deepCopy(data.thresholds));
      setTiers(deepCopy(data.tiers));
      setIsCustom(data.isCustom || {});
      setSaved(JSON.stringify({ w: data.weights, t: data.thresholds, x: data.tiers }));
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  useEffect(() => {
    loadSettings();
  }, []);

  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function sumOfWeights(modeObj) {
    return Object.values(modeObj || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  }

  async function saveAll() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/leaderboard-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights, thresholds, tiers }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        setError(data.error || "Errore nel salvataggio.");
      } else {
        setMessage("Salvato. La leaderboard usa i nuovi valori da adesso (ricarica la pagina della leaderboard).");
        setIsCustom(data.isCustom || {});
        setSaved(JSON.stringify({ w: weights, t: thresholds, x: tiers }));
      }
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  }

  async function resetAll() {
    if (!confirm("Ripristinare tutti i valori scritti nel codice?\n\nCancella pesi, soglie e fasce salvati (anche quelli pubblicati dalle Bozze formula; la regola dei gruppi piccoli resta): lo score torna ai valori di fabbrica, anche sui mesi passati.")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/leaderboard-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        setError(data.error || "Errore nel reset.");
      } else {
        setMessage(data.message || "Valori ripristinati.");
        await loadSettings();
      }
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  }

  /* =============== UI handlers =============== */

  function setWeight(mode, kpi, value) {
    setWeights((prev) => {
      const next = deepCopy(prev);
      const num = parseFloat(value);
      if (isNaN(num)) {
        delete next[mode][kpi];
      } else {
        next[mode][kpi] = num;
      }
      return next;
    });
  }

  function setThreshold(idx, key, value) {
    setThresholds((prev) => {
      const next = deepCopy(prev);
      const num = parseFloat(value);
      if (!isNaN(num)) next[idx][key] = num;
      return next;
    });
  }

  function setTier(idx, key, value) {
    setTiers((prev) => {
      const next = deepCopy(prev);
      if (key === "label" || key === "color") {
        next[idx][key] = value;
      } else {
        const num = parseFloat(value);
        if (!isNaN(num)) next[idx][key] = num;
      }
      return next;
    });
  }

  const page = { padding: "28px 24px 96px", maxWidth: 1080, margin: "0 auto", fontFamily: FONTS.body };
  const input = { padding: "6px 10px", background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, width: 84, textAlign: "right", ...NUM };
  const inputText = { ...input, textAlign: "left", width: 120 };
  const th = { textAlign: "left", padding: "10px 12px", color: CP.textMuted, fontSize: 12, fontWeight: 500, borderBottom: `1px solid ${CP.border}`, whiteSpace: "nowrap" };
  const td = { padding: "8px 12px", borderTop: `1px solid ${CP.borderSoft}`, verticalAlign: "middle" };
  const chip = { display: "inline-block", marginLeft: 8, padding: "2px 9px", borderRadius: 999, fontSize: 12, fontWeight: 400, background: CP.surfaceAlt, color: CP.textSecondary, verticalAlign: "middle" };
  const btn = (primary) => ({ padding: "9px 16px", borderRadius: 8, border: `1px solid ${primary ? CP.accent : CP.border}`, background: primary ? CP.accent : CP.surface, color: primary ? CP.accentInk : CP.textPrimary, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" });

  const head = (
    <PageHead
      crumbs={[{ label: "Hub", href: "/admin" }, { label: "Dati" }, { label: "Impostazioni leaderboard" }]}
      title="Impostazioni leaderboard operativa"
      subtitle="La formula dello score Mestiere (dati Infloww): quanto pesa ogni KPI, come un KPI diventa punti e dove iniziano le fasce. Da qui la cambi direttamente."
      actions={<>
        <Link href="/admin/score-config-drafts" style={{ ...btn(false), textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}><FlaskConical size={14} /> Bozze formula</Link>
        <Link href="/admin/score-config-history" style={{ ...btn(false), textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}><History size={14} /> Storico</Link>
      </>}
    />
  );

  if (loading) {
    return (
      <div style={page}>
        {head}
        <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento impostazioni…</div>
      </div>
    );
  }

  // Validation hints
  const sumWith = sumOfWeights(weights?.withClockIn);
  const sumWithout = sumOfWeights(weights?.withoutClockIn);
  const sumWithOk = Math.abs(sumWith - 1) < 0.001;
  const sumWithoutOk = Math.abs(sumWithout - 1) < 0.001;
  const dirty = saved != null && weights && JSON.stringify({ w: weights, t: thresholds, x: tiers }) !== saved;
  const customChip = <span style={chip}>modificato rispetto al codice</span>;

  return (
    <div style={page}>
      {head}

      <Notice danger>
        Salvare qui cambia <b style={{ fontWeight: 500 }}>subito</b> lo score di tutti gli operatori, anche nei mesi passati (classifiche, pagine personali, percorso di carriera), senza prova prima. Per un cambio ragionato usa <Link href="/admin/score-config-drafts" style={{ color: CP.accentSoftText }}>Bozze formula</Link>: fai il backtest sui mesi veri e vedi chi sale e chi scende prima di pubblicare.
      </Notice>

      {error && <Notice danger>{error}</Notice>}
      {message && <Notice>{message}</Notice>}

      {/* ============ PESI KPI ============ */}
      {weights && (
        <section style={{ ...card, padding: "16px 16px 8px", marginBottom: 16 }}>
          <SectionTitle>Quanto pesa ogni KPI{isCustom.weights && customChip}</SectionTitle>
          <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", lineHeight: 1.55 }}>
            In ogni colonna i pesi devono sommare 1,00. «Con ore timbrate» vale quando Infloww ha le ore lavorate (Clocked Hours) valide; se mancano si usa l&apos;altra colonna, che non ha i due KPI all&apos;ora.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={th}>KPI</th>
                  <th style={{ ...th, textAlign: "right" }}>Con ore timbrate</th>
                  <th style={{ ...th, textAlign: "right" }}>Senza ore timbrate</th>
                </tr>
              </thead>
              <tbody>
                {KPI_ORDER.map((kpi) => {
                  const k = KPI_LABELS[kpi] || { it: kpi };
                  return (
                    <tr key={kpi}>
                      <td style={td}>
                        <div style={{ color: CP.textPrimary }}>{k.it}</div>
                        <div style={{ fontSize: 12, color: CP.textMuted }}>{k.hint}{k.src ? ` · ${k.src}` : ""}</div>
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <input type="number" step="0.01" min="0" max="1" aria-label={`${k.it}, con ore timbrate`}
                          value={weights?.withClockIn?.[kpi] ?? ""}
                          onChange={(e) => setWeight("withClockIn", kpi, e.target.value)}
                          style={input} />
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {CLOCK_IN_ONLY.has(kpi) ? (
                          <span style={{ color: CP.textMuted, fontSize: 12 }}>non usato</span>
                        ) : (
                          <input type="number" step="0.01" min="0" max="1" aria-label={`${k.it}, senza ore timbrate`}
                            value={weights?.withoutClockIn?.[kpi] ?? ""}
                            onChange={(e) => setWeight("withoutClockIn", kpi, e.target.value)}
                            style={input} />
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td style={{ ...td, color: CP.textSecondary }}>Somma (deve fare 1,00)</td>
                  <td style={{ ...td, textAlign: "right", ...NUM, color: sumWithOk ? CP.textSecondary : CP.accentRed }}>{nf(sumWith, 2)} {sumWithOk ? "✓" : "≠ 1,00"}</td>
                  <td style={{ ...td, textAlign: "right", ...NUM, color: sumWithoutOk ? CP.textSecondary : CP.accentRed }}>{nf(sumWithout, 2)} {sumWithoutOk ? "✓" : "≠ 1,00"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ============ SOGLIE NORMALIZZAZIONE ============ */}
      {thresholds && (
        <section style={{ ...card, padding: "16px 16px 8px", marginBottom: 16 }}>
          <SectionTitle>Come un KPI diventa punti{isCustom.thresholds && customChip}</SectionTitle>
          <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", lineHeight: 1.55 }}>
            Ogni KPI dell&apos;operatore si confronta con la media del suo gruppo (il team della stessa creator). Si legge dall&apos;alto: la prima riga in cui l&apos;operatore sta sotto dà i punti. Sopra l&apos;ultima riga: 100 punti. Moltiplicatori e punti devono crescere riga dopo riga.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={th}>Riga</th>
                  <th style={{ ...th, textAlign: "right" }}>Moltiplicatore della media</th>
                  <th style={{ ...th, textAlign: "right" }}>Punti</th>
                  <th style={th}>Si legge così</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.map((t, i) => (
                  <tr key={i}>
                    <td style={{ ...td, color: CP.textMuted, ...NUM }}>{i + 1}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <input type="number" step="0.01" value={t.multiplier} aria-label={`Moltiplicatore riga ${i + 1}`}
                        onChange={(e) => setThreshold(i, "multiplier", e.target.value)} style={input} />
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <input type="number" step="1" min="0" max="100" value={t.score} aria-label={`Punti riga ${i + 1}`}
                        onChange={(e) => setThreshold(i, "score", e.target.value)} style={input} />
                    </td>
                    <td style={{ ...td, color: CP.textSecondary, fontSize: 13, ...NUM }}>
                      sotto il {Math.round((Number(t.multiplier) || 0) * 100)}% della media → {t.score} punti
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: CP.textMuted, margin: "8px 0" }}>
            Valori di fabbrica: 0,75 / 0,90 / 1,00 / 1,10 / 1,25 → 0 / 20 / 40 / 60 / 80 punti, sopra → 100.
          </div>
        </section>
      )}

      {/* ============ TIER CUTOFFS ============ */}
      {tiers && (
        <section style={{ ...card, padding: "16px 16px 8px", marginBottom: 16 }}>
          <SectionTitle>Fasce dello score{isCustom.tiers && customChip}</SectionTitle>
          <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", lineHeight: 1.55 }}>
            Da quale score parte ogni fascia (Critical, Weak, Average, Good, Strong, Elite). Le fasce devono essere attaccate una all&apos;altra e coprire da 0 a 100. Il colore è quello del bollino nella leaderboard.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={th}>Nome</th>
                  <th style={{ ...th, textAlign: "right" }}>Da</th>
                  <th style={{ ...th, textAlign: "right" }}>A</th>
                  <th style={th}>Colore</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t, i) => (
                  <tr key={i}>
                    <td style={td}>
                      <input type="text" value={t.label} aria-label={`Nome fascia ${i + 1}`} onChange={(e) => setTier(i, "label", e.target.value)} style={inputText} />
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <input type="number" min="0" max="100" value={t.min} aria-label={`${t.label}: da`} onChange={(e) => setTier(i, "min", e.target.value)} style={input} />
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <input type="number" min="0" max="100" value={t.max} aria-label={`${t.label}: a`} onChange={(e) => setTier(i, "max", e.target.value)} style={input} />
                    </td>
                    <td style={td}>
                      <input type="color" value={t.color} aria-label={`${t.label}: colore`} onChange={(e) => setTier(i, "color", e.target.value)}
                        style={{ width: 36, height: 28, padding: 0, background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 6, cursor: "pointer", verticalAlign: "middle" }} />
                      <span style={{ marginLeft: 8, fontSize: 12, color: CP.textMuted }}>{t.color}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ============ ACTIONS (sempre visibili) ============ */}
      <div style={{ position: "sticky", bottom: 12, zIndex: 5, ...card, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button style={{ ...btn(true), opacity: saving || !sumWithOk || !sumWithoutOk ? 0.6 : 1 }} onClick={saveAll} disabled={saving || !sumWithOk || !sumWithoutOk}>
          {saving ? "Salvataggio…" : "Salva e applica subito"}
        </button>
        <button style={btn(false)} onClick={loadSettings} disabled={saving}>
          Annulla modifiche
        </button>
        <span style={{ fontSize: 12, color: !sumWithOk || !sumWithoutOk ? CP.accentRed : dirty ? CP.accentSoftText : CP.textMuted }}>
          {!sumWithOk || !sumWithoutOk ? "I pesi non sommano 1,00: correggi prima di salvare" : dirty ? "Modifiche non salvate" : "Nessuna modifica"}
        </span>
        <div style={{ flex: 1 }} />
        <button style={{ ...btn(false), color: CP.accentRed }} onClick={resetAll} disabled={saving}>
          Ripristina valori di fabbrica
        </button>
      </div>
    </div>
  );
}
