"use client";

// Benvenuto a pagamento (31/10/2026) — quanto sblocca il messaggio di benvenuto di ogni pagina, prima e
// dopo ogni cambio di prezzo. Il prezzo si legge dalle chat; quando il benvenuto parte da un altro
// strumento (o le chat non lo vedono) lo si inserisce a mano con la data da cui vale.
// Numeri: vista `welcome` di /api/admin/analisi-vendite. Prezzi a mano: /api/admin/benvenuto.
// Definizioni in lib/welcome-tracking-core.js.

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Metric, DataTable, Notice, SectionTitle, EmptyState, FilterBar, Spiega, BTN, BTN_PRIMARY, BTN_PRIMARY_OFF } from "@/components/ds";
import { Modal } from "@/components/cp-style";
import PeriodPicker from "@/components/PeriodPicker";
import { confirmDialog, alertDialog } from "@/components/AppDialogs";
import { fmtInt, fmtPct } from "@/lib/format";

const API = "/api/admin/benvenuto";
const DAY = 86400e3;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const yesterday = () => iso(Date.now() - DAY);
const money = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : `$${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" })}`);
const shortDay = (s) => (s ? new Date(`${s}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" }) : "—");
const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
  if (!r.ok) throw new Error(d.error || "Operazione non riuscita");
  return d;
}

const input = { background: CP.bgSunken, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: FONTS.body, width: "100%", boxSizing: "border-box" };
const label = { display: "block", fontSize: 12, color: CP.textSecondary, margin: "12px 0 4px" };
const muted = { fontSize: 12, color: CP.textMuted };
const linkBtn = { background: "transparent", border: "none", padding: 4, cursor: "pointer", color: CP.textSecondary, display: "inline-flex" };

function RuleForm({ creators, initial, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ creator_id: "", price: "", from: yesterday(), to: "", tool: "", note: "", ...initial }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const ready = f.creator_id && f.price && f.from;
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await post({ action: "save", ...f, creator_id: Number(f.creator_id), to: f.to || null });
      onSaved();
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save}>
      <p style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5, margin: "0 0 4px" }}>
        Da questo giorno HOC Pro conta, tra i nuovi iscritti della pagina, chi compra un messaggio a questo prezzo entro 72 ore. Vale sopra il prezzo letto dalle chat.
      </p>
      <label style={label} htmlFor="b-creator">Pagina</label>
      <select id="b-creator" value={f.creator_id} onChange={set("creator_id")} style={input} disabled={Boolean(initial?.id)}>
        <option value="">Scegli…</option>
        {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <label style={label} htmlFor="b-price">Prezzo del benvenuto ($)</label>
      <input id="b-price" inputMode="decimal" placeholder="es. 6,19" value={f.price} onChange={set("price")} style={input} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={label} htmlFor="b-from">Vale dal</label>
          <input id="b-from" type="date" value={f.from} onChange={set("from")} style={input} />
        </div>
        <div>
          <label style={label} htmlFor="b-to">Fino al</label>
          <input id="b-to" type="date" value={f.to || ""} onChange={set("to")} style={input} />
        </div>
      </div>
      <div style={{ ...muted, marginTop: 4 }}>Lascia vuoto «Fino al» se il prezzo è ancora in uso: lo chiude il prossimo prezzo inserito.</div>
      <label style={label} htmlFor="b-tool">Da dove parte il benvenuto</label>
      <input id="b-tool" placeholder="es. Infloww, OnlyMonster, OnlyFans" value={f.tool} onChange={set("tool")} style={input} maxLength={60} />
      <label style={label} htmlFor="b-note">Nota</label>
      <input id="b-note" placeholder="facoltativa" value={f.note} onChange={set("note")} style={input} maxLength={240} />
      {err && <div style={{ fontSize: 13, color: CP.accentRed, marginTop: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button type="button" onClick={onClose} style={BTN}>Annulla</button>
        <button type="submit" disabled={!ready || busy} style={BTN_PRIMARY_OFF(!ready || busy)}>{busy ? "Salvo…" : "Salva"}</button>
      </div>
    </form>
  );
}

export default function BenvenutoPage() {
  const [range, setRange] = useState(() => ({ from: iso(Date.now() - 30 * DAY), to: yesterday() }));
  const [form, setForm] = useState(null); // null | {} (nuovo) | regola da modificare
  const data = useSWR(`/api/admin/analisi-vendite?view=welcome&from=${range.from}&to=${range.to}`, fetcher, { revalidateOnFocus: false });
  const rules = useSWR(API, fetcher, { revalidateOnFocus: false });
  const d = data.data;
  const creators = rules.data?.creators || d?.creators || [];
  const multi = useMemo(() => {
    const n = new Map();
    for (const r of d?.rows || []) n.set(r.creator_id, (n.get(r.creator_id) || 0) + 1);
    return n;
  }, [d]);

  const refresh = () => { rules.mutate(); data.mutate(); };
  const remove = async (r) => {
    if (!(await confirmDialog(`Togliere il prezzo ${money(r.price)} di ${r.name} (dal ${shortDay(r.from)})? Da quel giorno torna a valere il prezzo letto dalle chat.`, { ok: "Togli", danger: true }))) return;
    try { await post({ action: "delete", id: r.id }); refresh(); } catch (e) { rules.mutate(); alertDialog(e.message); }
  };

  const columns = [
    { key: "name", label: "Pagina", render: (r) => <span>{r.name}{r.current && multi.get(r.creator_id) > 1 && d.rows.some((x) => x.creator_id === r.creator_id && !x.current) ? <span style={{ ...muted, marginLeft: 6 }}>in uso</span> : null}</span> },
    { key: "amount", label: "Prezzo", align: "right", render: (r) => money(r.amount) },
    { key: "from", label: "Periodo", render: (r) => <span style={{ whiteSpace: "nowrap" }}>{shortDay(r.from)} – {shortDay(r.to)}</span> },
    { key: "origin", label: "Prezzo da", muted: true, render: (r) => (r.origin === "manual" ? `inserito a mano${r.tool ? ` · ${r.tool}` : ""}` : "chat") },
    { key: "subs", label: "Nuovi iscritti", align: "right", render: (r) => fmtInt(r.subs) },
    { key: "unlocks", label: "Sbloccano", align: "right", render: (r) => fmtInt(r.unlocks) },
    { key: "cr", label: "% sblocco", align: "right", render: (r) => <span title={r.maturing ? "Gli iscritti degli ultimi 3 giorni hanno ancora tempo per sbloccare" : undefined}>{fmtPct(r.cr, 1)}{r.maturing ? "*" : ""}</span> },
    { key: "revenue", label: "Incasso", align: "right", render: (r) => money(r.revenue) },
  ];
  const ruleColumns = [
    { key: "name", label: "Pagina" },
    { key: "price", label: "Prezzo", align: "right", render: (r) => money(r.price) },
    { key: "from", label: "Dal", render: (r) => shortDay(r.from) },
    { key: "to", label: "Al", render: (r) => (r.to ? shortDay(r.to) : "in uso") },
    { key: "tool", label: "Da dove parte", muted: true, render: (r) => r.tool || "—" },
    { key: "note", label: "Nota", muted: true, render: (r) => r.note || "—" },
    { key: "by", label: "Inserito da", muted: true, render: (r) => r.updated_by_name || r.created_by_name || "—" },
    { key: "act", label: "", sortable: false, align: "right", render: (r) => (
      <span style={{ display: "inline-flex", gap: 2 }}>
        <button type="button" aria-label="Modifica" title="Modifica" style={linkBtn} onClick={() => setForm({ ...r, to: r.to || "" })}><Pencil size={15} /></button>
        <button type="button" aria-label="Togli" title="Togli" style={linkBtn} onClick={() => remove(r)}><Trash2 size={15} /></button>
      </span>
    ) },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 20, maxWidth: 1400, margin: "0 auto", padding: "8px 0 40px" }}>
      <PageHead crumbs={[{ label: "Performance" }, { label: "Analisi vendite", href: "/admin/analisi-vendite" }]} title="Benvenuto a pagamento"
        subtitle="Quanto sblocca il benvenuto di ogni pagina, prima e dopo ogni cambio di prezzo."
        actions={<button type="button" style={BTN_PRIMARY} onClick={() => setForm({})}><Plus size={15} />Inserisci un prezzo</button>} />

      <FilterBar style={{ margin: 0 }}>
        <PeriodPicker value={range} onChange={setRange} max={yesterday()} compare={false} loading={data.isValidating && Boolean(d)} />
      </FilterBar>

      {data.error && <Notice danger>{data.error.message}</Notice>}
      {!d && !data.error && <div style={muted}>Calcolo in corso…</div>}

      {d && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            <Metric label="Nuovi iscritti con benvenuto" value={fmtInt(d.total.subs)} />
            <Metric label="Sbloccano" value={fmtInt(d.total.unlocks)} />
            <Metric label="% sblocco" value={fmtPct(d.total.cr, 1)} />
            <Metric label="Incasso" value={money(d.total.revenue)} />
          </div>

          <section>
            <SectionTitle aside={d.rows.some((r) => r.maturing) ? "* iscritti degli ultimi 3 giorni: possono ancora sbloccare" : null}>Pagine e prezzi</SectionTitle>
            {d.rows.length ? (
              <DataTable columns={columns} rows={d.rows} minWidth={720} />
            ) : (
              <EmptyState title="Nessun benvenuto a pagamento nel periodo"
                action={<button type="button" style={BTN} onClick={() => setForm({})}><Plus size={15} />Inserisci un prezzo</button>}>
                Le chat delle tue pagine non mostrano un messaggio a pagamento ai nuovi iscritti. Se il benvenuto parte da un altro strumento, inserisci il prezzo e la data da cui vale.
              </EmptyState>
            )}
          </section>

          {d.unpaid.length > 0 && (
            <section>
              <SectionTitle aside="nessun messaggio a pagamento nelle prime 2 ore">Senza benvenuto a pagamento</SectionTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {d.unpaid.map((u) => (
                  <button key={u.creator_id} type="button" style={{ ...BTN, minHeight: 32, padding: "5px 10px", fontSize: 13 }}
                    title="Inserisci il prezzo del benvenuto di questa pagina" onClick={() => setForm({ creator_id: String(u.creator_id) })}>
                    {u.name}<span style={muted}>{fmtInt(u.subs)} iscritti</span><Plus size={13} />
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section>
        <SectionTitle aside="valgono sopra il prezzo letto dalle chat">Prezzi inseriti a mano</SectionTitle>
        {rules.error && <Notice danger>{rules.error.message}</Notice>}
        {rules.data && (rules.data.rules.length ? (
          <DataTable columns={ruleColumns} rows={rules.data.rules} minWidth={820} />
        ) : (
          <div style={{ fontSize: 13, color: CP.textSecondary }}>Nessuno: tutti i prezzi arrivano dalle chat.</div>
        ))}
      </section>

      <Spiega label="Come si calcola">
        <div><b>Prezzo del benvenuto.</b> Per ogni nuovo iscritto è il primo messaggio a pagamento che la pagina gli manda entro 2 ore dall'iscrizione. Se il prezzo cambia, la pagina compare su due righe: prima e dopo. Un prezzo visto su pochissimi iscritti (meno di 10, o meno del 3%) di solito è un PPV mandato a mano subito dopo l'iscrizione, non il benvenuto: non entra nelle righe.</div>
        <div><b>Prezzo inserito a mano.</b> Serve quando il benvenuto parte da un altro strumento o le chat non lo mostrano. Dal giorno indicato vale per tutti i nuovi iscritti della pagina, sopra quello letto dalle chat. Un prezzo nuovo chiude il precedente il giorno prima. Si vede subito per tutti quelli che seguono la pagina.</div>
        <div><b>Sblocco.</b> Il nuovo iscritto compra un messaggio esattamente a quel prezzo entro 72 ore dall'iscrizione. È un abbinamento dedotto: un PPV a mano allo stesso prezzo nelle prime 72 ore conta come sblocco. Verificato su Giulia Ottorini IT a ottobre: 129 acquisti contro 130 benvenuti risultati aperti in chat. Il benvenuto venduto fuori da OnlyFans non si vede.</div>
        <div><b>Periodo.</b> Giorni in ora italiana, fino a ieri: le chat arrivano nel warehouse una volta al giorno. Incasso = prezzo × sblocchi, lordo. Da ottobre 2026 non si usa più la tabella del warehouse con i prezzi scritti a mano nel foglio dell'altra parte, che non veniva aggiornata.</div>
      </Spiega>

      <Modal open={form != null} onClose={() => setForm(null)} title={form?.id ? "Modifica il prezzo" : "Inserisci il prezzo del benvenuto"}>
        {form != null && <RuleForm creators={creators} initial={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
      </Modal>
    </div>
  );
}
