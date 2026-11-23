import { NextResponse } from "next/server";

import { canAccess } from "@/lib/admin/access";
import { getSession } from "@/lib/auth/session";
import { NO_STORE } from "@/lib/http/no-store";
import { loadPublicOnlineSnapshot } from "@/lib/live/online-results";
import { getRaceContext } from "@/lib/live/race-context";
import { captureTeamAnnouncementIfMissing, loadTeamAnnouncement } from "@/lib/teams/announcement";

export const dynamic = "force-dynamic";

/** Public read of the 12:20 team-competition announcement for the current race year. */
export async function GET() {
  const ctx = await getRaceContext();
  const announcement = await loadTeamAnnouncement(ctx.year);
  return NextResponse.json(
    { announcement },
    { headers: { ...NO_STORE, "X-Robots-Tag": "noindex" } },
  );
}

/**
 * Staff-only capture of the current live standings as the 12:20 announcement.
 * Does not overwrite an existing snapshot. Not called automatically in this
 * implementation — invoke on race day after 12:20 Prague.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  if (!(await canAccess("raceControl.official", "write"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  const [ctx, snapshot] = await Promise.all([getRaceContext(), loadPublicOnlineSnapshot()]);
  const announcement = await captureTeamAnnouncementIfMissing(ctx.year, snapshot);
  return NextResponse.json({ announcement }, { headers: NO_STORE });
}
