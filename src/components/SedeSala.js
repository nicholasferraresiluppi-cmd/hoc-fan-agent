"use client";

/**
 * La sala della Sede (04/10/2026) — l'open space del reel "trading floor" che Nicholas ha indicato come
 * estetica di riferimento: un piano solo, isole di scrivanie bianche con due monitor, omini che lavorano,
 * cartelli verdi per area, angolo relax, vetrate, schermo grande a parete, camera vicina con giro guidato.
 *
 * Tradotto per noi (non copiato):
 * - lo stato viene dalla PROVA di lavoro (API /api/admin/sede): chi ha lavorato batte sulla tastiera,
 *   chi lavora a richiesta è seduto col monitor spento, chi è FERMO non è alla scrivania ma sul divano
 *   dell'angolo relax con il cartellino rosso;
 * - i FATTORINI: dagli uffici che hanno lavorato un omino porta il fascicolo dorato all'ufficio dopo
 *   (il `passa_a` del registro), lo consegna (anello) e torna indietro a mani vuote;
 * - niente cifre sopra le persone (nel reel i bot hanno guadagni in testa: su persone vere = classifica).
 * Cinque stili di ufficio (trading floor, loft, stanze di vetro, attico, sala regia), scelta ricordata nel browser.
 * Si naviga come una mappa (trascina = scorri), "Vai a" per area, da lontano restano solo i cartelli delle aree.
 */
import { useEffect, useRef, useState } from "react";

// Stili di UFFICIO (Nicholas, 4/10: "mi piace l'omino e la scrivania, proponimi altri stili di ufficio"):
// stessa gente e stesse scrivanie, architettura diversa. `env` = disposizione e arredi; il resto è palette.
const THEMES = {
  trading: {
    label: "Trading floor", bg: 0x2b2c31, floor: [52, 64, 6], wall: 0xf3f2ef, desk: 0xf6f5f2, metal: 0x8c9099, chair: 0x2a2b30, monFrame: 0x1c1d21,
    shirt: 0xf6f5f2, vest: { persona: 0x2b2620, AI: 0x3a2f7a, codice: 0x23262f, robot: 0x23262f }, tie: { persona: 0xd9b46a, AI: 0x8b7cf6, codice: 0x4fbf78, robot: 0x4fbf78 },
    leaf: 0x9fd6b4, pot: 0xe9e2d6, sofa: 0x8f939d, lounge: [96, 78, 72], sky: ["#9fb8e6", "#dfe8f7"], towers: ["#5d74b8", "#4a63a8", "#7a8fc8", "#3e5597"], lit: "rgba(220,232,255,.55)",
    chart: ["#0e3b2c", "#082219", "#8ff0b0"], hemi: [0xffffff, 0x3a3a40, 1.25], sun: [0xfff4e6, 2.1], exposure: 1.05, lamp: 0xffe7c0, logo: "rgba(196,236,214,.85)",
    ui: { sign: "#16181c", signBorder: "#4fbf78", signText: "#8ff0b0", text: "#f2eee6", glass: "rgba(20,21,25,.6)" },
    env: { layout: "islands", floor: "speck", walls: "plain", windows: "tall" },
  },
  loft: {
    label: "Loft industriale", bg: 0x1c1916, floor: [104, 120, 0], wall: 0x8a4b36, desk: 0x8a6442, metal: 0x26262a, chair: 0x4a2e22, monFrame: 0x121212,
    shirt: 0xf4f1ea, vest: { persona: 0x2a3550, AI: 0x3a2f7a, codice: 0x3b3f46, robot: 0x3b3f46 }, tie: { persona: 0xf0b060, AI: 0xb9aef9, codice: 0xf0b060, robot: 0xf0b060 },
    leaf: 0x7fa07a, pot: 0x2b2b2b, sofa: 0x7a4630, lounge: [104, 78, 58], sky: ["#f2b880", "#7a8fb8"], towers: ["#4a3a36", "#5a4640", "#3a2e2c", "#6a5248"], lit: "rgba(255,210,140,.75)",
    chart: ["#2a1e14", "#1a120c", "#f0b060"], hemi: [0xffe8cc, 0x2a2018, .95], sun: [0xffd6a0, 1.7], exposure: 1.0, lamp: 0xffc070, logo: "rgba(240,176,96,.3)",
    ui: { sign: "#1a1410", signBorder: "#f0b060", signText: "#ffd9a8", text: "#f2eee6", glass: "rgba(26,20,16,.6)" },
    env: { layout: "islands", floor: "concrete", walls: "brick", windows: "factory", pendants: true },
  },
  vetro: {
    label: "Stanze di vetro", bg: 0xe2e5e9, floor: [208, 222, 3], wall: 0xffffff, desk: 0xffffff, metal: 0xb7bcc4, chair: 0x2f3540, monFrame: 0x22262c,
    shirt: 0xffffff, vest: { persona: 0x2b3a55, AI: 0x4b3fa0, codice: 0x3a4656, robot: 0x3a4656 }, tie: { persona: 0xc8963e, AI: 0x8b7cf6, codice: 0x3fa37a, robot: 0x3fa37a },
    leaf: 0x86b49a, pot: 0xffffff, sofa: 0xc9ccd2, lounge: [196, 188, 176], sky: ["#cfe0f2", "#f3f6fb"], towers: ["#b9c6d8", "#a8b7cc", "#c9d3e2", "#9fb0c6"], lit: "rgba(255,255,255,.5)",
    chart: ["#18324a", "#0f2234", "#9fd3ff"], hemi: [0xffffff, 0xbfc4cc, 1.45], sun: [0xfff6ea, 2.1], exposure: 1.0, lamp: 0xfff0d0, logo: "rgba(60,90,120,.16)",
    ui: { sign: "#ffffff", signBorder: "#2b3a55", signText: "#1f2a3c", text: "#1d1b18", glass: "rgba(255,255,255,.78)" },
    env: { layout: "rooms", floor: "carpet", walls: "plain", windows: "tall", room: { wall: "glass", frame: 0xffffff, glass: 0xdfe9f2, op: .22, floor: "light", back: 0xf3f3f1 } },
  },
  attico: {
    label: "Attico", bg: 0x121110, floor: [30, 40, 2], wall: 0x1b1a18, desk: 0x3a2a20, metal: 0xb89a62, chair: 0x1a1816, monFrame: 0x0d0c0b,
    shirt: 0xf2eee6, vest: { persona: 0x1a1816, AI: 0x2a2236, codice: 0x23211e, robot: 0x23211e }, tie: { persona: 0xd9b46a, AI: 0xb9aef9, codice: 0xd9b46a, robot: 0xd9b46a },
    leaf: 0x7f9c7c, pot: 0xd8cbb3, sofa: 0x6b5a48, lounge: [70, 52, 40], sky: ["#f4a868", "#5a3a5c"], towers: ["#2a1e2a", "#3a2836", "#24182a", "#46303e"], lit: "rgba(255,214,150,.75)",
    chart: ["#1b1712", "#0f0d0a", "#d9b46a"], hemi: [0xffe9cc, 0x1a1512, .95], sun: [0xffcf98, 1.7], exposure: 1.0, lamp: 0xffd08a, logo: "rgba(217,180,106,.45)",
    ui: { sign: "#14120f", signBorder: "#d9b46a", signText: "#e3cd9c", text: "#f2eee6", glass: "rgba(20,18,15,.6)" },
    env: { layout: "islands", floor: "marble", walls: "plain", windows: "tall", rugs: true },
  },
  regia: {
    label: "Sala regia", bg: 0x0b1020, floor: [22, 30, 10], wall: 0x111829, desk: 0xd8d2c6, metal: 0x5b6378, chair: 0x161a26, monFrame: 0x0a0d14,
    shirt: 0xe8ecf4, vest: { persona: 0x1b2236, AI: 0x2d2463, codice: 0x1b2236, robot: 0x1b2236 }, tie: { persona: 0xffc773, AI: 0x9d8cff, codice: 0x6fd1ff, robot: 0x6fd1ff },
    leaf: 0x6f9a8a, pot: 0xcfd5e0, sofa: 0x3a4258, lounge: [52, 44, 58], sky: ["#0a0f24", "#1b2550"], towers: ["#121a36", "#18224a", "#0f1630", "#1e2a58"], lit: "rgba(255,206,120,.85)",
    chart: ["#0d1734", "#070c1f", "#6fd1ff"], hemi: [0xc9d2ff, 0x0a0c16, .8], sun: [0xffe2b8, 1.0], exposure: 1.1, lamp: 0xffc773, logo: "rgba(111,209,255,.3)",
    ui: { sign: "#0c1226", signBorder: "#6fd1ff", signText: "#bfeaff", text: "#eef2ff", glass: "rgba(10,14,30,.65)" },
    env: { layout: "tiers", floor: "speck", walls: "plain", windows: "tall", screen: "giant" },
  },
};
THEMES.legno = {
  label: "Vetro e legno", bg: 0xe8e1d6, floor: [196, 208, -6], wall: 0xfaf6ef, desk: 0xf6f2ea, metal: 0x8b7355, chair: 0x3a2e26, monFrame: 0x1e1c1a,
  shirt: 0xffffff, vest: { persona: 0x2f3a4f, AI: 0x4b3fa0, codice: 0x4a5240, robot: 0x4a5240 }, tie: { persona: 0xc08a3e, AI: 0x8b7cf6, codice: 0x9a7a4a, robot: 0x9a7a4a },
  leaf: 0x7fa77f, pot: 0xc0704a, sofa: 0xb9a487, lounge: [170, 130, 92], sky: ["#cfe0f2", "#f7f3ec"], towers: ["#c9c3b8", "#b9b2a6", "#d6d0c4", "#aaa396"], lit: "rgba(255,255,255,.45)",
  chart: ["#2a2218", "#1a140e", "#f0c890"], hemi: [0xfff4e6, 0xbfae98, 1.4], sun: [0xfff0d8, 2.0], exposure: 1.0, lamp: 0xffe2b0, logo: "rgba(139,107,72,.18)",
  ui: { sign: "#fbf7f0", signBorder: "#8b6b48", signText: "#3a2a1c", text: "#1d1b18", glass: "rgba(255,252,246,.8)" },
  env: { layout: "rooms", floor: "carpet", walls: "plain", windows: "tall", room: { wall: "half", frame: 0x8b6b48, glass: 0xf0ece4, op: .2, floor: "oak", back: 0xe9e0d2 } },
};
THEMES.executive = {
  ...THEMES.attico, label: "Executive",
  env: { layout: "rooms", floor: "marble", walls: "plain", windows: "tall", room: { wall: "dark", frame: 0xd9b46a, glass: 0x2a2620, op: .42, floor: "walnut", back: 0x1b1a18 } },
};
const THEME_ORDER = ["trading", "vetro", "legno", "executive"];
// colore d'accento per area: filo sulla porta e bordo dell'insegna (riconosci la stanza a colpo d'occhio)
const ACCENT = { dati: "#6fb3ff", vendite: "#4fbf78", formazione: "#f0b060", persone: "#e07aa8", controllo: "#b9aef9", direzione: "#d9b46a" };
// disposizioni: centro di ogni area [x, z] e angolo relax
const LAYOUTS = {
  islands: { isle: { dati: [-15, -6.5], vendite: [-3.5, -7], formazione: [9, -1.5], persone: [-15, 4.5], controllo: [-3.5, 3.5], direzione: [3.5, 10.5] }, lounge: [15.5, 10.2], lanes: [-1.2, 8.6] },
  rooms: { isle: { dati: [-14, -6.6], vendite: [0, -6.6], formazione: [14, -6.6], persone: [-14, 6.2], controllo: [0, 6.2], direzione: [8, 6.2] }, lounge: [16.6, 11], lanes: [0] },
  tiers: { isle: { dati: [-3, -11], vendite: [-3, -6.8], formazione: [-3, -2.6], persone: [-3, 1.6], controllo: [-3, 5.8], direzione: [-3, 10] }, lounge: [15.5, 10.2], aisle: 8 },
};
const GO_LABEL = { dati: "Dati", vendite: "Vendite", formazione: "Formazione", persone: "Persone", controllo: "Controllo", direzione: "Direzione" };
const AREE = { dati: "FONTI DEI DATI", vendite: "VENDITE E COACHING", formazione: "FORMAZIONE VENDITE", persone: "PERSONE", controllo: "CONTROLLO", direzione: "DIREZIONE" };
const TIPO = { persona: "persona", AI: "agente AI", codice: "programma", robot: "robot" };
const TIPI = { persona: "persone", AI: "agenti AI", codice: "programmi", robot: "robot" };
const FERMI = ["in_ritardo", "mai", "errore"];
const stato = (o) => (o.stato === "lavora" || o.stato === "persona" ? "lavora" : FERMI.includes(o.stato) ? "fermo" : "richiesta");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ago = (t) => { if (!t) return ""; const m = Math.round((Date.now() - t) / 60000); if (m < 60) return `${Math.max(1, m)} min fa`; const h = Math.round(m / 60); return h < 36 ? `${h} h fa` : `${Math.round(h / 24)} giorni fa`; };

