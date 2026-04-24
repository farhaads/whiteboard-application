# Whiteboard application

Real-time collaborative whiteboard: **Next.js** hosts the UI and APIs, **Yjs** syncs document state over WebSockets, and each board is protected by its **own password** (not per-user accounts).

Use this README as a quick tour for demos and onboarding.

---

## What you are looking at (30 seconds)

| Piece | Role |
|--------|------|
| **Next.js 14** (App Router) | Pages, API routes, middleware, image serving |
| **Konva + react-konva** | 2D canvas drawing (shapes, strokes, images) |
| **Yjs** | CRDT: merges edits from multiple clients safely |
| **y-websocket** | Small Node server that forwards Yjs updates between browsers |
| **Docker Compose** | Runs `web` (Next) + `sync` (WebSocket) together locally |

There is **no** “sign up / log in” product flow. Access is **board ID + board password**. Anyone with both can open that board.

---

## Storage and “databases” (important for demos)

This app uses **three** kinds of persistence; only one is a classic server database.

### 1. SQLite — board registry (`boards.db`)

- **Library:** `better-sqlite3`
- **Default path:** `data/boards.db` (or `BOARD_DATA_DIR` on Fly: `/data` on a mounted volume)
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
3. `WebsocketProvider` connects to the **`syncUrl`** from that response (same-origin `/yjs-ws/` on Fly, or `SYNC_WEBSOCKET_URL` / dev default), with `?token=...` and room = `boardId`. The client may fall back to `NEXT_PUBLIC_SYNC_URL` only if `syncUrl` is absent.
4. **`sync/index.js`** verifies JWT with `jose`; `payload.boardId` must equal the WebSocket “room” path. Otherwise the socket is closed with **4401 Unauthorized**.

So: **one secret (`JWT_SECRET`)**, **one kind of token** (board JWT), used for both HTTP APIs and the sync server gate.

### Logout

`POST /api/logout` clears `board_token`. The board UI triggers this when leaving (see `BoardCanvas`).

---

## Tech stack (dependencies at a glance)

| Area | Choices |
|------|---------|
| Framework | Next.js 14, React 18, TypeScript |
| Styling | Tailwind CSS 3, UI primitives (e.g. `@base-ui/react`, shadcn-style `components/ui`) |
| Canvas | Konva, react-konva, perfect-freehand (ink) |
| Collaboration | yjs, y-websocket, y-indexeddb |
| Server data | better-sqlite3, bcryptjs |
| Tokens | jose (JWT) |
| IDs | nanoid (board ids), uuid (upload files) |
| Deploy | `Dockerfile` (standalone Next), `fly.toml` (volume for SQLite under `BOARD_DATA_DIR`) |

`next.config.mjs` pins a single Yjs bundle and transpiles Y-related packages to avoid duplicate-Yjs issues with HMR and IndexedDB.

---

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `JWT_SECRET` | Next + sync | Sign/verify board JWTs (use a long random value in production) |
| `NEXT_PUBLIC_SYNC_URL` | Next **client only** (optional fallback in `useYDoc`) | Local dev / emergency client fallback — **not** read by `/api/.../ws-token` (Next would bake `NEXT_PUBLIC_*` at build time) |
| `SYNC_WEBSOCKET_URL` | Next **server** (runtime) | Optional explicit `wss://…`; if unset and `ENABLE_SAME_ORIGIN_YJS=1`, ws-token derives `wss://<host>/yjs-ws` from the request |
| `ENABLE_SAME_ORIGIN_YJS` | Next (server) | `1` = bundled nginx + sync on same host (`fly.toml` + Docker image) |
| `BOARD_DATA_DIR` | Next | SQLite directory (Fly sets `/data` on a volume) |
| `UPLOAD_DIR` | Next | Image upload root |
| `NODE_ENV` | Next | `production` enables `secure` cookies |

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

## Deploy notes (Fly.io)

### Next.js app (`fly.toml` at repo root)

- App process on port **8080** (standalone `server.js`)
- A **volume** mounted at `/data` for SQLite (`BOARD_DATA_DIR`)

### Real-time collaboration (why teammates saw different boards)

Collaboration is **not** stored in SQLite. Every browser must connect to the **same** Yjs WebSocket server. If the socket never connects, each person keeps editing their **local IndexedDB** copy only — same board URL, different canvas.

**Default on Fly (this repo):** the production Docker image runs **nginx** on port 8080, **Next.js** on 3001, and the **`sync/`** y-websocket server on 1234. WebSockets for collaboration use **`wss://<your-host>/yjs-ws/`** (same host as the site). `fly.toml` sets `ENABLE_SAME_ORIGIN_YJS=1`; the `/api/board/.../ws-token` response includes that URL. Deploy with `fly deploy` and ensure **`JWT_SECRET`** is set (shared by Next and sync in one machine).

If you previously set **`SYNC_WEBSOCKET_URL`** to a separate sync app, that value **overrides** same-origin — remove the secret (`fly secrets unset SYNC_WEBSOCKET_URL`) if you want the bundled nginx + sync path.

**Optional: second Fly app for sync** (see `sync/fly.toml`) — use when you want sync scaled or isolated. Then set `SYNC_WEBSOCKET_URL` on the web app to `wss://<sync-app>.fly.dev`, same `JWT_SECRET` on both apps, and **`min_machines_running = 1`** on sync unless you add shared persistence.

Use **`wss://`** (not `ws://`) for HTTPS sites. The ws-token **`syncUrl`** comes from **`SYNC_WEBSOCKET_URL`** or same-origin derivation — not from `NEXT_PUBLIC_*` on the server.

---

## Further reading

- [Next.js docs](https://nextjs.org/docs)
- [Yjs](https://yjs.dev/)
- [y-websocket](https://github.com/yjs/y-websocket)
