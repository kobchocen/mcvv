import { getSession, isStaffRole } from "@/lib/auth/session";

export const NO_STORE = { "Cache-Control": "private, no-store" };

/** Tiskové sestavy smí stáhnout jen pořadatel / administrátor (role s přístupem do adminu). */
export async function staffOnly(): Promise<Response | null> {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401, headers: NO_STORE });
  }
  if (!isStaffRole(session.role)) {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }
  return null;
}

export function pdfResponse(pdf: Uint8Array, filename: string, inline = false): Response {
  return new Response(new Uint8Array(pdf), {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
