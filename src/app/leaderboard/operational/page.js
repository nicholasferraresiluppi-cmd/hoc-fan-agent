"use client";

// Classifica mestiere (redesign 26/09/2026, struttura di Sales CP).
// Domanda della pagina: "chi chatta bene e chi va aiutato, secondo Infloww?".
// Lo score qui è il MESTIERE (come /me/score): KPI di efficienza della chat
// confrontati con la media del gruppo; i gruppi con meno di 5 operatori sono
// confrontati con la media della lingua (formula v13). Fasce v12 lette dalla
// risposta dell'API (settings attivi), con i valori v12 come riserva.
// Cosa è cambiato rispetto alla versione precedente (solo presentazione):
//  - podio (#1 con corona + card 2-5) e lista 6+ fusi in UNA tabella ordinabile:
//    le stesse persone con gli stessi numeri, ma confrontabili a colpo d'occhio;
//    il riquadro "impatto su creator" (prima solo per il #1) è ora nel dettaglio
//    di chiunque si selezioni, insieme alle azioni di esclusione;
//  - la "media del gruppo" accanto ai KPI è quella USATA nello score
//    (per i gruppi piccoli è la media della lingua, prima si mostrava sempre il
//    gruppo);
//  - l'andamento agenzia aveva barre tutte schiacciate a terra e colori tarati
//    sulle vecchie fasce (70/55): ora altezze reali, colore unico, mese scelto
//    evidenziato; "+-14" corretto;
//  - le spiegazioni delle fasce leggono le soglie vere (prima "Elite 91-100").
// API, filtri, esclusioni, "ignora", ripristino: invariati.
import { useState, useEffect, useMemo, useRef } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { MoreVertical, RefreshCw, RotateCcw, EyeOff, Wrench, Upload, Search, Tags, Languages, UserX } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { fmt$, fmtInt, fmtPct, MONTHS_IT } from "@/lib/format";
import { PageHead, HeroMetric, Metric, FilterChip, SectionTitle, Disclosure, DataTable, Notice, card, NUM } from "@/components/ds";

import { tierLabel } from "@/lib/tier-label";
const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { ...j, error: j.error || `Errore ${r.status}` };
};

const PERIOD_TYPES = [
  { value: "monthly", label: "Mensile" },
  { value: "weekly", label: "Settimanale" },
  { value: "quarterly", label: "Trimestrale" },
];

const CATEGORY_FILTERS = [
  { value: "", label: "Tutte le categorie" },
  { value: "Big", label: "Big" },
  { value: "Medium", label: "Medium" },
  { value: "Small", label: "Small" },
  { value: "Uncategorized", label: "Senza categoria" },
];

const LANGUAGE_FILTERS = [
  { value: "", label: "Tutte le lingue" },
  { value: "ita", label: "Italiano" },
  { value: "eng", label: "Inglese" },
  { value: "none", label: "Senza lingua" },
];

// Mappa value filtro → chiave nei counts del backend
const LANGUAGE_COUNT_KEY = { ita: "ita", eng: "eng", none: "unknown" };

// Fasce v12 (leaderboard-config SCORE_TIERS): riserva se l'API non le manda.
const FALLBACK_TIERS = [
  { label: "Critical", min: 0 }, { label: "Weak", min: 15 }, { label: "Average", min: 27 },
  { label: "Good", min: 44 }, { label: "Strong", min: 61 }, { label: "Elite", min: 75 },
];

const EXCLUSION_ACTIONS = [
  { reason: "non_chatter",  label: "Escludi — Non-chatter", description: "Sales manager, trainer, account di servizio" },
  { reason: "manual",       label: "Escludi — Manuale",     description: "Esclusione caso per caso" },
  { reason: "data_quality", label: "Escludi — Data quality",description: "Dati incompleti o sospetti" },
];

const SIZE_OPTIONS = [3, 5, 7, 10];

// Il colore porta solo il segnale: verde = fascia alta, rosso = da guardare.
function tierColor(t) {
  if (t === "Elite" || t === "Strong") return CP.accentGreen;
  // fasce basse mai rosse (26/09)
  return CP.textSecondary;
}
const fmtScore = (v) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const fmtPts = (d) => (d == null ? "" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toLocaleString("it-IT", { maximumFractionDigits: 1 })}`);
const fmtSignedInt = (n) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`);
const langName = (l) => (l === "ita" ? "italiano" : l === "eng" ? "inglese" : null);

/* =================================================
 * Period option generators
 * ================================================= */

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = d.valueOf();
  d.setUTCMonth(0, 1);
  if (d.getUTCDay() !== 4) {
    d.setUTCMonth(0, 1 + ((4 - d.getUTCDay()) + 7) % 7);
  }
  return {
    year: new Date(firstThursday).getUTCFullYear(),
    week: 1 + Math.ceil((firstThursday - d) / 604800000),
  };
}

function generateMonthlyOptions(count = 18) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    out.push({ value: `${y}-${String(m + 1).padStart(2, "0")}`, label: `${MONTHS_IT[m]} ${y}` });
  }
  return out;
}

function generateWeeklyOptions(count = 16) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const { year, week } = getISOWeek(d);
    const jan4 = new Date(year, 0, 4);
    const jan4DayNum = (jan4.getDay() + 6) % 7;
    const weekStart = new Date(jan4);
    weekStart.setDate(jan4.getDate() - jan4DayNum + (week - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const fmt = (date) => `${date.getDate()} ${MONTHS_IT[date.getMonth()].slice(0, 3)}`;
    out.push({ value: `${year}-W${String(week).padStart(2, "0")}`, label: `Settimana ${week} (${fmt(weekStart)}–${fmt(weekEnd)})` });
  }
  const seen = new Set();
  return out.filter((o) => {
    if (seen.has(o.value)) return false;
    seen.add(o.value);
    return true;
  });
}

