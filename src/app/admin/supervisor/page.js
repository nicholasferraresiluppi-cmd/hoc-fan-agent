"use client";

// Supervisor account social (ott 2026) — rifà in HOC Pro lo strumento esterno
// "Automation › Supervisor": account social per creator e alterego, telefoni dei
// publisher, caselle mail, link in bio. Differenze volute rispetto a prima:
//  - le password non stanno in chiaro nelle tabelle: si vedono una alla volta,
//    e ogni visualizzazione resta nel registro (chi, quando, quale);
//  - le relazioni si calcolano (publisher dal telefono, account di una casella
//    dall'email), non si ricopiano a mano in due posti;
//  - le cose da sistemare (doppioni, telefoni senza credenziali, sospesi ancora
//    in programmazione…) le trova il sistema e si aprono con un clic.
// Logica in lib/supervisor-core.js (testata), dati in /api/admin/supervisor.

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Check, Copy, Eye, EyeOff, ExternalLink, Plus, Trash2, Upload, X, Search, KeyRound } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Metric, FilterChip, DataTable, Notice, SectionTitle, card, NUM } from "@/components/ds";
import { fmtInt, fmtAgo } from "@/lib/format";
import {
  ENUMS, PLATFORMS, PLATFORM_LABEL, PLATFORM_SHORT, SECRET_FIELDS, linkGroups, mapHeaders,
} from "@/lib/supervisor-core";
import { confirmDialog } from "@/components/AppDialogs";

const API = "/api/admin/supervisor";
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

const TABS = [
  ["panoramica", "Panoramica"],
  ["account", "Account"],
  ["telefoni", "Telefoni"],
  ["mail", "Mail"],
  ["link", "Link in bio"],
  ["registro", "Registro"],
  ["importa", "Importa"],
];

const btn = { display: "inline-flex", alignItems: "center", gap: 6, background: CP.surfaceAlt, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const btnPrimary = { ...btn, background: CP.accent, color: CP.accentInk, border: `1px solid ${CP.accent}`, fontWeight: 500 };
const btnSmall = { ...btn, padding: "3px 7px", fontSize: 12 };
const input = { width: "100%", boxSizing: "border-box", background: CP.bgSunken, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: FONTS.body };
const muted = { color: CP.textMuted };
const nowrap = { whiteSpace: "nowrap" };

// ── piccoli pezzi ───────────────────────────────────────────────────────────

const STATUS_TONE = {
  ok: { color: CP.accentGreen, border: CP.accentGreen },
  suspended: { color: CP.accentRed, border: CP.accentRed },
  not_recommended: { color: CP.attn, border: CP.attn },
};
function Pill({ children, tone, title }) {
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", padding: "1px 8px", borderRadius: 999, fontSize: 12, whiteSpace: "nowrap", border: `1px solid ${tone?.border || CP.border}`, color: tone?.color || CP.textSecondary }}>
      {children}
    </span>
  );
}
const enumLabel = (field, v) => (v ? ENUMS[field]?.[v] || v : "—");
function PlatformTag({ p }) {
  return <span title={PLATFORM_LABEL[p]} style={{ display: "inline-block", minWidth: 24, textAlign: "center", fontSize: 11, fontWeight: 500, padding: "1px 4px", borderRadius: 5, background: CP.surfaceAlt, border: `1px solid ${CP.borderSoft}`, color: CP.textSecondary }}>{PLATFORM_SHORT[p]}</span>;
}
function AccountRef({ a, onOpen }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen?.(a.id); }} disabled={!onOpen}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, cursor: onOpen ? "pointer" : "default", color: a.retired ? CP.textMuted : CP.textPrimary, font: "inherit", fontSize: 13, textDecoration: a.retired ? "line-through" : "none" }}>
      <PlatformTag p={a.platform} />@{a.username}
    </button>
  );
}
function Chips({ items, max = 3 }) {
  if (!items?.length) return <span style={muted}>—</span>;
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {items.slice(0, max).map((x) => <span key={x} style={{ fontSize: 12, padding: "1px 7px", borderRadius: 6, background: CP.surfaceAlt, color: CP.textSecondary, whiteSpace: "nowrap" }}>{x}</span>)}
      {items.length > max && <span style={{ fontSize: 12, ...muted }}>+{items.length - max}</span>}
    </span>
  );
}
function CopyBtn({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" style={btnSmall} aria-label={label || "Copia"} title={label || "Copia"}
      onClick={async (e) => { e.stopPropagation(); try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* appunti non disponibili */ } }}>
      {done ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

// Password: mai nella pagina finché non la chiedi. "Mostra" chiede al server (registrato),
// "Copia" la copia senza mostrarla, "Cambia" la sostituisce.
function SecretField({ kind, id, field, label, isSet, onChange, pending, onRevealed }) {
  const [shown, setShown] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(!id);
  useEffect(() => { setShown(null); setEdit(!id); setErr(null); }, [id, field]);
  async function reveal() {
    setBusy(true); setErr(null);
    try { const d = await post({ action: "reveal", kind, id, field }); onRevealed?.(); return d.value; }
    catch (e) { setErr(e.message); return null; }
    finally { setBusy(false); }
  }
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 12, color: CP.textSecondary }}>{label}</span>
      {edit ? (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input type="text" autoComplete="off" spellCheck={false} placeholder={isSet ? "nuovo valore" : "—"} value={pending ?? ""} onChange={(e) => onChange(e.target.value)} style={input} />
          {id && <button type="button" style={btn} onClick={() => { setEdit(false); onChange(undefined); }} aria-label="Annulla"><X size={13} /></button>}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
          <div style={{ ...input, display: "flex", alignItems: "center", minHeight: 33, ...NUM, color: isSet ? CP.textPrimary : CP.textMuted }}>
            {!isSet ? "non salvata" : shown != null ? shown : "••••••••"}
          </div>
          {isSet && (
            <button type="button" style={btn} disabled={busy} aria-label={shown != null ? "Nascondi" : "Mostra"} title="Mostra (resta nel registro)"
              onClick={async () => { if (shown != null) { setShown(null); return; } const v = await reveal(); if (v != null) setShown(v); }}>
              {shown != null ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
          {isSet && (
            <button type="button" style={btn} disabled={busy} aria-label="Copia" title="Copia senza mostrarla (resta nel registro)"
              onClick={async () => { const v = shown ?? (await reveal()); if (v != null) { try { await navigator.clipboard.writeText(v); setErr("Copiata"); setTimeout(() => setErr(null), 1400); } catch { setErr("Appunti non disponibili"); } } }}>
              <Copy size={13} />
            </button>
          )}
          <button type="button" style={btn} onClick={() => setEdit(true)}>{isSet ? "Cambia" : "Aggiungi"}</button>
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: err === "Copiata" ? CP.textMuted : CP.accentRed, marginTop: 3 }}>{err}</div>}
    </label>
  );
}

function Field({ label, children, wide }) {
  return (
    <label style={{ display: "block", gridColumn: wide ? "1 / -1" : undefined }}>
      <span style={{ fontSize: 12, color: CP.textSecondary }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}
function Select({ value, onChange, options, empty = "—" }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} style={input}>
      <option value="">{empty}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
const enumOptions = (field) => Object.entries(ENUMS[field]);
function Check2({ label, checked, onChange }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: CP.textPrimary, cursor: "pointer" }}>
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />{label}
    </label>
  );
}

