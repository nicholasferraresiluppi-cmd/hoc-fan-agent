"use client";

// "Le mie creator" (09/10/2026) — ingresso dello strumento "Revenue e chat". Dalla prova d'uso con
// utenti sintetici: il sales manager apriva le creator una per una per capire dove guardare.
// Qui tutte insieme, la più da guardare in cima: la corsa del mese, chi è di turno, i fan in
// attesa con i primi a cui scrivere. Dati: /api/admin/live-overview (stesse cache di Revenue e Chat).

import useSWR from "swr";
import { UserCheck, UserX, Clock, ExternalLink, ArrowRight, Flag } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { Notice } from "@/components/ds";
import { liveFetcher } from "@/components/LiveCreatorPicker";
import { COUNTRY_NAMES } from "@/lib/live-creators";

const NUM = { fontVariantNumeric: "tabular-nums" };
const group = (n) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const usd = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `$${group(Number(v))}`);
const hm = (iso) => (!iso ? "–" : new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }));
const initials = (name) => String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const firstName = (n) => String(n || "").split(" ")[0];
const waitText = (m) => (m < 1 ? "adesso" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
const waitColor = (m) => (m <= 15 ? CP.textPrimary : m <= 120 ? CP.gold : CP.accentRed);

const LEVEL = [
  { word: "tutto ok", color: CP.accentGreen },
  { word: "attenzione", color: CP.gold },
  { word: "da guardare", color: CP.accentRed },
];
const TIER_COLOR = [CP.gold, CP.accent, CP.accentGreen, CP.textMuted];

export default function LeMieCreatorPage() {
  const { data, error, isLoading } = useSWR("/api/admin/live-overview", liveFetcher, { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false });
  const list = [...(data?.creators || [])].sort((a, b) => b.light.level - a.light.level);
  const toWatch = list.filter((c) => c.light.level === 2).length;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 16px 40px", fontFamily: FONTS.body }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: CP.textPrimary }}>Le mie creator</h1>
          <div style={{ fontSize: 14, color: CP.textSecondary, marginTop: 4 }}>
            {data ? (toWatch ? (toWatch === 1 ? "Una creator da guardare adesso: è la prima." : `${toWatch} creator da guardare adesso: sono le prime.`) : "Come vanno adesso. In cima quella che ha più bisogno di te.") : "Come vanno adesso, e dove guardare per prima."}
          </div>
        </div>
        {data && <div style={{ fontSize: 12.5, color: CP.textMuted }}>aggiornato alle {hm(data.at)} · si aggiorna da solo ogni 5 minuti</div>}
      </div>

      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && !data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ height: 360, borderRadius: 22, background: alpha(CP.accent, "0c"), border: `1px solid ${alpha(CP.accent, "1a")}` }} />)}
          <div style={{ gridColumn: "1 / -1", fontSize: 13, color: CP.textMuted }}>Sto mettendo insieme revenue, chat e turni di ogni creator…</div>
        </div>
      )}
      {data && !list.length && <Notice>Non hai creator assegnate in questo strumento.</Notice>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        {list.map((c) => <CreatorCard key={c.slug} c={c} />)}
      </div>
    </div>
  );
}

