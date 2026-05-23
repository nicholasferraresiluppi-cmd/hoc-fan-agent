import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)']);
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
