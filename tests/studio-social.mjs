// node tests/studio-social.mjs — logica pura dello Studio social.
import assert from "node:assert/strict";
import {
  normalizeProfile, normalizeItem, canSchedule, blockingReviews, phaseDay, phaseLine,
  countsByStatus, dailyChecklist, weekdayOf, nextUp, romeToday, STATUSES, DEFAULT_DAILY,
} from "../src/lib/studio-social-core.js";
import { restrictionFor, pathAllowed } from "../src/lib/restricted-roles.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

t("profilo: nome obbligatorio, @ tolta, id stabile, liste da testo a righe", () => {
  assert.equal(normalizeProfile({}).ok, false);
  const { ok, profile } = normalizeProfile({
    handle: "@marty.tibecca", creator: "Martina Scavo", phase: "boh", phaseStart: "2026-10-17",
    identity: { racconto: "Serie Beccato #N\n\n  Regole di Marty  ", maiFare: ["Niente OF", ""] },
    calendar: { lun: "Beccato #N", xyz: "no", mar: "  " },
    daily: "Segui 10 account\nCommenta 5 reel",
  });
  assert.equal(ok, true);
  assert.equal(profile.handle, "marty.tibecca");
  assert.equal(profile.id, "instagram-marty-tibecca");
  assert.equal(profile.phase, "rodaggio"); // fase sconosciuta → default
  assert.deepEqual(profile.identity.racconto, ["Serie Beccato #N", "Regole di Marty"]);
  assert.deepEqual(profile.identity.maiFare, ["Niente OF"]);
  assert.deepEqual(profile.calendar, { lun: "Beccato #N" }); // giorni ignoti e vuoti scartati
  assert.deepEqual(profile.daily, ["Segui 10 account", "Commenta 5 reel"]);
  // modifica: tiene id e data di creazione
  const prev = { ...profile, createdAt: 123 };
  const again = normalizeProfile({ id: profile.id, handle: "marty.tibecca", phase: "lancio" }, prev).profile;
  assert.equal(again.id, profile.id); assert.equal(again.createdAt, 123); assert.equal(again.phase, "lancio");
  assert.equal(again.phaseStart, "2026-10-17"); // data non ripassata = resta
});

t("contenuto: titolo obbligatorio, passo e tipo validi, link solo https, revisori validi", () => {
  assert.equal(normalizeItem({}).ok, false);
  const { item } = normalizeItem({
    title: "Beccato #1", status: "volato", kind: "boh", day: "19/10", mediaUrl: "javascript:alert(1)",
    reviews: { conformita: { outcome: "ok", note: "verde" }, voce: { outcome: "forse" }, inventato: { outcome: "ok" } },
  });
  assert.equal(item.status, "idea"); assert.equal(item.kind, "reel"); assert.equal(item.day, null);
  assert.equal(item.mediaUrl, "");
  assert.deepEqual(Object.keys(item.reviews), ["conformita"]);
});

t("programmare: servono conformità e voce, nessun blocco", () => {
  assert.equal(canSchedule({ reviews: {} }).ok, false);
  assert.match(canSchedule({ reviews: { conformita: { outcome: "ok" } } }).reason, /Voce/);
  assert.equal(canSchedule({ reviews: { conformita: { outcome: "ok" }, voce: { outcome: "attenzione" } } }).ok, true);
  const blocked = { reviews: { conformita: { outcome: "blocca" }, voce: { outcome: "ok" } } };
  assert.equal(canSchedule(blocked).ok, false);
  assert.deepEqual(blockingReviews(blocked), ["Conformità"]);
  // il tecnico che blocca ferma anche se gli altri sono ok
  assert.equal(canSchedule({ reviews: { conformita: { outcome: "ok" }, voce: { outcome: "ok" }, tecnico: { outcome: "blocca" } } }).ok, false);
});

t("fase: giorno contato da 1, finita detta in parole", () => {
  const p = { phase: "rodaggio", phaseStart: "2026-10-17" };
  assert.equal(phaseDay(p, "2026-10-17"), 1);
  assert.equal(phaseDay(p, "2026-10-16"), null);
  assert.equal(phaseLine(p, "2026-10-18"), "Rodaggio, giorno 2 di 7");
  assert.match(phaseLine(p, "2026-10-25"), /fase finita/);
  assert.equal(phaseLine({ phase: "crescita", phaseStart: "2026-10-01" }, "2026-10-10"), "Crescita, giorno 10");
  assert.equal(phaseLine({ phase: "lancio" }, "2026-10-10"), "Lancio");
});

t("conteggi: la somma delle colonne è il totale, passi ignoti finiscono in idee", () => {
  const c = countsByStatus([{ status: "idea" }, { status: "da_girare" }, { status: "boh" }]);
  assert.equal(Object.values(c).reduce((a, b) => a + b, 0), 3);
  assert.equal(c.idea, 2);
  assert.equal(Object.keys(c).length, STATUSES.length);
});

t("lista del giorno: voci del profilo o di base, spunte salvate", () => {
  assert.equal(dailyChecklist({ daily: [] }, null).length, DEFAULT_DAILY.length);
  const rows = dailyChecklist({ daily: ["a", "b"] }, { done: [1] });
  assert.deepEqual(rows.map((r) => r.done), [false, true]);
});

t("settimana e prossimo contenuto", () => {
  assert.equal(weekdayOf("2026-10-19"), "lun");
  assert.equal(weekdayOf("2026-10-25"), "dom");
  const items = [
    { title: "vecchio", day: "2026-10-10", status: "da_girare" },
    { title: "pubblicato", day: "2026-10-18", status: "pubblicato" },
    { title: "dopo", day: "2026-10-21", status: "script" },
    { title: "prima", day: "2026-10-19", status: "idea" },
  ];
  assert.equal(nextUp(items, "2026-10-17").title, "prima");
  assert.equal(nextUp([], "2026-10-17"), null);
  assert.match(romeToday(new Date("2026-10-16T23:30:00Z")), /^2026-10-17$/); // a Roma è già il 17
});

t("ruolo SMM vede lo Studio social nella vista ridotta", () => {
  const r = restrictionFor({ roles: ["smm"] });
  assert.equal(pathAllowed(r, "/admin/studio-social"), true);
  assert.equal(pathAllowed(r, "/admin/studio-social/instagram-marty-tibecca"), true);
  const social = restrictionFor({ roles: ["social"] });
  assert.equal(pathAllowed(social, "/admin/studio-social"), false); // il ruolo "Social" resta su Account social
});

console.log(`studio-social: ${n} gruppi di asserzioni ok`);