// ── pannello laterale di un record ──────────────────────────────────────────

const BLANK = {
  account: { platform: "instagram", platformStatus: "ok", schedulingStatus: "active", creationStatus: "done", ownerType: "agency", postingType: "manual" },
  device: { type: "iphone", usageMode: "physical", publishers: [] },
  mailbox: { placements: [] },
};
const TITLE = { account: "account", device: "telefono", mailbox: "casella mail" };

function Drawer({ kind, id, data, onClose, onSaved, onOpen }) {
  const rows = kind === "account" ? data.accounts : kind === "device" ? data.devices : data.mailboxes;
  const rec = id ? rows.find((r) => r.id === id) : null;
  const [f, setF] = useState(() => rec ? { ...rec } : { ...BLANK[kind] });
  const [sec, setSec] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const { data: log, mutate: reloadLog } = useSWR(id ? `${API}?audit=1&kind=${kind}&id=${id}` : null, fetcher, { revalidateOnFocus: false });
  useEffect(() => { setF(rec ? { ...rec } : { ...BLANK[kind] }); setSec({}); setErr(null); }, [id, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (id && !rec) return null;
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const txt = (k, ph) => <input value={f[k] ?? ""} placeholder={ph} onChange={(e) => set(k)(e.target.value)} style={input} />;
  const creators = [...new Set(data.accounts.map((a) => a.creator).filter(Boolean))].sort();
  const alteregos = [...new Set(data.accounts.filter((a) => !f.creator || a.creator === f.creator).map((a) => a.alterego).filter(Boolean))].sort();
  const publishers = [...new Set(data.devices.flatMap((d) => d.publishers))].sort();

  async function save() {
    setBusy(true); setErr(null);
    const fields = { ...f };
    for (const k of ["id", "secrets", "device", "accounts", "linkedAccount", "mailboxId", "duplicate", "missing", "accountCount", "countByPlatform", "createdAt", "createdBy", "updatedAt", "updatedBy"]) delete fields[k];
    if (kind === "account") delete fields.publishers;
    const secrets = Object.fromEntries(Object.entries(sec).filter(([, v]) => v !== undefined));
    try {
      const d = await post({ action: "save", kind, id: id || undefined, fields, secrets });
      onSaved(d.record.id);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function del() {
    if (!(await confirmDialog({ title: `Eliminare ${TITLE[kind]} definitivamente?`, message: "Resta traccia nel registro.", ok: "Elimina", danger: true }))) return;
    setBusy(true); setErr(null);
    try { await post({ action: "delete", kind, id }); onSaved(null); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 };
  const secGrid = { display: "grid", gridTemplateColumns: "1fr", gap: 12 };
  const heading = kind === "account" ? (rec ? `@${rec.username}` : "Nuovo account") : kind === "device" ? (rec?.name || "Nuovo telefono") : (rec?.email || "Nuova casella");

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: CP.scrim || "rgba(6,8,12,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <aside onClick={(e) => e.stopPropagation()} role="dialog" aria-label={heading}
        style={{ width: "min(560px, 100vw)", height: "100%", overflowY: "auto", background: CP.panel, borderLeft: `1px solid ${CP.border}`, padding: "18px 20px 28px", boxSizing: "border-box", fontFamily: FONTS.body }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0, color: CP.textPrimary, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{heading}</h2>
          {kind === "account" && rec?.url && <a href={rec.url} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: "none" }}><ExternalLink size={13} />Apri</a>}
          <button type="button" onClick={onClose} style={btn} aria-label="Chiudi"><X size={14} /></button>
        </div>

        {kind === "account" && (
          <>
            <div style={grid}>
              <Field label="Nome utente">{txt("username", "senza @")}</Field>
              <Field label="Piattaforma"><Select value={f.platform} onChange={set("platform")} options={PLATFORMS.map((p) => [p, PLATFORM_LABEL[p]])} empty="Scegli" /></Field>
              <Field label="Creator">
                <input list="sup-creators" value={f.creator ?? ""} onChange={(e) => set("creator")(e.target.value)} style={input} />
                <datalist id="sup-creators">{creators.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Alterego">
                <input list="sup-alteregos" value={f.alterego ?? ""} placeholder="es. Segretaria" onChange={(e) => set("alterego")(e.target.value)} style={input} />
                <datalist id="sup-alteregos">{alteregos.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Lingua">{txt("language", "IT")}</Field>
              <Field label="Stato piattaforma"><Select value={f.platformStatus} onChange={set("platformStatus")} options={enumOptions("platformStatus")} /></Field>
              <Field label="Programmazione"><Select value={f.schedulingStatus} onChange={set("schedulingStatus")} options={enumOptions("schedulingStatus")} /></Field>
              <Field label="Creazione"><Select value={f.creationStatus} onChange={set("creationStatus")} options={enumOptions("creationStatus")} /></Field>
              <Field label="Di chi è"><Select value={f.ownerType} onChange={set("ownerType")} options={enumOptions("ownerType")} /></Field>
              <Field label="Pubblicazione"><Select value={f.postingType} onChange={set("postingType")} options={enumOptions("postingType")} /></Field>
              <Field label="Uso del telefono"><Select value={f.deviceUsage} onChange={set("deviceUsage")} options={enumOptions("deviceUsage")} /></Field>
              <Field label="Contenuti"><Select value={f.contentType} onChange={set("contentType")} options={enumOptions("contentType")} /></Field>
              <Field label="Telefono">
                <Select value={f.deviceId} onChange={set("deviceId")} empty="nessuno"
                  options={[...data.devices].sort((a, b) => a.name.localeCompare(b.name, "it", { numeric: true })).map((d) => [d.id, `${d.name}${d.publishers.length ? ` · ${d.publishers.join(", ")}` : ""}`])} />
              </Field>
              <Field label="Account collegato">
                <Select value={f.linkedAccountId} onChange={set("linkedAccountId")} empty="nessuno"
                  options={data.accounts.filter((a) => a.id !== id && (!f.creator || a.creator === f.creator)).map((a) => [a.id, `${PLATFORM_SHORT[a.platform]} @${a.username}`])} />
              </Field>
              <Field label="Link in bio" wide>{txt("linkInBio", "https://…")}</Field>
              <Field label="URL profilo" wide>{txt("url", "si compila dal nome utente")}</Field>
              <Field label="Email">
                <input list="sup-mails" value={f.email ?? ""} onChange={(e) => set("email")(e.target.value)} style={input} />
                <datalist id="sup-mails">{data.mailboxes.map((m) => <option key={m.id} value={m.email} />)}</datalist>
              </Field>
              <Field label="Numero di telefono">{txt("phone", "+39…")}</Field>
              <Field label="Username OnlyFans">{txt("onlyfansUsername")}</Field>
            </div>
            <div style={{ ...secGrid, marginTop: 12 }}>
              {Object.entries(SECRET_FIELDS.account).map(([k, l]) => (
                <SecretField key={k} kind="account" id={id} field={k} label={l} isSet={rec?.secrets?.[k]} pending={sec[k]} onRevealed={reloadLog} onChange={(v) => setSec((s) => ({ ...s, [k]: v }))} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14 }}>
              <Check2 label="Scraping attivo" checked={f.scrapingEnabled} onChange={set("scrapingEnabled")} />
              <Check2 label="Programmazione attiva" checked={f.schedulingEnabled} onChange={set("schedulingEnabled")} />
              <Check2 label="Ritirato" checked={f.retired} onChange={set("retired")} />
            </div>
            {rec && (
              <div style={{ marginTop: 14, fontSize: 13, color: CP.textSecondary, lineHeight: 1.7 }}>
                <div>Publisher (dal telefono): {rec.publishers.length ? rec.publishers.join(", ") : <span style={muted}>nessuno — si assegna nel telefono</span>}</div>
                {rec.email && <div>Casella: {rec.mailboxId ? <button type="button" onClick={() => onOpen("mailbox", rec.mailboxId)} style={{ background: "none", border: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer", font: "inherit" }}>{rec.email} →</button> : <span style={{ color: CP.attn }}>{rec.email} non è tra le caselle</span>}</div>}
                {rec.device && <div>Telefono: <button type="button" onClick={() => onOpen("device", rec.device.id)} style={{ background: "none", border: "none", padding: 0, color: CP.accentSoftText, cursor: "pointer", font: "inherit" }}>{rec.device.name} →</button></div>}
              </div>
            )}
          </>
        )}

        {kind === "device" && (
          <>
            <div style={grid}>
              <Field label="Nome">{txt("name", "iph-pub3")}</Field>
              <Field label="Tipo"><Select value={f.type} onChange={set("type")} options={enumOptions("deviceType")} /></Field>
              <Field label="Uso"><Select value={f.usageMode} onChange={set("usageMode")} options={enumOptions("deviceUsage")} /></Field>
              <Field label="Modello">{txt("model", "iPhone 12")}</Field>
              <Field label="Publisher (separati da virgola)" wide>
                <input list="sup-pubs" value={(f.publishers || []).join(", ")} onChange={(e) => set("publishers")(e.target.value.split(",").map((x) => x.trimStart()))} style={input} />
                <datalist id="sup-pubs">{publishers.map((p) => <option key={p} value={p} />)}</datalist>
              </Field>
              <Field label="IMEI">{txt("imei")}</Field>
              <Field label="Numero">{txt("phone", "+39…")}</Field>
              <Field label="Email iCloud" wide>{txt("icloudEmail")}</Field>
            </div>
            <div style={{ ...secGrid, marginTop: 12 }}>
              {Object.entries(SECRET_FIELDS.device).map(([k, l]) => (
                <SecretField key={k} kind="device" id={id} field={k} label={l} isSet={rec?.secrets?.[k]} pending={sec[k]} onRevealed={reloadLog} onChange={(v) => setSec((s) => ({ ...s, [k]: v }))} />
              ))}
            </div>
            <div style={{ marginTop: 12 }}><Field label="Note" wide><textarea value={f.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} rows={3} style={{ ...input, resize: "vertical" }} /></Field></div>
            {rec && (
              <div style={{ marginTop: 14 }}>
                {rec.missing.length > 0 && <Notice>Mancano: {rec.missing.join(", ")}.</Notice>}
                <SectionTitle aside={`${rec.accountCount} attivi`}>Account su questo telefono</SectionTitle>
                {rec.accounts.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{rec.accounts.map((a) => <AccountRef key={a.id} a={a} onOpen={(aid) => onOpen("account", aid)} />)}</div>
                ) : <p style={{ fontSize: 13, ...muted, margin: 0 }}>Nessuno. Si assegnano dalla scheda dell&apos;account.</p>}
              </div>
            )}
          </>
        )}

        {kind === "mailbox" && (
          <>
            <div style={grid}>
              <Field label="Email" wide>{txt("email", "nome@libero.it")}</Field>
              <Field label="Numero">{txt("phone", "+39…")}</Field>
              <Field label="Usata anche per (separati da virgola)">
                <input value={(f.placements || []).join(", ")} onChange={(e) => set("placements")(e.target.value.split(",").map((x) => x.trimStart()))} style={input} placeholder="Facebook, Ig: nome…" />
              </Field>
            </div>
            <div style={{ ...secGrid, marginTop: 12 }}>
              {Object.entries(SECRET_FIELDS.mailbox).map(([k, l]) => (
                <SecretField key={k} kind="mailbox" id={id} field={k} label={l} isSet={rec?.secrets?.[k]} pending={sec[k]} onRevealed={reloadLog} onChange={(v) => setSec((s) => ({ ...s, [k]: v }))} />
              ))}
            </div>
            <div style={{ marginTop: 12 }}><Field label="Note" wide><textarea value={f.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} rows={3} style={{ ...input, resize: "vertical" }} /></Field></div>
            {rec && (
              <div style={{ marginTop: 14 }}>
                <SectionTitle>Account con questa email</SectionTitle>
                {rec.accounts.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{rec.accounts.map((a) => <AccountRef key={a.id} a={a} onOpen={(aid) => onOpen("account", aid)} />)}</div>
                ) : <p style={{ fontSize: 13, ...muted, margin: 0 }}>Nessuno: l&apos;abbinamento è per indirizzo email, dalla scheda dell&apos;account.</p>}
              </div>
            )}
          </>
        )}

        {err && <div style={{ marginTop: 14 }}><Notice danger>{err}</Notice></div>}
        <div style={{ display: "flex", gap: 8, marginTop: 18, position: "sticky", bottom: -28, background: CP.panel, padding: "10px 0" }}>
          <button type="button" style={btnPrimary} disabled={busy} onClick={save}>{busy ? "Salvo…" : rec ? "Salva" : "Crea"}</button>
          <button type="button" style={btn} onClick={onClose}>Chiudi</button>
          <span style={{ flex: 1 }} />
          {rec && <button type="button" style={{ ...btn, color: CP.accentRed }} disabled={busy} onClick={del}><Trash2 size={13} />Elimina</button>}
        </div>

        {rec && (
          <div style={{ marginTop: 18 }}>
            <SectionTitle aside={`creato ${fmtAgo(rec.createdAt)}${rec.createdBy?.name ? ` da ${rec.createdBy.name}` : ""}`}>Storia</SectionTitle>
            {!log ? <p style={{ fontSize: 13, ...muted }}>Carico…</p> : log.log?.length ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12.5, color: CP.textSecondary, lineHeight: 1.7 }}>
                {log.log.slice(0, 20).map((e, i) => <li key={i}>{fmtAgo(e.at)} · {e.by?.name || "?"} · {auditText(e)}</li>)}
              </ul>
            ) : <p style={{ fontSize: 13, ...muted }}>Nessuna modifica registrata.</p>}
          </div>
        )}
      </aside>
    </div>
  );
}

const FIELD_IT = { username: "nome utente", platform: "piattaforma", creator: "creator", alterego: "alterego", platformStatus: "stato", schedulingStatus: "programmazione", creationStatus: "creazione", deviceId: "telefono", linkInBio: "link in bio", email: "email", retired: "ritirato", publishers: "publisher", name: "nome" };
function auditText(e) {
  const secretLabel = (f) => SECRET_FIELDS[e.kind]?.[f]?.toLowerCase() || f;
  if (e.action === "reveal") return `ha visto ${secretLabel(e.field)}`;
  if (e.action === "create") return "ha creato";
  if (e.action === "delete") return "ha eliminato";
  if (e.action === "import") return `import: ${e.created} nuovi, ${e.updated} aggiornati${e.skipped ? `, ${e.skipped} saltati` : ""}`;
  const parts = [...(e.fields || []).map((f) => FIELD_IT[f] || f), ...(e.secrets || []).map(secretLabel)];
  return parts.length ? `ha cambiato ${parts.join(", ")}` : "ha salvato senza cambiamenti";
}

// ── schede ──────────────────────────────────────────────────────────────────

const STATUS_COLS = [["ok", "Attivi"], ["suspended", "Sospesi"], ["not_recommended", "Non raccomandati"]];

function Overview({ data, goAccounts, goIssue }) {
  const s = data.stats;
  const owners = [["agency", "agenzia"], ["creator", "creator"]];
  return (
    <>
      <div style={{ ...card, padding: "16px 18px", display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 18 }}>
        <Metric label="Account attivi" value={fmtInt(s.activeTotal)} note={`${fmtInt(s.liveTotal)} creati, ${fmtInt(s.retired)} ritirati`} />
        <Metric label="Da creare" value={fmtInt(s.creation.to_do)} />
        <Metric label="In creazione" value={fmtInt(s.creation.in_progress)} />
        <Metric label="In riscaldamento" value={fmtInt(s.creation.warming)} />
        <Metric label="Doppioni" value={fmtInt(s.duplicates)} danger={s.duplicates > 0} />
        <Metric label="Telefoni" value={fmtInt(s.devices.total)} note={`${fmtInt(s.devices.unassigned)} senza publisher`} />
        <Metric label="Caselle mail" value={fmtInt(s.mailboxes)} />
      </div>

      <SectionTitle aside="clic su un numero per vedere gli account">Account per piattaforma e stato</SectionTitle>
      {s.platforms.length === 0 ? <Notice>Ancora nessun account. Parti da «Importa» (telefoni, poi mail, poi account) o crea il primo a mano.</Notice> : (
        <div className="ds-tbl-wrap" style={{ ...card, overflow: "auto", marginBottom: 22 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 460 }}>
            <thead><tr>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 500, color: CP.textMuted }}>Piattaforma</th>
              {STATUS_COLS.map(([k, l]) => <th key={k} style={{ textAlign: "right", padding: "10px 12px", fontSize: 12, fontWeight: 500, color: CP.textMuted }}>{l}</th>)}
            </tr></thead>
            <tbody>
              {s.platforms.flatMap((p) => owners.filter(([o]) => STATUS_COLS.some(([k]) => s.grid[`${p}|${o}|${k}`])).map(([o, ol]) => (
                <tr key={`${p}${o}`} style={{ borderTop: `1px solid ${CP.borderSoft}` }}>
                  <td style={{ padding: "9px 12px" }}><PlatformTag p={p} /> {PLATFORM_LABEL[p]} <span style={muted}>· {ol}</span></td>
                  {STATUS_COLS.map(([k]) => {
                    const n = s.grid[`${p}|${o}|${k}`] || 0;
                    return (
                      <td key={k} style={{ padding: "9px 12px", textAlign: "right", ...NUM }}>
                        {n ? <button type="button" onClick={() => goAccounts({ platform: p, owner: o, status: k })} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: k === "ok" ? CP.textPrimary : STATUS_TONE[k].color }}>{fmtInt(n)}</button> : <span style={muted}>0</span>}
                      </td>
                    );
                  })}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}

      <SectionTitle aside={data.issues.length ? "trovate dal sistema, si aprono con un clic" : null}>Da sistemare</SectionTitle>
      {data.issues.length === 0 ? <p style={{ fontSize: 13, ...muted }}>Niente da sistemare.</p> : (
        <div style={{ ...card }}>
          {data.issues.map((i, n) => (
            <button key={i.code} type="button" onClick={() => goIssue(i)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: n ? `1px solid ${CP.borderSoft}` : "none", background: "none", borderLeft: "none", borderRight: "none", borderBottom: "none", cursor: "pointer", textAlign: "left", fontFamily: FONTS.body, color: CP.textPrimary, fontSize: 14 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: i.severity === "critical" ? CP.accentRed : i.severity === "warning" ? CP.attn : CP.textMuted }} />
              <span style={{ flex: 1 }}>{i.title}</span>
              <span style={{ ...NUM, color: CP.textSecondary }}>{fmtInt(i.count)}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function Accounts({ data, filters, setFilters, open }) {
  const { q = "", creator = "", platform = "", status = "", owner = "", lang = "", publisher = "", ids = null, idsLabel = "", retired = false } = filters;
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v ?? "" }));
  const creators = useMemo(() => [...new Set(data.accounts.map((a) => a.creator).filter(Boolean))].sort(), [data]);
  const langs = useMemo(() => [...new Set(data.accounts.map((a) => a.language).filter(Boolean))].sort(), [data]);
  const pubs = useMemo(() => [...new Set(data.devices.flatMap((d) => d.publishers))].sort(), [data]);
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase().replace(/^@/, "");
    const idSet = ids ? new Set(ids) : null;
    return data.accounts.filter((a) =>
      (idSet ? idSet.has(a.id) : retired || !a.retired)
      && (!creator || a.creator === creator) && (!platform || a.platform === platform) && (!status || a.platformStatus === status)
      && (!owner || a.ownerType === owner) && (!lang || a.language === lang) && (!publisher || a.publishers.includes(publisher))
      && (!qq || [a.username, a.alterego, a.creator, a.email, a.device?.name].some((x) => x && x.toLowerCase().includes(qq))));
  }, [data, q, creator, platform, status, owner, lang, publisher, ids, retired]);

  const columns = [
    { key: "username", label: "Account", sort: (a) => a.username, render: (a) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <PlatformTag p={a.platform} /><span style={{ textDecoration: a.retired ? "line-through" : "none" }}>@{a.username}</span>
        {a.language && <span style={{ fontSize: 11, ...muted }}>{a.language}</span>}
        {a.duplicate && <Pill tone={STATUS_TONE.suspended}>doppio</Pill>}
      </span>) },
    ...(creator ? [] : [{ key: "creator", label: "Creator", render: (a) => a.creator ? <span style={nowrap}>{a.creator}</span> : <span style={muted}>—</span> }]),
    ...(creator ? [] : [{ key: "alterego", label: "Alterego", render: (a) => a.alterego ? <span style={nowrap}>{a.alterego}</span> : <span style={muted}>—</span> }]),
    { key: "platformStatus", label: "Stato", render: (a) => (
      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
        <Pill tone={STATUS_TONE[a.platformStatus]}>{enumLabel("platformStatus", a.platformStatus)}</Pill>
        {a.creationStatus !== "done" && <Pill>{enumLabel("creationStatus", a.creationStatus)}</Pill>}
      </span>) },
    { key: "schedulingStatus", label: "Programmazione", muted: true, render: (a) => enumLabel("schedulingStatus", a.schedulingStatus) },
    { key: "ownerType", label: "Di chi", muted: true, render: (a) => enumLabel("ownerType", a.ownerType) },
    { key: "device", label: "Telefono", sort: (a) => a.device?.name || "", render: (a) => a.device ? <span style={nowrap}>{a.device.name}</span> : a.deviceUsage === "remote" ? <span style={muted}>remoto</span> : <span style={muted}>—</span> },
    { key: "publishers", label: "Publisher", sort: (a) => a.publishers[0] || "", render: (a) => <Chips items={a.publishers} max={2} /> },
    { key: "contentType", label: "Contenuti", muted: true, render: (a) => enumLabel("contentType", a.contentType) },
    { key: "pw", label: "Password", sortable: false, render: (a) => a.secrets?.password ? <KeyRound size={14} color={CP.textMuted} aria-label="salvata" /> : <span style={{ color: CP.attn, fontSize: 12 }}>manca</span> },
    { key: "linkInBio", label: "Link in bio", render: (a) => a.linkInBio ? <a href={a.linkInBio} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: CP.accentSoftText, fontSize: 12.5, maxWidth: 180, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}>{a.linkInBio.replace(/^https?:\/\/(www\.)?/, "")}</a> : <span style={muted}>—</span> },
  ];

  // con una creator scelta: un gruppo per alterego, come nello strumento di prima
  const groups = useMemo(() => {
    if (!creator) return null;
    const m = new Map();
    for (const a of rows) { const k = a.alterego || "Senza alterego"; m.set(k, [...(m.get(k) || []), a]); }
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0], "it"));
  }, [rows, creator]);

  const active = [creator, platform, status, owner, lang, publisher, q].some(Boolean) || ids;
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 260 }}>
          <Search size={14} color={CP.textMuted} style={{ position: "absolute", left: 9, top: 9 }} />
          <input value={q} onChange={(e) => set("q")(e.target.value)} placeholder="Cerca nome, email, telefono…" style={{ ...input, paddingLeft: 28 }} />
        </div>
        <div style={{ width: 170 }}><Select value={creator} onChange={set("creator")} options={creators.map((c) => [c, c])} empty="Tutte le creator" /></div>
        <div style={{ width: 140 }}><Select value={platform} onChange={set("platform")} options={PLATFORMS.map((p) => [p, PLATFORM_LABEL[p]])} empty="Piattaforma" /></div>
        <div style={{ width: 160 }}><Select value={status} onChange={set("status")} options={enumOptions("platformStatus")} empty="Stato" /></div>
        <div style={{ width: 120 }}><Select value={owner} onChange={set("owner")} options={enumOptions("ownerType")} empty="Di chi" /></div>
        <div style={{ width: 100 }}><Select value={lang} onChange={set("lang")} options={langs.map((l) => [l, l])} empty="Lingua" /></div>
        <div style={{ width: 160 }}><Select value={publisher} onChange={set("publisher")} options={pubs.map((p) => [p, p])} empty="Publisher" /></div>
        <Check2 label="Anche ritirati" checked={retired} onChange={set("retired")} />
        {active && <button type="button" style={btn} onClick={() => setFilters({})}>Azzera</button>}
      </div>
      {ids && <div style={{ marginBottom: 10 }}><FilterChip label={`${idsLabel} · ${ids.length}`} active closable onClick={() => setFilters((f) => ({ ...f, ids: null, idsLabel: "" }))} /></div>}
      <p style={{ fontSize: 13, ...muted, margin: "0 0 10px" }}>{fmtInt(rows.length)} account</p>
      {groups ? groups.map(([g, rs]) => (
        <div key={g} style={{ marginBottom: 16 }}>
          <SectionTitle aside={`${rs.length}`}>{g}</SectionTitle>
          <DataTable columns={columns} rows={rs} onRowClick={(a) => open("account", a.id)} minWidth={900} density="compact" />
        </div>
      )) : <DataTable columns={columns} rows={rows} onRowClick={(a) => open("account", a.id)} minWidth={1000} density="compact" maxHeight="70vh" empty="Nessun account con questi filtri." />}
    </>
  );
}

