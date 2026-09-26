"use client";

// Sessioni del simulatore (redesign DS 26/09/2026). Elenco delle ultime
// sessioni di training con il voto AI; clic per leggere la chat completa.
// Voto come testo con un pallino-segnale (prima una pillola rossa/verde piena);
// operatore senza nome → coda dell'id invece di "—". API invariata.
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CP, FONTS } from "@/lib/brand";
import { fmtInt } from "@/lib/format";
import { PageHead, HeroMetric, Metric, Notice, DataTable, card } from "@/components/ds";

const fetcher = (url) => fetch(url).then((r) => r.json());

function fmtDuration(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

const scoreColor = (v) => (v >= 70 ? CP.accentGreen : v >= 50 ? CP.textMuted : CP.accentRed);
function ScoreCell({ overall }) {
  if (overall === null || overall === undefined) return <span style={{ color: CP.textMuted }}>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, justifyContent: "flex-end" }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: scoreColor(overall) }} />
      {overall}%
    </span>
  );
}

const SCOPE_TEXT = { own: "Vedi solo le tue sessioni.", team: "Vedi le sessioni del tuo team.", all: "Vedi le sessioni di tutti." };
const MODE_TEXT = { scenario: "Scenario" };

export default function SessionsListPage() {
  const router = useRouter();
  // Fetch da /api/admin/session-review (rotta nuova) — /api/admin/sessions
  // esiste già con altro scopo (eval feedback per /admin/review).
  const { data, error, isLoading } = useSWR("/api/admin/session-review?limit=100", fetcher, {
    revalidateOnFocus: false,
  });

  const sessions = data?.sessions || [];
  const scored = sessions.filter((s) => s.score?.overall != null);
  const avg = scored.length ? Math.round(scored.reduce((a, s) => a + s.score.overall, 0) / scored.length) : null;
  const low = scored.filter((s) => s.score.overall < 50).length;

  const columns = [
    { key: "timestamp", label: "Quando", sort: (s) => s.timestamp || "", render: (s) => <span style={{ whiteSpace: "nowrap" }}>{fmtDate(s.timestamp)}</span> },
    {
      key: "operatorName", label: "Operatore", sort: (s) => s.operatorName || "",
      render: (s) => s.operatorName
        ? <span>{s.operatorName}</span>
        : <span style={{ color: CP.textMuted }} title={s.userId || ""}>{s.userId ? `utente …${String(s.userId).slice(-6)}` : "—"}</span>,
    },
    { key: "fan", label: "Fan simulato", muted: true, sort: (s) => s.fanName || s.fanProfileId || "", render: (s) => s.fanName || s.fanProfileId || "—" },
    { key: "mode", label: "Tipo", muted: true, render: (s) => MODE_TEXT[s.mode] || s.mode || "—" },
    { key: "messageCount", label: "Messaggi", align: "right", render: (s) => fmtInt(s.messageCount) },
    { key: "duration", label: "Durata", align: "right", render: (s) => <span style={{ whiteSpace: "nowrap" }}>{fmtDuration(s.duration)}</span> },
    { key: "score", label: "Voto AI", align: "right", sort: (s) => s.score?.overall ?? null, render: (s) => <ScoreCell overall={s.score?.overall} /> },
    { key: "open", label: "", sortable: false, render: (s) => <Link href={`/admin/sessions/${s.id}`} onClick={(e) => e.stopPropagation()} style={{ color: CP.accentSoftText, textDecoration: "none", whiteSpace: "nowrap" }}>Apri →</Link> },
  ];

  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Hub", href: "/admin" }, { label: "Training" }, { label: "Sessioni" }]}
        title="Sessioni del simulatore"
        subtitle="Le ultime sessioni di training con il fan simulato e il voto che ha dato l'AI. Apri una sessione per leggere la chat e capire su cosa allenare l'operatore."
      />

      {isLoading && <div style={{ color: CP.textMuted, fontSize: 14 }}>Caricamento…</div>}
      {error && <Notice danger>Errore di rete: {String(error)}</Notice>}
      {data?.error && <Notice danger>{data.error}. Probabilmente il tuo ruolo non ha il permesso di rivedere le sessioni.</Notice>}

      {data?.sessions && (<>
        <HeroMetric
          label="Sessioni recenti"
          value={fmtInt(sessions.length)}
          compare={avg != null ? `Voto AI medio: ${avg}%` : null}
          hint={SCOPE_TEXT[data.scope] || null}
        >
          {scored.length > 0 && (
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Metric label="Sotto il 50%" value={fmtInt(low)} note="sessioni da rileggere" />
            </div>
          )}
        </HeroMetric>

        {sessions.length === 0 ? (
          <div style={{ ...card, padding: "18px 20px", fontSize: 14, color: CP.textSecondary, lineHeight: 1.5 }}>
            Nessuna sessione tra quelle che puoi vedere. {SCOPE_TEXT[data.scope] || ""} Le sessioni compaiono qui quando qualcuno completa una chat nel simulatore.
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={sessions}
            defaultSort={{ key: "timestamp", dir: -1 }}
            onRowClick={(s) => router.push(`/admin/sessions/${s.id}`)}
            minWidth={820}
            maxHeight={680}
          />
        )}
        {sessions.length > 0 && <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 10 }}>
          Voto: <span style={{ color: CP.accentGreen }}>●</span> 70% o più · <span style={{ color: CP.textMuted }}>●</span> 50–69% · <span style={{ color: CP.accentRed }}>●</span> sotto il 50%.
        </div>}
      </>)}
    </div>
  );
}
