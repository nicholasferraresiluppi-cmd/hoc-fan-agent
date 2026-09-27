"use client";

/**
 * La città (26/09/2026) — progetto di Nicholas: ogni palazzo è un progetto creator, ogni
 * piano un'area (HR, Finance, Deal, Sales, Chatting, Contenuti); al centro la sede
 * "Azienda". "Guarda un'area" la accende in tutta la città. Le aree sono STIMATE dal
 * titolo delle attività ClickUp (dichiarato in pagina) finché ClickUp non avrà un campo "Area".
 *
 * GENERATO dal suo prototipo (scratchpad citta2/gen_scene2.py): three.js caricato SOLO
 * qui (import dinamico); tutto il DOM vive dentro `root` (.ct) e si smonta all'uscita.
 */
/* eslint-disable */
import { useEffect, useRef } from "react";

const CSS = ".ct{position:fixed;top:0;right:0;bottom:0;left:248px;z-index:30;overflow:hidden;color:#F2EEE6;font-family:var(--f-sans),Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased;background:radial-gradient(120% 90% at 50% 40%,#1B1C22 0%,#08090C 72%)}\n@media (max-width:899px){.ct{left:0;top:56px;bottom:72px}}\n.ct *{box-sizing:border-box;font-family:inherit}\n.ct em{font-family:inherit!important}\n.ct{--bg1:#1B1C22;--bg2:#08090C;--fg:#F2EEE6;--fg2:rgba(242,238,230,.58);--fg3:rgba(242,238,230,.34);--line:rgba(242,238,230,.12);--glass:rgba(22,23,29,.7);--ok:#7FE0B8;--wait:#FFB54A;--stop:#6B6D75;--gold:#D9B46A;\nbox-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}\n.ct canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}\n.ct .intro{position:absolute;inset:0;z-index:9;background:#07080B;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;transition:opacity 1.2s ease}\n.ct .intro.gone{opacity:0;pointer-events:none}\n.ct .intro b{font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-weight:400;font-size:clamp(44px,6vw,84px);opacity:0;transform:translateY(8px);transition:opacity 1.2s ease,transform 1.2s ease}\n.ct .intro i{display:block;height:1px;width:0;background:linear-gradient(90deg,transparent,var(--gold),transparent);transition:width 1.6s cubic-bezier(.2,.8,.2,1)}\n.ct .intro.go b{opacity:1;transform:none}\n.ct .intro.go i{width:min(360px,60vw)}\n.ct .top{position:absolute;top:calc(26px + env(safe-area-inset-top,0px));left:36px;right:36px;display:flex;justify-content:space-between;align-items:center;gap:14px;z-index:5;pointer-events:none}\n.ct .top b{font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-weight:400;font-size:26px}\n.ct .top .r{display:flex;gap:12px;align-items:center;pointer-events:auto}\n.ct .tag{font-size:13px;color:var(--gold);border:1px solid rgba(217,180,106,.38);border-radius:999px;padding:6px 12px}\n.ct .pill{font:inherit;font-size:13px;color:var(--fg2);background:none;border:1px solid var(--line);border-radius:999px;padding:7px 14px;cursor:pointer}\n.ct .pill:focus-visible,.ct .chips button:focus-visible,.ct .tl:focus-visible,.ct .row:focus-visible{outline:2px solid var(--gold);outline-offset:2px}\n.ct .hero{position:absolute;left:36px;bottom:calc(104px + env(safe-area-inset-bottom,0px));z-index:4;pointer-events:none;transition:opacity .6s ease;max-width:560px}\n.ct .hero h1{font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-weight:400;font-size:clamp(38px,4.6vw,68px);line-height:.98;margin:0 0 18px}\n.ct .hero h1 em{color:var(--fg2)}\n.ct .hero p{margin:0 0 18px;font-size:17px;line-height:1.5;color:var(--fg2);max-width:42ch;min-height:1.5em}\n.ct .stats{display:flex;gap:30px}\n.ct .stats div{display:flex;flex-direction:column;gap:4px}\n.ct .stats b{font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-weight:400;font-size:38px;line-height:1}\n.ct .stats span{font-size:13px;color:var(--fg2)}\n.ct .chips{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(28px + env(safe-area-inset-bottom,0px));z-index:5;display:flex;gap:4px;padding:5px;border-radius:999px;background:rgba(22,23,29,.7);border:1px solid var(--line);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);max-width:calc(100% - 24px);overflow-x:auto;scrollbar-width:none}\n.ct .chips{transition:opacity .5s ease}\n.ct .chips.hide{opacity:0;pointer-events:none}\n.ct .chips button{font:inherit;font-size:15px;color:var(--fg2);background:none;border:0;border-radius:999px;padding:10px 16px;cursor:pointer;white-space:nowrap;transition:background .3s,color .3s}\n.ct .chips button[aria-pressed=\"true\"]{background:var(--fg);color:#111}\n.ct .chips .lab{font-size:13px;color:var(--fg3);padding:10px 8px 10px 12px;align-self:center;white-space:nowrap}\n.ct .labels{position:absolute;inset:0;pointer-events:none;z-index:3}\n.ct .shade{position:absolute;left:0;top:0;bottom:0;width:min(560px,48vw);background:linear-gradient(90deg,rgba(8,9,12,.92) 0%,rgba(8,9,12,.7) 60%,rgba(8,9,12,0) 100%);pointer-events:none;z-index:3;transition:opacity .6s}\n@media (max-width:760px){.ct .shade{width:100%;top:auto;height:62%;background:linear-gradient(0deg,rgba(8,9,12,.95) 0%,rgba(8,9,12,.75) 55%,rgba(8,9,12,0) 100%)}}\n.ct .tl{position:absolute;left:0;top:0;transform:translate(-9999px,0);pointer-events:auto;cursor:pointer;background:none;border:0;color:var(--fg);font:inherit;display:flex;flex-direction:column;align-items:center;gap:5px;transition:opacity .4s}\n.ct .tl b{font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-weight:400;font-size:19px;white-space:nowrap;text-shadow:0 2px 12px rgba(0,0,0,.8)}\n.ct .tl.hq b{font-size:24px;color:var(--gold)}\n.ct .tl .dots{display:flex;gap:4px}\n.ct .tl .dots i{width:6px;height:6px;border-radius:50%;background:var(--stop);transition:transform .3s,opacity .3s}\n.ct .tl .dots i.hi{transform:scale(1.7)}\n.ct .tl.dim{opacity:.28}\n.ct .panel{position:absolute;top:0;right:0;bottom:0;width:min(420px,100%);z-index:6;background:var(--glass);backdrop-filter:blur(24px) saturate(1.2);-webkit-backdrop-filter:blur(24px) saturate(1.2);border-left:1px solid var(--line);padding:calc(86px + env(safe-area-inset-top,0px)) 38px 36px;transform:translateX(100%);transition:transform .7s cubic-bezier(.2,.8,.2,1);overflow-y:auto}\n.ct .panel.on{transform:none}\n.ct .panel .x{position:absolute;top:calc(24px + env(safe-area-inset-top,0px));right:26px;font:inherit;font-size:14px;color:var(--fg2);background:none;border:1px solid var(--line);border-radius:999px;padding:8px 16px;cursor:pointer}\n.ct .panel .k{font-size:14px;color:var(--fg3);margin-bottom:8px}\n.ct .panel h2{font-family:var(--f-display),\"Instrument Serif\",Georgia,serif;font-weight:400;font-size:54px;line-height:.98;margin:0 0 14px}\n.ct .panel .sum{font-size:18px;line-height:1.5;color:rgba(242,238,230,.85);margin:0 0 26px}\n.ct .row{all:unset;box-sizing:border-box;display:grid;grid-template-columns:12px 1fr auto;gap:12px;align-items:center;width:100%;padding:15px 0;border-bottom:1px solid var(--line);cursor:pointer}\n.ct .row i{width:9px;height:9px;border-radius:50%}\n.ct .row b{font-weight:500;font-size:18px}\n.ct .row span{font-size:14px;color:var(--fg2)}\n.ct .row small{grid-column:2/4;font-size:14px;color:var(--fg3);margin-top:-6px}\n.ct .row.hi b{color:var(--gold)}\n.ct .row small b.est{font-weight:500;font-size:12px;color:var(--fg3);border:1px solid var(--line);border-radius:999px;padding:1px 7px;margin-right:2px}\n.ct .hero h1{font-size:clamp(28px,3vw,44px)!important;margin-bottom:12px!important}\n.ct .since{font-size:13.5px;line-height:1.5;color:var(--fg2);margin:0 0 14px;max-width:430px;pointer-events:auto}\n.ct .since b{color:var(--fg);font-weight:500}\n.ct .since .w{color:var(--wait)}\n.ct .since .g{color:var(--ok)}\n.ct .top5{list-style:none;margin:0 0 16px;padding:0;pointer-events:auto;max-width:430px}\n.ct .top5 .h{font-size:12.5px;letter-spacing:.06em;color:var(--gold);margin-bottom:6px}\n.ct .top5 button{all:unset;box-sizing:border-box;display:flex;gap:10px;align-items:baseline;width:100%;padding:7px 0;border-bottom:1px solid var(--line);cursor:pointer;font-size:15px;color:var(--fg)}\n.ct .top5 button:hover b{color:var(--gold)}\n.ct .top5 b{font-weight:500;white-space:nowrap}\n.ct .top5 span{color:var(--fg2);font-size:14px}\n.ct .top5 i{font-style:normal;color:var(--wait);font-size:13px;min-width:62px}\n.ct .row .tr{font-style:normal;margin-left:6px}\n.ct .row .tr.up{color:var(--ok)}\n.ct .row .tr.down{color:var(--wait)}\n.ct .row .tr.flat{color:var(--fg3)}\n.ct .act{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:0 0 14px 24px;border-bottom:1px solid var(--line);margin-top:-8px}\n.ct .act .who{font-size:13px;color:var(--gold);margin-right:auto}\n.ct .act a,.ct .act button{font:inherit;font-size:13px;color:var(--fg2);background:none;border:1px solid var(--line);border-radius:999px;padding:5px 12px;cursor:pointer;text-decoration:none}\n.ct .act a:hover,.ct .act button:hover{color:var(--fg);border-color:rgba(242,238,230,.35)}\n.ct .row:has(+.act){border-bottom:0}\n.ct .note{font-size:13px;color:var(--fg3);margin-top:22px;line-height:1.5}\n@media (max-width:900px){.ct .panel{top:auto;height:52%;width:100%;border-left:0;border-top:1px solid var(--line);border-radius:26px 26px 0 0;transform:translateY(100%);padding:60px 22px 24px}\n.ct .panel h2{font-size:42px}\n.ct .panel .x{top:18px;right:18px}}\n\n@media (max-width:760px){.ct .top{left:18px;right:18px}\n.ct .tag{display:none}\n.ct .hero{left:18px;right:18px;bottom:calc(88px + env(safe-area-inset-bottom,0px))}\n.ct .hero p{display:none}\n.ct .stats{gap:20px}\n.ct .stats b{font-size:30px}\n.ct .chips{left:12px;right:12px;transform:none;max-width:none}\n.ct .chips button{font-size:14px;padding:9px 13px}\n.ct .chips .lab{display:none}\n.ct .tl b{font-size:14px}\n.ct .tl.hq b{font-size:18px}\n.ct .tl .dots i{width:4px;height:4px}}\n\n.ct .tm-fl{position:absolute;top:0;left:0;z-index:20;pointer-events:none;font-size:12px;letter-spacing:.04em;color:rgba(242,238,230,.72);white-space:nowrap;padding-right:6px;display:flex;gap:6px;align-items:baseline}.ct .tm-fl span{color:#E8CB8A;font-size:11px}\n.ct .team{margin:2px 0 14px}\n.ct .tm-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin:14px 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(242,238,230,.5)}\n.ct .tm-h span{text-transform:none;letter-spacing:0;font-size:12px}\n.ct .tm{display:grid;grid-template-columns:10px 1fr;column-gap:10px;row-gap:1px;width:100%;text-align:left;background:none;border:0;border-top:1px solid rgba(242,238,230,.08);padding:8px 0;color:inherit;cursor:default;font:inherit}\n.ct .tm i{width:8px;height:8px;border-radius:99px;margin-top:6px;grid-row:span 3}\n.ct .tm i.busy{background:#FFB54A}.ct .tm i.free{background:#7FE0B8}.ct .tm i.none{border:1px solid rgba(242,238,230,.4)}\n.ct .tm b{font-weight:500;font-size:14px;color:#F2EEE6}.ct .tm span{font-size:12.5px;color:rgba(242,238,230,.6)}.ct .tm small{font-size:12px;color:rgba(242,238,230,.48)}\n.ct .tm:hover b,.ct .tm:focus b{color:#E8CB8A}\n.ct .tm-note{font-size:12.5px;color:rgba(242,238,230,.55);margin:4px 0 10px;line-height:1.5}.ct .tm-note em{font-style:normal;color:#FFB54A}\n.ct .tm-tip{position:absolute;top:0;left:0;z-index:40;pointer-events:none;opacity:0;transition:opacity .15s;background:rgba(22,23,29,.94);border:1px solid rgba(242,238,230,.14);border-radius:10px;padding:8px 11px;display:flex;flex-direction:column;gap:2px;font-size:12.5px;color:#F2EEE6;max-width:260px}\n.ct .tm-tip b{font-weight:500}.ct .tm-tip span{color:rgba(242,238,230,.65)}.ct .tm-tip small{color:rgba(242,238,230,.5)}\n";