function CreatorCard({ c }) {
  const L = LEVEL[c.light.level];
  const r = c.revenue;
  const multi = c.countries.length > 1;
  const waiting = c.countries.reduce((a, x) => a + x.waiting, 0);
  const bought = c.countries.reduce((a, x) => a + x.waitingSpenders, 0);
  const top = c.countries.flatMap((x) => x.top.map((t) => ({ ...t, country: x.country }))).sort((a, b) => a.tier - b.tier || (a.wait_min > 360) - (b.wait_min > 360) || (a.wait_min > 360 ? a.wait_min - b.wait_min : b.wait_min - a.wait_min)).slice(0, 3);
  const q = `?creator=${encodeURIComponent(c.slug)}`;

  return (
    <section style={{ minWidth: 0, background: alpha(L.color, "0b"), border: `1px solid ${alpha(L.color, c.light.level ? "55" : "2e")}`, borderRadius: 22, padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: CP.accent, color: CP.accentInk, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{initials(c.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: CP.textPrimary }}>{c.name}</div>
          <div style={{ fontSize: 12.5, color: CP.textMuted }}>{c.countries.map((x) => COUNTRY_NAMES[x.country] || x.country).join(" + ")}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: L.color, background: CP.surface, border: `1px solid ${alpha(L.color, "44")}`, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{L.word}</span>
      </div>

      {c.light.reasons.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          {c.light.reasons.slice(0, 3).map((x, i) => (
            <div key={i} style={{ fontSize: 13, color: CP.textPrimary, display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: LEVEL[x.level].color, flexShrink: 0, transform: "translateY(-1px)" }} />{x.text}
            </div>
          ))}
        </div>
      )}

      {r ? <MiniRace r={r} /> : <div style={{ fontSize: 13, color: CP.textMuted }}>Revenue non disponibile adesso.</div>}

      <div style={{ display: "grid", gap: 6 }}>
        {c.countries.map((x) => <ShiftLine key={x.country} s={x.shift} label={multi ? x.country : null} />)}
      </div>

      <div style={{ background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 16, padding: "12px 14px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: CP.textPrimary, ...NUM }}>{waiting}</span>
          <span style={{ fontSize: 13.5, color: CP.textPrimary }}>{waiting === 1 ? "fan aspetta" : "fan aspettano"} una risposta</span>
          {bought > 0 && <span style={{ fontSize: 12.5, color: CP.gold, fontWeight: 500 }}>· {bought} {bought === 1 ? "ha" : "hanno"} già comprato</span>}
        </div>
        {top.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6, marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: CP.textMuted, letterSpacing: "0.04em", textTransform: "uppercase" }}>A chi scrivere per primo</div>
            {top.map((t) => (
              <a key={`${t.country}-${t.user_id}`} href={`https://onlyfans.com/my/chats/chat/${t.user_id}`} target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: CP.textPrimary, fontSize: 13 }}>
                <span style={{ width: 4, alignSelf: "stretch", borderRadius: 3, background: TIER_COLOR[t.tier] }} />
                <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
                  <b style={{ fontWeight: 600 }}>{t.username || `u${t.user_id}`}</b> <span style={{ color: CP.textSecondary }}>{t.reason}</span>
                </span>
                <span style={{ color: waitColor(t.wait_min), fontWeight: 600, whiteSpace: "nowrap", ...NUM }}>{waitText(t.wait_min)}</span>
                <ExternalLink size={12} color={CP.textMuted} />
              </a>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 6 }}>Nessuno in attesa. Ottimo.</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
        <Btn href={`/admin/chat-monitor${q}`} strong>Apri la chat</Btn>
        <Btn href={`/admin/revenue-pacing${q}`}>La corsa del mese</Btn>
      </div>
      {c.missing.length > 0 && <div style={{ fontSize: 12, color: CP.textMuted }}>Non disponibile adesso: {c.missing.join(", ")}.</div>}
    </section>
  );
}

function MiniRace({ r }) {
  const target = r.goal || null;
  const max = Math.max(target || 0, r.proj || 0, r.mtd || 0, 1) * 1.04;
  const x = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const delta = r.paceRatio != null ? Math.round((r.paceRatio - 1) * 100) : null;
  const paceText = delta == null ? null : target
    ? (delta >= 0 ? `${delta}% avanti sul ritmo del traguardo` : `${-delta}% indietro sul ritmo del traguardo`)
    : (delta >= 0 ? `${delta}% sopra la media degli ultimi mesi` : `${-delta}% sotto la media degli ultimi mesi`);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, color: CP.textSecondary, ...NUM }}>
        <span><b style={{ color: CP.textPrimary, fontSize: 15 }}>{usd(r.mtd)}</b> finora</span>
        <span>arrivo previsto <b style={{ color: CP.textPrimary }}>{usd(r.proj)}</b></span>
      </div>
      <div style={{ position: "relative", height: 10, borderRadius: 999, background: alpha(CP.accent, "22"), margin: "8px 0 6px" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: x(r.mtd), borderRadius: 999, background: CP.accent }} />
        <div style={{ position: "absolute", left: x(r.mtd), top: 0, bottom: 0, width: `calc(${x(r.proj)} - ${x(r.mtd)})`, background: `repeating-linear-gradient(90deg, ${alpha(CP.accent, "88")} 0 6px, transparent 6px 10px)` }} />
        {target && <div title={`traguardo ${usd(target)}`} style={{ position: "absolute", left: x(target), top: -4, bottom: -4, width: 3, borderRadius: 2, background: CP.textPrimary }} />}
      </div>
      <div style={{ fontSize: 12.5, color: CP.textSecondary, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {target ? <><Flag size={12} /> traguardo {usd(target)}</> : <span>nessun traguardo messo</span>}
        {paceText && <span style={{ color: delta >= 0 ? CP.accentGreen : delta < -10 ? CP.accentRed : CP.textSecondary }}>· {paceText}</span>}
      </div>
    </div>
  );
}

function ShiftLine({ s, label }) {
  const pre = label ? <b style={{ fontWeight: 600, color: CP.textMuted, fontSize: 11.5, marginRight: 2 }}>{label}</b> : null;
  const box = (color, icon, children) => (
    <div style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: CP.textPrimary, flexWrap: "wrap" }}>{pre}{icon}{children}</div>
  );
  if (!s) return box(CP.textMuted, <Clock size={14} color={CP.textMuted} />, <span style={{ color: CP.textMuted }}>Turni non disponibili adesso</span>);
  const next = s.next.length ? <span style={{ color: CP.textSecondary }}>· poi {s.next.map((n) => firstName(n.member)).join(" e ")} alle {hm(s.next[0].start)}</span> : null;
  if (s.empty) return box(CP.textMuted, <Clock size={14} color={CP.textMuted} />, <><span>Nessuno di turno</span>{next}</>);
  if (s.unchecked) return box(CP.accentRed, <UserX size={14} color={CP.accentRed} />, <><span style={{ color: CP.accentRed, fontWeight: 600 }}>{s.current.map((n) => firstName(n.member)).join(" e ")} non {s.current.length > 1 ? "hanno" : "ha"} timbrato</span>{next}</>);
  return box(CP.accentGreen, <UserCheck size={14} color={CP.accentGreen} />, <><span>Di turno <b style={{ fontWeight: 600 }}>{s.current.map((n) => n.member).join(" e ")}</b> fino alle {hm(s.current[0].end)}</span>{next}</>);
}

function Btn({ href, strong, children }) {
  return (
    <a href={href} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, fontSize: 13.5, textDecoration: "none", fontWeight: 500,
      background: strong ? CP.accent : CP.surface, color: strong ? CP.accentInk : CP.textPrimary, border: `1px solid ${strong ? CP.accent : CP.border}` }}>
      {children} <ArrowRight size={14} />
    </a>
  );
}
