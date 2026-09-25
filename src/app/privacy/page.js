// Informativa privacy pubblica di HOC Pro. Serve anche come "Privacy policy
// URL" della schermata di consenso Google OAuth (login "Continua con Google").
// Testo base: da far rivedere al legale prima di usi diversi dal login interno.
import { CP } from "@/lib/brand";

export const metadata = { title: "Privacy · HOC Pro" };

const h2 = { fontSize: 17, fontWeight: 500, margin: "28px 0 8px", color: CP.textPrimary };
const p = { fontSize: 14, lineHeight: 1.7, color: CP.textSecondary, margin: "0 0 10px" };

export default function PrivacyPage() {
  return (
    <main style={{ background: CP.bg, minHeight: "100vh", padding: "48px 16px 64px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ fontSize: 12, color: CP.textMuted, marginBottom: 6 }}>HOC Pro · House of Creators</div>
        <h1 style={{ fontSize: 28, fontWeight: 500, color: CP.textPrimary, margin: "0 0 6px" }}>Informativa privacy</h1>
        <p style={{ ...p, color: CP.textMuted }}>Ultimo aggiornamento: 25 settembre 2026</p>

        <h2 style={h2}>Cos'è HOC Pro</h2>
        <p style={p}>HOC Pro è lo strumento interno di House of Creators per la formazione, il coaching e l'organizzazione del lavoro del team. L'accesso è riservato alle persone invitate dall'azienda.</p>

        <h2 style={h2}>Quali dati usiamo per l'accesso</h2>
        <p style={p}>Per farti entrare usiamo il tuo indirizzo email e, se scegli "Continua con Google", il nome, l'email e l'immagine del profilo che Google ci comunica. Non chiediamo accesso a Gmail, Drive, Calendar o ad altri dati del tuo account Google, e non pubblichiamo nulla a tuo nome.</p>
        <p style={p}>L'autenticazione è gestita dal fornitore Clerk (clerk.com), che conserva i dati necessari al login per nostro conto.</p>

        <h2 style={h2}>Dati di lavoro</h2>
        <p style={p}>Nell'app trovi dati sul tuo lavoro in House of Creators (turni, risultati, attività di formazione). Servono a gestire il rapporto di lavoro, a darti feedback e a organizzare la formazione. Ognuno vede i dati che gli competono in base al proprio ruolo.</p>

        <h2 style={h2}>Con chi li condividiamo</h2>
        <p style={p}>Non vendiamo né cediamo dati a terzi. Li trattano solo i fornitori tecnici che fanno funzionare il servizio (hosting Vercel, database, autenticazione Clerk, servizi di intelligenza artificiale per la simulazione di formazione), vincolati a usarli solo per questo scopo.</p>

        <h2 style={h2}>Per quanto tempo</h2>
        <p style={p}>I dati di accesso restano finché hai un account; alla chiusura dell'account vengono cancellati. I dati di lavoro seguono i tempi di conservazione previsti per il rapporto di lavoro.</p>

        <h2 style={h2}>I tuoi diritti</h2>
        <p style={p}>Puoi chiedere di vedere, correggere o cancellare i tuoi dati, o opporti al loro uso, scrivendo a House of Creators dall'indirizzo aziendale (i riferimenti sono nel tuo contratto o nella comunicazione di invito). Puoi anche rivolgerti al Garante per la protezione dei dati personali.</p>
      </div>
    </main>
  );
}
