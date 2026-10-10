"use client";
// Radar creator — vista "Format": il catalogo dei format che esistono già e in Italia quasi
// nessuno fa (studio del 9/10/2026), il criterio per riconoscerli, come scegliere quello giusto
// per una ragazza e come provarlo misurando gli abbonati.
import { useState } from "react";
import { CP, alpha } from "@/lib/brand";
import { FilterChip } from "@/components/ds";
import { FORMATS, FORMAT_TESTS, FORMAT_CHOICE, FORMAT_TRIAL, OUR_CONCEPTS, FORMAT_ASOF } from "@/lib/scouting-formats";
import { SERIF, NUM, H2 } from "./radar-ui";

const FILTERS = [
  { id: "all", label: "Tutti" },
  { id: "free", label: "Libero in Italia" },
  { id: "hi", label: "Avvicina molto a OF" },
  { id: "zero", label: "Costo zero" },
];

export default function RadarFormat() {
  const [f, setF] = useState("all");
  const home = FORMATS.filter((x) => !x.later);
  const shown = home.filter((x) => f === "all" || x[f]);
  let lastFam = null;
  const tag = (on, onText, offText) => (
    <span style={{ fontSize: 12, borderRadius: 999, padding: "2px 10px", border: `1px solid ${on ? alpha(CP.gold, "88") : CP.border}`, color: on ? CP.gold : CP.textMuted, whiteSpace: "nowrap" }}>{on ? onText : offText}</span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, ...SERIF, fontSize: 26, lineHeight: 1.25, maxWidth: 820 }}>I format esistono già. In Italia quasi nessuno li fa, e basta la ragazza da sola in casa.</p>
        <p style={{ margin: 0, color: CP.textSecondary, maxWidth: 760 }}>Le idee le abbiamo avute: sette account a tema sono stati aperti e mai partiti. Quelli portati avanti con costanza crescono. Il problema è scegliere un format e tenerlo per mesi.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 14.5 }}>
            <thead><tr style={{ textAlign: "left", color: CP.textMuted, fontSize: 12.5 }}>
              <th scope="col" style={{ fontWeight: 400, padding: "0 12px 8px 0" }}>Account a tema</th>
              <th scope="col" style={{ fontWeight: 400, padding: "0 12px 8px" }}>Creator</th>
              <th scope="col" style={{ fontWeight: 400, padding: "0 12px 8px", textAlign: "right" }}>View a reel, ago–set</th>
              <th scope="col" style={{ fontWeight: 400, padding: "0 0 8px 12px", textAlign: "right" }}>set–ott</th>
            </tr></thead>
            <tbody>
              {OUR_CONCEPTS.map((c) => (
                <tr key={c.name} style={{ borderTop: `1px solid ${CP.borderSoft || CP.border}`, color: c.dead ? CP.textMuted : CP.textPrimary }}>
                  <td style={{ padding: "10px 12px 10px 0" }}>{c.name}</td>
                  <td style={{ padding: "10px 12px", color: CP.textSecondary }}>{c.who}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", ...NUM }}>{c.before}</td>
                  <td style={{ padding: "10px 0 10px 12px", textAlign: "right", ...NUM, color: c.dead ? CP.textMuted : CP.accentGreen }}>{c.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <H2 sub="Un'idea è un format solo se passa quattro domande su cinque.">Il criterio</H2>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
          {FORMAT_TESTS.map(([q, a], i) => (
            <li key={q} style={{ display: "grid", gridTemplateColumns: "30px minmax(0,1fr)", gap: 10 }}>
              <span style={{ ...SERIF, fontSize: 24, color: CP.gold, lineHeight: 1.1 }}>{i + 1}</span>
              <span><strong style={{ fontWeight: 600 }}>{q}</strong> <span style={{ color: CP.textSecondary }}>{a}</span></span>
            </li>
          ))}
        </ol>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <H2 sub="Cosa resta fisso e cosa cambia, chi lo fa davvero, perché si torna, quanto avvicina a OF.">{home.length} format da fare da sola, in casa</H2>
        <div role="group" aria-label="Filtra i format" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {FILTERS.map((x) => <FilterChip key={x.id} label={x.label} active={f === x.id} onClick={() => setF(x.id)} />)}
          <span style={{ fontSize: 13, color: CP.textMuted }}>{shown.length} su {home.length}</span>
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          {shown.map((x) => {
            const head = x.fam !== lastFam ? <div key={`h-${x.fam}`} style={{ fontSize: 13, color: CP.textMuted, borderBottom: `1px solid ${CP.border}`, paddingBottom: 6, marginTop: 10 }}>{x.fam}</div> : null;
            lastFam = x.fam;
            return [
              head,
              <article key={x.name} style={{ border: `1px solid ${CP.border}`, borderRadius: 12, padding: 18, display: "grid", gap: 10, background: CP.surface }}>
                <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <h3 style={{ margin: 0, ...SERIF, fontSize: 24 }}>{x.name}</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{tag(x.free, "Libero in Italia", "Già presente in Italia")}{tag(x.hi, "Avvicina molto a OF", "Vetrina")}{x.zero ? tag(true, "Costo zero", "") : null}</div>
                </header>
                <p style={{ margin: 0, fontSize: 15, background: CP.bg, border: `1px dashed ${CP.border}`, borderRadius: 8, padding: "10px 12px" }}>{x.mech}</p>
                <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(110px, 150px) minmax(0,1fr)", gap: "6px 14px", fontSize: 14.5 }}>
                  <dt style={{ color: CP.textMuted }}>Chi lo fa</dt><dd style={{ margin: 0 }}>{x.who}</dd>
                  <dt style={{ color: CP.textMuted }}>Perché si torna</dt><dd style={{ margin: 0 }}>{x.why}</dd>
                  <dt style={{ color: CP.textMuted }}>Come si rinnova</dt><dd style={{ margin: 0 }}>{x.evolve}</dd>
                  <dt style={{ color: CP.textMuted }}>In Italia</dt><dd style={{ margin: 0 }}>{x.it}</dd>
                </dl>
              </article>,
            ];
          })}
        </div>
        <div style={{ display: "grid", gap: 0, marginTop: 8 }}>
          <div style={{ fontSize: 13, color: CP.textMuted, borderBottom: `1px solid ${CP.border}`, paddingBottom: 6 }}>Per dopo · servono altre persone o bisogna uscire</div>
          {FORMATS.filter((x) => x.later).map((x) => (
            <div key={x.name} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 240px) minmax(0,1fr)", gap: 14, padding: "11px 0", borderBottom: `1px solid ${CP.borderSoft || CP.border}`, fontSize: 14.5 }}>
              <strong style={{ fontWeight: 600 }}>{x.name}</strong>
              <span style={{ color: CP.textSecondary }}>{x.mech} {x.who} {x.it}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 44 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <H2 sub="Non il format più bello: quello che solo lei può fare in modo credibile.">Come si sceglie</H2>
          {FORMAT_CHOICE.map(([q, a]) => (
            <div key={q} style={{ borderTop: `1px solid ${CP.borderSoft || CP.border}`, paddingTop: 10 }}>
              <strong style={{ fontWeight: 600 }}>{q}</strong>
              <p style={{ margin: "4px 0 0", color: CP.textSecondary, fontSize: 14.5 }}>{a}</p>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <H2 sub="Tre settimane, misurando gli abbonati e non le view.">Come si prova</H2>
          {FORMAT_TRIAL.map(([w, a]) => (
            <div key={w} style={{ display: "grid", gridTemplateColumns: "110px minmax(0,1fr)", gap: 12, borderTop: `1px solid ${CP.borderSoft || CP.border}`, paddingTop: 10, fontSize: 14.5 }}>
              <span style={{ color: CP.gold }}>{w}</span><span style={{ color: CP.textSecondary }}>{a}</span>
            </div>
          ))}
        </div>
      </section>
      <p style={{ margin: 0, fontSize: 13, color: CP.textMuted }}>Fonti: Trend Finder di CreatorsPro (80 reel in tendenza) e ricerca web, {FORMAT_ASOF}. Le cifre di follower prese da siti di settore sono indicative.</p>
    </div>
  );
}
