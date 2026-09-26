"use client";

/**
 * La città (26/09/2026): l'azienda come una fila di "case" di vetro, costruite con lo STESSO
 * codice del prototipo "La casa" di Nicholas (materiali, luci, lastre, colonna di etichette,
 * pannello, apertura). Ogni casa raggruppa aree (spazi ClickUp): Direzione, Creator I e II,
 * Estero e scouting, Persone e crescita. Ogni lastra = un'area; luce = stato; puntini = persone.
 * Le altre case restano sullo sfondo; frecce, tasti o un tocco per cambiare casa.
 *
 * GENERATO dal prototipo (scratchpad gen_scene.py): three.js caricato SOLO qui (import
 * dinamico); tutto il DOM vive dentro `root` (.ct) e si smonta all'uscita.
 */
/* eslint-disable */
import { useEffect, useRef } from "react";

const CSS = ".ct{position:fixed;top:0;right:0;bottom:0;left:248px;z-index:30;overflow:hidden;color:#F2EEE6;font-family:var(--f-sans),Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased;background:radial-gradient(120% 90% at 50% 38%,#1B1C22 0%,#08090C 70%)}\n@media (max-width:899px){.ct{left:0;top:56px;bottom:72px}}\n.ct *{box-sizing:border-box;font-family:inherit}\n.ct em{font-family:inherit!important}\n.ct{--bg1:#1B1C22;--bg2:#08090C;--fg:#F2EEE6;--fg2:rgba(242,238,230,.56);--fg3:rgba(242,238,230,.32);--line:rgba(242,238,230,.12);--glass:rgba(24,25,31,.62);--ok:#7FE0B8;--wait:#FFB54A;--stop:#6B6D75;\nbox-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}\n.ct canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}\n.ct .grain{position:absolute;inset:0;pointer-events:none;opacity:.05;background-image:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")}\n.ct .top{position:absolute;top:calc(28px + env(safe-area-inset-top,0px));left:40px;right:40px;display:flex;justify-content:space-between;align-items:center;font-size:14px;letter-spacing:.02em;color:var(--fg2);pointer-events:none;z-index:3}\n.ct .top b{font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-weight:400;font-size:24px;color:var(--fg);letter-spacing:0}\n.ct .hero{position:absolute;left:40px;bottom:calc(40px + env(safe-area-inset-bottom,0px));z-index:3;pointer-events:none;transition:opacity .6s ease}\n.ct .hero h1{font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-weight:400;font-size:clamp(40px,5.2vw,76px);line-height:.98;margin:0 0 22px;letter-spacing:-.01em}\n.ct .hero h1 em{color:var(--fg2)}\n.ct .stats{display:flex;gap:34px}\n.ct .stats div{display:flex;flex-direction:column;gap:4px}\n.ct .stats b{font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-weight:400;font-size:40px;line-height:1}\n.ct .stats span{font-size:14px;color:var(--fg2)}\n.ct .ctrl{position:absolute;right:40px;bottom:calc(40px + env(safe-area-inset-bottom,0px));z-index:3;display:flex;flex-direction:column;align-items:flex-end;gap:12px}\n.ct .ctrl button{font:inherit;font-size:15px;font-weight:500;color:var(--fg);background:rgba(242,238,230,.06);border:1px solid var(--line);border-radius:999px;padding:13px 22px;cursor:pointer;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:background .3s}\n.ct .ctrl button:hover{background:rgba(242,238,230,.12)}\n.ct .ctrl button:focus-visible,.ct .lbl:focus-visible,.ct .bld:focus-visible{outline:2px solid var(--fg2);outline-offset:3px}\n.ct .ctrl .nav2{display:flex;gap:8px;align-items:center}\n.ct .ctrl .nav2 button{padding:13px 18px}\n.ct .ctrl small{font-size:13px;color:var(--fg3)}\n.ct.city #prev,.ct.city #next,.ct.city #open,.ct.city #back{display:none}\n.ct .labels{position:absolute;inset:0;pointer-events:none;z-index:2;transition:opacity .5s ease}\n.ct .lbl{position:absolute;left:0;top:0;display:flex;align-items:center;gap:12px;pointer-events:auto;cursor:pointer;white-space:nowrap;transform:translate(-9999px,0);background:none;border:0;color:var(--fg);font:inherit;padding:4px 0}\n.ct .lbl::before{content:\"\";width:44px;height:1px;background:var(--line)}\n.ct .lbl i{width:7px;height:7px;border-radius:50%;flex:none}\n.ct .lbl span{font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-size:24px;opacity:.9;transition:opacity .3s}\n.ct .lbl small{font-size:13px;color:var(--fg3)}\n.ct .lbl.dim span{opacity:.35}\n.ct .bld{position:absolute;left:0;top:0;transform:translate(-9999px,0);pointer-events:auto;cursor:pointer;background:none;border:0;color:var(--fg);font:inherit;font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-size:24px;white-space:nowrap;padding:4px 6px;transition:color .3s,opacity .5s}\n.ct .bld:hover{color:var(--fg)}\n.ct .panel{position:absolute;top:0;right:0;bottom:0;width:min(440px,100%);z-index:4;background:var(--glass);backdrop-filter:blur(24px) saturate(1.2);-webkit-backdrop-filter:blur(24px) saturate(1.2);border-left:1px solid var(--line);padding:calc(90px + env(safe-area-inset-top,0px)) 44px calc(40px + env(safe-area-inset-bottom,0px));transform:translateX(100%);transition:transform .7s cubic-bezier(.2,.8,.2,1);overflow-y:auto}\n.ct .panel.on{transform:none}\n.ct .panel .x{position:absolute;top:calc(26px + env(safe-area-inset-top,0px));right:28px;font:inherit;font-size:14px;color:var(--fg2);background:none;border:1px solid var(--line);border-radius:999px;padding:8px 16px;cursor:pointer}\n.ct .panel .n{font-size:14px;color:var(--fg3);margin-bottom:10px;letter-spacing:.04em}\n.ct .panel h2{font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-weight:400;font-size:64px;line-height:.95;margin:0 0 18px}\n.ct .panel .st{display:inline-flex;align-items:center;gap:9px;font-size:15px;color:var(--fg2);margin-bottom:26px}\n.ct .panel .st i{width:8px;height:8px;border-radius:50%}\n.ct .panel p{font-size:20px;line-height:1.55;margin:0 0 34px;color:rgba(242,238,230,.86)}\n.ct .panel h3{font-size:13px;font-weight:500;letter-spacing:.06em;color:var(--fg3);margin:0 0 6px}\n.ct .panel ul{list-style:none;padding:0;margin:0 0 30px}\n.ct .panel li{display:flex;justify-content:space-between;align-items:baseline;gap:16px;font-size:18px;padding:14px 0;border-bottom:1px solid var(--line)}\n.ct .panel li small{font-size:14px;color:var(--fg2);white-space:nowrap}\n.ct .panel .nav{display:flex;gap:10px;margin-top:8px}\n.ct .panel .nav button{font:inherit;font-size:14px;color:var(--fg);background:none;border:1px solid var(--line);border-radius:999px;padding:10px 18px;cursor:pointer}\n.ct .intro{position:absolute;inset:0;z-index:6;background:#07080B;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;transition:opacity 1.2s ease}\n.ct .intro.gone{opacity:0;pointer-events:none}\n.ct .intro b{font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-weight:400;font-size:clamp(44px,6vw,84px);color:var(--fg);opacity:0;transform:translateY(8px);transition:opacity 1.2s ease,transform 1.2s ease;letter-spacing:.01em}\n.ct .intro i{display:block;height:1px;width:0;background:linear-gradient(90deg,transparent,#D9B46A,transparent);transition:width 1.6s cubic-bezier(.2,.8,.2,1)}\n.ct .intro.go b{opacity:1;transform:none}\n.ct .intro.go i{width:min(360px,60vw)}\n.ct .hero,.ct .ctrl,.ct .top{opacity:0;transition:opacity 1.2s ease}\n.ct.show .top{opacity:1}\n.ct.show .ctrl{opacity:1}\n.ct.show .hero{opacity:1}\n.ct .hero h1,.ct .stats div{opacity:0;transform:translateY(10px);transition:opacity 1s ease,transform 1s ease}\n.ct.show .hero h1{opacity:1;transform:none}\n.ct.show .stats div{opacity:1;transform:none}\n.ct.show .stats div:nth-child(1){transition-delay:.3s}\n.ct.show .stats div:nth-child(2){transition-delay:.45s}\n.ct.show .stats div:nth-child(3){transition-delay:.6s}\n.ct .sim{font-size:13px;color:#D9B46A;border:1px solid rgba(217,180,106,.35);border-radius:999px;padding:6px 12px;margin-right:16px}\n@media (max-width:760px){.ct .sim{display:none}}\n.ct .nums{display:flex;gap:28px;margin:-10px 0 30px}\n.ct .nums b{display:block;font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-weight:400;font-size:36px;line-height:1}\n.ct .nums span{font-size:13px;color:var(--fg2)}\n.ct .fallback{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;padding:40px;color:var(--fg2);font-size:18px}\n@media (max-width:760px){.ct .top{left:20px;right:20px}\n.ct #date{display:none}\n.ct .top b{white-space:nowrap}\n.ct .hero{left:20px;right:20px;bottom:calc(150px + env(safe-area-inset-bottom,0px))}\n.ct .hero h1{margin-bottom:16px}\n.ct .stats{gap:22px}\n.ct .stats b{font-size:32px}\n.ct .ctrl small{display:none}\n.ct .ctrl{right:20px;left:20px;bottom:calc(24px + env(safe-area-inset-bottom,0px));align-items:stretch}\n.ct .ctrl .nav2{justify-content:space-between}\n.ct .lbl span{font-size:18px}\n.ct .lbl small{display:none}\n.ct .lbl::before{width:22px}\n.ct .bld{font-size:15px}\n.ct .panel{top:auto;height:78%;width:100%;border-left:0;border-top:1px solid var(--line);border-radius:26px 26px 0 0;transform:translateY(100%);padding:70px 24px 30px}\n.ct .panel h2{font-size:48px}\n.ct .panel .x{top:20px;right:20px}\n.ct.city .hero h1 em{display:none}\n.ct.city .hero h1{margin-bottom:10px}\n.ct.city .hero{bottom:calc(60px + env(safe-area-inset-bottom,0px))}}\n";

