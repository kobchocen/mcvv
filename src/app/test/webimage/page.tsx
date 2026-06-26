import React from "react";

import { prisma } from "@/lib/db/client";

/**
 * Simple verification page for imported BLOB images.
 *
 * Loads the first image (or a specific one via ?id=) from the webimages table
 * and shows both metadata and the actual image.
 *
 * Access: http://localhost:3000/test/webimage
 * With specific id: http://localhost:3000/test/webimage?id=42
 */
export default async function WebImageTestPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id: idParam } = await searchParams;

  let webImage: { id: number; desc: string; year: number | null; typeId: number } | null = null;
  let hasImage = false;

  try {
    if (idParam) {
      const id = parseInt(idParam, 10);
      if (!isNaN(id)) {
        webImage = await prisma.webImage.findUnique({
          where: { id },
          select: { id: true, desc: true, year: true, typeId: true },
        });
        // Check if this record actually has image data
        const withImage = await prisma.webImage.findUnique({
          where: { id },
          select: { image: true },
        });
        hasImage = !!withImage?.image;
      }
    } else {
      webImage = await prisma.webImage.findFirst({
        where: { image: { not: null } },
        orderBy: { id: "asc" },
        select: { id: true, desc: true, year: true, typeId: true },
      });
      hasImage = !!webImage;
    }
  } catch (error) {
    console.error("Error fetching webimage metadata:", error);
  }

  const imageSrc = idParam ? `/api/test/webimage?id=${idParam}` : "/api/test/webimage";

  return (
    <div
      style={{
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <h1>🖼️ WebImages BLOB Verification</h1>

      <p>
        This page fetches metadata + the actual binary image from the <code>webimages</code> table
        (the first record containing BLOB data).
      </p>

      {!webImage && (
        <div style={{ padding: "1rem", background: "#fff3cd", border: "1px solid #ffc107" }}>
          No image record found. Make sure you have imported data into the <code>webimages</code>{" "}
          table.
        </div>
      )}

      {webImage && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Record #{webImage.id}</h2>
          <ul>
            <li>
              <strong>ID:</strong> {webImage.id}
            </li>
            <li>
              <strong>Description (popis):</strong> {webImage.desc || "—"}
            </li>
            <li>
              <strong>Year (rok):</strong> {webImage.year ?? "—"}
            </li>
            <li>
              <strong>Type ID:</strong> {webImage.typeId}
            </li>
            <li>
              <strong>Has image data:</strong> {hasImage ? "✅ Yes" : "❌ No"}
            </li>
          </ul>

          <div style={{ marginTop: "1.5rem" }}>
            <h3>Rendered image from database</h3>
            {hasImage ? (
              <img
                src={imageSrc}
                alt={`webimage #${webImage.id}`}
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
            <div style={{ marginTop: "8px", fontSize: "0.85rem" }}>
              <a href={`${imageSrc}&format=meta`} target="_blank">
                View metadata (safe, no binary)
              </a>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: "3rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
        <h4>Direct API links</h4>
        <ul>
          <li>
            <a href="/api/test/webimage" target="_blank">
              /api/test/webimage
            </a>{" "}
            (first image)
          </li>
          <li>
            <a href="/api/test/webimage?id=1" target="_blank">
              /api/test/webimage?id=1
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
