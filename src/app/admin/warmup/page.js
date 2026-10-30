"use client";

// Warm-up dei profili social (22/10/2026) — la «Warm-Up Console» della collega (Netlify + Supabase,
// poi spenta) portata dentro HOC Pro. Stesse regole, stessi testi: il motore è lib/warmup-plan.js.
// Cosa cambia rispetto a prima:
//  - il profilo È l'account di Account social (username, creator, telefono, email stanno lì una volta);
//  - si entra con l'account HOC Pro (ruolo Social), niente nomi e password a parte;
//  - le spunte si salvano una per una: due persone sullo stesso profilo non si cancellano il lavoro;
//  - cambiare la situazione (shadowban, sospeso, bannato) aggiorna anche lo stato in Account social.

import { PlanCard } from "@/components/piani/PlanView";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Check, ChevronRight, Flag, Pencil, Plus, Trash2, Undo2, UserRound, ExternalLink } from "lucide-react";
import { CP, FONTS, alpha } from "@/lib/brand";
import { PageHead, Notice, NUM, FilterChip, Tabs, Segmented, FilterBar } from "@/components/ds";
import {
  btn, btnPrimary, btnDanger, btnOk, btnSm, input, cardBox, eyebrow, muted, hint, TONE, statusColor,
  GroupLabel, SectionHead, Ring, Avatar, Chip, Dot, Seg, Fold, Bullets, TaskRow, TimerChip, TaskList, KV, Field,
  Metric2, Delta, ModalBox, Opt,
} from "@/components/warmup/ui";
import { GuideIG, GuideX } from "@/components/warmup/guide";
import XRefs from "@/components/warmup/xrefs";
import ClipRadar from "@/components/warmup/clip-radar";
import {
  DAY, PLATS, platOf, isX, keyOf, norm, todayKey, startOfDay, fmtDur, mmss, weekKey, weekLabel, lastWeeks,
  numFmt, delta, planFor, planForDate, visibleItems, dayProgress, tasksOn, adherence, hasArrears,
  opDay, realDay, pausedDays, isCooldown, cooldownDay, stateOf, stateInfo, undoableState, restoreState,
  ownerName, mine, urgenze, FL, ST, MS, SE, wfields, xGoal, IPROT, fillDefaults, applyState, openFlag,
  clearFlag, endCooldown, WINDOWS,
} from "@/lib/warmup-plan";
import { prefillFor, dailyPrefill, linkRange, publicAlerts, normalizeOfLink } from "@/lib/warmup-metrics-core";
import { pubKindOfTask, itemForTask, autoItemForTask } from "@/lib/editoriale-core";
import PublishDownload from "@/components/PublishDownload";
import MediaLightbox from "@/components/MediaLightbox";
import EditorialeView from "@/components/editoriale/EditorialeView";
import HeroHead, { BigNum } from "@/components/HeroHead";

const API = "/api/admin/warmup";
const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Operazione non riuscita");
  return d;
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const PLAT_KEY = "hoc:warmup:plat", TIMER_KEY = "hoc:warmup:timer";
const ACT_LABEL = { accesso: "Accesso", account: "Account", task: "Task", flag: "Segnalazione", traguardo: "Traguardo", utente: "Utente", profilo: "Profilo", dati: "Dati", stato: "Stato" };
const ddmm = (k) => new Date(startOfDay(k)).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.28, 0.56].forEach((off) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0, ctx.currentTime + off);
      g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + off + 0.02);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + off + 0.22);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + off); o.stop(ctx.currentTime + off + 0.24);
    });
  } catch {}
  try { navigator.vibrate?.([180, 90, 180]); } catch {}
}

// ── modulo nuovo profilo / modifica ─────────────────────────────────────────

function resizePfp(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"), S = 160; c.width = c.height = S;
        const m = Math.min(img.width, img.height);
        c.getContext("2d").drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
        resolve(c.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject; img.src = r.result;
    };
    r.onerror = reject; r.readAsDataURL(file);
  });
}

function ProfileForm({ edit, plat, preCreator, creators, devices, people, admin, accounts, onDone, onCancel }) {
  const px = edit ? isX(edit) : plat === "x";
  const [f, setF] = useState(() => ({
    username: edit ? edit.username : "", createdAt: edit ? edit.createdAt : todayKey(), displayName: edit?.displayName || "",
    creator: edit ? edit.creator : preCreator || "", bio: edit?.bio || "", pfpType: edit?.pfpType || "", device: edit?.device || "",
    deviceType: edit?.deviceType || "", email: edit?.email || "", birthDate: edit?.birthDate || "", owner: edit?.owner?.id || "", notes: edit?.notes || "",
    trackingLink: edit?.trackingLink ? "https://" + edit.trackingLink : "",
  }));
  const [pfp, setPfp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const lim = px ? 160 : 150;

  async function submit(e) {
    e.preventDefault();
    if (!f.username.trim()) { setErr("Serve almeno lo username"); return; }
    if (f.trackingLink.trim() && !normalizeOfLink(f.trackingLink)) { setErr("Il tracking link deve essere un link OnlyFans del tipo onlyfans.com/<pagina>/c<numero>"); return; }
    setBusy(true); setErr(null);
    const fields = { ...f, platform: px ? "x" : "ig" };
    if (pfp) fields.pfp = pfp;
    const own = people.find((p) => p.id === f.owner);
    try {
      if (edit) {
        delete fields.owner;
        await post({ action: "update", id: edit.id, fields, username: edit.username });
        if (admin && (edit.owner?.id || "") !== f.owner) {
          await post({ action: "meta", id: edit.id, patch: { owner: own ? { id: own.id, name: own.name } : null }, type: "profilo", username: edit.username, logs: [own ? "Responsabile: " + own.name : "Responsabile rimosso"] });
        }
        onDone(edit.id, "Modifiche salvate");
      } else {
        fields.owner = own ? { id: own.id, name: own.name } : null;
        // limiti per telefono (stessi avvisi della console di prima, nello storico del profilo)
        const logs = [];
        const dk = keyOf(f.device);
        if (dk) {
          const same = accounts.filter((x) => keyOf(x.device) === dk);
          if (same.some((x) => x.createdAt === f.createdAt)) logs.push("⚠ Un altro account è stato creato oggi sullo stesso device: il limite è 1 al giorno, 24 ore di distanza");
          if (same.length >= 3) logs.push("⚠ Questo device ha già 3 account: è il limite massimo");
          if (same.length >= 1) logs.push("⚠ Su questo device c'è già un altro account: ricordati 1 sola creazione al giorno e 24 ore di distanza");
        }
        const d = await post({ action: "create", fields, logs });
        onDone(d.id, logs.length ? "Registrato — controlla gli avvisi nello storico" : "Account registrato");
      }
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  const two = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "0 14px" };
  return (
    <div style={{ maxWidth: 760 }}>
      <h2 className="ds-sect" style={{ fontSize: 22, fontWeight: 500, margin: "0 0 4px" }}>{edit ? "Modifica account" : `Nuovo account ${PLATS[px ? "x" : "ig"].label}`}</h2>
      <p style={{ ...hint, fontSize: 14, margin: "0 0 14px" }}>{edit ? "Aggiorna i dati del profilo. Username, creator, telefono, email e note si aggiornano anche in Account social." : px ? "La data di creazione decide a che giorno della routine si trova l'account: il primo giorno è la checklist di setup." : "La data di creazione decide in che giorno del warm-up si trova l'account. Se l'account c'è già in Account social viene agganciato, altrimenti lo si crea lì."}</p>
      <form onSubmit={submit} style={cardBox}>
        {err && <Notice danger>{err}</Notice>}
        <div style={two}>
          <Field label={px ? "Handle X" : "Username Instagram"} hint={px ? "Uguale a quello di OnlyFans, senza parole esplicite" : "Mai solo nome e cognome del creator"}><input style={input} value={f.username} onChange={set("username")} autoCapitalize="none" autoCorrect="off" /></Field>
          <Field label="Data di creazione"><input style={input} type="date" value={f.createdAt} onChange={set("createdAt")} /></Field>
        </div>
        <div style={two}>
          <Field label="Nome visualizzato"><input style={input} value={f.displayName} onChange={set("displayName")} /></Field>
          <Field label="Creator" hint="È la cartella in cui finisce il profilo">
            <input style={input} list="wu-creators" value={f.creator} onChange={set("creator")} placeholder="scegli o scrivi un nome" />
            <datalist id="wu-creators">{creators.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
        <Field label="Bio" hint={<><span style={{ ...NUM, color: f.bio.length > lim ? CP.accentRed : undefined }}>{f.bio.length}/{lim}</span> · {px ? "corta, con un invito chiaro: il tracking link va in bio" : "prendi i dati dalla Creator, niente bio generiche"}</>}>
          <textarea style={{ ...input, minHeight: 80, resize: "vertical" }} maxLength={400} value={f.bio} onChange={set("bio")} placeholder={px ? "Bio corta con l'invito a passare su OnlyFans" : "Età · luogo o origine · interessi"} />
        </Field>
        <Field label="Foto profilo" hint={px ? "Niente contenuti espliciti nella foto profilo e nella copertina: è la prima cosa che X controlla." : "Solo SFW, alta risoluzione, una sola persona, nessun watermark. Mai riutilizzata da un altro account."}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {pfp ? <img src={pfp} alt="" style={{ width: 56, height: 56, borderRadius: "50%" }} /> : edit ? <Avatar a={edit} size={56} /> : <div style={{ width: 56, height: 56, borderRadius: "50%", background: CP.surfaceAlt }} />}
            <input type="file" accept="image/*" style={{ fontSize: 13.5, color: CP.textSecondary, maxWidth: 240 }} onChange={async (e) => { const file = e.target.files?.[0]; if (file) { try { setPfp(await resizePfp(file)); } catch { setErr("Foto non leggibile"); } } }} />
            {!px && (
              <select style={{ ...input, width: "auto" }} value={f.pfpType} onChange={set("pfpType")}>
                <option value="">Tipo di foto…</option><option value="cartoon">Cartoon / animata (migliore)</option><option value="reale">Foto reale SFW</option>
              </select>
            )}
          </div>
        </Field>
        {!px && (
          <div style={two}>
            <Field label="Device" hint="Il nome che usi tu · è lo stesso telefono di Account social">
              <input style={input} list="wu-devices" value={f.device} onChange={set("device")} placeholder="es. Device 1 oppure iPhone di Sara" />
              <datalist id="wu-devices">{devices.map((d) => <option key={d} value={d} />)}</datalist>
            </Field>
            <Field label="Tipo di telefono" hint="es. iPhone A2 · #1068 (vale per un telefono nuovo)"><input style={input} value={f.deviceType} onChange={set("deviceType")} /></Field>
          </div>
        )}
        <div style={two}>
          <Field label="Email dell'account"><input style={input} type="email" value={f.email} onChange={set("email")} autoCapitalize="none" /></Field>
          <Field label="Data di nascita impostata" hint="Deve rendere il titolare di almeno 25 anni"><input style={input} value={f.birthDate} onChange={set("birthDate")} /></Field>
        </div>
        {admin && (
          <Field label="Responsabile" hint="Chi segue questo profilo ogni giorno (compare chi ha già aperto il warm-up)">
            <select style={input} value={f.owner} onChange={set("owner")}>
              <option value="">— nessuno —</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Tracking link OnlyFans di questo account" hint={px ? "Quello in bio. Se lo lasci vuoto si usa quello che si legge dal profilo pubblico: clic, iscritti e ricavo arrivano da soli." : "Il link di tracciamento OnlyFans che porta il traffico di QUESTO account (anche se in bio c'è un dominio che ci rimanda): clic, iscritti e ricavo arrivano da soli."}>
          <input style={input} value={f.trackingLink} onChange={set("trackingLink")} placeholder="https://onlyfans.com/pagina/c123" autoCapitalize="none" autoCorrect="off" />
        </Field>
        <Field label="Note"><textarea style={{ ...input, minHeight: 64, resize: "vertical" }} value={f.notes} onChange={set("notes")} placeholder="Nicchia, branding, link assegnato dal PM…" /></Field>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" style={{ ...btnPrimary, flex: 1 }} disabled={busy}>{busy ? "Salvo…" : edit ? "Salva" : "Registra account"}</button>
          <button type="button" style={btn} onClick={onCancel}>Annulla</button>
        </div>
      </form>
      {px ? (
        <Fold title="Da avere pronto prima di pubblicare">
          <Bullets items={["Nome e handle uguali a OnlyFans, senza parole esplicite", "Premium attivo: senza, un post fa meno di 100 visualizzazioni", "Media segnati come sensibili prima del primo post esplicito", "Un solo tracking link di OnlyFans, in bio", "Post fissato con il teaser migliore e il link nel primo commento", "Watermark su tutto, 2FA attiva"]} />
        </Fold>
      ) : (
        <Fold title="Limiti da rispettare prima di creare">
          <Bullets items={["Massimo 1 creazione per device al giorno", "Minimo 24 ore tra la creazione di un account e l'altra sullo stesso telefono", "Massimo 3 account per device, 1 per creator", "Rotazione IP e proxy prima di ogni creazione, anche per il 2° e il 3° account sullo stesso telefono", "Mai username simili tra loro, foto profilo riutilizzate, bio copiate o password identiche", "Mai creare un account senza la task card"]} />
        </Fold>
      )}
    </div>
  );
}

// ── numeri pubblici letti in automatico (fase 1: Apify, ogni notte) ─────────

function PublicCard({ a, wk, label }) {
  const p = a.pub;
  const x = a.platform === "x";
  if (!p || !p.last) return (
    <div style={{ ...cardBox, background: CP.bgSunken }}>
      <div style={eyebrow}>Numeri pubblici · in automatico</div>
      <p style={{ ...hint, margin: "6px 0 0" }}>Ogni notte HOC Pro legge il profilo pubblico {x ? "su X" : "su Instagram"} (follower, post, visualizzazioni). La prima lettura di questo profilo arriva col prossimo giro.</p>
    </div>
  );
  const last = p.last;
  const when = new Date(p.lastAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const days = Object.keys(p.days || {}).sort();
  const lastDay = days[days.length - 1], weekAgo = days.find((d) => d >= days[Math.max(0, days.length - 8)]);
  const d7 = lastDay && weekAgo && weekAgo !== lastDay && p.days[lastDay].followers != null && p.days[weekAgo].followers != null ? p.days[lastDay].followers - p.days[weekAgo].followers : null;
  const w = p.weekly?.[wk];
  return (
    <div style={cardBox}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ ...eyebrow, flex: 1 }}>Numeri pubblici · in automatico</div>
        <span style={hint}>letto il {when}</span>
      </div>
      {last.notFound ? <Notice danger>Il profilo {a.username} non si trova {x ? "su X" : "su Instagram"}: nome utente cambiato, account chiuso o bannato? Controlla dal telefono, poi correggi il nome utente nei dati del profilo o cambia lo stato.</Notice>
        : last.error ? <Notice danger>Lettura non riuscita: {last.error}</Notice>
        : (
        <>
          {last.private && <Notice>Il profilo risulta privato: dal pubblico non si vedono post né visualizzazioni.</Notice>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
            <Metric2 value={numFmt(last.followers)} label="Follower adesso">{d7 != null && <div style={{ marginTop: 3 }}><Delta d={d7} /> <span style={{ ...hint, fontSize: 11.5 }}>in {days.length > 7 ? "7 giorni" : (days.length - 1) + " giorni"}</span></div>}</Metric2>
            <Metric2 value={numFmt(last.posts)} label="Post pubblicati in tutto" />
            {x && <Metric2 value={last.premium ? "Sì" : "No"} label="Premium" color={last.premium ? CP.accentGreen : CP.accentRed} />}
            {x && <Metric2 value={last.website && /onlyfans/i.test(last.website) ? "Sì" : last.website ? "Altro" : "No"} label="Link OnlyFans in bio" color={last.website && /onlyfans/i.test(last.website) ? CP.accentGreen : CP.attn} />}
            {!x && last.highlights != null && <Metric2 value={numFmt(last.highlights)} label="Storie in evidenza" />}
          </div>
          <ReachLine r={p.reach} x={x} />
          <LinkLine l={p.link} w={w} />
          <div style={{ ...eyebrow, margin: "14px 0 8px" }}>Settimana {label}</div>
          {!w || !w.published ? <p style={{ ...hint, margin: 0 }}>Nessun post di questa settimana visto dalle letture automatiche.</p> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
              <Metric2 value={w.published} label={x ? "Post pubblicati" : `Post pubblicati · ${w.reels} reel`} />
              <Metric2 value={numFmt(w.views)} label={x ? "Visualizzazioni totali" : "Visualizzazioni dei reel"} />
              <Metric2 value={numFmt(w.avgViews)} label="Media per post" color={x && w.avgViews != null ? (w.avgViews >= 600 ? CP.accentGreen : CP.accentRed) : undefined} />
              <Metric2 value={numFmt(w.likes)} label="Like" />
              <Metric2 value={numFmt(w.comments)} label="Commenti" />
              {w.followersDelta != null && <Metric2 value={(w.followersDelta > 0 ? "+" : "") + numFmt(w.followersDelta)} label={w.deltaPartial ? "Follower (da quando si legge)" : "Follower nella settimana"} />}
            </div>
          )}
        </>
      )}
      <p style={{ ...hint, margin: "10px 0 0" }}>Solo quello che vede chiunque apra il profilo. {x ? "" : "Visite al profilo e tocchi sul link li vede solo l'app: restano da segnare a mano. "}Le visualizzazioni di un post crescono nei giorni dopo: il numero di una settimana si assesta qualche giorno dopo la fine.</p>
    </div>
  );
}

// tracking link OnlyFans dell'account: clic, iscritti e ricavo dal magazzino dati
function LinkLine({ l, w }) {
  const box = { marginTop: 12, padding: "10px 12px", borderRadius: 10, border: `1px solid ${CP.borderSoft}`, background: CP.bgSunken, fontSize: 14 };
  if (!l) return <div style={box}><b style={{ fontWeight: 500 }}>Tracking link OnlyFans</b> · non impostato: aggiungilo nei dati del profilo e da domani arrivano da soli clic, iscritti e ricavo di questo account.</div>;
  if (l.missing) return <div style={box}><b style={{ fontWeight: 500 }}>Tracking link OnlyFans</b> · <span style={NUM}>{l.url}</span> non risulta tra i link delle creator HOC: controlla che sia giusto.</div>;
  const t = l.total || {};
  const money = (v) => (v == null ? "—" : "$" + Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }));
  return (
    <div style={box}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline", marginBottom: 8 }}>
        <b style={{ fontWeight: 500 }}>Tracking link OnlyFans</b>
        <span style={{ ...hint, ...NUM }}>{l.url}{l.name ? ` · «${l.name}»` : ""}{l.created ? ` · creato il ${new Date(l.created + "T12:00:00").toLocaleDateString("it-IT")}` : ""}{l.from === "bio" ? " · letto dalla bio" : ""}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
        <Metric2 value={numFmt(t.clicks)} label="Clic in tutto" sub={w?.linkClicks != null ? `${w.linkClicks} questa settimana` : null} />
        <Metric2 value={numFmt(t.subs)} label="Iscritti in tutto" sub={w?.linkSubs != null ? `${w.linkSubs} questa settimana` : null} />
        <Metric2 value={money(t.revenue)} label="Ricavo dal link" sub={w?.linkRevenue != null ? `${money(w.linkRevenue)} questa settimana` : null} />
      </div>
    </div>
  );
}

// copertura: visualizzazioni a un giorno di questi giorni contro quelle di prima (allarme shadowban)
function ReachLine({ r, x }) {
  if (!r) return null;
  const cosa = x ? "post" : "reel";
  if (r.status === "pochi_dati") return <p style={{ ...hint, margin: "12px 0 0" }}>Copertura: per confrontare le visualizzazioni servono almeno {3} {cosa} di questi giorni e {5} delle settimane prima letti a un giorno dalla pubblicazione (ora {r.nRecent} e {r.nBase}). Si riempie da solo con le letture notturne.</p>;
  const col = r.status === "crollo" ? CP.accentRed : r.status === "calo" ? CP.attn : CP.accentGreen;
  const txt = r.status === "crollo" ? "crollata" : r.status === "calo" ? "in calo" : "nella norma";
  return (
    <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, border: `1px solid ${alpha(col, "55")}`, background: alpha(col, "0d"), fontSize: 14 }}>
      <b style={{ fontWeight: 500, color: col }}>Copertura {txt}</b> · i {cosa} di questi giorni fanno <b style={{ fontWeight: 500, ...NUM }}>{numFmt(r.recentMedian)}</b> visualizzazioni a un giorno, contro <b style={{ fontWeight: 500, ...NUM }}>{numFmt(r.baseMedian)}</b> nelle settimane prima ({Math.round(r.ratio * 100)}%).
      {r.status === "crollo" && <span style={{ display: "block", marginTop: 4, color: CP.textSecondary }}>Con lo Stato dell&apos;account verde è il segno tipico dello shadowban: controllalo dal telefono.</span>}
    </div>
  );
}

// ── dati settimanali di un profilo ──────────────────────────────────────────

function WeeklyPane({ a, onSave }) {
  const W = a.weekly || {};
  const weeks = lastWeeks(13);
  const [wk, setWk] = useState(weeks[0].key);
  const curW = weeks.find((w) => w.key === wk) || weeks[0];
  const rec = W[wk] || {};
  const F = wfields(a);
  const [vals, setVals] = useState({});
  // settimana non ancora salvata: i campi vuoti si precompilano coi numeri letti dal profilo pubblico
  const auto = W[wk] ? {} : Object.fromEntries(Object.entries(prefillFor(a.platform, a.pub?.weekly?.[wk])).filter(([, v]) => v != null));
  useEffect(() => { setVals(Object.fromEntries(F.map((x) => [x.k, rec[x.k] != null ? String(rec[x.k]) : auto[x.k] != null ? String(auto[x.k]).replace(".", ",") : ""]))); }, [wk, a.id, a.pub?.lastAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const filled = Object.keys(W).sort().reverse();
  const prevKey = filled.find((k) => k < wk);
  const prev = prevKey ? W[prevKey] : null;
  const live = Object.fromEntries(F.map((x) => [x.k, x.num ? (vals[x.k] === "" || vals[x.k] == null ? "" : Number(String(vals[x.k]).replace(/[.\s]/g, "").replace(",", "."))) : vals[x.k]]));

  function submit(e) {
    e.preventDefault();
    const r = {};
    F.forEach((x) => {
      let v = String(vals[x.k] == null ? "" : vals[x.k]).trim();
      if (x.num) { v = v.replace(/[.\s]/g, "").replace(",", "."); r[x.k] = v === "" ? "" : isNaN(Number(v)) ? "" : Number(v); } else r[x.k] = v;
    });
    onSave(wk, r, curW.label, !W[wk]);
  }
  const two = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0 12px" };
  return (
    <>
      <PublicCard a={a} wk={wk} label={curW.label} />
      <form onSubmit={submit} style={cardBox}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}><div style={eyebrow}>Dati della settimana</div><div style={{ fontSize: 17, fontWeight: 500, marginTop: 2 }}>{curW.label}</div></div>
          <select style={{ ...input, width: "auto", fontSize: 14 }} value={wk} onChange={(e) => setWk(e.target.value)}>
            {weeks.map((w) => <option key={w.key} value={w.key}>{w.label}{W[w.key] ? " ✓" : ""}</option>)}
          </select>
        </div>
        <div style={two}>
          {F.filter((x) => x.num).map((x) => {
            const g = xGoal(x, live);
            return (
              <Field key={x.k} label={x.lab} hint={x.goalTxt || auto[x.k] != null ? <>{x.goalTxt && <span style={g == null ? undefined : { color: g ? CP.accentGreen : CP.accentRed, fontWeight: 500 }}>{x.goalTxt}{g == null ? "" : g ? " ✓" : " ✗"}</span>}{auto[x.k] != null && <span style={{ color: CP.accentSoftText }}>{x.goalTxt ? " · " : ""}dal profilo pubblico, controlla</span>}</> : null}>
                <input style={{ ...input, ...NUM }} inputMode={x.dec ? "decimal" : "numeric"} placeholder="0" value={vals[x.k] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [x.k]: e.target.value }))} />
              </Field>
            );
          })}
        </div>
        <div style={two}>
          {F.filter((x) => !x.num && !x.big).map((x) => (
            <Field key={x.k} label={x.lab}><input style={input} placeholder={x.ph || ""} value={vals[x.k] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [x.k]: e.target.value }))} /></Field>
          ))}
        </div>
        {F.filter((x) => x.big).map((x) => (
          <Field key={x.k} label={x.lab}><textarea style={{ ...input, minHeight: 70 }} placeholder={x.ph || ""} value={vals[x.k] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [x.k]: e.target.value }))} /></Field>
        ))}
        <button type="submit" style={{ ...btnPrimary, width: "100%" }}>{W[wk] ? "Aggiorna la settimana" : "Salva la settimana"}</button>
        {rec.by && <p style={{ ...hint, margin: "8px 0 0" }}>Ultimo aggiornamento: {rec.by} · {new Date(rec.ts).toLocaleDateString("it-IT")}</p>}
      </form>
      {prev && W[wk] && (
        <div style={cardBox}>
          <div style={{ ...eyebrow, marginBottom: 10 }}>Rispetto alla settimana precedente</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
            {F.filter((x) => x.num).map((x) => {
              const g = xGoal(x, rec);
              return <Metric2 key={x.k} value={numFmt(rec[x.k])} label={x.lab} color={g == null ? undefined : g ? CP.accentGreen : CP.accentRed}><div style={{ marginTop: 3 }}><Delta d={delta(rec[x.k], prev[x.k])} /></div></Metric2>;
            })}
          </div>
        </div>
      )}
      {filled.length ? (
        <div style={cardBox}>
          <div style={{ ...eyebrow, marginBottom: 8 }}>Storico settimanale</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13.5 }}>
              <thead><tr><th style={th}>Settimana</th>{F.filter((x) => x.num).map((x) => <th key={x.k} style={{ ...th, textAlign: "right" }}>{x.lab}</th>)}{F.filter((x) => !x.num && !x.big).map((x) => <th key={x.k} style={th}>{x.lab}</th>)}</tr></thead>
              <tbody>{filled.map((k) => { const r = W[k], w = weeks.find((x) => x.key === k); return (
                <tr key={k} style={k === wk ? { background: CP.accentSoft } : undefined}><td style={td}><b style={{ fontWeight: 500 }}>{w ? w.label : k}</b></td>
                  {F.filter((x) => x.num).map((x) => <td key={x.k} style={{ ...td, textAlign: "right", ...NUM }}>{numFmt(r[x.k])}</td>)}
                  {F.filter((x) => !x.num && !x.big).map((x) => <td key={x.k} style={td}>{r[x.k] || "—"}</td>)}</tr>); })}</tbody>
            </table>
          </div>
          {filled.some((k) => W[k].notes) && (
            <Fold title={(F.find((x) => x.big) || { lab: "Considerazioni" }).lab}>
              {filled.filter((k) => W[k].notes).map((k) => { const w = weeks.find((x) => x.key === k); return <p key={k} style={{ margin: "0 0 10px" }}><b style={{ fontWeight: 500 }}>{w ? w.label : k}</b><br />{W[k].notes}</p>; })}
            </Fold>
          )}
        </div>
      ) : (
        <div style={{ ...cardBox, textAlign: "center", padding: "26px 18px" }}><h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 500 }}>Ancora nessun dato</h3><p style={{ ...hint, margin: 0 }}>Compila i campi qui sopra alla fine di ogni settimana: la console calcola da sola le differenze e tiene lo storico.</p></div>
      )}
    </>
  );
}
const th = { padding: "7px 9px", borderBottom: `1px solid ${CP.border}`, color: CP.textMuted, fontWeight: 500, fontSize: 12, textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "7px 9px", borderBottom: `1px solid ${CP.borderSoft}`, verticalAlign: "top" };

