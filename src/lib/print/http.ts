import { staffAccess } from "@/lib/admin/staff";
import { NO_STORE } from "@/lib/http/no-store";

export { NO_STORE };

/**
 * Tiskové sestavy smí stáhnout jen pořadatel / administrátor (`isStaffRole`).
 * Nepřihlášený 401, jiná role 404 (sestava pro ni „neexistuje“).
 */
export async function staffOnly(): Promise<Response | null> {
  const access = await staffAccess({ status: 404, body: "Not found" });
  return access.ok ? null : access.response;
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
