# Patch in-app della città (27/09): inquadratura misurata + squadra dentro il palazzo selezionato.
HOME_OLD = "function homeFrame(){const m=VW()<=760;home.d=(m?52:(VW()<1100?32:25))*(1+(ROWS-3)*.22);home.t.set(m?.4:-7.5,m?.4:.9,m?0:0)}"
HOME_NEW = r'''function homeFrame(){const m=VW()<=760;
  // inquadratura MISURATA: tutta la città nello spazio a destra del testo, a qualunque larghezza
  const H=Math.max(...towers.map(T=>T.top));const pts=[];
  towers.forEach(T=>{const w=(T.hq?2.5:1.8)/2+.6,d=(T.hq?1.6:1.15)/2+.55;for(const x of[-w,w])for(const z of[-d,d])for(const y of[0,Math.max(T.top,T.ghostH||0,T.projH||0)+.5])pts.push(new THREE.Vector3(T.x+x,y,T.z+z))});
  const hr=$id('hero')?$id('hero').getBoundingClientRect():null,rr=root.getBoundingClientRect();
  const x0=hr&&hr.width?Math.min(.56,Math.max(.3,(hr.right-rr.left+28)/VW())):.4;let X=[x0*2-1,.88],Y=[-.8,.76];
  // telefono: il testo sta sotto, la città nello spazio libero sopra
  if(m){const y0=hr&&hr.height?1-2*Math.max(.3,Math.min(.8,(hr.top-rr.top-12)/VH())):-.1;X=[-.94,.94];Y=[y0,.72]}
  const save={p:cam.position.clone(),q:cam.quaternion.clone()};let d=30;const t=new THREE.Vector3(0,H*.3,0);
  const fwd=DIR.clone().negate(),right=new THREE.Vector3().crossVectors(fwd,new THREE.Vector3(0,1,0)).normalize(),up=new THREE.Vector3().crossVectors(right,fwd).normalize();
  const ext=()=>{cam.position.copy(t).add(DIR.clone().multiplyScalar(d));cam.lookAt(t);cam.updateMatrixWorld();let a=[1e9,-1e9,1e9,-1e9];pts.forEach(p=>{const q=p.clone().project(cam);a=[Math.min(a[0],q.x),Math.max(a[1],q.x),Math.min(a[2],q.y),Math.max(a[3],q.y)]});return a};
  for(let i=0;i<5;i++){let a=ext();d*=Math.max((a[1]-a[0])/(X[1]-X[0]),(a[3]-a[2])/(Y[1]-Y[0]));a=ext();const hh=d*Math.tan(THREE.MathUtils.degToRad(cam.fov/2)),hv=hh*cam.aspect;
    t.add(right.clone().multiplyScalar(-((X[0]+X[1])/2-(a[0]+a[1])/2)*hv)).add(up.clone().multiplyScalar(-((Y[0]+Y[1])/2-(a[2]+a[3])/2)*hh))}
  cam.position.copy(save.p);cam.quaternion.copy(save.q);cam.updateMatrixWorld();home.d=d;home.t.copy(t);if(typeof controls!=='undefined')controls.maxDistance=Math.max(controls.maxDistance,d*1.3)}'''