// ── modale segnalazione ─────────────────────────────────────────────────────

function FlagModal({ a, onClose, onSave }) {
  const [type, setType] = useState(a.flag?.type || "");
  const [note, setNote] = useState(a.flag?.note || "");
  return (
    <ModalBox title="Segnalazione" sub={`${a.username} — scegli il tipo: la console applica il protocollo e avvia il conteggio.`} onClose={onClose}
      foot={<><button type="button" style={btn} onClick={onClose}>Annulla</button><button type="button" style={btnPrimary} disabled={!type} onClick={() => onSave(type, note)}>Apri segnalazione</button></>}>
      {Object.keys(FL(a)).map((k) => {
        const f = FL(a)[k];
        return <Opt key={k} checked={type === k} onChange={() => setType(k)} title={f.label} right={<Chip color={f.level === "rosso" ? CP.accentRed : CP.attn}>{f.level === "rosso" ? "Rosso" : "Arancione"}</Chip>} desc={f.desc} />;
      })}
      <Field label="Nota (opzionale)"><textarea style={{ ...input, minHeight: 64 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cosa dice il messaggio della piattaforma, quali post…" /></Field>
    </ModalBox>
  );
}

function OwnerModal({ a, people, accounts, onClose, onSave }) {
  const [cur, setCur] = useState(a.owner?.id || "");
  return (
    <ModalBox title={`Responsabile di ${a.username}`} sub="Chi segue questo profilo ogni giorno. Lo vede nella scheda del profilo e lo ritrova con il filtro «I miei». Compare chi ha già aperto il warm-up almeno una volta." onClose={onClose}
      foot={<><button type="button" style={btn} onClick={onClose}>Annulla</button><button type="button" style={btnPrimary} onClick={() => onSave(people.find((p) => p.id === cur) || null)}>Salva</button></>}>
      {people.map((p) => {
        const n = accounts.filter((x) => x.owner?.id === p.id).length;
        return <Opt key={p.id} checked={cur === p.id} onChange={() => setCur(p.id)} title={p.name} desc={n ? `segue già ${n} ${n === 1 ? "profilo" : "profili"}` : "nessun profilo assegnato"} />;
      })}
      <Opt checked={cur === ""} onChange={() => setCur("")} title="Nessun responsabile" desc="Il profilo resta senza nessuno che lo segue." />
    </ModalBox>
  );
}

function RenameModal({ old, onClose, onSave }) {
  const [v, setV] = useState(old);
  return (
    <ModalBox title="Rinomina cartella" sub="Il nuovo nome viene applicato a tutti i profili che contiene (anche in Account social)." onClose={onClose}
      foot={<><button type="button" style={btn} onClick={onClose}>Annulla</button><button type="button" style={btnPrimary} disabled={v.trim().length < 2} onClick={() => onSave(v.trim())}>Rinomina</button></>}>
      <Field label="Nome del creator"><input style={input} value={v} onChange={(e) => setV(e.target.value)} autoFocus /></Field>
    </ModalBox>
  );
}

// ── grafico piccolo, una serie ──────────────────────────────────────────────

// casella di un profilo dentro un'azione (vista «per azione» di Oggi): tutto il bottone si tocca
function ProfileCheck({ a, on, onToggle }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} title={on ? "Fatta: tocca per riaprire" : "Tocca per segnarla fatta"}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px 6px 6px", minHeight: 36, borderRadius: 10, border: `1px solid ${on ? alpha(CP.accentGreen, "66") : CP.border}`, background: on ? alpha(CP.accentGreen, "14") : CP.surface, color: on ? CP.textMuted : CP.textPrimary, cursor: "pointer", fontFamily: FONTS.body, fontSize: 13.5, flex: "0 0 auto" }}>
      <span style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${on ? CP.accentGreen : CP.borderStrong}`, background: on ? CP.accentGreen : "transparent", display: "grid", placeItems: "center" }}>
        {on && <Check size={14} strokeWidth={3} color={CP.surface} />}
      </span>
      <span style={{ textDecoration: on ? "line-through" : "none" }}>{a.username}</span>
    </button>
  );
}

// giorno locale come YYYY-MM-DD
const isoDay = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function LineChart({ title, pts }) {
  const vals = pts.map((p) => p.v).filter((v) => v != null);
  const last = [...pts].reverse().find((p) => p.v != null);
  const prev = [...pts].reverse().filter((p) => p.v != null)[1];
  const box = { background: CP.bgSunken, border: `1px solid ${CP.borderSoft}`, borderRadius: 12, padding: "12px 14px" };
  if (!vals.length) return <div style={box}><div style={{ fontSize: 13, color: CP.textSecondary }}>{title}</div><div style={{ ...hint, padding: "26px 0", textAlign: "center" }}>Nessun dato</div></div>;
  const W = 320, H = 96, pad = 6;
  const max = Math.max(...vals), min = Math.min(...vals);
  const span = max - min || Math.max(1, max || 1);
  const lo = min - span * 0.15, hi = max + span * 0.15;
  const x = (i) => pad + i * ((W - pad * 2) / Math.max(1, pts.length - 1));
  const y = (v) => H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2);
  const segs = []; let cur = [];
  pts.forEach((p, i) => { if (p.v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(p.v)]); });
  if (cur.length) segs.push(cur);
  const line = segs.map((sg) => "M" + sg.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L")).join(" ");
  const li = pts.indexOf(last);
  return (
    <div style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: CP.textSecondary }}>{title}</span>
        <span style={{ fontSize: 15, fontWeight: 500, ...NUM }}>{numFmt(last.v)} {prev && <Delta d={delta(last.v, prev.v)} />}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 96, display: "block" }} role="img" aria-label={title}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={pad + f * (H - pad * 2)} y2={pad + f * (H - pad * 2)} stroke={CP.borderSoft} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <path d={line} fill="none" stroke={CP.accent} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {pts.map((p, i) => p.v != null && <circle key={i} cx={x(i)} cy={y(p.v)} r={i === li ? 4 : 2.5} fill={i === li ? CP.accent : CP.surface} stroke={CP.accent} strokeWidth="1.5"><title>{p.label} · {numFmt(p.v)}</title></circle>)}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", ...hint, fontSize: 11.5, marginTop: 4 }}><span>{pts[0].label}</span><span>{pts[pts.length - 1].label}</span></div>
    </div>
  );
}

// ── pagina ──────────────────────────────────────────────────────────────────

const TABS = [["oggi", "Oggi"], ["acct", "Account"], ["dati", "Dati"], ["guide", "Guida"]];

export default function WarmupPage() {
  const pausedRef = useRef(false);
  const { data, error, mutate } = useSWR(API, fetcher, { refreshInterval: 30000, revalidateOnFocus: true, isPaused: () => pausedRef.current });
  const [plat, setPlatState] = useState("ig");
  const [tab, setTab] = useState("oggi");
  const [sel, setSel] = useState(null);
  const [folder, setFolder] = useState(null);
  const [pane, setPane] = useState("oggi");
  const [onlyMine, setOnlyMine] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(null); // { edit?: id, preCreator? }
  const [openWhy, setOpenWhy] = useState({});
  const [toastMsg, setToastMsg] = useState(null);
  const [mview, setMview] = useState(null); // { creator, files: [{id, kind}], idx } — foto del contenuto ingrandite
  const [net, setNet] = useState("ok");
  const [rpane, setRpane] = useState("pano");
  // periodo dell'andamento (29/10, Nicholas: «un giorno specifico o un arco di tempo specifico»)
  const [per, setPer] = useState("w8");
  const [perFrom, setPerFrom] = useState(() => isoDay(Date.now() - 6 * DAY));
  const [perTo, setPerTo] = useState(() => isoDay(Date.now()));
  const [panoCreator, setPanoCreator] = useState("");
  // Oggi: per profilo o per azione (29/10, pannello tester: con 10-20 profili la stessa lista si ripete ~340 righe)
  const [oggiVista, setOggiVistaState] = useState(null);
  const setOggiVista = (v) => { setOggiVistaState(v); try { localStorage.setItem("hoc:warmup:oggi-vista", v); } catch {} };
  useEffect(() => { try { const v = localStorage.getItem("hoc:warmup:oggi-vista"); if (v === "prof" || v === "azione") setOggiVistaState(v); } catch {} }, []);
  const [panoAcc, setPanoAcc] = useState("");
  const [wkAll, setWkAll] = useState(null);
  const [sortAll, setSortAll] = useState("views");
  const [flagDays, setFlagDays] = useState(30);
  const [timer, setTimerState] = useState(null);
  const [tick, setTick] = useState(Date.now());
  const [doneBar, setDoneBar] = useState(null);
  pausedRef.current = Boolean(modal || form);

  useEffect(() => {
    const p = ls.get(PLAT_KEY); if (p === "x" || p === "ig") setPlatState(p);
    try { const t = JSON.parse(ls.get(TIMER_KEY) || "null"); if (t && t.day === todayKey()) setTimerState(t); else ls.set(TIMER_KEY, null); } catch {}
    try { const v = JSON.parse(sessionStorage.getItem("hoc:warmup:view") || "null"); if (v) { if (v.tab) setTab(v.tab); if (v.folder) setFolder(v.folder); if (v.sel) { setSel(v.sel); setPane(v.pane || "oggi"); } } } catch {}
    // ?tab=contenuti (link dal vecchio /admin/editoriale e dai compiti di Oggi) vince sulla vista salvata
    try { const t = new URLSearchParams(window.location.search).get("tab"); if (t) { setTab(t); setSel(null); setForm(null); if (t === "contenuti") setPlatState("ig"); } } catch {}
  }, []);
  useEffect(() => { try { sessionStorage.setItem("hoc:warmup:view", JSON.stringify({ tab, sel, pane, folder })); } catch {} }, [tab, sel, pane, folder]);
  // l'indirizzo segue la scheda: ricaricando si resta dove si è (niente ?tab= vecchio)
  useEffect(() => { try { const u = new URL(window.location.href); const want = tab === "oggi" ? null : tab; if ((u.searchParams.get("tab") || null) !== want) { if (want) u.searchParams.set("tab", want); else u.searchParams.delete("tab"); window.history.replaceState(window.history.state, "", u.pathname + u.search); } } catch {} }, [tab]);
  // orologi delle segnalazioni ogni 30 s, il timer ogni secondo
  useEffect(() => { const t = setInterval(() => setTick(Date.now()), timer ? 1000 : 30000); return () => clearInterval(t); }, [timer]);

  const me = data?.me || {};
  const admin = Boolean(me.admin);
  const people = data?.people || [];
  const profiles = useMemo(() => (data?.profiles || []).map((p) => fillDefaults({ ...p, pfpV: p.updatedAt || p.addedAt || 0 })), [data]);
  const ACC = useMemo(() => profiles.filter((a) => !a.archived && platOf(a) === plat), [profiles, plat]);
  const archived = profiles.filter((a) => a.archived);
  const byId = (id) => profiles.find((a) => a.id === id);
  const isMine = (a) => mine(a, me.id);

  const toast = (m) => { setToastMsg(m); setTimeout(() => setToastMsg((x) => (x === m ? null : x)), 2800); };
  const setPlat = (v) => { if (v === plat) return; setPlatState(v); ls.set(PLAT_KEY, v); setSel(null); setFolder(null); setPane("oggi"); setOpenWhy({}); setForm(null); if (tab === "xrefs" || tab === "contenuti") setTab("oggi"); window.scrollTo(0, 0); };

  // ── scritture: prima sullo schermo, poi sul server, poi si rilegge ──
  const optimistic = (id, fn) => mutate((cur) => cur && { ...cur, profiles: cur.profiles.map((p) => { if (p.id !== id) return p; const c = structuredClone(p); fillDefaults(c); fn(c); return c; }) }, { revalidate: false });
  async function send(body, okMsg) {
    setNet("pending");
    try { await post(body); setNet("ok"); if (okMsg) toast(okMsg); }
    catch (e) { setNet("err"); toast(e.message); }
    finally { mutate(); }
  }
  function meta(a0, fn, keys, type, okMsg) {
    const c = structuredClone(a0);
    const logs = [].concat(fn(c) || []).filter(Boolean);
    const patch = pick(c, keys);
    optimistic(a0.id, (x) => Object.assign(x, patch));
    return send({ action: "meta", id: a0.id, patch, logs, type, username: a0.username }, okMsg);
  }

  function toggleTask(a, taskId, day) {
    const was = Boolean(a.progress?.[day]?.[taskId]);
    const item = visibleItems(a, planForDate(a, day)).find((x) => x.id === taskId);
    optimistic(a.id, (x) => { x.progress[day] = x.progress[day] || {}; if (was) delete x.progress[day][taskId]; else x.progress[day][taskId] = true; });
    if (timer && timer.acc === a.id && timer.task === taskId && !was) { setTimer(null); }
    const when = day === todayKey() ? "" : ` (arretrato del ${ddmm(day)})`;
    send({ action: "task", id: a.id, day, task: taskId, on: !was, logs: [(was ? "Riaperta" : "Completata") + ": " + (item ? item.t : taskId) + when], username: a.username });
  }

  // ── timer: uno alla volta; "count" = una sessione, "accum" = somma della giornata ──
  const setTimer = (t) => { setTimerState(t); ls.set(TIMER_KEY, t ? JSON.stringify(t) : null); };
  const elapsed = (t) => (t ? (Date.now() - t.startedAt) / 1000 : 0);
  const timerLeft = (t) => (t ? Math.max(0, t.target - t.base - elapsed(t)) : 0);
  const doneSec = (a, day, task) => (a.timers?.[day]?.[task]) || 0;
  function startTimer(a, item) {
    if (timer && !(timer.acc === a.id && timer.task === item.id)) stopTimer(true);
    const day = todayKey();
    setTimer({ acc: a.id, task: item.id, mode: item.timer.mode, label: item.t, target: item.timer.min * 60, base: item.timer.mode === "accum" ? doneSec(a, day, item.id) : 0, startedAt: Date.now(), day });
  }
  function stopTimer(silent) {
    if (!timer) return;
    const a = byId(timer.acc);
    if (a && timer.mode === "accum") {
      const sec = Math.min(timer.target, timer.base + elapsed(timer));
      const { day, task } = timer;
      optimistic(a.id, (x) => { x.timers[day] = x.timers[day] || {}; x.timers[day][task] = Math.round(sec); });
      send({ action: "timer", id: a.id, day, task, sec });
      if (!silent) toast("Timer in pausa: il tempo fatto è salvato");
    }
    setTimer(null);
  }
  async function finishTimer() {
    const t = timer; if (!t) return;
    setTimer(null); beep();
    const a = byId(t.acc);
    if (a) {
      optimistic(a.id, (x) => { x.timers[t.day] = x.timers[t.day] || {}; x.timers[t.day][t.task] = t.target; x.progress[t.day] = x.progress[t.day] || {}; x.progress[t.day][t.task] = true; });
      await post({ action: "timer", id: a.id, day: t.day, task: t.task, sec: t.target }).catch(() => {});
      if (!a.progress?.[t.day]?.[t.task]) await post({ action: "task", id: a.id, day: t.day, task: t.task, on: true, logs: ["Completata a tempo: " + t.label], username: a.username }).catch((e) => toast(e.message));
      mutate();
    }
    setDoneBar({ label: t.label, until: Date.now() + 9000 });
  }
  useEffect(() => { if (timer && timerLeft(timer) <= 0.5) finishTimer(); }, [tick, timer]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── azioni del profilo ──
  const STATE_KEYS = ["state", "stateSince", "stateSteps", "stateHistory", "pausedMs", "cooldownFrom", "milestones"];
  const FLAG_KEYS = ["flag", "flagHistory", "status", "pausedMs", "state", "stateSince", "stateSteps", "stateHistory", "monitorUntil", "cooldownFrom"];

  function changeState(a, to) {
    const from = stateOf(a);
    if (to === from) return;
    const apply = (cool) => meta(a, (c) => applyState(c, to, cool, me.name), STATE_KEYS, "stato", cool ? "Online · cooldown post-unban avviato" : "Stato: " + ST(a)[to].label);
    if (to === "online" && (from === "sospeso" || from === "bannato")) {
      setModal({ kind: "confirm", title: `Rimettere Online ${a.username}?`,
        body: "Se l'account è stato davvero recuperato da una sospensione o da un ban deve passare dal cooldown post-unban: 3–4 settimane senza reels e senza link. Se invece lo stato era stato messo per sbaglio, scegli «Era un errore»: torna subito operativo e il calendario non perde nulla.",
        ok: "Recuperato · avvia il cooldown", alt: "Era un errore", fn: () => apply(true),
        altFn: () => { const c = structuredClone(a); const txt = restoreState(c, true); if (!txt) apply(false); else meta(a, (x) => restoreState(x, true), STATE_KEYS, "stato", "Stato riportato a " + ST(c)[stateOf(c)].label); } });
      return;
    }
    if (to === "sospeso" || to === "bannato") {
      setModal({ kind: "confirm", danger: true, title: `Segnare come ${ST(a)[to].label.toLowerCase()}?`,
        body: "Il piano del giorno si ferma e il calendario del warm-up resta in pausa: quando l'account torna Online riprende dal giorno in cui si era fermato. Lo stato si aggiorna anche in Account social.",
        ok: `Sì, ${ST(a)[to].label.toLowerCase()}`, fn: () => apply(false) });
      return;
    }
    apply(false);
  }
  function undoState(a) {
    const prev = (a.stateHistory || [])[(a.stateHistory || []).length - 1];
    if (!prev) { toast("Non c'è nessun cambio di stato da annullare"); return; }
    setModal({ kind: "confirm", title: "Annullare il cambio di stato?",
      body: `Il profilo torna «${ST(a)[prev.from].label}» come prima del ${new Date(prev.at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}. Il calendario del warm-up riprende dal giorno giusto, senza contare le ore passate in questo stato.`,
      ok: "Sì, annulla", fn: () => meta(a, (c) => restoreState(c, true), STATE_KEYS, "stato", "Stato riportato a " + ST(a)[prev.from].label) });
  }
  function askEndCooldown(a) {
    const cd = cooldownDay(a), presto = cd < 21;
    setModal({ kind: "confirm", danger: presto, title: presto ? "Annullare il cooldown?" : "Chiudere il cooldown?",
      body: presto ? `Siamo al giorno ${cd}: il SOP chiede un minimo di 21 giorni, e accorciarlo su un account recuperato davvero significa rischiare un nuovo ban. Annullalo solo se era partito per sbaglio o se il management ti ha dato il via libera. Il profilo torna subito al piano normale del suo giorno.` : "Fallo con il via libera del management. L'account torna al piano normale e i link si reintroducono con cautela, con un dominio diverso.",
      ok: presto ? "Sì, era un errore" : "Chiudi il cooldown", fn: () => meta(a, (c) => endCooldown(c), ["cooldownFrom", "flag", "status"], "stato", presto ? "Cooldown annullato" : "Cooldown chiuso") });
  }
  function askClearFlag(a) {
    setModal({ kind: "confirm", title: "Rimettere in verde?",
      body: "L'account torna verde e riprende a pubblicare dal giorno dopo. Parte il monitoraggio di 48 ore: controlla lo Stato dell'account almeno due volte al giorno.",
      ok: "Rimetti in verde", fn: () => meta(a, (c) => clearFlag(c).logs, FLAG_KEYS, "flag", "Account di nuovo verde · monitoraggio 48h") });
  }
  const toggleMs = (a, id) => meta(a, (c) => { const mt = (MS(a).find((m) => m.id === id) || {}).t; c.milestones = { ...c.milestones }; if (c.milestones[id]) { delete c.milestones[id]; return "Traguardo rimosso: " + mt; } c.milestones[id] = true; return "Traguardo: " + mt; }, ["milestones"], "traguardo");
  const toggleFlagStep = (a, sid) => meta(a, (c) => { c.flag = { ...c.flag, steps: { ...(c.flag.steps || {}) } }; const was = c.flag.steps[sid]; if (was) delete c.flag.steps[sid]; else c.flag.steps[sid] = true; const st = (FL(a)[a.flag.type].steps.find((x) => x.id === sid) || {}).t || sid; return (was ? "Annullato" : "Eseguito") + " step: " + st; }, ["flag"], "flag");
  const toggleStateStep = (a, sid) => meta(a, (c) => { c.stateSteps = { ...(c.stateSteps || {}) }; const was = c.stateSteps[sid]; if (was) delete c.stateSteps[sid]; else c.stateSteps[sid] = true; const st = ((stateInfo(a).steps || []).find((x) => x.id === sid) || {}).t || sid; return (was ? "Annullato" : "Eseguito") + " step di stato: " + st; }, ["stateSteps"], "stato");
  function saveWeekly(a, wk, rec, label, isNew) {
    rec.by = me.name || "—"; rec.ts = Date.now();
    optimistic(a.id, (x) => { x.weekly = { ...x.weekly, [wk]: rec }; });
    send({ action: "meta", id: a.id, patch: { weekly: { [wk]: rec } }, logs: [(isNew ? "Dati della settimana inseriti" : "Dati della settimana aggiornati") + ` (${label})`], type: "dati", username: a.username }, isNew ? "Settimana salvata" : "Settimana aggiornata");
  }
  function saveOwner(a, p) {
    setModal(null);
    meta(a, (c) => { const prima = ownerName(c); c.owner = p ? { id: p.id, name: p.name } : null; return p ? "Responsabile: " + p.name : "Responsabile rimosso" + (prima ? ` (era ${prima})` : ""); }, ["owner"], "profilo", p ? "Assegnato a " + p.name : "Responsabile rimosso");
  }
  function askArchive(a) {
    setModal({ kind: "confirm", danger: true, title: `Eliminare ${a.username}?`,
      body: "Il profilo esce dagli elenchi, dalle cartelle e dai conteggi del warm-up. Resta nell'archivio in Admin con tutti i suoi dati: da lì lo puoi ripristinare o cancellare definitivamente. L'account in Account social non viene toccato.",
      ok: "Elimina", fn: () => { setSel(null); setPane("oggi"); optimistic(a.id, (x) => { x.archived = { at: Date.now(), by: me.name }; }); send({ action: "archive", id: a.id, username: a.username }, "Profilo in archivio"); } });
  }
  async function renameFolder(old, name) {
    setModal(null);
    const items = ACC.filter((a) => keyOf(a.creator) === keyOf(old));
    setNet("pending");
    try { for (const a of items) await post({ action: "update", id: a.id, fields: { creator: name }, username: a.username }); setNet("ok"); toast("Cartella rinominata"); setFolder(name); }
    catch (e) { setNet("err"); toast(e.message); }
    finally { mutate(); }
  }
  const openProfile = (id, p = "oggi") => { setTab("acct"); setSel(id); setPane(p); setOpenWhy({}); setForm(null); const a = byId(id); setFolder(a?.creator || null); window.scrollTo(0, 0); };

  // ── righe di task con timer ──
  // stato di una task su un profilo: fatta (anche in automatico), timer, contenuto in calendario
  function taskBits(a, item, done, day) {
    // spunta anche quando il contenuto di questa task è stato trovato sul profilo (pubblicato in automatico)
    const auto = !done[item.id] && pubKindOfTask(item.id) && !isX(a) ? autoItemForTask((a.ed?.[day] || []).map((x) => ({ ...x, slot: { profileId: a.id, date: day, time: x.time } })), a.id, day, item.id) : null;
    const on = Boolean(done[item.id] || auto);
    let timerEl = null;
    if (item.timer && day === todayKey()) {
      const run = timer && timer.acc === a.id && timer.task === item.id;
      const mins = Math.floor(doneSec(a, day, item.id) / 60);
      if (!on || run) timerEl = <TimerChip item={item} running={run} left={timerLeft(timer)} doneMin={mins} onStart={() => startTimer(a, item)} onPause={() => (item.timer.mode === "accum" ? stopTimer() : setTimer(null))} />;
      else if (mins > 0) timerEl = <div style={{ ...hint, marginTop: 4 }}>{mins} min col timer</div>;
    }
    return { on, timerEl, edEl: edLine(a, item.id, day, on) };
  }
  function taskRow(a, item, done, day) {
    const k = a.id + ":" + item.id;
    const { on, timerEl, edEl } = taskBits(a, item, done, day);
    return <TaskRow key={k} item={item} done={on} open={openWhy[k]} onToggle={() => toggleTask(a, item.id, day)} onWhy={() => setOpenWhy((o) => ({ ...o, [k]: !o[k] }))} timer={edEl ? <>{timerEl}{edEl}</> : timerEl} />;
  }
  // fila di anteprime del contenuto (tutte le foto del carosello, o il reel): un tocco le ingrandisce
  function edStrip(a, it, kind) {
    const ids = it.dl || [];
    if (!ids.length) return null;
    const files = ids.map((id) => ({ id, kind: kind === "reel" ? "video" : "photo", name: "" }));
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        {files.map((f, i) => (
          <button key={f.id} type="button" aria-label={`Apri ${i + 1}`} onClick={() => setMview({ creator: a.creator, files, idx: i })}
            style={{ position: "relative", width: 58, height: kind === "reel" ? 84 : 72, padding: 0, borderRadius: 8, overflow: "hidden", border: `1px solid ${CP.borderSoft}`, background: CP.surfaceAlt, cursor: "zoom-in" }}>
            <img src={`/api/admin/editoriale?creator=${encodeURIComponent(a.creator)}&thumb=${encodeURIComponent(f.id)}&v=2`} alt="" loading="lazy" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {files.length > 1 && <span style={{ position: "absolute", top: 3, left: 3, background: alpha(CP.bgSunken, "cc"), color: CP.textPrimary, borderRadius: 5, padding: "0 5px", fontSize: 10.5 }}>{i + 1}</span>}
          </button>
        ))}
      </div>
    );
  }
  // Editoriale: sotto «Pubblica il carosello / il reel» il contenuto in calendario quel giorno
  function edLine(a, taskId, day, done) {
    const kind = pubKindOfTask(taskId);
    if (!kind || isX(a) || !a.creator) return null;
    const list = (a.ed?.[day] || []).map((x) => ({ ...x, slot: { profileId: a.id, date: day, time: x.time } }));
    const it = itemForTask(list, a.id, day, taskId);
    const href = `/admin/warmup?tab=contenuti`;
    const goContent = (e) => { e.preventDefault(); setTab("contenuti"); setSel(null); window.scrollTo(0, 0); };
    if (!it) {
      if (done) return null;
      return <div style={{ ...hint, marginTop: 5 }}>Niente in calendario per oggi · <a href={href} onClick={goContent} style={{ color: CP.accentSoftText }}>preparalo in Contenuti</a></div>;
    }
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 7, padding: 8, borderRadius: 10, border: `1px solid ${CP.borderSoft}`, background: CP.bgSunken, maxWidth: 520 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
          <div style={{ color: CP.textPrimary }}>{kind === "carosello" ? "Carosello" : "Reel"} «{it.title}»{it.time ? ` · ${it.time}` : ""}{it.status === "pubblicato" ? " · pubblicato" : ""}{it.autoPub?.url && <> · <a href={it.autoPub.url} target="_blank" rel="noopener noreferrer" style={{ color: CP.accentSoftText }}>trovato sul profilo ↗</a></>}</div>
          <div style={{ ...hint, marginTop: 2 }}>{kind === "carosello" ? `${it.files} foto` : "video montato"}{it.sound ? ` · sound: ${it.sound}` : ""}{it.city ? ` · ${it.city}` : ""}</div>
          {edStrip(a, it, kind)}
          {it.caption && <div style={{ fontSize: 12.5, color: CP.textSecondary, marginTop: 4, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{it.caption}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
            {it.status !== "pubblicato" && <PublishDownload creator={a.creator} kind={kind} title={it.title} caption={it.caption} files={it.dl} style={{ ...btnSm, minHeight: 26, padding: "2px 8px", fontSize: 12 }} />}
            {it.caption && <button type="button" onClick={() => { try { navigator.clipboard.writeText(it.caption); toast("Didascalia copiata"); } catch {} }} style={{ ...btnSm, minHeight: 26, padding: "2px 8px", fontSize: 12 }}>Copia didascalia</button>}
            <a href={href} onClick={goContent} style={{ fontSize: 12.5, color: CP.accentSoftText, alignSelf: "center" }}>Apri in Contenuti</a>
          </div>
        </div>
      </div>
    );
  }
  // contenuti in calendario oggi che nessuna task del giorno copre (es. caroselli dopo il warm-up,
  // quando il piano li chiede a settimana): si vedono e si segnano pubblicati da qui
  function edExtra(a, day, items) {
    if (isX(a) || !a.creator || !a.ed?.[day]?.length) return null;
    const list = a.ed[day].map((x) => ({ ...x, slot: { profileId: a.id, date: day, time: x.time } }));
    const covered = new Set();
    for (const i of items) { if (!pubKindOfTask(i.id)) continue; const it = itemForTask(list, a.id, day, i.id); if (it) covered.add(it.id); }
    const rest = list.filter((x) => !covered.has(x.id)).sort((x, y) => String(x.time || "99").localeCompare(String(y.time || "99")));
    if (!rest.length) return null;
    const publish = async (it, on) => {
      try {
        const r = await fetch("/api/admin/editoriale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish", creator: a.creator, id: it.id, on, today: day }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Non riuscito");
        toast(on ? "Segnato pubblicato" : "Riaperto");
      } catch (e) { toast(e.message); } finally { mutate(); }
    };
    return (
      <div style={{ padding: "10px 14px", borderTop: `1px solid ${CP.borderSoft}` }}>
        <div style={{ ...hint, marginBottom: 6 }}>Anche in calendario oggi, da Contenuti</div>
        {rest.map((it) => {
          const pub = it.status === "pubblicato";
          return (
            <div key={it.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 140, fontSize: 13.5, textDecoration: pub ? "line-through" : "none", color: pub ? CP.textMuted : CP.textPrimary }}>{it.type === "carosello" ? "Carosello" : "Reel"} «{it.title}»{it.time ? ` · ${it.time}` : ""}</span>
              {!pub && <PublishDownload creator={a.creator} kind={it.type} title={it.title} caption={it.caption} files={it.dl} style={{ ...btnSm, minHeight: 26, padding: "2px 8px", fontSize: 12 }} label="Scarica" />}
              {it.caption && !pub && <button type="button" onClick={() => { try { navigator.clipboard.writeText(it.caption); toast("Didascalia copiata"); } catch {} }} style={{ ...btnSm, minHeight: 26, padding: "2px 8px", fontSize: 12 }}>Copia didascalia</button>}
              <button type="button" onClick={() => publish(it, !pub)} style={{ ...btnSm, minHeight: 26, padding: "2px 8px", fontSize: 12 }}>{pub ? "Riapri" : "Pubblicato"}</button>
              <div style={{ flexBasis: "100%" }}>{edStrip(a, it, it.type)}</div>
            </div>
          );
        })}
      </div>
    );
  }
  function stepRow(key, step, on, onToggle) {
    return <TaskRow key={key} item={{ t: step.t, why: step.w }} done={on} open={openWhy[key]} onToggle={onToggle} onWhy={() => setOpenWhy((o) => ({ ...o, [key]: !o[key] }))} />;
  }

  // ── viste ──
  const ownerTag = (a) => {
    const nm = ownerName(a);
    if (!nm) return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, ...muted }}><UserRound size={12} />Da assegnare</span>;
    return <span style={{ fontSize: 12.5, color: isMine(a) ? CP.accentSoftText : CP.textSecondary }}>{nm}{isMine(a) ? " · tu" : ""}</span>;
  };
  const mineSeg = () => (ACC.some((a) => a.owner) ? <Seg items={[["0", "Tutti"], ["1", `I miei${ACC.filter(isMine).length ? " · " + ACC.filter(isMine).length : ""}`]]} value={onlyMine ? "1" : "0"} onChange={(v) => setOnlyMine(v === "1")} /> : null);

  // Oggi «per azione»: una riga per azione, dentro i profili che la devono fare (con casella).
  // Si raggruppa per testo della task: la stessa azione ha lo stesso testo su tutti i profili.
  function viewByAction(blocks, tk) {
    const groups = new Map();
    for (const { a, t } of blocks) {
      for (const item of t.items) {
        const g = groups.get(item.t) || { item, rows: [] };
        g.rows.push({ a, item, done: t.done });
        groups.set(item.t, g);
      }
    }
    const all = [...groups.values()].map((g) => {
      const bits = g.rows.map((r) => ({ ...r, ...taskBits(r.a, r.item, r.done, tk) }));
      return { ...g, bits, open: bits.filter((b) => !b.on).length };
    });
    const req = all.filter((g) => !g.item.opt && g.open).sort((x, y) => y.open - x.open);
    const opt = all.filter((g) => g.item.opt && g.open);
    const doneAll = all.filter((g) => !g.open);
    const rich = (item) => Boolean(item.timer) || Boolean(pubKindOfTask(item.id));
    const card = (g) => {
      const k = "act:" + g.item.t;
      return (
        <div key={k} style={{ ...cardBox, padding: 0, marginBottom: 10, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, lineHeight: 1.4 }}>{g.item.t}{g.item.opt && <span style={{ ...muted, fontSize: 12.5 }}> · facoltativa</span>}</div>
              {openWhy[k] && g.item.why && <div style={{ fontSize: 13.5, color: CP.textSecondary, lineHeight: 1.55, marginTop: 6 }}>{g.item.why}</div>}
            </div>
            <span style={{ fontSize: 13, color: g.open ? CP.textSecondary : CP.accentGreen, whiteSpace: "nowrap", ...NUM }}>{g.open ? `${g.open} da fare su ${g.bits.length}` : "fatta ovunque"}</span>
            {g.item.why && <button type="button" onClick={() => setOpenWhy((o) => ({ ...o, [k]: !o[k] }))} aria-label="Perché" title="Perché" style={{ width: 28, height: 28, flex: "0 0 auto", borderRadius: "50%", border: `1px solid ${CP.borderSoft}`, background: CP.surfaceAlt, color: CP.textSecondary, cursor: "pointer", fontSize: 13 }}>{openWhy[k] ? "×" : "?"}</button>}
          </div>
          {rich(g.item) ? (
            g.bits.map((b) => (
              <div key={b.a.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", borderTop: `1px solid ${CP.borderSoft}`, background: b.on ? alpha(CP.accentGreen, "0d") : "transparent" }}>
                <ProfileCheck a={b.a} on={b.on} onToggle={() => toggleTask(b.a, b.item.id, tk)} />
                <div style={{ flex: 1, minWidth: 0 }}>{b.timerEl}{b.edEl}</div>
              </div>
            ))
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 14px", borderTop: `1px solid ${CP.borderSoft}` }}>
              {g.bits.map((b) => <ProfileCheck key={b.a.id} a={b.a} on={b.on} onToggle={() => toggleTask(b.a, b.item.id, tk)} />)}
            </div>
          )}
        </div>
      );
    };
    const extras = blocks.map(({ a, t }) => ({ a, el: edExtra(a, tk, t.items) })).filter((x) => x.el);
    return (
      <>
        <SectionHead aside={`${req.length} azioni · tocca un profilo per segnarla fatta`}>Da fare oggi</SectionHead>
        {req.length ? req.map(card) : <div style={{ ...cardBox, ...hint, textAlign: "center" }}>Le azioni obbligatorie di oggi sono fatte.</div>}
        {extras.length > 0 && (
          <>
            <SectionHead>Anche in calendario oggi</SectionHead>
            {extras.map((x) => <div key={x.a.id} style={{ ...cardBox, padding: 0, marginBottom: 10 }}><div style={{ padding: "10px 14px 0", fontSize: 14, fontWeight: 500 }}>{x.a.username}</div>{x.el}</div>)}
          </>
        )}
        {opt.length > 0 && <Fold title={`${opt.length} ${opt.length === 1 ? "azione facoltativa" : "azioni facoltative"}`}>{opt.map(card)}</Fold>}
        {doneAll.length > 0 && <Fold title={`${doneAll.length} ${doneAll.length === 1 ? "azione già fatta" : "azioni già fatte"} su tutti i profili`}>{doneAll.map(card)}</Fold>}
      </>
    );
  }

  function viewToday() {
    const tk = todayKey(), yk = todayKey(new Date(Date.now() - DAY));
    const anyOwner = ACC.some((a) => a.owner);
    const om = onlyMine && anyOwner;
    const accs = om ? ACC.filter(isMine) : ACC;
    let openTot = 0, doneTot = 0;
    const blocks = accs.map((a) => { const t = tasksOn(a, tk); openTot += t.open.length; doneTot += t.n; const arr = hasArrears(a, yk) ? tasksOn(a, yk) : { open: [], done: {} }; return { a, t, arr }; });
    const late = blocks.filter((b) => b.arr.open.length);
    const rankU = { bad: 0, warn: 1, ok: 2, flat: 3 };
    const urg = [...ACC.flatMap((a) => publicAlerts(a, a.pub).map((u) => ({ ...u, acc: a }))), ...urgenze(ACC)]
      .sort((x, y) => rankU[x.lev] - rankU[y.lev]).filter((u) => !om || isMine(u.acc));
    const todo = blocks.filter((b) => b.t.open.length), fine = blocks.filter((b) => !b.t.open.length);
    // di base: per azione da 4 profili in su, per profilo sotto (scelta ricordata per persona)
    const vista = oggiVista || (accs.length > 3 ? "azione" : "prof");
    return (
      <>
        {/* in cima, nello stile del Radar (29/10): la giornata in una frase e quattro numeri */}
        {ACC.length > 0 ? (
          <HeroHead
            eyebrow={new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase())}
            title={openTot ? "Oggi restano" : "Oggi è"} accent={openTot ? `${openTot} task` : "tutto fatto"}
            sub={`${accs.length} ${accs.length === 1 ? "profilo" : "profili"} ${PLATS[plat].label}${om ? " tuoi" : ""}. Spunta man mano: ogni task vale per il giorno in cui la fai.`}
            numbers={<>
              <BigNum label="Profili da finire" value={todo.length} strong={todo.length > 0} />
              <BigNum label="Task fatte" value={doneTot} />
              <BigNum label="Da non dimenticare" value={urg.length} title="Avvisi trovati dal sistema: profili da controllare, scadenze" />
              {late.length > 0 && <BigNum label="Rimaste ieri" value={late.reduce((n, b) => n + b.arr.open.length, 0)} />}
            </>}
            actions={(mineSeg() || accs.length > 1) ? <>
              {mineSeg()}
              {accs.length > 1 && <Segmented label="Vista" items={[["azione", "Per azione"], ["prof", "Per profilo"]]} value={vista} onChange={setOggiVista} />}
            </> : null} />
        ) : null}
        {/* il piano di lavoro in corso (30/10): le prossime voci di chi apre la pagina */}
        <PlanCard area="social" />
        {!ACC.length && <div style={{ ...cardBox, textAlign: "center", padding: "30px 18px" }}><h3 style={{ margin: "0 0 6px", fontWeight: 500 }}>Nessun profilo {PLATS[plat].label}</h3><p style={{ ...hint, margin: "0 0 14px" }}>Registra il primo profilo dalla scheda Account.</p><button type="button" style={btnPrimary} onClick={() => { setTab("acct"); setForm({}); }}><Plus size={15} />Nuovo profilo</button></div>}
        {urg.length > 0 && (
          <>
            <SectionHead aside="trovate dal sistema, si aprono con un clic">Da non dimenticare</SectionHead>
            <TaskList>
              {urg.map((u, i) => (
                <button key={i} type="button" onClick={() => openProfile(u.acc.id)} style={{ display: "flex", gap: 12, alignItems: "flex-start", width: "100%", textAlign: "left", padding: "12px 14px", background: "transparent", border: "none", borderTop: i ? `1px solid ${CP.borderSoft}` : "none", cursor: "pointer", color: CP.textPrimary, fontFamily: FONTS.body }}>
                  <span style={{ marginTop: 7 }}><Dot color={TONE[u.lev]} size={9} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 15 }}>{u.t}</span><span style={{ display: "block", fontSize: 13.5, color: CP.textSecondary, marginTop: 3 }}>{u.d}</span></span>
                  <ChevronRight size={16} color={CP.textMuted} style={{ marginTop: 3 }} />
                </button>
              ))}
            </TaskList>
          </>
        )}
        {late.length > 0 && (
          <>
            <SectionHead aside="si possono ancora spuntare: valgono per ieri">Rimaste indietro ieri</SectionHead>
            {late.map((b) => (
              <details key={b.a.id} style={{ ...cardBox, padding: 0, marginBottom: 8 }}>
                <summary style={{ cursor: "pointer", padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", listStyle: "revert", fontSize: 14.5 }}>
                  <b style={{ fontWeight: 500 }}>{b.a.username}</b>
                  <span style={{ color: CP.accentRed, fontSize: 13.5 }}>{b.arr.open.length} non {b.arr.open.length === 1 ? "fatta" : "fatte"}</span>
                </summary>
                <div style={{ borderTop: `1px solid ${CP.borderSoft}` }}>{b.arr.open.map((i) => taskRow(b.a, i, b.arr.done, yk))}</div>
              </details>
            ))}
          </>
        )}
        {ACC.length > 0 && !todo.length && (
          <div style={{ ...cardBox, marginTop: 14, textAlign: "center", padding: "28px 18px" }}>
            <div style={{ fontSize: 28, color: CP.accentGreen }}>✓</div>
            <h3 style={{ margin: "6px 0 4px", fontSize: 18, fontWeight: 500 }}>Tutto fatto per oggi</h3>
            <p style={{ ...hint, margin: 0 }}>{doneTot} task completate su {blocks.length} profili.</p>
          </div>
        )}
        {todo.length > 0 && vista === "azione" && viewByAction(blocks, tk)}
        {todo.length > 0 && vista !== "azione" && (
          <>
          <SectionHead aside={`${openTot} task su ${todo.length} ${todo.length === 1 ? "profilo" : "profili"}`}>Da fare oggi</SectionHead>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 420px), 1fr))", gap: 16, alignItems: "start" }}>
            {todo.map(({ a, t }) => (
              <TaskList key={a.id}>
                <button type="button" onClick={() => openProfile(a.id)} style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", color: CP.textPrimary, fontFamily: FONTS.body }}>
                  <Avatar a={a} size={40} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 15.5, fontWeight: 500 }}>{a.username}</span>
                    <span style={{ display: "block", fontSize: 13, color: CP.textSecondary, marginTop: 2 }}>{[a.creator, isCooldown(a) ? "cooldown giorno " + cooldownDay(a) : "giorno " + opDay(a), ownerName(a)].filter(Boolean).join(" · ")}</span>
                    <span style={{ display: "block", fontSize: 13, color: CP.textMuted, marginTop: 2 }}>{t.plan.title}{a.flag ? " · in flag" : ""}</span>
                  </span>
                  <Ring n={t.n} total={t.req.length} />
                </button>
                {t.open.map((i) => taskRow(a, i, t.done, tk))}
                {edExtra(a, tk, t.items)}
              </TaskList>
            ))}
          </div>
          </>
        )}
        {fine.length > 0 && (
          <Fold title={`${fine.length} ${fine.length === 1 ? "profilo già a posto" : "profili già a posto"}`}>
            {fine.map((b) => <div key={b.a.id} style={{ display: "flex", padding: "6px 0", alignItems: "center" }}><b style={{ fontWeight: 500, flex: 1 }}>{b.a.username}</b><Chip color={CP.accentGreen}>{b.t.n}/{b.t.req.length}</Chip></div>)}
          </Fold>
        )}
      </>
    );
  }

  function folderList() {
    const map = new Map();
    ACC.forEach((a) => { const k = keyOf(a.creator); if (!k) return; if (!map.has(k)) map.set(k, { name: norm(a.creator), items: [] }); map.get(k).items.push(a); });
    const out = [...map.values()].sort((x, y) => x.name.localeCompare(y.name, "it"));
    const orphans = ACC.filter((a) => !keyOf(a.creator));
    if (orphans.length) out.push({ name: "Senza creator", items: orphans, orphan: true });
    return out;
  }
  function acctRow(a) {
    const p = dayProgress(a, todayKey()), plan = planFor(a);
    return (
      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, borderTop: `1px solid ${CP.borderSoft}`, borderLeft: `3px solid ${statusColor(a.status)}` }}>
        <button type="button" onClick={() => openProfile(a.id)} style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 0, textAlign: "left", padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", color: CP.textPrimary, fontFamily: FONTS.body }}>
          <Avatar a={a} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 500 }}>{a.username}</span>
            <span style={{ display: "block", fontSize: 13, color: CP.textSecondary, marginTop: 2 }}>{isCooldown(a) ? "Cooldown · giorno " + cooldownDay(a) : "Giorno " + opDay(a)} · {plan.title}{a.pub?.last?.notFound ? <b style={{ color: CP.accentRed, fontWeight: 500 }}> · non trovato</b> : a.pub?.last?.followers != null ? ` · ${numFmt(a.pub.last.followers)} follower` : ""}</span>
            <span style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 5, flexWrap: "wrap" }}>{ownerTag(a)}{stateOf(a) !== "online" && <Chip color={TONE[stateInfo(a).tone]}>{stateInfo(a).label}</Chip>}</span>
            {a.flag && <span style={{ display: "block", fontSize: 12.5, color: statusColor(a.status), fontWeight: 500, marginTop: 4 }}>In flag da {fmtDur(tick - a.flag.startedAt)}</span>}
          </span>
          <Ring n={p.n} total={p.total} />
        </button>
        {admin && <button type="button" style={{ ...btnSm, marginRight: 10 }} title="Assegna il responsabile" aria-label="Assegna il responsabile" onClick={() => setModal({ kind: "owner", id: a.id })}><UserRound size={14} /></button>}
      </div>
    );
  }
  function viewFolders() {
    let list = folderList();
    if (onlyMine) list = list.map((f) => ({ ...f, items: f.items.filter(isMine) })).filter((f) => f.items.length);
    const mine = onlyMine ? ACC.filter(isMine) : ACC;
    const tot = mine.length;
    const stAll = { verde: 0, arancione: 0, rosso: 0 };
    mine.forEach((a) => { stAll[a.status] = (stAll[a.status] || 0) + 1; });
    return (
      <>
        {/* in cima, nello stile del Radar (29/10): quanti profili e come stanno */}
        <HeroHead eyebrow="Account"
          title={list.length ? "I profili di" : onlyMine ? "Nessun profilo" : "Ancora nessun"} accent={list.length ? `${list.length} creator` : onlyMine ? "assegnato a te" : "profilo"}
          sub={list.length ? "Una cartella per creator: tocca per vedere i profili, il giorno del warm-up e le segnalazioni." : null}
          numbers={list.length ? <>
            <BigNum label="Profili" value={tot} />
            <BigNum label="In verde" value={stAll.verde} title="Nessuna segnalazione aperta" />
            <BigNum label="In arancione" value={stAll.arancione} title="Segnalazione aperta, da seguire" />
            <BigNum label="In rosso" value={stAll.rosso} strong={stAll.rosso > 0} title="Segnalazione grave aperta" />
          </> : null}
          actions={mineSeg()} />
        {!list.length ? (
          <div style={{ ...cardBox, textAlign: "center", padding: "30px 18px" }}>
            <h3 style={{ margin: "0 0 6px", fontWeight: 500 }}>{onlyMine ? "Nessun profilo assegnato a te" : "Registra il primo profilo"}</h3>
            <p style={{ ...hint, margin: 0 }}>{onlyMine ? "Quando l'amministratore ti assegna un profilo lo trovi qui." : "Inserisci username, creator e data di creazione: la console calcola da sola in che giorno del warm-up si trova e ti dà solo le task di oggi."}</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 10 }}>
            {list.map((f) => {
              const st = { verde: 0, arancione: 0, rosso: 0 };
              f.items.forEach((a) => { st[a.status] = (st[a.status] || 0) + 1; });
              return (
                <button key={f.name} type="button" onClick={() => setFolder(f.name)} style={{ ...cardBox, marginBottom: 0, display: "flex", gap: 12, alignItems: "center", textAlign: "left", cursor: "pointer", color: CP.textPrimary, fontFamily: FONTS.body }}>
                  <div style={{ display: "flex" }}>{f.items.slice(0, 3).map((a, i) => <div key={a.id} style={{ marginLeft: i ? -12 : 0, borderRadius: "50%", boxShadow: `0 0 0 2px ${CP.surface}` }}><Avatar a={a} size={36} /></div>)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 500 }}>{f.name}</div>
                    <div style={{ display: "flex", gap: 10, fontSize: 12.5, color: CP.textSecondary, marginTop: 3, alignItems: "center" }}>
                      <span>{f.items.length} {f.items.length === 1 ? "profilo" : "profili"}</span>
                      {["verde", "arancione", "rosso"].map((k) => st[k] ? <span key={k} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Dot color={statusColor(k)} />{st[k]}</span> : null)}
                    </div>
                  </div>
                  <ChevronRight size={16} color={CP.textMuted} />
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  }
  function viewFolder(name) {
    const f = folderList().find((x) => keyOf(x.name) === keyOf(name));
    if (!f) return viewFolders();
    const items = onlyMine ? f.items.filter(isMine) : f.items;
    const order = { rosso: 0, arancione: 1, verde: 2 };
    return (
      <>
        <button type="button" style={{ ...btnSm, marginBottom: 12 }} onClick={() => setFolder(null)}>← Creator</button>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 180 }}><h2 className="ds-sect" style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{f.name}</h2><p style={{ ...hint, fontSize: 14, margin: "2px 0 0" }}>{items.length} {items.length === 1 ? "profilo" : "profili"}{onlyMine && f.items.length !== items.length ? " su " + f.items.length : ""}</p></div>
          {mineSeg()}
          {!f.orphan && <button type="button" style={btnSm} onClick={() => setModal({ kind: "rename", old: f.name })}>Rinomina</button>}
        </div>
        {items.length ? (
          <TaskList>{items.slice().sort((x, y) => (isMine(y) ? 1 : 0) - (isMine(x) ? 1 : 0) || order[x.status] - order[y.status] || realDay(y) - realDay(x)).map(acctRow)}</TaskList>
        ) : <div style={{ ...cardBox, textAlign: "center" }}>Nessun profilo tuo in questa cartella.</div>}
        {!f.orphan && <button type="button" style={{ ...btnPrimary, marginTop: 14 }} onClick={() => setForm({ preCreator: f.name })}><Plus size={15} />Aggiungi un profilo</button>}
      </>
    );
  }

  function statePanel(a) {
    const st = stateInfo(a), steps = a.stateSteps || {};
    const n = (st.steps || []).filter((x) => steps[x.id]).length;
    const col = st.tone === "bad" ? CP.accentRed : CP.attn;
    return (
      <div style={{ ...cardBox, border: `1px solid ${alpha(col, "66")}`, background: alpha(col, "0d") }}>
        <div style={{ ...eyebrow, color: col }}>Stato dell&apos;account · {st.short}</div>
        <h3 style={{ margin: "4px 0 4px", fontSize: 19, fontWeight: 500 }}>{st.label}</h3>
        <p style={{ fontSize: 14, color: CP.textSecondary, margin: "0 0 10px", lineHeight: 1.55 }}>{st.desc}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {a.stateSince && <Metric2 value={fmtDur(tick - a.stateSince)} label="In questo stato da" />}
          <Metric2 value={`${n}/${(st.steps || []).length}`} label="Step fatti" />
        </div>
        {st.stopTasks && <p style={{ fontSize: 14, fontWeight: 500, color: CP.accentRed, margin: "0 0 10px" }}>Il piano del giorno è sospeso: il calendario resta in pausa e riprende dal giorno in cui si era fermato.</p>}
        <TaskList>{(st.steps || []).map((x) => stepRow(a.id + ":ss-" + x.id, x, Boolean(steps[x.id]), () => toggleStateStep(a, x.id)))}</TaskList>
        {(st.forbid || []).length > 0 && <Fold danger title="Mentre è in questo stato non si fa"><Bullets items={st.forbid} /></Fold>}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" style={btn} onClick={() => { setPane("profilo"); toast("Scegli lo stato qui sotto"); }}>Cambia stato</button>
          {undoableState(a) && <button type="button" style={btn} onClick={() => undoState(a)}><Undo2 size={14} />Annulla: torna a {ST(a)[a.stateHistory[a.stateHistory.length - 1].from].label}</button>}
        </div>
      </div>
    );
  }
  function flagPanel(a) {
    const f = FL(a)[a.flag.type];
    if (!f) return null;
    const since = tick - a.flag.startedAt, steps = a.flag.steps || {}, n = f.steps.filter((x) => steps[x.id]).length;
    const col = f.level === "rosso" ? CP.accentRed : CP.attn;
    return (
      <div style={{ ...cardBox, border: `1px solid ${alpha(col, "66")}`, background: alpha(col, "0d") }}>
        <div style={{ ...eyebrow, color: col }}>Segnalazione attiva · {f.urgency}</div>
        <h3 style={{ margin: "4px 0 4px", fontSize: 19, fontWeight: 500 }}>{f.label}</h3>
        <p style={{ fontSize: 14, color: CP.textSecondary, margin: "0 0 8px", lineHeight: 1.55 }}>{f.desc}</p>
        {a.flag.note && <p style={{ fontSize: 14, margin: "0 0 8px" }}><b style={{ fontWeight: 500 }}>Nota:</b> {a.flag.note}</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <Metric2 value={fmtDur(since)} label="In flag da" />
          {f.waitHours && <Metric2 value={f.waitHours * 3600000 - since > 0 ? fmtDur(f.waitHours * 3600000 - since) : "Ora"} label={f.waitHours * 3600000 - since > 0 ? "All'escalation" : "Escalation dovuta"} color={f.waitHours * 3600000 - since > 0 ? undefined : CP.accentRed} />}
          {f.cooldown && <Metric2 value={a.flag.startedAt + 21 * DAY - tick > 0 ? fmtDur(a.flag.startedAt + 21 * DAY - tick) : "Completato"} label="Fine cooldown" />}
          <Metric2 value={`${n}/${f.steps.length}`} label="Step fatti" />
        </div>
        {f.stopPublishing && <p style={{ fontSize: 14, fontWeight: 500, color: CP.accentRed, margin: "0 0 10px" }}>Pubblicazioni ferme su questo account. Il calendario resta in pausa e riprende dal giorno in cui si era fermato.</p>}
        <TaskList>{f.steps.map((x) => stepRow(a.id + ":fs-" + x.id, x, Boolean(steps[x.id]), () => toggleFlagStep(a, x.id)))}</TaskList>
        {f.ipRotation && <Fold title="Rotazione IP — obbligatoria prima di accedere"><Bullets ordered items={IPROT} /></Fold>}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" style={btnOk} onClick={() => askClearFlag(a)}>Rimetti in verde</button>
          <button type="button" style={btn} onClick={() => setModal({ kind: "flag", id: a.id })}>Cambia tipo</button>
        </div>
      </div>
    );
  }

  function viewDay(a) {
    const key = todayKey(), done = a.progress[key] || {}, plan = planFor(a), p = dayProgress(a, key);
    const panels = <>{stateOf(a) !== "online" && statePanel(a)}{a.flag && flagPanel(a)}</>;
    return (
      <div style={{ maxWidth: 820 }}>
        <button type="button" style={{ ...btnSm, marginBottom: 12 }} onClick={() => { setSel(null); setFolder(a.creator || null); }}>← {a.creator || "Tutti i profili"}</button>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <Avatar a={a} size={48} />
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.2 }}>{a.username}</div>
            <div style={{ fontSize: 13, color: CP.textSecondary }}>{a.creator || a.displayName || ""} · creato il {new Date(startOfDay(a.createdAt)).toLocaleDateString("it-IT")}</div>
          </div>
          <Chip color={TONE[stateInfo(a).tone]}>{stateInfo(a).label}</Chip>
          <Chip color={statusColor(a.status)}><Dot color={statusColor(a.status)} />{a.flag ? "Flag" : "Verde"}</Chip>
        </div>
        <Tabs small items={[["oggi", "Oggi"], ["dati", "Dati"], ["profilo", "Profilo"], ["storico", "Storico"]]} value={pane} onChange={setPane} />
        {a.supMissing && <Notice danger>L&apos;account non c&apos;è più in Account social: username, creator e telefono non si vedono. Ricrealo lì o elimina questo profilo dal warm-up.</Notice>}
        {pane === "oggi" ? (
          <>
            {panels}
            <div style={cardBox}>
              <div style={eyebrow}>{plan.phase}{pausedDays(a) ? ` · ${pausedDays(a)}g in pausa` : ""}</div>
              <div style={{ fontSize: 20, fontWeight: 500, margin: "4px 0 6px" }}>{plan.title}</div>
              {plan.note && <p style={{ fontSize: 14, color: CP.textSecondary, margin: "0 0 12px", lineHeight: 1.55 }}>{plan.note}</p>}
              <div style={{ height: 6, borderRadius: 3, background: CP.bgSunken, overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${p.total ? Math.round((p.n / p.total) * 100) : 0}%`, background: p.n && p.n === p.total ? CP.accentGreen : CP.accent }} /></div>
              <div style={{ ...hint, marginTop: 7, ...NUM }}>{p.n} di {p.total} task di oggi</div>
            </div>
            {plan.groups.map((g) => (
              <div key={g.t}><GroupLabel>{g.t}</GroupLabel><TaskList>{g.items.map((i) => taskRow(a, i, done, key))}{g.t === "Pubblicazione" && edExtra(a, key, visibleItems(a, plan))}</TaskList></div>
            ))}
            {plan.gates.map((gt) => {
              const ok = gt.need.every((n) => a.milestones[n]);
              if (ok) return <div key={gt.label}><GroupLabel>{gt.label} · sbloccato</GroupLabel><TaskList>{gt.items.map((i) => taskRow(a, i, done, key))}</TaskList></div>;
              const miss = gt.need.map((n) => (MS(a).find((m) => m.id === n) || {}).t).filter(Boolean);
              return <Fold key={gt.label} title={`Funnel bloccato — ${gt.label}`}>Le task compaiono solo quando spunti, nella scheda Profilo: <b style={{ fontWeight: 500 }}>{miss.join(" · ")}</b>. Sotto le 10.000 visualizzazioni l&apos;account non è pronto per un funnel: nessuna eccezione.</Fold>;
            })}
            {plan.forbid.length > 0 && <Fold danger title={`Oggi non si fa — ${plan.forbid.length} cose`}><Bullets items={plan.forbid} /></Fold>}
            <Fold title="Regole sempre valide"><Bullets items={SE(a)} /></Fold>
            {!a.flag && <button type="button" style={{ ...btnDanger, width: "100%", marginTop: 14 }} onClick={() => setModal({ kind: "flag", id: a.id })}><Flag size={15} />Apri una segnalazione</button>}
          </>
        ) : panels}
        {pane === "dati" && <WeeklyPane a={a} onSave={(wk, rec, label, isNew) => saveWeekly(a, wk, rec, label, isNew)} />}
        {pane === "profilo" && viewProfilePane(a)}
        {pane === "storico" && <HistoryPane a={a} />}
      </div>
    );
  }

  function viewProfilePane(a) {
    const ad = adherence(a, 7);
    const lastH = a.stateHistory[a.stateHistory.length - 1];
    return (
      <>
        <div style={cardBox}>
          <div style={{ ...eyebrow, marginBottom: 10 }}>Stato dell&apos;account</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.keys(ST(a)).map((k) => {
              const on = stateOf(a) === k, col = TONE[ST(a)[k].tone];
              return <button key={k} type="button" onClick={() => changeState(a, k)} style={{ ...btn, border: `1px solid ${on ? col : CP.border}`, background: on ? alpha(col, "1a") : CP.surfaceAlt, color: on ? col : CP.textPrimary, fontWeight: on ? 500 : 400 }}>{on ? "✓ " : ""}{ST(a)[k].label}</button>;
            })}
          </div>
          <p style={{ ...hint, margin: "10px 0 0" }}>{stateInfo(a).desc}</p>
          {undoableState(a) && lastH && (
            <div style={{ marginTop: 12 }}>
              <button type="button" style={btnSm} onClick={() => undoState(a)}><Undo2 size={13} />Annulla: torna a {ST(a)[lastH.from].label}</button>
              <p style={{ ...hint, margin: "6px 0 0" }}>Cambiato {fmtDur(tick - a.stateSince)} fa. Annullando, il calendario del warm-up non perde quelle ore.</p>
            </div>
          )}
          {isCooldown(a) && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={eyebrow}>Cooldown post-unban</div>
                <div style={{ fontSize: 14.5, marginTop: 3 }}>Giorno {cooldownDay(a)} di 21–28</div>
                {cooldownDay(a) < 21 && <p style={{ ...hint, margin: "4px 0 0" }}>Il SOP chiede minimo 21 giorni: chiudilo prima solo se era partito per sbaglio.</p>}
              </div>
              {admin ? <button type="button" style={cooldownDay(a) >= 21 ? btnOk : btnDanger} onClick={() => askEndCooldown(a)}>{cooldownDay(a) >= 21 ? "Chiudi il cooldown" : "Annulla il cooldown"}</button> : <span style={hint}>Lo chiude l&apos;amministratore</span>}
            </div>
          )}
        </div>
        <div style={cardBox}>
          <div style={{ ...eyebrow, marginBottom: 10 }}>Traguardi</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MS(a).map((m) => { const on = Boolean(a.milestones[m.id]); return <button key={m.id} type="button" onClick={() => toggleMs(a, m.id)} style={{ ...btn, border: `1px solid ${on ? CP.accentGreen : CP.border}`, background: on ? alpha(CP.accentGreen, "1a") : CP.surfaceAlt, color: on ? CP.accentGreen : CP.textPrimary }}>{on ? "✓ " : ""}{m.t}</button>; })}
          </div>
        </div>
        <div style={cardBox}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150 }}><div style={eyebrow}>Responsabile</div><div style={{ fontSize: 16, fontWeight: 500, marginTop: 3 }}>{ownerName(a) || <span style={{ ...muted, fontWeight: 400 }}>nessuno</span>}</div></div>
            <div style={{ textAlign: "right" }}><div style={eyebrow}>Oggi</div><div style={{ fontSize: 21, fontWeight: 500, marginTop: 2, ...NUM, color: !ad.todayTotal ? CP.textMuted : ad.todayDone === ad.todayTotal ? CP.accentGreen : CP.textPrimary }}>{ad.todayTotal ? `${ad.todayDone}/${ad.todayTotal}` : "—"}</div></div>
            <div style={{ textAlign: "right" }}><div style={eyebrow}>Aderenza 7 giorni</div><div style={{ fontSize: 21, fontWeight: 500, marginTop: 2, ...NUM, color: ad.pct == null ? CP.textMuted : ad.pct >= 80 ? CP.accentGreen : ad.pct >= 50 ? CP.attn : CP.accentRed }}>{ad.pct == null ? "—" : ad.pct + "%"}</div></div>
          </div>
          {admin && <button type="button" style={{ ...btnSm, marginTop: 12 }} onClick={() => setModal({ kind: "owner", id: a.id })}><UserRound size={13} />Assegna il responsabile</button>}
          <p style={{ ...hint, margin: "10px 0 0" }}>{ad.total ? `${ad.done} task completate su ${ad.total} previste nei giorni già conclusi.` : "Nessun giorno ancora concluso: l'aderenza compare da domani."}</p>
        </div>
        <div style={cardBox}>
          <div style={{ ...eyebrow, marginBottom: 6 }}>Dati</div>
          <KV k="Username" v={a.username} /><KV k="Nome visualizzato" v={a.displayName} /><KV k="Creator" v={a.creator} />
          {!isX(a) && <KV k="Device" v={(a.device || "—") + (a.deviceType ? " · " + a.deviceType : "")} />}
          <KV k="Email" v={a.email} /><KV k="Data di nascita" v={a.birthDate} />
          {!isX(a) && <KV k="Foto profilo" v={a.pfpType === "cartoon" ? "Cartoon / animata" : a.pfpType === "reale" ? "Foto reale SFW" : "—"} />}
          <div style={{ marginTop: 12 }}><div style={{ ...eyebrow, marginBottom: 5 }}>Bio ({(a.bio || "").length}/{isX(a) ? 160 : 150})</div><div style={{ fontSize: 14.5, whiteSpace: "pre-wrap", color: CP.textSecondary }}>{a.bio || "—"}</div></div>
          {a.notes && <div style={{ marginTop: 12 }}><div style={{ ...eyebrow, marginBottom: 5 }}>Note</div><div style={{ fontSize: 14, whiteSpace: "pre-wrap", color: CP.textSecondary }}>{a.notes}</div></div>}
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button type="button" style={btnSm} onClick={() => setForm({ edit: a.id })}><Pencil size={13} />Modifica i dati</button>
            <a href="/admin/supervisor?tab=account" style={{ ...btnSm, textDecoration: "none" }}><ExternalLink size={13} />Apri in Account social</a>
            {admin ? <button type="button" style={{ ...btnSm, ...btnDanger, padding: "5px 10px", fontSize: 13, minHeight: 32 }} onClick={() => askArchive(a)}><Trash2 size={13} />Elimina dal warm-up</button> : <span style={hint}>Solo l&apos;admin può eliminare un profilo</span>}
          </div>
          {admin && <p style={{ ...hint, margin: "8px 0 0" }}>Finisce nell&apos;archivio in Admin: da lì lo puoi ripristinare o cancellare definitivamente.</p>}
        </div>
      </>
    );
  }

  // ── scheda Dati ──
  function viewReport() {
    const nonOn = ACC.filter((a) => stateOf(a) !== "online").length;
    const inWarmAll = ACC.filter((a) => !isCooldown(a) && opDay(a) <= 7).length;
    return (
      <>
        {/* in cima, nello stile del Radar (29/10): di cosa parla la scheda e tre numeri di tutta la farm */}
        <HeroHead eyebrow="Dati" title="I numeri dei profili" accent={PLATS[plat].label}
          sub="Panoramica del periodo, numeri della settimana, segnalazioni ed esportazione."
          numbers={ACC.length ? <>
            <BigNum label="Profili" value={ACC.length} />
            <BigNum label="In warm-up" value={inWarmAll} title="Nei primi 7 giorni, cooldown esclusi" />
            <BigNum label="Non online" value={nonOn} strong={nonOn > 0} title="Shadowban, sospesi o bannati" />
          </> : null} />
        <Tabs small items={[["pano", "Panoramica"], ["week", "Settimana"], ["flags", "Segnalazioni"], ["exp", "Esporta"]]} value={rpane} onChange={setRpane} />
        {rpane === "pano" && viewPano()}
        {rpane === "week" && viewWeekAll()}
        {rpane === "flags" && viewFlagStats()}
        {rpane === "exp" && viewExport()}
      </>
    );
  }
  // giorni come YYYY-MM-DD tra due date comprese
  function dayRange(from, to) {
    const out = [];
    const a = new Date(from + "T12:00:00"), b = new Date(to + "T12:00:00");
    for (let d = a; d <= b && out.length < 400; d = new Date(d.getTime() + DAY)) out.push(isoDay(d.getTime()));
    return out;
  }
  // il periodo scelto come giorni {from, to}
  function perBounds() {
    const today = isoDay(Date.now());
    if (per === "d7") return [isoDay(Date.now() - 6 * DAY), today];
    if (per === "d30") return [isoDay(Date.now() - 29 * DAY), today];
    if (per === "custom") return perFrom <= perTo ? [perFrom, perTo] : [perTo, perFrom];
    const ws = lastWeeks(Number(per.slice(1)));
    return [isoDay(ws[ws.length - 1].start), today];
  }
  // l'andamento nel periodo: settimane (dato a mano + automatico) o giorni (solo automatico)
  function periodSeries(list) {
    const [from, to] = perBounds();
    if (per === "w8" || per === "w12") return { unit: "week", from, to, rows: weekSeries(Number(per.slice(1)), list) };
    const days = dayRange(from, to);
    if (days.length > 31) {
      const wk = new Set(days.map((d) => weekKey(new Date(d + "T12:00:00"))));
      return { unit: "week", from, to, rows: weekSeries(60, list).filter((r) => wk.has(r.key)) };
    }
    const rows = days.map((d) => {
      const prev = isoDay(new Date(d + "T12:00:00").getTime() - DAY);
      const row = { label: new Date(d + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }), key: d };
      wfields(null, plat).filter((f) => f.num).forEach((f) => {
        let sum = null;
        list.forEach((a) => {
          const v = dailyPrefill(a.platform, a.pub?.daily?.[d], a.pub?.daily?.[prev])[f.k];
          if (v != null && !isNaN(Number(v))) sum = (sum || 0) + Number(v);
        });
        row[f.k] = sum;
      });
      row.posts = list.reduce((t, a) => t + (a.pub?.daily?.[d]?.posts || 0), 0);
      return row;
    });
    return { unit: "day", from, to, rows };
  }
  function weekSeries(n, list = ACC) {
    return lastWeeks(n).slice().reverse().map((w) => {
      const row = { label: w.label, key: w.key };
      wfields(null, plat).filter((f) => f.num).forEach((f) => {
        let sum = null;
        list.forEach((a) => {
          let v = (a.weekly[w.key] || {})[f.k];
          if (v === "" || v == null) v = prefillFor(a.platform, a.pub?.weekly?.[w.key])[f.k]; // manca il dato a mano: quello letto in automatico
          if (v !== "" && v != null && !isNaN(Number(v))) sum = (sum || 0) + Number(v);
        });
        row[f.k] = sum;
      });
      return row;
    });
  }
  // numeri del periodo per un account (solo dati letti in automatico + tracking link)
  function accPeriod(a, from, to) {
    const daily = a.pub?.daily || {};
    const ds = Object.keys(daily).sort();
    const fIn = ds.filter((d) => d >= from && d <= to && daily[d].followers != null);
    const fEnd = fIn.length ? daily[fIn[fIn.length - 1]].followers : null;
    const fBefore = [...ds].reverse().find((d) => d < from && daily[d].followers != null);
    const fStart = fBefore ? daily[fBefore].followers : fIn.length ? daily[fIn[0]].followers : null;
    const posts = (a.pub?.posts || []).filter((p) => { const d = isoDay(p.ts); return d >= from && d <= to; });
    const wv = posts.filter((p) => p.views != null);
    const views = wv.length ? wv.reduce((t, p) => t + p.views, 0) : null;
    const inter = wv.reduce((t, p) => t + (p.likes || 0) + (p.comments || 0), 0);
    const link = a.pub?.linkDays ? linkRange(a.pub.linkDays, from, to, a.pub?.link?.created) : null;
    return {
      followers: fEnd, fDelta: fEnd != null && fStart != null && (fBefore || fIn.length > 1) ? fEnd - fStart : null,
      posts: posts.length, views, avg: wv.length ? Math.round(views / wv.length) : null,
      eng: views ? Math.round((inter / views) * 1000) / 10 : null,
      clicks: link?.clicks ?? null, subs: link?.subs ?? null, revenue: link?.revenue ?? null, hasLink: Boolean(a.pub?.linkDays),
      top: posts,
    };
  }
  function viewPano() {
    // filtri: modella → account (29/10, Nicholas)
    const creatorsHere = [...new Set(ACC.map((a) => a.creator).filter(Boolean))].sort((x, y) => x.localeCompare(y, "it"));
    const SEL = ACC.filter((a) => (!panoCreator || a.creator === panoCreator) && (!panoAcc || a.id === panoAcc));
    const st = { verde: 0, arancione: 0, rosso: 0 };
    SEL.forEach((a) => { st[a.status] = (st[a.status] || 0) + 1; });
    const ads = SEL.map((a) => adherence(a, 7));
    const withT = ads.filter((x) => x.total);
    const adPct = withT.length ? Math.round((withT.reduce((t, x) => t + x.done, 0) / withT.reduce((t, x) => t + x.total, 0)) * 100) : null;
    const oF = ads.reduce((t, x) => t + x.todayDone, 0), oT = ads.reduce((t, x) => t + x.todayTotal, 0);
    const inWarm = SEL.filter((a) => !isCooldown(a) && opDay(a) <= 7).length;
    const non = SEL.filter((a) => stateOf(a) !== "online");
    const nonTxt = ["shadowban", "sospeso", "bannato"].map((k) => ({ k, n: non.filter((a) => stateOf(a) === k).length })).filter((x) => x.n).map((x) => x.n + " " + ST({ platform: plat })[x.k].label.toLowerCase()).join(" · ");
    const ps = periodSeries(SEL);
    const ser = ps.rows;
    const dayF = (f) => f.k === "followers" || f.k === "views"; // gli unici letti anche giorno per giorno
    const fmtD = (d) => new Date(d + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long" });
    const perTitle = per === "w8" || per === "w12" ? `ultime ${per.slice(1)} settimane` : ps.from === ps.to ? fmtD(ps.from) : `${fmtD(ps.from)} – ${fmtD(ps.to)}`;
    const rowsAcc = SEL.map((a) => ({ a, n: accPeriod(a, ps.from, ps.to) }));
    const sumN = (k) => { const v = rowsAcc.map((r) => r.n[k]).filter((x) => x != null); return v.length ? v.reduce((t, x) => t + x, 0) : null; };
    const tot = { followers: sumN("followers"), fDelta: sumN("fDelta"), posts: sumN("posts") || 0, views: sumN("views"), clicks: sumN("clicks"), subs: sumN("subs"), revenue: sumN("revenue") };
    const allTop = rowsAcc.flatMap((r) => r.n.top.map((p) => ({ ...p, acc: r.a }))).filter((p) => p.views != null).sort((x, y) => y.views - x.views).slice(0, 8);
    const inter = rowsAcc.flatMap((r) => r.n.top).filter((p) => p.views != null);
    const engAll = tot.views ? Math.round((inter.reduce((t, p) => t + (p.likes || 0) + (p.comments || 0), 0) / tot.views) * 1000) / 10 : null;
    const anyLink = rowsAcc.some((r) => r.n.hasLink);
    const fmt$ = (v) => (v == null ? "—" : "$" + Number(v).toLocaleString("it-IT", { maximumFractionDigits: 0 }));
    const selSt = { ...input, width: "auto", fontSize: 13.5, padding: "7px 10px" };
    return (
      <>
        <FilterBar onReset={panoCreator || panoAcc || per !== "w8" ? () => { setPanoCreator(""); setPanoAcc(""); setPer("w8"); } : null}>
          <select style={selSt} value={panoCreator} onChange={(e) => { setPanoCreator(e.target.value); setPanoAcc(""); }}>
            <option value="">Tutte le modelle</option>
            {creatorsHere.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select style={selSt} value={panoAcc} onChange={(e) => setPanoAcc(e.target.value)}>
            <option value="">{panoCreator ? "Tutti i suoi account" : "Tutti gli account"}</option>
            {ACC.filter((a) => !panoCreator || a.creator === panoCreator).map((a) => <option key={a.id} value={a.id}>{a.username}{!panoCreator && a.creator ? ` · ${a.creator}` : ""}</option>)}
          </select>
          <Seg items={[["d7", "7 giorni"], ["d30", "30 giorni"], ["w8", "8 settimane"], ["w12", "12 settimane"], ["custom", "Date a scelta"]]} value={per} onChange={setPer} />
        </FilterBar>
        {per === "custom" && (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", margin: "0 0 12px" }}>
            <label style={{ fontSize: 13, color: CP.textSecondary }}>Dal<br /><input type="date" style={{ ...input, width: "auto" }} value={perFrom} max={isoDay(Date.now())} onChange={(e) => { const v = e.target.value; if (!v) return; setPerFrom(v); if (v > perTo) setPerTo(v); }} /></label>
            <label style={{ fontSize: 13, color: CP.textSecondary }}>Al<br /><input type="date" style={{ ...input, width: "auto" }} value={perTo} min={perFrom} max={isoDay(Date.now())} onChange={(e) => e.target.value && setPerTo(e.target.value)} /></label>
            <button type="button" style={btnSm} onClick={() => setPerTo(perFrom)}>Solo il {fmtD(perFrom)}</button>
          </div>
        )}
        {!SEL.length ? <div style={{ ...cardBox, ...hint, textAlign: "center" }}>Nessun profilo con questi filtri.</div> : <>
        <div style={cardBox}>
          <div style={{ ...eyebrow, marginBottom: 10 }}>Nel periodo · {perTitle}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
            <Metric2 value={tot.followers == null ? "—" : numFmt(tot.followers)} label="Follower" sub={tot.fDelta != null ? `${tot.fDelta >= 0 ? "+" : ""}${numFmt(tot.fDelta)} nel periodo` : null} />
            <Metric2 value={tot.views == null ? "—" : numFmt(tot.views)} label="Visualizzazioni" sub="dei post usciti nel periodo" />
            <Metric2 value={tot.posts} label="Post usciti" sub={tot.posts && tot.views != null ? `${numFmt(Math.round(tot.views / Math.max(1, inter.length)))} di media` : null} />
            <Metric2 value={engAll == null ? "—" : String(engAll).replace(".", ",") + "%"} label="Interazioni" sub="like + commenti ÷ visualizzazioni" />
            {anyLink && <Metric2 value={tot.clicks == null ? "—" : numFmt(tot.clicks)} label="Clic sul tracking link" />}
            {anyLink && <Metric2 value={tot.subs == null ? "—" : numFmt(tot.subs)} label="Nuovi abbonati dal link" sub={tot.clicks ? `${String(Math.round((tot.subs / tot.clicks) * 1000) / 10).replace(".", ",")}% dei clic` : null} />}
            {anyLink && <Metric2 value={fmt$(tot.revenue)} label="Speso dagli abbonati del link" color={tot.revenue ? CP.accentGreen : undefined} />}
          </div>
          {!anyLink && <p style={{ ...hint, margin: "8px 0 0" }}>Nessun tracking link OnlyFans collegato a questi profili: si aggiunge nella scheda del profilo (campo «Tracking link OnlyFans») e da lì arrivano clic, abbonati e speso.</p>}
          <p style={{ ...hint, margin: "8px 0 0" }}>Numeri letti in automatico dal profilo pubblico e dal magazzino OnlyFans; le visualizzazioni dei post recenti crescono ancora per qualche giorno.</p>
        </div>
        <div style={cardBox}>
          <div style={eyebrow}>Andamento · {perTitle}</div>
          <p style={{ ...hint, margin: "4px 0 12px" }}>
            {ps.unit === "day"
              ? "Giorno per giorno, dai dati letti in automatico: follower di quel giorno e visualizzazioni dei post usciti quel giorno. Visite e tocchi sul link si inseriscono a settimana: per vederli scegli un periodo più lungo di un mese."
              : "Settimana per settimana. Dove manca il dato inserito a mano si usa quello letto in automatico dal profilo pubblico."}
          </p>
          {ps.unit === "day" && ser.length === 1 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {wfields(null, plat).filter((f) => f.chart && dayF(f)).map((f) => <Metric2 key={f.k} value={ser[0][f.k] == null ? "—" : numFmt(ser[0][f.k])} label={f.lab} />)}
              <Metric2 value={ser[0].posts} label="Post usciti quel giorno" />
            </div>
          ) : !ser.length ? (
            <p style={{ ...hint, textAlign: "center", padding: "18px 0" }}>Nessun dato nel periodo scelto.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 10 }}>
              {wfields(null, plat).filter((f) => f.chart && (ps.unit === "week" || dayF(f))).map((f) => <LineChart key={f.k} title={f.lab} pts={ser.map((r) => ({ label: r.label, v: r[f.k] }))} />)}
              {ps.unit === "day" && <LineChart title="Post usciti" pts={ser.map((r) => ({ label: r.label, v: r.posts }))} />}
            </div>
          )}
        </div>
        {allTop.length > 0 && (
          <div style={cardBox}>
            <div style={{ ...eyebrow, marginBottom: 8 }}>I post migliori del periodo</div>
            {allTop.map((p) => (
              <a key={p.acc.id + p.id} href={p.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "8px 0", borderTop: `1px solid ${CP.borderSoft}`, textDecoration: "none", color: CP.textPrimary, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 500, minWidth: 90, ...NUM }}>{numFmt(p.views)}</span>
                <span style={{ fontSize: 13.5 }}>{p.acc.username}</span>
                <span style={{ ...hint, fontSize: 12.5, ...NUM }}>{p.kind === "reel" ? "reel" : p.kind === "carosello" ? "carosello" : "post"} · {new Date(p.ts).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}{p.likes != null ? ` · ${numFmt(p.likes)} like` : ""}{p.comments != null ? ` · ${numFmt(p.comments)} commenti` : ""}</span>
                <span style={{ flex: 1 }} /><ExternalLink size={13} color={CP.textMuted} />
              </a>
            ))}
          </div>
        )}
        {SEL.length > 1 && (
          <div style={{ ...cardBox, overflowX: "auto" }}>
            <div style={{ ...eyebrow, marginBottom: 8 }}>Account per account · {perTitle}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 640 }}>
              <thead><tr style={{ color: CP.textSecondary, textAlign: "right" }}>
                <th style={{ textAlign: "left", fontWeight: 400, padding: "6px 8px" }}>Account</th><th style={{ fontWeight: 400, padding: "6px 8px" }}>Follower</th><th style={{ fontWeight: 400, padding: "6px 8px" }}>Nel periodo</th><th style={{ fontWeight: 400, padding: "6px 8px" }}>Post</th><th style={{ fontWeight: 400, padding: "6px 8px" }}>Visualizzazioni</th><th style={{ fontWeight: 400, padding: "6px 8px" }}>Media</th><th style={{ fontWeight: 400, padding: "6px 8px" }}>Interaz.</th>
                {anyLink && <><th style={{ fontWeight: 400, padding: "6px 8px" }}>Clic</th><th style={{ fontWeight: 400, padding: "6px 8px" }}>Abbonati</th><th style={{ fontWeight: 400, padding: "6px 8px" }}>Speso</th></>}
              </tr></thead>
              <tbody>
                {rowsAcc.sort((x, y) => (y.n.views || 0) - (x.n.views || 0)).map(({ a, n }) => (
                  <tr key={a.id} onClick={() => { setPanoCreator(a.creator || ""); setPanoAcc(a.id); }} style={{ borderTop: `1px solid ${CP.borderSoft}`, cursor: "pointer", textAlign: "right", ...NUM }}>
                    <td style={{ textAlign: "left", padding: "7px 8px" }}>{a.username}<div style={{ ...hint, fontSize: 12 }}>{a.creator || ""}</div></td>
                    <td style={{ padding: "7px 8px" }}>{numFmt(n.followers)}</td>
                    <td style={{ padding: "7px 8px", color: n.fDelta > 0 ? CP.accentGreen : undefined }}>{n.fDelta == null ? "—" : (n.fDelta >= 0 ? "+" : "") + numFmt(n.fDelta)}</td>
                    <td style={{ padding: "7px 8px" }}>{n.posts}</td>
                    <td style={{ padding: "7px 8px" }}>{numFmt(n.views)}</td>
                    <td style={{ padding: "7px 8px" }}>{numFmt(n.avg)}</td>
                    <td style={{ padding: "7px 8px" }}>{n.eng == null ? "—" : String(n.eng).replace(".", ",") + "%"}</td>
                    {anyLink && <><td style={{ padding: "7px 8px" }}>{numFmt(n.clicks)}</td><td style={{ padding: "7px 8px" }}>{numFmt(n.subs)}</td><td style={{ padding: "7px 8px" }}>{fmt$(n.revenue)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ ...hint, margin: "8px 0 0" }}>Tocca una riga per vedere solo quell&apos;account.</p>
          </div>
        )}
        <div style={cardBox}>
          <div style={{ ...eyebrow, marginBottom: 10 }}>Stato della farm{panoCreator || panoAcc ? " · selezione" : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
            <Metric2 value={SEL.length} label="Profili" sub={`${inWarm} in warm-up`} />
            <Metric2 value={oT ? `${oF}/${oT}` : "—"} label="Oggi" color={!oT ? CP.textMuted : oF === oT ? CP.accentGreen : undefined} />
            <Metric2 value={adPct == null ? "—" : adPct + "%"} label="Aderenza 7g" color={adPct == null ? CP.textMuted : adPct >= 80 ? CP.accentGreen : adPct >= 50 ? CP.attn : CP.accentRed} />
            <Metric2 value={st.verde || 0} label="Verdi" color={CP.accentGreen} />
            <Metric2 value={st.arancione || 0} label="Arancioni" color={CP.attn} />
            <Metric2 value={st.rosso || 0} label="Rossi" color={CP.accentRed} />
            {non.length > 0 && <Metric2 value={non.length} label="Non online" color={CP.accentRed} sub={nonTxt} />}
          </div>
        </div>
        </>}
      </>
    );
  }
  function viewWeekAll() {
    const weeks = lastWeeks(13);
    const cur = wkAll && weeks.find((w) => w.key === wkAll) ? wkAll : weeks[0].key;
    const idx = weeks.findIndex((w) => w.key === cur);
    const prevKey = weeks[idx + 1]?.key || null;
    const F = wfields(null, plat).filter((f) => f.num);
    const sort = F.some((f) => f.k === sortAll) ? sortAll : F[0].k;
    const rows = ACC.map((a) => ({ a, r: a.weekly[cur] || {}, pr: prevKey ? a.weekly[prevKey] || {} : {} })).sort((x, y) => {
      const vx = Number(x.r[sort]), vy = Number(y.r[sort]);
      const ex = x.r[sort] === "" || x.r[sort] == null || isNaN(vx), ey = y.r[sort] === "" || y.r[sort] == null || isNaN(vy);
      if (ex && ey) return String(x.a.username).localeCompare(y.a.username, "it");
      if (ex) return 1; if (ey) return -1;
      return vy - vx;
    });
    const sum = (k, key) => rows.reduce((t, x) => t + (isNaN(Number(x[key][k])) ? 0 : Number(x[key][k]) || 0), 0);
    const filled = rows.filter((x) => Object.keys(x.r).length).length;
    return (
      <>
        <div style={{ ...cardBox, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}><div style={eyebrow}>Settimana</div><div style={{ fontSize: 17, fontWeight: 500, marginTop: 2 }}>{weeks[idx].label}</div><p style={{ ...hint, margin: "3px 0 0" }}>{filled} di {rows.length} profili compilati</p></div>
          <select style={{ ...input, width: "auto", fontSize: 14 }} value={cur} onChange={(e) => setWkAll(e.target.value)}>{weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}</select>
        </div>
        {rows.length > 0 && (
          <>
            <div style={cardBox}>
              <div style={{ ...eyebrow, marginBottom: 10 }}>Totali</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {F.map((f) => { const now = sum(f.k, "r"), prev = prevKey ? sum(f.k, "pr") : null; return <Metric2 key={f.k} value={numFmt(now)} label={f.lab}>{prev ? <div style={{ marginTop: 3 }}><Delta d={delta(now, prev)} /></div> : null}</Metric2>; })}
              </div>
            </div>
            <div style={cardBox}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ ...eyebrow, flex: 1 }}>Profilo per profilo</div>
                <select style={{ ...input, width: "auto", fontSize: 13, padding: "7px 10px" }} value={sort} onChange={(e) => setSortAll(e.target.value)}>{F.map((f) => <option key={f.k} value={f.k}>ordina per {f.lab.toLowerCase()}</option>)}</select>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13.5 }}>
                  <thead><tr><th style={th}>Profilo</th>{F.map((f) => <th key={f.k} style={{ ...th, textAlign: "right" }}>{f.lab}</th>)}<th style={th}>{plat === "x" ? "Note" : "Trend"}</th></tr></thead>
                  <tbody>{rows.map((x) => { const empty = !Object.keys(x.r).length; return (
                    <tr key={x.a.id}><td style={td}><b style={{ fontWeight: 500 }}>{x.a.username}</b>{x.a.creator && <div style={{ ...hint, fontSize: 12 }}>{x.a.creator}</div>}</td>
                      {F.map((f) => <td key={f.k} style={{ ...td, textAlign: "right", ...NUM }}>{numFmt(x.r[f.k])}{delta(x.r[f.k], x.pr[f.k]) != null && <div><Delta d={delta(x.r[f.k], x.pr[f.k])} /></div>}</td>)}
                      <td style={td}>{empty ? <button type="button" style={btnSm} onClick={() => openProfile(x.a.id, "dati")}>compila</button> : (x.r.trend || x.r.notes || "—")}</td></tr>); })}</tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </>
    );
  }
  function viewFlagStats() {
    const since = Date.now() - flagDays * DAY, rows = [];
    ACC.forEach((a) => {
      (a.flagHistory || []).forEach((f) => { if (f.startedAt >= since) rows.push({ a, ...f }); });
      if (a.flag && a.flag.startedAt >= since) rows.push({ a, type: a.flag.type, startedAt: a.flag.startedAt, open: true });
    });
    rows.sort((x, y) => y.startedAt - x.startedAt);
    const count = (fn) => { const m = new Map(); rows.forEach((r) => { const k = fn(r); m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((x, y) => y[1] - x[1]); };
    const bars = (entries, col) => { const tot = Math.max(...entries.map((e) => e[1])); return entries.map(([k, v]) => (
      <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 40%) 1fr 30px", gap: 10, alignItems: "center", fontSize: 13, marginBottom: 6 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
        <span style={{ height: 8, borderRadius: 4, background: CP.bgSunken }}><i style={{ display: "block", height: "100%", width: `${Math.round((v / tot) * 100)}%`, background: col, borderRadius: 4 }} /></span>
        <span style={{ textAlign: "right", ...NUM }}>{v}</span>
      </div>)); };
    const resolved = rows.filter((r) => r.resolvedAt);
    return (
      <>
        <div style={cardBox}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ ...eyebrow, flex: 1 }}>Segnalazioni · ultimi {flagDays} giorni</div>
            <Seg items={[[30, "30g"], [60, "60g"], [90, "90g"]]} value={flagDays} onChange={setFlagDays} />
          </div>
          {!rows.length ? <p style={{ ...hint, textAlign: "center", padding: "20px 0", margin: 0 }}>Nessuna segnalazione nel periodo.</p> : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginBottom: 16 }}>
                <Metric2 value={rows.length} label="Segnalazioni" />
                <Metric2 value={rows.filter((r) => r.open).length} label="Ancora aperte" />
                <Metric2 value={new Set(rows.map((r) => r.a.id)).size} label="Profili coinvolti" />
                <Metric2 value={resolved.length ? fmtDur(resolved.reduce((t, r) => t + (r.resolvedAt - r.startedAt), 0) / resolved.length) : "—"} label="Tempo medio di chiusura" />
              </div>
              <div style={{ ...eyebrow, margin: "14px 0 8px" }}>Per tipo</div>{bars(count((r) => (FL(r.a)[r.type] || {}).label || r.type), CP.attn)}
              {plat === "ig" && <><div style={{ ...eyebrow, margin: "14px 0 8px" }}>Per device</div>{bars(count((r) => norm(r.a.device) || "senza device"), CP.accentRed)}</>}
              <div style={{ ...eyebrow, margin: "14px 0 8px" }}>Per profilo</div>{bars(count((r) => r.a.username), CP.textMuted)}
            </>
          )}
        </div>
        {rows.length > 0 && (
          <div style={cardBox}>
            <div style={{ ...eyebrow, marginBottom: 6 }}>Elenco</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13.5 }}>
                <thead><tr>{["Quando", "Profilo", "Device", "Tipo", "Durata"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{rows.map((r, i) => <tr key={i}><td style={td}>{new Date(r.startedAt).toLocaleDateString("it-IT")}</td><td style={td}><b style={{ fontWeight: 500 }}>{r.a.username}</b></td><td style={td}>{r.a.device || "—"}</td><td style={td}>{(FL(r.a)[r.type] || {}).label || r.type}</td><td style={td}>{r.open ? <Chip color={CP.attn}>aperta</Chip> : fmtDur(r.resolvedAt - r.startedAt)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  }
  function download(name, text, type = "text/csv") {
    try {
      const blob = new Blob(["﻿" + text], { type: type + ";charset=utf-8" });
      const el = document.createElement("a");
      el.href = URL.createObjectURL(blob); el.download = name;
      document.body.appendChild(el); el.click();
      setTimeout(() => { URL.revokeObjectURL(el.href); el.remove(); }, 1500);
      toast("File scaricato");
    } catch { toast("Il browser ha bloccato il download"); }
  }
  const csv = (rows) => rows.map((r) => r.map((v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"').join(";")).join("\r\n");
  function exportWeekly() {
    const F = wfields(null, plat);
    const rows = [["Creator", "Profilo", "Settimana", ...F.map((f) => f.lab), "Inserito da"]];
    ACC.forEach((a) => Object.keys(a.weekly).sort().forEach((k) => { const r = a.weekly[k], w = lastWeeks(60).find((x) => x.key === k); rows.push([a.creator || "", a.username, w ? w.label : k, ...F.map((f) => r[f.k]), r.by]); }));
    download(`dati-settimanali-${plat === "x" ? "x-" : ""}${todayKey()}.csv`, csv(rows));
  }
  async function exportLog() {
    try {
      const d = await fetcher(`${API}?activity=1`);
      const rows = [["Data", "Ora", "Persona", "Tipo", "Descrizione"]];
      d.activity.forEach((e) => { const t = new Date(Number(e.ts)); rows.push([t.toLocaleDateString("it-IT"), t.toLocaleTimeString("it-IT"), e.un, ACT_LABEL[e.type] || e.type, e.text]); });
      download(`registro-warmup-${todayKey()}.csv`, csv(rows));
    } catch (e) { toast(e.message); }
  }
  function exportBackup() {
    const strip = profiles.map(({ pfpV, ...rest }) => rest);
    download(`backup-warmup-${todayKey()}.json`, JSON.stringify({ esportato: new Date().toISOString(), da: me.name, profili: strip }, null, 2), "application/json");
  }
  function viewExport() {
    return (
      <div style={cardBox}>
        <div style={{ ...eyebrow, marginBottom: 12 }}>Esportazioni</div>
        <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
          <button type="button" style={btn} onClick={exportWeekly}>Dati settimanali in CSV</button>
          {admin && <button type="button" style={btn} onClick={exportLog}>Registro attività in CSV</button>}
          <button type="button" style={btn} onClick={() => window.print()}>Stampa il report o salvalo in PDF</button>
          {admin && <button type="button" style={btn} onClick={exportBackup}>Backup completo in JSON</button>}
        </div>
        <p style={{ ...hint, marginTop: 14 }}>I CSV si aprono in Excel e Google Sheets. La stampa produce la pagina che stai guardando: dalla finestra di stampa scegli «Salva come PDF».</p>
      </div>
    );
  }

  // ── scheda Admin ──
  function viewAdmin() {
    const perAcc = ACC.map((a) => ({ a, ad: adherence(a, 7) })).sort((x, y) => (x.ad.pct == null ? (x.ad.todayPct == null ? 999 : 900 + x.ad.todayPct / 100) : x.ad.pct) - (y.ad.pct == null ? (y.ad.todayPct == null ? 999 : 900 + y.ad.todayPct / 100) : y.ad.pct));
    const byUser = new Map();
    ACC.forEach((a) => {
      const k = a.owner ? a.owner.id || "nome:" + a.owner.name : "_";
      if (!byUser.has(k)) byUser.set(k, { name: a.owner ? ownerName(a) : "Non assegnati", done: 0, total: 0, n: 0 });
      const ad = adherence(a, 7), o = byUser.get(k); o.done += ad.done; o.total += ad.total; o.n++;
    });
    const col = (p) => (p == null ? CP.textMuted : p >= 80 ? CP.accentGreen : p >= 50 ? CP.attn : CP.accentRed);
    const oT = perAcc.reduce((t, x) => t + x.ad.todayTotal, 0), oF = perAcc.reduce((t, x) => t + x.ad.todayDone, 0);
    return (
      <>
        <h2 className="ds-sect" style={{ fontSize: 22, fontWeight: 500, margin: "0 0 4px" }}>Amministrazione</h2>
        <p style={{ ...hint, fontSize: 14, margin: "0 0 14px" }}>Aderenza, archivio e tutto quello che è stato fatto. Gli accessi si danno da Membri con il ruolo «Social».</p>
        {ACC.length > 0 && (
          <div style={cardBox}>
            <div style={{ ...eyebrow, marginBottom: 10 }}>Aderenza alle SOP</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
              <Metric2 value={`${oF}/${oT}`} label="Oggi · tutti i profili" sub="giornata in corso" color={col(oT ? Math.round((oF / oT) * 100) : null)} />
              {[...byUser.values()].map((o) => { const pct = o.total ? Math.round((o.done / o.total) * 100) : null; return <Metric2 key={o.name} value={pct == null ? "—" : pct + "%"} label={`${o.name} · 7g`} sub={o.total ? `${o.n} ${o.n === 1 ? "profilo" : "profili"}` : "nessun giorno concluso"} color={col(pct)} />; })}
            </div>
            <p style={{ ...hint, margin: "0 0 12px" }}>La colonna <b style={{ fontWeight: 500 }}>Oggi</b> è la giornata in corso. L&apos;aderenza considera solo i giorni già conclusi.</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13.5 }}>
                <thead><tr><th style={th}>Profilo</th><th style={th}>Responsabile</th><th style={{ ...th, textAlign: "right" }}>Oggi</th><th style={{ ...th, textAlign: "right" }}>Giorni conclusi</th><th style={{ ...th, textAlign: "right" }}>Aderenza</th></tr></thead>
                <tbody>{perAcc.map((x) => <tr key={x.a.id}><td style={td}><b style={{ fontWeight: 500 }}>{x.a.username}</b></td><td style={td}>{ownerName(x.a) || "—"}</td><td style={{ ...td, textAlign: "right", ...NUM, color: x.ad.todayTotal && x.ad.todayDone === x.ad.todayTotal ? CP.accentGreen : undefined }}>{x.ad.todayTotal ? `${x.ad.todayDone}/${x.ad.todayTotal}` : "—"}</td><td style={{ ...td, textAlign: "right", ...NUM }}>{x.ad.total ? `${x.ad.done}/${x.ad.total}` : "—"}</td><td style={{ ...td, textAlign: "right", ...NUM, color: col(x.ad.pct), fontWeight: 500 }}>{x.ad.pct == null ? "—" : x.ad.pct + "%"}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
        <div style={cardBox}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}><div style={{ ...eyebrow, flex: 1 }}>Archivio profili eliminati</div><Chip>{archived.length}</Chip></div>
          {!archived.length ? <p style={{ ...hint, margin: 0 }}>Nessun profilo eliminato. Quando elimini un profilo dalla sua scheda finisce qui, con progressi, dati settimanali e storico.</p> : archived.slice().sort((x, y) => (y.archived.at || 0) - (x.archived.at || 0)).map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderTop: `1px solid ${CP.borderSoft}`, flexWrap: "wrap" }}>
              <Avatar a={r} size={36} />
              <div style={{ flex: 1, minWidth: 160 }}><div style={{ fontSize: 14.5, fontWeight: 500 }}>{r.username} {r.creator && <Chip>{r.creator}</Chip>}</div><div style={hint}>eliminato il {new Date(r.archived.at).toLocaleDateString("it-IT")}{r.archived.by ? " da " + r.archived.by : ""} · {Object.keys(r.progress || {}).length} giorni di storico</div></div>
              <button type="button" style={btnSm} onClick={() => { optimistic(r.id, (x) => { x.archived = null; }); send({ action: "restore", id: r.id, username: r.username }, r.username + " ripristinato"); }}>Ripristina</button>
              <button type="button" style={{ ...btnSm, color: CP.accentRed }} onClick={() => setModal({ kind: "confirm", danger: true, title: `Cancellare ${r.username} definitivamente?`, body: "Questa non si può annullare: si perdono progressi, dati settimanali e storico delle segnalazioni di quel profilo. L'account resta in Account social. Se ti servono, esporta prima il backup dalla scheda Dati.", ok: "Cancella per sempre", fn: () => send({ action: "purge", id: r.id, username: r.username }, "Profilo cancellato definitivamente") })}>Cancella</button>
            </div>
          ))}
        </div>
        <PubRunCard run={data.pubRun} onDone={() => mutate()} />
        <ImportCard onDone={() => mutate()} />
        <ActivityCard />
      </>
    );
  }

  // ── telaio ──
  let body = null;
  if (data) {
    if (form) {
      const edit = form.edit ? byId(form.edit) : null;
      body = <ProfileForm key={form.edit || "new"} edit={edit} plat={plat} preCreator={form.preCreator} creators={data.creators} devices={data.devices} people={people} admin={admin} accounts={ACC}
        onCancel={() => setForm(null)} onDone={async (id, msg) => { await mutate(); setForm(null); toast(msg); openProfile(id, form.edit ? "profilo" : "oggi"); }} />;
    } else if (tab === "oggi") body = viewToday();
    else if (tab === "contenuti" && plat === "ig") body = <EditorialeView embedded />;
    else if (tab === "dati") body = viewReport();
    else if (tab === "admin" && admin) body = viewAdmin();
    else if (tab === "xrefs" && plat === "x") body = <XRefs />;
    else if (tab === "radar") body = <ClipRadar />;
    else if (tab === "guide") body = <>{plat === "x"
      ? <HeroHead eyebrow="Guida" title="Come si lavora un profilo" accent="X" sub="Il riassunto del documento Account X: perché conta, i numeri di riferimento, cosa dipende da noi."
          numbers={<><BigNum label="Visualizzazioni a post con Premium" value={600} strong /><BigNum label="Follower attivi per le prime sub" value={500} /></>} />
      : <HeroHead eyebrow="Guida" title="Come si scalda un profilo" accent="Instagram" sub="Il riassunto delle SOP a cui la console fa riferimento: calendario, pubblicazioni, finestre, segnalazioni."
          numbers={<><BigNum label="Giorni di warm-up" value={7} strong /><BigNum label="Reel al giorno, a regime" value={3} /><BigNum label="Finestre USA" value={WINDOWS.length} /></>} />}
      {plat === "x" ? <GuideX /> : <GuideIG />}</>;
    else { const a = sel && byId(sel); body = a && !a.archived ? viewDay(a) : folder ? viewFolder(folder) : viewFolders(); }
  }
  const modalA = modal?.id ? byId(modal.id) : null;
  // Ispirazioni: reference di creator su X (per Instagram c'è il Radar creator)
  // Contenuti (29/10/2026): l'Editoriale dentro Social, solo per Instagram
  const tabs = [TABS[0], ...(plat === "ig" ? [["contenuti", "Contenuti"]] : []), ...TABS.slice(1, 3), ...(plat === "x" ? [["xrefs", "Ispirazioni"]] : []), ["radar", "Radar clipping"], ...TABS.slice(3), ...(admin ? [["admin", "Admin"]] : [])];
  const openToday = ACC.reduce((t, a) => t + tasksOn(a, todayKey()).open.length, 0);

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "20px 16px calc(110px + env(safe-area-inset-bottom))", fontFamily: FONTS.body, color: CP.textPrimary }}>
      <PageHead crumbs={[{ label: "Marketing" }, { label: "Clipping" }]} title="Clipping"
        subtitle="I profili Instagram e X delle creator: cosa fare oggi, i contenuti, i numeri."
        actions={data ? <button type="button" style={btnPrimary} onClick={() => { setTab("acct"); setSel(null); setForm({}); }}><Plus size={15} />Nuovo profilo</button> : null} />
      <Tabs value={form ? null : tab} style={{ marginBottom: 22 }}
        items={tabs.map(([k, l]) => [k, l, !data ? null : k === "oggi" ? openToday || null : k === "acct" ? ACC.length : null])}
        onChange={(k) => { setTab(k); setSel(null); setForm(null); setModal(null); if (k === "acct") setFolder(null); window.scrollTo(0, 0); }}
        aside={<span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span title={net === "ok" ? "Collegato" : net === "pending" ? "Salvataggio…" : "Non salvato"} style={{ width: 8, height: 8, borderRadius: "50%", background: net === "ok" ? CP.accentGreen : net === "pending" ? CP.attn : CP.accentRed }} />
          <Segmented items={Object.keys(PLATS).map((k) => [k, PLATS[k].label])} value={plat} onChange={setPlat} />
        </span>} />
      {error && <Notice danger>{error.message}</Notice>}
      {!data && !error && <p style={{ ...hint, fontSize: 14 }}>Carico…</p>}
      {body}

      {modal?.kind === "confirm" && (
        <ModalBox title={modal.title} onClose={() => setModal(null)}
          foot={<>
            <button type="button" style={btn} onClick={() => setModal(null)}>Annulla</button>
            {modal.alt && <button type="button" style={btn} onClick={() => { const f = modal.altFn; setModal(null); f?.(); }}>{modal.alt}</button>}
            <button type="button" style={modal.danger ? btnDanger : btnPrimary} onClick={() => { const f = modal.fn; setModal(null); f?.(); }}>{modal.ok}</button>
          </>}>
          <p style={{ fontSize: 14.5, color: CP.textSecondary, lineHeight: 1.55, margin: 0 }}>{modal.body}</p>
        </ModalBox>
      )}
      {modal?.kind === "flag" && modalA && <FlagModal a={modalA} onClose={() => setModal(null)} onSave={(type, note) => { setModal(null); meta(modalA, (c) => openFlag(c, type, note, me.name), FLAG_KEYS, "flag", "Segnalazione aperta"); }} />}
      {modal?.kind === "owner" && modalA && <OwnerModal a={modalA} people={people} accounts={ACC} onClose={() => setModal(null)} onSave={(p) => saveOwner(modalA, p)} />}
      {modal?.kind === "rename" && <RenameModal old={modal.old} onClose={() => setModal(null)} onSave={(name) => renameFolder(modal.old, name)} />}

      {(timer || (doneBar && doneBar.until > tick)) && (
        <div className="hoc-dock" style={{ position: "fixed", left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom))", zIndex: 70, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ pointerEvents: "auto", width: "100%", maxWidth: 520, display: "flex", gap: 12, alignItems: "center", background: timer ? CP.accent : CP.accentGreen, color: CP.accentInk, borderRadius: 16, padding: "12px 16px", boxShadow: `0 12px 30px ${alpha(CP.bgSunken, "88")}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{timer ? timer.label : "Tempo completato"}</div>
              <div style={{ fontSize: timer ? 26 : 15, fontWeight: 500, ...NUM }}>{timer ? mmss(timerLeft(timer)) : doneBar.label}</div>
            </div>
            {timer ? <button type="button" style={{ ...btnSm, background: alpha(CP.accentInk, "22"), color: CP.accentInk, border: "none" }} onClick={() => (timer.mode === "accum" ? stopTimer() : setTimer(null))}>{timer.mode === "accum" ? "Pausa" : "Annulla"}</button>
              : <button type="button" style={{ ...btnSm, background: alpha(CP.accentInk, "22"), color: CP.accentInk, border: "none" }} onClick={() => setDoneBar(null)}>OK</button>}
          </div>
        </div>
      )}
      {mview && (
        <MediaLightbox creator={mview.creator} file={mview.files[mview.idx]} pos={mview.idx} total={mview.files.length}
          onPrev={mview.idx > 0 ? () => setMview((m) => ({ ...m, idx: m.idx - 1 })) : null}
          onNext={mview.idx < mview.files.length - 1 ? () => setMview((m) => ({ ...m, idx: m.idx + 1 })) : null}
          onClose={() => setMview(null)} />
      )}
      {toastMsg && (
        <div className="hoc-dock" role="status" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: `calc(${timer ? 100 : 20}px + env(safe-area-inset-bottom))`, zIndex: 90, background: CP.textPrimary, color: CP.surface, borderRadius: 12, padding: "10px 16px", fontSize: 14, maxWidth: "calc(100vw - 32px)", boxShadow: `0 10px 26px ${alpha(CP.bgSunken, "88")}` }}>{toastMsg}</div>
      )}
    </div>
  );
}

