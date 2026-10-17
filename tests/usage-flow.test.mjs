// Sezione Utilizzo (17/10/2026): percorsi, punti di blocco, abitudine e mansione.
import {
  buildFlowReport, buildStuckReport, buildUxReport, buildUsageReport, enrichPeople, buildAreas,
  personHabit, navFor, pageLabel, lastDays, ENTRY, EXIT,
} from "../src/lib/usage-core.js";
let ok = 0, ko = 0;
const t = (name, cond) => { cond ? ok++ : (ko++, console.log("FAIL", name)); };

const nav = [
  { href: "/admin", label: "Hub", group: "Casa" },
  { href: "/admin/bilancio", label: "Bilancio del mese", group: "Vendite" },
  { href: "/leaderboard/creators", label: "Creator", group: "Vendite" },
  { href: "/admin/hr", label: "Persone HR", group: "People" },
];

// nomi e aree
t("navFor esatto", navFor("/admin/bilancio", nav).label === "Bilancio del mese");
t("navFor sottopagina", navFor("/leaderboard/creators/[alias]", nav).label === "Creator");
t("navFor non scambia prefissi parziali", navFor("/admin/hrx", nav) === null);
t("/admin non contiene tutto l'admin", navFor("/admin/sede", nav) === null && pageLabel("/admin/sede", nav) === "Admin › sede");
t("pagine note e fuori menu", pageLabel("/admin", nav) === "Hub" && pageLabel("/academy/lezioni/[id]", nav) === "Academy › lezioni › scheda");
t("pageLabel dettaglio", pageLabel("/leaderboard/creators/[alias]", nav) === "Creator › scheda");
t("pageLabel ingresso/uscita", pageLabel(ENTRY, nav) === "Entra nell'app" && pageLabel(EXIT, nav) === "Esce dall'app");

// percorsi
const ux = {
  "2026-10-16": {
    [`n\t${ENTRY}\t/admin`]: 10,
    "n\t/admin\t/admin/bilancio": 6,
    "n\t/admin\t/admin/hr": 2,
    "n\t/admin/bilancio\t/leaderboard/creators/[alias]": 3,
    "n\t/admin/bilancio\t/admin/bilancio": 1,       // ricarica nella visita: non è un'uscita
    "t\t/admin/bilancio\tsum": 600, "t\t/admin/bilancio\tn": 6,
    "q\t/admin/hr": 2,
    "b\t/admin/hr\t403": 2,
    "b\t/admin/hr\tboh": 5,                          // codice sconosciuto: ignorato
    "c\t/admin\tBilancio\tsubito|alto": 4,           // clic: non sono percorsi
  },
  "2026-10-17": {
    [`n\t${ENTRY}\t/admin/hr`]: 8,
    "q\t/admin/hr": 6,
    "b\t/admin/hr\t403": 6,
    "b\t/admin/hr\t5xx": 1,
  },
};
const f = buildFlowReport(ux, nav);
const P = Object.fromEntries(f.pages.map((p) => [p.page, p]));
t("since", f.since === "2026-10-16");
t("aperture hub", P["/admin"].views === 10 && P["/admin"].entries === 10);
t("aperture bilancio (ricarica compresa)", P["/admin/bilancio"].views === 7);
t("uscite hub = aperture − passaggi", P["/admin"].exits === 2);
t("destinazioni hub ordinate con l'uscita", P["/admin"].to[0].page === "/admin/bilancio" && P["/admin"].to.some((x) => x.page === EXIT && x.count === 2));
t("ricarica non conta come uscita", P["/admin/bilancio"].exits === 3);
t("ricarica non è una destinazione", !P["/admin/bilancio"].to.some((x) => x.page === "/admin/bilancio"));
t("sorgenti bilancio", P["/admin/bilancio"].from.find((x) => x.page === "/admin").count === 6);
t("tempo medio", P["/admin/bilancio"].avg_seconds === 100);
t("hr: aperture su due giorni", P["/admin/hr"].views === 10);
t("hr: chiusa subito", P["/admin/hr"].quick === 8 && P["/admin/hr"].quick_share === 0.8);
t("hr: blocchi solo codici noti", P["/admin/hr"].blocks["403"] === 8 && !P["/admin/hr"].blocks.boh && P["/admin/hr"].blocked_views === 9);
t("totale aperture", f.total_views === 10 + 7 + 10 + 3);
t("vuoto", buildFlowReport({}, nav).pages.length === 0 && buildFlowReport({}, nav).since === null);

// i campi dei percorsi non sporcano il report dei clic
const uxr = buildUxReport(ux, {});
t("buildUxReport ignora n/t/q/b", uxr.pages.length === 1 && uxr.pages[0].page === "/admin");

