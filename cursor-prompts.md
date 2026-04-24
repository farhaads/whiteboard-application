# Cursor Prompts — Whiteboard

Paste these one at a time. After each, verify the "done when" before moving on. Keep `whiteboard-roadmap.md` open in the workspace so Cursor has full context.

If Cursor drifts mid-phase, reject the diff and re-prompt — don't let muddy architecture compound.

---

## Meta-rule to set at the start of every session

> Read `whiteboard-roadmap.md` and scan the existing codebase before writing anything. If anything in my prompt conflicts with what's already built, stop and ask rather than silently refactoring. For Yjs, Konva, react-konva, y-websocket, y-indexeddb, and MinIO APIs: if you're not certain of the current API shape, check the docs rather than guessing — these libraries change and I'd rather you pause than hallucinate.

---

## Prompt 1 — Canvas on screen (local React state, no Yjs yet)

> Initialize a Next.js 14 project with the App Router, TypeScript, Tailwind CSS, and shadcn/ui. Install `konva`, `react-konva`, `perfect-freehand`, `use-image`, and `uuid`.
>
> Create a client component at `app/board/[boardId]/page.tsx` rendering a full-viewport Konva `Stage` with one `Layer`. Implement:
>
> - **Pan:** middle-mouse drag OR hold space + drag
> - **Zoom:** mouse wheel, centered on cursor, clamped between 0.1 and 5
> - **Toolbar** (fixed top-left, shadcn buttons with Lucide icons): select, rectangle, ellipse, text, sticky note, freehand, arrow
> - **Shape model:** a discriminated union `Shape` type (`{ id, type, x, y, ...typeSpecificProps }`). Store shapes in `useState<Shape[]>` for now. Do NOT introduce Yjs yet.
> - **Drawing:** click-drag to create rectangles/ellipses/arrows; click to place text and sticky notes (sticky notes have an auto-contrasting text color based on fill luminance); freehand uses `perfect-freehand` to produce stroke points, render as a Konva `Line` with `tension: 0.5` or a closed `Path`.
> - **Select tool:** click a shape to select, show a Konva `Transformer` for resize/rotate, drag to move.
> - **Undo/redo:** a simple command-stack keyed to Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z. Keep the implementation minimal — we will replace this with Yjs UndoManager in phase 3.
>
> No database, no sync, no auth. Refresh wipes state and that's expected.
>
> **Done when:** I can draw every tool on `localhost:3000/board/test`, pan, zoom, select, resize, and undo/redo work. Two different `boardId`s share the same state (fine for now).

---

## Prompt 2 — Yjs as source of truth (still local, IndexedDB persistence)

> Install `yjs` and `y-indexeddb`.
>
> Replace React state for shapes with a Yjs data model. The structure is:
> - `ydoc.getMap('shapes')` — `Y.Map<shapeId, Y.Map<field, value>>`
> - `ydoc.getArray('order')` — `Y.Array<shapeId>` for z-order
> - `ydoc.getMap('meta')` — board title, background color, etc.
>
> Create a `useYDoc(boardId)` hook that:
> - Instantiates one `Y.Doc` per `boardId`
> - Wires `IndexeddbPersistence(boardId, doc)` for offline persistence
> - Returns the doc plus helpers for observed reads
>
> Build a `useShapes()` hook that observes the shapes map + order array and returns a sorted array of plain shape objects, re-rendering on Y.Doc changes. All mutations (create, update, delete, reorder) must go through Yjs transactions using `ydoc.transact(() => { ... })` — never mutate shape state outside a transaction.
>
> Replace the command-stack undo/redo with `new Y.UndoManager([shapesMap, orderArray])` so undo/redo operates on the Yjs log. Keybindings stay the same.
>
> Add "Bring to front" and "Send to back" actions (toolbar buttons or context menu) that reorder the `order` array.
>
> **Done when:** draw shapes, refresh the page, they're still there (loaded from IndexedDB). Undo/redo goes through UndoManager. All mutations flow through Yjs.

---

