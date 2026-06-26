import React from "react";

import { prisma } from "@/lib/db/client";

/**
 * Simple verification page for imported BLOB images from mcvv_fotky.
 *
 * Loads the first image (or a specific one via ?id=) from the mcvv_fotky table.
 *
 * Access: http://localhost:3000/test/fotka
 * With specific id: http://localhost:3000/test/fotka?id=12345
 */
export default async function FotkaTestPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id: idParam } = await searchParams;

  let photo: {
    id: number;
    year: number | null;
    originalFilename: string | null;
    debugText: string | null;
  } | null = null;
  let hasImage = false;
  let linkedRunners: Array<{
    orderFromLeft: number | null;
    runner: { id: string; name: string };
  }> = [];

  try {
    if (idParam) {
      const id = parseInt(idParam, 10);
      if (!isNaN(id)) {
        photo = await prisma.photo.findUnique({
          where: { id },
          select: { id: true, year: true, originalFilename: true, debugText: true },
        });
        const withImage = await prisma.photo.findUnique({
          where: { id },
          select: { image: true },
        });
        hasImage = !!withImage?.image;

        if (photo) {
          linkedRunners = await prisma.runnerPhoto.findMany({
            where: { photoId: id },
            select: {
              orderFromLeft: true,
              runner: {
                select: { id: true, name: true },
              },
            },
            orderBy: { orderFromLeft: "asc" },
          });
        }
      }
    } else {
      // Prefer a photo that has at least one runner assigned
      photo = await prisma.photo.findFirst({
        where: {
          image: { not: null },
          runners: { some: {} },
        },
        orderBy: { id: "asc" },
        select: { id: true, year: true, originalFilename: true, debugText: true },
      });
      if (!photo) {
        // fallback to any with image
        photo = await prisma.photo.findFirst({
          where: { image: { not: null } },
          orderBy: { id: "asc" },
          select: { id: true, year: true, originalFilename: true, debugText: true },
        });
      }
      hasImage = !!photo;

      if (photo) {
        linkedRunners = await prisma.runnerPhoto.findMany({
          where: { photoId: photo.id },
          select: {
            orderFromLeft: true,
            runner: {
              select: { id: true, name: true },
            },
          },
          orderBy: { orderFromLeft: "asc" },
        });
      }
    }
  } catch (error) {
    console.error("Error fetching fotka metadata:", error);
  }

  const imageSrc = idParam ? `/api/test/fotka?id=${idParam}` : "/api/test/fotka";

  return (
    <div
      style={{
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <h1>📸 MCVV Fotky BLOB Verification</h1>

      <p>
        This page fetches metadata + the actual binary image from the <code>mcvv_fotky</code> table
        (the first record containing BLOB data).
      </p>

      {!photo && (
        <div style={{ padding: "1rem", background: "#fff3cd", border: "1px solid #ffc107" }}>
          No image record found. Make sure you have imported data into the <code>mcvv_fotky</code>{" "}
          table.
        </div>
      )}

      {photo && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Record #{photo.id}</h2>
          <ul>
            <li>
              <strong>ID:</strong> {photo.id}
            </li>
            <li>
              <strong>Year (rok):</strong> {photo.year ?? "—"}
            </li>
            <li>
              <strong>Original filename:</strong> {photo.originalFilename || "—"}
            </li>
            <li>
              <strong>Debug text:</strong> {photo.debugText || "—"}
            </li>
            <li>
              <strong>Has image data:</strong> {hasImage ? "✅ Yes" : "❌ No"}
            </li>
          </ul>

          <div style={{ marginTop: "1rem", fontSize: "0.9rem", color: "#555" }}>
            <strong>Integrity note:</strong>{" "}
            {linkedRunners.length > 0 ? "Tato fotka má přiřazené běžce." : "Žádní běžci."}
            Celkem {linkedRunners.length} přiřazení v této fotce.
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            <h3>Rendered image from database</h3>
            {hasImage ? (
              <img
                src={imageSrc}
                alt={`fotka #${photo.id}`}
                style={{
                  maxWidth: "100%",
                  maxHeight: "700px",
                  border: "1px solid #ddd",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              />
            ) : (
              <div style={{ color: "red" }}>This record does not contain image data.</div>
            )}
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            <h3>Přiřazení běžci ({linkedRunners.length})</h3>
            {linkedRunners.length > 0 ? (
              <ul>
                {linkedRunners.map((link, idx) => (
                  <li key={idx}>
                    <strong>#{link.runner.id}</strong> — {link.runner.name}
                    {link.orderFromLeft !== null && ` (pořadí zleva: ${link.orderFromLeft})`}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ color: "#666" }}>Žádní běžci přiřazeni k této fotce.</div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: "3rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
        <h4>Direct API links</h4>
        <ul>
          <li>
            <a href="/api/test/fotka" target="_blank">
              /api/test/fotka
            </a>{" "}
            (first image with data)
          </li>
          <li>
            <a href="/api/test/fotka?id=100" target="_blank">
              /api/test/fotka?id=100
            </a>
          </li>
        </ul>
        <p style={{ fontSize: "0.85rem", color: "#666" }}>
          Open the image link directly in a new tab to verify it loads as a binary image.
        </p>
      </div>

      <div style={{ marginTop: "2rem", fontSize: "0.8rem", color: "#888" }}>
        Temporary dev test page. Delete <code>src/app/test/</code> when you are done verifying
        imports.
      </div>
    </div>
  );
}