const CSS = `.ss{position:fixed;top:0;right:0;bottom:0;left:248px;z-index:30;overflow:hidden;font-family:var(--f-sans),Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
@media (max-width:899px){.ss{left:0;top:56px;bottom:72px}}
.ss *{box-sizing:border-box}
.ss canvas{display:block}
.ss .top{position:absolute;top:0;left:0;right:0;z-index:5;display:flex;align-items:center;gap:12px;padding:16px 20px;pointer-events:none;flex-wrap:wrap}
.ss .top h1{font:400 30px var(--f-display),"Instrument Serif",Georgia,serif;margin:0;color:var(--t);text-shadow:0 2px 14px rgba(0,0,0,.25)}
.ss .seg{display:flex;gap:4px;pointer-events:auto;background:var(--g);backdrop-filter:blur(10px);padding:4px;border-radius:999px;border:1px solid rgba(127,127,127,.25)}
.ss .seg button{font-weight:600;font-size:12.5px;font-family:inherit;color:var(--t);opacity:.75;background:none;border:0;padding:7px 13px;border-radius:999px;cursor:pointer}
.ss .seg button.on{background:var(--t);color:var(--bgc);opacity:1}
.ss .r{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
.ss .cap{position:absolute;left:50%;bottom:8%;transform:translateX(-50%);z-index:5;font-weight:800;font-size:30px;font-family:inherit;color:#fff;text-shadow:0 3px 0 rgba(0,0,0,.35),0 0 24px rgba(0,0,0,.55);white-space:nowrap;pointer-events:none;transition:opacity .4s}
.ss .pill{font-weight:800;font-size:12.5px;font-family:inherit;padding:3px 9px;border-radius:7px;white-space:nowrap;pointer-events:none;border:1.5px solid}
.ss .pill.ok{color:#8ff0b0;background:rgba(14,40,24,.88);border-color:#4fbf78}
.ss .pill.ko{color:#ff9a8a;background:rgba(48,14,12,.9);border-color:#d8584a}
.ss .pill.idle{color:#d6d3cc;background:rgba(28,28,32,.85);border-color:#6b6a70}
.ss .bub{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:3px solid;box-shadow:0 3px 10px rgba(0,0,0,.3);font-weight:800;font-size:13px;font-family:inherit;pointer-events:none;position:relative}
.ss .bub:after{content:"";position:absolute;bottom:-8px;left:50%;margin-left:-6px;border:6px solid transparent;border-top-color:inherit}
.ss .bub.ai{background:#2a2353;color:#cfc6ff;border-color:#8b7cf6}
.ss .bub.gold{background:#1d1b18;color:#d9b46a;border-color:#d9b46a}
.ss .bub.dark{background:#16171b;color:#8ff0b0;border-color:#4fbf78}
.ss .bub.small{width:28px;height:28px;border-width:2px}
.ss .bub svg{width:18px;height:18px}
.ss .sign{background:var(--sb);border:2px solid var(--sbd);border-radius:6px;padding:7px 12px;pointer-events:none;white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.3)}
.ss .sign b{display:block;font-weight:900;font-size:16px;font-family:inherit;color:var(--st);letter-spacing:.02em}
.ss .sign span{display:block;font-weight:600;font-size:11.5px;font-family:inherit;color:var(--st);opacity:.75;margin-top:2px}
.ss .card{position:absolute;right:18px;bottom:18px;z-index:6;width:min(340px,calc(100% - 36px));background:rgba(14,15,19,.94);color:#f2eee6;border:1px solid rgba(217,180,106,.4);border-radius:16px;padding:16px 18px;font-size:13px;line-height:1.5;display:none}
.ss .card h3{font:400 24px var(--f-display),"Instrument Serif",serif;margin:0 0 4px}
.ss .card .k{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#a7a39b;margin-top:9px}
.ss .card a{color:#d9b46a;text-decoration:none;display:inline-block;margin-top:12px}
.ss .card button{position:absolute;top:12px;right:12px;background:none;border:1px solid rgba(242,238,230,.2);color:#c9c6bf;border-radius:999px;padding:2px 10px;cursor:pointer;font-family:inherit;font-size:12px}
.ss .pill,.ss .bub{transition:opacity .25s}
.ss.far .pill,.ss.far .bub{opacity:0}
.ss .sign{transition:transform .25s;transform-origin:center bottom}
.ss.far .sign{transform:scale(1.45)}
.ss .go{display:flex;gap:4px;pointer-events:auto;background:var(--g);backdrop-filter:blur(10px);padding:4px;border-radius:999px;border:1px solid rgba(127,127,127,.25);align-items:center}
.ss .go span{font-size:11.5px;color:var(--t);opacity:.6;padding:0 6px 0 10px}
.ss .go button{font-weight:600;font-size:12px;font-family:inherit;color:var(--t);opacity:.8;background:none;border:0;padding:6px 10px;border-radius:999px;cursor:pointer}
.ss .go button:hover{opacity:1;background:rgba(127,127,127,.18)}
.ss .hint{position:absolute;left:20px;bottom:16px;z-index:5;font-size:12px;color:var(--t);opacity:.65;pointer-events:none}
@media (max-width:760px){.ss .cap{font-size:20px}.ss .top h1{font-size:24px}.ss .hint{display:none}}`;

