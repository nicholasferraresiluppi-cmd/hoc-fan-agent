"use client";
// Radar creator — vista "Mercato": dove c'è spazio (conteggi live del radar + indice dello
// studio), le regole dei reel e i tipi di reel che esplodono (studio di ottobre), chi lo fa già.
import { useMemo } from "react";
import { CP, alpha } from "@/lib/brand";
import { marketByGroup } from "@/lib/scouting-core";
import { NICHE_INDEX, REEL_RULES, REEL_TYPES, COMPETITOR, MARKET_ASOF, CAPTION_STUDY } from "@/lib/scouting-market";
import { SERIF, NUM, fmtFull, H2, igProfile, useIsPhone } from "./radar-ui";

const W = 720, H = 360, X0 = 40, X1 = 700, Y0 = 20, Y1 = 330;

export default function RadarMercato({ creators }) {
  const groups = useMemo(() => marketByGroup(creators), [creators]);
  const mapped = groups.filter((g) => NICHE_INDEX[g.g] != null);
  const total = creators.length;
  const nMin = Math.min(...mapped.map((g) => g.n), 40), nMax = Math.max(...mapped.map((g) => g.n), 1100);
  const lx = (n) => X0 + ((Math.log(n) - Math.log(nMin * 0.8)) / (Math.log(nMax * 1.1) - Math.log(nMin * 0.8))) * (X1 - X0);
  const ly = (i) => Y1 - ((i - 0.6) / 0.9) * (Y1 - Y0);
  const generic = groups.find((g) => g.g === "Estetica generica");
  const phone = useIsPhone();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>
      <section aria-labelledby="rm-spazio" style={{ display: "flex", flexWrap: "wrap", gap: "32px 52px", alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <H2 id="rm-spazio" sub={phone ? "Dalla nicchia che rende di più a parità di follower. Sopra ×1 = sopra la media del mercato." : "Più a sinistra: meno concorrenti. Più in alto: più view a parità di follower. Il cerchio è grande quante OnlyFanser ha la nicchia."}>Dove c&apos;è spazio</H2>
          {phone ? (
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {[...mapped].sort((a, b) => NICHE_INDEX[b.g] - NICHE_INDEX[a.g] || a.n - b.n).map((g) => {
                const idx = NICHE_INDEX[g.g], good = idx > 1;
                return (
                  <li key={g.g} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "2px 12px", padding: "12px 0", borderBottom: `1px solid ${CP.borderSoft || CP.border}` }}>
                    <span style={{ fontSize: 15.5, color: good ? CP.textPrimary : CP.textSecondary }}>{g.g}</span>
                    <span style={{ ...SERIF, fontSize: 24, lineHeight: 1, color: good ? CP.gold : CP.textSecondary, ...NUM }}>×{String(idx).replace(".", ",")}</span>
                    <span style={{ fontSize: 12.5, color: CP.textMuted }}>{fmtFull(g.n)} creator · {fmtFull(g.paid)} con profilo a pagamento</span>
                    <span style={{ fontSize: 12.5, color: CP.textMuted, textAlign: "right" }}>view a parità di follower</span>
                  </li>
                );
              })}
            </ol>
          ) : (
          <svg role="img" aria-label="Mappa delle nicchie per concorrenza e resa delle view" width="100%" viewBox={`0 0 ${W} ${H + 24}`}>
            <rect x={X0} y={Y0} width={lx(140) - X0} height={ly(1) - Y0} fill={alpha(CP.gold, "10")} />
            <line x1={X0} y1={ly(1)} x2={X1} y2={ly(1)} stroke={CP.borderStrong || CP.border} strokeDasharray="3 5" />
            <line x1={X0} y1={Y0} x2={X0} y2={Y1} stroke={CP.border} />
            <line x1={X0} y1={Y1} x2={X1} y2={Y1} stroke={CP.border} />
            <text x={X0 + 10} y={ly(1) - 10} fill={CP.gold} fontSize="12">Lo spazio libero</text>
            <text x={X1 - 4} y={ly(1) - 6} textAnchor="end" fill={CP.textMuted} fontSize="11.5">media del mercato</text>
            <text x={X0} y={H + 14} fill={CP.textMuted} fontSize="11.5">poche creator</text>
            <text x={X1} y={H + 14} textAnchor="end" fill={CP.textMuted} fontSize="11.5">affollato</text>
            {mapped.map((g) => {
              const idx = NICHE_INDEX[g.g];
              const cx = lx(g.n), cy = ly(idx), r = Math.max(6, Math.sqrt(g.paid) * 2.4);
              const good = idx > 1;
              const right = cx > X1 - 200;
              // un'altra nicchia alla stessa altezza poco più a destra: l'etichetta va sopra il cerchio
              const crowded = mapped.some((o) => o !== g && Math.abs(ly(NICHE_INDEX[o.g]) - cy) < 22 && lx(o.n) > cx && lx(o.n) - cx < 230);
              const tx = crowded ? cx : right ? cx - r - 6 : cx + r + 6;
              const ty = crowded ? cy - r - 8 : cy + 4;
              return (
                <g key={g.g}>
                  <circle cx={cx} cy={cy} r={r} fill={good ? alpha(CP.gold, "55") : alpha(CP.textPrimary, "18")} stroke={good ? CP.gold : CP.textSecondary} />
                  <text x={tx} y={ty} textAnchor={crowded ? "middle" : right ? "end" : "start"} fill={good ? CP.textPrimary : CP.textSecondary} fontSize="13">{g.g} · ×{String(idx).replace(".", ",")}</text>
                </g>
              );
            })}
          </svg>
          )}
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14, paddingTop: phone ? 0 : 48 }}>
          {generic && <p style={{ margin: 0, ...SERIF, fontSize: 25, lineHeight: 1.25 }}>{Math.round((generic.n / total) * 100)}% del mercato fa la ragazza estetica, e rende sotto la media.</p>}
          <p style={{ margin: 0, color: CP.textSecondary, fontSize: 15 }}>Comicità e fetish fanno il 44% di view in più a parità di follower, con un decimo delle concorrenti. Nei mestieri la resa media è bassa, ma un personaggio fisso fa la differenza.</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, borderTop: `1px solid ${CP.borderSoft || CP.border}` }}>
            <caption style={{ textAlign: "left", fontSize: 12.5, color: CP.textMuted, padding: "10px 0 6px" }}>Con un profilo a pagamento, per nicchia</caption>
            <tbody>
              {[...groups].filter((g) => g.n >= 20 && g.g !== "Da classificare").sort((a, b) => b.pct - a.pct).map((g) => (
                <tr key={g.g} style={{ borderBottom: `1px solid ${CP.borderSoft || CP.border}` }}>
                  <td style={{ padding: "7px 0", color: CP.textSecondary }}>{g.g}</td>
                  <td style={{ padding: "7px 0", textAlign: "right", ...NUM }}>{fmtFull(g.paid)} su {fmtFull(g.n)}</td>
                  <td style={{ padding: "7px 0 7px 12px", textAlign: "right", ...NUM, color: g.pct >= 25 ? CP.gold : CP.textPrimary }}>{g.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="rm-regole" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <H2 id="rm-regole" sub="Ogni reel confrontato con gli altri della stessa creator: 1.902 reel di 207 creator.">Le regole dei reel</H2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 26 }}>
          {REEL_RULES.map((r) => (
            <div key={r.k} style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${r.tone === "up" ? CP.accentGreen : r.tone === "down" ? CP.borderStrong || CP.border : CP.borderSoft || CP.border}`, paddingTop: 14 }}>
              <span style={{ ...SERIF, fontSize: 38, lineHeight: 1, color: r.tone === "up" ? CP.accentGreen : r.tone === "flat" ? CP.textMuted : CP.textPrimary }}>{r.v}</span>
              <span style={{ fontSize: 15 }}>{r.title}</span>
              <span style={{ fontSize: 13, color: CP.textSecondary }}>{r.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="rm-tipi" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <H2 id="rm-tipi" sub="201 reel fuori scala di 127 creator. In oro i tipi che insieme esplodono, si fanno da sola in casa e portano verso OnlyFans.">I reel che esplodono</H2>
        {phone ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {REEL_TYPES.map((t) => (
              <li key={t.t} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "4px 12px", padding: "12px 0", borderBottom: `1px solid ${CP.borderSoft || CP.border}`, color: t.dim ? CP.textSecondary : CP.textPrimary }}>
                <span style={{ fontSize: 15, color: t.top ? CP.gold : undefined }}>{t.t}</span>
                <span style={{ ...NUM, fontSize: 15 }}>×{String(t.x).replace(".", ",")}</span>
                <span style={{ gridColumn: "1 / 3", fontSize: 12.5, color: CP.textMuted }}>{t.solo}% da sola in casa · {t.of}% porta a OnlyFans</span>
              </li>
            ))}
          </ul>
        ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 680, borderCollapse: "collapse", fontSize: 14.5 }}>
            <thead><tr style={{ textAlign: "left", color: CP.textMuted, fontSize: 12.5 }}>
              <th scope="col" style={{ fontWeight: 400, padding: "0 12px 10px 0" }}>Tipo di reel</th>
              <th scope="col" style={{ fontWeight: 400, padding: "0 12px 10px" }}>Quanto esplode (× la mediana della creator)</th>
              <th scope="col" style={{ fontWeight: 400, padding: "0 12px 10px" }}>Da sola in casa</th>
              <th scope="col" style={{ fontWeight: 400, padding: "0 0 10px 12px" }}>Porta a OnlyFans</th>
            </tr></thead>
            <tbody>
              {REEL_TYPES.map((t) => (
                <tr key={t.t} style={{ borderTop: `1px solid ${CP.borderSoft || CP.border}`, color: t.dim ? CP.textSecondary : CP.textPrimary }}>
                  <td style={{ padding: "12px 12px 12px 0", color: t.top ? CP.gold : undefined }}>{t.t}</td>
                  <td style={{ padding: "12px" }}><span style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ display: "block", height: 6, width: t.x * 14, borderRadius: 3, background: t.top ? CP.gold : alpha(CP.textPrimary, "44") }} /><span style={NUM}>×{String(t.x).replace(".", ",")}</span></span></td>
                  <td style={{ padding: "12px", ...NUM }}>{t.solo}%</td>
                  <td style={{ padding: "12px 0 12px 12px", ...NUM }}>{t.of}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        <p style={{ margin: 0, fontSize: 13, color: CP.textMuted }}>Descrittivo: dice cosa c&apos;è nei reel che esplodono, non che un tipo esploda più spesso. Studio del {MARKET_ASOF}.</p>
      </section>

      <section aria-labelledby="rm-cap" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <H2 id="rm-cap" sub={CAPTION_STUDY.who}>Le creator che vivono di caption</H2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24 }}>
          {CAPTION_STUDY.findings.map((f) => (
            <div key={f.title} style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${f.tone === "up" ? CP.gold : CP.borderSoft || CP.border}`, paddingTop: 14 }}>
              <span style={{ ...SERIF, fontSize: 34, lineHeight: 1, color: f.tone === "up" ? CP.gold : CP.textMuted }}>{f.v}</span>
              <span style={{ fontSize: 15 }}>{f.title}</span>
              <span style={{ fontSize: 13, color: CP.textSecondary }}>{f.text}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px 28px" }}>
          {CAPTION_STUDY.families.map((f, i) => (
            <div key={f.t} style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${CP.borderSoft || CP.border}`, paddingTop: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{i + 1} · {f.t}</span>
              <span style={{ fontSize: 13.5, color: CP.textSecondary }}>{f.d}</span>
              {f.ex.map((e) => <span key={e} style={{ ...SERIF, fontSize: 18, lineHeight: 1.3 }}>{e}</span>)}
            </div>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 13, color: CP.textMuted }}>Frasi lette dalle copertine dei reel. Studio del {CAPTION_STUDY.asof}.</p>
      </section>

      <section aria-labelledby="rm-conc" style={{ display: "flex", flexWrap: "wrap", gap: "28px 52px", borderTop: `1px solid ${CP.border}`, paddingTop: 36 }}>
        <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 10 }}>
          <H2 id="rm-conc">Chi lo fa già</H2>
          <p style={{ margin: 0, ...SERIF, fontStyle: "italic", fontSize: 23, color: CP.textSecondary }}>{COMPETITOR.name}: {COMPETITOR.line}.</p>
          <p style={{ margin: 0, color: CP.textSecondary, fontSize: 15 }}>{COMPETITOR.text}</p>
        </div>
        <ul style={{ flex: "1 1 380px", margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "8px 20px", fontSize: 14.5, alignContent: "start" }}>
          {COMPETITOR.handles.map((h) => <li key={h}><a href={igProfile(h)} target="_blank" rel="noopener noreferrer" style={{ color: CP.textPrimary }}>@{h} ↗</a></li>)}
        </ul>
      </section>
    </div>
  );
}
