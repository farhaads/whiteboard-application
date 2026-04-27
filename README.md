# Whiteboard application

Real-time collaborative whiteboard: **Next.js** hosts the UI and APIs, **Yjs** syncs document state over WebSockets, and each board is protected by its **own password** (not per-user accounts).

Use this README as a quick tour for demos and onboarding.

---

## What you are looking at (30 seconds)


| Piece                       | Role                                                         |
| --------------------------- | ------------------------------------------------------------ |
| **Next.js 14** (App Router) | Pages, API routes, middleware, image serving                 |
| **Konva + react-konva**     | 2D canvas drawing (shapes, strokes, images)                  |
| **Yjs**                     | CRDT: merges edits from multiple clients safely              |
| **y-websocket**             | Small Node server that forwards Yjs updates between browsers |
| **Docker Compose**          | Runs `web` (Next) + `sync` (WebSocket) together locally      |


There is **no** “sign up / log in” product flow. Access is **board ID + board password**. Anyone with both can open that board.

---

## Storage and “databases” (important for demos)

This app uses **three** kinds of persistence; only one is a classic server database.

### 1. SQLite — board registry (`boards.db`)

- **Library:** `better-sqlite3`
- **Default path:** `data/boards.db` (or `BOARD_DATA_DIR=/data` in production, backed by a Docker volume)
- **Schema:** one table `boards`: `id`, `password_hash`, `created_at`
- **What it stores:** random board IDs and **bcrypt** hashes of the board password (cost factor 10). Plain passwords are never stored.
- **What it does *not* store:** strokes, shapes, or canvas pixels — those live in Yjs / IndexedDB.

### 2. Browser IndexedDB — local Yjs document cache

- **Library:** `y-indexeddb`
- **Keyed by:** board id (room name)
- **What it stores:** a local copy of the **Y.Doc** so reloads and brief offline periods can recover quickly from the browser.
- **Server:** the sync server does **not** read IndexedDB; it only relays Yjs binary messages between connected clients.

### 3. Filesystem — uploaded images

- **Directory:** `uploads/` by default, or `UPLOAD_DIR` (Docker Compose uses a volume at `/app/uploads`)
- **Layout:** `{boardId}/{uuid}.{ext}`
- **Served at:** `/assets/...` via `app/assets/[...path]/route.ts`
- Uploads require a valid **board session** (same JWT cookie as the canvas).

So in one sentence: **SQLite = “which boards exist and how to verify their password”; IndexedDB = “my copy of the doc in this browser”; disk = “images pasted onto the board”.**

---

## Passwords, sessions, and WebSockets

### Board password (shared secret)

- **Create:** `POST /api/board` → generates a short random id, hashes password with **bcryptjs**, inserts into SQLite.
- **Unlock:** `POST /api/board/[boardId]/unlock` → loads hash from SQLite, `bcrypt.compareSync`, on success issues a session.

### Session = JWT in an HTTP-only cookie

- **Cookie name:** `board_token`
- **Token:** HS256 **JWT** (`jose`), payload includes `boardId`, ~**12 hours** TTL (`BOARD_JWT_MAX_AGE_SEC` in `lib/boardJwt.ts`).
- **Secret:** `JWT_SECRET` (must be set in any real environment; same secret is used by the **sync** server for WebSocket auth).
- **Cookie flags:** `httpOnly`, `sameSite: lax`, `secure` in production.

**Middleware** (`middleware.ts`) runs on `/board/:boardId/*` except the `/unlock` route: if the cookie JWT is missing, wrong board, or expired, the user is redirected to `/board/[id]/unlock`.

There are **no** server-side sessions in Redis or a `sessions` table — stateless JWT only.

### Why WebSockets need a token too

The Yjs server is a **separate process**. It cannot read your Next.js cookies on the upgrade request the way same-origin `fetch` does.

Flow:

