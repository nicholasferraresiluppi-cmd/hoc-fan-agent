"use client";

/**
 * La Sede (04/10/2026) — l'azienda come EDIFICIO: un piano per area, una stanza per
 * ufficio (persona, codice, AI, robot), la luce dice se ha lavorato davvero, i fili
 * dorati dicono a chi passa il lavoro. Stesso linguaggio di La città (CityScene):
 * vetro, oro, verde/ambra per lo stato, three.js caricato SOLO qui (import dinamico),
 * tutto il DOM dentro `root` e smontato all'uscita. Modello indicato da Nicholas:
 * i reel "ufficio di agenti" (trading floor isometrico, persone alle scrivanie,
 * stato a colpo d'occhio). Niente cifre sopra le persone: qui si giudica il LAVORO
 * degli uffici, non le persone.
 */
/* eslint-disable */
import { useEffect, useRef } from "react";

const CSS = `.sd{position:fixed;top:0;right:0;bottom:0;left:248px;z-index:30;overflow:hidden;color:#F2EEE6;font-family:var(--f-sans),Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased;background:radial-gradient(120% 90% at 55% 35%,#1B1C22 0%,#08090C 72%);--fg2:rgba(242,238,230,.6);--fg3:rgba(242,238,230,.36);--line:rgba(242,238,230,.12);--gold:#D9B46A;--ok:#7FE0B8;--wait:#FFB54A;--stop:#6B6D75;--bad:#F08C8C}
@media (max-width:899px){.sd{left:0;top:56px;bottom:72px}}
.sd *{box-sizing:border-box;font-family:inherit}
.sd canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}
.sd .serif{font-family:var(--f-display),"Instrument Serif",Georgia,serif;font-weight:400}
/* lo stile Casa anima i nipoti di .casa-page (casa-rise, fill both): l'animazione resta a opacity 1 e vinceva su .gone/hero → intro mai sparita (ott 2026) */
.sd>*{animation:none!important}
.sd .intro{position:absolute;inset:0;z-index:9;background:#07080B;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;transition:opacity 1.1s ease}
.sd .intro.gone{opacity:0;pointer-events:none}
.sd .intro b{font-family:var(--f-display),"Instrument Serif",Georgia,serif;font-weight:400;font-size:clamp(44px,6vw,84px);opacity:0;transform:translateY(8px);transition:opacity 1.1s ease,transform 1.1s ease}
.sd .intro i{display:block;height:1px;width:0;background:linear-gradient(90deg,transparent,var(--gold),transparent);transition:width 1.5s cubic-bezier(.2,.8,.2,1)}
.sd .intro.go b{opacity:1;transform:none}.sd .intro.go i{width:min(360px,60vw)}
.sd .top{position:absolute;top:24px;left:34px;right:34px;display:flex;justify-content:space-between;align-items:center;gap:14px;z-index:5;pointer-events:none}
.sd .top b{font-family:var(--f-display),"Instrument Serif",Georgia,serif;font-weight:400;font-size:26px}
.sd .top .r{display:flex;gap:10px;pointer-events:auto}
.sd .pill{font:inherit;font-size:13px;color:var(--fg2);background:none;border:1px solid var(--line);border-radius:999px;padding:7px 14px;cursor:pointer}
.sd .pill:hover{color:#F2EEE6;border-color:rgba(242,238,230,.35)}
.sd .hero{position:absolute;left:34px;bottom:96px;z-index:4;pointer-events:none;max-width:520px;transition:opacity .5s}
.sd .hero h1{font-family:var(--f-display),"Instrument Serif",Georgia,serif;font-weight:400;font-size:clamp(30px,3.2vw,46px);line-height:1;margin:0 0 12px}
.sd .hero h1 em{color:var(--fg2)}
.sd .hero p{margin:0 0 16px;font-size:15px;line-height:1.5;color:var(--fg2);max-width:46ch}
.sd .stats{display:flex;gap:26px}.sd .stats div{display:flex;flex-direction:column;gap:3px}
.sd .stats b{font-family:var(--f-display),"Instrument Serif",Georgia,serif;font-weight:400;font-size:36px;line-height:1}
.sd .stats b.bad{color:var(--wait)}.sd .stats span{font-size:12.5px;color:var(--fg2)}
.sd .shade{position:absolute;left:0;top:0;bottom:0;width:min(560px,46vw);background:linear-gradient(90deg,rgba(8,9,12,.9) 0%,rgba(8,9,12,.6) 60%,rgba(8,9,12,0) 100%);pointer-events:none;z-index:3}
.sd .chips{position:absolute;left:50%;transform:translateX(-50%);bottom:26px;z-index:5;display:flex;gap:4px;padding:5px;border-radius:999px;background:rgba(22,23,29,.72);border:1px solid var(--line);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);max-width:calc(100% - 24px);overflow-x:auto;scrollbar-width:none}
.sd .chips button{font:inherit;font-size:14px;color:var(--fg2);background:none;border:0;border-radius:999px;padding:9px 15px;cursor:pointer;white-space:nowrap}
.sd .chips button[aria-pressed="true"]{background:#F2EEE6;color:#111}
.sd .labels{position:absolute;inset:0;pointer-events:none;z-index:3}
.sd .lb{position:absolute;left:0;top:0;transform:translate(-9999px,0);display:flex;flex-direction:column;align-items:center;gap:3px;white-space:nowrap;transition:opacity .35s}
.sd .lb b{font-weight:500;font-size:12.5px;text-shadow:0 2px 10px rgba(0,0,0,.9)}
.sd .lb.dim{opacity:.22}
.sd .lb .bub{max-width:230px;white-space:normal;text-align:left;font-size:12px;line-height:1.35;color:#F2EEE6;background:rgba(22,23,29,.9);border:1px solid var(--line);border-radius:10px 10px 10px 2px;padding:6px 9px}
.sd .lb .bub.warn{border-color:rgba(255,181,74,.55)}
.sd .fl{position:absolute;left:0;top:0;transform:translate(-9999px,0);font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:rgba(242,238,230,.5);white-space:nowrap;pointer-events:none}
.sd .panel{position:absolute;top:0;right:0;bottom:0;width:min(430px,100%);z-index:6;background:rgba(22,23,29,.74);backdrop-filter:blur(24px) saturate(1.2);-webkit-backdrop-filter:blur(24px) saturate(1.2);border-left:1px solid var(--line);padding:84px 36px 32px;transform:translateX(100%);transition:transform .65s cubic-bezier(.2,.8,.2,1);overflow-y:auto}
.sd .panel.on{transform:none}
.sd .panel .x{position:absolute;top:22px;right:24px;font:inherit;font-size:14px;color:var(--fg2);background:none;border:1px solid var(--line);border-radius:999px;padding:7px 15px;cursor:pointer}
.sd .panel .k{font-size:13px;color:var(--fg3);margin-bottom:8px}
.sd .panel h2{font-family:var(--f-display),"Instrument Serif",Georgia,serif;font-weight:400;font-size:46px;line-height:1;margin:0 0 12px}
.sd .panel .sum{font-size:16.5px;line-height:1.5;color:rgba(242,238,230,.86);margin:0 0 20px}
.sd .panel .st{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;margin-bottom:18px}
.sd .panel .st i{width:9px;height:9px;border-radius:50%}
.sd .panel dl{display:grid;grid-template-columns:110px 1fr;gap:10px 14px;margin:0 0 18px;font-size:14px;line-height:1.45}
.sd .panel dt{color:var(--fg3)}.sd .panel dd{margin:0;color:rgba(242,238,230,.88)}
.sd .panel dd.no{color:var(--bad)}
.sd .panel .gap{font-size:13.5px;line-height:1.45;color:var(--wait);border-top:1px solid var(--line);padding:10px 0}
.sd .panel .bub{font-size:14.5px;line-height:1.45;background:rgba(242,238,230,.06);border:1px solid var(--line);border-radius:12px 12px 12px 3px;padding:10px 12px;margin:0 0 18px}
.sd .panel .bub small{display:block;color:var(--fg3);font-size:12px;margin-top:4px}
.sd .panel a.go{display:inline-block;font-size:14px;color:#E8CB8A;text-decoration:none;border:1px solid rgba(217,180,106,.4);border-radius:999px;padding:8px 16px;margin-top:6px}
.sd .panel .flow{font-size:13.5px;color:var(--fg2);margin:0 0 6px}
.sd .panel .flow b{color:#F2EEE6;font-weight:500}
@media (max-width:900px){.sd .panel{top:auto;height:56%;width:100%;border-left:0;border-top:1px solid var(--line);border-radius:24px 24px 0 0;transform:translateY(100%);padding:58px 22px 22px}.sd .panel h2{font-size:36px}}
@media (max-width:760px){.sd .top{left:16px;right:16px}.sd .hero{left:16px;right:16px;bottom:86px}.sd .hero p{display:none}.sd .stats b{font-size:28px}.sd .shade{width:100%;top:auto;height:60%;background:linear-gradient(0deg,rgba(8,9,12,.95),rgba(8,9,12,0))}.sd .lb .bub{display:none}}
`;

