import { NextResponse, type NextRequest } from "next/server";

import { prismaUnsubscribeStore } from "@/lib/newsletter/store";
import { applyUnsubscribe, isUnsubscribeToken } from "@/lib/newsletter/unsubscribe";

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) called by mail clients.
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!isUnsubscribeToken(token)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const result = await applyUnsubscribe(prismaUnsubscribeStore, token);
  return NextResponse.json(
    { ok: result !== "invalid" },
    { status: result === "invalid" ? 404 : 200 },
  );
}

// A plain GET (e.g. a client opening the header URL) goes to the confirmation page.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const url = new URL(`/cs/newsletter/odhlasit`, request.nextUrl.origin);
  if (token) url.searchParams.set("token", token);
  return NextResponse.redirect(url);
}

export const dynamic = "force-dynamic";
