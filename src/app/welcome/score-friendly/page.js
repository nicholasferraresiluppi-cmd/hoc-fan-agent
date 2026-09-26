"use client";

import Link from "next/link";
import {
  User, BarChart3, Trophy, Calculator, Award, Combine,
  ArrowRight, Lightbulb,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Notice, card, NUM } from "@/components/ds";
import InlineQA from "@/components/InlineQA";

import { tierLabel } from "@/lib/tier-label";
/**
 * /welcome/score-friendly — Guida narrativa allo score Vendite (score CP v3).
 *
 * Per chi entra la prima volta (operatori, nuovi SM, leadership): la logica
 * dello score senza essere data scientist. Personaggio narrativo Marco con
 * numeri concreti che si trasformano passo passo. Ogni sezione ha un <InlineQA>
 * con domande pre-scritte + domanda libera (risposta AI).
 *
 * Redesign 26/09/2026 sul design system. Contenuto riallineato al codice
 * (src/lib/creator-aggregates.js): lo score aggregato è pesato sui TURNI (v3.1),
 * non sui sales; l'altro score si chiama Mestiere (fasce v12).
 */

// Fasce dello score Vendite (soglie di tierFromPercentile in creator-aggregates.js).
// Il colore porta solo il segnale: verde = sopra, rosso = da guardare.
const TIERS = [
  { tier: "Elite",    range: "90–100", desc: "La fascia più alta: risultati eccellenti e costanti" },
  { tier: "Strong",   range: "75–89",  desc: "Sopra la media in modo netto" },
  { tier: "Good",     range: "50–74",  desc: "Nella metà alta: risultati affidabili" },
  { tier: "Average",  range: "25–49",  desc: "Vicino alla media, nella metà bassa" },
  { tier: "Weak",     range: "10–24",  desc: "Sotto la media: c'è qualcosa da capire insieme al tuo responsabile" },
  { tier: "Critical", range: "0–9",    desc: "La fascia più bassa: se si ripete, il caso viene rivisto nella revisione mensile" },
];
function tierColor(t) {
  if (t === "Elite" || t === "Strong") return CP.accentGreen;
  return CP.textSecondary;
}