## Prompt 3 — Multiplayer sync via self-hosted y-websocket

> Goal: two browser tabs on the same board sync live, with cursors.
>
> 1. **Sync server service.** Create a `sync/` directory at the repo root with its own `package.json`, Dockerfile, and an `index.js` that runs a y-websocket server. Use the `y-websocket` utility server example as the base (check current docs — the setup is typically `require('y-websocket/bin/utils').setupWSConnection` wired into a Node `ws` server). No persistence yet.
> 2. **docker-compose.yml** at repo root with services `web` (Next.js dev) and `sync`. Expose sync on a dedicated port.
> 3. **Client provider.** Install `y-websocket`. In `useYDoc`, add a `WebsocketProvider` pointing at `ws://localhost:<syncport>` with room name = `boardId`. Keep IndexedDB persistence alongside it (both providers on the same doc is supported and gives offline support).
> 4. **Awareness (presence).** Use `provider.awareness` to broadcast:
>    - `cursor: { x, y }` in canvas coordinates, throttled to ~50ms
>    - `selection: string[]` — IDs of shapes the local user has selected
>    - `user: { color, clientId }` — color derived deterministically from the Yjs `clientID`
> 5. **Render remote presence.** On the Stage, render a cursor icon + small colored label per remote awareness state. Render a colored outline on shapes that remote users have selected.
>
> Do NOT add auth or server-side persistence in this phase. Both are coming.
>
> **Done when:** open two tabs on `/board/test`, see each other's cursors move in real time, see shape edits sync, see colored selection outlines when the other tab selects a shape.

---

## Prompt 4 — Postgres persistence for the Yjs doc

> Add Postgres and wire the sync server to persist doc state.
>
> 1. **docker-compose:** add a `db` service (Postgres 16) with a named volume.
> 2. **Schema.** In the Next.js app, pick one ORM (Drizzle preferred; Prisma acceptable — do not mix) and define a `boards` table:
>    - `id text primary key`
>    - `password_hash text not null default ''` (populated in phase 6)
>    - `title text`
>    - `y_state bytea`
>    - `created_at timestamptz default now()`
>    - `updated_at timestamptz default now()`
>    Run the migration on container start.
> 3. **Sync server persistence.** In `sync/index.js`, for each active room:
>    - On first client connecting to a room with no in-memory doc, `SELECT y_state FROM boards WHERE id = $1`; if present, `Y.applyUpdate(doc, row.y_state)`.
>    - On any doc update, debounce 2 seconds, then `Y.encodeStateAsUpdate(doc)` and upsert into `boards(id, y_state, updated_at)`. Upsert creates the row if missing (with empty password_hash for now).
>    - On last-client-disconnect for a room, flush immediately and drop the doc from memory.
>    Use the `pg` library directly in the sync server — no ORM needed server-side.
> 4. **Env vars:** `DATABASE_URL` shared between web and sync.
>
> **Done when:** two tabs edit a board, both close, wait 30 seconds, reopen — all content is there. `SELECT id, length(y_state), updated_at FROM boards` shows the row growing as expected.

---

## Prompt 5 — Image uploads via MinIO

> Add image paste / drop / upload, stored in MinIO, referenced from the Y.Doc.
>
> 1. **docker-compose:** add a `minio` service with a named volume, root user/password from env, and a one-shot `minio-init` service (using `minio/mc`) that creates a `boards` bucket and sets it to public-read on startup.
> 2. **Server SDK:** install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` in the Next.js app.
> 3. **Upload-URL route:** `POST /api/board/[boardId]/upload-url` accepts `{ filename, contentType, size }`. Validate: `contentType` starts with `image/`, `size <= 10 * 1024 * 1024`. Generate `imageKey = <boardId>/<uuid>.<ext>`. Return a presigned PUT URL (5 min TTL) and the public GET URL (`http://localhost:9000/boards/<imageKey>` in dev — pull the base from an env var).
> 4. **Client upload flow:**
>    - Paste handler on the Stage and a drop handler on the window intercept image files
>    - POST filename/type/size to the upload-URL route
>    - PUT the file bytes to the presigned URL
>    - Insert a shape into the Y.Doc: `{ id, type: 'image', imageKey, url, x, y, w, h }` at cursor position, preserving aspect ratio, max initial width 400px
> 5. **Rendering:** image shapes render as Konva `Image` nodes via `use-image`. Show a small loading placeholder until the image resolves.
>
> Do NOT add auth to the upload route yet — phase 6 covers that.
>
> **Done when:** paste an image into the canvas, it uploads, appears on both tabs within a second, survives a full-stack restart, and loads via a stable URL.

