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
 *
 * Redesign 26/09/2026 sul design system (superficie del team lead / CM, spesso
 * da telefono): testata DS; apertura turno in passi numerati (fascia → chi
 * segui → inizia) col motivo quando "Inizia" è spento; numero principale del
 * turno = venduto del team con quanti sono sopra la soglia alta; gergo tradotto
 * (wage-shift, take, mid/top, override in shadow mode, gate L2→L3); barre soglia
 * piatte (niente gradienti); tabelle DS che scorrono dentro di sé a 390px.
 * Logica, polling, chiamate e payload invariati.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Radio, Play, Square, RefreshCw, UserPlus, ShieldAlert, X } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { fmt$ } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, SectionTitle, Notice, DataTable, card, NUM } from "@/components/ds";

const LIVE_POLL_MS = 120_000;
const QUICK_TAGS = [
  "Ottimo ritmo",
  "Coaching: escalation PPV",
  "Coaching: retention fan",
  "Coaching: tono/brand voice",
  "Segnalato: profilo errato",
  "Ritardo/assenza",
];
const fmt$2 = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
// SEMPRE ora italiana esplicita (mai browser-local): un CM all'estero deve
// vedere gli stessi orari di chi pianifica i turni. Etichetta in UI.
const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }) : "—");

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