function mountCity(root,RAW,THREE,OrbitControls){
  const cleanups=[],timers=[];let raf=0;
  const on=(el,ev,fn,opt)=>{el.addEventListener(ev,fn,opt);cleanups.push(()=>el.removeEventListener(ev,fn,opt))};
  const $id=(id)=>root.querySelector('#'+id);
  const VW=()=>root.clientWidth||1,VH=()=>root.clientHeight||1;
  const toXY=(e)=>{const r=root.getBoundingClientRect();return [(e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1]};
  root.innerHTML="<div class=\"intro\" id=\"intro\"><b>La citt\u00e0</b><i></i></div>\n<canvas id=\"c\" aria-label=\"La citt\u00e0 dell'azienda: un palazzo per ogni progetto, un piano per ogni area\"></canvas>\n<div class=\"top\"><b>La citt\u00e0</b><div class=\"r\"><span class=\"tag\" id=\"tag\">HOC Pro + ClickUp</span><button class=\"pill\" id=\"snd\" aria-pressed=\"false\">Suono spento</button></div></div>\n<div class=\"shade\"></div><div class=\"labels\" id=\"labels\"></div>\n<div class=\"hero\" id=\"hero\">\n  <h1 id=\"h1\">La citt\u00e0.<br><em>Una sola citt\u00e0.</em></h1>\n  <div id=\"top5\"></div><div id=\"since\"></div><p id=\"line\">Ogni palazzo \u00e8 una creator, alto quanto il suo venduto del mese; ogni piano \u00e8 un'area. Tocca un palazzo per entrarci, o scegli un'area qui sotto per vederla in tutta la citt\u00e0.</p>\n  <div class=\"stats\"><div><b id=\"s1\">0</b><span>creator</span></div><div><b id=\"s2\">0</b><span>aree in ritardo</span></div><div><b id=\"s3\">0</b><span>aree ferme</span></div></div>\n</div>\n<nav class=\"chips\" id=\"chips\" aria-label=\"Guarda un'area in tutta la citt\u00e0\"></nav>\n<aside class=\"panel\" id=\"panel\" aria-live=\"polite\"><button class=\"x\" id=\"close\">Chiudi</button><div id=\"pb\"></div></aside>";

const AREAS=['HR','Finance','Deal','Sales','Chatting','Contenuti'];
let seed=7;const rnd=()=>{seed=(seed*9301+49297)%233280;return seed/233280};
const projects=RAW.projects.map(p=>({n:p.n,hq:false,areas:p.areas,total:p.total,other:p.other,nospace:!!p.nospace,sales:p.sales||0}));
const HQ={n:'Azienda',hq:true,areas:RAW.hq.areas,total:RAW.hq.total,other:RAW.hq.other,sales:RAW.hq.sales||0};
const MAXS=Math.max(1,...RAW.projects.map(p=>p.sales||0));
const HQMAP={HR:'Persone',Finance:'Finance',Deal:'Deal',Sales:'Sales',Chatting:'Chatting',Contenuti:'Social'};
const COLc={ok:'var(--ok)',wait:'var(--wait)',stop:'var(--stop)',none:'rgba(242,238,230,.16)',old:'rgba(242,238,230,.3)'},STT={ok:'In movimento',wait:'Qualcosa in ritardo',stop:'Ferma',none:'Nessuna attività',old:'Da riordinare in ClickUp'};
const esc=t=>String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const NUMW=['zero','uno','due','tre','quattro','cinque','sei','sette','otto','nove','dieci','undici','dodici','tredici','quattordici','quindici','sedici','diciassette','diciotto','diciannove','venti'];

const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const cv=$id('c');
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
const pmrem=new THREE.PMREMGenerator(renderer);
(function(){const s=new THREE.Scene();s.add(new THREE.Mesh(new THREE.BoxGeometry(40,40,40),new THREE.MeshBasicMaterial({color:0x07070A,side:THREE.BackSide})));
 const p=(w,h,x,y,z,rx,ry,k,c)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(c).multiplyScalar(k),side:THREE.DoubleSide}));m.position.set(x,y,z);m.rotation.set(rx,ry,0);s.add(m)};
 p(8,2,0,16,0,Math.PI/2,0,1.6,0xffffff);p(3,18,-17,4,4,0,Math.PI/2,2,0xDDE6FF);p(3,18,17,4,-3,0,-Math.PI/2,2.6,0xFFEBD2);p(20,1,0,2,-18,0,0,1.1,0xffffff);p(8,.8,6,8,17,0,Math.PI,1.3,0xFFF4E6);
 scene.environment=pmrem.fromScene(s,.02).texture})();
