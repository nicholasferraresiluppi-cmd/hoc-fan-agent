"use client";

/**
 * /admin/rete-amici — quanti iscritti porta la sezione «Amici» dei profili OnlyFans (20/10/2026).
 * Calcolo in lib/rete-amici (warehouse, storico iscrizioni fan per fan). Chi mostra chi lo si segna
 * qui, con la data: il prima/dopo è l'unica prova che separa la scheda Amici dalle altre spinte.
 */
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2, RefreshCw, Plus, X } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { Modal } from "@/components/cp-style";
import { PageHead, Notice } from "@/components/ds";

const fetcher = async (url) => {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
};
const post = async (body) => {
  const r = await fetch("/api/admin/rete-amici", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
};
const usd = (n) => (n === null || n === undefined ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n));
const pct = (f) => (f === null || f === undefined ? "—" : `${Math.round(f * 100)}%`);
const int = (n) => new Intl.NumberFormat("it-IT", { useGrouping: "always" }).format(Math.round(n || 0));
const one = (n) => (n === null || n === undefined ? "—" : new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(n));
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const muted = { fontSize: 12, color: CP.textMuted };
const btn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body, border: `1px solid ${CP.border}`, background: CP.surface, color: CP.textPrimary };
const input = { padding: "8px 10px", borderRadius: 8, border: `1px solid ${CP.border}`, background: CP.bg, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, width: "100%", boxSizing: "border-box" };

const KIND = {
  friends: { label: "Dagli amici", color: CP.accent },
  link: { label: "Da tracking link", color: CP.textSecondary },
  other_hoc: { label: "Iscritti ad altre pagine HOC", color: CP.textMuted },
  direct: { label: "Da fuori HOC", color: CP.borderStrong },
};
const ORDER = ["friends", "link", "other_hoc", "direct"];

/** Righe di lettura: regole fisse che citano il numero. */
function readings(t) {
  const out = [];
  const f = t.byKind.friends;
  if (t.total === 0) return ["Nessun nuovo iscritto nelle ultime 13 settimane."];
  out.push(`Nelle ultime 13 settimane ${int(f.fans)} nuovi iscritti su ${int(t.total)} (${pct(t.share)}) erano già iscritti a una pagina che la mostra tra gli amici e non sono passati da un link.${t.share4 !== null ? ` Nelle ultime 4 settimane: ${pct(t.share4)}.` : ""}`);
  const top = t.hosts[0];
  if (top && top.fans > 0 && t.hosts.length > 1) out.push(`La pagina che ne porta di più è ${top.name}: ${int(top.fans)}.`);
  if (f.avgNet30 !== null && t.byKind.link.avgNet30 !== null) {
    out.push(`Nei primi 30 giorni chi arriva dagli amici spende in media ${usd(f.avgNet30)} su questa pagina, chi arriva da un tracking link ${usd(t.byKind.link.avgNet30)}.`);
  }
  return out;
}

/** Barre settimanali impilate per tipo di provenienza. */
function WeeklyBars({ weekly, marks }) {
  const max = Math.max(1, ...weekly.map((w) => ORDER.reduce((s, k) => s + w[k], 0)));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${weekly.length}, 1fr)`, gap: 4, alignItems: "end", height: 120 }}>
        {weekly.map((w, i) => {
          const tot = ORDER.reduce((s, k) => s + w[k], 0);
          const mark = marks.find((m) => m.week === w.week);
          return (
            <div key={w.week} title={`Settimana del ${dmy(w.week)}: ${ORDER.map((k) => `${KIND[k].label.toLowerCase()} ${w[k]}`).join(", ")}`} style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", position: "relative", borderLeft: mark ? `2px dashed ${mark.until ? CP.accentRed : CP.accentGreen}` : "none", opacity: i === weekly.length - 1 ? 0.55 : 1 }}>
              {[...ORDER].reverse().map((k) => w[k] > 0 && <div key={k} style={{ height: `${(w[k] / max) * 100}%`, background: KIND[k].color, borderRadius: 2, minHeight: 1 }} />)}
              {tot === 0 && <div style={{ height: 1, background: CP.borderSoft }} />}
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${weekly.length}, 1fr)`, gap: 4, marginTop: 4 }}>
        {weekly.map((w, i) => <span key={w.week} style={{ ...muted, fontSize: 10, textAlign: "center" }}>{i % 2 === 0 ? dmy(w.week) : ""}</span>)}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
        {ORDER.map((k) => <span key={k} style={{ ...muted, display: "inline-flex", gap: 5, alignItems: "center" }}><span style={{ width: 9, height: 9, borderRadius: 2, background: KIND[k].color }} />{KIND[k].label}</span>)}
      </div>
      <div style={{ ...muted, marginTop: 4 }}>Settimane da lunedì; l'ultima è in corso (più chiara). {marks.length > 0 && "Linea verde = amico aggiunto, rossa = tolto."}</div>
    </div>
  );
}

