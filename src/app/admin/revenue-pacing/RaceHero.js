"use client";

// "La corsa del mese" (09/10/2026, scelta di Nicholas tra tre prove: più bello e amichevole,
// meno da strumento). Il mese come percorso: dove sei oggi, dove dovresti essere col ritmo
// dell'obiettivo, dove arrivi a questo passo, il traguardo. Sotto, tre tessere colorate con
// frasi normali al posto delle sigle. I numeri sono gli stessi dei riquadri di dettaglio.

import { Flame, Flag, UserPlus, ShoppingBag, MessageCircle } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { NUM } from "@/components/ds";

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
// punto delle migliaia anche a 4 cifre (in it-IT "5892" resterebbe senza)
const group = (n) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const usd = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v) < 0 ? "−" : ""}$${group(Number(v))}`);
const int = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : group(Number(v)));
const initials = (name) => String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "·";

/** Giorni del mese in corso (chiusi, oggi escluso) con incasso sopra il ritmo, contati all'indietro da ieri. */
function streakAbove(daily, month, today, perDay) {
  if (!perDay) return 0;
  const days = [...daily.values()].filter((d) => d.date.slice(0, 7) === month && d.date < today).sort((a, b) => (a.date < b.date ? 1 : -1));
  let n = 0;
  for (const d of days) { if (d.rev >= perDay) n++; else break; }
  return n;
}

export default function RaceHero({ row, goal, month, daily, creatorName, onSetGoal, chat }) {
  const m = Number(month.slice(5, 7));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "UTC" }); // i giorni della revenue sono in UTC
  const mtd = row.revenue_mtd || 0;
  const proj = row.revenue_proj_eom || 0;
  const hist = row.revenue_hist_avg || 0;
  const target = goal || null;
  const perDay = (target || hist) / (row.days_in_month || 30);
  const streak = streakAbove(daily, month, today, perDay);
  const shouldBe = target ? (target * row.day_of_month) / row.days_in_month : null;
  const max = Math.max(target || 0, proj, mtd, hist * 0.6) * 1.06 || 1;
  const x = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const remaining = target ? Math.max(0, target - mtd) : null;
  const needPerDay = remaining != null && row.days_remaining > 0 ? remaining / row.days_remaining : null;
  const nowPerDay = row.day_of_month ? mtd / row.day_of_month : null;
  const ahead = shouldBe != null ? mtd - shouldBe : null;

  const spenders = row.current_month_converting_new_subs || 0;
  const oneIn = (n, d) => (n > 0 ? Math.round(d / n) : null);
  const nowOneIn = oneIn(spenders, row.new_subs_mtd || 0);
  const usualOneIn = row.hist_conversion_rate > 0 ? Math.round(1 / row.hist_conversion_rate) : null;

  // Etichette: "oggi" sopra la pista, gli altri segnaposto sotto; l'arrivo previsto va sopra
  // se è troppo vicino al traguardo (le due etichette si coprirebbero).
  const TRACK = 44;
  const projNearGoal = target && Math.abs(proj - target) / max < 0.2;
  const marker = (v, label, sub, { strong = false, above = false } = {}) => (
    <div style={{ position: "absolute", left: x(v), top: 0, bottom: 0, width: 150, transform: "translateX(-50%)", whiteSpace: "nowrap", textAlign: "center", fontSize: 12, color: CP.textSecondary, ...NUM }}>
      <span style={{ position: "absolute", left: "50%", top: TRACK - 5, transform: "translateX(-50%)", width: 14, height: 14, borderRadius: "50%", background: CP.surface, border: `3px solid ${strong ? CP.accent : alpha(CP.accent, "66")}` }} />
      <div style={{ position: "absolute", left: 0, right: 0, ...(above ? { top: 0 } : { top: TRACK + 32 }) }}>
        <b style={{ color: CP.textPrimary, fontWeight: 600 }}>{label}</b> <span>{sub}</span>
      </div>
    </div>
  );

  return (
    <section style={{ background: alpha(CP.accent, "0f"), border: `1px solid ${alpha(CP.accent, "22")}`, borderRadius: 22, padding: "22px 24px 20px", marginBottom: 12, fontFamily: FONTS.body }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: CP.textPrimary }}>La corsa di {MONTHS[m - 1]}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {!target && (
          <button onClick={onSetGoal} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, border: `1px dashed ${CP.borderStrong}`, background: CP.surface, color: CP.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body }}>
            <Flag size={14} /> Metti il traguardo
          </button>
        )}
        {streak > 0 && (
          <div title={`Giorni consecutivi, fino a ieri, con un incasso sopra ${usd(perDay)} al giorno (${target ? "il ritmo dell'obiettivo" : "la media degli ultimi 12 mesi"})`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: CP.surface, borderRadius: 999, padding: "6px 12px", fontSize: 13, color: CP.textPrimary, border: `1px solid ${CP.border}` }}>
            <Flame size={15} color={CP.gold} /> <b style={{ fontWeight: 700 }}>{streak} {streak === 1 ? "giorno" : "giorni"}</b> sopra il ritmo
          </div>
        )}
        </div>
      </div>

      <div style={{ position: "relative", height: 120, margin: "18px 50px 4px" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: TRACK, height: 10, borderRadius: 999, background: alpha(CP.accent, "26") }} />
        <div style={{ position: "absolute", left: 0, width: x(mtd), top: TRACK, height: 10, borderRadius: 999, background: CP.accent }} />
        <div style={{ position: "absolute", left: x(mtd), width: `calc(${x(proj)} - ${x(mtd)})`, top: TRACK, height: 10, background: `repeating-linear-gradient(90deg, ${alpha(CP.accent, "88")} 0 8px, transparent 8px 14px)` }} />
        {shouldBe != null && marker(shouldBe, usd(shouldBe), "dovresti essere qui")}
        {marker(proj, usd(proj), "arrivo previsto", { strong: true, above: projNearGoal })}
        <div style={{ position: "absolute", left: x(mtd), top: 0, transform: "translateX(-50%)", textAlign: "center", width: 120 }}>
          <div style={{ fontSize: 12, color: CP.textSecondary, ...NUM, visibility: projNearGoal && Math.abs(proj - mtd) / max < 0.2 ? "hidden" : "visible" }}><b style={{ color: CP.textPrimary }}>{usd(mtd)}</b> oggi</div>
        </div>
        <div style={{ position: "absolute", left: x(mtd), top: TRACK + 5 - 24, transform: "translateX(-50%)", width: 48, height: 48, borderRadius: "50%", background: CP.accent, color: CP.accentInk, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, border: `4px solid ${CP.bg}`, boxSizing: "border-box" }}>{initials(creatorName)}</div>
        {target ? (
          <div style={{ position: "absolute", left: x(target), top: TRACK + 5 - 17, transform: "translateX(-50%)", textAlign: "center", width: 100 }}>
            <div style={{ width: 34, height: 34, margin: "0 auto", borderRadius: 10, background: CP.textPrimary, color: CP.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><Flag size={16} /></div>
            <div style={{ fontSize: 12, color: CP.textSecondary, marginTop: 6, ...NUM }}><b style={{ color: CP.textPrimary }}>{usd(target)}</b> traguardo</div>
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginTop: 18 }}>
        <Tile icon={<UserPlus size={19} />} color={CP.accent} value={int(row.new_subs_mtd)} label="nuovi abbonati" sub={`a fine mese circa ${int(row.new_subs_proj_eom)}`} />
        <Tile icon={<ShoppingBag size={19} />} color={CP.gold} value={int(spenders)} label="hanno già comprato"
          sub={nowOneIn && usualOneIn ? `di solito 1 su ${usualOneIn}, ora 1 su ${nowOneIn}` : usualOneIn ? `di solito compra 1 nuovo su ${usualOneIn}` : null} />
        <Tile icon={<MessageCircle size={19} />} color={CP.accentGreen}
          value={chat ? int(chat.waiting) : "…"} label="fan aspettano una risposta"
          sub={chat ? (chat.latMin != null ? `oggi si risponde in ${Math.max(1, Math.round(chat.latMin))} min` : null) : "sto guardando la chat"} href={chat?.href} />
      </div>

      <div style={{ marginTop: 12, background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 14, padding: "12px 14px", fontSize: 14, color: CP.textPrimary, lineHeight: 1.5, ...NUM }}>
        {target ? (
          remaining > 0 ? (
            <>
              <b style={{ fontWeight: 700 }}>Per arrivare al traguardo:</b> {usd(needPerDay)} al giorno nei prossimi {row.days_remaining} giorni
              {nowPerDay ? <> · finora {usd(nowPerDay)} al giorno</> : null}
              {ahead != null && <span style={{ color: ahead >= 0 ? CP.accentGreen : CP.textSecondary }}> · {ahead >= 0 ? `${usd(ahead)} avanti` : `${usd(-ahead)} indietro`} rispetto al ritmo</span>}
            </>
          ) : (
            <><b style={{ fontWeight: 700 }}>Traguardo raggiunto.</b> Tutto quello che arriva da qui è in più.</>
          )
        ) : (
          <>Metti il traguardo del mese e qui trovi quanto serve al giorno per arrivarci. Finora {usd(nowPerDay)} al giorno.</>
        )}
      </div>
    </section>
  );
}

function Tile({ icon, color, value, label, sub, href }) {
  const body = (
    <>
      <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", background: alpha(color, "1f"), color }}>{icon}</span>
      <div style={{ fontSize: 26, fontWeight: 700, color: CP.textPrimary, marginTop: 8, ...NUM }}>{value}</div>
      <div style={{ fontSize: 13, color: CP.textPrimary }}>{label}</div>
      {sub && <div style={{ fontSize: 12.5, color: CP.textSecondary, marginTop: 2 }}>{sub}</div>}
    </>
  );
  const style = { display: "block", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 16, padding: 14, textDecoration: "none" };
  return href ? <a href={href} style={style}>{body}</a> : <div style={style}>{body}</div>;
}
