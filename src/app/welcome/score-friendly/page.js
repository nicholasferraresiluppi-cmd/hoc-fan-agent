"use client";

import Link from "next/link";
import {
  User, BarChart3, Trophy, Calculator, Award, Combine,
  ArrowRight, Lightbulb, AlertCircle, CheckCircle2,
} from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { SectionLabel, CpCard } from "@/components/cp-style";
import InlineQA from "@/components/InlineQA";

/**
 * /welcome/score-friendly — Tutorial narrativo dello Score Sales CP v3.
 *
 * Pensato per chi entra la prima volta (consulenti, nuovi SM, leadership)
 * e vuole capire la logica senza essere data scientist. Linguaggio corporate
 * professionale, niente slang. Personaggio narrativo Marco con numeri
 * concreti che si trasformano passo passo.
 *
 * Ogni sezione include un componente <InlineQA> con domande pre-scritte +
 * possibilità di fare domande libere risposte dall'AI in tempo reale.
 */
export default function ScoreFriendlyPage() {
  return (
    <div style={{ padding: "32px 28px 80px 28px", maxWidth: 920, margin: "0 auto", color: CP.textPrimary, fontFamily: FONTS.body }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", gap: 10, fontSize: 13, color: CP.textSecondary, marginBottom: 14 }}>
        <Link href="/welcome" style={{ color: "inherit", textDecoration: "none" }}>Welcome</Link>
        <span style={{ color: CP.textMuted }}>›</span>
        <span style={{ color: CP.textPrimary }}>Score Sales CP — guida</span>
      </div>

      {/* Hero */}
      <SectionLabel>Guida · Score Sales CP v3</SectionLabel>
      <h1 style={heroTitle}>
        Come funziona <span style={{ color: CP.accentGreen }}>lo score</span>, raccontato con un esempio
      </h1>
      <p style={heroSub}>
        Seguiamo passo passo il calcolo dello score di <b>Marco</b>, un chatter che lavora su due creator dell&apos;agenzia. Ogni sezione ha un pannello dove puoi fare domande se qualcosa non è chiaro.
      </p>

      {/* SEZIONE 1 */}
      <Section icon={User} color="#3B82F6" title="1. Il punto di partenza" badge="La domanda">
        <p style={p}>
          Marco lavora come chatter in agenzia su <b>due creator</b>: Sara e Giulia. Su Sara ha venduto molto, su Giulia molto meno. La domanda è semplice:
        </p>
        <Quote>Marco sta performando bene?</Quote>
        <p style={p}>
          La risposta richiede contesto. Sara potrebbe essere una creator con grande seguito dove vendere è relativamente più semplice. Giulia potrebbe essere una creator più recente o di nicchia dove l&apos;intero team registra volumi contenuti. Confrontare Marco con il suo collega che lavora su Sara è equo; confrontarlo con un collega che lavora su una creator diversa, meno.
        </p>
        <p style={p}>
          Per questo motivo lo score non si limita a sommare i suoi sales totali. Calcola un punteggio <b>per ciascuna coppia operatore × creator</b>, e poi li compone.
        </p>
        <InlineQA
          sectionId="1-il-punto-di-partenza"
          presets={[
            { q: "Perché non basta guardare solo i sales totali?", a: "Perché due operatori con gli stessi sales totali possono avere percorsi molto diversi: uno potrebbe lavorare su creator forti dove vendere è oggettivamente più semplice, l'altro su creator difficili dove ogni vendita è un risultato. Sommare i sales non considera questa differenza. Lo score normalizza il contributo di ciascun operatore al contesto in cui opera." },
            { q: "Cos'è una 'creator difficile'?", a: "Nel linguaggio agenzia, una creator dove l'intera squadra di chatter registra sales/turno medi più bassi rispetto alle altre. Può dipendere dal pubblico (più piccolo o meno spendente), dal posizionamento (di nicchia), o dalla fase di lancio (account giovane). Non è un giudizio sulla persona, è una descrizione del contesto commerciale." },
            { q: "Quali dati usate per il calcolo?", a: "Solo dati reali provenienti da CreatorsPro: turni di lavoro effettivi, sales attribuite tramite i takes (= singole transazioni con creator esatto). Non usiamo metriche di efficienza-chat di Infloww nello score — sono mostrate separatamente come informazione contestuale." },
          ]}
        />
      </Section>

      {/* SEZIONE 2 */}
      <Section icon={BarChart3} color="#10B981" title="2. I due indicatori base" badge="KPI">
        <p style={p}>
          Per ogni coppia (Marco × Sara) e (Marco × Giulia) calcoliamo <b>due indicatori</b>.
        </p>

        <h3 style={h3}>Indicatore 1 — Sales per shift</h3>
        <p style={p}>Quanto vende Marco in media per ogni turno completato.</p>
        <Example>
          Marco ha effettuato <b>10 turni</b> su Sara, generando in totale <b>$5.000</b>.<br />
          → Sales per shift = 5.000 ÷ 10 = <b>$500 a turno</b>
        </Example>

        <h3 style={h3}>Indicatore 2 — Consistency (regolarità)</h3>
        <p style={p}>Misura quanto i sales dei singoli turni sono uniformi tra loro. Un operatore regolare è più prevedibile e quindi più gestibile.</p>
        <Example>
          <b>Marco</b> su Sara — sales dei 10 turni:<br />
          $480, $520, $510, $490, $500, $510, ... (sempre intorno a $500)<br />
          → <span style={{ color: CP.accentGreen, fontWeight: 700 }}>Consistency alta</span>
          <br /><br />
          <b>Luigi</b> (collega) su Sara — sales dei 10 turni:<br />
          $50, $1.500, $30, $1.200, $40, ... (molto variabili)<br />
          → <span style={{ color: CP.accentRed, fontWeight: 700 }}>Consistency bassa</span>
        </Example>
        <p style={p}>
          A parità di sales medio, Marco è preferibile perché ogni suo turno produce un valore prevedibile. Con Luigi il manager fa più fatica a pianificare e dipende molto dalla giornata.
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

      {/* SEZIONE 3 */}
      <Section icon={Trophy} color="#A855F7" title="3. Da numero a posizione: il percentile" badge="Trasformazione">
        <p style={p}>
          Sapere che Marco fa $500 a turno, da solo, dice poco. Quanto vale $500 nel contesto? Per rispondere trasformiamo il numero in una <b>posizione di classifica</b>, chiamata percentile.
        </p>
        <Quote>Il percentile è una posizione su 100: indica quanti operatori sono dietro di te.</Quote>
        <Example>
          In una classifica di 100 colleghi:<br />
          • Se sei <b>10° migliore</b> → percentile <b>90</b> (sei davanti al 90% degli altri)<br />
          • Se sei in <b>mezzo</b> (50°) → percentile <b>50</b> (in linea con la media)<br />
          • Se sei <b>90°</b> → percentile <b>10</b> (solo il 10% sta dietro di te)
        </Example>
        <p style={p}>
          Più alto è il percentile, migliore è la performance relativa. Lo score lo userà per dare a Marco una posizione che ha senso indipendentemente dai valori assoluti delle vendite.
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

      {/* SEZIONE 4 */}
      <Section icon={Combine} color="#F59E0B" title="4. Due classifiche diverse, combinate" badge="Il blend 70/30">
        <p style={p}>
          Per Marco su Sara calcoliamo non una, ma <b>due</b> posizioni di classifica:
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14, marginBottom: 16 }}>
          <CpCard accent="#3B82F6" padding="16px 18px">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Trophy size={14} color="#3B82F6" />
              <b>Classifica vs Creator</b>
            </div>
            <p style={pSm}>
              Tra gli operatori che lavorano <b>sulla stessa creator (Sara)</b>.
              Marco è 2° su 8 → <b>percentile 87</b>.
            </p>
          </CpCard>
          <CpCard accent="#10B981" padding="16px 18px">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Trophy size={14} color="#10B981" />
              <b>Classifica vs Agenzia</b>
            </div>
            <p style={pSm}>
              Tra tutti i <b>150 chatter dell&apos;agenzia</b>.
              Marco è 70° su 150 → <b>percentile 53</b>.
            </p>
          </CpCard>
        </div>

        <h3 style={h3}>Perché due classifiche e non una</h3>
        <p style={p}>
          Usare una sola classifica produce distorsioni note:
        </p>
        <ul style={ul}>
          <li><b>Solo "vs Creator":</b> se Sara è una creator dove l&apos;intero team registra performance contenute, Marco potrebbe risultare Elite anche con $300 a turno (valore basso in assoluto). Lo score sopravvaluterebbe il suo merito reale.</li>
          <li><b>Solo "vs Agenzia":</b> se Sara è una creator dove anche i top performer raramente superano certi volumi, Marco verrebbe penalizzato anche se sta lavorando bene rispetto al contesto in cui opera.</li>
        </ul>

        <h3 style={h3}>La soluzione: combinare 70% + 30%</h3>
        <Example>
          <code style={code}>Score_sales/shift = 70% × (percentile vs Creator) + 30% × (percentile vs Agenzia)</code>
          <br /><br />
          Per Marco su Sara:<br />
          = 70% × 87 + 30% × 53<br />
          = 60,9 + 15,9<br />
          = <b>76,8</b>
        </Example>
        <p style={p}>
          Il 70% privilegia il confronto con i pari diretti (corretto: si paragonano mele con mele). Il 30% mantiene un ancoraggio assoluto che impedisce di promuovere come Elite chi è solo &quot;meno peggio&quot; in un contesto debole.
        </p>

        <InlineQA
          sectionId="4-blend-70-30"
          presets={[
            { q: "Perché 70/30 e non 50/50?", a: "Perché il 'merito locale' (sei tra i migliori dove lavori) è il segnale più importante per gestire una squadra. Il 30% sul confronto agenzia-wide è sufficiente per evitare distorsioni nei contesti deboli, ma non così alto da penalizzare ingiustamente chi opera su creator strutturalmente meno performanti. È un trade-off calibrato sull'esperienza HOC." },
            { q: "Cosa succede se una creator ha pochi operatori?", a: "La classifica vs Creator funziona anche con 2-3 operatori. Se la creator ha un solo operatore attivo, il percentile vs Creator diventa poco informativo (è sempre 50). In questi casi pesa di più il vs Agenzia. È raro: tipicamente ogni creator ha più operatori in rotazione." },
            { q: "I pesi sono modificabili?", a: "Tecnicamente sì, sono definiti nella costante SCORE_BLEND in src/lib/creator-aggregates.js. Vanno modificati con cautela: cambiarli sposta tutte le classifiche e quindi le decisioni HR. Una modifica dovrebbe essere preceduta da un test sui dati storici per valutare l'impatto." },
          ]}
        />
      </Section>

      {/* SEZIONE 5 */}
      <Section icon={Calculator} color="#10B981" title="5. Lo score finale per (Marco × Sara)" badge="Composizione">
        <p style={p}>
          A questo punto Marco su Sara ha:<br />
          • Score sales/shift = <b>76,8</b><br />
          • Consistency = <b>0,92</b> (su 1) = <b>92</b> (su 100)
        </p>
        <p style={p}>
          Li combiniamo in un&apos;unica formula. I sales pesano l&apos;85%, la consistency il 15%.
        </p>
        <Example>
          <code style={code}>Score(Marco, Sara) = 85% × 76,8 + 15% × 92</code>
          <br />
          = 65,3 + 13,8<br />
          = <b style={{ color: "#3B82F6" }}>79,1</b> → <b>STRONG</b>
        </Example>
        <p style={p}>
          Marco su Sara è classificato <b>Strong</b>, ossia tra il top 25% degli operatori dell&apos;agenzia su questa specifica coppia.
        </p>

        <h3 style={h3}>I sei tier</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginTop: 12 }}>
          {[
            { tier: "Elite",    range: "90-100", color: "#A855F7", desc: "Top 10%, performance di eccellenza" },
            { tier: "Strong",   range: "75-89",  color: "#3B82F6", desc: "Top 25%, solidi performer" },
            { tier: "Good",     range: "50-74",  color: "#10B981", desc: "Top 50%, affidabili" },
            { tier: "Average",  range: "25-49",  color: "#9CA3AF", desc: "Top 75%, in linea con la media" },
            { tier: "Weak",     range: "10-24",  color: "#F59E0B", desc: "Top 90%, area di monitoraggio" },
            { tier: "Critical", range: "0-9",    color: "#EF4444", desc: "Bottom 10%, performance non sostenibili" },
          ].map((t) => (
            <div key={t.tier} style={{ padding: "10px 14px", background: t.color + "10", border: `1px solid ${t.color}55`, borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ padding: "2px 9px", background: t.color, color: "#0a0a0a", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}>{t.tier.toUpperCase()}</span>
                <span style={{ fontSize: 11, color: CP.textMuted, fontFamily: FONTS.mono }}>{t.range}</span>
              </div>
              <div style={{ fontSize: 12, color: CP.textSecondary }}>{t.desc}</div>
            </div>
          ))}
        </div>

        <InlineQA
          sectionId="5-score-finale-coppia"
          presets={[
            { q: "Perché la consistency pesa solo il 15%?", a: "Perché il sales/shift è il KPI primario di business: misura direttamente quanto valore l'operatore genera. La consistency è un modificatore qualitativo: a parità di sales premia chi è più regolare. Pesarla di più rischierebbe di promuovere operatori prudenti ma poco produttivi. Il 15% è sufficiente per dare un vantaggio significativo agli operatori affidabili senza ribaltare la classifica." },
            { q: "Cosa succede se la consistency è 1 (perfetta)?", a: "Aggiunge 15 punti allo score (15% × 100). Esempio: con sales/shift score = 60 e consistency 1, lo score finale = 0,85 × 60 + 0,15 × 100 = 66. Quindi anche un operatore perfettamente regolare può salire al massimo di 15 punti rispetto al solo punteggio sales. È un boost reale ma calibrato." },
            { q: "I tier sono stabili nel tempo?", a: "Sì, la struttura dei tier è fissa: Elite è sempre il top 10%, Strong il 25%, ecc. Quello che cambia mese per mese è chi rientra in ciascun tier. Questo è il vantaggio del tiering basato su percentile: garantisce che le etichette mantengano sempre lo stesso significato relativo, anche se la performance assoluta dell'agenzia migliora o peggiora." },
          ]}
        />
      </Section>

      {/* SEZIONE 6 */}
      <Section icon={Award} color="#3B82F6" title="6. Marco lavora anche su Giulia" badge="Seconda coppia">
        <p style={p}>
          Ripetiamo il calcolo per Marco × Giulia, con dati diversi:
        </p>
        <Example>
          <b>Su Giulia</b>: Marco ha venduto $200 a turno (volumi contenuti). È 5° su 8 operatori che lavorano su Giulia.<br /><br />
          • Percentile vs Creator (Giulia) = <b>38</b><br />
          • Percentile vs Agenzia = <b>20</b><br />
          • Score sales/shift = 70% × 38 + 30% × 20 = <b>32,6</b><br />
          • Consistency 0,60 → 15% × 60 = <b>+9</b><br />
          • <b>Score(Marco, Giulia) = 85% × 32,6 + 15% × 60 = 41,7</b> → <span style={{ color: "#9CA3AF", fontWeight: 700 }}>AVERAGE</span>
        </Example>

        <p style={p}>
          Ora Marco ha due score, uno per ciascuna creator:
        </p>
        <ul style={ul}>
          <li>Su Sara: <b style={{ color: "#3B82F6" }}>79,1 (Strong)</b></li>
          <li>Su Giulia: <b style={{ color: "#9CA3AF" }}>41,7 (Average)</b></li>
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

      {/* SEZIONE 7 */}
      <Section icon={Lightbulb} color="#A855F7" title="7. Il numero finale di Marco (Sales CP)" badge="Aggregato">
        <p style={p}>
          La pagina &quot;Sales CP&quot; mostra <b>un solo numero per operatore</b>. Come lo otteniamo da due score separati? <b>Media pesata sui sales totali</b>.
        </p>
        <Example>
          Marco ha generato:<br />
          • $5.000 su Sara (= <b>83%</b> dei suoi sales totali)<br />
          • $1.000 su Giulia (= <b>17%</b>)<br /><br />
          <code style={code}>Score totale = 79,1 × 83% + 41,7 × 17%</code><br />
          = 65,6 + 7,1<br />
          = <b style={{ color: "#10B981" }}>72,7</b> → <b>GOOD</b>
        </Example>
        <p style={p}>
          Le creator dove Marco genera più fatturato pesano più di quelle marginali. Effetto pratico: <b>non si può essere Elite in classifica Sales CP se si è mediocri sulle creator dove si fa la maggior parte dei sales</b>.
        </p>

        <h3 style={h3}>Le 5 regole-chiave</h3>
        <ol style={ol}>
          <li>Non si può raggiungere <b>Elite</b> con sales bassi in assoluto (il vs Agenzia mantiene l&apos;ancoraggio).</li>
          <li>Non si viene penalizzati per lavorare su creator strutturalmente meno performanti (il vs Creator dà credito locale).</li>
          <li>Le coppie operatore × creator con più sales pesano di più nell&apos;aggregato.</li>
          <li>La regolarità delle performance viene premiata (15% del peso).</li>
          <li>Soglia minima di 3 turni per essere classificati: sotto, lo score appare come <code style={code}>—</code>.</li>
        </ol>

        <InlineQA
          sectionId="7-aggregato"
          presets={[
            { q: "Perché pesate sui sales e non sul numero di turni?", a: "Perché il sales è la misura di valore economico reale per l'agenzia. Pesare sul numero di turni darebbe la stessa importanza a 10 turni che generano $5.000 e a 10 turni che generano $500, mentre nella realtà del business la prima coppia ha generato 10x più valore. Pesare sui sales allinea automaticamente lo score con la priorità commerciale." },
            { q: "Cosa succede se un operatore ha solo coppie sotto i 3 shift?", a: "Lo score aggregato risulta non calcolabile (= 'null' o '—'). Nella leaderboard Sales CP appare comunque per trasparenza, ma con score vuoto. Tipicamente è il caso di nuovi assunti o di chi ha lavorato pochissimo nel mese. Per essere valutati serve raggiungere almeno una coppia operatore × creator con ≥ 3 turni." },
            { q: "Il punteggio cambia molto da mese a mese?", a: "Sì, ed è per disegno. Lo score è calcolato sui dati del singolo periodo e ricalibrato ogni mese. Un operatore può oscillare tra tier in mesi diversi a seconda della sua performance reale. Per identificare pattern stabili (es. underperformer cronici) usiamo il pannello Action Center, che incrocia score correnti con storico dei mesi precedenti." },
            { q: "Come si confronta con lo Score Infloww che vediamo affiancato?", a: "Lo Score Infloww (v1) è basato su KPI di efficienza chat: messaggi inviati, fan unici contattati, conversion rate. Lo Score Sales CP (v3) è basato su sales reali da CreatorsPro. Quando i due divergono molto è informativo: un operatore con Infloww alto e CP basso è bravo a chattare ma non converte; viceversa, CP alto e Infloww basso suggerisce che vende molto magari grazie a creator forti, indipendentemente dal volume di chat." },
          ]}
        />
      </Section>

      {/* CTA finali */}
      <div style={{ marginTop: 50, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Link href="/leaderboard/sales-cp" style={ctaCard("#10B981")}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BarChart3 size={20} color="#10B981" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Apri Sales CP</div>
              <div style={{ fontSize: 12, color: CP.textSecondary }}>Vedi gli score reali del mese</div>
            </div>
          </div>
          <ArrowRight size={16} color="#10B981" />
        </Link>
        <Link href="/welcome/score-explained" style={ctaCard("#3B82F6")}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Calculator size={20} color="#3B82F6" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Calcolatore interattivo</div>
              <div style={{ fontSize: 12, color: CP.textSecondary }}>Simula uno score con slider</div>
            </div>
          </div>
          <ArrowRight size={16} color="#3B82F6" />
        </Link>
      </div>
    </div>
  );
}

/* ============== sub-components ============== */

function Section({ icon: Icon, color, title, badge, children }) {
  return (
    <div style={{ marginTop: 46 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${color}22`, border: `1px solid ${color}66`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon size={19} color={color} strokeWidth={2} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          {badge && (
            <div style={{ fontSize: 10, color: CP.textMuted, fontFamily: FONTS.mono, fontWeight: 700, letterSpacing: "0.12em" }}>{badge}</div>
          )}
          <h2 style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 700, margin: "2px 0 0 0", letterSpacing: "-0.015em", color: CP.textPrimary }}>{title}</h2>
        </div>
      </div>
      <div style={{ paddingLeft: 52 }}>{children}</div>
    </div>
  );
}

function Quote({ children }) {
  return (
    <div style={{
      borderLeft: `3px solid ${CP.accentGreen}`,
      padding: "8px 14px",
      margin: "12px 0",
      color: CP.textPrimary,
      fontStyle: "italic",
      fontSize: 15,
      background: CP.accentGreen + "08",
      borderRadius: "0 8px 8px 0",
    }}>
      {children}
    </div>
  );
}

function Example({ children }) {
  return (
    <div style={{
      padding: "14px 18px",
      background: CP.surface,
      border: `1px dashed ${CP.borderStrong}`,
      borderRadius: 10,
      margin: "12px 0",
      fontSize: 13,
      color: CP.textPrimary,
      lineHeight: 1.6,
    }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: CP.textMuted, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>Esempio</div>
      {children}
    </div>
  );
}

const heroTitle = { fontFamily: FONTS.display, fontSize: 38, fontWeight: 700, margin: "10px 0 12px 0", letterSpacing: "-0.025em", lineHeight: 1.15 };
const heroSub = { color: CP.textSecondary, fontSize: 16, margin: 0, lineHeight: 1.6, maxWidth: 820 };
const p = { color: CP.textSecondary, fontSize: 14, lineHeight: 1.65, margin: "0 0 10px 0" };
const pSm = { color: CP.textSecondary, fontSize: 13, margin: 0, lineHeight: 1.55 };
const h3 = { fontFamily: FONTS.display, fontSize: 16, fontWeight: 700, color: CP.textPrimary, margin: "20px 0 8px 0", letterSpacing: "-0.01em" };
const ul = { color: CP.textSecondary, fontSize: 14, lineHeight: 1.7, paddingLeft: 22, margin: "8px 0" };
const ol = { color: CP.textSecondary, fontSize: 14, lineHeight: 1.7, paddingLeft: 22, margin: "8px 0" };
const code = { background: CP.surfaceAlt, padding: "2px 8px", borderRadius: 4, fontFamily: FONTS.mono, fontSize: 13, color: CP.textPrimary };
const ctaCard = (col) => ({
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "18px 22px",
  background: CP.surface,
  border: `1px solid ${col}44`,
  borderRadius: 12,
  textDecoration: "none",
  color: CP.textPrimary,
});
