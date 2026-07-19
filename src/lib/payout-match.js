/**
 * Payout match engine — take CP ↔ transazioni fan-level Infloww.
 *
 * L'API Infloww NON espone l'operatore sulla transazione (verificato lug
 * 2026: nessun campo employee nel payload) e il take CP non ha l'uuid della
 * transazione. Il legame è quindi INFERITO: stessa creator, timestamp della
 * transazione dentro la finestra del turno, quadratura dell'importo LORDO al
 * centesimo (calibrazione reconcile lug 2026: venduto CP = lordo fan).
 *
 * QUOTA COSELLER (calibrata su dati reali, lug 2026 — Spagnuolo/Gaja): nei
 * turni con payment profile a k coseller CP splitta la vendita (attribution
 * 1/k) → il take vale gross/k e non quadra mai col lordo pieno. Su 473 take
 * di turni cos=2: 134 exact + 320 a importo×2, contro 73/74 exact nei mono.
 * Quindi il match prova prima l'importo pieno, poi importo×k (tolleranza
 * ±(k−1) cent per l'arrotondamento della divisione) e marca `share: k`.
 *
 * Ogni match porta una confidenza esplicita:
 *   exact     importo (pieno o quota 1/k) unico nella finestra
 *   ambiguous importi identici in surplus nella finestra (es. due tip da $10
 *             quando il take è uno solo): il take è coperto, ma QUALE delle
 *             transazioni gemelle sia la sua è indecidibile
 *   unmatched nessuna transazione compatibile nella finestra
 * Il dato è DIREZIONALE (come reconcile), mai contabile: si usa per capire e
 * per istruire dispute, non per rifare la busta.
 */

/** Take CP in centesimi (i take arrivano in dollari con 2 decimali). */
const toCents = (usd) => Math.round((Number(usd) || 0) * 100);

const isReversed = (st) => /reverse/i.test(String(st || ""));

/**
 * Match di tutti gli shift di un operatore su un periodo.
 *
 * @param wageRecords    wage CP normalizzate dell'operatore (di norma 1 per mese)
 * @param aliasIndex     Map(alias → {id, name, via}) da buildAliasIndex
 * @param txnsByCreatorId Map(creatorId → {meta, txns}) da readLedgerTxns
 * @param refundsByTid   Map(transactionId → refund slim) — refund di QUALSIASI
 *                       periodo successivo alla vendita (arrivano anche mesi dopo)
 * @param slackMs        tolleranza sulla finestra turno (default 5 min: copre
 *                       lo skew di chiusura vendita a cavallo del cambio turno)
 */
