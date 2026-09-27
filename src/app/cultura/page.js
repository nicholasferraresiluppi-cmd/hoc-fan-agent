"use client";

/**
 * /cultura — Come lavoriamo bene insieme (27/09/2026, richiesta di Nicholas: che sia l'app stessa a
 * trasmettere appartenenza, vocabolario, feedback e leadership).
 *
 * Nasce dal playbook di HOC, riletto da un pannello di esperti (culture officer remoto, learning
 * designer, giuslavorista, UX writer, community designer, scienziato comportamentale, nuovi arrivati):
 *  - è un INVITO, non un regolamento: niente firma né "presa visione" (quella è solo per l'informativa
 *    sui dati, documento separato). Le regole vincolanti stanno negli accordi, diversi per tipo di rapporto;
 *  - poche pratiche, ognuna col perché e un esempio prima → dopo (non elenchi di divieti);
 *  - dentro anche chi fa i turni in chat, che è la maggioranza;
 *  - nessun nome di persone reali negli esempi; la fatica si può dire.
 * Aperta a tutti gli utenti. Nessun dato, nessuna misura: la cultura non entra in score o classifiche.
 */
import Link from "next/link";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, SectionTitle, card } from "@/components/ds";

const PRINCIPI = [
  {
    t: "Nostro, non mio",
    why: "Il risultato è della squadra. Parlare al plurale fa sentire gli altri parte di quello che stai proponendo.",
    prima: "Ho pensato alla mia idea per la promo di venerdì.",
    dopo: "Un'idea per la nostra promo di venerdì: vi torna?",
  },
  {
    t: "Rispondi quando ti chiamano, anche solo per dire «dopo»",
    why: "Da remoto il silenzio sembra disinteresse. Una riga basta a far sapere che ci sei.",
    prima: "(tag alle 11, nessuna risposta fino a sera)",
    dopo: "Ci sono, ti rispondo entro le 16.",
  },
  {
    t: "Porta il problema insieme a una proposta",
    why: "Chi legge capisce subito cosa serve e può dire sì o no, invece di dover indovinare.",
    prima: "Non riesco a pubblicare.",
    dopo: "Il file del reel non è su Drive: carico quello di ieri o aspetto il tuo?",
  },
  {
    t: "Un pensiero, un messaggio: di' cosa ti serve",
    why: "Messaggi spezzati o un nome da solo mettono ansia. Un messaggio completo si legge una volta e si chiude.",
    prima: "«Giulia» … «ci sei?» … «una cosa»",
    dopo: "Giulia, mi serve il tuo ok sul post di domani entro le 18: te lo mando qui sotto.",
  },
  {
    t: "Grazie invece di scusa. E la fatica si dice",
    why: "Il «grazie» sposta l'attenzione sulla soluzione. Se sei in difficoltà, dillo alla persona giusta con una proposta: tenerlo per sé non aiuta nessuno.",
    prima: "Scusa, errore mio.",
    dopo: "Grazie per avercelo segnalato: sistemato, e da domani lo controllo prima.",
  },
];

function Esempio({ prima, dopo }) {
  const row = (label, text, strong) => (
    <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 10, alignItems: "baseline" }}>
      <span style={{ fontSize: 12, color: CP.textMuted }}>{label}</span>
      <span style={{ fontSize: 14, color: strong ? CP.textPrimary : CP.textSecondary, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 10, padding: "10px 12px", borderRadius: 8, border: `1px solid ${CP.borderSoft}` }}>
      {row("Prima", prima)}
      {row("Meglio", dopo, true)}
    </div>
  );
}