function generateQuarterlyOptions(count = 6) {
  const out = [];
  const now = new Date();
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < count; i++) {
    out.push({ value: `${y}-Q${q}`, label: `Q${q} ${y}` });
    q -= 1;
    if (q < 1) { q = 4; y -= 1; }
  }
  return out;
}

// "2026-09" → "set 2026", "2026-W38" → "sett. 38", "2026-Q3" → "Q3 2026"
function shortPeriod(pid) {
  if (!pid) return "";
  if (/^\d{4}-\d{2}$/.test(pid)) return `${MONTHS_IT[Number(pid.slice(5)) - 1].slice(0, 3)} ${pid.slice(0, 4)}`;
  const w = pid.match(/^(\d{4})-W(\d{2})$/);
  if (w) return `sett. ${Number(w[2])}`;
  const q = pid.match(/^(\d{4})-Q(\d)$/);
  if (q) return `Q${q[2]} ${q[1]}`;
  return pid;
}

/* =================================================
 * Azioni admin: esclusione / ignora (stesse API e stessi messaggi di prima)
 * ================================================= */

async function excludeEmployee(employee, reason, label, { note, scope }) {
  const msg = scope === "underperformers"
    ? `Escludere "${employee}" dalla leaderboard?\nReason: ${label}\n\nScompare da TUTTA la classifica, non solo dal pannello "da cambiare".`
    : `Escludere "${employee}" dalla leaderboard?\nReason: ${label}\n\nTornerà visibile rimuovendolo da /admin/leaderboard-exclusions.`;
  if (!confirm(msg)) return false;
  try {
    const res = await fetch("/api/admin/leaderboard-exclusions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee, reason, note }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { alert(data.error || "Errore esclusione"); return false; }
    return true;
  } catch (err) {
    alert(String(err));
    return false;
  }
}

async function ignoreEmployee(employee) {
  if (!confirm(`Ignorare "${employee}" dalla lista "da cambiare"?\n\nResta nella leaderboard ma non viene più conteggiato qui. Puoi ripristinarlo dal pannello "ignorati" sotto.`)) return false;
  try {
    const res = await fetch("/api/admin/underperformers-ignored", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee, note: "Ignorato dal pannello Action Center" }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { alert(data.error || "Errore"); return false; }
    return true;
  } catch (err) {
    alert(String(err));
    return false;
  }
}

const menuItem = { display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "transparent", border: "none", color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, borderRadius: 6 };

/** Menu ⋮ della lista "da cambiare": ignora oppure escludi dalla classifica. */
function UnderperformersKebab({ employee, onExcluded, onIgnored }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function run(fn, after) {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) { setOpen(false); if (after) after(); }
  }

  const hover = (on) => (e) => { e.currentTarget.style.background = on ? CP.surfaceAlt : "transparent"; };

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }} disabled={busy} aria-label={`Azioni su ${employee}`} title="Ignora o escludi"
        style={{ width: 28, height: 28, background: open ? CP.surfaceAlt : "transparent", border: `1px solid ${open ? CP.border : "transparent"}`, color: CP.textSecondary, borderRadius: 6, cursor: busy ? "wait" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
        <MoreVertical size={15} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, minWidth: 260, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, padding: 4, zIndex: 50 }}>
          <div style={{ padding: "8px 12px 6px", fontSize: 12, color: CP.textMuted, borderBottom: `1px solid ${CP.borderSoft}`, marginBottom: 4 }}>{employee}</div>
          <button onClick={() => run(() => ignoreEmployee(employee), onIgnored)} disabled={busy} style={{ ...menuItem, cursor: busy ? "wait" : "pointer" }} onMouseEnter={hover(true)} onMouseLeave={hover(false)}>
            <div style={{ fontWeight: 500 }}>Ignora dalla lista</div>
            <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>Resta in classifica, sparisce solo da qui</div>
          </button>
          <div style={{ borderTop: `1px solid ${CP.borderSoft}`, margin: "4px 8px" }} />
          {EXCLUSION_ACTIONS.map((a) => (
            <button key={a.reason} disabled={busy} style={{ ...menuItem, cursor: busy ? "wait" : "pointer" }} onMouseEnter={hover(true)} onMouseLeave={hover(false)}
              onClick={() => run(() => excludeEmployee(employee, a.reason, a.label.replace("Escludi — ", ""), { note: "Aggiunto dal pannello da-cambiare", scope: "underperformers" }), onExcluded)}>
              <div style={{ fontWeight: 500, color: a.reason === "data_quality" ? CP.accentRed : CP.textPrimary }}>{a.label}</div>
              <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>{a.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* =================================================
 * Andamento agenzia (ultimi N periodi) — risponde a "stiamo migliorando?"
 * ================================================= */

function TrendCard({ health, periodType, periodId }) {
  const history = health?.history || [];
  if (!history.length) return null;
  const maxAvg = Math.max(...history.map((h) => h.avg_score || 0), 1);
  const unit = periodType === "monthly" ? "mesi" : periodType === "weekly" ? "settimane" : "trimestri";
  const cur = history.find((h) => h.period_id === periodId) || history[history.length - 1];
  const balance = cur ? cur.elite_strong - cur.critical_weak : null;
  return (
    <section style={{ ...card, padding: "16px 18px", marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ flex: "1 1 320px" }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>Andamento dell&apos;agenzia</div>
          <div style={{ fontSize: 13, color: CP.textMuted, marginTop: 2 }}>Mestiere medio negli ultimi {history.length} {unit}. Passa sopra una barra per le fasce di quel periodo.</div>
        </div>
        {cur && (
          <div title="Operatori in Eccellente o Forte meno operatori in Da costruire o In crescita, nel periodo evidenziato">
            <div style={{ fontSize: 13, color: CP.textSecondary }}>Fasce alte meno fasce basse</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: CP.textPrimary, ...NUM }}>{fmtSignedInt(balance)}</div>
            <div style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>{cur.elite_strong} in Eccellente o Forte · {cur.critical_weak} in Da costruire o In crescita</div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 56 }}>
        {history.map((h) => {
          const px = Math.max(2, Math.round(((h.avg_score || 0) / maxAvg) * 52));
          const tc = h.tier_counts || {};
          const q = h.elite_strong - h.critical_weak;
          const tip = [
            `Periodo: ${h.period_id}`,
            `Mestiere medio: ${fmtScore(h.avg_score)} / 100`,
            `In classifica: ${h.eligible}`,
            `Eccellente: ${tc.Elite || 0} · Forte: ${tc.Strong || 0} · Buona: ${tc.Good || 0}`,
            `Nella media: ${tc.Average || 0} · In crescita: ${tc.Weak || 0} · Da costruire: ${tc.Critical || 0}`,
            `Fasce alte meno fasce basse: ${fmtSignedInt(q)}`,
          ].join("\n");
          const isCur = h.period_id === cur?.period_id;
          return (
            <div key={h.period_id} title={tip} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", cursor: "help" }}>
              <div style={{ fontSize: 11, color: isCur ? CP.textPrimary : CP.textMuted, marginBottom: 2, ...NUM }}>{Math.round(h.avg_score || 0)}</div>
              <div style={{ width: "100%", maxWidth: 48, height: px, background: isCur ? CP.accent : CP.accentDim, borderRadius: "3px 3px 0 0" }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        {history.map((h) => (
          <div key={h.period_id} style={{ flex: 1, textAlign: "center", fontSize: 11, color: CP.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortPeriod(h.period_id)}</div>
        ))}
      </div>
    </section>
  );
}

/* =================================================
 * "Da cambiare" — sotto Average da più periodi, per lingua (solo admin)
 * ================================================= */

function UnderperformersColumn({ language, label, periodType, periodId, size, onExcluded, onIgnored }) {
  const url = `/api/leaderboard/underperformers?period_type=${periodType}&period_id=${periodId}&lookback=3&min_chronic=2&limit=${size}&language=${language}`;
  const { data } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const list = data?.underperformers || [];
  const isLoading = !data;
  const totalCandidates = data?.total_candidates ?? list.length;
  const chronicityAvailable = data?.chronicity_available !== false;

  return (
    <div style={{ ...card, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>{label}</div>
        <div style={{ fontSize: 12, color: CP.textMuted, ...NUM }}
          title={totalCandidates > list.length ? `Mostro ${list.length} su ${totalCandidates} candidati totali. Allarga la lista per vederne di più.` : `Tutti i ${list.length} candidati mostrati`}>
          {list.length} di {totalCandidates}{totalCandidates > list.length ? " · allarga la lista per gli altri" : ""}
        </div>
      </div>
      {!chronicityAvailable && data && (
        <div style={{ fontSize: 12, color: CP.textMuted, padding: "4px 0" }}>
          C&apos;è solo il periodo corrente: non si può ancora dire chi è sotto da più periodi, quindi qui compaiono i punteggi più bassi.
        </div>
      )}
      {data?.error && <div style={{ color: CP.accentRed, fontSize: 13, padding: "6px 0" }}>{data.error}</div>}
      {isLoading && <div style={{ color: CP.textMuted, fontSize: 13, padding: "6px 0" }}>Caricamento…</div>}
      {data && !data.error && list.length === 0 && (
        <div style={{ color: CP.textSecondary, fontSize: 13, padding: "8px 0" }}>
          Nessuno in {label.toLowerCase()} è sotto la media da più periodi.
        </div>
      )}
      {list.map((op) => (
        <div key={op.employee} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto 28px", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${CP.borderSoft}`, fontSize: 14 }}>
          <div style={{ minWidth: 0 }}>
            <Link href={`/leaderboard/operational/${encodeURIComponent(op.employee)}`} title={op.employee}
              style={{ display: "block", color: CP.textPrimary, textDecoration: "none", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {op.employee}
            </Link>
            <div style={{ fontSize: 12, color: CP.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{op.group}</div>
          </div>
          <div title={`Mestiere ${fmtScore(op.score)} · fascia ${tierLabel(op.tier) || "—"}`} style={{ color: tierColor(op.tier), fontWeight: 500, minWidth: 36, textAlign: "right", ...NUM }}>
            {fmtScore(op.score)}
          </div>
          <div title={op.lookback_total > 0 ? `Sotto «Nella media» in ${op.chronic_count} degli ultimi ${op.lookback_total} periodi` : "Solo periodo corrente: storico non disponibile"}
            style={{ display: "flex", gap: 3, minWidth: 30 }}>
            {op.history?.length > 0 ? op.history.map((h, i) => {
              const c = h.tier ? tierColor(h.tier) : CP.border;
              return <span key={i} title={`${h.period_id}: ${tierLabel(h.tier) || "—"}`} style={{ width: 10, height: 10, borderRadius: 2, background: alpha(c, "AA"), border: `1px solid ${c}` }} />;
            }) : <span style={{ fontSize: 12, color: CP.textMuted }}>nuovo</span>}
          </div>
          <UnderperformersKebab employee={op.employee} onExcluded={onExcluded} onIgnored={onIgnored} />
        </div>
      ))}
    </div>
  );
}

function IgnoredPanel({ onChange }) {
  const [open, setOpen] = useState(false);
  const { data } = useSWR("/api/admin/underperformers-ignored", fetcher, { revalidateOnFocus: false });
  const ignored = data?.ignored || {};
  const entries = Object.entries(ignored).sort((a, b) => (b[1].ignored_at || 0) - (a[1].ignored_at || 0));

  async function restore(name) {
    if (!confirm(`Rimettere "${name}" nel computo da-cambiare?`)) return;
    const res = await fetch(`/api/admin/underperformers-ignored?employee=${encodeURIComponent(name)}`, { method: "DELETE" });
    const d = await res.json();
    if (!res.ok || d.error) { alert(d.error || "Errore"); return; }
    await mutate("/api/admin/underperformers-ignored");
    if (onChange) onChange();
  }

  if (entries.length === 0) {
    return (
      <div style={{ fontSize: 13, color: CP.textMuted, marginTop: 10 }}>
        Nessun operatore ignorato. Con il menu accanto a un nome puoi toglierlo da questa lista senza escluderlo dalla classifica.
      </div>
    );
  }
  return (
    <div style={{ marginTop: 10 }}>
      <Disclosure open={open} onToggle={() => setOpen((v) => !v)} icon={<EyeOff size={15} />}
        title={`${entries.length} ${entries.length === 1 ? "operatore ignorato" : "operatori ignorati"}`} summary="restano in classifica ma non contano in questa lista">
        <div style={{ ...card, overflow: "hidden" }}>
          {entries.map(([name, entry]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderTop: `1px solid ${CP.borderSoft}`, fontSize: 14, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                <Link href={`/leaderboard/operational/${encodeURIComponent(name)}`} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>{name}</Link>
                {entry.note && <span style={{ color: CP.textMuted, fontSize: 12, marginLeft: 8 }}>“{entry.note}”</span>}
              </div>
              <span style={{ color: CP.textMuted, fontSize: 12, ...NUM }}>
                {entry.ignored_at ? `dal ${new Date(entry.ignored_at).toLocaleDateString("it-IT")}` : "—"}
              </span>
              <button onClick={() => restore(name)} style={linkBtn}><RotateCcw size={13} /> Ripristina</button>
            </div>
          ))}
        </div>
      </Disclosure>
    </div>
  );
}

function UnderperformersActionCenter({ periodType, periodId, canExclude, languageFilter, onExcluded, averageMin = 27 }) {
  const [size, setSize] = useState(5);
  if (!canExclude || !periodId) return null;

  const onIgnored = () => {
    // Forza il refresh delle due colonne (SWR usa l'URL come chiave).
    mutate((key) => typeof key === "string" && key.startsWith("/api/leaderboard/underperformers"));
    mutate("/api/admin/underperformers-ignored");
  };

  const showIta = !languageFilter || languageFilter === "ita";
  const showEng = !languageFilter || languageFilter === "eng";
  const custom = !SIZE_OPTIONS.includes(size);

  return (
    <section style={{ marginBottom: 22 }}>
      <SectionTitle aside="visibile solo agli admin">Da cambiare: sotto la media da più periodi</SectionTitle>
      <div style={{ fontSize: 13, color: CP.textSecondary, margin: "-4px 0 10px", maxWidth: 820, lineHeight: 1.5 }}>
        I punteggi più bassi del periodo, tra chi era sotto «Nella media» (mestiere sotto {averageMin}) in almeno 2 dei 3 periodi precedenti: un mese storto non basta per finire qui.
        I quadratini sono le fasce degli ultimi 3 periodi. Da qui apri la scheda, oppure con il menu accanto al nome ignori o escludi.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: CP.textMuted }}>Quanti per lingua</span>
        {SIZE_OPTIONS.map((n) => <FilterChip key={n} label={String(n)} active={size === n} onClick={() => setSize(n)} />)}
        <input type="number" min={1} max={50} value={size} aria-label="Numero personalizzato (1-50)" title="Numero personalizzato (1-50)"
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) setSize(Math.max(1, Math.min(50, v)));
          }}
          style={{ width: 64, padding: "6px 8px", borderRadius: 999, border: `1px solid ${custom ? CP.accent : CP.border}`, background: custom ? CP.accentSoft : CP.surface, color: custom ? CP.accentSoftText : CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, textAlign: "center", outline: "none", ...NUM }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        {showIta && <UnderperformersColumn language="ita" label="Italiano" periodType={periodType} periodId={periodId} size={size} onExcluded={onExcluded} onIgnored={onIgnored} />}
        {showEng && <UnderperformersColumn language="eng" label="Inglese" periodType={periodType} periodId={periodId} size={size} onExcluded={onExcluded} onIgnored={onIgnored} />}
      </div>
      {!showIta && !showEng && (
        <div style={{ fontSize: 13, color: CP.textMuted }}>La lista esiste solo per italiano e inglese: togli il filtro “Senza lingua” per vederla.</div>
      )}
      <IgnoredPanel onChange={onIgnored} />
    </section>
  );
}

/* =================================================
 * Dettaglio della riga selezionata: KPI vs media, creator, azioni admin
 * ================================================= */

function OperatorDetail({ op, canExclude, onExcluded, onClose }) {
  const [busy, setBusy] = useState(false);
  const means = op.group_means || null;
  const basis = op.comparison === "language" ? `media della lingua (${langName(op.language) || "tutte"})` : "media del gruppo";
  const items = (op.creator_impact || []).slice(0, 5);
  const maxPct = Math.max(...items.map((i) => i.share_pct || 0), 1);
  const isMulti = (op.creators?.length || 0) > 1;

  async function doExclude(a) {
    setBusy(true);
    const ok = await excludeEmployee(op.employee, a.reason, a.label.replace("Escludi — ", ""), { note: "Aggiunto dalla leaderboard" });
    setBusy(false);
    if (ok) { onExcluded(); onClose(); }
  }

  const kpis = [
    { label: "Fan che pagano", hint: "fan che hanno pagato su fan con cui si è chattato", v: fmtPct(op.fan_cvr, 2), m: means?.fan_cvr != null ? fmtPct(means.fan_cvr, 2) : null },
    { label: "PPV aperti", hint: "PPV sbloccati su PPV inviati", v: fmtPct(op.unlock_rate, 2), m: means?.unlock_rate != null ? fmtPct(means.unlock_rate, 2) : null },
    { label: "$ per fan pagante", hint: "venduto diviso fan che hanno pagato", v: fmt$(op.avg_earnings_per_paying_fan), m: means?.avg_earnings_per_paying_fan != null ? fmt$(means.avg_earnings_per_paying_fan) : null },
    { label: "Venduto", hint: "informativo: non entra nello score", v: fmt$(op.sales), m: null },
  ];

  return (
    <section style={{ ...card, padding: "16px 18px", marginBottom: 14, borderColor: CP.accent }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ fontSize: 13, color: CP.textMuted, ...NUM }}>#{op.rank ?? "—"} in questa vista</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: CP.textPrimary }}>{op.employee}</div>
          <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 2 }}>
            {[op.group, op.category, langName(op.language)].filter(Boolean).join(" · ")}
          </div>
          {op.comparison === "language" && (
            <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4, maxWidth: 560 }}>
              Il suo gruppo ha {op.group_size ?? "meno di 5"} operatori: è confrontato con la media di chi lavora in {langName(op.language) || "tutta l'agenzia"}. Rientra un po' dell'effetto della creator.
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: CP.textSecondary }}>Mestiere</div>
          <div style={{ fontSize: 32, fontWeight: 500, lineHeight: 1.1, color: CP.textPrimary, ...NUM }}>{fmtScore(op.score)}</div>
          <div style={{ fontSize: 13, color: tierColor(op.tier) }}>{tierLabel(op.tier) || "—"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Link href={`/leaderboard/operational/${encodeURIComponent(op.employee)}`} style={{ ...btn, textDecoration: "none" }}>Apri la scheda →</Link>
          <button onClick={onClose} style={btn}>Chiudi</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, marginBottom: 14 }}>
        {kpis.map((k) => (
          <div key={k.label} title={k.hint}>
            <Metric label={k.label} value={k.v} note={k.m ? `${basis}: ${k.m}` : k.hint} />
          </div>
        ))}
        {op.cp_data && (
          <div title={`CreatorsPro: ${op.cp_data.total_shifts} turni, ${fmt$(op.cp_data.total_sales)} venduto, fascia oraria migliore: ${op.cp_data.top_interval || "—"}`}>
            <Metric label="Venduto per turno (CP)" value={fmt$(op.cp_data.sales_per_shift)} note={`${fmtInt(op.cp_data.total_shifts)} turni · fascia migliore ${op.cp_data.top_interval || "—"}`} />
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div style={{ marginBottom: canExclude ? 14 : 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary }}>Su quali creator ha pesato</div>
          <div style={{ fontSize: 12, color: CP.textMuted, margin: "2px 0 8px", maxWidth: 760 }}>
            Ha lavorato su {op.creators?.length || 0} creator.{" "}
            {isMulti
              ? "Le quote sono una stima: Infloww non dice quanto ha venduto su ciascuna, quindi il venduto è diviso in parti uguali."
              : "Quote esatte."}
          </div>
          {items.map((it) => (
            <div key={it.creator} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1.6fr) 56px minmax(40px,1fr)", gap: 12, alignItems: "center", padding: "8px 0", borderTop: `1px solid ${CP.borderSoft}`, fontSize: 13 }}>
              <div style={{ color: CP.textPrimary, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.creator}</div>
              <div style={{ color: CP.textSecondary, ...NUM }}>
                {fmt$(it.share_eur)} <span style={{ color: CP.textMuted }}>su {fmt$(it.total_creator_sales)} · {it.share_purch ?? 0}{it.estimated ? ` di ${it.total_creator_purch ?? 0}` : ""} acquisti</span>
              </div>
              <div style={{ textAlign: "right", color: CP.textPrimary, ...NUM }} title={it.estimated ? "Stima: quota divisa in parti uguali" : "Esatto"}>
                {it.estimated ? "~" : ""}{it.share_pct}%
              </div>
              <div style={{ height: 6, background: CP.borderSoft, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", background: CP.accent, width: `${Math.min(100, ((it.share_pct || 0) / maxPct) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {canExclude && (
        <div style={{ borderTop: `1px solid ${CP.borderSoft}`, paddingTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: CP.textMuted, marginRight: 4 }}>Non dovrebbe stare in classifica?</span>
          {EXCLUSION_ACTIONS.map((a) => (
            <button key={a.reason} onClick={() => doExclude(a)} disabled={busy} title={a.description} style={{ ...btn, cursor: busy ? "wait" : "pointer" }}>
              {a.label}
            </button>
          ))}
          <Link href="/admin/leaderboard-exclusions" style={{ fontSize: 13, color: CP.accentSoftText, textDecoration: "none", marginLeft: 4 }}>Gestione esclusioni →</Link>
        </div>
      )}
    </section>
  );
}

/* =================================================
 * Pagina
 * ================================================= */

export default function OperationalLeaderboardPage() {
  const [periodType, setPeriodType] = useState("monthly");
  const [periodId, setPeriodId] = useState("");
  const [clockIn, setClockIn] = useState(false);
  const [groupFilter, setGroupFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [view, setView] = useState("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  const periodOptions = useMemo(() => {
    if (periodType === "monthly") return generateMonthlyOptions();
    if (periodType === "weekly") return generateWeeklyOptions();
    return generateQuarterlyOptions();
  }, [periodType]);

  useEffect(() => {
    if (periodOptions.length > 0) {
      if (!periodId || !periodOptions.find((p) => p.value === periodId)) {
        setPeriodId(periodOptions[0].value);
      }
    }
  }, [periodType, periodOptions]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("period_type", periodType);
    p.set("period_id", periodId);
    p.set("clock_in", clockIn ? "yes" : "no");
    if (groupFilter) p.set("group", groupFilter);
    if (categoryFilter) p.set("category", categoryFilter);
    if (languageFilter) p.set("language", languageFilter);
    return p.toString();
  }, [periodType, periodId, clockIn, groupFilter, categoryFilter, languageFilter]);

  const leaderboardKey = periodId ? `/api/leaderboard/operational?${queryString}` : null;
  const { data, error, isLoading } = useSWR(leaderboardKey, fetcher, {
    revalidateOnFocus: false, keepPreviousData: true,
  });
  const { data: health } = useSWR(`/api/leaderboard/health?period_type=${periodType}&limit=12`, fetcher, { revalidateOnFocus: false });

  // Capability admin (SEED) per le azioni di esclusione
  const { data: me } = useSWR("/api/whoami", fetcher, { revalidateOnFocus: false });
  const canExclude = me?.capabilities?.seed === "all";

  const onExcluded = () => { if (leaderboardKey) mutate(leaderboardKey); };

  const ranking = useMemo(() => (data?.ranking || []).filter((r) => r.score !== null), [data]);
  const groupAverages = data?.groupAverages || {};
  const cpAvailable = !!data?.cp_available;

  const rows = useMemo(() => ranking.map((r) => ({
    ...r,
    id: `${r.employee}|${r.group}`,
    means: r.group_means || groupAverages[r.group] || null,
    low: r.tier === "Weak" || r.tier === "Critical",
    small: r.comparison === "language",
  })), [ranking, groupAverages]);

  const counts = {
    low: rows.filter((r) => r.low).length,
    small: rows.filter((r) => r.small).length,
  };
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (needle && !`${r.employee} ${r.group || ""} ${r.top_creator?.creator || ""}`.toLowerCase().includes(needle)) return false;
    if (view === "low") return r.low;
    if (view === "small") return r.small;
    return true;
  });
  const selected = rows.find((r) => r.id === selectedId) || null;

  // Soglie delle fasce dalla formula attiva (riserva: v12)
  const tiers = (Array.isArray(data?.tiers) && data.tiers.length ? data.tiers : FALLBACK_TIERS);
  const tierMin = (label) => tiers.find((t) => t.label === label)?.min;
  const strongMin = tierMin("Strong") ?? 61;
  const averageMin = tierMin("Average") ?? 27;

  // Confronto col periodo prima, dallo storico dell'andamento
  const hist = health?.history || [];
  const hIdx = hist.findIndex((h) => h.period_id === periodId);
  const prevH = hIdx > 0 ? hist[hIdx - 1] : null;

  const periodLabel = periodOptions.find((p) => p.value === periodId)?.label || periodId;
  const isCurrent = periodId && periodOptions[0]?.value === periodId;
  const filtersOn = !!(groupFilter || categoryFilter || languageFilter);

  const catCount = (c) => {
    if (!data?.category_counts) return null;
    return c.value ? (data.category_counts[c.value] ?? 0) : Object.values(data.category_counts).reduce((a, b) => a + (b || 0), 0);
  };
  const langCount = (l) => {
    if (!data?.language_counts) return null;
    return l.value ? (data.language_counts[LANGUAGE_COUNT_KEY[l.value] || l.value] ?? 0) : Object.values(data.language_counts).reduce((a, b) => a + (b || 0), 0);
  };

  const kpiCell = (value, mean, fmt, basis) => {
    if (value == null) return <span style={{ color: CP.textMuted }}>—</span>;
    const above = mean && value > mean;
    return (
      <span title={mean != null ? `${basis}: ${fmt(mean)}` : ""}>
        <span style={{ color: above ? CP.accentGreen : CP.textPrimary }}>{fmt(value)}</span>
        {mean != null && mean > 0 && <span style={{ display: "block", fontSize: 12, color: CP.textMuted }}>media {fmt(mean)}</span>}
      </span>
    );
  };
  const basisOf = (r) => (r.small ? "media della lingua" : "media del gruppo");
  const pct2 = (v) => fmtPct(v, 2);

  const columns = [
    { key: "rank", label: "#", align: "right", muted: true, sort: (r) => r.rank ?? Infinity, render: (r) => r.rank ?? "—" },
    { key: "employee", label: "Operatore", render: (r) => (
      <div style={{ minWidth: 0, maxWidth: 240 }}>
        <Link href={`/leaderboard/operational/${encodeURIComponent(r.employee)}`} onClick={(e) => e.stopPropagation()}
          style={{ display: "block", color: CP.textPrimary, textDecoration: "none", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.employee}</Link>
        {r.top_creator ? (
          <span style={{ display: "block", fontSize: 12, color: CP.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...NUM }}
            title={`Creator principale: ${r.top_creator.creator} (${r.top_creator.estimated ? "stima" : "esatto"} ${r.top_creator.share_pct}%)`}>
            {r.top_creator.creator} · {r.top_creator.estimated ? "~" : ""}{r.top_creator.share_pct}%
          </span>
        ) : r.creators?.length > 0 ? (
          <span style={{ display: "block", fontSize: 12, color: CP.textMuted }}>{r.creators.length} creator</span>
        ) : null}
      </div>
    ) },
    { key: "group", label: "Gruppo", muted: true, render: (r) => (
      <div style={{ maxWidth: 220 }}>
        <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.group || "—"}</span>
        <span style={{ display: "block", fontSize: 12, color: CP.textMuted }}>
          {[r.category, langName(r.language)].filter(Boolean).join(" · ")}
          {r.small && <span title={`Gruppo con ${r.group_size ?? "meno di 5"} operatori: confrontato con la media della lingua`} style={{ color: CP.accentSoftText }}>{r.category || r.language ? " · " : ""}vs lingua</span>}
        </span>
      </div>
    ) },
    { key: "score", label: "Mestiere", align: "right", render: (r) => (
      <span title={tierLabel(r.tier) || ""} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: tierColor(r.tier) }} />
        <span style={{ fontWeight: 500 }}>{fmtScore(r.score)}</span>
      </span>
    ) },
    { key: "tier", label: "Fascia", sort: (r) => r.score, render: (r) => <span style={{ color: tierColor(r.tier) }}>{tierLabel(r.tier) || "—"}</span> },
    { key: "fan_cvr", label: "Fan che pagano", align: "right", render: (r) => kpiCell(r.fan_cvr, r.means?.fan_cvr, pct2, basisOf(r)) },
    { key: "unlock_rate", label: "PPV aperti", align: "right", render: (r) => kpiCell(r.unlock_rate, r.means?.unlock_rate, pct2, basisOf(r)) },
    { key: "ppvs_unlocked", label: "PPV acquistati", align: "right", render: (r) => (
      <span title={r.ppv_sales != null ? `${r.ppvs_unlocked ?? 0} acquisti · ${fmt$(r.ppv_sales)} di PPV` : "PPV sbloccati nel periodo"}>{r.ppvs_unlocked != null ? fmtInt(r.ppvs_unlocked) : "—"}</span>
    ) },
    ...(cpAvailable ? [{ key: "cp_per_shift", label: "Per turno (CP)", align: "right", sort: (r) => r.cp_data?.sales_per_shift ?? null, render: (r) => r.cp_data ? (
      <span title={`CreatorsPro: ${r.cp_data.total_shifts} turni, ${fmt$(r.cp_data.total_sales)} venduto, fascia oraria migliore: ${r.cp_data.top_interval || "—"}`}>
        {fmt$(r.cp_data.sales_per_shift)}
        <span style={{ display: "block", fontSize: 12, color: CP.textMuted }}>{fmtInt(r.cp_data.total_shifts)} turni</span>
      </span>
    ) : <span style={{ color: CP.textMuted }} title="Dato CP non disponibile per questo operatore (collegamento mancante?)">—</span> }] : []),
    { key: "avg_earnings_per_paying_fan", label: "$ per fan pagante", align: "right", render: (r) => kpiCell(r.avg_earnings_per_paying_fan, r.means?.avg_earnings_per_paying_fan, fmt$, basisOf(r)) },
  ];

  const inactive = data?.inactive_count || 0;
  const excludedTot = (data?.mass_excluded || 0) + (data?.manual_excluded || 0);

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1280, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Performance" }, { label: "Classifica mestiere" }]}
        title="Classifica mestiere"
        subtitle={`Chi chatta bene e chi va aiutato, dai dati Infloww. Il mestiere (0-100, lo stesso che l'operatore vede in “I miei score”) confronta i KPI della chat di ognuno con la media del suo gruppo; i gruppi con meno di 5 operatori con la media della lingua. Il venduto è informativo e non entra nello score.`}
        actions={<>
          <select value={periodType} onChange={(e) => setPeriodType(e.target.value)} aria-label="Tipo di periodo" style={selStyle}>
            {PERIOD_TYPES.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
          </select>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} aria-label="Periodo" style={{ ...selStyle, minWidth: 170 }}>
            {periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={() => leaderboardKey && mutate(leaderboardKey)} title="Ricarica dati" style={btn}><RefreshCw size={14} /> Aggiorna</button>
          {canExclude && <Link href="/admin/leaderboard-exclusions" style={{ ...btn, textDecoration: "none" }}><UserX size={14} /> Esclusioni</Link>}
        </>}
      />

      {isLoading && !data && <div style={{ color: CP.textMuted, fontSize: 14, marginBottom: 14 }}>Caricamento…</div>}
      {error && <Notice danger>Errore di rete: {String(error)}. Riprova con “Aggiorna”.</Notice>}
      {data?.error && (
        <Notice danger>
          {data.error}{" "}
          <Link href="/admin/leaderboard-import" style={{ color: CP.accentSoftText }}>Importa il CSV di Infloww →</Link>
        </Notice>
      )}

      {data && !data.error && (<>
        {isCurrent && (
          <Notice>{periodLabel} è il periodo in corso: i numeri valgono fino all&apos;ultimo import dell&apos;export Infloww e possono cambiare.</Notice>
        )}
        <HeroMetric
          label={`Mestiere medio · ${periodLabel}${filtersOn ? " · con i filtri" : ""}`}
          value={fmtScore(data.avg_score)}
          compare={!filtersOn && !clockIn && prevH ? `${shortPeriod(prevH.period_id)}: ${fmtScore(prevH.avg_score)} (${fmtPts(data.avg_score - prevH.avg_score)} punti)` : null}
          hint="Media di chi è in classifica. Lo score è relativo al gruppo: la media dell'agenzia resta intorno a 40-45 per costruzione, conta chi cambia fascia."
        >
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="In classifica" value={fmtInt(data.eligible_total)} note={data.total > data.eligible_total ? `+${fmtInt(data.total - data.eligible_total)} senza score` : null} />
            <Metric label="Eccellente o Forte" value={fmtInt((data.elite_count || 0) + (data.strong_count || 0))} note={`mestiere da ${strongMin} in su`} />
            <div>
              <Metric label="Da costruire o In crescita" value={fmtInt(counts.low)} note={`sotto ${averageMin}`} />
              {counts.low > 0 && view !== "low" && <button onClick={() => setView("low")} style={{ ...linkBtn, marginTop: 2 }}>Mostrali →</button>}
            </div>
            {cpAvailable && data.cp_agency && (
              <div title={`Dati CreatorsPro. Fascia oraria migliore: ${Object.entries(data.cp_agency.interval_sales || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"}.`}>
                <Metric label="Venduto agenzia (CP)" value={fmt$(data.cp_agency.total_sales)} note={`${fmtInt(data.cp_agency.total_shifts)} turni · ${fmt$(data.cp_agency.avg_sales_per_shift)} a turno`} />
                <Link href="/admin/creatorspro-sync" style={{ fontSize: 13, color: CP.accentSoftText, textDecoration: "none" }}>Sync CP →</Link>
              </div>
            )}
          </div>
        </HeroMetric>
        <div style={{ fontSize: 12, color: CP.textMuted, margin: "-6px 0 14px", ...NUM }}>
          Fuori classifica: {fmtInt(inactive)} inattivi (nessuna attività nel periodo) · {fmtInt(excludedTot)} esclusi ({fmtInt(data.mass_excluded ?? 0)} account Mass, {fmtInt(data.manual_excluded ?? 0)} a mano){" "}
          <Link href="/admin/leaderboard-exclusions" style={{ color: CP.accentSoftText, textDecoration: "none" }}>gestisci →</Link>
        </div>

        <TrendCard health={health && !health.error ? health : null} periodType={periodType} periodId={periodId} />
      </>)}

      <UnderperformersActionCenter periodType={periodType} periodId={periodId} canExclude={canExclude} languageFilter={languageFilter} onExcluded={onExcluded} averageMin={averageMin} />

      {data && !data.error && (<>
        <SectionTitle aside={`${fmtInt(shown.length)} ${shown.length === 1 ? "operatore" : "operatori"}`}>Classifica</SectionTitle>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <FilterChip label={`Tutti (${rows.length})`} active={view === "all"} onClick={() => setView("all")} />
          <FilterChip label={`Da costruire o In crescita (${counts.low})`} active={view === "low"} disabled={!counts.low} onClick={() => setView(view === "low" ? "all" : "low")} />
          {counts.small > 0 && (
            <FilterChip label={`Confrontati con la lingua (${counts.small})`} active={view === "small"} onClick={() => setView(view === "small" ? "all" : "small")} />
          )}
          <FilterChip label="Includi KPI clock-in" active={clockIn} onClick={() => setClockIn((v) => !v)} />
          <span style={{ flex: 1 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", border: `1px solid ${CP.border}`, borderRadius: 8, background: CP.surface, flex: "0 1 240px", minWidth: 180 }}>
            <Search size={14} color={CP.textMuted} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca operatore o creator" aria-label="Cerca operatore o creator"
              style={{ border: "none", outline: "none", background: "transparent", color: CP.textPrimary, fontSize: 14, width: "100%", fontFamily: FONTS.body }} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Categoria del gruppo" style={selStyle}>
            {CATEGORY_FILTERS.map((c) => { const n = catCount(c); return <option key={c.value || "all"} value={c.value}>{c.label}{n != null ? ` (${n})` : ""}</option>; })}
          </select>
          <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)} aria-label="Lingua" style={selStyle}>
            {LANGUAGE_FILTERS.map((l) => { const n = langCount(l); return <option key={l.value || "all"} value={l.value}>{l.label}{n != null ? ` (${n})` : ""}</option>; })}
          </select>
          <div style={{ position: "relative", flex: "0 1 240px", minWidth: 180 }}>
            <input list="group-options" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} placeholder="Tutti i gruppi (scrivi per cercare)" aria-label="Gruppo"
              style={{ ...selStyle, width: "100%", boxSizing: "border-box", paddingRight: groupFilter ? 28 : 10 }} />
            <datalist id="group-options">
              {data?.groups?.map((g) => <option key={g} value={g} />)}
            </datalist>
            {groupFilter && (
              <button onClick={() => setGroupFilter("")} title="Pulisci filtro gruppo" aria-label="Pulisci filtro gruppo"
                style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: CP.textMuted, cursor: "pointer", fontSize: 16, padding: "0 6px" }}>×</button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
          Sotto ogni KPI la media con cui è confrontato; in verde se è sopra. Il pallino indica la fascia. “~” = quota stimata (lavora su più creator). Clic sul nome per la scheda, sulla riga per il dettaglio{canExclude ? " e le esclusioni" : ""}.
        </div>

        {selected && <OperatorDetail op={selected} canExclude={canExclude} onExcluded={onExcluded} onClose={() => setSelectedId(null)} />}

        <div style={{ marginBottom: 14 }}>
          <DataTable columns={columns} rows={shown} defaultSort={{ key: "rank", dir: 1 }} minWidth={cpAvailable ? 1080 : 980} maxHeight="calc(100vh - 120px)"
            onRowClick={(r) => setSelectedId(r.id === selectedId ? null : r.id)} selected={(r) => r.id === selectedId}
            empty={needle ? `Nessun operatore corrisponde a “${q}”.` : "Nessun operatore in questa vista."} />
        </div>

        {ranking.length === 0 && (
          <Notice>
            Nessun operatore in classifica con questi filtri.
            {(categoryFilter || languageFilter || groupFilter) && (<> Prova a togliere un filtro, oppure controlla che i gruppi abbiano categoria e lingua: <Link href="/admin/group-categories" style={{ color: CP.accentSoftText }}>Categorie gruppi →</Link></>)}
          </Notice>
        )}

        <Disclosure open={toolsOpen} onToggle={() => setToolsOpen((v) => !v)} icon={<Wrench size={15} />}
          title="Un dato non torna?" summary="import Infloww, esclusioni, categorie e lingue dei gruppi, sync CP">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
            {[
              { href: "/admin/leaderboard-import", icon: Upload, label: "Importa export Infloww", hint: "carica il CSV del periodo" },
              { href: "/admin/leaderboard-exclusions", icon: UserX, label: "Esclusioni", hint: "account Mass e esclusi a mano" },
              { href: "/admin/group-categories", icon: Tags, label: "Categorie gruppi", hint: "Big / Medium / Small" },
              { href: "/admin/group-languages", icon: Languages, label: "Lingue gruppi", hint: "italiano / inglese" },
              { href: "/admin/creatorspro-sync", icon: RefreshCw, label: "Sync CP", hint: "venduto per turno da CreatorsPro" },
            ].map((it) => (
              <Link key={it.href} href={it.href} style={{ display: "flex", gap: 10, padding: "10px 12px", ...card, textDecoration: "none", color: CP.textPrimary }}>
                <it.icon size={15} color={CP.textMuted} style={{ marginTop: 2, flexShrink: 0 }} />
                <span><span style={{ fontSize: 14, display: "block" }}>{it.label}</span><span style={{ fontSize: 12, color: CP.textMuted }}>{it.hint}</span></span>
              </Link>
            ))}
          </div>
        </Disclosure>
        <div style={{ fontSize: 12, color: CP.textMuted, lineHeight: 1.5 }}>
          Fasce del mestiere: {tiers.map((t, i) => `${t.label} ${i === 0 ? `sotto ${tiers[1]?.min ?? ""}` : `da ${t.min}`}`).join(" · ")}. Account Mass, esclusi e score zero non compaiono. Fonte: export Infloww importato per periodo.
        </div>
      </>)}
    </div>
  );
}

const selStyle = { padding: "7px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body };
const btn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const linkBtn = { display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, color: CP.accentSoftText, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