const STATE = {
  lavora: { c: 0x7fe0b8, css: "var(--ok)", t: "Lavora" },
  in_ritardo: { c: 0xffb54a, css: "var(--wait)", t: "In ritardo" },
  errore: { c: 0xffb54a, css: "var(--wait)", t: "In errore" },
  mai: { c: 0xffb54a, css: "var(--wait)", t: "Nessuna traccia" },
  attesa: { c: 0x8a8c94, css: "var(--stop)", t: "Prima prova stanotte" },
  senza_prova: { c: 0x55575f, css: "var(--stop)", t: "Senza prova di lavoro" },
  persona: { c: 0xd9b46a, css: "var(--gold)", t: "Persona" },
};
const TIPO = { persona: "Persona", AI: "Agente AI", codice: "Programma", robot: "Robot" };
const FLOOR_ORDER = ["dati", "vendite", "formazione", "persone", "controllo", "direzione"];
const FILTERS = [
  { k: null, l: "Tutto l'edificio" },
  { k: "fermi", l: "Fermi o in ritardo" },
  { k: "uscita", l: "Risultati non credibili" },
  { k: "controllore", l: "Senza controllore" },
  { k: "responsabile", l: "Senza responsabile" },
  { k: "prova", l: "Senza prova" },
];

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ago = (t) => { if (!t) return ""; const m = Math.round((Date.now() - t) / 60000); if (m < 1) return "ora"; if (m < 60) return `${m} min fa`; const h = Math.round(m / 60); return h < 36 ? `${h} h fa` : `${Math.round(h / 24)} giorni fa`; };
const isBad = (o) => ["in_ritardo", "mai", "errore"].includes(o.stato) || (o.controllo && !o.controllo.ok);
const matches = (o, k) => !k || (k === "fermi" ? ["in_ritardo", "mai", "errore"].includes(o.stato) : o.buchi.some((b) => b.tipo === k));

