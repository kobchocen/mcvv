import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/client";
import { searchHitName } from "@/lib/runner/search";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 50) {
    return Response.json([]);
  }

  // Match the current name (cis_bezec.jmeno) or any name stored on a result
  // (mcvv_time.bezec_name, e.g. a maiden name). Both columns use utf8mb4_unicode_ci,
  // so LIKE is case- and diacritics-insensitive. One row per runner, at most 8.
  const runners = await prisma.runner.findMany({
    where: {
      results: { some: {} },
      OR: [{ name: { contains: q } }, { results: { some: { runnerName: { contains: q } } } }],
    },
    select: {
      id: true,
      name: true,
      results: {
        where: { runnerName: { contains: q } },
        select: { runnerName: true },
        orderBy: { year: "desc" },
        take: 3,
      },
    },
    orderBy: { name: "asc" },
    take: 8,
  });

  return Response.json(
    runners.map((runner) => ({
      id: runner.id,
      name: searchHitName(
        q,
        runner.name,
        runner.results.map((row) => row.runnerName),
      ),
      born: runner.id.slice(0, 4),
    })),
  );
}
