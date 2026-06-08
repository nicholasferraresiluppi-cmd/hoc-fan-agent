"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Search, Users, User, UsersRound, Tag, Layers, AlertCircle, Coins, Percent, Loader2 } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader, CpCard, SectionLabel, StatCard } from "@/components/cp-style";

/**
 * /admin/payment-profiles
 *
 * Vista aggregata di tutti i Payment Profiles attivi su CP.
 * Pensata per supportare l'esame degli scaglioni operatore: vedi a colpo
 * d'occhio quali profili esistono, raggruppati per "solo/coppia/triplo",
 * con scaglioni e creator collegati per ognuno.
 */

const fetcher = (url) => fetch(url).then((r) => r.json());

const COSELLERS_LABEL = { 1: "Solo", 2: "Coppia", 3: "Triplo", 4: "Quartetto" };
const COSELLERS_ICON = { 1: User, 2: UsersRound, 3: Users, 4: Users };
const COSELLERS_COLOR = { 1: "#4F8CCB", 2: "#D4AF7A", 3: "#3FB97E", 4: "#A35EE0" };

function fmtPct(v) {
  if (v == null) return "—";
  // CP percentage sembra essere normalizzato 0..1 (es. 0.1 = 10%)
  return `${(v * 100).toFixed(1)}%`;
}
function fmtCurrency(v) {
  if (v == null) return "—";
  return `$${Math.round(v).toLocaleString("it-IT")}`;
}

export default function PaymentProfilesPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/payment-profiles", fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  const [search, setSearch] = useState("");
  const [cosellersFilter, setCosellersFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [showRaw, setShowRaw] = useState(false);

  const profiles = data?.profiles || [];

  // Tag distinct list per il dropdown
  const allTags = useMemo(() => {
    const s = new Set();
    for (const p of profiles) if (p.tag) s.add(p.tag);
    return [...s].sort();
  }, [profiles]);

  // Filtered list
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
    // sort: by tag, then name
    return [...list].sort((a, b) => {
      const t = (a.tag || "").localeCompare(b.tag || "");
      if (t !== 0) return t;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [profiles, search, cosellersFilter, tagFilter]);

  // Group by tag for the visual grouping
  const groupedByTag = useMemo(() => {
    const groups = {};
    for (const p of filtered) {
      const k = p.tag || "(senza tag)";
      (groups[k] = groups[k] || []).push(p);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 1400, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      <PageHeader
        breadcrumb={
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary }}>
            <Link href="/admin" style={{ color: "inherit", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: CP.textMuted }}>›</span>
            <span style={{ color: CP.textPrimary }}>Payment Profiles</span>
          </div>
        }
        section="Data · Comp & Ben"
        title="Profili Pagamento (CreatorsPro)"
        subtitle="Vista aggregata di tutti i profili pagamento attivi su CP. Raggruppati per tag (= scenario operatore × creator), filtrabili per numerosità (solo/coppia/triplo). Per ogni profilo trovi scaglioni con soglia + percentuale e creator collegati."
      />

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Profili totali" value={isLoading ? "…" : (data?.total ?? "—")} />
        <StatCard label="Solo (1 operatore)" value={data?.counts?.by_cosellers?.["1"] ?? "—"} color={COSELLERS_COLOR[1]} />
        <StatCard label="Coppia (2 operatori)" value={data?.counts?.by_cosellers?.["2"] ?? "—"} color={COSELLERS_COLOR[2]} />
        <StatCard label="3+ operatori" value={(data?.counts?.by_cosellers?.["3"] ?? 0) + (data?.counts?.by_cosellers?.["4"] ?? 0) || "—"} color={COSELLERS_COLOR[3]} />
        <StatCard label="Tag distinti" value={data?.counts?.by_tag_count ?? "—"} />
        <StatCard label="Creator coperti" value={data?.counts?.by_creator_count ?? "—"} sub={`su ${data?.groups_loaded ?? 0} groups CP`} />
      </div>

      {/* Filtri */}
      <CpCard padding="16px 18px" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={lbl}>Cerca</label>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: CP.textMuted }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome profilo, tag o creator…"
                style={{ ...input, paddingLeft: 32 }}
              />
            </div>
          </div>
          <div>
            <label style={lbl}>Numerosità</label>
            <select value={cosellersFilter} onChange={(e) => setCosellersFilter(e.target.value)} style={{ ...input, minWidth: 130, cursor: "pointer" }}>
              <option value="" style={{ background: CP.surface }}>Tutte</option>
              <option value="1" style={{ background: CP.surface }}>1 — Solo</option>
              <option value="2" style={{ background: CP.surface }}>2 — Coppia</option>
              <option value="3" style={{ background: CP.surface }}>3 — Triplo</option>
              <option value="4" style={{ background: CP.surface }}>4 — Quartetto</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Tag</label>
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ ...input, minWidth: 200, cursor: "pointer" }}>
              <option value="" style={{ background: CP.surface }}>Tutti ({allTags.length})</option>
              {allTags.map((t) => <option key={t} value={t} style={{ background: CP.surface }}>{t}</option>)}
            </select>
          </div>
          <button
            onClick={() => mutate()}
            style={{ padding: "9px 14px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 8, color: CP.textPrimary, fontSize: 13, cursor: "pointer" }}
          >
            🔄 Ricarica
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: CP.textMuted }}>
          Mostrati <b style={{ color: CP.textPrimary }}>{filtered.length}</b> profili su {profiles.length}
        </div>
      </CpCard>

      {error && (
        <CpCard accent={CP.accentRed} padding="14px 18px" style={{ marginBottom: 20 }}>
          <div style={{ color: CP.accentRed, display: "flex", alignItems: "center", gap: 10 }}>
            <AlertCircle size={16} /> Errore caricamento: {String(error?.message || error)}
          </div>
        </CpCard>
      )}

      {isLoading && (
        <CpCard padding="20px 24px">
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: CP.textSecondary, fontSize: 14 }}>
            <Loader2 size={16} className="animate-spin" /> Carico tutti i payment profiles da CP…
          </div>
        </CpCard>
      )}

      {/* Lista raggruppata per tag */}
      {!isLoading && groupedByTag.length === 0 && (
        <CpCard padding="20px 24px">
          <div style={{ color: CP.textMuted, fontSize: 13, fontStyle: "italic" }}>
            Nessun profilo trovato con i filtri attuali.
          </div>
        </CpCard>
      )}

      {!isLoading && groupedByTag.map(([tag, items]) => (
        <div key={tag} style={{ marginBottom: 28 }}>
          <SectionLabel style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Tag size={13} /> {tag}
            <span style={{ color: CP.textMuted, fontSize: 11, fontFamily: FONTS.mono }}>· {items.length} profil{items.length === 1 ? "o" : "i"}</span>
          </SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 12 }}>
            {items.map((p) => <ProfileCard key={p.id} p={p} />)}
          </div>
        </div>
      ))}

      {/* Validation panel: raw JSON del primo profilo, per validare assunzioni */}
      {data?.sample_first_profile_raw && (
        <CpCard padding="14px 18px" style={{ marginTop: 32 }}>
          <button
            onClick={() => setShowRaw((v) => !v)}
            style={{ background: "transparent", border: "none", color: CP.textSecondary, cursor: "pointer", fontSize: 12, padding: 0, fontFamily: FONTS.mono }}
          >
            {showRaw ? "▼" : "▶"} Sample raw del primo profilo (per debug/validazione)
          </button>
          {showRaw && (
            <pre style={{ marginTop: 10, padding: "10px 12px", background: CP.surfaceAlt, borderRadius: 6, fontFamily: FONTS.mono, fontSize: 11, color: CP.textPrimary, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 480, overflow: "auto" }}>
              {JSON.stringify(data.sample_first_profile_raw, null, 2)}
            </pre>
          )}
        </CpCard>
      )}
    </div>
  );
}