---

## Prompt 6 — Password gate (page + WS + upload endpoint)

> Add bcrypt. Install `bcryptjs` and `jose` (for JWTs).
>
> 1. **Landing page `/`:** shadcn form with two tabs — "Create board" (password input; POST `/api/board`, returns `{ boardId }`, redirect to `/board/[boardId]/unlock`) and "Open board" (board ID + password; POST `/api/board/[boardId]/unlock`).
> 2. **API routes:**
>    - `POST /api/board`: generate a short random ID (e.g. nanoid, 10 chars), bcrypt-hash the password, insert row, return `{ boardId }`.
>    - `POST /api/board/[boardId]/unlock`: look up row, `bcrypt.compare`, on success set an HTTP-only cookie `board_token` with a JWT `{ boardId, exp }` signed with `JWT_SECRET`, TTL 12h. Redirect logic handled client-side.
> 3. **Next.js middleware** on `/board/:boardId`: verify cookie, check JWT `boardId` matches route param. On failure, redirect to `/board/[boardId]/unlock` (a shadcn password form that POSTs to the unlock route).
> 4. **Gate the WebSocket.** In `sync/index.js`, on the `upgrade` event: parse the URL's query param `token=...`, verify the JWT with `JWT_SECRET`, check the `boardId` claim matches the room name from the URL path. Reject with close code 4401 on failure. Client-side, pass the token to `WebsocketProvider` via its `params` option (it appends to the query string).
> 5. **Gate the upload route.** `POST /api/board/[boardId]/upload-url` must verify the cookie AND that its `boardId` matches the route. Reject with 401 otherwise.
>
> **Done when:** wrong password blocks the page, the WS connection, AND the upload route. Right password unlocks all three. Token expiry forces re-auth.

---

## Prompt 7 — Deploy to a single VPS

> Finalize the stack for production on one VPS behind HTTPS.
>
> 1. **Services in `docker-compose.yml`:** `web` (Next.js, production build, standalone output), `sync`, `db`, `minio`, `caddy`. All on an internal network; only `caddy` exposes ports 80/443 to the host.
> 2. **Next.js Dockerfile:** multi-stage, output standalone, non-root user, healthcheck on `/api/health`.
> 3. **Caddyfile:**
>    - `https://<DOMAIN>` → `web:3000`
>    - `https://<DOMAIN>/sync/*` → `sync:<port>` with WebSocket upgrade headers passed through
>    - `https://<DOMAIN>/assets/*` → `minio:9000` (rewrite path to `/boards/...`)
>    Automatic Let's Encrypt via Caddy's default ACME.
> 4. **Env:** `.env.production.example` listing every required variable (`DATABASE_URL`, `JWT_SECRET`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_ENDPOINT`, `PUBLIC_ASSETS_URL`, `NEXT_PUBLIC_SYNC_URL`, `DOMAIN`).
> 5. **Client URL config:** client-side `WebsocketProvider` and image URLs must use `NEXT_PUBLIC_SYNC_URL` and `PUBLIC_ASSETS_URL` respectively — no hardcoded localhost anywhere.
> 6. **Backups:** a `backup` service running a cron that `pg_dump`s nightly to `/backups` (host-mounted). Document a separate `mc mirror` command for MinIO backup in the README.
>
> **Done when:** on a fresh VPS with Docker installed and DNS pointed, `docker compose up -d` brings the whole stack up behind HTTPS. Create a board, share the link + password with another device, and it all works.