const cam=new THREE.PerspectiveCamera(34,1,.1,200);
const controls=new OrbitControls(cam,cv);
Object.assign(controls,{enableDamping:true,dampingFactor:.06,enablePan:false,minDistance:6,maxDistance:48,minPolarAngle:.35,maxPolarAngle:1.38,rotateSpeed:.55});
scene.add(new THREE.AmbientLight(0xffffff,.14));
const key=new THREE.DirectionalLight(0xfff1dc,.95);key.position.set(12,22,10);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.radius=5;key.shadow.bias=-.0006;
Object.assign(key.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:1,far:60});scene.add(key);
const rim=new THREE.DirectionalLight(0x9fb8ff,.6);rim.position.set(-14,9,-12);scene.add(rim);

function radialTex(inner,outer){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,256,256);const gr=g.createRadialGradient(128,128,inner,128,128,outer);gr.addColorStop(0,'#fff');gr.addColorStop(1,'#000');g.fillStyle=gr;g.fillRect(0,0,256,256);return new THREE.CanvasTexture(c)}
const floor=new THREE.Mesh(new THREE.CircleGeometry(40,96),new THREE.MeshBasicMaterial({color:0x0D0E12,transparent:true,opacity:.9,alphaMap:radialTex(60,126),depthWrite:false}));floor.rotation.x=-Math.PI/2;scene.add(floor);
const shadowP=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.ShadowMaterial({opacity:.5}));shadowP.rotation.x=-Math.PI/2;shadowP.position.y=.003;shadowP.receiveShadow=true;scene.add(shadowP);

