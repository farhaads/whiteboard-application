/**
 * WebSocket base URL for the Yjs sync server.
 * Prefer SYNC_WEBSOCKET_URL (runtime, Fly secrets) so production does not rely on
 * NEXT_PUBLIC_* values baked at build time.
 */
export function getSyncWebsocketBaseUrl(): string {
  const raw =
    process.env.SYNC_WEBSOCKET_URL ||
    process.env.NEXT_PUBLIC_SYNC_URL ||
    "ws://localhost:1234";
  return raw.replace(/\/$/, "");
}
