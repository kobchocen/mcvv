import { sanitizeError, UPLOAD_TIMEOUT_MS } from "./publisher-core";

export const OFEED_DEFAULT_API = "https://api.orienteerfeed.com";
export const UPLOAD_PATH = "/rest/v1/upload/iof";

export type UploadResult = { ok: boolean; status: number; message: string };

/**
 * `POST {api}/rest/v1/upload/iof` – multipart `eventId` + `file`, Basic `eventId:heslo`.
 * Nikdy nevrací ani neloguje heslo ani hlavičku Authorization.
 */
export async function uploadIofXml(input: {
  apiUrl: string;
  eventId: string;
  password: string;
  xml: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<UploadResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const basic = Buffer.from(`${input.eventId}:${input.password}`, "utf8").toString("base64");
  const form = new FormData();
  form.set("eventId", input.eventId);
  form.set("file", new Blob([input.xml], { type: "application/xml" }), "mcvv-results-iof30.xml");
  const url = new URL(UPLOAD_PATH, input.apiUrl).toString();
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
      body: form,
      signal: AbortSignal.timeout(input.timeoutMs ?? UPLOAD_TIMEOUT_MS),
      cache: "no-store",
    });
    const text = (await response.text()).slice(0, 2000);
    let message = text;
    try {
      const json = JSON.parse(text) as { message?: unknown; results?: { data?: unknown } };
      message =
        typeof json.message === "string"
          ? json.message + (typeof json.results?.data === "string" ? `: ${json.results.data}` : "")
          : text;
    } catch {
      // není JSON – necháme text
    }
    return {
      ok: response.ok,
      status: response.status,
      message: sanitizeError(message || response.statusText, [input.password, basic]),
    };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "network error";
    return { ok: false, status: 0, message: sanitizeError(message, [input.password, basic]) };
  }
}