// geometry helpers
function rrect(w,h,r){const s=new THREE.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s}
function slabGeo(w,d,t,r,bev){const g=new THREE.ExtrudeGeometry(rrect(w,d,r),{depth:t,bevelEnabled:true,bevelThickness:bev,bevelSize:bev,bevelSegments:3,curveSegments:12});g.rotateX(-Math.PI/2);g.center();return g}
const glassMat=new THREE.MeshPhysicalMaterial({color:0x2C3850,metalness:.25,roughness:.22,transparent:true,opacity:.7,envMapIntensity:.55,clearcoat:.35,clearcoatRoughness:.2,depthWrite:false});
const metalMat=new THREE.MeshPhysicalMaterial({color:0x9A9CA4,metalness:1,roughness:.28,clearcoat:.5,envMapIntensity:.8});
const goldMat=new THREE.MeshPhysicalMaterial({color:0xD9B46A,metalness:1,roughness:.22,clearcoat:.8,envMapIntensity:1.2});
const plinthMat=new THREE.MeshStandardMaterial({color:0x121317,metalness:.4,roughness:.6,envMapIntensity:.2});
const COL={ok:new THREE.Color(0x7FE0B8),wait:new THREE.Color(0xFFB54A),stop:new THREE.Color(0x3A3C44),none:new THREE.Color(0x1E1F25),old:new THREE.Color(0x2A2B31)};
const glowTex=(()=>{const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(128,32,0,128,32,128);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.25,'rgba(255,255,255,.4)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,256,64);return new THREE.CanvasTexture(c)})();

// ---------- city layout: 5 x 3 grid, the company in the middle ----------
const CW=4.4,CD=3.8;const towers=[],slabs=[];
const ROWS=Math.ceil((projects.length+1)/5),HQR=Math.floor((ROWS-1)/2);const cells=[];for(let r=0;r<ROWS;r++)for(let c=0;c<5;c++)cells.push([c,r]);
let pi=0;
cells.forEach(([c,r])=>{const isHQ=(c===2&&r===HQR);if(!isHQ&&pi>=projects.length)return;const data=isHQ?HQ:projects[pi++];const x=(c-2)*CW,z=(r-(ROWS-1)/2)*CD;
  const T={data,x,z,g:new THREE.Group(),slabs:[],hq:isHQ};T.g.position.set(x,0,z);scene.add(T.g);
  const w=isHQ?2.5:1.8,d=isHQ?1.6:1.15,t=isHQ?.1:.08,n=data.areas.length;const gap=isHQ?.72:(RAW.live?.3+.42*Math.sqrt((data.sales||0)/MAXS):.5);
  const pl=new THREE.Mesh(slabGeo(w+1.1,d+1.0,.1,.4,.02),plinthMat);pl.position.y=.06;pl.receiveShadow=true;pl.castShadow=true;T.g.add(pl);
  const edge=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rrect(w+1.14,d+1.04,.42).getPoints(48).map(p=>new THREE.Vector3(p.x,.125,p.y))),new THREE.LineBasicMaterial({color:0xD9B46A,transparent:true,opacity:isHQ?.9:.45}));T.g.add(edge);
  const gGlass=slabGeo(w,d,t,.18,.03),gMetal=slabGeo(w+.12,d+.1,.025,.22,.008),gCore=new THREE.BoxGeometry(w*.8,.035,.035);
  data.areas.forEach((a,k)=>{const lvl=n-1-k;const S={T,a,k,g:new THREE.Group(),base:.34+lvl*gap,x:0};
    const metal=new THREE.Mesh(gMetal,metalMat);metal.position.y=-t/2-.03;metal.castShadow=true;S.g.add(metal);
    const glass=new THREE.Mesh(gGlass,glassMat.clone());S.metal=metal;glass.userData={S};S.g.add(glass);S.glass=glass;
    S.coreMat=new THREE.MeshBasicMaterial({color:COL[a.s].clone(),toneMapped:false});const core=new THREE.Mesh(gCore,S.coreMat);S.g.add(core);
    S.sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:COL[a.s],transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0}));S.sp.scale.set(w*1.3,.36,1);S.g.add(S.sp);
    T.g.add(S.g);T.slabs.push(S);slabs.push(S)});
  T.top=.34+(n-1)*gap+.2;
  T.rod=new THREE.Mesh(new THREE.CylinderGeometry(isHQ?.04:.03,isHQ?.04:.03,1,16),goldMat);T.g.add(T.rod);
  T.cap=new THREE.Mesh(new THREE.SphereGeometry(isHQ?.1:.07,24,24),goldMat);T.g.add(T.cap);
  T.dist=Math.hypot(x,z);towers.push(T)});
// streets: gold hairlines between blocks, with light pulses running along them
const streetMat=new THREE.LineBasicMaterial({color:0xD9B46A,transparent:true,opacity:.16});
const streets=[];
for(let r=0;r<=ROWS;r++){const z=(r-ROWS/2)*CD;streets.push([[-2.5*CW,z],[2.5*CW,z]])}
for(let c=0;c<=5;c++){const x=(c-2.5)*CW;streets.push([[x,-ROWS/2*CD],[x,ROWS/2*CD]])}
streets.forEach(([a,b])=>{scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0],.01,a[1]),new THREE.Vector3(b[0],.01,b[1])]),streetMat))});
const pulses=[];const pulseMat=new THREE.SpriteMaterial({map:glowTex,color:0xE8CB8A,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.8});
for(let k=0;k<22;k++){const sp=new THREE.Sprite(pulseMat);sp.scale.set(.9,.14,1);scene.add(sp);pulses.push({sp,s:streets[k%streets.length],t:rnd(),v:.04+rnd()*.05,dir:rnd()<.5?1:-1})}
// dust
const dustN=300,dp=new Float32Array(dustN*3);for(let k=0;k<dustN;k++){dp[k*3]=(Math.random()-.5)*34;dp[k*3+1]=Math.random()*10;dp[k*3+2]=(Math.random()-.5)*26}
const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(dp,3));scene.add(new THREE.Points(dg,new THREE.PointsMaterial({color:0xF2EEE6,size:.035,transparent:true,opacity:.3,depthWrite:false})));

// ---------- UI ----------
{const s=RAW.since;const el=$id('since');if(s&&el){const dd=d=>new Date(d).toLocaleDateString('it-IT',{day:'numeric',month:'long'});let h='';if(s.base){const w=s.worse||[],g=s.better||[];h=`Dal ${dd(s.base)}: <b class="w">${w.length} ${w.length===1?'nuovo ritardo':'nuovi ritardi'}</b>${w.length?` (${w.slice(0,3).map(esc).join(', ')}${w.length>3?'…':''})`:''}, <b class="g">${g.length} ${g.length===1?'risolto':'risolti'}</b>${g.length?` (${g.slice(0,3).map(esc).join(', ')}${g.length>3?'…':''})`:''}.`}else{h='Lo storico è partito il 26 settembre: il confronto con la settimana prima compare dal 29.'}if((s.staleClaims||[]).length)h+=` <b class="w">${s.staleClaims.length} prese in carico ferme da oltre 7 giorni</b> (${s.staleClaims.slice(0,2).map(esc).join(', ')}).`;el.innerHTML=`<div class="since">${h}</div>`}}
if(RAW.live?.past)$id('tag').textContent=`${RAW.live.label[0].toUpperCase()+RAW.live.label.slice(1)} · solo dati HOC Pro`;
{const n=projects.length;const lab=RAW.live?(RAW.live.asOfDay?`${RAW.live.label} fino al ${RAW.live.asOfDay}`:RAW.live.label):'';$id('h1').innerHTML=`${(NUMW[n]||n).replace(/^./,c=>c.toUpperCase())} creator e la sede.${lab?`<br><em>${lab.replace(/^./,c=>c.toUpperCase())}.</em>`:''}`;
 const top=RAW.top||[];const el=$id('top5');if(top.length){el.innerHTML=`<div class="top5"><div class="h">DA GUARDARE QUESTA SETTIMANA</div>${top.map((x,k)=>`<button data-t="${esc(x.tower)}" data-a="${esc(x.area)}"><i>${esc(x.area)}</i><b>${esc(x.tower)}</b><span>${esc(x.text)}</span></button>`).join('')}</div>`;el.querySelectorAll('button').forEach(b=>b.onclick=()=>{const T=towers.find(t=>t.data.n===b.dataset.t);if(!T)return;selectTower(T);const k=T.data.areas.findIndex(a=>a.n===b.dataset.a);if(k>=0){hiSlab=T.slabs[k];pb.querySelectorAll('.row').forEach(x=>x.classList.toggle('hi',+x.dataset.k===k))}})}}
