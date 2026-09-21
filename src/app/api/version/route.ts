import buildInfo from "@/lib/build-info.json";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(buildInfo, { headers: { "Cache-Control": "no-store" } });
}
