import Link from "next/link";
import React from "react";

export default function TestIndex() {
  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>🧪 Dev Tests</h1>
      <p>Simple pages to verify imported data from the old database.</p>

      <ul style={{ fontSize: "1.1rem", lineHeight: 1.8 }}>
        <li>
          <Link href="/test/webimage">WebImages BLOB test</Link> — first image from{" "}
          <code>webimages</code>
        </li>
        <li>
          <Link href="/test/fotka">MCVV Fotky BLOB test</Link> — first image from{" "}
          <code>mcvv_fotky</code>
        </li>
      </ul>

      <p style={{ marginTop: "2rem", color: "#666" }}>
        These pages are for development verification only.
      </p>
    </div>
  );
}