function BeforeAfterText({ h }) {
  const ba = h.link?.until ? h.removedEffect : h.beforeAfter;
  if (!h.link?.since && !h.link?.until) return <span style={muted}>data di aggiunta non nota: il prima/dopo parte dal prossimo cambio</span>;
  if (!ba || ba.after === null) return <span style={muted}>servono almeno 2 settimane intere prima e dopo il {dmy(h.link.until || h.link.since)}</span>;
  return <span>{one(ba.before)} → {one(ba.after)} a settimana <span style={muted}>({ba.weeksBefore} sett. prima, {ba.weeksAfter} dopo)</span></span>;
}

function LinkActions({ h, onDone }) {
  const [mode, setMode] = useState(null);
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  if (!h.link) return null;
  const go = async (body) => { setBusy(true); try { await post(body); setMode(null); onDone(); } catch (e) { alert(e.message); } finally { setBusy(false); } };
  if (mode) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <input type="date" value={day} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDay(e.target.value)} style={{ ...input, width: 140, padding: "4px 6px" }} />
        <button style={{ ...btn, padding: "4px 10px" }} disabled={busy} onClick={() => go(mode === "close" ? { action: "close", id: h.link.id, until: day } : { action: "since", id: h.link.id, since: day })}>{busy ? <Loader2 size={12} /> : "Salva"}</button>
        <button style={{ ...btn, padding: "4px 8px" }} onClick={() => setMode(null)}><X size={12} /></button>
      </span>
    );
  }
  if (h.link.until) return <span style={muted}>tolto il {dmy(h.link.until)}</span>;
  return (
    <span style={{ display: "inline-flex", gap: 10 }}>
      {!h.link.since && <button onClick={() => setMode("since")} style={{ ...muted, background: "none", border: 0, cursor: "pointer", textDecoration: "underline", padding: 0 }}>metti la data</button>}
      <button onClick={() => setMode("close")} style={{ ...muted, background: "none", border: 0, cursor: "pointer", textDecoration: "underline", padding: 0 }}>è stato tolto</button>
    </span>
  );
}

