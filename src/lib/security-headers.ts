/**
 * Security headers applied to every app response.
 *
 * The CSP is only enforced in production builds: the Vite dev server relies on
 * inline/eval module wiring and websocket HMR that a strict policy would break.
 */

const SUPABASE_ORIGIN = (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "";

/** Domains allowed to embed the app (Lovable preview + our own hosts). */
const FRAME_ANCESTORS = [
  "'self'",
  "https://*.lovable.app",
  "https://*.lovable.dev",
  "https://lovable.dev",
  "https://portal.2pgroup.app",
];

function buildCsp(): string {
  const connect = [
    "'self'",
    SUPABASE_ORIGIN,
    SUPABASE_ORIGIN.replace("https://", "wss://"),
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://*.lovable.dev",
    "https://*.lovable.app",
  ].filter(Boolean);

  return [
    "default-src 'self'",
    // Hydration + TanStack Start inline bootstrap scripts require unsafe-inline.
    "script-src 'self' 'unsafe-inline' https://*.lovable.dev https://*.lovable.app",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' data: blob: https:",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${FRAME_ANCESTORS.join(" ")}`,
    "upgrade-insecure-requests",
  ].join("; ");
}

export function applySecurityHeaders(response: Response, isProduction: boolean): Response {
  // Never rewrite opaque/redirect responses.
  if (response.type === "opaqueredirect") return response;

  const headers = new Headers(response.headers);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-DNS-Prefetch-Control", "off");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  headers.set("Cross-Origin-Resource-Policy", "same-site");

  if (isProduction) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (!headers.has("Content-Security-Policy")) {
      headers.set("Content-Security-Policy", buildCsp());
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