function mountCity(root,RAW,THREE,OrbitControls){
  const cleanups=[],timers=[];let raf=0;
  const on=(el,ev,fn,opt)=>{el.addEventListener(ev,fn,opt);cleanups.push(()=>el.removeEventListener(ev,fn,opt))};
  const $id=(id)=>root.querySelector('#'+id);
  const VW=()=>root.clientWidth||1,VH=()=>root.clientHeight||1;
  const toXY=(e)=>{const r=root.getBoundingClientRect();return [(e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1]};
  root.innerHTML="<canvas id=\"c\" tabindex=\"-1\" aria-label=\"La citt\u00e0: cinque case di vetro, una lastra per area\"></canvas>\n<div class=\"grain\"></div>\n<div class=\"intro\" id=\"intro\"><b>La citt\u00e0</b><i></i></div>\n<div class=\"top\"><b>La citt\u00e0</b><span><span class=\"sim\" id=\"src\"></span><span id=\"date\"></span></span></div>\n<div class=\"labels\" id=\"labels\"></div>\n<div class=\"hero\" id=\"hero\">\n  <h1 id=\"h1\"></h1>\n  <div class=\"stats\"><div><b id=\"s1\"></b><span>cose aperte</span></div><div><b id=\"s2\"></b><span>in ritardo</span></div><div><b id=\"s3\"></b><span id=\"s3l\">aree ferme</span></div></div>\n</div>\n<div class=\"ctrl\"><div class=\"nav2\"><button id=\"back\">Tutta la citt\u00e0</button><button id=\"prev\" aria-label=\"Casa precedente\">\u2039</button><button id=\"open\">Apri la struttura</button><button id=\"next\" aria-label=\"Casa successiva\">\u203a</button></div><small id=\"hint\">Tocca una casa per entrare</small></div>\n<aside class=\"panel\" id=\"panel\" aria-live=\"polite\"><button class=\"x\" id=\"close\">Chiudi</button><div id=\"pbody\"></div></aside>\n<div class=\"fallback\" id=\"fb\">Questa esperienza ha bisogno della grafica 3D del browser.</div>";

const esc=t=>String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nf=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const gen=new Date(RAW.generated);
const ago=d=>{if(!d)return'nessun movimento';const n=Math.round((gen-new Date(d))/864e5);return n<=0?'oggi':n===1?'ieri':`${n} giorni fa`};
// ── le case: ogni lastra è un'area (uno spazio di ClickUp), come nel prototipo ──
const SP=RAW.spaces.filter(s=>s&&s.name&&s.open>0).map(s=>({...s,s:s.stale?'stop':s.overdue>0?'wait':'ok'}));
const by=n=>SP.filter(s=>n.some(x=>s.name.toLowerCase().includes(x)));
const DIREZIONE=by(['new board','management board','founder','administration','admin 2','supervisor','head of sales']);
const PERSONE=by(['human resources','hr & people','academy','agorà','agora','organic marketing','product area','ai r&d']);
const ESTERO=by(['cantera','foreign model','silos','scouting']);
const used=new Set([...DIREZIONE,...PERSONE,...ESTERO].map(s=>s.id));
const CRE=SP.filter(s=>s.district==='creator').sort((a,b)=>b.open-a.open);
const rest=SP.filter(s=>s.district!=='creator'&&!used.has(s.id));
const half=Math.ceil(CRE.length/2);
const HOUSES=[
 {n:'Direzione',a:[...DIREZIONE,...rest]},
 {n:'Creator I',a:CRE.slice(0,half)},
 {n:'Creator II',a:CRE.slice(half)},
 {n:'Estero e scouting',a:ESTERO},
 {n:'Persone e crescita',a:PERSONE},
].filter(h=>h.a.length).map(h=>({...h,a:h.a.slice().sort((x,y)=>y.open-x.open).slice(0,9)}));
const CSS={ok:'var(--ok)',wait:'var(--wait)',stop:'var(--stop)'};
const STT={ok:'In movimento',wait:'Qualcosa in ritardo',stop:'Ferma'};
$id('date').textContent=gen.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
$id('src').textContent='Dati di ClickUp di oggi';
let cur=0;
function heroFor(h){const o=h.a.reduce((a,x)=>a+x.open,0),r=h.a.reduce((a,x)=>a+x.overdue,0),f=h.a.filter(x=>x.s==='stop').length;
  const late=h.a.filter(x=>x.s==='wait').length;
  $id('h1').innerHTML=`${esc(h.n)}.<br><em>${late===0?'Un solo movimento.':late===1?'Un\'area aspetta qualcosa.':`${['','','Due','Tre','Quattro','Cinque','Sei','Sette','Otto','Nove'][late]||late} aree aspettano qualcosa.`}</em>`;
  return [o,r,f]}
function sentence(s){const p=[];p.push(`${nf(s.open)} ${s.open===1?'cosa aperta':'cose aperte'}${s.in_progress?`, ${s.in_progress} in corso`:''}.`);
  if(s.overdue)p.push(`${nf(s.overdue)} in ritardo${(s.floors||[]).length>1?`, soprattutto in ${s.floors.slice().sort((a,b)=>b.overdue-a.overdue)[0].name}`:''}.`);
  p.push(s.stale?`Ferma: l'ultimo movimento è di ${ago(s.last_update)}.`:`Ultimo movimento ${ago(s.last_update)}.`);return p.join(' ')}

const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const cv=$id('c');
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true})}catch(e){$id('fb').style.display='flex'}
if(renderer){
renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
const pmrem=new THREE.PMREMGenerator(renderer);
function studioEnv(){const s=new THREE.Scene();
 s.add(new THREE.Mesh(new THREE.BoxGeometry(24,24,24),new THREE.MeshBasicMaterial({color:0x07070A,side:THREE.BackSide})));
 const pnl=(w,h,x,y,z,rx,ry,k,c)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(c).multiplyScalar(k),side:THREE.DoubleSide}));m.position.set(x,y,z);m.rotation.set(rx,ry,0);s.add(m)};
 pnl(5,1.4,0,10,0,Math.PI/2,0,1.6,0xffffff);
 pnl(2.4,12,-10,3,3,0,Math.PI/2,2.2,0xDDE6FF);
 pnl(2.4,12,10,3,-2,0,-Math.PI/2,3,0xFFEBD2);
 pnl(14,.8,0,1.5,-11,0,0,1.2,0xffffff);
 pnl(6,.6,4,6,10,0,Math.PI,1.4,0xFFF4E6);
 return pmrem.fromScene(s,0.02).texture}
