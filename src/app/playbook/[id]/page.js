"use client";

// Dettaglio esempio del playbook (redesign 26/09/2026 sul design system).
// La conversazione è il contenuto principale: bolle leggibili (testo pieno,
// interlinea ampia), a fianco situazione → commento → passi → cosa ricordare.
// I dati tecnici (id, profilo fan, tag) restano, dietro una sezione richiudibile.
// Stessa API di prima (/api/playbook/[id]).
import { useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, SectionTitle, Disclosure, Notice, card, NUM } from "@/components/ds";

const fetcher = (url) => fetch(url).then((r) => r.json());

const CATEGORY_LABELS = {
  "le-basi-della-chat": "Basi della chat",
  "custom-e-upsell": "Custom e PPV",
  "script-avanzati": "Script avanzati",
  "recuperi-e-retention": "Recuperi e retention",
};

const CREATOR_LABELS = {
  "elisa-esposito": "Elisa Esposito",
  "gaja-bertolin": "Gaja Bertolin",
  "giulia-vaneri": "Giulia Vaneri",
};

const tag = { fontSize: 12, padding: "3px 10px", borderRadius: 6, background: CP.surfaceAlt, color: CP.textSecondary };
const label = { fontSize: 13, color: CP.textMuted, marginBottom: 6 };
const body = { fontSize: 14, color: CP.textPrimary, lineHeight: 1.6 };
const WRAP = { padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto", fontFamily: FONTS.body };
const CRUMBS = [{ label: "Academy", href: "/" }, { label: "Playbook", href: "/playbook" }];

function MessageBubble({ msg }) {
  const isOperator = msg.role === "operator";
  return (
    <div style={{ display: "flex", justifyContent: isOperator ? "flex-end" : "flex-start", marginBottom: 10 }}>
      <div
        style={{
          maxWidth: "85%",
          background: isOperator ? CP.accentSoft : CP.surfaceAlt,
          color: CP.textPrimary,
          padding: "10px 14px",
          borderRadius: 14,
          borderBottomRightRadius: isOperator ? 4 : 14,
          borderBottomLeftRadius: isOperator ? 14 : 4,
          fontSize: 15,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          lineHeight: 1.55,
        }}
      >
        <div style={{ fontSize: 12, color: isOperator ? CP.accentSoftText : CP.textMuted, marginBottom: 3 }}>
          {isOperator ? "Operatore" : "Fan"}
        </div>
        {msg.content}
      </div>
    </div>
  );
}

export default function PlaybookEntryPage() {
  const params = useParams();
  const id = params?.id;
  const [metaOpen, setMetaOpen] = useState(false);
  const { data, error, isLoading } = useSWR(id ? `/api/playbook/${id}` : null, fetcher, { revalidateOnFocus: false });

  if (isLoading) return <div style={WRAP}><PageHead crumbs={CRUMBS} title="Esempio" /><Notice>Caricamento dell'esempio…</Notice></div>;
  if (error) return <div style={WRAP}><PageHead crumbs={CRUMBS} title="Esempio" /><Notice danger>Errore di rete: riprova tra poco.</Notice></div>;
  if (data?.error) return <div style={WRAP}><PageHead crumbs={CRUMBS} title="Esempio" /><Notice danger>{data.error}</Notice></div>;

  const entry = data?.entry;
  if (!entry) return <div style={WRAP}><PageHead crumbs={CRUMBS} title="Esempio" /><Notice>Esempio non trovato.</Notice></div>;

  const isDedicated = entry.source === "dedicated";
  const hasMeta = entry.operatorId || entry.fanProfile || entry.id || (entry.tags && entry.tags.length > 0);

  return (
    <div style={WRAP}>
      <PageHead
        crumbs={[...CRUMBS, { label: "Esempio" }]}
        title={entry.title}
        subtitle={isDedicated
          ? "Leggi la conversazione, poi il commento: cosa è stato fatto, in che ordine e perché ha funzionato (o no)."
          : "Esempio dal pool di taratura della valutazione automatica: utile da studiare, ma non da copiare parola per parola."}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        <span style={{ ...tag, background: isDedicated ? CP.accentSoft : CP.surfaceAlt, color: isDedicated ? CP.accentSoftText : CP.textSecondary }}>
          {isDedicated ? "Curato per chi si allena" : "Pool di taratura AI"}
        </span>
        <span style={tag}>{CATEGORY_LABELS[entry.category] || entry.category}</span>
        {entry.creator && <span style={tag}>{CREATOR_LABELS[entry.creator] || entry.creator}</span>}
        {entry.benchmark && <span style={tag}>Benchmark: {entry.benchmark}</span>}
        {entry.difficulty && <span style={tag}>{entry.difficulty}</span>}
        {entry.outcome === "failure" && (
          <span style={{ ...tag, background: alpha(CP.accentRed, "1f"), color: CP.accentRed }}>Esempio negativo: cosa non funziona</span>
        )}
      </div>

      {!isDedicated && (
        <Notice>
          Questo esempio non è stato scritto per la formazione: viene dal pool che serve a tarare il giudice AI,
          e il commento è scritto per il giudice. Leggilo con occhio critico.
        </Notice>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 14, alignItems: "start" }}>
        <section style={{ ...card, padding: 18 }}>
          <SectionTitle aside={entry.conversation?.length ? `${entry.conversation.length} messaggi` : null}>Conversazione</SectionTitle>
          {entry.conversation && entry.conversation.length > 0 ? (
            entry.conversation.map((m, i) => <MessageBubble key={i} msg={m} />)
          ) : (
            <p style={{ color: CP.textMuted, fontSize: 13, margin: 0 }}>Nessun messaggio salvato.</p>
          )}
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {entry.situation && (
            <section style={{ ...card, padding: 18 }}>
              <div style={label}>Situazione</div>
              <div style={body}>{entry.situation}</div>
            </section>
          )}

          <section style={{ ...card, padding: 18 }}>
            <div style={label}>{isDedicated ? "Commento didattico" : "Commento del giudice AI"}</div>
            <div style={body}>{entry.commentary}</div>
          </section>

          {entry.steps && entry.steps.length > 0 && (
            <section style={{ ...card, padding: 18 }}>
              <div style={label}>Passi concreti</div>
              <ol style={{ ...body, paddingLeft: 20, margin: 0 }}>
                {entry.steps.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}
              </ol>
            </section>
          )}

          {entry.takeaway && (
            <section style={{ ...card, padding: 18, borderLeft: `3px solid ${CP.accent}` }}>
              <div style={label}>Da ricordare</div>
              <div style={{ ...body, fontSize: 15 }}>{entry.takeaway}</div>
            </section>
          )}

          {hasMeta && (
            <Disclosure open={metaOpen} onToggle={() => setMetaOpen((o) => !o)} title="Dettagli tecnici" summary="operatore, profilo fan, id, tag">
              <div style={{ fontSize: 13, color: CP.textSecondary }}>
                {entry.operatorId && <MetaRow k="Operatore" v={entry.operatorId} />}
                {entry.fanProfile && <MetaRow k="Profilo fan" v={entry.fanProfile} />}
                <MetaRow k="Id" v={<span style={{ fontSize: 12, ...NUM }}>{entry.id}</span>} />
                {entry.tags && entry.tags.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={label}>Tag</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {entry.tags.map((t, i) => <span key={i} style={tag}>{t}</span>)}
                    </div>
                  </div>
                )}
              </div>
            </Disclosure>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaRow({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderTop: `1px solid ${CP.borderSoft}` }}>
      <span style={{ color: CP.textMuted }}>{k}</span>
      <span style={{ textAlign: "right", wordBreak: "break-all" }}>{v}</span>
    </div>
  );
}
