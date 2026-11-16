"use client";

// Radar salary (16/11/2026) — il Radar creator verticale sulle salary. Richiesta di Nicholas:
// «qualcosa di simile al radar ma per i profili social delle salary che abbiamo noi, più cercare
// e aggiungere gli altri profili che troviamo».
// Tre viste: Le nostre (rete di account per modella, dal magazzino ogni giorno), Le altre (salary
// di altre agenzie aggiunte a mano, lette da Instagram ogni settimana), Cerca (ricerche Apify).
// Una scheda per MODELLA, gli account dentro. Logica in src/lib/salary-radar(-core).js.

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { CP } from "@/lib/brand";
import { PageHead, Notice, Tabs, EmptyState, Disclosure } from "@/components/ds";
import { BigNum, fmtN, fmtFull, fmtDate, btn, btnPrimary } from "@/components/scouting/radar-ui";
import { ModelCard, ModelSheet, AddDialog } from "@/components/salary-radar/parts";
import SearchView from "@/components/salary-radar/SearchView";

const errText = (s) => (s === 401 || s === 403 ? "Sessione scaduta o permessi insufficienti." : s >= 500 ? "Errore del server, riprova." : "Errore.");
const fetcher = (url) => fetch(url).then((r) => (r.ok ? r.json() : r.json().catch(() => ({})).then((d) => Promise.reject(new Error(d.error || errText(r.status))))));
const VIEWS = ["nostre", "altre", "cerca"];

const CSS = `
.sr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px}
.sr-card{transition:transform .18s ease, box-shadow .18s ease}
@media (hover:hover){.sr-card:hover{transform:translateY(-2px);box-shadow:0 12px 28px -18px rgba(0,0,0,.35)}}
@media (prefers-reduced-motion:reduce){.sr-card{transition:none}.sr-card:hover{transform:none}}
.sr-nums{display:flex;flex-wrap:wrap;gap:20px 48px;margin:4px 0 28px}
@media (max-width:699px){
  .sr-page{padding:16px 16px 64px !important}
  .sr-grid{grid-template-columns:1fr}
  .sr-nums{gap:16px 28px}
  .sr-nums span:first-child{font-size:34px !important}
}`;

function Totals({ models, day }) {
  const wh = models.filter((m) => m.source === "magazzino");
  const sum = (f) => wh.reduce((s, m) => s + (m[f] || 0), 0);
  const prev = sum("viewsPrev"), now = sum("views7");
  const p = prev > 0 ? Math.round(((now - prev) / prev) * 100) : null;
  return (
    <div className="sr-nums">
      <BigNum value={fmtN(now)} label={`view in 7 giorni${p != null ? ` (${p > 0 ? "+" : ""}${p}% sulla settimana prima)` : ""}`} gold />
      <BigNum value={fmtFull(wh.reduce((s, m) => s + (m.counts?.attivo || 0) + (m.counts?.fermo || 0), 0))} label="account vivi" />
      <BigNum value={fmtN(sum("fol"))} label="follower in tutto" />
      <BigNum value={fmtFull(sum("reels7"))} label={`reel in 7 giorni${day ? ` · dati al ${fmtDate(Date.parse(day))}` : ""}`} />
    </div>
  );
}

function TalentPicker({ talents, onSave, busy }) {
  const { data } = useSWR("/api/admin/salary-radar?modelle=1", fetcher, { revalidateOnFocus: false });
  const [sel, setSel] = useState(null);
  const cur = sel || talents;
  const list = data?.talentList || [];
  const toggle = (t) => setSel((s) => { const base = s || talents; return base.includes(t) ? base.filter((x) => x !== t) : [...base, t]; });
  if (!data) return <p style={{ color: CP.textMuted, fontSize: 13.5 }}>Carico le modelle del magazzino…</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13.5, color: CP.textSecondary }}>Le modelle che il magazzino segue su Instagram (HOC e Vibes Ventures), con quanti account. Spunta quelle che sono salary.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 6 }}>
        {list.map((t) => (
          <label key={t.t} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: CP.textPrimary }}>
            <input type="checkbox" checked={cur.includes(t.t)} onChange={() => toggle(t.t)} />
            {t.t} <span style={{ color: CP.textMuted, fontSize: 12.5 }}>{t.n} account · {fmtN(t.fol)}</span>
          </label>
        ))}
      </div>
      <div><button type="button" disabled={busy || !sel} style={{ ...btnPrimary, opacity: sel ? 1 : 0.6 }} onClick={async () => { if (await onSave(cur)) setSel(null); }}>Salva la scelta</button></div>
    </div>
  );
}

