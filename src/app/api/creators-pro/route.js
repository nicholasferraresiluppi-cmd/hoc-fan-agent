import { isAdmin } from "@/lib/admin";
import { getFullSnapshot } from "@/lib/creators-pro";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const snapshot = await getFullSnapshot();
    return Response.json(snapshot);
  } catch (e) {
    return Response.json(
      { error: e?.message || "Creators Pro fetch failed" },
      { status: 502 }
    );
  }
}
