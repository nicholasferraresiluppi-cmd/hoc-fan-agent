// Scheletro mostrato SUBITO al cambio pagina mentre arrivano i dati (App Router):
// senza, ogni clic aspettava middleware + server prima di mostrare qualcosa.
// Forma generica di una pagina DS: testata, numero principale, tabella.
export default function Loading() {
  const row = { height: 40, marginBottom: 8 };
  return (
    <div aria-busy="true" aria-label="Caricamento" style={{ padding: "28px 24px 64px", maxWidth: 1180, margin: "0 auto" }}>
      <div className="hoc-sk" style={{ width: 120, height: 14, marginBottom: 12 }} />
      <div className="hoc-sk" style={{ width: 320, maxWidth: "80%", height: 30, marginBottom: 10 }} />
      <div className="hoc-sk" style={{ width: 520, maxWidth: "95%", height: 14, marginBottom: 24 }} />
      <div className="hoc-sk" style={{ height: 120, marginBottom: 18 }} />
      {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="hoc-sk" style={row} />)}
    </div>
  );
}
