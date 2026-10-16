import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/client";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 50) {
    return Response.json([]);
  }

  const runners = await prisma.runner.findMany({
    where: {
      name: { contains: q },
      results: { some: {} },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 8,
  });

  return Response.json(
    runners.map((runner) => ({
      id: runner.id,
      name: runner.name,
      born: runner.id.slice(0, 4),
    })),
  );
}