function mountSala(root, D, theme, THREE, OrbitControls, CSS2DRenderer, CSS2DObject) {
  const T = THEMES[theme] || THEMES.trading, E = T.env, LY = LAYOUTS[E.layout], ISLE = LY.isle, LOUNGE = LY.lounge;
  const OFF = D.offices.filter((o) => ISLE[o.piano]);
  const byId = Object.fromEntries(OFF.map((o) => [o.id, o]));
  const edges = (D.edges || []).filter((e) => byId[e.from] && byId[e.to]);
  root.style.setProperty("--t", T.ui.text); root.style.setProperty("--g", T.ui.glass); root.style.setProperty("--bgc", "#" + T.bg.toString(16).padStart(6, "0"));
  root.style.setProperty("--sb", T.ui.sign); root.style.setProperty("--sbd", T.ui.signBorder); root.style.setProperty("--st", T.ui.signText);

  const host = root.querySelector(".stage");
  const W = () => host.clientWidth || 800, H = () => host.clientHeight || 600;
  // three 0.147 (versione del progetto): colori e luci "legacy" di default → scena slavata rispetto al
  // prototipo (r160). Si allinea per la sola sala e si ripristina allo smontaggio (edificio e città restano com'erano).
  const CM = THREE.ColorManagement, prevLegacy = CM && "legacyMode" in CM ? CM.legacyMode : undefined;
  if (prevLegacy !== undefined) CM.legacyMode = false;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  if ("physicallyCorrectLights" in renderer) renderer.physicallyCorrectLights = true;
  if ("outputColorSpace" in renderer) renderer.outputColorSpace = "srgb"; else renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = T.exposure;
  host.appendChild(renderer.domElement);
  const css = new CSS2DRenderer(); css.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none"; host.appendChild(css.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(T.bg);
  const disposables = [];

  const M = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: .82, metalness: 0, ...o }); disposables.push(m); return m; };
  const mesh = (geo, m, cast = true) => { disposables.push(geo); const x = new THREE.Mesh(geo, m); x.castShadow = cast; x.receiveShadow = true; return x; };
  const B = (w, h, d, m) => mesh(new THREE.BoxGeometry(w, h, d), m);
  const RB = (w, h, d, r, m) => { const s = new THREE.Shape(); const x = -w / 2, y = -d / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return mesh(g, m); };
  const tag = (html, y) => { const d = document.createElement("div"); d.innerHTML = html; const o = new CSS2DObject(d); o.position.y = y; return o; };
  const tex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); if ("colorSpace" in t) t.colorSpace = "srgb"; else t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; disposables.push(t); return t; };
  const basic = (map, o = {}) => { const m = new THREE.MeshBasicMaterial({ map, ...o }); disposables.push(m); return m; };

  // luci
  scene.add(new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]));
  const sun = new THREE.DirectionalLight(T.sun[0], T.sun[1]); sun.position.set(-12, 22, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 1, far: 80 }); sun.shadow.radius = 4; sun.shadow.bias = -.0004; scene.add(sun);

  // pavimento, pareti, vetrate, schermo, logo
  const FW = 44, FD = 30;
  const floorTex = tex(1024, 1024, (x, w, h) => {
    const [a, b, blue] = T.floor; const rnd = (v) => `rgb(${v | 0},${(v + 1) | 0},${(v + blue) | 0})`;
    x.fillStyle = rnd(a); x.fillRect(0, 0, w, h);
    if (E.floor === "marble") { // marmo scuro con venature calde
      for (let i = 0; i < 9000; i++) { x.fillStyle = rnd(a + Math.random() * (b - a)); x.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
      x.strokeStyle = "rgba(217,180,106,.22)"; for (let i = 0; i < 14; i++) { x.lineWidth = .6 + Math.random() * 1.6; x.beginPath(); let px = Math.random() * w, py = 0; x.moveTo(px, py); while (py < h) { px += -30 + Math.random() * 60; py += 20 + Math.random() * 40; x.lineTo(px, py); } x.stroke(); }
      x.strokeStyle = "rgba(0,0,0,.35)"; x.lineWidth = 2; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(i * w / 4, 0); x.lineTo(i * w / 4, h); x.stroke(); x.beginPath(); x.moveTo(0, i * h / 4); x.lineTo(w, i * h / 4); x.stroke(); }
    } else if (E.floor === "concrete") { // cemento: macchie larghe e qualche crepa
      for (let i = 0; i < 260; i++) { const r = 20 + Math.random() * 90; const g = x.createRadialGradient(0, 0, 0, 0, 0, r); const v = a + Math.random() * (b - a); g.addColorStop(0, `rgba(${v | 0},${v | 0},${(v + blue) | 0},.35)`); g.addColorStop(1, "rgba(0,0,0,0)"); x.save(); x.translate(Math.random() * w, Math.random() * h); x.fillStyle = g; x.fillRect(-r, -r, 2 * r, 2 * r); x.restore(); }
      for (let i = 0; i < 20000; i++) { x.fillStyle = rnd(a - 8 + Math.random() * 24); x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
      x.strokeStyle = "rgba(0,0,0,.18)"; x.lineWidth = 2; for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo(i * w / 3, 0); x.lineTo(i * w / 3, h); x.stroke(); x.beginPath(); x.moveTo(0, i * h / 3); x.lineTo(w, i * h / 3); x.stroke(); }
    } else if (E.floor === "carpet") { for (let i = 0; i < 60000; i++) { x.fillStyle = rnd(a + Math.random() * (b - a)); x.fillRect(Math.random() * w, Math.random() * h, 1, 1); } }
    else { for (let i = 0; i < 26000; i++) { x.fillStyle = rnd(a + Math.random() * (b - a)); x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(5, 4);
  const floor = mesh(new THREE.PlaneGeometry(FW, FD), M(0xffffff, { map: floorTex }), false); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  let wallM = M(T.wall);
  if (E.walls === "brick") {
    const brick = tex(512, 512, (x, w, h) => { x.fillStyle = "#4a2a20"; x.fillRect(0, 0, w, h); const bw = 64, bh = 24; for (let r = 0; r < h / bh; r++) for (let c = -1; c < w / bw + 1; c++) { const v = 120 + Math.random() * 40; x.fillStyle = `rgb(${v},${v * .48 | 0},${v * .36 | 0})`; x.fillRect(c * bw + (r % 2) * bw / 2 + 2, r * bh + 2, bw - 4, bh - 4); } });
    brick.wrapS = brick.wrapT = THREE.RepeatWrapping; brick.repeat.set(10, 1.2); wallM = M(0xffffff, { map: brick });
  }
  const wb = B(FW, 4.2, .35, wallM); wb.position.set(0, 2.1, -FD / 2); scene.add(wb);
  const wl = B(.35, 4.2, FD, wallM); wl.position.set(-FW / 2, 2.1, 0); scene.add(wl);
  const city = tex(2048, 512, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, T.sky[0]); g.addColorStop(1, T.sky[1]); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const bw = 40 + Math.random() * 90, bh = 120 + Math.random() * 360, bx = Math.random() * w; x.fillStyle = T.towers[i % 4]; x.fillRect(bx, h - bh, bw, bh); x.fillStyle = T.lit; for (let yy = h - bh + 10; yy < h - 8; yy += 16) for (let xx = bx + 6; xx < bx + bw - 6; xx += 12) if (Math.random() > .35) x.fillRect(xx, yy, 6, 8); } });
  const win = mesh(new THREE.PlaneGeometry(FD - 4, 3.2), basic(city), false); win.position.set(-FW / 2 + .19, 2.25, 0); win.rotation.y = Math.PI / 2; scene.add(win);
  const mull = M(E.windows === "factory" ? 0x1a1a1c : 0x5b5d66, { metalness: .4, roughness: .4 });
  for (let z = -FD / 2 + 2; z <= FD / 2 - 2; z += E.windows === "factory" ? 1.3 : 2.6) { const m = B(.12, 3.3, .12, mull); m.position.set(-FW / 2 + .25, 2.25, z); scene.add(m); }
  if (E.windows === "factory") for (const y of [1.2, 2.25, 3.3]) { const r = B(.1, .09, FD - 4, mull); r.position.set(-FW / 2 + .25, y, 0); scene.add(r); }
  const lavorano = OFF.filter((o) => stato(o) === "lavora").length, fermi = OFF.filter((o) => stato(o) === "fermo").length;
  const chart = tex(2048, 640, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, T.chart[0]); g.addColorStop(1, T.chart[1]); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.globalAlpha = .14; x.strokeStyle = T.chart[2]; x.lineWidth = 2; for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(i * w / 12, 0); x.lineTo(i * w / 12, h); x.stroke(); } x.globalAlpha = 1;
    x.fillStyle = T.chart[2]; x.font = "900 46px Helvetica, Arial"; x.fillText("LA SEDE · OGGI", 60, 84); x.font = "600 32px Helvetica, Arial"; x.globalAlpha = .75; x.fillText(`${lavorano} uffici al lavoro · ${fermi} ${fermi === 1 ? "fermo" : "fermi"} · ${edges.length} collegamenti`, 60, 134); x.globalAlpha = 1;
    x.strokeStyle = T.chart[2]; x.lineWidth = 6; x.beginPath(); let y = h * .75; for (let i = 0; i <= 120; i++) { y = Math.max(h * .3, Math.min(h * .88, y - 7 + Math.random() * 12)); i ? x.lineTo(i * w / 120, y) : x.moveTo(0, y); } x.stroke(); });
  const [SW, SX] = E.screen === "giant" ? [26, -3] : [16, 6];
  const big = mesh(new THREE.PlaneGeometry(SW, E.screen === "giant" ? 3.6 : 5), basic(chart), false); big.position.set(SX, E.screen === "giant" ? 2.25 : 2.3, -FD / 2 + .19); scene.add(big);
  const bf = B(SW + .3, E.screen === "giant" ? 3.9 : 5.3, .1, M(T.monFrame)); bf.position.set(SX, E.screen === "giant" ? 2.25 : 2.3, -FD / 2 + .1); scene.add(bf);
  const logo = tex(1024, 512, (x, w) => { x.fillStyle = T.logo; x.font = "400 300px Georgia, serif"; x.textAlign = "center"; x.fillText("HOC", w / 2, 360); });
  const lg = mesh(new THREE.PlaneGeometry(9, 4.5), basic(logo, { transparent: true, depthWrite: false }), false); lg.rotation.x = -Math.PI / 2; lg.rotation.z = Math.PI / 4; lg.position.set(E.layout === "tiers" ? 8 : -3, .012, E.layout === "rooms" ? 0 : 9.5); if (E.layout !== "rooms") scene.add(lg);

  // arredi
  const leafM = M(T.leaf, { roughness: .9 }), potM = M(T.pot), metal = M(T.metal, { metalness: T.mono ? 0 : .55, roughness: .35 });
  const plant = (x, z, s = 1) => { const g = new THREE.Group(); const pot = mesh(new THREE.CylinderGeometry(.26 * s, .2 * s, .42 * s, 20), potM); pot.position.y = .21 * s; g.add(pot);
    for (let i = 0; i < 9; i++) { const l = mesh(new THREE.SphereGeometry(.2 * s, 16, 12), leafM); const a = i / 9 * Math.PI * 2; l.position.set(Math.cos(a) * .17 * s, .62 * s + (i % 3) * .13 * s, Math.sin(a) * .17 * s); l.scale.y = 1.35; g.add(l); }
    const top = mesh(new THREE.SphereGeometry(.22 * s, 16, 12), leafM); top.position.y = s; top.scale.y = 1.3; g.add(top); g.position.set(x, 0, z); scene.add(g); };
  const lamp = (x, z) => { const g = new THREE.Group(); const base = mesh(new THREE.CylinderGeometry(.28, .3, .05, 24), metal); g.add(base); const pole = mesh(new THREE.CylinderGeometry(.025, .025, 2, 10), metal); pole.position.y = 1; g.add(pole);
    const sh = mesh(new THREE.CylinderGeometry(.22, .34, .42, 28, 1, true), M(0xfff7e0, { emissive: T.lamp, emissiveIntensity: .9, side: THREE.DoubleSide })); sh.position.y = 2.05; g.add(sh); const l = new THREE.PointLight(T.lamp, 6, 6, 1.6); l.position.y = 1.9; g.add(l); g.position.set(x, 0, z); scene.add(g); };
  const sofaM = M(T.sofa, { roughness: .95 });
  const sofa = (x, z, rot) => { const g = new THREE.Group(); g.add(RB(2.2, .45, .95, .12, sofaM)); const back = RB(2.2, .6, .28, .1, sofaM); back.position.set(0, .45, -.34); g.add(back);
    for (const s of [-1, 1]) { const arm = RB(.28, .62, .95, .08, sofaM); arm.position.set(s * 1.1, 0, 0); g.add(arm); } g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g); };
  const pool = (x, z) => { const g = new THREE.Group(); const wood = M(T.mono ? 0xfbfaf8 : 0xe9e2d6); const top = RB(2.6, .18, 1.5, .1, wood); top.position.y = .78; g.add(top); const felt = B(2.3, .02, 1.2, M(T.mono ? 0xf1efeb : 0xa9e3c4)); felt.position.y = .97; g.add(felt);
    for (const [a, b] of [[-1.15, -.6], [1.15, -.6], [-1.15, .6], [1.15, .6]]) { const l = B(.16, .78, .16, wood); l.position.set(a, .39, b); g.add(l); }
    [0xf2c94c, 0xeb5757, 0x2f80ed, 0x27ae60, 0x9b51e0, 0xf2994a, 0x111111].forEach((c, i) => { const b = mesh(new THREE.SphereGeometry(.05, 12, 10), M(T.mono ? 0xe4e1dc : c, { roughness: .3 })); b.position.set(.4 + (i % 3) * .1, 1.03, -.1 + Math.floor(i / 3) * .1); g.add(b); }); g.position.set(x, 0, z); scene.add(g); };
  const parquet = tex(512, 512, (x, w, h) => { const [r, g, b] = T.lounge; x.fillStyle = `rgb(${r - 20},${g - 20},${b - 20})`; x.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) for (let j = -1; j < 4; j++) { const v = Math.random() * 18; x.fillStyle = `rgb(${(r + v) | 0},${(g + v) | 0},${(b + v) | 0})`; x.fillRect(j * w / 4 + ((i % 2) * w / 8), i * h / 16, w / 4 - 3, h / 16 - 3); } });
  parquet.wrapS = parquet.wrapT = THREE.RepeatWrapping; parquet.repeat.set(3, 3);
  const lounge = mesh(new THREE.PlaneGeometry(11, 8.5), M(0xffffff, { map: parquet, roughness: .7 }), false); lounge.rotation.x = -Math.PI / 2; lounge.position.set(LOUNGE[0], .01, LOUNGE[1]); scene.add(lounge);
  const [LX, LZ] = LOUNGE; sofa(LX - 2.3, LZ - 1.9, 0); sofa(LX + 2.1, LZ - 1.9, 0); sofa(LX + 3.9, LZ + .8, -Math.PI / 2); lamp(LX - 4.3, LZ - 2.8); lamp(LX + 4.9, LZ - 2.6); pool(LX - 1.1, LZ + 2);
  for (const [x, z, s] of [[-20, -13, 1.2], [20, -13, 1.1], [-20, 13, 1.2], [10.5, 13.5, 1], [-8, -13.3, .9], [0, 13.6, 1]]) plant(x, z, s);

  // persone
  const SKIN = [0xf1cfae, 0xe2b48c, 0xc68b5e, 0x8d5a3b, 0xf4d9c0], HAIR = [0x2a2420, 0x5a3a22, 0xd9c08a, 0x1b1b1f, 0xa55a33, 0x7a7a80];
  const shoeM = M(T.mono ? 0xe4e1dc : 0x16171a);
  // Omini per TIPO (Nicholas: "tipologie di omini diversi"): persona = giacca e cravatta oro; programma = felpa
  // col cappuccio; agente AI = occhiali luminosi e anello viola; robot = metallo con antenna; fattorino =
  // cappellino e borsa a tracolla. Capelli e carnagione variano col seed.
  const person = (kind, seed = 0, role = "desk") => {
    const g = new THREE.Group();
    const robot = kind === "robot";
    const skin = M(SKIN[seed % SKIN.length], { roughness: .7 });
    const hairM = M(HAIR[(seed * 7 + 3) % HAIR.length], { roughness: .9 });
    const metalM = M(0xb9c0cb, { metalness: .75, roughness: .28 }), darkMetal = M(0x4a505c, { metalness: .6, roughness: .4 });
    const top = robot ? metalM
      : role === "courier" ? M(0xefe8d8, { roughness: .85 })
      : kind === "codice" ? M([0x3d4a5c, 0x5a6b5a, 0x6b4f6b, 0x2f3540][seed % 4], { roughness: .95 })
      : kind === "AI" ? M(0xf1efff, { emissive: 0x6b5ce0, emissiveIntensity: .16 }) : M(T.shirt);
    const sleeve = top;
    const pants = M(robot ? 0x6b7280 : role === "courier" ? 0x2b2f38 : [0x2b3550, 0x2a2c33, 0x6b6f78, 0x1f2230, 0x4a3a2c][seed % 5]);
    const shoeM2 = robot ? darkMetal : shoeM;
    const legs = [-1, 1].map((s2) => { const p = new THREE.Group(); p.position.set(s2 * .1, .9, 0); const l = mesh(robot ? new THREE.CylinderGeometry(.07, .07, .74, 12) : new THREE.CapsuleGeometry(.075, .62, 6, 12), pants); l.position.y = -.39; p.add(l); const f = mesh(new THREE.BoxGeometry(.13, .08, .24), shoeM2); f.position.set(0, -.82, .05); p.add(f); g.add(p); return p; });
    if (robot) { const body = RB(.46, .5, .34, .08, metalM); body.position.y = .95; g.add(body); const chest = B(.22, .14, .02, M(0x8ff0b0, { emissive: 0x8ff0b0, emissiveIntensity: .9 })); chest.position.set(0, 1.22, .18); g.add(chest); }
    else {
      const torso = mesh(new THREE.CapsuleGeometry(.19, .34, 6, 16), top); torso.position.y = 1.2; torso.scale.z = .78; g.add(torso);
      if (kind === "persona" && role !== "courier") { // giacca aperta + cravatta
        const jacket = mesh(new THREE.CapsuleGeometry(.205, .3, 6, 16), M(T.vest.persona, { roughness: .7 })); jacket.position.set(0, 1.17, -.02); jacket.scale.set(1.04, 1, .8); g.add(jacket);
        const shirtV = B(.12, .26, .02, M(T.shirt)); shirtV.position.set(0, 1.29, .165); g.add(shirtV);
        const tie = B(.045, .24, .02, M(T.tie.persona)); tie.position.set(0, 1.27, .178); g.add(tie);
      } else if (kind === "codice" && role !== "courier") { // felpa: cappuccio dietro + tasca
        const hood = mesh(new THREE.TorusGeometry(.13, .055, 8, 16), top); hood.position.set(0, 1.5, -.1); hood.rotation.x = -.5; g.add(hood);
        const pocket = B(.24, .1, .02, M(0x000000, { transparent: true, opacity: .18 })); pocket.position.set(0, 1.06, .15); g.add(pocket);
      } else if (kind === "AI") {
        const v = mesh(new THREE.CapsuleGeometry(.195, .26, 6, 16), M(T.vest.AI, { roughness: .6 })); v.position.y = 1.16; v.scale.set(1.02, 1, .8); g.add(v);
      } else if (role === "courier") { // borsa a tracolla
        const strap = B(.04, .62, .03, M(0x5a3a22)); strap.position.set(0, 1.22, .155); strap.rotation.z = .7; g.add(strap);
        const bag = RB(.3, .22, .1, .03, M(0x6b4423, { roughness: .8 })); bag.position.set(.22, .92, .1); g.add(bag);
      } else { const v = mesh(new THREE.CapsuleGeometry(.195, .26, 6, 16), M(T.vest.codice, { roughness: .75 })); v.position.y = 1.16; v.scale.set(1.02, 1, .8); g.add(v); }
    }
    const arms = [-1, 1].map((s2) => { const p = new THREE.Group(); p.position.set(s2 * (robot ? .28 : .25), 1.43, 0); const a = mesh(robot ? new THREE.CylinderGeometry(.05, .05, .46, 10) : new THREE.CapsuleGeometry(.058, .46, 6, 12), sleeve); a.position.y = -.27; p.add(a); const hnd = mesh(new THREE.SphereGeometry(.065, 12, 10), robot ? darkMetal : skin); hnd.position.y = -.56; p.add(hnd); p.rotation.z = s2 * .08; g.add(p); return p; });
    if (robot) {
      const head = RB(.34, .28, .3, .06, metalM); head.position.y = 1.6; g.add(head);
      const visor = B(.26, .07, .02, M(0x8ff0b0, { emissive: 0x8ff0b0, emissiveIntensity: 1.4 })); visor.position.set(0, 1.76, .155); g.add(visor);
      const ant = mesh(new THREE.CylinderGeometry(.012, .012, .2, 6), darkMetal); ant.position.y = 1.98; g.add(ant);
      const tip = mesh(new THREE.SphereGeometry(.035, 10, 8), M(0xff6f61, { emissive: 0xff6f61, emissiveIntensity: 1.2 })); tip.position.y = 2.09; g.add(tip);
    } else {
      const head = mesh(new THREE.SphereGeometry(.17, 24, 18), skin); head.position.y = 1.72; g.add(head);
      for (const s2 of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(.018, 8, 6), M(0x1b1b1f), false); e.position.set(s2 * .06, 1.74, .155); g.add(e); }
      const style = role === "courier" ? "cap" : ["short", "long", "bun", "pony", "curly", "bald", "short", "long"][seed % 8];
      const cap = (y) => { const c = mesh(new THREE.SphereGeometry(.18, 24, 18, 0, Math.PI * 2, 0, Math.PI * .55), hairM); c.position.y = y; c.rotation.x = -.25; g.add(c); };
      if (style === "short") cap(1.74);
      if (style === "long") { cap(1.74); const back = RB(.32, .42, .12, .05, hairM); back.position.set(0, 1.4, -.12); g.add(back); }
      if (style === "bun") { cap(1.74); const bun = mesh(new THREE.SphereGeometry(.08, 14, 10), hairM); bun.position.set(0, 1.93, -.07); g.add(bun); }
      if (style === "pony") { cap(1.74); const pony = mesh(new THREE.CapsuleGeometry(.05, .22, 4, 8), hairM); pony.position.set(0, 1.58, -.2); pony.rotation.x = .35; g.add(pony); }
      if (style === "curly") for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const c = mesh(new THREE.SphereGeometry(.075, 10, 8), hairM); c.position.set(Math.cos(a) * .13, 1.84 + (i % 2) * .03, Math.sin(a) * .11 - .03); g.add(c); }
      if (style === "cap") { const capM = M(0xd9b46a, { roughness: .7 }); const c = mesh(new THREE.SphereGeometry(.175, 20, 14, 0, Math.PI * 2, 0, Math.PI * .36), capM); c.position.y = 1.77; g.add(c); const visor = mesh(new THREE.CylinderGeometry(.14, .14, .02, 18, 1, false, 0, Math.PI), capM); visor.position.set(0, 1.78, .1); visor.rotation.y = Math.PI / 2; g.add(visor); }
      if (kind === "AI") { // occhiali luminosi + anello che gira sopra la testa
        const gl = B(.26, .05, .02, M(0xb9aef9, { emissive: 0x8b7cf6, emissiveIntensity: 1.3 })); gl.position.set(0, 1.75, .16); g.add(gl);
        const halo = mesh(new THREE.TorusGeometry(.17, .016, 8, 40), M(0xb9aef9, { emissive: 0x8b7cf6, emissiveIntensity: 1.6 }), false); halo.rotation.x = Math.PI / 2; halo.position.y = 2.02; g.add(halo); g.userData.halo = halo;
      }
    }
    g.userData = { ...g.userData, legs, arms };
    return g;
  };
  const pose = (p, mode, t, ph = 0) => {
    const { legs, arms } = p.userData;
    if (mode === "walk" || mode === "carry") { const s = Math.sin(t * 7 + ph); legs[0].rotation.x = s * .55; legs[1].rotation.x = -s * .55; if (mode === "carry") { arms[0].rotation.x = arms[1].rotation.x = -1.1; } else { arms[0].rotation.x = -s * .5; arms[1].rotation.x = s * .5; } p.position.y = Math.abs(Math.cos(t * 7 + ph)) * .04; }
    else if (mode === "sit" || mode === "type") { legs[0].rotation.x = legs[1].rotation.x = -Math.PI / 2; p.position.y = -.42; const k = mode === "type" ? Math.sin(t * 14 + ph) * .06 : 0; arms[0].rotation.x = -1.15 + k; arms[1].rotation.x = -1.15 - k; }
    else if (mode === "lounge") { legs[0].rotation.x = legs[1].rotation.x = -Math.PI / 2; p.position.y = -.42; arms[0].rotation.x = arms[1].rotation.x = -.3; }
    else { legs[0].rotation.x = legs[1].rotation.x = 0; arms[0].rotation.x = arms[1].rotation.x = 0; p.position.y = 0; }
  };

  // scrivanie
  const screenTex = (kind) => tex(256, 160, (x, w, h) => {
    if (kind === "off") { x.fillStyle = T.mono ? "#e9e6e1" : "#15171b"; x.fillRect(0, 0, w, h); return; }
    if (kind === "stop") { x.fillStyle = "#2a1210"; x.fillRect(0, 0, w, h); return; }
    x.fillStyle = T.mono ? "#f4f3f1" : "#0c1712"; x.fillRect(0, 0, w, h);
    let y = h / 2; for (let i = 0; i < 22; i++) { const up = Math.random() > .42; const o = y, c = y + (up ? -1 : 1) * (4 + Math.random() * 12); x.fillStyle = T.mono ? (up ? "#6b6a66" : "#b5b2ac") : up ? "#5fe08f" : "#ff6f61"; x.fillRect(10 + i * 11, Math.min(o, c), 6, Math.abs(c - o) + 2); y = Math.max(25, Math.min(h - 25, c)); } });
  const SCREENS = { chart: [screenTex("chart"), screenTex("chart"), screenTex("chart")], off: [screenTex("off")], stop: [screenTex("stop")] };
  const deskTop = M(T.desk, { roughness: .55 }), chairM = M(T.chair, { roughness: .75 }), monM = M(T.monFrame), kbM = M(T.mono ? 0xf1efeb : 0xd9d9dc), padM = M(T.mono ? 0xebe9e5 : 0xbfc3c9);
  const chair = () => { const g = new THREE.Group(); const seat = RB(.52, .09, .5, .08, chairM); seat.position.y = .48; g.add(seat); const back = RB(.5, .62, .08, .06, chairM); back.position.set(0, .6, .25); g.add(back);
    const pole = mesh(new THREE.CylinderGeometry(.03, .03, .42, 10), metal); pole.position.y = .27; g.add(pole); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const leg = B(.04, .03, .3, metal); leg.position.set(Math.sin(a) * .14, .06, Math.cos(a) * .14); leg.rotation.y = a; g.add(leg); } return g; };
  const workers = [], hits = [], pos = {};
  let di = 0;
  const desk = (o, x, z, facing) => {
    const i = di++, st = stato(o), g = new THREE.Group();
    const top = B(1.7, .05, .85, deskTop); top.position.y = .76; g.add(top);
    for (const s of [-1, 1]) { const fr = B(.05, .76, .75, metal); fr.position.set(s * .8, .38, 0); g.add(fr); }
    const kind = st === "lavora" ? "chart" : st === "fermo" ? "stop" : "off";
    for (const [mx, ry] of [[-.36, .18], [.36, -.18]]) { const mon = new THREE.Group(); mon.add(B(.66, .42, .04, monM)); const sc = mesh(new THREE.PlaneGeometry(.6, .36), basic(SCREENS[kind][(i + (mx > 0 ? 1 : 0)) % SCREENS[kind].length]), false); sc.position.z = .022; mon.add(sc);
      const stand = B(.04, .2, .04, metal); stand.position.y = -.3; mon.add(stand); mon.position.set(mx, 1.13, -.25); mon.rotation.y = ry; g.add(mon); }
    const kb = B(.5, .02, .16, kbM); kb.position.set(0, .8, .12); g.add(kb);
    const pad = B(.9, .005, .45, padM); pad.position.set(0, .785, .08); g.add(pad);
    const ch = chair(); ch.position.set(0, 0, .72); ch.rotation.y = Math.PI; g.add(ch);
    if (st !== "fermo") {
      const p = person(o.tipo, i); p.position.set(0, 0, .66); p.rotation.y = Math.PI; g.add(p); workers.push({ p, mode: st === "lavora" ? "type" : "sit", ph: i });
      const ico = o.tipo === "AI" ? `<div class="bub ai"><svg viewBox="0 0 24 24" fill="#cfc6ff"><path d="M12 2l2.2 6.1L20 10l-5.8 1.9L12 18l-2.2-6.1L4 10l5.8-1.9z"/></svg></div>`
        : o.tipo === "persona" ? `<div class="bub gold">${esc(o.nome.split(" ").map((w) => w[0]).join("").slice(0, 2))}</div>`
        : o.tipo === "robot" ? `<div class="bub dark"><svg viewBox="0 0 24 24" fill="none" stroke="#8ff0b0" stroke-width="2"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/></svg></div>` : "";
      if (ico) g.add(tag(ico, 2.7));
      g.add(tag(`<div class="pill ${st === "lavora" ? "ok" : "idle"}">${esc(o.nome)}</div>`, 2.05));
    }
    const hit = mesh(new THREE.BoxGeometry(1.8, 2, 1.9), new THREE.MeshBasicMaterial({ visible: false }), false); hit.position.set(0, 1, .4); hit.userData.o = o; g.add(hit); hits.push(hit);
    g.position.set(x, 0, z); g.rotation.y = facing; scene.add(g);
    const front = new THREE.Vector3(0, 0, 1.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), facing);
    pos[o.id] = { x: x + front.x, z: z + front.z, ...meta };
  };
  let meta = {};
  const sign = (text, sub, x, z, rot) => {
    const g = new THREE.Group();
    const board = B(2.5, .85, .06, M(parseInt(T.ui.sign.slice(1), 16))); board.position.y = 1.45; board.rotation.x = -.15; g.add(board);
    const edge = B(2.56, .91, .04, M(parseInt(T.ui.signBorder.slice(1), 16))); edge.position.set(0, 1.45, -.03); edge.rotation.x = -.15; g.add(edge);
    const pole = mesh(new THREE.CylinderGeometry(.04, .04, 1.05, 10), metal); pole.position.y = .52; g.add(pole); const base = mesh(new THREE.CylinderGeometry(.3, .32, .05, 24), metal); base.position.y = .025; g.add(base);
    g.add(tag(`<div class="sign"><b>${esc(text)}</b><span>${esc(sub)}</span></div>`, 1.5));
    g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  };
  const occ = (list) => { const n = {}; list.forEach((o) => (n[o.tipo] = (n[o.tipo] || 0) + 1)); return Object.entries(n).map(([t, c]) => `${c} ${c === 1 ? TIPO[t] : TIPI[t]}`).join(" · "); };
  const SP = 2.05; // passo tra le scrivanie: largo abbastanza perché i nomi non si accavallino
  // STANZE (Nicholas, 4/10: "delineare meglio gli uffici, tipo le stanze in vetro"): pareti alte con montanti,
  // parete di fondo piena con lo schermo dell'area, porta scorrevole sul corridoio, insegna sopra la porta,
  // pavimento proprio, una pianta, filo colorato dell'area sulla porta.
  const R = E.room, WH = 2.3;
  const glassM = R ? M(R.glass, { transparent: true, opacity: R.op, roughness: .08, metalness: .1, depthWrite: false }) : null;
  const frameM = R ? M(R.frame, { metalness: R.wall === "dark" ? .7 : .2, roughness: .35 }) : null;
  const panelM = R ? M(R.wall === "half" ? 0xb8925f : R.back, { roughness: .6 }) : null;
  const backM = R ? M(R.back, { roughness: .85 }) : null;
  const plankTex = (base) => { const t = tex(512, 512, (x, w, h) => { const [r, g, b] = base; x.fillStyle = `rgb(${r - 18},${g - 18},${b - 18})`; x.fillRect(0, 0, w, h); for (let i = 0; i < 12; i++) for (let j = -1; j < 4; j++) { const v = Math.random() * 16; x.fillStyle = `rgb(${(r + v) | 0},${(g + v) | 0},${(b + v) | 0})`; x.fillRect(j * w / 3 + ((i % 2) * w / 6), i * h / 12, w / 3 - 2, h / 12 - 2); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); return t; };
  const roomFloorM = R ? M(0xffffff, { map: plankTex(R.floor === "walnut" ? [86, 60, 44] : R.floor === "oak" ? [196, 158, 112] : [228, 220, 206]), roughness: .65 }) : null;
  const plaque = (text, sub, x, y, z, accent) => { const o = tag(`<div class="sign" style="border-color:${accent}"><b>${esc(text)}</b><span>${esc(sub)}</span></div>`, y); o.position.x = x; o.position.z = z; scene.add(o); };
  const roomScreen = (w, label, list) => tex(1024, 320, (x, W2, H2) => { x.fillStyle = R.wall === "dark" ? "#0f0e0c" : "#14181d"; x.fillRect(0, 0, W2, H2);
    const lav = list.filter((o) => stato(o) === "lavora").length, fer = list.filter((o) => stato(o) === "fermo").length;
    x.fillStyle = "#e9e6df"; x.font = "bold 54px Helvetica, Arial"; x.fillText(label, 40, 80);
    x.font = "600 34px Helvetica, Arial"; x.fillStyle = "#9fdcb4"; x.fillText(`${lav} al lavoro`, 40, 140); x.fillStyle = fer ? "#ff9a8a" : "#8a8780"; x.fillText(`${fer} ${fer === 1 ? "fermo" : "fermi"}`, 300, 140);
    list.forEach((o, i) => { const st = stato(o); x.fillStyle = st === "lavora" ? "#4fbf78" : st === "fermo" ? "#d8584a" : "#55534e"; x.fillRect(40 + i * 64, 190, 52, 90); }); });
  const buildRoom = (cx, cz, rw, rd, area, list, opts = {}) => {
    const hw = rw / 2, doorSide = cz < 0 ? 1 : -1, door = 1.7, fz = cz + doorSide * rd / 2, bz = cz - doorSide * rd / 2, accent = ACCENT[area] || "#d9b46a";
    const fl = mesh(new THREE.PlaneGeometry(rw, rd), roomFloorM, false); fl.rotation.x = -Math.PI / 2; fl.position.set(cx, .009, cz); scene.add(fl);
    // parete di fondo piena + schermo dell'area
    // la parete piena va solo sul lato lontano dalla camera, altrimenti nasconde la stanza
    const solidBack = doorSide === 1;
    if (solidBack) { const back = B(rw, WH, .14, backM); back.position.set(cx, WH / 2, bz); scene.add(back); }
    if (solidBack && !opts.relax) { const scr = mesh(new THREE.PlaneGeometry(Math.min(3.6, rw - 1), 1.1), basic(roomScreen(rw, AREE[area] || "", list)), false); scr.position.set(cx, 1.5, bz + doorSide * .08); if (doorSide < 0) scr.rotation.y = Math.PI; scene.add(scr); }
    // pareti di vetro con montanti (laterali e fronte con porta)
    const glassWall = (w, x, z, rotY) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
      const low = R.wall === "half" ? .95 : 0;
      if (low) { const pn = B(w, low, .08, panelM); pn.position.y = low / 2; g.add(pn); }
      const gl = B(w, WH - low, .03, glassM); gl.position.y = low + (WH - low) / 2; gl.castShadow = false; g.add(gl);
      for (const y of [low || .02, WH]) { const r = B(w, .06, .09, frameM); r.position.y = y; g.add(r); }
      const n = Math.max(1, Math.round(w / 1.3)); for (let k = 0; k <= n; k++) { const m = B(.05, WH, .09, frameM); m.position.set(-w / 2 + k * w / n, WH / 2, 0); g.add(m); }
    };
    glassWall(rd, cx - hw, cz, Math.PI / 2); glassWall(rd, cx + hw, cz, Math.PI / 2);
    if (!solidBack) glassWall(rw, cx, bz, 0);
    const side = (rw - door) / 2; glassWall(side, cx - hw + side / 2, fz, 0); glassWall(side, cx + hw - side / 2, fz, 0);
    // porta scorrevole socchiusa + architrave col filo colorato dell'area
    const dp = B(door * .9, WH - .05, .03, glassM); dp.position.set(cx + door * .55, WH / 2, fz + doorSide * .07); dp.castShadow = false; scene.add(dp);
    const lintel = B(door + .1, .12, .1, frameM); lintel.position.set(cx, WH, fz); scene.add(lintel);
    const stripe = B(door + .1, .04, .11, M(parseInt(accent.slice(1), 16), { emissive: parseInt(accent.slice(1), 16), emissiveIntensity: .6 })); stripe.position.set(cx, WH - .1, fz); scene.add(stripe);
    // pianta in un angolo
    if (!opts.relax) plant(cx - hw + .55, bz + doorSide * .55, .85);
    plaque(opts.title || AREE[area], opts.sub || `${list.length} uffici · ${occ(list)}`, cx, WH + .55, fz, accent);
    return { cx, inZ: fz - doorSide * .6, doorZ: fz, outZ: fz + doorSide * .8, ix: opts.relax ? 0 : hw - .45 };
  };
  const rugM = E.rugs ? M(0x5a2f2a, { roughness: .95 }) : null, rugBorder = E.rugs ? M(0xb08a52, { roughness: .9 }) : null;
  for (const [p, [cx, cz]] of Object.entries(ISLE)) {
    const list = OFF.filter((o) => o.piano === p); if (!list.length) continue;
    if (E.layout === "tiers") { // una fila per area, tutti rivolti allo schermo grande
      const n = list.length, hw = n * SP / 2;
      const plat = B(n * SP + 1.4, .12, 2.6, M(T.wall)); plat.position.set(cx, .06, cz + .5); scene.add(plat);
      meta = { cx, hw, room: null, row: cz };
      list.forEach((o, i) => desk(o, cx + (i - (n - 1) / 2) * SP, cz, 0));
      sign(AREE[p], `${n} uffici · ${occ(list)}`, cx - hw - 1.9, cz + .6, .35);
      continue;
    }
    const cols = Math.ceil(list.length / 2), rw = Math.max(2, cols) * SP + 1.7, rd = R ? 5.2 : 4.4, hw = rw / 2;
    let room = null;
    if (R) { room = buildRoom(cx, cz, rw, rd, p, list); }
    if (E.rugs) { const r = RB(rw + .4, .02, rd + .2, .3, rugBorder); r.position.set(cx, .003, cz); scene.add(r); const r2 = RB(rw, .025, rd - .2, .25, rugM); r2.position.set(cx, .006, cz); scene.add(r2); }
    if (E.pendants) for (let k = 0; k < cols; k++) { const lx = cx + (k - (cols - 1) / 2) * SP; const cord = mesh(new THREE.CylinderGeometry(.01, .01, 1.6, 6), M(0x111111), false); cord.position.set(lx, 3.8, cz); scene.add(cord);
      const shade = mesh(new THREE.ConeGeometry(.32, .34, 24, 1, true), M(0x1d1d1f, { side: THREE.DoubleSide, metalness: .4, roughness: .5 })); shade.position.set(lx, 2.9, cz); scene.add(shade);
      const bulb = mesh(new THREE.SphereGeometry(.08, 12, 10), M(0xfff1d0, { emissive: T.lamp, emissiveIntensity: 2 }), false); bulb.position.set(lx, 2.78, cz); scene.add(bulb);
      const pl = new THREE.PointLight(T.lamp, 5, 6, 1.7); pl.position.set(lx, 2.7, cz); scene.add(pl); }
    meta = { cx, hw: hw + .1, room };
    list.forEach((o, i) => { const row = i % 2, col = Math.floor(i / 2); desk(o, cx + (col - (cols - 1) / 2) * SP, cz + (row ? .6 : -.6), row ? 0 : Math.PI); });
    if (!R) sign(AREE[p], `${list.length} uffici · ${occ(list)}`, cx - hw - 1.1, cz + 1.9, .35);
  }
  let relaxRoom = null;
  if (R) { // corridoio + stanza relax
    const run = mesh(new THREE.PlaneGeometry(FW - 6, 2.2), M(R.wall === "dark" ? 0x2a2420 : R.wall === "half" ? 0xd8cbb4 : 0xffffff, { roughness: .9 }), false); run.rotation.x = -Math.PI / 2; run.position.set(0, .007, LY.lanes[0]); scene.add(run);
    relaxRoom = buildRoom(LOUNGE[0], LOUNGE[1], 10.4, 7.6, "relax", [], { relax: true, title: "RELAX", sub: "chi è fermo aspetta qui" });
  }
  // chi è fermo va sul divano, col cartellino rosso
  const SEATS = [[LX - 2.8, LZ - 1.75], [LX - 1.8, LZ - 1.75], [LX + 1.6, LZ - 1.75], [LX + 2.6, LZ - 1.75], [LX + 3.75, LZ + .3, -Math.PI / 2], [LX + 3.75, LZ + 1.3, -Math.PI / 2]];
  OFF.filter((o) => stato(o) === "fermo").slice(0, SEATS.length).forEach((o, i) => {
    const [x, z, r = 0] = SEATS[i]; const p = person(o.tipo, 7 + i); p.position.set(x, 0, z); p.rotation.y = r; scene.add(p); pose(p, "lounge", 0);
    p.add(tag(`<div class="pill ko">${esc(o.nome)} · fermo${o.at ? " da " + ago(o.at).replace(" fa", "") : ""}</div>`, 2.15));
    pos[o.id] ||= relaxRoom ? { x, z: relaxRoom.inZ, cx: x, hw: 0, room: relaxRoom } : { x, z: z + .8, cx: x, hw: 0, room: null };
    const hit = mesh(new THREE.BoxGeometry(.9, 1.6, .9), new THREE.MeshBasicMaterial({ visible: false }), false); hit.position.set(x, .8, z); hit.userData.o = o; scene.add(hit); hits.push(hit);
  });

  // fattorini: dagli uffici che hanno lavorato, il fascicolo va all'ufficio dopo e il fattorino torna
  const couriers = []; let ci = 0;
  const folderM = M(0xd9b46a, { emissive: 0xb08a3a, emissiveIntensity: .35, metalness: .2, roughness: .4 });
  const segs = (path) => { let L = 0; const s = []; for (let i = 1; i < path.length; i++) { const [x0, z0] = path[i - 1], [x1, z1] = path[i]; const l = Math.hypot(x1 - x0, z1 - z0); if (l < .01) continue; s.push({ x0, z0, x1, z1, l, L }); L += l; } s.total = L; return s; };
  const at = (seg, d) => { for (const s of seg) if (d <= s.L + s.l) { const k = (d - s.L) / s.l; return [s.x0 + (s.x1 - s.x0) * k, s.z0 + (s.z1 - s.z0) * k, Math.atan2(s.x1 - s.x0, s.z1 - s.z0)]; } const e = seg[seg.length - 1]; return [e.x1, e.z1, Math.atan2(e.x1 - e.x0, e.z1 - e.z0)]; };
  // dalla scrivania si esce di lato (mai attraverso l'isola), poi corridoio, poi si entra di lato
  const side = (m) => m.cx + (m.x >= m.cx ? 1 : -1) * (m.hw + .55);
  const route = (a, b, k) => {
    const off = (k % 3 - 1) * .45;
    if (E.layout === "tiers") { const ax = LY.aisle + off; return [[a.x, a.z], [ax, a.z], [ax, b.z], [b.x, b.z]]; }
    if (E.layout === "rooms") {
      // dentro la stanza: corsia interna lungo la parete (mai attraverso il vetro), poi la porta
      const inner = (m) => m.room.ix ? m.room.cx + (m.x >= m.room.cx ? 1 : -1) * m.room.ix : m.x;
      const out = (m) => m.room ? [[inner(m), m.z], [inner(m), m.room.inZ], [m.room.cx, m.room.inZ], [m.room.cx, m.room.doorZ], [m.room.cx, m.room.outZ]] : [];
      const lane = LY.lanes[0] + off, A = out(a), Bp = out(b).reverse();
      const ax = a.room ? a.room.cx : a.x, bx = b.room ? b.room.cx : b.x;
      return [[a.x, a.z], ...A, [ax, lane], [bx, lane], ...Bp, [b.x, b.z]];
    }
    const L = LY.lanes, lane = L[(Math.abs(a.z - L[0]) + Math.abs(b.z - L[0])) < (Math.abs(a.z - L[1]) + Math.abs(b.z - L[1])) ? 0 : 1] + off;
    const sa = a.hw ? side(a) : a.x, sb = b.hw ? side(b) : b.x;
    return [[a.x, a.z], [sa, a.z], [sa, lane], [sb, lane], [sb, b.z], [b.x, b.z]];
  };
  for (const e of edges) {
    const o = byId[e.from]; if (stato(o) !== "lavora") continue; const a = pos[e.from], b = pos[e.to]; if (!a || !b) continue;
    const seg = segs(route(a, b, ci)); if (!seg.length) continue;
    const p = person("codice", 11 + ci, "courier"); scene.add(p);
    const folder = B(.32, .04, .24, folderM); folder.position.set(0, 1.08, .34); p.add(folder);
    p.add(tag(`<div class="bub gold small"><svg viewBox="0 0 24 24" fill="#d9b46a"><path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg></div>`, 2.35));
    const ringM = new THREE.MeshBasicMaterial({ color: 0xd9b46a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }); disposables.push(ringM);
    const ring = mesh(new THREE.RingGeometry(.3, .4, 40), ringM, false); ring.rotation.x = -Math.PI / 2; ring.position.set(b.x, .02, b.z); scene.add(ring);
    couriers.push({ p, folder, ring, seg, off: (ci * 7.3) % 40, rest: 22 + (ci % 5) * 4, speed: 1.9 }); ci++;
  }

  // camera e giro guidato
  const size = 6.5, aspect = () => W() / H();
  const camera = new THREE.OrthographicCamera(-size * aspect(), size * aspect(), size, -size, -100, 200);
  const ISO = new THREE.Vector3(14, 17, 14);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .12;
  // come una mappa: trascini col sinistro e la sala scorre; destro = ruota; rotella/pizzico = zoom
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.screenSpacePanning = false; controls.minPolarAngle = .55; controls.maxPolarAngle = 1.1; controls.minZoom = .5; controls.maxZoom = 2.2;
  const clampTarget = () => { const t = controls.target, cx = Math.max(-20, Math.min(20, t.x)), cz = Math.max(-13, Math.min(13, t.z)); if (cx !== t.x || cz !== t.z) { const dx = cx - t.x, dz = cz - t.z; t.x = cx; t.z = cz; camera.position.x += dx; camera.position.z += dz; } };
  controls.addEventListener("change", clampTarget);
  const STOPS = Object.entries(ISLE).filter(([p]) => OFF.some((o) => o.piano === p)).map(([p, at]) => ({ at, cap: { dati: "i dati entrano ogni notte", vendite: "vendite e coaching al lavoro", formazione: "la formazione vendite", persone: "persone e organizzazione", controllo: "il controllo verifica tutto", direzione: "il fascicolo arriva alla direzione" }[p] }));
  if (fermi) STOPS.push({ at: LOUNGE, cap: fermi === 1 ? "chi è fermo è in pausa" : `${fermi} uffici fermi, in pausa` });
  let tour = true, stopI = 0, stopT = 0; const camTarget = new THREE.Vector3(STOPS[0].at[0], 0, STOPS[0].at[1]);
  controls.target.copy(camTarget); camera.position.copy(camTarget).add(ISO);
  const capEl = root.querySelector(".cap"), bTour = root.querySelector('[data-cam="tour"]'), bAll = root.querySelector('[data-cam="all"]');
  let fly = null; // volo verso un'area: { x, z, zoom }
  const setTour = (on) => { tour = on; bTour.classList.toggle("on", on); bAll.classList.toggle("on", !on); stopT = 0; if (on) fly = { zoom: 1 }; else { fly = { x: 0, z: 0, zoom: .55 }; capEl.style.opacity = 0; } };
  root.querySelectorAll("[data-go]").forEach((b) => { b.onclick = () => { const at = b.dataset.go === "relax" ? LOUNGE : ISLE[b.dataset.go]; if (!at) return; tour = false; bTour.classList.remove("on"); bAll.classList.remove("on"); capEl.style.opacity = 0; fly = { x: at[0], z: at[1], zoom: 1.15 }; }; });
  const keys = new Set();
  const onKey = (e) => { if (e.target.closest && e.target.closest("input,textarea,select")) return; const k = e.key.toLowerCase(); if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) { if (e.type === "keydown") { keys.add(k); tour = false; fly = null; bTour.classList.remove("on"); capEl.style.opacity = 0; } else keys.delete(k); e.preventDefault(); } };
  window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKey);
  bTour.onclick = () => setTour(true); bAll.onclick = () => setTour(false);
  const stopTour = () => { fly = null; if (tour) { tour = false; bTour.classList.remove("on"); capEl.style.opacity = 0; } };
  renderer.domElement.addEventListener("pointerdown", stopTour);
  renderer.domElement.addEventListener("wheel", stopTour, { passive: true });

  // clic su un ufficio
  const card = root.querySelector(".card");
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let downAt = null;
  const onDown = (e) => { downAt = [e.clientX, e.clientY]; };
  const onUp = (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect(); mouse.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(mouse, camera);
    const h = ray.intersectObjects(hits)[0]; if (!h) { card.style.display = "none"; return; }
    const o = h.object.userData.o, da = edges.filter((x) => x.to === o.id).map((x) => byId[x.from]?.nome), a = edges.filter((x) => x.from === o.id).map((x) => byId[x.to]?.nome);
    const st = stato(o);
    card.innerHTML = `<button>Chiudi</button><h3>${esc(o.nome)}</h3><div style="color:#a7a39b">${TIPO[o.tipo] || o.tipo} · ${st === "lavora" ? (o.stato === "persona" ? "persona" : "ha lavorato " + ago(o.at)) : st === "fermo" ? "fermo" + (o.at ? " · ultimo lavoro " + ago(o.at) : "") : "lavora a richiesta"}</div>
      <div style="margin-top:8px">${esc(o.compito || "")}</div>
      <div class="k">Riceve il fascicolo da</div><div>${esc(da.join(", ") || "—")}</div>
      <div class="k">Consegna</div><div>${esc(o.risultato || "—")}</div>
      ${a.length ? `<div class="k">A</div><div>${esc(a.join(", "))}</div>` : ""}
      ${o.tipo !== "persona" ? `<div class="k">Chi controlla · chi risponde</div><div>${esc(o.controllore || "nessuno")} · ${esc(o.owner || "nessuno")}</div>` : ""}
      ${o.link ? `<a href="${esc(o.link)}">Apri l'ufficio →</a>` : ""}`;
    card.style.display = "block"; card.querySelector("button").onclick = () => (card.style.display = "none");
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  // ciclo
  let reduce = false; try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* */ }
  const t0 = performance.now(); let last = t0, raf = 0;
  const frame = (now) => {
    const t = reduce ? 0 : (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now;
    for (const w of workers) { pose(w.p, w.mode, t, w.ph); if (w.p.userData.halo) w.p.userData.halo.rotation.z = t * 1.4; }
    for (const c of couriers) {
      if (reduce) { c.p.visible = false; continue; }
      const go = c.seg.total / c.speed, wait = 1.1, cyc = go * 2 + wait + c.rest, ph = (t + c.off) % cyc;
      let d, back = false, vis = true;
      if (ph < go) d = ph * c.speed; else if (ph < go + wait) { d = c.seg.total; const k = (ph - go) / wait; c.ring.material.opacity = .85 * (1 - k); c.ring.scale.setScalar(1 + k * 2.5); }
      else if (ph < go * 2 + wait) { d = c.seg.total - (ph - go - wait) * c.speed; back = true; } else { d = 0; vis = false; }
      if (ph < go || ph >= go + wait) c.ring.material.opacity = 0;
      const [x, z, ang] = at(c.seg, Math.max(0, Math.min(c.seg.total, d)));
      c.p.visible = vis; c.p.position.x = x; c.p.position.z = z; c.p.rotation.y = back ? ang + Math.PI : ang;
      pose(c.p, ph >= go && ph < go + wait ? "idle" : back ? "walk" : "carry", t, c.off); c.folder.visible = !back;
    }
    if (tour && !reduce) {
      stopT += dt; if (stopT > 6.5) { stopT = 0; stopI = (stopI + 1) % STOPS.length; }
      const s = STOPS[stopI]; camTarget.set(s.at[0], 0, s.at[1]); capEl.textContent = s.cap; capEl.style.opacity = stopT < .4 ? stopT / .4 : stopT > 6 ? (6.5 - stopT) / .5 : 1;
      const d = camTarget.clone().sub(controls.target).multiplyScalar(.035); controls.target.add(d); camera.position.add(d);
      if (fly?.zoom) { camera.zoom += (fly.zoom - camera.zoom) * .06; camera.updateProjectionMatrix(); }
    } else if (fly) {
      if (fly.x !== undefined) { const d = new THREE.Vector3(fly.x - controls.target.x, 0, fly.z - controls.target.z).multiplyScalar(.08); controls.target.add(d); camera.position.add(d); }
      camera.zoom += (fly.zoom - camera.zoom) * .08; camera.updateProjectionMatrix();
      if (Math.abs(fly.zoom - camera.zoom) < .01 && (fly.x === undefined || Math.hypot(fly.x - controls.target.x, fly.z - controls.target.z) < .05)) fly = null;
    }
    if (keys.size) { // frecce/WASD: muovono la vista sul pavimento, nella direzione dello schermo
      const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize(); const r = new THREE.Vector3(-f.z, 0, f.x); const v = new THREE.Vector3(), sp = 14 * dt / camera.zoom;
      if (keys.has("arrowup") || keys.has("w")) v.add(f); if (keys.has("arrowdown") || keys.has("s")) v.sub(f); if (keys.has("arrowright") || keys.has("d")) v.add(r); if (keys.has("arrowleft") || keys.has("a")) v.sub(r);
      v.multiplyScalar(sp); controls.target.add(v); camera.position.add(v); clampTarget();
    }
    // livelli di dettaglio: da lontano solo i cartelli delle aree (grandi), da vicino nomi e bollini
    const far = camera.zoom < .8; if (far !== root.classList.contains("far")) root.classList.toggle("far", far);
    controls.update(); renderer.render(scene, camera); css.render(scene, camera); raf = requestAnimationFrame(frame);
  };
  const resize = () => { renderer.setSize(W(), H()); css.setSize(W(), H()); camera.left = -size * aspect(); camera.right = size * aspect(); camera.top = size; camera.bottom = -size; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(host); resize(); raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); root.classList.remove("far");
    renderer.domElement.removeEventListener("pointerdown", stopTour); renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointerup", onUp);
    for (const d of disposables) d.dispose?.();
    renderer.dispose(); host.innerHTML = "";
    if (prevLegacy !== undefined) CM.legacyMode = prevLegacy;
  };
}

