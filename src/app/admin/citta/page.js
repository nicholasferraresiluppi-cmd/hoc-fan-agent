"use client";

/**
 * La città (admin, SEED): l'azienda come città — un palazzo per ogni spazio ClickUp.
 * La scena vive in components/CityScene (three.js caricato solo qui). I dati sono
 * una fotografia di ClickUp in KV: la data è dichiarata in alto a destra.
 */
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
  const { data, isLoading } = useSWR("/api/admin/citta", fetcher, { revalidateOnFocus: false });
  const msg = (t) => (
    <div style={{ padding: "64px 32px", maxWidth: 640, fontFamily: FONTS.body, color: CP.textSecondary, fontSize: 15, lineHeight: 1.6 }}>
      <h1 className="ds-h1" style={{ fontSize: 28, fontWeight: 500, color: CP.textPrimary, margin: "0 0 12px" }}>La città</h1>
      {t}
    </div>
  );
  if (isLoading) return msg("Sto costruendo la città…");
  if (data?.error) return msg(data.error);
  if (!data?.projects?.length) return msg("Non c'è ancora una fotografia di ClickUp da mostrare.");
  return <CityScene data={data} />;
}