function HistoryPane({ a }) {
  const { data, error } = useSWR(`${API}?log=${encodeURIComponent(a.id)}`, fetcher);
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * DAY), k = todayKey(d); days.push({ d, k, n: Object.values(a.progress[k] || {}).filter(Boolean).length, today: i === 0 }); }
  return (
    <>
      <div style={cardBox}>
        <div style={{ ...eyebrow, marginBottom: 10 }}>Ultimi 14 giorni</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {days.map(({ d, k, n, today }) => (
            <i key={k} title={`${k}: ${n} task`} style={{ width: 30, height: 34, borderRadius: 8, display: "grid", placeItems: "center", fontStyle: "normal", fontSize: 11.5, fontWeight: 500, ...NUM, background: n === 0 ? CP.bgSunken : n >= 4 ? alpha(CP.accentGreen, "22") : alpha(CP.attn, "22"), color: n === 0 ? CP.textMuted : n >= 4 ? CP.accentGreen : CP.attn, outline: today ? `2px solid ${CP.accent}` : "none", outlineOffset: 1 }}>{d.getDate()}</i>
          ))}
        </div>
      </div>
      <div style={cardBox}>
        <div style={{ ...eyebrow, marginBottom: 6 }}>Cosa è stato fatto</div>
        {error && <Notice danger>{error.message}</Notice>}
        {!data && !error && <p style={hint}>Carico…</p>}
        {data && (!data.log.length ? <p style={hint}>Nessun evento registrato</p> : data.log.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "7px 0", borderTop: i ? `1px solid ${CP.borderSoft}` : "none", fontSize: 14 }}>
            <time style={{ ...hint, fontSize: 12, minWidth: 74, ...NUM }}>{new Date(l.ts).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} {new Date(l.ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</time>
            <span style={{ flex: 1 }}>{l.text} {l.un && <span style={muted}>· {l.un}</span>}</span>
          </div>
        )))}
      </div>
    </>
  );
}