export function matchOperatorPeriod({ wageRecords, aliasIndex, txnsByCreatorId, refundsByTid, slackMs = 5 * 60000 }) {
  const shifts = [];
  const unlinkedAliases = new Set();
  const noLedgerCreators = new Set();
  // Consumo GLOBALE dei tid nella chiamata (= per operatore): due finestre
  // turno adiacenti si sovrappongono di 2×slack e la stessa transazione non
  // deve quadrare un take in ENTRAMBE. Match in ordine cronologico → il turno
  // che inizia prima vince deterministicamente la zona di overlap.
  const usedTids = new Set();
  const allShifts = [];
  for (const w of wageRecords || []) for (const s of w.shifts || []) allShifts.push(s);
  allShifts.sort((a, b) => {
    const ta = Date.parse(a.started_at), tb = Date.parse(b.started_at);
    return (Number.isFinite(ta) ? ta : Infinity) - (Number.isFinite(tb) ? tb : Infinity);
  });

  for (const s of allShifts) {
      const startRaw = Date.parse(s.started_at);
      const endRaw = Date.parse(s.ended_at);
      // Senza started_at la finestra è irrecuperabile (invalid_window, mai
      // "no_amount_match": il reason deve dire la verità). Senza ended_at il
      // turno è IN CORSO → clampa a adesso (il ledger non va oltre il sync).
      const windowInvalid = !Number.isFinite(startRaw);
      const inProgress = !windowInvalid && !Number.isFinite(endRaw);
      const startMs = startRaw - slackMs;
      const endMs = (Number.isFinite(endRaw) ? endRaw : Date.now()) + slackMs;
      const takes = Array.isArray(s.takes) ? s.takes : [];

      if (windowInvalid) {
        const takeRows = takes.map((t) => ({ amount: t.amount, type: t.type, alias: t.creator_alias || "?", match: null, reason: "invalid_window" }));
        const takesGross = takes.reduce((a, t) => a + (Number(t.amount) || 0), 0);
        shifts.push({
          shift_id: s.id, started_at: s.started_at, ended_at: s.ended_at,
          worked_hours: s.worked_hours || null,
          creator_aliases: s.creator_aliases || [],
          payment_profile: s.payment_profile || null,
          thresholds: s.thresholds || [],
          total_attributed: s.total_attributed || 0,
          total_earnings: s.total_earnings || 0,
          window_invalid: true,
          takes: takeRows, takes_count: takeRows.length,
          matched_count: 0, share_count: 0, ambiguous_count: 0, refunded_count: 0,
          takes_gross: Math.round(takesGross * 100) / 100,
          matched_gross: 0, coverage: null,
          extra_txns: { count: 0, gross_usd: 0 },
        });
        continue;
      }

      // Takes raggruppati per alias creator (la finestra è la stessa, il
      // bacino di transazioni no: ogni alias è un profilo OF diverso).
      const byAlias = new Map();
      for (const t of takes) {
        const a = t.creator_alias || "?";
        if (!byAlias.has(a)) byAlias.set(a, []);
        byAlias.get(a).push(t);
      }

      const takeRows = [];
      let extraCount = 0, extraGrossC = 0;

      for (const [alias, aliasTakes] of byAlias.entries()) {
        const link = aliasIndex.get(alias);
        if (!link) {
          unlinkedAliases.add(alias);
          for (const t of aliasTakes) takeRows.push({ amount: t.amount, type: t.type, alias, match: null, reason: "no_creator_link" });
          continue;
        }
        const ledger = txnsByCreatorId.get(link.id);
        if (!ledger || !ledger.meta) {
          noLedgerCreators.add(link.name || alias);
          for (const t of aliasTakes) takeRows.push({ amount: t.amount, type: t.type, alias, match: null, reason: "no_ledger" });
          continue;
        }

        // Candidati: transazioni della creator nella finestra del turno, non
        // già consumate da un turno precedente. Ordine temporale → pop
        // deterministico.
        const candidates = ledger.txns.filter((x) => x.t >= startMs && x.t <= endMs && !(x.tid && usedTids.has(x.tid)));
        const pool = new Map(); // grossCents → [txn...]
        for (const x of candidates) {
          if (!pool.has(x.g)) pool.set(x.g, []);
          pool.get(x.g).push(x);
        }
        const k = Number(s.payment_profile?.cosellers_count) || 1;
        const tol = Math.max(0, k - 1); // arrotondamento di round(gross/k)

        // Pop dal pool per un importo scalato, con tolleranza sui cent.
        const popScaled = (targetC) => {
          for (let d = 0; d <= tol; d++) {
            for (const g of d === 0 ? [targetC] : [targetC - d, targetC + d]) {
              const arr = pool.get(g);
              if (arr && arr.length > 0) return arr.shift();
            }
          }
          return null;
        };

        // Conta quanti take chiedono ciascun importo pieno (diagnosi ambiguità)
        const demandFull = new Map();
        for (const t of aliasTakes) {
          const c = toCents(t.amount);
          demandFull.set(c, (demandFull.get(c) || 0) + 1);
        }

        const pushMatch = (t, tx, { ambiguous, share }) => {
          if (tx.tid) usedTids.add(tx.tid);
          const refund = refundsByTid.get(tx.tid) || null;
          takeRows.push({
            amount: t.amount, type: t.type, alias,
            match: {
              tid: tx.tid, t: tx.t, ty: tx.ty, st: tx.st,
              fid: tx.fid, fn: tx.fn,
              gross_usd: tx.g / 100, fee_usd: tx.f / 100, net_usd: tx.n / 100,
              ambiguous,
              share: share || undefined, // k: il take è la quota 1/k della transazione
              reversed: isReversed(tx.st) || undefined,
              refund: refund ? { rt: refund.rt, amount_usd: refund.amt / 100, tt: refund.tt } : null,
            },
          });
        };

        // Pass A: importo pieno. Pass B: quota 1/k (turni coseller).
        const pendingShare = [];
        for (const t of aliasTakes) {
          const c = toCents(t.amount);
          const avail = pool.get(c) || [];
          if (avail.length > 0) {
            const tx = avail.shift();
            const ambiguous = (candidates.filter((x) => x.g === c).length) > (demandFull.get(c) || 0);
            pushMatch(t, tx, { ambiguous });
          } else {
            pendingShare.push(t);
          }
        }
        // Supply/demand del Pass B fotografati DOPO il Pass A: l'ambiguità va
        // giudicata sul residuo (le txn consumate dal Pass A non sono più
        // "gemelle" disponibili) e la demand sui soli take ancora pendenti.
        const supplyAfterA = new Map();
        for (const [g, arr] of pool.entries()) supplyAfterA.set(g, arr.length);
        const supplyInTol = (targetC) => {
          let n = 0;
          for (let g = targetC - tol; g <= targetC + tol; g++) n += supplyAfterA.get(g) || 0;
          return n;
        };
        const demandShare = new Map();
        if (k > 1) {
          for (const t of pendingShare) {
            const tc = toCents(t.amount) * k;
            demandShare.set(tc, (demandShare.get(tc) || 0) + 1);
          }
        }
        for (const t of pendingShare) {
          if (k <= 1) {
            takeRows.push({ amount: t.amount, type: t.type, alias, match: null, reason: "no_amount_match" });
            continue;
          }
          const target = toCents(t.amount) * k;
          const tx = popScaled(target);
          if (!tx) {
            takeRows.push({ amount: t.amount, type: t.type, alias, match: null, reason: "no_amount_match" });
            continue;
          }
          const ambiguous = supplyInTol(target) > (demandShare.get(target) || 0);
          pushMatch(t, tx, { ambiguous, share: k });
        }
        // Residuo finestra: transazioni non consumate. NON è un'anomalia di
        // per sé — contiene rinnovi abbonamento e vendite dei coseller dello
        // stesso turno. Serve come contesto, non come accusa.
        let remaining = 0, remainingC = 0;
        for (const arr of pool.values()) for (const x of arr) { remaining++; remainingC += x.g; }
        extraCount += remaining;
        extraGrossC += remainingC;
      }

      const takesGross = takes.reduce((a, t) => a + (Number(t.amount) || 0), 0);
      const matched = takeRows.filter((r) => r.match);
      const matchedGross = matched.reduce((a, r) => a + (Number(r.amount) || 0), 0);
      shifts.push({
        shift_id: s.id,
        started_at: s.started_at,
        ended_at: s.ended_at,
        in_progress: inProgress || undefined,
        worked_hours: s.worked_hours || null,
        creator_aliases: s.creator_aliases || [],
        payment_profile: s.payment_profile || null,
        thresholds: s.thresholds || [],
        total_attributed: s.total_attributed || 0,
        total_earnings: s.total_earnings || 0,
        takes: takeRows,
        takes_count: takeRows.length,
        matched_count: matched.length,
        share_count: matched.filter((r) => r.match.share).length,
        ambiguous_count: matched.filter((r) => r.match.ambiguous).length,
        refunded_count: matched.filter((r) => r.match.refund || r.match.reversed).length,
        takes_gross: Math.round(takesGross * 100) / 100,
        matched_gross: Math.round(matchedGross * 100) / 100,
        coverage: takesGross > 0 ? Math.round((matchedGross / takesGross) * 1000) / 1000 : null,
        extra_txns: { count: extraCount, gross_usd: Math.round(extraGrossC) / 100 },
      });
  }

  shifts.sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));

  const allTakes = shifts.reduce((a, s) => a + s.takes_count, 0);
  const allMatched = shifts.reduce((a, s) => a + s.matched_count, 0);
  // La coverage si misura sui soli turni con finestra valida: i turni rotti
  // (window_invalid) non deflazionano il numero in silenzio — sono esposti
  // a parte come invalid_window_*.
  const invalidShifts = shifts.filter((x) => x.window_invalid);
  const takesGross = shifts.reduce((a, s) => a + s.takes_gross, 0);
  const validTakesGross = takesGross - invalidShifts.reduce((a, s) => a + s.takes_gross, 0);
  const matchedGross = shifts.reduce((a, s) => a + s.matched_gross, 0);
  const refundedTakes = [];
  for (const s of shifts) for (const r of s.takes) if (r.match && (r.match.refund || r.match.reversed)) refundedTakes.push({ shift_id: s.shift_id, ...r });

  return {
    shifts,
    summary: {
      shifts_count: shifts.length,
      takes_count: allTakes,
      matched_count: allMatched,
      share_count: shifts.reduce((a, s) => a + s.share_count, 0),
      ambiguous_count: shifts.reduce((a, s) => a + s.ambiguous_count, 0),
      unmatched_count: allTakes - allMatched,
      takes_gross: Math.round(takesGross * 100) / 100,
      matched_gross: Math.round(matchedGross * 100) / 100,
      coverage: validTakesGross > 0 ? Math.round((matchedGross / validTakesGross) * 1000) / 1000 : null,
      invalid_window_shifts: invalidShifts.length,
      invalid_window_gross: Math.round(invalidShifts.reduce((a, s) => a + s.takes_gross, 0) * 100) / 100,
      refunded: {
        count: refundedTakes.length,
        gross_usd: Math.round(refundedTakes.reduce((a, r) => a + (Number(r.amount) || 0), 0) * 100) / 100,
      },
      unlinked_aliases: [...unlinkedAliases].sort(),
      no_ledger_creators: [...noLedgerCreators].sort(),
    },
  };
}