scene.environment=studioEnv();
const cam=new THREE.PerspectiveCamera(32,1,.1,160);
const controls=new OrbitControls(cam,cv);
controls.enableDamping=true;controls.dampingFactor=.06;controls.enablePan=false;controls.minDistance=9;controls.maxDistance=160;controls.minPolarAngle=.35;controls.maxPolarAngle=1.45;controls.rotateSpeed=.6;

scene.add(new THREE.AmbientLight(0xffffff,.12));
const key=new THREE.DirectionalLight(0xfff1dc,.9);key.position.set(6,10,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.radius=6;key.shadow.bias=-.0005;
Object.assign(key.shadow.camera,{left:-8,right:8,top:10,bottom:-4,near:1,far:40});scene.add(key);scene.add(key.target);
const rim=new THREE.DirectionalLight(0x9fb8ff,.7);rim.position.set(-7,5,-6);scene.add(rim);

function radialTex(inner,outer,a0,a1){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');const gr=g.createRadialGradient(128,128,inner,128,128,outer);g.fillStyle='#000';g.fillRect(0,0,256,256);const v0=Math.round(255*a0),v1=Math.round(255*a1);gr.addColorStop(0,`rgb(${v0},${v0},${v0})`);gr.addColorStop(1,`rgb(${v1},${v1},${v1})`);g.fillStyle=gr;g.fillRect(0,0,256,256);return new THREE.CanvasTexture(c)}
const floor=new THREE.Mesh(new THREE.CircleGeometry(60,96),new THREE.MeshBasicMaterial({color:0x0D0E12,transparent:true,opacity:.86,alphaMap:radialTex(70,126,1,0),depthWrite:false}));
floor.rotation.x=-Math.PI/2;floor.position.y=.002;scene.add(floor);

function rrect(w,h,r){const s=new THREE.Shape();const x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s}
function slabGeo(w,d,t,r,bev){const g=new THREE.ExtrudeGeometry(rrect(w,d,r),{depth:t,bevelEnabled:true,bevelThickness:bev,bevelSize:bev,bevelSegments:4,curveSegments:16});g.rotateX(-Math.PI/2);g.center();return g}
const glassGeo=slabGeo(3.9,2.3,.2,.28,.05), metalGeo=slabGeo(4.1,2.5,.035,.34,.012);
const glassMat=new THREE.MeshPhysicalMaterial({color:0xD6DCE4,metalness:0,roughness:.12,transmission:1,thickness:1.2,ior:1.5,envMapIntensity:.9,clearcoat:1,clearcoatRoughness:.06,attenuationColor:new THREE.Color(0x5E6878),attenuationDistance:1.1,transparent:true});
const metalMat=new THREE.MeshPhysicalMaterial({color:0x8E9098,metalness:1,roughness:.3,clearcoat:.5,clearcoatRoughness:.2,envMapIntensity:.9});
const COL={ok:new THREE.Color(0x7FE0B8),wait:new THREE.Color(0xFFB54A),stop:new THREE.Color(0x3A3C44)};
const glowTex=(()=>{const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(128,32,0,128,32,128);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.25,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,256,64);return new THREE.CanvasTexture(c)})();
const goldMat=new THREE.MeshPhysicalMaterial({color:0xD9B46A,metalness:1,roughness:.22,clearcoat:.8,clearcoatRoughness:.1,envMapIntensity:1.2});
const plinthGeo=new THREE.CylinderGeometry(2.7,2.8,.22,96),plinthMat=new THREE.MeshStandardMaterial({color:0x0E0F12,metalness:.35,roughness:.6,envMapIntensity:.12});

// case disposte su un arco ampio: quella scelta davanti alla camera, le altre in penombra
const NARROW=VW()<760;
const houses=HOUSES.map((h,hi)=>{
  const ang=(hi-(HOUSES.length-1)/2)*.27;const pos=NARROW?new THREE.Vector3(hi%2?3.4:-3.4,0,-hi*8.5):new THREE.Vector3(Math.sin(ang)*26,0,26-Math.cos(ang)*26-(hi%2)*3);
  const root=new THREE.Group();root.position.copy(pos);scene.add(root);
  const gm=glassMat.clone(),mm=metalMat.clone(),pm=plinthMat.clone(),au=goldMat.clone();[gm,mm,pm,au].forEach(x=>x.transparent=true);
  const sculpt=new THREE.Group();root.add(sculpt);
  const N=h.a.length;const layers=[];
  h.a.forEach((a,i)=>{const g=new THREE.Group();
    const metal=new THREE.Mesh(metalGeo,mm);metal.position.y=-.17;metal.castShadow=true;metal.receiveShadow=true;g.add(metal);
    const glass=new THREE.Mesh(glassGeo,gm);glass.castShadow=true;glass.userData={h:hi,i};g.add(glass);
    const coreMat=new THREE.MeshBasicMaterial({color:COL[a.s].clone(),toneMapped:false});
    g.add(new THREE.Mesh(new THREE.BoxGeometry(3.1,.05,.05),coreMat));
    const p=Math.min(12,(a.people||[]).length||1);const dots=new THREE.Group();for(let k=0;k<p;k++){const d=new THREE.Mesh(new THREE.SphereGeometry(.035,16,16),coreMat);d.position.set(-1.35+k*.18,0,.55);dots.add(d)}g.add(dots);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:COL[a.s],transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0}));sp.scale.set(4.4,.55,1);g.add(sp);
    sculpt.add(g);layers.push({g,glass,coreMat,sp,a,i,x:0});
  });
  const plinth=new THREE.Mesh(plinthGeo,pm);plinth.position.y=.11;plinth.receiveShadow=true;plinth.castShadow=true;root.add(plinth);
  const band=new THREE.Mesh(new THREE.TorusGeometry(2.72,.018,16,160),au);band.rotation.x=Math.PI/2;band.position.y=.225;root.add(band);
  const rod=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,1,24),au);root.add(rod);
  const cap=new THREE.Mesh(new THREE.SphereGeometry(.11,32,32),au);root.add(cap);
  const ring=new THREE.Mesh(new THREE.RingGeometry(3.15,3.165,128),new THREE.MeshBasicMaterial({color:0xF2EEE6,transparent:true,opacity:.18}));ring.rotation.x=-Math.PI/2;ring.position.y=.005;root.add(ring);
  return {h,hi,root,sculpt,layers,rod,cap,pos,ang,N,openT:0,t0:0,gm,mm,pm,au,fade:1};
});
const pick=houses.flatMap(H=>H.layers.map(l=>l.glass));

