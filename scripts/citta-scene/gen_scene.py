import re,json,sys
import os
HERE=os.path.dirname(os.path.abspath(__file__))
SRC=os.path.join(HERE,'template.html')
OUT=sys.argv[1]
t=open(SRC).read()
css=t[t.index('<style>')+7:t.index('</style>')]
js=t[t.index("const RAW=JSON.parse"):t.rindex('</script>')]
body=t[t.index('<div class="intro"'):t.index('<script id="data"')].strip()
def scope_sel(sel):
    sel=sel.strip()
    if sel==':root': return '.ct'
    if sel.startswith(':root') or sel in('*','html,body','html','body'): return None
    return '.ct '+sel
def scope_block(block):
    res=[]
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',block):
        sels=[x for x in (scope_sel(x) for x in m.group(1).split(',')) if x]
        if sels: res.append(','.join(sels)+'{'+m.group(2).replace('position:fixed','position:absolute')+'}')
    return '\n'.join(res)
parts=re.split(r'(@media[^{]+\{)',css);buf=scope_block(parts[0]);i=1
while i<len(parts):
    head=parts[i];rest=parts[i+1];depth=1;j=0
    while depth and j<len(rest):
        if rest[j]=='{':depth+=1
        elif rest[j]=='}':depth-=1
        j+=1
    if 'prefers-color-scheme' not in head: buf+='\n'+head+scope_block(rest[:j-1])+'}'
    buf+='\n'+scope_block(rest[j:]);i+=2
CSS='''.ct{position:fixed;top:0;right:0;bottom:0;left:248px;z-index:30;overflow:hidden;color:#F2EEE6;font-family:var(--f-sans),Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased;background:radial-gradient(120% 90% at 50% 40%,#1B1C22 0%,#08090C 72%)}
@media (max-width:899px){.ct{left:0;top:56px;bottom:72px}}
.ct *{box-sizing:border-box;font-family:inherit}
.ct em{font-family:inherit!important}
'''+buf
CSS=CSS.replace('"Instrument Serif",serif','var(--f-display),"Instrument Serif",Georgia,serif').replace('"Manrope",system-ui','var(--f-sans),Manrope,system-ui')
import sys as _s0; _s0.path.insert(0,HERE); import team_patch as _tp; CSS+=_tp.TEAM_CSS
def R(a,b):
    global js
    assert a in js, a[:80]
    js=js.replace(a,b)
R("const RAW=JSON.parse(document.getElementById('data').textContent);","")
R("document.querySelectorAll('.top,.chips')","root.querySelectorAll('.top,.chips')")
js=js.replace("document.getElementById(","$id(").replace("new THREE.OrbitControls(","new OrbitControls(")
js=js.replace("innerWidth","VW()").replace("innerHeight","VH()")
R("mouse.set(e.clientX/VW()*2-1,-e.clientY/VH()*2+1)","mouse.set(...toXY(e))")
R("setTimeout(()=>intro.classList.add('go'),120);setTimeout(()=>intro.classList.add('gone'),2200)","timers.push(setTimeout(()=>intro.classList.add('go'),120),setTimeout(()=>intro.classList.add('gone'),2200))")
R("addEventListener('resize',","on(window,'resize',")
R("document.addEventListener('keydown',","on(document,'keydown',")
js=js.replace("cv.addEventListener(","on(cv,")
R("controls.update();renderer.render(scene,cam);requestAnimationFrame(loop)}\nloop();","controls.update();renderer.render(scene,cam);raf=requestAnimationFrame(loop)}\nloop();\ncleanups.push(()=>{cancelAnimationFrame(raf);controls.dispose();if(actx)actx.close();scene.traverse(o=>{o.geometry&&o.geometry.dispose();const mm=o.material;(Array.isArray(mm)?mm:mm?[mm]:[]).forEach(x=>{x.map&&x.map.dispose();x.alphaMap&&x.alphaMap.dispose();x.dispose()})});pmrem.dispose();renderer.dispose()});")
R(r"""<h2>${T.data.n}</h2><p class="sum">${sum}</p>`""", r"""<h2>${T.data.n}</h2><p class="sum">${sum}</p>${RAW.api?'<div class="team"><p class="tm-note">Carico la squadra…</p></div>':''}`""")
import sys as _s; _s.path.insert(0,HERE)
import team_patch; team_patch.apply(R, None)
header='''  const cleanups=[],timers=[];let raf=0;
  const on=(el,ev,fn,opt)=>{el.addEventListener(ev,fn,opt);cleanups.push(()=>el.removeEventListener(ev,fn,opt))};
  const $id=(id)=>root.querySelector('#'+id);
  const VW=()=>root.clientWidth||1,VH=()=>root.clientHeight||1;
  const toXY=(e)=>{const r=root.getBoundingClientRect();return [(e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1]};
'''
body=_tp.patch_body(body)
fn="function mountCity(root,RAW,THREE,OrbitControls){\n"+header+"  root.innerHTML="+json.dumps(body)+";\n"+js+"\n  return ()=>{cleanups.forEach(f=>f());timers.forEach(clearTimeout);root.innerHTML=''};\n}\n"
comp='''"use client";

/**
 * La città (26/09/2026) — progetto di Nicholas: ogni palazzo è un progetto creator, ogni
 * piano un'area (HR, Finance, Deal, Sales, Chatting, Contenuti); al centro la sede
 * "Azienda". "Guarda un'area" la accende in tutta la città. Le aree sono STIMATE dal
 * titolo delle attività ClickUp (dichiarato in pagina) finché ClickUp non avrà un campo "Area".
 *
 * GENERATO dal suo prototipo (scripts/citta-scene/gen_scene.py): three.js caricato SOLO
 * qui (import dinamico); tutto il DOM vive dentro `root` (.ct) e si smonta all'uscita.
 */
/* eslint-disable */
import { useEffect, useRef } from "react";

const CSS = '''+json.dumps(CSS)+''';

'''+fn+'''
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
'''
open(OUT,'w').write(comp);print('ok')
