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
 *
 * Redesign 26/09/2026 (pannello tester SM/TL/UX): la pagina vuota non diceva
 * cosa si ottiene né da dove partire → stato iniziale che lo spiega; numero
 * principale (venduto del giorno) con la quota attribuibile accanto; sigle
 * tradotte ("PPV p→s", "Attrib.", "k=2", "pushy"); il riquadro finale in
 * rosso monospazio con emoji è diventato un avviso normale.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, HeroMetric, Metric, SectionTitle, DataTable, Notice, card, NUM } from "@/components/ds";

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

// Colori SOLO come segnale sulla barra; le etichette sono dati del modello (chiavi fisse)
const SENT_COLORS = { positivo: CP.accentGreen, neutro: CP.textMuted, frustrato: CP.accentRed };
const TONE_COLORS = { warm: CP.accentGreen, neutro: CP.textMuted, pushy: CP.accentSoftText, ostile: CP.accentRed };
const TONE_LABELS = { warm: "caldo", neutro: "neutro", pushy: "insistente", ostile: "ostile" };

function Bars({ data, colors, labels, total }) {
  const entries = Object.entries(data || {});
  const tot = total ?? entries.reduce((a, [, v]) => a + v, 0);
  if (!entries.length) return <div style={{ fontSize: 13, color: CP.textMuted }}>Nessun dato.</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(70px, 110px) 1fr 80px", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: CP.textSecondary }}>{labels?.[k] || k}</span>
          <div style={{ height: 8, borderRadius: 4, background: CP.bgSunken, overflow: "hidden" }}>
            <div style={{ width: tot ? `${(v / tot) * 100}%` : 0, height: "100%", background: colors?.[k] || CP.accentDim, borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: 13, color: CP.textSecondary, textAlign: "right", ...NUM }}>
            {num(v)} · {pctOf(v, tot)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EvidenceList({ items, tint }) {
  if (!items?.length) return <div style={{ fontSize: 13, color: CP.textMuted }}>Nessun caso in questa giornata.</div>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((e, i) => (
        <div key={i} style={{ borderLeft: `2px solid ${tint}`, paddingLeft: 12 }}>
          <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 2 }}>
            fan {e.uid} · {e.sentiment} / {TONE_LABELS[e.tono] || e.tono}
            {e.obiezione !== "nessuna" ? ` · obiezione: ${e.obiezione}` : ""}
          </div>
          <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.45 }}>{e.sintesi}</div>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, icon, children }) {
  return (
    <div style={{ ...card, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 14, fontWeight: 500, color: CP.textPrimary }}>
        {icon}
        {title}
      </div>
      {children}
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
    background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`,
    borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: FONTS.body,
  };
  const frustratedShare = analysis ? (analysis.sentiment?.frustrato || 0) / Math.max(1, analysis.convs_labeled) : null;

  const shiftRows = (data?.shifts || []).map((s, i) => ({ ...s, id: i }));
  const shiftCols = [
    {
      key: "start", label: "Turno", sort: (s) => Date.parse(s.start),
      render: (s) => (
        <span style={{ whiteSpace: "nowrap", ...NUM }}>
          {hhmm(s.start)}–{hhmm(s.end)}
          {s.windows && s.windows !== "reale" ? <span title="check-in mancante: orario programmato, non reale" style={{ color: CP.textMuted }}> ~</span> : null}
          {dayMark(s.start, day) ? <span title="il turno parte in un altro giorno (ora di Roma)" style={{ marginLeft: 6, fontSize: 11, color: CP.textMuted, border: `1px solid ${CP.border}`, borderRadius: 4, padding: "1px 4px" }}>{dayMark(s.start, day)}</span> : null}
        </span>
      ),
    },
    {
      key: "operators", label: "Operatori", sort: (s) => s.operators.join(" "),
      render: (s) => (
        <span>
          {s.operators.join(" + ")}
          {(s.members || []).length > 1 || (s.members || []).some((mm) => Math.abs(Date.parse(mm.start) - Date.parse(s.start)) > 600000 || Math.abs(Date.parse(mm.end) - Date.parse(s.end)) > 600000) ? (
            <div style={{ marginTop: 3, fontSize: 12, color: CP.textMuted, ...NUM }}>
              {(s.members || []).map((mm, ii) => (
                <span key={ii}>{ii > 0 ? " · " : ""}{mm.op} {hhmm(mm.start)}→{hhmm(mm.end)}{mm.real ? "" : " ~"}</span>
              ))}
            </div>
          ) : null}
        </span>
      ),
    },
    {
      key: "attribution", label: "Chi era in chat", sort: (s) => (s.attribution === "singolo" ? 1 : s.k || 2),
      render: (s) => (s.attribution === "singolo"
        ? <span style={{ color: CP.textPrimary }}>1 operatore</span>
        : <span style={{ color: CP.textMuted }} title="In coppia non si sa chi ha scritto cosa: venduto e chat non sono attribuibili al singolo">{s.k} in coppia</span>),
    },
    { key: "active_fans", label: "Fan attivi", align: "right", render: (s) => num(s.active_fans) },
    { key: "op_msgs", label: "Messaggi operatore", align: "right", render: (s) => num(s.op_msgs) },
    { key: "ppv_proposed", label: "PPV proposti → sbloccati", align: "right", render: (s) => `${num(s.ppv_proposed)} → ${num(s.ppv_unlocked)}` },
    { key: "net_usd", label: "Venduto", align: "right", render: (s) => <span style={{ fontWeight: 500, color: s.net_usd > 0 ? CP.textPrimary : CP.textMuted }}>{usd(s.net_usd)}</span> },
  ];

  const perShiftRows = (analysis?.per_shift || []).map((s, i) => ({ ...s, id: i }));
  const aggr = (s) => (s.tono?.pushy || 0) + (s.tono?.ostile || 0);
  const perShiftCols = [
    { key: "start", label: "Turno", sort: (s) => Date.parse(s.start), render: (s) => <span style={{ whiteSpace: "nowrap", ...NUM }}>{hhmm(s.start)}–{hhmm(s.end)}</span> },
    { key: "operators", label: "Operatori", muted: true, sort: (s) => s.operators.join(" "), render: (s) => `${s.operators.join(" + ")}${s.attribution === "duo" ? " · in coppia" : ""}` },
    { key: "convs", label: "Conversazioni lette", align: "right", render: (s) => num(s.convs) },
    {
      key: "frustrati", label: "Fan frustrati", align: "right", sort: (s) => (s.sentiment?.frustrato || 0) / Math.max(1, s.convs),
      render: (s) => { const fr = s.sentiment?.frustrato || 0; return <span style={{ color: fr / Math.max(1, s.convs) > 0.25 ? CP.accentRed : CP.textSecondary }}>{num(fr)} · {pctOf(fr, s.convs)}</span>; },
    },
    {
      key: "aggr", label: "Tono insistente o ostile", align: "right", sort: (s) => aggr(s) / Math.max(1, s.convs),
      render: (s) => <span style={{ color: aggr(s) / Math.max(1, s.convs) > 0.4 ? CP.accentRed : CP.textSecondary }}>{num(aggr(s))} · {pctOf(aggr(s), s.convs)}</span>,
    },
    { key: "flag_onesta", label: "Segnalazioni di onestà", align: "right", render: (s) => <span style={{ color: s.flag_onesta > 0 ? CP.accentRed : CP.textMuted }}>{num(s.flag_onesta)}</span> },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Performance" }, { label: "Qualità turni" }]}
        title="Qualità turni"
        subtitle="Com'è andata una giornata su un creator, turno per turno: chi era in chat, quanti PPV sono stati proposti e comprati, quanto si è venduto. Parti da un giorno andato male per capire in quale turno si è perso."
        actions={
          <>
            <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} style={selStyle} aria-label="Creator">
              <option value="">Scegli creator…</option>
              {(creators || []).map((c) => (
                <option key={c.creator_id} value={c.creator_id}>{c.creator_name}</option>
              ))}
            </select>
            <input type="date" value={day} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDay(e.target.value)} style={selStyle} aria-label="Giorno" />
          </>
        }
      />

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: CP.textMuted, fontSize: 14, padding: "12px 0" }}>
          <Loader2 size={16} className="animate-spin" /> Caricamento…
        </div>
      )}
      {error && <Notice danger>{error}</Notice>}

      {!loading && !error && !creatorId && (
        <Notice>
          Scegli un creator in alto a destra (il giorno parte da ieri). Vedrai i turni di quella giornata con chi era in chat, i PPV proposti e
          comprati e il venduto; poi, se serve, puoi far leggere le chat a un modello AI per trovare fan frustrati, obiezioni e vendite mancate.
        </Notice>
      )}

      {!loading && !error && data && creatorId && (
        <>
          <HeroMetric
            label="Venduto nella giornata"
            value={usd(t?.net_usd)}
            compare={`${num(t?.txns)} transazioni · attribuite alla finestra di ogni turno`}
            hint="indicativo, non contabile"
          >
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Metric label="Attribuibile a un solo operatore" value={usd(t?.singolo_net)} note={`${usd(t?.duo_net)} in turni in coppia`} />
              <Metric label="PPV proposti → comprati" value={`${num(t?.ppv_proposed)} → ${num(t?.ppv_unlocked)}`} note={`${pctOf(t?.ppv_unlocked || 0, t?.ppv_proposed || 0)} comprati`} />
              <Metric
                label="Fan frustrati"
                value={analysis ? pctOf(analysis.sentiment?.frustrato || 0, analysis.convs_labeled || 0) : "—"}
                note={analysis ? `su ${num(analysis.convs_labeled)} conversazioni lette` : "serve l'analisi delle chat"}
                danger={frustratedShare != null && frustratedShare > 0.2}
              />
            </div>
          </HeroMetric>

          <div style={{ marginTop: 22 }}>
            <SectionTitle aside="orari di Roma · ~ = orario programmato (manca il check-in)">Turni del giorno</SectionTitle>
          </div>
          <DataTable columns={shiftCols} rows={shiftRows} minWidth={820} empty="Nessun turno CreatorsPro su questo creator in questo giorno." />
          <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 8, lineHeight: 1.55 }}>
            Venduto = transazioni cadute nella finestra del turno: indicativo, non contabile. Nei turni in coppia il venduto e le chat NON sono
            attribuibili al singolo operatore: il warehouse non registra chi ha scritto.
          </div>

          <div style={{ marginTop: 28 }}>
            <SectionTitle aside="letta da un modello AI · solo per il coaching">Analisi delle chat</SectionTitle>
          </div>
          {!analysis && (!job || job.status === "missing" || job.status === "empty") && (
            <div style={{ ...card, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: CP.textSecondary, maxWidth: 640, lineHeight: 1.5 }}>
                  Un modello AI legge le conversazioni del giorno e segna com&apos;era il fan a fine chat, il tono dell&apos;operatore, le obiezioni e
                  le possibili scorrettezze. Solo admin, ha un costo per ogni giornata analizzata; le etichette servono al coaching e{" "}
                  <strong style={{ fontWeight: 500, color: CP.textPrimary }}>non entrano in nessuno score</strong>.
                </div>
                <button onClick={() => startAnalysis(false)} style={{
                  display: "flex", alignItems: "center", gap: 8, background: CP.accent, color: CP.accentInk,
                  border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body,
                }}>
                  <Sparkles size={14} /> Analizza giornata
                </button>
              </div>
              {analysisErr && <div style={{ marginTop: 10, fontSize: 13, color: CP.accentRed }}>{analysisErr}</div>}
            </div>
          )}
          {job?.status === "running" && (
            <div style={{ ...card, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Loader2 size={15} className="animate-spin" style={{ color: CP.accent }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 6, ...NUM }}>
                    Analisi in corso · {num(job.done)} su {num(job.total)} conversazioni
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: CP.bgSunken, overflow: "hidden" }}>
                    <div style={{ width: job.total ? `${(job.done / job.total) * 100}%` : 0, height: "100%", background: CP.accent }} />
                  </div>
                </div>
              </div>
              {analysisErr && <div style={{ marginTop: 10, fontSize: 13, color: CP.accentRed }}>{analysisErr}: ricarica la pagina per riprendere.</div>}
            </div>
          )}
          {analysis && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 12 }}>
                <Panel title="Com'era il fan a fine chat"><Bars data={analysis.sentiment} colors={SENT_COLORS} /></Panel>
                <Panel title="Tono dell'operatore"><Bars data={analysis.tono} colors={TONE_COLORS} labels={TONE_LABELS} /></Panel>
                <Panel title="Obiezioni (perché il fan non compra)"><Bars data={analysis.obiezioni} colors={{}} /></Panel>
              </div>

              <div style={{ marginTop: 12 }}>
                <DataTable columns={perShiftCols} rows={perShiftRows} minWidth={720} empty="Nessun turno analizzato." />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 12, marginTop: 12 }}>
                <Panel title="Possibili scorrettezze: da verificare" icon={<ShieldAlert size={14} color={CP.accentRed} />}>
                  <EvidenceList items={analysis.evidenze?.onesta} tint={CP.accentRed} />
                </Panel>
                <Panel title="Vendite non chiuse">
                  <EvidenceList items={analysis.evidenze?.opportunita} tint={CP.accentSoftText} />
                </Panel>
                <Panel title="Fan a rischio abbandono (frustrati o trattati male)">
                  <EvidenceList items={analysis.evidenze?.churn} tint={CP.accentRed} />
                </Panel>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: CP.textMuted }}>
                  {num(analysis.convs_labeled)} conversazioni etichettate ({analysis.convs_failed ? `${analysis.convs_failed} non riuscite · ` : ""}modello {analysis.model}) · generata{" "}
                  {new Date(analysis.generated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}
                </div>
                <button onClick={() => startAnalysis(true)} style={{
                  background: CP.surface, color: CP.textSecondary, border: `1px solid ${CP.border}`,
                  borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontFamily: FONTS.body,
                }}>
                  Rianalizza
                </button>
              </div>
            </>
          )}

          <div style={{ marginTop: 22 }}>
            <Notice>Contenuto sensibile, solo per uso interno HOC. Le etichette sulle chat non entrano in score né compensi.</Notice>
          </div>
        </>
      )}
    </div>
  );
}