1. Browser loads the board with the cookie session.
2. Client calls `GET /api/board/[boardId]/ws-token` (with `credentials: "include"`). Next verifies the cookie JWT and returns the **same** JWT in JSON (short-lived use: passed as a query param).
3. `WebsocketProvider` connects to the `**syncUrl`** from that response (in production: `SYNC_WEBSOCKET_URL`, e.g. `wss://whiteboard-sync.farhaadsallie.com`; in local dev: `ws://localhost:1234`), with `?token=...` and room = `boardId`. The client may fall back to `NEXT_PUBLIC_SYNC_URL` only if `syncUrl` is absent.
4. `**sync/index.js**` verifies JWT with `jose`; `payload.boardId` must equal the WebSocket “room” path. Otherwise the socket is closed with **4401 Unauthorized**.

So: **one secret (`JWT_SECRET`)**, **one kind of token** (board JWT), used for both HTTP APIs and the sync server gate.

### Logout

`POST /api/logout` clears `board_token`. The board UI triggers this when leaving (see `BoardCanvas`).

---

## Tech stack (dependencies at a glance)


| Area          | Choices                                                                               |
| ------------- | ------------------------------------------------------------------------------------- |
| Framework     | Next.js 14, React 18, TypeScript                                                      |
| Styling       | Tailwind CSS 3, UI primitives (e.g. `@base-ui/react`, shadcn-style `components/ui`)   |
| Canvas        | Konva, react-konva, perfect-freehand (ink)                                            |
| Collaboration | yjs, y-websocket, y-indexeddb                                                         |
| Server data   | better-sqlite3, bcryptjs                                                              |
| Tokens        | jose (JWT)                                                                            |
| IDs           | nanoid (board ids), uuid (upload files)                                               |
| Deploy        | `Dockerfile` (standalone Next), `sync/Dockerfile` (y-websocket), `docker-compose.prod.yml` (two services, named volumes for `BOARD_DATA_DIR` and `UPLOAD_DIR`) |


`next.config.mjs` pins a single Yjs bundle and transpiles Y-related packages to avoid duplicate-Yjs issues with HMR and IndexedDB.

---

## Environment variables


| Variable                 | Where                                                 | Purpose                                                                                                                       |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`             | Next + sync                                           | Sign/verify board JWTs. Same value on both services. Use ≥32 random chars in production.                                      |
| `SYNC_WEBSOCKET_URL`     | Next **server** (runtime)                             | Public WebSocket base for the sync server, e.g. `wss://whiteboard-sync.farhaadsallie.com`. Returned to clients by `ws-token`. |
| `NEXT_PUBLIC_SYNC_URL`   | Next **client only** (optional fallback in `useYDoc`) | Local dev / emergency client fallback — **not** read by `/api/.../ws-token` (Next inlines `NEXT_PUBLIC_*` at build time).     |
| `ENABLE_SAME_ORIGIN_YJS` | Next (server)                                         | Optional. `1` makes ws-token derive `wss://<host>/yjs-ws` from the request (only if you put a reverse proxy in front).         |
| `BOARD_DATA_DIR`         | Next                                                  | SQLite directory. Production: `/data`, backed by the `boards-db` Docker named volume.                                          |
| `UPLOAD_DIR`             | Next                                                  | Image upload root. Production: `/app/uploads`, backed by the `uploads` Docker named volume.                                    |
| `NODE_ENV`               | Next                                                  | `production` enables `secure` cookies.                                                                                         |


Copy `.env.local` on each machine; do not commit secrets (see `.gitignore`).

---

## Run locally

### Full stack (recommended for collaboration)

```bash
docker compose up
```