export default function ScoreFriendlyPage() {
  return (
    <div style={{ padding: "28px 24px 64px", maxWidth: 880, margin: "0 auto", fontFamily: FONTS.body, color: CP.textPrimary }}>
      <PageHead
        crumbs={[{ label: "Benvenuto", href: "/welcome" }, { label: "Score Vendite, la guida" }]}
        title="Come funziona lo score Vendite, con un esempio"
        subtitle="Seguiamo passo passo il calcolo dello score di Marco, che lavora su due creator. In ogni passo c'è un pannello per fare domande se qualcosa non è chiaro."
      />

      <Notice>
        In HOC Pro ci sono due score da 0 a 100. <b style={{ color: CP.textPrimary, fontWeight: 500 }}>Vendite</b> (questa guida) misura quanto vendi per turno: pesa per il 70% il confronto con chi lavora sulla stessa creator e per il 30% quello con tutta l&apos;agenzia, ed è quello usato nelle revisioni mensili. <b style={{ color: CP.textPrimary, fontWeight: 500 }}>Mestiere</b> misura come lavori in chat (dai dati di Infloww) ed è quello del percorso di carriera. Possono essere diversi, ed è normale.
      </Notice>

      {/* 1 */}
      <Section icon={User} step="1" title="Il punto di partenza">
        <p style={p}>
          Marco lavora in chat su <b style={b}>due creator</b>: Sara e Giulia. Su Sara ha venduto molto, su Giulia molto meno. La domanda è semplice:
        </p>
        <Quote>Marco sta lavorando bene?</Quote>
        <p style={p}>
          Per rispondere serve il contesto. Sara potrebbe avere un grande seguito, dove vendere è più facile. Giulia potrebbe essere più recente o di nicchia, e lì tutto il team vende poco. Confrontare Marco con un collega che lavora su Sara è giusto; confrontarlo con chi lavora su un&apos;altra creator, meno.
        </p>
        <p style={p}>
          Per questo lo score non somma le vendite totali. Calcola un punteggio <b style={b}>per ogni coppia operatore × creator</b>, e poi li mette insieme.
        </p>
        <InlineQA
          sectionId="1-il-punto-di-partenza"
          presets={[
            { q: "Perché non basta guardare solo i sales totali?", a: "Perché due operatori con gli stessi sales totali possono avere percorsi molto diversi: uno potrebbe lavorare su creator forti dove vendere è oggettivamente più semplice, l'altro su creator difficili dove ogni vendita è un risultato. Sommare i sales non considera questa differenza. Lo score normalizza il contributo di ciascun operatore al contesto in cui opera." },
            { q: "Cos'è una 'creator difficile'?", a: "Nel linguaggio agenzia, una creator dove l'intera squadra di chatter registra sales/turno medi più bassi rispetto alle altre. Può dipendere dal pubblico (più piccolo o meno spendente), dal posizionamento (di nicchia), o dalla fase di lancio (account giovane). Non è un giudizio sulla persona, è una descrizione del contesto commerciale." },
            { q: "Quali dati usate per il calcolo?", a: "Solo dati reali provenienti da CreatorsPro: turni di lavoro effettivi, sales attribuite tramite i takes (= singole transazioni con creator esatto). Le metriche di lavoro in chat di Infloww non entrano in questo score: stanno nell'altro score, Mestiere." },
          ]}
        />
      </Section>

      {/* 2 */}
      <Section icon={BarChart3} step="2" title="I due indicatori di base">
        <p style={p}>Per ogni coppia (Marco × Sara) e (Marco × Giulia) calcoliamo <b style={b}>due indicatori</b>.</p>

        <h3 style={h3}>Indicatore 1: vendite per turno</h3>
        <p style={p}>Quanto vende Marco, in media, in ogni turno completato.</p>
        <Example>
          Marco ha fatto <b style={b}>10 turni</b> su Sara e ha venduto in totale <b style={b}>$5.000</b>.<br />
          → Vendite per turno = 5.000 ÷ 10 = <b style={b}>$500 a turno</b>
        </Example>

        <h3 style={h3}>Indicatore 2: regolarità (consistency)</h3>
        <p style={p}>Misura quanto le vendite dei singoli turni si somigliano. Chi è regolare è più prevedibile, e il team si organizza meglio.</p>
        <Example>
          <b style={b}>Marco</b> su Sara, vendite dei 10 turni:<br />
          $480, $520, $510, $490, $500, $510, … (sempre intorno a $500)<br />
          → regolarità <span style={{ color: CP.accentGreen }}>alta</span>
          <br /><br />
          <b style={b}>Luigi</b> (collega) su Sara, vendite dei 10 turni:<br />
          $50, $1.500, $30, $1.200, $40, … (molto variabili)<br />
          → regolarità <span style={{ color: CP.accentRed }}>bassa</span>
        </Example>
        <p style={p}>
          A parità di vendite medie, il turno di Marco dà un risultato prevedibile. Con Luigi è più difficile pianificare: molto dipende dalla giornata.
        </p>

        <InlineQA
          sectionId="2-indicatori-base"
          presets={[
            { q: "Cos'è esattamente uno 'shift'?", a: "Lo shift è l'unità di tempo lavorativo standard registrata in CreatorsPro. Tipicamente corrisponde a un turno della durata prevista dal team. Lo score considera il singolo shift come unità atomica: se un operatore estende il turno con qualche ora extra, le ore extra sono visibili come informazione contestuale ma non alterano il calcolo." },
            { q: "Come misurate tecnicamente la consistency?", a: "Tramite il coefficiente di variazione invertito: 1 − (deviazione standard / media) sui sales dei singoli turni. Il risultato è normalizzato in un range 0-1, dove 1 = perfettamente costante (orologio svizzero) e 0 = molto variabile. Il valore viene poi moltiplicato per 100 quando entra nello score finale, per uniformare le scale." },
            { q: "Perché contate solo sales/shift e non sales/ora?", a: "Perché il modello di lavoro reale in HOC è basato sui turni: tutti gli operatori effettuano shift di durata standard, occasionalmente estesi con qualche ora extra. Inserire 'sales per ora' come KPI separato darebbe peso eccessivo a un'eccezione (l'estensione) rispetto al pattern ordinario (lo shift completo). Le ore extra restano visibili come dato di contesto." },
            { q: "Perché solo 2 indicatori e non altri?", a: "Per mantenere lo score interpretabile e robusto. Indicatori aggiuntivi (es. tasso di apertura, fan unici contattati) aggiungerebbero informazione ma anche rumore. La scelta è di concentrare il segnale sui sales reali, che è il KPI che riflette il business. Altri KPI sono comunque visibili nei drill-down ma non entrano nello score." },
          ]}
        />
      </Section>

      {/* 3 */}
      <Section icon={Trophy} step="3" title="Da numero a posizione: il percentile">
        <p style={p}>
          Sapere che Marco fa $500 a turno, da solo, dice poco. Quanto vale $500 in quel contesto? Per rispondere trasformiamo il numero in una <b style={b}>posizione</b>, chiamata percentile.
        </p>
        <Quote>Il percentile è una posizione su 100: dice quanta parte del gruppo sta dietro di te.</Quote>
        <Example>
          In un gruppo di 100 colleghi:<br />
          • chi è <b style={b}>10°</b> → percentile <b style={b}>90</b> (davanti al 90% degli altri)<br />
          • chi è a <b style={b}>metà</b> (50°) → percentile <b style={b}>50</b> (in linea con la media)<br />
          • chi è <b style={b}>90°</b> → percentile <b style={b}>10</b> (solo il 10% sta dietro)
        </Example>
        <p style={p}>
          Più alto è il percentile, migliore è il risultato rispetto agli altri. Così la posizione di Marco ha senso qualunque sia il livello delle vendite di quel mese.
        </p>
        <InlineQA
          sectionId="3-percentile"
          presets={[
            { q: "Perché usate il percentile invece della media?", a: "La media nasconde la distribuzione. Due operatori possono essere entrambi 'sopra la media' ma uno è leggermente sopra e l'altro è il top assoluto. Il percentile descrive la posizione con maggiore precisione. Inoltre la media può essere distorta da pochi valori estremi (es. un super-performer), mentre il percentile è più stabile." },
            { q: "Come gestite i pari merito?", a: "Usiamo la formula del 'percentile rank con pareggi' standard: i valori uguali ricevono il punteggio medio della loro posizione. Esempio: se 3 operatori sono a pari merito al 5°-7° posto, ricevono tutti percentile corrispondente al 6°. Evita distorsioni quando ci sono cluster di operatori con performance simili." },
            { q: "Il percentile cambia ogni mese?", a: "Sì. Viene ricalcolato su tutti gli operatori del periodo in oggetto (mese, settimana o trimestre). Questo significa che la classifica è sempre aggiornata alla realtà recente, non bloccata su benchmark di anni precedenti che potrebbero non essere più rappresentativi." },
          ]}
        />
      </Section>

      {/* 4 */}
      <Section icon={Combine} step="4" title="Due confronti, messi insieme (70/30)">
        <p style={p}>Per Marco su Sara calcoliamo non uno, ma <b style={b}>due</b> percentili:</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, margin: "12px 0 16px" }}>
          <div style={{ ...card, padding: "14px 16px" }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Confronto sulla creator</div>
            <p style={pSm}>Con chi lavora <b style={b}>sulla stessa creator (Sara)</b>. Marco è tra i primi → <b style={b}>percentile 87</b>.</p>
          </div>
          <div style={{ ...card, padding: "14px 16px" }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Confronto con l&apos;agenzia</div>
            <p style={pSm}>Con <b style={b}>tutti i chatter dell&apos;agenzia</b>. Marco è poco sopra la metà → <b style={b}>percentile 53</b>.</p>
          </div>
        </div>

        <h3 style={h3}>Perché due confronti e non uno</h3>
        <p style={p}>Un solo confronto porta errori noti:</p>
        <ul style={ul}>
          <li><b style={b}>Solo sulla creator:</b> se su Sara tutto il team vende poco, Marco potrebbe risultare «Eccellente» anche con $300 a turno. Lo score esagererebbe il suo merito.</li>
          <li><b style={b}>Solo con l&apos;agenzia:</b> se su Sara anche i migliori vendono poco, Marco verrebbe penalizzato anche lavorando bene per quel contesto.</li>
        </ul>

        <h3 style={h3}>La soluzione: 70% + 30%</h3>
        <Example>
          <Formula>Vendite per turno (score) = 70% × percentile sulla creator + 30% × percentile con l&apos;agenzia</Formula>
          <br />
          Per Marco su Sara:<br />
          = 70% × 87 + 30% × 53<br />
          = 60,9 + 15,9<br />
          = <b style={b}>76,8</b>
        </Example>
        <p style={p}>
          Il 70% dà più peso al confronto con chi fa lo stesso lavoro nelle stesse condizioni. Il 30% tiene un ancoraggio a tutta l&apos;agenzia, così nessuno risulta «Eccellente» solo perché è &quot;il meno peggio&quot; in un contesto debole.
        </p>

        <InlineQA
          sectionId="4-blend-70-30"
          presets={[
            { q: "Perché 70/30 e non 50/50?", a: "Perché il 'merito locale' (sei tra i migliori dove lavori) è il segnale più importante per gestire una squadra. Il 30% sul confronto agenzia-wide è sufficiente per evitare distorsioni nei contesti deboli, ma non così alto da penalizzare ingiustamente chi opera su creator strutturalmente meno performanti. È un trade-off calibrato sull'esperienza HOC." },
            { q: "Cosa succede se una creator ha pochi operatori?", a: "La classifica vs Creator funziona anche con 2-3 operatori. Se la creator ha un solo operatore attivo, il percentile vs Creator vale sempre 50 (neutro), quindi a fare la differenza è solo il confronto con l'agenzia: i pesi 70/30 restano gli stessi. È raro: tipicamente ogni creator ha più operatori in rotazione." },
            { q: "I pesi sono modificabili?", a: "Tecnicamente sì, sono definiti nella costante SCORE_BLEND in src/lib/creator-aggregates.js. Vanno modificati con cautela: cambiarli sposta tutte le classifiche e quindi le decisioni HR. Una modifica dovrebbe essere preceduta da un test sui dati storici per valutare l'impatto." },
          ]}
        />
      </Section>

      {/* 5 */}
      <Section icon={Calculator} step="5" title="Lo score di Marco su Sara">
        <p style={p}>
          A questo punto Marco su Sara ha:<br />
          • vendite per turno (score) = <b style={b}>76,8</b><br />
          • regolarità = <b style={b}>0,92</b> su 1, cioè <b style={b}>92</b> su 100
        </p>
        <p style={p}>Li uniamo in un solo numero: le vendite pesano l&apos;85%, la regolarità il 15%.</p>
        <Example>
          <Formula>Score(Marco, Sara) = 85% × 76,8 + 15% × 92</Formula>
          <br />
          = 65,3 + 13,8<br />
          = <b style={b}>79,1</b> → fascia <b style={b}>«Forte»</b>
        </Example>
        <p style={p}>Su Sara Marco è in fascia <b style={b}>«Forte»</b> (75–89): sopra la media in modo netto.</p>

        <h3 style={h3}>Le sei fasce</h3>
        <TierGrid />

        <InlineQA
          sectionId="5-score-finale-coppia"
          presets={[
            { q: "Perché la consistency pesa solo il 15%?", a: "Perché il sales/shift è il KPI primario di business: misura direttamente quanto valore l'operatore genera. La consistency è un modificatore qualitativo: a parità di sales premia chi è più regolare. Pesarla di più rischierebbe di promuovere operatori prudenti ma poco produttivi. Il 15% è sufficiente per dare un vantaggio significativo agli operatori affidabili senza ribaltare la classifica." },
            { q: "Cosa succede se la consistency è 1 (perfetta)?", a: "Aggiunge 15 punti allo score (15% × 100). Esempio: con sales/shift score = 60 e consistency 1, lo score finale = 0,85 × 60 + 0,15 × 100 = 66. Quindi anche un operatore perfettamente regolare può salire al massimo di 15 punti rispetto al solo punteggio sales. È un boost reale ma calibrato." },
            { q: "I tier sono stabili nel tempo?", a: "Le soglie sono fisse (90, 75, 50, 25, 10) e lo score è fatto di percentili ricalcolati ogni mese: per questo le fasce mantengono lo stesso significato relativo anche se il livello delle vendite dell'agenzia sale o scende. Quello che cambia mese per mese è chi rientra in ciascuna fascia." },
          ]}
        />
      </Section>

      {/* 6 */}
      <Section icon={Award} step="6" title="Marco lavora anche su Giulia">
        <p style={p}>Ripetiamo il calcolo per Marco × Giulia, con dati diversi:</p>
        <Example>
          <b style={b}>Su Giulia</b> Marco ha fatto 5 turni e vende $200 a turno (volumi bassi). Tra i colleghi su Giulia è nella metà bassa.<br /><br />
          • Percentile sulla creator (Giulia) = <b style={b}>38</b><br />
          • Percentile con l&apos;agenzia = <b style={b}>20</b><br />
          • Vendite per turno (score) = 70% × 38 + 30% × 20 = <b style={b}>32,6</b><br />
          • Regolarità 0,60 → 15% × 60 = <b style={b}>+9</b><br />
          • <b style={b}>Score(Marco, Giulia) = 85% × 32,6 + 15% × 60 = 36,7</b> → fascia «Nella media»
        </Example>
        <p style={p}>Ora Marco ha due score, uno per creator:</p>
        <ul style={ul}>
          <li>Su Sara: <b style={b}>79,1 («Forte»)</b>, in 10 turni</li>
          <li>Su Giulia: <b style={b}>36,7 («Nella media»)</b>, in 5 turni</li>
        </ul>

        <InlineQA
          sectionId="6-seconda-coppia"
          presets={[
            { q: "Se un operatore lavora su 1 sola creator, come funziona?", a: "Il calcolo si semplifica: l'operatore ha un solo score per quella coppia, e lo score aggregato totale coincide con quello score (peso 100%). Funziona perfettamente per gli operatori dedicati, basta che abbia raggiunto la soglia minima di 3 turni." },
            { q: "I due score di Marco sono confrontabili tra loro?", a: "Sì e no. Entrambi sono nel range 0-100 con lo stesso significato (tier), quindi a colpo d'occhio è chiaro che Marco è migliore su Sara che su Giulia. Tuttavia il confronto va letto in chiave commerciale: la differenza può dipendere da un mismatch reale (Marco è più portato per Sara) o dalla difficoltà strutturale di Giulia. Il drill-down per creator aiuta a distinguere i due casi." },
            { q: "Cosa significa il limite minimo di 3 shift?", a: "Sotto i 3 turni sulla creator, lo score viene marcato come '—' invece di mostrare un numero. Tre turni è la soglia statistica minima per considerare il dato rappresentativo: con 1 o 2 turni il valore sarebbe troppo influenzato dal singolo episodio (fortunato o sfortunato) per essere usato come base di decisioni HR." },
          ]}
        />
      </Section>

      {/* 7 */}
      <Section icon={Lightbulb} step="7" title="Il numero finale di Marco (Sales CP)">
        <p style={p}>
          La pagina Sales CP mostra <b style={b}>un solo numero per operatore</b>. Come si ottiene da due score? Con una <b style={b}>media pesata sui turni</b>: conta di più la creator su cui passi più tempo.
        </p>
        <Example>
          Marco ha lavorato:<br />
          • 10 turni su Sara (= <b style={b}>2/3</b> dei suoi turni)<br />
          • 5 turni su Giulia (= <b style={b}>1/3</b>)<br /><br />
          <Formula>Score totale = 79,1 × 2/3 + 36,7 × 1/3</Formula><br />
          = 52,7 + 12,2<br />
          ≈ <b style={b}>65,0</b> → fascia <b style={b}>Good</b>
        </Example>
        <p style={p}>
          Effetto pratico: <b style={b}>non si arriva a «Eccellente» nello score Vendite andando male sulle creator dove si passa la maggior parte dei turni</b>. Pochi turni fortunati su una creator non bastano a coprire molti turni deboli su un&apos;altra.
        </p>

        <h3 style={h3}>Le 5 regole da ricordare</h3>
        <ol style={ul}>
          <li>Non si arriva a <b style={b}>«Eccellente»</b> con vendite basse in assoluto: il confronto con l&apos;agenzia fa da ancora.</li>
          <li>Non si viene penalizzati per lavorare su creator dove si vende meno: il confronto sulla creator dà il giusto merito.</li>
          <li>Le creator su cui fai più turni pesano di più nel numero finale.</li>
          <li>La regolarità viene premiata (15% del peso).</li>
          <li>Servono almeno 3 turni su una creator per avere uno score su quella creator: sotto, compare <Formula>—</Formula>.</li>
        </ol>

        <InlineQA
          sectionId="7-aggregato"
          presets={[
            { q: "Perché pesate sui turni e non sui sales?", a: "Perché lo score deve riflettere dove passi il tempo di lavoro, non dove fai i soldi in pochi turni eccezionali. Esempio: chi fa $5.000 in 3 turni su una creator e $1.000 in 10 turni su un'altra non deve risultare «Forte» grazie ai 3 turni d'oro, se 10 turni su 13 sono andati male. Pesare sui turni (v3.1) dà a ogni turno lavorato lo stesso peso." },
            { q: "Cosa succede se un operatore ha solo coppie sotto i 3 shift?", a: "Lo score aggregato risulta non calcolabile (= 'null' o '—'). Nella leaderboard Sales CP appare comunque per trasparenza, ma con score vuoto. Tipicamente è il caso di nuovi assunti o di chi ha lavorato pochissimo nel mese. Per essere valutati serve raggiungere almeno una coppia operatore × creator con ≥ 3 turni." },
            { q: "Il punteggio cambia molto da mese a mese?", a: "Sì, ed è per disegno. Lo score è calcolato sui dati del singolo periodo e ricalibrato ogni mese. Un operatore può oscillare tra tier in mesi diversi a seconda della sua performance reale. Per identificare pattern stabili (es. underperformer cronici) usiamo il pannello Action Center, che incrocia score correnti con storico dei mesi precedenti." },
            { q: "Come si confronta con l'altro score, Mestiere?", a: "Mestiere viene dall'export di Infloww e misura come lavori in chat: quota di fan che comprano, PPV sbloccati, spesa per fan pagante, vendite all'ora e altre voci. Ogni voce è confrontata con la media del tuo gruppo; se nel gruppo siete meno di 5, con la media degli operatori della tua lingua. Le fasce sono: «Da costruire» sotto 15, «In crescita» 15–27, «Nella media» 27–44, «Buona» 44–61, «Forte» 61–75, «Eccellente» da 75. Vendite serve alle revisioni mensili, Mestiere al percorso di carriera. Quando divergono è informativo: Mestiere alto e Vendite basso indica un buon lavoro in chat che converte poco; il contrario può indicare vendite aiutate da creator forti." },
          ]}
        />
      </Section>

      {/* Dove andare adesso */}
      <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        <Link href="/leaderboard/sales-cp" style={ctaCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BarChart3 size={18} color={CP.textMuted} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 15 }}>Apri Sales CP</div>
              <div style={{ fontSize: 12, color: CP.textSecondary }}>Gli score reali del mese</div>
            </div>
          </div>
          <ArrowRight size={16} color={CP.accentSoftText} />
        </Link>
        <Link href="/welcome/score-explained" style={ctaCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Calculator size={18} color={CP.textMuted} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 15 }}>Calcolatore</div>
              <div style={{ fontSize: 12, color: CP.textSecondary }}>Prova a cambiare i valori e guarda lo score</div>
            </div>
          </div>
          <ArrowRight size={16} color={CP.accentSoftText} />
        </Link>
      </div>
    </div>
  );
}