const labelsEl=$id('labels');
towers.forEach(T=>{const b=document.createElement('button');b.className='tl'+(T.hq?' hq':'');b.innerHTML=`<b>${T.data.n}</b><span class="dots">${T.data.areas.map(a=>`<i style="background:${COLc[a.s]}"></i>`).join('')}</span>`;b.onclick=()=>selectTower(T);labelsEl.appendChild(b);T.lbl=b;T.dots=[...b.querySelectorAll('i')]});
let filter=null,selT=null,hoverT=null,hiSlab=null;
const chips=$id('chips');
chips.innerHTML='<span class="lab">Guarda un\'area</span>'+['Tutte',...AREAS].map((a,k)=>`<button data-k="${k-1}" aria-pressed="${k===0}">${a}</button>`).join('');
chips.querySelectorAll('button').forEach(b=>b.onclick=()=>setFilter(+b.dataset.k<0?null:AREAS[+b.dataset.k]));
const lineEl=$id('line'),defLine=lineEl.textContent;
function areaOf(T,name){return T.hq?T.data.areas.find(a=>a.n===HQMAP[name]):T.data.areas.find(a=>a.n===name)}
function setFilter(name){filter=name;chips.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',(+b.dataset.k<0?null:AREAS[+b.dataset.k])===name));
  if(!name){lineEl.textContent=defLine;return}
  const c={ok:0,wait:0,stop:0,none:0,old:0};towers.forEach(T=>{const a=areaOf(T,name);if(a)c[a.s]++});
  lineEl.textContent=`${name} in tutta la città: ${c.ok} in movimento, ${c.wait} con qualcosa in ritardo, ${c.stop} ${c.stop===1?'ferma':'ferme'}${c.none?`, ${c.none} senza attività`:''}${c.old?`, ${c.old} da riordinare in ClickUp`:''}.`;chime(3,true)}
const panel=$id('panel'),pb=$id('pb');
const ARW={up:'↑',down:'↓',flat:'→'},TRT={up:'Migliora rispetto al mese prima',down:'Peggiora rispetto al mese prima',flat:'Stabile rispetto al mese prima'};
const ago=ts=>{const d=Math.floor((Date.now()-ts)/864e5);return d<=0?'da oggi':d===1?'da ieri':`da ${d} giorni`};
function actRow(T,a){const link=a.link?(a.link.startsWith('/')?(RAW.base||'')+a.link:a.link):null;const lab=a.src==='hoc'?'Apri in HOC Pro':'Apri in ClickUp';
  const claim=a.claim?`<span class="who">In carico a ${esc(a.claim.by)} ${ago(a.claim.at)}</span>`:'';
  const btn=RAW.canClaim?(a.claim?`<button data-rel="${esc(a.n)}">Rilascia</button>`:`<button data-cl="${esc(a.n)}">Prendi in carico</button>`):'';
  if(!claim&&!btn&&!link)return '';return `<div class="act">${claim}${link?`<a href="${esc(link)}" target="_blank" rel="noopener">${lab} ↗</a>`:''}${btn}</div>`}
async function claimArea(T,area,on){try{const r=await fetch(RAW.api||'/api/admin/citta',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:on?'claim':'release',tower:T.data.n,area})});const j=await r.json();if(!r.ok)throw new Error(j.error||'errore');const a=T.data.areas.find(x=>x.n===area);if(a){if(j.claim)a.claim={by:j.claim.by,at:j.claim.at};else delete a.claim}selectTower(T)}catch(e){alert('Non riuscito: '+e.message)}}
function selectTower(T){selT=T;hiSlab=null;flyUntil=performance.now()+2000;chime(T.hq?0:5,true);
  const c={ok:0,wait:0,stop:0,none:0,old:0};T.data.areas.forEach(a=>c[a.s]++);
  const sum=c.stop?`${c.stop===1?'Un\'area è ferma':c.stop+' aree sono ferme'} e ${c.wait} ${c.wait===1?'aspetta':'aspettano'} qualcosa.`:c.wait?`${c.wait===1?'Un\'area ha':c.wait+' aree hanno'} qualcosa in ritardo, il resto si muove.`:'Tutte le aree sono in movimento.';
  pb.innerHTML=`<div class="k">${T.hq?'La sede · le aree di tutta l\'azienda':'Progetto creator'}</div><h2>${T.data.n}</h2><p class="sum">${sum}</p>${RAW.api?'<div class="team"><p class="tm-note">Carico la squadra…</p></div>':''}`+T.data.areas.map((a,k)=>`<button class="row" data-k="${k}"><i style="background:${COLc[a.s]}"></i><b>${esc(a.n)}</b><span>${STT[a.s]}${a.trend?` <em class="tr ${a.trend}" title="${TRT[a.trend]}">${ARW[a.trend]}</em>`:''}</span><small>${a.src==='clickup'?'<b class="est">Stima ClickUp</b> · ':''}${esc(a.l)}</small></button>${actRow(T,a)}`).join('')+`<p class="note">${T.data.nospace?'Nessuno spazio ClickUp per questa creator: le attività sono quelle che la nominano nel titolo, negli altri spazi (può includere omonimi). ':''}${RAW.live?'Sales, Finance e Chatting vengono da HOC Pro (P&L e Classifica vendite); l\'altezza del palazzo è il venduto del mese. HR, Deal e Contenuti sono stimati dal titolo delle attività ClickUp: ':'Le aree sono stimate dal titolo delle attività ClickUp: '}${T.data.total} attività aperte, ${T.data.other} non riconducibili a un'area. Dati del ${new Date(RAW.generated).toLocaleDateString('it-IT',{day:'numeric',month:'long'})}.</p>`;
  pb.querySelectorAll('[data-cl]').forEach(b=>b.onclick=()=>claimArea(T,b.dataset.cl,true));pb.querySelectorAll('[data-rel]').forEach(b=>b.onclick=()=>claimArea(T,b.dataset.rel,false));
  pb.querySelectorAll('.row').forEach(r=>r.onclick=()=>{const k=+r.dataset.k;hiSlab=hiSlab===T.slabs[k]?null:T.slabs[k];pb.querySelectorAll('.row').forEach(x=>x.classList.toggle('hi',hiSlab&&+x.dataset.k===k));chime(k,true)});
  panel.classList.add('on');$id('hero').style.opacity=0;chips.classList.add('hide');hiF=null;towers.forEach(X=>{if(X!==T)showTeam(X,false)});loadTeam(T)}
function deselect(){if(selT)showTeam(selT,false);hiF=null;tipEl.style.opacity=0;selT=null;hiSlab=null;flyUntil=performance.now()+2000;panel.classList.remove('on');$id('hero').style.opacity=1;chips.classList.remove('hide')}
$id('close').onclick=deselect;
on(document,'keydown',e=>{if(e.key==='Escape')deselect()});

