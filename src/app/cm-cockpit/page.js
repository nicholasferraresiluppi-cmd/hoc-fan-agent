"use client";

/**
 * /cm-cockpit — Cockpit CM (Fase 2a career ladder).
 *
 * Vista 1 (nessuna supervisione attiva): apri turno di supervisione.
 * Roster SOLO da timeline CP (regola board: si supervisiona chi ha il turno
 * assegnato; i fuori programma passano dal flag off_schedule, visibile a SM).
 *
 * Vista 2 (supervisione attiva): team live con venduto vs soglie mid/top,
 * feed take (batch CP ~18 min — timestamp dichiarato), check profilo,
 * guadagni CM con override in SHADOW MODE (§10.3 docs/CAREER_LADDER.md).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertCircle, Radio, Play, Square, RefreshCw, UserPlus, ShieldAlert } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";

const LIVE_POLL_MS = 120_000;
const fmt$ = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`);
const fmt$2 = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * Le fasce NON sono fisse: dipendono dal mercato (ITA 5h, ENG 6h) e arrivano
 * dagli slot template della timeline CP (slot_ended_at/slot_hours per riga).
 * Il roster si carica su una finestra larga (−2h → +10h) e si raggruppa per
 * interval; la finestra della supervisione si CALCOLA dagli slot selezionati.
 */
function rosterQueryWindow() {
  const now = Date.now();
  return {
    startedAt: new Date(now - 2 * 3600 * 1000).toISOString(),
    endedAt: new Date(now + 10 * 3600 * 1000).toISOString(),
  };
}
const slotEnd = (r) => r.slot_ended_at || (Date.parse(r.started_at) ? new Date(Date.parse(r.started_at) + 6 * 3600 * 1000).toISOString() : null);
const coversNow = (r) => {
  const s = Date.parse(r.started_at) || 0;
  const e = Date.parse(slotEnd(r)) || 0;
  const now = Date.now();
  return s <= now && now < e;
};

