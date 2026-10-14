"use client";

// Canali Telegram (14/10/2026) — la mappa dei canali delle creator, compilata dai sales, e con il bot
// HOC dentro: chi entra, da quale link (una fonte = un link d'invito), quanti restano, e quanti
// abbonati porta su OnlyFans il link di tracciamento pubblicato nel canale.
// Logica in lib/telegram-channels-core.js (testata), dati in /api/admin/telegram-channels.

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Check, Copy, Plus, RefreshCw, Trash2, ExternalLink, Link2 } from "lucide-react";
import { CP, FONTS } from "@/lib/brand";
import { PageHead, Metric, DataTable, Notice, SectionTitle, card, NUM } from "@/components/ds";
import { Modal } from "@/components/cp-style";
import { fmtInt, fmtPct } from "@/lib/format";

const API = "/api/admin/telegram-channels";
const fetcher = (url) =>
  fetch(url).then(async (r) => {
    const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
    if (!r.ok) throw new Error(d.error || "Errore di caricamento");
    return d;
  });
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({ error: `Risposta non valida (${r.status})` }));
  if (!r.ok) throw new Error(d.error || "Operazione non riuscita");
  return d;
}

const btn = { display: "inline-flex", alignItems: "center", gap: 6, background: CP.surfaceAlt, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", fontFamily: FONTS.body };
const btnPrimary = { ...btn, background: CP.accent, color: CP.accentInk, border: `1px solid ${CP.accent}`, fontWeight: 500 };
const input = { background: CP.bgSunken, border: `1px solid ${CP.border}`, color: CP.textPrimary, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: FONTS.body, width: "100%", boxSizing: "border-box" };
const label = { display: "block", fontSize: 12, color: CP.textSecondary, margin: "12px 0 4px" };
const muted = { fontSize: 12, color: CP.textMuted };
const int = fmtInt;
const signed = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${int(n)}`);
const when = (ts) => (ts ? new Date(ts).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }) : "—");

const BOT_LABEL = { admin: "Bot dentro", membro: "Bot senza permessi", fuori: "Bot non c'è" };
function BotBadge({ ch }) {
  const st = ch.bot?.status;
  const ok = st === "admin" && ch.bot?.can_invite;
  const text = !ch.chat_id ? "Da collegare" : st === "admin" && !ch.bot?.can_invite ? "Manca il permesso link" : BOT_LABEL[st] || "Da verificare";
  const color = ok ? CP.accentGreen : CP.textMuted;
  return <span style={{ fontSize: 12, color, whiteSpace: "nowrap" }}>{ok ? "● " : "○ "}{text}</span>;
}

function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button style={{ ...btn, padding: "4px 8px" }} onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }} title="Copia il link">
      {done ? <Check size={13} /> : <Copy size={13} />}{done ? "Copiato" : "Copia"}
    </button>
  );
}

const EMPTY = { creator: "", url: "", kind: "canale", manager: "", of_link: "", note: "" };

function ChannelForm({ initial, creators, onDone, onCancel }) {
  const [f, setF] = useState(initial || EMPTY);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const options = useMemo(() => (f.creator && !creators.includes(f.creator) ? [f.creator, ...creators] : creators), [creators, f.creator]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await post({ action: "save", ...f, id: initial?.id }); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit}>
      <label style={label}>Creator</label>
      <select style={input} value={f.creator} onChange={set("creator")} required>
        <option value="">Scegli…</option>
        {options.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <label style={label}>Link del canale</label>
      <input style={input} value={f.url} onChange={set("url")} placeholder="t.me/nomecanale, @nomecanale o t.me/+codice" required />
      <label style={label}>Tipo</label>
      <select style={input} value={f.kind} onChange={set("kind")}>
        <option value="canale">Canale (solo lei pubblica)</option>
        <option value="gruppo">Gruppo (scrivono anche i fan)</option>
      </select>
      <label style={label}>Chi lo gestisce</label>
      <input style={input} value={f.manager} onChange={set("manager")} placeholder="Es. la creator, Antonio, l'agenzia…" />
      <label style={label}>Link OnlyFans pubblicato nel canale (facoltativo)</label>
      <input style={input} value={f.of_link} onChange={set("of_link")} placeholder="onlyfans.com/nome/c123 — un link di tracciamento dedicato al canale" />
      <div style={{ ...muted, marginTop: 4 }}>Se nel canale c'è un link di tracciamento solo suo, qui vedi quanti abbonati porta su OnlyFans.</div>
      <label style={label}>Note</label>
      <input style={input} value={f.note} onChange={set("note")} placeholder="Facoltative" />
      {err && <div style={{ color: CP.accentRed, fontSize: 13, marginTop: 12 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
        <button type="button" style={btn} onClick={onCancel}>Annulla</button>
        <button type="submit" style={btnPrimary} disabled={busy}>{busy ? "Salvo…" : "Salva"}</button>
      </div>
    </form>
  );
}

function DayBars({ days }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.joins, d.leaves)));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 64 }} aria-label="Entrate e uscite degli ultimi 30 giorni">
        {days.map((d) => (
          <div key={d.d} title={`${d.d.slice(8, 10)}/${d.d.slice(5, 7)}: ${d.joins} entrate, ${d.leaves} uscite`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ height: `${(d.joins / max) * 100}%`, background: CP.accent, borderRadius: "2px 2px 0 0", minHeight: d.joins ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div style={{ ...muted, display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span>{days[0] && `${days[0].d.slice(8, 10)}/${days[0].d.slice(5, 7)}`}</span><span>entrate al giorno, ultimi 30 giorni</span><span>oggi</span>
      </div>
    </div>
  );
}

function ChannelDetail({ ch, data, onChanged, onEdit, onClose }) {
  const [src, setSrc] = useState("instagram");
  const [lbl, setLbl] = useState("");
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const run = async (key, body) => {
    setBusy(key); setErr(null);
    try { await post(body); await onChanged(); } catch (x) { setErr(x.message); } finally { setBusy(null); }
  };
  const botName = data.bot?.username ? `@${data.bot.username}` : "il bot HOC";
  const live = ch.chat_id && ch.bot?.status === "admin";
  const st = ch.stats;
  const activeLinks = (ch.links || []).filter((l) => !l.revoked);

  return (
    <div style={{ fontSize: 13, color: CP.textSecondary }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <a href={ch.url} target="_blank" rel="noreferrer" style={{ color: CP.textPrimary, display: "inline-flex", gap: 4, alignItems: "center" }}>{ch.url.replace("https://", "")}<ExternalLink size={12} /></a>
        <BotBadge ch={ch} />
        <span style={{ flex: 1 }} />
        <button style={btn} onClick={onEdit}>Modifica</button>
        {data.bot_configured && <button style={btn} disabled={busy === "refresh"} onClick={() => run("refresh", { action: "refresh", id: ch.id })}><RefreshCw size={13} />{busy === "refresh" ? "Verifico…" : "Verifica"}</button>}
      </div>
      {err && <Notice danger>{err}</Notice>}

      {!live && (
        <Notice>
          <b style={{ fontWeight: 500, color: CP.textPrimary }}>Per vedere chi entra serve il bot nel canale.</b>{" "}
          Su Telegram: apri il canale → Amministratori → Aggiungi amministratore → cerca {botName} → lascia attivo il permesso «Invitare utenti tramite link» → Salva.
          {ch.handle ? " Poi premi «Verifica»." : " Il canale è privato: dopo averlo aggiunto, collegalo dalla lista «Bot aggiunto, da collegare» in questa pagina."}
          {!data.bot_configured && " (Il bot HOC non è ancora attivo: la mappa intanto si compila lo stesso.)"}
        </Notice>
      )}

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
        <Metric label="Iscritti" value={int(ch.members)} note={ch.members_at ? `letto ${when(ch.members_at)}` : null} />
        <Metric label="Ultimi 7 giorni" value={signed(ch.members_7d)} />
        <Metric label="Ultimi 30 giorni" value={signed(ch.members_30d)} />
        {ch.of_link && <Metric label="Abbonati OF dal link" value={ch.of_stats ? int(ch.of_stats.subs) : "—"} note={ch.of_stats ? `${int(ch.of_stats.clicks)} clic` : ch.of_link_valid === false ? "link OF non riconosciuto" : "non trovato nel warehouse"} />}
      </div>

      <SectionTitle aside={live ? `dal ${new Date(ch.bot.at).toLocaleDateString("it-IT")}` : null}>Da dove entrano</SectionTitle>
      {st.totals.joins === 0 && <div style={{ ...muted, marginBottom: 10 }}>Nessuna entrata registrata. Si conta da quando il bot è nel canale: chi c'era prima non si vede.</div>}
      {st.bySource.length > 0 && (
        <DataTable
          minWidth={420}
          rows={st.bySource}
          defaultSort={{ key: "joins", dir: -1 }}
          columns={[
            { key: "label", label: "Fonte" },
            { key: "joins", label: "Entrati", align: "right", render: (r) => int(r.joins) },
            { key: "leaves", label: "Usciti", align: "right", render: (r) => int(r.leaves) },
            { key: "stay_rate", label: "Restano", align: "right", render: (r) => (r.stay_rate == null ? "—" : fmtPct(r.stay_rate)) },
          ]}
        />
      )}
      {st.totals.leaves_before_bot > 0 && <div style={{ ...muted, marginTop: 6 }}>{int(st.totals.leaves_before_bot)} uscite di iscritti entrati prima del bot (senza fonte).</div>}
      {st.days.some((d) => d.joins) && <div style={{ marginTop: 14 }}><DayBars days={st.days} /></div>}

      <SectionTitle>Link d'invito per fonte</SectionTitle>
      <div style={{ ...muted, marginBottom: 8 }}>Un link per ogni posto dove viene pubblicato (bio Instagram, TikTok, S4S…): così ogni entrata ha la sua fonte.</div>
      {activeLinks.map((l) => (
        <div key={l.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${CP.border}`, flexWrap: "wrap" }}>
          <span style={{ color: CP.textPrimary, minWidth: 140 }}>{l.name}</span>
          <code style={{ fontSize: 12, color: CP.textSecondary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{l.url}</code>
          <CopyBtn text={l.url} />
          <button style={{ ...btn, padding: "4px 8px" }} disabled={busy === l.key} onClick={() => { if (confirm(`Revocare il link «${l.name}»? Chi lo usa non potrà più entrare da lì.`)) run(l.key, { action: "revoke", id: ch.id, key: l.key }); }}>Revoca</button>
        </div>
      ))}
      {live ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <select style={{ ...input, width: 150 }} value={src} onChange={(e) => setSrc(e.target.value)}>
            {Object.entries(data.sources).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input style={{ ...input, flex: 1, minWidth: 140 }} value={lbl} onChange={(e) => setLbl(e.target.value)} placeholder="Dettaglio (es. bio, storia del 15/10)" maxLength={40} />
          <button style={btnPrimary} disabled={busy === "link"} onClick={() => run("link", { action: "link", id: ch.id, source: src, label: lbl }).then(() => setLbl(""))}><Link2 size={13} />{busy === "link" ? "Creo…" : "Crea link"}</button>
        </div>
      ) : <div style={muted}>I link si creano quando il bot è amministratore del canale.</div>}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, gap: 8, flexWrap: "wrap" }}>
        <span style={muted}>{[ch.manager && `Gestito da ${ch.manager}`, ch.note].filter(Boolean).join(" · ")}</span>
        <button style={{ ...btn, color: CP.accentRed }} onClick={() => { if (confirm("Togliere il canale dalla mappa? Si perdono anche i conteggi delle entrate.")) run("del", { action: "delete", id: ch.id }).then(onClose); }}><Trash2 size={13} />Togli dalla mappa</button>
      </div>
    </div>
  );
}