/* ============== sotto-componenti ============== */

function Section({ icon: Icon, step, title, children }) {
  return (
    <section style={{ marginTop: 36 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: CP.surfaceAlt, border: `1px solid ${CP.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={17} color={CP.textSecondary} strokeWidth={1.8} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, color: CP.textMuted }}>Passo {step} di 7</div>
          <h2 style={{ fontSize: 20, fontWeight: 500, margin: "2px 0 0", letterSpacing: "-0.01em", color: CP.textPrimary }}>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function Quote({ children }) {
  return (
    <div style={{ borderLeft: `3px solid ${CP.accent}`, padding: "8px 14px", margin: "12px 0", color: CP.textPrimary, fontSize: 15 }}>
      {children}
    </div>
  );
}

function Example({ children }) {
  return (
    <div style={{ ...card, padding: "14px 16px", margin: "12px 0", fontSize: 14, color: CP.textSecondary, lineHeight: 1.65, ...NUM }}>
      <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 6 }}>Esempio</div>
      {children}
    </div>
  );
}

function Formula({ children }) {
  return <code style={{ background: CP.surfaceAlt, padding: "2px 8px", borderRadius: 4, fontFamily: FONTS.body, fontSize: 13, color: CP.textPrimary, ...NUM }}>{children}</code>;
}

function TierGrid() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginTop: 10 }}>
      {TIERS.map((t) => (
        <div key={t.tier} style={{ ...card, padding: "10px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: tierColor(t.tier), flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: CP.textPrimary }}>{tierLabel(t.tier)}</span>
            <span style={{ fontSize: 12, color: CP.textMuted, ...NUM }}>{t.range}</span>
          </div>
          <div style={{ fontSize: 13, color: CP.textSecondary, lineHeight: 1.45 }}>{t.desc}</div>
        </div>
      ))}
    </div>
  );
}

const b = { color: CP.textPrimary, fontWeight: 500 };
const p = { color: CP.textSecondary, fontSize: 14, lineHeight: 1.65, margin: "0 0 10px" };
const pSm = { color: CP.textSecondary, fontSize: 13, margin: 0, lineHeight: 1.55 };
const h3 = { fontSize: 15, fontWeight: 500, color: CP.textPrimary, margin: "18px 0 8px" };
const ul = { color: CP.textSecondary, fontSize: 14, lineHeight: 1.7, paddingLeft: 22, margin: "8px 0" };
const ctaCard = {
  ...card,
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  padding: "16px 18px", textDecoration: "none", color: CP.textPrimary,
};