Open [http://localhost:3000](http://localhost:3000). Compose starts:

- **sync** — Yjs WebSocket on port **1234**
- **web** — Next dev server on port **3000** with `NEXT_PUBLIC_SYNC_URL=ws://localhost:1234`

The compose file uses a **development** `JWT_SECRET` placeholder — replace for anything shared beyond your laptop.

### Next.js only

```bash
npm install
npm run dev
```

You will not get multi-tab / multi-user sync unless the **sync** service is running and `NEXT_PUBLIC_SYNC_URL` points at it.

---

## Demo script (for your team)

1. **Create board** — choose a password; note the board id in the URL after redirect to unlock.
2. **Unlock** — enter password; middleware now allows `/board/{id}`.
3. **Two browsers** — same board id + password (or share one session by copying cookies — normally two people each unlock). Draw on both; watch live merge (Yjs).
4. **Explain persistence** — SQLite only knows id + password hash; the drawing is Yjs + IndexedDB + whatever peers have seen; images are files under `uploads/`.
5. **Security story** — bcrypt for passwords, HTTP-only JWT for session, sync server checks JWT matches room; no shared user database.

---

## Deploy notes (Proxmox VM + Cloudflare Tunnel)

### Topology

Two containers, no reverse proxy in the stack — Cloudflare Tunnel routes each hostname to one container:

| Hostname                              | Container | Port | What it serves                              |
| ------------------------------------- | --------- | ---- | ------------------------------------------- |
| `whiteboard.farhaadsallie.com`        | `web`     | 3000 | Next.js standalone (UI + API + middleware)  |
| `whiteboard-sync.farhaadsallie.com`   | `sync`    | 1234 | y-websocket (Yjs collaboration)             |

The browser hits `whiteboard.farhaadsallie.com`, unlocks the board, calls `/api/board/[boardId]/ws-token`, then opens a WebSocket to `wss://whiteboard-sync.farhaadsallie.com/<boardId>?token=<jwt>`. The sync server verifies the JWT (no cookies needed — it's same `JWT_SECRET`, query-param auth) and joins the client to that room.

### One-time VM setup (Debian CT, e.g. `192.168.68.52`)

```bash
apt update && apt install -y docker.io docker-compose-plugin git
git clone https://github.com/farhaads/whiteboard-application.git
cd whiteboard-application
echo "JWT_SECRET=$(openssl rand -hex 48)" > .env
docker compose -f docker-compose.prod.yml up -d --build
```

Persistent state lives in two Docker named volumes managed by `docker-compose.prod.yml`:

- `boards-db` → SQLite registry (`/data` inside the `web` container, `BOARD_DATA_DIR`)
- `uploads`   → image uploads (`/app/uploads`, `UPLOAD_DIR`)

The `sync` container is stateless — Yjs rooms live in memory. Restart it freely; clients reconnect and resync from peers / IndexedDB.

### Cloudflare tunnel ingress

Add **both** entries to your `cloudflared` config above the catch-all 404:

```yaml
- hostname: whiteboard.farhaadsallie.com
  service: http://192.168.68.52:3000
- hostname: whiteboard-sync.farhaadsallie.com
  service: http://192.168.68.52:1234
```

Then add a Cloudflare DNS record for `whiteboard-sync` pointing at the same tunnel UUID (or rely on `*.farhaadsallie.com` if you have a wildcard). Cloudflare terminates TLS at the edge and forwards plain HTTP to the VM with `X-Forwarded-Proto: https`, so:

- Next sees the request as HTTPS and the `secure` cookie flag on `board_token` works (gated on `NODE_ENV=production`).
- The WebSocket upgrade is `wss://` at the edge, plain `ws://` between Cloudflare and the VM — the JWT in the query param authenticates regardless.

### Override / scale-out

`SYNC_WEBSOCKET_URL` in `docker-compose.prod.yml` points the web container at the public sync host. Override it via `.env` if you move sync to another VM, change the hostname, or run multiple sync replicas behind a load balancer:

```bash
echo "SYNC_WEBSOCKET_URL=wss://sync.example.com" >> .env
docker compose -f docker-compose.prod.yml up -d
```

Both containers must always share the **same** `JWT_SECRET`. Note that `y-websocket` keeps each room in memory in a single process — if you scale the sync container beyond one replica, all clients in a room must hit the same instance (sticky sessions) or you'll need a Redis-backed persistence layer.

Use `wss://` (not `ws://`) for HTTPS sites. The ws-token `syncUrl` comes from `SYNC_WEBSOCKET_URL` (server-side env), not from `NEXT_PUBLIC_*` on the server.

---

## Further reading

- [Next.js docs](https://nextjs.org/docs)
- [Yjs](https://yjs.dev/)
- [y-websocket](https://github.com/yjs/y-websocket)

