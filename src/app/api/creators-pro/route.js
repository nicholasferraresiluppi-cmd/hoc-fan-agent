import { isAdmin } from "@/lib/admin";
import {
  getTalents,
  getOFOverview,
  getInstagramOverview,
  getTikTokOverview,
  getSalesCreators,
  getFullSnapshot,
} from "@/lib/creators-pro";

export const dynamic = "force-dynamic";

const HANDLERS = {
  talents: getTalents,
  of: getOFOverview,
  instagram: getInstagramOverview,
  tiktok: getTikTokOverview,
  sales: getSalesCreators,
  full: getFullSnapshot,
};

export async function GET(request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const type = new URL(request.url).searchParams.get("type") || "full";
  const handler = HANDLERS[type];
  if (!handler) {
    return Response.json(
      {
        error: `Unknown type "${type}". Valid: ${Object.keys(HANDLERS).join(", ")}`,
      },
      { status: 400 }
    );
  }

  try {
    const data = await handler();
    return Response.json(data);
  } catch (e) {
    return Response.json(
      { error: e?.message || "Creators Pro fetch failed" },
      { status: 502 }
    );
  }
}
