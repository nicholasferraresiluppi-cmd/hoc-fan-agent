import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// /api/ingest/* è headless (auth a segreto condiviso nell'endpoint stesso), non via sessione Clerk.
// I path CRON sono pubblici per lo stesso motivo (fix 20 lug 2026: le chiamate
// schedulate di Vercel non hanno sessione → prendevano 401 dal middleware e i
// cron non sono MAI scattati in produzione). Ogni route cron si difende da sola
// con CRON_SECRET via lib/cron-auth — mai aggiungere qui un path senza quello.
// Assessment candidati (pre-hire): il candidato NON è un utente Clerk. La
// pagina /assessment/[token] e le API /api/candidate/* sono pubbliche e si
// difendono DA SOLE col token monouso (lib/candidate-assessments: validità,
// scadenza, stato, sequenza) — mai aggiungere qui un path senza quella difesa
// nella route stessa. I dati candidato vivono nel namespace KV candidate:*,
// isolato da operatori/leghe/denaro.
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)', '/sign-up(.*)', '/privacy', '/api/health', '/api/ingest/(.*)',
  '/api/cron/(.*)',
  '/api/admin/ops-alerts/run', '/api/admin/ops-alerts/digest',
  '/api/leaderboard/snapshot', '/api/leagues/snapshot',
  '/assessment/(.*)', '/api/candidate/(.*)',
]);
const isApiRoute = createRouteMatcher(['/api/(.*)']);

// "Vedi come…" (lib/view-as): finché l'anteprima è attiva l'app è in SOLA LETTURA.
// Il cookie viene verificato (firma + admin) nelle route; qui basta la presenza:
// bloccare le scritture a chi ha il cookie non può mai dare permessi in più.
const VIEW_AS_WRITE_OK = ['/api/admin/view-as', '/api/track', '/api/feedback'];

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;
  const authObj = await auth();
  if (authObj.userId) {
    const m = request.method;
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && request.cookies.get('hoc_view_as')?.value
      && isApiRoute(request) && !VIEW_AS_WRITE_OK.includes(request.nextUrl.pathname)) {
      return NextResponse.json({ error: 'Modalità "Vedi come": sola lettura. Esci dall\'anteprima per modificare.' }, { status: 403 });
    }
    return;
  }

  // Sessione assente: per le API restituiamo JSON 401 (no redirect),
  // altrimenti il client si aspetta JSON e riceve HTML del sign-in.
  if (isApiRoute(request)) {
    return NextResponse.json({ error: 'Sessione scaduta o assente.' }, { status: 401 });
  }
  // Radice senza sessione: dopo il login si passa da /start, che manda chi
  // gestisce all'Hub e gli operatori all'Academy (i link profondi restano tali).
  if (request.nextUrl.pathname === '/') {
    return authObj.redirectToSignIn({ returnBackUrl: new URL('/start', request.url).toString() });
  }
  return authObj.redirectToSignIn();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