function PendingRow({ p, channels, onDone }) {
  const candidates = channels.filter((c) => !c.chat_id);
  const [id, setId] = useState("");
  const [err, setErr] = useState(null);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${CP.border}`, flexWrap: "wrap" }}>
      <span style={{ color: CP.textPrimary, minWidth: 180 }}>{p.title || "Senza titolo"}{p.username && <span style={muted}> · @{p.username}</span>}</span>
      <span style={muted}>bot aggiunto {when(p.at)}</span>
      <span style={{ flex: 1 }} />
      <select style={{ ...input, width: 220 }} value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">È il canale di…</option>
        {candidates.map((c) => <option key={c.id} value={c.id}>{c.creator} · {c.url.replace("https://", "")}</option>)}
      </select>
      <button style={btnPrimary} disabled={!id} onClick={async () => { setErr(null); try { await post({ action: "connect", id, chat_id: p.chat_id }); onDone(); } catch (x) { setErr(x.message); } }}>Collega</button>
      {err && <div style={{ color: CP.accentRed, fontSize: 12, width: "100%" }}>{err}</div>}
    </div>
  );
}

export default function TelegramChannelsPage() {
  const { data, error, isLoading, mutate } = useSWR(API, fetcher, { revalidateOnFocus: false });
  const [form, setForm] = useState(null); // null | "new" | channel
  const [openId, setOpenId] = useState(null);
  const [setupMsg, setSetupMsg] = useState(null);
  const channels = data?.channels || [];
  const open = channels.find((c) => c.id === openId);

  const withChannel = new Set(channels.map((c) => c.creator));
  const missing = (data?.creators || []).filter((c) => !withChannel.has(c));
  const live = channels.filter((c) => c.chat_id && c.bot?.status === "admin").length;
  const joins30 = channels.reduce((s, c) => s + c.stats.days.reduce((a, d) => a + d.joins, 0), 0);

  const columns = [
    { key: "creator", label: "Creator" },
    { key: "title", label: "Canale", render: (r) => <span>{r.title || r.url.replace("https://t.me/", "")}<span style={muted}> · {r.kind}</span></span>, sort: (r) => r.title || r.url },
    { key: "bot", label: "Bot", render: (r) => <BotBadge ch={r} />, sort: (r) => (r.bot?.status === "admin" ? 1 : 0) },
    { key: "members", label: "Iscritti", align: "right", render: (r) => int(r.members) },
    { key: "members_7d", label: "7 giorni", align: "right", render: (r) => signed(r.members_7d) },
    { key: "joins30", label: "Entrati 30g", align: "right", render: (r) => int(r.stats.days.reduce((a, d) => a + d.joins, 0)), sort: (r) => r.stats.days.reduce((a, d) => a + d.joins, 0) },
    { key: "of", label: "Abbonati OF", align: "right", render: (r) => (r.of_stats ? int(r.of_stats.subs) : r.of_link ? "—" : <span style={muted}>nessun link</span>), sort: (r) => r.of_stats?.subs ?? -1 },
  ];

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 16px 40px", fontFamily: FONTS.body }}>
      <PageHead
        crumbs={[{ label: "Performance" }, { label: "Canali Telegram" }]}
        title="Canali Telegram"
        subtitle="La mappa dei canali delle creator. Con il bot HOC amministratore del canale vedi chi entra, da quale link e quanti restano; con un link di tracciamento OF dedicato, quanti passano su OnlyFans."
        actions={<button style={btnPrimary} onClick={() => setForm("new")}><Plus size={14} />Aggiungi canale</button>}
      />

      {error && <Notice danger>{error.message}</Notice>}
      {isLoading && <div style={muted}>Carico…</div>}

      {data && (
        <>
          {data.all && !data.bot_configured && (
            <Notice>
              Il bot HOC non è ancora configurato: la mappa si compila già, le entrate per fonte partono quando è attivo. Servono in Vercel <code>TELEGRAM_BOT_TOKEN</code> (da @BotFather) e <code>TELEGRAM_WEBHOOK_SECRET</code>, poi «Registra webhook» qui.
            </Notice>
          )}
          {data.all && data.bot_configured && data.bot && !data.bot.webhook && (
            <Notice>
              Il bot @{data.bot.username} c'è ma Telegram non sa ancora dove mandare le entrate.{" "}
              <button style={{ ...btn, padding: "3px 8px" }} onClick={async () => { try { await post({ action: "setup" }); setSetupMsg("Webhook registrato"); mutate(); } catch (x) { setSetupMsg(x.message); } }}>Registra webhook</button>
              {setupMsg && <span style={{ marginLeft: 8 }}>{setupMsg}</span>}
            </Notice>
          )}
          {data.all && data.bot?.webhook_error && <Notice danger>Ultimo errore del webhook Telegram: {data.bot.webhook_error}</Notice>}

          <section style={{ ...card, padding: "18px 20px", marginBottom: 16, display: "flex", gap: 32, flexWrap: "wrap" }}>
            <Metric label="Canali in mappa" value={int(channels.length)} />
            <Metric label="Creator senza canale" value={int(missing.length)} note={data.creators.length ? `su ${int(data.creators.length)}` : null} />
            <Metric label="Con il bot dentro" value={int(live)} />
            <Metric label="Entrati negli ultimi 30 giorni" value={int(joins30)} note="solo canali col bot" />
          </section>

          {data.pending.length > 0 && (
            <section style={{ ...card, padding: "14px 18px", marginBottom: 16 }}>
              <SectionTitle aside={`${data.pending.length}`}>Bot aggiunto, da collegare</SectionTitle>
              <div style={{ ...muted, marginBottom: 6 }}>Canali privati dove qualcuno ha aggiunto il bot: di' a quale canale della mappa corrispondono.</div>
              {data.pending.map((p) => <PendingRow key={p.chat_id} p={p} channels={channels} onDone={mutate} />)}
            </section>
          )}

          <DataTable
            rows={channels}
            columns={columns}
            defaultSort={{ key: "creator", dir: 1 }}
            onRowClick={(r) => setOpenId(r.id)}
            empty="Nessun canale in mappa. Aggiungi il primo con «Aggiungi canale»."
          />

          {missing.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <SectionTitle aside={int(missing.length)}>Creator senza canale in mappa</SectionTitle>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {missing.map((c) => (
                  <button key={c} style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => setForm({ ...EMPTY, creator: c })}>{c} <Plus size={12} /></button>
                ))}
              </div>
              <div style={{ ...muted, marginTop: 6 }}>Se una creator non ha un canale Telegram, lasciala qui: la lista serve a vedere chi manca.</div>
            </div>
          )}
          {data.of_error && <div style={{ ...muted, marginTop: 10 }}>Abbonati OF non disponibili: {data.of_error}</div>}
        </>
      )}

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? "Modifica canale" : "Aggiungi canale"} maxWidth={520}>
        {form && <ChannelForm initial={form === "new" ? null : form} creators={data?.creators || []} onCancel={() => setForm(null)} onDone={() => { setForm(null); mutate(); }} />}
      </Modal>
      <Modal open={Boolean(open)} onClose={() => setOpenId(null)} title={open ? `${open.creator} · ${open.title || "Telegram"}` : ""} maxWidth={720}>
        {open && <ChannelDetail ch={open} data={data} onChanged={mutate} onEdit={() => { setForm(open); setOpenId(null); }} onClose={() => setOpenId(null)} />}
      </Modal>
    </div>
  );
}
