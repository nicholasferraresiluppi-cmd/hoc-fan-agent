"use client";

// Vendere in chat — materiale per gli operatori (auth-only, come le altre
// pagine Academy). Le quattro abitudini vengono dall'analisi dei PPV reali
// (set 2026, ~100k PPV); gli esempi sono quelli APPROVATI dal sales manager in
// /admin/sales-coaching (fan oscurati, niente nome operatore). Niente numeri
// personali né classifiche qui: il confronto di un operatore è solo con sé
// stesso, e passa dal responsabile.

import { useState } from "react";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHeader } from "@/components/cp-style";

const fetcher = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Errore di caricamento"))));

const HABITS = [
  {
    title: "Proponi solo quando la chat è viva",
    stat: "Chat ferma: 1–2% comprati · chat viva: 8–22%",
    body: "Viva vuol dire che il fan ti ha scritto più volte nell'ultima ora e tu gli stai rispondendo. Un PPV mandato a chi non scrive da ore quasi non si vende mai, con qualsiasi prezzo.",
    doIt: ["Se la chat è ferma, prima riaccendila: una domanda personale, un teaser gratuito, un aggancio alla conversazione di ieri.", "Proponi quando il fan sta rispondendo, meglio dopo qualche scambio."],
    avoid: ["PPV a freddo sperando che lo veda.", "Trasformare la chat in un interrogatorio: tante domande di fila vendono meno, non di più."],
  },
  {
    title: "Costruisci l'offerta: prezzo di riferimento e qualcosa in più",
    stat: "Con bonus o prezzo di riferimento si compra circa il doppio",
    body: "Due mosse fanno comprare molto di più chi non ha mai pagato, e oggi si usano poco. La prima: dire quanto vale normalmente prima di dire quanto costa a lui. La seconda: aggiungere qualcosa (un video in più, una foto, un pacchetto) invece di togliere soldi.",
    doIt: ["\"Di solito lo mando a 60, per te…\"", "\"3 video e 3 foto al prezzo di uno\"", "Se il fan chiede di cambiare qualcosa, cambia il contenuto, non il prezzo."],
    avoid: ["Il PPV \"nudo\" con solo il prezzo.", "Lo sconto come prima mossa."],
  },
  {
    title: "\"Costa troppo\" vuol dire \"sono interessato\"",
    stat: "Dopo un'obiezione si compra più spesso che senza",
    body: "Chi dice \"è tanto\", \"non ho soldi\", \"fammi uno sconto\" sta trattando: è interessato. L'errore più caro è rispondere \"non posso\" e basta.",
    doIt: ["Fatti dire la sua cifra: \"quanto potresti?\"", "Rispondi sempre con un numero o con una versione diversa dello stesso contenuto.", "Se scendi, chiedi qualcosa in cambio (\"solo per stavolta\", \"mi prometti che è solo l'inizio\") o aggiungi invece di togliere."],
    avoid: ["\"Non posso\" senza un'alternativa.", "Proporre una cosa diversa da quella che voleva."],
  },
  {
    title: "Dopo il PPV resta nella conversazione",
    stat: "Il PPV non è la fine della chat",
    body: "Chi vende di più scrive subito dopo il PPV e, se il fan fa domande (\"si vede tutto?\", \"non mi pento?\"), le tratta come segnali d'acquisto.",
    doIt: ["Un messaggio subito dopo: \"dimmi se ti piace\", \"non voglio aspettare\".", "Se sparisce, rilancia con un teaser o un piccolo bonus \"se lo apri adesso\"."],
    avoid: ["\"Ci sei?\" come unico rilancio.", "Risposte di due parole alle domande del fan sul contenuto."],
  },
];

const DRILLS = [
  ["La chat si è spenta", "Il fan ieri ha chiacchierato mezz'ora poi è sparito. Riaccendi la conversazione senza PPV, e proponi solo quando risponde con almeno due messaggi."],
  ["\"È troppo\"", "Hai proposto un video a $45, il fan scrive \"35 max\". Chiudi senza scendere a 35: bonus, versione diversa o contropartita."],
  ["Il primo acquisto", "Fan nuovo, mai pagato, sta rispondendo. Costruisci un'offerta con prezzo di riferimento e pacchetto, poi scrivi il messaggio che manderesti subito dopo il PPV."],
];

const box = { background: CP.surface, border: `1px solid ${CP.border}`, borderRadius: 10, padding: "16px 18px" };