// sound
let actx=null,sound=false;const sb=$id('snd');
sb.onclick=()=>{sound=!sound;if(sound&&!actx)actx=new (window.AudioContext||window.webkitAudioContext)();sb.textContent=sound?'Suono acceso':'Suono spento';sb.setAttribute('aria-pressed',sound);if(sound)chime(3)};
function chime(i,soft){if(!sound||!actx)return;const t=actx.currentTime,base=[1318,1174,1046,987,880,784,698,659][i%8];[1,2.76].forEach((h,k)=>{const o=actx.createOscillator(),g=actx.createGain();o.frequency.value=base*h;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime((soft?.025:.04)/(k+1),t+.005);g.gain.exponentialRampToValueAtTime(.0001,t+(k?1:2));o.connect(g).connect(actx.destination);o.start(t);o.stop(t+2.1)})}

// picking
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let downAt=null;
const glassList=slabs.map(s=>s.glass);
function pickAt(e){mouse.set(...toXY(e));ray.setFromCamera(mouse,cam);const h=ray.intersectObjects(glassList)[0];return h?h.object.userData.S:null}
on(cv,'pointermove',e=>{const S=pickAt(e);hoverT=S?S.T:null;cv.style.cursor=S?'pointer':'grab'});
on(cv,'pointerdown',e=>downAt=[e.clientX,e.clientY]);
on(cv,'pointerup',e=>{if(!downAt)return;const mv=Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1]);downAt=null;if(mv>6)return;const S=pickAt(e);if(S){if(selT!==S.T)selectTower(S.T);hiSlab=S;pb.querySelectorAll('.row').forEach(x=>x.classList.toggle('hi',+x.dataset.k===S.k))}else if(selT&&!figAt(e))deselect()});

// ---------- la squadra dentro il palazzo (solo in app: dati da /ufficio) ----------
const OPEN=.4;const TEAMC={busy:0xFFB54A,free:0x7FE0B8,none:0xD8D2C6};const teamCache={};let hiF=null,hovF=null;
const figGeo={body:new THREE.CylinderGeometry(.034,.05,.13,14),head:new THREE.SphereGeometry(.042,16,12)};
const HQA2={HR:'Persone',Contenuti:'Social'};
const presState=m=>!m.presence?'none':m.presence.busy?'busy':'free';
const hm=ts=>new Date(ts).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'});
const presText=m=>{const p=m.presence;if(!p)return 'Calendario non visibile';return p.busy?`In un impegno fino alle ${hm(p.until)}`:p.next?`Libero · prossimo impegno alle ${hm(p.next)}`:'Libero per oggi'};
function makeFig(color){const g=new THREE.Group();const mat=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.6,roughness:.45,metalness:.1});
  const b=new THREE.Mesh(figGeo.body,mat);b.position.y=.065;const h=new THREE.Mesh(figGeo.head,mat);h.position.y=.17;b.castShadow=h.castShadow=true;g.add(b,h);g.visible=false;return {g,mat,hit:[b,h]}}
function slabFor(T,area){if(!area)return null;const n=T.hq&&HQA2[area]?HQA2[area]:area;return T.slabs.find(S=>S.a.n===n)||null}
function placeTeam(T,d){if(T.figs)return;T.figs=[];const by=new Map();const push=(S,f)=>{if(!by.has(S))by.set(S,[]);by.get(S).push(f)};
  d.members.forEach((m,i)=>{const f=makeFig(TEAMC[presState(m)]);f.m=m;f.idx=i;f.kind='team';push(slabFor(T,(m.areas||[])[0]),f)});
  const cs=slabFor(T,'Chatting');(d.chatters||[]).slice(0,10).forEach(c=>{const f=makeFig(c.under?0xFFB54A:0x9DB0D6);f.c=c;f.kind='chat';push(cs,f)});
  const w=T.hq?2.5:1.8,dd=T.hq?1.6:1.15,th=T.hq?.1:.08;
  by.forEach((list,S)=>list.forEach((f,i)=>{const per=S?8:9,cols=Math.min(list.length-Math.floor(i/per)*per,per),col=i%per,row=Math.floor(i/per);const x=(col-(cols-1)/2)*(w*.86/per);
    if(S){f.g.position.set(x,th/2+.004,dd*.5-.12-row*.22);S.g.add(f.g)}else{f.g.position.set(x,.12,dd/2+.38+row*.24);T.g.add(f.g)}
    f.base=f.kind==='chat'?1.05:1.45;f.g.scale.setScalar(f.base);f.hit.forEach(h=>h.userData.F=f);T.figs.push(f)}))}
function showTeam(T,on){(T.figs||[]).forEach(f=>f.g.visible=on);
  if(on&&!T.fls){T.fls=T.slabs.map(S=>{const e=document.createElement('div');e.className='tm-fl';const n=T.figs.filter(f=>f.g.parent===S.g).length;e.innerHTML=esc(S.a.n)+(n?'<span>'+n+'</span>':'');root.appendChild(e);return e})}
  (T.fls||[]).forEach(e=>e.style.display=on?'':'none')}
function hiFig(T,i){hiF=(T.figs||[]).find(f=>f.kind==='team'&&f.idx===i)||null}
async function loadTeam(T){const el=pb.querySelector('.team');if(!RAW.api||!el)return;
  try{let d=teamCache[T.data.n];if(!d){const r=await fetch(RAW.api+'/ufficio?t='+encodeURIComponent(T.data.n));d=await r.json();if(!r.ok)throw new Error(d.error||'errore');teamCache[T.data.n]=d}
    if(selT!==T)return;placeTeam(T,d);showTeam(T,true);renderTeam(T,d,el)}catch(e){el.innerHTML=`<p class="tm-note">Squadra non disponibile: ${esc(e.message)}</p>`}}
function renderTeam(T,d,el){const off=(RAW.base||'')+'/admin/citta/ufficio?t='+encodeURIComponent(T.data.n);const cal=d.calendar&&d.calendar.configured&&!d.calendar.error;
  const busy=d.members.filter(m=>m.presence&&m.presence.busy).length,ch=d.chatters||[],under=ch.filter(c=>c.under).length;
  const ppl=d.members.map((m,i)=>`<button class="tm" data-i="${i}"><i class="${presState(m)}"></i><b>${esc(m.name||m.email)}</b><span>${esc(m.role||(m.areas||[]).join(', ')||'Ruolo da indicare')}</span>${cal?`<small>${presText(m)}</small>`:''}</button>`).join('');
  el.innerHTML=`<div class="tm-h">Chi ci lavora<span>${d.members.length} nel team${cal?` · ${busy} in un impegno ora`:''}</span></div>${ppl||'<p class="tm-note">Nessuno assegnato in ClickUp.</p>'}`+
    (T.hq?'':`<div class="tm-h">In chat<span>${ch.length} operatori${under?` · ${under} sotto soglia`:''}</span></div><p class="tm-note">${ch.slice(0,8).map(c=>esc(c.name)+(c.under?' <em>sotto soglia</em>':'')).join(', ')}${ch.length>8?'…':''}</p>`)+
    `<p class="tm-note">Le figure nel palazzo sono le persone, sul piano del loro reparto principale${cal?': verde libero, ambra in un impegno':''}. I chatter stanno sul piano Chatting.</p><div class="act"><a href="${off}">Apri l'ufficio →</a></div>`;
  el.querySelectorAll('.tm').forEach(b=>{b.onmouseenter=()=>hiFig(T,+b.dataset.i);b.onmouseleave=()=>{hiF=null};b.onfocus=b.onmouseenter;b.onblur=b.onmouseleave})}
