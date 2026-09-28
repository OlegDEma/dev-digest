/* Route-level 404. Next.js renders this for `notFound()` and unmatched URLs.
   Server Component — no client handlers, so it needs no `"use client"`. */
import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 28 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <p style={{ fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-primary)" }}>404</p>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Page not found</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
          The page you’re looking for doesn’t exist or may have moved.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginTop: 20,
            padding: "9px 16px",
            borderRadius: 8,
            background: "var(--text-primary)",
            color: "var(--bg-primary)",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Back to DevDigest
        </Link>
      </div>
    </div>
  );
}