function Devices({ data, filters, setFilters, open }) {
  const { q = "", publisher = "", missing = false, ids = null, idsLabel = "" } = filters;
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v ?? "" }));
  const pubs = useMemo(() => [...new Set(data.devices.flatMap((d) => d.publishers))].sort(), [data]);
  const s = data.stats.devices;
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const idSet = ids ? new Set(ids) : null;
    return data.devices.filter((d) => (!idSet || idSet.has(d.id))
      && (!publisher || (publisher === "__none" ? !d.publishers.length : d.publishers.includes(publisher)))
      && (!missing || d.missing.length)
      && (!qq || [d.name, d.model, d.imei, d.phone, ...d.accounts.map((a) => a.username)].some((x) => x && x.toLowerCase().includes(qq))));
  }, [data, q, publisher, missing, ids]);
  const columns = [
    { key: "name", label: "Telefono", sort: (d) => d.name.replace(/\d+/g, (n) => n.padStart(5, "0")), render: (d) => <span>{d.name} <span style={{ fontSize: 12, ...muted }}>{d.model || ""}</span></span> },
    { key: "publishers", label: "Publisher", sort: (d) => d.publishers[0] || "", render: (d) => <Chips items={d.publishers} max={2} /> },
    { key: "accounts", label: "Account", sortable: false, render: (d) => d.accounts.length ? <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>{d.accounts.slice(0, 3).map((a) => <AccountRef key={a.id} a={a} onOpen={(id) => open("account", id)} />)}{d.accounts.length > 3 && <span style={{ fontSize: 12, ...muted }}>+{d.accounts.length - 3}</span>}</span> : <span style={muted}>—</span> },
    { key: "accountCount", label: "N.", align: "right" },
    { key: "ig", label: "IG", align: "right", sort: (d) => d.countByPlatform.instagram || 0, render: (d) => d.countByPlatform.instagram || 0 },
    { key: "tt", label: "TT", align: "right", sort: (d) => d.countByPlatform.tiktok || 0, render: (d) => d.countByPlatform.tiktok || 0 },
    { key: "missing", label: "Credenziali", sort: (d) => d.missing.length, render: (d) => d.missing.length ? <span style={{ color: CP.attn, fontSize: 12.5 }} title={d.missing.join(", ")}>mancano {d.missing.length}</span> : <span style={{ color: CP.accentGreen, fontSize: 12.5 }}>complete</span> },
  ];
  return (
    <>
      <div style={{ ...card, padding: "16px 18px", display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 16 }}>
        <Metric label="Con publisher" value={fmtInt(s.assigned)} />
        <Metric label="Senza publisher" value={fmtInt(s.unassigned)} />
        <Metric label="Credenziali mancanti" value={fmtInt(s.missingCredentials)} attn={s.missingCredentials > 0} note="IMEI, modello, email e password iCloud, numero" />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input value={q} onChange={(e) => set("q")(e.target.value)} placeholder="Cerca telefono, IMEI, account…" style={{ ...input, maxWidth: 260 }} />
        <div style={{ width: 190 }}><Select value={publisher} onChange={set("publisher")} options={[["__none", "Senza publisher"], ...pubs.map((p) => [p, p])]} empty="Tutti i publisher" /></div>
        <Check2 label="Solo con credenziali mancanti" checked={missing} onChange={set("missing")} />
      </div>
      {ids && <div style={{ marginBottom: 10 }}><FilterChip label={`${idsLabel} · ${ids.length}`} active closable onClick={() => setFilters((f) => ({ ...f, ids: null, idsLabel: "" }))} /></div>}
      <DataTable columns={columns} rows={rows} onRowClick={(d) => open("device", d.id)} minWidth={820} density="compact" maxHeight="70vh" defaultSort={{ key: "name", dir: 1 }} empty="Nessun telefono." />
    </>
  );
}

