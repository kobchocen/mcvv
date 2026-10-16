import { getBuildInfo } from "@/lib/build-info";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getBuildInfo(), { headers: { "Cache-Control": "no-store" } });
}