TEAM_BLOCK = r'''// ---------- la squadra dentro il palazzo (solo in app: dati da /ufficio) ----------
const OPEN=.4;const TEAMC={busy:0xFFB54A,none:0xCFC9BD,off:0x77736C};let OFFH=false;const GREY=new THREE.Color(0x4A4C55);const teamCache={};let hiF=null,hovF=null;
const figGeo={body:new THREE.CylinderGeometry(.034,.05,.13,14),head:new THREE.SphereGeometry(.042,16,12)};
const HQA2={};const DISP=n=>n==='Sales'||n==='Chatting'?'OnlyFans · '+n:n;
const presState=m=>m.presence&&m.presence.busy?'busy':OFFH?'off':'none';
const hm=ts=>new Date(ts).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'});
const rd=ts=>new Date(ts).toLocaleDateString('it-IT',{timeZone:'Europe/Rome'});const when=ts=>rd(ts)===rd(Date.now())?hm(ts):new Date(ts).toLocaleDateString('it-IT',{weekday:'short',timeZone:'Europe/Rome'})+' '+hm(ts);
const presText=m=>{const p=m.presence;if(!p)return 'Calendario non visibile';return p.busy?`In un impegno fino alle ${when(p.until)}`:OFFH?'Fuori orario':p.next?`Nessun impegno ora · prossimo ${when(p.next)}`:'Nessun impegno in calendario oggi'};
function makeFig(color){const g=new THREE.Group();const mat=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.6,roughness:.45,metalness:.1});
  const b=new THREE.Mesh(figGeo.body,mat);b.position.y=.065;const h=new THREE.Mesh(figGeo.head,mat);h.position.y=.17;b.castShadow=h.castShadow=true;g.add(b,h);g.visible=false;return {g,mat,hit:[b,h]}}
function slabFor(T,area){if(!area)return null;const n=T.hq&&HQA2[area]?HQA2[area]:area;return T.slabs.find(S=>S.a.n===n)||null}
function placeTeam(T,d){if(T.figs)return;T.figs=[];T.teamData=d;const by=new Map();const push=(S,f)=>{if(!by.has(S))by.set(S,[]);by.get(S).push(f)};
  if(!T.hq)d.members.forEach((m,i)=>{const f=makeFig(TEAMC[presState(m)]);f.m=m;f.idx=i;f.kind='team';push(slabFor(T,(m.areas||[])[0]),f)});
  const cs=slabFor(T,'Chatting');((T.data.onShift&&T.data.onShift.on)||[]).slice(0,10).forEach(c=>{const f=makeFig(0x9DB0D6);f.c=c;f.kind='chat';push(cs,f)});
  const w=T.hq?2.5:1.8,dd=T.hq?1.6:1.15,th=T.hq?.1:.08;
  by.forEach((list,S)=>list.forEach((f,i)=>{const per=S?8:9,cols=Math.min(list.length-Math.floor(i/per)*per,per),col=i%per,row=Math.floor(i/per);const x=(col-(cols-1)/2)*(w*.86/per);
    if(S){f.g.position.set(x,th/2+.004,dd*.5-.12-row*.22);S.g.add(f.g)}else{f.g.position.set(x,.12,dd/2+.38+row*.24);T.g.add(f.g)}
    f.base=f.kind==='chat'?1.05:1.45;f.g.scale.setScalar(f.base);f.hit.forEach(h=>h.userData.F=f);T.figs.push(f)}))}
function showTeam(T,on){(T.figs||[]).forEach(f=>f.g.visible=on);
  if(on&&!T.fls){T.fls=T.slabs.map(S=>{const e=document.createElement('div');e.className='tm-fl';const n=T.figs.filter(f=>f.g.parent===S.g).length;e.innerHTML=esc(DISP(S.a.n))+(n?'<span>'+n+'</span>':'');root.appendChild(e);return e})}
  (T.fls||[]).forEach(e=>e.style.display=on?'':'none')}
function hiFig(T,i){hiF=(T.figs||[]).find(f=>f.kind==='team'&&f.idx===i)||null}
async function loadTeam(T){const el=pb.querySelector('.team');if(!RAW.api||!el)return;
  try{let d=teamCache[T.data.n];if(!d){const r=await fetch(RAW.api+'/ufficio?t='+encodeURIComponent(T.data.n));d=await r.json();if(!r.ok)throw new Error(d.error||'errore');teamCache[T.data.n]=d}
    if(selT!==T)return;OFFH=!!(d.calendar&&d.calendar.offHours);placeTeam(T,d);showTeam(T,true);renderTeam(T,d,el)}catch(e){el.innerHTML=`<p class="tm-note">Squadra non disponibile: ${esc(e.message)}</p>`}}
function renderTeam(T,d,el){const off=(RAW.base||'')+'/admin/citta/ufficio?t='+encodeURIComponent(T.data.n);const cal=d.calendar&&d.calendar.configured&&!d.calendar.error;
  const busy=d.members.filter(m=>m.presence&&m.presence.busy).length,ch=d.chatters||[],under=ch.filter(c=>c.under).length;
  const ppl=d.members.map((m,i)=>`<button class="tm" data-i="${i}"><i class="${presState(m)}"></i><b>${esc(m.name||m.email)}</b><span>${esc(m.role||(m.areas||[]).join(', ')||'Ruolo da indicare')}</span>${cal&&!OFFH?`<small>${presText(m)}</small>`:''}</button>`).join('');
  el.innerHTML=`<div class="tm-h">Chi ci lavora<span>${d.members.length} nel team${cal?(OFFH?' · fuori orario':` · ${busy} in un impegno ora`):''}</span></div>${ppl||'<p class="tm-note">Nessuno assegnato in ClickUp.</p>'}`+
    (T.hq?'':`<div class="tm-h">In chat<span>${ch.length} con turni qui questo mese</span></div><p class="tm-note">Chi è in difficoltà lo trovi in «Da seguire», non qui: la città parla dei reparti, non delle singole persone.</p>`)+
    `<p class="tm-note">Le figure nel palazzo sono le persone, sul piano del reparto dove hanno più attività ClickUp${cal?'. Ambra = in un impegno adesso (Google Calendar); nessun impegno non vuol dire raggiungibile':''}. Sul piano Chatting, in azzurro, solo chi è in turno adesso.</p><div class="act"><a href="${off}">Apri l'ufficio →</a></div>`;
  el.querySelectorAll('.tm').forEach(b=>{b.onmouseenter=()=>hiFig(T,+b.dataset.i);b.onmouseleave=()=>{hiF=null};b.onfocus=b.onmouseenter;b.onblur=b.onmouseleave})}
const tipEl=document.createElement('div');tipEl.className='tm-tip';root.appendChild(tipEl);
let tipPinned=false;
function pinFig(f,e){const T=selT;if(!T||f.kind!=='team')return;const S=T.slabs.find(x=>x.g===f.g.parent);const ctx=T.data.n+(S?' · '+DISP(S.a.n)+': '+(S.a.short||S.a.l||''):'');const r=root.getBoundingClientRect();const m=f.m;
  const mail=m.email?'mailto:'+m.email+'?subject='+encodeURIComponent('HOC · '+ctx.slice(0,80))+'&body='+encodeURIComponent('Ciao '+(m.name||'').split(' ')[0]+',\n\n'+ctx+'\n\n'):null;
  const cal=m.email?'https://calendar.google.com/calendar/u/0/r/eventedit?add='+encodeURIComponent(m.email)+'&text='+encodeURIComponent('HOC · '+T.data.n+(S?' · '+DISP(S.a.n):''))+'&details='+encodeURIComponent(ctx):null;
  tipEl.innerHTML=`<b>${esc(m.name||m.email)}</b><span>${esc(m.role||(m.areas||[]).join(', ')||'Ruolo da indicare')}</span><small>${presText(m)}</small><span class="tm-acts">${mail?`<a href="${mail}">Scrivi</a>`:''}${cal?`<a href="${cal}" target="_blank" rel="noopener">Fissa una call</a>`:''}</span>`;
  tipEl.style.transform=`translate(${Math.min(e.clientX-r.left+14,r.width-270)}px,${e.clientY-r.top+14}px)`;tipEl.style.opacity=1;tipEl.classList.add('pin');tipPinned=true}
function unpin(){tipPinned=false;tipEl.classList.remove('pin');tipEl.style.opacity=0}
on(cv,'pointerdown',()=>{if(tipPinned)unpin()});
on(cv,'pointerup',e=>{const f=figAt(e);if(f)pinFig(f,e)});
function figAt(e){if(!selT||!selT.figs)return null;mouse.set(...toXY(e));ray.setFromCamera(mouse,cam);const h=ray.intersectObjects(selT.figs.filter(f=>f.g.visible).flatMap(f=>f.hit))[0];return h?h.object.userData.F:null}
on(cv,'pointermove',e=>{if(tipPinned)return;const f=figAt(e);hovF=f;if(!f){tipEl.style.opacity=0;return}cv.style.cursor='pointer';const r=root.getBoundingClientRect();
  tipEl.innerHTML=f.kind==='team'?`<b>${esc(f.m.name||f.m.email)}</b><span>${esc(f.m.role||(f.m.areas||[]).join(', ')||'Ruolo da indicare')}</span><small>${presText(f.m)}</small>`:`<b>${esc(f.c.name)}</b><span>In turno fino alle ${hm(f.c.until)}</span>`;
  tipEl.style.transform=`translate(${Math.min(e.clientX-r.left+14,r.width-270)}px,${e.clientY-r.top+14}px)`;tipEl.style.opacity=1});

'''

