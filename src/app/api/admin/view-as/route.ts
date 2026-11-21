import { cookies } from "next/headers";

import { realAdminSession } from "@/lib/admin/access";
import {
  decodeViewAs,
  encodeViewAs,
  parseViewAsRoles,
  VIEW_AS_COOKIE,
  VIEW_AS_TTL_SEC,
  viewAsFor,
} from "@/lib/admin/view-as-core";
import { usableSessionSecret } from "@/lib/auth/session-token";
import { writeAudit } from "@/lib/audit/log";
import { env } from "@/lib/env";
import { NO_STORE } from "@/lib/http/no-store";
import { sameOrigin } from "@/lib/live/ingest-core";
import { defaultLocale, locales, type Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: location } });
}

function plain(status: number, body: string): Response {
  return new Response(body, { status, headers: NO_STORE });
}

/**
 * Náhled administrace očima jiné role (jen admin). Jediný zápis, který proxy během náhledu
 * pustí: `intent=start` (role z checkboxů `role`) založí cookie, `intent=stop` ji smaže.
 * Obojí jde do auditu (`permissions.view_as_started` / `permissions.view_as_ended`).
 */
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (
    !sameOrigin(origin, request.headers.get("host")) &&
    !sameOrigin(origin, request.headers.get("x-forwarded-host"))
  ) {
    return plain(403, "Forbidden");
  }
  const admin = await realAdminSession();
  if (!admin) return plain(403, "Forbidden");
  const secret = usableSessionSecret(env.SESSION_SECRET);
  if (!secret) return plain(503, "Session disabled");

  const form = await request.formData();
  const rawLocale = form.get("locale");
  const locale: Locale = (locales as readonly string[]).includes(String(rawLocale))
    ? (rawLocale as Locale)
    : defaultLocale;
  const jar = await cookies();
  const actor = { id: admin.session.id, email: admin.session.email, role: admin.session.role };

  if (form.get("intent") === "stop") {
    const token = jar.get(VIEW_AS_COOKIE)?.value;
    const view = token
      ? viewAsFor(decodeViewAs(token, secret), admin.session.id, admin.mode)
      : null;
    jar.delete(VIEW_AS_COOKIE);
    if (view) {
      await writeAudit({
        actor,
        action: "permissions.view_as_ended",
        target: `view_as:${view.roles.join(",")}`,
        detail: { mode: view.mode, roles: view.roles },
      });
    }
    return seeOther(`/${locale}/admin`);
  }

  const roles = parseViewAsRoles(form.getAll("role"), admin.mode);
  if (!roles.length) return seeOther(`/${locale}/admin/uzivatele?nahled=prazdny#nahled`);
  const exp = Math.floor(Date.now() / 1000) + VIEW_AS_TTL_SEC;
  jar.set(
    VIEW_AS_COOKIE,
    encodeViewAs({ uid: admin.session.id, mode: admin.mode, roles, exp }, secret),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: VIEW_AS_TTL_SEC,
    },
  );
  await writeAudit({
    actor,
    action: "permissions.view_as_started",
    target: `view_as:${roles.join(",")}`,
    detail: { mode: admin.mode, roles },
  });
  return seeOther(`/${locale}/admin`);
}
