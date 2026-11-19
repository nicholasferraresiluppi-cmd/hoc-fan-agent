"use client";
// Radar salary — Cerca (16/11/2026): ricerche su Instagram lanciate dalla pagina (Apify).
// Per parola (la lente di Instagram) o «chi segue un account» (le reti delle salary si seguono tra
// loro). I risultati restano: si scelgono, si leggono i numeri, si aggiungono a una modella.
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { CP, alpha } from "@/lib/brand";
import { Segmented, Notice, EmptyState, DataTable } from "@/components/ds";
import { SERIF, fmtFull, fmtDate, igProfile, btn, btnPrimary, input } from "@/components/scouting/radar-ui";
import { SEARCH_KINDS, salaryHints } from "@/lib/salary-radar-core";

const fetcher = (url) => fetch(url).then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || "Errore.")))));

export default function SearchView({ me, spend, onAdd }) {
  const { data: listData, mutate: mutateList } = useSWR("/api/admin/salary-radar/search", fetcher, { revalidateOnFocus: false });
  const searches = listData?.searches || [];
  const [kind, setKind] = useState("parola");
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [onlyNew, setOnlyNew] = useState(true);

  useEffect(() => { if (!selId && searches[0]) setSelId(searches[0].id); }, [searches, selId]);
  const { data: selData, mutate: mutateSel } = useSWR(selId ? `/api/admin/salary-radar/search?id=${selId}` : null, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: (d) => (d?.search?.status === "in_corso" ? 4000 : 0),
  });
  const s = selData?.search;
  useEffect(() => { if (s?.status && s.status !== "in_corso") mutateList(); }, [s?.status, mutateList]);
  useEffect(() => { setPicked(new Set()); }, [selId]);

  const rows = useMemo(() => (s?.cands || []).filter((c) => !onlyNew || !c.known).map((c) => ({ ...c, id: c.h, hints: salaryHints(c.bio) })), [s, onlyNew]);
  const toggle = (h) => setPicked((p) => { const n = new Set(p); if (n.has(h)) n.delete(h); else n.add(h); return n; });

  async function post(body) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/admin/salary-radar/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, by: me }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Errore.");
      return d.search;
    } catch (e) { setErr(e.message); return null; } finally { setBusy(false); }
  }

  async function start(e) {
    e.preventDefault();
    const out = await post({ kind, q });
    if (out) { setQ(""); await mutateList(); setSelId(out.id); }
  }

  const columns = [
    { key: "pick", label: "", sortable: false, render: (c) => <input type="checkbox" aria-label={`Scegli @${c.h}`} checked={picked.has(c.h)} disabled={c.known} onChange={() => toggle(c.h)} onClick={(e) => e.stopPropagation()} /> },
    { key: "h", label: "Account", render: (c) => (
      <span style={{ display: "inline-flex", flexDirection: "column", maxWidth: 280 }}>
        <a href={igProfile(c.h)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: CP.textPrimary, textDecoration: "none", fontWeight: 500 }}>@{c.h}</a>
        {c.name && <span style={{ fontSize: 12, color: CP.textMuted }}>{c.name}</span>}
      </span>
    ) },
    { key: "bio", label: "Bio", render: (c) => <span style={{ fontSize: 13, color: CP.textSecondary, display: "inline-block", maxWidth: 360 }}>{c.bio || "—"}</span> },
    { key: "hints", label: "Indizi", align: "right", render: (c) => <span title="Anno o età nella bio, link nelle storie in evidenza, italiana, profilo di riserva" style={{ color: c.hints >= 2 ? CP.accentSoftText : CP.textMuted }}>{c.hints || "—"}</span> },
    { key: "fol", label: "Follower", align: "right", render: (c) => fmtFull(c.fol) },
    { key: "medv", label: "View mediane", align: "right", render: (c) => (c.read ? fmtFull(c.medv) : <span style={{ color: CP.textMuted }}>—</span>) },
    { key: "state", label: "", sortable: false, render: (c) => (c.known ? <span style={{ fontSize: 12.5, color: CP.textMuted }}>già nel radar</span> : c.priv ? <span style={{ fontSize: 12.5, color: CP.textMuted }}>privato</span> : null) },
  ];

  const left = Math.max(0, (spend?.cap || 0) - (spend?.usd || 0));

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <form onSubmit={start} style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20, border: `1px solid ${CP.border}`, borderRadius: 16, background: CP.surface }}>
        <Segmented items={Object.entries(SEARCH_KINDS).map(([k, v]) => [k, v.label])} value={kind} onChange={setKind} />
        <p style={{ margin: 0, fontSize: 13.5, color: CP.textSecondary, maxWidth: 720 }}>{SEARCH_KINDS[kind].hint}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "seguiti" ? "@account da cui partire" : "parole da cercare"} style={{ ...input, flex: "1 1 260px" }} />
          <button type="submit" disabled={busy || q.trim().length < 2} style={{ ...btnPrimary, opacity: busy || q.trim().length < 2 ? 0.6 : 1 }}>{busy ? "Avvio…" : "Cerca"}</button>
        </div>
        <span style={{ fontSize: 12.5, color: CP.textMuted }}>
          {kind === "seguiti" ? "Circa 35 centesimi a ricerca." : "Meno di 10 centesimi a ricerca."} Questo mese il radar ha speso {(spend?.usd || 0).toLocaleString("it-IT", { maximumFractionDigits: 2 })} $ su {spend?.cap} $ ({left.toLocaleString("it-IT", { maximumFractionDigits: 2 })} $ rimasti).
        </span>
      </form>
      {err && <Notice danger>{err}</Notice>}

      {searches.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {searches.map((x) => (
            <button key={x.id} type="button" onClick={() => setSelId(x.id)} aria-pressed={x.id === selId}
              style={{ ...btn, minHeight: 34, padding: "5px 12px", fontSize: 13, borderColor: x.id === selId ? CP.accent : CP.border, background: x.id === selId ? alpha(CP.accent, "14") : "transparent" }}>
              {x.kind === "seguiti" ? `Seguiti da @${x.q}` : `«${x.q}»`}
              <span style={{ color: CP.textMuted }}>{x.status === "in_corso" ? "in corso" : x.status === "errore" ? "errore" : `${x.n}`}</span>
            </button>
          ))}
        </div>
      )}

      {!searches.length && <EmptyState title="Nessuna ricerca ancora">Cerca per parola o parti da un account di un&apos;altra agenzia: i profili trovati si scelgono qui sotto e si aggiungono a una modella.</EmptyState>}

      {s && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, ...SERIF, fontSize: 26, color: CP.textPrimary }}>{s.kind === "seguiti" ? `Chi segue @${s.q}` : `«${s.q}»`}</h2>
            <span style={{ fontSize: 13, color: CP.textMuted }}>{fmtDate(s.at)}{s.by ? ` · ${s.by}` : ""}{s.usd != null ? ` · ${s.usd.toLocaleString("it-IT", { maximumFractionDigits: 2 })} $` : ""}</span>
          </div>
          {s.status === "in_corso" && <Notice>Ricerca in corso su Instagram: di solito bastano uno o due minuti. La pagina si aggiorna da sola.</Notice>}
          {s.status === "errore" && <Notice danger>La ricerca non è andata a buon fine ({s.error}). Riprova con altre parole.</Notice>}
          {s.status === "finita" && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, color: CP.textSecondary }}>
                  <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> Nascondi quelli già nel radar
                </label>
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" disabled={busy || !picked.size} style={{ ...btn, opacity: picked.size ? 1 : 0.6 }}
                    onClick={async () => { const out = await post({ id: s.id, read: [...picked] }); if (out) mutateSel({ search: out }, false); }}>
                    {busy ? "Leggo…" : `Leggi i numeri${picked.size ? ` (${picked.size})` : ""}`}
                  </button>
                  <button type="button" disabled={!picked.size} style={{ ...btnPrimary, opacity: picked.size ? 1 : 0.6 }} onClick={() => onAdd([...picked])}>
                    Aggiungi{picked.size ? ` ${picked.size}` : ""} a una modella
                  </button>
                </span>
              </div>
              <DataTable columns={columns} rows={rows} defaultSort={{ key: "hints", dir: -1 }} minWidth={860} maxHeight="70vh"
                onRowClick={(c) => !c.known && toggle(c.h)} selected={(c) => picked.has(c.h)}
                empty={s.cands?.length ? "Sono tutti già nel radar." : "Nessun profilo trovato."} />
              <p style={{ margin: 0, fontSize: 12.5, color: CP.textMuted }}>«Indizi» conta i segni tipici di un profilo salary nella bio (anno o età, link nelle storie in evidenza, italiana, profilo di riserva): serve solo a mettere in alto quelli da guardare, la scelta resta vostra. «Leggi i numeri» costa circa 1 centesimo ad account.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