/* Barra venduto vs soglie mid/top (scala = top × 1.5, come mockup) */
function ThresholdBar({ venduto, thresholds }) {
  const top = thresholds?.top;
  const mid = thresholds?.mid;
  if (top == null || mid == null) {
    return <div style={{ fontSize: 11, color: CP.textMuted }}>soglie n/d {thresholds?.band ? `(${thresholds.band})` : ""}</div>;
  }
  const scale = top * 1.5;
  const w = Math.min(100, ((venduto || 0) / scale) * 100);
  const midPct = (mid / scale) * 100;
  const topPct = (top / scale) * 100;
  const over = (venduto || 0) >= top;
  return (
    <div style={{ minWidth: 170 }}>
      <div style={{ position: "relative", height: 9, borderRadius: 99, background: CP.surfaceAlt, border: `1px solid ${CP.border}` }}>
        <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${w}%`, borderRadius: 99, background: over ? `linear-gradient(90deg, ${CP.accent}, ${CP.accentGreen})` : `linear-gradient(90deg, ${CP.accentDim}, ${CP.accent})` }} />
        <div style={{ position: "absolute", top: -3, bottom: -3, left: `${midPct}%`, width: 2, background: CP.textMuted }} />
        <div style={{ position: "absolute", top: -3, bottom: -3, left: `${topPct}%`, width: 2, background: CP.textSecondary }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: CP.textMuted, marginTop: 4, fontFamily: FONTS.mono }}>
        <span>mid {mid}</span><span>top {top}</span>
      </div>
    </div>
  );
}

function StatusPill({ op }) {
  const t = op.thresholds;
  const style = (color, bg, border) => ({
    display: "inline-block", fontSize: 11, fontWeight: 600, borderRadius: 99,
    padding: "2px 10px", color, background: bg, border: `1px solid ${border}`, whiteSpace: "nowrap",
  });
  if (op.off_schedule) return <span style={style(CP.accentRed, "rgba(240,140,140,0.08)", "rgba(240,140,140,0.4)")}>Fuori programma</span>;
  if (!op.wage_shift_found) return <span style={style(CP.textMuted, CP.surface, CP.border)}>Nessun wage-shift</span>;
  if (t?.top != null && op.venduto >= t.top) return <span style={style(CP.accentGreen, "rgba(74,222,128,0.07)", "rgba(74,222,128,0.35)")}>Sopra top · ecc. {fmt$(op.excess)}</span>;
  if (t?.mid != null && op.venduto >= t.mid) return <span style={style(CP.accentSoftText, "rgba(139,124,246,0.08)", "rgba(139,124,246,0.4)")}>Verso top · −{fmt$((t.top ?? 0) - op.venduto)}</span>;
  if (t?.mid != null) return <span style={style(CP.textMuted, CP.surface, CP.border)}>Sotto mid · −{fmt$(t.mid - (op.venduto || 0))}</span>;
  return <span style={style(CP.textMuted, CP.surface, CP.border)}>—</span>;
}

export default function CmCockpitPage() {
  const [phase, setPhase] = useState("loading"); // loading | open | live | denied
  const [error, setError] = useState(null);

  // Vista 1
  const [roster, setRoster] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [fascia, setFascia] = useState(null); // interval name attivo
  const [selected, setSelected] = useState({}); // shift_id → bool
  const [offName, setOffName] = useState("");
  const [offList, setOffList] = useState([]);
  const [opening, setOpening] = useState(false);

  // Vista 2
  const [live, setLive] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const seenTakesRef = useRef(new Set());
  const [newTakeKeys, setNewTakeKeys] = useState(new Set());

  const checkActive = useCallback(async () => {
    try {
      const r = await fetch("/api/cm-cockpit/supervision");
      if (r.status === 401 || r.status === 403) { setPhase("denied"); return; }
      const j = await r.json();
      setPhase(j.active ? "live" : "open");
    } catch (e) {
      setError(String(e?.message || e)); setPhase("open");
    }
  }, []);

  useEffect(() => { checkActive(); }, [checkActive]);

  /* ---------- Vista 1: roster ---------- */
  const loadRoster = useCallback(async () => {
    setRosterLoading(true); setError(null);
    try {
      const win = rosterQueryWindow();
      const qs = new URLSearchParams({ startedAt: win.startedAt, endedAt: win.endedAt });
      const r = await fetch(`/api/cm-cockpit/roster?${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setRoster(j.roster);
      // fascia default: quella che copre ADESSO (o la prima disponibile)
      const current = j.roster.find(coversNow);
      const first = j.roster[0];
      const f = current?.interval || first?.interval || null;
      setFascia(f);
      // default: selezionati quelli della fascia con check-in aperto
      const sel = {};
      for (const row of j.roster) {
        if (row.interval === f && row.checkin && !row.checkin.ended_at) sel[row.shift_id] = true;
      }
      setSelected(sel);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setRosterLoading(false);
    }
  }, []);

  useEffect(() => { if (phase === "open") loadRoster(); }, [phase, loadRoster]);

  const fasce = useMemo(() => {
    const map = new Map();
    for (const r of roster || []) {
      const key = r.interval || "—";
      if (!map.has(key)) map.set(key, { name: key, rows: [], minStart: null, maxEnd: null });
      const g = map.get(key);
      g.rows.push(r);
      const s = Date.parse(r.started_at) || null;
      const e = Date.parse(slotEnd(r)) || null;
      if (s && (!g.minStart || s < g.minStart)) g.minStart = s;
      if (e && (!g.maxEnd || e > g.maxEnd)) g.maxEnd = e;
    }
    return [...map.values()].sort((a, b) => (a.minStart || 0) - (b.minStart || 0));
  }, [roster]);

  const fasciaRows = useMemo(
    () => (roster || []).filter((r) => (fascia ? r.interval === fascia : true)),
    [roster, fascia]
  );

  const openSupervision = useCallback(async () => {
    setOpening(true); setError(null);
    try {
      const rows = fasciaRows.filter((r) => selected[r.shift_id]);
      // Finestra = dagli slot REALI selezionati (ITA 5h, ENG 6h — mai fissa)
      const starts = rows.map((r) => Date.parse(r.started_at)).filter(Boolean);
      const ends = rows.map((r) => Date.parse(slotEnd(r))).filter(Boolean);
      const winStart = starts.length ? new Date(Math.min(...starts)).toISOString() : new Date().toISOString();
      const winEnd = ends.length ? new Date(Math.max(...ends)).toISOString() : new Date(Date.now() + 6 * 3600 * 1000).toISOString();
      const operators = [
        ...rows.map((r) => ({
          member_id: r.member_id, member_name: r.member_name,
          creator_id: r.creator_id, creator_alias: r.creator_alias,
          shift_id: r.shift_id, payment_profile: r.payment_profile, off_schedule: false,
        })),
        ...offList.map((name) => ({ member_id: null, member_name: name, creator_id: null, creator_alias: null, shift_id: null, payment_profile: null, off_schedule: true })),
      ];
      const r = await fetch("/api/cm-cockpit/supervision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", window: { startedAt: winStart, endedAt: winEnd }, operators }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      seenTakesRef.current = new Set();
      setPhase("live");
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setOpening(false);
    }
  }, [fasciaRows, selected, offList]);

  /* ---------- Vista 2: live ---------- */
  const loadLive = useCallback(async () => {
    setLiveLoading(true);
    try {
      const r = await fetch("/api/cm-cockpit/live");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      // evidenzia i take mai visti in questa sessione
      const fresh = new Set();
      for (const op of j.operators || []) {
        for (const t of op.takes || []) {
          const key = `${op.member_id}|${t.created_at}|${t.amount}`;
          if (!seenTakesRef.current.has(key)) { fresh.add(key); seenTakesRef.current.add(key); }
        }
      }
      setNewTakeKeys(fresh);
      setLive(j);
      setError(null);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (phase !== "live") return;
    loadLive();
    const t = setInterval(loadLive, LIVE_POLL_MS);
    return () => clearInterval(t);
  }, [phase, loadLive]);

  const closeShift = useCallback(async () => {
    if (!window.confirm("Chiudere il turno di supervisione?")) return;
    setClosing(true); setError(null);
    try {
      const summary = live
        ? {
            venduto_team: (live.operators || []).reduce((s, o) => s + (o.venduto || 0), 0),
            sopra_soglia: (live.operators || []).filter((o) => o.thresholds?.top != null && o.venduto >= o.thresholds.top).length,
            operators_count: (live.operators || []).length,
            excess_total: live.earnings?.excess_total ?? 0,
            override_shadow_usd: live.earnings?.override_shadow_usd ?? 0,
          }
        : null;
      const r = await fetch("/api/cm-cockpit/supervision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", summary }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setLive(null);
      setPhase("open");
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setClosing(false);
    }
  }, [live]);

  const allTakes = useMemo(() => {
    if (!live) return [];
    const rows = [];
    for (const op of live.operators || []) {
      for (const t of op.takes || []) {
        rows.push({ ...t, member_name: op.member_name, creator_alias: op.creator_alias, key: `${op.member_id}|${t.created_at}|${t.amount}` });
      }
    }
    return rows.sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)).slice(0, 14);
  }, [live]);

  /* ---------- render ---------- */
  const shell = (children) => (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1200, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        section="People · Supervisione"
        title="Cockpit CM"
        subtitle="Turno di supervisione: team live, soglie, guadagni (override in shadow mode)."
      />
      {error ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(240,140,140,0.08)", border: `1px solid rgba(240,140,140,0.4)`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: CP.accentRed }}>
          <AlertCircle size={15} /> {error}
        </div>
      ) : null}
      {children}
    </div>
  );

  if (phase === "loading") {
    return shell(<div style={{ display: "flex", gap: 8, alignItems: "center", color: CP.textMuted, fontSize: 13 }}><Loader2 size={15} className="animate-spin" /> Carico…</div>);
  }
  if (phase === "denied") {
    return shell(<CpCard><div style={{ fontSize: 13, color: CP.textSecondary }}>Non hai accesso al cockpit. Serve il ruolo Team Lead (o superiore) — chiedi a un admin da <code>/admin/ruoli</code>.</div></CpCard>);
  }

  /* ---------- Vista 1 ---------- */
  if (phase === "open") {
    const selCount = fasciaRows.filter((r) => selected[r.shift_id]).length + offList.length;
    return shell(
      <>
        <CpCard style={{ marginBottom: 16 }}>
          <SectionLabel>Fascia</SectionLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
            {fasce.map((f) => {
              const active = f.name === fascia;
              return (
                <button key={f.name} onClick={() => setFascia(f.name)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, background: active ? CP.accentSoft : CP.surface, color: active ? CP.accentSoftText : CP.textSecondary, border: `1px solid ${active ? CP.accent + "66" : CP.border}`, borderRadius: 99, padding: "7px 15px", fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: FONTS.body }}>
                  {f.name}
                  <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: active ? CP.accentSoftText : CP.textMuted }}>
                    {f.minStart ? hhmm(new Date(f.minStart).toISOString()) : "—"}–{f.maxEnd ? hhmm(new Date(f.maxEnd).toISOString()) : "—"} · {f.rows.length}
                  </span>
                </button>
              );
            })}
            <button onClick={loadRoster} disabled={rosterLoading}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: CP.surface, color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: FONTS.body }}>
              {rosterLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Aggiorna
            </button>
          </div>
          <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 10 }}>
            Le fasce e le durate arrivano dagli slot reali della timeline CP: i profili ENG hanno turni da 6h, gli ITA da 5h — la finestra della supervisione si calcola dagli slot che selezioni, non è mai fissa.
          </div>
        </CpCard>

        <CpCard style={{ marginBottom: 16 }}>
          <SectionLabel>Operatori in turno (da timeline CP)</SectionLabel>
          {rosterLoading && !roster ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", color: CP.textMuted, fontSize: 13, marginTop: 10 }}><Loader2 size={14} className="animate-spin" /> Leggo la timeline (30-40 creator)…</div>
          ) : fasciaRows.length === 0 ? (
            <div style={{ color: CP.textMuted, fontSize: 13, marginTop: 10 }}>
              Nessun turno assegnato in timeline {fascia ? `per la fascia ${fascia}` : "in questa finestra"} — cambia fascia o usa &quot;Aggiorna&quot;.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
              <thead>
                <tr>
                  {["", "Operatore", "Creator", "Profilo", "Check-in", "Slot"].map((h) => (
                    <th key={h} style={{ textAlign: "left", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: CP.textMuted, fontWeight: 600, padding: "6px 8px", borderBottom: `1px solid ${CP.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fasciaRows.map((r) => {
                  const on = !!selected[r.shift_id];
                  const checkedIn = r.checkin && !r.checkin.ended_at;
                  return (
                    <tr key={r.shift_id} onClick={() => setSelected((s) => ({ ...s, [r.shift_id]: !on }))} style={{ cursor: "pointer" }}>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${CP.borderSoft}` }}>
                        <input type="checkbox" readOnly checked={on} style={{ accentColor: CP.accent }} />
                      </td>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${CP.borderSoft}`, color: CP.textPrimary, fontWeight: 500 }}>{r.member_name}</td>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${CP.borderSoft}`, color: CP.textSecondary }}>{r.creator_alias || "—"}</td>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${CP.borderSoft}`, color: CP.textSecondary }}>
                        {r.payment_profile ? `${r.payment_profile.name}${r.payment_profile.cosellers_count != null ? ` · ${r.payment_profile.cosellers_count}×` : ""}` : "—"}
                      </td>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${CP.borderSoft}` }}>
                        {checkedIn ? (
                          <span style={{ color: CP.accentGreen, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}><Radio size={12} /> {hhmm(r.checkin.started_at)}</span>
                        ) : r.checkin ? (
                          <span style={{ color: CP.textMuted, fontSize: 12 }}>uscito {hhmm(r.checkin.ended_at)}</span>
                        ) : (
                          <span style={{ color: CP.textMuted, fontSize: 12 }}>non ancora</span>
                        )}
                      </td>
                      <td style={{ padding: "8px", borderBottom: `1px solid ${CP.borderSoft}`, color: CP.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
                        {hhmm(r.started_at)}–{hhmm(slotEnd(r))}
                        {r.slot_hours ? (
                          <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: CP.accentSoftText, background: CP.accentSoft, borderRadius: 99, padding: "1px 7px" }}>{r.slot_hours}h</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
            <UserPlus size={14} color={CP.mutedIcons} />
            <input value={offName} onChange={(e) => setOffName(e.target.value)} placeholder="Fuori programma (nome operatore)…"
              style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, padding: "7px 10px", fontSize: 13, fontFamily: FONTS.body, minWidth: 220 }} />
            <button
              onClick={() => { if (offName.trim()) { setOffList((l) => [...l, offName.trim()]); setOffName(""); } }}
              style={{ background: CP.surface, color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontFamily: FONTS.body }}>
              Aggiungi
            </button>
            {offList.map((n, i) => (
              <span key={`${n}-${i}`} onClick={() => setOffList((l) => l.filter((_, j) => j !== i))}
                style={{ fontSize: 11, fontWeight: 600, borderRadius: 99, padding: "3px 10px", color: CP.accentRed, background: "rgba(240,140,140,0.08)", border: "1px solid rgba(240,140,140,0.4)", cursor: "pointer" }}
                title="Clicca per rimuovere">
                {n} · fuori programma ✕
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 8 }}>
            I fuori programma sono flaggati e visibili al Sales Manager (segnale di igiene scheduling). Non hanno pull dati CP.
          </div>
        </CpCard>

        <button onClick={openSupervision} disabled={opening || selCount === 0}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, background: selCount === 0 ? CP.surfaceAlt : CP.accent, color: selCount === 0 ? CP.textMuted : CP.accentInk, border: "none", borderRadius: 10, padding: "11px 22px", fontSize: 14, fontWeight: 700, cursor: selCount === 0 ? "default" : "pointer", fontFamily: FONTS.body }}>
          {opening ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Inizia supervisione ({selCount})
        </button>
      </>
    );
  }

  /* ---------- Vista 2 ---------- */
  const sup = live?.supervision;
  const earn = live?.earnings;
  return shell(
    <>
      <CpCard style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Radio size={14} color={CP.accentGreen} />
            <strong style={{ color: CP.textPrimary }}>Turno {sup ? `${hhmm(sup.window.startedAt)} – ${hhmm(sup.window.endedAt)}` : ""}</strong>
            <span>· {(live?.operators || []).length} operatori</span>
            {liveLoading ? <Loader2 size={13} className="animate-spin" color={CP.mutedIcons} /> : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: CP.textPrimary }}>
              €28 + {fmt$2(earn?.override_shadow_usd)}{" "}
              <span style={{ color: CP.accentSoftText, fontSize: 11 }}>override {earn?.override_pct ?? 3}% · shadow</span>
            </span>
            <button onClick={closeShift} disabled={closing}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: CP.surface, color: CP.textSecondary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: FONTS.body }}>
              {closing ? <Loader2 size={13} className="animate-spin" /> : <Square size={12} />} Chiudi turno
            </button>
          </div>
        </div>
      </CpCard>

      {!live ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: CP.textMuted, fontSize: 13 }}><Loader2 size={14} className="animate-spin" /> Primo pull dati CP…</div>
      ) : (
        <>
          <CpCard style={{ marginBottom: 16 }}>
            <SectionLabel>Team in turno · soglie {live.thresholds_period ? `(mese ${live.thresholds_period})` : ""}</SectionLabel>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
              <thead>
                <tr>
                  {["Operatore · Creator", "Venduto", "vs soglie", "Stato"].map((h) => (
                    <th key={h} style={{ textAlign: "left", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: CP.textMuted, fontWeight: 600, padding: "6px 8px", borderBottom: `1px solid ${CP.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(live.operators || []).map((op, i) => (
                  <tr key={op.shift_id || `${op.member_name}-${i}`}>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${CP.borderSoft}` }}>
                      <div style={{ color: CP.textPrimary, fontWeight: 500, display: "flex", alignItems: "center", gap: 7 }}>
                        {op.member_name}
                        {op.checkin && !op.checkin.ended_at ? <Radio size={11} color={CP.accentGreen} title="Check-in aperto" /> : null}
                        {op.profile_mismatch ? (
                          <span title={`Profilo dichiara ${op.profile_mismatch.declared}× ma risultano ${op.profile_mismatch.actual} check-in attivi sul creator`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: CP.accentRed, background: "rgba(240,140,140,0.08)", border: "1px solid rgba(240,140,140,0.4)", borderRadius: 99, padding: "1px 8px" }}>
                            <ShieldAlert size={11} /> profilo {op.profile_mismatch.declared}× / attivi {op.profile_mismatch.actual}
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 11.5, color: CP.textMuted }}>
                        {op.creator_alias || "—"}{op.thresholds ? ` — ${op.thresholds.band.toUpperCase()} · ${op.thresholds.cls}×` : ""}
                        {op.payment_profile?.name ? ` · ${op.payment_profile.name}` : ""}
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${CP.borderSoft}`, fontFamily: FONTS.mono, color: CP.textPrimary }}>{op.wage_shift_found ? fmt$(op.venduto) : "—"}</td>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${CP.borderSoft}` }}><ThresholdBar venduto={op.venduto} thresholds={op.thresholds} /></td>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${CP.borderSoft}` }}><StatusPill op={op} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: CP.textMuted, marginTop: 10, fontFamily: FONTS.mono }}>
              Dati CP · aggiornati {hhmm(live.pulled_at)} · i take arrivano a blocchi (~15-20 min) · quadro completo a fine turno
            </div>
          </CpCard>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            <CpCard>
              <SectionLabel>Take del turno</SectionLabel>
              {allTakes.length === 0 ? (
                <div style={{ color: CP.textMuted, fontSize: 13, marginTop: 10 }}>Ancora nessun take attribuito in questa finestra.</div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  {allTakes.map((t) => (
                    <div key={t.key} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 12.5, padding: "5px 0", color: CP.textSecondary, background: newTakeKeys.has(t.key) ? "rgba(139,124,246,0.07)" : "transparent", borderRadius: 6 }}>
                      <span style={{ fontFamily: FONTS.mono, color: CP.textMuted, fontSize: 11.5, minWidth: 42 }}>{hhmm(t.transaction_at || t.created_at)}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.member_name} · {t.type || "take"} · {t.creator_alias || ""}</span>
                      <span style={{ fontFamily: FONTS.mono, color: CP.accentGreen, marginLeft: "auto" }}>+{fmt$2(t.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CpCard>
            <CpCard accent>
              <SectionLabel>Guadagno turno · shadow mode</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
                <StatCard label="Fisso supervisione" value="€28" />
                <StatCard label={`Override ${earn?.override_pct ?? 3}% (shadow)`} value={fmt$2(earn?.override_shadow_usd)} sub={`eccedenza ${fmt$(earn?.excess_total)}`} />
              </div>
              <div style={{ fontSize: 11.5, color: CP.textMuted, marginTop: 12 }}>
                L&apos;override è simulato: diventa reale dopo il primo mese di supervisioni tracciate, con la % confermata dal board (§10.3 career ladder).
              </div>
            </CpCard>
          </div>
        </>
      )}
    </>
  );
}
