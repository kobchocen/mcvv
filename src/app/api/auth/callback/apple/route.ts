import { type NextRequest } from "next/server";

import { finishApple } from "@/lib/auth/oauth";

async function handle(request: NextRequest) {
  let code = request.nextUrl.searchParams.get("code");
  let state = request.nextUrl.searchParams.get("state");
  let user: string | null = null;
  if (request.method === "POST") {
    const form = await request.formData();
    code = String(form.get("code") ?? "") || code;
    state = String(form.get("state") ?? "") || state;
    const rawUser = form.get("user");
    user = typeof rawUser === "string" ? rawUser : null;
  }
  return finishApple(code, state, user);
}

export function GET(request: NextRequest) {
  return handle(request);
}

export function POST(request: NextRequest) {
  return handle(request);
}