export default function SedeSala({ data, onView }) {
  const ref = useRef(null);
  const [theme, setTheme] = useState("trading");
  const [err, setErr] = useState(false);
  useEffect(() => { try { const t = localStorage.getItem("hoc:sede-ufficio"); if (t && THEME_ORDER.includes(t)) setTheme(t); } catch { /* */ } }, []);
  const pick = (t) => { setTheme(t); try { localStorage.setItem("hoc:sede-ufficio", t); } catch { /* */ } };
  useEffect(() => {
    if (!data?.offices || !ref.current) return;
    let unmount = null, dead = false;
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const { CSS2DRenderer, CSS2DObject } = await import("three/examples/jsm/renderers/CSS2DRenderer.js");
      if (dead || !ref.current) return;
      unmount = mountSala(ref.current, data, theme, THREE, OrbitControls, CSS2DRenderer, CSS2DObject);
    })().catch(() => setErr(true));
    return () => { dead = true; unmount?.(); };
  }, [data, theme]);
  const T = THEMES[theme];
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={ref} className="ss" style={{ background: "#" + T.bg.toString(16).padStart(6, "0") }}>
        <div className="stage" style={{ position: "absolute", inset: 0 }} />
        <div className="top">
          <h1>La Sede</h1>
          <div className="seg" role="group" aria-label="Stile">{THEME_ORDER.map((k) => <button key={k} className={k === theme ? "on" : ""} onClick={() => pick(k)}>{THEMES[k].label}</button>)}</div>
          <div className="r">
            <div className="seg"><button data-cam="tour" className="on">Giro guidato</button><button data-cam="all">Tutta la sala</button></div>
            <div className="seg"><button onClick={() => onView?.("pianta")}>Pianta e dettagli</button><button onClick={() => onView?.("edificio")}>Edificio</button></div>
          </div>
        </div>
        <div className="top" style={{ top: 58 }}>
          <div className="go" role="group" aria-label="Vai a"><span>Vai a</span>{Object.keys(GO_LABEL).filter((p) => data?.offices?.some((o) => o.piano === p)).map((p) => <button key={p} data-go={p}>{GO_LABEL[p]}</button>)}<button data-go="relax">Relax</button></div>
        </div>
        <div className="hint">Trascina per muoverti · rotella per avvicinarti · tasto destro per girare · frecce o WASD</div>
        <div className="cap" />
        <div className="card" />
        {err && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#c9c6bf" }}>La sala non si è caricata. Ricarica la pagina.</div>}
      </div>
    </>
  );
}