// polvere
const dustN=500,dp=new Float32Array(dustN*3);for(let k=0;k<dustN;k++){dp[k*3]=(Math.random()-.5)*50;dp[k*3+1]=Math.random()*10;dp[k*3+2]=(Math.random()-.5)*40}
const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(dp,3));
scene.add(new THREE.Points(dg,new THREE.PointsMaterial({color:0xF2EEE6,size:.03,transparent:true,opacity:.35,depthWrite:false})));

// stato
let open=0,sel=null,hover=null,T0=performance.now(),mode='city';
const intro=$id('intro');
let shown=false;
if(reduce){intro.classList.add('gone');root.classList.add('show');shown=true}
else{timers.push(setTimeout(()=>intro.classList.add('go'),120),setTimeout(()=>intro.classList.add('gone'),2300))}
const labelsEl=$id('labels');
let lbls=[];
const bldEls=houses.map(H=>{const b=document.createElement('button');b.className='bld';b.textContent=H.h.n;b.onclick=()=>go(H.hi);labelsEl.appendChild(b);return b});
const ALLA=houses.flatMap(H=>H.h.a);
function heroCity(){const late=ALLA.filter(x=>x.s==='wait').length;$id('h1').innerHTML=`La città.<br><em>${houses.length} case, ${late} aree aspettano qualcosa.</em>`;$id('s3l').textContent='aree ferme';return [ALLA.reduce((a,x)=>a+x.open,0),ALLA.reduce((a,x)=>a+x.overdue,0),ALLA.filter(x=>x.s==='stop').length]}
function glassFor(city){houses.forEach(X=>{X.gm.transmission=city?0:1;X.gm.color.set(city?0x5C6470:0xD6DCE4);X.gm.roughness=city?.1:.12;X.gm.depthWrite=!city;X.gm.needsUpdate=true;X.baseOp=city?.3:1})}
function toCity(){glassFor(true);deselect();mode='city';root.classList.add('city');lbls.forEach(l=>l.remove());lbls=[];open=0;$id('open').textContent='Apri la struttura';$id('hint').textContent='Tocca una casa per entrare';const v=heroCity();if(shown)countUp(v);frame()}
$id('back').onclick=toCity;
function buildLabels(){lbls.forEach(l=>l.remove());const H=houses[cur];
  lbls=H.h.a.map((a,i)=>{const b=document.createElement('button');b.className='lbl';b.innerHTML=`<i style="background:${CSS[a.s]}"></i><span>${esc(a.name)}</span><small>${STT[a.s]}</small>`;b.onclick=()=>select(i);b.onmouseenter=()=>hover=i;b.onmouseleave=()=>hover=null;labelsEl.appendChild(b);return b})}
