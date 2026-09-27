"use client";

/**
 * /admin/payment-profiles
 *
 * Elenco di tutti i profili di pagamento attivi su CreatorsPro: per ognuno
 * quante persone lavorano nel turno, gli scaglioni (soglia → %) e le creator
 * collegate. Serve per l'esame degli scaglioni operatore.
 *
 * Redesign 26/09/2026 (design system, pannello tester PAY/BOARD/SM/UX):
 * - da ~350 card a UNA tabella ordinabile (tag, persone, scaglioni in riga):
 *   si confrontano i profili senza scorrere decine di schermate;
 * - "Creator coperti 0" sembrava un guasto: ora si dice perché è 0;
 * - pannelli di debug in "Dettagli tecnici", chiusi.
 * API e dati invariati.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Search, Loader2 } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { fmt$, fmtInt, fmtPct } from "@/lib/format";
import { PageHead, Metric, FilterChip, Disclosure, Notice, DataTable, card, NUM } from "@/components/ds";

const fetcher = (url) => fetch(url).then((r) => r.json());

const COSELLERS_LABEL = { 1: "Da solo", 2: "In coppia", 3: "In tre", 4: "In quattro" };

export default function PaymentProfilesPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/payment-profiles", fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  const [search, setSearch] = useState("");
  const [cosellersFilter, setCosellersFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const profiles = data?.profiles || [];

  // Tag distinct list per il menu
  const allTags = useMemo(() => {
    const s = new Set();
    for (const p of profiles) if (p.tag) s.add(p.tag);
    return [...s].sort();
  }, [profiles]);

  // Filtered list (ordinata per tag, poi nome: resta l'ordine di partenza della tabella)
  const filtered = useMemo(() => {
    let list = profiles;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.tag || "").toLowerCase().includes(q) ||
        (p.links || []).some((l) => (l.group?.name || "").toLowerCase().includes(q))
      );
    }
    if (cosellersFilter !== "") {
      const n = parseInt(cosellersFilter, 10);
      list = list.filter((p) => p.cosellersCount === n);
    }
    if (tagFilter) list = list.filter((p) => p.tag === tagFilter);
    return [...list].sort((a, b) => {
      const t = (a.tag || "").localeCompare(b.tag || "");
      if (t !== 0) return t;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [profiles, search, cosellersFilter, tagFilter]);

  const byC = data?.counts?.by_cosellers || {};
  const n3plus = (byC["3"] ?? 0) + (byC["4"] ?? 0);
  const creatorsCovered = data?.counts?.by_creator_count;

  const columns = [
    { key: "name", label: "Profilo", render: (p) => <span style={{ fontWeight: 500 }}>{p.name}</span> },
    { key: "tag", label: "Tag", muted: true, render: (p) => p.tag || "senza tag" },
    { key: "cosellersCount", label: "Persone nel turno", render: (p) => COSELLERS_LABEL[p.cosellersCount] || (p.cosellersCount != null ? `In ${p.cosellersCount}` : "—") },
    { key: "thresholds", label: "Scaglioni (da $ → %)", sort: (p) => p.thresholds_count ?? 0, render: (p) => (
      p.thresholds?.length ? (
        <span style={{ ...NUM, whiteSpace: "nowrap" }}>
          {p.thresholds.map((t, i) => (
            <span key={t.id || i}>
              {i > 0 && <span style={{ color: CP.textMuted }}> · </span>}
              <span style={{ color: CP.textSecondary }}>{Number(t.threshold) > 0 ? `da ${fmt$(t.threshold)}` : "base"}</span> <span style={{ fontWeight: 500 }}>{fmtPct(t.percentage, 1)}</span>
            </span>
          ))}
        </span>
      ) : <span style={{ color: CP.textMuted }}>nessuno</span>
    ) },
    { key: "hourlyRate", label: "Paga oraria", align: "right", render: (p) => (p.hourlyRate > 0 ? `${fmt$(p.hourlyRate)}/h` : "—") },
    { key: "links_count", label: "Creator collegate", sort: (p) => p.links_count ?? 0, render: (p) => {
      const names = (p.links || []).map((l) => l.group?.name || (l.groupId ? `${String(l.groupId).slice(0, 8)}…` : "sconosciuta"));
      if (!names.length) return <span style={{ color: CP.textMuted }}>—</span>;
      const members = (p.links || []).map((l) => l.member?.name).filter(Boolean);
      return (
        <span title={(p.links || []).map((l) => `${l.group?.name || l.groupId || "?"}${l.member?.name ? ` · ${l.member.name}` : ""}`).join("\n")} style={{ fontSize: 13 }}>
          {names.slice(0, 2).join(", ")}{names.length > 2 && <span style={{ color: CP.textMuted }}> +{names.length - 2}</span>}
          {members.length > 0 && <div style={{ fontSize: 12, color: CP.textMuted }}>{members.slice(0, 2).join(", ")}{members.length > 2 ? ` +${members.length - 2}` : ""}</div>}
        </span>
      );
    } },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1400, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Comp & Ben" }, { label: "Profili di pagamento" }]}
        title="Profili di pagamento"
        subtitle="Tutti i profili di pagamento attivi su CreatorsPro, con i loro scaglioni: per vedere quali esistono, quali si somigliano e quali sono vecchi e vanno tolti."
        actions={
          <button onClick={() => mutate()} style={ghostBtn}>Ricarica da CreatorsPro</button>
        }
      />

      {(error || data?.error) && <Notice danger>Non riesco a leggere i profili da CreatorsPro: {String(data?.error || error?.message || error)}</Notice>}

      {isLoading && (
        <div style={{ ...card, padding: "18px 20px", display: "flex", alignItems: "center", gap: 10, color: CP.textSecondary, fontSize: 14 }}>
          <Loader2 size={16} className="animate-spin" /> Carico tutti i profili di pagamento da CreatorsPro…
        </div>
      )}

      {data && !data.error && (
        <>
          <section style={{ ...card, padding: "16px 20px", marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Metric label="Profili attivi" value={fmtInt(data.total)} />
            <Metric label="Da solo" value={fmtInt(byC["1"] ?? 0)} />
            <Metric label="In coppia" value={fmtInt(byC["2"] ?? 0)} />
            <Metric label="In tre o più" value={fmtInt(n3plus)} />
            <Metric label="Tag distinti" value={fmtInt(data.counts?.by_tag_count)} note="tag = scenario operatore × creator" />
            <Metric label="Creator coperte" value={creatorsCovered ? fmtInt(creatorsCovered) : "n/d"} note={creatorsCovered ? `su ${fmtInt(data.groups_loaded ?? 0)} gruppi CreatorsPro` : "vedi nota sotto"} />
          </section>

          {!creatorsCovered && (
            <Notice>
              Il numero di creator coperte non è disponibile: CreatorsPro oggi non restituisce il collegamento profilo → creator per tutti i profili, quindi il conteggio risulterebbe 0 anche se i profili sono in uso. Le creator collegate si vedono comunque riga per riga, quando CreatorsPro le fornisce. I dettagli sono in “Dettagli tecnici” in fondo.
            </Notice>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <FilterChip label={`Tutti (${fmtInt(data.total)})`} active={cosellersFilter === ""} onClick={() => setCosellersFilter("")} />
            {[1, 2, 3, 4].filter((n) => (byC[String(n)] ?? 0) > 0).map((n) => (
              <FilterChip key={n} label={`${COSELLERS_LABEL[n]} (${byC[String(n)]})`} active={cosellersFilter === String(n)} onClick={() => setCosellersFilter(cosellersFilter === String(n) ? "" : String(n))} />
            ))}
            <span style={{ flex: 1 }} />
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Tag" style={{ ...input, width: "auto", minWidth: 200, cursor: "pointer" }}>
              <option value="">Tutti i tag ({allTags.length})</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div style={{ position: "relative", flex: "0 1 280px", minWidth: 200 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: CP.textMuted }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Profilo, tag o creator" aria-label="Cerca" style={{ ...input, paddingLeft: 32 }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 8 }}>
            {fmtInt(filtered.length)} profili su {fmtInt(profiles.length)} · ordinati per tag e nome, clicca un'intestazione per riordinare · passa sulle creator per l'elenco completo
          </div>

          <div style={{ marginBottom: 16 }}>
            <DataTable columns={columns} rows={filtered.map((p) => ({ ...p, id: p.id }))} minWidth={1040} maxHeight={720}
              empty={profiles.length ? "Nessun profilo con questi filtri. Togli un filtro o cambia la ricerca." : "CreatorsPro non ha restituito profili di pagamento."} />
          </div>

          {(data.debug || data.sample_first_3_profiles_raw) && (
            <Disclosure open={showDebug} onToggle={() => setShowDebug(!showDebug)} title="Dettagli tecnici" summary="Per chi fa manutenzione: collegamento profilo → creator e dati grezzi">
              {data.debug && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 10 }}>
                    <Metric label="Profili con creator collegate" value={`${fmtInt(data.debug.profiles_with_creatorPaymentProfiles_populated)} su ${fmtInt(data.total)}`} />
                    <Metric label="Profili senza collegamento" value={fmtInt(data.debug.profiles_with_empty_creatorPaymentProfiles)} />
                  </div>
                  {data.debug.single_profile_probe && (
                    <div style={{ fontSize: 12, color: CP.textSecondary }}>
                      <div style={{ marginBottom: 6 }}>Prove sull'API del singolo profilo:</div>
                      {data.debug.single_profile_probe.map((r) => (
                        <div key={r.path} style={{ padding: "6px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <code style={{ wordBreak: "break-all" }}>{r.path}</code>
                            <span style={{ color: r.ok ? CP.textSecondary : CP.accentRed, whiteSpace: "nowrap" }}>HTTP {r.status ?? "errore"}</span>
                          </div>
                          {r.sample && (
                            <div style={{ marginTop: 4, color: CP.textMuted, paddingLeft: 12 }}>
                              campi: {r.sample.keys?.join(", ") || "—"} · collegamenti: {r.sample.cpp_count ?? "—"}
                              {r.sample.cpp_first && (
                                <pre style={{ marginTop: 6, padding: "6px 8px", background: CP.surfaceAlt, borderRadius: 6, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                  {JSON.stringify(r.sample.cpp_first, null, 2)}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {data.sample_first_3_profiles_raw && (
                <>
                  <button onClick={() => setShowRaw((v) => !v)} style={{ ...ghostBtn, padding: "6px 10px", fontSize: 12 }}>
                    {showRaw ? "Nascondi" : "Mostra"} i dati grezzi dei primi 3 profili
                  </button>
                  {showRaw && (
                    <pre style={{ marginTop: 10, padding: "10px 12px", background: CP.surfaceAlt, borderRadius: 6, fontSize: 11, color: CP.textPrimary, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 480, overflow: "auto" }}>
                      {JSON.stringify(data.sample_first_3_profiles_raw, null, 2)}
                    </pre>
                  )}
                </>
              )}
            </Disclosure>
          )}

          <div style={{ fontSize: 12, color: CP.textMuted }}>
            Per vedere come questi scaglioni pesano sul venduto di ogni creator: <Link href="/admin/profiles-compare" style={{ color: CP.accentSoftText }}>Scaglioni a confronto</Link>.
          </div>
        </>
      )}
    </div>
  );
}

const input = { width: "100%", padding: "8px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 14, fontFamily: FONTS.body, outline: "none", boxSizing: "border-box" };
const ghostBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textSecondary, fontSize: 13, fontFamily: FONTS.body, cursor: "pointer" };
