// Supervisor account social — archivio in KV (namespace isolato `sup:*`).
//
// Una chiave compressa per tipo (gzip+base64, prefisso "gz1:", come scouting-store
// dopo l'incidente banda del 4/10): qualche centinaio di righe a tipo, lette solo
// da /admin/supervisor. Ogni scrittura rilegge la chiave appena prima di scrivere.
//
// Chiavi:
//   sup:account | sup:device | sup:mailbox   { rev, at, records: [...] }
//   sup:audit                                 registro (LPUSH, cap 1000): chi ha visto/cambiato cosa
//
// Segreti: dentro ogni record come `_s: { campo: "<AES-GCM>" }`. Escono dallo store
// SOLO come `secrets: { campo: true }`; il valore in chiaro solo da revealSecret(),
// che lascia traccia nel registro. Chiave = SOCIAL_PROXY_ENCRYPTION_KEY (stesso
// dominio: credenziali degli account social; già in produzione).
import { kv } from "@vercel/kv";
import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { encryptSecret, decryptSecret } from "@/lib/social-proxy-crypto";
import { KINDS, SECRET_FIELDS, normalizeRecord, validateRecord, naturalKey, normHandle } from "@/lib/supervisor-core";

const GZ = "gz1:";
const key = (kind) => `sup:${kind}`;
const AUDIT = "sup:audit";
const AUDIT_CAP = 1000;

const enc = (v) => GZ + gzipSync(Buffer.from(JSON.stringify(v), "utf8")).toString("base64");
const dec = (raw) => {
  if (typeof raw === "string" && raw.startsWith(GZ)) return JSON.parse(gunzipSync(Buffer.from(raw.slice(GZ.length), "base64")).toString("utf8"));
  return raw || { rev: 0, records: [] };
};

export function cryptoConfigured() {
  const hex = process.env.SOCIAL_PROXY_ENCRYPTION_KEY;
  return Boolean(hex && hex.length === 64);
}

async function load(kind) {
  if (!KINDS.includes(kind)) throw new Error("tipo sconosciuto");
  return dec(await kv.get(key(kind)));
}
async function save(kind, doc) {
  doc.rev = (doc.rev || 0) + 1;
  doc.at = Date.now();
  await kv.set(key(kind), enc(doc));
}

/** Record senza i valori segreti: solo quali sono impostati. */
const pub = (r) => {
  const { _s, ...rest } = r;
  return { ...rest, secrets: Object.fromEntries(Object.keys(_s || {}).map((k) => [k, true])) };
};

export async function loadAll() {
  const [a, d, m] = await Promise.all(KINDS.map(load));
  return { accounts: a.records.map(pub), devices: d.records.map(pub), mailboxes: m.records.map(pub) };
}

export async function audit(entry) {
  try {
    await kv.lpush(AUDIT, JSON.stringify({ ...entry, at: Date.now() }));
    await kv.ltrim(AUDIT, 0, AUDIT_CAP - 1);
  } catch (e) { console.error("sup audit:", e?.message || e); }
}
export async function getAudit({ limit = 100, kind, id } = {}) {
  const raw = (await kv.lrange(AUDIT, 0, AUDIT_CAP - 1)) || [];
  const all = raw.map((x) => (typeof x === "string" ? JSON.parse(x) : x));
  return all.filter((e) => (!kind || e.kind === kind) && (!id || e.id === id)).slice(0, limit);
}

/** Applica i segreti in arrivo: stringa non vuota = imposta, null/"" = cancella, assente = lascia. */
function applySecrets(kind, rec, secrets) {
  if (!secrets) return [];
  const allowed = SECRET_FIELDS[kind];
  const changed = [];
  rec._s = { ...(rec._s || {}) };
  for (const [f, v] of Object.entries(secrets)) {
    if (!allowed[f] || v === undefined) continue;
    if (v === null || v === "") { if (rec._s[f]) { delete rec._s[f]; changed.push(f); } continue; }
    if (!cryptoConfigured()) throw new Error("Cifratura non configurata: impossibile salvare password");
    rec._s[f] = encryptSecret(String(v));
    changed.push(f);
  }
  return changed;
}