function Mailboxes({ data, filters, setFilters, open }) {
  const { q = "", ids = null, idsLabel = "" } = filters;
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const idSet = ids ? new Set(ids) : null;
    return data.mailboxes.filter((m) => (!idSet || idSet.has(m.id)) && (!qq || [m.email, m.phone, ...m.placements, ...m.accounts.map((a) => a.username)].some((x) => x && x.toLowerCase().includes(qq))));
  }, [data, q, ids]);
  const columns = [
    { key: "email", label: "Email", render: (m) => <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{m.email}<CopyBtn text={m.email} label="Copia email" /></span> },
    { key: "phone", label: "Numero", muted: true, render: (m) => m.phone || "—" },
    { key: "pw", label: "Password", sortable: false, render: (m) => m.secrets?.password ? <KeyRound size={14} color={CP.textMuted} aria-label="salvata" /> : <span style={{ color: CP.attn, fontSize: 12 }}>manca</span> },
    { key: "accounts", label: "Account", sort: (m) => m.accounts.length, render: (m) => m.accounts.length ? <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>{m.accounts.map((a) => <AccountRef key={a.id} a={a} onOpen={(id) => open("account", id)} />)}</span> : <span style={muted}>—</span> },
    { key: "placements", label: "Usata anche per", sortable: false, render: (m) => <Chips items={m.placements} /> },
  ];
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input value={q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Cerca email, numero, account…" style={{ ...input, maxWidth: 280 }} />
        <span style={{ fontSize: 13, ...muted }}>{fmtInt(rows.length)} caselle · la password si vede dalla scheda, una alla volta</span>
      </div>
      {ids && <div style={{ marginBottom: 10 }}><FilterChip label={`${idsLabel} · ${ids.length}`} active closable onClick={() => setFilters((f) => ({ ...f, ids: null, idsLabel: "" }))} /></div>}
      <DataTable columns={columns} rows={rows} onRowClick={(m) => open("mailbox", m.id)} minWidth={760} density="compact" maxHeight="70vh" empty="Nessuna casella." />
    </>
  );
}

