import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Čas serveru pro korekci hodin zařízení splitmakera (#121). Veřejné, bez dat. */
export function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
