import { type NextRequest } from "next/server";

import { finishGoogle } from "@/lib/auth/oauth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  return finishGoogle(code, state);
}
