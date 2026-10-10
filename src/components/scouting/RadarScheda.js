"use client";
// Radar creator — scheda di una creator: perché guardarla, i numeri, i reel (si guardano qui
// dentro: i video arrivano dal server di Instagram con link a tempo, nessuna copia), dove
// porta, da dove viene ogni dato; di lato il lavoro (fase, chi la segue, account, note).
import { useEffect, useState } from "react";
import useSWR from "swr";
import { CP, alpha } from "@/lib/brand";
import { whyLines, classifyUrl } from "@/lib/scouting-core";
import { SERIF, NUM, fmtFull, fmtDate, btn, btnPrimary, btnQuiet, input, igProfile, igReel, Initials, LinkChip, Spark, H2, STAGE_LABEL } from "./radar-ui";

const fetcher = (u) => fetch(u).then((r) => (r.ok ? r.json() : {}));

export default function RadarScheda({ c, newCut, data, profilesBy, act, busy, onBack, onSelectHandle }) {
  const ps = c.handles.map((h) => profilesBy[h]).filter(Boolean);
  const main = ps[0] || {};
  const why = whyLines(c, { newCut });
  const notes = data.notes?.[c.id] || [];
  const { data: md, mutate: refreshMedia } = useSWR(`/api/admin/scouting/reels?h=${encodeURIComponent(c.handles[0])}`, fetcher, { revalidateOnFocus: false });
  const media = md?.media || {};
  const [loading, setLoading] = useState(false);
  const [reelMsg, setReelMsg] = useState(null);
  const [reels, setReels] = useState(c.reels || []);
  useEffect(() => setReels(c.reels || []), [c.id, c.reels]);

  async function loadReels() {
    setLoading(true); setReelMsg(null);
    try {
      const r = await fetch("/api/admin/scouting/reels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ h: c.handles[0] }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Errore");
      setReels(d.reels.map((x) => ({ ...x, h: c.handles[0] })).sort((a, b) => (b.v || 0) - (a.v || 0)));
      await refreshMedia();
    } catch (e) { setReelMsg(e.message); } finally { setLoading(false); }
  }

  const [watching, setWatching] = useState(null);
  async function watch(sc) {
    setWatching(sc); setReelMsg(null);
    try {
      const r = await fetch("/api/admin/scouting/reels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ h: c.handles[0], sc }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Errore");
      await refreshMedia({ media: { ...media, ...d.media } }, { revalidate: false });
    } catch (e) { setReelMsg(e.message); } finally { setWatching(null); }
  }

  const ratio = c.medv && c.fol ? Math.round((c.medv / c.fol) * 100) : null;
  const links = [];
  for (const p of ps) {
    for (const u of p.hlLinks || []) links.push({ url: u, where: "Prima storia in evidenza", h: p.h, k: classifyUrl(u) });
    if (p.url) links.push({ url: p.url, where: "Bio", h: p.h, k: classifyUrl(p.url) });
  }
  const medianV = reels.length ? [...reels].map((r) => r.v || 0).sort((a, b) => a - b)[Math.floor(reels.length / 2)] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
      <button onClick={onBack} style={{ ...btnQuiet, alignSelf: "flex-start", padding: 0, minHeight: 0 }}>← Torna alla lista</button>

      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "24px 36px", borderBottom: `1px solid ${CP.border}`, paddingBottom: 30 }}>
        <span className="rs-ini"><Initials name={c.name} size={96} gold={c.sig === "forte"} /></span>
        <div style={{ flex: "1 1 520px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 13, color: CP.textMuted }}>{[c.g, c.nic, c.firstSeen ? `nel radar dal ${fmtDate(c.firstSeen)}` : null].filter(Boolean).join(" · ")}</span>
          <h1 style={{ margin: 0, ...SERIF, fontSize: "clamp(36px, 5vw, 60px)", lineHeight: 1, overflowWrap: "anywhere" }}>{c.name}</h1>
          {why[0] && <p style={{ margin: 0, ...SERIF, fontStyle: "italic", fontSize: 24, lineHeight: 1.25, color: CP.textSecondary }}>{why[0]}</p>}
        </div>
        <div className="rs-acts" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {c.handles.map((h) => <a key={h} href={igProfile(h)} target="_blank" rel="noopener noreferrer" style={btn}>Apri @{h} ↗</a>)}
          {c.stage === "da_valutare" && <>
            <button style={btnPrimary} disabled={busy} onClick={() => act({ action: "stage", id: c.id, stage: "interessante" }, `${c.name}: interessante.`)}>Interessante</button>
            <button style={btnQuiet} disabled={busy} onClick={() => act({ action: "stage", id: c.id, stage: "scartata" }, `${c.name}: scartata.`)}>Scarta</button>
          </>}
        </div>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 52 }}>
        <main className="rs-main" style={{ flex: "999 1 600px", minWidth: 0, display: "flex", flexDirection: "column", gap: 40 }}>
          {why.length > 0 && (
            <section className="rs-why" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <H2>Perché guardarla</H2>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10, fontSize: 16 }}>
                {why.map((w) => <li key={w} style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr)", gap: 8 }}><span style={{ color: CP.gold }}>—</span><span>{w}</span></li>)}
              </ul>
            </section>
          )}

          <section className="rs-nums" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <H2>I numeri</H2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 20 }}>
              <Big v={fmtFull(c.fol)} l={c.n > 1 ? `follower (${c.n} account)` : "follower"} />
              <Big v={fmtFull(c.medv)} l="view mediane per reel" />
              <Big v={ratio == null ? "—" : `${ratio}%`} l="dei follower vede un reel" />
              <Big v={c.u ? `${c.u}/5` : "—"} l="unicità del format" gold={c.u >= 4} />
            </div>
            <div style={{ borderTop: `1px solid ${CP.borderSoft || CP.border}`, paddingTop: 16 }}>
              <div style={{ fontSize: 13.5, color: CP.textSecondary, marginBottom: 8 }}>Follower, settimana per settimana</div>
              <Spark hist={c.n > 1 ? null : main.hist} big />
            </div>
          </section>

          <section className="rs-reels" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
              <H2 sub={reels.length ? "Dal più visto. I video si guardano qui; i link di Instagram scadono in un paio di giorni, poi si ricaricano." : "Carica gli ultimi 12 reel per guardarli qui, anche se il profilo ha il limite d'età."}>I reel</H2>
              <button style={btn} disabled={loading} onClick={loadReels}>{loading ? "Carico i reel…" : reels.length ? "Aggiorna i reel" : "Carica i reel"}</button>
            </div>
            {reelMsg && <p style={{ margin: 0, color: CP.attn, fontSize: 14 }}>{reelMsg}</p>}
            {reels.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(140px, 45%), 1fr))", gap: 14 }}>
                {reels.slice(0, 9).map((r) => {
                  const m = media[r.sc];
                  const mult = medianV && r.v ? r.v / medianV : null;
                  return (
                    <figure key={r.sc} style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                      {m?.video ? (
                        <video src={m.video} poster={m.thumb || undefined} controls preload="none" playsInline
                          style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 12, background: CP.surface, border: `1px solid ${CP.border}` }} />
                      ) : (
                        <button onClick={() => watch(r.sc)} disabled={watching === r.sc} style={{ aspectRatio: "9 / 16", width: "100%", borderRadius: 12, background: `linear-gradient(180deg, ${alpha(CP.textPrimary, "12")}, ${alpha(CP.textPrimary, "05")})`, border: `1px solid ${CP.border}`, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", justifyContent: "center", color: CP.textPrimary, fontSize: 14, textAlign: "center", padding: 12, cursor: "pointer", fontFamily: "inherit" }}>
                          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" stroke="none" /></svg>
                          {watching === r.sc ? "Carico il video…" : "Guarda qui"}
                        </button>
                      )}
                      <figcaption style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "2px 8px", fontSize: 13 }}>
                        <span style={NUM}>{fmtFull(r.v)} view{mult && mult >= 2 ? <span style={{ color: CP.gold }}> · ×{mult.toFixed(1).replace(".", ",")}</span> : null}</span>
                        <a href={igReel(r.sc)} target="_blank" rel="noopener noreferrer" style={{ color: CP.textSecondary, textDecoration: "none" }}>Apri ↗</a>
                      </figcaption>
                      {(r.a || r.signaled) && <span style={{ fontSize: 12, color: CP.textMuted }}>{[r.a === "original_sounds" ? "audio originale" : r.a === "licensed_music" ? "musica di libreria" : null, r.signaled ? "segnalato" : null].filter(Boolean).join(" · ")}</span>}
                    </figure>
                  );
                })}
              </div>
            )}
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <H2>Dove porta</H2>
            {links.length === 0 ? <p style={{ margin: 0, color: CP.textSecondary, fontSize: 14 }}>Nessun link in bio né nella prima storia in evidenza.</p> : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {links.map((l, i) => (
                  <li key={i} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 200px) minmax(0,1fr) auto", gap: 14, padding: "11px 0", borderBottom: `1px solid ${CP.borderSoft || CP.border}`, fontSize: 14, alignItems: "baseline" }}>
                    <span style={{ color: CP.textSecondary }}>{l.where}{c.n > 1 ? ` · @${l.h}` : ""}</span>
                    <span style={{ color: l.k?.strength >= 2 ? CP.gold : CP.textPrimary }}>{l.k?.label || "Link"}</span>
                    <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: CP.textSecondary, fontSize: 13 }}>Apri ↗</a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <H2>Da dove viene ogni dato</H2>
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(110px, 220px) minmax(0,1fr)", gap: "8px 18px", fontSize: 14 }}>
              <dt style={{ color: CP.textSecondary }}>Trovata</dt><dd style={{ margin: 0 }}>{main.src === "segnalata" ? `Segnalata${main.by ? ` da ${main.by}` : ""}` : main.src === "profili simili" ? "Ricerca nei profili collegati" : main.src === "parole chiave" ? "Ricerca per parole chiave" : "Prima ricerca"}{c.firstSeen ? ` · ${fmtDate(c.firstSeen)}` : ""}</dd>
              <dt style={{ color: CP.textSecondary }}>Numeri</dt><dd style={{ margin: 0 }}>Giro settimanale{main.lastSeen ? ` · ultimo ${fmtDate(main.lastSeen)}` : ""}</dd>
              <dt style={{ color: CP.textSecondary }}>Nicchia e format</dt><dd style={{ margin: 0 }}>{c.g === "Da classificare" ? "Da classificare" : "Letti da bio e ultimi post · da confermare a occhio"}</dd>
              {main.nota && <><dt style={{ color: CP.textSecondary }}>Nota della ricerca</dt><dd style={{ margin: 0 }}>{main.nota}</dd></>}
            </dl>
          </section>
        </main>

        <Aside c={c} data={data} ps={ps} act={act} busy={busy} notes={notes} onSelectHandle={onSelectHandle} onBack={onBack} />
      </div>
    </div>
  );
}

