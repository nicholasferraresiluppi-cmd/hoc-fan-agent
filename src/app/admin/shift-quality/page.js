"use client";

/**
 * Qualità turni — turno×operatore per creator×giorno.
 *
 * Tre layer nella stessa vista:
 *   1. STRUTTURA  turni CP (operatori, singolo/duo) — attribuzione onesta
 *   2. FUNNEL     conversazioni, PPV proposti→sbloccati (campi body, deterministici)
 *   3. VENDUTO    net attribuito alla finestra turno (attributed_transactions)
 * + layer CONTENUTO on-demand (LLM, admin): sentiment fan, tono chatter,
 *   obiezioni, flag onestà, evidenze — uso coaching, MAI input di score/comp.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle, MessagesSquare, ShieldAlert, Sparkles } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, StatCard, SectionLabel } from "@/components/cp-style";

const num = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }));
const usd = (v) => (v == null ? "—" : "$" + Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }));
const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 100) + "%" : "—");
const hhmm = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
const romeDate = (iso) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
// marker ±1g: la riga parte in un giorno (Roma) diverso da quello di riferimento della vista
const dayMark = (iso, day) => {
  const refMs = Date.parse((day || "") + "T12:00:00Z");
  if (!iso || !Number.isFinite(refMs)) return "";
  const ref = romeDate(new Date(refMs).toISOString());
  const d = romeDate(iso);
  return d > ref ? "+1g" : d < ref ? "−1g" : "";
};

function yesterdayUTC() {
  const d = new Date(Date.now() - 86400_000);
  return d.toISOString().slice(0, 10);
}

const SENT_COLORS = { positivo: CP.accentGreen, neutro: CP.textMuted, frustrato: CP.accentRed };
const TONE_COLORS = { warm: CP.accentGreen, neutro: CP.textSecondary, pushy: "#e6b450", ostile: CP.accentRed };

function Bars({ data, colors, total }) {
  const entries = Object.entries(data || {});
  const tot = total ?? entries.reduce((a, [, v]) => a + v, 0);
  return (
    <div style={{ display: "grid", gap: 7 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "76px 1fr 74px", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12.5, color: CP.textSecondary, textTransform: "capitalize" }}>{k}</span>
          <div style={{ height: 8, borderRadius: 4, background: CP.bgSunken, overflow: "hidden" }}>
            <div style={{ width: tot ? `${(v / tot) * 100}%` : 0, height: "100%", background: colors?.[k] || CP.accent, borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: 12.5, fontFamily: FONTS.mono, color: CP.textSecondary, textAlign: "right" }}>
            {num(v)} · {pctOf(v, tot)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EvidenceList({ items, tint }) {
  if (!items?.length) return <div style={{ fontSize: 12.5, color: CP.textMuted }}>Nessuna evidenza in questa giornata.</div>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((e, i) => (
        <div key={i} style={{ borderLeft: `2px solid ${tint}`, paddingLeft: 12 }}>
          <div style={{ fontSize: 11, fontFamily: FONTS.mono, color: CP.textMuted, marginBottom: 2 }}>
            fan {e.uid} · {e.sentiment} / {e.tono}{e.obiezione !== "nessuna" ? ` · obiezione: ${e.obiezione}` : ""}
          </div>
          <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.45 }}>{e.sintesi}</div>
        </div>
      ))}
    </div>
  );
}

export default function ShiftQualityPage() {
  const [creators, setCreators] = useState(null);
  const [creatorId, setCreatorId] = useState("");
  const [day, setDay] = useState(yesterdayUTC());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [job, setJob] = useState(null);
  const [analysisErr, setAnalysisErr] = useState(null);
  const ticking = useRef(false);

  const load = useCallback(async (cid, d) => {
    setLoading(true);
    setError(null);
    try {
      const qs = cid && d ? `?creator_id=${cid}&day=${d}` : "";
      const res = await fetch(`/api/admin/shift-quality${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Errore ${res.status}`);
      setCreators(json.creators || []);
      if (cid && d) {
        setData(json);
        setJob(json.job || null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(null, null); }, [load]);
  useEffect(() => { if (creatorId && day) load(creatorId, day); }, [creatorId, day, load]);

  // Tick loop: finché il job è running, chiama tick e poi ricarica la vista.
  useEffect(() => {
    if (!job || job.status !== "running" || ticking.current) return;
    ticking.current = true;
    (async () => {
      try {
        while (true) {
          const res = await fetch("/api/admin/shift-quality/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ creator_id: creatorId, day, action: "tick" }),
          });
          const st = await res.json();
          if (!res.ok) throw new Error(st?.error || `Errore ${res.status}`);
          setJob(st);
          if (st.status !== "running") break;
        }
        await load(creatorId, day);
      } catch (e) {
        setAnalysisErr(e.message);
      } finally {
        ticking.current = false;
      }
    })();
  }, [job, creatorId, day, load]);

  const startAnalysis = async (force = false) => {
    setAnalysisErr(null);
    try {
      const res = await fetch("/api/admin/shift-quality/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator_id: creatorId, day, action: "start", force }),
      });
      const st = await res.json();
      if (!res.ok) throw new Error(st?.error || `Errore ${res.status}`);
      setJob(st);
    } catch (e) {
      setAnalysisErr(e.message);
    }
  };

  const t = data?.totals;
  const analysis = data?.analysis;
  const selStyle = {
    background: CP.surface, color: CP.text, border: `1px solid ${CP.border}`,
    borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: FONTS.body,
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 80px" }}>
      <PageHeader
        section="Performance"
        title="Qualità turni"
        subtitle="Turno per turno: chi era in turno, conversazioni, funnel PPV e venduto — con attribuzione onesta (singolo vs duo). Analisi contenuto on-demand per il coaching."
        toolbar={
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} style={selStyle}>
              <option value="">Scegli creator…</option>
              {(creators || []).map((c) => (
                <option key={c.creator_id} value={c.creator_id}>{c.creator_name}</option>
              ))}
            </select>
            <input type="date" value={day} max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDay(e.target.value)} style={selStyle} />
          </div>
        }
      />

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: CP.textMuted, padding: "40px 0" }}>
          <Loader2 size={16} className="animate-spin" /> Caricamento…
        </div>
      )}
      {error && (
        <CpCard style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: CP.accentRed, fontSize: 13 }}>
            <AlertCircle size={15} /> {error}
          </div>
        </CpCard>
      )}

      {!loading && !error && !creatorId && (
        <CpCard style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: CP.textMuted, fontSize: 13.5 }}>
            <MessagesSquare size={15} /> Scegli un creator e un giorno per vedere i turni.
          </div>
        </CpCard>
      )}

      {!loading && !error && data && creatorId && (
        <>
          {/* Riga stat giornata */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 18 }}>
            <StatCard label="Venduto (giorno)" value={usd(t?.net_usd)} sub={`${num(t?.txns)} transazioni`} />
            <StatCard label="Attribuibile a 1 operatore" value={usd(t?.singolo_net)} sub={`vs ${usd(t?.duo_net)} in turni duo`} color={CP.accentGreen} />
            <StatCard label="PPV proposti → sbloccati" value={`${num(t?.ppv_proposed)} → ${num(t?.ppv_unlocked)}`} sub={`${pctOf(t?.ppv_unlocked || 0, t?.ppv_proposed || 0)} sblocco`} />
            <StatCard
              label="Fan frustrati (analisi)"
              value={analysis ? pctOf(analysis.sentiment?.frustrato || 0, analysis.convs_labeled || 0) : "—"}
              sub={analysis ? `${num(analysis.convs_labeled)} conversazioni lette` : "analisi non eseguita"}
              color={analysis && analysis.sentiment?.frustrato / Math.max(1, analysis.convs_labeled) > 0.2 ? CP.accentRed : undefined}
            />
          </div>

          {/* Turni */}
          <SectionLabel style={{ marginTop: 28 }}>Turni del giorno (finestre = check-in reali · orari Europe/Rome · giorno UTC)</SectionLabel>
          <CpCard style={{ marginTop: 10, padding: 0 }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${CP.border}` }}>
                    {["Turno", "Operatori", "Attrib.", "Fan attivi", "Msg op", "PPV p→s", "Venduto"].map((h, i) => (
                      <th key={h} style={{
                        padding: "10px 14px", fontSize: 10, color: CP.textMuted, fontWeight: 700,
                        letterSpacing: "0.04em", textTransform: "uppercase", textAlign: i < 2 ? "left" : "right", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.shifts.map((s, i) => (
                    <tr key={i} style={{ borderBottom: i < data.shifts.length - 1 ? `1px solid ${CP.borderSoft || CP.border}` : "none" }}>
                      <td style={{ padding: "10px 14px", fontFamily: FONTS.mono, fontSize: 13, whiteSpace: "nowrap" }}>
                        {hhmm(s.start)}–{hhmm(s.end)}
                        {s.windows && s.windows !== "reale" ? <span title="check-in mancante: orario schedulato" style={{ color: CP.textMuted }}> ~</span> : null}
                        {dayMark(s.start, day) ? <span style={{ marginLeft: 6, fontSize: 10.5, color: CP.textMuted, border: `1px solid ${CP.border}`, borderRadius: 4, padding: "1px 4px" }}>{dayMark(s.start, day)}</span> : null}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: CP.textSecondary }}>{s.operators.join(" + ")}
                        {(s.members || []).length > 1 || (s.members || []).some((mm) => Math.abs(Date.parse(mm.start) - Date.parse(s.start)) > 600000 || Math.abs(Date.parse(mm.end) - Date.parse(s.end)) > 600000) ? (
                          <div style={{ marginTop: 3, fontSize: 11, color: CP.textMuted, fontFamily: FONTS.mono }}>
                            {(s.members || []).map((mm, ii) => (
                              <span key={ii}>{ii > 0 ? " · " : ""}{mm.op} {hhmm(mm.start)}→{hhmm(mm.end)}{mm.real ? "" : " ~"}</span>
                            ))}
                          </div>
                        ) : null}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <span style={{
                          fontSize: 10.5, fontFamily: FONTS.mono, fontWeight: 700, letterSpacing: "0.03em",
                          padding: "2px 8px", borderRadius: 5,
                          color: s.attribution === "singolo" ? CP.accentGreen : "#e6b450",
                          background: s.attribution === "singolo" ? "rgba(74,222,128,0.09)" : "rgba(230,180,80,0.09)",
                        }}>
                          {s.attribution === "singolo" ? "SINGOLO" : `DUO k=${s.k}`}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 13 }}>{num(s.active_fans)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 13 }}>{num(s.op_msgs)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 13 }}>
                        {num(s.ppv_proposed)} → {num(s.ppv_unlocked)}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 13.5, fontWeight: 600, color: s.net_usd > 0 ? CP.text : CP.textMuted }}>
                        {usd(s.net_usd)}
                      </td>
                    </tr>
                  ))}
                  {!data.shifts.length && (
                    <tr><td colSpan={7} style={{ padding: "18px 14px", fontSize: 13, color: CP.textMuted }}>
                      Nessun turno CP su questo creator in questo giorno.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CpCard>
          <div style={{ fontSize: 11.5, color: CP.textMuted, marginTop: 8, lineHeight: 1.5 }}>
            Venduto = transazioni attribuite alla finestra del turno (direzionale, non contabile). Nei turni <b>duo</b> il
            venduto e le chat NON sono attribuibili al singolo operatore: ws_chat non registra chi ha scritto.
          </div>

          {/* Analisi contenuto */}
          <SectionLabel style={{ marginTop: 30 }}>Analisi contenuto (LLM · coaching)</SectionLabel>
          {!analysis && (!job || job.status === "missing" || job.status === "empty") && (
            <CpCard style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: CP.textSecondary, maxWidth: 640, lineHeight: 1.5 }}>
                  Legge le conversazioni del giorno e le etichetta (sentiment fan, tono chatter, obiezioni, flag onestà).
                  Solo admin · costa API · le etichette servono al coaching e <b>non entrano in nessuno score</b>.
                </div>
                <button onClick={() => startAnalysis(false)} style={{
                  display: "flex", alignItems: "center", gap: 8, background: CP.accent, color: "#0a0d11",
                  border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>
                  <Sparkles size={14} /> Analizza giornata
                </button>
              </div>
              {analysisErr && <div style={{ marginTop: 10, fontSize: 12.5, color: CP.accentRed }}>{analysisErr}</div>}
            </CpCard>
          )}
          {job?.status === "running" && (
            <CpCard style={{ marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Loader2 size={15} className="animate-spin" style={{ color: CP.accent }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 6 }}>
                    Analisi in corso · {num(job.done)} / {num(job.total)} conversazioni
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: CP.bgSunken, overflow: "hidden" }}>
                    <div style={{ width: job.total ? `${(job.done / job.total) * 100}%` : 0, height: "100%", background: CP.accent }} />
                  </div>
                </div>
              </div>
              {analysisErr && <div style={{ marginTop: 10, fontSize: 12.5, color: CP.accentRed }}>{analysisErr} — ricarica la pagina per riprendere.</div>}
            </CpCard>
          )}
          {analysis && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginTop: 10 }}>
                <CpCard>
                  <SectionLabel size={10}>Sentiment del fan (fine chat)</SectionLabel>
                  <div style={{ marginTop: 12 }}><Bars data={analysis.sentiment} colors={SENT_COLORS} /></div>
                </CpCard>
                <CpCard>
                  <SectionLabel size={10}>Tono / metodo del chatter</SectionLabel>
                  <div style={{ marginTop: 12 }}><Bars data={analysis.tono} colors={TONE_COLORS} /></div>
                </CpCard>
                <CpCard>
                  <SectionLabel size={10}>Obiezioni (perché il fan non compra)</SectionLabel>
                  <div style={{ marginTop: 12 }}><Bars data={analysis.obiezioni} colors={{}} /></div>
                </CpCard>
              </div>

              {/* Per turno */}
              <CpCard style={{ marginTop: 12, padding: 0 }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${CP.border}` }}>
                        {["Turno", "Operatori", "Conv. lette", "Frustrati", "Pushy+ostile", "Flag onestà"].map((h, i) => (
                          <th key={h} style={{ padding: "10px 14px", fontSize: 10, color: CP.textMuted, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", textAlign: i < 2 ? "left" : "right", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.per_shift.map((s, i) => {
                        const aggr = (s.tono?.pushy || 0) + (s.tono?.ostile || 0);
                        const fr = s.sentiment?.frustrato || 0;
                        return (
                          <tr key={i} style={{ borderBottom: i < analysis.per_shift.length - 1 ? `1px solid ${CP.borderSoft || CP.border}` : "none" }}>
                            <td style={{ padding: "9px 14px", fontFamily: FONTS.mono, fontSize: 12.5, whiteSpace: "nowrap" }}>{hhmm(s.start)}–{hhmm(s.end)}</td>
                            <td style={{ padding: "9px 14px", fontSize: 12.5, color: CP.textSecondary }}>{s.operators.join(" + ")}{s.attribution === "duo" ? " · duo" : ""}</td>
                            <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 12.5 }}>{num(s.convs)}</td>
                            <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 12.5, color: fr / Math.max(1, s.convs) > 0.25 ? CP.accentRed : CP.textSecondary }}>{num(fr)} · {pctOf(fr, s.convs)}</td>
                            <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 12.5, color: aggr / Math.max(1, s.convs) > 0.4 ? "#e6b450" : CP.textSecondary }}>{num(aggr)} · {pctOf(aggr, s.convs)}</td>
                            <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: FONTS.mono, fontSize: 12.5, color: s.flag_onesta > 0 ? CP.accentRed : CP.textMuted }}>{num(s.flag_onesta)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CpCard>

              {/* Evidenze */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 12 }}>
                <CpCard>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <ShieldAlert size={14} style={{ color: CP.accentRed }} />
                    <SectionLabel size={10} style={{ margin: 0 }}>Flag onestà · da attenzionare</SectionLabel>
                  </div>
                  <EvidenceList items={analysis.evidenze?.onesta} tint={CP.accentRed} />
                </CpCard>
                <CpCard>
                  <SectionLabel size={10}>Opportunità non chiuse</SectionLabel>
                  <div style={{ marginTop: 12 }}><EvidenceList items={analysis.evidenze?.opportunita} tint="#e6b450" /></div>
                </CpCard>
                <CpCard>
                  <SectionLabel size={10}>Rischio churn (frustrati / trattati male)</SectionLabel>
                  <div style={{ marginTop: 12 }}><EvidenceList items={analysis.evidenze?.churn} tint={CP.accentRed} /></div>
                </CpCard>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11.5, color: CP.textMuted }}>
                  {num(analysis.convs_labeled)} conversazioni etichettate ({analysis.convs_failed ? `${analysis.convs_failed} fallite · ` : ""}modello {analysis.model}) · generata {new Date(analysis.generated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}
                </div>
                <button onClick={() => startAnalysis(true)} style={{
                  background: "transparent", color: CP.textMuted, border: `1px solid ${CP.border}`,
                  borderRadius: 7, padding: "6px 12px", fontSize: 12, cursor: "pointer",
                }}>
                  Rianalizza
                </button>
              </div>
            </>
          )}

          <div style={{
            marginTop: 26, padding: "10px 14px", borderRadius: 8, fontSize: 11.5, fontFamily: FONTS.mono,
            color: CP.accentRed, background: "rgba(240,140,140,0.06)", border: "1px solid rgba(240,140,140,0.18)",
          }}>
            ⚠ Contenuto sensibile · uso interno HOC · le etichette contenuto non entrano in score o compensi
          </div>
        </>
      )}
    </div>
  );
}
