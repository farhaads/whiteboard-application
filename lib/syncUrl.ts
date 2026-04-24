/**
 * WebSocket base URL for the Yjs sync server.
 * - SYNC_WEBSOCKET_URL: explicit (e.g. separate sync Fly app)
 * - NEXT_PUBLIC_SYNC_URL: build-time / compose
 * - ENABLE_SAME_ORIGIN_YJS=1: same host as the web app, path /yjs-ws/ (nginx in Docker image)
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
  if (process.env.NEXT_PUBLIC_SYNC_URL) {
    return strip(process.env.NEXT_PUBLIC_SYNC_URL);
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
