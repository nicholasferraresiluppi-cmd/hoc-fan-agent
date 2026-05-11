import { auth, clerkClient } from "@clerk/nextjs/server";

// Gate Clerk per il modulo content-pipeline.
// Un utente è content admin se publicMetadata.contentPipeline === true.
// Accessi totalmente indipendenti dal training tool (decisione del 2026-05-11).

export async function isContentAdmin(userId) {
  if (!userId) return false;
  try {
    const cc = await clerkClient();
    const u = await cc.users.getUser(userId);
    return u?.publicMetadata?.contentPipeline === true;
  } catch {
    return false;
  }
}

export async function requireContentAdmin() {
  const { userId } = await auth();
  if (!userId) return { ok: false, status: 401, message: "unauthenticated" };
  if (!(await isContentAdmin(userId))) {
    return { ok: false, status: 403, message: "forbidden: not a content admin" };
  }
  return { ok: true, userId };
}