function mountSede(root, D, THREE, OrbitControls) {
  const cleanups = [], timers = [];
  root.innerHTML = `<div class="intro" id="intro"><b>La Sede</b><i></i></div>
<canvas id="c" aria-label="La Sede: un piano per area, una stanza per ogni ufficio"></canvas>
<div class="top"><b>La Sede</b><div class="r"><button class="pill" id="pianta">Vedi la pianta</button></div></div>
<div class="shade"></div><div class="labels" id="labels"></div>
<div class="hero" id="hero"><h1>Chi lavora,<br><em>e chi controlla chi.</em></h1>
<p>Ogni stanza è un ufficio: una persona, un programma o un agente AI. La luce verde vuol dire che ha lavorato davvero; ambra che si è fermato o che il suo risultato non è credibile. I fili dorati sono il lavoro che passa da un ufficio all'altro. Tocca una stanza per entrarci.</p>
<div class="stats"><div><b id="s1">0</b><span>uffici al lavoro</span></div><div><b id="s2" class="">0</b><span>da guardare</span></div><div><b id="s3">0</b><span>buchi</span></div></div></div>
<nav class="chips" id="chips" aria-label="Filtra l'edificio"></nav>
<aside class="panel" id="panel" aria-live="polite"><button class="x" id="close">Chiudi</button><div id="pb"></div></aside>`;
  const $ = (id) => root.querySelector("#" + id);
  const W = () => root.clientWidth || 800, H = () => root.clientHeight || 600;

  // intro
  const intro = $("intro");
  timers.push(setTimeout(() => intro.classList.add("go"), 60), setTimeout(() => intro.classList.add("gone"), 1500));

  // numeri
  const office = D.offices.filter((o) => o.tipo !== "persona");
  $("s1").textContent = `${D.totali.lavorano}/${D.totali.uffici}`;
  const bad = D.offices.filter(isBad).length;
  $("s2").textContent = bad; if (bad) $("s2").classList.add("bad");
  $("s3").textContent = D.totali.buchi;

  const cv = $("c");
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, W() / H(), 0.1, 400);
  const controls = new OrbitControls(cam, cv);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.minDistance = 18; controls.maxDistance = 75; controls.maxPolarAngle = Math.PI * 0.47; controls.minPolarAngle = Math.PI * 0.18;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.35;

  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x101116, 0.75));
  const key = new THREE.DirectionalLight(0xffe7c2, 0.9); key.position.set(12, 22, 14); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb4ff, 0.25); rim.position.set(-14, 8, -12); scene.add(rim);

  // ── edificio
  const floors = FLOOR_ORDER.map((id) => D.floors.find((f) => f.id === id)).filter(Boolean);
  const FH = 3.4, BW = 16, BD = 9;
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c1d24, transparent: true, opacity: 0.55, roughness: 0.25, metalness: 0.2 });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xd9b46a, transparent: true, opacity: 0.28 });
  const slabGeo = new THREE.BoxGeometry(BW + 1.2, 0.14, BD + 1.2);
  const rooms = []; const roomById = {}; const labels = $("labels"); const floorLabels = [];
  floors.forEach((f, fi) => {
    const y = fi * FH;
    const slab = new THREE.Mesh(slabGeo, glass); slab.position.set(0, y, 0); scene.add(slab);
    const se = new THREE.LineSegments(new THREE.EdgesGeometry(slabGeo), edgeMat); se.position.copy(slab.position); scene.add(se);
    const fl = document.createElement("div"); fl.className = "fl"; fl.textContent = f.nome; labels.appendChild(fl);
    floorLabels.push({ el: fl, pos: new THREE.Vector3(-BW / 2 - 0.6, y + 0.25, BD / 2 + 0.6) });
    const list = D.offices.filter((o) => o.piano === f.id);
    const cols = Math.min(4, Math.max(1, list.length)), rows = Math.ceil(list.length / cols);
    const cw = BW / cols, cd = BD / rows;
    list.forEach((o, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = -BW / 2 + cw * (c + 0.5), z = -BD / 2 + cd * (r + 0.5);
      const st = STATE[o.stato] || STATE.senza_prova;
      const rw = cw - 0.7, rd = cd - 0.7, rh = 1.55;
      const g = new THREE.Group(); g.position.set(x, y + 0.07, z); scene.add(g);
      const boxGeo = new THREE.BoxGeometry(rw, rh, rd);
      const boxMat = new THREE.MeshStandardMaterial({ color: 0x23242c, transparent: true, opacity: 0.32, roughness: 0.2, metalness: 0.1, emissive: st.c, emissiveIntensity: 0.12 });
      const box = new THREE.Mesh(boxGeo, boxMat); box.position.y = rh / 2; g.add(box);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineBasicMaterial({ color: st.c, transparent: true, opacity: 0.85 }));
      edges.position.y = rh / 2; g.add(edges);
      // luce a pavimento: lo stato si legge da lontano
      const floorLight = new THREE.Mesh(new THREE.PlaneGeometry(rw * 0.92, rd * 0.92), new THREE.MeshBasicMaterial({ color: st.c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      floorLight.rotation.x = -Math.PI / 2; floorLight.position.y = 0.02; g.add(floorLight);
      const pl = new THREE.PointLight(st.c, isBad(o) ? 0.9 : 0.5, 4.5, 2); pl.position.set(0, 1.1, 0); g.add(pl);
      // chi c'è dentro
      g.add(makeFig(THREE, o));
      // scrivania
      const desk = new THREE.Mesh(new THREE.BoxGeometry(Math.min(1.4, rw * 0.5), 0.08, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a342a, roughness: 0.6 }));
      desk.position.set(0, 0.55, 0.45); g.add(desk);
      const lb = document.createElement("div"); lb.className = "lb";
      lb.innerHTML = `<b>${esc(o.nome)}</b>` + (isBad(o) ? `<div class="bub warn">${esc((o.buchi.find((b) => b.tipo === "uscita" || b.tipo === "ritardo") || {}).testo || STATE[o.stato]?.t || "")}</div>` : "");
      labels.appendChild(lb);
      const R = { o, g, box, boxMat, edges, floorLight, pl, lb, pos: new THREE.Vector3(x, y + 0.35, z + rd / 2), center: new THREE.Vector3(x, y + 0.9, z), base: st.c };
      box.userData.R = R; rooms.push(R); roomById[o.id] = R;
    });
  });

  // tetto + insegna
  const topY = floors.length * FH;
  const roof = new THREE.Mesh(slabGeo, glass); roof.position.set(0, topY - 0.2, 0); scene.add(roof);

  // ── fili del lavoro
  const flows = [];
  for (const e of D.edges) {
    const a = roomById[e.from], b = roomById[e.to]; if (!a || !b) continue;
    const mid = a.center.clone().add(b.center).multiplyScalar(0.5); mid.y += 1.2 + Math.abs(a.center.y - b.center.y) * 0.15; mid.z += BD * 0.55;
    const curve = new THREE.QuadraticBezierCurve3(a.center, mid, b.center);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.025, 6, false), new THREE.MeshBasicMaterial({ color: 0xd9b46a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(tube);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
    scene.add(dot);
    flows.push({ e, curve, tube, dot, off: Math.random() });
  }

  // ── inquadratura
  const target = new THREE.Vector3(-5.5, topY * 0.46, 0); // edificio a destra: a sinistra restano titolo e numeri
  const home = () => { const m = W() <= 760; target.x = m ? 0 : -5.5; cam.position.set(m ? 40 : 30, topY * (m ? 1.5 : 1.05), m ? 46 : 36); if (!m) cam.position.x -= 5.5; controls.target.copy(target); };
  const resize = () => { renderer.setSize(W(), H(), false); cam.aspect = W() / H(); cam.updateProjectionMatrix(); };
  home(); resize();
  const ro = new ResizeObserver(resize); ro.observe(root); cleanups.push(() => ro.disconnect());

  // ── interazione
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let sel = null, hov = null, filter = null;
  const toXY = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1]; };
  const pick = (e) => { mouse.set(...toXY(e)); ray.setFromCamera(mouse, cam); const h = ray.intersectObjects(rooms.map((r) => r.box))[0]; return h ? h.object.userData.R : null; };
  let down = null;
  cv.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; controls.autoRotate = false; });
  cv.addEventListener("pointerup", (e) => { if (!down) return; const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5; down = null; if (moved) return; const R = pick(e); R ? select(R) : deselect(); });
  cv.addEventListener("pointermove", (e) => { const R = pick(e); hov = R; cv.style.cursor = R ? "pointer" : "grab"; });
  $("close").onclick = deselect;
  $("pianta").onclick = () => root.dispatchEvent(new CustomEvent("sede:pianta", { bubbles: true }));

  const chips = $("chips");
  chips.innerHTML = FILTERS.map((f, i) => `<button data-i="${i}" aria-pressed="${i === 0}">${f.l}</button>`).join("");
  chips.querySelectorAll("button").forEach((b) => b.onclick = () => { filter = FILTERS[+b.dataset.i].k; chips.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); });

  function select(R) {
    sel = R; controls.autoRotate = false;
    const o = R.o, st = STATE[o.stato] || STATE.senza_prova;
    const nomi = (ids) => ids.map((id) => roomById[id]?.o.nome).filter(Boolean);
    const da = D.edges.filter((e) => e.to === o.id).map((e) => roomById[e.from]?.o.nome).filter(Boolean);
    $("pb").innerHTML = `<div class="k">${esc(D.floors.find((f) => f.id === o.piano)?.nome || "")} · ${TIPO[o.tipo] || o.tipo}</div>
<h2>${esc(o.nome)}</h2>
<div class="st"><i style="background:${st.css}"></i>${st.t}${o.at ? ` · ${ago(o.at)}` : ""}${o.cadenza ? ` · ${esc(o.cadenza)}` : ""}</div>
<p class="sum">${esc(o.compito)}</p>
${o.coda ? `<div class="bub"><b>${o.coda.n}</b> ${esc(o.coda.label)}</div>` : o.ultimo ? `<div class="bub">${esc(o.ultimo)}<small>ultimo lavoro${o.at ? " · " + ago(o.at) : ""}</small></div>` : ""}
<dl><dt>Risultato</dt><dd>${esc(o.risultato)}</dd>
${o.tipo !== "persona" ? `<dt>Controllore</dt><dd class="${o.controllore ? "" : "no"}">${esc(o.controllore || "nessuno")}${o.controllo ? ` · ${o.controllo.ok ? "ultimo risultato credibile" : "risultato non credibile"}` : ""}</dd>
<dt>Responsabile</dt><dd class="${o.owner ? "" : "no"}">${esc(o.owner || "nessuno")}${o.owner && !o.owner_confermato ? " (proposto)" : ""}</dd>` : ""}
${o.esterno ? `<dt>Dove gira</dt><dd>${esc(o.esterno)}</dd>` : ""}</dl>
${da.length ? `<p class="flow">Riceve lavoro da <b>${esc(da.join(", "))}</b></p>` : ""}
${o.passa_a?.length ? `<p class="flow">Passa lavoro a <b>${esc(nomi(o.passa_a).join(", "))}</b></p>` : ""}
${o.buchi.map((b) => `<div class="gap">${esc(b.testo)}</div>`).join("")}
${o.link ? `<a class="go" href="${esc(o.link)}">Apri ${esc(o.nome)} →</a>` : ""}`;
    $("panel").classList.add("on"); $("hero").style.opacity = 0;
  }
  function deselect() { sel = null; $("panel").classList.remove("on"); $("hero").style.opacity = 1; }

  // ── animazione
  const v = new THREE.Vector3(); let raf, t0 = performance.now();
  function loop() {
    const t = (performance.now() - t0) / 1000;
    const related = sel ? new Set([sel.o.id, ...D.edges.filter((e) => e.from === sel.o.id || e.to === sel.o.id).flatMap((e) => [e.from, e.to])]) : null;
    for (const R of rooms) {
      const on = (!related || related.has(R.o.id)) && matches(R.o, filter);
      const pulse = isBad(R.o) ? 0.5 + 0.5 * Math.sin(t * 2.4) : 1;
      R.boxMat.emissiveIntensity += (((R === sel || R === hov) ? 0.45 : on ? 0.14 : 0.0) - R.boxMat.emissiveIntensity) * 0.15;
      R.floorLight.material.opacity += ((on ? 0.25 + 0.2 * pulse : 0.03) - R.floorLight.material.opacity) * 0.15;
      R.edges.material.opacity += ((on ? 0.85 : 0.12) - R.edges.material.opacity) * 0.15;
      R.pl.intensity = on ? (isBad(R.o) ? 0.4 + 0.6 * pulse : 0.5) : 0.05;
      // etichetta
      v.copy(R.pos).project(cam);
      const x = (v.x * 0.5 + 0.5) * W(), y = (-v.y * 0.5 + 0.5) * H();
      R.lb.style.transform = v.z < 1 ? `translate(${x}px,${y}px) translate(-50%,-100%)` : "translate(-9999px,0)";
      R.lb.classList.toggle("dim", !on);
    }
    for (const F of floorLabels) { v.copy(F.pos).project(cam); F.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * W()}px,${(-v.y * 0.5 + 0.5) * H()}px)`; }
    for (const f of flows) {
      const on = sel ? (f.e.from === sel.o.id || f.e.to === sel.o.id) : !filter;
      f.tube.material.opacity += ((on ? (sel ? 0.6 : 0.07) : 0.02) - f.tube.material.opacity) * 0.12;
      const p = ((t * 0.18 + f.off) % 1); f.dot.position.copy(f.curve.getPoint(p)); f.dot.visible = sel ? on : (on && f.off < 0.35);
    }
    controls.update(); renderer.render(scene, cam); raf = requestAnimationFrame(loop);
  }
  loop();
  cleanups.push(() => { cancelAnimationFrame(raf); controls.dispose(); scene.traverse((o) => { o.geometry && o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => x.dispose()); }); renderer.dispose(); });
  return () => { cleanups.forEach((f) => f()); timers.forEach(clearTimeout); root.innerHTML = ""; };
}

// Chi c'è nella stanza: persona (figura oro), agente AI (figura avorio con aureola), programma o robot (cubo)
function makeFig(THREE, o) {
  const g = new THREE.Group();
  const col = o.tipo === "persona" ? 0xd9b46a : o.tipo === "AI" ? 0xf2eee6 : 0x9aa0ad;
  const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.45, metalness: 0.15 });
  if (o.tipo === "persona" || o.tipo === "AI") {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.6, 16), mat); body.position.y = 0.42; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), mat); head.position.y = 0.86; g.add(head);
    if (o.tipo === "AI") { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 8, 32), new THREE.MeshBasicMaterial({ color: 0xd9b46a })); ring.rotation.x = Math.PI / 2; ring.position.y = 1.1; g.add(ring); }
  } else {
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), mat); cube.position.y = 0.45; cube.rotation.y = Math.PI / 4; g.add(cube);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0x7fe0b8 })); eye.position.set(0, 0.5, 0.215); eye.rotation.y = Math.PI / 4; g.add(eye);
  }
  g.position.z = -0.1;
  return g;
}

export default function SedeScene({ data, onPianta }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!data || !data.offices || !ref.current) return;
    let unmount = null, dead = false;
    const node = ref.current;
    const onP = () => onPianta?.();
    node.addEventListener("sede:pianta", onP);
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (dead || !ref.current) return;
      unmount = mountSede(ref.current, data, THREE, OrbitControls);
    })().catch(() => {
      if (ref.current) ref.current.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(242,238,230,.6)">La Sede non si è caricata. Ricarica la pagina.</div>';
    });
    return () => { dead = true; node.removeEventListener("sede:pianta", onP); unmount?.(); };
  }, [data, onPianta]);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={ref} className="sd" />
    </>
  );
}