export default function SalaryRadarPage() {
  const { data, error, mutate, isLoading } = useSWR("/api/admin/salary-radar", fetcher, { revalidateOnFocus: false });
  const { user } = useUser();
  const me = user?.fullName || user?.primaryEmailAddress?.emailAddress || "";
  const [view, setView] = useState("nostre");
  const [selId, setSelId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [add, setAdd] = useState(null); // null | {} | { modelId, modelName } | { handles }
  const [openSettings, setOpenSettings] = useState(false);

  // vista e scheda nell'indirizzo (?vista=…&m=id): link condivisibili e tasto indietro
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      setView(VIEWS.includes(p.get("vista")) ? p.get("vista") : "nostre");
      setSelId(p.get("m") || null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const go = useCallback((v, id) => {
    const p = new URLSearchParams();
    if (v && v !== "nostre") p.set("vista", v);
    if (id) p.set("m", id);
    const q = p.toString();
    window.history.pushState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
    setView(v || "nostre");
    setSelId(id || null);
    window.scrollTo({ top: 0 });
  }, []);

  const ours = useMemo(() => data?.ours || [], [data]);
  const altre = useMemo(() => data?.altre || [], [data]);
  const all = useMemo(() => [...ours, ...altre], [ours, altre]);
  const sel = selId ? all.find((m) => m.id === selId) : null;

  async function act(body, okMsg, returnData) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/salary-radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, by: me }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || errText(r.status));
      await mutate();
      if (okMsg) setMsg(okMsg);
      return returnData ? d : true;
    } catch (e) {
      setMsg(e.message);
      return false;
    } finally { setBusy(false); }
  }

  const ref = data?.refresh || {};
  const nAltre = altre.reduce((s, m) => s + m.counts.total, 0);

  return (
    <div className="sr-page" style={{ maxWidth: 1600, margin: "0 auto", padding: "24px 20px 72px" }}>
      <style>{CSS}</style>
      <PageHead
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Marketing" }]}
        title="Radar salary"
        line2={sel || !data ? null : view === "nostre" ? `${ours.length} salary nostre, una scheda per modella.` : view === "altre" ? `${altre.length} modelle di altre agenzie, ${nAltre} account.` : "Trova le reti delle altre."}
        subtitle={sel ? null : "I profili Instagram delle salary: le nostre ogni giorno dal magazzino, quelle delle altre agenzie che troviamo ogni settimana."}
        actions={<button type="button" style={btnPrimary} onClick={() => setAdd({})}>Aggiungi profili</button>}
      />

      {!sel && (
        <Tabs items={[["nostre", "Le nostre", ours.length || ""], ["altre", "Le altre", altre.length || ""], ["cerca", "Cerca"]]} value={view} onChange={(v) => go(v)} style={{ marginBottom: 28 }} />
      )}

      {msg && <div className="hoc-dock" style={{ position: "fixed", left: "50%", bottom: "calc(24px + env(safe-area-inset-bottom))", transform: "translateX(-50%)", zIndex: 900, maxWidth: "calc(100% - 32px)" }}><Notice>{msg} <button onClick={() => setMsg(null)} style={{ ...btn, minHeight: 0, padding: "2px 10px", marginLeft: 8 }}>Ok</button></Notice></div>}
      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && <p style={{ color: CP.textMuted }}>Caricamento…</p>}
      {data?.whError && <Notice danger>Il magazzino non ha risposto ({data.whError}): le nostre ricompaiono al prossimo caricamento.</Notice>}

      {data && (sel ? (
        <ModelSheet key={sel.id} m={sel} models={all} act={act} busy={busy} onBack={() => (window.history.length > 1 ? window.history.back() : go(view))} onAdd={(m) => setAdd({ modelId: m.id, modelName: m.name })} />
      ) : view === "cerca" ? (
        <SearchView me={me} spend={data.spend} onAdd={(handles) => setAdd({ handles })} />
      ) : view === "altre" ? (
        altre.length ? (
          <>
            <div className="sr-nums">
              <BigNum value={fmtFull(altre.length)} label="modelle di altre agenzie" gold />
              <BigNum value={fmtFull(nAltre)} label="account seguiti" />
              <BigNum value={fmtN(altre.reduce((s, m) => s + (m.fol || 0), 0))} label="follower in tutto" />
              <BigNum value={ref.lastCompletedAt ? fmtDate(ref.lastCompletedAt) : "—"} label={ref.runId ? "lettura in corso" : "ultima lettura settimanale"} />
            </div>
            <div className="sr-grid">{altre.map((m) => <ModelCard key={m.id} m={m} onOpen={(x) => go(view, x.id)} />)}</div>
          </>
        ) : (
          <EmptyState title="Nessuna salary di altre agenzie, ancora" action={<span style={{ display: "inline-flex", gap: 8 }}><button type="button" style={btnPrimary} onClick={() => setAdd({})}>Aggiungi profili</button><button type="button" style={btn} onClick={() => go("cerca")}>Cerca su Instagram</button></span>}>
            Quando trovate il profilo di una salary di un&apos;altra agenzia, incollate il link: si crea la sua scheda e i numeri si leggono ogni settimana. Con «Cerca» si trovano anche i suoi altri account.
          </EmptyState>
        )
      ) : (
        <>
          <Totals models={ours} day={data.day} />
          {ours.length ? (
            <div className="sr-grid">{ours.map((m) => <ModelCard key={m.id} m={m} onOpen={(x) => go(view, x.id)} />)}</div>
          ) : (
            <EmptyState title="Nessuna salary scelta">Un admin sceglie qui sotto quali modelle del magazzino sono salary.</EmptyState>
          )}
          {data.canAdmin && (
            <div style={{ marginTop: 32 }}>
              <Disclosure open={openSettings} onToggle={() => setOpenSettings((v) => !v)} title="Quali salary legge il magazzino" summary={data.talents.join(", ")}>
                {openSettings && <TalentPicker talents={data.talents} busy={busy} onSave={(t) => act({ action: "talents", talents: t }, "Scelta salvata.")} />}
              </Disclosure>
            </div>
          )}
        </>
      ))}

      <AddDialog open={Boolean(add)} onClose={() => setAdd(null)} models={all} preset={add && (add.modelId || add.handles) ? add : null} act={act} busy={busy} />
    </div>
  );
}
