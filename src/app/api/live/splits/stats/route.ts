import { NextResponse, type NextRequest } from "next/server";

import { getAccess, splitAllows } from "@/lib/admin/access";
import { splitScope } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth/session";
import { getAssignedStations } from "@/lib/live/assignment";
import { stationsForScope } from "@/lib/live/assignment-core";
import { getStations } from "@/lib/live/race-context";
import { loadFieldSnapshot } from "@/lib/live/splits-field";
import { isStationCode, withStart } from "@/lib/live/stations";
import { enterLiveTestContext, getLiveRaceContext } from "@/lib/testmode/run";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** Počty pro informační boxy na obrazovce Mezičasy. Jen přiřazené / dovolené stanoviště. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }
  const access = await getAccess();
  const allows = await splitAllows(access);
  if (!allows("screens.splits", "read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  }
  const split = request.nextUrl.searchParams.get("split");
  if (!isStationCode(split)) {
    return NextResponse.json({ error: "station" }, { status: 422, headers: noStore });
  }
  const [ctx, splitStations, assigned] = await Promise.all([
    getLiveRaceContext(),
    getStations(),
    getAssignedStations(session.id),
  ]);
  enterLiveTestContext(ctx);
  const stations = stationsForScope(splitScope(allows), assigned, withStart(splitStations));
  if (!stations.some((station) => station.code === split)) {
    return NextResponse.json({ error: "station-not-assigned" }, { status: 403, headers: noStore });
  }
  const snapshot = await loadFieldSnapshot(ctx.year, split, splitStations);
  return NextResponse.json(
    { ok: true, year: ctx.year, split, counts: snapshot.counts, bibs: snapshot.bibs },
    { headers: noStore },
  );
}
