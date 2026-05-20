/**
 * HOC Fan Agent — Operational Leaderboard Config
 *
 * Configurazione per la leaderboard operativa (basata su dati Infloww
 * importati via CSV). Replicata fedelmente dalla scheda "⚙️ Settings"
 * dello Sheets "Agency KPIs Sheet" di HOC.
 *
 * Score 0-100 calcolato per ogni operatore × group (team modella) come somma
 * pesata di 9 KPI di efficienza. Le metriche di volume (Sales totale, PPV
 * count, Direct messages sent, ecc.) NON entrano nello Score — restano
 * informative nella dashboard.
 */

/**
 * KPI di efficienza con pesi nelle 2 modalità.
 *
 * mode "withClockIn": include Sales/h e Messages/h (richiede dato Clocked
 * hours valido). Più rigoroso, ma tolerable solo se gli operatori timbrano.
 *
 * mode "withoutClockIn": esclude i 2 KPI ore-based. Più indulgente, da usare
 * quando i dati clock-in sono assenti o inaffidabili.
 *
 * Somma pesi = 1.00 in entrambe le modalità.
 */
export const KPI_WEIGHTS = {
  withClockIn: {
    fan_cvr: 0.20,
    unlock_rate: 0.18,
    avg_earnings_per_paying_fan: 0.15,
    golden_ratio: 0.12,
    sales_per_hour: 0.10,
    avg_revenue_per_fan: 0.08,
    avg_length_of_conversation: 0.07,
    input_per_message: 0.05,
    messages_sent_per_hour: 0.05,
  },
  withoutClockIn: {
    fan_cvr: 0.28,
    unlock_rate: 0.22,
    avg_earnings_per_paying_fan: 0.18,
    golden_ratio: 0.14,
    avg_revenue_per_fan: 0.08,
    avg_length_of_conversation: 0.06,
    input_per_message: 0.04,
    // sales_per_hour e messages_sent_per_hour: NON inclusi
  },
};

/**
 * Tier ranking — replicati dallo Sheets (Critical/Weak/Average/Good/Strong/Elite).
 * Diversi dai 5 leghe Bronze/Silver/Gold/Platinum/Diamond della Training
 * leaderboard — sono due sistemi paralleli per due dimensioni diverse.
 */
// v11: max esteso ai frazionari per chiudere il gap (score=50.5 ora cade in
// Critical invece che restare null). calculateScores arrotonda a 2 decimali
// quindi .99 è la massima granularità possibile.
export const SCORE_TIERS = [
  { label: "Critical", min: 0,  max: 50.99, color: "#D44545" },
  { label: "Weak",     min: 51, max: 60.99, color: "#E76F51" },
  { label: "Average",  min: 61, max: 70.99, color: "#B89158" },
  { label: "Good",     min: 71, max: 80.99, color: "#D4AF7A" },
  { label: "Strong",   min: 81, max: 90.99, color: "#3FB97E" },
  { label: "Elite",    min: 91, max: 100,   color: "#4F8CCB" },
];

/**
 * Soglie di normalizzazione 0-100 (relative alla media del Group).
 * Replicate dalle colonne D-L riga 3-7 del foglio Weighted Performance:
 *   - score 0   se valore = 0
 *   - score 0   se valore < media * (1 - 0.25)  → ben sotto
 *   - score 20  se valore < media * (1 - 0.10)  → sotto
 *   - score 40  se valore < media               → poco sotto
 *   - score 60  se valore < media * (1 + 0.10)  → poco sopra
 *   - score 80  se valore < media * (1 + 0.25)  → sopra
 *   - score 100 altrimenti                       → ben sopra
 */
export const NORMALIZATION_THRESHOLDS = [
  { multiplier: 0.75, score: 0 },
  { multiplier: 0.90, score: 20 },
  { multiplier: 1.00, score: 40 },
  { multiplier: 1.10, score: 60 },
  { multiplier: 1.25, score: 80 },
  // value >= mean * 1.25 → score 100 (default)
];

/**
 * Regex per identificare account "Mass" da escludere dal calcolo Score.
 *
 * Pattern coperti:
 *   - "Mass" / "MASS" / "mass" come parola intera (es. "Andrea Terranova Mass")
 *   - "MASSA" all'inizio del nome (es. "MASSA Cristian Gentile") — variante alternativa
 *   - "Mass Message" / "Mass Messages" come parte del nome
 *
 * Pattern NON catturati (correttamente):
 *   - "Massimo" (Mass è prefisso di Massimo, non parola intera)
 *   - "Tommaso", "Gammella", "Rommel" (non contengono Mass come parola)
 *
 * Se vuoi cambiare il comportamento per casi specifici (es. includere
 * "MASSA Cristian Gentile"), modifica solo questa regex.
 */
export const MASS_ACCOUNT_REGEX = /\b(MASS|Mass|mass)\b|^MASSA\s/;

/**
 * Regex per rilevare la lingua/mercato di un Group dal suo nome.
 * Convenzione HOC: i Group ENG hanno "ENG" nel nome (es. "Team Bianca ENG"),
 * quelli ITA hanno "ITA" (es. "Team Bianca ITA"). Se nessuna match, language=null.
 *
 * Se in futuro la convenzione cambia (es. suffisso diverso, lingua extra),
 * modifica solo qui — `detectLanguage()` in leaderboard-calc.js è già generica.
 */
