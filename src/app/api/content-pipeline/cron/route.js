// Endpoint chiamato dal cron Vercel (vercel.json: */15 * * * *).
//
// Autenticazione: header Authorization: Bearer ${CONTENT_CRON_SECRET}.
// Vercel inietta automaticamente questo header per i cron path se configurato — comunque
// il secret è obbligatorio per evitare chiamate non autorizzate da fuori.
//
// Logica: listDuePending(now) → per ogni draftId chiama internamente la stessa pipeline di /publish.

export async function GET(request) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CONTENT_CRON_SECRET
    ? `Bearer ${process.env.CONTENT_CRON_SECRET}`
    : null;
  if (!expected || auth !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // TODO: const due = await listDuePending(Date.now());
  // TODO: for each draftId → publish pipeline + unscheduleDraft + history
  return Response.json({ todo: "cron tick", processed: 0 }, { status: 501 });
}
