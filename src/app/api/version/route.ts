import buildInfo from "@/lib/build-info.json";

export const dynamic = "force-dynamic";

export function GET() {
  // build-info.json is overwritten at image build time; env vars (if set) win.
  const body = {
    ...buildInfo,
    ...(process.env.BUILD_NUMBER ? { buildNumber: process.env.BUILD_NUMBER } : {}),
    ...(process.env.APP_REVISION ? { revision: process.env.APP_REVISION } : {}),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