TEAM_CSS = r'''
.ct .tm-tip.pin{pointer-events:auto}.ct .tm-tip .tm-acts{display:flex;gap:10px;margin-top:6px}.ct .tm-tip .tm-acts a{color:#E8CB8A;text-decoration:none;font-size:12.5px}
.ct .tl .sn{display:none}@media (max-width:760px){.ct .tl .fn{display:none}.ct .tl .sn{display:inline}}
.ct .tl .dots{display:none}
.ct .tm-fl b.st{font-weight:500;font-size:11px;margin-left:6px}.ct .tm-fl b.st.wait{color:#FFB54A}.ct .tm-fl b.st.stop{color:rgba(242,238,230,.5)}.ct .tm-fl b.st.est{font-style:italic;opacity:.75}
.ct .top5 em.own{display:block;font-style:normal;font-size:11.5px;color:rgba(242,238,230,.5);margin-top:2px}
@media (max-width:760px){.ct #line{display:none}.ct #since{display:none}.ct .top5 button>span,.ct .top5 em.own{display:none}.ct .top5 button{padding:6px 0}}
.ct .tm-fl em{font-style:normal;color:#E8CB8A;font-size:11px}
.ct .tm-fl{position:absolute;top:0;left:0;z-index:20;pointer-events:none;font-size:12px;letter-spacing:.04em;color:rgba(242,238,230,.72);white-space:nowrap;padding-right:6px;display:flex;gap:6px;align-items:baseline}.ct .tm-fl span{color:#E8CB8A;font-size:11px}
.ct .team{margin:2px 0 14px}
.ct .tm-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin:14px 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(242,238,230,.5)}
.ct .tm-h span{text-transform:none;letter-spacing:0;font-size:12px}
.ct .tm{display:grid;grid-template-columns:10px 1fr;column-gap:10px;row-gap:1px;width:100%;text-align:left;background:none;border:0;border-top:1px solid rgba(242,238,230,.08);padding:8px 0;color:inherit;cursor:default;font:inherit}
.ct .tm i{width:8px;height:8px;border-radius:99px;margin-top:6px;grid-row:span 3}
.ct .tm i.busy{background:#FFB54A}.ct .tm i.none{border:1px solid rgba(242,238,230,.45)}.ct .tm i.off{border:1px dashed rgba(242,238,230,.3)}
.ct .tm b{font-weight:500;font-size:14px;color:#F2EEE6}.ct .tm span{font-size:12.5px;color:rgba(242,238,230,.6)}.ct .tm small{font-size:12px;color:rgba(242,238,230,.48)}
.ct .tm:hover b,.ct .tm:focus b{color:#E8CB8A}
.ct .tm-note{font-size:12.5px;color:rgba(242,238,230,.55);margin:4px 0 10px;line-height:1.5}.ct .tm-note em{font-style:normal;color:#FFB54A}
.ct .tm-tip{position:absolute;top:0;left:0;z-index:40;pointer-events:none;opacity:0;transition:opacity .15s;background:rgba(22,23,29,.94);border:1px solid rgba(242,238,230,.14);border-radius:10px;padding:8px 11px;display:flex;flex-direction:column;gap:2px;font-size:12.5px;color:#F2EEE6;max-width:260px}
.ct .tm-tip b{font-weight:500}.ct .tm-tip span{color:rgba(242,238,230,.65)}.ct .tm-tip small{color:rgba(242,238,230,.5)}
'''