function Detail({ t, onChanged, canEdit }) {
  const marks = t.hosts.flatMap((h) => [h.link?.since && { week: weekOf(h.link.since) }, h.link?.until && { week: weekOf(h.link.until), until: true }]).filter(Boolean);
  const ripe = ORDER.filter((k) => t.byKind[k].fans > 0);
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gap: 6, fontSize: 14, lineHeight: 1.55 }}>{readings(t).map((r, i) => <div key={i}>{r}</div>)}</div>
      <WeeklyBars weekly={t.weekly} marks={marks} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Pagine che la mostrano tra gli amici</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums", minWidth: 560 }}>
            <thead><tr style={{ ...muted, textAlign: "right" }}>
              <th style={{ textAlign: "left", fontWeight: 400, padding: "4px 0" }}>Pagina</th>
              <th style={{ fontWeight: 400 }}>13 sett.</th><th style={{ fontWeight: 400 }}>Ultime 4</th>
              <th style={{ fontWeight: 400 }}>Spesa media 30 gg</th>
              <th style={{ textAlign: "left", fontWeight: 400, paddingLeft: 14 }}>Prima → dopo</th>
            </tr></thead>
            <tbody>
              {t.hosts.map((h) => (
                <tr key={h.host_id} style={{ borderTop: `1px solid ${CP.borderSoft}`, opacity: h.link?.until ? 0.7 : 1 }}>
                  <td style={{ padding: "7px 0" }}>
                    <div>{h.name}</div>
                    <div style={{ ...muted, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span>{h.link ? (h.link.since ? `aggiunto il ${dmy(h.link.since)}` : `c'era già il ${dmy((h.link.at || "").slice(0, 10))}`) : "non segnato"}</span>
                      {canEdit && <LinkActions h={h} onDone={onChanged} />}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>{int(h.fans)}</td>
                  <td style={{ textAlign: "right" }}>{int(h.last4)}</td>
                  <td style={{ textAlign: "right" }}>{h.value.avgNet30 === null ? <span style={muted}>pochi dati</span> : usd(h.value.avgNet30)}</td>
                  <td style={{ paddingLeft: 14 }}><BeforeAfterText h={h} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ ...muted, marginTop: 6 }}>Un fan iscritto a due pagine che la mostrano conta per entrambe: le righe possono sommare più del totale.</div>
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Da dove arrivano tutti i nuovi iscritti (13 settimane)</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
          <thead><tr style={{ ...muted, textAlign: "right" }}><th style={{ textAlign: "left", fontWeight: 400, padding: "4px 0" }}>Provenienza</th><th style={{ fontWeight: 400 }}>Iscritti</th><th style={{ fontWeight: 400 }}>Quota</th><th style={{ fontWeight: 400 }}>Spesa media 30 gg</th><th style={{ fontWeight: 400 }}>Chi compra</th></tr></thead>
          <tbody>
            {ripe.map((k) => {
              const b = t.byKind[k];
              return (
                <tr key={k} style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
                  <td style={{ padding: "7px 0" }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: KIND[k].color, marginRight: 7 }} />{KIND[k].label}</td>
                  <td style={{ textAlign: "right" }}>{int(b.fans)}</td>
                  <td style={{ textAlign: "right" }}>{pct(t.total ? b.fans / t.total : null)}</td>
                  <td style={{ textAlign: "right" }}>{b.avgNet30 === null ? <span style={muted}>pochi dati</span> : usd(b.avgNet30)}</td>
                  <td style={{ textAlign: "right" }}>{pct(b.payRate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ ...muted, marginTop: 6, lineHeight: 1.5 }}>
          Spesa = netto speso su questa pagina nei 30 giorni dopo l'iscrizione, solo per chi si è iscritto da almeno 30 giorni (sotto i 20 fan non si fa la media).
        </div>
      </div>
    </div>
  );
}

function weekOf(day) {
  const d = new Date(`${day}T00:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10);
}

/** Ricerca di una pagina per nome (anagrafica del warehouse). */
function PagePicker({ label, value, onPick }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const h = setTimeout(async () => {
      setBusy(true);
      try { setRes((await fetcher(`/api/admin/rete-amici?q=${encodeURIComponent(q)}`)).results); } catch { setRes([]); } finally { setBusy(false); }
    }, 350);
    return () => clearTimeout(h);
  }, [q]);
  if (value) {
    return (
      <div>
        <div style={{ ...muted, marginBottom: 4 }}>{label}</div>
        <div style={{ ...input, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{value.name}{value.country && value.country !== "IT" ? ` ${value.country}` : ""} {value.username && <span style={muted}>@{value.username}</span>}</span>
          <button onClick={() => onPick(null)} style={{ background: "none", border: 0, cursor: "pointer", color: CP.textMuted }}><X size={14} /></button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ ...muted, marginBottom: 4 }}>{label}</div>
      <input style={input} placeholder="Cerca per nome o username" value={q} onChange={(e) => setQ(e.target.value)} />
      {busy && <div style={{ ...muted, marginTop: 4 }}><Loader2 size={11} /> cerco…</div>}
      {res && !busy && (
        <div style={{ border: `1px solid ${CP.border}`, borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: "auto", background: CP.panel || CP.surface }}>
          {res.length === 0 && <div style={{ ...muted, padding: 8 }}>Nessuna pagina trovata</div>}
          {res.map((p) => (
            <button key={p.id} onClick={() => { onPick(p); setQ(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", background: "none", border: 0, borderTop: `1px solid ${CP.borderSoft}`, cursor: "pointer", color: CP.textPrimary, fontFamily: FONTS.body, fontSize: 13 }}>
              {p.name}{p.country && p.country !== "IT" ? ` ${p.country}` : ""} {p.username && <span style={muted}>@{p.username}</span>} <span style={muted}>· id {p.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AddLink({ onDone }) {
  const [host, setHost] = useState(null);
  const [target, setTarget] = useState(null);
  const [known, setKnown] = useState("today");
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await post({ action: "add", host_id: host.id, target_id: target.id, since: known === "unknown" ? null : known === "today" ? new Date().toISOString().slice(0, 10) : day });
      onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <PagePicker label="La pagina che mostra l'amico (dove compare la scheda)" value={host} onPick={setHost} />
      <PagePicker label="L'amico mostrato (la pagina che riceve gli iscritti)" value={target} onPick={setTarget} />
      <div>
        <div style={{ ...muted, marginBottom: 4 }}>Da quando c'è</div>
        <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
          <label><input type="radio" checked={known === "today"} onChange={() => setKnown("today")} /> L'ho aggiunto oggi</label>
          <label><input type="radio" checked={known === "day"} onChange={() => setKnown("day")} /> In un giorno preciso {known === "day" && <input type="date" value={day} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDay(e.target.value)} style={{ ...input, width: 150, padding: "3px 6px", marginLeft: 6 }} />}</label>
          <label><input type="radio" checked={known === "unknown"} onChange={() => setKnown("unknown")} /> C'era già, non so da quando</label>
        </div>
        <div style={{ ...muted, marginTop: 6 }}>La data serve al prima/dopo: è l'unico modo per vedere quanto conta davvero la scheda Amici.</div>
      </div>
      {err && <Notice danger>{err}</Notice>}
      <button style={{ ...btn, justifyContent: "center", background: CP.accent, color: CP.accentInk, border: 0 }} disabled={!host || !target || busy} onClick={save}>{busy ? <Loader2 size={14} /> : <Plus size={14} />}Aggiungi</button>
    </div>
  );
}

export default function ReteAmiciPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/rete-amici", fetcher, { revalidateOnFocus: false });
  const { data: me } = useSWR("/api/whoami", fetcher, { revalidateOnFocus: false });
  const canEdit = me?.capabilities?.seed === "all" || me?.admin === true; // le modifiche sono SEED (admin)
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const targets = data?.targets || [];
  const S = useMemo(() => {
    const sum = (f) => targets.reduce((s, t) => s + (f(t) || 0), 0);
    const tot4 = sum((t) => t.total4);
    return { friends4: sum((t) => t.byKind.friends.last4), tot4, friends: sum((t) => t.byKind.friends.fans), total: sum((t) => t.total), links: (data?.links || []).filter((l) => !l.until).length };
  }, [targets, data]);
  const refresh = async () => { setBusy(true); try { await mutate(await fetcher("/api/admin/rete-amici?refresh=1"), { revalidate: false }); } catch (e) { alert(e.message); } finally { setBusy(false); } };
  const changed = async () => { await refresh(); };
  const cur = targets.find((t) => t.target_id === open);

  return (
    <div style={{ padding: "24px 16px 80px", maxWidth: 1280, margin: "0 auto" }}>
      <PageHead
        crumbs={[{ label: "Performance" }, { label: "Rete amici" }]}
        title="Rete amici"
        subtitle="Quanti iscritti arrivano dalla sezione «Amici» dei profili OnlyFans. OnlyFans non lo dice: lo ricaviamo dallo storico iscrizioni, cioè chi si iscrive senza tracking link mentre è già iscritto a una pagina che la mostra. Chi mostra chi si segna qui, con la data."
        actions={<>
          {canEdit && <button style={btn} onClick={() => setAdding(true)}><Plus size={14} />Aggiungi amico</button>}
          <button style={btn} onClick={refresh} disabled={busy}>{busy ? <Loader2 size={14} /> : <RefreshCw size={14} />}Ricalcola</button>
        </>}
      />
      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && <div style={{ color: CP.textMuted, display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={14} />Calcolo dal warehouse (fino a mezzo minuto)…</div>}
      {data && !targets.length && <Notice>Nessun amico segnato. {canEdit ? "Aggiungi la prima coppia: la pagina che mostra e l'amico mostrato." : "Le coppie le segna un admin."}</Notice>}

      {targets.length > 0 && (<>
        <div style={{ background: CP.textPrimary, color: CP.bg, borderRadius: 18, padding: "22px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.65 }}>Iscritti dagli amici · ultime 4 settimane</div>
            <div style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{int(S.friends4)}</div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 4 }}>su {int(S.tot4)} nuovi iscritti delle pagine mostrate ({pct(S.tot4 ? S.friends4 / S.tot4 : null)})</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 18, rowGap: 3, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ opacity: 0.65 }}>Ultime 13 settimane</span><span style={{ textAlign: "right" }}>{int(S.friends)} su {int(S.total)}</span>
            <span style={{ opacity: 0.65 }}>Amici segnati</span><span style={{ textAlign: "right" }}>{int(S.links)}</span>
            <span style={{ opacity: 0.65 }}>Pagine mostrate</span><span style={{ textAlign: "right" }}>{int(targets.length)}</span>
          </div>
        </div>
        <div style={{ ...muted, marginBottom: 14, lineHeight: 1.5 }}>
          «Dagli amici» è il massimo che la scheda può aver portato: comprende anche post, messaggi di massa o S4S senza link della stessa pagina. Per la parte della sola scheda si guarda il prima/dopo quando un amico viene aggiunto o tolto. {data.cached ? "Calcolato oggi." : ""}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {targets.map((t) => (
            <button key={t.target_id} onClick={() => setOpen(t.target_id)} style={{ textAlign: "left", cursor: "pointer", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 14, padding: 16, color: CP.textPrimary, fontFamily: FONTS.body, display: "grid", gap: 6, alignContent: "start" }}>
              <span style={{ fontSize: 13, color: CP.textSecondary }}>{t.name}</span>
              <div style={{ fontSize: 24, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{int(t.byKind.friends.last4)} <span style={{ fontSize: 13, color: CP.textMuted, fontWeight: 400 }}>dagli amici in 4 sett.</span></div>
              <div style={muted}>{pct(t.share4)} dei nuovi iscritti · 13 sett.: {int(t.byKind.friends.fans)} su {int(t.total)}</div>
              <div style={muted}>Mostrata da: {t.hosts.filter((h) => h.link && !h.link.until).map((h) => h.name.split(" · ")[0]).join(", ") || "nessuna (amici tolti)"}</div>
            </button>
          ))}
        </div>
      </>)}

      <Modal open={Boolean(cur)} onClose={() => setOpen(null)} title={cur?.name || ""} maxWidth={820}>
        {cur && <Detail t={cur} onChanged={changed} canEdit={canEdit} />}
      </Modal>
      <Modal open={adding} onClose={() => setAdding(false)} title="Aggiungi amico" maxWidth={520}>
        {adding && <AddLink onDone={async () => { setAdding(false); await refresh(); }} />}
      </Modal>
    </div>
  );
}
