// Unit test — creator-deals-core (lettura delle percentuali). Esegui: node tests/creator-deals.mjs
import assert from "node:assert/strict";
import { parseDealText, shareUsd, describeTiers } from "../src/lib/creator-deals-core.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("✗", name); throw e; } };

t("flat", () => assert.deepEqual(parseDealText("60% flat").tiers, [{ fromUsd: 0, pct: 0.6 }]));
t("due scaglioni con k", () => assert.deepEqual(parseDealText("23% <=150k ; 25% >150k;").tiers, [{ fromUsd: 0, pct: 0.23 }, { fromUsd: 150000, pct: 0.25 }]));
t("quattro scaglioni", () => assert.deepEqual(parseDealText("30% <= 25k; 35% <= 50k; 40% <= 65k; 45% > 65k;").tiers,
  [{ fromUsd: 0, pct: 0.3 }, { fromUsd: 25000, pct: 0.35 }, { fromUsd: 50000, pct: 0.4 }, { fromUsd: 65000, pct: 0.45 }]));
t("senza spazio dopo ;", () => assert.deepEqual(parseDealText("35% <= 25k; 40% <= 33k;50% > 33k").tiers,
  [{ fromUsd: 0, pct: 0.35 }, { fromUsd: 25000, pct: 0.4 }, { fromUsd: 33000, pct: 0.5 }]));
t("decimali con virgola e punto finale", () => assert.deepEqual(parseDealText("50%<=130k; 52,5%>130k.").tiers, [{ fromUsd: 0, pct: 0.5 }, { fromUsd: 130000, pct: 0.525 }]));
t("100% flat", () => assert.deepEqual(parseDealText("100% flat").tiers, [{ fromUsd: 0, pct: 1 }]));
t("sales manager: «sopra» letterale, sotto soglia zero", () => {
  const r = parseDealText("2% > 170k; 2,25% > 200k; 2,5% > 230k");
  assert.deepEqual(r.tiers, [{ fromUsd: 170000, pct: 0.02 }, { fromUsd: 200000, pct: 0.0225 }, { fromUsd: 230000, pct: 0.025 }]);
  assert.equal(shareUsd(r.tiers, 160000).usd, 0);
  assert.equal(shareUsd(r.tiers, 210000).usd, 4725);
});
t("testo incomprensibile → avviso", () => assert.equal(parseDealText("metà").warnings.length, 1));

const claudia = parseDealText("30% <= 25k; 35% <= 50k; 40% <= 65k; 45% > 65k;").tiers;
t("scaglione raggiunto su tutto: 40k → 35%", () => assert.deepEqual(shareUsd(claudia, 40000), { usd: 14000, pct: 0.35 }));
t("esattamente 25k resta al 30%", () => assert.equal(shareUsd(claudia, 25000).usd, 7500));
t("progressivo (non usato in pagina)", () => assert.equal(shareUsd(claudia, 40000, "progressivo").usd, 7500 + 5250));
t("revenue 0", () => assert.equal(shareUsd(claudia, 0).usd, 0));
t("descrizione", () => assert.equal(describeTiers([{ fromUsd: 0, pct: 0.23 }, { fromUsd: 150000, pct: 0.25 }]), "23% fino a 150.000$ · 25% sopra 150.000$"));
t("descrizione flat", () => assert.equal(describeTiers([{ fromUsd: 0, pct: 0.55 }]), "55% flat"));
t("descrizione «sopra» dal primo", () => assert.equal(describeTiers(parseDealText("3% > 80k; 3,5% > 100k").tiers), "3% sopra 80.000$ · 3,5% sopra 100.000$"));

console.log(`creator-deals: ${n} ok`);