function Condivisi() {
  const { data } = useSWR("/api/grazie?shared=1", (u) => fetch(u).then((r) => r.json()), { revalidateOnFocus: false });
  const list = data?.shared || [];
  return (
    <>
      <SectionTitle aside="mostrati da chi li ha ricevuti">Grazie di recente</SectionTitle>
      <div style={{ ...card, padding: "14px 20px", marginBottom: 28, fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>
        {list.length ? list.map((t) => (
          <p key={t.id} style={{ margin: "0 0 10px" }}>«{t.text}» <span style={{ color: CP.textMuted, fontSize: 12.5 }}>— {t.from} a {t.to}</span></p>
        )) : <p style={{ margin: 0 }}>Ancora nessuno. Il primo puoi mandarlo tu.</p>}
        <Link href="/grazie" style={{ fontSize: 13.5, color: CP.accentSoftText }}>Dire grazie a un collega →</Link>
      </div>
    </>
  );
}

export default function CulturaPage() {
  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 880, margin: "0 auto", fontFamily: FONTS.body }}>
      <PageHead
        title="Come lavoriamo bene insieme"
        line2="Non è un regolamento: è come ci piace lavorare."
        subtitle="Lavoriamo lontani: niente caffè insieme, niente pacca sulla spalla. Il tono lo costruiamo apposta, con le parole. Queste sono le cinque cose che fanno la differenza, ognuna col suo perché."
      />

      <div style={{ display: "grid", gap: 12, marginBottom: 32 }}>
        {PRINCIPI.map((p, i) => (
          <section key={p.t} style={{ ...card, padding: "18px 20px" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <span style={{ fontSize: 13, color: CP.textMuted, minWidth: 18 }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <h2 className="ds-sect" style={{ fontSize: 17, fontWeight: 500, margin: 0, color: CP.textPrimary }}>{p.t}</h2>
                <p style={{ fontSize: 14, color: CP.textSecondary, margin: "6px 0 0", lineHeight: 1.55 }}>{p.why}</p>
                <Esempio prima={p.prima} dopo={p.dopo} />
              </div>
            </div>
          </section>
        ))}
      </div>

      <SectionTitle>Per chi fa i turni in chat</SectionTitle>
      <div style={{ ...card, padding: "16px 20px", marginBottom: 28, fontSize: 14, color: CP.textSecondary, lineHeight: 1.6 }}>
        <p style={{ margin: "0 0 8px" }}><b style={{ fontWeight: 500, color: CP.textPrimary }}>Lascia il turno meglio di come l&apos;hai trovato.</b> Una riga per chi arriva dopo sulla stessa creator: cosa hai in sospeso, quale fan sta per comprare, cosa non ha funzionato.</p>
        <p style={{ margin: "0 0 8px" }}><b style={{ fontWeight: 500, color: CP.textPrimary }}>Se hai un dubbio, chiedi subito.</b> Meglio una domanda in più che un fan perso: il tuo punto di riferimento è lo Spark della tua area o chi coordina il turno.</p>
        <p style={{ margin: 0 }}><b style={{ fontWeight: 500, color: CP.textPrimary }}>Il feedback sul tuo lavoro arriva in privato,</b> breve e scritto: su cosa hai fatto, non su chi sei.</p>
      </div>

      <SectionTitle>Come ci diamo feedback</SectionTitle>
      <div style={{ ...card, padding: "16px 20px", marginBottom: 28, fontSize: 14, color: CP.textSecondary, lineHeight: 1.6 }}>
        <p style={{ margin: "0 0 10px" }}>Tre passi, sempre gli stessi: <b style={{ fontWeight: 500, color: CP.textPrimary }}>cosa hai visto → che effetto ha avuto → una domanda</b>.</p>
        <Esempio prima="Sei stato troppo lento oggi." dopo="Ieri sera tre fan hanno aspettato più di mezz'ora (cosa) e due non hanno comprato (effetto). Cosa ti ha rallentato? (domanda)" />
        <p style={{ margin: "12px 0 0" }}>Per ringraziare vale lo stesso: specifico e sul comportamento. «Grazie per il riepilogo della call: mi ha evitato di rileggere tutto» vale più di «bravo».</p>
      </div>

      <Condivisi />

      <SectionTitle>La leadership da noi: lo Spark</SectionTitle>
      <div style={{ ...card, padding: "16px 20px", marginBottom: 28, fontSize: 14, color: CP.textSecondary, lineHeight: 1.6 }}>
        <p style={{ margin: 0 }}>Lo Spark è la persona di riferimento di un&apos;area. Non è un capo e non viene nominato dall&apos;alto: emerge dal gruppo perché aiuta, tiene insieme, fa circolare le informazioni. <b style={{ fontWeight: 500, color: CP.textPrimary }}>Abilita, non dirige.</b> Chiunque può esserlo, e chiunque può chiedergli una mano.</p>
      </div>

      <p style={{ fontSize: 13, color: CP.textMuted, lineHeight: 1.6 }}>
        Viene dal playbook di House of Creators. Se qualcosa non ti torna o manca, dillo con «Segnala o suggerisci» in basso a destra: la cultura la scriviamo insieme.
        {" "}<Link href="/guida" style={{ color: CP.accentSoftText }}>Guida agli strumenti →</Link>
      </p>
    </div>
  );
}