function countUp(vals){[['s1',vals[0]],['s2',vals[1]],['s3',vals[2]]].forEach(([id,n])=>{const el=$id(id);if(reduce){el.textContent=nf(n);return}const st=performance.now();(function f(){const q=Math.min(1,(performance.now()-st)/1400);el.textContent=nf(Math.round(n*(1-Math.pow(1-q,3))));if(q<1)requestAnimationFrame(f)})()})}
function go(i){if(i===cur&&mode==='house')return;deselect();glassFor(false);mode='house';root.classList.remove('city');$id('hint').textContent='Trascina per girarla · tocca una lastra · frecce per cambiare casa';cur=(i+houses.length)%houses.length;houses[cur].t0=performance.now();
  buildLabels();const v=heroFor(houses[cur].h);$id('s3l').textContent=v[2]===1?'area ferma':'aree ferme';if(shown)countUp(v);else{$id('s1').textContent='';}frame()}
$id('prev').onclick=()=>go(cur-1);$id('next').onclick=()=>go(cur+1);
function gap(H){return .5+H.openT*.58}
function baseY(H,i){return .62+(H.N-1-i)*gap(H)}
const tgt=new THREE.Vector3(),want=new THREE.Vector3(),wantCam=new THREE.Vector3();let glide=1;
function frame(){const m=VW()<760;
  if(mode==='city'&&NARROW){cam.fov=44;cam.updateProjectionMatrix();const zc=-(houses.length-1)*4.25;want.set(0,-16,zc+6);wantCam.set(0,36,zc+50);glide=1;return}
  if(mode==='city'){cam.fov=m?44:34;cam.aspect=VW()/VH();cam.updateProjectionMatrix();const half=Math.max(...houses.map(X=>Math.abs(X.pos.x)))+3.6;const hf=Math.atan(Math.tan(cam.fov*Math.PI/360)*cam.aspect);const dist=Math.max(22,half/Math.tan(hf)*1.28);want.set(0,2.4,-2);wantCam.set(0,dist*.42,dist*.92-2);glide=1;return}
  const H=houses[cur];const d=m?25:13.2;
  // stessa inquadratura del prototipo, riferita alla casa scelta
  const off=new THREE.Vector3(d*.62,d*.34,d*.72).applyAxisAngle(new THREE.Vector3(0,1,0),H.root.rotation.y);
  const lx=new THREE.Vector3(m?1.5:-.9,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),H.root.rotation.y);
  want.copy(H.pos).add(lx);want.y=(m?1.3:2.4)+H.openT*1.6;wantCam.copy(H.pos).add(off);cam.fov=m?38:32;cam.updateProjectionMatrix();glide=1}
