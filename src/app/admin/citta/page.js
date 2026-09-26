"use client";

/**
 * La città (admin, SEED): progetto di Nicholas — palazzo = creator del suo split, piano = area.
 * La scena vive in components/CityScene (three.js caricato solo qui). Selettore del mese:
 * nel mese passato solo i piani di HOC Pro hanno storico (ClickUp è una fotografia di oggi).
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { CP, FONTS } from "@/lib/brand";

const CityScene = dynamic(() => import("@/components/CityScene"), { ssr: false });

const fetcher = async (url) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { ...j, error: j.error || `Errore ${r.status}` };
};

export default function CittaPage() {
  const [month, setMonth] = useState(null);
  const { data, isLoading } = useSWR(`/api/admin/citta${month ? `?month=${month}` : ""}`, fetcher, { revalidateOnFocus: false });
  const msg = (t) => (
    <div style={{ padding: "64px 32px", maxWidth: 640, fontFamily: FONTS.body, color: CP.textSecondary, fontSize: 15, lineHeight: 1.6 }}>
      <h1 className="ds-h1" style={{ fontSize: 28, fontWeight: 500, color: CP.textPrimary, margin: "0 0 12px" }}>La città</h1>
      {t}
    </div>
  );
  if (isLoading && !data) return msg("Sto costruendo la città…");
  if (data?.error) return msg(data.error);
  if (!data?.projects?.length) return msg("Non c'è ancora una fotografia di ClickUp da mostrare.");
  const scene = { ...data, api: "/api/admin/citta", base: "", noIntro: !!month };
  return (
    <>
      <CityScene key={data.month || "cur"} data={scene} />
      {data.months?.length > 1 && (
        <div className="ct-months" role="group" aria-label="Mese">
          {data.months.map((m) => (
            <button key={m.id} type="button" aria-pressed={m.id === data.month} onClick={() => setMonth(m.id)}>
              {m.label[0].toUpperCase() + m.label.slice(1)}
            </button>
          ))}
        </div>
      )}
      <style>{`.ct-months{position:fixed;top:24px;left:calc(248px + (100vw - 248px)/2);transform:translateX(-50%);z-index:35;display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(22,23,29,.72);border:1px solid rgba(242,238,230,.12);backdrop-filter:blur(14px)}
.ct-months button{font:inherit;font-family:var(--f-sans),Manrope,sans-serif;font-size:13.5px;color:rgba(242,238,230,.6);background:none;border:0;border-radius:999px;padding:7px 14px;cursor:pointer}
.ct-months button[aria-pressed="true"]{background:#F2EEE6;color:#111}
@media (max-width:899px){.ct-months{left:50%;top:66px}}`}</style>
    </>
  );
}
