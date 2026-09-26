"use client";

/**
 * La città (26/09/2026): scena 3D dell'azienda — un palazzo per ogni spazio ClickUp.
 * Quartiere delle creator + quartiere della sede; l'altezza segue le cose aperte,
 * i piani sono le cartelle (alti in proporzione al loro carico), la luce del piano
 * dice lo stato: verde = in movimento, ambra (pulsa) = qualcosa in ritardo, spento = fermo.
 *
 * three.js è caricato SOLO qui (import dinamico, ~600KB): il resto dell'app non lo scarica.
 * Senza WebGL o con "Elenco" la stessa informazione è una lista accessibile.
 * Tutto il DOM della scena vive dentro `root` (classi ct-*), smontato all'uscita.
 */
import { useEffect, useRef } from "react";

const CSS = `
.ct{position:fixed;top:0;right:0;bottom:0;left:248px;z-index:30;overflow:hidden;color:#F2EEE6;font-family:var(--f-sans),Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased;
  background:radial-gradient(120% 90% at 50% 38%,#1B1C22 0%,#08090C 70%);--fg2:rgba(242,238,230,.58);--fg3:rgba(242,238,230,.34);--line:rgba(242,238,230,.12);--ok:#7FE0B8;--wait:#FFB54A;--stop:#6B6D75;--gold:#D9B46A}
@media (max-width:899px){.ct{left:0;top:56px;bottom:72px}}
.ct canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;touch-action:none}
.ct .ct-grain{position:absolute;inset:0;pointer-events:none;opacity:.05;z-index:8;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
.ct button{font:inherit;color:inherit}
.ct .ct-serif{font-family:var(--f-display),"Instrument Serif",Georgia,serif;font-weight:400}
.ct .ct-top{position:absolute;top:26px;left:40px;right:40px;display:flex;justify-content:space-between;align-items:center;gap:16px;font-size:14px;color:var(--fg2);z-index:5;pointer-events:none}
.ct .ct-top b{font-size:24px;color:#F2EEE6}
.ct .ct-top .r{display:flex;align-items:center;gap:12px;pointer-events:auto}
.ct .ct-src{font-size:13px;color:var(--gold);border:1px solid rgba(217,180,106,.35);border-radius:999px;padding:6px 12px}
.ct .ct-pill{font-size:13.5px;background:rgba(242,238,230,.05);border:1px solid var(--line);border-radius:999px;padding:9px 16px;cursor:pointer;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:background .3s,border-color .3s}
.ct .ct-pill:hover{background:rgba(242,238,230,.12)}
.ct .ct-pill.on{border-color:rgba(242,238,230,.5)}
.ct .ct-pill:focus-visible,.ct .ct-lbl:focus-visible,.ct .ct-row:focus-visible{outline:2px solid var(--fg2);outline-offset:3px}
.ct .ct-hero{position:absolute;left:40px;bottom:40px;z-index:5;pointer-events:none;transition:opacity .6s ease}
.ct .ct-hero h1{font-size:clamp(40px,4.6vw,70px);line-height:.98;margin:0 0 22px;letter-spacing:-.01em}
.ct .ct-hero h1 em{color:var(--fg2)}
.ct .ct-stats{display:flex;gap:34px}
.ct .ct-stats div{display:flex;flex-direction:column;gap:4px}
.ct .ct-stats b{font-size:40px;line-height:1}
.ct .ct-stats span{font-size:14px;color:var(--fg2)}
.ct .ct-ctrl{position:absolute;right:40px;bottom:40px;z-index:5;display:flex;flex-direction:column;align-items:flex-end;gap:12px}
.ct .ct-views{display:flex;gap:8px}
.ct .ct-ctrl small{font-size:13px;color:var(--fg3)}
.ct .ct-labels{position:absolute;inset:0;pointer-events:none;z-index:3}
.ct .ct-lbl{position:absolute;left:0;top:0;transform:translate(-9999px,0);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:auto;cursor:pointer;background:none;border:0;padding:2px 4px;white-space:nowrap}
.ct .ct-lbl span{font-size:17px;opacity:.85;transition:opacity .3s}
.ct .ct-lbl i{width:1px;height:14px;background:var(--line)}
.ct .ct-lbl.dim span{opacity:.25}
.ct .ct-lbl.hide{visibility:hidden}
.ct .ct-district{position:absolute;left:0;top:0;transform:translate(-9999px,0);font-size:12.5px;letter-spacing:.14em;color:var(--gold);pointer-events:none;white-space:nowrap}
.ct .ct-panel{position:absolute;top:0;right:0;bottom:0;width:min(460px,100%);z-index:6;background:rgba(20,21,27,.7);backdrop-filter:blur(24px) saturate(1.2);-webkit-backdrop-filter:blur(24px) saturate(1.2);border-left:1px solid var(--line);padding:90px 44px 40px;transform:translateX(100%);transition:transform .7s cubic-bezier(.2,.8,.2,1);overflow-y:auto}
.ct .ct-panel.on{transform:none}
.ct .ct-x{position:absolute;top:26px;right:28px;font-size:14px;color:var(--fg2);background:none;border:1px solid var(--line);border-radius:999px;padding:8px 16px;cursor:pointer}
.ct .ct-n{font-size:13.5px;color:var(--fg3);margin-bottom:10px;letter-spacing:.04em}
.ct .ct-panel h2{font-size:56px;line-height:.95;margin:0 0 18px}
.ct .ct-st{display:inline-flex;align-items:center;gap:9px;font-size:15px;color:var(--fg2);margin-bottom:24px}
.ct .ct-st i,.ct .ct-row i{width:8px;height:8px;border-radius:50%;flex:none}
.ct .ct-panel p{font-size:18px;line-height:1.55;margin:0 0 30px;color:rgba(242,238,230,.86)}
.ct .ct-nums{display:flex;gap:28px;margin:0 0 30px}.ct .ct-nums b{display:block;font-size:36px;line-height:1}.ct .ct-nums span{font-size:13px;color:var(--fg2)}
.ct .ct-panel h3{font-size:13px;font-weight:500;letter-spacing:.06em;color:var(--fg3);margin:0 0 6px}
.ct .ct-panel ul{list-style:none;padding:0;margin:0 0 30px}
.ct .ct-panel li{display:flex;justify-content:space-between;align-items:baseline;gap:16px;font-size:16.5px;padding:13px 0;border-bottom:1px solid var(--line)}
.ct .ct-panel li small{font-size:13.5px;color:var(--fg2);white-space:nowrap}
.ct .ct-panel li small.late{color:var(--wait)}
.ct .ct-nav{display:flex;gap:10px;margin-top:8px}
.ct .ct-list{position:absolute;inset:0;z-index:4;overflow-y:auto;padding:100px 40px 140px;background:rgba(8,9,12,.94);display:none}
.ct .ct-list.on{display:block}
.ct .ct-list h2{font-size:40px;margin:30px 0 8px}
.ct .ct-list h2 em{color:var(--fg2)}
.ct .ct-row{display:grid;grid-template-columns:16px 1fr auto;gap:14px;align-items:center;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);padding:18px 0;cursor:pointer}
.ct .ct-row .t{font-size:24px}
.ct .ct-row .m{font-size:13.5px;color:var(--fg3);margin-top:3px}
.ct .ct-row .c{font-size:14px;color:var(--fg2);white-space:nowrap}
.ct .ct-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:40px;color:var(--fg2);font-size:18px;z-index:9}
.ct .ct-fade{opacity:0;transition:opacity 1.1s ease}.ct.show .ct-fade{opacity:1}
@media (max-width:760px){
  .ct .ct-top{left:20px;right:20px;top:18px}.ct .ct-src,.ct .ct-ctrl small{display:none}
  .ct .ct-hero{left:20px;right:20px;bottom:84px}
  .ct .ct-stats{gap:22px}.ct .ct-stats b{font-size:30px}
  .ct .ct-ctrl{left:20px;right:20px;bottom:20px;align-items:stretch}
  .ct .ct-views{justify-content:space-between}.ct .ct-pill{padding:9px 12px;font-size:13px}
  .ct .ct-lbl span{font-size:14px}
  .ct .ct-panel{top:auto;height:82%;width:100%;border-left:0;border-top:1px solid var(--line);border-radius:26px 26px 0 0;transform:translateY(100%);padding:70px 24px 30px}
  .ct .ct-panel h2{font-size:42px}.ct .ct-x{top:20px;right:20px}
  .ct .ct-list{padding:80px 20px 150px}
}
@media (prefers-reduced-motion:reduce){.ct .ct-fade{opacity:1}}
`;

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nf = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const CSSC = { ok: "var(--ok)", wait: "var(--wait)", stop: "var(--stop)" };
const STT = { ok: "In movimento", wait: "Qualcosa in ritardo", stop: "Fermo" };