function Example({ ex }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ ...box, display: "flex", flexDirection: "column", gap: 10 }}>
      <button onClick={() => setOpen(!open)} style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, color: CP.textPrimary }}>{ex.creator || "Esempio"} · fan che non aveva mai pagato · comprato ${ex.ppv_price}</span>
        <span style={{ fontSize: 12, color: CP.accent }}>{open ? "chiudi" : "leggi"}</span>
      </button>
      {ex.note && <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>Da notare: {ex.note}</div>}
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {ex.messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.from === "op" ? "flex-end" : "flex-start", maxWidth: "82%", background: m.from === "op" ? CP.accentSoft : CP.surfaceAlt, color: CP.textPrimary, borderRadius: 10, padding: "6px 10px", fontSize: 13, lineHeight: 1.45 }}>
              {m.price ? <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: CP.accentSoftText, marginRight: 6 }}>PPV ${m.price}</span> : null}
              {m.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VenderePage() {
  const { data } = useSWR("/api/academy/sales-examples", fetcher, { revalidateOnFocus: false });
  const [checks, setChecks] = useState([false, false, false]);
  const examples = data?.examples || [];
  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader
        section="Academy"
        title="Vendere in chat"
        subtitle="Quattro abitudini che fanno comprare chi non ha mai comprato. Non sono opinioni: vengono da più di 100.000 PPV mandati sulle nostre pagine, confrontando quelli comprati con quelli ignorati. Chi compra la prima volta spende in media $40–110 nel mese dopo."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {HABITS.map((h, i) => (
          <section key={h.title} style={{ ...box, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 11, color: CP.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>Abitudine {i + 1}</span>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: CP.textPrimary, margin: 0 }}>{h.title}</h2>
            <span style={{ fontSize: 12.5, fontFamily: FONTS.mono, color: CP.accentSoftText, background: CP.accentSoft, borderRadius: 6, padding: "3px 8px", alignSelf: "flex-start" }}>{h.stat}</span>
            <p style={{ fontSize: 14, color: CP.textSecondary, margin: 0, lineHeight: 1.6 }}>{h.body}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              {[["Fai", h.doIt, CP.accentGreen], ["Evita", h.avoid, CP.accentRed]].map(([t, list, c]) => (
                <div key={t} style={{ background: CP.bgSunken, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, color: c, marginBottom: 6 }}>{t}</div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4, fontSize: 13.5, color: CP.textSecondary }}>
                    {list.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section style={{ ...box, display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: CP.textPrimary, margin: 0 }}>Prima di premere invio</h2>
          <p style={{ fontSize: 13.5, color: CP.textSecondary, margin: 0 }}>Tre domande per ogni PPV a un fan che non ha mai comprato. Tre sì: manda. Anche un solo no: prima sistema quello.</p>
          {["Il fan mi ha scritto nell'ultima ora e stiamo parlando adesso?", "Ho detto quanto vale normalmente, oppure ho aggiunto qualcosa in più?", "Se mi dice \"costa troppo\", so già con quale numero rispondo e cosa chiedo in cambio?"].map((q, i) => (
            <label key={q} htmlFor={`chk-${i}`} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: CP.textPrimary, background: CP.bgSunken, borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}>
              <input id={`chk-${i}`} type="checkbox" checked={checks[i]} onChange={() => setChecks(checks.map((c, j) => (j === i ? !c : c)))} style={{ marginTop: 3, accentColor: CP.accent }} />
              {q}
            </label>
          ))}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: CP.textPrimary, margin: "8px 0 0" }}>Esempi reali da studiare</h2>
          <p style={{ fontSize: 13.5, color: CP.textSecondary, margin: 0, lineHeight: 1.55 }}>Vendite vere delle nostre pagine a fan che non avevano mai pagato, scelte dal tuo responsabile. I dati dei fan sono oscurati.</p>
          {examples.map((ex) => <Example key={ex.id} ex={ex} />)}
          {!examples.length && <div style={{ ...box, fontSize: 13, color: CP.textMuted }}>Gli esempi arrivano appena il responsabile li approva.</div>}
        </section>

        <section style={{ ...box, display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: CP.textPrimary, margin: 0 }}>Dieci minuti prima del turno</h2>
          <p style={{ fontSize: 13.5, color: CP.textSecondary, margin: 0 }}>Leggere non basta: le abitudini si prendono facendole. Scegli una situazione, fai l'operatore mentre un collega fa il fan (o usa il simulatore Academy), poi scambiatevi.</p>
          {DRILLS.map(([t, s]) => (
            <div key={t} style={{ background: CP.bgSunken, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 13.5, color: CP.textPrimary, marginBottom: 3 }}>{t}</div>
              <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>{s}</div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
