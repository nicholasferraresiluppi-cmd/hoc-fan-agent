"use client";

/**
 * Collegamento in blocco schede CRM → Infloww (07/11/2026), nell'elenco del CRM.
 * Un avviso dice quante schede aspettano il collegamento; il pannello le mostra
 * con il nome Infloww proposto. Le corrispondenze ESATTE (stesso nome e cognome,
 * anche in un altro ordine) partono spuntate, quelle «simili» no: si guardano
 * una per una. API: /api/admin/hr/operator-links.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CP } from "@/lib/brand";
import { Notice } from "@/components/ds";
import { Modal } from "@/components/cp-style";
import { btnPrimary, btnGhost, fetcher, postJson } from "@/components/hr-ui";

const URL = "/api/admin/hr/operator-links";

export function OperatorBulkNotice() {
  const { data, mutate } = useSWR(URL, fetcher, { revalidateOnFocus: false });
  const [open, setOpen] = useState(false);
  if (!data?.rows?.length) return null;
  const exact = data.rows.filter((r) => r.kind === "esatto").length;
  return (
    <>
      <Notice>
        Infloww: {data.rows.length === 1 ? "1 scheda si può collegare" : `${data.rows.length} schede si possono collegare`} al loro nome su Infloww ({exact} con nome e cognome identici). Serve a turni e venduto negli strumenti, a partire da Porta un amico.{" "}
        <button type="button" onClick={() => setOpen(true)} style={{ background: "none", border: 0, padding: 0, color: CP.accentSoftText, cursor: "pointer", fontSize: "inherit", fontFamily: "inherit" }}>Rivedi e collega →</button>
      </Notice>
      {open && <BulkModal data={data} onClose={() => setOpen(false)} onDone={() => mutate()} />}
    </>
  );
}

function BulkModal({ data, onClose, onDone }) {
  const [sel, setSel] = useState(() => new Set(data.rows.filter((r) => r.kind === "esatto").map((r) => r.personId)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  const groups = useMemo(() => [["esatto", "Nome e cognome identici"], ["simile", "Simili: da guardare (refuso, secondo nome, cognome in più)"]]
    .map(([k, label]) => [label, data.rows.filter((r) => r.kind === k)]).filter(([, rows]) => rows.length), [data.rows]);
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const items = data.rows.filter((r) => sel.has(r.personId)).map((r) => ({ personId: r.personId, inflowwName: r.suggestion.name }));
      const j = await postJson(URL, { items });
      setResult(j); onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const name = (id) => data.rows.find((r) => r.personId === id)?.name || id;

  return (
    <Modal open onClose={onClose} title="Collega le schede a Infloww" maxWidth={680}>
      {result ? (
        <div style={{ fontSize: 14, color: CP.textSecondary, lineHeight: 1.55 }}>
          <p style={{ margin: "0 0 8px", color: CP.textPrimary }}>{result.linked.length === 1 ? "1 scheda collegata." : `${result.linked.length} schede collegate.`}</p>
          {result.skipped.length > 0 && (
            <>
              <p style={{ margin: "0 0 4px" }}>Non collegate:</p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{result.skipped.map((s) => <li key={s.personId || s.error}>{name(s.personId)}: {s.error}</li>)}</ul>
            </>
          )}
          <div style={{ marginTop: 14 }}><button type="button" style={btnPrimary} onClick={onClose}>Chiudi</button></div>
        </div>
      ) : (
        <>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: CP.textSecondary, lineHeight: 1.5 }}>
            Il nome proposto è l&apos;unico operatore Infloww che corrisponde alla scheda. Quelli identici sono già spuntati; i simili guardali uno per uno. Si può sempre cambiare o scollegare dalla scheda.
          </p>
          <div style={{ maxHeight: "52vh", overflowY: "auto", borderTop: `1px solid ${CP.borderSoft || CP.border}` }}>
            {groups.map(([label, rows]) => (
              <div key={label}>
                <div style={{ fontSize: 12.5, color: CP.textMuted, padding: "10px 0 4px" }}>{label} · {rows.length}</div>
                {rows.map((r) => (
                  <label key={r.personId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: `1px solid ${CP.borderSoft || CP.border}`, fontSize: 14, cursor: "pointer" }}>
                    <input type="checkbox" checked={sel.has(r.personId)} onChange={() => toggle(r.personId)} />
                    <span style={{ flex: "1 1 40%", minWidth: 0, color: CP.textPrimary }}>
                      <Link href={`/admin/hr/${r.personId}`} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", textDecoration: "none" }}>{r.name}</Link>
                      {r.phase && <span style={{ color: CP.textMuted, fontSize: 12 }}> · {r.phase}</span>}
                    </span>
                    <span style={{ flex: "1 1 40%", minWidth: 0, color: CP.textSecondary }}>→ {r.suggestion.name}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          {err && <div style={{ color: CP.accentRed, fontSize: 13, marginTop: 10 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={btnPrimary} disabled={busy || !sel.size} onClick={run}>{busy ? "Collego…" : sel.size === 1 ? "Collega 1 scheda" : `Collega ${sel.size} schede`}</button>
            <button type="button" style={btnGhost} disabled={busy} onClick={onClose}>Annulla</button>
            <span style={{ fontSize: 12, color: CP.textMuted, marginLeft: "auto" }}>{data.linked} già collegate · {data.withoutSuggestion} senza un nome sicuro (si collegano dalla scheda)</span>
          </div>
        </>
      )}
    </Modal>
  );
}