function Links({ data, open }) {
  const groups = useMemo(() => linkGroups(data), [data]);
  if (!groups.length) return <p style={{ fontSize: 13, ...muted }}>Nessun account attivo.</p>;
  return (
    <>
      <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", maxWidth: 760 }}>Dove porta la bio di ogni account attivo, raggruppato per link (senza i parametri). Serve a vedere a colpo d&apos;occhio quali account mandano traffico alla stessa pagina e quali non hanno un link.</p>
      <div style={{ ...card }}>
        {groups.map((g, i) => (
          <div key={g.link || "none"} style={{ padding: "12px 16px", borderTop: i ? `1px solid ${CP.borderSoft}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              {g.link ? <a href={g.raw} target="_blank" rel="noopener noreferrer" style={{ color: CP.textPrimary, fontSize: 14, fontWeight: 500 }}>{g.link}</a> : <span style={{ fontSize: 14, fontWeight: 500, color: CP.attn }}>Senza link in bio</span>}
              <span style={{ fontSize: 13, ...muted, ...NUM }}>{g.accounts.length}</span>
              {g.link && <CopyBtn text={g.raw} label="Copia link" />}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{g.accounts.map((a) => <AccountRef key={a.id} a={a} onOpen={(id) => open("account", id)} />)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Registry({ open }) {
  const { data, error } = useSWR(`${API}?audit=1`, fetcher);
  if (error) return <Notice danger>{error.message}</Notice>;
  if (!data) return <p style={{ fontSize: 13, ...muted }}>Carico…</p>;
  const columns = [
    { key: "at", label: "Quando", sort: (e) => e.at, render: (e) => <span style={NUM}>{new Date(e.at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span> },
    { key: "by", label: "Chi", sort: (e) => e.by?.name || "", render: (e) => e.by?.name || "?" },
    { key: "label", label: "Cosa", render: (e) => e.label || TITLE[e.kind] },
    { key: "action", label: "Azione", render: (e) => <span style={{ color: e.action === "reveal" ? CP.attn : CP.textPrimary }}>{auditText(e)}</span> },
  ];
  return (
    <>
      <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", maxWidth: 760 }}>Ogni volta che qualcuno vede o copia una password resta qui, insieme a creazioni, modifiche ed eliminazioni (ultime 1.000 azioni).</p>
      <DataTable columns={columns} rows={data.log.map((e, i) => ({ ...e, key: i }))} defaultSort={{ key: "at", dir: -1 }} onRowClick={(e) => e.id && e.action !== "delete" && e.action !== "import" && open(e.kind, e.id)} minWidth={640} density="compact" maxHeight="70vh" empty="Ancora nessuna azione." />
    </>
  );
}

const IMPORT_KINDS = [["device", "Telefoni"], ["mailbox", "Caselle mail"], ["account", "Account"]];
function Importer({ onDone, crypto }) {
  const [kind, setKind] = useState("device");
  const [file, setFile] = useState(null); // { name, headers, rows }
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  const mapping = useMemo(() => (file ? mapHeaders(kind, file.headers) : null), [file, kind]);
  useEffect(() => { setPlan(null); setResult(null); }, [kind, file]);

  async function read(f) {
    setErr(null); setFile(null);
    try {
      const XLSX = await import("xlsx"); // pesante: caricata solo qui
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const sh = wb.Sheets[wb.SheetNames[0]];
      // raw: i numeri lunghi (IMEI, telefoni) restano interi, mai in notazione scientifica
      const rows = XLSX.utils.sheet_to_json(sh, { defval: "", raw: true }).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? String(v) : v])));
      const headers = (XLSX.utils.sheet_to_json(sh, { header: 1 })[0] || []).map(String);
      if (!rows.length) throw new Error("Il file non ha righe");
      setFile({ name: f.name, headers, rows });
    } catch (e) { setErr(e.message || "File non leggibile"); }
  }
  async function run(dryRun) {
    setBusy(true); setErr(null);
    try {
      // solo le colonne riconosciute partono verso il server
      const cols = Object.keys(mapping.mapping);
      const rows = file.rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
      const d = await post({ action: "import", kind, rows, mapping: mapping.mapping, dryRun });
      if (dryRun) setPlan(d.report); else { setResult(d.report); setPlan(null); onDone(); }
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  const rep = result || plan;
  return (
    <div style={{ maxWidth: 820 }}>
      <p style={{ fontSize: 13, color: CP.textSecondary, margin: "0 0 12px", lineHeight: 1.6 }}>
        Esporta ogni tabella dallo strumento di prima in CSV (o Excel) e caricala qui, in quest&apos;ordine: <b style={{ fontWeight: 500 }}>telefoni, caselle mail, account</b> — così gli account trovano il loro telefono per nome.
        Le righe già presenti (stesso nome utente e piattaforma, stesso telefono, stessa email) si aggiornano invece di duplicarsi. Le password vengono cifrate prima di essere salvate.
      </p>
      {!crypto && <Notice danger>La cifratura non è configurata sul server: le password nel file verrebbero scartate.</Notice>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {IMPORT_KINDS.map(([k, l]) => <FilterChip key={k} label={l} active={kind === k} onClick={() => setKind(k)} />)}
        <label style={{ ...btn, marginLeft: 8 }}>
          <Upload size={14} />{file ? file.name : "Scegli file"}
          <input type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
        </label>
      </div>
      {err && <Notice danger>{err}</Notice>}
      {file && mapping && (
        <div style={{ ...card, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: CP.textSecondary, marginBottom: 8 }}>{fmtInt(file.rows.length)} righe · colonne riconosciute:</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {Object.entries(mapping.mapping).map(([c, fld]) => <span key={c} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: CP.surfaceAlt, color: fld.startsWith("secret:") ? CP.attn : CP.textPrimary }}>{c} → {fld.startsWith("secret:") ? "password (cifrata)" : FIELD_IT[fld] || fld}</span>)}
          </div>
          {mapping.ignored.length > 0 && <div style={{ fontSize: 12.5, ...muted }}>Ignorate: {mapping.ignored.join(", ")}</div>}
          {!Object.keys(mapping.mapping).length && <Notice danger>Nessuna colonna riconosciuta: è il file giusto per «{IMPORT_KINDS.find((x) => x[0] === kind)[1]}»?</Notice>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" style={btn} disabled={busy || !Object.keys(mapping.mapping).length} onClick={() => run(true)}>{busy && !plan ? "Controllo…" : "Prova senza salvare"}</button>
            {plan && <button type="button" style={btnPrimary} disabled={busy} onClick={() => run(false)}>{busy ? "Importo…" : `Importa (${plan.created} nuovi, ${plan.updated} aggiornati)`}</button>}
          </div>
        </div>
      )}
      {rep && (
        <div style={{ ...card, padding: "14px 16px" }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>{result ? "Importato" : "Anteprima"}: {fmtInt(rep.created)} nuovi, {fmtInt(rep.updated)} aggiornati, {fmtInt(rep.skipped.length)} saltati</div>
          {[...rep.skipped.map((s) => ({ ...s, t: "saltata" })), ...rep.warnings.map((s) => ({ ...s, t: "avviso" }))].slice(0, 60).map((s, i) => (
            <div key={i} style={{ fontSize: 12.5, color: s.t === "saltata" ? CP.accentRed : CP.attn, lineHeight: 1.6 }}>Riga {s.row} ({s.t}): {s.reason}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── pagina ──────────────────────────────────────────────────────────────────

export default function SupervisorPage() {
  const { data, error, mutate } = useSWR(API, fetcher, { revalidateOnFocus: false });
  const [tab, setTab] = useState("panoramica");
  const [drawer, setDrawer] = useState(null); // { kind, id }
  const [filters, setFilters] = useState({ account: {}, device: {}, mailbox: {} });
  useEffect(() => {
    try { const t = new URLSearchParams(window.location.search).get("tab"); if (t && TABS.some(([k]) => k === t)) setTab(t); } catch {}
  }, []);
  const go = (t) => {
    setTab(t);
    try { const u = new URL(window.location.href); u.searchParams.set("tab", t); window.history.replaceState(null, "", u); } catch {}
  };
  const open = (kind, id = null) => setDrawer({ kind, id });
  const setF = (kind) => (fn) => setFilters((all) => ({ ...all, [kind]: typeof fn === "function" ? fn(all[kind]) : fn }));
  const newKind = tab === "telefoni" ? "device" : tab === "mail" ? "mailbox" : "account";

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 24px 60px", fontFamily: FONTS.body, color: CP.textPrimary }}>
      <PageHead crumbs={[{ label: "Marketing" }, { label: "Account social" }]} title="Account social"
        subtitle="Gli account di promozione per creator e alterego, i telefoni dei publisher e le caselle mail. Le password si vedono una alla volta e restano nel registro."
        actions={data && !["registro", "importa", "link"].includes(tab) ? <button type="button" style={btnPrimary} onClick={() => open(newKind)}><Plus size={14} />{newKind === "device" ? "Nuovo telefono" : newKind === "mailbox" ? "Nuova casella" : "Nuovo account"}</button> : null} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
        {TABS.map(([k, l]) => {
          const n = !data ? null : k === "account" ? data.accounts.filter((a) => !a.retired).length : k === "telefoni" ? data.devices.length : k === "mail" ? data.mailboxes.length : k === "panoramica" && data.issues.length ? data.issues.length : null;
          return <FilterChip key={k} label={n != null ? `${l} · ${fmtInt(n)}` : l} attn={k === "panoramica" && n > 0 && tab !== k} active={tab === k} onClick={() => go(k)} />;
        })}
      </div>
      {error && <Notice danger>{error.message}</Notice>}
      {!data && !error && <p style={{ fontSize: 13, ...muted }}>Carico…</p>}
      {data && (
        <>
          {tab === "panoramica" && (
            <Overview data={data}
              goAccounts={(f) => { setFilters((a) => ({ ...a, account: f })); go("account"); }}
              goIssue={(i) => {
                const t = i.target === "device" ? "telefoni" : i.target === "mailbox" ? "mail" : "account";
                setFilters((a) => ({ ...a, [i.target]: { ids: i.ids, idsLabel: i.title, retired: true } }));
                go(t);
              }} />
          )}
          {tab === "account" && <Accounts data={data} filters={filters.account} setFilters={setF("account")} open={open} />}
          {tab === "telefoni" && <Devices data={data} filters={filters.device} setFilters={setF("device")} open={open} />}
          {tab === "mail" && <Mailboxes data={data} filters={filters.mailbox} setFilters={setF("mailbox")} open={open} />}
          {tab === "link" && <Links data={data} open={open} />}
          {tab === "registro" && <Registry open={open} />}
          {tab === "importa" && <Importer crypto={data.crypto} onDone={() => mutate()} />}
          {drawer && (
            <Drawer key={`${drawer.kind}:${drawer.id || "new"}`} kind={drawer.kind} id={drawer.id} data={data} onOpen={open}
              onClose={() => setDrawer(null)}
              onSaved={async (id) => { await mutate(); setDrawer(id ? { kind: drawer.kind, id } : null); }} />
          )}
        </>
      )}
    </div>
  );
}

