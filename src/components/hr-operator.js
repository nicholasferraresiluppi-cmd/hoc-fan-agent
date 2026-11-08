"use client";

/**
 * Riquadro «Su Infloww e CreatorsPro» della scheda CRM (07/11/2026): il
 * collegamento persona → operatore, fatto una volta qui e letto dagli altri
 * strumenti (Porta un amico per primo). API: /api/admin/hr/people/[id]/operator.
 */
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CP } from "@/lib/brand";
import { card } from "@/components/ds";
import { lbl, input, btnPrimary, btnGhost, fetcher, postJson } from "@/components/hr-ui";
import { expectsCpShifts } from "@/lib/person-operator-core";

export function OperatorCard({ person, locked = false }) {
  const url = `/api/admin/hr/people/${person.id}/operator`;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const run = async (fn) => {
    setBusy(true); setErr(null);
    try { await fn(); await mutate(); setEditing(false); setName(""); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const save = (n) => run(() => postJson(url, { inflowwName: n }));
  const unlink = () => run(() => postJson(url, {}, "DELETE"));

  const link = data?.link;
  const cp = data?.cp;
  const row = { display: "flex", gap: 10, alignItems: "baseline", padding: "7px 0", borderTop: `1px solid ${CP.borderSoft || CP.border}`, fontSize: 14 };

  return (
    <section style={{ ...card, padding: "14px 16px" }} aria-labelledby="hr-operator-h">
      <h2 id="hr-operator-h" style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 500, color: CP.textPrimary }}>Su Infloww e CreatorsPro</h2>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, color: CP.textMuted, lineHeight: 1.45 }}>
        Chi è questa persona negli strumenti di lavoro. Si collega una volta qui: turni e venduto la seguono negli altri strumenti, a partire da Porta un amico.
      </p>
      {isLoading && <div style={{ fontSize: 14, color: CP.textMuted }}>Caricamento…</div>}
      {error && <div style={{ fontSize: 13, color: CP.accentRed }}>Non riesco a leggere il collegamento: {error.message}</div>}

      {data && !editing && (
        <>
          <div style={row}>
            <span style={{ color: CP.textMuted, minWidth: 96 }}>Infloww</span>
            <span style={{ flex: 1, color: link ? CP.textPrimary : CP.textMuted }}>{link ? link.inflowwName : "non collegato"}</span>
          </div>
          {link && (
            <div style={row}>
              <span style={{ color: CP.textMuted, minWidth: 96 }}>CreatorsPro</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {cp?.mapped?.length ? <span>{cp.mapped.join(", ")}</span>
                  : cp?.sameName?.length ? <span>{cp.sameName.join(", ")} <span style={{ color: CP.textMuted, fontSize: 12.5 }}>· stesso nome, non abbinato a mano</span></span>
                  : !expectsCpShifts(person.fields?.mansioni) ? <span style={{ color: CP.textMuted }}>nessun turno di vendita da leggere per questa mansione</span>
                  : <span style={{ color: CP.attn }}>nessun membro abbinato: i turni non si leggono. Lo abbina un admin in <Link href="/admin/creatorspro-sync" style={{ color: CP.accentSoftText }}>Sync CreatorsPro</Link>.</span>}
              </span>
            </div>
          )}
          {!link && data.suggestion && !locked && (
            <div style={{ ...row, flexWrap: "wrap" }}>
              <span style={{ flex: 1, color: CP.textSecondary }}>Su Infloww c&apos;è <b style={{ color: CP.textPrimary, fontWeight: 500 }}>{data.suggestion.name}</b>: è questa persona?</span>
              <button type="button" style={btnPrimary} disabled={busy} onClick={() => save(data.suggestion.name)}>{busy ? "Collego…" : "Sì, collega"}</button>
            </div>
          )}
          {!locked && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button type="button" style={btnGhost} disabled={busy} onClick={() => { setEditing(true); setName(link?.inflowwName || ""); }}>{link ? "Cambia" : data.suggestion ? "Scegli un altro nome" : "Collega"}</button>
              {link && <button type="button" style={{ ...btnGhost, background: "transparent", border: "none", color: CP.textSecondary }} disabled={busy} onClick={unlink}>Scollega</button>}
            </div>
          )}
        </>
      )}

      {data && editing && (
        <div style={{ marginTop: 6 }}>
          <label style={lbl} htmlFor={`op-${person.id}`}>Nome su Infloww</label>
          <input id={`op-${person.id}`} style={input} list={`op-list-${person.id}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Scegli dall'elenco" autoFocus />
          <datalist id={`op-list-${person.id}`}>{data.candidates.map((c) => <option key={c.name} value={c.name} />)}</datalist>
          <div style={{ fontSize: 12, color: CP.textMuted, marginTop: 4 }}>Operatori del roster Infloww e di chi ha venduto negli ultimi due mesi. I nomi già collegati ad altre schede non compaiono.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" style={btnPrimary} disabled={busy || !name.trim()} onClick={() => save(name)}>{busy ? "Salvo…" : "Salva"}</button>
            <button type="button" style={btnGhost} disabled={busy} onClick={() => { setEditing(false); setErr(null); }}>Annulla</button>
          </div>
        </div>
      )}
      {err && <div style={{ fontSize: 13, color: CP.accentRed, marginTop: 8 }}>{err}</div>}
    </section>
  );
}