// Giro dei numeri pubblici (fase 1): stato dell'ultima lettura e «Aggiorna adesso».
function PubRunCard({ run, onDone }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function go() {
    setBusy(true); setMsg(null);
    try { const d = await post({ action: "refreshPub" }); const r = d.result || {}; setMsg(r.skip ? "Apify non è configurato sul server" : r.busy ? "Un giro è già in corso" : `Letti ${r.read} profili su ${r.profiles}${r.notFound ? ` · ${r.notFound} non trovati` : ""}${r.errors?.length ? " · errori: " + r.errors.join("; ") : ""}`); onDone(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div style={cardBox}>
      <div style={{ ...eyebrow, marginBottom: 8 }}>Numeri pubblici in automatico</div>
      <p style={{ ...hint, margin: "0 0 10px" }}>Ogni notte HOC Pro legge con Apify i profili pubblici (Instagram: follower, post, visualizzazioni dei reel; X: follower, post, Premium, link in bio, visualizzazioni). Niente accesso agli account. Costo stimato: circa 0,3 centesimi a profilo Instagram e 2 centesimi a profilo X per lettura.</p>
      {!run?.configured && <Notice danger>Apify non è configurato su questo server.</Notice>}
      {run?.lastAt ? <p style={{ fontSize: 14, margin: "0 0 10px" }}>Ultima lettura: {new Date(run.lastAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {run.read}/{run.profiles} profili letti{run.notFound ? ` · ${run.notFound} non trovati` : ""} · ~{String(run.estUsd ?? 0).replace(".", ",")} $</p> : <p style={{ ...hint, margin: "0 0 10px" }}>Nessuna lettura ancora.</p>}
      {run?.errors?.length > 0 && <Notice danger>{run.errors.join(" · ")}</Notice>}
      <button type="button" style={btn} disabled={busy} onClick={go}>{busy ? "Leggo i profili… (fino a un paio di minuti)" : "Aggiorna adesso"}</button>
      {msg && <p style={{ ...hint, margin: "8px 0 0" }}>{msg}</p>}
    </div>
  );
}

// Import una tantum dalla console di prima: dalla sua scheda Dati › Esporta › «Backup completo in JSON».
function ImportCard({ onDone }) {
  const [file, setFile] = useState(null); // { name, backup }
  const [rep, setRep] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function read(f) {
    setErr(null); setRep(null); setDone(false);
    try {
      const backup = JSON.parse(await f.text());
      if (!Array.isArray(backup.profili)) throw new Error("Non è il backup della Warm-Up Console (manca l'elenco dei profili)");
      setFile({ name: f.name, backup });
      await run(backup, true);
    } catch (e) { setErr(e.message || "File non leggibile"); }
  }
  async function run(backup, dryRun) {
    setBusy(true); setErr(null);
    try { const d = await post({ action: "import", backup, dryRun }); setRep(d.report); if (!dryRun) { setDone(true); onDone(); } }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div style={cardBox}>
      <div style={{ ...eyebrow, marginBottom: 8 }}>Importa dalla console di prima</div>
      <p style={{ ...hint, margin: "0 0 12px" }}>Nella Warm-Up Console su Netlify: Dati › Esporta › «Backup completo in JSON», poi carica qui il file. Ogni profilo aggancia (o crea) il suo account in Account social e porta con sé spunte, timer, segnalazioni, dati settimanali e storico. Si può rilanciare: i profili già importati si saltano.</p>
      <label style={{ ...btn, display: "inline-flex" }}>{file ? file.name : "Scegli il file di backup"}<input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} /></label>
      {err && <div style={{ marginTop: 10 }}><Notice danger>{err}</Notice></div>}
      {rep && (
        <div style={{ marginTop: 12, fontSize: 14 }}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{done ? "Importato" : "Anteprima"}: {rep.created.length} profili, {rep.skipped.length} saltati, {rep.activity} voci di registro</div>
          {rep.created.map((c) => <div key={c.username} style={{ ...hint, fontSize: 13 }}>{c.username} · {c.platform === "x" ? "X" : "Instagram"}{c.creator ? " · " + c.creator : ""} · {c.days} giorni di spunte · {c.log} voci di storico{c.linked ? " · account già in Account social" : ""}</div>)}
          {rep.skipped.map((c) => <div key={c.username} style={{ ...hint, fontSize: 13, color: CP.attn }}>{c.username}: {c.reason}</div>)}
          {!done && rep.created.length > 0 && <button type="button" style={{ ...btnPrimary, marginTop: 12 }} disabled={busy} onClick={() => run(file.backup, false)}>{busy ? "Importo…" : `Importa ${rep.created.length} profili`}</button>}
        </div>
      )}
    </div>
  );
}

function ActivityCard() {
  const { data, error } = useSWR(`${API}?activity=1`, fetcher);
  const [f, setF] = useState({ u: "", t: "", q: "" });
  const acts = (data?.activity || []).filter((e) => (!f.u || e.un === f.u) && (!f.t || e.type === f.t) && (!f.q || (String(e.text) + " " + String(e.un)).toLowerCase().includes(f.q.toLowerCase())));
  const names = [...new Set((data?.activity || []).map((e) => e.un))].sort();
  return (
    <div style={cardBox}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}><div style={{ ...eyebrow, flex: 1 }}>Registro attività</div><Chip>{acts.length}</Chip></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 10 }}>
        <select style={input} value={f.u} onChange={(e) => setF((x) => ({ ...x, u: e.target.value }))}><option value="">Tutte le persone</option>{names.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <select style={input} value={f.t} onChange={(e) => setF((x) => ({ ...x, t: e.target.value }))}><option value="">Tutti i tipi</option>{Object.keys(ACT_LABEL).map((k) => <option key={k} value={k}>{ACT_LABEL[k]}</option>)}</select>
        <input style={input} placeholder="Cerca…" value={f.q} onChange={(e) => setF((x) => ({ ...x, q: e.target.value }))} />
      </div>
      {error && <Notice danger>{error.message}</Notice>}
      {!data && !error && <p style={hint}>Carico…</p>}
      <div style={{ maxHeight: 520, overflowY: "auto" }}>
        {acts.slice(0, 400).map((e, i) => { const d = new Date(Number(e.ts)); return (
          <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: i ? `1px solid ${CP.borderSoft}` : "none", fontSize: 13.5 }}>
            <time style={{ ...hint, fontSize: 12, minWidth: 48, ...NUM }}>{d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}<br />{d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</time>
            <span style={{ flex: 1, minWidth: 0 }}><b style={{ fontWeight: 500 }}>{e.un}</b> <Chip>{ACT_LABEL[e.type] || e.type}</Chip><span style={{ display: "block", color: CP.textSecondary, marginTop: 3 }}>{e.text}</span></span>
          </div>); })}
        {data && !acts.length && <p style={hint}>Nessuna attività con questi filtri.</p>}
      </div>
    </div>
  );
}