/** Crea (senza id) o aggiorna un record. Ritorna { ok, record } o { ok:false, errors }. */
export async function upsert(kind, { id, fields = {}, secrets }, by) {
  const doc = await load(kind);
  const idx = id ? doc.records.findIndex((r) => r.id === id) : -1;
  if (id && idx < 0) return { ok: false, status: 404, errors: ["Record non trovato"] };
  const prev = idx >= 0 ? doc.records[idx] : null;
  const norm = normalizeRecord(kind, fields, prev || {});
  const errors = validateRecord(kind, norm, doc.records, id || null);
  if (kind === "account") await checkRefs(norm, errors);
  if (errors.length) return { ok: false, status: 400, errors };
  const now = Date.now();
  const rec = prev ? { ...prev, ...norm, updatedAt: now, updatedBy: by } : { id: randomUUID(), ...norm, createdAt: now, createdBy: by, updatedAt: now, updatedBy: by };
  const changedSecrets = applySecrets(kind, rec, secrets);
  if (idx >= 0) doc.records[idx] = rec; else doc.records.push(rec);
  await save(kind, doc);
  const changed = prev ? Object.keys(norm).filter((k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(norm[k] ?? null)) : [];
  await audit({ kind, id: rec.id, label: labelOf(kind, rec), action: prev ? "update" : "create", by, fields: changed, secrets: changedSecrets });
  return { ok: true, record: pub(rec) };
}

async function checkRefs(acc, errors) {
  if (acc.deviceId) {
    const d = await load("device");
    if (!d.records.some((r) => r.id === acc.deviceId)) errors.push("Il telefono scelto non esiste più");
  }
}

export async function remove(kind, id, by) {
  const doc = await load(kind);
  const rec = doc.records.find((r) => r.id === id);
  if (!rec) return { ok: false, status: 404, errors: ["Record non trovato"] };
  if (kind === "device") {
    const accs = await load("account");
    const using = accs.records.filter((a) => a.deviceId === id && !a.retired);
    if (using.length) return { ok: false, status: 409, errors: [`Il telefono ha ancora ${using.length} account attivi: spostali prima di eliminarlo`] };
    // gli account ritirati che lo citavano restano senza telefono
    let touched = false;
    for (const a of accs.records) if (a.deviceId === id) { a.deviceId = null; touched = true; }
    if (touched) await save("account", accs);
  }
  // chi era collegato a questo account resta senza collegamento (stesso documento, salvato sotto)
  if (kind === "account") for (const a of doc.records) if (a.linkedAccountId === id) a.linkedAccountId = null;
  doc.records = doc.records.filter((r) => r.id !== id);
  await save(kind, doc);
  await audit({ kind, id, label: labelOf(kind, rec), action: "delete", by });
  return { ok: true };
}

/** Il valore in chiaro di UN segreto, con traccia nel registro. */
export async function revealSecret(kind, id, field, by) {
  if (!SECRET_FIELDS[kind]?.[field]) return { ok: false, status: 400, errors: ["Campo non segreto"] };
  const doc = await load(kind);
  const rec = doc.records.find((r) => r.id === id);
  if (!rec) return { ok: false, status: 404, errors: ["Record non trovato"] };
  const c = rec._s?.[field];
  if (!c) return { ok: true, value: null };
  const value = decryptSecret(c);
  await audit({ kind, id, label: labelOf(kind, rec), action: "reveal", field, by });
  return { ok: true, value };
}

export function labelOf(kind, r) {
  if (kind === "account") return `${r.platform}:@${r.username}`;
  if (kind === "device") return r.name;
  return r.email;
}

/**
 * Import di righe già convertite (rowsToInputs). Chiave naturale presente →
 * aggiorna solo i campi presenti nel foglio; altrimenti crea. I riferimenti per
 * nome (telefono, account collegato) si risolvono dopo, così l'ordine dei fogli
 * conta poco. Ritorna il resoconto riga per riga.
 */
export async function importRows(kind, inputs, by, { dryRun = false } = {}) {
  const doc = await load(kind);
  const devices = kind === "account" ? (await load("device")).records : [];
  const devByName = new Map(devices.map((d) => [d.name.toLowerCase(), d.id]));
  const byKey = new Map(doc.records.map((r) => [naturalKey(kind, r), r]));
  const report = { created: 0, updated: 0, skipped: [], warnings: [] };
  const pendingLinks = [];
  const now = Date.now();

  inputs.forEach((inp, i) => {
    const row = i + 2; // riga del foglio (1 = intestazioni)
    const probe = normalizeRecord(kind, inp.fields, {});
    const k = naturalKey(kind, probe);
    if (!k) { report.skipped.push({ row, reason: "manca il campo chiave (nome utente / nome telefono / email)" }); return; }
    const prev = byKey.get(k) || null;
    const fields = { ...inp.fields };
    if (kind === "account" && inp.refs?.device) {
      const did = devByName.get(inp.refs.device.toLowerCase());
      if (did) fields.deviceId = did; else report.warnings.push({ row, reason: `telefono «${inp.refs.device}» non trovato: importa prima i telefoni` });
    }
    const norm = normalizeRecord(kind, fields, prev || {});
    const errs = validateRecord(kind, norm, doc.records.filter((r) => r !== prev), prev?.id || null);
    if (errs.length) { report.skipped.push({ row, reason: errs.join("; ") }); return; }
    const rec = prev ? Object.assign(prev, norm, { updatedAt: now, updatedBy: by }) : { id: randomUUID(), ...norm, createdAt: now, createdBy: by, updatedAt: now, updatedBy: by };
    try { if (!dryRun) applySecrets(kind, rec, inp.secrets); } catch (e) { report.skipped.push({ row, reason: e.message }); return; }
    if (!prev) { doc.records.push(rec); byKey.set(k, rec); report.created++; } else report.updated++;
    if (kind === "account" && inp.refs?.linked?.username) pendingLinks.push({ rec, ref: inp.refs.linked, row });
  });

  for (const { rec, ref, row } of pendingLinks) {
    const target = doc.records.find((r) => r.username === normHandle(ref.username) && (!ref.platform || r.platform === ref.platform));
    if (!target) { report.warnings.push({ row, reason: `account collegato @${ref.username} non trovato` }); continue; }
    if (target.id !== rec.id) rec.linkedAccountId = target.id; // il collegamento a se stesso del foglio di prima si ignora
  }

  if (!dryRun) {
    await save(kind, doc);
    await audit({ kind, action: "import", by, created: report.created, updated: report.updated, skipped: report.skipped.length });
  }
  return report;
}
