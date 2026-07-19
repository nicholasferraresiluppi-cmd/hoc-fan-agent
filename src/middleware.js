import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// /api/ingest/* è headless (auth a segreto condiviso nell'endpoint stesso), non via sessione Clerk.
// I path CRON sono pubblici per lo stesso motivo (fix 20 lug 2026: le chiamate
// schedulate di Vercel non hanno sessione → prendevano 401 dal middleware e i
// cron non sono MAI scattati in produzione). Ogni route cron si difende da sola
// con CRON_SECRET via lib/cron-auth — mai aggiungere qui un path senza quello.
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)', '/sign-up(.*)', '/api/ingest/(.*)',
  '/api/cron/(.*)',
  '/api/admin/ops-alerts/run', '/api/admin/ops-alerts/digest',
  '/api/leaderboard/snapshot', '/api/leagues/snapshot',
]);
const isApiRoute = createRouteMatcher(['/api/(.*)']);

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;
  const authObj = await auth();
  if (authObj.userId) return;

  // Sessione assente: per le API restituiamo JSON 401 (no redirect),
  // altrimenti il client si aspetta JSON e riceve HTML del sign-in.
  if (isApiRoute(request)) {
    return NextResponse.json({ error: 'Sessione scaduta o assente.' }, { status: 401 });
  }
  return authObj.redirectToSignIn();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