// punti di blocco
const s = buildStuckReport(f, uxr);
t("muro di permesso", s.some((x) => x.cause === "permesso" && x.page === "/admin/hr" && x.affected === 8));
t("errore server oltre 5%", s.some((x) => x.cause === "errore" && x.page === "/admin/hr"));
t("chiusa subito", s.some((x) => x.cause === "subito" && x.page === "/admin/hr"));
t("niente blocchi su pagine sane", !s.some((x) => x.page === "/admin/bilancio"));
t("prima ciò che è rotto", s.findIndex((x) => x.cause === "errore") < s.findIndex((x) => x.cause === "subito"));
t("prima i gravi", s.every((x, i) => i === 0 || !(s[i - 1].kind === "info" && x.kind === "warn")));
// sotto il campione minimo niente conclusioni
const small = buildFlowReport({ d: { [`n\t${ENTRY}\t/x`]: 3, "b\t/x\t403": 3, "q\t/x": 3 } }, nav);
t("campione piccolo → niente", buildStuckReport(small, null).length === 0);

// abitudine
const now = Date.parse("2026-10-17T12:00:00Z");
const d = lastDays(60, now);
const days = Object.fromEntries(d.map((x) => [x, {}]));
for (const i of [59, 52, 45, 38]) days[d[i]]["a\t/admin"] = 1;      // una volta a settimana per 4 settimane
for (const i of [58, 57]) days[d[i]]["b\t/admin/bilancio"] = 2;      // due giorni, solo ultima settimana
days[d[30]]["c\t/admin"] = 1;                                         // 29 giorni fa
const ha = personHabit("a", days, { now });
t("3 settimane su 4 ma non l'ultima = ogni tanto", personHabit("w", { [d[52]]: { "w\t/a": 1 }, [d[45]]: { "w\t/a": 1 }, [d[38]]: { "w\t/a": 1 } }, { now }).status === "occasionale");
t("abitudine 4 settimane", ha.status === "abitudine" && ha.active_weeks === 4 && ha.strip.length === 28 && ha.strip[27] === true);
t("occasionale", personHabit("b", days, { now }).status === "occasionale");
t("fermo da più di 14 giorni", personHabit("c", days, { now }).status === "fermo" && personHabit("c", days, { now }).days_since === 29);
t("mai entrato", personHabit("z", days, { now }).status === "mai");
t("entrato prima del tracciamento = fermo", personHabit("z", days, { now, everSignedIn: true }).status === "fermo");
t("pochi dati: 5 giorni su 14 bastano", personHabit("e", { ...days, [d[59]]: { "e\t/a": 1 }, [d[58]]: { "e\t/a": 1 }, [d[57]]: { "e\t/a": 1 }, [d[56]]: { "e\t/a": 1 }, [d[55]]: { "e\t/a": 1 } }, { now, trackedDays: 10 }).status === "abitudine");
t("stessi 5 giorni con storia lunga: serve la settimana", personHabit("e", { ...days, [d[59]]: { "e\t/a": 1 }, [d[58]]: { "e\t/a": 1 }, [d[57]]: { "e\t/a": 1 }, [d[56]]: { "e\t/a": 1 }, [d[55]]: { "e\t/a": 1 } }, { now, trackedDays: 60 }).status === "occasionale");
// un id che è prefisso di un altro non si confonde
t("prefisso id", personHabit("a", { [d[59]]: { "ab\t/admin": 1 } }, { now }).status === "mai");

// mansione: strumenti mai aperti
const members = [
  { userId: "a", name: "Anna", email: "a@x", workspace: "sales" },
  { userId: "b", name: "Bruno", email: "b@x", workspace: "sales" },
  { userId: "z", name: "Zeno", email: "z@x" },
];
const expected = [{ href: "/admin/bilancio", label: "Bilancio del mese" }, { href: "/leaderboard/creators", label: "Creator" }, { href: "/admin/hr", label: "Persone HR" }];
days[d[59]]["a\t/leaderboard/creators/[alias]"] = 1;                 // la scheda conta come uso di "Creator"
const base = buildUsageReport({ days, members, nav, now, window: 30 });
const en = enrichPeople(base, { days, members, now, expectedFor: (m) => (m.workspace ? expected : []) });
const A = en.people.find((p) => p.userId === "a");
const B = en.people.find((p) => p.userId === "b");
t("usati della mansione (sottopagina compresa)", A.expected_used === 1 && A.missing.map((m) => m.href).join() === "/admin/bilancio,/admin/hr");
t("Bruno ha usato solo il bilancio", B.expected_used === 1 && B.missing.length === 2);
t("senza mansione niente atteso", en.people.find((p) => p.userId === "z").expected_count === 0);
t("conteggi per stato = persone", Object.values(en.status_counts).reduce((x, y) => x + y, 0) === en.people.length);
t("insight mansione", en.insights.some((i) => /metà degli strumenti della sua mansione/.test(i.title)));
t("insight originali restano", en.insights.length > base.insights.length);

// aree: persone DIVERSE, non massimo per pagina
const ar = buildAreas({ days, window: 30, nav, now });
const vend = ar.find((x) => x.group === "Vendite");
t("aree: persone uniche", vend.users === 2 && vend.views === 2 * 2 + 1);
t("aree: quote sommano a 1", Math.abs(ar.reduce((x, y) => x + y.share, 0) - 1) < 1e-9);

console.log(`${ok} ok / ${ko} failed`); if (ko) process.exit(1);