const tipEl=document.createElement('div');tipEl.className='tm-tip';root.appendChild(tipEl);
function figAt(e){if(!selT||!selT.figs)return null;mouse.set(...toXY(e));ray.setFromCamera(mouse,cam);const h=ray.intersectObjects(selT.figs.filter(f=>f.g.visible).flatMap(f=>f.hit))[0];return h?h.object.userData.F:null}
on(cv,'pointermove',e=>{const f=figAt(e);hovF=f;if(!f){tipEl.style.opacity=0;return}cv.style.cursor='pointer';const r=root.getBoundingClientRect();
  tipEl.innerHTML=f.kind==='team'?`<b>${esc(f.m.name||f.m.email)}</b><span>${esc(f.m.role||(f.m.areas||[]).join(', ')||'Ruolo da indicare')}</span><small>${presText(f.m)}</small>`:`<b>${esc(f.c.name)}</b><span>In chat · ${String(f.c.shifts).replace('.',',')} turni · $${Math.round(f.c.sales).toLocaleString('it-IT')}</span>${f.c.under?'<small>Sotto soglia</small>':''}`;
  tipEl.style.transform=`translate(${Math.min(e.clientX-r.left+14,r.width-270)}px,${e.clientY-r.top+14}px)`;tipEl.style.opacity=1});

// camera
const DIR=new THREE.Vector3(.5,.4,.82).normalize();
let flyUntil=0;const home={t:new THREE.Vector3(),d:30};
function homeFrame(){const m=VW()<=760;
  // inquadratura MISURATA: tutta la città nello spazio a destra del testo, a qualunque larghezza
  const H=Math.max(...towers.map(T=>T.top));const pts=[];
  towers.forEach(T=>{const w=(T.hq?2.5:1.8)/2+.6,d=(T.hq?1.6:1.15)/2+.55;for(const x of[-w,w])for(const z of[-d,d])for(const y of[0,T.top+.5])pts.push(new THREE.Vector3(T.x+x,y,T.z+z))});
  const hr=$id('hero')?$id('hero').getBoundingClientRect():null,rr=root.getBoundingClientRect();
  const x0=hr&&hr.width?Math.min(.56,Math.max(.3,(hr.right-rr.left+28)/VW())):.4;let X=[x0*2-1,.95],Y=[-.8,.78];
  // telefono: il testo sta sotto, la città nello spazio libero sopra
  if(m){const y0=hr&&hr.height?1-2*Math.max(.3,Math.min(.8,(hr.top-rr.top-12)/VH())):-.1;X=[-.94,.94];Y=[y0,.72]}
  const save={p:cam.position.clone(),q:cam.quaternion.clone()};let d=30;const t=new THREE.Vector3(0,H*.3,0);
  const fwd=DIR.clone().negate(),right=new THREE.Vector3().crossVectors(fwd,new THREE.Vector3(0,1,0)).normalize(),up=new THREE.Vector3().crossVectors(right,fwd).normalize();
  const ext=()=>{cam.position.copy(t).add(DIR.clone().multiplyScalar(d));cam.lookAt(t);cam.updateMatrixWorld();let a=[1e9,-1e9,1e9,-1e9];pts.forEach(p=>{const q=p.clone().project(cam);a=[Math.min(a[0],q.x),Math.max(a[1],q.x),Math.min(a[2],q.y),Math.max(a[3],q.y)]});return a};
  for(let i=0;i<5;i++){let a=ext();d*=Math.max((a[1]-a[0])/(X[1]-X[0]),(a[3]-a[2])/(Y[1]-Y[0]));a=ext();const hh=d*Math.tan(THREE.MathUtils.degToRad(cam.fov/2)),hv=hh*cam.aspect;
    t.add(right.clone().multiplyScalar(-((X[0]+X[1])/2-(a[0]+a[1])/2)*hv)).add(up.clone().multiplyScalar(-((Y[0]+Y[1])/2-(a[2]+a[3])/2)*hh))}
  cam.position.copy(save.p);cam.quaternion.copy(save.q);cam.updateMatrixWorld();home.d=d;home.t.copy(t);if(typeof controls!=='undefined')controls.maxDistance=Math.max(controls.maxDistance,d*1.3)}
function resize(){renderer.setSize(VW(),VH(),false);cam.aspect=VW()/VH();cam.fov=VW()<=760?40:34;cam.updateProjectionMatrix();homeFrame()}
resize();on(window,'resize',()=>{resize();towers.forEach(T=>{T._w=0;T._h=0})});
controls.target.copy(home.t);cam.position.copy(home.t).add(DIR.clone().multiplyScalar(home.d+14));
function towerFrame(T){const sheet=VW()<=900,d=sheet?18:13.5;const c=new THREE.Vector3(T.x,(T.top+(T.figs?(T.slabs.length-1)*OPEN:0))*.5,T.z);
  const dir=cam.position.clone().sub(controls.target).normalize();dir.y=Math.max(dir.y,.62);dir.normalize();
  const fwd=dir.clone().negate(),right=new THREE.Vector3().crossVectors(fwd,new THREE.Vector3(0,1,0)).normalize(),up=new THREE.Vector3().crossVectors(right,fwd).normalize();
  const tan=Math.tan(THREE.MathUtils.degToRad(cam.fov/2)),vh=2*d*tan,vw=vh*cam.aspect;
  const t=c.clone();if(sheet)t.add(up.multiplyScalar(-vh*.25));else t.add(right.multiplyScalar(vw*.16));
  return {t,p:t.clone().add(dir.multiplyScalar(d))}}

// intro
let t0=performance.now()+(reduce?-20000:RAW.noIntro?0:2400),shown=false;const intro=$id('intro');
if(reduce||RAW.noIntro){intro.classList.add('gone')}else{timers.push(setTimeout(()=>intro.classList.add('go'),120),setTimeout(()=>intro.classList.add('gone'),2200))}
function countUp(){[['s1',projects.length],['s2',towers.reduce((a,T)=>a+T.data.areas.filter(x=>x.s==='wait').length,0)],['s3',towers.reduce((a,T)=>a+T.data.areas.filter(x=>x.s==='stop').length,0)]].forEach(([id,n])=>{const el=$id(id),st=performance.now();(function f(){const q=Math.min(1,(performance.now()-st)/1400);el.textContent=Math.round(n*(1-Math.pow(1-q,3)));if(q<1)requestAnimationFrame(f)})()})}