function Big({ v, l, gold }) {
  return (
    <div>
      <div style={{ ...SERIF, fontSize: 40, lineHeight: 1, color: gold ? CP.gold : CP.textPrimary, ...NUM }}>{v}</div>
      <div style={{ fontSize: 13, color: CP.textSecondary, marginTop: 6 }}>{l}</div>
    </div>
  );
}

const STAGES_ASIDE = ["da_valutare", "interessante", "contattata", "trattativa", "firmata", "scartata"];

function Aside({ c, data, ps, act, busy, notes, onSelectHandle, onBack }) {
  const [name, setName] = useState(c.name.startsWith("@") ? "" : c.name);
  const [owner, setOwner] = useState(c.owner || "");
  const [note, setNote] = useState("");
  const [forget, setForget] = useState(null);
  const sug = [];
  const seen = new Set();
  for (const x of data.suggestions || []) {
    if (!(c.handles.includes(x.a) || c.handles.includes(x.b))) continue;
    const other = c.handles.includes(x.a) ? x.b : x.a;
    if (c.handles.includes(other) || seen.has(other)) continue;
    seen.add(other);
    sug.push({ ...x, other });
  }
  const lbl = { margin: 0, fontSize: 13, fontWeight: 500, color: CP.textSecondary };
  return (
    <aside aria-label="Lavoro sulla creator" style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={lbl}>A che punto siamo</h2>
        <div role="radiogroup" aria-label="Fase" className="rs-stages" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {STAGES_ASIDE.map((s) => {
            const on = c.stage === s;
            return (
              <button key={s} role="radio" aria-checked={on} disabled={busy || on} onClick={() => act({ action: "stage", id: c.id, stage: s }, `Fase: ${STAGE_LABEL[s]}.`)}
                style={{ textAlign: "left", background: on ? alpha(CP.gold, "1a") : "transparent", border: `1px solid ${on ? alpha(CP.gold, "88") : CP.border}`, color: on ? CP.textPrimary : CP.textSecondary, borderRadius: 10, padding: "10px 14px", fontSize: 14.5, cursor: on ? "default" : "pointer", fontFamily: "inherit" }}>
                {STAGE_LABEL[s]}
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13, color: CP.textSecondary }}>Nome della scheda
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== (c.name.startsWith("@") ? "" : c.name) && act({ action: "field", id: c.id, field: "name", value: name })} placeholder="es. Serena camionista" style={input} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, color: CP.textSecondary }}>La segue
          <input value={owner} onChange={(e) => setOwner(e.target.value)} onBlur={() => owner !== (c.owner || "") && act({ action: "field", id: c.id, field: "owner", value: owner })} placeholder="Nome" style={input} />
        </label>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={lbl}>Account della stessa persona</h2>
        {ps.map((p) => (
          <div key={p.h} style={{ display: "grid", gap: 6, borderTop: `1px solid ${CP.borderSoft || CP.border}`, paddingTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 14 }}>
              <a href={igProfile(p.h)} target="_blank" rel="noopener noreferrer" style={{ color: CP.textPrimary }}>@{p.h} ↗</a>
              <span style={{ color: CP.textMuted, ...NUM }}>{fmtFull(p.fol)}</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ps.length > 1 && <button style={{ ...btnQuiet, padding: "4px 0", minHeight: 0, fontSize: 13 }} disabled={busy} onClick={() => act({ action: "unlink", handle: p.h }, "Account staccato.")}>Stacca</button>}
              {forget === p.h ? (
                <>
                  <span style={{ fontSize: 12.5, color: CP.textSecondary }}>Cancello tutti i dati di @{p.h}? Non si torna indietro.</span>
                  <button style={{ ...btnQuiet, padding: "4px 0", minHeight: 0, fontSize: 13, color: CP.accentRed }} disabled={busy} onClick={async () => { if (await act({ action: "forget", handle: p.h }, `Dati di @${p.h} cancellati.`)) { setForget(null); if (ps.length === 1) onBack(); else onSelectHandle(c.handles.find((x) => x !== p.h)); } }}>Sì, cancella</button>
                  <button style={{ ...btnQuiet, padding: "4px 0", minHeight: 0, fontSize: 13 }} onClick={() => setForget(null)}>Annulla</button>
                </>
              ) : (
                <button style={{ ...btnQuiet, padding: "4px 0", minHeight: 0, fontSize: 13 }} onClick={() => setForget(p.h)}>Cancella i dati</button>
              )}
            </div>
          </div>
        ))}
        {sug.map((x) => (
          <div key={x.other} style={{ border: `1px dashed ${alpha(CP.gold, "66")}`, borderRadius: 10, padding: "10px 12px", display: "grid", gap: 6 }}>
            <span style={{ fontSize: 14 }}>Forse anche <a href={igProfile(x.other)} target="_blank" rel="noopener noreferrer" style={{ color: CP.textPrimary, fontWeight: 600 }}>@{x.other} ↗</a></span>
            <span style={{ fontSize: 12.5, color: CP.textMuted }}>{x.reason}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btnPrimary, minHeight: 34, padding: "6px 14px" }} disabled={busy} onClick={() => act({ action: "link", target: c.handles[0], handle: x.other }, "Account collegati.")}>Collega</button>
              <button style={{ ...btnQuiet, minHeight: 34 }} disabled={busy} onClick={async () => { for (const h of c.handles) if (!(await act({ action: "dismiss", a: h, b: x.other }))) break; }}>Non è lei</button>
            </div>
          </div>
        ))}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={lbl}>Note</h2>
        {notes.slice().reverse().map((n, i) => (
          <div key={i} style={{ borderLeft: `1px solid ${CP.borderStrong || CP.border}`, paddingLeft: 12 }}>
            <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{n.text}</div>
            <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 2 }}>{n.by || "—"} · {fmtDate(n.at)}</div>
          </div>
        ))}
        <label htmlFor={`rn-${c.id}`} style={{ fontSize: 12.5, color: CP.textMuted }}>Aggiungi una nota</label>
        <textarea id={`rn-${c.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Niente dati di salute, vita privata o orientamento" style={{ ...input, resize: "vertical" }} />
        <button style={{ ...btnPrimary, alignSelf: "flex-start" }} disabled={busy || !note.trim()} onClick={async () => { if (await act({ action: "note", id: c.id, text: note }, "Nota salvata.")) setNote(""); }}>Salva la nota</button>
      </section>
    </aside>
  );
}