function ProfileCard({ p }) {
  const Icon = COSELLERS_ICON[p.cosellersCount] || Users;
  const color = COSELLERS_COLOR[p.cosellersCount] || CP.textMuted;
  return (
    <CpCard accent={color} padding="14px 16px">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={18} color={color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 700, color: CP.textPrimary, lineHeight: 1.25 }}>{p.name}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <span style={badge(color)}>{COSELLERS_LABEL[p.cosellersCount] || `${p.cosellersCount} pers`}</span>
            {p.hourlyRate > 0 && <span style={badge("#8F8A82")}><Coins size={9} style={{ marginRight: 3 }} />{fmtCurrency(p.hourlyRate)}/h</span>}
            {p.thresholds_count > 0 && <span style={badge(CP.accentGreen)}><Layers size={9} style={{ marginRight: 3 }} />{p.thresholds_count} scaglion{p.thresholds_count === 1 ? "e" : "i"}</span>}
            {p.links_count > 0 && <span style={badge("#D4AF7A")}>{p.links_count} link</span>}
          </div>
        </div>
      </div>

      {/* Scaglioni */}
      {p.thresholds && p.thresholds.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: CP.textMuted, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: FONTS.mono, marginBottom: 6 }}>Scaglioni</div>
          <div style={{ background: CP.surfaceAlt, borderRadius: 6, overflow: "hidden" }}>
            {p.thresholds.map((t, i) => (
              <div key={t.id || i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, padding: "6px 10px", borderBottom: i < p.thresholds.length - 1 ? `1px solid ${CP.border}` : "none", fontSize: 12 }}>
                <span style={{ fontFamily: FONTS.mono, color: CP.textMuted, fontSize: 10 }}>#{i + 1}</span>
                <span style={{ fontFamily: FONTS.mono, color: CP.textSecondary }}>da {fmtCurrency(t.threshold)}</span>
                <span style={{ fontFamily: FONTS.mono, color: CP.accentGreen, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <Percent size={10} /> {fmtPct(t.percentage)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Creator collegati */}
      {p.links && p.links.length > 0 && (
        <details style={{ fontSize: 12 }}>
          <summary style={{ cursor: "pointer", color: CP.textSecondary, fontSize: 11, fontFamily: FONTS.mono, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Creator collegati ({p.links.length})
          </summary>
          <div style={{ marginTop: 6 }}>
            {p.links.slice(0, 20).map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${CP.border}`, fontSize: 11 }}>
                <span style={{ color: CP.textPrimary, fontWeight: 500 }}>{l.group?.name || (l.groupId ? <code style={{ fontFamily: FONTS.mono, color: CP.textMuted }}>{String(l.groupId).slice(0, 8)}…</code> : "(group unknown)")}</span>
                {l.member?.name && <span style={{ color: CP.textMuted, fontFamily: FONTS.mono }}>{l.member.name}</span>}
              </div>
            ))}
            {p.links.length > 20 && <div style={{ marginTop: 4, fontSize: 10, color: CP.textMuted, fontStyle: "italic" }}>+ altri {p.links.length - 20} non mostrati</div>}
          </div>
        </details>
      )}
    </CpCard>
  );
}

const lbl = { display: "block", fontSize: 10, color: CP.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5, fontFamily: FONTS.mono };
const input = { width: "100%", padding: "9px 12px", background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 7, color: CP.textPrimary, fontSize: 13, fontFamily: FONTS.body, outline: "none" };
const badge = (c) => ({ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 4, background: c + "22", color: c, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, border: `1px solid ${c}55` });