// ---------- loop ----------
const clock=new THREE.Clock(),v=new THREE.Vector3();
const ease=x=>1-Math.pow(1-x,3);
function loop(){const dt=Math.min(.05,clock.getDelta()),now=performance.now(),t=(now-t0)/1000;
  // camera
  const want=selT?towerFrame(selT):{t:home.t,p:home.t.clone().add(cam.position.clone().sub(controls.target).normalize().multiplyScalar(home.d))};
  const k=Math.min(1,dt*(reduce?60:2.4));controls.target.lerp(want.t,k);
  if(now<flyUntil||(!shown&&!selT))cam.position.lerp(want.p,k);
  if(!reduce&&!selT&&shown&&now>flyUntil&&!controls.__drag)controls.autoRotate=false;
  let maxDelay=0;
  towers.forEach(T=>{
    const focusT=selT?selT===T:true;T.open=(T.open||0)+(((selT===T&&T.figs)?1:0)-(T.open||0))*Math.min(1,dt*3);
    T.slabs.forEach(S=>{
      const delay=.15+T.dist*.07+(T.slabs.length-1-S.k)*.07;maxDelay=Math.max(maxDelay,delay);
      const p=reduce?1:Math.min(1,Math.max(0,(t-delay)/1));const e=ease(p);
      const areaHit=filter?(T.hq?S.a.n===HQMAP[filter]:S.a.n===filter):true;
      const slide=(hiSlab===S?.55:(filter&&areaHit?.28:0));S.x+=(slide-S.x)*Math.min(1,dt*6);
      S.g.position.set(0,S.base+(1-e)*7+T.open*(T.slabs.length-1-S.k)*OPEN,S.x);
      const lit=p>=1?Math.min(1,(t-delay-1)*1.8):0;
      let dim=1;if(!focusT)dim*=.1;if(filter&&!areaHit)dim*=.12;if(hiSlab&&hiSlab!==S&&selT===T)dim*=.35;
      let pulse=1;if(S.a.s==='wait'&&!reduce)pulse=.55+.45*(.5+.5*Math.sin(t*2.2+S.k+T.dist));
      const kk=Math.max(0,lit)*dim*pulse*(hoverT===T&&!selT?1.25:1)*(S.a.src==='clickup'?.5:1);
      if(S.a.s==='ok'||S.a.s==='wait'){S.sp.material.opacity=Math.min(1,.75*kk);S.coreMat.color.copy(COL[S.a.s]).multiplyScalar(.06+.94*Math.min(1,kk))}
      else S.coreMat.color.copy(COL[S.a.s]).multiplyScalar(dim<.5?.5:1);
      const gOp=(dim<.3?.16:.7)*(filter&&areaHit&&focusT?1.25:1);S.glass.material.opacity+=(Math.min(.9,gOp)-S.glass.material.opacity)*Math.min(1,dt*(reduce?60:5));S.metal.visible=S.glass.material.opacity>.3});
    const topY=T.slabs[0].g.position.y+.2;T.rod.scale.y=Math.max(.01,topY-.1);T.rod.position.y=(topY+.1)/2;T.cap.position.y=topY+.06;T.cap.visible=topY<T.top+1;
    // label
    v.set(T.x,topY+(T.hq?.75:.55),T.z).project(cam);const inFront=v.z<1;
    T.lbl.style.transform=`translate(${(v.x*.5+.5)*VW()}px,${(-v.y*.5+.5)*VH()}px) translate(-50%,-100%)`;
    const lab=reduce?1:Math.min(1,Math.max(0,(t-(.15+T.dist*.07+1.2))*2));
    T._op=inFront?(selT&&selT!==T?0:(lab*(filter&&!areaOf(T,filter)?.3:1))):0;T._x=(v.x*.5+.5)*VW();T._y=(-v.y*.5+.5)*VH();
    T.dots.forEach((d,j)=>d.classList.toggle('hi',!!filter&&T.data.areas[j]===areaOf(T,filter)));
  });
  // keep labels readable: nearer towers win, overlapping ones fade out (they come back on hover)
  {const ui=[...root.querySelectorAll('.top,.chips'),...(selT?[]:[$id('hero')])].map(e=>e.getBoundingClientRect());
   const placed=[];towers.map(T=>{const x=T._x,y=T._y,w=T._w||(T._w=T.lbl.offsetWidth),h=T._h||(T._h=T.lbl.offsetHeight);return {T,r:{left:x-w/2,right:x+w/2,top:y-h,bottom:y}}})
   .sort((a,b)=>(b.T===selT)-(a.T===selT)||b.T.hq-a.T.hq||b.r.bottom-a.r.bottom)
   .forEach(o=>{const ov=(a,b)=>a.left<b.right+6&&a.right>b.left-6&&a.top<b.bottom+2&&a.bottom>b.top-2;const hit=placed.some(p=>ov(o.r,p))||ui.some(u=>ov(o.r,u))||o.r.left<4||o.r.right>VW()-4;
     if(hit&&hoverT!==o.T)o.T._op=0;else if(o.T._op>.1)placed.push(o.r)});
   towers.forEach(T=>{const s=String(Math.round(T._op*100)/100);if(T.lbl.style.opacity!==s)T.lbl.style.opacity=s})}
  if(!shown&&t>maxDelay+1.3){shown=true;countUp()}
  if(!reduce)pulses.forEach(P=>{P.t+=dt*P.v*P.dir;if(P.t>1)P.t=0;if(P.t<0)P.t=1;const[a,b]=P.s;P.sp.position.set(a[0]+(b[0]-a[0])*P.t,.03,a[1]+(b[1]-a[1])*P.t)});
  else pulses.forEach(P=>P.sp.visible=false);
  if(selT&&selT.figs){selT.figs.forEach(f=>{const s=f.base*((f===hiF||f===hovF)?1.6:1);f.g.scale.setScalar(f.g.scale.x+(s-f.g.scale.x)*Math.min(1,dt*8))});
    const hw=(selT.hq?2.5:1.8)/2+.25;(selT.fls||[]).forEach((e,k)=>{const S=selT.slabs[k];v.set(selT.x-hw,S.g.position.y,selT.z+S.x).project(cam);e.style.transform=`translate(${(v.x*.5+.5)*VW()}px,${(-v.y*.5+.5)*VH()}px) translate(-100%,-50%)`;e.style.opacity=String(Math.round(selT.open*100)/100)})}
  controls.update();renderer.render(scene,cam);raf=requestAnimationFrame(loop)}
loop();
cleanups.push(()=>{cancelAnimationFrame(raf);controls.dispose();if(actx)actx.close();scene.traverse(o=>{o.geometry&&o.geometry.dispose();const mm=o.material;(Array.isArray(mm)?mm:mm?[mm]:[]).forEach(x=>{x.map&&x.map.dispose();x.alphaMap&&x.alphaMap.dispose();x.dispose()})});pmrem.dispose();renderer.dispose()});


  return ()=>{cleanups.forEach(f=>f());timers.forEach(clearTimeout);root.innerHTML=''};
}

export default function CityScene({ data }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!data || !data.projects || !ref.current) return;
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