function resize(){const w=VW(),h=VH();renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()}
resize();on(window,'resize',()=>{resize();frame()});
controls.addEventListener('start',()=>{glide=0});

const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let downAt=null;
on(cv,'pointermove',e=>{mouse.set(...toXY(e));ray.setFromCamera(mouse,cam);const hit=ray.intersectObjects(pick)[0];hover=mode==='house'&&hit&&hit.object.userData.h===cur?hit.object.userData.i:null;cv.style.cursor=hit?'pointer':'grab'});
on(cv,'pointerdown',e=>downAt=[e.clientX,e.clientY]);
on(cv,'pointerup',e=>{if(!downAt)return;const moved=Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1]);downAt=null;if(moved>6)return;mouse.set(...toXY(e));ray.setFromCamera(mouse,cam);const hit=ray.intersectObjects(pick)[0];if(hit){if(mode==='city'||hit.object.userData.h!==cur)go(hit.object.userData.h);else select(hit.object.userData.i)}else if(sel!=null)deselect()});

const panel=$id('panel'),pbody=$id('pbody');
function select(i){sel=i;const H=houses[cur];const a=H.h.a[i];const N=H.h.a.length;
  const fl=(a.floors||[]).slice().sort((x,y)=>y.open-x.open).slice(0,6);
  pbody.innerHTML=`<div class="n">${esc(H.h.n)} · area ${String(i+1).padStart(2,'0')} di ${String(N).padStart(2,'0')}</div><h2>${esc(a.name)}</h2><div class="st"><i style="background:${CSS[a.s]}"></i>${STT[a.s]}</div><p>${esc(sentence(a))}</p>
  <div class="nums"><div><b>${nf(a.open)}</b><span>aperte</span></div><div><b>${nf(a.in_progress||0)}</b><span>in corso</span></div><div><b>${nf(a.overdue)}</b><span>in ritardo</span></div></div>
  ${(a.people||[]).length?`<h3>Chi c'è</h3><ul>${a.people.map(w=>`<li>${esc(w[0])}<small>${w[1]} ${w[1]===1?'cosa':'cose'}</small></li>`).join('')}</ul>`:''}
  ${(a.late_items||[]).length?`<h3>Aspetta</h3><ul>${a.late_items.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}
  ${fl.length>1?`<h3>Le cartelle</h3><ul>${fl.map(f=>`<li>${esc(f.name)}<small>${nf(f.open)} aperte${f.overdue?` · ${nf(f.overdue)} in ritardo`:''}</small></li>`).join('')}</ul>`:''}
  <div class="nav"><button id="pv">Area sopra</button><button id="nx">Area sotto</button></div>`;
  $id('pv').onclick=()=>select((i+N-1)%N);$id('nx').onclick=()=>select((i+1)%N);
  panel.classList.add('on');labelsEl.style.opacity=0;$id('hero').style.opacity=0;
}
function deselect(){sel=null;panel.classList.remove('on');labelsEl.style.opacity=1;$id('hero').style.opacity=1}
$id('close').onclick=deselect;
on(document,'keydown',e=>{if(e.key==='Escape'){if(sel!=null)deselect();else if(mode==='house')toCity();return}if(mode==='city')return;if(sel!=null&&e.key==='ArrowDown')select((sel+1)%houses[cur].N);if(sel!=null&&e.key==='ArrowUp')select((sel+houses[cur].N-1)%houses[cur].N);if(sel==null&&e.key==='ArrowRight')go(cur+1);if(sel==null&&e.key==='ArrowLeft')go(cur-1)});
const ob=$id('open');ob.onclick=()=>{open=open?0:1;ob.textContent=open?'Richiudi la struttura':'Apri la struttura';frame()};

root.classList.add('city');glassFor(true);heroCity();houses.forEach((H,k)=>H.t0=performance.now()+(reduce?-1e5:2600+k*260));frame();
cam.position.copy(wantCam);controls.target.copy(want);

const v=new THREE.Vector3(),clock=new THREE.Clock();
const ease=x=>1-Math.pow(1-x,3);
function loop(){
  const dt=Math.min(.05,clock.getDelta()),now=performance.now();
  const H=houses[cur];const m=VW()<760;
  houses.forEach(X=>{X.openT+=((X.hi===cur?open:0)-X.openT)*Math.min(1,dt*3.2)});
  if(glide){controls.target.lerp(want,Math.min(1,dt*2.2));cam.position.lerp(wantCam,Math.min(1,dt*1.9));if(cam.position.distanceTo(wantCam)<.05)glide=0}
  else if(sel!=null){const wT=H.pos.clone();wT.y=2.4+H.openT*1.4;controls.target.lerp(wT,Math.min(1,dt*2.5))}
  else{want.y=(m?1.3:2.4)+H.openT*1.6;controls.target.lerp(want,Math.min(1,dt*2.5))}
  houses.forEach(X=>{const t=(now-X.t0)/1000;const isCur=mode==='house'&&X.hi===cur;const inCity=mode==='city';
    const wantF=inCity||isCur?1:.1;X.fade+=(wantF-X.fade)*Math.min(1,dt*4);X.gm.opacity=X.fade*(X.baseOp||1);X.mm.opacity=X.pm.opacity=X.au.opacity=X.fade;X.mm.depthWrite=X.pm.depthWrite=X.au.depthWrite=X.fade>.9;
    if(!reduce&&sel==null&&(isCur||inCity))X.sculpt.rotation.y=Math.sin(t*.18+X.hi)*(inCity?.18:.32);else X.sculpt.rotation.y+=(0-X.sculpt.rotation.y)*Math.min(1,dt*2);
    X.layers.forEach((L,i)=>{
      const delay=.25+(X.N-1-i)*.16;const p=reduce?1:Math.min(1,Math.max(0,(t-delay)/1.1));const e=ease(p);
      const out=isCur?(sel===i?1.6:(hover===i&&sel==null?.35:0)):0;L.x+=(out-L.x)*Math.min(1,dt*5);
      const y=baseY(X,i)+(1-e)*6;
      L.g.position.set(-L.x*.35,y+(reduce?0:Math.sin((now/1000)*.8+i*.7)*.012),L.x);
      const lit=p>=1?Math.min(1,(t-delay-1.1)*1.6):0;
      const dim=isCur?((sel!=null&&sel!==i)?.25:1):(inCity?1:.1);
      let pulse=1;if(L.a.s==='wait'&&!reduce)pulse=.55+.45*(.5+.5*Math.sin((now/1000)*2.2+i));
      const k=Math.max(0,lit)*dim*pulse;
      L.sp.scale.set(inCity?5.2:4.4,inCity?1.3:.55,1);if(L.a.s!=='stop'){L.sp.material.opacity=(inCity?.95:.7)*k;L.coreMat.color.copy(COL[L.a.s]).multiplyScalar(.35+.65*k)}L.coreMat.transparent=true;L.coreMat.opacity=Math.max(.08,X.fade);
    });
    const topY=baseY(X,0)+.3,botY=.22;X.rod.scale.y=Math.max(.01,topY-botY);X.rod.position.y=(topY+botY)/2;X.cap.position.y=topY+.08;X.cap.visible=X.rod.scale.y>.2;
  });
  if(mode==='house'){key.position.set(H.pos.x+6,10,H.pos.z+5);key.target.position.copy(H.pos);key.shadow.camera.left=-8;key.shadow.camera.right=8;key.shadow.camera.top=10;key.shadow.camera.bottom=-4}else{key.position.set(10,24,18);key.target.position.set(0,0,-3);key.shadow.camera.left=-24;key.shadow.camera.right=24;key.shadow.camera.top=24;key.shadow.camera.bottom=-12}key.shadow.camera.updateProjectionMatrix();
  if(!shown&&(now-houses[0].t0)/1000>2.6){shown=true;root.classList.add('show');countUp(mode==='city'?heroCity():heroFor(H.h))}
  if(!reduce){const pa=dg.attributes.position.array;for(let k=0;k<dustN;k++){pa[k*3+1]+=dt*.05;if(pa[k*3+1]>10)pa[k*3+1]=0}dg.attributes.position.needsUpdate=true}
  controls.update();renderer.render(scene,cam);
  // etichette della casa scelta: colonna a destra, come nel prototipo
  let colX=-1e9;const ys=[];const Y=new THREE.Vector3(0,1,0);
  if(mode==='house'){
  H.layers.forEach((L,i)=>{L.g.getWorldPosition(v);const pr=v.clone().project(cam);ys[i]=(-pr.y*.5+.5)*VH();
    [[2.05,1.25],[2.05,-1.25],[-2.05,1.25],[-2.05,-1.25]].forEach(([x,z])=>{const q=new THREE.Vector3(x+L.g.position.x,0,z+L.g.position.z).applyAxisAngle(Y,H.sculpt.rotation.y+H.root.rotation.y).add(H.pos);q.y=v.y;const qq=q.project(cam);if(L.x<.2)colX=Math.max(colX,(qq.x*.5+.5)*VW())})});
  H.layers.forEach((L,i)=>{const t=(now-H.t0)/1000;const sx=Math.min(colX+(m?4:10),VW()-(m?120:290));
    const intro=reduce?1:Math.min(1,Math.max(0,(t-(.25+(H.N-1-i)*.16)-1.0)*2));
    if(lbls[i]){lbls[i].style.transform=`translate(${sx}px,${ys[i]-16}px)`;lbls[i].style.opacity=intro;lbls[i].classList.toggle('dim',hover!=null&&hover!==i)}});
  }
  // nomi delle altre case, sopra di loro
  houses.forEach((X,xi)=>{const el=bldEls[xi];if(mode==='house'){el.style.opacity=0;el.style.pointerEvents='none';return}
    v.copy(X.pos);v.y=baseY(X,0)+1.1;const pr=v.clone().project(cam);const on=pr.z<1&&Math.abs(pr.x)<1.1&&Math.abs(pr.y)<1.1;
    el.style.opacity=on&&sel==null&&shown?.95:0;el.style.pointerEvents=on&&sel==null?'auto':'none';el.style.transform=`translate(${(pr.x*.5+.5)*VW()}px,${(-pr.y*.5+.5)*VH()}px) translate(-50%,-100%)`});
  raf=requestAnimationFrame(loop);
}
loop();
cleanups.push(()=>{cancelAnimationFrame(raf);controls.dispose();scene.traverse(o=>{o.geometry&&o.geometry.dispose();const mm=o.material;(Array.isArray(mm)?mm:mm?[mm]:[]).forEach(x=>{x.map&&x.map.dispose();x.alphaMap&&x.alphaMap.dispose();x.dispose()})});pmrem.dispose();renderer.dispose()});
}

  return ()=>{cleanups.forEach(f=>f());timers.forEach(clearTimeout);root.innerHTML=''};
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
      if (ref.current) ref.current.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(242,238,230,.6)">La città non si è caricata. Ricarica la pagina.</div>';
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
