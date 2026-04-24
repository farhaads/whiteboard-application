/**
 * Server-side WebSocket base URL for the Yjs sync server (e.g. ws-token API).
 * Do not read NEXT_PUBLIC_* here — Next inlines those at build time, which broke
 * Fly when the Dockerfile used a placeholder like wss://localhost.invalid.
 *
 * Priority:
 * - SYNC_WEBSOCKET_URL: explicit runtime (Fly secrets, docker-compose)
 * - ENABLE_SAME_ORIGIN_YJS=1 + Request: wss://<host>/yjs-ws/ (nginx + sync in image)
 * - default ws://localhost:1234 (local dev with sync on 1234)
 *
 * Client fallback for dev remains NEXT_PUBLIC_SYNC_URL in hooks/useYDoc.ts only.
 */
export function buildSameOriginYjsWsUrl(req: Request): string {
  const u = new URL(req.url);
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const firstHost = (forwardedHost ?? req.headers.get("host") ?? u.host)
    .split(",")[0]
    ?.trim();
  const host = firstHost || u.host;
  const firstProto = forwardedProto?.split(",")[0]?.trim();
  let proto: "wss" | "ws";
  if (firstProto === "https") {
    proto = "wss";
  } else if (firstProto === "http") {
    proto = "ws";
  } else if (u.protocol === "https:") {
    proto = "wss";
  } else if (host.endsWith(".fly.dev")) {
    // Fly edge is HTTPS; internal hop may omit X-Forwarded-Proto
    proto = "wss";
  } else {
    proto = "ws";
  }
  return `${proto}://${host}/yjs-ws`;
}

export function getSyncWebsocketBaseUrl(req?: Request): string {
  const strip = (s: string) => s.replace(/\/$/, "");
  if (process.env.SYNC_WEBSOCKET_URL) {
    return strip(process.env.SYNC_WEBSOCKET_URL);
  }
  if (
    process.env.ENABLE_SAME_ORIGIN_YJS === "1" &&
    req &&
    typeof req.url === "string"
  ) {
    return strip(buildSameOriginYjsWsUrl(req));
  }
  return strip("ws://localhost:1234");
}