/* Barra venduto vs soglie intermedia/alta (scala = soglia alta × 1.5). Piatta. */
function ThresholdBar({ venduto, thresholds }) {
  const top = thresholds?.top;
  const mid = thresholds?.mid;
  if (top == null || mid == null) {
    return <div style={{ fontSize: 12, color: CP.textMuted }}>soglie non disponibili{thresholds?.band ? ` (${thresholds.band})` : ""}</div>;
  }
  const scale = top * 1.5;
  const w = Math.min(100, ((venduto || 0) / scale) * 100);
  const midPct = (mid / scale) * 100;
  const topPct = (top / scale) * 100;
  const over = (venduto || 0) >= top;
  return (
    <div style={{ minWidth: 170 }}>
      <div style={{ position: "relative", height: 8, borderRadius: 99, background: CP.surfaceAlt }}>
        <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${w}%`, borderRadius: 99, background: over ? CP.accent : alpha(CP.accent, "88") }} />
        <div style={{ position: "absolute", top: -3, bottom: -3, left: `${midPct}%`, width: 2, background: CP.textMuted }} />
        <div style={{ position: "absolute", top: -3, bottom: -3, left: `${topPct}%`, width: 2, background: CP.textPrimary }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: CP.textMuted, marginTop: 4, ...NUM }}>
        <span>intermedia {fmt$(mid)}</span><span>alta {fmt$(top)}</span>
      </div>
    </div>
  );
}

function statusOf(op) {
  const t = op.thresholds;
  if (op.off_schedule) return { label: "Fuori programma", tone: "danger" };
  if (!op.wage_shift_found) return { label: "Turno non trovato in CP", tone: "muted" };
  if (t?.top != null && op.venduto >= t.top) return { label: `Sopra la soglia alta · +${fmt$(op.excess)}`, tone: "good" };
  if (t?.mid != null && op.venduto >= t.mid) return { label: `Mancano ${fmt$((t.top ?? 0) - op.venduto)} alla soglia alta`, tone: "accent" };
  if (t?.mid != null) return { label: `Mancano ${fmt$(t.mid - (op.venduto || 0))} alla intermedia`, tone: "muted" };
  return { label: "—", tone: "muted" };
}

function StatusPill({ op }) {
  const s = statusOf(op);
  const color = s.tone === "danger" ? CP.accentRed : s.tone === "good" ? CP.accentGreen : s.tone === "accent" ? CP.accentSoftText : CP.textMuted;
  return <span style={{ fontSize: 13, color, whiteSpace: "nowrap" }}>{s.label}</span>;
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

  // Vista 4 (pannello chiusura con note per operatore)
  const [closingOpen, setClosingOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState({}); // opKey → { tags: [], text: "" }

  // Vista 3 (guadagni del mese)
  const [tab, setTab] = useState("turno");
  const [earnings, setEarnings] = useState(null);
  const [earningsLoading, setEarningsLoading] = useState(false);

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

  const opKey = (op) => op.shift_id || op.member_name;

  const confirmClose = useCallback(async () => {
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
      const notes = (live?.operators || [])
        .map((op) => {
          const d = noteDraft[opKey(op)];
          if (!d || ((d.tags || []).length === 0 && !(d.text || "").trim())) return null;
          return { member_id: op.member_id, member_name: op.member_name, tags: d.tags || [], text: (d.text || "").trim() };
        })
        .filter(Boolean);
      const r = await fetch("/api/cm-cockpit/supervision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", summary, notes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setClosingOpen(false);
      setNoteDraft({});
      setLive(null);
      setEarnings(null); // il mese è cambiato: ricarica al prossimo accesso
      setPhase("open");
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setClosing(false);
    }
  }, [live, noteDraft]);

  const toggleTag = (key, tag) =>
    setNoteDraft((d) => {
      const cur = d[key] || { tags: [], text: "" };
      const tags = cur.tags.includes(tag) ? cur.tags.filter((t) => t !== tag) : [...cur.tags, tag];
      return { ...d, [key]: { ...cur, tags } };
    });

  /* ---------- Vista 3: guadagni ---------- */
  const loadEarnings = useCallback(async () => {
    setEarningsLoading(true);
    try {
      const r = await fetch("/api/cm-cockpit/earnings");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setEarnings(j);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setEarningsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (phase === "open" && tab === "guadagni" && !earnings && !earningsLoading) loadEarnings();
  }, [phase, tab, earnings, earningsLoading, loadEarnings]);

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
  const shell = (children, actions) => (
    <div style={{ padding: "28px 24px 80px", maxWidth: 1180, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "People" }, { label: "Cockpit CM" }]}
        title="Cockpit CM"
        subtitle="Il tuo turno di supervisione: scegli chi segui, guarda in diretta quanto vende ciascuno rispetto alle sue soglie e chiudi con una nota per persona. Qui vedi anche quanto hai maturato nel mese."
        actions={actions}
      />
      {error ? <Notice danger>{error}</Notice> : null}
      {children}
    </div>
  );
  const spinner = (text) => (
    <div style={{ display: "flex", gap: 8, alignItems: "center", color: CP.textMuted, fontSize: 14 }}><Loader2 size={15} className="animate-spin" /> {text}</div>
  );

  if (phase === "loading") return shell(spinner("Carico…"));
  if (phase === "denied") {
    return shell(<Notice>Non hai accesso al cockpit: serve il ruolo Team Lead (o superiore). Chiedilo a un admin dalla pagina Membri.</Notice>);
  }

  /* ---------- Vista 1 + Vista 3 (tab) ---------- */
  if (phase === "open") {
    const selCount = fasciaRows.filter((r) => selected[r.shift_id]).length + offList.length;
    const tabsRow = (
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterChip label="Apri un turno" active={tab === "turno"} onClick={() => setTab("turno")} />
        <FilterChip label="I miei guadagni" active={tab === "guadagni"} onClick={() => setTab("guadagni")} />
      </div>
    );

    if (tab === "guadagni") {
      const tot = earnings?.totals;
      const shiftCols = [
        { key: "opened_at", label: "Data", sort: (s) => Date.parse(s.opened_at) || 0, render: (s) => (s.opened_at ? new Date(s.opened_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" }) : "—") },
        { key: "window", label: "Orario", sortable: false, muted: true, render: (s) => `${hhmm(s.window?.startedAt)}–${hhmm(s.window?.endedAt)}` },
        { key: "operators_count", label: "Operatori", align: "right" },
        { key: "sopra_soglia", label: "Sopra la soglia alta", align: "right", render: (s) => s.sopra_soglia ?? "—" },
        { key: "excess_total", label: "Venduto oltre la soglia", align: "right", render: (s) => fmt$(s.excess_total) },
        { key: "override_shadow_usd", label: "Il tuo 3% (simulato)", align: "right", render: (s) => fmt$2(s.override_shadow_usd) },
        { key: "notes_count", label: "Note", align: "right" },
      ];
      return shell(
        <>
          {tabsRow}
          {earningsLoading && !earnings ? spinner("Carico lo storico…") : (
            <>
              <HeroMetric
                label={`Maturato questo mese${earnings?.month_id ? ` (${earnings.month_id})` : ""}`}
                value={`€${tot?.fixed_eur ?? 0} + ${fmt$2(tot?.override_shadow_usd)}`}
                compare={`fisso per ${tot?.shifts_count ?? 0} turni di supervisione + 3% simulato sul venduto oltre la soglia alta (${fmt$(tot?.excess_total)})`}
                hint="Il 3% è una simulazione: diventa reale dopo il primo mese di supervisioni registrate, con la percentuale confermata dal board. Il fisso (€28 a turno) è pagato fuori piattaforma: qui è solo contato."
              >
                <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <Metric label="Turni di supervisione" value={tot?.shifts_count ?? 0} />
                  <Metric label="Note lasciate" value={tot?.notes_total ?? 0} />
                </div>
              </HeroMetric>
              <SectionTitle>Turni chiusi questo mese</SectionTitle>
              {!earnings || earnings.shifts.length === 0 ? (
                <Notice>Nessun turno chiuso questo mese. Aprine uno da “Apri un turno”: quando lo chiudi compare qui.</Notice>
              ) : (
                <DataTable columns={shiftCols} rows={earnings.shifts} defaultSort={{ key: "opened_at", dir: -1 }} minWidth={760} maxHeight={560} />
              )}
            </>
          )}
        </>
      );
    }

    const rosterCols = [
      { key: "sel", label: "", sortable: false, render: (r) => <input type="checkbox" readOnly checked={!!selected[r.shift_id]} aria-label={`Seleziona ${r.member_name}`} style={{ accentColor: CP.accent, width: 16, height: 16 }} /> },
      { key: "member_name", label: "Operatore", render: (r) => <span style={{ fontWeight: 500 }}>{r.member_name}</span> },
      { key: "creator_alias", label: "Creator", muted: true, render: (r) => r.creator_alias || "—" },
      {
        key: "payment_profile", label: "Profilo di paga", muted: true, sort: (r) => r.payment_profile?.name || "",
        render: (r) => (r.payment_profile ? `${r.payment_profile.name}${r.payment_profile.cosellers_count != null ? ` · ${r.payment_profile.cosellers_count} in turno` : ""}` : "—"),
      },
      {
        key: "checkin", label: "Presenza", sort: (r) => (r.checkin && !r.checkin.ended_at ? 2 : r.checkin ? 1 : 0),
        render: (r) => {
          const checkedIn = r.checkin && !r.checkin.ended_at;
          if (checkedIn) return <span style={{ color: CP.accentGreen, display: "inline-flex", alignItems: "center", gap: 5 }}><Radio size={12} /> entrato alle {hhmm(r.checkin.started_at)}</span>;
          if (r.checkin) return <span style={{ color: CP.textMuted }}>uscito alle {hhmm(r.checkin.ended_at)}</span>;
          return <span style={{ color: CP.textMuted }}>non ancora entrato</span>;
        },
      },
      {
        key: "started_at", label: "Turno", sort: (r) => Date.parse(r.started_at) || 0,
        render: (r) => <span style={{ color: CP.textSecondary, ...NUM }}>{hhmm(r.started_at)}–{hhmm(slotEnd(r))}{r.slot_hours ? <span style={{ color: CP.textMuted }}> · {r.slot_hours} ore</span> : null}</span>,
      },
    ];

    return shell(
      <>
        {tabsRow}
        <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
          <SectionTitle aside="orari in ora italiana">1 · Scegli la fascia</SectionTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {fasce.map((f) => (
              <FilterChip key={f.name} active={f.name === fascia} onClick={() => setFascia(f.name)}
                label={`${f.name} · ${f.minStart ? hhmm(new Date(f.minStart).toISOString()) : "—"}–${f.maxEnd ? hhmm(new Date(f.maxEnd).toISOString()) : "—"} · ${f.rows.length} ${f.rows.length === 1 ? "turno" : "turni"}`} />
            ))}
            <button onClick={loadRoster} disabled={rosterLoading} style={btnSecondary}>
              {rosterLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Aggiorna
            </button>
          </div>
          <div style={{ fontSize: 13, color: CP.textMuted, marginTop: 10, lineHeight: 1.5 }}>
            Fasce e durate arrivano dai turni pianificati in CreatorsPro: i profili inglesi fanno turni da 6 ore, quelli italiani da 5. L’orario della supervisione si calcola dai turni che selezioni.
          </div>
        </section>

        <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
          <SectionTitle aside="dai turni pianificati in CreatorsPro · già selezionati quelli entrati">2 · Scegli chi segui</SectionTitle>
          {rosterLoading && !roster ? spinner("Leggo i turni pianificati (30-40 creator, qualche secondo)…") : fasciaRows.length === 0 ? (
            <div style={{ color: CP.textSecondary, fontSize: 14 }}>
              Nessun turno pianificato {fascia ? `nella fascia ${fascia}` : "nelle prossime ore"}. Scegli un’altra fascia o premi “Aggiorna”.
            </div>
          ) : (
            <DataTable columns={rosterCols} rows={fasciaRows.map((r) => ({ ...r, id: r.shift_id }))}
              onRowClick={(r) => setSelected((s) => ({ ...s, [r.shift_id]: !s[r.shift_id] }))} selected={(r) => !!selected[r.shift_id]}
              minWidth={720} maxHeight={480} />
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
            <UserPlus size={15} color={CP.textMuted} />
            <input value={offName} onChange={(e) => setOffName(e.target.value)} placeholder="Nome di chi lavora fuori programma"
              aria-label="Operatore fuori programma"
              style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, padding: "8px 10px", fontSize: 14, fontFamily: FONTS.body, flex: "1 1 220px", minWidth: 0, maxWidth: 320 }} />
            <button onClick={() => { if (offName.trim()) { setOffList((l) => [...l, offName.trim()]); setOffName(""); } }} style={btnSecondary}>
              Aggiungi
            </button>
          </div>
          {offList.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {offList.map((n, i) => (
                <button key={`${n}-${i}`} onClick={() => setOffList((l) => l.filter((_, j) => j !== i))} title="Togli"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, borderRadius: 99, padding: "4px 10px", color: CP.textPrimary, background: CP.surface, border: `1px solid ${CP.accentRed}`, cursor: "pointer", fontFamily: FONTS.body }}>
                  {n} · fuori programma <X size={12} />
                </button>
              ))}
            </div>
          )}
          <div style={{ fontSize: 13, color: CP.textMuted, marginTop: 8, lineHeight: 1.5 }}>
            Chi lavora senza turno pianificato va aggiunto qui: il sales manager lo vede segnalato (serve a tenere in ordine i turni). Per queste persone non arrivano i dati di vendita da CreatorsPro.
          </div>
        </section>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button onClick={openSupervision} disabled={opening || selCount === 0}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: selCount === 0 ? CP.surfaceAlt : CP.accent, color: selCount === 0 ? CP.textMuted : CP.accentInk, border: "none", borderRadius: 10, padding: "11px 22px", fontSize: 15, fontWeight: 500, cursor: selCount === 0 ? "default" : "pointer", fontFamily: FONTS.body }}>
            {opening ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} 3 · Inizia la supervisione ({selCount})
          </button>
          {selCount === 0 && <span style={{ fontSize: 13, color: CP.textMuted }}>Seleziona almeno un operatore o aggiungi un fuori programma.</span>}
        </div>
      </>
    );
  }

  /* ---------- Vista 2 ---------- */
  const sup = live?.supervision;
  const earn = live?.earnings;
  const ops = live?.operators || [];
  const teamSold = ops.reduce((s, o) => s + (o.venduto || 0), 0);
  const overTop = ops.filter((o) => o.thresholds?.top != null && o.venduto >= o.thresholds.top).length;
  const closeBtn = (
    <button onClick={() => setClosingOpen(true)} disabled={closing || closingOpen} style={{ ...btnSecondary, opacity: closingOpen ? 0.5 : 1 }}>
      <Square size={12} /> Chiudi turno
    </button>
  );

  const liveCols = [
    {
      key: "member_name", label: "Operatore",
      render: (op) => (
        <div style={{ minWidth: 180 }}>
          <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            {op.member_name}
            {op.checkin && !op.checkin.ended_at ? <Radio size={11} color={CP.accentGreen} aria-label="In turno ora" /> : null}
          </div>
          <div style={{ fontSize: 12.5, color: CP.textMuted }}>
            {op.creator_alias || "—"}{op.thresholds ? ` · fascia ${String(op.thresholds.band).toUpperCase()}, ${op.thresholds.cls} in turno` : ""}
            {op.payment_profile?.name ? ` · ${op.payment_profile.name}` : ""}
          </div>
          {op.profile_mismatch ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: CP.accentRed, marginTop: 2 }}>
              <ShieldAlert size={12} /> Profilo per {op.profile_mismatch.declared} in turno, ma ne risultano {op.profile_mismatch.actual} attivi sul creator
            </div>
          ) : null}
        </div>
      ),
    },
    { key: "venduto", label: "Venduto", align: "right", render: (op) => (op.wage_shift_found ? fmt$(op.venduto) : "—") },
    { key: "bar", label: "Rispetto alle soglie", sortable: false, render: (op) => <ThresholdBar venduto={op.venduto} thresholds={op.thresholds} /> },
    { key: "stato", label: "Stato", sort: (op) => statusOf(op).label, render: (op) => <StatusPill op={op} /> },
  ];

  return shell(
    <>
      {!live ? spinner("Primo caricamento dei dati da CreatorsPro…") : closingOpen ? (
        /* ---------- Vista 4: chiusura con note ---------- */
        <>
          <HeroMetric label="Venduto del team nel turno" value={fmt$(teamSold)} compare={`${overTop} su ${ops.length} sopra la soglia alta`}>
            <Metric label="Il tuo 3% del turno (simulato)" value={fmt$2(earn?.override_shadow_usd)} />
          </HeroMetric>
          <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
            <SectionTitle aside="facoltative, un minuto in tutto">Una nota per ciascuno</SectionTitle>
            {ops.map((op) => {
              const key = opKey(op);
              const d = noteDraft[key] || { tags: [], text: "" };
              return (
                <div key={key} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: 12, padding: "12px 0", borderTop: `1px solid ${CP.borderSoft}`, alignItems: "start" }}>
                  <div>
                    <div style={{ color: CP.textPrimary, fontWeight: 500, fontSize: 14 }}>{op.member_name}</div>
                    <div style={{ color: CP.textMuted, fontSize: 12.5, ...NUM }}>{op.wage_shift_found ? fmt$(op.venduto) : "—"}{op.thresholds?.top != null && op.venduto >= op.thresholds.top ? " · sopra la soglia alta" : ""}</div>
                  </div>
                  <div style={{ gridColumn: "span 2", minWidth: 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {QUICK_TAGS.map((tag) => {
                        const on = d.tags.includes(tag);
                        return (
                          <button key={tag} onClick={() => toggleTag(key, tag)} aria-pressed={on}
                            style={{ fontSize: 12.5, borderRadius: 99, padding: "4px 10px", cursor: "pointer", fontFamily: FONTS.body, color: on ? CP.accentSoftText : CP.textSecondary, background: on ? CP.accentSoft : CP.surface, border: `1px solid ${on ? CP.accent : CP.border}` }}>
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                    <input value={d.text} onChange={(e) => setNoteDraft((nd) => ({ ...nd, [key]: { ...d, text: e.target.value } }))}
                      placeholder="Nota libera (facoltativa)…" maxLength={600} aria-label={`Nota per ${op.member_name}`}
                      style={{ marginTop: 8, width: "100%", boxSizing: "border-box", background: CP.bg, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, padding: "8px 10px", fontSize: 14, fontFamily: FONTS.body }} />
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: 13, color: CP.textMuted, marginTop: 10, lineHeight: 1.5 }}>
              Le note vanno nella scheda dell’operatore (contano per il passaggio di livello, dove serve un affiancamento documentato) e nel tuo storico da CM (contano per il bonus sviluppo).
            </div>
          </section>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={confirmClose} disabled={closing}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: CP.accent, color: CP.accentInk, border: "none", borderRadius: 10, padding: "11px 22px", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body }}>
              {closing ? <Loader2 size={15} className="animate-spin" /> : <Square size={14} />} Conferma chiusura
            </button>
            <button onClick={() => setClosingOpen(false)} disabled={closing} style={{ ...btnSecondary, padding: "11px 18px" }}>
              Continua il turno
            </button>
          </div>
        </>
      ) : (
        <>
          <HeroMetric
            label={`Venduto del team · turno ${sup ? `${hhmm(sup.window.startedAt)}–${hhmm(sup.window.endedAt)}` : ""}`}
            value={fmt$(teamSold)}
            compare={`${overTop} su ${ops.length} operatori sopra la soglia alta`}
            hint={`Aggiornato alle ${hhmm(live.pulled_at)} (ora italiana). Le vendite arrivano da CreatorsPro a blocchi ogni 15-20 minuti: il quadro completo c’è a fine turno.`}
          >
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Metric label="Il tuo guadagno del turno" value={`€28 + ${fmt$2(earn?.override_shadow_usd)}`} note={`${earn?.override_pct ?? 3}% simulato sul venduto oltre la soglia (${fmt$(earn?.excess_total)})`} />
              {liveLoading ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: CP.textMuted }}><Loader2 size={13} className="animate-spin" /> aggiorno…</span> : null}
            </div>
          </HeroMetric>

          <SectionTitle aside={live.thresholds_period ? `soglie di ${live.thresholds_period}: la linea chiara è l’intermedia, quella scura l’alta` : "la linea chiara è la soglia intermedia, quella scura l’alta"}>Team in turno</SectionTitle>
          <div style={{ marginBottom: 16 }}>
            <DataTable columns={liveCols} rows={ops.map((op, i) => ({ ...op, id: op.shift_id || `${op.member_name}-${i}` }))} minWidth={720} empty="Nessun operatore in questa supervisione." />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 14 }}>
            <section style={{ ...card, padding: "16px 18px" }}>
              <SectionTitle aside="le più recenti in alto">Vendite del turno</SectionTitle>
              {allTakes.length === 0 ? (
                <div style={{ color: CP.textMuted, fontSize: 14 }}>Ancora nessuna vendita attribuita in questo turno. Arrivano a blocchi ogni 15-20 minuti.</div>
              ) : (
                <div>
                  {allTakes.map((t) => (
                    <div key={t.key} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13.5, padding: "6px 6px", color: CP.textSecondary, background: newTakeKeys.has(t.key) ? CP.accentSoft : "transparent", borderRadius: 6 }}>
                      <span style={{ color: CP.textMuted, fontSize: 12.5, minWidth: 42, ...NUM }}>{hhmm(t.transaction_at || t.created_at)}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{t.member_name} · {t.type || "vendita"} · {t.creator_alias || ""}</span>
                      <span style={{ color: CP.textPrimary, marginLeft: "auto", ...NUM }}>+{fmt$2(t.amount)}</span>
                    </div>
                  ))}
                  {newTakeKeys.size > 0 && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 6 }}>Evidenziate: arrivate con l’ultimo aggiornamento.</div>}
                </div>
              )}
            </section>
            <section style={{ ...card, padding: "16px 18px" }}>
              <SectionTitle>Come si calcola il tuo guadagno</SectionTitle>
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 10 }}>
                <Metric label="Fisso di supervisione" value="€28" />
                <Metric label={`${earn?.override_pct ?? 3}% simulato`} value={fmt$2(earn?.override_shadow_usd)} note={`sul venduto oltre la soglia alta: ${fmt$(earn?.excess_total)}`} />
              </div>
              <div style={{ fontSize: 13, color: CP.textMuted, lineHeight: 1.5 }}>
                La percentuale è per ora solo simulata: diventa reale dopo il primo mese di supervisioni registrate, con la percentuale confermata dal board.
              </div>
            </section>
          </div>
        </>
      )}
    </>,
    closingOpen ? null : closeBtn
  );
}

const btnSecondary = { display: "inline-flex", alignItems: "center", gap: 6, background: CP.surface, color: CP.textPrimary, border: `1px solid ${CP.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13.5, cursor: "pointer", fontFamily: FONTS.body };