/** Monta la città dentro root; restituisce la funzione di smontaggio. */
function mountCity(root, RAW, THREE, OrbitControls) {
  const cleanups = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); cleanups.push(() => el.removeEventListener(ev, fn, opt)); };
  const $ = (s) => root.querySelector(s);

  root.innerHTML = `<canvas aria-label="La città: un palazzo per ogni creator e ogni area della sede"></canvas><div class="ct-grain"></div>
  <div class="ct-top ct-fade"><b class="ct-serif">La città</b><span class="r"><span class="ct-src"></span><button class="ct-pill ct-listbtn" aria-pressed="false">Elenco</button></span></div>
  <div class="ct-labels ct-fade"></div>
  <div class="ct-hero ct-fade"><h1 class="ct-serif ct-h1"></h1><div class="ct-stats"><div><b class="ct-serif ct-s1">0</b><span>cose aperte</span></div><div><b class="ct-serif ct-s2">0</b><span>in ritardo</span></div><div><b class="ct-serif ct-s3">0</b><span>palazzi fermi</span></div></div></div>
  <div class="ct-ctrl ct-fade"><div class="ct-views"><button class="ct-pill" data-v="creator">Le creator</button><button class="ct-pill" data-v="sede">La sede</button><button class="ct-pill on" data-v="all">Tutta la città</button></div><small>Trascina per girare · tocca un palazzo</small></div>
  <div class="ct-list" aria-label="Elenco dei palazzi"></div>
  <aside class="ct-panel" aria-live="polite"><button class="ct-x">Chiudi</button><div class="ct-pbody"></div></aside>`;

  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const ALL = (RAW.spaces || []).filter((s) => s && s.name);
  const EMPTY = ALL.filter((s) => !s.open);
  const S = ALL.filter((s) => s.open > 0).map((s) => ({ ...s }));
  S.forEach((s) => {
    s.s = s.stale || !s.open ? "stop" : s.overdue > 0 ? "wait" : "ok";
    s.floors = (s.floors || []).filter((f) => f && f.name).slice(0, 8);
    if (!s.floors.length) s.floors = [{ name: "Generale", open: s.open || 0, overdue: s.overdue || 0 }];
  });
  const creators = S.filter((x) => x.district === "creator"), sede = S.filter((x) => x.district !== "creator");
  const gen = new Date(RAW.generated);
  const ago = (d) => { if (!d) return "nessun movimento"; const n = Math.round((gen - new Date(d)) / 864e5); return n <= 0 ? "oggi" : n === 1 ? "ieri" : `${n} giorni fa`; };
  $(".ct-src").textContent = "Dati di ClickUp del " + gen.toLocaleDateString("it-IT", { day: "numeric", month: "long" });

  const statsFor = (arr) => [arr.reduce((a, x) => a + x.open, 0), arr.reduce((a, x) => a + x.overdue, 0), arr.filter((x) => x.s === "stop").length];
  function hero(v, withStats = true) {
    const arr = v === "creator" ? creators : v === "sede" ? sede : S;
    const worst = arr.slice().sort((a, b) => b.overdue - a.overdue)[0];
    const head = v === "creator" ? `${arr.length} creator.` : v === "sede" ? `${arr.length} aree della sede.` : `${arr.length} palazzi.`;
    $(".ct-h1").innerHTML = `${head}<br><em>${worst && worst.overdue ? `Il più in ritardo è ${esc(worst.name)}.` : "Tutto in movimento."}</em>`;
    if (!withStats) return;
    const [a, b, c] = statsFor(arr);
    $(".ct-s1").textContent = nf(a); $(".ct-s2").textContent = nf(b); $(".ct-s3").textContent = nf(c);
  }
  hero("all", false);
  function countUp() {
    const vals = statsFor(S);
    [".ct-s1", ".ct-s2", ".ct-s3"].forEach((sel, k) => {
      const el = $(sel), n = vals[k];
      if (reduce) { el.textContent = nf(n); return; }
      const st = performance.now();
      (function f() { const q = Math.min(1, (performance.now() - st) / 1400); el.textContent = nf(Math.round(n * (1 - Math.pow(1 - q, 3)))); if (q < 1 && root.isConnected) requestAnimationFrame(f); })();
    });
  }

  function sentence(s) {
    const parts = [];
    parts.push(`${s.open} ${s.open === 1 ? "cosa aperta" : "cose aperte"}${s.in_progress ? `, ${s.in_progress} in corso` : ""}.`);
    if (s.overdue) parts.push(`${s.overdue} in ritardo${s.floors.length > 1 ? `, soprattutto in ${s.floors.slice().sort((a, b) => b.overdue - a.overdue)[0].name}` : ""}.`);
    parts.push(s.stale ? `Fermo: l'ultimo movimento è di ${ago(s.last_update)}.` : `Ultimo movimento ${ago(s.last_update)}.`);
    if (s.truncated) parts.push("Conteggio fermato a 600: sono almeno questi.");
    return parts.join(" ");
  }

  // elenco (sempre disponibile)
  const listEl = $(".ct-list");
  const block = (title, sub, arr) => `<h2 class="ct-serif">${title} <em>${sub}</em></h2>` + arr.slice().sort((a, b) => b.overdue - a.overdue || b.open - a.open).map((s) =>
    `<button class="ct-row" data-id="${esc(s.id)}"><i style="background:${CSSC[s.s]}"></i><span><span class="t ct-serif">${esc(s.name)}</span><div class="m">${STT[s.s]} · ${ago(s.last_update)}</div></span><span class="c">${nf(s.open)} aperte${s.overdue ? ` · ${nf(s.overdue)} in ritardo` : ""}</span></button>`).join("");
  listEl.innerHTML = block("Le creator.", `${creators.length} palazzi`, creators) + block("La sede.", `${sede.length} palazzi`, sede)
    + (EMPTY.length ? `<h2 class="ct-serif">Spazi vuoti. <em>${EMPTY.length}, senza cose aperte</em></h2><p style="color:var(--fg3);font-size:15px;line-height:1.6">${EMPTY.map((e) => esc(e.name)).join(" · ")}</p>` : "");
  listEl.querySelectorAll(".ct-row").forEach((b) => on(b, "click", () => select(S.findIndex((x) => String(x.id) === b.dataset.id))));
  const lb = $(".ct-listbtn");
  const setList = (v) => { listEl.classList.toggle("on", v); lb.setAttribute("aria-pressed", v); lb.classList.toggle("on", v); lb.textContent = v ? "Città" : "Elenco"; };
  on(lb, "click", () => setList(!listEl.classList.contains("on")));

  // pannello
  const panel = $(".ct-panel"), pbody = $(".ct-pbody");
  let focusBuilding = null;
  function select(i) {
    if (i < 0) return;
    const s = S[i];
    const fl = s.floors.slice().sort((a, b) => b.open - a.open);
    pbody.innerHTML = `<div class="ct-n">${s.district === "creator" ? "Quartiere delle creator" : "Quartiere della sede"}</div><h2 class="ct-serif">${esc(s.name)}</h2><div class="ct-st"><i style="background:${CSSC[s.s]}"></i>${STT[s.s]}</div><p>${esc(sentence(s))}</p>
    <div class="ct-nums"><div><b class="ct-serif">${nf(s.open)}</b><span>aperte</span></div><div><b class="ct-serif">${nf(s.in_progress || 0)}</b><span>in corso</span></div><div><b class="ct-serif">${nf(s.overdue)}</b><span>in ritardo</span></div></div>
    <h3>I piani</h3><ul>${fl.map((f) => `<li>${esc(f.name)}<small class="${f.overdue ? "late" : ""}">${nf(f.open)} aperte${f.overdue ? ` · ${nf(f.overdue)} in ritardo` : ""}</small></li>`).join("")}</ul>
    ${(s.people || []).length ? `<h3>Chi ci lavora</h3><ul>${s.people.map((p) => `<li>${esc(p[0])}<small>${p[1]} ${p[1] === 1 ? "cosa" : "cose"}</small></li>`).join("")}</ul>` : ""}
    ${(s.late_items || []).length ? `<h3>In ritardo</h3><ul>${s.late_items.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
    <div class="ct-nav"><button class="ct-pill ct-pv">Precedente</button><button class="ct-pill ct-nx">Successivo</button></div>`;
    const order = S.map((x, k) => k).filter((k) => S[k].district === s.district); const pos = order.indexOf(i);
    pbody.querySelector(".ct-pv").onclick = () => select(order[(pos + order.length - 1) % order.length]);
    pbody.querySelector(".ct-nx").onclick = () => select(order[(pos + 1) % order.length]);
    panel.classList.add("on"); $(".ct-hero").style.opacity = 0;
    if (focusBuilding) focusBuilding(i);
  }
  function deselect() { panel.classList.remove("on"); $(".ct-hero").style.opacity = 1; if (focusBuilding) focusBuilding(null); }
  on($(".ct-x"), "click", deselect);
  on(window, "keydown", (e) => { if (e.key === "Escape") deselect(); });

  const showT = setTimeout(() => { root.classList.add("show"); setTimeout(countUp, 500); }, reduce ? 0 : 250);
  cleanups.push(() => clearTimeout(showT));

  // ── scena 3D ──
  const cv = root.querySelector("canvas");
  let renderer = null;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch {}
  if (!renderer || !S.length) {
    setList(true);
    return () => cleanups.forEach((f) => f());
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x08090c, 40, 90);
  const pmrem = new THREE.PMREMGenerator(renderer);
  {
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.BoxGeometry(24, 24, 24), new THREE.MeshBasicMaterial({ color: 0x07070a, side: THREE.BackSide })));
    const pnl = (w, h, x, y, z, rx, ry, k, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m); };
    pnl(5, 1.4, 0, 10, 0, Math.PI / 2, 0, 1.6, 0xffffff); pnl(2.4, 12, -10, 3, 3, 0, Math.PI / 2, 2.2, 0xdde6ff); pnl(2.4, 12, 10, 3, -2, 0, -Math.PI / 2, 3, 0xffebd2); pnl(14, 0.8, 0, 1.5, -11, 0, 0, 1.2, 0xffffff);
    scene.environment = pmrem.fromScene(s, 0.02).texture;
  }
  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  const controls = new OrbitControls(cam, cv);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.06, enablePan: false, minDistance: 10, maxDistance: 70, minPolarAngle: 0.45, maxPolarAngle: 1.32, rotateSpeed: 0.6 });
  scene.add(new THREE.AmbientLight(0xffffff, 0.14));
  const key = new THREE.DirectionalLight(0xfff1dc, 0.85); key.position.set(14, 26, 12); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 5; key.shadow.bias = -0.0006;
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 }); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 0.6); rim.position.set(-18, 12, -14); scene.add(rim);
  const radialTex = (inner, outer) => { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"); const gr = g.createRadialGradient(128, 128, inner, 128, 128, outer); g.fillStyle = "#000"; g.fillRect(0, 0, 256, 256); gr.addColorStop(0, "#fff"); gr.addColorStop(1, "#000"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); };
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 96), new THREE.MeshBasicMaterial({ color: 0x0d0e12, transparent: true, opacity: 0.9, alphaMap: radialTex(40, 126), depthWrite: false })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const shadowP = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.5 })); shadowP.rotation.x = -Math.PI / 2; shadowP.position.y = 0.004; shadowP.receiveShadow = true; scene.add(shadowP);

  const rrect = (w, h, r) => { const s = new THREE.Shape(); const x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };
  const slabGeo = (w, d, t, r, bev) => { const g = new THREE.ExtrudeGeometry(rrect(w, d, r), { depth: t, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 10 }); g.rotateX(-Math.PI / 2); g.center(); return g; };
  const W = 1.6; const maxOpen = Math.max(...S.map((s) => s.open), 1);
  const metalGeo = slabGeo(W + 0.14, W + 0.14, 0.03, 0.2, 0.01); const gCache = {};
  const glassGeoH = (h) => { const k = h.toFixed(2); return gCache[k] || (gCache[k] = slabGeo(W, W, h, 0.16, 0.03)); };
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9aa3b2, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.26, envMapIntensity: 1.1, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x2b2c32, metalness: 0.7, roughness: 0.5, envMapIntensity: 0.35 });
  const goldMat = new THREE.MeshPhysicalMaterial({ color: 0xd9b46a, metalness: 1, roughness: 0.22, clearcoat: 0.8, envMapIntensity: 1.2 });
  const COL = { ok: new THREE.Color(0x7fe0b8), wait: new THREE.Color(0xffb54a), stop: new THREE.Color(0x24252b) };
  const glowTex = (() => { const c = document.createElement("canvas"); c.width = 256; c.height = 64; const g = c.getContext("2d"); const gr = g.createRadialGradient(128, 32, 0, 128, 32, 128); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 64); return new THREE.CanvasTexture(c); })();

  const GAP = 4;
  const grid = (arr) => { const n = arr.length, cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.2))); const rows = Math.ceil(n / cols);
    arr.slice().sort((a, b) => b.open - a.open).forEach((s, k) => { const r = Math.floor(k / cols), c = k % cols; const off = (r % 2) * GAP * 0.5;
      s.pos = new THREE.Vector3((c - (cols - 1) / 2) * GAP + off - GAP * 0.25, 0, (r - (rows - 1) / 2) * GAP); });
    return { w: cols * GAP, h: Math.max(1, rows) * GAP }; };
  const gC = grid(creators), gS = grid(sede);
  const sep = (gC.w + gS.w) / 2 + 5;
  creators.forEach((s) => (s.pos.x -= sep / 2)); sede.forEach((s) => (s.pos.x += sep / 2));
  const centers = { creator: new THREE.Vector3(-sep / 2, 0, 0), sede: new THREE.Vector3(sep / 2, 0, 0), all: new THREE.Vector3(0, 0, 0) };
  [["creator", gC, creators], ["sede", gS, sede]].forEach(([k, g, arr]) => { if (!arr.length) return; const w = g.w + 2, d = g.h + 2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), new THREE.MeshStandardMaterial({ color: 0x0a0b0e, metalness: 0.2, roughness: 0.85, envMapIntensity: 0.04 })); base.position.copy(centers[k]); base.position.y = 0.09; base.receiveShadow = true; scene.add(base);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.001, d)), new THREE.LineBasicMaterial({ color: 0xd9b46a, transparent: true, opacity: 0.45 })); edge.position.copy(centers[k]); edge.position.y = 0.19; scene.add(edge); });

  const B = [], pick = [];
  S.forEach((s, i) => {
    const g = new THREE.Group(); g.position.copy(s.pos); g.position.y = 0.18;
    const gm = glassMat.clone(), mm = metalMat.clone(); mm.transparent = true;
    const H = 0.7 + 6.2 * Math.sqrt(s.open / maxOpen); const fsum = s.floors.reduce((a, f) => a + Math.max(f.open, 1), 0);
    let y = 0.05; const layers = [];
    s.floors.forEach((f, j) => {
      const h = Math.max(0.34, (H * Math.max(f.open, 1)) / fsum); const gh = Math.max(0.2, h - 0.1);
      const L = new THREE.Group(); L.position.y = y + h / 2; L.userData.base = y + h / 2;
      const metal = new THREE.Mesh(metalGeo, mm); metal.position.y = -h / 2 + 0.02; metal.castShadow = true; L.add(metal);
      const glass = new THREE.Mesh(glassGeoH(gh), gm); glass.position.y = 0.02; glass.userData.i = i; L.add(glass); pick.push(glass);
      const st = s.s === "stop" ? "stop" : f.overdue > 0 ? "wait" : f.open > 0 ? "ok" : "stop";
      const cm = new THREE.MeshBasicMaterial({ color: COL[st].clone(), toneMapped: false, transparent: true });
      const core = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.035, W * 0.8), cm); core.position.y = -gh / 2 + 0.06; L.add(core);
      const vm = new THREE.MeshBasicMaterial({ color: COL[st].clone(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const veil = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, gh * 0.8, W * 0.78), vm); veil.position.y = 0.02; L.add(veil);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: COL[st], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); sp.scale.set(3.2, Math.min(1.4, 0.5 + gh * 0.7), 1); L.add(sp);
      g.add(L); layers.push({ L, cm, sp, st, j, vm }); y += h;
    });
    const top = y + 0.05;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 16), s.s === "wait" ? goldMat : mm); rod.position.y = top + 0.25; g.add(rod);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 24), s.s === "stop" ? mm : goldMat); cap.position.y = top + 0.52; g.add(cap);
    scene.add(g); B.push({ g, layers, s, i, x: 0, top: top + 0.6, gm, mm, fade: 1 });
  });
  B.slice().sort((a, b) => b.s.open - a.s.open).forEach((b, k) => (b.rank = k));

  const dN = 400, dp = new Float32Array(dN * 3);
  for (let k = 0; k < dN; k++) { dp[k * 3] = (Math.random() - 0.5) * 70; dp[k * 3 + 1] = Math.random() * 14; dp[k * 3 + 2] = (Math.random() - 0.5) * 50; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
  scene.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xf2eee6, size: 0.05, transparent: true, opacity: 0.3, depthWrite: false })));

  const labelsEl = $(".ct-labels");
  let view = "all", hover = null, focusIdx = null, animCam = 1;
  const t0 = performance.now() + (reduce ? -1e5 : 300);
  const lbls = B.map((b) => { const el = document.createElement("button"); el.className = "ct-lbl"; el.innerHTML = `<span class="ct-serif">${esc(b.s.name)}</span><i></i>`; on(el, "click", () => select(b.i)); on(el, "mouseenter", () => (hover = b.i)); on(el, "mouseleave", () => (hover = null)); labelsEl.appendChild(el); return el; });
  const dl = [["creator", "LE CREATOR"], ["sede", "LA SEDE"]].map(([k, t]) => { const el = document.createElement("div"); el.className = "ct-district"; el.textContent = t; labelsEl.appendChild(el); return { k, el }; });

  const wantT = new THREE.Vector3(), wantP = new THREE.Vector3();
  const size = () => ({ w: root.clientWidth || 1, h: root.clientHeight || 1 });
  const panelOn = () => panel.classList.contains("on");
  function framing() {
    const m = size().w < 760;
    if (focusIdx != null) { const b = B[focusIdx]; wantT.copy(b.s.pos).setY(b.top * 0.5); const d = Math.max(20, b.top * 3.4) * (m ? 1.5 : 1); wantP.set(b.s.pos.x + d * 0.42, wantT.y + d * 0.36, b.s.pos.z + d * 0.84); if (!m && panelOn()) { const off = d * 0.2; wantT.x += off; wantP.x += off; } if (m) wantT.y -= d * 0.12; return; }
    const c = centers[view]; const span = view === "all" ? sep + Math.max(gC.w, gS.w) : Math.max(view === "creator" ? gC.w : gS.w, 8);
    const d = Math.max(26, span * (m ? 2.3 : view === "all" ? 1.2 : 1.9)); wantT.set(c.x, view === "all" ? 1.5 : 2.4, c.z); wantP.set(c.x + d * 0.42, d * 0.5, d * 0.78);
  }
  focusBuilding = (i) => { focusIdx = i; if (i != null && view !== "all" && view !== B[i].s.district) setView("all", true); framing(); animCam = 1; };
  function setView(v, keep) { view = v; if (root.classList.contains("show")) hero(v); root.querySelectorAll("[data-v]").forEach((b) => b.classList.toggle("on", b.dataset.v === v)); if (!keep) { focusIdx = null; if (panelOn()) deselect(); } framing(); animCam = 1; }
  root.querySelectorAll("[data-v]").forEach((b) => on(b, "click", () => { setList(false); setView(b.dataset.v); }));
  framing(); cam.position.copy(wantP).multiplyScalar(1.35); controls.target.copy(wantT);
  const resize = () => { const { w, h } = size(); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  resize(); on(window, "resize", () => { resize(); framing(); animCam = 1; });
  controls.addEventListener("start", () => (animCam = 0));

  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let downAt = null;
  const toMouse = (e) => { const r = cv.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
  on(cv, "pointermove", (e) => { toMouse(e); ray.setFromCamera(mouse, cam); const h = ray.intersectObjects(pick)[0]; hover = h ? h.object.userData.i : null; cv.style.cursor = hover != null ? "pointer" : "grab"; });
  on(cv, "pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
  on(cv, "pointerup", (e) => { if (!downAt) return; const mv = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null; if (mv > 6) return; toMouse(e); ray.setFromCamera(mouse, cam); const h = ray.intersectObjects(pick)[0]; if (h) select(h.object.userData.i); else if (panelOn()) deselect(); });

  const clock = new THREE.Clock(), v = new THREE.Vector3(); const ease = (x) => 1 - Math.pow(1 - x, 3);
  let raf = 0;
  function loop() {
    const dt = Math.min(0.05, clock.getDelta()), t = (performance.now() - t0) / 1000;
    const { w: vw, h: vh } = size();
    if (animCam) { controls.target.lerp(wantT, Math.min(1, dt * 2.2)); cam.position.lerp(wantP, Math.min(1, dt * 1.8)); if (cam.position.distanceTo(wantP) < 0.05) animCam = 0; }
    B.forEach((b, bi) => {
      const delay = 0.2 + (bi % 12) * 0.06 + Math.floor(bi / 12) * 0.12;
      const out = hover === bi && focusIdx == null ? 0.25 : 0; b.x += (out - b.x) * Math.min(1, dt * 6); b.g.position.y = 0.18 + b.x;
      const dimB = focusIdx != null && focusIdx !== bi ? 0.18 : view !== "all" && b.s.district !== view ? 0.2 : 1;
      const want = focusIdx != null && focusIdx !== bi ? 0.12 : 1; b.fade += (want - b.fade) * Math.min(1, dt * 4);
      b.gm.opacity = (focusIdx === bi ? 0.42 : 0.26) * b.fade; b.mm.opacity = b.fade; b.mm.depthWrite = b.fade > 0.9;
      b.layers.forEach((l) => {
        l.cm.opacity = Math.max(0.1, b.fade);
        const p = reduce ? 1 : Math.min(1, Math.max(0, (t - delay - l.j * 0.08) / 1)); const e = ease(p);
        l.L.position.y = l.L.userData.base + (1 - e) * 4; l.L.visible = p > 0;
        const lit = p >= 1 ? Math.min(1, (t - delay - l.j * 0.08 - 1) * 1.6) : 0;
        let pulse = 1; if (l.st === "wait" && !reduce) pulse = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.2 + bi + l.j * 0.4));
        const k = Math.max(0, lit) * dimB * pulse;
        if (l.st !== "stop") { l.sp.material.opacity = 0.7 * k; l.vm.opacity = 0.16 * k; l.cm.color.copy(COL[l.st]).multiplyScalar(0.25 + 0.75 * k); }
        else l.cm.color.copy(COL.stop).multiplyScalar(0.35 + 0.35 * dimB);
      });
    });
    if (!reduce) { const pa = dg.attributes.position.array; for (let k = 0; k < dN; k++) { pa[k * 3 + 1] += dt * 0.06; if (pa[k * 3 + 1] > 14) pa[k * 3 + 1] = 0; } dg.attributes.position.needsUpdate = true; }
    controls.update(); renderer.render(scene, cam);
    const far = cam.position.distanceTo(controls.target);
    B.forEach((b, bi) => {
      v.set(b.s.pos.x, b.top + 0.35 + b.x, b.s.pos.z); const pr = v.clone().project(cam); const el = lbls[bi];
      const vis = pr.z < 1 && Math.abs(pr.x) < 1.05 && Math.abs(pr.y) < 1.05; const inView = view === "all" || b.s.district === view;
      const crowded = hover !== bi && focusIdx !== bi && ((far > 34 && b.rank >= 10) || (far > 22 && b.rank >= 18));
      el.classList.toggle("hide", !vis || (!inView && focusIdx !== bi) || crowded || (focusIdx != null && focusIdx !== bi));
      el.style.transform = `translate(${(pr.x * 0.5 + 0.5) * vw}px,${(-pr.y * 0.5 + 0.5) * vh}px) translate(-50%,-100%)`;
      el.classList.toggle("dim", hover != null && hover !== bi);
    });
    dl.forEach(({ k, el }) => { const c = centers[k]; const g = k === "creator" ? gC : gS; v.set(c.x, 0.2, c.z + g.h / 2 + 1.6); const pr = v.clone().project(cam); el.style.transform = `translate(${(pr.x * 0.5 + 0.5) * vw}px,${(-pr.y * 0.5 + 0.5) * vh}px) translate(-50%,0)`; el.style.visibility = pr.z < 1 && focusIdx == null && view === "all" ? "visible" : "hidden"; });
    raf = requestAnimationFrame(loop);
  }
  loop();

  return () => {
    cancelAnimationFrame(raf);
    cleanups.forEach((f) => f());
    controls.dispose();
    scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.alphaMap?.dispose?.(); x.dispose?.(); }); });
    pmrem.dispose(); renderer.dispose();
    root.innerHTML = "";
  };
}

export default function CityScene({ data }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!data || !ref.current) return;
    let unmount = null, dead = false;
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (dead || !ref.current) return;
      unmount = mountCity(ref.current, data, THREE, OrbitControls);
    })().catch(() => {
      if (ref.current) ref.current.innerHTML = `<div class="ct-empty">La città non si è caricata. Ricarica la pagina.</div>`;
    });
    return () => { dead = true; unmount?.(); };
  }, [data]);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={ref} className="ct" />
    </>
  );
}
