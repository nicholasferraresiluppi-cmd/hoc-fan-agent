"use client";

// Lingua dei gruppi (italiano / inglese).
// Ridisegno 26/09/2026 (design system): si apre sui gruppi SENZA lingua (le
// uniche righe su cui c'è da decidere) e spiega a cosa serve la lingua; niente
// bandierine né sigle tecniche (regex/override) in vista. Salvataggio sempre
// visibile con il numero di modifiche. API, conferme e logica invariate.

import { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { FONTS, CP } from "@/lib/brand";
import { PageHead, Notice, DataTable, FilterChip, card } from "@/components/ds";

const fetcher = (url) => fetch(url).then((r) => r.json());
const URL_API = "/api/admin/group-languages";

const LANG_OPTIONS = [
  { value: "", label: "—" },
  { value: "ita", label: "Italiano" },
  { value: "eng", label: "Inglese" },
];
const langName = (v) => LANG_OPTIONS.find((o) => o.value === v)?.label || "—";

export default function GroupLanguagesPage() {
  const { data } = useSWR(URL_API, fetcher, { revalidateOnFocus: false });
  const [filter, setFilter] = useState(null);
  const [pendingOverrides, setPendingOverrides] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const groups = data?.groups || [];
  const auto = data?.auto || {};
  const overrides = data?.overrides || {};

  // Merge pending con overrides server per UI
  const display = useMemo(() => {
    const out = {};
    for (const g of groups) {
      const ov = pendingOverrides[g] !== undefined ? pendingOverrides[g] : overrides[g];
      out[g] = {
        auto: auto[g] || null,
        override: ov || null,
        effective: ov || auto[g] || null,
        hasOverride: !!ov,
        pending: pendingOverrides[g] !== undefined && pendingOverrides[g] !== overrides[g],
      };
    }
    return out;
  }, [groups, auto, overrides, pendingOverrides]);

  const counts = {
    all: groups.length,
    missing: groups.filter((g) => !display[g]?.effective).length,
    auto: groups.filter((g) => display[g]?.effective && !display[g]?.hasOverride).length,
    override: groups.filter((g) => display[g]?.hasOverride).length,
  };
  const f = filter ?? (counts.missing > 0 ? "missing" : "all");

  const filtered = useMemo(() => {
    return groups.filter((g) => {
      const d = display[g];
      if (f === "all") return true;
      if (f === "missing") return !d.effective;
      if (f === "auto") return d.effective && !d.hasOverride;
      if (f === "override") return d.hasOverride;
      return true;
    });
  }, [groups, display, f]);

  const pendingCount = Object.keys(pendingOverrides).filter((g) => pendingOverrides[g] !== overrides[g]).length;

  function setOverride(group, value) {
    setPendingOverrides((p) => ({ ...p, [group]: value }));
  }

  async function save() {
    if (pendingCount === 0) return;
    setSaving(true);
    setMessage("");
    try {
      // Costruisco l'oggetto finale: overrides server + pending modifiche
      const finalOverrides = { ...overrides };
      for (const [g, v] of Object.entries(pendingOverrides)) {
        if (v && (v === "ita" || v === "eng")) finalOverrides[g] = v;
        else delete finalOverrides[g];
      }
      const res = await fetch(URL_API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: finalOverrides }),
      });
      const d = await res.json();
      if (!res.ok || d.error) {
        setMessage({ bad: true, text: d.error || "Errore" });
      } else {
        setMessage({ bad: false, text: `Salvate ${pendingCount} modifiche.` });
        setPendingOverrides({});
        await mutate(URL_API);
      }
    } catch (err) {
      setMessage({ bad: true, text: String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function resetAll() {
    if (!confirm("Cancellare TUTTE le lingue assegnate a mano? I gruppi torneranno alla lingua letta dal nome (e quelli senza «ITA»/«ENG» nel nome resteranno senza lingua).")) return;
    setSaving(true);
    try {
      const res = await fetch(URL_API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset" }) });
      const d = await res.json();
      if (!res.ok || d.error) setMessage({ bad: true, text: d.error || "Errore" });
      else {
        setMessage({ bad: false, text: "Tutte le lingue assegnate a mano sono state tolte." });
        setPendingOverrides({});
        await mutate(URL_API);
      }
    } catch (err) { setMessage({ bad: true, text: String(err) }); }
    finally { setSaving(false); }
  }

  const btn = (primary) => ({ padding: "9px 16px", borderRadius: 8, border: `1px solid ${primary ? CP.accent : CP.border}`, background: primary ? CP.accent : CP.surface, color: primary ? CP.accentInk : CP.textPrimary, fontSize: 13, fontWeight: 500, fontFamily: FONTS.body, cursor: "pointer" });

  const columns = [
    { key: "group", label: "Gruppo", sort: (r) => r.group.toLowerCase() },
    { key: "auto", label: "Letta dal nome", sort: (r) => r.d.auto || "", render: (r) => <span style={{ color: r.d.auto ? CP.textSecondary : CP.textMuted }}>{r.d.auto ? langName(r.d.auto) : "non si capisce"}</span> },
    {
      key: "override", label: "Scelta a mano", sortable: false,
      render: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <select value={r.current} onChange={(e) => setOverride(r.group, e.target.value)} aria-label={`Lingua di ${r.group}`}
            style={{ padding: "6px 10px", background: CP.bg, color: CP.textPrimary, border: `1px solid ${r.d.pending ? CP.accent : CP.border}`, borderRadius: 8, fontSize: 13, fontFamily: FONTS.body, cursor: "pointer" }}>
            {LANG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.value === "" ? "— nessuna —" : o.label}</option>
            ))}
          </select>
          {r.d.pending && <span style={{ fontSize: 12, color: CP.accentSoftText }}>da salvare</span>}
        </span>
      ),
    },
    {
      key: "effective", label: "Lingua usata", sort: (r) => r.d.effective || "",
      render: (r) => r.d.effective
        ? <span style={{ color: CP.textPrimary }}>{langName(r.d.effective)}{r.d.hasOverride && <span style={{ fontSize: 12, color: CP.textMuted }}> · a mano</span>}</span>
        : <span style={{ color: CP.accentRed }}>nessuna</span>,
    },
  ];
  const rows = filtered.map((g) => ({ id: g, group: g, d: display[g], current: pendingOverrides[g] !== undefined ? pendingOverrides[g] : (overrides[g] || "") }));

  return (
    <div style={{ padding: "28px 24px 96px", maxWidth: 1080, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Dati" }, { label: "Lingue gruppi" }]}
        title="Lingua dei gruppi"
        subtitle="La lingua di un gruppo si legge dal nome («ITA», «ENG»). Quando nel nome non c'è, la scegli qui. Serve per il filtro lingua della leaderboard e per confrontare i gruppi piccoli con la media della loro lingua. Le scelte fatte qui restano anche dopo un nuovo import."
      />

      {message && <Notice danger={message.bad}>{message.text}</Notice>}
      {!data && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {data?.error && <Notice danger>{data.error}</Notice>}

      {data && !data.error && (
        <>
          {counts.missing > 0 && (
            <Notice>
              {counts.missing} {counts.missing === 1 ? "gruppo non ha" : "gruppi non hanno"} una lingua: nella leaderboard non compaiono sotto nessuna lingua e, se sono piccoli, vengono confrontati con la media di tutti invece che con quella della loro lingua.
            </Notice>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <FilterChip label={`Senza lingua (${counts.missing})`} active={f === "missing"} danger={counts.missing > 0} disabled={!counts.missing} onClick={() => setFilter("missing")} />
            <FilterChip label={`Letta dal nome (${counts.auto})`} active={f === "auto"} onClick={() => setFilter("auto")} />
            <FilterChip label={`Scelta a mano (${counts.override})`} active={f === "override"} onClick={() => setFilter("override")} />
            <FilterChip label={`Tutti (${counts.all})`} active={f === "all"} onClick={() => setFilter("all")} />
          </div>
          <DataTable columns={columns} rows={rows} defaultSort={{ key: "group", dir: 1 }} minWidth={640} maxHeight={620} empty="Nessun gruppo in questa vista." />

          <div style={{ position: "sticky", bottom: 12, zIndex: 5, marginTop: 14, ...card, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button style={{ ...btn(true), opacity: saving || pendingCount === 0 ? 0.6 : 1 }} onClick={save} disabled={saving || pendingCount === 0}>
              {saving ? "Salvataggio…" : pendingCount > 0 ? `Salva ${pendingCount} ${pendingCount === 1 ? "modifica" : "modifiche"}` : "Salva"}
            </button>
            {pendingCount > 0 && <button style={btn(false)} onClick={() => setPendingOverrides({})} disabled={saving}>Annulla modifiche</button>}
            <span style={{ fontSize: 12, color: pendingCount ? CP.accentSoftText : CP.textMuted }}>{pendingCount ? "Modifiche non salvate" : "Tutto salvato"}</span>
            <div style={{ flex: 1 }} />
            <button style={{ ...btn(false), color: CP.accentRed }} onClick={resetAll} disabled={saving}>Togli tutte le scelte a mano</button>
          </div>
        </>
      )}
    </div>
  );
}
