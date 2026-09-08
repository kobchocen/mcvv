const probeHeaders = {
  "Cache-Control": "no-store",
};

export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", { headers: probeHeaders });
}