def patch_body(body):
    a='<span>aree in ritardo</span>';b='<span>segnali in ritardo</span>'
    assert a in body; body=body.replace(a,b,1)
    a='<span>aree ferme</span>';b='<span>stime ClickUp da verificare</span>'
    assert a in body; body=body.replace(a,b,1)
    a='alto quanto il suo venduto del mese;';b='alto quanto il suo venduto del mese (cornice dorata: il mese scorso allo stesso giorno; tratteggiata: dove arriverà a fine mese al ritmo attuale);'
    assert a in body; return body.replace(a,b,1)

def apply(R, js_getter):
    # FASE 2 — il tempo (27/09): altezza proporzionale al venduto (prima radice quadrata: 147k e 13k sembravano uguali),
    # scala comune col mese scorso; sagoma dorata del mese scorso intero; striscia "dalla tua ultima visita"
    R("nospace:!!p.nospace,sales:p.sales||0}));", "nospace:!!p.nospace,sales:p.sales||0,salesPrev:p.salesPrev||0}));")
    R("const MAXS=Math.max(1,...RAW.projects.map(p=>p.sales||0));", "const MAXS=Math.max(1,...RAW.projects.map(p=>Math.max(p.sales||0,p.projection||0,RAW.live&&!RAW.live.past?(p.salesPrevToDate||p.salesPrev||0):0)));")
    R(".3+.42*Math.sqrt((data.sales||0)/MAXS)", ".14+.8*((data.sales||0)/MAXS)")
    R("  T.top=.34+(n-1)*gap+.2;", "  T.top=.34+(n-1)*gap+.2;\n  if(RAW.live&&!RAW.live.past&&!isHQ&&data.salesPrev>0){const gp=.14+.8*((data.salesPrevToDate||data.salesPrev)/MAXS),H=.34+(n-1)*gp+.2;const gb=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w+.34,H,d+.3)),new THREE.LineBasicMaterial({color:0xE8C27A,transparent:true,opacity:.55,depthWrite:false}));gb.position.y=H/2;T.g.add(gb);T.ghost=gb;T.ghostH=H}")
    R("const topY=T.slabs[0].g.position.y+.2;", "if(T.ghost)T.ghost.material.opacity=selT?(selT===T?.7:.05):(filter?.12:.55);if(T.proj)T.proj.material.opacity=selT?(selT===T?.6:.03):(filter?.08:.35);const topY=T.slabs[0].g.position.y+.2;")
    R("h=`Dal ${dd(s.base)}:", "h=`${s.mode==='visit'?'Dalla tua ultima visita, il '+dd(s.base):'Dal '+dd(s.base)}:")
    # piani = aree ufficiali del playbook (27/09): HR & People, Finance, Media Buying, Marketing, OnlyFans (Sales + Chatting)
    R("const AREAS=['HR','Finance','Deal','Sales','Chatting','Contenuti'];", "const AREAS=['HR & People','Finance','Media Buying','Marketing','Sales','Chatting'];")
    R("const HQMAP={HR:'Persone',Finance:'Finance',Deal:'Deal',Sales:'Sales',Chatting:'Chatting',Contenuti:'Social'};", "const HQMAP={'HR & People':'HR & People',Finance:'Finance','Media Buying':'Media Buying',Marketing:'Marketing',Sales:'Sales',Chatting:'Chatting'};")
    R('<i style="background:${COLc[a.s]}"></i><b>${esc(a.n)}</b>', '<i style="background:${COLc[a.s]}"></i><b>${esc(DISP(a.n))}</b>')
    R("['Tutte',...AREAS].map((a,k)=>`<button data-k=\"${k-1}\" aria-pressed=\"${k===0}\">${a}</button>`)", "['Tutte',...AREAS].map((a,k)=>`<button data-k=\"${k-1}\" aria-pressed=\"${k===0}\">${a==='Sales'||a==='Chatting'?'OnlyFans · '+a:a}</button>`)")
    # lampeggia solo ciò che è tra le priorità misurate o peggiorato di recente (a.hot dal server)
    R("if(S.a.s==='wait'&&!reduce)pulse=", "if(S.a.s==='wait'&&S.a.hot&&!reduce)pulse=")
    # le stime ClickUp non sono luci: niente alone, colore spento verso il grigio (terreno non rilevato)
    R("if(S.a.s==='ok'||S.a.s==='wait'){S.sp.material.opacity", "if((S.a.s==='ok'||S.a.s==='wait')&&S.a.src!=='clickup'){S.sp.material.opacity")
    R("else S.coreMat.color.copy(COL[S.a.s]).multiplyScalar(dim<.5?.5:1);", "else S.coreMat.color.copy(S.a.src==='clickup'?COL[S.a.s].clone().lerp(GREY,.6):COL[S.a.s]).multiplyScalar(dim<.5?.5:1);")
    # puntini sotto il nome: pieno = misurato, anello = stima ClickUp
    R("b.innerHTML=`<b>${T.data.n}</b><span class=\"dots\">${T.data.areas.map(a=>`<i style=\"background:${COLc[a.s]}\"></i>`).join('')}</span>`;", "b.innerHTML=`<b>${T.data.n}</b><span class=\"dots\">${T.data.areas.map(a=>a.src==='clickup'?`<i style=\"background:transparent;box-shadow:inset 0 0 0 1px ${COLc[a.s]==='transparent'?'rgba(242,238,230,.3)':COLc[a.s]}\"></i>`:`<i style=\"background:${COLc[a.s]}\"></i>`).join('')}</span>`;")
    # contatori: segnali misurati in ritardo / stime ClickUp da verificare
    R("['s2',towers.reduce((a,T)=>a+T.data.areas.filter(x=>x.s==='wait').length,0)]", "['s2',towers.reduce((a,T)=>a+T.data.areas.filter(x=>x.s==='wait'&&x.src!=='clickup').length,0)]")
    R("['s3',towers.reduce((a,T)=>a+T.data.areas.filter(x=>x.s==='stop').length,0)]", "['s3',towers.reduce((a,T)=>a+T.data.areas.filter(x=>(x.s==='wait'||x.s==='stop')&&x.src==='clickup').length,0)]")
    # vicino al palazzo scelto: le persone devono leggersi (prima 15.5 = palazzo minuscolo)
    R("const sheet=VW()<=900,d=sheet?20:15.5;const c=new THREE.Vector3(T.x,T.top*.5,T.z);", "const sheet=VW()<=900,d=sheet?18:13.5;const c=new THREE.Vector3(T.x,(T.top+(T.figs?(T.slabs.length-1)*OPEN:0))*.5,T.z);")
    # palazzo scelto con la squadra: i piani si aprono in verticale, così le persone si vedono
    R("const focusT=selT?selT===T:true;", "const focusT=selT?selT===T:true;T.open=(T.open||0)+(((selT===T&&T.figs)?1:0)-(T.open||0))*Math.min(1,dt*3);")
    R("S.g.position.set(0,S.base+(1-e)*7,S.x);", "S.g.position.set(0,S.base+(1-e)*7+T.open*(T.slabs.length-1-S.k)*OPEN,S.x);")
    R(HOME_OLD, HOME_NEW)
    R("// camera\nconst DIR=", TEAM_BLOCK.replace("// ---------- la squadra", "// ---------- la squadra", 1) + "// camera\nconst DIR=")
    R("panel.classList.add('on');$id('hero').style.opacity=0;chips.classList.add('hide')}",
      "panel.classList.add('on');$id('hero').style.opacity=0;chips.classList.add('hide');hiF=null;towers.forEach(X=>{if(X!==T)showTeam(X,false)});loadTeam(T)}")
    R("function deselect(){selT=null;", "function deselect(){if(selT)showTeam(selT,false);hiF=null;tipEl.style.opacity=0;selT=null;")
    R("else if(selT)deselect()", "else if(selT&&!figAt(e))deselect()")
    R("controls.update();renderer.render(scene,cam);raf=",
      r"""if(selT&&selT.figs){selT.figs.forEach(f=>{const s=f.base*((f===hiF||f===hovF)?1.6:1);f.g.scale.setScalar(f.g.scale.x+(s-f.g.scale.x)*Math.min(1,dt*8))});
    const hw=(selT.hq?2.5:1.8)/2+.25;(selT.fls||[]).forEach((e,k)=>{const S=selT.slabs[k];v.set(selT.x-hw,S.g.position.y,selT.z+S.x).project(cam);e.style.transform=`translate(${(v.x*.5+.5)*VW()}px,${(-v.y*.5+.5)*VH()}px) translate(-100%,-50%)`;e.style.opacity=String(Math.round(selT.open*100)/100)})}
  controls.update();renderer.render(scene,cam);raf=""")
    # FASE 3 — responsabilità (27/09): "i miei palazzi", responsabile nel pannello, Spark e presa in carico
    # sulle etichette dei piani, bandierina sui piani presi in carico, piani riaccesi nella striscia
    R("const focusT=selT?selT===T:true;T.open=", "const focusT=selT?selT===T:(RAW.mineOnly?(RAW.mineOnly.includes(T.data.n)||T.hq):true);T.open=")
    R("salesPrev:p.salesPrev||0}));", "salesPrev:p.salesPrev||0,salesPrevToDate:p.salesPrevToDate||0,custodian:p.custodian||null}));")
    R(r"""<p class="sum">${sum}</p>${RAW.api?'<div class="team">""", r"""<p class="sum">${sum}</p>${RAW.api&&!T.hq?(T.data.custodian?`<p class="tm-note">Responsabile: <b>${esc(T.data.custodian.name)}</b></p>`:'<p class="tm-note">Nessun responsabile: si sceglie nell&#39;ufficio.</p>'):''}${RAW.api?'<div class="team">""")
    R("e.innerHTML=esc(DISP(S.a.n))+(n?'<span>'+n+'</span>':'');", "const nn=T.hq&&T.teamData?T.teamData.members.filter(m=>(m.areas||[])[0]===S.a.n).length:n;const stt=(S.a.s==='wait'||S.a.s==='stop')?'<b class=\"st '+S.a.s+(S.a.src==='clickup'?' est':'')+'\">'+esc(S.a.short||'')+'</b>':'';const sp=T.figs.find(f=>f.kind==='team'&&(f.m.spark||[]).includes(S.a.n));e.innerHTML=esc(DISP(S.a.n))+(nn?'<span>'+nn+'</span>':'')+stt+(sp?'<em>Spark '+esc((sp.m.name||'').split(' ')[0])+'</em>':'')+(S.a.claim?'<em>in carico a '+esc(S.a.claim.by.split(' ')[0])+'</em>':'');")
    R("if((s.staleClaims||[]).length)", "if((s.relit||[]).length)h+=` <b class=\"g\">Riaccesi: ${s.relit.slice(0,3).map(esc).join(', ')}${s.relit.length>3?'…':''}</b>.`;if((s.staleClaims||[]).length)")
    R("// camera\nconst DIR=", "const flagMat=new THREE.MeshStandardMaterial({color:0xD9B46A,emissive:0xD9B46A,emissiveIntensity:.5,side:THREE.DoubleSide});\ntowers.forEach(T=>T.slabs.forEach(S=>{if(!S.a.claim)return;const w=T.hq?2.5:1.8,d=T.hq?1.6:1.15;const g=new THREE.Group();const pole=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.26,6),flagMat);pole.position.y=.13;const sh=new THREE.Shape();sh.moveTo(0,0);sh.lineTo(.16,-.045);sh.lineTo(0,-.09);const fl=new THREE.Mesh(new THREE.ShapeGeometry(sh),flagMat);fl.position.y=.26;g.add(pole,fl);g.position.set(w/2-.12,.05,d/2-.1);S.g.add(g)}));\n// camera\nconst DIR=")
    # FASE 4 — la vita (27/09): finestre accese = chatter in turno adesso (programma CP), strade = persone condivise
    R("custodian:p.custodian||null}));", "custodian:p.custodian||null,onShift:p.onShift||null}));")
    R(r"""${RAW.api?'<div class="team">""", r"""${T.data.onShift&&T.data.onShift.on&&T.data.onShift.on.length?`<p class="tm-note">In turno adesso (da programma): <b>${T.data.onShift.on.map(x=>esc(x.name)).join(', ')}</b>${T.data.onShift.soon?` · ${T.data.onShift.soon} iniziano entro 2 ore`:''}</p>`:(RAW.api&&!T.hq&&RAW.roads?'<p class="tm-note">Nessuno in turno adesso secondo il programma.</p>':'')}${(RAW.roads||[]).filter(r=>r.a===T.data.n||r.b===T.data.n).length?`<p class="tm-note">Persone in comune con: ${(RAW.roads||[]).filter(r=>r.a===T.data.n||r.b===T.data.n).slice(0,4).map(r=>`${esc(r.a===T.data.n?r.b:r.a)} (${r.names.map(esc).join(', ')})`).join(' · ')}</p>`:''}${RAW.api?'<div class="team">""")
    R("// camera\nconst DIR=", r"""const winMat=new THREE.MeshStandardMaterial({color:0xFFE2A8,emissive:0xFFD08A,emissiveIntensity:1.1});
towers.forEach(T=>{const on=(T.data.onShift&&T.data.onShift.on)||[];if(!on.length)return;const S=T.slabs.find(x=>x.a.n==='Chatting');if(!S)return;const w=T.hq?2.5:1.8,d=T.hq?1.6:1.15,n=Math.min(on.length,10);for(let i=0;i<n;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.07,.045,.012),winMat);m.position.set((i-(n-1)/2)*(w*.8/10),0,d/2+.012);S.g.add(m)}});
const roadObjs=[];{const byN=new Map(towers.map(T=>[T.data.n,T]));(RAW.roads||[]).forEach(r=>{const A=byN.get(r.a),B=byN.get(r.b);if(!A||!B)return;const p0=new THREE.Vector3(A.x,.06,A.z),p2=new THREE.Vector3(B.x,.06,B.z),p1=p0.clone().add(p2).multiplyScalar(.5);p1.y=.35+.06*Math.min(r.n,8);const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0,p1,p2),40,.005+.004*Math.min(r.n,6),6,false),new THREE.MeshBasicMaterial({color:0xD9B46A,transparent:true,opacity:.2,depthWrite:false}));scene.add(tube);roadObjs.push({tube,A,B})})}
// camera
const DIR=""")
    R("  controls.update();renderer.render(scene,cam);raf=", "  roadObjs.forEach(o=>{const t=selT?(o.A===selT||o.B===selT?.65:.02):(filter?.05:.2);o.tube.material.opacity+=(t-o.tube.material.opacity)*Math.min(1,dt*5)});\n  controls.update();renderer.render(scene,cam);raf=")

    # GIRO 2 dei visionari (27/09 notte): "Da guardare" collegata alla mappa e con chi la segue
    R("<i>${esc(x.area)}</i><b>${esc(x.tower)}</b><span>${esc(x.text)}</span></button>", "<i>${esc((x.areas||[x.area]).map(a=>a==='Sales'||a==='Chatting'?'OnlyFans · '+a:a).join(' · '))}</i><b>${esc(x.tower)}</b><span>${esc(x.text)}</span><em class=\"own\">${x.claim?'in carico a '+esc(x.claim.by.split(' ')[0]):(x.openHours!=null?'nessuno la segue'+(x.openHours>=1?' da '+(x.openHours<48?x.openHours+' ore':Math.floor(x.openHours/24)+' giorni'):''):'')}</em></button>")
    R("el.querySelectorAll('button').forEach(b=>b.onclick=()=>{", "el.querySelectorAll('button').forEach(b=>{b.onmouseenter=()=>{hoverT=towers.find(t=>t.data.n===b.dataset.t)||null};b.onmouseleave=()=>{hoverT=null}});el.querySelectorAll('button').forEach(b=>b.onclick=()=>{")

    # GIRO 3 (28/09): previsione di fine mese (cornice tratteggiata) + nomi brevi al telefono
    R("custodian:p.custodian||null,onShift:p.onShift||null}));", "custodian:p.custodian||null,onShift:p.onShift||null,projection:p.projection||0}));")
    R("T.ghost=gb;T.ghostH=H}", "T.ghost=gb;T.ghostH=H}\n  if(RAW.live&&!RAW.live.past&&!isHQ&&data.projection>(data.sales||0)){const gp2=.14+.8*(data.projection/MAXS),H2=.34+(n-1)*gp2+.2;const pg=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w+.52,H2,d+.46)),new THREE.LineDashedMaterial({color:0x9DB0D6,dashSize:.12,gapSize:.09,transparent:true,opacity:.35,depthWrite:false}));pg.computeLineDistances();pg.position.y=H2/2;T.g.add(pg);T.proj=pg;T.projH=H2}")
    R(r"""${(RAW.roads||[]).filter(r=>r.a===T.data.n||r.b===T.data.n).length?""", r"""${T.data.projection&&!T.hq&&RAW.live&&!RAW.live.past?`<p class="tm-note">A questo ritmo chiude il mese a <b>$${Math.round(T.data.projection).toLocaleString('it-IT')}</b>${T.data.salesPrev?` (${T.data.projection>=T.data.salesPrev?'+':'−'}${Math.abs(Math.round((T.data.projection/T.data.salesPrev-1)*100))}% sul mese scorso)`:''}: stima con i turni ancora in programma, cornice tratteggiata.</p>`:''}${(RAW.roads||[]).filter(r=>r.a===T.data.n||r.b===T.data.n).length?""")
    R("b.innerHTML=`<b>${T.data.n}</b>", "b.innerHTML=`<b><span class=\"fn\">${T.data.n}</span><span class=\"sn\">${T.hq?T.data.n:T.data.n.split(' ').slice(-1)[0]}</span></b>")

    # 28/09: nell'app la scena parte dopo la barra laterale → le etichette vivono in coordinate
    # della scena, mentre getBoundingClientRect dà coordinate della finestra. Senza questa
    # conversione il controllo sovrapposizioni credeva i palazzi di sinistra sotto il testo e li spegneva.
    R("...(selT?[]:[$id('hero')])].map(e=>e.getBoundingClientRect());", "...(selT?[]:[$id('hero')])].map(e=>{const r=e.getBoundingClientRect(),o=root.getBoundingClientRect();return {left:r.left-o.left,right:r.right-o.left,top:r.top-o.top,bottom:r.bottom-o.top}});")