export const LANGUAGE_REGEX = {
  eng: /\bENG\b/i,
  ita: /\bITA\b/i,
};

/**
 * Reason validi per la denylist manuale degli operatori
 * (storage: KV `leaderboard:exclusions`, gestiti dalla pagina admin
 * /admin/leaderboard-exclusions).
 *
 *  - non_chatter   → SM, trainer, account servizio: non sono operatori di chat
 *  - manual        → esclusione amministrativa esplicita (caso per caso)
 *  - data_quality  → dati incompleti/sospetti, da non considerare in classifica
 *
 * "mass" NON è in questa lista: gli account Mass sono rilevati automaticamente
 * via MASS_ACCOUNT_REGEX e non vanno duplicati nella denylist.
 */
export const MANUAL_EXCLUSION_REASONS = ["non_chatter", "manual", "data_quality"];

/**
 * Mappa colonne CSV Infloww → chiavi normalizzate del nostro sistema.
 * Quando importiamo un CSV, ogni colonna del CSV viene mappata qui.
 * Il parsing dei valori (currency, percentage, ecc.) è gestito in leaderboard-calc.js.
 */
export const CSV_COLUMN_MAP = {
  "Date/Time Europe/Amsterdam": { key: "date_range", type: "date_range" },
  "Group": { key: "group", type: "string" },
  "Employees": { key: "employee", type: "string" },
  "Email": { key: "email", type: "string" },
  "Creators": { key: "creators", type: "csv_list" },
  "Sales": { key: "sales", type: "currency" },
  "PPV sales": { key: "ppv_sales", type: "currency" },
  "Tips": { key: "tips", type: "currency" },
  "Direct message sales": { key: "direct_message_sales", type: "currency" },
  "Direct messages sent": { key: "direct_messages_sent", type: "integer" },
  "Direct PPVs sent": { key: "direct_ppvs_sent", type: "integer" },
  "Golden ratio": { key: "golden_ratio", type: "percentage" },
  "PPVs unlocked": { key: "ppvs_unlocked", type: "integer" },
  "Unlock rate": { key: "unlock_rate", type: "percentage" },
  "Fans chatted": { key: "fans_chatted", type: "integer" },
  "Fans who spent money": { key: "fans_who_spent_money", type: "integer" },
  "Fan CVR": { key: "fan_cvr", type: "percentage" },
  "Avg earnings per fan who spent money": { key: "avg_earnings_per_paying_fan", type: "currency" },
  "Character count": { key: "character_count", type: "integer" },
  "Response time (based on clocked hours)": { key: "response_time_seconds", type: "duration" },
  "Clocked hours": { key: "clocked_hours_minutes", type: "duration_minutes" },
  "Sales per hour": { key: "sales_per_hour", type: "currency" },
  "Messages sent per hour": { key: "messages_sent_per_hour", type: "float" },
  "Fans chatted per hour": { key: "fans_chatted_per_hour", type: "float" },
};

/**
 * Calcola "Avg revenue per fan" = Sales / Fans chatted.
 * Non viene fornito direttamente dall'export Infloww: lo deriviamo lato server.
 */
export const DERIVED_KPIS = {
  avg_revenue_per_fan: (record) => {
    const sales = record.sales || 0;
    const fans = record.fans_chatted || 0;
    return fans > 0 ? sales / fans : 0;
  },
  // Avg Length of Conversation = Character count / (Direct messages sent / Fans chatted)
  // Ovvero, character medio per messaggio. Replicato dallo Sheets dove "AvgLength"
  // è una metrica derivata. Se l'esatta formula del tuo Sheets è diversa, modifica qui.
  avg_length_of_conversation: (record) => {
    const chars = record.character_count || 0;
    const msgs = record.direct_messages_sent || 0;
    return msgs > 0 ? chars / msgs : 0;
  },
  // Input per message = stesso come avg_length, ma può essere customizzato in futuro
  input_per_message: (record) => {
    const chars = record.character_count || 0;
    const msgs = record.direct_messages_sent || 0;
    return msgs > 0 ? chars / msgs : 0;
  },
};

/**
 * Helpers per UI.
 */
export const KPI_LABELS = {
  fan_cvr: "Fan CVR",
  unlock_rate: "Unlock Rate",
  avg_earnings_per_paying_fan: "Avg Earnings / Paying Fan",
  golden_ratio: "Golden Ratio",
  sales_per_hour: "Sales / Hour",
  avg_revenue_per_fan: "Avg Revenue / Fan",
  avg_length_of_conversation: "Avg Length of Conv.",
  input_per_message: "Input per Message",
  messages_sent_per_hour: "Messages / Hour",
  // Volume (informativi, non entrano nello Score)
  sales: "Sales",
  ppv_sales: "PPV Sales",
  direct_message_sales: "DM Sales",
  tips: "Tips",
  direct_messages_sent: "Messages Sent",
  direct_ppvs_sent: "PPVs Sent",
  ppvs_unlocked: "PPVs Unlocked",
  fans_chatted: "Fans Chatted",
  fans_who_spent_money: "Paying Fans",
  character_count: "Characters",
  clocked_hours_minutes: "Clocked Hours",
};
