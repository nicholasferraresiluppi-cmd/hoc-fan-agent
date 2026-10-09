// node tests/ofapi-pilot.mjs
import assert from "node:assert/strict";
import { apiTxKey, whTxKey, apiTxOfDay, pickCreatorId, compareDay, verdict } from "../src/lib/ofapi-pilot-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

const api = (createdAt, net, uid, type = "message", status = "loading") => ({ createdAt, net, user: { id: uid }, type, status });
const wh = (created_at, net, user_id, type = "message") => ({ created_at, net, user_id, type });

// chiavi: stesso secondo + netto + fan, formati diversi
ok(apiTxKey(api("2026-10-08T01:18:21+00:00", 15.99, 7)) === whTxKey(wh("2026-10-08T01:18:21", "15.99", 7)), "chiave uguale tra api e warehouse");
ok(apiTxKey(api("2026-10-08T01:18:21+00:00", 16, 7)) === whTxKey(wh("2026-10-08T01:18:21", 16.0, 7)), "netto normalizzato a 2 decimali");
ok(apiTxKey(api("2026-10-08T01:18:21+00:00", 16, 7)) !== whTxKey(wh("2026-10-08T01:18:22", 16, 7)), "un secondo di differenza = transazione diversa");

// filtro del giorno
const list = [api("2026-10-09T00:00:01+00:00", 1, 1), api("2026-10-08T23:59:59+00:00", 2, 2), api("2026-10-08T00:00:00+00:00", 3, 3)];
ok(apiTxOfDay(list, "2026-10-08").length === 2, "solo le transazioni del giorno UTC");

// creator_id duplicati
ok(pickCreatorId([{ creator_id: 1000000397, n: 32 }, { creator_id: 173440612, n: 32 }]) === 173440612, "a parità tiene l'id più basso (stabile)");
ok(pickCreatorId([{ creator_id: 1000000096, n: 0 }, { creator_id: 1000000358, n: 78 }]) === 1000000358, "tiene quello con più righe");
ok(pickCreatorId([]) === null, "nessuna riga");

// confronto perfetto (caso reale Elisa, ridotto)
{
  const a = [api("2026-10-08T08:12:54+00:00", 40, 9, "message", "undo"), api("2026-10-08T09:00:00+00:00", 8, 5, "tip")];
  const w = [wh("2026-10-08T08:12:54", "40", 9), wh("2026-10-08T09:00:00", "8.00", 5, "tip")];
  const c = compareDay(a, w);
  ok(c.matched === 2 && c.matchRate === 1 && c.netDiff === 0, "confronto perfetto");
  ok(c.refunds === 1, "rimborsi contati dallo stato undo");
  ok(verdict({ authenticated: true, authProgress: null, comparison: c, truncated: false }) === "ok", "verdetto ok");
}

// transazione mancante nel warehouse
{
  const c = compareDay([api("2026-10-08T01:00:00+00:00", 10, 1), api("2026-10-08T02:00:00+00:00", 20, 2)], [wh("2026-10-08T01:00:00", 10, 1)]);
  ok(c.matched === 1 && c.onlyApi.length === 1 && c.onlyWh.length === 0, "una solo nell'api");
  ok(verdict({ authenticated: true, comparison: c }) === "differenze", "differenze segnalate");
}

// duplicati nello stesso secondo: multiinsieme
{
  const c = compareDay([api("2026-10-08T01:00:00+00:00", 5, 1), api("2026-10-08T01:00:00+00:00", 5, 1)], [wh("2026-10-08T01:00:00", 5, 1)]);
  ok(c.matched === 1 && c.onlyApi.length === 1, "due acquisti uguali nello stesso secondo contano due volte");
}

// giorno vuoto da entrambe le parti
ok(compareDay([], []).matchRate === 1, "giorno senza transazioni = coincide");

// stato dell'account prima di tutto
ok(verdict({ authenticated: false }) === "disconnesso", "account scollegato");
ok(verdict({ authenticated: true, authProgress: "otp_code_required" }) === "verifica-richiesta", "OnlyFans chiede una verifica");
ok(verdict({ authenticated: true, truncated: true, comparison: { matchRate: 1, netDiff: 0 } }) === "incompleto", "paginazione troncata");

console.log(`ofapi-pilot: ${n} asserzioni ok`);
