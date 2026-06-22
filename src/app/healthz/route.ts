const probeHeaders = {
  "Cache-Control": "no-store",
};

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: probeHeaders });
}
